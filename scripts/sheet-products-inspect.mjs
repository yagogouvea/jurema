/** Inspeciona linhas reais da aba PRODUTOS para entender por que tantas são descartadas. */
const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
if (!apiKey) { console.error("Faltou GOOGLE_SHEETS_API_KEY"); process.exit(1); }

async function range(r) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(r)}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).values || [];
}

const header = (await range("PRODUTOS!A1:Z1"))[0];
console.log("Cabeçalho (", header.length, "colunas):");
header.forEach((h, i) => console.log("  ", i, "=", h));

const linhas = await range("PRODUTOS!A2:Z2000");
console.log("\nTotal de linhas com algum dado:", linhas.length);

let validas = 0, ignTimeTam = 0, ignQtd = 0, ignPreco = 0, ignCodigo = 0;
let comAtivoVazio = 0, comAtivoSim = 0, comAtivoNao = 0, comAtivoOutro = 0;
const ativoVals = new Map();

function parseMoney(s) {
  if (!s) return 0;
  const c = s.toString().trim().replace(/[R$\s]/g, "").replace(",", ".");
  const n = parseFloat(c);
  return isNaN(n) ? 0 : n;
}

const exemploInvalido = { semTime: [], semTam: [], qtdInvalida: [], precoInvalido: [], semCodigo: [] };

for (const row of linhas) {
  const codigo = (row[0] || "").trim();
  const linha = (row[1] || "").trim();
  const modelo = (row[2] || "").trim();
  const time = (row[3] || "").trim();
  const desc = (row[4] || "").trim();
  const tam = (row[5] || "").trim();
  const tipo = (row[6] || "").trim();
  const qtdRaw = (row[7] || "").trim();
  const atcRaw = (row[8] || "").trim();
  const varRaw = (row[9] || "").trim();
  const ativoRaw = (row[11] || "").trim();

  const upAtivo = ativoRaw.toUpperCase();
  if (!ativoRaw) comAtivoVazio++;
  else if (upAtivo === "SIM" || upAtivo === "1" || upAtivo === "TRUE") comAtivoSim++;
  else if (upAtivo === "NAO" || upAtivo === "NÃO" || upAtivo === "0" || upAtivo === "FALSE") comAtivoNao++;
  else comAtivoOutro++;
  ativoVals.set(ativoRaw, (ativoVals.get(ativoRaw) || 0) + 1);

  if (!time) { ignTimeTam++; if (exemploInvalido.semTime.length < 5) exemploInvalido.semTime.push(row.slice(0, 12)); continue; }
  if (!tam)  { ignTimeTam++; if (exemploInvalido.semTam.length < 5)  exemploInvalido.semTam.push(row.slice(0, 12));  continue; }

  const qtd = parseInt(qtdRaw, 10);
  if (isNaN(qtd) || qtd < 0) { ignQtd++; if (exemploInvalido.qtdInvalida.length < 5) exemploInvalido.qtdInvalida.push(row.slice(0, 12)); continue; }

  const atc = parseMoney(atcRaw);
  const v = parseMoney(varRaw);
  if (atc <= 0 || v <= 0) { ignPreco++; if (exemploInvalido.precoInvalido.length < 5) exemploInvalido.precoInvalido.push(row.slice(0, 12)); continue; }

  if (!codigo) { ignCodigo++; if (exemploInvalido.semCodigo.length < 5) exemploInvalido.semCodigo.push(row.slice(0, 12)); continue; }

  validas++;
}

console.log("\nPós filtros do sync:");
console.log("  válidas (passariam pelo sync):", validas);
console.log("  descartadas por time/tamanho vazio:", ignTimeTam);
console.log("  descartadas por qtd inválida:", ignQtd);
console.log("  descartadas por preço inválido:", ignPreco);
console.log("  descartadas por código vazio (mas planilha permitiria autogerar):", ignCodigo);

console.log("\nColuna L (ATIVO):");
console.log("  vazio:", comAtivoVazio, "| SIM:", comAtivoSim, "| NAO:", comAtivoNao, "| outro:", comAtivoOutro);
console.log("  valores distintos:", Array.from(ativoVals.entries()).slice(0, 15));

console.log("\nExemplos descartados (primeiras 12 colunas):");
for (const [tipo, ex] of Object.entries(exemploInvalido)) {
  if (ex.length === 0) continue;
  console.log("  >", tipo);
  for (const r of ex) console.log("    ", r);
}
