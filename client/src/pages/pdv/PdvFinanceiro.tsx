import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import {
  Landmark, Upload, FileText, Copy, Download, Loader2, RefreshCw, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Tab = "matched" | "review" | "onlyExtract" | "onlyPdv";

export default function PdvFinanceiro() {
  const { isAdmin } = usePdvAuth();
  const utils = trpc.useUtils();
  const [fileName, setFileName] = useState<string>("");
  const [pdfBase64, setPdfBase64] = useState<string>("");
  const [source, setSource] = useState<"auto" | "infinitepay" | "mercado_pago">("auto");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [beforeHours, setBeforeHours] = useState(36);
  const [afterHours, setAfterHours] = useState(72);
  const [tab, setTab] = useState<Tab>("matched");
  const [result, setResult] = useState<any>(null);

  const history = trpc.pdvFinanceiro.list.useQuery({ limit: 15 }, { enabled: isAdmin });
  const reconcile = trpc.pdvFinanceiro.reconcile.useMutation({
    onSuccess: (data) => {
      setResult(data);
      if (data.period?.start) setPeriodStart(data.period.start);
      if (data.period?.end) setPeriodEnd(data.period.end);
      setTab(data.totals.reviewCount > 0 ? "review" : "matched");
      utils.pdvFinanceiro.list.invalidate();
      const per =
        data.period?.start && data.period?.end
          ? ` · período ${data.period.start} → ${data.period.end}`
          : "";
      toast.success(
        `Análise ok (${data.source}${per}): ${data.totals.matchCount} localizados, ${data.totals.reviewCount} para revisar`
      );
    },
    onError: (e) => toast.error(e.message || "Falha na conciliação"),
  });

  const confirmReview = trpc.pdvFinanceiro.confirmReview.useMutation({
    onSuccess: (data) => {
      setResult((prev: any) => ({
        ...prev,
        ...data,
        reportPdfBase64: prev?.reportPdfBase64,
        reconciliationId: data.reconciliationId,
      }));
      utils.pdvFinanceiro.list.invalidate();
      toast.success("Revisão atualizada");
    },
    onError: (e) => toast.error(e.message || "Falha ao confirmar"),
  });

  const [loadingHistoryId, setLoadingHistoryId] = useState<number | null>(null);
  const openHistory = async (id: number) => {
    setLoadingHistoryId(id);
    try {
      const data = await utils.pdvFinanceiro.get.fetch({ id });
      setResult({
        reconciliationId: data.id,
        source: data.source,
        period:
          data.periodStart && data.periodEnd
            ? {
                start: String(data.periodStart).slice(0, 10),
                end: String(data.periodEnd).slice(0, 10),
              }
            : null,
        accountLabel: data.accountLabel,
        totals: data.totals,
        narrativeText: data.narrativeText,
        ...(data.result || {}),
      });
      setTab((data.totals?.reviewCount ?? 0) > 0 ? "review" : "matched");
      toast.success(`Conciliação #${data.id} carregada`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar");
    } finally {
      setLoadingHistoryId(null);
    }
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Envie um arquivo PDF");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("PDF maior que 8 MB");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setPdfBase64(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const run = () => {
    if (!pdfBase64) {
      toast.error("Anexe o PDF do extrato (InfinitePay ou Mercado Pago)");
      return;
    }
    reconcile.mutate({
      pdfBase64,
      fileName,
      source,
      periodStart: periodStart || undefined,
      periodEnd: periodEnd || undefined,
      beforeHours,
      afterHours,
      persist: true,
      generatePdf: true,
    });
  };

  const copyNarrative = async () => {
    if (!result?.narrativeText) return;
    await navigator.clipboard.writeText(result.narrativeText);
    toast.success("Resumo copiado");
  };

  const downloadPdf = () => {
    if (!result?.reportPdfBase64) {
      toast.error("PDF do relatório ainda não disponível");
      return;
    }
    const a = document.createElement("a");
    a.href = `data:application/pdf;base64,${result.reportPdfBase64}`;
    a.download = `conciliacao-${result.period?.start || "extrato"}.pdf`;
    a.click();
  };

  const tabs = useMemo(
    () =>
      [
        { id: "matched" as const, label: "Localizados", n: result?.matched?.length ?? 0 },
        { id: "review" as const, label: "Revisar", n: result?.review?.length ?? 0 },
        { id: "onlyExtract" as const, label: "Só extrato", n: result?.onlyExtract?.length ?? 0 },
        { id: "onlyPdv" as const, label: "Só PDV", n: result?.onlyPdv?.length ?? 0 },
      ] as const,
    [result]
  );

  if (!isAdmin) {
    return (
      <PdvLayout>
        <div className="p-8 text-gray-400">Acesso restrito ao administrador.</div>
      </PdvLayout>
    );
  }

  return (
    <PdvLayout>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-700/30 border border-emerald-600/40 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Financeiro</h1>
            <p className="text-sm text-gray-400">
              Anexe o extrato do banco (InfinitePay ou Mercado Pago) — não o Relatório de Vendas do PDV
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-[220px]">
              <span className="text-xs text-gray-500 block mb-1">PDF do extrato</span>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-200 hover:border-emerald-600">
                  <Upload className="w-4 h-4" />
                  {fileName || "Escolher PDF"}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </label>
            <label>
              <span className="text-xs text-gray-500 block mb-1">Origem</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value="auto">Detectar automático</option>
                <option value="infinitepay">InfinitePay</option>
                <option value="mercado_pago">Mercado Pago</option>
              </select>
            </label>
            <label>
              <span className="text-xs text-gray-500 block mb-1">Período início</span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
                title="Opcional: se vazio, usa o período lido do PDF"
              />
            </label>
            <label>
              <span className="text-xs text-gray-500 block mb-1">Período fim</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
                title="Opcional: se vazio, usa o período lido do PDF"
              />
            </label>
            <label>
              <span className="text-xs text-gray-500 block mb-1">PIX antes do pedido (h)</span>
              <input
                type="number"
                min={0}
                max={168}
                value={beforeHours}
                onChange={(e) => setBeforeHours(Number(e.target.value) || 0)}
                className="w-24 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <label>
              <span className="text-xs text-gray-500 block mb-1">PIX depois do pedido (h)</span>
              <input
                type="number"
                min={0}
                max={168}
                value={afterHours}
                onChange={(e) => setAfterHours(Number(e.target.value) || 0)}
                className="w-24 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              onClick={run}
              disabled={reconcile.isPending || !pdfBase64}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
            >
              {reconcile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Analisar
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Use o PDF da InfinitePay (<strong className="text-gray-200">Relatório de movimentações</strong>) ou do
            Mercado Pago (<strong className="text-gray-200">Extrato de conta</strong>). O sistema lê o período e
            compara só os pedidos do PDV nessa janela.
          </p>
          <p className="text-xs text-amber-400/90">
            Se a detecção automática falhar, escolha <strong className="text-amber-300">Mercado Pago</strong> ou{" "}
            <strong className="text-amber-300">InfinitePay</strong> em Origem antes de Analisar.
          </p>
          <p className="text-xs text-gray-500 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Pix recebido / QR Pix × PIX do PDV. Liberação de dinheiro (MP) × Débito/Crédito
            (valor líquido, bruto ou lote). Pix enviado e empréstimos são ignorados.
          </p>
        </div>

        {result && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
              Período analisado:{" "}
              <strong>
                {result.period?.start || "?"} → {result.period?.end || "?"}
              </strong>
              <span className="text-emerald-200/70">
                {" "}
                · {result.source}
                {result.accountLabel ? ` · ${result.accountLabel}` : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["Extrato (entradas)", result.totals.extractInCents],
                ["Localizados", result.totals.matchedCents],
                ["Só extrato", result.totals.onlyExtractCents],
                ["Só PDV", result.totals.onlyPdvCents],
              ].map(([label, cents]) => (
                <div key={String(label)} className="rounded-xl border border-gray-800 bg-gray-900/50 p-3">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
                  <div className="text-lg font-semibold text-white mt-1">{fmtBRL(Number(cents))}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyNarrative}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
              >
                <Copy className="w-4 h-4" /> Copiar resumo
              </button>
              <button
                onClick={downloadPdf}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
              >
                <Download className="w-4 h-4" /> Baixar PDF
              </button>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Resumo
              </div>
              <pre className="whitespace-pre-wrap text-sm text-gray-200 font-sans leading-relaxed">
                {result.narrativeText}
              </pre>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    tab === t.id ? "bg-emerald-700 text-white" : "text-gray-400 hover:bg-gray-800"
                  }`}
                >
                  {t.label} ({t.n})
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-gray-800 overflow-hidden">
              {tab === "matched" && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2">Pedido</th>
                      <th className="text-left px-3 py-2">Valor</th>
                      <th className="text-left px-3 py-2">Tipo</th>
                      <th className="text-left px-3 py-2">Pagador (extrato)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.matched || []).map((m: any, i: number) => (
                      <tr key={i} className="border-t border-gray-800 text-gray-200">
                        <td className="px-3 py-2">
                          {m.payment.pedidoId}
                          {m.relatedPayments?.length > 0 && (
                            <span className="block text-[10px] text-gray-500">
                              +{m.relatedPayments.map((p: any) => p.pedidoId).join(", ")}
                            </span>
                          )}
                          {m.payment.formaPagamento && (
                            <span className="block text-[10px] text-emerald-500/80">
                              {m.payment.formaPagamento}
                              {m.payment.matchBasis ? ` · ${m.payment.matchBasis}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{fmtBRL(m.payment.valorCents)}</td>
                        <td className="px-3 py-2 text-xs text-gray-400">
                          {m.kind} · {m.confidence}
                          {m.notes && <span className="block text-[10px] text-gray-500">{m.notes}</span>}
                        </td>
                        <td className="px-3 py-2">
                          {m.extract.map((e: any) => e.payerNameRaw).join(" + ")}
                        </td>
                      </tr>
                    ))}
                    {!result.matched?.length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                          Nenhum match automático
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {tab === "review" && (
                <div className="divide-y divide-gray-800">
                  {(result.review || []).map((r: any, i: number) => (
                    <div key={i} className="p-3 text-sm text-gray-200 space-y-2">
                      <div className="text-amber-400 text-xs">{r.reason}</div>
                      <div>
                        {r.extract?.map((e: any) => (
                          <div key={e.id}>
                            {e.date} {e.time} · {fmtBRL(e.amountCents)} · {e.payerNameRaw}
                          </div>
                        ))}
                      </div>
                      {r.candidates?.length > 0 && result.reconciliationId && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {r.candidates.map((c: any) => (
                            <button
                              key={c.paymentId}
                              disabled={confirmReview.isPending}
                              onClick={() =>
                                confirmReview.mutate({
                                  reconciliationId: result.reconciliationId,
                                  reviewIndex: i,
                                  paymentId: c.paymentId,
                                  action: "confirm",
                                })
                              }
                              className="px-2.5 py-1 rounded-lg text-xs bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
                              title={`Score ${c.score}`}
                            >
                              Confirmar {c.pedidoId}
                              <span className="opacity-70"> · {fmtBRL(c.valorCents)}</span>
                            </button>
                          ))}
                          <button
                            disabled={confirmReview.isPending}
                            onClick={() =>
                              confirmReview.mutate({
                                reconciliationId: result.reconciliationId,
                                reviewIndex: i,
                                action: "dismiss",
                                paymentId: null,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 disabled:opacity-50"
                          >
                            Dispensar
                          </button>
                        </div>
                      )}
                      {r.candidates?.length > 0 && !result.reconciliationId && (
                        <div className="text-xs text-gray-500">
                          Salve a análise (com persistência) para confirmar candidatos.
                        </div>
                      )}
                      {!r.candidates?.length && result.reconciliationId && (
                        <button
                          disabled={confirmReview.isPending}
                          onClick={() =>
                            confirmReview.mutate({
                              reconciliationId: result.reconciliationId,
                              reviewIndex: i,
                              action: "dismiss",
                              paymentId: null,
                            })
                          }
                          className="px-2.5 py-1 rounded-lg text-xs border border-gray-700 text-gray-400 hover:bg-gray-800"
                        >
                          Dispensar
                        </button>
                      )}
                    </div>
                  ))}
                  {!result.review?.length && (
                    <div className="p-6 text-center text-gray-500 text-sm">Nada para revisar</div>
                  )}
                </div>
              )}

              {tab === "onlyExtract" && (
                <div className="divide-y divide-gray-800">
                  {(result.onlyExtract || []).map((e: any) => (
                    <div key={e.id} className="px-3 py-2 text-sm text-gray-200">
                      {e.date} {e.time} · {fmtBRL(e.amountCents)} · {e.payerNameRaw}
                    </div>
                  ))}
                  {!result.onlyExtract?.length && (
                    <div className="p-6 text-center text-gray-500 text-sm">—</div>
                  )}
                </div>
              )}

              {tab === "onlyPdv" && (
                <div className="divide-y divide-gray-800">
                  {(result.onlyPdv || []).map((p: any) => (
                    <div key={p.paymentId} className="px-3 py-2 text-sm text-gray-200">
                      {p.pedidoId} · {fmtBRL(p.valorCents)} ·{" "}
                      {p.formaPagamento || "PIX"} · {p.clienteNome || p.nomePix || "sem nome"}{" "}
                      <span className="text-gray-500">({p.status})</span>
                    </div>
                  ))}
                  {!result.onlyPdv?.length && (
                    <div className="p-6 text-center text-gray-500 text-sm">—</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-sm font-semibold text-white mb-3">Histórico recente</h2>
          <div className="space-y-2">
            {(history.data || []).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => openHistory(h.id)}
                disabled={loadingHistoryId === h.id}
                className="w-full text-left flex flex-wrap items-center justify-between gap-2 text-sm border border-gray-800 rounded-xl px-3 py-2 hover:border-emerald-700/50 disabled:opacity-50"
              >
                <div className="text-gray-300">
                  #{h.id} · {h.source} · {String(h.periodStart || "?").slice(0, 10)} →{" "}
                  {String(h.periodEnd || "?").slice(0, 10)}
                  <span className="text-gray-500"> · {h.createdBy}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {h.totals?.matchCount ?? "—"} localizados · {h.totals?.reviewCount ?? 0} revisar
                </div>
              </button>
            ))}
            {!history.data?.length && (
              <div className="text-sm text-gray-500">Nenhuma conciliação salva ainda.</div>
            )}
          </div>
        </div>
      </div>
    </PdvLayout>
  );
}
