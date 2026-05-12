/**
 * Conserta a inflação de `totalItem` em itens Sofia que veio da migração Manus → Railway.
 *
 * Bug: a migração somou o valor dos serviços (CAIXINHA/CORREIO/CARRETO) DENTRO do `totalItem`
 * dos itens Sofia, e ainda gravou o serviço em `pdv_order_services` (duplicação). Como o
 * Faturamento Sofia do dashboard é `SUM(oi.totalItem WHERE isSofia=1)`, ficava inflado.
 *
 * Critério CONSERVADOR: só corrige um pedido Sofia se a inflação total dos itens Sofia
 * desse pedido bater (≤ R$0,02 de tolerância) com a soma dos serviços do mesmo pedido.
 * Pedidos com inflação "sem fonte" são apenas listados ao final para revisão manual.
 *
 * Não toca em: precoUnitario, totalAplicado, pdv_order_payments, pdv_order_services,
 * pdv_order_commissions, pdv_seller_points.
 *
 * Cria a tabela `pdv_order_items_sofia_backup_2026_05_12` com snapshot dos itens alterados
 * para permitir reversão (ver instruções ao final do output).
 *
 * Uso:
 *   node scripts/fix-pdv-sofia-totalItem.mjs            (apenas DRY-RUN: lista o que vai mudar)
 *   node scripts/fix-pdv-sofia-totalItem.mjs --apply    (executa o UPDATE em transação)
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL.");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000, timezone: "Z" });
await conn.query("SET time_zone = '+00:00'");

console.log(`\n=== FIX SOFIA totalItem ===  modo: ${APPLY ? "APPLY (executa UPDATE)" : "DRY-RUN"}\n`);

// 1) Para cada pedido Sofia: total inflação dos itens Sofia, total serviços
const [pedidoStats] = await conn.execute(
  `SELECT
     o.pedidoId,
     o.sellerName,
     COALESCE(infl.inflacaoTotal, 0) AS inflacaoTotal,
     COALESCE(svc.servicosTotal, 0)  AS servicosTotal
   FROM pdv_orders o
   JOIN (
     SELECT pedidoId,
            SUM(totalItem - quantidade * precoUnitario) AS inflacaoTotal
       FROM pdv_order_items
      WHERE isSofia = 1
      GROUP BY pedidoId
     HAVING ABS(SUM(totalItem - quantidade * precoUnitario)) > 0.005
   ) infl ON infl.pedidoId = o.pedidoId
   LEFT JOIN (
     SELECT pedidoId, SUM(valor) AS servicosTotal
       FROM pdv_order_services
      GROUP BY pedidoId
   ) svc ON svc.pedidoId = o.pedidoId
   WHERE o.status != 'CANCELADO'
   ORDER BY o.createdAt ASC`
);

const aCorrigir = [];
const aRevisar = [];
for (const r of pedidoStats) {
  const infl = Number(r.inflacaoTotal);
  const svc = Number(r.servicosTotal);
  const diff = +(infl - svc).toFixed(2);
  if (Math.abs(diff) <= 0.02) aCorrigir.push({ ...r, inflacao: infl, servicos: svc });
  else aRevisar.push({ ...r, inflacao: infl, servicos: svc, diff });
}

console.log(`Pedidos com inflação Sofia detectada: ${pedidoStats.length}`);
console.log(`  → casam com serviços (CORRIGIR): ${aCorrigir.length}`);
console.log(`  → não casam (REVISAR manual):    ${aRevisar.length}\n`);

console.log("─── PEDIDOS QUE SERÃO CORRIGIDOS ───");
for (const p of aCorrigir) {
  console.log(
    `  ${p.pedidoId}  ${p.sellerName.padEnd(10)}  inflacao=${fmtBRL(p.inflacao)}  servicos=${fmtBRL(p.servicos)}`
  );
}
const totalReducao = aCorrigir.reduce((a, p) => a + p.inflacao, 0);
console.log(`  TOTAL a deflacionar do Faturamento Sofia: ${fmtBRL(totalReducao)}\n`);

if (aRevisar.length) {
  console.log("─── PEDIDOS A REVISAR (NÃO serão tocados) ───");
  for (const p of aRevisar) {
    console.log(
      `  ${p.pedidoId}  ${p.sellerName.padEnd(10)}  inflacao=${fmtBRL(p.inflacao)}  servicos=${fmtBRL(p.servicos)}  Δ=${fmtBRL(p.diff)}`
    );
  }
  console.log("");
}

if (!aCorrigir.length) {
  console.log("Nada a fazer.");
  await conn.end();
  process.exit(0);
}

// 2) Detalhe dos itens que mudarão (sempre mostra para conferência)
const placeholders = aCorrigir.map(() => "?").join(",");
const ids = aCorrigir.map((p) => p.pedidoId);
const [itens] = await conn.execute(
  `SELECT id, pedidoId, descricao, quantidade, precoUnitario, totalItem
     FROM pdv_order_items
    WHERE isSofia = 1
      AND pedidoId IN (${placeholders})
      AND ABS(totalItem - quantidade * precoUnitario) > 0.005
    ORDER BY pedidoId, id`,
  ids
);

console.log(`─── ${itens.length} itens Sofia serão atualizados ───`);
for (const it of itens) {
  const novo = +(Number(it.quantidade) * Number(it.precoUnitario)).toFixed(2);
  const delta = +(novo - Number(it.totalItem)).toFixed(2);
  console.log(
    `  id=${String(it.id).padStart(5)}  ${it.pedidoId}  ${(it.descricao || "").slice(0, 28).padEnd(28)} ` +
      `qtd=${String(it.quantidade).padStart(3)} unit=${fmtBRL(it.precoUnitario).padStart(12)}` +
      `   totalItem: ${fmtBRL(it.totalItem).padStart(12)} → ${fmtBRL(novo).padStart(12)}  Δ=${fmtBRL(delta).padStart(10)}`
  );
}
console.log("");

if (!APPLY) {
  console.log("DRY-RUN concluído. Para executar de verdade rode:");
  console.log("  node scripts/fix-pdv-sofia-totalItem.mjs --apply\n");
  await conn.end();
  process.exit(0);
}

// 3) APPLY: backup + UPDATE em transação
const backupTable = "pdv_order_items_sofia_backup_2026_05_12";
console.log(`>>> Criando backup em ${backupTable} ...`);
await conn.query(`DROP TABLE IF EXISTS ${backupTable}`);
await conn.query(
  `CREATE TABLE ${backupTable} (
    id INT PRIMARY KEY,
    pedidoId VARCHAR(50),
    descricao VARCHAR(255),
    quantidade INT,
    precoUnitario DECIMAL(10,2),
    totalItem_antigo DECIMAL(10,2),
    totalItem_novo DECIMAL(10,2),
    backed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
);

const backupRows = itens.map((it) => {
  const novo = +(Number(it.quantidade) * Number(it.precoUnitario)).toFixed(2);
  return [it.id, it.pedidoId, it.descricao, it.quantidade, it.precoUnitario, it.totalItem, novo];
});
await conn.query(
  `INSERT INTO ${backupTable}
     (id, pedidoId, descricao, quantidade, precoUnitario, totalItem_antigo, totalItem_novo)
   VALUES ?`,
  [backupRows]
);
console.log(`    ${backupRows.length} linhas salvas em backup.\n`);

console.log(">>> START TRANSACTION + UPDATE...");
await conn.beginTransaction();
try {
  const [updRes] = await conn.query(
    `UPDATE pdv_order_items
        SET totalItem = ROUND(quantidade * precoUnitario, 2)
      WHERE isSofia = 1
        AND pedidoId IN (${placeholders})
        AND ABS(totalItem - quantidade * precoUnitario) > 0.005`,
    ids
  );
  console.log(`    affectedRows = ${updRes.affectedRows}`);
  await conn.commit();
  console.log("    COMMIT OK.\n");
} catch (e) {
  await conn.rollback();
  console.error("    ROLLBACK por erro:", e.message);
  await conn.end();
  process.exit(1);
}

// 4) Verificação pós-fix
const [check] = await conn.execute(
  `SELECT
     COUNT(DISTINCT o.id) AS pedidos,
     COALESCE(SUM(oi.quantidade), 0) AS pecas,
     COALESCE(SUM(oi.totalItem), 0)  AS faturamento,
     COALESCE(SUM(COALESCE(oi.comissaoLojaSofia,0)*oi.quantidade), 0) AS bonus
   FROM pdv_order_items oi
   JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
   WHERE oi.isSofia = 1 AND o.status != 'CANCELADO'`
);
const c = check[0];
console.log("─── RESUMO SOFIA APÓS O FIX (todo o histórico) ───");
console.log(`  pedidos     = ${c.pedidos}`);
console.log(`  total peças = ${c.pecas}`);
console.log(`  Faturamento = ${fmtBRL(c.faturamento)}`);
console.log(`  Bônus Loja  = ${fmtBRL(c.bonus)}`);
console.log(`  Reembolso   = ${fmtBRL(Number(c.faturamento) - Number(c.bonus))}`);

console.log("\nPara reverter:");
console.log(`  UPDATE pdv_order_items oi`);
console.log(`     JOIN ${backupTable} b ON b.id = oi.id`);
console.log(`     SET oi.totalItem = b.totalItem_antigo;`);

await conn.end();
