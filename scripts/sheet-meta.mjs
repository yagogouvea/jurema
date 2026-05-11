/** Lista todas as abas da planilha PDV (apenas leitura). */
const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
if (!apiKey) { console.error("Faltou GOOGLE_SHEETS_API_KEY"); process.exit(1); }

const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title,gridProperties,hidden))&key=${apiKey}`;
const r = await fetch(url);
if (!r.ok) { console.error("HTTP", r.status, await r.text()); process.exit(1); }
const d = await r.json();

console.log("Abas da planilha PDV:");
for (const s of d.sheets) {
  const p = s.properties;
  const g = p.gridProperties || {};
  console.log(
    "  -", p.title.padEnd(28),
    "linhas:", String(g.rowCount).padStart(5),
    "colunas:", String(g.columnCount).padStart(3),
    p.hidden ? "(oculta)" : ""
  );
}

console.log("\nPara cada aba, primeira linha (cabeçalho):");
for (const s of d.sheets) {
  const title = s.properties.title;
  const range = `${title}!A1:Z1`;
  const rr = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`
  );
  if (!rr.ok) { console.log("  [", title, "] erro:", rr.status); continue; }
  const dd = await rr.json();
  const headers = (dd.values?.[0] || []).map(h => (h || "").toString().trim());
  console.log("  [", title, "]");
  console.log("    →", headers.length ? headers.join(" | ") : "(vazio)");
}
