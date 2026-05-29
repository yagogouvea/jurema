/**
 * Sincroniza pdv_order_payments a partir de pdv_order_payments.csv (export).
 * Atualiza valor, taxa, valorLiquido, formaPagamento, nomePix por id + pedidoId.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/sync-from-export-payments.mjs "C:\...\pdv_order_payments.csv"
 *   DATABASE_URL=... node scripts/sync-from-export-payments.mjs "...\pdv_order_payments.csv" --apply
 */
import fs from "fs/promises";
import path from "path";
import mysql from "mysql2/promise";
import { parseCsv } from "./lib/csv-parse.mjs";

const FORMAS = new Set(["PIX", "DINHEIRO", "DEBITO", "CREDITO", "DESCONTO_FOLHA"]);

function num(s) {
  const t = (s ?? "").toString().trim().replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function decSame(a, b) {
  const na = a == null || a === "" ? null : Number(a);
  const nb = b == null || b === "" ? null : Number(b);
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  return Math.abs(na - nb) < 0.009;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const csvArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!csvArg) {
    console.error('Uso: node scripts/sync-from-export-payments.mjs "caminho/pdv_order_payments.csv" [--apply]');
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
  const need = ["id", "pedidoId", "formaPagamento", "valor", "valorLiquido"];
  for (const k of need) {
    if (!(k in idx)) {
      console.error(`Coluna obrigatória ausente: ${k}`);
      process.exit(1);
    }
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL");
    process.exit(1);
  }

  const conn = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
  let noChange = 0;
  let wouldUpdate = 0;
  let notFound = 0;
  let mismatch = 0;
  let badForma = 0;

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (row.every((c) => !c || !c.trim())) continue;

    const id = parseInt(row[idx["id"]], 10);
    const pedidoId = (row[idx["pedidoId"]] ?? "").trim();
    if (!Number.isFinite(id) || !pedidoId) continue;

    let forma = (row[idx["formaPagamento"]] ?? "").toString().toUpperCase().trim();
    if (!FORMAS.has(forma)) {
      badForma++;
      continue;
    }

    const valor = num(row[idx["valor"]]);
    const valorLiquido = num(row[idx["valorLiquido"]]);
    const taxaCol = idx["taxa"] !== undefined ? num(row[idx["taxa"]]) : 0;
    const nomePix =
      idx["nomePix"] !== undefined ? (row[idx["nomePix"]] ?? "").trim() || null : null;

    const [[dbRow]] = await conn.execute(
      "SELECT formaPagamento, valor, taxa, valorLiquido, nomePix FROM pdv_order_payments WHERE id = ? AND pedidoId = ?",
      [id, pedidoId],
    );

    if (!dbRow) {
      const [[alt]] = await conn.execute("SELECT pedidoId FROM pdv_order_payments WHERE id = ?", [id]);
      if (alt) mismatch++;
      else notFound++;
      continue;
    }

    const same =
      dbRow.formaPagamento === forma &&
      decSame(dbRow.valor, valor) &&
      decSame(dbRow.taxa, taxaCol) &&
      decSame(dbRow.valorLiquido, valorLiquido) &&
      String(dbRow.nomePix ?? "") === String(nomePix ?? "");

    if (same) {
      noChange++;
      continue;
    }

    wouldUpdate++;
    if (!apply) continue;

    await conn.execute(
      `UPDATE pdv_order_payments SET formaPagamento = ?, valor = ?, taxa = ?, valorLiquido = ?, nomePix = ? WHERE id = ? AND pedidoId = ?`,
      [forma, valor, taxaCol, valorLiquido, nomePix, id, pedidoId],
    );
  }

  await conn.end();

  console.log("── sync-from-export-payments ──");
  console.log(`  CSV: ${csvPath}`);
  console.log(`  Sem alteração: ${noChange} | Atualizar: ${wouldUpdate}`);
  console.log(`  Não encontrado: ${notFound} | id/pedidoId divergente: ${mismatch} | forma inválida: ${badForma}`);
  if (!apply) console.log("\n  (dry-run — use --apply)");
  else console.log("\n  ✓ UPDATEs aplicados.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
