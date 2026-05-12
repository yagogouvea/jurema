/**
 * Auditoria detalhada da seção Sofia para casar com os totais do Manus.
 *
 * Para cada pedido do período (que contém ao menos 1 item Sofia) mostra:
 *   - createdAt UTC e SP
 *   - sellerName, status
 *   - itens Sofia: descricao | qtd | precoUnit | totalItem | comissaoLojaSofia
 *   - itens NÃO Sofia: descricao | qtd | precoUnit | totalItem
 *   - serviços: tipo | valor
 *   - totalAplicado armazenado vs (soma itens + soma serviços)
 *   - "Sofia subtotal" (que é o que vai pro KPI Faturamento Sofia)
 *
 * Também imprime o resumo por vendedor exatamente como o dashboard calcula
 * (SUM totalItem WHERE isSofia=1) e identifica pedidos criados HOJE em SP.
 *
 * Uso (PowerShell, raiz do projeto):
 *   node --import dotenv/config scripts/debug-pdv-sofia-audit.mjs
 *   node --import dotenv/config scripts/debug-pdv-sofia-audit.mjs 2026-05-01 2026-05-12
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
function firstOfMonthSp(ymd = ymdSp()) {
  return `${ymd.slice(0, 7)}-01`;
}

const today = ymdSp();
const start = process.argv[2] || firstOfMonthSp(today);
const end = process.argv[3] || today;

function spDateExpr(col) {
  const mode = (process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "").trim().toLowerCase();
  if (mode === "server_date") return `DATE(${col})`;
  if (mode === "add3h") return `DATE(DATE_ADD(${col}, INTERVAL 3 HOUR))`;
  return `DATE(COALESCE(CONVERT_TZ(${col}, '+00:00', '-03:00'), DATE_ADD(${col}, INTERVAL 3 HOUR)))`;
}
function spDateTimeExpr(col) {
  return `COALESCE(CONVERT_TZ(${col}, '+00:00', '-03:00'), DATE_ADD(${col}, INTERVAL 3 HOUR))`;
}

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function pad(s, n, right = false) {
  s = String(s ?? "");
  if (s.length >= n) return s.slice(0, n);
  const fill = " ".repeat(n - s.length);
  return right ? fill + s : s + fill;
}

const conn = await mysql.createConnection({
  uri: url,
  connectTimeout: 10000,
  timezone: "Z",
});
await conn.query("SET time_zone = '+00:00'");

console.log(`\n=== AUDITORIA SOFIA — período ${start} a ${end} (SP) ===\n`);

// 1) Pedidos com ao menos 1 item Sofia, ativos no período
const [pedidos] = await conn.execute(
  `SELECT
     o.id, o.pedidoId, o.sellerId, o.sellerName, o.status,
     o.canal, o.regime,
     o.totalVarejo, o.totalAtacado, o.totalAplicado,
     o.totalPago, o.totalPendente,
     o.createdAt AS createdAtUtc,
     ${spDateTimeExpr("o.createdAt")} AS createdAtSp,
     ${spDateExpr("o.createdAt")} AS diaSp
   FROM pdv_orders o
   WHERE EXISTS (
     SELECT 1 FROM pdv_order_items oi
     WHERE oi.pedidoId = o.pedidoId AND oi.isSofia = 1
   )
     AND o.status != 'CANCELADO'
     AND ${spDateExpr("o.createdAt")} BETWEEN ? AND ?
   ORDER BY o.createdAt ASC`,
  [start, end]
);

if (!pedidos.length) {
  console.log("Nenhum pedido Sofia no período.");
  await conn.end();
  process.exit(0);
}

const pedidoIds = pedidos.map((p) => p.pedidoId);
const placeholders = pedidoIds.map(() => "?").join(",");

// 2) Itens
const [itens] = await conn.execute(
  `SELECT pedidoId, productId, descricao, quantidade,
          precoUnitario, totalItem, isSofia,
          comissaoLojaSofia
   FROM pdv_order_items
   WHERE pedidoId IN (${placeholders})
   ORDER BY pedidoId, isSofia DESC, id ASC`,
  pedidoIds
);

// 3) Serviços (se a tabela existir)
let servicos = [];
try {
  const [svcRows] = await conn.execute(
    `SELECT pedidoId, tipo, valor
     FROM pdv_order_services
     WHERE pedidoId IN (${placeholders})
     ORDER BY pedidoId, id ASC`,
    pedidoIds
  );
  servicos = svcRows;
} catch {
  // tabela pode não existir em algumas versões
}

const itensByPedido = new Map();
for (const it of itens) {
  if (!itensByPedido.has(it.pedidoId)) itensByPedido.set(it.pedidoId, []);
  itensByPedido.get(it.pedidoId).push(it);
}
const svcByPedido = new Map();
for (const s of servicos) {
  if (!svcByPedido.has(s.pedidoId)) svcByPedido.set(s.pedidoId, []);
  svcByPedido.get(s.pedidoId).push(s);
}

// === Detalhamento por pedido ===
let totalSofiaPecas = 0;
let totalSofiaFat = 0;
let totalSofiaComissao = 0;
let totalAplicadoSomado = 0;
let totalAplicadoArmazenado = 0;
let pedidosHoje = [];
const porVendedor = new Map();

console.log(`Pedidos encontrados: ${pedidos.length}\n`);
console.log("─".repeat(110));

for (const p of pedidos) {
  const its = itensByPedido.get(p.pedidoId) || [];
  const svcs = svcByPedido.get(p.pedidoId) || [];

  const sofiaItens = its.filter((i) => Number(i.isSofia) === 1);
  const naoSofiaItens = its.filter((i) => Number(i.isSofia) !== 1);

  const sofiaPecas = sofiaItens.reduce((a, i) => a + Number(i.quantidade || 0), 0);
  const sofiaFat = sofiaItens.reduce((a, i) => a + Number(i.totalItem || 0), 0);
  const sofiaComissao = sofiaItens.reduce(
    (a, i) => a + Number(i.comissaoLojaSofia || 0) * Number(i.quantidade || 0),
    0
  );
  const naoSofiaFat = naoSofiaItens.reduce((a, i) => a + Number(i.totalItem || 0), 0);
  const svcFat = svcs.reduce((a, s) => a + Number(s.valor || 0), 0);

  // pdv_orders não tem coluna de desconto neste schema; o totalAplicado já reflete
  // qualquer ajuste manual feito no checkout. Diff = armazenado − (itens+serviços).
  const calc = sofiaFat + naoSofiaFat + svcFat;
  const armazenado = Number(p.totalAplicado || 0);
  const diff = +(armazenado - calc).toFixed(2);

  totalSofiaPecas += sofiaPecas;
  totalSofiaFat += sofiaFat;
  totalSofiaComissao += sofiaComissao;
  totalAplicadoSomado += calc;
  totalAplicadoArmazenado += armazenado;

  const pv = porVendedor.get(p.sellerId) || {
    sellerName: p.sellerName,
    pedidos: 0,
    pecas: 0,
    fat: 0,
    comissao: 0,
  };
  pv.pedidos += 1;
  pv.pecas += sofiaPecas;
  pv.fat += sofiaFat;
  pv.comissao += sofiaComissao;
  porVendedor.set(p.sellerId, pv);

  if (p.diaSp === today) pedidosHoje.push(p);

  const flag = diff !== 0 ? `  ⚠ totalAplicado≠calc Δ=${fmtBRL(diff)}` : "";
  const sofiaTipo = naoSofiaItens.length === 0 ? "100% Sofia" : "Misto";
  console.log(
    `\n${p.pedidoId}  [${p.status}]  ${sofiaTipo}  ${p.sellerName}` +
      `  | createdAt SP: ${p.createdAtSp}  (UTC ${new Date(p.createdAtUtc).toISOString()})` +
      flag
  );

  if (sofiaItens.length) {
    console.log("  itens Sofia:");
    for (const i of sofiaItens) {
      console.log(
        `    - ${pad(i.descricao || "(sem nome)", 40)} qtd=${pad(i.quantidade, 3, true)}` +
          `  unit=${pad(fmtBRL(i.precoUnitario), 12, true)}` +
          `  total=${pad(fmtBRL(i.totalItem), 12, true)}` +
          `  comLoja/peça=${fmtBRL(i.comissaoLojaSofia)}`
      );
    }
  }
  if (naoSofiaItens.length) {
    console.log("  itens NÃO Sofia:");
    for (const i of naoSofiaItens) {
      console.log(
        `    - ${pad(i.descricao || "(sem nome)", 40)} qtd=${pad(i.quantidade, 3, true)}` +
          `  unit=${pad(fmtBRL(i.precoUnitario), 12, true)}` +
          `  total=${pad(fmtBRL(i.totalItem), 12, true)}`
      );
    }
  }
  if (svcs.length) {
    console.log("  serviços:");
    for (const s of svcs) {
      console.log(`    - ${pad(s.tipo, 30)} ${pad(fmtBRL(s.valor), 12, true)}`);
    }
  }
  console.log(
    `  --> Sofia: ${sofiaPecas} peça(s) | fatSofia=${fmtBRL(sofiaFat)} | comLoja=${fmtBRL(sofiaComissao)}` +
      `  || totalAplicado armazenado=${fmtBRL(armazenado)}  calc=${fmtBRL(calc)}`
  );
}

console.log("\n" + "═".repeat(110));
console.log("RESUMO SOFIA (espelha o Dashboard Sofia):");
console.log(
  `  totalPedidos = ${pedidos.length}\n` +
    `  totalPeças (Sofia) = ${totalSofiaPecas}\n` +
    `  Faturamento (SUM totalItem WHERE isSofia=1) = ${fmtBRL(totalSofiaFat)}\n` +
    `  Bônus Loja (SUM comissaoLojaSofia*qtd)        = ${fmtBRL(totalSofiaComissao)}\n` +
    `  Reembolso (Faturamento − Bônus)               = ${fmtBRL(totalSofiaFat - totalSofiaComissao)}`
);

console.log("\nPor vendedor (Sofia):");
for (const v of [...porVendedor.values()].sort((a, b) => b.fat - a.fat)) {
  console.log(
    `  ${pad(v.sellerName, 22)} pedidos=${pad(v.pedidos, 3, true)}` +
      ` peças=${pad(v.pecas, 4, true)}` +
      ` fat=${pad(fmtBRL(v.fat), 14, true)}` +
      ` bonus=${pad(fmtBRL(v.comissao), 12, true)}` +
      ` reemb=${pad(fmtBRL(v.fat - v.comissao), 14, true)}`
  );
}

console.log(
  `\nTotal Aplicado armazenado (somatório dos pedidos): ${fmtBRL(totalAplicadoArmazenado)}` +
    `\nTotal Aplicado recalculado (itens+serviços-desc): ${fmtBRL(totalAplicadoSomado)}`
);

console.log(`\nPedidos criados HOJE em SP (${today}): ${pedidosHoje.length}`);
for (const p of pedidosHoje) {
  console.log(
    `  - ${p.pedidoId}  ${p.sellerName}  ${p.createdAtSp}` +
      `  totalAplicado=${fmtBRL(p.totalAplicado)}`
  );
}

await conn.end();
