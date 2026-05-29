/**
 * Relatório de sanidade para o pacote de export (CSV + stats.json + opcional SQL).
 * Uso:
 *   node scripts/export-sanity-report.mjs "C:\caminho\para\pasta_do_zip_extraido"
 *   EXPORT_DIR="C:\..." node scripts/export-sanity-report.mjs
 *   node scripts/export-sanity-report.mjs "C:\..." --out relatorio.txt
 *
 * Não grava dados do export no repositório; só lê arquivos locais indicados por você.
 */
import fs from "fs/promises";
import path from "path";

function parseArgs(argv) {
  const args = argv.slice(2);
  const outIdx = args.indexOf("--out");
  let outFile = null;
  if (outIdx !== -1 && args[outIdx + 1]) {
    outFile = args[outIdx + 1];
    args.splice(outIdx, 2);
  }
  const dir = args[0] || process.env.EXPORT_DIR || "";
  return { dir: dir.replace(/^["']|["']$/g, ""), outFile };
}

async function countDataRows(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { dataRows: 0, header: "", totalLines: 0 };
    return {
      dataRows: Math.max(0, lines.length - 1),
      header: lines[0],
      totalLines: lines.length,
    };
  } catch {
    return null;
  }
}

async function statFile(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.size;
  } catch {
    return null;
  }
}

function pickCsvColumn(headerLine, name) {
  const cols = headerLine.split(",").map((c) => c.trim().toLowerCase());
  const i = cols.indexOf(name.toLowerCase());
  return i;
}

/** Conta pedidoId únicos em CSV simples (sem tratar vírgulas dentro de aspas — suficiente para sanidade). */
async function countDistinctPedidoIds(filePath, columnName = "pedidoId") {
  const row = await countDataRows(filePath);
  if (!row?.header) return null;
  const idx = pickCsvColumn(row.header, columnName);
  if (idx === -1) return { error: `coluna ${columnName} não encontrada` };
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const set = new Set();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const pid = (parts[idx] || "").trim();
    if (pid) set.add(pid);
  }
  return { unique: set.size, column: columnName };
}

async function readStatsJson(filePath) {
  try {
    const txt = await fs.readFile(filePath, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function formatBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const CSV_FILES = [
  ["pedidos_completo.csv", "Join pedidos + vendedor + pagamentos"],
  ["itens_completo.csv", "Itens com SKU e snapshots"],
  ["auditoria_divergencias.csv", "Auditoria / flags"],
  ["pdv_orders.csv", "Tabela bruta pdv_orders"],
  ["pdv_order_items.csv", "Tabela bruta pdv_order_items"],
  ["pdv_order_payments.csv", "Tabela bruta pdv_order_payments"],
  ["pdv_order_services.csv", "Tabela bruta pdv_order_services"],
  ["pdv_products.csv", "Catálogo pdv_products"],
  ["pdv_sellers.csv", "Vendedores"],
  ["pdv_cash_flow.csv", "Fluxo de caixa"],
  ["pdv_desconto_folha.csv", "Desconto folha"],
  ["pdv_goals.csv", "Metas"],
];

async function main() {
  const { dir, outFile } = parseArgs(process.argv);
  if (!dir) {
    console.error(
      "Informe a pasta do export extraído:\n  node scripts/export-sanity-report.mjs \"C:\\\\Users\\\\...\\\\export_folder\"",
    );
    process.exit(1);
  }

  const abs = path.resolve(dir);
  let out = "";
  const log = (s = "") => {
    out += s + "\n";
    console.log(s);
  };

  log("═ Relatório de sanidade — export PDV Jumera ═");
  log(`Pasta: ${abs}`);
  log(`Gerado em: ${new Date().toISOString()}`);
  log("");

  try {
    await fs.access(abs);
  } catch {
    console.error("Pasta não encontrada:", abs);
    process.exit(1);
  }

  log("── Arquivos CSV (linhas de dado = total − cabeçalho) ──");
  let found = 0;
  for (const [name, desc] of CSV_FILES) {
    const fp = path.join(abs, name);
    const c = await countDataRows(fp);
    if (c) {
      found++;
      log(`  ${name.padEnd(28)} ${String(c.dataRows).padStart(6)} linhas   ${desc}`);
    } else {
      log(`  ${name.padEnd(28)} (ausente)`);
    }
  }

  log("");
  log("── Outros arquivos ──");
  for (const f of ["stats.json", "divergencias_regras.md", "jumera_sport_dump.sql"]) {
    const fp = path.join(abs, f);
    const sz = await statFile(fp);
    log(`  ${f.padEnd(28)} ${sz != null ? formatBytes(sz) : "(ausente)"}`);
  }

  const statsPath = path.join(abs, "stats.json");
  const stats = await readStatsJson(statsPath);
  log("");
  log("── stats.json (trecho) ──");
  if (stats && typeof stats === "object") {
    try {
      log(JSON.stringify(stats, null, 2).slice(0, 4000));
      if (JSON.stringify(stats).length > 4000) log("\n  … (truncado no relatório; abra stats.json completo)");
    } catch {
      log("  (erro ao serializar)");
    }
  } else {
    log("  (ausente ou JSON inválido)");
  }

  log("");
  log("── Checagens cruzadas (aproximadas) ──");
  const pedidosJoin = path.join(abs, "pedidos_completo.csv");
  const pedidosRaw = path.join(abs, "pdv_orders.csv");
  const itensRaw = path.join(abs, "pdv_order_items.csv");
  const itensJoin = path.join(abs, "itens_completo.csv");

  const u1 = await countDistinctPedidoIds(pedidosJoin, "pedidoId");
  const u2 = await countDistinctPedidoIds(pedidosRaw, "pedidoId");
  const u3 = await countDistinctPedidoIds(itensJoin, "pedidoId");
  const u4 = await countDistinctPedidoIds(itensRaw, "pedidoId");

  const rowsPedidosJoin = (await countDataRows(pedidosJoin))?.dataRows;

  if (u1 && !u1.error && rowsPedidosJoin != null && u1.unique !== rowsPedidosJoin) {
    log(`  ⚠ pedidos_completo: ${rowsPedidosJoin} linhas de dados mas só ${u1.unique} pedidoId distintos (possível join 1:N por pagamento)`);
  }

  if (u1 && !u1.error) log(`  pedidos únicos (pedidos_completo):     ${u1.unique}`);
  if (u2 && !u2.error) log(`  pedidos únicos (pdv_orders):           ${u2.unique}`);
  if (u3 && !u3.error) log(`  pedidos únicos (itens_completo):       ${u3.unique}`);
  if (u4 && !u4.error) log(`  pedidos únicos (pdv_order_items):      ${u4.unique}`);

  if (u1 && u3 && !u1.error && !u3.error && u1.unique > u3.unique) {
    log(`  ⚠ ${u1.unique - u3.unique} pedido(s) aparecem em pedidos_completo mas sem linhas em itens_completo (ex.: só serviços, ou export parcial)`);
  }

  if (u1 && u2 && !u1.error && !u2.error && u1.unique !== u2.unique) {
    log("");
    log("  ⚠ divergência: pedidos_completo vs pdv_orders (contagem distinta de pedidoId)");
  }
  if (u3 && u4 && !u3.error && !u4.error && u3.unique !== u4.unique) {
    log("  ⚠ divergência: itens_completo vs pdv_order_items (pedidos distintos)");
  }

  log("");
  log("── Observação ──");
  log("  Contagem de linhas não valida CSV com campos entre aspas que contenham vírgulas.");
  log("  pedidoId único usa split simples; use apenas como checagem rápida.");
  log("");
  log("Fim.");

  if (outFile) {
    await fs.writeFile(path.resolve(outFile), out, "utf8");
    console.error("(também gravado em " + path.resolve(outFile) + ")");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
