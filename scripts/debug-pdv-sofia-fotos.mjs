/**
 * Diagnóstico do upload/armazenamento da foto Sofia.
 *
 * Mostra, para todo pedido com pelo menos 1 item Sofia (não cancelado):
 *   - tem fotoUrl ou não (cobertura por dia/vendedor)
 *   - últimos N pedidos Sofia com URL e data
 *   - HEAD request na URL pra ver se a foto ainda está acessível
 *
 * Uso (PowerShell, raiz do projeto):
 *   node scripts/debug-pdv-sofia-fotos.mjs
 *   node scripts/debug-pdv-sofia-fotos.mjs 2026-05-01 2026-05-12
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Defina DATABASE_URL."); process.exit(1); }

function ymdSp(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function firstOfMonthSp(ymd = ymdSp()) { return `${ymd.slice(0, 7)}-01`; }

const today = ymdSp();
const start = process.argv[2] || firstOfMonthSp(today);
const end = process.argv[3] || today;

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000, timezone: "Z" });
await conn.query("SET time_zone = '+00:00'");

const spDate = (col) =>
  `DATE(COALESCE(CONVERT_TZ(${col}, '+00:00', '-03:00'), DATE_ADD(${col}, INTERVAL 3 HOUR)))`;

// ===== Cobertura geral (todo histórico) =====
const [[geral]] = await conn.query(
  `SELECT
     COUNT(DISTINCT o.id) AS pedidosSofia,
     COUNT(DISTINCT CASE WHEN o.fotoUrl IS NOT NULL AND o.fotoUrl <> '' THEN o.id END) AS comFoto,
     COUNT(DISTINCT CASE WHEN o.fotoUrl IS NULL OR o.fotoUrl = '' THEN o.id END) AS semFoto
   FROM pdv_orders o
   WHERE o.status != 'CANCELADO'
     AND EXISTS (SELECT 1 FROM pdv_order_items oi WHERE oi.pedidoId=o.pedidoId AND oi.isSofia=1)`
);
console.log("\n=== COBERTURA GERAL (todo o histórico) ===");
console.log(`  Pedidos Sofia (não cancelados): ${fmt(geral.pedidosSofia)}`);
console.log(`  Com fotoUrl  : ${fmt(geral.comFoto)}  (${geral.pedidosSofia ? Math.round(100*geral.comFoto/geral.pedidosSofia) : 0}%)`);
console.log(`  Sem fotoUrl  : ${fmt(geral.semFoto)}`);

// ===== Cobertura no período =====
const [[per]] = await conn.query(
  `SELECT
     COUNT(DISTINCT o.id) AS pedidosSofia,
     COUNT(DISTINCT CASE WHEN o.fotoUrl IS NOT NULL AND o.fotoUrl <> '' THEN o.id END) AS comFoto
   FROM pdv_orders o
   WHERE o.status != 'CANCELADO'
     AND ${spDate("o.createdAt")} BETWEEN ? AND ?
     AND EXISTS (SELECT 1 FROM pdv_order_items oi WHERE oi.pedidoId=o.pedidoId AND oi.isSofia=1)`,
  [start, end]
);
console.log(`\n=== PERÍODO ${start} a ${end} ===`);
console.log(`  Pedidos Sofia: ${per.pedidosSofia}  |  Com foto: ${per.comFoto}  |  Sem foto: ${per.pedidosSofia - per.comFoto}`);

// ===== Por vendedor (período) =====
const [perVend] = await conn.query(
  `SELECT
     o.sellerName,
     COUNT(DISTINCT o.id) AS pedidos,
     COUNT(DISTINCT CASE WHEN o.fotoUrl IS NOT NULL AND o.fotoUrl <> '' THEN o.id END) AS comFoto
   FROM pdv_orders o
   WHERE o.status != 'CANCELADO'
     AND ${spDate("o.createdAt")} BETWEEN ? AND ?
     AND EXISTS (SELECT 1 FROM pdv_order_items oi WHERE oi.pedidoId=o.pedidoId AND oi.isSofia=1)
   GROUP BY o.sellerName
   ORDER BY pedidos DESC`,
  [start, end]
);
if (perVend.length) {
  console.log("\nPor vendedor (período):");
  for (const r of perVend) {
    console.log(`  ${String(r.sellerName).padEnd(20)} pedidos=${String(r.pedidos).padStart(3)}  comFoto=${String(r.comFoto).padStart(3)}  semFoto=${String(r.pedidos - r.comFoto).padStart(3)}`);
  }
}

// ===== Listagem detalhada do período =====
const [pedidos] = await conn.query(
  `SELECT
     o.pedidoId, o.sellerName, o.status, o.fotoUrl,
     ${spDate("o.createdAt")} AS diaSp,
     COALESCE(CONVERT_TZ(o.createdAt,'+00:00','-03:00'), DATE_ADD(o.createdAt, INTERVAL 3 HOUR)) AS createdAtSp
   FROM pdv_orders o
   WHERE o.status != 'CANCELADO'
     AND ${spDate("o.createdAt")} BETWEEN ? AND ?
     AND EXISTS (SELECT 1 FROM pdv_order_items oi WHERE oi.pedidoId=o.pedidoId AND oi.isSofia=1)
   ORDER BY o.createdAt DESC`,
  [start, end]
);
console.log(`\n=== ${pedidos.length} pedido(s) Sofia no período ===`);
for (const p of pedidos) {
  const status = p.fotoUrl ? "✓ FOTO" : "✗ SEM FOTO";
  console.log(`  ${status.padEnd(11)} ${p.pedidoId}  ${String(p.sellerName).padEnd(12)} ${p.diaSp}  ${p.createdAtSp ? new Date(p.createdAtSp).toISOString().slice(11,16) : ""}`);
  if (p.fotoUrl) console.log(`               URL: ${p.fotoUrl}`);
}

// ===== HEAD nas últimas 5 URLs pra ver se ainda servem =====
const ultimasComFoto = pedidos.filter((p) => p.fotoUrl).slice(0, 5);
if (ultimasComFoto.length) {
  console.log("\n=== Verificando acessibilidade das últimas 5 fotos (HEAD) ===");
  for (const p of ultimasComFoto) {
    try {
      const r = await fetch(p.fotoUrl, { method: "HEAD" });
      const ct = r.headers.get("content-type") || "?";
      const len = r.headers.get("content-length") || "?";
      console.log(`  ${p.pedidoId}  status=${r.status}  type=${ct}  bytes=${len}`);
    } catch (e) {
      console.log(`  ${p.pedidoId}  ERRO: ${e.message}`);
    }
  }
}

// ===== Sanidade dos forge envs no host onde este script roda =====
console.log("\n=== ENV (apenas referência local) ===");
console.log(`  BUILT_IN_FORGE_API_URL ${process.env.BUILT_IN_FORGE_API_URL ? "definido" : "NÃO DEFINIDO"}`);
console.log(`  BUILT_IN_FORGE_API_KEY ${process.env.BUILT_IN_FORGE_API_KEY ? "definido (oculto)" : "NÃO DEFINIDO"}`);
console.log("  (No Railway o que vale são as envs de produção; aqui só serve pra confirmar se você já tem acesso local.)");

await conn.end();
