import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { useLocation, useSearch } from "wouter";
import { firstOfMonthYmdSaoPaulo, todayYmdSaoPaulo } from "@shared/spCalendar";
import PdvLayout from "./PdvLayout";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, DollarSign, ShoppingBag, Package, TrendingUp,
  Award, Calendar, ArrowLeft, ChevronRight, Wallet, Trophy, Sparkles,
} from "lucide-react";

const SELLER_COLORS = ["#16a34a", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

const META_COLORS: Record<string, string> = {
  OURO: "text-yellow-400",
  PRATA: "text-gray-300",
  BRONZE: "text-orange-400",
};
const META_BG: Record<string, string> = {
  OURO: "bg-yellow-950/40 border-yellow-900/50",
  PRATA: "bg-gray-800/60 border-gray-700/50",
  BRONZE: "bg-orange-950/40 border-orange-900/50",
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function formatPontos(v: number) {
  return `${Math.round(v).toLocaleString("pt-BR")} PT`;
}
function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const META_RING: Record<string, string> = {
  OURO: "ring-2 ring-yellow-400 shadow-lg shadow-yellow-500/20",
  PRATA: "ring-2 ring-gray-300 shadow-lg shadow-gray-300/20",
  BRONZE: "ring-2 ring-orange-400 shadow-lg shadow-orange-400/20",
  META_LOJA: "ring-2 ring-green-400 shadow-lg shadow-green-500/20",
};
const META_BAR: Record<string, string> = {
  OURO: "bg-yellow-400",
  PRATA: "bg-gray-300",
  BRONZE: "bg-orange-400",
  META_LOJA: "bg-green-500",
};

export default function PdvSellerPanel() {
  const { isAdmin } = usePdvAuth();
  const [, navigate] = useLocation();
  const search = useSearch();

  // Lê ?seller=ID da URL (passado pelo card do Dashboard)
  const initialSellerId = useMemo(() => {
    const params = new URLSearchParams(search);
    const v = params.get("seller");
    return v ? parseInt(v) : undefined;
  }, [search]);

  const [selectedSellerId, setSelectedSellerId] = useState<number | undefined>(initialSellerId);
  const [startDate, setStartDate] = useState(() => firstOfMonthYmdSaoPaulo());
  const [endDate, setEndDate] = useState(() => todayYmdSaoPaulo());

  const queryInput = useMemo(() => ({
    sellerId: selectedSellerId,
    startDate,
    endDate,
  }), [selectedSellerId, startDate, endDate]);

  const { data, isLoading } = trpc.pdvDashboard.sellerPanel.useQuery(queryInput, {
    enabled: isAdmin,
  });

  // Lista fixa de vendedores ativos para os botões (independente do filtro selecionado)
  const { data: allSellersList } = trpc.pdvSellers.list.useQuery(undefined, { enabled: isAdmin });

  // Guard
  if (!isAdmin) {
    navigate("/pdv");
    return null;
  }

  const sellers = data?.sellers || [];
  const kpis = data?.kpis;
  const daily = data?.daily || [];
  const recentOrders = data?.recentOrders || [];
  const goals = (data?.goals || {}) as Record<string, number>;

  const sellerListForButtons = (allSellersList as any[]) || [];

  const selectedSellerName = selectedSellerId
    ? sellerListForButtons.find((s: any) => Number(s.id) === selectedSellerId)?.name ?? "Vendedor"
    : "Todos os Vendedores";

  const selectedColor = selectedSellerId
    ? SELLER_COLORS[sellerListForButtons.findIndex((s: any) => Number(s.id) === selectedSellerId) % SELLER_COLORS.length]
    : "#16a34a";

  return (
    <PdvLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate("/pdv/dashboard")}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </button>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <h1 className="text-white text-xl font-bold">Painel por Vendedor</h1>
        </div>

        {/* Filtros: período + seletor de vendedor */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4">
          {/* Período */}
          <div className="flex flex-wrap items-center gap-3">
            <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-gray-400 text-sm">Período:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600"
            />
            <span className="text-gray-600">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600"
            />
          </div>

          {/* Seletor de vendedor */}
          <div className="flex flex-wrap items-center gap-2">
            <Users className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-gray-400 text-sm">Vendedor:</span>
            {/* "Todos" */}
            <button
              onClick={() => setSelectedSellerId(undefined)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                !selectedSellerId
                  ? "bg-green-700 border-green-600 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
              }`}
            >
              Todos
            </button>
            {/* Botão por vendedor — lista fixa independente do filtro */}
            {!allSellersList
              ? <span className="text-gray-600 text-xs">Carregando...</span>
              : (allSellersList || []).map((s: any, i: number) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSellerId(Number(s.id))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    selectedSellerId === Number(s.id)
                      ? "border-transparent text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
                  }`}
                  style={
                    selectedSellerId === Number(s.id)
                      ? { backgroundColor: SELLER_COLORS[i % SELLER_COLORS.length], borderColor: SELLER_COLORS[i % SELLER_COLORS.length] }
                      : {}
                  }
                >
                  {s.name}
                </button>
              ))
            }
          </div>
        </div>

        {/* Título + PT atuais do vendedor selecionado (ou loja) */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedColor }} />
          <h2 className="text-white text-lg font-bold">{selectedSellerName}</h2>
          {kpis && (
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span className="text-gray-400 text-xs">Pontos do período:</span>
              <span className="text-white text-sm font-bold">{formatPontos(kpis.pontuacao ?? 0)}</span>
            </div>
          )}
          {kpis?.metaAtingida && (
            <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${META_BG[kpis.metaAtingida]} ${META_COLORS[kpis.metaAtingida]}`}>
              <Award className="w-3 h-3 inline mr-1" />
              Meta {kpis.metaAtingida} batida
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !kpis ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <Users className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Nenhum dado encontrado para o período</p>
          </div>
        ) : (
          <>
            {/* KPIs principais */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
              {[
                { label: "Pontos (PT)", value: formatPontos(kpis.pontuacao ?? 0), icon: Trophy, color: "text-amber-300", bg: "bg-amber-950/40 border-amber-800/50" },
                { label: "Faturamento", value: formatCurrency(kpis.faturamento), icon: DollarSign, color: "text-green-400", bg: "bg-green-950/30 border-green-900/50" },
                { label: "Pedidos", value: String(kpis.totalPedidos), icon: ShoppingBag, color: "text-blue-400", bg: "bg-blue-950/30 border-blue-900/50" },
                { label: "Peças", value: String(kpis.totalPecas), icon: Package, color: "text-purple-400", bg: "bg-purple-950/30 border-purple-900/50" },
                { label: "Bônus Total", value: formatCurrency(kpis.totalBonus), icon: TrendingUp, color: "text-yellow-400", bg: "bg-yellow-950/30 border-yellow-900/50" },
                { label: "Caixinha", value: formatCurrency(kpis.totalCaixinha), icon: Wallet, color: "text-orange-400", bg: "bg-orange-950/30 border-orange-900/50" },
                { label: "Ticket Médio", value: kpis.totalPedidos > 0 ? formatCurrency(kpis.faturamento / kpis.totalPedidos) : "R$ 0,00", icon: Award, color: "text-pink-400", bg: "bg-pink-950/30 border-pink-900/50" },
              ].map((kpi) => (
                <div key={kpi.label} className={`border rounded-2xl p-4 ${kpi.bg}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                    <span className="text-gray-400 text-xs">{kpi.label}</span>
                  </div>
                  <div className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* KPIs secundários: Atacado / Varejo / Balcão / WhatsApp */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Atacado", value: formatCurrency(kpis.faturamentoAtacado), color: "text-cyan-400" },
                { label: "Varejo", value: formatCurrency(kpis.faturamentoVarejo), color: "text-indigo-400" },
                { label: "Balcão", value: formatCurrency(kpis.faturamentoBalcao), color: "text-teal-400" },
                { label: "WhatsApp", value: formatCurrency(kpis.faturamentoWhatsapp), color: "text-emerald-400" },
              ].map((item) => (
                <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-gray-400 text-xs">{item.label}</span>
                  <span className={`font-semibold text-sm ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Gráfico: Faturamento por dia */}
            {daily.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h3 className="text-white font-semibold mb-4">Faturamento por Dia</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={daily}>
                    <defs>
                      <linearGradient id="colorFatSeller" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={selectedColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={selectedColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="dia" tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickFormatter={formatDate} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                      labelStyle={{ color: "#fff" }}
                      labelFormatter={(v) => new Date(v + "T00:00:00").toLocaleDateString("pt-BR")}
                      formatter={(v: any, name: string) => [
                        name === "faturamento" ? formatCurrency(v) : v,
                        name === "faturamento" ? "Faturamento" : name === "pecas" ? "Peças" : "Bônus",
                      ]}
                    />
                    <Area type="monotone" dataKey="faturamento" stroke={selectedColor} fill="url(#colorFatSeller)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Gráfico: Peças e Bônus por dia */}
            {daily.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <h3 className="text-white font-semibold mb-4">Peças por Dia</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="dia" tick={{ fill: "#9ca3af", fontSize: 10 }} tickFormatter={formatDate} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px" }}
                        labelStyle={{ color: "#fff" }}
                        labelFormatter={(v) => new Date(v + "T00:00:00").toLocaleDateString("pt-BR")}
                        formatter={(v: any) => [v, "Peças"]}
                      />
                      <Bar dataKey="pecas" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <h3 className="text-white font-semibold mb-4">Bônus por Dia</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="dia" tick={{ fill: "#9ca3af", fontSize: 10 }} tickFormatter={formatDate} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} tickFormatter={(v) => `R$${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px" }}
                        labelStyle={{ color: "#fff" }}
                        labelFormatter={(v) => new Date(v + "T00:00:00").toLocaleDateString("pt-BR")}
                        formatter={(v: any) => [formatCurrency(v), "Bônus"]}
                      />
                      <Bar dataKey="bonus" fill="#eab308" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Metas (em PONTOS — Bronze/Prata/Ouro são individuais; Meta Loja vale só quando "Todos") */}
            {Object.keys(goals).length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="text-white font-semibold">Metas do Período (em PT)</h3>
                  <div className="text-xs text-gray-400">
                    Atual: <span className="text-amber-300 font-bold">{formatPontos(kpis.pontuacao ?? 0)}</span>
                    {selectedSellerId
                      ? <span className="text-gray-500 ml-2">— metas individuais</span>
                      : <span className="text-gray-500 ml-2">— soma de todos os vendedores</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { key: "BRONZE", label: "Bronze", color: "text-orange-400", bg: "bg-orange-950/30 border-orange-900/50", soloLoja: false },
                    { key: "PRATA", label: "Prata", color: "text-gray-300", bg: "bg-gray-800/60 border-gray-700/50", soloLoja: false },
                    { key: "OURO", label: "Ouro", color: "text-yellow-400", bg: "bg-yellow-950/30 border-yellow-900/50", soloLoja: false },
                    { key: "META_LOJA", label: "Meta Loja", color: "text-green-500", bg: "bg-green-950/30 border-green-900/50", soloLoja: true },
                  ].map(m => {
                    const goalValue = goals[m.key] || 0;
                    // META_LOJA só faz sentido quando "Todos" está selecionado
                    const aplicavel = m.soloLoja ? !selectedSellerId : true;
                    const pontos = kpis.pontuacao ?? 0;
                    const reached = aplicavel && goalValue > 0 && pontos >= goalValue;
                    const pct = aplicavel && goalValue > 0
                      ? Math.min(100, (pontos / goalValue) * 100)
                      : 0;
                    const faltam = aplicavel && goalValue > 0 ? Math.max(0, goalValue - pontos) : 0;

                    return (
                      <div
                        key={m.key}
                        className={`relative border rounded-xl p-3 transition-all ${m.bg} ${
                          reached ? META_RING[m.key] : ""
                        } ${!aplicavel ? "opacity-40" : ""}`}
                        title={!aplicavel ? "Meta da loja se aplica apenas quando 'Todos' está selecionado" : undefined}
                      >
                        {reached && (
                          <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg">
                            <Sparkles className="w-3 h-3" />
                            BATIDA
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className={`text-xs font-semibold ${m.color}`}>{m.label}</div>
                          {reached && <Trophy className={`w-4 h-4 ${m.color}`} />}
                        </div>
                        <div className="text-white font-bold text-sm mt-1">{formatPontos(goalValue)}</div>
                        {aplicavel && goalValue > 0 ? (
                          <div className="mt-2">
                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  reached ? META_BAR[m.key] : "bg-gray-500"
                                }`}
                                style={{ width: `${pct.toFixed(1)}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className={`text-[11px] font-semibold ${reached ? m.color : "text-gray-400"}`}>
                                {pct.toFixed(0)}%
                              </span>
                              <span className="text-gray-500 text-[10px]">
                                {reached
                                  ? `+${formatPontos(pontos - goalValue)} acima`
                                  : `faltam ${formatPontos(faltam)}`}
                              </span>
                            </div>
                          </div>
                        ) : !aplicavel ? (
                          <div className="text-[10px] text-gray-500 mt-2 italic">
                            Aplica em "Todos"
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tabela de pedidos recentes */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h3 className="text-white font-semibold">
                  Pedidos Recentes
                  <span className="ml-2 text-gray-500 text-sm font-normal">({recentOrders.length} registros)</span>
                </h3>
              </div>
              {recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                  <ShoppingBag className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Nenhum pedido no período</p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-96">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-gray-900">
                      <tr className="border-b border-gray-800">
                        <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Data</th>
                        {!selectedSellerId && (
                          <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Vendedor</th>
                        )}
                        <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Cliente</th>
                        <th className="text-center text-gray-400 text-xs font-semibold px-4 py-3">Regime</th>
                        <th className="text-center text-gray-400 text-xs font-semibold px-4 py-3">Canal</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Peças</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Total</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Bônus</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Caixinha</th>
                        <th className="text-center text-gray-400 text-xs font-semibold px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((o) => (
                        <tr key={o.pedidoId} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3 text-gray-300 text-sm whitespace-nowrap">
                            {new Date(o.createdAt).toLocaleDateString("pt-BR")}
                          </td>
                          {!selectedSellerId && (
                            <td className="px-4 py-3 text-white text-sm font-medium">{o.sellerName}</td>
                          )}
                          <td className="px-4 py-3 text-white text-sm max-w-[120px] truncate">{o.clienteNome || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              o.regime === "ATACADO" ? "bg-blue-950/50 text-blue-400" : "bg-orange-950/50 text-orange-400"
                            }`}>
                              {o.regime}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              o.canal === "WHATSAPP" ? "bg-green-950/50 text-green-400" : "bg-gray-800 text-gray-400"
                            }`}>
                              {o.canal || "BALCAO"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-purple-400 font-bold text-sm">{o.totalPecas}</td>
                          <td className="px-4 py-3 text-right text-white font-semibold text-sm">{formatCurrency(o.totalAplicado)}</td>
                          <td className="px-4 py-3 text-right text-yellow-400 font-semibold text-sm">{formatCurrency(o.bonusTotal)}</td>
                          <td className="px-4 py-3 text-right text-orange-400 text-sm">{formatCurrency(o.caixinhaTotal)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              o.status === "CANCELADO"
                                ? "bg-red-950/50 text-red-400"
                                : "bg-green-950/50 text-green-400"
                            }`}>
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PdvLayout>
  );
}
