/**
 * Sincroniza PT com o Manus: grava pdv_sellers.pontosOffset = (Manus − soma PT no período).
 *
 * IMPORTANTE: a soma de PT aqui é a MESMA regra do dashboard / syncPontosManusOffsets:
 * - itens com (COALESCE(oi.isSofia, 0) = 0)
 * - sem filtrar o.isSofia no pedido
 * - filtro de dia do pedido = mesmo PDV_DASHBOARD_ORDER_DAY_MODE do Railway (vazio = CONVERT_TZ -03)
 *
 * Uso (na raiz do repo, com DATABASE_URL e opcionalmente PDV_DASHBOARD_ORDER_DAY_MODE):
 *   node scripts/sync-pontos-manus.mjs [startDate] [endDate]
 *
 * O período deve ser o MESMO do relatório Manus do print (um único YYYY-MM).
 * Se o print é “até ontem” e hoje já houve venda, use endDate = ontem para o baseline bater;
 * depois, no dashboard com o mês inteiro, o PT = baseline + vendas novas.
 *
 * Exemplo:
 *   node scripts/sync-pontos-manus.mjs 2026-05-01 2026-05-31
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL");
  process.exit(1);
}

/** Mesma lógica que server/routers/pdvDashboard.ts — orderDayDateExpr */
function orderDayDateExpr(alias) {
  const mode = (process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "").trim().toLowerCase();
  const c = `${alias}.createdAt`;
  if (mode === "server_date") return `DATE(${c})`;
  if (mode === "add3h") return `DATE(DATE_ADD(${c}, INTERVAL 3 HOUR))`;
  return `DATE(CONVERT_TZ(${c}, '+00:00', '-03:00'))`;
}

/**
 * Valores do painel Manus (print de referência).
 * Atualize esta lista quando o Manus mudar; rode o script com o MESMO intervalo de datas do filtro do dashboard.
 */
const TARGETS = [
  { sellerName: "GABRIEL", pontuacaoManus: 17820 },
  { sellerName: "MURILO", pontuacaoManus: 8184 },
  { sellerName: "FLAVIO", pontuacaoManus: 8727 },
  { sellerName: "VINICIUS", pontuacaoManus: 5310 },
  { sellerName: "VANESSA", pontuacaoManus: 390 },
  { sellerName: "TESTE", pontuacaoManus: 0 },
];

const startDate = process.argv[2] || "2026-05-01";
const endDate = process.argv[3] || new Date().toISOString().slice(0, 10);

if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
  console.error("startDate e endDate precisam estar no mesmo mês (YYYY-MM).");
  process.exit(1);
}
const ym = startDate.slice(0, 7);

const dayCmp = orderDayDateExpr("o");
const dateFilter = ` AND ${dayCmp} >= ? AND ${dayCmp} <= ?`;
const dateParams = [startDate, endDate];

const modeLabel = process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "(vazio=convert_tz -03)";
console.log(`PDV_DASHBOARD_ORDER_DAY_MODE=${modeLabel}`);
console.log(`Período: ${startDate} .. ${endDate} (mês ${ym})`);

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
    JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND (COALESCE(oi.isSofia, 0) = 0)
    WHERE o.sellerId = ? AND o.status != 'CANCELADO' ${dateFilter}`,
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
console.log("Concluído. Colunas pontosOffset / pontosOffsetMes exigem migration 0017 se ainda não aplicada.");
