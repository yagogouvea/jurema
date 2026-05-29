// V3: usa mapeamento agressivo por descrição + preço médio
import mysql from 'mysql2/promise';
const apply = process.argv.includes('--apply');
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// Mapeamento descrição → código do produto (baseado em conhecimento do negócio)
// Considera: nome do item + faixa de preço razoável
const DESC_MAP = [
  { match: /NACIONAL.*CAIXINHA.*BRASIL/i,             cod: 'NA-TO-BRA-CAIX-X' },           // PT 7.5/12.5 - bate caixinha
  { match: /NACIONAL.*TORCEDOR.*BRASIL.*COPA.*2026/i, cod: 'NA-TO-BRA-COPA-2026-X' },      // PT 8/18 - copa 2026
  { match: /NACIONAL.*TORCEDOR.*BRASIL/i,             cod: 'NA-TO-BRA-COPA-26-X', minPrice: 35 }, // PT 16/31 - copa 26 normal
  { match: /NACIONAL.*GENERICO.*BRASIL/i,             cod: 'NA-TO-BRA-COPA-26-X' },        // genérico brasil = copa 26
  { match: /NACIONAL.*GENERICO.*VARIEDADES/i,         cod: 'NA-TO-GEN-VARI-TIME-X' },      // PT 4/24 - generico
  { match: /NACIONAL.*TORCEDOR.*GEN[EÉ]RICO/i,        cod: 'NA-TO-GEN-VARI-TIME-X' },      // generico variedades
  { match: /TAILANDESA.*CONUNTO.*ADULTO.*VER[ÃA]O.*S[ÃA]O PAULO/i, cod: 'CA-CO-SAO-SAO-PAUL-X' }, // PT 13/28 - são paulo branco
  { match: /TAILANDESA.*DE.*80.*VARIEDADE/i,          cod: 'CA-TO-GEN-VARI-TIME-X' },      // PT 18/38 - tailandesa genérica
  { match: /TAILANDESA.*JOGADOR.*PALMEIRAS/i,         cod: 'CA-JG-TIM-VARI-TIME-X' },      // PT 23/45 - jogador times
  { match: /TAILANDESA.*TORCEDO.*PALMEIRAS/i,         cod: 'CA-TO-GEN-VARI-TIME-X' },      // PT 18/38 - tailandesa torcedor genérica
];

const [prodRows] = await db.execute(`SELECT id, codigo, ptAtacado, ptVarejo FROM pdv_products`);
const prodByCod = new Map();
for (const p of prodRows) {
  prodByCod.set(String(p.codigo).trim().toUpperCase(), {
    id: p.id, ptAtacado: Number(p.ptAtacado) || 0, ptVarejo: Number(p.ptVarejo) || 0,
  });
}

const [orphans] = await db.execute(`
  SELECT oi.id, oi.pedidoId, oi.descricao, oi.quantidade, oi.totalItem
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE oi.productId IS NULL AND oi.isSofia = 0 AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-31'
  ORDER BY oi.id
`);
console.log(`Órfãos remanescentes: ${orphans.length}`);

const fixes = [];
const semMatch = [];
for (const o of orphans) {
  const desc = String(o.descricao || '');
  const precoUnit = o.quantidade > 0 ? Number(o.totalItem) / o.quantidade : 0;
  let found = null;
  for (const rule of DESC_MAP) {
    if (rule.match.test(desc)) {
      if (rule.minPrice && precoUnit < rule.minPrice) continue;
      found = rule.cod;
      break;
    }
  }
  if (!found) { semMatch.push({ ...o, _precoUnit: precoUnit }); continue; }
  const prod = prodByCod.get(found);
  if (!prod) { semMatch.push({ ...o, _attemptedCod: found }); continue; }
  fixes.push({ id: o.id, pedidoId: o.pedidoId, cod: found, productId: prod.id,
               ptAtacado: prod.ptAtacado, ptVarejo: prod.ptVarejo });
}

console.log(`\n── Fixes: ${fixes.length} | Sem match: ${semMatch.length}`);
const byCod = {};
for (const f of fixes) byCod[f.cod] = (byCod[f.cod] || 0) + 1;
console.log('\nDistribuição:');
Object.entries(byCod).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k.padEnd(35)} ${v}x`));

if (semMatch.length > 0) {
  console.log('\nÓrfãos ainda sem match:');
  for (const o of semMatch.slice(0, 10)) {
    console.log(`  ${o.pedidoId} qtd=${o.quantidade} R$${o._precoUnit?.toFixed(2)} "${String(o.descricao).slice(0,55)}"`);
  }
}

if (!apply) { console.log('\n(dry-run)'); await db.end(); process.exit(0); }

console.log('\n── Aplicando ──');
for (const f of fixes) {
  await db.execute(`UPDATE pdv_order_items SET productId = ?, ptAtacado = ?, ptVarejo = ? WHERE id = ?`,
    [f.productId, f.ptAtacado, f.ptVarejo, f.id]);
}
console.log(`✓ ${fixes.length} itens atualizados`);

const [perSel] = await db.execute(`
  SELECT o.sellerName, COUNT(DISTINCT o.pedidoId) as pedidos, SUM(oi.quantidade) as pecas,
    COALESCE(SUM(oi.totalItem), 0) as fat,
    COALESCE(SUM(CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                      ELSE oi.ptVarejo * oi.quantidade END), 0) as pontuacao
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'
  GROUP BY o.sellerName ORDER BY pontuacao DESC
`);
console.log('\n── Pontuação FINAL ──');
console.table(perSel);

await db.end();
