import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import {
  Landmark, Upload, FileText, Copy, Download, Loader2, RefreshCw, AlertTriangle,
  ChevronDown, Search,
} from "lucide-react";
import { toast } from "sonner";

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDt(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return String(iso).slice(0, 16);
  }
}

type Tab = "confirmed" | "review" | "unmatched" | "extractOnly";

export default function PdvFinanceiro() {
  const { isAdmin } = usePdvAuth();
  const utils = trpc.useUtils();
  const [files, setFiles] = useState<Array<{ fileName: string; pdfBase64: string }>>([]);
  const [source, setSource] = useState<"auto" | "infinitepay" | "mercado_pago">("auto");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [beforeHours, setBeforeHours] = useState(36);
  const [afterHours, setAfterHours] = useState(72);
  const [tab, setTab] = useState<Tab>("confirmed");
  const [result, setResult] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [showNarrative, setShowNarrative] = useState(false);

  const history = trpc.pdvFinanceiro.list.useQuery({ limit: 15 }, { enabled: isAdmin });
  const reconcile = trpc.pdvFinanceiro.reconcile.useMutation({
    onSuccess: (data) => {
      setResult(data);
      if (data.period?.start) setPeriodStart(data.period.start);
      if (data.period?.end) setPeriodEnd(data.period.end);
      const reviewN = data.ordersReview?.length ?? data.totals.reviewCount ?? 0;
      setTab(reviewN > 0 ? "review" : "confirmed");
      utils.pdvFinanceiro.list.invalidate();
      toast.success(
        `Período ${data.period?.start || "?"} → ${data.period?.end || "?"}: ${data.ordersConfirmed?.length ?? data.totals.matchCount} confirmados, ${reviewN} dúvidas`
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
      toast.success("Atualizado — status gravado no pedido e na planilha");
    },
    onError: (e) => toast.error(e.message || "Falha ao confirmar"),
  });

  const [loadingHistoryId, setLoadingHistoryId] = useState<number | null>(null);
  const openHistory = async (id: number) => {
    setLoadingHistoryId(id);
    try {
      const data = await utils.pdvFinanceiro.get.fetch({ id });
      const res = data.result || {};
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
        matched: res.matched,
        review: res.review,
        onlyExtract: res.onlyExtract,
        onlyPdv: res.onlyPdv,
        ordersConfirmed: res.ordersConfirmed,
        ordersReview: res.ordersReview,
        ordersUnmatched: res.ordersUnmatched,
        extractUnmatched: res.extractUnmatched || res.onlyExtract,
        hasExcel: data.hasExcel,
      });
      setTab((res.ordersReview?.length ?? data.totals?.reviewCount ?? 0) > 0 ? "review" : "confirmed");
      toast.success(`Conciliação #${data.id} carregada`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar");
    } finally {
      setLoadingHistoryId(null);
    }
  };

  const onFiles = async (selected: FileList | null) => {
    if (!selected?.length) return;
    const chosen = Array.from(selected).slice(0, 2);
    if (selected.length > 2) {
      toast.error("Selecione no máximo dois extratos");
      return;
    }
    if (chosen.some((file) => !file.name.toLowerCase().endsWith(".pdf"))) {
      toast.error("Envie somente arquivos PDF");
      return;
    }
    if (chosen.some((file) => file.size > 8 * 1024 * 1024)) {
      toast.error("Cada PDF pode ter no máximo 8 MB");
      return;
    }
    const loaded = await Promise.all(
      chosen.map(
        (file) =>
          new Promise<{ fileName: string; pdfBase64: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({ fileName: file.name, pdfBase64: String(reader.result || "") });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    setFiles(loaded);
  };

  const run = () => {
    if (!files.length) {
      toast.error("Anexe um ou dois extratos");
      return;
    }
    reconcile.mutate({
      files,
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
    if (!result?.narrativeText) {
      toast.error("Resumo ainda não gerado");
      return;
    }
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

  const downloadExcel = async () => {
    try {
      let base64 = result?.reportExcelBase64;
      if (!base64 && result?.reconciliationId) {
        const saved = await utils.pdvFinanceiro.getReportExcel.fetch({
          id: result.reconciliationId,
        });
        base64 = saved.base64;
      }
      if (!base64) {
        toast.error("Planilha ainda não disponível");
        return;
      }
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `conciliacao-${result.period?.start || "extrato"}-${result.period?.end || ""}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível baixar a planilha");
    }
  };

  const confirmed = result?.ordersConfirmed || [];
  const reviews = result?.ordersReview || [];
  const unmatched = result?.ordersUnmatched || [];
  const extractOnly = result?.extractUnmatched || result?.onlyExtract || [];
  // Um pedido pode ter mais de um pagamento; o card conta pedidos.
  const unmatchedPedidos = useMemo(
    () => new Set(unmatched.map((p: any) => p.order?.pedidoId).filter(Boolean)).size,
    [unmatched]
  );

  const q = search.trim().toLowerCase();
  const filterConfirmed = useMemo(() => {
    if (!q) return confirmed;
    return confirmed.filter((r: any) => {
      const blob = [
        r.order?.pedidoId,
        r.order?.clienteNome,
        r.order?.sellerName,
        r.nomePix,
        r.obsPagamento,
        r.extract?.map((e: any) => e.payerNameRaw).join(" "),
        String(r.valorPdvCents / 100),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [confirmed, q]);

  const tabs = useMemo(
    () =>
      [
        { id: "confirmed" as const, label: "Confirmados", n: confirmed.length },
        { id: "review" as const, label: "Dúvidas", n: reviews.length },
        { id: "unmatched" as const, label: "Pedidos sem extrato", n: unmatchedPedidos },
        { id: "extractOnly" as const, label: "Extrato sem pedido", n: extractOnly.length },
      ] as const,
    [confirmed.length, reviews.length, unmatchedPedidos, extractOnly.length]
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
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-700/30 border border-emerald-600/40 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Financeiro</h1>
            <p className="text-sm text-gray-400">
              InfinitePay = Pix · Mercado Pago = débito/crédito (liberação, sem nome —
              casa por valor com taxa 3%/5% e data)
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex-1 min-w-[220px]">
              <span className="text-xs text-gray-500 block mb-1">
                Extratos PDF (até 2 — InfinitePay e/ou Mercado Pago)
              </span>
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-200 hover:border-emerald-600">
                <Upload className="w-4 h-4" />
                {files.length
                  ? `${files.length} extrato${files.length > 1 ? "s" : ""} selecionado${files.length > 1 ? "s" : ""}`
                  : "Escolher 1 ou 2 PDFs"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  aria-label="Selecionar até dois extratos em PDF"
                  onChange={(e) => onFiles(e.target.files)}
                />
              </label>
              {files.length > 0 && (
                <span className="block mt-1 text-[11px] text-gray-500 truncate">
                  {files.map((file) => file.fileName).join(" + ")}
                </span>
              )}
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
              />
            </label>
            <label>
              <span className="text-xs text-gray-500 block mb-1">Período fim</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <label>
              <span className="text-xs text-gray-500 block mb-1">PIX antes (h)</span>
              <input
                type="number"
                min={0}
                max={168}
                value={beforeHours}
                onChange={(e) => setBeforeHours(Number(e.target.value) || 0)}
                className="w-20 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <label>
              <span className="text-xs text-gray-500 block mb-1">PIX depois (h)</span>
              <input
                type="number"
                min={0}
                max={168}
                value={afterHours}
                onChange={(e) => setAfterHours(Number(e.target.value) || 0)}
                className="w-20 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              onClick={run}
              disabled={reconcile.isPending || !files.length}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
            >
              {reconcile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Analisar
            </button>
          </div>
          <p className="text-xs text-gray-400">
            InfinitePay casa Pix por valor + nome (<strong className="text-gray-200">Quem pagou</strong>).
            Mercado Pago casa só débito/crédito pela <strong className="text-gray-200">Liberação de dinheiro</strong>
            {" "}(sem nome) — compara o valor da maquininha com a taxa de 3% (débito) ou 5% (crédito) e a data do pedido.
            O mesmo pagamento não é usado duas vezes.
          </p>
          <p className="text-xs text-gray-500 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Ao confirmar ou dispensar, o status vai para o pagamento no PDV e para a coluna Conciliação em VENDAS_CAIXA.
          </p>
        </div>

        {result && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
              Período:{" "}
              <strong>
                {result.period?.start || "?"} → {result.period?.end || "?"}
              </strong>
              <span className="text-emerald-200/70">
                {" "}
                · {result.source}
                {result.accountLabel ? ` · ${result.accountLabel}` : ""}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                {
                  label: "Confirmados",
                  n: confirmed.length,
                  money: fmtBRL(result.totals?.matchedCents || 0),
                  hint: "Pagamentos do período localizados no extrato",
                },
                {
                  label: "Dúvidas",
                  n: reviews.length,
                  money: "—",
                  hint: "Precisam de confirmação manual",
                },
                {
                  label: "Pedidos sem extrato",
                  n: unmatchedPedidos,
                  money: fmtBRL(result.totals?.onlyPdvCents || 0),
                  hint: `Pedidos de ${result.period?.start || "?"} a ${result.period?.end || "?"} sem lançamento correspondente`,
                },
                {
                  label: "Extrato sem pedido",
                  n: extractOnly.length,
                  money: fmtBRL(result.totals?.onlyExtractCents || 0),
                  hint: "Entradas do extrato sem pedido no PDV",
                },
                {
                  label: "Entradas extrato",
                  n: "—",
                  money: fmtBRL(result.totals?.extractInCents || 0),
                  hint: "Total creditado no extrato do período",
                },
              ].map(({ label, n, money, hint }) => (
                <div
                  key={label}
                  title={hint}
                  className="rounded-xl border border-gray-800 bg-gray-900/50 p-3"
                >
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
                  <div className="text-lg font-semibold text-white mt-1">
                    {n}
                    {money !== "—" && (
                      <span className="block text-xs font-normal text-gray-400 mt-0.5">{money}</span>
                    )}
                  </div>
                  <div className="text-[10px] leading-snug text-gray-600 mt-1">{hint}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar PED, cliente, valor…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white"
                />
              </div>
              <button
                onClick={downloadExcel}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-700 text-sm text-white hover:bg-emerald-600"
              >
                <Download className="w-4 h-4" /> Excel
              </button>
              <button
                onClick={downloadPdf}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
              >
                <Download className="w-4 h-4" /> PDF
              </button>
              <button
                type="button"
                onClick={() => setShowNarrative((v) => !v)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800"
              >
                <FileText className="w-4 h-4" />
                Resumo IA
                <ChevronDown className={`w-3.5 h-3.5 transition ${showNarrative ? "rotate-180" : ""}`} />
              </button>
            </div>

            {showNarrative && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="text-xs text-gray-500">Resumo opcional (não é a lista principal)</div>
                  <button
                    onClick={copyNarrative}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-white"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed max-h-48 overflow-auto">
                  {result.narrativeText || "Resumo não disponível nesta análise."}
                </pre>
              </div>
            )}

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
              {tab === "confirmed" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[960px]">
                    <thead className="bg-gray-900 text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">Pedido</th>
                        <th className="text-left px-3 py-2">Data/hora</th>
                        <th className="text-left px-3 py-2">Cliente</th>
                        <th className="text-left px-3 py-2">Vendedor</th>
                        <th className="text-left px-3 py-2">Canal</th>
                        <th className="text-left px-3 py-2">Forma</th>
                        <th className="text-left px-3 py-2">Quem pagou</th>
                        <th className="text-left px-3 py-2">Obs. pag.</th>
                        <th className="text-left px-3 py-2">Valor PDV</th>
                        <th className="text-left px-3 py-2">Pagador extrato</th>
                        <th className="text-left px-3 py-2">Valor extrato</th>
                        <th className="text-left px-3 py-2">Data extrato</th>
                        <th className="text-left px-3 py-2">Confiança</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterConfirmed.map((r: any) => {
                        const ex = r.extract?.[0];
                        const extractCents = (r.extract || []).reduce(
                          (s: number, e: any) => s + (e.amountCents || 0),
                          0
                        );
                        return (
                          <tr key={r.paymentId} className="border-t border-gray-800 text-gray-200">
                            <td className="px-3 py-2 font-medium text-emerald-300">{r.order?.pedidoId}</td>
                            <td className="px-3 py-2 text-xs text-gray-400">{fmtDt(r.order?.pedidoCreatedAt)}</td>
                            <td className="px-3 py-2">{r.order?.clienteNome || "—"}</td>
                            <td className="px-3 py-2">{r.order?.sellerName || "—"}</td>
                            <td className="px-3 py-2 text-xs">{r.order?.canal || "—"}</td>
                            <td className="px-3 py-2 text-xs">{r.formaPagamento}</td>
                            <td className="px-3 py-2 text-xs">{r.nomePix || "—"}</td>
                            <td className="px-3 py-2 text-xs text-gray-400 max-w-[140px] truncate" title={r.obsPagamento || undefined}>
                              {r.obsPagamento || "—"}
                            </td>
                            <td className="px-3 py-2">{fmtBRL(r.valorPdvCents)}</td>
                            <td className="px-3 py-2">
                              {(r.extract || []).map((e: any) => e.payerNameRaw).join(" + ") || "—"}
                            </td>
                            <td className="px-3 py-2">{extractCents ? fmtBRL(extractCents) : "—"}</td>
                            <td className="px-3 py-2 text-xs text-gray-400">
                              {ex ? `${ex.date} ${ex.time}` : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              <span
                                className={
                                  r.confidence === "high" ? "text-emerald-400" : "text-amber-400"
                                }
                              >
                                {r.confidence}
                              </span>
                              {r.matchBasis && (
                                <span className="block text-[10px] text-gray-500">{r.matchBasis}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!filterConfirmed.length && (
                        <tr>
                          <td colSpan={11} className="px-3 py-8 text-center text-gray-500">
                            Nenhum pedido confirmado
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "review" && (
                <div className="divide-y divide-gray-800">
                  {reviews.map((r: any) => (
                    <div key={r.reviewIndex} className="p-4 grid md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-wide text-amber-400/90">
                          Extrato · {r.reason}
                        </div>
                        {(r.extract || []).map((e: any) => (
                          <div
                            key={e.id}
                            className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-gray-200"
                          >
                            <div className="font-medium">{e.payerNameRaw}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {e.date} {e.time} · {fmtBRL(e.amountCents)}
                              {e.kindLabel ? ` · ${e.kindLabel}` : ""}
                            </div>
                          </div>
                        ))}
                        {!r.extract?.length && (
                          <div className="text-gray-500 text-xs">Sem linha de extrato</div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">
                          Pedidos candidatos — confirme se o pagamento é deste pedido
                        </div>
                        {(r.candidates || []).map((c: any) => (
                          <div
                            key={c.paymentId}
                            className="rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-3 space-y-2"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="font-semibold text-emerald-300">{c.order?.pedidoId}</span>
                              <span className="text-white">{fmtBRL(c.valorCents)}</span>
                            </div>
                            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-400">
                              <div>
                                <dt className="text-gray-600">Cliente</dt>
                                <dd className="text-gray-200">{c.order?.clienteNome || "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-600">Telefone</dt>
                                <dd className="text-gray-200">{c.order?.clienteTelefone || "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-600">Vendedor</dt>
                                <dd className="text-gray-200">{c.order?.sellerName || "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-600">Canal / regime</dt>
                                <dd className="text-gray-200">
                                  {c.order?.canal || "—"} · {c.order?.regime || "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-gray-600">Data pedido</dt>
                                <dd className="text-gray-200">{fmtDt(c.order?.pedidoCreatedAt)}</dd>
                              </div>
                              <div>
                                <dt className="text-gray-600">Quem pagou / score</dt>
                                <dd className="text-gray-200">
                                  {c.nomePix || "—"} · {c.score}
                                </dd>
                              </div>
                              {c.obsPagamento && (
                                <div className="col-span-2">
                                  <dt className="text-gray-600">Obs. pagamento</dt>
                                  <dd className="text-gray-300">{c.obsPagamento}</dd>
                                </div>
                              )}
                              <div className="col-span-2">
                                <dt className="text-gray-600">Itens</dt>
                                <dd className="text-gray-300">{c.order?.itemsSummary || "—"}</dd>
                              </div>
                              {c.order?.justificativa && (
                                <div className="col-span-2">
                                  <dt className="text-gray-600">Obs.</dt>
                                  <dd className="text-gray-300">{c.order.justificativa}</dd>
                                </div>
                              )}
                            </dl>
                            {result.reconciliationId ? (
                              <button
                                disabled={confirmReview.isPending}
                                onClick={() =>
                                  confirmReview.mutate({
                                    reconciliationId: result.reconciliationId,
                                    reviewIndex: r.reviewIndex,
                                    paymentId: c.paymentId,
                                    action: "confirm",
                                  })
                                }
                                className="w-full mt-1 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
                              >
                                É este pedido
                              </button>
                            ) : (
                              <div className="text-[11px] text-gray-500">Salve a análise para confirmar.</div>
                            )}
                          </div>
                        ))}
                        {!r.candidates?.length && (
                          <div className="text-xs text-gray-500">Nenhum pedido candidato</div>
                        )}
                        {result.reconciliationId && (
                          <button
                            disabled={confirmReview.isPending}
                            onClick={() =>
                              confirmReview.mutate({
                                reconciliationId: result.reconciliationId,
                                reviewIndex: r.reviewIndex,
                                action: "dismiss",
                                paymentId: null,
                              })
                            }
                            className="w-full px-3 py-2 rounded-lg text-xs border border-gray-700 text-gray-400 hover:bg-gray-800 disabled:opacity-50"
                          >
                            Não é nenhum / dispensar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!reviews.length && (
                    <div className="p-8 text-center text-gray-500 text-sm">Nenhuma dúvida pendente</div>
                  )}
                </div>
              )}

              {tab === "unmatched" && (
                <div className="overflow-x-auto">
                  <p className="px-3 py-2 text-[11px] text-gray-500">
                    {unmatchedPedidos} pedido{unmatchedPedidos === 1 ? "" : "s"} de{" "}
                    {result.period?.start || "?"} a {result.period?.end || "?"} ·{" "}
                    {unmatched.length} pagamento{unmatched.length === 1 ? "" : "s"} sem
                    lançamento correspondente no extrato
                  </p>
                  <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-gray-900 text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">Pedido</th>
                        <th className="text-left px-3 py-2">Data</th>
                        <th className="text-left px-3 py-2">Cliente</th>
                        <th className="text-left px-3 py-2">Vendedor</th>
                        <th className="text-left px-3 py-2">Forma</th>
                        <th className="text-left px-3 py-2">Quem pagou</th>
                        <th className="text-left px-3 py-2">Obs. pag.</th>
                        <th className="text-left px-3 py-2">Valor</th>
                        <th className="text-left px-3 py-2">Itens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatched.map((p: any) => (
                        <tr key={p.paymentId} className="border-t border-gray-800 text-gray-200">
                          <td className="px-3 py-2 text-amber-300">{p.order?.pedidoId}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{fmtDt(p.order?.pedidoCreatedAt)}</td>
                          <td className="px-3 py-2">{p.order?.clienteNome || "—"}</td>
                          <td className="px-3 py-2">{p.order?.sellerName || "—"}</td>
                          <td className="px-3 py-2 text-xs">{p.formaPagamento}</td>
                          <td className="px-3 py-2 text-xs">{p.nomePix || "—"}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 max-w-[140px] truncate" title={p.obsPagamento || undefined}>
                            {p.obsPagamento || "—"}
                          </td>
                          <td className="px-3 py-2">{fmtBRL(p.valorCents)}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 max-w-xs truncate">
                            {p.order?.itemsSummary || "—"}
                          </td>
                        </tr>
                      ))}
                      {!unmatched.length && (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                            Todos os pagamentos do período têm correspondência ou estão em dúvida
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "extractOnly" && (
                <div className="divide-y divide-gray-800">
                  {extractOnly.map((e: any) => (
                    <div key={e.id} className="px-3 py-2.5 text-sm text-gray-200 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="text-gray-400 text-xs">
                        {e.date} {e.time}
                      </span>
                      <span>{fmtBRL(e.amountCents)}</span>
                      <span>{e.payerNameRaw}</span>
                      {e.kindLabel && (
                        <span className="text-[10px] text-gray-500 uppercase">{e.kindLabel}</span>
                      )}
                    </div>
                  ))}
                  {!extractOnly.length && (
                    <div className="p-8 text-center text-gray-500 text-sm">—</div>
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
                  {h.totals?.orderConfirmedCount ?? h.totals?.matchCount ?? "—"} confirmados ·{" "}
                  {h.totals?.orderReviewCount ?? h.totals?.reviewCount ?? 0} dúvidas
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
