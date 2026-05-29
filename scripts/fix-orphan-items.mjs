// Resolve productId de itens órfãos casando pela planilha pedidos_itens
import mysql from 'mysql2/promise';
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const apply = process.argv.includes('--apply');

const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// ── 1) Lê produtos do banco (id, codigo, pontos) ──
const [prodRows] = await db.execute(`SELECT id, codigo, ptAtacado, ptVarejo FROM pdv_products WHERE codigo IS NOT NULL`);
const prodByCod = new Map();
for (const p of prodRows) {
  prodByCod.set(String(p.codigo).trim().toUpperCase(), {
    id: p.id,
    ptAtacado: Number(p.ptAtacado) || 0,
    ptVarejo: Number(p.ptVarejo) || 0,
  });
}
console.log(`Produtos no banco: ${prodByCod.size}`);

// ── 2) Lê planilha pedidos_itens ──
console.log('Lendo planilha pedidos_itens…');
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/pedidos_itens!A2:Q15000?key=${API_KEY}`);
const j = await r.json();
const rows = (j.values || []).filter(row => (row[0] || '').toString().trim());
console.log(`  ${rows.length} linhas na planilha`);

// Indexa: pedidoId → array de { cod, produto, qtd, total }
const sheetByPid = new Map();
for (const row of rows) {
  const pid = (row[0] || '').trim();
  if (!pid) continue;
  if (!sheetByPid.has(pid)) sheetByPid.set(pid, []);
  sheetByPid.get(pid).push({
    cod: (row[1] || '').toString().trim().toUpperCase(),
    produto: (row[2] || '').toString().trim(),
    qtd: parseInt(row[3]) || 0,
    total: parseFloat(String(row[11] || '0').replace(',', '.')) || 0,
  });
}
console.log(`  ${sheetByPid.size} pedidos únicos na planilha`);

// ── 3) Busca itens órfãos do banco (todos, mas marcar período recente) ──
const [orphans] = await db.execute(`
  SELECT oi.id, oi.pedidoId, oi.descricao, oi.quantidade, oi.totalItem,
    DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) as dia
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE oi.productId IS NULL
  ORDER BY oi.pedidoId, oi.id
`);
console.log(`\nItens órfãos no banco: ${orphans.length}\n`);

// ── 4) Casa cada órfão com linha da planilha ──
const fixes = [];
const semMatch = [];
for (const o of orphans) {
  const linhas = sheetByPid.get(o.pedidoId) || [];
  // Tenta casar por (qtd + total)
  let match = linhas.find(l => l.qtd === o.quantidade && Math.abs(l.total - Number(o.totalItem)) < 0.01);
  // Fallback: só por qtd (se houver uma única com essa qtd)
  if (!match) {
    const porQtd = linhas.filter(l => l.qtd === o.quantidade);
    if (porQtd.length === 1) match = porQtd[0];
  }
  // Fallback 2: por descrição parcial
  if (!match) {
    const descLower = String(o.descricao || '').toLowerCase();
    match = linhas.find(l => l.produto.toLowerCase() === descLower);
  }
  if (!match) {
    semMatch.push(o);
    continue;
  }
  const prod = prodByCod.get(match.cod);
  if (!prod) {
    semMatch.push({ ...o, _sheetCod: match.cod });
    continue;
  }
  fixes.push({
    id: o.id,
    pedidoId: o.pedidoId,
    sheetCod: match.cod,
    productId: prod.id,
    ptAtacado: prod.ptAtacado,
    ptVarejo: prod.ptVarejo,
  });
}

const fixesRecentes = fixes.filter(f => {
  const o = orphans.find(x => x.id === f.id);
  const d = o?.dia ? new Date(o.dia).toISOString().slice(0,10) : '';
  return d >= '2026-05-01' && d <= '2026-05-31';
});
const semMatchRecentes = semMatch.filter(o => {
  const d = o.dia ? new Date(o.dia).toISOString().slice(0,10) : '';
  return d >= '2026-05-01' && d <= '2026-05-31';
});
console.log(`Fixes encontrados: ${fixes.length} (recentes: ${fixesRecentes.length})`);
console.log(`Sem match: ${semMatch.length} (recentes: ${semMatchRecentes.length})`);

if (semMatchRecentes.length > 0) {
  console.log('\n── ÓRFÃOS DO PERÍODO RECENTE (sem match) ──');
  for (const o of semMatchRecentes.slice(0, 30)) {
    console.log(`  [id=${o.id}] ${o.pedidoId} qtd=${o.quantidade} total=${o.totalItem} sheetCod=${o._sheetCod || '?'} desc="${String(o.descricao).slice(0, 40)}"`);
  }
}

if (semMatch.length > 0) {
  console.log('\n── Itens sem match (5 primeiros) ──');
  for (const o of semMatch.slice(0, 5)) {
    console.log(`  [id=${o.id}] ${o.pedidoId} qtd=${o.quantidade} total=${o.totalItem} desc="${String(o.descricao).slice(0, 50)}" sheetCod=${o._sheetCod || '?'}`);
  }
}

// Amostra dos fixes
console.log('\n── Amostra dos fixes (5) ──');
for (const f of fixes.slice(0, 5)) {
  console.log(`  [id=${f.id}] ${f.pedidoId} → cod=${f.sheetCod} productId=${f.productId} PT_AT=${f.ptAtacado} PT_VA=${f.ptVarejo}`);
}

if (!apply) {
  console.log('\n(dry-run — passe --apply para gravar)');
  await db.end();
  process.exit(0);
}

// ── 5) Aplica UPDATEs ──
console.log('\n── Aplicando ──');
let n = 0;
for (const f of fixes) {
  await db.execute(
    `UPDATE pdv_order_items SET productId = ?, ptAtacado = ?, ptVarejo = ? WHERE id = ?`,
    [f.productId, f.ptAtacado, f.ptVarejo, f.id]
  );
  n++;
}
console.log(`  ✓ ${n} itens atualizados`);

// ── 6) Pontuação atualizada ──
console.log('\n── Pontuação por vendedor APÓS o fix (período 01-11/05) ──');
const [perSel] = await db.execute(`
  SELECT o.sellerName,
    COUNT(DISTINCT o.pedidoId) as pedidos,
    SUM(oi.quantidade) as pecas,
    COALESCE(SUM(oi.totalItem), 0) as faturamento,
    COALESCE(SUM(
      CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
           ELSE oi.ptVarejo * oi.quantidade END
    ), 0) as pontuacao
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'
  GROUP BY o.sellerName
  ORDER BY pontuacao DESC
`);
console.table(perSel);

await db.end();
