// Mostra códigos exatos dos itens órfãos para entender o padrão
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// Pegar exemplos com pedidoId p/ buscar cod original na planilha
const [rows] = await db.execute(`
  SELECT oi.pedidoId, oi.descricao, oi.tamanho, oi.linha, oi.modelo, oi.time, oi.tipo,
    oi.quantidade, oi.totalItem, o.sellerName,
    DATE_FORMAT(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'), '%d/%m %H:%i') dt
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'
    AND oi.productId IS NULL AND oi.isSofia = 0
  ORDER BY o.createdAt DESC
  LIMIT 30
`);

console.log('═══ 30 itens órfãos mais recentes (banco) ═══\n');
for (const r of rows) {
  console.log(`${r.pedidoId} ${r.dt}  ${(r.sellerName || '').padEnd(10)}  qtd=${String(r.quantidade).padStart(3)} R$${String(Number(r.totalItem).toFixed(2)).padStart(8)}`);
  console.log(`   linha=${r.linha} modelo=${r.modelo} time=${r.time} tipo=${r.tipo} tam=${r.tamanho}`);
  console.log(`   "${r.descricao}"\n`);
}

await db.end();

// Agora vamos buscar 1 desses pedidos NA PLANILHA pedidos_itens para ver o COD original
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const primeiroPedido = rows[0]?.pedidoId;
if (primeiroPedido) {
  console.log(`\n═══ Buscando ${primeiroPedido} na aba pedidos_itens ═══\n`);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/pedidos_itens!A2:Q15000?key=${API_KEY}`);
  const j = await r.json();
  const linhasDesse = (j.values || []).filter(row => (row[0] || '').trim() === primeiroPedido);
  for (const r of linhasDesse) {
    console.log(`  COD: ${r[1]}  PRODUTO: ${r[2]}  QTD: ${r[3]}`);
  }
}
