/**
 * Sincroniza pdv_orders a partir de pedidos_completo.csv (export).
 *
 * Uso:
 *   DATABASE_URL=... node scripts/sync-from-export-orders.mjs "C:\...\pedidos_completo.csv"
 *   DATABASE_URL=... node scripts/sync-from-export-orders.mjs "...\pedidos_completo.csv" --apply
 *   ... --touch-dates  → também atualiza createdAt a partir de data_utc (ISO)
 *   ... --keep-seller  → não altera sellerId/sellerName (só totais, cliente, flags)
 *
 * Atualiza por pedidoId (único). Dry-run sem --apply.
 */
import fs from "fs/promises";
import path from "path";
import mysql from "mysql2/promise";
import { parseCsv } from "./lib/csv-parse.mjs";

function num(s) {
  const t = (s ?? "").toString().trim().replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function bool01(s) {
  const t = (s ?? "").toString().trim();
  return t === "1" || t.toLowerCase() === "true" || t === "SIM";
}

function decSame(a, b) {
  const na = a == null || a === "" ? null : Number(a);
  const nb = b == null || b === "" ? null : Number(b);
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  return Math.abs(na - nb) < 0.009;
}

function normCanal(raw) {
  const u = (raw ?? "").toString().toUpperCase().trim();
  if (u === "WHATSAPP" || u.includes("WHATS")) return "WHATSAPP";
  if (u === "BALCAO" || u === "BALCÃO" || u.includes("BALC")) return "BALCAO";
  return null;
}

function normRegime(raw) {
  const u = (raw ?? "").toString().toUpperCase().trim();
  if (u === "ATACADO" || u === "VAREJO") return u;
  return null;
}

function normStatus(raw) {
  const u = (raw ?? "").toString().toUpperCase().trim();
  if (["PAGO", "PENDENTE", "CANCELADO"].includes(u)) return u;
  return null;
}

function utcToMysql(dtIso) {
  const t = (dtIso ?? "").toString().trim();
  if (!t) return null;
  const s = t.replace("T", " ").replace(/\.\d{3}Z?$/, "").slice(0, 19);
  return s || null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const touchDates = process.argv.includes("--touch-dates");
  const keepSeller = process.argv.includes("--keep-seller");
  const csvArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!csvArg) {
    console.error(
      'Uso: node scripts/sync-from-export-orders.mjs "caminho/pedidos_completo.csv" [--apply] [--touch-dates] [--keep-seller]',
    );
    process.exit(1);
  }

  const csvPath = path.resolve(csvArg);
  const raw = await fs.readFile(csvPath, "utf8");
  const table = parseCsv(raw);
  if (table.length < 2) {
    console.error("CSV vazio ou sem dados");
    process.exit(1);
  }

  const header = table[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const need = [
    "pedidoId",
    "vendedor",
    "vendedor_username",
    "canal",
    "regime",
    "cliente",
    "telefone",
    "status",
    "pedido_sofia",
    "totalVarejo",
    "totalAtacado",
    "totalAplicado",
    "totalPago",
    "totalPendente",
  ];
  for (const k of need) {
    if (!(k in idx)) {
      console.error(`Coluna obrigatória ausente no CSV: ${k}`);
      process.exit(1);
    }
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL");
    process.exit(1);
  }

  const conn = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
  const [sellerRows] = await conn.execute("SELECT id, username, name FROM pdv_sellers");
  const byUsername = new Map();
  const byName = new Map();
  for (const s of sellerRows) {
    byUsername.set(String(s.username).toLowerCase(), s);
    byName.set(String(s.name).trim().toUpperCase(), s);
  }

  let noChange = 0;
  let wouldUpdate = 0;
  let notFound = 0;
  let sellerFallback = 0;
  let badEnum = 0;

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (row.every((c) => !c || !c.trim())) continue;

    const pedidoId = (row[idx["pedidoId"]] ?? "").trim();
    if (!pedidoId) continue;

    const canal = normCanal(row[idx["canal"]]);
    const regime = normRegime(row[idx["regime"]]);
    const status = normStatus(row[idx["status"]]);
    if (!canal || !regime || !status) {
      badEnum++;
      continue;
    }

    const [[dbRow]] = await conn.execute(
      `SELECT sellerId, sellerName, canal, regime, clienteNome, clienteTelefone, totalVarejo, totalAtacado, totalAplicado, totalPago, totalPendente, justificativa, isSofia, status, createdAt
       FROM pdv_orders WHERE pedidoId = ?`,
      [pedidoId],
    );

    if (!dbRow) {
      notFound++;
      continue;
    }

    const uname = (row[idx["vendedor_username"]] ?? "").trim().toLowerCase();
    const vname = (row[idx["vendedor"]] ?? "").trim();
    const sellerMatch = byUsername.get(uname) || byName.get(vname.toUpperCase());
    const sellerIdResolved = sellerMatch ? Number(sellerMatch.id) : null;

    let sellerId;
    let sellerName;
    if (keepSeller) {
      sellerId = Number(dbRow.sellerId);
      sellerName = dbRow.sellerName;
    } else if (sellerIdResolved != null) {
      sellerId = sellerIdResolved;
      sellerName = vname || sellerMatch.name;
    } else {
      sellerFallback++;
      sellerId = Number(dbRow.sellerId);
      sellerName = dbRow.sellerName;
    }

    const isSofia = bool01(row[idx["pedido_sofia"]]);
    const clienteNome = (row[idx["cliente"]] ?? "").trim() || null;
    const clienteTelefone = (row[idx["telefone"]] ?? "").trim() || null;
    const justificativa = idx["justificativa"] !== undefined ? (row[idx["justificativa"]] ?? "").trim() || null : null;

    const totalVarejo = num(row[idx["totalVarejo"]]);
    const totalAtacado = num(row[idx["totalAtacado"]]);
    const totalAplicado = num(row[idx["totalAplicado"]]);
    const totalPago = num(row[idx["totalPago"]]);
    const totalPendente = num(row[idx["totalPendente"]]);

    const dataUtcIdx = idx["data_utc"];
    const createdSql = dataUtcIdx !== undefined ? utcToMysql(row[dataUtcIdx]) : null;

    const same =
      Number(dbRow.sellerId) === sellerId &&
      String(dbRow.sellerName ?? "") === String(sellerName ?? "") &&
      dbRow.canal === canal &&
      dbRow.regime === regime &&
      String(dbRow.clienteNome ?? "") === String(clienteNome ?? "") &&
      String(dbRow.clienteTelefone ?? "") === String(clienteTelefone ?? "") &&
      decSame(dbRow.totalVarejo, totalVarejo) &&
      decSame(dbRow.totalAtacado, totalAtacado) &&
      decSame(dbRow.totalAplicado, totalAplicado) &&
      decSame(dbRow.totalPago, totalPago) &&
      decSame(dbRow.totalPendente, totalPendente) &&
      String(dbRow.justificativa ?? "") === String(justificativa ?? "") &&
      Boolean(dbRow.isSofia) === isSofia &&
      dbRow.status === status;

    let sameDates = true;
    if (touchDates && createdSql) {
      const dbStr = dbRow.createdAt instanceof Date ? dbRow.createdAt.toISOString().slice(0, 19).replace("T", " ") : String(dbRow.createdAt).slice(0, 19);
      const want = createdSql.slice(0, 19);
      sameDates = dbStr.slice(0, 19) === want;
    }

    if (same && (!touchDates || sameDates)) {
      noChange++;
      continue;
    }

    wouldUpdate++;

    if (!apply) continue;

    if (touchDates && createdSql) {
      await conn.execute(
        `UPDATE pdv_orders SET
          sellerId = ?, sellerName = ?, canal = ?, regime = ?, clienteNome = ?, clienteTelefone = ?,
          totalVarejo = ?, totalAtacado = ?, totalAplicado = ?, totalPago = ?, totalPendente = ?,
          justificativa = ?, isSofia = ?, status = ?, createdAt = ?
         WHERE pedidoId = ?`,
        [
          sellerId,
          sellerName,
          canal,
          regime,
          clienteNome,
          clienteTelefone,
          totalVarejo,
          totalAtacado,
          totalAplicado,
          totalPago,
          totalPendente,
          justificativa,
          isSofia ? 1 : 0,
          status,
          createdSql,
          pedidoId,
        ],
      );
    } else {
      await conn.execute(
        `UPDATE pdv_orders SET
          sellerId = ?, sellerName = ?, canal = ?, regime = ?, clienteNome = ?, clienteTelefone = ?,
          totalVarejo = ?, totalAtacado = ?, totalAplicado = ?, totalPago = ?, totalPendente = ?,
          justificativa = ?, isSofia = ?, status = ?
         WHERE pedidoId = ?`,
        [
          sellerId,
          sellerName,
          canal,
          regime,
          clienteNome,
          clienteTelefone,
          totalVarejo,
          totalAtacado,
          totalAplicado,
          totalPago,
          totalPendente,
          justificativa,
          isSofia ? 1 : 0,
          status,
          pedidoId,
        ],
      );
    }
  }

  await conn.end();

  console.log("── sync-from-export-orders ──");
  console.log(`  CSV: ${csvPath}`);
  console.log(`  Linhas de dados: ${table.length - 1}`);
  console.log(`  keep-seller: ${keepSeller} | touch-dates: ${touchDates}`);
  console.log(`  Sem alteração: ${noChange}`);
  console.log(`  Seriam atualizados / atualizados: ${wouldUpdate}`);
  console.log(`  pedidoId não encontrado no banco: ${notFound}`);
  console.log(`  Linhas puladas (canal/regime/status inválido): ${badEnum}`);
  console.log(`  Vendedor resolvido pelo banco (sem user no CSV): ${sellerFallback}`);
  if (!apply) console.log("\n  (dry-run — use --apply para gravar)");
  else console.log("\n  ✓ UPDATEs aplicados.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
