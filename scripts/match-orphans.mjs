// Tenta casar itens órfãos com produtos da planilha PRODUTOS
import mysql from 'mysql2/promise';
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// ── 1) Lê TODOS os produtos da planilha PRODUTOS ──
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PRODUTOS!A2:P200?key=${API_KEY}`);
const j = await r.json();
const planilhaProds = (j.values || []).filter(row => (row[0] || '').toString().trim()).map(row => ({
  codigo: row[0],
  linha: (row[1] || '').toUpperCase().trim(),
  modelo: (row[2] || '').toUpperCase().trim(),
  time: (row[3] || '').toUpperCase().trim(),
  descricao: (row[4] || '').toUpperCase().trim(),
  tipo: (row[6] || '').toUpperCase().trim(),
  ptAtacado: parseFloat(String(row[14] || '0').replace(',', '.')) || 0,
  ptVarejo: parseFloat(String(row[15] || '0').replace(',', '.')) || 0,
}));

console.log(`Produtos na planilha: ${planilhaProds.length}\n`);
console.log('CODIGO                    LINHA           MODELO       TIME          DESCRICAO                  TIPO       PT_AT  PT_VA');
console.log('-'.repeat(135));
for (const p of planilhaProds) {
  console.log(`${p.codigo.padEnd(26)} ${p.linha.padEnd(16)} ${p.modelo.padEnd(13)} ${p.time.padEnd(14)} ${p.descricao.padEnd(28)} ${p.tipo.padEnd(11)} ${String(p.ptAtacado).padStart(4)}   ${String(p.ptVarejo).padStart(4)}`);
}

// ── 2) Lê itens órfãos do banco ──
console.log('\n\n═══ Itens órfãos (productId NULL) + tentativa de match ═══\n');
const [orphans] = await db.execute(`
  SELECT
    oi.descricao,
    COUNT(*) as ocorrencias, SUM(oi.quantidade) as total_qtd
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'
    AND oi.productId IS NULL AND oi.isSofia = 0
  GROUP BY oi.descricao
  ORDER BY total_qtd DESC
`);

console.log('DESCRICAO_DO_ITEM                                                                  qtd  match?');
console.log('-'.repeat(110));
for (const o of orphans) {
  const desc = (o.descricao || '').toUpperCase();
  const parts = desc.split(/\s+/);
  // Tenta match por (linha, modelo, primeira_palavra_descricao)
  const lin = (parts[0] || '').trim();
  const mod = (parts[1] || '').trim();
  const tipo = (parts[parts.length - 1] || '').trim();

  // Match candidates: linha bate
  const candidates = planilhaProds.filter(p => p.linha === lin && p.tipo === tipo);
  const matchByModelo = candidates.filter(p => p.modelo === mod || (mod === 'TORCEDO' && p.modelo === 'TORCEDOR'));
  // Pegar o "melhor" candidato
  const best = matchByModelo.length === 1 ? matchByModelo[0] : null;

  const matchStr = best 
    ? `→ ${best.codigo} (PT_AT=${best.ptAtacado}, PT_VA=${best.ptVarejo})`
    : candidates.length > 1 
      ? `${candidates.length} candidatos: [${candidates.map(c => c.codigo).join(', ')}]`
      : 'SEM MATCH';
  console.log(`${String(o.descricao || '').slice(0, 70).padEnd(70)} ${String(o.total_qtd).padStart(4)}  ${matchStr}`);
}

await db.end();
