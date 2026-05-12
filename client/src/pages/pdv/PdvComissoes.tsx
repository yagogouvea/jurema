import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Award, TrendingUp, DollarSign, ShoppingBag, Calendar, Download, Package, Info, User } from "lucide-react";
import { localDateYmd } from "@/lib/localDateYmd";

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

const SELLER_COLORS = ["#16a34a", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// ============================================================
// VISÃO ADMIN: relatório completo de todos os vendedores
// Filtros: período + vendedor (com opção "Todos")
// ============================================================
function AdminComissoes() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return localDateYmd(d);
  });
  const [endDate, setEndDate] = useState(() => localDateYmd());
  // "all" = todos os vendedores; qualquer outro valor = sellerId filtrado
  const [selectedSeller, setSelectedSeller] = useState<string>("all");

  const { data, isLoading } = trpc.pdvComissoes.relatorio.useQuery(
    { startDate, endDate },
  );

  const allSellers = data?.sellers || [];
  const goals = data?.goals || {};
  const taxaAtual = data?.summary?.taxaAtual ?? 0.5;

  // Filtragem client-side por vendedor selecionado
  const sellers = useMemo(() => {
    if (selectedSeller === "all") return allSellers;
    return allSellers.filter(s => String(s.sellerId) === selectedSeller);
  }, [allSellers, selectedSeller]);

  // KPIs calculados sobre os vendedores filtrados
  const summary = useMemo(() => ({
    totalPecas: sellers.reduce((a, s) => a + s.totalPecas, 0),
    totalFaturamento: sellers.reduce((a, s) => a + s.faturamento, 0),
    totalComissoes: sellers.reduce((a, s) => a + s.comissao, 0),
    totalPedidos: sellers.reduce((a, s) => a + parseInt(String(s.totalPedidos)), 0),
    taxaAtual,
  }), [sellers, taxaAtual]);

  function exportCSV() {
    if (!sellers.length) return;
    const header = "Vendedor,Pedidos,Peças,Faturamento,Atacado,Varejo,Ticket Médio,Bônus,Meta\n";
    const rows = sellers.map(s =>
      `${s.sellerName},${s.totalPedidos},${s.totalPecas},${s.faturamento.toFixed(2)},${s.faturamentoAtacado.toFixed(2)},${s.faturamentoVarejo.toFixed(2)},${s.ticketMedio.toFixed(2)},${s.comissao.toFixed(2)},${s.metaAtingida || "Sem meta"}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bonus_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white text-2xl font-bold">Relatório de Bônus</h1>
          <p className="text-gray-400 text-sm mt-0.5">Bônus por peça vendida (exclui vendas Sofia)</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={!sellers.length}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Info: taxa atual */}
      <div className="flex items-center gap-2 bg-green-950/30 border border-green-900/40 rounded-xl px-4 py-2.5 text-sm">
        <Info className="w-4 h-4 text-green-400 flex-shrink-0" />
        <span className="text-green-300">
          Taxa de bônus atual: <strong>{formatCurrency(taxaAtual)}/peça</strong>
          {" "}— cada venda registra o valor vigente no momento da venda.
          Para alterar, acesse <strong>Configurações &gt; Bônus</strong>.
        </span>
      </div>

      {/* Filtros: período + vendedor */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-wrap items-center gap-4">
        {/* Período */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
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

        {/* Divider */}
        <div className="hidden lg:block w-px h-6 bg-gray-700" />

        {/* Filtro por vendedor */}
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="text-gray-400 text-sm">Vendedor:</span>
          <div className="flex flex-wrap gap-2">
            {/* Botão "Todos" */}
            <button
              onClick={() => setSelectedSeller("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                selectedSeller === "all"
                  ? "bg-green-700 border-green-600 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
              }`}
            >
              Todos
            </button>
            {/* Botão por vendedor */}
            {allSellers.map((s, i) => (
              <button
                key={s.sellerId}
                onClick={() => setSelectedSeller(String(s.sellerId))}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  selectedSeller === String(s.sellerId)
                    ? "border-transparent text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
                }`}
                style={
                  selectedSeller === String(s.sellerId)
                    ? { backgroundColor: SELLER_COLORS[i % SELLER_COLORS.length], borderColor: SELLER_COLORS[i % SELLER_COLORS.length] }
                    : {}
                }
              >
                {s.sellerName}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary KPIs — refletem o filtro de vendedor */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: "Total de Peças", value: String(summary.totalPecas), icon: Package, color: "text-green-400" },
              { label: "Faturamento", value: formatCurrency(summary.totalFaturamento), icon: DollarSign, color: "text-blue-400" },
              { label: "Total Pedidos", value: String(summary.totalPedidos), icon: ShoppingBag, color: "text-gray-300" },
              { label: "Total Bônus", value: formatCurrency(summary.totalComissoes), icon: TrendingUp, color: "text-yellow-400" },
              { label: "Vendedores Ativos", value: String(sellers.filter(s => s.totalPecas > 0).length), icon: Award, color: "text-green-500" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  <span className="text-gray-400 text-xs">{kpi.label}</span>
                </div>
                <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Chart — Peças por Vendedor (usa lista filtrada) */}
          {sellers.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Peças Vendidas por Vendedor</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sellers} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="sellerName" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "12px" }}
                    labelStyle={{ color: "#fff" }}
                    formatter={(value: any, name: string) => [value, name === "totalPecas" ? "Peças" : name]}
                  />
                  <Bar dataKey="totalPecas" name="Peças" radius={[6, 6, 0, 0]}>
                    {sellers.map((s, i) => {
                      // Cor consistente com o índice no array COMPLETO (allSellers)
                      const globalIdx = allSellers.findIndex(a => a.sellerId === s.sellerId);
                      return <Cell key={i} fill={SELLER_COLORS[(globalIdx >= 0 ? globalIdx : i) % SELLER_COLORS.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sellers Table — com barra de rolagem vertical */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-white font-semibold">Detalhamento por Vendedor</h3>
              {selectedSeller !== "all" && (
                <span className="text-xs text-green-400 bg-green-950/40 border border-green-900/50 px-2.5 py-1 rounded-full">
                  Filtrado: {allSellers.find(s => String(s.sellerId) === selectedSeller)?.sellerName}
                </span>
              )}
            </div>
            {sellers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <ShoppingBag className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Nenhuma venda no período selecionado</p>
              </div>
            ) : (
              /* overflow-x-auto para scroll horizontal + max-h para scroll vertical */
              <div className="overflow-x-auto overflow-y-auto max-h-96">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-gray-900">
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Vendedor</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Peças</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Pedidos</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Faturamento</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Atacado</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Varejo</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Bônus</th>
                      <th className="text-center text-gray-400 text-xs font-semibold px-4 py-3">Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((s) => {
                      const globalIdx = allSellers.findIndex(a => a.sellerId === s.sellerId);
                      const color = SELLER_COLORS[(globalIdx >= 0 ? globalIdx : 0) % SELLER_COLORS.length];
                      return (
                        <tr key={s.sellerId} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-white font-medium text-sm">{s.sellerName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-green-400 font-bold text-sm">{s.totalPecas}</td>
                          <td className="px-4 py-3 text-right text-gray-300 text-sm">{s.totalPedidos}</td>
                          <td className="px-4 py-3 text-right text-white font-semibold text-sm">{formatCurrency(s.faturamento)}</td>
                          <td className="px-4 py-3 text-right text-blue-400 text-sm">{formatCurrency(s.faturamentoAtacado)}</td>
                          <td className="px-4 py-3 text-right text-orange-400 text-sm">{formatCurrency(s.faturamentoVarejo)}</td>
                          <td className="px-4 py-3 text-right text-yellow-400 font-semibold text-sm">{formatCurrency(s.comissao)}</td>
                          <td className="px-4 py-3 text-center">
                            {s.metaAtingida ? (
                              <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${META_BG[s.metaAtingida]} ${META_COLORS[s.metaAtingida]}`}>
                                {s.metaAtingida}
                              </span>
                            ) : (
                              <span className="text-gray-600 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-gray-900">
                    <tr className="border-t border-gray-700 bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-400 text-sm font-semibold">TOTAL</td>
                      <td className="px-4 py-3 text-right text-green-400 font-bold text-sm">{summary.totalPecas}</td>
                      <td className="px-4 py-3 text-right text-gray-300 text-sm font-semibold">{summary.totalPedidos}</td>
                      <td className="px-4 py-3 text-right text-white font-bold text-sm">{formatCurrency(summary.totalFaturamento)}</td>
                      <td className="px-4 py-3 text-right text-blue-400 font-semibold text-sm">{formatCurrency(sellers.reduce((a, s) => a + s.faturamentoAtacado, 0))}</td>
                      <td className="px-4 py-3 text-right text-orange-400 font-semibold text-sm">{formatCurrency(sellers.reduce((a, s) => a + s.faturamentoVarejo, 0))}</td>
                      <td className="px-4 py-3 text-right text-yellow-400 font-bold text-sm">{formatCurrency(summary.totalComissoes)}</td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Goals Reference */}
          {Object.keys(goals).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3">Referência de Metas</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: "BRONZE", label: "Bronze", color: "text-orange-400", bg: "bg-orange-950/30 border-orange-900/50" },
                  { key: "PRATA", label: "Prata", color: "text-gray-300", bg: "bg-gray-800/60 border-gray-700/50" },
                  { key: "OURO", label: "Ouro", color: "text-yellow-400", bg: "bg-yellow-950/30 border-yellow-900/50" },
                  { key: "META_LOJA", label: "Meta Loja", color: "text-green-500", bg: "bg-green-950/30 border-green-900/50" },
                ].map(m => (
                  <div key={m.key} className={`border rounded-xl p-3 ${m.bg}`}>
                    <div className={`text-xs font-semibold ${m.color}`}>{m.label}</div>
                    <div className="text-white font-bold text-sm mt-1">{formatCurrency(goals[m.key] || 0)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// VISÃO VENDEDOR: só vê seus próprios bônus
// Sem campo de taxa — o bônus é calculado pelo valor registrado no momento da venda
// ============================================================
function SellerComissoes() {
  const { seller } = usePdvAuth();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return localDateYmd(d);
  });
  const [endDate, setEndDate] = useState(() => localDateYmd());

  const { data, isLoading } = trpc.pdvComissoes.minhasComissoes.useQuery(
    { startDate, endDate },
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Meus Bônus</h1>
        <p className="text-gray-400 text-sm mt-0.5">Olá, {seller?.name}! Veja suas vendas e bônus por peça.</p>
      </div>

      {/* Filters — apenas período, sem campo de taxa */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600" />
          <span className="text-gray-600">até</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Peças Vendidas", value: String(data.totalPecas), icon: Package, color: "text-green-400" },
              { label: "Faturamento", value: formatCurrency(data.faturamento), icon: DollarSign, color: "text-blue-400" },
              { label: "Pedidos", value: String(data.totalPedidos), icon: ShoppingBag, color: "text-gray-300" },
              { label: "Bônus", value: formatCurrency(data.comissao), icon: TrendingUp, color: "text-yellow-400" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  <span className="text-gray-400 text-xs">{kpi.label}</span>
                </div>
                <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Meta */}
          {data.metaAtingida && (
            <div className={`border rounded-2xl p-4 ${META_BG[data.metaAtingida]}`}>
              <div className="flex items-center gap-2">
                <Award className={`w-5 h-5 ${META_COLORS[data.metaAtingida]}`} />
                <span className={`font-bold ${META_COLORS[data.metaAtingida]}`}>
                  Meta {data.metaAtingida} atingida!
                </span>
              </div>
            </div>
          )}

          {/* Daily breakdown */}
          {data.daily.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">Vendas por Dia</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="dia" tick={{ fill: "#9ca3af", fontSize: 11 }}
                    tickFormatter={(v) => new Date(v + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "12px" }}
                    labelStyle={{ color: "#fff" }}
                    labelFormatter={(v) => new Date(v + "T00:00:00").toLocaleDateString("pt-BR")}
                    formatter={(value: any, name: string) => [value, name === "pecas" ? "Peças" : name === "comissao" ? "Bônus" : "Faturamento"]}
                  />
                  <Bar dataKey="pecas" name="Peças" fill="#16a34a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Daily table */}
          {data.daily.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h3 className="text-white font-semibold">Detalhamento Diário</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Data</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Pedidos</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Peças</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Faturamento</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Bônus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((d: any) => (
                      <tr key={d.dia} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-white text-sm">
                          {new Date(d.dia + "T00:00:00").toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300 text-sm">{d.pedidos}</td>
                        <td className="px-4 py-3 text-right text-green-400 font-bold text-sm">{d.pecas}</td>
                        <td className="px-4 py-3 text-right text-white text-sm">{formatCurrency(d.faturamento)}</td>
                        <td className="px-4 py-3 text-right text-yellow-400 font-semibold text-sm">{formatCurrency(d.comissao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// ENTRY POINT: redireciona para visão correta baseada no role
// ============================================================
export default function PdvComissoes() {
  const { seller, isLoading } = usePdvAuth();
  return (
    <PdvLayout>
      {isLoading ? null : seller?.role === "admin" ? <AdminComissoes /> : <SellerComissoes />}
    </PdvLayout>
  );
}
