import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Package, DollarSign, Calendar, ArrowDownRight, ArrowUpRight, Settings2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

const SELLER_COLORS = ["#16a34a", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function PdvSofia() {
  const { isAdmin } = usePdvAuth();

  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showConfig, setShowConfig] = useState(false);

  const { data, isLoading } = trpc.pdvSofia.dashboard.useQuery(
    { startDate, endDate },
    { enabled: isAdmin }
  );

  const { data: configData } = trpc.pdvSofia.getConfig.useQuery(undefined, { enabled: isAdmin });
  const [comissaoInput, setComissaoInput] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const updateConfigMutation = trpc.pdvSofia.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("Comissão atualizada!");
      utils.pdvSofia.dashboard.invalidate();
      utils.pdvSofia.getConfig.invalidate();
      setShowConfig(false);
    },
    onError: () => toast.error("Erro ao atualizar"),
  });

  if (!isAdmin) {
    return (
      <PdvLayout>
        <div className="flex items-center justify-center h-64 text-gray-500">
          Acesso restrito ao administrador.
        </div>
      </PdvLayout>
    );
  }

  const summary = data?.summary;
  const porVendedor = data?.porVendedor || [];
  const porDia = data?.porDia || [];

  return (
    <PdvLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-white text-2xl font-bold">Vendas Sofia</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Produtos terceirizados — comissão da loja: {formatCurrency(summary?.comissaoLoja || configData?.comissaoLoja || 10)}/peça
            </p>
          </div>
          <button
            onClick={() => { setComissaoInput(configData?.comissaoLoja || 10); setShowConfig(!showConfig); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl text-gray-400 hover:text-white text-sm transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            Configurar
          </button>
        </div>

        {/* Config panel */}
        {showConfig && (
          <div className="bg-gray-900 border border-purple-900/50 rounded-2xl p-4">
            <h3 className="text-white font-semibold mb-3">Comissão da Loja por Peça Sofia</h3>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">R$</span>
              <input
                type="number" min={0} step={0.5}
                value={comissaoInput ?? 10}
                onChange={(e) => setComissaoInput(parseFloat(e.target.value) || 0)}
                className="w-24 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-600"
              />
              <span className="text-gray-400 text-sm">por peça</span>
              <button
                onClick={() => updateConfigMutation.mutate({ comissaoLoja: comissaoInput ?? 10 })}
                disabled={updateConfigMutation.isPending}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-600 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        )}

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
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: "Total Peças", value: String(summary?.totalPecas || 0), icon: Package, color: "text-purple-400" },
                { label: "Faturamento", value: formatCurrency(summary?.faturamento || 0), icon: DollarSign, color: "text-blue-400" },
                { label: "Pedidos", value: String(summary?.totalPedidos || 0), icon: ShoppingBag, color: "text-gray-300" },
                { label: "Comissão Loja", value: formatCurrency(summary?.comissaoTotal || 0), icon: ArrowUpRight, color: "text-green-400" },
                { label: "Reembolso", value: formatCurrency(summary?.reembolsoTotal || 0), icon: ArrowDownRight, color: "text-green-400" },
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

            {/* Por vendedor */}
            {porVendedor.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Reembolso por Vendedor</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Vendedor</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Peças</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Faturamento</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Comissão Loja</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Reembolso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porVendedor.map((v: any, i: number) => (
                        <tr key={v.sellerId} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SELLER_COLORS[i % SELLER_COLORS.length] }} />
                              <span className="text-white font-medium text-sm">{v.sellerName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-purple-400 font-bold text-sm">{v.pecas}</td>
                          <td className="px-4 py-3 text-right text-white text-sm">{formatCurrency(v.faturamento)}</td>
                          <td className="px-4 py-3 text-right text-green-400 text-sm">{formatCurrency(v.comissao)}</td>
                          <td className="px-4 py-3 text-right text-green-400 font-semibold text-sm">{formatCurrency(v.reembolso)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-700 bg-gray-800/30">
                        <td className="px-4 py-3 text-gray-400 text-sm font-semibold">TOTAL</td>
                        <td className="px-4 py-3 text-right text-purple-400 font-bold text-sm">{summary?.totalPecas}</td>
                        <td className="px-4 py-3 text-right text-white font-bold text-sm">{formatCurrency(summary?.faturamento || 0)}</td>
                        <td className="px-4 py-3 text-right text-green-400 font-bold text-sm">{formatCurrency(summary?.comissaoTotal || 0)}</td>
                        <td className="px-4 py-3 text-right text-green-400 font-bold text-sm">{formatCurrency(summary?.reembolsoTotal || 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Por dia */}
            {porDia.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h3 className="text-white font-semibold mb-4">Vendas Sofia por Dia</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={porDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="dia" tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickFormatter={(v) => new Date(v + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "12px" }}
                      labelStyle={{ color: "#fff" }}
                      labelFormatter={(v) => new Date(v + "T00:00:00").toLocaleDateString("pt-BR")}
                      formatter={(value: any, name: string) => [name === "pecas" ? value : formatCurrency(value as number), name === "pecas" ? "Peças" : "Faturamento"]}
                    />
                    <Bar dataKey="pecas" name="Peças" fill="#a855f7" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {porVendedor.length === 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                <Package className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Nenhuma venda Sofia no período selecionado</p>
                <p className="text-gray-600 text-xs mt-1">Marque "Venda Sofia" ao registrar um pedido no PDV</p>
              </div>
            )}
          </>
        )}
      </div>
    </PdvLayout>
  );
}
