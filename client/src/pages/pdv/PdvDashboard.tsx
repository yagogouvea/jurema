import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { useLocation } from "wouter";
import PdvLayout from "./PdvLayout";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  TrendingUp, ShoppingBag, Users, DollarSign, Plus, Minus,
  Target, ArrowUpRight, ArrowDownRight, Calendar, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

const COLORS = ["#16a34a", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function PdvDashboard() {
  const { isAdmin } = usePdvAuth();
  const [, navigate] = useLocation();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showCashModal, setShowCashModal] = useState<"SUPRIMENTO" | "SANGRIA" | null>(null);
  const [cashDesc, setCashDesc] = useState("");
  const [cashValor, setCashValor] = useState("");

  const { data, isLoading, refetch } = trpc.pdvDashboard.summary.useQuery({
    startDate,
    endDate,
  }, {
    // Só executa a query se for admin
    enabled: isAdmin,
  });

  const { data: cashData, refetch: refetchCash } = trpc.pdvDashboard.cashFlow.useQuery({
    startDate,
    endDate,
    limit: 10,
  }, {
    enabled: isAdmin,
  });

  const addCashFlowMutation = trpc.pdvDashboard.addCashFlow.useMutation({
    onSuccess: () => {
      toast.success("Movimentação registrada e sincronizada com a planilha");
      setCashDesc("");
      setCashValor("");
      setShowCashModal(null);
      refetchCash();
    },
    onError: (err) => toast.error(err.message),
  });

  const syncCashFlowToSheetMutation = trpc.pdvDashboard.syncCashFlowToSheet.useMutation({
    onSuccess: (res) => toast.success(`${res.count} movimentações exportadas para a planilha`),
    onError: (err) => toast.error(err.message),
  });

  const syncSalesToSheetMutation = trpc.pdvDashboard.syncSalesToSheet.useMutation({
    onSuccess: (res) => toast.success(`${res.count} vendas exportadas para VENDAS_CAIXA`),
    onError: (err) => toast.error(err.message),
  });

  const syncCashFlowFromSheetMutation = trpc.pdvDashboard.syncCashFlowFromSheet.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.inseridos} novas movimentações importadas da planilha`);
      refetchCash();
    },
    onError: (err) => toast.error(err.message),
  });

  const summary = data?.summary;
  const bySeller = data?.bySeller || [];
  const byPayment = data?.byPayment || [];
  const byDay = data?.byDay || [];
  const goals = data?.goals || [];

  const faturamento = parseFloat(summary?.faturamento || "0");
  const totalPedidos = parseInt(summary?.totalPedidos || "0");
  const ticketMedio = parseFloat(summary?.ticketMedio || "0");
  const faturamentoAtacado = parseFloat(summary?.faturamentoAtacado || "0");
  const faturamentoVarejo = parseFloat(summary?.faturamentoVarejo || "0");
  const faturamentoBalcao = parseFloat(summary?.faturamentoBalcao || "0");
  const faturamentoWhatsapp = parseFloat(summary?.faturamentoWhatsapp || "0");

  // Pontuação total da loja = soma de todos os vendedores
  const pontuacaoLoja = (data?.bySeller || []).reduce(
    (acc: number, s: any) => acc + parseFloat(s.pontuacao || "0"), 0
  );

  // Formatar pontos: ex. 1500 → "1.500 PT"
  const formatPontos = (v: number) =>
    `${Math.round(v).toLocaleString("pt-BR")} PT`;

  // Goals
  const bronze = parseFloat(goals.find(g => g.key === "BRONZE")?.value || "14000");
  const prata = parseFloat(goals.find(g => g.key === "PRATA")?.value || "23000");
  const ouro = parseFloat(goals.find(g => g.key === "OURO")?.value || "28000");
  const metaLoja = parseFloat(goals.find(g => g.key === "META_LOJA")?.value || "84000");

  const getGoalLevel = (value: number) => {
    if (value >= ouro) return { label: "OURO", color: "text-yellow-400", bg: "bg-yellow-400" };
    if (value >= prata) return { label: "PRATA", color: "text-gray-300", bg: "bg-gray-300" };
    if (value >= bronze) return { label: "BRONZE", color: "text-orange-400", bg: "bg-orange-400" };
    return { label: "ABAIXO", color: "text-green-500", bg: "bg-green-500" };
  };

  const handleCashFlow = () => {
    const valor = parseFloat(cashValor.replace(",", "."));
    if (!cashDesc.trim() || isNaN(valor) || valor <= 0) {
      toast.error("Preencha descrição e valor");
      return;
    }
    addCashFlowMutation.mutate({
      tipo: showCashModal!,
      descricao: cashDesc,
      valor,
    });
  };

  const chartDayData = byDay.map(d => ({
    dia: formatDate(d.dia),
    faturamento: parseFloat(d.faturamento || "0"),
    pedidos: parseInt(d.pedidos || "0"),
  }));

  const chartSellerData = bySeller.map(s => ({
    name: s.sellerName,
    faturamento: parseFloat(s.faturamento || "0"),
  }));

  const chartPaymentData = byPayment.map(p => ({
    name: p.formaPagamento,
    value: parseFloat(p.total || "0"),
  }));

  const chartCanalData = [
    { name: "Balcao", value: faturamentoBalcao },
    { name: "WhatsApp", value: faturamentoWhatsapp },
  ].filter(d => d.value > 0);

  const chartRegimeData = [
    { name: "Atacado", value: faturamentoAtacado },
    { name: "Varejo", value: faturamentoVarejo },
  ].filter(d => d.value > 0);

  // Guard: redirecionar não-admins (após todos os hooks)
  if (!isAdmin) {
    navigate("/pdv");
    return null;
  }

  return (
    <PdvLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-0.5">Visão geral das vendas</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-white text-sm focus:outline-none"
              />
              <span className="text-gray-600">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-white text-sm focus:outline-none"
              />
            </div>
            <button
              onClick={() => refetch()}
              className="bg-gray-900 border border-gray-800 rounded-xl p-2 text-gray-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Faturamento"
            value={formatCurrency(faturamento)}
            icon={DollarSign}
            color="text-green-400"
            bg="bg-green-950/30 border-green-900/50"
            loading={isLoading}
          />
          <KpiCard
            title="Pedidos"
            value={totalPedidos.toString()}
            icon={ShoppingBag}
            color="text-blue-400"
            bg="bg-blue-950/30 border-blue-900/50"
            loading={isLoading}
          />
          <KpiCard
            title="Ticket Médio"
            value={formatCurrency(ticketMedio)}
            icon={TrendingUp}
            color="text-purple-400"
            bg="bg-purple-950/30 border-purple-900/50"
            loading={isLoading}
          />
          <KpiCard
            title="Vendedores"
            value={bySeller.length.toString()}
            icon={Users}
            color="text-yellow-400"
            bg="bg-yellow-950/30 border-yellow-900/50"
            loading={isLoading}
          />
        </div>

        {/* Faturamento por dia */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Faturamento por Dia</h3>
          {chartDayData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-600 text-sm">
              Nenhum dado no período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartDayData}>
                <defs>
                  <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="dia" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(v: number) => [formatCurrency(v), "Faturamento"]}
                />
                <Area type="monotone" dataKey="faturamento" stroke="#16a34a" fill="url(#colorFat)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Por Vendedor */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-4">Por Vendedor</h3>
            {chartSellerData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-gray-600 text-sm">Sem dados</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartSellerData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                      formatter={(v: number) => [formatCurrency(v), "Faturamento"]}
                    />
                    <Bar dataKey="faturamento" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                {/* Metas por vendedor — em PONTOS */}
                <div className="mt-4 space-y-2">
                  {bySeller.map(s => {
                    const pt = parseFloat(s.pontuacao || "0");
                    const goal = getGoalLevel(pt);
                    const pct = ouro > 0 ? Math.min(100, (pt / ouro) * 100) : 0;
                    return (
                      <div key={s.sellerName}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-300 font-medium">{s.sellerName}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${goal.color}`}>{goal.label}</span>
                            <span className="text-gray-400">{formatPontos(pt)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${goal.bg}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Gráficos de pizza */}
          <div className="space-y-4">
            {/* Formas de Pagamento */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3">Formas de Pagamento</h3>
              {chartPaymentData.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-gray-600 text-sm">Sem dados</div>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={chartPaymentData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value">
                        {chartPaymentData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {chartPaymentData.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-gray-300">{item.name}</span>
                        </div>
                        <span className="text-white font-medium">{formatCurrency(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Canal + Regime */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <h4 className="text-white text-sm font-semibold mb-2">Canal</h4>
                {chartCanalData.length === 0 ? (
                  <div className="text-gray-600 text-xs">Sem dados</div>
                ) : (
                  <div className="space-y-1.5">
                    {chartCanalData.map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-400">{item.name}</span>
                          <span className="text-white">{Math.round((item.value / (faturamentoBalcao + faturamentoWhatsapp)) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(item.value / (faturamentoBalcao + faturamentoWhatsapp)) * 100}%`,
                              backgroundColor: COLORS[i],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <h4 className="text-white text-sm font-semibold mb-2">Regime</h4>
                {chartRegimeData.length === 0 ? (
                  <div className="text-gray-600 text-xs">Sem dados</div>
                ) : (
                  <div className="space-y-1.5">
                    {chartRegimeData.map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-400">{item.name}</span>
                          <span className="text-white">{Math.round((item.value / (faturamentoAtacado + faturamentoVarejo)) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(item.value / (faturamentoAtacado + faturamentoVarejo)) * 100}%`,
                              backgroundColor: i === 0 ? "#3b82f6" : "#f59e0b",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Meta Loja */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-green-500" />
              Meta da Loja
            </h3>
            <span className="text-gray-400 text-sm">{formatPontos(pontuacaoLoja)} / {formatPontos(metaLoja)}</span>
          </div>
          <div className="h-4 bg-gray-800 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-green-700 to-green-500 rounded-full transition-all"
              style={{ width: `${metaLoja > 0 ? Math.min(100, (pontuacaoLoja / metaLoja) * 100) : 0}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { key: "BRONZE", label: "Bronze", value: bronze, color: "text-orange-400", bg: "bg-orange-950/30 border-orange-900/50" },
              { key: "PRATA", label: "Prata", value: prata, color: "text-gray-300", bg: "bg-gray-800/50 border-gray-700" },
              { key: "OURO", label: "Ouro", value: ouro, color: "text-yellow-400", bg: "bg-yellow-950/30 border-yellow-900/50" },
              { key: "META_LOJA", label: "Meta Loja", value: metaLoja, color: "text-green-500", bg: "bg-green-950/30 border-green-900/50" },
            ].map(goal => {
              const reached = pontuacaoLoja >= goal.value;
              return (
                <div key={goal.key} className={`border rounded-xl p-3 ${goal.bg}`}>
                  <div className={`text-xs font-semibold ${goal.color}`}>{goal.label}</div>
                  <div className="text-white text-sm font-bold mt-0.5">{formatPontos(goal.value)}</div>
                  {reached && (
                    <div className="text-green-400 text-xs mt-1 flex items-center gap-1">
                      <ArrowUpRight className="w-3 h-3" />
                      Atingida
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Caixa */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">Fluxo de Caixa</h3>
              <span className="text-gray-400 text-sm">
                Saldo: <span className={`font-bold ${parseFloat(cashData?.saldo || "0") >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {formatCurrency(parseFloat(cashData?.saldo || "0"))}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowCashModal("SUPRIMENTO")}
                className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Suprimento
              </button>
              <button
                onClick={() => setShowCashModal("SANGRIA")}
                className="bg-red-700 hover:bg-red-800 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
                Sangria
              </button>
              <div className="flex-1" />
              <button
                onClick={() => syncCashFlowFromSheetMutation.mutate()}
                disabled={syncCashFlowFromSheetMutation.isPending}
                title="Importar movimentações novas da planilha para o sistema"
                className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncCashFlowFromSheetMutation.isPending ? 'animate-spin' : ''}`} />
                Importar Planilha
              </button>
              <button
                onClick={() => syncCashFlowToSheetMutation.mutate()}
                disabled={syncCashFlowToSheetMutation.isPending}
                title="Exportar todo o histórico de suprimentos/sangrias para a planilha"
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncCashFlowToSheetMutation.isPending ? 'animate-spin' : ''}`} />
                Exportar Planilha
              </button>
              <button
                onClick={() => syncSalesToSheetMutation.mutate()}
                disabled={syncSalesToSheetMutation.isPending}
                title="Exportar todas as vendas para a aba VENDAS_CAIXA da planilha"
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncSalesToSheetMutation.isPending ? 'animate-spin' : ''}`} />
                Exportar Vendas
              </button>
            </div>
          </div>

          {cashData?.entries?.length === 0 ? (
            <p className="text-gray-600 text-sm">Nenhuma movimentação registrada</p>
          ) : (
            <div className="space-y-2">
              {cashData?.entries?.slice(0, 5).map((entry: any) => (
                <div key={entry.id} className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                  entry.tipo === "SANGRIA" ? "bg-red-950/40 border border-red-900/40" : "bg-gray-800"
                }`}>
                  <div>
                    <span className={`text-xs font-semibold ${entry.tipo === "SUPRIMENTO" ? "text-green-400" : "text-red-400"}`}>
                      {entry.tipo}
                    </span>
                    <span className={`text-sm ml-2 ${entry.tipo === "SANGRIA" ? "text-red-200" : "text-gray-300"}`}>{entry.descricao}</span>
                    {entry.usuario && <span className={`text-xs ml-2 ${entry.tipo === "SANGRIA" ? "text-red-400/60" : "text-gray-500"}`}>por {entry.usuario}</span>}
                  </div>
                  <span className={`font-bold text-sm ${entry.tipo === "SUPRIMENTO" ? "text-green-400" : "text-red-400"}`}>
                    {entry.tipo === "SUPRIMENTO" ? "+" : "-"}{formatCurrency(parseFloat(entry.valor))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cash Flow Modal */}
      {showCashModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-4">
              {showCashModal === "SUPRIMENTO" ? "Suprimento de Caixa" : "Sangria de Caixa"}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={cashDesc}
                onChange={(e) => setCashDesc(e.target.value)}
                placeholder="Descrição"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-600"
              />
              <input
                type="text"
                value={cashValor}
                onChange={(e) => setCashValor(e.target.value)}
                placeholder="Valor (R$)"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-600"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleCashFlow}
                disabled={addCashFlowMutation.isPending}
                className={`flex-1 text-white font-semibold py-3 rounded-xl transition-colors ${
                  showCashModal === "SUPRIMENTO" ? "bg-green-600 hover:bg-green-700" : "bg-green-700 hover:bg-green-800"
                }`}
              >
                Confirmar
              </button>
              <button
                onClick={() => setShowCashModal(null)}
                className="px-6 text-gray-400 hover:text-white py-3 rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </PdvLayout>
  );
}

function KpiCard({ title, value, icon: Icon, color, bg, loading }: {
  title: string;
  value: string;
  icon: any;
  color: string;
  bg: string;
  loading?: boolean;
}) {
  return (
    <div className={`border rounded-2xl p-4 ${bg}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm">{title}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-gray-900/50`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      {loading ? (
        <div className="h-7 bg-gray-800 rounded animate-pulse" />
      ) : (
        <div className={`text-xl font-bold ${color}`}>{value}</div>
      )}
    </div>
  );
}
