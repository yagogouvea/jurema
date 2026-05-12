/**
 * Conserta os 2 pedidos Sofia residuais que sobraram após o fix automático
 * (PED-99559250 e PED-15523188), com base nos valores reais do Manus
 * confirmados pelo cliente em 12/05/2026.
 *
 * Mudanças:
 *   PED-99559250 (VINICIUS, 100% Sofia):
 *     - id=1404 TA-TO-SOF-TIME-X       totalItem 863,68 → 840,00
 *     - id=1405 CA-JG-SOF-VARI-TIME-X  totalItem 1.871,32 → 1.820,00
 *
 *   PED-15523188 (FLAVIO, Misto):
 *     - id=953 CA-TO-SOF-VARI-NOV-X    precoUnitario 90 → 110, totalItem 602,11 → 550,00
 *     - id=954 SOFIA                   precoUnitario 80 → 100, totalItem 437,89 → 400,00
 *
 * NÃO mexe em: totalAplicado, totalPago, totalPendente, status, payments, services,
 * comissões, pontos.
 *
 * Backup é gravado em pdv_order_items_sofia_backup_2026_05_12_residuais.
 *
 * Uso:
 *   node scripts/fix-pdv-sofia-2-residuais.mjs            (DRY-RUN)
 *   node scripts/fix-pdv-sofia-2-residuais.mjs --apply    (aplica)
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL.");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const updates = [
  { id: 1404, pedidoId: "PED-99559250", precoUnitario: null, totalItem: 840.0 },
  { id: 1405, pedidoId: "PED-99559250", precoUnitario: null, totalItem: 1820.0 },
  { id: 953, pedidoId: "PED-15523188", precoUnitario: 110.0, totalItem: 550.0 },
  { id: 954, pedidoId: "PED-15523188", precoUnitario: 100.0, totalItem: 400.0 },
];

const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000, timezone: "Z" });
await conn.query("SET time_zone = '+00:00'");

console.log(`\n=== FIX 2 RESIDUAIS ===  modo: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

const ids = updates.map((u) => u.id);
const ph = ids.map(() => "?").join(",");
const [before] = await conn.execute(
  `SELECT id, pedidoId, descricao, quantidade, precoUnitario, totalItem
     FROM pdv_order_items WHERE id IN (${ph}) ORDER BY id`,
  ids
);
console.log("ANTES:");
for (const i of before) {
  console.log(
    `  id=${i.id}  ${i.pedidoId}  ${(i.descricao || "").padEnd(30)} qtd=${i.quantidade} unit=${fmtBRL(i.precoUnitario)} total=${fmtBRL(i.totalItem)}`
  );
}

console.log("\nMUDANÇAS:");
for (const u of updates) {
  const cur = before.find((b) => b.id === u.id);
  const novoUnit = u.precoUnitario != null ? u.precoUnitario : Number(cur.precoUnitario);
  console.log(
    `  id=${u.id}  ${u.pedidoId}` +
      `  unit ${fmtBRL(cur.precoUnitario)} → ${fmtBRL(novoUnit)}` +
      `  total ${fmtBRL(cur.totalItem)} → ${fmtBRL(u.totalItem)}`
  );
}

if (!APPLY) {
  console.log("\nDRY-RUN. Para aplicar: --apply");
  await conn.end();
  process.exit(0);
}

const backupTable = "pdv_order_items_sofia_backup_2026_05_12_residuais";
console.log(`\n>>> Criando backup em ${backupTable}...`);
await conn.query(`DROP TABLE IF EXISTS ${backupTable}`);
await conn.query(
  `CREATE TABLE ${backupTable} (
    id INT PRIMARY KEY,
    pedidoId VARCHAR(50),
    descricao VARCHAR(255),
    quantidade INT,
    precoUnitario_antigo DECIMAL(10,2),
    precoUnitario_novo  DECIMAL(10,2),
    totalItem_antigo    DECIMAL(10,2),
    totalItem_novo      DECIMAL(10,2),
    backed_up_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
);
const rows = updates.map((u) => {
  const cur = before.find((b) => b.id === u.id);
  const novoUnit = u.precoUnitario != null ? u.precoUnitario : Number(cur.precoUnitario);
  return [u.id, u.pedidoId, cur.descricao, cur.quantidade, cur.precoUnitario, novoUnit, cur.totalItem, u.totalItem];
});
await conn.query(
  `INSERT INTO ${backupTable}
     (id, pedidoId, descricao, quantidade, precoUnitario_antigo, precoUnitario_novo, totalItem_antigo, totalItem_novo)
   VALUES ?`,
  [rows]
);
console.log(`    ${rows.length} linhas salvas.`);

console.log(">>> START TRANSACTION + UPDATEs...");
await conn.beginTransaction();
try {
  for (const u of updates) {
    if (u.precoUnitario != null) {
      const [r] = await conn.execute(
        `UPDATE pdv_order_items SET precoUnitario = ?, totalItem = ? WHERE id = ?`,
        [u.precoUnitario, u.totalItem, u.id]
      );
      console.log(`    id=${u.id}: affected=${r.affectedRows} (unit+total)`);
    } else {
      const [r] = await conn.execute(
        `UPDATE pdv_order_items SET totalItem = ? WHERE id = ?`,
        [u.totalItem, u.id]
      );
      console.log(`    id=${u.id}: affected=${r.affectedRows} (total)`);
    }
  }
  await conn.commit();
  console.log("    COMMIT OK.\n");
} catch (e) {
  await conn.rollback();
  console.error("    ROLLBACK:", e.message);
  await conn.end();
  process.exit(1);
}

const [after] = await conn.execute(
  `SELECT id, pedidoId, descricao, quantidade, precoUnitario, totalItem
     FROM pdv_order_items WHERE id IN (${ph}) ORDER BY id`,
  ids
);
console.log("DEPOIS:");
for (const i of after) {
  console.log(
    `  id=${i.id}  ${i.pedidoId}  ${(i.descricao || "").padEnd(30)} qtd=${i.quantidade} unit=${fmtBRL(i.precoUnitario)} total=${fmtBRL(i.totalItem)}`
  );
}

const [check] = await conn.execute(
  `SELECT
     COALESCE(SUM(oi.totalItem), 0) AS faturamento,
     COALESCE(SUM(oi.quantidade), 0) AS pecas
   FROM pdv_order_items oi
   JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
   WHERE oi.isSofia = 1 AND o.status != 'CANCELADO'
     AND DATE(COALESCE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'), DATE_ADD(o.createdAt, INTERVAL 3 HOUR)))
         BETWEEN '2026-05-01' AND '2026-05-12'`
);
console.log(
  `\nFaturamento Sofia 01/05–12/05 agora: ${fmtBRL(check[0].faturamento)} (peças=${check[0].pecas})`
);
console.log("Reverter:");
console.log(`  UPDATE pdv_order_items oi`);
console.log(`     JOIN ${backupTable} b ON b.id = oi.id`);
console.log(`     SET oi.precoUnitario = b.precoUnitario_antigo, oi.totalItem = b.totalItem_antigo;`);

await conn.end();
