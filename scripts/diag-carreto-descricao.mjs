/**
 * Diagnóstico: descrição em branco em serviços CARRETO no relatório de maio.
 *
 * Use:
 *   npm run diag:carreto
 *
 * Vai imprimir, para o mês corrente (ou mês passado via env REPORT_MONTH=YYYY-MM):
 *  - total de serviços CARRETO no mês
 *  - quantos com descrição não vazia
 *  - quantos com descrição vazia/null
 *  - tabela dia-a-dia (data, total, com_desc, sem_desc)
 *  - últimos 12 lançamentos sem descrição (id, pedido, vendedor, valor)
 *  - últimos 12 lançamentos com descrição (pra comparar formato/origem)
 */

import mysql from "mysql2/promise";
import "dotenv/config";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("[diag-carreto] DATABASE_URL ausente. Crie .env ou rode no Railway.");
  process.exit(1);
}

const monthArg = (process.env.REPORT_MONTH || "").trim();
const today = new Date();
let year = today.getUTCFullYear();
let month = today.getUTCMonth() + 1;
if (/^\d{4}-\d{2}$/.test(monthArg)) {
  const [y, m] = monthArg.split("-").map(Number);
  year = y;
  month = m;
}
const mm = String(month).padStart(2, "0");
const startDate = `${year}-${mm}-01`;
const lastDay = new Date(year, month, 0).getDate();
const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

console.log(`\n[diag-carreto] Período: ${startDate} a ${endDate}  (timezone do query: America/Sao_Paulo via CONVERT_TZ)\n`);

const conn = await mysql.createConnection({ uri: url, timezone: "Z", dateStrings: false });
try { await conn.query("SET time_zone = '+00:00'"); } catch { /* ignore */ }

const dayExpr = "DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'))";

const [[totals]] = await conn.execute(
  `SELECT
     COUNT(*)                                                     AS total,
     SUM(CASE WHEN s.descricao IS NULL OR TRIM(s.descricao) = '' THEN 1 ELSE 0 END) AS sem_desc,
     SUM(CASE WHEN s.descricao IS NOT NULL AND TRIM(s.descricao) <> '' THEN 1 ELSE 0 END) AS com_desc
   FROM pdv_order_services s
   JOIN pdv_orders o ON o.pedidoId = s.pedidoId
   WHERE s.tipo = 'CARRETO'
     AND ${dayExpr} BETWEEN ? AND ?`,
  [startDate, endDate]
);

console.log("=== TOTAIS DO MÊS ===");
console.table([totals]);

const [perDay] = await conn.execute(
  `SELECT
     ${dayExpr}                                                    AS dia,
     COUNT(*)                                                      AS total,
     SUM(CASE WHEN s.descricao IS NULL OR TRIM(s.descricao) = '' THEN 1 ELSE 0 END) AS sem_desc,
     SUM(CASE WHEN s.descricao IS NOT NULL AND TRIM(s.descricao) <> '' THEN 1 ELSE 0 END) AS com_desc
   FROM pdv_order_services s
   JOIN pdv_orders o ON o.pedidoId = s.pedidoId
   WHERE s.tipo = 'CARRETO'
     AND ${dayExpr} BETWEEN ? AND ?
   GROUP BY dia
   ORDER BY dia ASC`,
  [startDate, endDate]
);

console.log("\n=== POR DIA ===");
console.table(perDay);

const [recentEmpty] = await conn.execute(
  `SELECT
     s.id                                                       AS svc_id,
     s.pedidoId                                                 AS pedido,
     o.sellerName                                               AS vendedor,
     ${dayExpr}                                                 AS dia,
     o.canal                                                    AS canal,
     CAST(s.descricao AS CHAR(64))                              AS descricao_raw,
     LENGTH(s.descricao)                                        AS descricao_bytes,
     s.valor                                                    AS valor,
     s.createdAt                                                AS criado_em
   FROM pdv_order_services s
   JOIN pdv_orders o ON o.pedidoId = s.pedidoId
   WHERE s.tipo = 'CARRETO'
     AND ${dayExpr} BETWEEN ? AND ?
     AND (s.descricao IS NULL OR TRIM(s.descricao) = '')
   ORDER BY s.id DESC
   LIMIT 12`,
  [startDate, endDate]
);
console.log("\n=== ÚLTIMOS 12 CARRETOS SEM DESCRIÇÃO ===");
console.table(recentEmpty);

const [recentFilled] = await conn.execute(
  `SELECT
     s.id                                                       AS svc_id,
     s.pedidoId                                                 AS pedido,
     o.sellerName                                               AS vendedor,
     ${dayExpr}                                                 AS dia,
     LEFT(s.descricao, 60)                                      AS descricao,
     s.valor                                                    AS valor,
     s.createdAt                                                AS criado_em
   FROM pdv_order_services s
   JOIN pdv_orders o ON o.pedidoId = s.pedidoId
   WHERE s.tipo = 'CARRETO'
     AND ${dayExpr} BETWEEN ? AND ?
     AND s.descricao IS NOT NULL
     AND TRIM(s.descricao) <> ''
   ORDER BY s.id DESC
   LIMIT 12`,
  [startDate, endDate]
);
console.log("\n=== ÚLTIMOS 12 CARRETOS COM DESCRIÇÃO ===");
console.table(recentFilled);

const [perSeller] = await conn.execute(
  `SELECT
     o.sellerName                                                  AS vendedor,
     COUNT(*)                                                       AS total,
     SUM(CASE WHEN s.descricao IS NULL OR TRIM(s.descricao) = '' THEN 1 ELSE 0 END) AS sem_desc,
     SUM(CASE WHEN s.descricao IS NOT NULL AND TRIM(s.descricao) <> '' THEN 1 ELSE 0 END) AS com_desc
   FROM pdv_order_services s
   JOIN pdv_orders o ON o.pedidoId = s.pedidoId
   WHERE s.tipo = 'CARRETO'
     AND ${dayExpr} BETWEEN ? AND ?
   GROUP BY o.sellerName
   ORDER BY sem_desc DESC, total DESC`,
  [startDate, endDate]
);
console.log("\n=== POR VENDEDOR ===");
console.table(perSeller);

await conn.end();
console.log("\n[diag-carreto] OK\n");
