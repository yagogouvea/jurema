import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { PdvAuthProvider, usePdvAuth } from "@/contexts/PdvAuthContext";

const TIPOS = [
  { value: "", label: "Todos" },
  { value: "sync_concluido", label: "Sincronizações" },
  { value: "novo_produto", label: "Novos Produtos" },
  { value: "alteracao_produto", label: "Alterações" },
];

const TIPO_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  sync_concluido: { label: "Sincronização", color: "text-blue-400", bg: "bg-blue-900/30 border-blue-700/40" },
  novo_produto: { label: "Novo Produto", color: "text-green-400", bg: "bg-green-900/30 border-green-700/40" },
  alteracao_produto: { label: "Alteração", color: "text-yellow-400", bg: "bg-yellow-900/30 border-yellow-700/40" },
};

function PdvNotificacoesContent() {
  const { seller, isAdmin } = usePdvAuth();
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.pdvNotifications.list.useQuery(
    { page, limit: 20, tipo: tipoFiltro || undefined, apenasNaoLidas },
    { enabled: isAdmin }
  );

  const markRead = trpc.pdvNotifications.markRead.useMutation({
    onSuccess: () => utils.pdvNotifications.list.invalidate(),
  });

  const markAllRead = trpc.pdvNotifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.pdvNotifications.list.invalidate();
      utils.pdvNotifications.unreadCount.invalidate();
    },
  });

  const deleteAll = trpc.pdvNotifications.deleteAll.useMutation({
    onSuccess: () => {
      utils.pdvNotifications.list.invalidate();
      utils.pdvNotifications.unreadCount.invalidate();
    },
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium">Acesso restrito</p>
          <p className="text-sm mt-1">Apenas administradores podem ver as notificações.</p>
          <Link href="/pdv" className="mt-4 inline-block text-red-400 hover:text-red-300 text-sm">
            ← Voltar ao PDV
          </Link>
        </div>
      </div>
    );
  }

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  function formatDate(dateStr: string | Date) {
    const d = new Date(dateStr);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <Link href="/pdv" className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white">Notificações do PDV</h1>
          <p className="text-xs text-gray-400">Histórico de sincronizações e alertas internos</p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount} não lida{unreadCount !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending || unreadCount === 0}
            className="text-xs text-gray-400 hover:text-white disabled:opacity-40 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
          >
            Marcar todas como lidas
          </button>
          <button
            onClick={() => {
              if (confirm("Apagar todas as notificações? Esta ação não pode ser desfeita.")) {
                deleteAll.mutate();
              }
            }}
            disabled={deleteAll.isPending}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors px-2 py-1 rounded border border-red-900/50 hover:border-red-700/50"
          >
            Apagar tudo
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gray-900/50 border-b border-gray-800 px-4 py-2 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {TIPOS.map(t => (
            <button
              key={t.value}
              onClick={() => { setTipoFiltro(t.value); setPage(1); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                tipoFiltro === t.value
                  ? "bg-red-700 border-red-600 text-white"
                  : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={apenasNaoLidas}
            onChange={e => { setApenasNaoLidas(e.target.checked); setPage(1); }}
            className="accent-red-600"
          />
          Apenas não lidas
        </label>
        <button
          onClick={() => refetch()}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ↻ Atualizar
        </button>
      </div>

      {/* Lista */}
      <div className="max-w-4xl mx-auto p-4 space-y-2">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Carregando notificações...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔔</div>
            <p className="text-gray-400 font-medium">Nenhuma notificação encontrada</p>
            <p className="text-gray-600 text-sm mt-1">
              {apenasNaoLidas ? "Todas as notificações foram lidas." : "Sincronize o catálogo para gerar notificações."}
            </p>
          </div>
        ) : (
          notifications.map((n: any) => {
            const tipoInfo = TIPO_LABELS[n.type] || { label: n.type, color: "text-gray-400", bg: "bg-gray-800/50 border-gray-700/40" };
            const isExpanded = expandedId === n.id;
            const isUnread = !n.isRead;

            return (
              <div
                key={n.id}
                className={`rounded-lg border transition-all ${tipoInfo.bg} ${isUnread ? "ring-1 ring-inset ring-white/5" : "opacity-75"}`}
              >
                <div
                  className="flex items-start gap-3 p-3 cursor-pointer"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : n.id);
                    if (isUnread) markRead.mutate({ id: n.id });
                  }}
                >
                  {/* Indicador não lida */}
                  <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${isUnread ? "bg-red-500" : "bg-transparent"}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${tipoInfo.color}`}>
                        {tipoInfo.label}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(n.createdAt)}</span>
                      {isUnread && (
                        <span className="text-xs bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded">Nova</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-200 font-medium mt-0.5 truncate">{n.title}</p>
                    {!isExpanded && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{n.content?.split("\n")[0]}</p>
                    )}
                  </div>

                  <svg
                    className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-3 border-t border-white/5 mt-1 pt-2">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {n.content}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Paginação */}
        {data && data.totalPages > 1 && (
          <div className="flex justify-center gap-2 pt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm rounded border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white disabled:opacity-40 transition-colors"
            >
              ← Anterior
            </button>
            <span className="px-3 py-1 text-sm text-gray-500">
              {page} / {data.totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="px-3 py-1 text-sm rounded border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white disabled:opacity-40 transition-colors"
            >
              Próxima →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PdvNotificacoes() {
  return (
    <PdvAuthProvider>
      <PdvNotificacoesContent />
    </PdvAuthProvider>
  );
}
