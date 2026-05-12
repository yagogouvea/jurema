/**
 * Diagnóstico: por que o PT do dashboard não sobe quando há venda hoje?
 * Para cada vendedor mostra:
 *   - PT acumulado no mês até ONTEM (deve bater com Manus + offset existente)
 *   - PT registrado HOJE (somando ptVarejo/ptAtacado * quantidade dos itens não-Sofia)
 *   - Lista de pedidos de HOJE (sellerId, pedidoId, createdAt UTC, dia em SP, status)
 *   - Itens HOJE com (productId, ptVarejo, ptAtacado, quantidade, regime, isSofia, ptCalculado)
 *
 * Uso (PowerShell, na raiz do projeto):
 *   node --import dotenv/config scripts/debug-pdv-pt-hoje.mjs
 *   node --import dotenv/config scripts/debug-pdv-pt-hoje.mjs 2026-05-01 2026-05-12
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL.");
  process.exit(1);
}

function ymdSp(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function yesterdaySp() {
  const today = ymdSp();
  const ms = new Date(`${today}T12:00:00-03:00`).getTime() - 86400000;
  return ymdSp(new Date(ms));
}
function firstOfMonthSp(ymd = ymdSp()) {
  return `${ymd.slice(0, 7)}-01`;
}

const today = ymdSp();
const yesterday = yesterdaySp();
const startMonth = firstOfMonthSp(today);

const startDate = process.argv[2] || startMonth;
const endDate = process.argv[3] || today;

/** Mesma expressão do servidor (com COALESCE para CONVERT_TZ NULL). */
function spDateExpr(col) {
  const mode = (process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "").trim().toLowerCase();
  if (mode === "server_date") return `DATE(${col})`;
  if (mode === "add3h") return `DATE(DATE_ADD(${col}, INTERVAL 3 HOUR))`;
  return `DATE(COALESCE(CONVERT_TZ(${col}, '+00:00', '-03:00'), DATE_ADD(${col}, INTERVAL 3 HOUR)))`;
}

const db = await mysql.createConnection(url);
await db.query("SET time_zone = '+00:00'");

const [tzRows] = await db.query("SELECT @@session.time_zone as tz, NOW() as now_utc, UTC_TIMESTAMP() as utc_ts");
console.log("[MySQL] sessão:", tzRows[0]);
console.log(`[SP] hoje=${today} | ontem=${yesterday} | filtro=${startDate}..${endDate}`);
console.log(`[ENV] PDV_DASHBOARD_ORDER_DAY_MODE=${process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "(vazio→convert_tz)"}`);

const dayCmp = spDateExpr("o.createdAt");
const dayYmd = `DATE_FORMAT(COALESCE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'), DATE_ADD(o.createdAt, INTERVAL 3 HOUR)), '%Y-%m-%d')`;

const [sellers] = await db.execute(
  `SELECT id, name, pontosOffset, pontosOffsetMes FROM pdv_sellers WHERE isActive = 1 ORDER BY name`
);

console.log("\n========== RESUMO POR VENDEDOR ==========");
console.log("vendedor".padEnd(15), "ptOntem".padStart(10), "ptHoje".padStart(10), "ptPeriodo".padStart(10), "offset".padStart(8), "offsetMes".padStart(10), "→ totalDashboard");

for (const s of sellers) {
  const name = String(s.name || "").trim();
  const offset = parseFloat(String(s.pontosOffset ?? "0")) || 0;
  const mes = s.pontosOffsetMes ? String(s.pontosOffsetMes) : "";
  const offsetYm = startDate.slice(0, 7) === endDate.slice(0, 7) ? startDate.slice(0, 7) : null;
  const offsetUsado = offsetYm && mes === offsetYm;

  const [r1] = await db.execute(
    `SELECT COALESCE(SUM(
       CASE WHEN o.regime='ATACADO' THEN oi.ptAtacado*oi.quantidade
            ELSE oi.ptVarejo*oi.quantidade END
     ), 0) as pt
     FROM pdv_orders o
     INNER JOIN pdv_order_items oi ON oi.pedidoId=o.pedidoId AND COALESCE(oi.isSofia,0)=0
     WHERE o.sellerId=? AND o.status<>'CANCELADO' AND ${dayCmp} >= ? AND ${dayCmp} <= ?`,
    [s.id, startDate, yesterday < startDate ? startDate : yesterday]
  );
  const ptOntem = parseFloat(String(r1[0]?.pt ?? "0")) || 0;

  const [r2] = await db.execute(
    `SELECT COALESCE(SUM(
       CASE WHEN o.regime='ATACADO' THEN oi.ptAtacado*oi.quantidade
            ELSE oi.ptVarejo*oi.quantidade END
     ), 0) as pt
     FROM pdv_orders o
     INNER JOIN pdv_order_items oi ON oi.pedidoId=o.pedidoId AND COALESCE(oi.isSofia,0)=0
     WHERE o.sellerId=? AND o.status<>'CANCELADO' AND ${dayCmp} = ?`,
    [s.id, today]
  );
  const ptHoje = parseFloat(String(r2[0]?.pt ?? "0")) || 0;

  const [r3] = await db.execute(
    `SELECT COALESCE(SUM(
       CASE WHEN o.regime='ATACADO' THEN oi.ptAtacado*oi.quantidade
            ELSE oi.ptVarejo*oi.quantidade END
     ), 0) as pt
     FROM pdv_orders o
     INNER JOIN pdv_order_items oi ON oi.pedidoId=o.pedidoId AND COALESCE(oi.isSofia,0)=0
     WHERE o.sellerId=? AND o.status<>'CANCELADO' AND ${dayCmp} >= ? AND ${dayCmp} <= ?`,
    [s.id, startDate, endDate]
  );
  const ptPeriodo = parseFloat(String(r3[0]?.pt ?? "0")) || 0;

  const total = ptPeriodo + (offsetUsado ? offset : 0);

  console.log(
    name.padEnd(15),
    ptOntem.toFixed(2).padStart(10),
    ptHoje.toFixed(2).padStart(10),
    ptPeriodo.toFixed(2).padStart(10),
    String(offset).padStart(8),
    (mes || "null").padStart(10),
    "→",
    total.toFixed(2),
    offsetUsado ? "(offset somado)" : "(offset NÃO somado)"
  );
}

console.log("\n========== PEDIDOS DE HOJE (SP) ==========");
const [todayOrders] = await db.execute(
  `SELECT o.id, o.pedidoId, o.sellerId, s.name as sellerName, o.regime, o.canal, o.status, o.isSofia,
          o.createdAt as createdUtc, ${dayYmd} as diaSp, o.totalAplicado
   FROM pdv_orders o
   LEFT JOIN pdv_sellers s ON s.id=o.sellerId
   WHERE ${dayCmp} = ?
   ORDER BY o.createdAt`,
  [today]
);
if (todayOrders.length === 0) {
  console.log("Nenhum pedido com dia (SP) =", today);
} else {
  for (const o of todayOrders) {
    console.log(
      `pedido=${o.pedidoId} sellerId=${o.sellerId} (${o.sellerName}) regime=${o.regime} status=${o.status} isSofia=${o.isSofia} createdUtc=${o.createdUtc.toISOString()} diaSp=${o.diaSp} totalR$=${o.totalAplicado}`
    );
    const [items] = await db.execute(
      `SELECT id, productId, modelo, time, tamanho, quantidade, precoUnitario,
              ptAtacado, ptVarejo, isSofia
       FROM pdv_order_items WHERE pedidoId=? ORDER BY id`,
      [o.pedidoId]
    );
    for (const it of items) {
      const ptU = o.regime === "ATACADO" ? parseFloat(String(it.ptAtacado || "0")) : parseFloat(String(it.ptVarejo || "0"));
      const ptL = ptU * it.quantidade;
      const flag = it.isSofia ? "SOFIA(ignora PT)" : "ok";
      console.log(
        `   item#${it.id} productId=${it.productId} ${it.modelo}/${it.time} tam=${it.tamanho} qt=${it.quantidade} ptVarejo=${it.ptVarejo} ptAtacado=${it.ptAtacado} → ptUnit(${o.regime})=${ptU} ptLinha=${ptL.toFixed(2)} [${flag}]`
      );
    }
  }
}

await db.end();
