/**
 * Apaga as tabelas de pedidos do MySQL do Railway, para reverter o estrago
 * da importação errada de pedidos. NÃO mexe em pdv_products / pdv_sellers /
 * pdv_config / pdv_goals / pdv_cash_flow / pdv_desconto_folha.
 *
 * Uso (à noite, depois de fechar a loja):
 *   $env:DATABASE_URL = "<MYSQL_PUBLIC_URL>"
 *   node scripts/cleanup-orders.mjs --confirm
 *
 * Sem --confirm o script apenas mostra contagens e sai sem alterar nada.
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Faltou DATABASE_URL");
  process.exit(1);
}
const confirm = process.argv.includes("--confirm");

const db = await mysql.createConnection(url);

async function count(sql) {
  const [rows] = await db.execute(sql);
  return Number(rows[0]?.n ?? 0);
}

const antes = {
  pedidos: await count("SELECT COUNT(*) AS n FROM pdv_orders"),
  itens: await count("SELECT COUNT(*) AS n FROM pdv_order_items"),
  pagamentos: await count("SELECT COUNT(*) AS n FROM pdv_order_payments"),
  servicos: await count("SELECT COUNT(*) AS n FROM pdv_order_services"),
};

console.log("\nEstado ANTES:");
console.log(antes);

if (!confirm) {
  console.log("\n--confirm não passado — saindo sem alterar.");
  await db.end();
  process.exit(0);
}

console.log("\nApagando tabelas de pedidos...");
await db.execute("DELETE FROM pdv_order_services");
await db.execute("DELETE FROM pdv_order_payments");
await db.execute("DELETE FROM pdv_order_items");
await db.execute("DELETE FROM pdv_orders");

const depois = {
  pedidos: await count("SELECT COUNT(*) AS n FROM pdv_orders"),
  itens: await count("SELECT COUNT(*) AS n FROM pdv_order_items"),
  pagamentos: await count("SELECT COUNT(*) AS n FROM pdv_order_payments"),
  servicos: await count("SELECT COUNT(*) AS n FROM pdv_order_services"),
};

console.log("\nEstado DEPOIS:");
console.log(depois);

await db.end();
console.log("\nPronto. As tabelas de produtos/vendedores/config NÃO foram tocadas.");
