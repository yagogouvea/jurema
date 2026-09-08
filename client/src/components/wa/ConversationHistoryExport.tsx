import { useEffect, useState } from "react";
import { Calendar, Download, History, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { downloadConversationHistoryPdf } from "@/lib/waConversationPdf";
import { addCalendarDaysYmdSaoPaulo, todayYmdSaoPaulo } from "@shared/spCalendar";
import { formatYmdBr, isValidYmd } from "@shared/waConversationHistory";

export type ChatHistoryFilter =
  | { mode: "all" }
  | { mode: "range"; fromYmd: string; toYmd: string };

function lastDaysRange(days: number): { fromYmd: string; toYmd: string } {
  const toYmd = todayYmdSaoPaulo();
  return { fromYmd: addCalendarDaysYmdSaoPaulo(toYmd, -(days - 1)), toYmd };
}

export default function ConversationHistoryExport({
  conversationId,
  contactName,
  contactPhone,
  instanceName,
  filter,
  onFilterChange,
}: {
  conversationId: number;
  contactName?: string | null;
  contactPhone?: string | null;
  instanceName?: string | null;
  filter: ChatHistoryFilter | null;
  onFilterChange: (next: ChatHistoryFilter | null) => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [fromYmd, setFromYmd] = useState(() => lastDaysRange(3).fromYmd);
  const [toYmd, setToYmd] = useState(() => lastDaysRange(3).toYmd);
  const [downloading, setDownloading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const pullMut = trpc.wa.pullConversationHistory.useMutation();

  const pullIntoChat = async (days = 7) => {
    const range = lastDaysRange(days);
    onFilterChange({ mode: "range", ...range });
    setFromYmd(range.fromYmd);
    setToYmd(range.toYmd);
    setPulling(true);
    try {
      const result = await pullMut.mutateAsync({ conversationId, days });
      toast.success(
        result.requested
          ? "Histórico pedido ao WhatsApp. Áudio, vídeo e foto entram nesta conversa."
          : (result.message || "Mostrando o que já estava salvo nesta conversa")
      );
      utils.wa.listConversationHistory.invalidate();
      utils.wa.listMessages.invalidate({ conversationId });
      window.setTimeout(() => {
        utils.wa.listConversationHistory.invalidate();
        utils.wa.listMessages.invalidate({ conversationId });
      }, 4000);
      window.setTimeout(() => {
        utils.wa.listConversationHistory.invalidate();
        utils.wa.listMessages.invalidate({ conversationId });
      }, 12000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para puxar do WhatsApp");
    } finally {
      setPulling(false);
    }
  };

  useEffect(() => {
    if (filter?.mode === "range") {
      setFromYmd(filter.fromYmd);
      setToYmd(filter.toYmd);
    }
  }, [filter]);

  const applyPreset = (days: number | "all") => {
    if (days === "all") {
      onFilterChange({ mode: "all" });
      return;
    }
    const range = lastDaysRange(days);
    setFromYmd(range.fromYmd);
    setToYmd(range.toYmd);
    onFilterChange({ mode: "range", ...range });
  };

  const applyDraftRange = () => {
    if (!isValidYmd(fromYmd) || !isValidYmd(toYmd)) {
      toast.error("Escolha um período válido");
      return;
    }
    const start = fromYmd <= toYmd ? fromYmd : toYmd;
    const end = fromYmd <= toYmd ? toYmd : fromYmd;
    onFilterChange({ mode: "range", fromYmd: start, toYmd: end });
  };

  const fetchHistory = async () => {
    const useAll = filter?.mode === "all";
    const rangeFrom = filter?.mode === "range" ? filter.fromYmd : fromYmd;
    const rangeTo = filter?.mode === "range" ? filter.toYmd : toYmd;
    if (!useAll && (!isValidYmd(rangeFrom) || !isValidYmd(rangeTo))) {
      throw new Error("Escolha um período válido");
    }
    const start = !useAll && rangeFrom <= rangeTo ? rangeFrom : rangeTo;
    const end = !useAll && rangeFrom <= rangeTo ? rangeTo : rangeFrom;
    const data = await utils.wa.listConversationHistory.fetch({
      conversationId,
      fromYmd: useAll ? undefined : start,
      toYmd: useAll ? undefined : end,
    });
    if (!data.messages.length) {
      throw new Error("Nenhuma mensagem nesse período no painel");
    }
    return data;
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const data = await fetchHistory();
      downloadConversationHistoryPdf({
        contactName: data.conversation.contactName || contactName,
        contactPhone: data.conversation.contactPhone || contactPhone,
        instanceName: data.conversation.instanceName || instanceName,
        fromYmd: data.fromYmd,
        toYmd: data.toYmd,
        truncated: data.truncated,
        limit: data.limit,
        messages: data.messages,
      });
      toast.success("PDF baixado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para gerar o PDF");
    } finally {
      setDownloading(false);
    }
  };

  const filterActive = filter != null;
  const periodLabel =
    filter?.mode === "all"
      ? "Tudo (salvo)"
      : filter?.mode === "range"
        ? `${formatYmdBr(filter.fromYmd)} – ${formatYmdBr(filter.toYmd)}`
        : null;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <button
        type="button"
        onClick={() => pullIntoChat(7)}
        disabled={pulling}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all disabled:opacity-50"
        style={{ color: "#25D366", borderColor: "#25D366", background: "#25D36614" }}
        title="Mostra o histórico nesta conversa, com áudio, vídeo e foto"
      >
        {pulling ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
        Puxar histórico
      </button>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
          style={{
            color: filterActive ? "#25D366" : "#555",
            background: filterActive ? "#25D36614" : undefined,
          }}
          aria-label={periodLabel ? `Histórico: ${periodLabel}` : "Período e PDF da conversa"}
          title={periodLabel ? `Histórico: ${periodLabel}` : "Período e PDF"}
        >
          <Calendar size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[300px] p-3 border"
        style={{ background: "#161616", borderColor: "#2a2a2a", color: "#d0d0d0" }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-xs font-bold" style={{ color: "#fff" }}>Histórico desta conversa</p>
            <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "#666" }}>
              O histórico abre nesta conversa. Áudio, vídeo e foto tocam aqui.
            </p>
          </div>
          {filterActive && (
            <button
              type="button"
              onClick={() => onFilterChange(null)}
              className="text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1"
              style={{ color: "#999", background: "#222" }}
            >
              <X size={10} /> Limpar
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {[
            { label: "Hoje", days: 1 as const },
            { label: "3 dias", days: 3 as const },
            { label: "7 dias", days: 7 as const },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.days)}
              className="px-2 py-1 rounded-md text-[10px] font-bold"
              style={{ background: "#222", color: "#bbb", border: "1px solid #2a2a2a" }}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => applyPreset("all")}
            className="px-2 py-1 rounded-md text-[10px] font-bold"
            style={{ background: "#222", color: "#bbb", border: "1px solid #2a2a2a" }}
          >
            Tudo
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold" style={{ color: "#777" }}>De</span>
            <input
              type="date"
              value={fromYmd}
              onChange={(e) => setFromYmd(e.target.value)}
              className="rounded-md px-2 py-1.5 text-xs outline-none"
              style={{ background: "#111", border: "1px solid #2a2a2a", color: "#fff" }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold" style={{ color: "#777" }}>Até</span>
            <input
              type="date"
              value={toYmd}
              onChange={(e) => setToYmd(e.target.value)}
              className="rounded-md px-2 py-1.5 text-xs outline-none"
              style={{ background: "#111", border: "1px solid #2a2a2a", color: "#fff" }}
            />
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => {
              applyDraftRange();
              void pullIntoChat(7);
              setOpen(false);
            }}
            disabled={pulling}
            className="w-full rounded-md py-2 text-[11px] font-bold disabled:opacity-50"
            style={{ background: "#1d3a2a", color: "#25D366", border: "1px solid #25D36633" }}
          >
            {pulling ? "Puxando…" : "Puxar e ver nesta conversa"}
          </button>
          <button
            type="button"
            onClick={() => downloadPdf()}
            disabled={downloading}
            className="w-full rounded-md py-2 text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: "#222", color: "#ddd", border: "1px solid #2a2a2a" }}
          >
            {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {filter?.mode === "all" ? "Baixar PDF (só texto)" : "Baixar PDF (só texto)"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
    </div>
  );
}
