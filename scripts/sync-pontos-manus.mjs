/**
 * Sincroniza PT com o Manus: grava pdv_sellers.pontosOffset = (Manus − soma PT no período).
 *
 * Mesma regra do dashboard / syncPontosManusOffsets:
 * - itens (COALESCE(oi.isSofia, 0) = 0)
 * - sem filtrar o.isSofia
 * - dia do pedido = PDV_DASHBOARD_ORDER_DAY_MODE (Railway)
 *
 * ## Manus “até ontem” + Railway “hoje”
 * O print do Manus em geral **não inclui o dia atual**. O offset deve ser calibrado com
 * **endDate = último dia que entrou no Manus (normalmente ontem em America/Sao_Paulo)**.
 * No dashboard, use filtro com **data fim = hoje**: a soma no banco inclui as vendas de hoje
 * no Railway e o total fica Manus(ontem) + PT de hoje.
 *
 * Uso:
 *   node --import dotenv/config scripts/sync-pontos-manus.mjs [startDate] [endDate]
 *
 * Sem argumentos: start = dia 1 do mês de **ontem** (SP), end = **ontem** (SP).
 *
 * Exemplo explícito (Manus fechou em 11/05, hoje é 12/05):
 *   node --import dotenv/config scripts/sync-pontos-manus.mjs 2026-05-01 2026-05-11
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL");
  process.exit(1);
}

/** Hoje (YYYY-MM-DD) em America/Sao_Paulo */
function todayYmdSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Ontem (YYYY-MM-DD) em America/Sao_Paulo (Brasil sem horário de verão: -03 fixo na âncora) */
function yesterdayYmdSaoPaulo() {
  const today = todayYmdSaoPaulo();
  const ms = new Date(`${today}T12:00:00-03:00`).getTime() - 86400000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
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
 * PT do Manus no print (fechamento até ontem / último dia do relatório).
 * Atualize quando tiver novo export do Manus.
 */
const TARGETS = [
  { sellerName: "GABRIEL", pontuacaoManus: 14121 },
  { sellerName: "MURILO", pontuacaoManus: 6845 },
  { sellerName: "FLAVIO", pontuacaoManus: 6493 },
  { sellerName: "VINICIUS", pontuacaoManus: 3975 },
  { sellerName: "VANESSA", pontuacaoManus: 390 },
  { sellerName: "TESTE", pontuacaoManus: 0 },
];

const defaultEnd = process.env.SYNC_MANUS_END_DATE || yesterdayYmdSaoPaulo();
const defaultStart = defaultEnd.slice(0, 7) + "-01";

const startDate = process.argv[2] || defaultStart;
const endDate = process.argv[3] || defaultEnd;

if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
  console.error("startDate e endDate precisam estar no mesmo mês (YYYY-MM).");
  process.exit(1);
}
const ym = startDate.slice(0, 7);

const todaySp = todayYmdSaoPaulo();
if (endDate >= todaySp) {
  console.warn(
    `Aviso: endDate (${endDate}) é hoje ou futuro em America/Sao_Paulo (${todaySp}). ` +
      `O Manus costuma fechar até ontem; o ideal é endDate = ontem para depois somar o dia de hoje só pelo banco (Railway).`
  );
}

const dayCmp = orderDayDateExpr("o");
const dateFilter = ` AND ${dayCmp} >= ? AND ${dayCmp} <= ?`;
const dateParams = [startDate, endDate];

const modeLabel = process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "(vazio=convert_tz -03)";
console.log(`PDV_DASHBOARD_ORDER_DAY_MODE=${modeLabel}`);
console.log(`Hoje (SP)=${todaySp} | Período sync: ${startDate} .. ${endDate} (mês ${ym})`);
console.log(`Dica dashboard: mesmo mês com data fim = hoje (${todaySp}) para incluir vendas do Railway.`);

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
console.log("Concluído. Migration 0017 necessária se pontosOffset / pontosOffsetMes não existirem.");
