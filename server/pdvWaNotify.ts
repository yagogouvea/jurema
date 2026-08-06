/**
 * Notificações WhatsApp do PDV (pedidos, suprimento, sangria).
 * Suporta múltiplos destinatários via config `notif_pedido_telefone`.
 */
import type { Connection } from "mysql2/promise";
import { sendWaBridgeText, phoneToJid, resolveSenderInstanceSlot } from "./waSend";
import { createPdvMysqlConnection } from "./pdvMysql";

/** Números padrão quando a config nunca foi salva. */
export const DEFAULT_NOTIF_PHONES = ["5511981693476", "5511992022928"];

/** Intervalo entre mensagens — o WhatsApp bloqueia rajadas de envio. */
const INTERVALO_ENTRE_NUMEROS_MS = 1_500;
const INTERVALO_ENTRE_PEDIDOS_MS = 4_000;
/** Não reenviar backlog antigo demais (evita avalanche de mensagens históricas). */
const JANELA_MAXIMA_REENVIO_HORAS = 168;
/** Teto por rodada para o reenvio não virar spam. */
const MAX_PEDIDOS_POR_RODADA = 15;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const PAGAMENTO_LABELS: Record<string, string> = {
  PIX: "PIX",
  DINHEIRO: "Dinheiro",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  DESCONTO_FOLHA: "Desconto em folha",
};

function fmtBRL(v: number): string {
  return `R$ ${(Number(v) || 0).toFixed(2).replace(".", ",")}`;
}

/** Normaliza telefone BR para envio WhatsApp (DDI 55). */
export function normalizeNotificationPhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** Normaliza e deduplica telefones (somente dígitos, com DDI). */
export function parseNotificationPhones(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(/[,;\n|]+/)
    .map((p) => normalizeNotificationPhone(p))
    .filter(Boolean);
  return [...new Set(parts)];
}

/**
 * Lê `notif_pedido_telefone` do banco.
 * - Config ausente → DEFAULT_NOTIF_PHONES
 * - Config vazia → desativado ([])
 */
export async function getNotificationPhones(db: Connection): Promise<string[]> {
  const [cfgRows] = await db.execute(
    "SELECT value FROM pdv_config WHERE `key` = 'notif_pedido_telefone' LIMIT 1"
  );
  const cfg = (cfgRows as { value?: string }[])[0];
  if (cfg === undefined) return [...DEFAULT_NOTIF_PHONES];
  return parseNotificationPhones(cfg.value);
}

async function sendToAllPhones(
  slot: number,
  phones: string[],
  content: string
): Promise<{ enviados: string[]; falhas: string[] }> {
  const enviados: string[] = [];
  const falhas: string[] = [];
  let primeiro = true;
  for (const phone of phones) {
    if (!primeiro) await sleep(INTERVALO_ENTRE_NUMEROS_MS);
    primeiro = false;
    try {
      const ok = await sendWaBridgeText(slot, phoneToJid(phone), content);
      if (ok) {
        enviados.push(phone);
        console.log(`[pdvWaNotify] Enviado para ${phone}`);
      } else {
        falhas.push(phone);
        console.error(`[pdvWaNotify] Não enviado para ${phone} (bridge indisponível)`);
      }
    } catch (err) {
      falhas.push(phone);
      console.error(`[pdvWaNotify] Falha ao enviar para ${phone}:`, err);
    }
  }
  return { enviados, falhas };
}

export function buildOrderNotificationMessage(params: {
  pedidoId: string;
  sellerName: string;
  input: any;
  totalAplicado: number;
  /** Data do pedido; no reenvio é a data original, não a de agora. */
  dataPedido?: Date;
  /** Marca a mensagem como reenvio de um pedido que ficou sem aviso. */
  reenvio?: boolean;
}): string {
  const { pedidoId, sellerName, input, totalAplicado } = params;
  const dataHora = (params.dataPedido ?? new Date()).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const statusLabel =
    input.status === "PAGO"
      ? "✅ PAGO"
      : input.status === "PENDENTE"
        ? "⏳ PENDENTE"
        : "❌ CANCELADO";

  const lines: string[] = [
    params.reenvio
      ? `🔁 *JUREMA SPORT — PEDIDO NÃO AVISADO*`
      : `🛍️ *JUREMA SPORT — NOVO PEDIDO*`,
    `*${pedidoId}*`,
    ``,
  ];

  if (params.reenvio) {
    lines.push(`_Aviso atrasado: o WhatsApp da loja estava desconectado._`);
  }

  lines.push(
    `🗓️ ${dataHora}`,
    `👤 *Vendedor:* ${sellerName}`,
    `📲 *Canal:* ${input.canal}`,
    `🏷️ *Regime:* ${input.regime}`,
    `*Status:* ${statusLabel}`
  );

  if (input.clienteNome) {
    lines.push(
      `🧑 *Cliente:* ${input.clienteNome}${input.clienteTelefone ? ` (${input.clienteTelefone})` : ""}`
    );
  }

  if (Array.isArray(input.items) && input.items.length > 0) {
    lines.push(``, `*ITENS:*`);
    for (const it of input.items) {
      const nome = [it.time, it.descricao].filter(Boolean).join(" ");
      const sofia = it.isSofia ? " [Sofia]" : "";
      const sub = (Number(it.precoUnitario) || 0) * (Number(it.quantidade) || 0);
      lines.push(`• ${it.quantidade}x ${nome} (${it.tamanho})${sofia} — ${fmtBRL(sub)}`);
    }
  }

  if (Array.isArray(input.services) && input.services.length > 0) {
    lines.push(``, `*SERVIÇOS:*`);
    for (const s of input.services) {
      const extra = [s.descricao, s.cep ? `CEP ${s.cep}` : ""].filter(Boolean).join(" · ");
      lines.push(`• ${s.tipo}${extra ? ` (${extra})` : ""} — ${fmtBRL(s.valor)}`);
    }
  }

  lines.push(``, `💰 *TOTAL:* ${fmtBRL(totalAplicado)}`);

  if (Array.isArray(input.payments) && input.payments.length > 0) {
    lines.push(``, `*PAGAMENTO:*`);
    for (const p of input.payments) {
      const label = PAGAMENTO_LABELS[p.formaPagamento] || p.formaPagamento;
      const taxa = Number(p.taxa) > 0 ? ` (taxa ${fmtBRL(p.taxa)})` : "";
      const quem = p.nomePix ? ` — ${p.nomePix}` : "";
      const obs = p.obsPagamento ? ` (${p.obsPagamento})` : "";
      lines.push(`• ${label}: ${fmtBRL(p.valor)}${taxa}${quem}${obs}`);
    }
  }

  if (Number(input.totalPendente) > 0) {
    lines.push(``, `⚠️ *PENDENTE:* ${fmtBRL(input.totalPendente)}`);
    if (input.justificativa) lines.push(`_${input.justificativa}_`);
  }

  return lines.join("\n");
}

export function buildCashFlowNotificationMessage(params: {
  tipo: "SUPRIMENTO" | "SANGRIA";
  descricao: string;
  valor: number;
  usuario: string;
  origem?: "manual" | "venda_dinheiro";
}): string {
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const isSuprimento = params.tipo === "SUPRIMENTO";
  const titulo = isSuprimento ? "💵 *SUPRIMENTO DE CAIXA*" : "🔴 *SANGRIA DE CAIXA*";
  const origemLabel =
    params.origem === "venda_dinheiro" ? "Automático (venda em dinheiro)" : "Registro manual";

  return [
    titulo,
    `*JUREMA SPORT*`,
    ``,
    `🗓️ ${dataHora}`,
    `👤 *Registrado por:* ${params.usuario}`,
    `📋 *Origem:* ${origemLabel}`,
    ``,
    `*Descrição:* ${params.descricao}`,
    `*Valor:* ${fmtBRL(params.valor)}`,
  ].join("\n");
}

/** Envia notificação de pedido para todos os números configurados. */
export async function notifyOrderViaWhatsApp(params: {
  pedidoId: string;
  sellerName: string;
  input: any;
  totalAplicado: number;
}): Promise<void> {
  try {
    const db = await createPdvMysqlConnection();
    if (!db) return;
    let phones: string[] = [];
    let slot: number | null = null;
    try {
      phones = await getNotificationPhones(db);
      if (phones.length === 0) return;
      slot = await resolveSenderInstanceSlot(db);
    } finally {
      await db.end();
    }

    if (slot === null) {
      console.error(
        `[notifyOrder] ${params.pedidoId}: WhatsApp desconectado — notificação NÃO enviada para ${phones.join(", ")}.`
      );
      return;
    }

    const content = buildOrderNotificationMessage(params);
    const { enviados, falhas } = await sendToAllPhones(slot, phones, content);
    if (falhas.length > 0) {
      console.error(
        `[notifyOrder] ${params.pedidoId}: falhou para ${falhas.join(", ")} (instância ${slot}).`
      );
    }
    if (enviados.length > 0) {
      console.log(
        `[notifyOrder] ${params.pedidoId} enviado para ${enviados.join(", ")} (instância ${slot}).`
      );
      await markOrderNotified(params.pedidoId);
    }
  } catch (err) {
    console.error("[notifyOrder] Falha ao enviar notificação de pedido:", err);
  }
}

/** Registra que o pedido já foi avisado, para o reenvio não duplicar. */
async function markOrderNotified(pedidoId: string): Promise<void> {
  try {
    const db = await createPdvMysqlConnection();
    if (!db) return;
    try {
      await db.execute("UPDATE pdv_orders SET notifiedAt = NOW() WHERE pedidoId = ?", [pedidoId]);
    } finally {
      await db.end();
    }
  } catch (err) {
    console.error(`[notifyOrder] Não foi possível marcar ${pedidoId} como avisado:`, err);
  }
}

/** Envia notificação de suprimento/sangria para todos os números configurados. */
export async function notifyCashFlowViaWhatsApp(params: {
  tipo: "SUPRIMENTO" | "SANGRIA";
  descricao: string;
  valor: number;
  usuario: string;
  origem?: "manual" | "venda_dinheiro";
}): Promise<void> {
  try {
    const db = await createPdvMysqlConnection();
    if (!db) return;
    let phones: string[] = [];
    let slot: number | null = null;
    try {
      phones = await getNotificationPhones(db);
      if (phones.length === 0) return;
      slot = await resolveSenderInstanceSlot(db);
    } finally {
      await db.end();
    }

    if (slot === null) {
      console.error(
        `[notifyCashFlow] ${params.tipo}: WhatsApp desconectado — notificação NÃO enviada para ${phones.join(", ")}.`
      );
      return;
    }

    const content = buildCashFlowNotificationMessage(params);
    const { enviados, falhas } = await sendToAllPhones(slot, phones, content);
    if (falhas.length > 0) {
      console.error(
        `[notifyCashFlow] ${params.tipo} R$${params.valor}: falhou para ${falhas.join(", ")}.`
      );
    }
    if (enviados.length > 0) {
      console.log(
        `[notifyCashFlow] ${params.tipo} R$${params.valor} enviado para ${enviados.join(", ")}.`
      );
    }
  } catch (err) {
    console.error("[notifyCashFlow] Falha ao enviar notificação de caixa:", err);
  }
}

// ─── Reenvio dos pedidos que ficaram sem aviso ────────────────────────────────

export type PedidoPendente = {
  pedidoId: string;
  sellerName: string;
  createdAt: Date;
  totalAplicado: number;
};

/** Pedidos gravados que nunca chegaram a ser avisados por WhatsApp. */
export async function listPendingOrderNotifications(
  db: Connection,
  limite = MAX_PEDIDOS_POR_RODADA
): Promise<PedidoPendente[]> {
  const [rows] = await db.execute(
    `SELECT pedidoId, sellerName, createdAt, totalAplicado
       FROM pdv_orders
      WHERE notifiedAt IS NULL
        AND status <> 'CANCELADO'
        AND createdAt >= NOW() - INTERVAL ? HOUR
      ORDER BY createdAt ASC
      LIMIT ${Math.max(1, Math.min(50, Math.trunc(limite)))}`,
    [JANELA_MAXIMA_REENVIO_HORAS]
  );
  return (rows as any[]).map((r) => ({
    pedidoId: String(r.pedidoId),
    sellerName: String(r.sellerName ?? ""),
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
    totalAplicado: Number(r.totalAplicado) || 0,
  }));
}

/** Remonta o pedido gravado no formato esperado pelo template da mensagem. */
async function loadOrderForMessage(db: Connection, pedidoId: string): Promise<any | null> {
  const [orderRows] = await db.execute(
    `SELECT pedidoId, canal, clienteNome, clienteTelefone, regime, status,
            totalPendente, justificativa
       FROM pdv_orders WHERE pedidoId = ? LIMIT 1`,
    [pedidoId]
  );
  const order = (orderRows as any[])[0];
  if (!order) return null;

  const [items] = await db.execute(
    `SELECT time, descricao, tamanho, quantidade, precoUnitario, isSofia
       FROM pdv_order_items WHERE pedidoId = ? ORDER BY id ASC`,
    [pedidoId]
  );
  const [services] = await db.execute(
    `SELECT tipo, descricao, valor, cep FROM pdv_order_services WHERE pedidoId = ? ORDER BY id ASC`,
    [pedidoId]
  );
  const [payments] = await db.execute(
    `SELECT formaPagamento, valor, taxa, nomePix, obsPagamento
       FROM pdv_order_payments WHERE pedidoId = ? ORDER BY id ASC`,
    [pedidoId]
  );

  return {
    canal: order.canal,
    regime: order.regime,
    status: order.status,
    clienteNome: order.clienteNome ?? "",
    clienteTelefone: order.clienteTelefone ?? "",
    totalPendente: Number(order.totalPendente) || 0,
    justificativa: order.justificativa ?? "",
    items: (items as any[]).map((i) => ({
      time: i.time,
      descricao: i.descricao,
      tamanho: i.tamanho,
      quantidade: Number(i.quantidade) || 0,
      precoUnitario: Number(i.precoUnitario) || 0,
      isSofia: !!i.isSofia,
    })),
    services: (services as any[]).map((s) => ({
      tipo: s.tipo,
      descricao: s.descricao,
      valor: Number(s.valor) || 0,
      cep: s.cep,
    })),
    payments: (payments as any[]).map((p) => ({
      formaPagamento: p.formaPagamento,
      valor: Number(p.valor) || 0,
      taxa: Number(p.taxa) || 0,
      nomePix: p.nomePix,
      obsPagamento: p.obsPagamento,
    })),
  };
}

/**
 * Reenvia, em ritmo controlado, os pedidos que ficaram sem aviso enquanto o
 * WhatsApp esteve fora. Sai em silêncio quando não há nada pendente.
 */
export async function flushPendingOrderNotifications(opts?: {
  limite?: number;
  dryRun?: boolean;
}): Promise<{ pendentes: number; enviados: string[]; falhas: string[]; motivo?: string }> {
  const resultado = { pendentes: 0, enviados: [] as string[], falhas: [] as string[] };
  const db = await createPdvMysqlConnection();
  if (!db) return { ...resultado, motivo: "sem DATABASE_URL" };

  try {
    const pendentes = await listPendingOrderNotifications(db, opts?.limite);
    resultado.pendentes = pendentes.length;
    if (pendentes.length === 0) return resultado;

    if (opts?.dryRun) return { ...resultado, motivo: "dryRun" };

    const phones = await getNotificationPhones(db);
    if (phones.length === 0) return { ...resultado, motivo: "nenhum número configurado" };

    const slot = await resolveSenderInstanceSlot(db);
    if (slot === null) {
      console.warn(
        `[notifyOrderBacklog] ${pendentes.length} pedido(s) aguardando: WhatsApp ainda desconectado.`
      );
      return { ...resultado, motivo: "WhatsApp desconectado" };
    }

    console.log(`[notifyOrderBacklog] Reenviando ${pendentes.length} pedido(s) sem aviso.`);
    let primeiro = true;
    for (const pedido of pendentes) {
      if (!primeiro) await sleep(INTERVALO_ENTRE_PEDIDOS_MS);
      primeiro = false;

      const input = await loadOrderForMessage(db, pedido.pedidoId);
      if (!input) {
        resultado.falhas.push(pedido.pedidoId);
        continue;
      }

      const content = buildOrderNotificationMessage({
        pedidoId: pedido.pedidoId,
        sellerName: pedido.sellerName,
        input,
        totalAplicado: pedido.totalAplicado,
        dataPedido: pedido.createdAt,
        reenvio: true,
      });

      const { enviados } = await sendToAllPhones(slot, phones, content);
      if (enviados.length > 0) {
        await db.execute("UPDATE pdv_orders SET notifiedAt = NOW() WHERE pedidoId = ?", [
          pedido.pedidoId,
        ]);
        resultado.enviados.push(pedido.pedidoId);
      } else {
        resultado.falhas.push(pedido.pedidoId);
        // Bridge caiu de novo no meio da fila — não insiste com os demais.
        break;
      }
    }

    console.log(
      `[notifyOrderBacklog] Reenvio concluído: ${resultado.enviados.length} enviado(s), ${resultado.falhas.length} falha(s).`
    );
    return resultado;
  } catch (err) {
    console.error("[notifyOrderBacklog] Falha no reenvio de pedidos:", err);
    return { ...resultado, motivo: err instanceof Error ? err.message : String(err) };
  } finally {
    await db.end();
  }
}
