/**
 * Notificações WhatsApp do PDV (pedidos, suprimento, sangria).
 * Suporta múltiplos destinatários via config `notif_pedido_telefone`.
 */
import type { Connection } from "mysql2/promise";
import { sendWaBridgeText, phoneToJid, resolveSenderInstanceSlot } from "./waSend";
import { createPdvMysqlConnection } from "./pdvMysql";

/** Números padrão quando a config nunca foi salva. */
export const DEFAULT_NOTIF_PHONES = ["5511981693476", "5511992022928"];

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

async function sendToAllPhones(slot: number, phones: string[], content: string): Promise<void> {
  for (const phone of phones) {
    try {
      await sendWaBridgeText(slot, phoneToJid(phone), content);
      console.log(`[pdvWaNotify] Enviado para ${phone}`);
    } catch (err) {
      console.error(`[pdvWaNotify] Falha ao enviar para ${phone}:`, err);
    }
  }
}

export function buildOrderNotificationMessage(params: {
  pedidoId: string;
  sellerName: string;
  input: any;
  totalAplicado: number;
}): string {
  const { pedidoId, sellerName, input, totalAplicado } = params;
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const statusLabel =
    input.status === "PAGO"
      ? "✅ PAGO"
      : input.status === "PENDENTE"
        ? "⏳ PENDENTE"
        : "❌ CANCELADO";

  const lines: string[] = [
    `🛍️ *JUREMA SPORT — NOVO PEDIDO*`,
    `*${pedidoId}*`,
    ``,
    `🗓️ ${dataHora}`,
    `👤 *Vendedor:* ${sellerName}`,
    `📲 *Canal:* ${input.canal}`,
    `🏷️ *Regime:* ${input.regime}`,
    `*Status:* ${statusLabel}`,
  ];

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
      const pix = p.nomePix ? ` — ${p.nomePix}` : "";
      lines.push(`• ${label}: ${fmtBRL(p.valor)}${taxa}${pix}`);
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
      console.warn("[notifyOrder] Nenhuma instância wa-bridge ativa — notificação não enviada.");
      return;
    }

    const content = buildOrderNotificationMessage(params);
    await sendToAllPhones(slot, phones, content);
    console.log(
      `[notifyOrder] ${params.pedidoId} enviado para ${phones.join(", ")} (instância ${slot}).`
    );
  } catch (err) {
    console.error("[notifyOrder] Falha ao enviar notificação de pedido:", err);
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
      console.warn("[notifyCashFlow] Nenhuma instância wa-bridge ativa — notificação não enviada.");
      return;
    }

    const content = buildCashFlowNotificationMessage(params);
    await sendToAllPhones(slot, phones, content);
    console.log(
      `[notifyCashFlow] ${params.tipo} R$${params.valor} enviado para ${phones.join(", ")}.`
    );
  } catch (err) {
    console.error("[notifyCashFlow] Falha ao enviar notificação de caixa:", err);
  }
}
