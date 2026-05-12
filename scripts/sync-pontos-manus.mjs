/**
 * Sincroniza PT com o Manus: grava pdv_sellers.pontosOffset = (Manus − soma PT no período).
 * Uso (na raiz do repo, com DATABASE_URL):
 *   node scripts/sync-pontos-manus.mjs [startDate] [endDate]
 *
 * O período DEVE ser o mesmo do relatório Manus e ficar dentro de um único mês (YYYY-MM).
 * Exemplo (maio/2026 até dia 11):
 *   node scripts/sync-pontos-manus.mjs 2026-05-01 2026-05-11
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL");
  process.exit(1);
}

/** Valores do painel Manus (captura informada pelo usuário). Ajuste os nomes se no banco forem diferentes. */
const TARGETS = [
  { sellerName: "GABRIEL", pontuacaoManus: 14121 },
  { sellerName: "MURILO", pontuacaoManus: 6845 },
  { sellerName: "FLAVIO", pontuacaoManus: 6493 },
  { sellerName: "VINICIUS", pontuacaoManus: 3975 },
  { sellerName: "VANESSA", pontuacaoManus: 390 },
];

const startDate = process.argv[2] || "2026-05-01";
const endDate = process.argv[3] || new Date().toISOString().slice(0, 10);

if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
  console.error("startDate e endDate precisam estar no mesmo mês (YYYY-MM).");
  process.exit(1);
}
const ym = startDate.slice(0, 7);

const dateFilter =
  " AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= ?" +
  " AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= ?";
const dateParams = [startDate, endDate];

const db = await mysql.createConnection(url);

for (const t of TARGETS) {
  const [sellerRows] = await db.execute(
    `SELECT id, name FROM pdv_sellers WHERE isActive = 1 AND UPPER(TRIM(name)) = ?`,
    [t.sellerName.toUpperCase().trim()]
  );
  if (!sellerRows.length) {
    console.error(`Vendedor não encontrado: ${t.sellerName}`);
    process.exitCode = 1;
    continue;
  }
  const sellerId = sellerRows[0].id;
  const [sumRows] = await db.execute(
    `SELECT COALESCE(SUM(
      CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
           ELSE oi.ptVarejo * oi.quantidade END
    ), 0) as pontuacao
    FROM pdv_orders o
    JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
    WHERE o.sellerId = ? AND o.status != 'CANCELADO' AND o.isSofia = 0 ${dateFilter}`,
    [sellerId, ...dateParams]
  );
  const pontosSistema = parseFloat(String(sumRows[0]?.pontuacao ?? "0"));
  const offset = Math.round((t.pontuacaoManus - pontosSistema) * 100) / 100;
  await db.execute(`UPDATE pdv_sellers SET pontosOffset = ?, pontosOffsetMes = ? WHERE id = ?`, [
    offset,
    ym,
    sellerId,
  ]);
  console.log(
    `${sellerRows[0].name}: sistema=${pontosSistema} Manus=${t.pontuacaoManus} → offset=${offset} (mês ${ym})`
  );
}

await db.end();
console.log("Concluído. Rode a migration SQL se ainda não criou pontosOffset / pontosOffsetMes.");
