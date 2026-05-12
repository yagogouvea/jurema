import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Package, DollarSign, Calendar, ArrowDownRight, ArrowUpRight,
  Settings2, ShoppingBag, ChevronDown, ChevronUp, X, Eye, AlertTriangle,
  Camera, Trash2, ExternalLink, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { firstOfMonthYmdSaoPaulo, todayYmdSaoPaulo } from "@shared/spCalendar";

const SELLER_COLORS = ["#16a34a", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

function formatCurrency(value: number | string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(String(value)) || 0);
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  PAGO: "bg-green-950/50 text-green-400 border-green-900/50",
  PENDENTE: "bg-yellow-950/50 text-yellow-400 border-yellow-900/50",
  CANCELADO: "bg-red-950/50 text-red-400 border-red-900/50",
};

export default function PdvSofia() {
  const { isAdmin } = usePdvAuth();
  const [activeTab, setActiveTab] = useState<"dashboard" | "pedidos">("dashboard");
  const [startDate, setStartDate] = useState(() => firstOfMonthYmdSaoPaulo());
  const [endDate, setEndDate] = useState(() => todayYmdSaoPaulo());
  const [showConfig, setShowConfig] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const { data, isLoading } = trpc.pdvSofia.dashboard.useQuery(
    { startDate, endDate },
    { enabled: isAdmin }
  );
  const { data: configData } = trpc.pdvSofia.getConfig.useQuery(undefined, { enabled: isAdmin });
  const { data: pedidosData, isLoading: pedidosLoading, refetch: refetchPedidos } = trpc.pdvSofia.pedidos.useQuery(
    { startDate, endDate, page, limit: 20 },
    { enabled: isAdmin && activeTab === "pedidos" }
  );
  const { data: orderDetail, isLoading: orderDetailLoading } = trpc.pdvOrders.getById.useQuery(
    { pedidoId: expandedOrder || "" },
    { enabled: !!expandedOrder }
  );

  const [comissaoInput, setComissaoInput] = useState<number | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState<string | null>(null); // pedidoId em upload
  const [viewFoto, setViewFoto] = useState<string | null>(null); // URL da foto em visualização
  const utils = trpc.useUtils();

  const uploadFotoMutation = trpc.pdvSofia.uploadFoto.useMutation({
    onSuccess: () => {
      toast.success("Foto anexada com sucesso!");
      setUploadingFoto(null);
      utils.pdvOrders.getById.invalidate({ pedidoId: expandedOrder || "" });
    },
    onError: () => { toast.error("Erro ao fazer upload da foto"); setUploadingFoto(null); },
  });

  const removeFotoMutation = trpc.pdvSofia.removeFoto.useMutation({
    onSuccess: () => {
      toast.success("Foto removida");
      utils.pdvOrders.getById.invalidate({ pedidoId: expandedOrder || "" });
    },
    onError: () => toast.error("Erro ao remover foto"),
  });

  function handleFotoUpload(pedidoId: string, file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("Foto deve ter no máximo 5MB"); return; }
    setUploadingFoto(pedidoId);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      uploadFotoMutation.mutate({ pedidoId, base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  const updateConfigMutation = trpc.pdvSofia.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("Bônus atualizado!");
      utils.pdvSofia.dashboard.invalidate();
      utils.pdvSofia.getConfig.invalidate();
      setShowConfig(false);
    },
    onError: () => toast.error("Erro ao atualizar"),
  });

  const cancelMutation = trpc.pdvOrders.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Pedido cancelado — estoque devolvido");
      refetchPedidos();
      setSelectedOrder(null);
      setConfirmCancel(null);
      utils.pdvSofia.dashboard.invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao cancelar pedido"),
  });

  const toggleStatusMutation = trpc.pdvSofia.updateStatus.useMutation({
    onSuccess: (data, variables) => {
      const label = variables.status === "PAGO" ? "Marcado como Pago" : "Marcado como Pendente";
      toast.success(label + " — planilha atualizada");
      refetchPedidos();
      utils.pdvOrders.getById.invalidate({ pedidoId: variables.pedidoId });
      utils.pdvSofia.dashboard.invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao atualizar status"),
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
  const pedidos = pedidosData?.orders || [];
  const totalPedidos = pedidosData?.total || 0;
  const totalPagesPedidos = pedidosData?.totalPages || 1;

  return (
    <>
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
            <h3 className="text-white font-semibold mb-3">Bônus da Loja por Peça Sofia</h3>
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

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-2xl p-1 w-fit">
          {(["dashboard", "pedidos"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-purple-700 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "dashboard" ? "Dashboard" : "Pedidos"}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-600" />
            <span className="text-gray-600">até</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-600" />
          </div>
        </div>

        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && (
          isLoading ? (
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
                  { label: "Bônus Loja", value: formatCurrency(summary?.comissaoTotal || 0), icon: ArrowUpRight, color: "text-green-400" },
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
                          <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Bônus Loja</th>
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
          )
        )}

        {/* ── PEDIDOS TAB ── */}
        {activeTab === "pedidos" && (
          pedidosLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-sm">{totalPedidos} pedido(s) com itens Sofia no período</p>
              </div>

              {pedidos.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                  <ShoppingBag className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">Nenhum pedido Sofia no período selecionado</p>
                </div>
              ) : (
                <>
                  {pedidos.map((order: any) => (
                    <div key={order.pedidoId} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                      {/* Order header */}
                      <div
                        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/30 transition-colors"
                        onClick={() => setExpandedOrder(expandedOrder === order.pedidoId ? null : order.pedidoId)}
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-white font-mono font-semibold text-sm">{order.pedidoId}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[order.status] || "text-gray-400"}`}>
                            {order.status}
                          </span>
                          {order.isSofia === 1 && (
                            <span className="text-xs px-2 py-0.5 rounded-full border bg-purple-950/50 text-purple-400 border-purple-900/50 font-medium">
                              100% Sofia
                            </span>
                          )}
                          {order.isSofia === 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-950/50 text-blue-400 border-blue-900/50 font-medium">
                              Misto
                            </span>
                          )}
                          <span className="text-gray-400 text-sm">{order.clienteNome || "—"}</span>
                          <span className="text-gray-500 text-xs">{formatDateTime(order.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-white font-semibold text-sm">{formatCurrency(order.totalAplicado)}</span>
                          {expandedOrder === order.pedidoId
                            ? <ChevronUp className="w-4 h-4 text-gray-500" />
                            : <ChevronDown className="w-4 h-4 text-gray-500" />
                          }
                        </div>
                      </div>

                      {/* Order detail */}
                      {expandedOrder === order.pedidoId && (
                        <div className="border-t border-gray-800 px-5 py-4 space-y-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><span className="text-gray-500">Vendedor:</span> <span className="text-white ml-1">{order.sellerName}</span></div>
                            <div><span className="text-gray-500">Canal:</span> <span className="text-white ml-1">{order.canal}</span></div>
                            <div><span className="text-gray-500">Regime:</span> <span className="text-white ml-1">{order.regime}</span></div>
                            <div><span className="text-gray-500">Telefone:</span> <span className="text-white ml-1">{order.clienteTelefone || "—"}</span></div>
                          </div>

                          {/* Items */}
                          <div>
                            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Itens Sofia</p>
                            <div className="space-y-1">
                              {(orderDetail?.items || [])
                                .filter((item: any) => item.isSofia)
                                .map((item: any, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between bg-gray-800/50 rounded-xl px-3 py-2 text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="text-purple-400 font-medium">{item.time}</span>
                                      <span className="text-white">{item.modelo} {item.descricao}</span>
                                      <span className="text-gray-500">Tam: {item.tamanho}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-right">
                                      <span className="text-gray-400">×{item.quantidade}</span>
                                      <span className="text-white font-medium">{formatCurrency(item.totalItem)}</span>
                                    </div>
                                  </div>
                                ))}
                              {orderDetailLoading && (
                                <div className="flex items-center gap-2 text-gray-500 text-xs italic px-2 py-2">
                                  <div className="w-3 h-3 border border-purple-600 border-t-transparent rounded-full animate-spin" />
                                  Carregando itens...
                                </div>
                              )}
                              {!orderDetailLoading && orderDetail && orderDetail.items.filter((i: any) => i.isSofia).length === 0 && (
                                <div className="text-gray-500 text-xs italic px-2">Nenhum item Sofia neste pedido</div>
                              )}
                            </div>
                          </div>

                          {/* Foto */}
                          <div>
                            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Foto do Pedido</p>
                            {orderDetail?.fotoUrl ? (
                              <div className="flex items-center gap-3">
                                <img
                                  src={orderDetail.fotoUrl}
                                  alt="Foto do pedido"
                                  className="w-20 h-20 object-cover rounded-xl border border-gray-700 cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => setViewFoto(orderDetail.fotoUrl)}
                                />
                                <div className="flex flex-col gap-2">
                                  <button
                                    onClick={() => setViewFoto(orderDetail.fotoUrl)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-xs transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Ver foto
                                  </button>
                                  <label className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-xs transition-colors cursor-pointer">
                                    <Camera className="w-3 h-3" />
                                    Trocar
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFotoUpload(order.pedidoId, e.target.files[0])} />
                                  </label>
                                  <button
                                    onClick={() => removeFotoMutation.mutate({ pedidoId: order.pedidoId })}
                                    disabled={removeFotoMutation.isPending}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/30 hover:bg-red-950/50 border border-red-900/30 rounded-lg text-red-400 text-xs transition-colors disabled:opacity-50"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Remover
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 border border-dashed border-gray-700 hover:border-purple-600 rounded-xl text-gray-400 hover:text-purple-400 text-sm transition-colors cursor-pointer w-fit">
                                {uploadingFoto === order.pedidoId ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                                ) : (
                                  <><Camera className="w-4 h-4" /> Anexar foto</>  
                                )}
                                <input type="file" accept="image/*" className="hidden" disabled={uploadingFoto === order.pedidoId} onChange={(e) => e.target.files?.[0] && handleFotoUpload(order.pedidoId, e.target.files[0])} />
                              </label>
                            )}
                          </div>

                          {/* Actions */}
                          {order.status !== "CANCELADO" && (
                            <div className="flex flex-wrap justify-end gap-2 pt-2">
                              {/* Botões de status: Pago ↔ Pendente */}
                              {order.status === "PENDENTE" ? (
                                <button
                                  onClick={() => toggleStatusMutation.mutate({ pedidoId: order.pedidoId, status: "PAGO" })}
                                  disabled={toggleStatusMutation.isPending}
                                  className="flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border border-emerald-900/50 hover:border-emerald-600 rounded-xl text-emerald-400 hover:text-emerald-300 text-sm transition-colors disabled:opacity-50"
                                >
                                  {toggleStatusMutation.isPending ? "Atualizando..." : "✓ Marcar como Pago"}
                                </button>
                              ) : (
                                <button
                                  onClick={() => toggleStatusMutation.mutate({ pedidoId: order.pedidoId, status: "PENDENTE" })}
                                  disabled={toggleStatusMutation.isPending}
                                  className="flex items-center gap-2 px-4 py-2 bg-yellow-950/30 border border-yellow-900/50 hover:border-yellow-600 rounded-xl text-yellow-400 hover:text-yellow-300 text-sm transition-colors disabled:opacity-50"
                                >
                                  {toggleStatusMutation.isPending ? "Atualizando..." : "↩ Marcar como Pendente"}
                                </button>
                              )}

                              {/* Botão cancelar */}
                              {confirmCancel === order.pedidoId ? (
                                <div className="flex items-center gap-3 bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-2">
                                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                  <span className="text-red-300 text-sm">Confirmar cancelamento? Estoque será devolvido.</span>
                                  <button
                                    onClick={() => cancelMutation.mutate({ pedidoId: order.pedidoId, status: "CANCELADO" })}
                                    disabled={cancelMutation.isPending}
                                    className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-50"
                                  >
                                    {cancelMutation.isPending ? "..." : "Confirmar"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmCancel(null)}
                                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-xs font-medium transition-colors"
                                  >
                                    Voltar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setSelectedOrder(order); setConfirmCancel(order.pedidoId); }}
                                  className="flex items-center gap-2 px-4 py-2 bg-red-950/30 border border-red-900/50 hover:border-red-700 rounded-xl text-red-400 hover:text-red-300 text-sm transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                  Cancelar Pedido
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Pagination */}
                  {totalPagesPedidos > 1 && (
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-gray-400 text-sm disabled:opacity-40 hover:border-gray-700 transition-colors"
                      >
                        Anterior
                      </button>
                      <span className="text-gray-500 text-sm">{page} / {totalPagesPedidos}</span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPagesPedidos, p + 1))}
                        disabled={page === totalPagesPedidos}
                        className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-gray-400 text-sm disabled:opacity-40 hover:border-gray-700 transition-colors"
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        )}
      </div>
    </PdvLayout>
      {/* Modal visualização de foto em tela cheia */}
      {viewFoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewFoto(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewFoto(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={viewFoto ?? undefined}
              alt="Foto do pedido"
              className="w-full max-h-[80vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
