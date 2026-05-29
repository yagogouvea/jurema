/**
 * Importa pedidos históricos da planilha (PEDIDOS, pedidos_itens, SOFIA_ITENS)
 * para o banco MySQL do Railway (pdv_orders, pdv_order_items, pdv_order_services,
 * pdv_order_payments, pdv_desconto_folha quando aplicável).
 *
 * Cada pedido é inserido em transação. NÃO mexe em pdv_products / pdv_sellers /
 * pdv_goals / pdv_sofia_config. Não atualiza estoque (já refletido nas vendas
 * que o Manus processou). Não dispara webhooks de volta para a planilha.
 *
 * Uso:
 *   $env:DATABASE_URL = "<MYSQL_PUBLIC_URL>"
 *   $env:GOOGLE_SHEETS_API_KEY = "<API_KEY>"
 *   node scripts/import-orders.mjs             # dry-run (não escreve nada)
 *   node scripts/import-orders.mjs --apply     # executa
 */
import mysql from "mysql2/promise";

const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!apiKey || !dbUrl) { console.error("Faltou GOOGLE_SHEETS_API_KEY ou DATABASE_URL"); process.exit(1); }
const apply = process.argv.includes("--apply");

// ─── helpers ────────────────────────────────────────────────────────────────
async function fetchRange(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sheets ${r.status}: ${await r.text()}`);
  return (await r.json()).values || [];
}

function parseMoney(s) {
  if (s == null) return 0;
  const t = String(s).trim().replace(/[R$\s\u00a0]/g, "");
  if (!t) return 0;
  let n;
  if (t.includes(",")) n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  else n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
function parseInt2(s) {
  if (s == null) return 0;
  const n = parseInt(String(s).trim(), 10);
  return Number.isFinite(n) ? n : 0;
}
function parseDateBR(s) {
  if (!s) return null;
  const t = String(s).trim();
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
  // A planilha contém hora local (Brasília, UTC-3). O servidor MySQL roda em UTC
  // e armazena DATETIME sem timezone marker — então o frontend (com toLocaleString pt-BR)
  // só mostra a hora correta se o instant armazenado for "hora BR + 3h" (= UTC equivalente).
  // Geramos a Date diretamente como UTC do instant equivalente em BR, evitando dependência
  // do timezone da máquina que roda o script.
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) + 3, Number(mi), Number(se)));
}
function normCanal(s) {
  const u = String(s || "").toUpperCase();
  if (u.includes("WHATS")) return "WHATSAPP";
  return "BALCAO"; // "Balão", "Balcão", vazio, etc. → BALCAO
}
function normRegime(s) {
  const u = String(s || "").toUpperCase().trim();
  if (u === "ATACADO") return "ATACADO";
  if (u === "VAREJO") return "VAREJO";
  return null;
}
function normStatus(s) {
  const u = String(s || "").toUpperCase().trim();
  if (u === "CANCELADO") return "CANCELADO";
  if (u === "PENDENTE") return "PENDENTE";
  return "PAGO";
}
function normForma(s) {
  const u = String(s || "").toUpperCase().trim();
  if (u === "DEBITO" || u === "DÉBITO") return "DEBITO";
  if (u === "CREDITO" || u === "CRÉDITO") return "CREDITO";
  if (u === "PIX") return "PIX";
  if (u === "DINHEIRO") return "DINHEIRO";
  if (u === "DESCONTO_FOLHA" || u === "DESCONTO FOLHA") return "DESCONTO_FOLHA";
  return null;
}

const SERVICE_KEYWORDS = new Set(["CORREIO", "CAIXINHA", "CARRETO", "ENTREGA", "MOTOBOY", "FRETE"]);
function isServiceCod(cod) {
  return SERVICE_KEYWORDS.has(String(cod || "").trim().toUpperCase());
}

// ─── carrega dados ───────────────────────────────────────────────────────────
console.log("Lendo planilha…");
const pedHeader = (await fetchRange("PEDIDOS!A1:W1"))[0];
const pedRows = (await fetchRange("PEDIDOS!A2:W5000")).filter(r => (r[0] || "").trim());
const itRows = (await fetchRange("pedidos_itens!A2:Q15000")).filter(r => (r[0] || "").trim());
const sofRows = (await fetchRange("SOFIA_ITENS!A2:W5000")).filter(r => (r[0] || "").trim());
console.log("  PEDIDOS:", pedRows.length, "linhas");
console.log("  pedidos_itens:", itRows.length, "linhas");
console.log("  SOFIA_ITENS:", sofRows.length, "linhas");

// agrupar pedidos_itens por pedidoId
const itensByPedido = new Map();
for (const row of itRows) {
  const pid = (row[0] || "").trim();
  if (!pid) continue;
  if (!itensByPedido.has(pid)) itensByPedido.set(pid, []);
  itensByPedido.get(pid).push(row);
}
const sofiaByPedido = new Map();
for (const row of sofRows) {
  const pid = (row[0] || "").trim();
  if (!pid) continue;
  if (!sofiaByPedido.has(pid)) sofiaByPedido.set(pid, []);
  sofiaByPedido.get(pid).push(row);
}

// ─── conexão DB para resolver sellers e produtos ─────────────────────────────
// timezone: 'Z' garante que Date JS sejam gravadas como UTC literal,
// independente do timezone da máquina que está rodando o script.
const db = await mysql.createConnection({ uri: dbUrl, timezone: 'Z' });

const [sellersRows] = await db.execute("SELECT id, name, role, isActive FROM pdv_sellers");
const sellerMap = new Map();
for (const s of sellersRows) {
  const k = String(s.name || "").toUpperCase().trim();
  if (k) sellerMap.set(k, { id: s.id, name: s.name });
}
console.log("\nVendedores carregados:", sellerMap.size);

const [prodRows] = await db.execute("SELECT id, codigo, tipo, ptAtacado, ptVarejo FROM pdv_products WHERE codigo IS NOT NULL AND codigo != ''");
const prodByCod = new Map();
for (const p of prodRows) prodByCod.set(p.codigo.trim().toUpperCase(), {
  id: p.id,
  tipo: p.tipo,
  ptAtacado: Number(p.ptAtacado) || 0,
  ptVarejo: Number(p.ptVarejo) || 0,
});
console.log("Produtos carregados:", prodByCod.size);

// já existem pedidos no banco?
const [existRows] = await db.execute("SELECT pedidoId FROM pdv_orders");
const existing = new Set(existRows.map(r => r.pedidoId));
console.log("Pedidos já no banco:", existing.size);

// ─── parser de pedido ────────────────────────────────────────────────────────
function buildOrder(pid, pedRow, sofRowsForId) {
  // pedRow pode ser null se for pedido só-Sofia
  // sofRowsForId pode ser [] se for pedido sem Sofia
  const issues = [];
  let order = null;

  if (pedRow) {
    const data = (pedRow[1] || "").toString().trim();
    const vendedor = (pedRow[2] || "").toString().trim().toUpperCase();
    const canal = (pedRow[3] || "").toString().trim();
    const cliente = (pedRow[4] || "").toString().trim();
    const telefone = (pedRow[5] || "").toString().trim();
    const totalVar = parseMoney(pedRow[7]);
    const totalAt = parseMoney(pedRow[8]);
    const modal = (pedRow[9] || pedRow[18] || "").toString().trim();
    const valorSemTaxa = parseMoney(pedRow[12]);
    const formaPagamento = (pedRow[13] || "").toString().trim();
    const taxa = parseMoney(pedRow[14]);
    const totalComTaxa = parseMoney(pedRow[15]);
    const pendente = parseMoney(pedRow[16]);
    const justificativa = (pedRow[17] || "").toString().trim();
    const status = (pedRow[19] || "").toString().trim();
    const justAtMenos6 = (pedRow[22] || "").toString().trim();

    const seller = sellerMap.get(vendedor);
    if (!seller) issues.push(`vendedor "${vendedor}" sem match`);

    const regime = normRegime(modal);
    if (!regime) issues.push(`regime "${modal}" inválido`);

    const createdAt = parseDateBR(data) || new Date();

    order = {
      pedidoId: pid,
      sellerId: seller?.id ?? null,
      sellerName: seller?.name ?? vendedor,
      canal: normCanal(canal),
      clienteNome: cliente || null,
      clienteTelefone: telefone || null,
      regime: regime || "VAREJO",
      totalVarejo: totalVar,
      totalAtacado: totalAt,
      totalAplicado: valorSemTaxa || (regime === "ATACADO" ? totalAt : totalVar),
      totalPago: pendente > 0 ? 0 : totalComTaxa,
      totalPendente: pendente,
      justificativa: [justificativa, justAtMenos6].filter(Boolean).join(" | ") || null,
      isSofia: 0, // será ajustado depois com base em itens
      status: normStatus(status),
      createdAt,
      _formaPagamento: formaPagamento,
      _taxa: taxa,
      _totalComTaxa: totalComTaxa,
      _valorSemTaxa: valorSemTaxa || totalComTaxa - taxa,
    };
  } else if (sofRowsForId && sofRowsForId.length > 0) {
    // pedido só Sofia: monta cabeçalho a partir da primeira linha de SOFIA_ITENS
    const first = sofRowsForId[0];
    const data = (first[1] || "").toString().trim();
    const vendedor = (first[3] || "").toString().trim().toUpperCase();
    const canal = (first[4] || "").toString().trim();
    const cliente = (first[5] || "").toString().trim();
    const telefone = (first[6] || "").toString().trim();
    const modal = (first[9] || first[18] || "").toString().trim();
    const formaPagamento = (first[13] || "").toString().trim();
    const status = (first[19] || "").toString().trim();
    const justificativa = (first[17] || "").toString().trim();

    const seller = sellerMap.get(vendedor);
    if (!seller) issues.push(`vendedor "${vendedor}" sem match (Sofia)`);

    const regime = normRegime(modal);
    if (!regime) issues.push(`regime "${modal}" inválido (Sofia)`);

    // valores somados das linhas Sofia
    const totalSemTaxa = sofRowsForId.reduce((s, r) => s + parseMoney(r[12]), 0);
    const totalComTaxa = sofRowsForId.reduce((s, r) => s + parseMoney(r[15]), 0);
    const taxa = sofRowsForId.reduce((s, r) => s + parseMoney(r[14]), 0);
    const pendente = sofRowsForId.reduce((s, r) => s + parseMoney(r[16]), 0);
    const totalVar = sofRowsForId.reduce((s, r) => s + parseMoney(r[7]) * parseInt2(r[20]), 0);
    const totalAt = sofRowsForId.reduce((s, r) => s + parseMoney(r[8]) * parseInt2(r[20]), 0);

    order = {
      pedidoId: pid,
      sellerId: seller?.id ?? null,
      sellerName: seller?.name ?? vendedor,
      canal: normCanal(canal),
      clienteNome: cliente || null,
      clienteTelefone: telefone || null,
      regime: regime || "VAREJO",
      totalVarejo: totalVar,
      totalAtacado: totalAt,
      totalAplicado: totalSemTaxa,
      totalPago: pendente > 0 ? 0 : totalComTaxa,
      totalPendente: pendente,
      justificativa: justificativa || null,
      isSofia: 1, // só Sofia
      status: normStatus(status),
      createdAt: parseDateBR(data) || new Date(),
      _formaPagamento: formaPagamento,
      _taxa: taxa,
      _totalComTaxa: totalComTaxa,
      _valorSemTaxa: totalSemTaxa,
    };
  } else {
    issues.push("nenhuma fonte de dados (PEDIDOS vazio e SOFIA_ITENS vazio)");
    return { order: null, items: [], services: [], payments: [], issues };
  }

  // ── ITENS NORMAIS + SERVIÇOS da aba pedidos_itens ──
  const items = [];
  const services = [];
  const itensThisPedido = itensByPedido.get(pid) || [];
  for (const row of itensThisPedido) {
    const cod = (row[1] || "").toString().trim();
    const produto = (row[2] || "").toString().trim();
    const qtd = parseInt2(row[3]);
    const precoAt = parseMoney(row[4]);
    const precoVar = parseMoney(row[5]);
    const modalidade = (row[8] || "").toString().trim();
    const servicoExtra = (row[9] || "").toString().trim();
    const valorServico = parseMoney(row[10]);
    const total = parseMoney(row[11]);
    const comissaoCol = parseMoney(row[12]);
    const cep = (row[16] || "").toString().trim();

    if (isServiceCod(cod) || (servicoExtra && servicoExtra === cod)) {
      services.push({
        tipo: cod.toUpperCase() || servicoExtra.toUpperCase(),
        valor: valorServico || total,
        cep: cep || null,
      });
      continue;
    }

    const regime = order.regime;
    const precoUnit = regime === "ATACADO" ? precoAt : precoVar;
    const prod = prodByCod.get(cod.toUpperCase());
    const comissaoUnit = qtd > 0 ? comissaoCol / qtd : 0;

    // tentativa de parse da string produto "LINHA MODELO TIME DESCRICAO TAM TIPO"
    const parts = produto.split(/\s+/);
    items.push({
      productId: prod?.id ?? null,
      linha: parts[0] || null,
      modelo: parts[1] || null,
      time: parts[2] || "",
      descricao: produto || null,
      tipo: prod?.tipo || (parts[parts.length - 1] || null),
      tamanho: parts.length >= 5 ? parts[parts.length - 2] : "X",
      quantidade: qtd,
      precoUnitario: precoUnit,
      totalItem: total,
      isSofia: 0,
      comissaoUnitaria: comissaoUnit,
      comissaoLojaSofia: null,
      ptAtacado: prod?.ptAtacado ?? 0,
      ptVarejo: prod?.ptVarejo ?? 0,
    });
  }

  // ── ITENS SOFIA ──
  for (const row of sofRowsForId || []) {
    const cod = (row[2] || "").toString().trim();
    const precoVar = parseMoney(row[7]);
    const precoAt = parseMoney(row[8]);
    const qtd = parseInt2(row[20]) || 1;
    const comissaoLoja = parseMoney(row[21]);
    const valorTotal = parseMoney(row[12]);
    const prod = prodByCod.get(cod.toUpperCase());

    const precoUnit = order.regime === "ATACADO" ? precoAt : precoVar;
    items.push({
      productId: prod?.id ?? null,
      linha: null,
      modelo: null,
      time: prod?.time || "SOFIA",
      descricao: cod || "SOFIA",
      tipo: prod?.tipo || null,
      tamanho: "X",
      quantidade: qtd,
      precoUnitario: precoUnit,
      totalItem: valorTotal,
      isSofia: 1,
      comissaoUnitaria: 0,
      comissaoLojaSofia: qtd > 0 ? comissaoLoja / qtd : 0,
      ptAtacado: prod?.ptAtacado ?? 0,
      ptVarejo: prod?.ptVarejo ?? 0,
    });
  }

  // ── isSofia do pedido: true se TODOS os itens forem Sofia ──
  if (items.length > 0) {
    order.isSofia = items.every(it => it.isSofia === 1) ? 1 : 0;
  }

  // ── pagamentos ──
  const payments = [];
  const formasRaw = order._formaPagamento.split(",").map(s => normForma(s)).filter(Boolean);
  if (formasRaw.length === 0) {
    // sem forma reconhecível — default DINHEIRO
    payments.push({
      formaPagamento: "DINHEIRO",
      valor: order._valorSemTaxa,
      taxa: order._taxa,
      valorLiquido: order._totalComTaxa,
      nomePix: null,
    });
  } else {
    const valorTotal = order._valorSemTaxa;
    const taxaTotal = order._taxa;
    const totalComTaxaTotal = order._totalComTaxa;
    const n = formasRaw.length;
    for (let i = 0; i < n; i++) {
      payments.push({
        formaPagamento: formasRaw[i],
        valor: +(valorTotal / n).toFixed(2),
        taxa: +(taxaTotal / n).toFixed(2),
        valorLiquido: +(totalComTaxaTotal / n).toFixed(2),
        nomePix: null,
      });
    }
  }

  return { order, items, services, payments, issues };
}

// ─── coletar todos os pedidoIds (PEDIDOS + só-Sofia) ─────────────────────────
const pedRowsById = new Map();
for (const r of pedRows) pedRowsById.set(r[0].trim(), r);

const allPedidoIds = new Set();
for (const id of pedRowsById.keys()) allPedidoIds.add(id);
for (const id of sofiaByPedido.keys()) allPedidoIds.add(id);

console.log("\n=== resumo ===");
console.log("  pedidos únicos a processar:", allPedidoIds.size);
console.log("  - com cabeçalho PEDIDOS:", pedRowsById.size);
console.log("  - só com SOFIA_ITENS:", [...sofiaByPedido.keys()].filter(id => !pedRowsById.has(id)).length);

// ─── construir todos os pedidos ──────────────────────────────────────────────
const built = [];
const allIssues = [];
for (const pid of allPedidoIds) {
  if (existing.has(pid)) {
    allIssues.push({ pid, issues: ["já existe no banco — será pulado"] });
    continue;
  }
  const pedRow = pedRowsById.get(pid) || null;
  const sofForId = sofiaByPedido.get(pid) || [];
  const r = buildOrder(pid, pedRow, sofForId);
  if (r.order) built.push(r);
  if (r.issues.length > 0) allIssues.push({ pid, issues: r.issues });
}

// estatísticas do dry-run
let totalItems = 0, totalServices = 0, totalPayments = 0;
let nullProduct = 0, withProduct = 0;
let sofiaPedidos = 0, normalPedidos = 0;
for (const b of built) {
  totalItems += b.items.length;
  totalServices += b.services.length;
  totalPayments += b.payments.length;
  for (const it of b.items) {
    if (it.productId == null) nullProduct++; else withProduct++;
  }
  if (b.order.isSofia) sofiaPedidos++; else normalPedidos++;
}
console.log("\n=== dry-run ===");
console.log("  pedidos a criar:", built.length);
console.log("    - normais:", normalPedidos, "| Sofia (100% Sofia):", sofiaPedidos);
console.log("  itens a criar:", totalItems);
console.log("    - com productId resolvido:", withProduct);
console.log("    - sem match no produto (productId=null):", nullProduct);
console.log("  serviços a criar:", totalServices);
console.log("  pagamentos a criar:", totalPayments);
console.log("  pedidos com avisos:", allIssues.length);

if (allIssues.length > 0) {
  const tipoIssues = new Map();
  for (const ai of allIssues) {
    for (const m of ai.issues) {
      const key = m.replace(/"[^"]+"/, '"…"').replace(/\d+/g, "N");
      tipoIssues.set(key, (tipoIssues.get(key) || 0) + 1);
    }
  }
  console.log("\n  resumo de avisos:");
  for (const [k, v] of [...tipoIssues.entries()].sort((a, b) => b[1] - a[1])) {
    console.log("   -", k, "→", v);
  }
}

if (!apply) {
  console.log("\n--apply não passado — saindo sem alterar.");
  await db.end();
  process.exit(0);
}

// ─── APLICAR ─────────────────────────────────────────────────────────────────
console.log("\n=== APLICANDO ===");
let inserted = 0, skipped = 0, errors = 0;
let progressTime = Date.now();

for (const b of built) {
  if (!b.order.sellerId) {
    skipped++;
    if (skipped <= 5) console.log("  pulando", b.order.pedidoId, "(sem sellerId)");
    continue;
  }
  try {
    await db.beginTransaction();

    await db.execute(
      `INSERT INTO pdv_orders
       (pedidoId, sellerId, sellerName, canal, clienteNome, clienteTelefone, regime,
        totalVarejo, totalAtacado, totalAplicado, totalPago, totalPendente,
        justificativa, isSofia, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.order.pedidoId, b.order.sellerId, b.order.sellerName, b.order.canal,
        b.order.clienteNome, b.order.clienteTelefone, b.order.regime,
        b.order.totalVarejo, b.order.totalAtacado, b.order.totalAplicado,
        b.order.totalPago, b.order.totalPendente, b.order.justificativa,
        b.order.isSofia, b.order.status, b.order.createdAt, b.order.createdAt,
      ]
    );

    for (const it of b.items) {
      await db.execute(
        `INSERT INTO pdv_order_items
         (pedidoId, productId, linha, modelo, time, descricao, tipo, tamanho,
          quantidade, precoUnitario, totalItem, isSofia, comissaoUnitaria,
          comissaoLojaSofia, ptAtacado, ptVarejo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          b.order.pedidoId, it.productId, it.linha, it.modelo, it.time, it.descricao,
          it.tipo, it.tamanho, it.quantidade, it.precoUnitario, it.totalItem,
          it.isSofia, it.comissaoUnitaria, it.comissaoLojaSofia, it.ptAtacado, it.ptVarejo,
        ]
      );
    }

    for (const sv of b.services) {
      await db.execute(
        `INSERT INTO pdv_order_services (pedidoId, tipo, descricao, valor, cep, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [b.order.pedidoId, sv.tipo, sv.tipo, sv.valor, sv.cep, b.order.createdAt]
      );
    }

    for (const pm of b.payments) {
      await db.execute(
        `INSERT INTO pdv_order_payments
         (pedidoId, formaPagamento, valor, taxa, valorLiquido, nomePix, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [b.order.pedidoId, pm.formaPagamento, pm.valor, pm.taxa, pm.valorLiquido, pm.nomePix, b.order.createdAt]
      );
      if (pm.formaPagamento === "DESCONTO_FOLHA" && b.order.sellerId) {
        await db.execute(
          `INSERT INTO pdv_desconto_folha (sellerId, sellerName, pedidoId, descricao, valor, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [b.order.sellerId, b.order.sellerName, b.order.pedidoId,
           `Pedido ${b.order.pedidoId} - Desconto em folha`, pm.valor, b.order.createdAt]
        );
      }
    }

    await db.commit();
    inserted++;
  } catch (e) {
    try { await db.rollback(); } catch {}
    errors++;
    if (errors <= 5) console.log("  ERRO em", b.order.pedidoId, ":", e.message);
  }
  if (Date.now() - progressTime > 5000) {
    console.log(`  progresso: ${inserted + skipped + errors}/${built.length}`);
    progressTime = Date.now();
  }
}

console.log("\n=== resultado final ===");
console.log("  inseridos:", inserted);
console.log("  pulados:", skipped);
console.log("  erros:", errors);

const [a] = await db.execute("SELECT COUNT(*) AS n FROM pdv_orders");
const [b] = await db.execute("SELECT COUNT(*) AS n FROM pdv_order_items");
const [c] = await db.execute("SELECT COUNT(*) AS n FROM pdv_order_payments");
const [d] = await db.execute("SELECT COUNT(*) AS n FROM pdv_order_services");
const [e] = await db.execute("SELECT COUNT(*) AS n FROM pdv_desconto_folha");
console.log("\n  pdv_orders agora:", a[0].n);
console.log("  pdv_order_items agora:", b[0].n);
console.log("  pdv_order_payments agora:", c[0].n);
console.log("  pdv_order_services agora:", d[0].n);
console.log("  pdv_desconto_folha agora:", e[0].n);

await db.end();
console.log("\nPronto.");
