/**
 * Sincroniza pdv_order_items a partir de itens_completo.csv (export).
 * Útil quando o banco perdeu snapshots (productId nulo, pt zerado) e o CSV reflete o estado correto.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/sync-from-export-items.mjs "C:\...\itens_completo.csv"
 *   DATABASE_URL=... node scripts/sync-from-export-items.mjs "...\itens_completo.csv" --apply
 *   ... --full   → também atualiza linha, modelo, time, descricao, tipo, tamanho, qtd, preços, totalItem
 *
 * Segurança: só atualiza se EXISTS row com mesmo id E pedidoId. Dry-run se não passar --apply.
 */
import fs from "fs/promises";
import path from "path";
import mysql from "mysql2/promise";
import { parseCsv } from "./lib/csv-parse.mjs";

function numOrNull(s) {
  const t = (s ?? "").toString().trim();
  if (t === "" || t === "null") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function intOrNull(s) {
  const t = (s ?? "").toString().trim();
  if (t === "" || t === "null") return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function bool01(s) {
  const t = (s ?? "").toString().trim();
  return t === "1" || t.toLowerCase() === "true" || t === "SIM";
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--apply" && a !== "--full");
  const apply = process.argv.includes("--apply");
  const full = process.argv.includes("--full");
  const csvArg = args[0];
  if (!csvArg) {
    console.error('Uso: node scripts/sync-from-export-items.mjs "caminho/itens_completo.csv" [--apply] [--full]');
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

  const need = ["item_id", "pedidoId", "productId", "pontos_atacado_snapshot", "pontos_varejo_snapshot", "comissaoUnitaria", "item_sofia"];
  for (const k of need) {
    if (!(k in idx)) {
      console.error(`Coluna obrigatória ausente no CSV: ${k}`);
      process.exit(1);
    }
  }
  if (full) {
    for (const k of ["linha", "modelo", "time", "descricao", "tamanho", "tipo", "quantidade", "precoUnitario", "totalItem"]) {
      if (!(k in idx)) {
        console.error(`--full exige coluna: ${k}`);
        process.exit(1);
      }
    }
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL");
    process.exit(1);
  }

  const conn = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: false } });

  let wouldUpdate = 0;
  let noChange = 0;
  let notFound = 0;
  let mismatch = 0;
  let errors = 0;

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (row.every((c) => !c || !c.trim())) continue;

    const id = intOrNull(row[idx["item_id"]]);
    const pedidoId = (row[idx["pedidoId"]] ?? "").trim();
    if (id == null || !pedidoId) {
      errors++;
      continue;
    }

    const productId = intOrNull(row[idx["productId"]]);
    const ptAt = numOrNull(row[idx["pontos_atacado_snapshot"]]) ?? 0;
    const ptVa = numOrNull(row[idx["pontos_varejo_snapshot"]]) ?? 0;
    const comU = numOrNull(row[idx["comissaoUnitaria"]]) ?? 0;
    const comLS =
      idx["comissaoLojaSofia"] !== undefined ? numOrNull(row[idx["comissaoLojaSofia"]]) : null;
    const isSofia = bool01(row[idx["item_sofia"]]);

    const [[dbRow]] = await conn.execute(
      "SELECT productId, ptAtacado, ptVarejo, comissaoUnitaria, comissaoLojaSofia, isSofia, linha, modelo, time, descricao, tipo, tamanho, quantidade, precoUnitario, totalItem FROM pdv_order_items WHERE id = ? AND pedidoId = ?",
      [id, pedidoId],
    );

    if (!dbRow) {
      const [[any]] = await conn.execute("SELECT pedidoId FROM pdv_order_items WHERE id = ?", [id]);
      if (any) mismatch++;
      else notFound++;
      continue;
    }

    const curProd = dbRow.productId != null ? Number(dbRow.productId) : null;
    const decSame = (a, b) => {
      const na = a == null || a === "" ? null : Number(a);
      const nb = b == null || b === "" ? null : Number(b);
      if (na == null && nb == null) return true;
      if (na == null || nb == null) return false;
      return Math.abs(na - nb) < 0.009;
    };
    const same =
      (curProd === productId || (curProd == null && productId == null)) &&
      decSame(dbRow.ptAtacado, ptAt) &&
      decSame(dbRow.ptVarejo, ptVa) &&
      decSame(dbRow.comissaoUnitaria, comU) &&
      decSame(dbRow.comissaoLojaSofia, comLS) &&
      Boolean(dbRow.isSofia) === isSofia;

    let sameFull = same;
    if (full && same) {
      sameFull =
        String(dbRow.linha ?? "") === String(row[idx["linha"]] ?? "") &&
        String(dbRow.modelo ?? "") === String(row[idx["modelo"]] ?? "") &&
        String(dbRow.time ?? "") === String(row[idx["time"]] ?? "") &&
        String(dbRow.descricao ?? "") === String(row[idx["descricao"]] ?? "") &&
        String(dbRow.tipo ?? "") === String(row[idx["tipo"]] ?? "") &&
        String(dbRow.tamanho ?? "") === String(row[idx["tamanho"]] ?? "") &&
        Number(dbRow.quantidade) === Number(intOrNull(row[idx["quantidade"]])) &&
        Number(dbRow.precoUnitario) === Number(numOrNull(row[idx["precoUnitario"]])) &&
        Number(dbRow.totalItem) === Number(numOrNull(row[idx["totalItem"]]));
    }

    if (sameFull) {
      noChange++;
      continue;
    }

    wouldUpdate++;

    if (!apply) continue;

    if (full) {
      await conn.execute(
        `UPDATE pdv_order_items SET
          productId = ?, ptAtacado = ?, ptVarejo = ?, comissaoUnitaria = ?, comissaoLojaSofia = ?, isSofia = ?,
          linha = ?, modelo = ?, time = ?, descricao = ?, tipo = ?, tamanho = ?, quantidade = ?, precoUnitario = ?, totalItem = ?
         WHERE id = ? AND pedidoId = ?`,
        [
          productId,
          ptAt,
          ptVa,
          comU,
          comLS,
          isSofia ? 1 : 0,
          row[idx["linha"]] || null,
          row[idx["modelo"]] || null,
          row[idx["time"]] || null,
          row[idx["descricao"]] || null,
          row[idx["tipo"]] || null,
          row[idx["tamanho"]] || null,
          intOrNull(row[idx["quantidade"]]),
          numOrNull(row[idx["precoUnitario"]]),
          numOrNull(row[idx["totalItem"]]),
          id,
          pedidoId,
        ],
      );
    } else {
      await conn.execute(
        `UPDATE pdv_order_items SET
          productId = ?, ptAtacado = ?, ptVarejo = ?, comissaoUnitaria = ?, comissaoLojaSofia = ?, isSofia = ?
         WHERE id = ? AND pedidoId = ?`,
        [productId, ptAt, ptVa, comU, comLS, isSofia ? 1 : 0, id, pedidoId],
      );
    }
  }

  await conn.end();

  console.log("── sync-from-export-items ──");
  console.log(`  CSV: ${csvPath}`);
  console.log(`  Linhas de dados: ${table.length - 1}`);
  console.log(`  Modo: ${full ? "completo (inclui texto/qtd/preço)" : "mínimo (productId, pts, comissão, isSofia)"}`);
  console.log(`  Sem alteração necessária: ${noChange}`);
  console.log(`  Seriam atualizados / atualizados: ${wouldUpdate}`);
  console.log(`  id não encontrado: ${notFound}`);
  console.log(`  id existe mas pedidoId diferente: ${mismatch}`);
  console.log(`  Linhas com erro (id/pedido vazio): ${errors}`);
  if (!apply) {
    console.log("\n  (dry-run — nada gravado. Acrescente --apply para executar UPDATEs)");
  } else {
    console.log("\n  ✓ UPDATEs aplicados no banco.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
