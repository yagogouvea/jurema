/**
 * Lê a planilha PRODUTOS e os produtos ativos do MySQL Railway e compara.
 * Replica o mesmo parser/dedupe usado em server/routers/pdvAutoSync.ts.
 * Não altera nada.
 */
import mysql from "mysql2/promise";

const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const SHEET_RANGE = "PRODUTOS!A2:P2000";
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!apiKey || !dbUrl) {
  console.error("Faltou GOOGLE_SHEETS_API_KEY ou DATABASE_URL");
  process.exit(1);
}

function parseMoney(raw) {
  if (!raw) return 0;
  const clean = raw.toString().trim().replace(/[R$\s]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

async function fetchSheet() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sheets API ${r.status}: ${await r.text()}`);
  return (await r.json()).values || [];
}

const rows = await fetchSheet();

const rawProducts = [];
let invalid = 0;
for (const row of rows) {
  const time = (row[3] || "").trim();
  const tamanho = (row[5] || "").trim();
  const qtdRaw = (row[7] || "").trim();
  const atcRaw = (row[8] || "").trim();
  const varRaw = (row[9] || "").trim();

  if (!time || !tamanho) { invalid++; continue; }
  const qtd = parseInt(qtdRaw, 10);
  if (isNaN(qtd) || qtd < 0) { invalid++; continue; }
  const atc = parseMoney(atcRaw);
  const varejo = parseMoney(varRaw);
  if (atc <= 0 || varejo <= 0) { invalid++; continue; }

  const codigo = (row[0] || "").trim();
  if (!codigo) { invalid++; continue; }

  const isActiveRaw = (row[11] || "").trim().toUpperCase();
  const isActive = isActiveRaw === "" || isActiveRaw === "SIM" || isActiveRaw === "1" || isActiveRaw === "TRUE" ? 1 : 0;

  rawProducts.push({
    codigo,
    linha: (row[1] || "").trim(),
    modelo: (row[2] || "").trim(),
    time,
    descricao: (row[4] || "").trim(),
    tamanho,
    tipo: (row[6] || "CAMISETA").trim(),
    estoque: qtd,
    precoAtacado: atc,
    precoVarejo: varejo,
    isActive,
    custo: parseMoney(row[10] || ""),
    ptAtacado: parseMoney(row[14] || ""),
    ptVarejo: parseMoney(row[15] || ""),
  });
}

const deduped = new Map();
for (const p of rawProducts) {
  const e = deduped.get(p.codigo);
  if (!e || p.estoque > e.estoque) {
    deduped.set(p.codigo, { ...p, estoque: e ? e.estoque + p.estoque : p.estoque });
  }
}
const planilha = deduped;

const db = await mysql.createConnection(dbUrl);
const [rowsDb] = await db.execute(
  "SELECT codigo, linha, modelo, `time`, descricao, tamanho, tipo, estoque, precoAtacado, precoVarejo, isActive, custo, ptAtacado, ptVarejo, updatedAt FROM pdv_products WHERE codigo IS NOT NULL AND codigo != '' AND isActive = 1"
);
await db.end();

const banco = new Map();
const duplicados = [];
for (const r of rowsDb) {
  if (banco.has(r.codigo)) duplicados.push(r.codigo);
  banco.set(r.codigo, {
    codigo: r.codigo,
    linha: r.linha ?? "",
    modelo: r.modelo ?? "",
    time: r.time ?? "",
    descricao: r.descricao ?? "",
    tamanho: r.tamanho ?? "",
    tipo: r.tipo ?? "",
    estoque: Number(r.estoque ?? 0),
    precoAtacado: Number(r.precoAtacado ?? 0),
    precoVarejo: Number(r.precoVarejo ?? 0),
    isActive: r.isActive === 1 || r.isActive === true ? 1 : 0,
    custo: Number(r.custo ?? 0),
    ptAtacado: Number(r.ptAtacado ?? 0),
    ptVarejo: Number(r.ptVarejo ?? 0),
    updatedAt: r.updatedAt,
  });
}

console.log("\n=== contagens ===");
console.log("  planilha — linhas válidas após filtro/dedupe:", planilha.size, "(linhas ignoradas:", invalid, ")");
console.log("  banco — ativos com código:", banco.size);
if (duplicados.length) console.log("  ATENÇÃO: códigos duplicados ATIVOS no banco:", duplicados);

const soNaPlanilha = [];
const soNoBanco = [];
const divergentes = [];

const FIELDS_NUM = ["estoque", "precoAtacado", "precoVarejo", "custo", "ptAtacado", "ptVarejo"];
const FIELDS_STR = ["linha", "modelo", "time", "descricao", "tamanho", "tipo"];

for (const [cod, p] of planilha) {
  const b = banco.get(cod);
  if (!b) { soNaPlanilha.push(cod); continue; }
  const diffs = [];
  for (const k of FIELDS_NUM) {
    if (Math.abs(p[k] - b[k]) > 0.005) diffs.push(`${k}: planilha=${p[k]} banco=${b[k]}`);
  }
  for (const k of FIELDS_STR) {
    if ((p[k] || "").toString().trim().toUpperCase() !== (b[k] || "").toString().trim().toUpperCase()) {
      diffs.push(`${k}: planilha="${p[k]}" banco="${b[k]}"`);
    }
  }
  if (p.isActive !== b.isActive) diffs.push(`isActive: planilha=${p.isActive} banco=${b.isActive}`);
  if (diffs.length) divergentes.push({ codigo: cod, diffs });
}
for (const cod of banco.keys()) if (!planilha.has(cod)) soNoBanco.push(cod);

console.log("\n=== comparação ===");
console.log("  só na planilha:", soNaPlanilha.length);
if (soNaPlanilha.length) console.log("   ", soNaPlanilha);
console.log("  só no banco (ativos):", soNoBanco.length);
if (soNoBanco.length) console.log("   ", soNoBanco);
console.log("  divergências (mesmo código, dados diferentes):", divergentes.length);
for (const d of divergentes.slice(0, 50)) console.log("   -", d.codigo, "→", d.diffs.join(" | "));

console.log("\n=== últimos updatedAt no banco (top 5) ===");
const top = [...banco.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5);
for (const r of top) console.log("  ", r.codigo, "→", r.updatedAt);

if (!soNaPlanilha.length && !soNoBanco.length && !divergentes.length) {
  console.log("\n>> RESULTADO: planilha e banco 100% sincronizados.");
} else {
  console.log("\n>> RESULTADO: há divergências — ver acima.");
}
