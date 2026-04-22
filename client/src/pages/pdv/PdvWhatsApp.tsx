import { useState, useMemo, useRef, useEffect } from "react";
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
  ChevronDown, AlertCircle, Settings,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ConvStatus = "novo" | "em_atendimento" | "aguardando" | "proposta_enviada" | "finalizado" | "spam";

// ─── Configuração de status ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<ConvStatus, { label: string; color: string; bg: string; border: string; Icon: React.FC<{ size?: number }> }> = {
  novo:             { label: "Novo",             color: "#60a5fa", bg: "rgba(96,165,250,.12)",  border: "rgba(96,165,250,.3)",  Icon: Circle },
  em_atendimento:   { label: "Em atendimento",   color: "#34d399", bg: "rgba(52,211,153,.12)",  border: "rgba(52,211,153,.3)",  Icon: MessageCircle },
  aguardando:       { label: "Aguardando",       color: "#fbbf24", bg: "rgba(251,191,36,.12)",  border: "rgba(251,191,36,.3)",  Icon: Clock },
  proposta_enviada: { label: "Proposta enviada", color: "#a78bfa", bg: "rgba(167,139,250,.12)", border: "rgba(167,139,250,.3)", Icon: Tag },
  finalizado:       { label: "Finalizado",       color: "#6b7280", bg: "rgba(107,114,128,.12)", border: "rgba(107,114,128,.3)", Icon: CheckCircle2 },
  spam:             { label: "Spam",             color: "#f87171", bg: "rgba(248,113,113,.12)", border: "rgba(248,113,113,.3)", Icon: Ban },
};

const INSTANCE_COLORS = ["#25D366", "#3B82F6", "#F59E0B", "#EC4899", "#8B5CF6"];
const getInstColor = (idx: number) => INSTANCE_COLORS[idx % INSTANCE_COLORS.length];

function formatTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff < 172800000) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, byAi }: { status: ConvStatus; byAi?: boolean }) {
  const cfg = STATUS_CONFIG[status];
  const { Icon } = cfg;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
      title={byAi ? "Status classificado automaticamente pela IA" : "Status definido manualmente"}
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
      <DropdownMenuContent align="end" className="w-44 bg-[#1a1a1a] border-[#2a2a2a] p-1">
        {(Object.keys(STATUS_CONFIG) as ConvStatus[]).map(s => (
          <DropdownMenuItem
            key={s}
            onClick={() => onChange(s)}
            className="cursor-pointer rounded hover:bg-[#252525] focus:bg-[#252525] p-1"
          >
            <StatusBadge status={s} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PdvWhatsApp() {
  const { isAdmin } = usePdvAuth();

  // Filtros
  const [selectedInstanceId, setSelectedInstanceId] = useState<number>(0); // 0 = todos
  const [selectedStatus, setSelectedStatus] = useState<ConvStatus | "">("");
  const [filterAi, setFilterAi] = useState<"" | "on" | "off">("");
  const [filterUnread, setFilterUnread] = useState(false);
  const [search, setSearch] = useState("");

  // Chat
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: instances = [] } = trpc.wa.listInstances.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const convQuery = trpc.wa.listConversations.useQuery({
    instanceId: selectedInstanceId || undefined,
    status: (selectedStatus as ConvStatus) || undefined,
    aiEnabled: filterAi === "on" ? true : filterAi === "off" ? false : undefined,
    unreadOnly: filterUnread || undefined,
    search: search || undefined,
  }, { refetchInterval: 8000 });

  const conversations: any[] = convQuery.data ?? [];

  const countQuery = trpc.wa.countByStatus.useQuery({
    instanceId: selectedInstanceId || undefined,
  }, { refetchInterval: 15000 });
  const counts: Record<string, { count: number; unread: number }> = countQuery.data ?? {};

  const selectedConv = useMemo(
    () => conversations.find(c => c.id === selectedConvId) ?? null,
    [conversations, selectedConvId]
  );

  const messagesQuery = trpc.wa.listMessages.useQuery(
    { conversationId: selectedConvId! },
    { enabled: selectedConvId !== null, refetchInterval: 4000 }
  );
  const messages: any[] = messagesQuery.data ?? [];

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

  const markReadMut = trpc.wa.markAsRead.useMutation({
    onSuccess: () => utils.wa.listConversations.invalidate(),
  });

  const sendMsgMut = trpc.wa.sendMessage.useMutation({
    onSuccess: () => {
      setMessageInput("");
      utils.wa.listMessages.invalidate({ conversationId: selectedConvId! });
      utils.wa.listConversations.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Efeitos ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedConvId && selectedConv?.unreadCount > 0) {
      markReadMut.mutate({ conversationId: selectedConvId });
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PdvLayout>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden" style={{ background: "#0d0d0d" }}>

        {/* ═══════════════════════════════════════════════════════════════════════
            PAINEL ESQUERDO — Lista de conversas
        ═══════════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col w-80 min-w-[260px] border-r overflow-hidden" style={{ background: "#111", borderColor: "#1e1e1e" }}>

          {/* Barra de instâncias */}
          <div className="flex items-center gap-1.5 px-3 py-2.5 border-b overflow-x-auto" style={{ borderColor: "#1a1a1a" }}>
            {/* Chip "Todos" */}
            <button
              onClick={() => setSelectedInstanceId(0)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap transition-all flex-shrink-0"
              style={selectedInstanceId === 0
                ? { borderColor: "#555", background: "#1a1a1a", color: "#fff" }
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

            {/* Chips por instância */}
            {(instances as any[]).map((inst, idx) => {
              const color = getInstColor(idx);
              const unread = unreadByInstance[inst.id] ?? 0;
              const isSelected = selectedInstanceId === inst.id;
              return (
                <button
                  key={inst.id}
                  onClick={() => setSelectedInstanceId(inst.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap transition-all flex-shrink-0"
                  style={{
                    color: isSelected ? color : "#555",
                    borderColor: isSelected ? color : "#2a2a2a",
                    background: isSelected ? `${color}14` : "transparent",
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
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

            {instances.length === 0 && (
              <span className="text-[11px] italic" style={{ color: "#444" }}>Nenhum número configurado</span>
            )}

            {isAdmin && (
              <Link href="/pdv/whatsapp/config" className="ml-auto flex-shrink-0">
                <button className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors" style={{ color: "#555" }}>
                  <Settings size={14} />
                </button>
              </Link>
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
          <div className="flex items-center gap-1 px-3 py-2 border-b overflow-x-auto flex-shrink-0" style={{ borderColor: "#1a1a1a" }}>
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
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b flex-shrink-0" style={{ borderColor: "#1a1a1a" }}>
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

          {/* Lista de conversas */}
          <div className="flex-1 overflow-y-auto">
            {convQuery.isLoading && (
              <div className="flex items-center justify-center h-16 text-[11px]" style={{ color: "#444" }}>Carregando...</div>
            )}
            {!convQuery.isLoading && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: "#444" }}>
                <MessageCircle size={22} />
                <span className="text-xs">Nenhuma conversa encontrada</span>
              </div>
            )}
            {conversations.map((conv: any) => {
              const instIdx = (instances as any[]).findIndex(i => i.id === conv.instanceId);
              const instColor = getInstColor(instIdx >= 0 ? instIdx : 0);
              const isSelected = selectedConvId === conv.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer border-b transition-colors"
                  style={{
                    borderColor: "#161616",
                    background: isSelected ? "#1a1a1a" : undefined,
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "#161616"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = ""; }}
                >
                  {/* Avatar com bolinha da instância */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "#2a2a2a", color: "#888" }}>
                      {getInitials(conv.contactName)}
                    </div>
                    <div
                      className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-black"
                      style={{ background: instColor, color: "#000", borderColor: "#111" }}
                    >
                      {instIdx + 1}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[13px] font-semibold truncate" style={{ color: "#e0e0e0" }}>
                        {conv.contactName || conv.contactPhone || "Desconhecido"}
                      </span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: "#444" }}>{formatTime(conv.lastMessageAt)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] truncate" style={{ color: conv.aiEnabled ? "#25D36699" : "#555" }}>
                        {conv.aiEnabled ? "🤖 " : ""}{conv.lastMessage || "Sem mensagens"}
                      </span>
                      {(conv.unreadCount ?? 0) > 0 && (
                        <span className="w-4 h-4 rounded-full text-black text-[10px] font-black flex items-center justify-center flex-shrink-0" style={{ background: "#25D366" }}>
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </span>
                      )}
                    </div>

                    {/* Status badge — ícone Bot quando classificado pela IA */}
                    <StatusBadge status={conv.status as ConvStatus} byAi={conv.statusSetBy === "ai"} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            ÁREA CENTRAL — Chat
        ═══════════════════════════════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedConv ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "#333" }}>
              <MessageCircle size={48} />
              <p className="text-sm">Selecione uma conversa para começar</p>
            </div>
          ) : (
            <>
              {/* Header do chat */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0" style={{ background: "#111", borderColor: "#1e1e1e" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: "#2a2a2a", color: "#888" }}>
                  {getInitials(selectedConv.contactName)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {selectedConv.contactName || selectedConv.contactPhone || "Desconhecido"}
                  </div>
                  <div className="text-[11px]" style={{ color: "#555" }}>{selectedConv.contactPhone}</div>
                </div>

                {/* Tag da instância */}
                {(() => {
                  const instIdx = (instances as any[]).findIndex(i => i.id === selectedConv.instanceId);
                  const color = getInstColor(instIdx >= 0 ? instIdx : 0);
                  const inst = (instances as any[])[instIdx];
                  return inst ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0" style={{ color, background: `${color}14` }}>
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
                >
                  {selectedConv.aiEnabled ? <Bot size={13} /> : <BotOff size={13} />}
                  {selectedConv.aiEnabled ? "IA Ativa" : "IA Off"}
                </button>
              </div>

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                {messagesQuery.isLoading && (
                  <div className="flex items-center justify-center h-16 text-xs" style={{ color: "#444" }}>Carregando mensagens...</div>
                )}
                {messages.length === 0 && !messagesQuery.isLoading && (
                  <div className="flex items-center justify-center h-16 text-xs" style={{ color: "#444" }}>Nenhuma mensagem ainda</div>
                )}
                {messages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[65%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                      style={msg.fromMe
                        ? msg.senderType === "ai"
                          ? { background: "#0f2a1a", border: "1px solid #25D36633", color: "#d0d0d0", borderRadius: "12px 12px 2px 12px" }
                          : { background: "#1d3a2a", color: "#d0d0d0", borderRadius: "12px 12px 2px 12px" }
                        : { background: "#1a1a1a", color: "#d0d0d0", borderRadius: "12px 12px 12px 2px" }
                      }
                    >
                      {msg.fromMe && msg.senderType === "ai" && (
                        <div className="flex items-center gap-1 text-[10px] mb-1" style={{ color: "#25D36699" }}>
                          <Bot size={9} /> Respondido pela IA
                        </div>
                      )}
                      {msg.content}
                      <div className="text-[10px] mt-1 text-right" style={{ color: "#555" }}>
                        {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input de mensagem */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-t flex-shrink-0" style={{ background: "#111", borderColor: "#1e1e1e" }}>
                <button className="w-8 h-8 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0" style={{ background: "#1a1a1a", borderColor: "#2a2a2a", color: "#555" }}>
                  <Zap size={14} />
                </button>
                <button className="w-8 h-8 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0" style={{ background: "#1a1a1a", borderColor: "#2a2a2a", color: "#555" }}>
                  <Paperclip size={14} />
                </button>
                <Input
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (messageInput.trim() && selectedConvId) sendMsgMut.mutate({ conversationId: selectedConvId, content: messageInput.trim() }); } }}
                  placeholder={selectedConv.aiEnabled ? "IA está respondendo — ou escreva para assumir..." : "Digite uma mensagem..."}
                  className="flex-1 h-9 text-xs border focus-visible:ring-0"
                  style={{ background: "#1a1a1a", borderColor: "#2a2a2a", color: "#ccc" }}
                />
                <Button
                  onClick={() => { if (messageInput.trim() && selectedConvId) sendMsgMut.mutate({ conversationId: selectedConvId, content: messageInput.trim() }); }}
                  disabled={!messageInput.trim() || sendMsgMut.isPending}
                  size="sm"
                  className="w-9 h-9 p-0 rounded-full flex-shrink-0"
                  style={{ background: "#25D366" }}
                >
                  <Send size={14} className="text-black" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            PAINEL DIREITO — Detalhes
        ═══════════════════════════════════════════════════════════════════════ */}
        {selectedConv && (
          <div className="w-52 flex-shrink-0 border-l flex flex-col overflow-y-auto p-3 gap-4" style={{ background: "#111", borderColor: "#1e1e1e" }}>

            {/* Contato */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#444" }}>Contato</h4>
              <div className="space-y-1.5 text-[11px]">
                {[
                  ["Nome", selectedConv.contactName || "—"],
                  ["Número", selectedConv.contactPhone || "—"],
                  ["Via", (instances as any[]).find(i => i.id === selectedConv.instanceId)?.name || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span style={{ color: "#555" }}>{label}</span>
                    <span className="font-semibold truncate max-w-[110px]" style={{ color: "#ccc" }}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center gap-2">
                  <span style={{ color: "#555" }}>Status</span>
                  <StatusDropdown
                    current={selectedConv.status as ConvStatus}
                    onChange={s => updateConvMut.mutate({ id: selectedConv.id, status: s })}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: "#555" }}>IA</span>
                  <span className="text-[10px] font-bold" style={{ color: selectedConv.aiEnabled ? "#25D366" : "#555" }}>
                    {selectedConv.aiEnabled ? "Ativa" : "Desativada"}
                  </span>
                </div>
              </div>
            </div>

            {/* Anotações */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#444" }}>Anotação interna</h4>
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
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#444" }}>Ações</h4>
              <div className="space-y-1.5">
                {[
                  { label: '📋 Criar pedido no PDV', onClick: () => toast('Em breve: Integração com PDV') },
                  { label: '🔗 Enviar catálogo', onClick: () => toast('Em breve: Link do catálogo') },
                  { label: '👥 Enviar link grupo', onClick: () => toast('Em breve: Link do grupo') },
                ].map(({ label, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] border transition-all"
                    style={{ color: "#666", borderColor: "#2a2a2a" }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => updateConvMut.mutate({ id: selectedConv.id, status: "spam" })}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] border transition-all"
                  style={{ color: "#f87171", borderColor: "#f8717122" }}
                >
                  🚫 Marcar como spam
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </PdvLayout>
  );
}
