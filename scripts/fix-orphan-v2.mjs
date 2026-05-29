// V2: usa aliases de código + fallback por linha/modelo/time/tipo/tam/atc-var
import mysql from 'mysql2/promise';
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const apply = process.argv.includes('--apply');

const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// ── Aliases manuais (códigos vistos na planilha que não existem mais) ──
const ALIAS = {
  'CA-JG-TIM-VARI-X': 'CA-JG-TIM-VARI-TIME-X',  // jogador times variedades
};

// ── 1) Produtos do banco ──
const [prodRows] = await db.execute(`SELECT id, codigo, linha, modelo, time, descricao, tipo, ptAtacado, ptVarejo FROM pdv_products WHERE codigo IS NOT NULL`);
const prodByCod = new Map();
const prodList = [];
for (const p of prodRows) {
  prodByCod.set(String(p.codigo).trim().toUpperCase(), {
    id: p.id,
    ptAtacado: Number(p.ptAtacado) || 0,
    ptVarejo: Number(p.ptVarejo) || 0,
  });
  prodList.push({
    id: p.id,
    codigo: String(p.codigo).trim().toUpperCase(),
    linha: String(p.linha || '').toUpperCase().trim(),
    modelo: String(p.modelo || '').toUpperCase().trim(),
    time: String(p.time || '').toUpperCase().trim(),
    descricao: String(p.descricao || '').toUpperCase().trim(),
    tipo: String(p.tipo || '').toUpperCase().trim(),
    ptAtacado: Number(p.ptAtacado) || 0,
    ptVarejo: Number(p.ptVarejo) || 0,
  });
}

// ── 2) Planilha pedidos_itens (index por pedidoId) ──
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/pedidos_itens!A2:Q15000?key=${API_KEY}`);
const j = await r.json();
const rows = (j.values || []).filter(row => (row[0] || '').toString().trim());

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

// ── 3) Órfãos do período ──
const [orphans] = await db.execute(`
  SELECT oi.id, oi.pedidoId, oi.descricao, oi.linha, oi.modelo, oi.time, oi.tipo, oi.tamanho,
    oi.quantidade, oi.totalItem, o.regime
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE oi.productId IS NULL AND oi.isSofia = 0 AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-31'
  ORDER BY oi.id
`);
console.log(`Órfãos não-Sofia em maio: ${orphans.length}`);

const fixes = [];
const semMatch = [];

for (const o of orphans) {
  // ── Estratégia 1: planilha pedidos_itens ──
  const linhas = sheetByPid.get(o.pedidoId) || [];
  let match = linhas.find(l => l.qtd === o.quantidade && Math.abs(l.total - Number(o.totalItem)) < 0.01);
  if (!match) {
    const porQtd = linhas.filter(l => l.qtd === o.quantidade);
    if (porQtd.length === 1) match = porQtd[0];
  }
  let codFinal = match?.cod;
  if (codFinal && ALIAS[codFinal]) codFinal = ALIAS[codFinal];
  let prod = codFinal ? prodByCod.get(codFinal) : null;

  // ── Estratégia 2: match no banco por (LINHA, MODELO, TIME, TIPO) ──
  if (!prod) {
    const oLinha = String(o.linha || '').toUpperCase().trim();
    const oModelo = String(o.modelo || '').toUpperCase().trim();
    const oTime = String(o.time || '').toUpperCase().trim();
    const oTipo = String(o.tipo || '').toUpperCase().trim();
    // Normalizar valores conhecidos
    const tipoNorm = oTipo === 'CAMISETA' ? 'CAMISETA' : oTipo;
    const candidates = prodList.filter(p =>
      p.linha === oLinha && p.modelo === oModelo && p.time === oTime && p.tipo === tipoNorm
    );
    if (candidates.length === 1) {
      prod = { id: candidates[0].id, ptAtacado: candidates[0].ptAtacado, ptVarejo: candidates[0].ptVarejo };
      codFinal = candidates[0].codigo + ' (matched-by-l/m/t/t)';
    }
  }

  if (!prod) {
    semMatch.push({ ...o, _sheetCod: match?.cod, _alias: codFinal });
    continue;
  }
  fixes.push({
    id: o.id, pedidoId: o.pedidoId,
    sheetCod: codFinal,
    productId: prod.id, ptAtacado: prod.ptAtacado, ptVarejo: prod.ptVarejo,
  });
}

console.log(`Fixes: ${fixes.length} | Sem match: ${semMatch.length}\n`);

if (fixes.length > 0) {
  // resumo dos códigos
  const byCod = {};
  for (const f of fixes) {
    const k = f.sheetCod;
    byCod[k] = (byCod[k] || 0) + 1;
  }
  console.log('── Distribuição dos fixes por código ──');
  Object.entries(byCod).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k.padEnd(40)} ${v}x`));
}

if (semMatch.length > 0) {
  console.log('\n── Órfãos remanescentes (sem match) ──');
  const bySheet = {};
  for (const o of semMatch) {
    const k = o._sheetCod || `[NO SHEET] linha=${o.linha} modelo=${o.modelo} time=${o.time} tam=${o.tamanho}`;
    if (!bySheet[k]) bySheet[k] = { count: 0, total: 0, qtd: 0 };
    bySheet[k].count++;
    bySheet[k].total += Number(o.totalItem || 0);
    bySheet[k].qtd += Number(o.quantidade || 0);
  }
  Object.entries(bySheet).sort((a,b)=>b[1].qtd-a[1].qtd).forEach(([k,v]) =>
    console.log(`  ${k}  →  ${v.count}x | qtd=${v.qtd} | R$${v.total.toFixed(2)}`)
  );
}

if (!apply) {
  console.log('\n(dry-run — use --apply para gravar)');
  await db.end();
  process.exit(0);
}

console.log('\n── Aplicando UPDATEs ──');
let n = 0;
for (const f of fixes) {
  await db.execute(`UPDATE pdv_order_items SET productId = ?, ptAtacado = ?, ptVarejo = ? WHERE id = ?`,
    [f.productId, f.ptAtacado, f.ptVarejo, f.id]);
  n++;
}
console.log(`✓ ${n} itens atualizados`);

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
console.log('\n── Pontuação por vendedor APÓS o fix ──');
console.table(perSel);

await db.end();
