import { useState, useRef, useEffect, useMemo } from "react";
import PdvLayout from "./PdvLayout";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import {
  Search, Send, Bot, BotOff, Phone, MoreVertical,
  CheckCheck, Check, Clock, Wifi, WifiOff, Settings,
  ChevronDown, Tag, StickyNote, Archive, CheckCircle2,
  Zap, RefreshCw, MessageCircle, Plus, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Link } from "wouter";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(ts: string | Date | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 604800000) {
    return d.toLocaleDateString("pt-BR", { weekday: "short" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMsgTime(ts: string | Date | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

function getAvatarColor(name: string | null | undefined): string {
  const colors = ["bg-emerald-600", "bg-blue-600", "bg-purple-600", "bg-orange-600", "bg-pink-600", "bg-teal-600"];
  if (!name) return colors[0];
  return colors[name.charCodeAt(0) % colors.length];
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="w-3 h-3 text-gray-400" />,
  sent: <Check className="w-3 h-3 text-gray-400" />,
  delivered: <CheckCheck className="w-3 h-3 text-gray-400" />,
  read: <CheckCheck className="w-3 h-3 text-blue-400" />,
  failed: <X className="w-3 h-3 text-red-400" />,
};

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PdvWhatsApp() {
  const { isAdmin } = usePdvAuth();
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [notesDialog, setNotesDialog] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [convFilter, setConvFilter] = useState<"open" | "resolved" | "archived">("open");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: instances = [] } = trpc.wa.listInstances.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const activeInstanceId = selectedInstanceId ?? instances[0]?.id ?? null;

  const { data: metrics } = trpc.wa.getMetrics.useQuery(
    { instanceId: activeInstanceId ?? undefined },
    { enabled: !!activeInstanceId, refetchInterval: 15000 }
  );

  const { data: conversations = [], refetch: refetchConvs } = trpc.wa.listConversations.useQuery(
    { instanceId: activeInstanceId!, status: convFilter, search: searchQuery || undefined, limit: 50 },
    { enabled: !!activeInstanceId, refetchInterval: 5000 }
  );

  const { data: messages = [], refetch: refetchMsgs } = trpc.wa.listMessages.useQuery(
    { conversationId: selectedConvId!, limit: 100 },
    { enabled: !!selectedConvId, refetchInterval: 3000 }
  );

  const { data: quickReplies = [] } = trpc.wa.listQuickReplies.useQuery(
    { instanceId: activeInstanceId ?? undefined },
    { enabled: !!activeInstanceId }
  );

  const selectedConv = useMemo(
    () => conversations.find((c: any) => c.id === selectedConvId) ?? null,
    [conversations, selectedConvId]
  );

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const sendMsg = trpc.wa.sendMessage.useMutation({
    onSuccess: () => {
      setMessageText("");
      refetchMsgs();
      refetchConvs();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleAi = trpc.wa.toggleAi.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.enabled ? "IA reativada nesta conversa" : "IA pausada — você assumiu o atendimento");
      refetchConvs();
    },
    onError: (e) => toast.error(e.message),
  });

  const markRead = trpc.wa.markAsRead.useMutation({
    onSuccess: () => refetchConvs(),
  });

  const updateConv = trpc.wa.updateConversation.useMutation({
    onSuccess: () => { refetchConvs(); setNotesDialog(false); toast.success("Atualizado!"); },
    onError: (e) => toast.error(e.message),
  });

  // ── Efeitos ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (instances.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(instances[0].id);
    }
  }, [instances, selectedInstanceId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedConvId) {
      markRead.mutate({ conversationId: selectedConvId });
    }
  }, [selectedConvId]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleSend() {
    if (!messageText.trim() || !selectedConvId) return;
    sendMsg.mutate({ conversationId: selectedConvId, content: messageText.trim() });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleQuickReply(content: string) {
    setMessageText(content);
    setShowQuickReplies(false);
  }

  function openNotes() {
    setNotesText(selectedConv?.notes ?? "");
    setNotesDialog(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PdvLayout>
      <div className="h-[calc(100vh-0px)] flex flex-col bg-gray-950">

        {/* ── Barra de instâncias ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 overflow-x-auto shrink-0">
          {instances.map((inst: any) => (
            <button
              key={inst.id}
              onClick={() => { setSelectedInstanceId(inst.id); setSelectedConvId(null); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeInstanceId === inst.id
                  ? "bg-green-700 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {inst.status === "connected"
                ? <Wifi className="w-3.5 h-3.5 text-green-400" />
                : <WifiOff className="w-3.5 h-3.5 text-gray-500" />}
              {inst.name}
              {inst.status === "connected" && (
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              )}
            </button>
          ))}

          {/* Métricas rápidas */}
          {metrics && (
            <div className="ml-auto flex items-center gap-3 text-xs text-gray-500 shrink-0">
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" />
                {metrics.openConversations} abertas
              </span>
              {metrics.totalUnread > 0 && (
                <span className="flex items-center gap-1 text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                  {metrics.totalUnread} não lidas
                </span>
              )}
              <span className="flex items-center gap-1">
                <Bot className="w-3.5 h-3.5" />
                {metrics.aiActiveConversations} com IA
              </span>
            </div>
          )}

          {isAdmin && (
            <Link href="/pdv/whatsapp/config">
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white shrink-0 ml-1">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </div>

        {/* ── Layout principal ────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">

          {/* ── Lista de conversas ──────────────────────────────────────────── */}
          <div className={`flex flex-col bg-gray-900 border-r border-gray-800 ${selectedConvId ? "hidden md:flex w-80 lg:w-96" : "flex w-full md:w-80 lg:w-96"}`}>

            {/* Busca */}
            <div className="p-3 border-b border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar conversa..."
                  className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 h-9 text-sm"
                />
              </div>
            </div>

            {/* Filtros */}
            <div className="flex gap-1 px-3 py-2 border-b border-gray-800">
              {(["open", "resolved", "archived"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setConvFilter(f)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    convFilter === f ? "bg-green-700 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  {f === "open" ? "Abertas" : f === "resolved" ? "Resolvidas" : "Arquivadas"}
                </button>
              ))}
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3 p-8">
                  <MessageCircle className="w-12 h-12 opacity-30" />
                  <p className="text-sm text-center">
                    {activeInstanceId
                      ? "Nenhuma conversa encontrada.\nAs conversas aparecerão aqui quando chegarem mensagens."
                      : "Selecione uma instância acima para ver as conversas."}
                  </p>
                </div>
              ) : (
                conversations.map((conv: any) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-gray-800/50 transition-all text-left ${
                      selectedConvId === conv.id
                        ? "bg-gray-800"
                        : "hover:bg-gray-800/50"
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${getAvatarColor(conv.contactName)}`}>
                      {getInitials(conv.contactName)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white text-sm font-semibold truncate">
                          {conv.contactName ?? conv.contactPhone ?? conv.remoteJid}
                        </span>
                        <span className="text-gray-500 text-xs shrink-0">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-gray-400 text-xs truncate">
                          {conv.lastMessage ?? "Sem mensagens"}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {conv.aiEnabled
                            ? <Bot className="w-3.5 h-3.5 text-green-500" />
                            : <BotOff className="w-3.5 h-3.5 text-orange-400" />}
                          {conv.unreadCount > 0 && (
                            <span className="bg-green-600 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                              {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Área de chat ────────────────────────────────────────────────── */}
          {selectedConvId && selectedConv ? (
            <div className="flex-1 flex flex-col min-w-0">

              {/* Header da conversa */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
                {/* Botão voltar (mobile) */}
                <button
                  onClick={() => setSelectedConvId(null)}
                  className="md:hidden text-gray-400 hover:text-white p-1 -ml-1"
                >
                  <ChevronDown className="w-5 h-5 rotate-90" />
                </button>

                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${getAvatarColor(selectedConv.contactName)}`}>
                  {getInitials(selectedConv.contactName)}
                </div>

                {/* Nome e status */}
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold text-sm truncate">
                    {selectedConv.contactName ?? selectedConv.contactPhone ?? selectedConv.remoteJid}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {selectedConv.contactPhone && (
                      <span>{selectedConv.contactPhone}</span>
                    )}
                    <span className={`flex items-center gap-1 ${selectedConv.aiEnabled ? "text-green-400" : "text-orange-400"}`}>
                      {selectedConv.aiEnabled ? <Bot className="w-3 h-3" /> : <BotOff className="w-3 h-3" />}
                      {selectedConv.aiEnabled ? "IA ativa" : `IA pausada por ${selectedConv.aiDisabledBy ?? "atendente"}`}
                    </span>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Toggle IA */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAi.mutate({ conversationId: selectedConvId, enabled: !selectedConv.aiEnabled })}
                    disabled={toggleAi.isPending}
                    className={`gap-1.5 text-xs h-8 px-3 ${
                      selectedConv.aiEnabled
                        ? "text-green-400 hover:text-green-300 hover:bg-green-950/30"
                        : "text-orange-400 hover:text-orange-300 hover:bg-orange-950/30"
                    }`}
                    title={selectedConv.aiEnabled ? "Pausar IA e assumir atendimento" : "Reativar IA"}
                  >
                    {selectedConv.aiEnabled ? <BotOff className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    <span className="hidden sm:inline">
                      {selectedConv.aiEnabled ? "Pausar IA" : "Ativar IA"}
                    </span>
                  </Button>

                  {/* Menu de opções */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700 text-white">
                      <DropdownMenuItem
                        onClick={openNotes}
                        className="hover:bg-gray-700 cursor-pointer gap-2"
                      >
                        <StickyNote className="w-4 h-4" /> Anotações
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateConv.mutate({ id: selectedConvId, status: "resolved" })}
                        className="hover:bg-gray-700 cursor-pointer gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Marcar como resolvida
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateConv.mutate({ id: selectedConvId, status: "archived" })}
                        className="hover:bg-gray-700 cursor-pointer gap-2"
                      >
                        <Archive className="w-4 h-4" /> Arquivar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Aviso IA desativada */}
              {!selectedConv.aiEnabled && (
                <div className="flex items-center gap-2 px-4 py-2 bg-orange-950/30 border-b border-orange-900/30 text-orange-300 text-xs shrink-0">
                  <BotOff className="w-4 h-4 shrink-0" />
                  <span>
                    IA pausada por <strong>{selectedConv.aiDisabledBy ?? "atendente"}</strong>. Você está respondendo manualmente.
                    <button
                      onClick={() => toggleAi.mutate({ conversationId: selectedConvId, enabled: true })}
                      className="ml-2 underline hover:text-orange-200"
                    >
                      Reativar IA
                    </button>
                  </span>
                </div>
              )}

              {/* Mensagens */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-2"
                style={{
                  backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)",
                  backgroundSize: "24px 24px",
                }}
              >
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                    <MessageCircle className="w-10 h-10 opacity-30" />
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                  </div>
                ) : (
                  messages.map((msg: any) => {
                    const isFromMe = msg.fromMe;
                    const isAi = msg.senderType === "ai";
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isFromMe ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            isFromMe
                              ? isAi
                                ? "bg-green-800 text-white rounded-br-sm"
                                : "bg-green-700 text-white rounded-br-sm"
                              : "bg-gray-700 text-white rounded-bl-sm"
                          }`}
                        >
                          {/* Badge IA */}
                          {isAi && (
                            <div className="flex items-center gap-1 mb-1">
                              <Bot className="w-3 h-3 text-green-300" />
                              <span className="text-green-300 text-xs font-medium">IA</span>
                            </div>
                          )}
                          {/* Conteúdo */}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                          {/* Rodapé */}
                          <div className={`flex items-center gap-1 mt-1 ${isFromMe ? "justify-end" : "justify-start"}`}>
                            <span className="text-xs opacity-60">{formatMsgTime(msg.timestamp)}</span>
                            {isFromMe && STATUS_ICONS[msg.status]}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input de mensagem */}
              <div className="px-4 py-3 bg-gray-900 border-t border-gray-800 shrink-0">
                {/* Respostas rápidas */}
                {showQuickReplies && quickReplies.length > 0 && (
                  <div className="mb-3 bg-gray-800 rounded-xl border border-gray-700 max-h-48 overflow-y-auto">
                    <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                      <span className="text-xs text-gray-400 font-medium">Respostas rápidas</span>
                      <button onClick={() => setShowQuickReplies(false)} className="text-gray-500 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {quickReplies.map((qr: any) => (
                      <button
                        key={qr.id}
                        onClick={() => handleQuickReply(qr.content)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-700 transition-colors border-b border-gray-700/50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          {qr.shortcut && (
                            <span className="text-green-400 text-xs font-mono bg-green-950/30 px-1.5 py-0.5 rounded">
                              {qr.shortcut}
                            </span>
                          )}
                          <span className="text-white text-sm font-medium">{qr.title}</span>
                        </div>
                        <p className="text-gray-400 text-xs mt-0.5 truncate">{qr.content}</p>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  {/* Botão respostas rápidas */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowQuickReplies(v => !v)}
                    className={`shrink-0 h-10 w-10 ${showQuickReplies ? "text-green-400" : "text-gray-400 hover:text-white"}`}
                    title="Respostas rápidas"
                  >
                    <Zap className="w-5 h-5" />
                  </Button>

                  {/* Textarea */}
                  <Textarea
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite uma mensagem... (Enter para enviar)"
                    className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none min-h-[42px] max-h-32 text-sm rounded-xl"
                    rows={1}
                  />

                  {/* Botão enviar */}
                  <Button
                    onClick={handleSend}
                    disabled={!messageText.trim() || sendMsg.isPending}
                    className="shrink-0 h-10 w-10 bg-green-700 hover:bg-green-600 rounded-xl p-0"
                    title="Enviar mensagem"
                  >
                    {sendMsg.isPending
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Tela vazia quando nenhuma conversa está selecionada */
            <div className="hidden md:flex flex-1 flex-col items-center justify-center text-gray-600 gap-4">
              <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center">
                <MessageCircle className="w-10 h-10 opacity-40" />
              </div>
              <div className="text-center">
                <p className="text-gray-400 font-medium">WhatsApp IA — Jumera Sport</p>
                <p className="text-sm mt-1">Selecione uma conversa para começar o atendimento</p>
              </div>
              {instances.every((i: any) => i.status !== "connected") && (
                <div className="bg-gray-800/50 rounded-xl p-4 max-w-sm text-center">
                  <WifiOff className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                  <p className="text-orange-300 text-sm font-medium">Nenhuma instância conectada</p>
                  <p className="text-gray-500 text-xs mt-1">
                    Configure as credenciais do evocloud.pro nas configurações para conectar os números.
                  </p>
                  {isAdmin && (
                    <Link href="/pdv/whatsapp/config">
                      <Button variant="outline" size="sm" className="mt-3 text-xs border-gray-600">
                        <Settings className="w-3.5 h-3.5 mr-1.5" /> Configurar
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialog de anotações */}
      <Dialog open={notesDialog} onOpenChange={setNotesDialog}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="w-5 h-5" />
              Anotações — {selectedConv?.contactName ?? selectedConv?.contactPhone}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesText}
            onChange={e => setNotesText(e.target.value)}
            placeholder="Adicione notas internas sobre este contato (não são enviadas ao cliente)..."
            className="bg-gray-800 border-gray-700 text-white min-h-[120px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotesDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => updateConv.mutate({ id: selectedConvId!, notes: notesText })}
              disabled={updateConv.isPending}
              className="bg-green-700 hover:bg-green-600"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PdvLayout>
  );
}
