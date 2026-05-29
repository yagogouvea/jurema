/** Lê amostras das abas PEDIDOS, pedidos_itens e SOFIA_ITENS para mapeamento. */
const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
async function r(range) {
  const u = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`;
  const x = await fetch(u);
  if (!x.ok) throw new Error("HTTP " + x.status);
  return (await x.json()).values || [];
}

function showSample(title, header, rows, n) {
  console.log("\n===", title, "===");
  console.log("Cabeçalho (", header.length, "colunas):");
  header.forEach((h, i) => console.log("  ", String.fromCharCode(65 + i), "(", i, ") =", h));
  console.log("\nTotal linhas com dados:", rows.length);
  console.log("\nPrimeiras", n, "linhas:");
  for (const row of rows.slice(0, n)) {
    console.log("  -", row);
  }
  console.log("\nÚltimas", n, "linhas:");
  for (const row of rows.slice(-n)) {
    console.log("  -", row);
  }
}

const pedHeader = (await r("PEDIDOS!A1:AH1"))[0];
const pedRows = (await r("PEDIDOS!A2:AH3000")).filter(r => (r[0] || "").trim());
showSample("PEDIDOS", pedHeader, pedRows, 3);

const itHeader = (await r("pedidos_itens!A1:AC1"))[0];
const itRows = (await r("pedidos_itens!A2:AC10000")).filter(r => (r[0] || "").trim());
showSample("pedidos_itens", itHeader, itRows, 5);

const sofHeader = (await r("SOFIA_ITENS!A1:AA1"))[0];
const sofRows = (await r("SOFIA_ITENS!A2:AA3000")).filter(r => (r[0] || "").trim());
showSample("SOFIA_ITENS", sofHeader, sofRows, 3);

// Estatísticas adicionais
console.log("\n=== distribuições PEDIDOS ===");
const stat = (idx, name) => {
  const m = new Map();
  for (const row of pedRows) {
    const v = (row[idx] || "").toString().trim();
    m.set(v, (m.get(v) || 0) + 1);
  }
  console.log(name, ":", [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
};
stat(2, "vendedor (C)");
stat(3, "canal (D)");
stat(9, "atacado_varejo (J)");
stat(13, "forma_pagamento (N)");
stat(19, "status (T)");

// Cruzamento: quantos pedidos têm itens?
const pedIds = new Set(pedRows.map(r => r[0].trim()));
const itPedIds = new Set(itRows.map(r => r[0].trim()));
const sofPedIds = new Set(sofRows.map(r => r[0].trim()));
console.log("\n=== cruzamento ===");
console.log("  pedidos com itens em pedidos_itens:", [...pedIds].filter(p => itPedIds.has(p)).length, "de", pedIds.size);
console.log("  pedidos só em SOFIA_ITENS (sem cabeçalho PEDIDOS):", [...sofPedIds].filter(p => !pedIds.has(p)).length);
console.log("  pedidos com cabeçalho mas sem itens:", [...pedIds].filter(p => !itPedIds.has(p) && !sofPedIds.has(p)).length);
