/**
 * Compara PT do dashboard (mesma SQL do summary) com valores Manus de referência.
 * Uso: node --import dotenv/config scripts/debug-pdv-summary-pt.mjs [start] [end]
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL (ex.: node --import dotenv/config scripts/debug-pdv-summary-pt.mjs)");
  process.exit(1);
}

function orderDayDateExpr(alias) {
  const mode = (process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "").trim().toLowerCase();
  const c = `${alias}.createdAt`;
  if (mode === "server_date") return `DATE(${c})`;
  if (mode === "add3h") return `DATE(DATE_ADD(${c}, INTERVAL 3 HOUR))`;
  return `DATE(CONVERT_TZ(${c}, '+00:00', '-03:00'))`;
}

const startDate = process.argv[2] || "2026-05-01";
const endDate = process.argv[3] || "2026-05-31";
const dayCmp = orderDayDateExpr("o");
const dateFilter = ` AND ${dayCmp} >= ? AND ${dayCmp} <= ?`;
const params = [startDate, endDate];
const offsetYm =
  startDate.slice(0, 7) === endDate.slice(0, 7) ? startDate.slice(0, 7) : null;

const MANUS_REF = {
  GABRIEL: 17820,
  MURILO: 8184,
  FLAVIO: 8727,
  VINICIUS: 5310,
  VANESSA: 390,
  TESTE: 0,
};

const db = await mysql.createConnection(url);

const [sellers] = await db.execute(
  `SELECT id, name, pontosOffset, pontosOffsetMes FROM pdv_sellers WHERE isActive = 1 ORDER BY name`
);

console.log(
  `PDV_DASHBOARD_ORDER_DAY_MODE=${process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "(vazio)"} | período ${startDate}..${endDate} | offsetYm aplicável na query=${offsetYm}`
);

for (const s of sellers) {
  const name = String(s.name || "").trim();
  const key = name.toUpperCase();
  const [sumRows] = await db.execute(
    `SELECT COALESCE(SUM(
      CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
           ELSE oi.ptVarejo * oi.quantidade END
    ), 0) as pontuacao
    FROM pdv_orders o
    INNER JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND (COALESCE(oi.isSofia, 0) = 0)
    WHERE o.sellerId = ? AND o.status != 'CANCELADO' ${dateFilter}`,
    [s.id, ...params]
  );
  const rawPt = parseFloat(String(sumRows[0]?.pontuacao ?? "0"));
  const offset = parseFloat(String(s.pontosOffset ?? "0"));
  const mes = s.pontosOffsetMes ? String(s.pontosOffsetMes) : "";
  const offsetAplica = offsetYm && mes === offsetYm;
  const displayPt = rawPt + (offsetAplica ? offset : 0);
  const manus = MANUS_REF[key];
  const diff = manus !== undefined ? displayPt - manus : null;

  console.log(
    `${name}: rawPT=${rawPt.toFixed(2)} offset=${offset} mesDB=${mes || "null"} offsetUsado=${offsetAplica} → display=${displayPt.toFixed(2)}` +
      (manus !== undefined ? ` | Manus(ref)=${manus} Δ=${diff?.toFixed(2)}` : "")
  );
}

await db.end();
