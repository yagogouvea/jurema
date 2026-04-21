import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import { Trophy, Star, Medal, TrendingUp, ShoppingBag, Package, ChevronLeft, ChevronRight, Calendar, Box, DollarSign, Layers, Gift } from "lucide-react";

function formatPT(v: number) {
  return `${Math.round(v).toLocaleString("pt-BR")} PT`;
}
function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: any) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const LEVEL_CONFIG = {
  OURO: { label: "Ouro", color: "text-yellow-400", bg: "bg-yellow-400", border: "border-yellow-500", icon: Trophy, glow: "shadow-yellow-500/30" },
  PRATA: { label: "Prata", color: "text-gray-300", bg: "bg-gray-300", border: "border-gray-400", icon: Star, glow: "shadow-gray-400/30" },
  BRONZE: { label: "Bronze", color: "text-orange-400", bg: "bg-orange-400", border: "border-orange-500", icon: Medal, glow: "shadow-orange-500/30" },
};

// Atalhos de período
const PERIOD_SHORTCUTS = [
  { label: "Hoje", getValue: () => {
    const d = new Date().toISOString().slice(0, 10);
    return { start: d, end: d };
  }},
  { label: "Esta semana", getValue: () => {
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
  }},
  { label: "Este mês", getValue: () => {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { start, end };
  }},
  { label: "Mês passado", getValue: () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
  }},
];

export default function PdvMeuPerfil() {
  const { seller } = usePdvAuth();
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Filtro unificado para progress + history
  const progressInput = useMemo(() => ({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }), [startDate, endDate]);

  const historyInput = useMemo(() => ({
    page,
    limit: 15,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }), [page, startDate, endDate]);

  const { data: progress, isLoading: loadingProgress } = trpc.pdvDashboard.getMyProgress.useQuery(progressInput);
  const { data: history, isLoading: loadingHistory } = trpc.pdvDashboard.getMyHistory.useQuery(historyInput);

  const goals = progress?.goals ?? {};
  const pontuacao = progress?.pontuacao ?? 0;
  const metaAtingida = progress?.metaAtingida ?? null;
  const totalBonus = progress?.totalBonus ?? 0;
  const totalCaixinha = progress?.totalCaixinha ?? 0;
  const qtdCaixinha = progress?.qtdCaixinha ?? 0;
  const totalPecas = progress?.totalPecas ?? 0;

  // Verificar se algum pedido tem caixinha (para mostrar coluna)
  const hasCaixinha = history?.orders.some(o => o.caixinhaTotal > 0) ?? false;

  // Calcular barra de progresso
  const maxMeta = Math.max(goals.OURO || 0, goals.PRATA || 0, goals.BRONZE || 0, 1);
  const progressPct = Math.min(100, (pontuacao / maxMeta) * 100);

  // Próxima meta
  const proximaMeta = !metaAtingida
    ? (goals.BRONZE ? { label: "Bronze", valor: goals.BRONZE, pct: goals.BRONZE / maxMeta * 100, color: "bg-orange-400" } : null)
    : metaAtingida === "BRONZE"
      ? (goals.PRATA ? { label: "Prata", valor: goals.PRATA, pct: goals.PRATA / maxMeta * 100, color: "bg-gray-300" } : null)
      : metaAtingida === "PRATA"
        ? (goals.OURO ? { label: "Ouro", valor: goals.OURO, pct: goals.OURO / maxMeta * 100, color: "bg-yellow-400" } : null)
        : null;

  const levelCfg = metaAtingida ? LEVEL_CONFIG[metaAtingida as keyof typeof LEVEL_CONFIG] : null;
  const LevelIcon = levelCfg?.icon ?? TrendingUp;

  function applyShortcut(s: string, e: string) {
    setStartDate(s);
    setEndDate(e);
    setPage(1);
  }

  const periodLabel = startDate || endDate
    ? `${startDate ? formatDate(startDate) : "início"} até ${endDate ? formatDate(endDate) : "hoje"}`
    : progress?.periodo
      ? `${formatDate(progress.periodo.startDate)} a ${formatDate(progress.periodo.endDate)}`
      : "Este mês";

  return (
    <PdvLayout>
      <div className="p-4 md:p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-900/50 border border-green-700 flex items-center justify-center">
            <span className="text-green-400 font-bold text-lg">{seller?.name?.[0]?.toUpperCase() ?? "?"}</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">{seller?.name ?? "Vendedor"}</h1>
            <p className="text-gray-400 text-sm">Meu Perfil — {periodLabel}</p>
          </div>
          {levelCfg && (
            <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border ${levelCfg.border} bg-gray-900`}>
              <LevelIcon className={`w-4 h-4 ${levelCfg.color}`} />
              <span className={`text-sm font-bold ${levelCfg.color}`}>{levelCfg.label}</span>
            </div>
          )}
        </div>

        {/* Filtro de período unificado */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-400" />
            <span className="text-white text-sm font-semibold">Filtrar período</span>
          </div>
          {/* Atalhos */}
          <div className="flex flex-wrap gap-2">
            {PERIOD_SHORTCUTS.map(s => {
              const v = s.getValue();
              const isActive = startDate === v.start && endDate === v.end;
              return (
                <button
                  key={s.label}
                  onClick={() => applyShortcut(v.start, v.end)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    isActive
                      ? "border-green-600 bg-green-900/40 text-green-300"
                      : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500 hover:text-white"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-500 hover:text-white hover:border-gray-500 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
          {/* Datas manuais */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-green-600"
            />
            <span className="text-gray-500 text-xs">até</span>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-green-600"
            />
          </div>
        </div>

        {/* Cards de resumo — 5 cards */}
        {loadingProgress ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-24 bg-gray-900 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Pontuação */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
              <TrendingUp className="w-5 h-5 text-green-400 mb-0.5" />
              <p className="text-green-400 font-bold text-lg leading-tight">{formatPT(pontuacao)}</p>
              <p className="text-gray-400 text-xs">Pontuação</p>
            </div>
            {/* Peças */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
              <Layers className="w-5 h-5 text-blue-400 mb-0.5" />
              <p className="text-blue-400 font-bold text-lg leading-tight">{totalPecas}</p>
              <p className="text-gray-400 text-xs">Peças</p>
            </div>
            {/* Bônus */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
              <DollarSign className="w-5 h-5 text-purple-400 mb-0.5" />
              <p className="text-purple-400 font-bold text-lg leading-tight">{formatBRL(totalBonus)}</p>
              <p className="text-gray-400 text-xs">Bônus</p>
            </div>
            {/* Caixinha */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
              <Box className="w-5 h-5 text-yellow-400 mb-0.5" />
              <p className="text-yellow-400 font-bold text-lg leading-tight">{formatBRL(totalCaixinha)}</p>
              <p className="text-gray-400 text-xs">Caixinha {qtdCaixinha > 0 && <span className="text-yellow-600">({qtdCaixinha})</span>}</p>
            </div>
            {/* Bônus + Caixinha */}
            <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-purple-900/40 to-yellow-900/30 border border-purple-700/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
              <Gift className="w-5 h-5 text-pink-400 mb-0.5" />
              <p className="text-pink-400 font-bold text-lg leading-tight">{formatBRL(totalBonus + totalCaixinha)}</p>
              <p className="text-gray-400 text-xs text-center">Bônus + Caixinha</p>
            </div>
          </div>
        )}

        {/* Barra de progresso de metas */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              Progresso de Metas
            </h2>
            <span className="text-green-400 font-bold text-sm">{formatPT(pontuacao)}</span>
          </div>

          {/* Barra principal */}
          <div className="relative">
            <div className="w-full h-5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  metaAtingida === "OURO" ? "bg-gradient-to-r from-yellow-600 to-yellow-400" :
                  metaAtingida === "PRATA" ? "bg-gradient-to-r from-gray-500 to-gray-300" :
                  metaAtingida === "BRONZE" ? "bg-gradient-to-r from-orange-600 to-orange-400" :
                  "bg-gradient-to-r from-green-700 to-green-500"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {goals.BRONZE > 0 && (
              <div className="absolute top-0 h-5 flex items-center" style={{ left: `${Math.min(99, (goals.BRONZE / maxMeta) * 100)}%` }}>
                <div className="w-0.5 h-7 bg-orange-400 -mt-1 opacity-70" />
              </div>
            )}
            {goals.PRATA > 0 && (
              <div className="absolute top-0 h-5 flex items-center" style={{ left: `${Math.min(99, (goals.PRATA / maxMeta) * 100)}%` }}>
                <div className="w-0.5 h-7 bg-gray-300 -mt-1 opacity-70" />
              </div>
            )}
            {goals.OURO > 0 && (
              <div className="absolute top-0 h-5 flex items-center" style={{ left: `${Math.min(99, (goals.OURO / maxMeta) * 100)}%` }}>
                <div className="w-0.5 h-7 bg-yellow-400 -mt-1 opacity-70" />
              </div>
            )}
          </div>

          {/* Legenda das metas */}
          <div className="flex flex-wrap gap-3 text-xs">
            {goals.BRONZE > 0 && (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${pontuacao >= goals.BRONZE ? "border-orange-500 bg-orange-950/40" : "border-gray-700 bg-gray-800/50"}`}>
                <Medal className={`w-3.5 h-3.5 ${pontuacao >= goals.BRONZE ? "text-orange-400" : "text-gray-500"}`} />
                <span className={pontuacao >= goals.BRONZE ? "text-orange-300" : "text-gray-500"}>Bronze: {formatPT(goals.BRONZE)}</span>
                {pontuacao >= goals.BRONZE && <span className="text-orange-400">✓</span>}
              </div>
            )}
            {goals.PRATA > 0 && (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${pontuacao >= goals.PRATA ? "border-gray-400 bg-gray-800" : "border-gray-700 bg-gray-800/50"}`}>
                <Star className={`w-3.5 h-3.5 ${pontuacao >= goals.PRATA ? "text-gray-300" : "text-gray-500"}`} />
                <span className={pontuacao >= goals.PRATA ? "text-gray-200" : "text-gray-500"}>Prata: {formatPT(goals.PRATA)}</span>
                {pontuacao >= goals.PRATA && <span className="text-gray-300">✓</span>}
              </div>
            )}
            {goals.OURO > 0 && (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${pontuacao >= goals.OURO ? "border-yellow-500 bg-yellow-950/40" : "border-gray-700 bg-gray-800/50"}`}>
                <Trophy className={`w-3.5 h-3.5 ${pontuacao >= goals.OURO ? "text-yellow-400" : "text-gray-500"}`} />
                <span className={pontuacao >= goals.OURO ? "text-yellow-300" : "text-gray-500"}>Ouro: {formatPT(goals.OURO)}</span>
                {pontuacao >= goals.OURO && <span className="text-yellow-400">✓</span>}
              </div>
            )}
          </div>

          {/* Mensagem de progresso */}
          {proximaMeta && (
            <div className="bg-gray-800/60 rounded-xl px-4 py-2.5 text-sm">
              <span className="text-gray-400">Faltam </span>
              <span className="text-green-400 font-bold">{formatPT(proximaMeta.valor - pontuacao)}</span>
              <span className="text-gray-400"> para a meta </span>
              <span className={`font-bold ${
                proximaMeta.label === "Ouro" ? "text-yellow-400" :
                proximaMeta.label === "Prata" ? "text-gray-300" : "text-orange-400"
              }`}>{proximaMeta.label}</span>
            </div>
          )}
          {metaAtingida === "OURO" && (
            <div className="bg-yellow-950/40 border border-yellow-700/50 rounded-xl px-4 py-2.5 text-sm text-yellow-300 font-semibold text-center">
              Parabéns! Você atingiu a meta Ouro no período!
            </div>
          )}
          {!metaAtingida && !proximaMeta && !loadingProgress && (
            <p className="text-gray-500 text-xs text-center">Metas não configuradas. Solicite ao administrador.</p>
          )}
        </div>

        {/* Histórico de vendas */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-green-400" />
              Histórico de Vendas
              {hasCaixinha && (
                <span className="ml-1 text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Box className="w-3 h-3" /> com caixinha
                </span>
              )}
            </h2>
          </div>

          {loadingHistory ? (
            <div className="p-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !history?.orders.length ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhuma venda encontrada no período.
            </div>
          ) : (
            <>
              {/* Tabela desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-800">
                      <th className="text-left px-4 py-3">Pedido</th>
                      <th className="text-left px-4 py-3">Data</th>
                      <th className="text-left px-4 py-3">Cliente</th>
                      <th className="text-left px-4 py-3">Regime</th>
                      <th className="text-right px-4 py-3">Peças</th>
                      <th className="text-right px-4 py-3 text-green-400">Pontos</th>
                      <th className="text-right px-4 py-3 text-purple-400">Bônus</th>
                      {hasCaixinha && <th className="text-right px-4 py-3 text-yellow-400">Caixinha</th>}
                      <th className="text-right px-4 py-3">Total</th>
                      <th className="text-center px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.orders.map((order, i) => (
                      <tr key={order.pedidoId} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${i % 2 === 0 ? "" : "bg-gray-900/30"}`}>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{order.pedidoId}</td>
                        <td className="px-4 py-3 text-gray-400">{formatDate(order.createdAt)}</td>
                        <td className="px-4 py-3 text-white">{order.clienteNome || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            order.regime === "ATACADO" ? "bg-blue-900/50 text-blue-300" : "bg-purple-900/50 text-purple-300"
                          }`}>{order.regime}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{order.totalPecas}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-400">{formatPT(order.pontuacao)}</td>
                        <td className="px-4 py-3 text-right text-purple-300">{formatBRL(order.bonusTotal)}</td>
                        {hasCaixinha && (
                          <td className="px-4 py-3 text-right">
                            {order.caixinhaTotal > 0
                              ? <span className="text-yellow-400 font-semibold">{formatBRL(order.caixinhaTotal)}</span>
                              : <span className="text-gray-600">—</span>
                            }
                          </td>
                        )}
                        <td className="px-4 py-3 text-right text-white">{formatBRL(order.totalAplicado)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            order.status === "PAGO" ? "bg-green-900/50 text-green-300" :
                            order.status === "PENDENTE" ? "bg-yellow-900/50 text-yellow-300" :
                            "bg-red-900/50 text-red-300"
                          }`}>{order.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Rodapé com totais */}
                  <tfoot>
                    <tr className="border-t border-gray-700 bg-gray-800/50">
                      <td colSpan={4} className="px-4 py-3 text-gray-300 font-semibold text-sm">
                        Total ({history.total} pedidos)
                      </td>
                      <td className="px-4 py-3 text-right text-blue-300 font-semibold">{totalPecas}</td>
                      <td className="px-4 py-3 text-right text-green-400 font-bold">{formatPT(pontuacao)}</td>
                      <td className="px-4 py-3 text-right text-purple-300 font-semibold">{formatBRL(totalBonus)}</td>
                      {hasCaixinha && <td className="px-4 py-3 text-right text-yellow-400 font-semibold">{formatBRL(totalCaixinha)}</td>}
                      <td className="px-4 py-3 text-right text-white font-semibold">{formatBRL(progress?.faturamento ?? 0)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Cards mobile */}
              <div className="md:hidden divide-y divide-gray-800">
                {history.orders.map(order => (
                  <div key={order.pedidoId} className="p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-medium text-sm">{order.clienteNome || "—"}</p>
                        <p className="text-gray-500 text-xs font-mono">{order.pedidoId} · {formatDate(order.createdAt)}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        order.status === "PAGO" ? "bg-green-900/50 text-green-300" :
                        order.status === "PENDENTE" ? "bg-yellow-900/50 text-yellow-300" :
                        "bg-red-900/50 text-red-300"
                      }`}>{order.status}</span>
                    </div>
                    <div className="flex gap-3 text-xs flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full ${order.regime === "ATACADO" ? "bg-blue-900/50 text-blue-300" : "bg-purple-900/50 text-purple-300"}`}>{order.regime}</span>
                      <span className="text-gray-400">{order.totalPecas} peças</span>
                      <span className="text-green-400 font-bold">{formatPT(order.pontuacao)}</span>
                      <span className="text-purple-300">Bônus: {formatBRL(order.bonusTotal)}</span>
                      {order.caixinhaTotal > 0 && (
                        <span className="text-yellow-400 font-semibold flex items-center gap-0.5">
                          <Box className="w-3 h-3" /> {formatBRL(order.caixinhaTotal)}
                        </span>
                      )}
                      <span className="text-white font-medium">{formatBRL(order.totalAplicado)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Paginação */}
              {history.pages > 1 && (
                <div className="p-4 border-t border-gray-800 flex items-center justify-between">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="text-gray-400 text-sm">Página {page} de {history.pages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(history.pages, p + 1))}
                    disabled={page === history.pages}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
                  >
                    Próxima <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </PdvLayout>
  );
}
