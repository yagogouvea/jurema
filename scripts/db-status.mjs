/**
 * Lê o banco MySQL do Railway (Public URL) e mostra contagens das principais tabelas PDV.
 * Não altera dados.
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL || process.argv[2];
if (!url) {
  console.error("uso: DATABASE_URL=... node scripts/db-status.mjs (ou passe a URL como 1º argumento)");
  process.exit(1);
}

const db = await mysql.createConnection(url);

async function count(sql) {
  const [rows] = await db.execute(sql);
  return Number(rows[0]?.n ?? 0);
}

const totalProdutos = await count("SELECT COUNT(*) AS n FROM pdv_products");
const ativos = await count("SELECT COUNT(*) AS n FROM pdv_products WHERE isActive = 1");
const totalPedidos = await count("SELECT COUNT(*) AS n FROM pdv_orders");
const totalItens = await count("SELECT COUNT(*) AS n FROM pdv_order_items");
const totalPagamentos = await count("SELECT COUNT(*) AS n FROM pdv_order_payments");
const totalServicos = await count("SELECT COUNT(*) AS n FROM pdv_order_services");

const [datas] = await db.execute(
  "SELECT MIN(createdAt) AS minC, MAX(createdAt) AS maxC, MIN(updatedAt) AS minU, MAX(updatedAt) AS maxU FROM pdv_orders"
);
const d = datas[0] ?? {};

const [recentes] = await db.execute(
  "SELECT DATE(updatedAt) AS dia, COUNT(*) AS n FROM pdv_orders GROUP BY DATE(updatedAt) ORDER BY dia DESC LIMIT 7"
);

const [topClientes] = await db.execute(
  "SELECT COALESCE(NULLIF(clienteNome, ''), '(sem nome)') AS cliente, COUNT(*) AS n FROM pdv_orders GROUP BY cliente ORDER BY n DESC LIMIT 5"
);

console.log("\n=== pdv_products ===");
console.log("  total:", totalProdutos, "| ativos:", ativos);

console.log("\n=== pdv_orders ===");
console.log("  pedidos:", totalPedidos);
console.log("  itens:", totalItens);
console.log("  pagamentos:", totalPagamentos);
console.log("  serviços:", totalServicos);
console.log("  createdAt min:", d.minC, "max:", d.maxC);
console.log("  updatedAt min:", d.minU, "max:", d.maxU);

console.log("\n=== pedidos por dia (updatedAt, últimos 7) ===");
for (const r of recentes) console.log("  ", String(r.dia), "→", r.n);

console.log("\n=== top clientes ===");
for (const r of topClientes) console.log("  ", r.cliente, "→", r.n);

await db.end();
