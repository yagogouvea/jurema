import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import PdvLayout from "./PdvLayout";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, Send, Bot, BotOff, Zap, Paperclip,
  MessageCircle, Circle, CheckCircle2, Clock, Tag, Ban,
  ChevronDown, AlertCircle, Settings, Unlock, Info, ArrowLeft,
  Phone, User, Mic, Image, Video, FileText, MapPin, Smile,
  Play, Pause, Volume2, Loader2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ConvStatus = "novo" | "em_atendimento" | "aguardando" | "proposta_enviada" | "finalizado" | "spam" | "intervencao";

// ─── Configuração de status ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<ConvStatus, {
  label: string;
  color: string;
  bg: string;
  border: string;
  Icon: React.FC<{ size?: number }>;
}> = {
  novo:             { label: "Novo",             color: "#60a5fa", bg: "rgba(96,165,250,.15)",  border: "rgba(96,165,250,.3)",  Icon: Circle },
  em_atendimento:   { label: "Em atendimento",   color: "#34d399", bg: "rgba(52,211,153,.15)",  border: "rgba(52,211,153,.3)",  Icon: MessageCircle },
  aguardando:       { label: "Aguardando",       color: "#fbbf24", bg: "rgba(251,191,36,.15)",  border: "rgba(251,191,36,.3)",  Icon: Clock },
  proposta_enviada: { label: "Proposta enviada", color: "#a78bfa", bg: "rgba(167,139,250,.15)", border: "rgba(167,139,250,.3)", Icon: Tag },
  finalizado:       { label: "Finalizado",       color: "#6b7280", bg: "rgba(107,114,128,.15)", border: "rgba(107,114,128,.3)", Icon: CheckCircle2 },
  spam:             { label: "Spam",             color: "#f87171", bg: "rgba(248,113,113,.15)", border: "rgba(248,113,113,.3)", Icon: Ban },
  intervencao:      { label: "Intervenção",      color: "#fb923c", bg: "rgba(251,146,60,.18)", border: "rgba(251,146,60,.45)", Icon: AlertCircle },
};

// ─── Cores de avatar por contato ─────────────────────────────────────────────

const AVATAR_PALETTE = [
  "#25D366", "#3B82F6", "#F59E0B", "#EC4899", "#8B5CF6",
  "#06B6D4", "#EF4444", "#10B981", "#F97316", "#6366F1",
];

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

const INSTANCE_COLORS = ["#25D366", "#3B82F6", "#F59E0B", "#EC4899", "#8B5CF6"];
const getInstColor = (idx: number) => INSTANCE_COLORS[idx % INSTANCE_COLORS.length];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const diff = now.getTime() - d.getTime();

  if (isToday) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (isYesterday) return "Ontem";
  if (diff < 7 * 86400000) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMsgTime(ts?: string | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function formatPhone(phone?: string | null): string {
  if (!phone) return "Desconhecido";
  // Remove @s.whatsapp.net e formata o número
  const clean = phone.replace(/@s\.whatsapp\.net$/i, "").replace(/\D/g, "");
  if (clean.length === 13 && clean.startsWith("55")) {
    // +55 (XX) XXXXX-XXXX
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.length === 12 && clean.startsWith("55")) {
    // +55 (XX) XXXX-XXXX
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  }
  return `+${clean}`;
}

function getDisplayName(conv: any): string {
  if (conv.contactName && conv.contactName.trim()) return conv.contactName.trim();
  return formatPhone(conv.contactPhone);
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, byAi }: { status: ConvStatus; byAi?: boolean }) {
  const cfg = STATUS_CONFIG[status];
  const { Icon } = cfg;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
      title={byAi ? "Classificado automaticamente pela IA" : "Status definido manualmente"}
    >
      <Icon size={9} />
      {cfg.label}
      {byAi && <Bot size={8} style={{ opacity: 0.65 }} />}
    </span>
  );
}

// ─── StatusDropdown ───────────────────────────────────────────────────────────

function StatusDropdown({ current, onChange }: { current: ConvStatus; onChange: (s: ConvStatus) => void }) {
  const cfg = STATUS_CONFIG[current];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-0.5 hover:opacity-80 transition-opacity">
          <StatusBadge status={current} />
          <ChevronDown size={10} style={{ color: cfg.color }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-[#1a1a1a] border-[#2a2a2a] p-1">
        {(Object.keys(STATUS_CONFIG) as ConvStatus[]).map(s => (
          <DropdownMenuItem
            key={s}
            onClick={() => onChange(s)}
            className="cursor-pointer rounded hover:bg-[#252525] focus:bg-[#252525] p-1.5"
          >
            <StatusBadge status={s} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name,
  size = 40,
  instColor,
  instIdx,
}: {
  name?: string | null;
  size?: number;
  instColor?: string;
  instIdx?: number;
}) {
  const seed = name || "?";
  const color = getAvatarColor(seed);
  const initials = getInitials(name);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center font-bold select-none"
        style={{
          background: `${color}22`,
          color,
          fontSize: size * 0.35,
          border: `1.5px solid ${color}44`,
        }}
      >
        {initials}
      </div>
      {instColor !== undefined && instIdx !== undefined && (
        <div
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 flex items-center justify-center font-black"
          style={{
            width: 16,
            height: 16,
            background: instColor,
            color: "#000",
            borderColor: "#111",
            fontSize: 8,
          }}
        >
          {instIdx + 1}
        </div>
      )}
    </div>
  );
}

// ─── AudioPlayer ────────────────────────────────────────────────────────────

function AudioPlayer({ url, duration }: { url?: string | null; duration?: number | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ?? 0);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (!url) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "#ffffff10", minWidth: 180 }}>
        <Mic size={14} style={{ color: "#888" }} />
        <span className="text-[11px]" style={{ color: "#888" }}>Áudio indisponível</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "#ffffff10", minWidth: 200 }}>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={e => {
          const a = e.currentTarget;
          setCurrentTime(a.currentTime);
          if (a.duration) setProgress((a.currentTime / a.duration) * 100);
        }}
        onLoadedMetadata={e => setTotalDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
      />
      <button onClick={toggle} className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all"
        style={{ background: "#25D366", color: "#000" }}>
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5">
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "#ffffff20" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "#25D366" }} />
        </div>
        <div className="flex justify-between text-[9px]" style={{ color: "#888" }}>
          <span>{fmt(currentTime)}</span>
          <span>{fmt(totalDuration)}</span>
        </div>
      </div>
      <Volume2 size={12} style={{ color: "#555", flexShrink: 0 }} />
    </div>
  );
}

// ─── MessageContent ───────────────────────────────────────────────────────────

/** PK numérica de wa_messages (superjson/mysql podem devolver string ou bigint). */
function waMessageNumericId(m: { id?: unknown }): number {
  const v = m?.id;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Resolve URL de mídia do WhatsApp para exibição no painel (mesmo host que o app). */
function resolveWaMediaUrl(mediaUrl: string | null | undefined): string | null {
  if (!mediaUrl || !String(mediaUrl).trim()) return null;
  const u = String(mediaUrl).trim();
  if (u.startsWith("/")) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${u}`;
    }
    return u;
  }
  return u;
}

/**
 * URL para exibir mídia no painel.
 * 1) Preferir URL absoluta (presign do batch `resolveMediaViewUrls`, https do bridge, ou /manus-storage no mesmo host).
 * 2) Só então `/api/pdv/wa-media/:id` — cookie PDV; evita 404 quando o batch já resolveu a URL e o proxy falhava por leitura duplicada no MySQL.
 */
function waPanelMediaSrc(msg: any, mediaJwt?: string | null): string | null {
  const type = String(msg?.type ?? "text");
  const binaryTypes = new Set(["image", "video", "audio", "document", "sticker"]);
  const raw =
    msg?.mediaUrl
    ?? msg?.media_url
    ?? msg?.MEDIAURL
    ?? null;
  const direct = resolveWaMediaUrl(raw);

  if (binaryTypes.has(type)) {
    if (direct && /^https?:\/\//i.test(direct)) return direct;
    const id = waMessageNumericId(msg);
    if (Number.isFinite(id) && id > 0) {
      const base = `/api/pdv/wa-media/${id}`;
      const j = mediaJwt?.trim();
      if (j) return `${base}?t=${encodeURIComponent(j)}`;
      return base;
    }
  }
  return direct;
}

function MessageContent({ msg, mediaAccessToken }: { msg: any; mediaAccessToken?: string | null }) {
  const type = msg.type ?? "text";
  const content = msg.content ?? "";
  const mediaUrl = waPanelMediaSrc(msg, mediaAccessToken);
  const caption = msg.mediaCaption ?? null;

  if (type === "audio") {
    return (
      <div>
        <AudioPlayer url={mediaUrl} />
        {content && content !== "[audio]" && (
          <p className="text-[11px] mt-1" style={{ color: "#aaa" }}>{content}</p>
        )}
      </div>
    );
  }

  if (type === "image") {
    return (
      <div>
        {mediaUrl ? (
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
            <img src={mediaUrl} alt="Imagem" className="rounded-lg max-w-full" style={{ maxHeight: 220, objectFit: "cover" }} />
          </a>
        ) : (
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{ background: "#ffffff10" }}>
            <Image size={16} style={{ color: "#888" }} />
            <span className="text-[11px]" style={{ color: "#888" }}>Imagem</span>
          </div>
        )}
        {(caption || (content && content !== "[image]")) && (
          <p className="text-[11px] mt-1" style={{ wordBreak: "break-word" }}>{caption || content}</p>
        )}
      </div>
    );
  }

  if (type === "video") {
    return (
      <div>
        {mediaUrl ? (
          <video src={mediaUrl} controls className="rounded-lg max-w-full" style={{ maxHeight: 220 }} />
        ) : (
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{ background: "#ffffff10" }}>
            <Video size={16} style={{ color: "#888" }} />
            <span className="text-[11px]" style={{ color: "#888" }}>Vídeo</span>
          </div>
        )}
        {(caption || (content && content !== "[video]")) && (
          <p className="text-[11px] mt-1" style={{ wordBreak: "break-word" }}>{caption || content}</p>
        )}
      </div>
    );
  }

  if (type === "sticker") {
    return (
      <div>
        {mediaUrl ? (
          <img src={mediaUrl} alt="Figurinha" className="rounded-lg" style={{ maxWidth: 120, maxHeight: 120 }} />
        ) : (
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{ background: "#ffffff10" }}>
            <Smile size={16} style={{ color: "#888" }} />
            <span className="text-[11px]" style={{ color: "#888" }}>Figurinha</span>
          </div>
        )}
      </div>
    );
  }

  if (type === "document") {
    const filename = content && content !== "[document]" ? content : "Documento";
    return (
      <div>
        {mediaUrl ? (
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
            style={{ background: "#ffffff10", color: "#60a5fa" }}>
            <FileText size={16} />
            <span className="text-[11px] underline">{filename}</span>
          </a>
        ) : (
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{ background: "#ffffff10" }}>
            <FileText size={16} style={{ color: "#888" }} />
            <span className="text-[11px]" style={{ color: "#888" }}>{filename}</span>
          </div>
        )}
      </div>
    );
  }

  if (type === "location") {
    const [lat, lng] = (content && content !== "[location]" ? content : "").split(",");
    const mapsUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null;
    return (
      <a href={mapsUrl ?? "#"} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
        style={{ background: "#ffffff10", color: "#60a5fa" }}>
        <MapPin size={16} />
        <span className="text-[11px] underline">Ver localização</span>
      </a>
    );
  }

  // Texto padrão
  const displayContent = content && !content.startsWith("[") ? content : null;
  if (!displayContent) {
    return (
      <div className="flex items-center gap-1.5" style={{ color: "#666" }}>
        <MessageCircle size={12} />
        <span className="text-[11px] italic">{type !== "text" ? `[${type}]` : "Mensagem vazia"}</span>
      </div>
    );
  }
  return <span style={{ wordBreak: "break-word" }}>{displayContent}</span>;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PdvWhatsApp() {
  const { isAdmin } = usePdvAuth();

  // Filtros
  const [selectedInstanceId, setSelectedInstanceId] = useState<number>(0);
  const [selectedStatus, setSelectedStatus] = useState<ConvStatus | "">("");
  const [filterAi, setFilterAi] = useState<"" | "on" | "off">("");
  const [filterUnread, setFilterUnread] = useState(false);
  const [search, setSearch] = useState("");

  // Chat
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Refs para scroll interno do painel de mensagens
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: instances = [] } = trpc.wa.listInstances.useQuery(undefined, {
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const convQuery = trpc.wa.listConversations.useQuery({
    instanceId: selectedInstanceId || undefined,
    status: (selectedStatus as ConvStatus) || undefined,
    aiEnabled: filterAi === "on" ? true : filterAi === "off" ? false : undefined,
    unreadOnly: filterUnread || undefined,
    search: search || undefined,
  }, { refetchInterval: 3000, refetchOnWindowFocus: true });

  const conversations: any[] = convQuery.data ?? [];

  const countQuery = trpc.wa.countByStatus.useQuery({
    instanceId: selectedInstanceId || undefined,
  }, { refetchInterval: 8000, refetchOnWindowFocus: true });
  const counts: Record<string, { count: number; unread: number }> = countQuery.data ?? {};

  const selectedConv = useMemo(
    () => conversations.find(c => c.id === selectedConvId) ?? null,
    [conversations, selectedConvId]
  );

  const messagesQuery = trpc.wa.listMessages.useQuery(
    { conversationId: selectedConvId! },
    { enabled: selectedConvId !== null, refetchInterval: 2000, refetchOnWindowFocus: true }
  );
  const messages: any[] = messagesQuery.data ?? [];

  /** Todas as mensagens de mídia com URL ou chave no storage — resolve no servidor para URL presignada (evita falha de <img> com /manus-storage ou redirect). */
  const mediaPanelResolveIds = useMemo(() => {
    const types = new Set(["image", "video", "audio", "document", "sticker"]);
    const ids = messages
      .filter((m) => {
        if (!types.has(m.type)) return false;
        const u =
          (m.mediaUrl != null && String(m.mediaUrl).trim())
          || (m.media_url != null && String(m.media_url).trim())
          || "";
        const k =
          (m.mediaStorageKey != null && String(m.mediaStorageKey).trim())
          || (m.media_storage_key != null && String(m.media_storage_key).trim())
          || "";
        return !!(u || k);
      })
      .map((m) => waMessageNumericId(m))
      .filter((id) => Number.isFinite(id) && id > 0);
    return Array.from(new Set(ids)).sort((a, b) => a - b).slice(0, 100);
  }, [messages]);

  const mediaUrlResolveQuery = trpc.wa.resolveMediaViewUrls.useQuery(
    { messageIds: mediaPanelResolveIds },
    {
      enabled: selectedConvId !== null && mediaPanelResolveIds.length > 0,
      staleTime: 5 * 60 * 1000,
    }
  );

  const displayMessages = useMemo(() => {
    const list = mediaUrlResolveQuery.data?.results;
    if (!list?.length) return messages;
    const map = new Map<string, string>();
    for (const x of list) {
      const mid = Number((x as { messageId?: unknown }).messageId);
      if (!Number.isFinite(mid) || mid <= 0) continue;
      const url = String((x as { url?: unknown }).url ?? "").trim();
      if (url) map.set(String(mid), url);
    }
    return messages.map((m) => {
      const idn = waMessageNumericId(m);
      const u = Number.isFinite(idn) ? map.get(String(idn)) : undefined;
      if (u) return { ...m, mediaUrl: u };
      return m;
    });
  }, [messages, mediaUrlResolveQuery.data?.results]);

  const mediaMessageIdsForJwt = useMemo(() => {
    const types = new Set(["image", "video", "audio", "document", "sticker"]);
    const ids = displayMessages
      .filter((m) => types.has(String(m.type)))
      .map((m) => waMessageNumericId(m))
      .filter((id) => Number.isFinite(id) && id > 0);
    return Array.from(new Set(ids)).slice(0, 100);
  }, [displayMessages]);

  const mediaTokensQuery = trpc.wa.getMediaViewTokens.useQuery(
    { messageIds: mediaMessageIdsForJwt },
    {
      enabled: selectedConvId !== null && mediaMessageIdsForJwt.length > 0,
      staleTime: 15 * 60 * 1000,
    }
  );

  const mediaJwtByMessageId = useMemo(() => {
    const m = new Map<number, string>();
    for (const row of mediaTokensQuery.data?.tokens ?? []) {
      if (Number.isFinite(row.messageId) && row.token) m.set(row.messageId, row.token);
    }
    return m;
  }, [mediaTokensQuery.data?.tokens]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const toggleAiMut = trpc.wa.toggleAi.useMutation({
    onSuccess: (_, vars) => {
      toast(vars.enabled ? "IA reativada" : "IA pausada — você assumiu o atendimento");
      utils.wa.listConversations.invalidate();
    },
  });

  const updateConvMut = trpc.wa.updateConversation.useMutation({
    onSuccess: () => utils.wa.listConversations.invalidate(),
  });

  const unlockAiMut = trpc.wa.unlockAiStatus.useMutation({
    onSuccess: () => {
      toast.success("Classificação automática reativada — a IA vai reclassificar o status.");
      utils.wa.listConversations.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markReadMut = trpc.wa.markAsRead.useMutation({
    onSuccess: () => utils.wa.listConversations.invalidate(),
  });

  const dedupMut = trpc.wa.deduplicateConversations.useMutation({
    onSuccess: (result) => {
      if (result.conversationsDeleted === 0) {
        toast.success("Nenhuma duplicata encontrada!");
      } else {
        toast.success(`Limpeza concluída: ${result.conversationsDeleted} conversa(s) duplicada(s) removida(s), ${result.messagesMerged} mensagem(ns) mesclada(s).`);
      }
      utils.wa.listConversations.invalidate();
      utils.wa.countByStatus.invalidate();
    },
    onError: (e) => toast.error("Erro ao deduplicar: " + e.message),
  });

  const sendMsgMut = trpc.wa.sendMessage.useMutation({
    onSuccess: () => {
      setMessageInput("");
      utils.wa.listMessages.invalidate({ conversationId: selectedConvId! });
      utils.wa.listConversations.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Scroll interno (apenas o container de mensagens) ──────────────────────────

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 80;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setIsAtBottom(atBottom);
  }, []);

  // Controle inteligente de scroll
  const prevConvIdRef = useRef<number | null>(null);
  const prevMsgCountRef = useRef<number>(0);

  useEffect(() => {
    const convChanged = prevConvIdRef.current !== selectedConvId;
    const newMessages = messages.length > prevMsgCountRef.current;

    prevConvIdRef.current = selectedConvId;
    prevMsgCountRef.current = messages.length;

    if (convChanged) {
      // Mudou de conversa: vai para o fim imediatamente
      setTimeout(() => scrollToBottom("instant"), 50);
    } else if (newMessages && isAtBottom) {
      // Nova mensagem e usuário está no fim: rola suavemente
      scrollToBottom("smooth");
    }
  }, [messages, selectedConvId, isAtBottom, scrollToBottom]);

  // Marcar como lida e invalidar mensagens ao abrir conversa
  useEffect(() => {
    if (selectedConvId) {
      // Invalidar imediatamente para buscar mensagens sem esperar o intervalo
      utils.wa.listMessages.invalidate({ conversationId: selectedConvId });
      if (selectedConv?.unreadCount > 0) {
        markReadMut.mutate({ conversationId: selectedConvId });
      }
    }
  }, [selectedConvId]);

  // ── Contagem de não lidas por instância ───────────────────────────────────────

  const unreadByInstance = useMemo(() => {
    const map: Record<number, number> = { 0: 0 };
    for (const c of conversations) {
      map[0] = (map[0] ?? 0) + (c.unreadCount ?? 0);
      map[c.instanceId] = (map[c.instanceId] ?? 0) + (c.unreadCount ?? 0);
    }
    return map;
  }, [conversations]);

  const totalStatusCount = Object.values(counts).reduce((a, b) => a + b.count, 0);

  // ── Enviar mensagem ───────────────────────────────────────────────────────────

  const handleSend = () => {
    if (!messageInput.trim() || !selectedConvId) return;
    sendMsgMut.mutate({ conversationId: selectedConvId, content: messageInput.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  // Reset textarea height after send
  useEffect(() => {
    if (!messageInput && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [messageInput]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PdvLayout>
      {/* Container principal: usa h-screen como o PdvMain para evitar scroll externo */}
      <div className="flex h-screen overflow-hidden" style={{ background: "#0d0d0d" }}>

        {/* ═══════════════════════════════════════════════════════════════════════
            PAINEL ESQUERDO — Lista de conversas (320px fixo)
        ═══════════════════════════════════════════════════════════════════════ */}
        <div
          className="flex flex-col border-r overflow-hidden flex-shrink-0"
          style={{ width: 320, minWidth: 260, background: "#111", borderColor: "#1e1e1e" }}
        >
          {/* Cabeçalho */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
            style={{ borderColor: "#1e1e1e", background: "#161616" }}
          >
            <div className="flex items-center gap-2">
              <MessageCircle size={16} style={{ color: "#25D366" }} />
              <span className="text-sm font-bold" style={{ color: "#e0e0e0" }}>WhatsApp IA</span>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (confirm("Mesclar conversas duplicadas? Isso irá unificar conversas do mesmo contato em uma só.")) {
                      dedupMut.mutate();
                    }
                  }}
                  disabled={dedupMut.isPending}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#252525] disabled:opacity-50"
                  style={{ color: "#555" }}
                  title="Mesclar conversas duplicadas"
                >
                  {dedupMut.isPending ? (
                    <span className="text-[9px] animate-spin">⟳</span>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                      <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                      <path d="M9 12h6"/><path d="M12 9v6"/>
                    </svg>
                  )}
                </button>
                <Link href="/pdv/whatsapp/config">
                  <button
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#252525]"
                    style={{ color: "#555" }}
                    title="Configurar instâncias"
                  >
                    <Settings size={15} />
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* Chips de instância */}
          <div
            className="flex items-center gap-1.5 px-3 py-2 border-b overflow-x-auto flex-shrink-0"
            style={{ borderColor: "#1a1a1a" }}
          >
            <button
              onClick={() => setSelectedInstanceId(0)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap transition-all flex-shrink-0"
              style={selectedInstanceId === 0
                ? { borderColor: "#555", background: "#1e1e1e", color: "#fff" }
                : { borderColor: "#2a2a2a", color: "#555" }
              }
            >
              Todos
              {(unreadByInstance[0] ?? 0) > 0 && (
                <span className="rounded-full px-1.5 text-[9px] font-black" style={{ background: "#555", color: "#000" }}>
                  {unreadByInstance[0]}
                </span>
              )}
            </button>

            {(instances as any[]).map((inst, idx) => {
              const color = getInstColor(idx);
              const unread = unreadByInstance[inst.id] ?? 0;
              const isSel = selectedInstanceId === inst.id;
              return (
                <button
                  key={inst.id}
                  onClick={() => setSelectedInstanceId(inst.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap transition-all flex-shrink-0"
                  style={{
                    color: isSel ? color : "#555",
                    borderColor: isSel ? color : "#2a2a2a",
                    background: isSel ? `${color}14` : "transparent",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: inst.status === "connected" ? color : "#3a3a3a" }}
                  />
                  {inst.name}
                  {unread > 0 && (
                    <span className="rounded-full px-1.5 text-[9px] font-black" style={{ background: color, color: "#000" }}>
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}

            {(instances as any[]).length === 0 && (
              <span className="text-[11px] italic" style={{ color: "#444" }}>Nenhum número configurado</span>
            )}
          </div>

          {/* Busca */}
          <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: "#1a1a1a" }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#444" }} />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar conversa..."
                className="pl-8 h-8 text-xs border focus-visible:ring-0"
                style={{ background: "#1a1a1a", borderColor: "#2a2a2a", color: "#ccc" }}
              />
            </div>
          </div>

          {/* Filtros de status */}
          <div
            className="flex items-center gap-1 px-3 py-2 border-b overflow-x-auto flex-shrink-0"
            style={{ borderColor: "#1a1a1a" }}
          >
            <button
              onClick={() => setSelectedStatus("")}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap transition-all flex-shrink-0"
              style={selectedStatus === ""
                ? { background: "#1e1e1e", color: "#fff", borderColor: "#333" }
                : { color: "#555", borderColor: "#2a2a2a" }
              }
            >
              Todas {totalStatusCount > 0 ? `(${totalStatusCount})` : ""}
            </button>
            {(Object.keys(STATUS_CONFIG) as ConvStatus[]).map(s => {
              const cfg = STATUS_CONFIG[s];
              const cnt = counts[s]?.count ?? 0;
              return (
                <button
                  key={s}
                  onClick={() => setSelectedStatus(selectedStatus === s ? "" : s)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap transition-all flex-shrink-0"
                  style={selectedStatus === s
                    ? { color: cfg.color, background: cfg.bg, borderColor: cfg.border }
                    : { color: "#555", borderColor: "#2a2a2a" }
                  }
                >
                  {cfg.label}{cnt > 0 ? ` (${cnt})` : ""}
                </button>
              );
            })}
          </div>

          {/* Filtros adicionais */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 border-b flex-shrink-0"
            style={{ borderColor: "#1a1a1a" }}
          >
            <button
              onClick={() => setFilterAi(filterAi === "on" ? "" : "on")}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all"
              style={filterAi === "on"
                ? { color: "#25D366", borderColor: "#25D366", background: "#25D36614" }
                : { color: "#555", borderColor: "#2a2a2a" }
              }
            >
              <Bot size={9} /> IA ativa
            </button>
            <button
              onClick={() => setFilterAi(filterAi === "off" ? "" : "off")}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all"
              style={filterAi === "off"
                ? { color: "#f87171", borderColor: "#f87171", background: "#f8717114" }
                : { color: "#555", borderColor: "#2a2a2a" }
              }
            >
              <BotOff size={9} /> Humano
            </button>
            <button
              onClick={() => setFilterUnread(!filterUnread)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all"
              style={filterUnread
                ? { color: "#fbbf24", borderColor: "#fbbf24", background: "#fbbf2414" }
                : { color: "#555", borderColor: "#2a2a2a" }
              }
            >
              <AlertCircle size={9} /> Não lidas
            </button>
          </div>

          {/* Lista de conversas (scroll interno) */}
          <div className="flex-1 overflow-y-auto">
            {convQuery.isLoading && (
              <div className="flex items-center justify-center h-16 text-[11px]" style={{ color: "#444" }}>
                Carregando...
              </div>
            )}
            {!convQuery.isLoading && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: "#444" }}>
                <MessageCircle size={24} />
                <span className="text-xs">Nenhuma conversa encontrada</span>
              </div>
            )}
            {conversations.map((conv: any) => {
              const instIdx = (instances as any[]).findIndex(i => i.id === conv.instanceId);
              const instColor = getInstColor(instIdx >= 0 ? instIdx : 0);
              const isSel = selectedConvId === conv.id;
              const displayName = getDisplayName(conv);

              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className="flex items-start gap-3 px-3 py-3 cursor-pointer border-b transition-colors"
                  style={{
                    borderColor: "#161616",
                    background: isSel ? "#1c2a1e" : undefined,
                    borderLeft: isSel ? "3px solid #25D366" : "3px solid transparent",
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = "#161616"; }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = ""; }}
                >
                  <Avatar
                    name={displayName}
                    size={42}
                    instColor={instColor}
                    instIdx={instIdx >= 0 ? instIdx : 0}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[13px] font-semibold truncate" style={{ color: isSel ? "#fff" : "#d0d0d0" }}>
                        {displayName}
                      </span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "#444" }}>
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] truncate" style={{ color: conv.aiEnabled ? "#25D36699" : "#555" }}>
                        {conv.aiEnabled ? "🤖 " : ""}{conv.lastMessage || "Sem mensagens"}
                      </span>
                      {(conv.unreadCount ?? 0) > 0 && (
                        <span
                          className="w-5 h-5 rounded-full text-black text-[10px] font-black flex items-center justify-center flex-shrink-0"
                          style={{ background: "#25D366" }}
                        >
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </span>
                      )}
                    </div>

                    <StatusBadge status={conv.status as ConvStatus} byAi={conv.statusSetBy === "ai"} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            ÁREA CENTRAL — Chat (flex-1)
        ═══════════════════════════════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {!selectedConv ? (
            /* Estado vazio */
            <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ color: "#2a2a2a" }}>
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: "#25D36610", border: "2px solid #25D36622" }}
              >
                <MessageCircle size={36} style={{ color: "#25D36644" }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: "#444" }}>Selecione uma conversa</p>
                <p className="text-xs mt-1" style={{ color: "#333" }}>Escolha um contato na lista ao lado para começar</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header do chat */}
              <div
                className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0"
                style={{ background: "#161616", borderColor: "#1e1e1e" }}
              >
                <Avatar name={getDisplayName(selectedConv)} size={38} />

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: "#fff" }}>
                    {getDisplayName(selectedConv)}
                  </div>
                  <div className="text-[11px]" style={{ color: "#555" }}>
                    {selectedConv.contactPhone}
                  </div>
                </div>

                {/* Tag da instância */}
                {(() => {
                  const instIdx = (instances as any[]).findIndex(i => i.id === selectedConv.instanceId);
                  const color = getInstColor(instIdx >= 0 ? instIdx : 0);
                  const inst = (instances as any[])[instIdx];
                  return inst ? (
                    <span
                      className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ color, background: `${color}14` }}
                    >
                      {inst.name}
                    </span>
                  ) : null;
                })()}

                {/* Status dropdown */}
                <StatusDropdown
                  current={selectedConv.status as ConvStatus}
                  onChange={s => updateConvMut.mutate({ id: selectedConv.id, status: s })}
                />

                {/* Toggle IA */}
                <button
                  onClick={() => toggleAiMut.mutate({ conversationId: selectedConv.id, enabled: !selectedConv.aiEnabled })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all flex-shrink-0"
                  style={selectedConv.aiEnabled
                    ? { color: "#25D366", borderColor: "#25D366", background: "#25D36614" }
                    : { color: "#555", borderColor: "#2a2a2a" }
                  }
                  title={selectedConv.aiEnabled ? "IA está respondendo — clique para assumir" : "IA desativada — clique para reativar"}
                >
                  {selectedConv.aiEnabled ? <Bot size={13} /> : <BotOff size={13} />}
                  {selectedConv.aiEnabled ? "IA Ativa" : "IA Off"}
                </button>

                {/* Botão de detalhes */}
                <button
                  onClick={() => setShowDetails(v => !v)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                  style={{
                    color: showDetails ? "#25D366" : "#555",
                    background: showDetails ? "#25D36614" : undefined,
                  }}
                  title="Detalhes do contato"
                >
                  <Info size={15} />
                </button>
              </div>

              {/* Área de mensagens + input */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Container de mensagens com scroll INTERNO */}
                <div
                  ref={messagesContainerRef}
                  onScroll={handleScroll}
                  className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5"
                  style={{ background: "#0d0d0d" }}
                >
                  {messagesQuery.isLoading && (
                    <div className="flex items-center justify-center h-16 text-xs" style={{ color: "#444" }}>
                      Carregando mensagens...
                    </div>
                  )}
                  {displayMessages.length === 0 && !messagesQuery.isLoading && (
                    <div className="flex items-center justify-center h-16 text-xs" style={{ color: "#333" }}>
                      Nenhuma mensagem ainda
                    </div>
                  )}

                  {displayMessages.map((msg: any, idx: number) => {
                    // Separador de data
                    const prevMsg = displayMessages[idx - 1];
                    const msgDate = new Date(msg.timestamp).toDateString();
                    const prevDate = prevMsg ? new Date(prevMsg.timestamp).toDateString() : null;
                    const showDateSep = msgDate !== prevDate;

                    return (
                      <div key={`wa-msg-${msg.id}-${idx}`}>
                        {showDateSep && (
                          <div className="flex items-center justify-center my-3">
                            <span
                              className="px-3 py-1 rounded-full text-[10px] font-semibold"
                              style={{ background: "#1a1a1a", color: "#555", border: "1px solid #2a2a2a" }}
                            >
                              {new Date(msg.timestamp).toLocaleDateString("pt-BR", {
                                weekday: "long", day: "numeric", month: "long",
                              })}
                            </span>
                          </div>
                        )}

                        <div className={`flex ${msg.fromMe ? "justify-end" : "justify-start"} items-end gap-2`}>
                          {/* Avatar do contato (mensagens recebidas) */}
                          {!msg.fromMe && (
                            <Avatar name={getDisplayName(selectedConv)} size={26} />
                          )}

                          <div
                            className="max-w-[65%] px-3 py-2 text-xs leading-relaxed"
                            style={msg.fromMe
                              ? msg.senderType === "ai"
                                ? {
                                    background: "#0f2a1a",
                                    border: "1px solid #25D36633",
                                    color: "#d0d0d0",
                                    borderRadius: "14px 14px 2px 14px",
                                  }
                                : {
                                    background: "#1d3a2a",
                                    color: "#d0d0d0",
                                    borderRadius: "14px 14px 2px 14px",
                                  }
                              : {
                                  background: "#1a1a1a",
                                  color: "#d0d0d0",
                                  borderRadius: "14px 14px 14px 2px",
                                  border: "1px solid #252525",
                                }
                            }
                          >
                            {(Boolean(msg.fromMe) && msg.senderType === "ai") && (
                              <div className="flex items-center gap-1 text-[10px] mb-1" style={{ color: "#25D36699" }}>
                                <Bot size={9} /> Respondido pela Ju
                              </div>
                            )}
                            <MessageContent
                              msg={msg}
                              mediaAccessToken={mediaJwtByMessageId.get(waMessageNumericId(msg)) ?? undefined}
                            />
                            <div className="text-[10px] mt-1 text-right" style={{ color: "#555" }}>
                              {formatMsgTime(msg.timestamp)}
                            </div>
                          </div>

                          {/* Indicador de operador humano */}
                          {(Boolean(msg.fromMe) && msg.senderType !== "ai") && (
                            <div
                              className="rounded-full flex items-center justify-center flex-shrink-0 font-black"
                              style={{
                                width: 26,
                                height: 26,
                                background: "#1d3a2a",
                                color: "#25D366",
                                border: "1px solid #25D36633",
                                fontSize: 9,
                              }}
                            >
                              OP
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Botão "rolar para o fim" quando não está no fim */}
                {!isAtBottom && (
                  <div className="absolute bottom-20 right-6 z-10">
                    <button
                      onClick={() => scrollToBottom("smooth")}
                      className="w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all"
                      style={{ background: "#25D366", color: "#000" }}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                )}

                {/* Input de mensagem */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 border-t flex-shrink-0"
                  style={{ background: "#111", borderColor: "#1e1e1e" }}
                >
                  <button
                    className="w-8 h-8 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0 hover:bg-[#252525]"
                    style={{ background: "#1a1a1a", borderColor: "#2a2a2a", color: "#555" }}
                    title="Respostas rápidas (em breve)"
                    onClick={() => toast("Respostas rápidas — em breve")}
                  >
                    <Zap size={14} />
                  </button>
                  <button
                    className="w-8 h-8 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0 hover:bg-[#252525]"
                    style={{ background: "#1a1a1a", borderColor: "#2a2a2a", color: "#555" }}
                    title="Anexar arquivo (em breve)"
                    onClick={() => toast("Envio de arquivos — em breve")}
                  >
                    <Paperclip size={14} />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={messageInput}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder={selectedConv.aiEnabled
                      ? "IA está respondendo — escreva para assumir..."
                      : "Digite uma mensagem... (Enter para enviar, Shift+Enter para nova linha)"
                    }
                    rows={1}
                    className="flex-1 text-xs border rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-[#25D36655] transition-colors"
                    style={{
                      background: "#1a1a1a",
                      borderColor: "#2a2a2a",
                      color: "#ccc",
                      minHeight: 36,
                      maxHeight: 120,
                      lineHeight: "1.5",
                    }}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!messageInput.trim() || sendMsgMut.isPending}
                    size="sm"
                    className="w-9 h-9 p-0 rounded-full flex-shrink-0"
                    style={{ background: messageInput.trim() ? "#25D366" : "#1a1a1a" }}
                  >
                    <Send size={14} className={messageInput.trim() ? "text-black" : "text-[#555]"} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            PAINEL DIREITO — Detalhes do contato (colapsável)
        ═══════════════════════════════════════════════════════════════════════ */}
        {selectedConv && showDetails && (
          <div
            className="flex-shrink-0 border-l flex flex-col overflow-hidden"
            style={{ width: 220, background: "#111", borderColor: "#1e1e1e" }}
          >
            {/* Header do painel de detalhes */}
            <div
              className="flex items-center justify-between px-3 py-2.5 border-b flex-shrink-0"
              style={{ borderColor: "#1e1e1e", background: "#161616" }}
            >
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#555" }}>
                Detalhes
              </span>
              <button
                onClick={() => setShowDetails(false)}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-[#252525]"
                style={{ color: "#555" }}
              >
                <ArrowLeft size={12} />
              </button>
            </div>

            <div className="p-3 flex flex-col gap-4 overflow-y-auto flex-1">
              {/* Avatar grande */}
              <div className="flex flex-col items-center gap-2 py-2">
                <Avatar name={getDisplayName(selectedConv)} size={56} />
                <div className="text-center">
                  <div className="text-sm font-bold" style={{ color: "#e0e0e0" }}>
                    {getDisplayName(selectedConv)}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "#555" }}>
                    {selectedConv.contactPhone}
                  </div>
                </div>
              </div>

              {/* Informações */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#444" }}>
                  Contato
                </h4>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between gap-2">
                    <span style={{ color: "#555" }}>Via</span>
                    <span className="font-semibold truncate max-w-[110px]" style={{ color: "#ccc" }}>
                      {(instances as any[]).find(i => i.id === selectedConv.instanceId)?.name || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span style={{ color: "#555" }}>Status</span>
                    <StatusDropdown
                      current={selectedConv.status as ConvStatus}
                      onChange={s => updateConvMut.mutate({ id: selectedConv.id, status: s })}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span style={{ color: "#555" }}>IA</span>
                    <span
                      className="text-[10px] font-bold"
                      style={{ color: selectedConv.aiEnabled ? "#25D366" : "#555" }}
                    >
                      {selectedConv.aiEnabled ? "Ativa" : "Desativada"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span style={{ color: "#555" }}>Status por</span>
                    <span
                      className="text-[10px] font-bold flex items-center gap-1"
                      style={{ color: selectedConv.statusSetBy === "human" ? "#fbbf24" : "#25D36699" }}
                    >
                      {selectedConv.statusSetBy === "human"
                        ? <><AlertCircle size={9} /> Manual</>
                        : <><Bot size={9} /> IA</>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Anotações */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#444" }}>
                  Anotação interna
                </h4>
                <textarea
                  defaultValue={selectedConv.notes ?? ""}
                  onBlur={e => updateConvMut.mutate({ id: selectedConv.id, notes: e.target.value })}
                  placeholder="Adicionar anotação..."
                  className="w-full rounded-lg p-2 text-[11px] resize-none h-20 focus:outline-none"
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888" }}
                />
              </div>

              {/* Ações rápidas */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#444" }}>
                  Ações
                </h4>
                <div className="space-y-1.5">
                  {[
                    { label: "📋 Criar pedido no PDV", onClick: () => toast("Em breve: Integração com PDV") },
                    { label: "🔗 Enviar catálogo", onClick: () => toast("Em breve: Link do catálogo") },
                    { label: "👥 Enviar link grupo", onClick: () => toast("Em breve: Link do grupo") },
                  ].map(({ label, onClick }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] border transition-all hover:bg-[#1e1e1e]"
                      style={{ color: "#666", borderColor: "#2a2a2a" }}
                    >
                      {label}
                    </button>
                  ))}

                  {selectedConv.statusSetBy === "human" && (
                    <button
                      onClick={() => unlockAiMut.mutate({ id: selectedConv.id })}
                      disabled={unlockAiMut.isPending}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border font-bold transition-all"
                      style={{ color: "#25D366", borderColor: "#25D36633", background: "#25D36610" }}
                    >
                      <Unlock size={11} />
                      {unlockAiMut.isPending ? "Reativando..." : "Reativar IA"}
                    </button>
                  )}

                  <button
                    onClick={() => updateConvMut.mutate({ id: selectedConv.id, status: "spam" })}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] border transition-all hover:bg-[#1e1e1e]"
                    style={{ color: "#f87171", borderColor: "#f8717122" }}
                  >
                    🚫 Marcar como spam
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </PdvLayout>
  );
}
