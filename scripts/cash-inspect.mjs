/** Inspeciona a aba FLUXO_CAIXA para entender tipos e formatos das linhas. */
const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("FLUXO_CAIXA!A2:G5000")}?key=${apiKey}`;
const r = await fetch(url);
const data = await r.json();
const rows = data.values || [];

console.log("Total linhas com dados:", rows.length);

const tipos = new Map();
for (const row of rows) {
  const t = (row[2] || "").toString().trim().toUpperCase();
  tipos.set(t, (tipos.get(t) || 0) + 1);
}
console.log("\nDistribuição de tipos (coluna C):");
for (const [k, v] of [...tipos.entries()].sort((a, b) => b[1] - a[1])) {
  console.log("  ", JSON.stringify(k).padEnd(20), "→", v);
}

console.log("\nPrimeiras 5 linhas:");
for (const row of rows.slice(0, 5)) console.log("  ", row);
console.log("\n5 linhas aleatórias do meio:");
for (let i = 0; i < 5; i++) {
  const idx = Math.floor(Math.random() * rows.length);
  console.log("  [", idx, "]", rows[idx]);
}
console.log("\nÚltimas 5 linhas:");
for (const row of rows.slice(-5)) console.log("  ", row);
