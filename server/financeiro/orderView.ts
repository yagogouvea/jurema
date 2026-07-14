/**
 * Visão order-centric da conciliação (pedidos do período × extrato).
 */
import type {
  ExtractLine,
  MatchedItem,
  OrderConfirmedRow,
  OrderReviewRow,
  OrderSnapshot,
  OrderUnmatchedRow,
  ReconcileResult,
  ReviewItem,
} from "./types";

type DbConn = {
  execute: (sql: string, params?: any[]) => Promise<[any, any]>;
};

export async function loadOrderSnapshots(
  db: DbConn,
  pedidoIds: string[]
): Promise<Map<string, OrderSnapshot>> {
  const map = new Map<string, OrderSnapshot>();
  const unique = [...new Set(pedidoIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const placeholders = unique.map(() => "?").join(",");
  const [orderRows] = await db.execute(
    `SELECT pedidoId, createdAt, clienteNome, clienteTelefone, sellerName, canal, regime, status, justificativa
     FROM pdv_orders WHERE pedidoId IN (${placeholders})`,
    unique
  );
  const [itemRows] = await db.execute(
    `SELECT pedidoId, quantidade, descricao, linha, modelo, time, tamanho
     FROM pdv_order_items WHERE pedidoId IN (${placeholders})
     ORDER BY id ASC`,
    unique
  );

  const itemsByPedido = new Map<string, string[]>();
  for (const it of itemRows as any[]) {
    const pid = String(it.pedidoId);
    const label = [it.descricao, it.linha, it.modelo, it.time, it.tamanho]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const part = `${it.quantidade || 1}x ${label || "item"}`;
    const arr = itemsByPedido.get(pid) || [];
    arr.push(part);
    itemsByPedido.set(pid, arr);
  }

  for (const r of orderRows as any[]) {
    const pedidoId = String(r.pedidoId);
    const items = itemsByPedido.get(pedidoId) || [];
    map.set(pedidoId, {
      pedidoId,
      pedidoCreatedAt: new Date(r.createdAt).toISOString(),
      clienteNome: r.clienteNome == null ? null : String(r.clienteNome),
      clienteTelefone: r.clienteTelefone == null ? null : String(r.clienteTelefone),
      sellerName: r.sellerName == null ? null : String(r.sellerName),
      canal: r.canal == null ? null : String(r.canal),
      regime: r.regime == null ? null : String(r.regime),
      status: String(r.status || "PAGO"),
      justificativa: r.justificativa == null ? null : String(r.justificativa),
      itemsSummary: items.slice(0, 8).join(", ") + (items.length > 8 ? ` (+${items.length - 8})` : ""),
    });
  }
  return map;
}

function fallbackOrder(pedidoId: string, partial?: Partial<OrderSnapshot>): OrderSnapshot {
  return {
    pedidoId,
    pedidoCreatedAt: partial?.pedidoCreatedAt || new Date().toISOString(),
    clienteNome: partial?.clienteNome ?? null,
    clienteTelefone: partial?.clienteTelefone ?? null,
    sellerName: partial?.sellerName ?? null,
    canal: partial?.canal ?? null,
    regime: partial?.regime ?? null,
    status: partial?.status || "PAGO",
    justificativa: partial?.justificativa ?? null,
    itemsSummary: partial?.itemsSummary || "",
  };
}

function extractBrief(lines: ExtractLine[]) {
  return (lines || []).map((e) => ({
    id: e.id,
    payerNameRaw: e.payerNameRaw,
    amountCents: e.amountCents,
    datetimeIso: e.datetimeIso,
    date: e.date,
    time: e.time,
    kindLabel: e.kindLabel,
  }));
}

export function buildOrderCentricView(
  core: Pick<ReconcileResult, "matched" | "review" | "onlyPdv" | "onlyExtract">,
  snapshots: Map<string, OrderSnapshot>
): {
  ordersConfirmed: OrderConfirmedRow[];
  ordersReview: OrderReviewRow[];
  ordersUnmatched: OrderUnmatchedRow[];
  extractUnmatched: ExtractLine[];
} {
  const ordersConfirmed: OrderConfirmedRow[] = (core.matched || []).map((m: MatchedItem) => {
    const snap =
      snapshots.get(m.payment.pedidoId) ||
      fallbackOrder(m.payment.pedidoId, {
        clienteNome: m.payment.clienteNome,
        pedidoCreatedAt: m.payment.pedidoCreatedAt,
        status: m.payment.status,
      });
    return {
      paymentId: m.payment.paymentId,
      formaPagamento: m.payment.formaPagamento || "PIX",
      valorPdvCents: m.payment.valorCents,
      nomePix: m.payment.nomePix,
      order: snap,
      extract: extractBrief(m.extract || []),
      confidence: m.confidence,
      kind: m.kind,
      notes: m.notes,
      matchBasis: m.payment.matchBasis,
      relatedPaymentIds: m.relatedPayments?.map((p) => p.paymentId),
    };
  });

  const ordersReview: OrderReviewRow[] = (core.review || []).map((r: ReviewItem, reviewIndex) => {
    const candidates = (r.candidates || []).map((c) => {
      const snap =
        snapshots.get(c.pedidoId) ||
        fallbackOrder(c.pedidoId, {
          clienteNome: c.clienteNome,
        });
      return {
        paymentId: c.paymentId,
        score: c.score,
        valorCents: c.valorCents,
        nomePix: c.nomePix,
        order: snap,
      };
    });
    // Se review trouxe payment direto sem candidates
    if ((!r.candidates || r.candidates.length === 0) && r.payment) {
      const snap =
        snapshots.get(r.payment.pedidoId) ||
        fallbackOrder(r.payment.pedidoId, {
          clienteNome: r.payment.clienteNome,
          pedidoCreatedAt: r.payment.pedidoCreatedAt,
          status: r.payment.status,
        });
      candidates.push({
        paymentId: r.payment.paymentId,
        score: 0,
        valorCents: r.payment.valorCents,
        nomePix: r.payment.nomePix,
        order: snap,
      });
    }
    return {
      reviewIndex,
      reason: r.reason,
      extract: r.extract || [],
      candidates,
    };
  });

  const ordersUnmatched: OrderUnmatchedRow[] = (core.onlyPdv || []).map((p) => {
    const snap =
      snapshots.get(p.pedidoId) ||
      fallbackOrder(p.pedidoId, {
        clienteNome: p.clienteNome,
        pedidoCreatedAt: p.pedidoCreatedAt,
        status: p.status,
      });
    return {
      paymentId: p.paymentId,
      formaPagamento: p.formaPagamento || "PIX",
      valorCents: p.valorCents,
      nomePix: p.nomePix,
      order: snap,
    };
  });

  return {
    ordersConfirmed,
    ordersReview,
    ordersUnmatched,
    extractUnmatched: core.onlyExtract || [],
  };
}

export function collectPedidoIdsFromCore(
  core: Pick<ReconcileResult, "matched" | "review" | "onlyPdv">
): string[] {
  const ids: string[] = [];
  for (const m of core.matched || []) {
    ids.push(m.payment.pedidoId);
    for (const r of m.relatedPayments || []) ids.push(r.pedidoId);
  }
  for (const r of core.review || []) {
    if (r.payment) ids.push(r.payment.pedidoId);
    for (const c of r.candidates || []) ids.push(c.pedidoId);
  }
  for (const p of core.onlyPdv || []) ids.push(p.pedidoId);
  return ids;
}

export function sheetsLabelForStatus(
  status: "confirmed" | "pending" | "rejected" | "unmatched"
): "Localizado" | "Dúvida" | "Não localizado" {
  if (status === "confirmed") return "Localizado";
  if (status === "pending") return "Dúvida";
  return "Não localizado";
}
