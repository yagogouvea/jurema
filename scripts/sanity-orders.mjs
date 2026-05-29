/** Sanity check dos pedidos importados: agregados por vendedor, regime, mês, status. */
import mysql from "mysql2/promise";

const db = await mysql.createConnection(process.env.DATABASE_URL);

const fmt = (v) => "R$ " + (Math.round(v * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const [c] = await db.execute("SELECT COUNT(*) AS n, SUM(totalAplicado) AS s FROM pdv_orders WHERE status != 'CANCELADO'");
console.log("=== Total geral (não cancelados) ===");
console.log("  pedidos:", c[0].n, "| receita líquida:", fmt(Number(c[0].s)));

console.log("\n=== Por vendedor ===");
const [v] = await db.execute(
  "SELECT sellerName, COUNT(*) AS qtd, SUM(totalAplicado) AS receita " +
  "FROM pdv_orders WHERE status != 'CANCELADO' GROUP BY sellerName ORDER BY receita DESC"
);
for (const r of v) console.log("  ", r.sellerName.padEnd(15), "→", String(r.qtd).padStart(4), "pedidos | receita", fmt(Number(r.receita)));

console.log("\n=== Por regime ===");
const [reg] = await db.execute(
  "SELECT regime, COUNT(*) AS qtd, SUM(totalAplicado) AS receita FROM pdv_orders WHERE status != 'CANCELADO' GROUP BY regime"
);
for (const r of reg) console.log("  ", r.regime.padEnd(10), "→", String(r.qtd).padStart(4), "pedidos | receita", fmt(Number(r.receita)));

console.log("\n=== Por mês ===");
const [m] = await db.execute(
  "SELECT DATE_FORMAT(createdAt, '%Y-%m') AS mes, COUNT(*) AS qtd, SUM(totalAplicado) AS receita " +
  "FROM pdv_orders WHERE status != 'CANCELADO' GROUP BY mes ORDER BY mes"
);
for (const r of m) console.log("  ", r.mes, "→", String(r.qtd).padStart(4), "pedidos | receita", fmt(Number(r.receita)));

console.log("\n=== Por status ===");
const [st] = await db.execute("SELECT status, COUNT(*) AS qtd FROM pdv_orders GROUP BY status");
for (const r of st) console.log("  ", r.status.padEnd(10), "→", r.qtd);

console.log("\n=== Sofia vs Normal ===");
const [so] = await db.execute(
  "SELECT isSofia, COUNT(*) AS qtd, SUM(totalAplicado) AS receita FROM pdv_orders WHERE status != 'CANCELADO' GROUP BY isSofia"
);
for (const r of so) console.log("  ", r.isSofia ? "Sofia" : "Normal", "→", String(r.qtd).padStart(4), "pedidos | receita", fmt(Number(r.receita)));

console.log("\n=== Pagamentos por forma ===");
const [p] = await db.execute(
  "SELECT formaPagamento, COUNT(*) AS qtd, SUM(valor) AS total FROM pdv_order_payments GROUP BY formaPagamento ORDER BY total DESC"
);
for (const r of p) console.log("  ", r.formaPagamento.padEnd(16), "→", String(r.qtd).padStart(4), "x | total", fmt(Number(r.total)));

console.log("\n=== Serviços extras ===");
const [s] = await db.execute(
  "SELECT tipo, COUNT(*) AS qtd, SUM(valor) AS total FROM pdv_order_services GROUP BY tipo ORDER BY total DESC"
);
for (const r of s) console.log("  ", r.tipo.padEnd(12), "→", String(r.qtd).padStart(4), "x | total", fmt(Number(r.total)));

console.log("\n=== Itens com produto resolvido ===");
const [it] = await db.execute(
  "SELECT (productId IS NOT NULL) AS resolvido, COUNT(*) AS n, SUM(totalItem) AS total FROM pdv_order_items GROUP BY resolvido"
);
for (const r of it) console.log("  ", r.resolvido ? "com FK pdv_products" : "FK null (cod antigo)", "→", String(r.n).padStart(5), "| total", fmt(Number(r.total)));

console.log("\n=== Período coberto ===");
const [d] = await db.execute("SELECT MIN(createdAt) AS minD, MAX(createdAt) AS maxD FROM pdv_orders WHERE status != 'CANCELADO'");
console.log("  de", d[0].minD, "até", d[0].maxD);

console.log("\n=== Sample de 3 pedidos ===");
const [samp] = await db.execute(
  "SELECT pedidoId, sellerName, canal, clienteNome, regime, totalAplicado, status, isSofia, createdAt " +
  "FROM pdv_orders ORDER BY createdAt DESC LIMIT 3"
);
for (const r of samp) {
  console.log("\n  ", r.pedidoId, "—", r.sellerName, "—", r.clienteNome);
  console.log("     ", r.canal, "/", r.regime, "/", r.status, "/", r.isSofia ? "Sofia" : "Normal");
  console.log("      total:", fmt(Number(r.totalAplicado)), "em", r.createdAt);
  const [items] = await db.execute("SELECT descricao, quantidade, totalItem FROM pdv_order_items WHERE pedidoId = ?", [r.pedidoId]);
  for (const it of items) console.log("       •", it.quantidade, "x", (it.descricao || "?").slice(0, 50), "=", fmt(Number(it.totalItem)));
  const [pays] = await db.execute("SELECT formaPagamento, valor, taxa FROM pdv_order_payments WHERE pedidoId = ?", [r.pedidoId]);
  for (const p of pays) console.log("       $", p.formaPagamento, fmt(Number(p.valor)), "(taxa", fmt(Number(p.taxa)) + ")");
}

await db.end();
