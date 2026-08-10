/**
 * Resumo diário de vendas via WhatsApp (seg–sáb, 17h SP).
 */
import type { Connection } from "mysql2/promise";
import { todayYmdSaoPaulo } from "@shared/spCalendar";
import { createPdvMysqlConnection, orderDayDateExpr } from "./pdvMysql";
import {
  getNotificationPhones,
  parseNotificationPhones,
} from "./pdvWaNotify";
import { resolveSenderInstanceSlot, sendWaBridgeText, phoneToJid } from "./waSend";

const SQL_OI_NAO_SOFIA = "(COALESCE(oi.isSofia, 0) = 0)";
const JOIN_ITENS_NAO_SOFIA = `LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND ${SQL_OI_NAO_SOFIA}`;

const PAGAMENTO_LABELS: Record<string, string> = {
  PIX: "PIX",
  DINHEIRO: "Dinheiro",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  DESCONTO_FOLHA: "Desc. folha",
};

function rowNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v: number): string {
  return `R$ ${(Number(v) || 0).toFixed(2).replace(".", ",")}`;
}

function fmtDiaLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(`${ymd}T12:00:00-03:00`);
  const weekday = dt.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  });
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y} (${weekday})`;
}

function fmtMesLabel(ymd: string): string {
  const dt = new Date(`${ymd}T12:00:00-03:00`);
  return dt.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "long",
    year: "numeric",
  });
}

export type DailySummaryStats = {
  dia: string;
  totalPedidos: number;
  faturamento: number;
  ticketMedio: number;
  faturamentoAtacado: number;
  faturamentoVarejo: number;
  faturamentoBalcao: number;
  faturamentoWhatsapp: number;
  faturamentoMes: number;
  pedidosMes: number;
  pontosDia: number;
  bySeller: Array<{ sellerName: string; pedidos: number; faturamento: number }>;
  byPayment: Array<{ formaPagamento: string; total: number }>;
  suprimentosHoje: number;
  sangriasHoje: number;
  saldoCaixa: number;
};

async function loadRangeSummary(
  db: Connection,
  startDate: string,
  endDate: string
): Promise<{
  totalPedidos: number;
  faturamento: number;
  ticketMedio: number;
  faturamentoAtacado: number;
  faturamentoVarejo: number;
  faturamentoBalcao: number;
  faturamentoWhatsapp: number;
}> {
  const dayCmp = orderDayDateExpr("o");
  const [rows] = await db.execute(
    `SELECT
       COUNT(DISTINCT o.id) as totalPedidos,
       COALESCE(SUM(oi.totalItem), 0) as faturamento,
       CASE WHEN COUNT(DISTINCT o.id) > 0
         THEN COALESCE(SUM(oi.totalItem), 0) / COUNT(DISTINCT o.id) ELSE 0 END as ticketMedio,
       COALESCE(SUM(CASE WHEN o.regime = 'ATACADO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoAtacado,
       COALESCE(SUM(CASE WHEN o.regime = 'VAREJO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoVarejo,
       COALESCE(SUM(CASE WHEN o.canal = 'BALCAO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoBalcao,
       COALESCE(SUM(CASE WHEN o.canal = 'WHATSAPP' THEN oi.totalItem ELSE 0 END), 0) as faturamentoWhatsapp
     FROM pdv_orders o
     ${JOIN_ITENS_NAO_SOFIA}
     WHERE o.status != 'CANCELADO'
       AND ${dayCmp} >= ? AND ${dayCmp} <= ?`,
    [startDate, endDate]
  );
  const r = (rows as any[])[0] || {};
  return {
    totalPedidos: rowNumber(r.totalPedidos),
    faturamento: rowNumber(r.faturamento),
    ticketMedio: rowNumber(r.ticketMedio),
    faturamentoAtacado: rowNumber(r.faturamentoAtacado),
    faturamentoVarejo: rowNumber(r.faturamentoVarejo),
    faturamentoBalcao: rowNumber(r.faturamentoBalcao),
    faturamentoWhatsapp: rowNumber(r.faturamentoWhatsapp),
  };
}

export async function loadDailySummaryStats(
  db: Connection,
  dia: string
): Promise<DailySummaryStats> {
  const mesInicio = `${dia.slice(0, 7)}-01`;
  const day = await loadRangeSummary(db, dia, dia);
  const month = await loadRangeSummary(db, mesInicio, dia);

  const dayCmp = orderDayDateExpr("o");
  const [sellerRows] = await db.execute(
    `SELECT s.name as sellerName,
       COUNT(DISTINCT o.id) as pedidos,
       COALESCE(SUM(oi.totalItem), 0) as faturamento
     FROM pdv_orders o
     ${JOIN_ITENS_NAO_SOFIA}
     INNER JOIN pdv_sellers s ON s.id = o.sellerId
     WHERE o.status != 'CANCELADO' AND ${dayCmp} = ?
     GROUP BY s.id, s.name
     ORDER BY faturamento DESC, s.name
     LIMIT 8`,
    [dia]
  );

  const [paymentRows] = await db.execute(
    `SELECT p.formaPagamento, COALESCE(SUM(p.valor), 0) as total
     FROM pdv_order_payments p
     INNER JOIN pdv_orders o ON p.pedidoId = o.pedidoId
     WHERE o.status != 'CANCELADO' AND ${dayCmp} = ?
     GROUP BY p.formaPagamento
     ORDER BY total DESC`,
    [dia]
  );

  const [ptRows] = await db.execute(
    `SELECT COALESCE(SUM(
       CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
            ELSE oi.ptVarejo * oi.quantidade END
     ), 0) as pontos
     FROM pdv_orders o
     INNER JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND ${SQL_OI_NAO_SOFIA}
     WHERE o.status != 'CANCELADO' AND ${dayCmp} = ?`,
    [dia]
  );

  const dayExpr = `DATE(CONVERT_TZ(createdAt, '+00:00', '-03:00'))`;
  const [cashDayRows] = await db.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'SUPRIMENTO' THEN valor ELSE 0 END), 0) AS suprimentos,
       COALESCE(SUM(CASE WHEN tipo = 'SANGRIA' THEN valor ELSE 0 END), 0) AS sangrias
     FROM pdv_cash_flow
     WHERE ${dayExpr} = ?`,
    [dia]
  );
  const [balanceRows] = await db.execute(
    "SELECT COALESCE(SUM(CASE WHEN tipo = 'SUPRIMENTO' THEN valor ELSE -valor END), 0) as saldo FROM pdv_cash_flow"
  );
  const cashDay = (cashDayRows as any[])[0] || {};

  return {
    dia,
    ...day,
    faturamentoMes: month.faturamento,
    pedidosMes: month.totalPedidos,
    pontosDia: rowNumber((ptRows as any[])[0]?.pontos),
    bySeller: (sellerRows as any[]).map((r) => ({
      sellerName: String(r.sellerName || ""),
      pedidos: rowNumber(r.pedidos),
      faturamento: rowNumber(r.faturamento),
    })),
    byPayment: (paymentRows as any[]).map((r) => ({
      formaPagamento: String(r.formaPagamento || ""),
      total: rowNumber(r.total),
    })),
    suprimentosHoje: rowNumber(cashDay.suprimentos),
    sangriasHoje: rowNumber(cashDay.sangrias),
    saldoCaixa: rowNumber((balanceRows as any[])[0]?.saldo),
  };
}

export function buildDailySummaryMessage(stats: DailySummaryStats): string {
  const lines: string[] = [
    "📊 *JUREMA SPORT — Resumo do dia*",
    `📅 ${fmtDiaLabel(stats.dia)} · até 17:00`,
    "",
    `💰 *Faturamento do dia:* ${fmtBRL(stats.faturamento)}`,
    `📦 Pedidos: ${stats.totalPedidos} · Ticket: ${fmtBRL(stats.ticketMedio)}`,
    `📆 *Faturamento do mês (${fmtMesLabel(stats.dia)}):* ${fmtBRL(stats.faturamentoMes)}`,
    `📦 Pedidos no mês: ${stats.pedidosMes}`,
  ];

  if (stats.bySeller.length > 0) {
    lines.push("", "👥 *Vendedores*");
    for (const s of stats.bySeller.slice(0, 6)) {
      if (s.faturamento <= 0 && s.pedidos <= 0) continue;
      lines.push(`• ${s.sellerName} — ${fmtBRL(s.faturamento)} (${s.pedidos} ped.)`);
    }
  }

  if (stats.byPayment.length > 0) {
    lines.push("", "💳 *Pagamentos*");
    lines.push(
      stats.byPayment
        .map(
          (p) =>
            `${PAGAMENTO_LABELS[p.formaPagamento] || p.formaPagamento} ${fmtBRL(p.total)}`
        )
        .join(" · ")
    );
  }

  lines.push(
    "",
    `📈 Atacado ${fmtBRL(stats.faturamentoAtacado)} · Varejo ${fmtBRL(stats.faturamentoVarejo)}`,
    `🏪 Balcão ${fmtBRL(stats.faturamentoBalcao)} · WhatsApp ${fmtBRL(stats.faturamentoWhatsapp)}`
  );

  if (stats.pontosDia > 0) {
    lines.push(`⭐ Pontos do dia: ${stats.pontosDia} PT`);
  }

  if (stats.suprimentosHoje > 0 || stats.sangriasHoje > 0 || stats.saldoCaixa !== 0) {
    lines.push(
      "",
      `💵 Caixa: saldo ${fmtBRL(stats.saldoCaixa)} · supr. ${fmtBRL(stats.suprimentosHoje)} · sangria ${fmtBRL(stats.sangriasHoje)}`
    );
  }

  return lines.join("\n");
}

/** Destinatários do resumo diário (config dedicada; fallback = 1º número de pedido). */
export async function getDailySummaryPhones(db: Connection): Promise<string[]> {
  const [rows] = await db.execute(
    "SELECT value FROM pdv_config WHERE `key` = 'notif_resumo_diario_telefone' LIMIT 1"
  );
  const cfg = (rows as { value?: string }[])[0];
  if (cfg?.value?.trim()) return parseNotificationPhones(cfg.value);
  const pedidoPhones = await getNotificationPhones(db);
  return pedidoPhones.length ? [pedidoPhones[0]] : [];
}

export async function sendDailySalesSummaryWhatsApp(
  dia?: string
): Promise<{ ok: boolean; dia: string; phones: string[]; error?: string }> {
  const db = await createPdvMysqlConnection();
  if (!db) return { ok: false, dia: dia || todayYmdSaoPaulo(), phones: [], error: "sem_db" };

  const targetDia = dia || todayYmdSaoPaulo();
  try {
    const phones = await getDailySummaryPhones(db);
    if (!phones.length) {
      return { ok: false, dia: targetDia, phones: [], error: "sem_telefone" };
    }

    const stats = await loadDailySummaryStats(db, targetDia);
    const content = buildDailySummaryMessage(stats);
    const slot = await resolveSenderInstanceSlot();
    if (!slot) {
      console.error("[pdvDailySummary] WhatsApp desconectado — resumo não enviado.");
      return { ok: false, dia: targetDia, phones, error: "wa_desconectado" };
    }

    const enviados: string[] = [];
    for (const phone of phones) {
      const ok = await sendWaBridgeText(slot, phoneToJid(phone), content);
      if (ok) enviados.push(phone);
    }

    if (!enviados.length) {
      return { ok: false, dia: targetDia, phones, error: "falha_envio" };
    }

    console.log(`[pdvDailySummary] Resumo ${targetDia} enviado para ${enviados.join(", ")}`);
    return { ok: true, dia: targetDia, phones: enviados };
  } finally {
    await db.end();
  }
}
