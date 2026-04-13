import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Award, TrendingUp, DollarSign, ShoppingBag, Calendar, Download, Package } from "lucide-react";

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
// ============================================================
function AdminComissoes() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [taxaComissao, setTaxaComissao] = useState(5);

  const { data, isLoading } = trpc.pdvComissoes.relatorio.useQuery(
    { startDate, endDate, taxaComissao },
  );

  const sellers = data?.sellers || [];
  const summary = data?.summary;
  const goals = data?.goals || {};

  function exportCSV() {
    if (!sellers.length) return;
    const header = "Vendedor,Pedidos,Peças,Faturamento,Atacado,Varejo,Ticket Médio,Comissão (R$/peça),Meta\n";
    const rows = sellers.map(s =>
      `${s.sellerName},${s.totalPedidos},${s.totalPecas},${s.faturamento.toFixed(2)},${s.faturamentoAtacado.toFixed(2)},${s.faturamentoVarejo.toFixed(2)},${s.ticketMedio.toFixed(2)},${s.comissao.toFixed(2)},${s.metaAtingida || "Sem meta"}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comissoes_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white text-2xl font-bold">Relatório de Comissões</h1>
          <p className="text-gray-400 text-sm mt-0.5">Comissão por peça vendida (exclui vendas Sofia)</p>
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

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600" />
          <span className="text-gray-600">até</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600" />
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-gray-500" />
          <label className="text-gray-400 text-sm">Valor por peça:</label>
          <span className="text-gray-400 text-sm">R$</span>
          <input
            type="number" min={0} step={0.5} value={taxaComissao}
            onChange={(e) => setTaxaComissao(parseFloat(e.target.value) || 0)}
            className="w-20 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600"
          />
          <span className="text-gray-400 text-sm">/peça</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: "Total de Peças", value: String(summary?.totalPecas || 0), icon: Package, color: "text-green-400" },
              { label: "Faturamento", value: formatCurrency(summary?.totalFaturamento || 0), icon: DollarSign, color: "text-blue-400" },
              { label: "Total Pedidos", value: String(summary?.totalPedidos || 0), icon: ShoppingBag, color: "text-gray-300" },
              { label: "Total Comissões", value: formatCurrency(summary?.totalComissoes || 0), icon: TrendingUp, color: "text-yellow-400" },
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

          {/* Chart — Peças por Vendedor */}
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
                    {sellers.map((_, i) => (
                      <Cell key={i} fill={SELLER_COLORS[i % SELLER_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sellers Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h3 className="text-white font-semibold">Detalhamento por Vendedor</h3>
            </div>
            {sellers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <ShoppingBag className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Nenhuma venda no período selecionado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Vendedor</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Peças</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Pedidos</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Faturamento</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Atacado</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Varejo</th>
                      <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Comissão (R${taxaComissao}/pç)</th>
                      <th className="text-center text-gray-400 text-xs font-semibold px-4 py-3">Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((s, i) => (
                      <tr key={s.sellerId} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SELLER_COLORS[i % SELLER_COLORS.length] }} />
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
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-700 bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-400 text-sm font-semibold">TOTAL</td>
                      <td className="px-4 py-3 text-right text-green-400 font-bold text-sm">{summary?.totalPecas}</td>
                      <td className="px-4 py-3 text-right text-gray-300 text-sm font-semibold">{summary?.totalPedidos}</td>
                      <td className="px-4 py-3 text-right text-white font-bold text-sm">{formatCurrency(summary?.totalFaturamento || 0)}</td>
                      <td className="px-4 py-3 text-right text-blue-400 font-semibold text-sm">{formatCurrency(sellers.reduce((a, s) => a + s.faturamentoAtacado, 0))}</td>
                      <td className="px-4 py-3 text-right text-orange-400 font-semibold text-sm">{formatCurrency(sellers.reduce((a, s) => a + s.faturamentoVarejo, 0))}</td>
                      <td className="px-4 py-3 text-right text-yellow-400 font-bold text-sm">{formatCurrency(summary?.totalComissoes || 0)}</td>
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
// VISÃO VENDEDOR: só vê suas próprias comissões
// ============================================================
function SellerComissoes() {
  const { seller } = usePdvAuth();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [taxaComissao, setTaxaComissao] = useState(5);

  const { data, isLoading } = trpc.pdvComissoes.minhasComissoes.useQuery(
    { startDate, endDate, taxaComissao },
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Minhas Comissões</h1>
        <p className="text-gray-400 text-sm mt-0.5">Olá, {seller?.name}! Veja suas vendas e comissões por peça.</p>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600" />
          <span className="text-gray-600">até</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600" />
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-gray-500" />
          <label className="text-gray-400 text-sm">R$</label>
          <input type="number" min={0} step={0.5} value={taxaComissao}
            onChange={(e) => setTaxaComissao(parseFloat(e.target.value) || 0)}
            className="w-20 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600" />
          <span className="text-gray-400 text-sm">/peça</span>
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
              { label: "Comissão", value: formatCurrency(data.comissao), icon: TrendingUp, color: "text-yellow-400" },
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
                    formatter={(value: any, name: string) => [value, name === "pecas" ? "Peças" : "Faturamento"]}
                  />
                  <Bar dataKey="pecas" name="Peças" fill="#16a34a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL: decide qual visão mostrar
// ============================================================
export default function PdvComissoes() {
  const { isAdmin } = usePdvAuth();

  return (
    <PdvLayout>
      {isAdmin ? <AdminComissoes /> : <SellerComissoes />}
    </PdvLayout>
  );
}
