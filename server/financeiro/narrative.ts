import { ENV } from "../_core/env";
import { invokeLLM } from "../_core/llm";
import { formatCentsBRL } from "./normalize";
import type { ReconcileResult } from "./types";

function firstText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
      .join("")
      .trim();
  }
  return "";
}

/** Resumo determinístico se a LLM falhar. */
export function buildFallbackNarrative(
  result: Omit<ReconcileResult, "narrativeText" | "reportPdfBase64">
): string {
  const p = result.period
    ? `${result.period.start} a ${result.period.end}`
    : "período do extrato";
  const lines = [
    `Conciliação InfinitePay — ${p}`,
    result.accountLabel ? `Conta: ${result.accountLabel}` : null,
    "",
    `Entradas no extrato (Pix recebido): ${formatCentsBRL(result.totals.extractInCents)}`,
    `Localizados: ${result.totals.matchCount} (${formatCentsBRL(result.totals.matchedCents)})`,
    `Para revisar: ${result.totals.reviewCount}`,
    `Só no extrato: ${result.onlyExtract.length} (${formatCentsBRL(result.totals.onlyExtractCents)})`,
    `Só no PDV (PIX sem match): ${result.onlyPdv.length} (${formatCentsBRL(result.totals.onlyPdvCents)})`,
    "",
  ].filter((x) => x !== null) as string[];

  if (result.onlyExtract.length > 0) {
    lines.push("Destaques — só no extrato:");
    for (const l of result.onlyExtract.slice(0, 8)) {
      lines.push(
        `• ${l.date} ${l.time} ${formatCentsBRL(l.amountCents)} — ${l.payerNameRaw}`
      );
    }
    if (result.onlyExtract.length > 8) lines.push(`… +${result.onlyExtract.length - 8} linhas`);
    lines.push("");
  }

  if (result.onlyPdv.length > 0) {
    lines.push("Destaques — só no PDV:");
    for (const p of result.onlyPdv.slice(0, 8)) {
      const obs = p.obsPagamento ? ` [${p.obsPagamento}]` : "";
      lines.push(
        `• ${p.pedidoId} ${formatCentsBRL(p.valorCents)} — ${p.clienteNome || p.nomePix || "sem nome"}${obs}`
      );
    }
    if (result.onlyPdv.length > 8) lines.push(`… +${result.onlyPdv.length - 8} pedidos`);
    lines.push("");
  }

  lines.push(
    "Análise assistida: casamentos feitos por regras (valor + janela de data + nome). Confira os itens em revisar antes de fechar o caixa."
  );
  return lines.join("\n");
}

export async function generateReconcileNarrative(
  result: Omit<ReconcileResult, "narrativeText" | "reportPdfBase64">
): Promise<string> {
  const compact = {
    period: result.period,
    accountLabel: result.accountLabel,
    totals: {
      extractIn: formatCentsBRL(result.totals.extractInCents),
      matched: formatCentsBRL(result.totals.matchedCents),
      onlyExtract: formatCentsBRL(result.totals.onlyExtractCents),
      onlyPdv: formatCentsBRL(result.totals.onlyPdvCents),
      matchCount: result.totals.matchCount,
      reviewCount: result.totals.reviewCount,
    },
    matchedSample: result.matched.slice(0, 25).map((m) => ({
      kind: m.kind,
      confidence: m.confidence,
      pedidoId: m.payment.pedidoId,
      forma: m.payment.formaPagamento || "PIX",
      valor: formatCentsBRL(m.payment.valorCents),
      notes: m.notes,
      pagador: m.extract.map((e) => e.payerNameRaw).join(" + "),
      lote: m.relatedPayments?.map((p) => p.pedidoId),
    })),
    reviewSample: result.review.slice(0, 15).map((r) => ({
      reason: r.reason,
      extract: r.extract?.map((e) => `${e.date} ${formatCentsBRL(e.amountCents)} ${e.payerNameRaw}`),
      candidates: r.candidates?.map((c) => `${c.pedidoId} score=${c.score}`),
    })),
    onlyExtractSample: result.onlyExtract.slice(0, 20).map((e) => ({
      when: `${e.date} ${e.time}`,
      valor: formatCentsBRL(e.amountCents),
      nome: e.payerNameRaw,
    })),
    onlyPdvSample: result.onlyPdv.slice(0, 20).map((p) => ({
      pedidoId: p.pedidoId,
      valor: formatCentsBRL(p.valorCents),
      cliente: p.clienteNome,
      quemPagou: p.nomePix,
      obsPagamento: p.obsPagamento,
    })),
    matchedWithPayer: result.matched.slice(0, 25).map((m) => ({
      pedidoId: m.payment.pedidoId,
      quemPagou: m.payment.nomePix,
      obsPagamento: m.payment.obsPagamento,
      pagadorExtrato: m.extract.map((e) => e.payerNameRaw).join(" + "),
    })),
  };

  try {
    const llm = await invokeLLM({
      model: ENV.openaiModelReport || "gpt-4o",
      maxTokens: 1800,
      messages: [
        {
          role: "system",
          content:
            "Você é analista financeiro da Jurema Sport. Escreva em português do Brasil, tom claro e profissional. " +
            "Use APENAS os dados JSON fornecidos. Não invente pedidos, valores ou casamentos. " +
            "Não declare como localizado o que estiver em review, onlyExtract ou onlyPdv. " +
            "Estruture: 1) visão geral e totais 2) o que casou 3) pendências e hipóteses curtas 4) próximos passos práticos.",
        },
        {
          role: "user",
          content: `Gere o resumo narrativo desta conciliação:\n${JSON.stringify(compact)}`,
        },
      ],
    });
    const text = firstText(llm);
    if (text.length > 40) return text;
  } catch (e) {
    console.warn("[financeiro] narrativa LLM falhou:", e);
  }
  return buildFallbackNarrative(result);
}
