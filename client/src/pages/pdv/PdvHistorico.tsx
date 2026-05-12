import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import { toast } from "sonner";
import { firstOfMonthYmdSaoPaulo, todayYmdSaoPaulo } from "@shared/spCalendar";
import {
  Search, ChevronDown, ChevronUp, X, Eye, Calendar,
  ShoppingBag, DollarSign, User, Package, CreditCard, Wrench
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  PAGO: "bg-green-950/50 text-green-400 border-green-900/50",
  PENDENTE: "bg-yellow-950/50 text-yellow-400 border-yellow-900/50",
  // Cancelado fica em destaque (sobre a linha vermelha): fundo escuro + texto branco
  CANCELADO: "bg-red-900 text-white border-red-700 font-bold uppercase tracking-wide",
};

const PAYMENT_LABELS: Record<string, string> = {
  PIX: "PIX",
  DINHEIRO: "Dinheiro",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  DESCONTO_FOLHA: "Desc. Folha",
};

function formatCurrency(value: number | string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(String(value)) || 0);
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function PdvHistorico() {
  const { seller, isAdmin } = usePdvAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"PAGO" | "PENDENTE" | "CANCELADO" | "">("")
  const [canalFilter, setCanalFilter] = useState<"BALCAO" | "WHATSAPP" | "">("")
  const [startDate, setStartDate] = useState(() => firstOfMonthYmdSaoPaulo());
  const [endDate, setEndDate] = useState(() => todayYmdSaoPaulo());
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const { data, isLoading, refetch } = trpc.pdvOrders.list.useQuery({
    search: search || undefined,
    status: (statusFilter || undefined) as "PAGO" | "PENDENTE" | "CANCELADO" | undefined,
    canal: (canalFilter || undefined) as "BALCAO" | "WHATSAPP" | undefined,
    startDate,
    endDate,
    page,
    limit: 20,
    sellerId: isAdmin ? undefined : seller?.sellerId,
  });

  const { data: orderDetail } = trpc.pdvOrders.getById.useQuery(
    { pedidoId: selectedOrder?.pedidoId },
    { enabled: !!selectedOrder?.pedidoId }
  );

  const cancelMutation = trpc.pdvOrders.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Pedido cancelado — estoque devolvido");
      refetch();
      setSelectedOrder(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const togglePaymentMutation = trpc.pdvOrders.updateStatus.useMutation({
    onSuccess: (_data: any, variables: any) => {
      const novoStatus = variables.status;
      const label = novoStatus === 'PAGO' ? 'Pago' : 'Pendente';
      toast.success(`Status alterado para ${label} — planilha atualizada`);
      // Atualiza o selectedOrder localmente para refletir imediatamente
      setSelectedOrder((prev: any) => prev ? { ...prev, status: novoStatus } : prev);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <PdvLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-white text-2xl font-bold">Histórico de Pedidos</h1>
          <p className="text-gray-400 text-sm mt-0.5">{total} pedido(s) encontrado(s)</p>
        </div>

        {/* Filters */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por cliente, pedido..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-600"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-600"
            >
              <option value="">Todos os status</option>
              <option value="PAGO">Pago</option>
              <option value="PENDENTE">Pendente</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            <select
              value={canalFilter}
              onChange={(e) => { setCanalFilter(e.target.value as any); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-600"
            >
              <option value="">Todos os canais</option>
              <option value="BALCAO">Balcao</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600"
            />
            <span className="text-gray-600">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600"
            />
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <ShoppingBag className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum pedido encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Pedido</th>
                    <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Data</th>
                    <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Vendedor</th>
                    <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Cliente</th>
                    <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Canal</th>
                    <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Regime</th>
                    <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Total</th>
                    <th className="text-center text-gray-400 text-xs font-semibold px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order: any) => {
                    const isCancelado = order.status === "CANCELADO";
                    return (
                    <tr
                      key={order.id}
                      className={`border-b transition-colors cursor-pointer ${
                        isCancelado
                          ? "bg-red-950/50 border-red-900/40 hover:bg-red-900/50"
                          : "border-gray-800/50 hover:bg-gray-800/30"
                      }`}
                      onClick={() => setSelectedOrder(order)}
                    >
                      <td className="px-4 py-3">
                        <span className="text-white font-mono text-sm font-semibold">{order.pedidoId}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm whitespace-nowrap">
                        {formatDateTime(order.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{order.sellerName}</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {order.clienteNome || <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          order.canal === "WHATSAPP"
                            ? "bg-green-950/50 text-green-400"
                            : "bg-gray-800 text-gray-400"
                        }`}>
                          {order.canal}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {order.isSomenteServico ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-950/50 text-purple-400">
                            <Wrench className="w-3 h-3" />
                            Serviço
                          </span>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            order.regime === "ATACADO"
                              ? "bg-blue-950/50 text-blue-400"
                              : "bg-orange-950/50 text-orange-400"
                          }`}>
                            {order.regime}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-white font-semibold text-sm">
                        {formatCurrency(order.totalAplicado)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[order.status] || "bg-gray-800 text-gray-400"}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-gray-500 hover:text-white transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-gray-400 hover:text-white disabled:opacity-40 text-sm transition-colors"
            >
              Anterior
            </button>
            <span className="text-gray-400 text-sm">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-gray-400 hover:text-white disabled:opacity-40 text-sm transition-colors"
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
              <div>
                <h3 className="text-white font-bold text-lg">Pedido {selectedOrder.pedidoId}</h3>
                <p className="text-gray-400 text-sm">{formatDateTime(selectedOrder.createdAt)}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-xl p-3">
                  <div className="text-gray-500 text-xs mb-1">Vendedor</div>
                  <div className="text-white text-sm font-medium">{selectedOrder.sellerName}</div>
                </div>
                <div className="bg-gray-800 rounded-xl p-3">
                  <div className="text-gray-500 text-xs mb-1">Cliente</div>
                  <div className="text-white text-sm font-medium">{selectedOrder.clienteNome || "—"}</div>
                </div>
                <div className="bg-gray-800 rounded-xl p-3">
                  <div className="text-gray-500 text-xs mb-1">Canal</div>
                  <div className="text-white text-sm font-medium">{selectedOrder.canal}</div>
                </div>
                <div className="bg-gray-800 rounded-xl p-3">
                  <div className="text-gray-500 text-xs mb-1">Regime</div>
                  <div className={`text-sm font-medium ${selectedOrder.regime === "ATACADO" ? "text-blue-400" : "text-orange-400"}`}>
                    {selectedOrder.regime}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Package className="w-3.5 h-3.5" />
                  Itens
                </h4>
                <div className="space-y-1.5">
                  {(orderDetail?.items || []).map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2">
                      <div>
                        <span className="text-white text-sm">{item.time}</span>
                        <span className="text-gray-400 text-xs ml-2">{item.tamanho} · {item.quantidade}x</span>
                      </div>
                      <span className="text-white text-sm font-semibold">{formatCurrency(item.totalItem)}</span>
                    </div>
                  ))}
                  {!orderDetail && (
                    <div className="text-gray-600 text-sm text-center py-2">Carregando itens...</div>
                  )}
                </div>
              </div>

              {/* Services */}
              {(orderDetail?.services || []).length > 0 && (
                <div>
                  <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Serviços</h4>
                  <div className="space-y-1.5">
                    {orderDetail.services.map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2">
                        <span className="text-white text-sm">{s.tipo}{s.descricao ? ` — ${s.descricao}` : ""}</span>
                        <span className="text-white text-sm font-semibold">{formatCurrency(s.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payments */}
              <div>
                <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5" />
                  Pagamentos
                </h4>
                <div className="space-y-1.5">
                  {(orderDetail?.payments || []).map((p: any, i: number) => {
                    const taxa = parseFloat(p.taxa || 0);
                    const valor = parseFloat(p.valor || 0);
                    // Para débito/crédito: mostrar valor maquininha (valor real + taxa)
                    const valorExibido = taxa > 0 ? valor + taxa : valor;
                    const hasTaxa = taxa > 0;
                    return (
                      <div key={i} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2">
                        <div>
                          <span className="text-white text-sm">{PAYMENT_LABELS[p.formaPagamento] || p.formaPagamento}</span>
                          {p.nomePix && <span className="text-gray-400 text-xs ml-2">{p.nomePix}</span>}
                          {hasTaxa && (
                            <span className="text-gray-500 text-xs ml-2">taxa: {formatCurrency(taxa)}</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-white text-sm font-semibold">{formatCurrency(valorExibido)}</span>
                          {hasTaxa && (
                            <div className="text-gray-500 text-[10px]">loja recebe: {formatCurrency(valor)}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals */}
              {(() => {
                // Calcular totais a partir dos dados detalhados do pedido
                const items = orderDetail?.items || [];
                const services = orderDetail?.services || [];
                const payments = orderDetail?.payments || [];

                // Subtotal dos itens (soma de totalItem)
                const subtotalItens = items.reduce((s: number, i: any) => s + parseFloat(i.totalItem || 0), 0);
                // Total de serviços extras
                const totalServicos = services.reduce((s: number, sv: any) => s + parseFloat(sv.valor || 0), 0);
                // Taxa total de cartão
                const taxaTotal = payments.reduce((s: number, p: any) => s + parseFloat(p.taxa || 0), 0);
                // Valor real pago (loja recebe)
                const totalPagoReal = payments.reduce((s: number, p: any) => s + parseFloat(p.valor || 0), 0);
                // Valor maquininha (valor real + taxa)
                const totalMaquininha = payments.reduce((s: number, p: any) => {
                  const taxa = parseFloat(p.taxa || 0);
                  const valor = parseFloat(p.valor || 0);
                  return s + (taxa > 0 ? valor + taxa : valor);
                }, 0);
                // Total geral = itens + extras + taxa
                const totalGeral = subtotalItens + totalServicos + taxaTotal;
                const pendente = parseFloat(selectedOrder.totalPendente || 0);

                return (
                  <div className="bg-gray-800 rounded-xl p-4 space-y-2">
                    {/* Subtotal dos itens */}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Subtotal ({selectedOrder.regime})</span>
                      <span className="text-white">{formatCurrency(subtotalItens || selectedOrder.totalAplicado)}</span>
                    </div>

                    {/* Serviços extras */}
                    {totalServicos > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Serviços extras</span>
                        <span className="text-white">{formatCurrency(totalServicos)}</span>
                      </div>
                    )}

                    {/* Taxa de cartão */}
                    {taxaTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Taxa de cartão</span>
                        <span className="text-orange-400">+ {formatCurrency(taxaTotal)}</span>
                      </div>
                    )}

                    {/* Total geral */}
                    <div className="flex justify-between text-sm font-bold border-t border-gray-700 pt-2">
                      <span className="text-white">Total Geral</span>
                      <span className="text-white text-base">{formatCurrency(totalGeral || selectedOrder.totalAplicado)}</span>
                    </div>

                    {/* Valor maquininha (se houver taxa) */}
                    {taxaTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-yellow-500">Valor maquininha</span>
                        <span className="text-yellow-400 font-semibold">{formatCurrency(totalMaquininha)}</span>
                      </div>
                    )}

                    {/* Pendente */}
                    {pendente > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Pendente</span>
                        <span className="text-yellow-400">{formatCurrency(pendente)}</span>
                      </div>
                    )}

                    {/* Status */}
                    <div className="flex justify-between items-center pt-1 border-t border-gray-700">
                      <span className="text-white font-semibold">Status</span>
                      <span className={`text-sm px-2.5 py-1 rounded-full border font-medium ${
                        selectedOrder.status === 'PAGO' ? 'bg-green-950/50 text-green-400 border-green-900/50' :
                        selectedOrder.status === 'PENDENTE' ? 'bg-yellow-950/50 text-yellow-400 border-yellow-900/50' :
                        'bg-red-950/50 text-red-400 border-red-900/50'
                      }`}>
                        {selectedOrder.status === 'PAGO' ? 'PAGO' : selectedOrder.status === 'PENDENTE' ? 'PENDENTE' : 'CANCELADO'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {selectedOrder.justificativa && (
                <div className="bg-gray-800 rounded-xl p-3">
                  <div className="text-gray-500 text-xs mb-1">Observações</div>
                  <div className="text-gray-300 text-sm">{selectedOrder.justificativa}</div>
                </div>
              )}

              {/* Botões de ação — apenas admin */}
              {isAdmin && selectedOrder.status !== "CANCELADO" && (
                <div className="flex flex-col gap-2">
                  {/* Alternar PAGO ↔ PENDENTE */}
                  <button
                    onClick={() => {
                      const novoStatus = selectedOrder.status === 'PAGO' ? 'PENDENTE' : 'PAGO';
                      const label = novoStatus === 'PAGO' ? 'marcar como Pago' : 'marcar como Pendente';
                      if (confirm(`Deseja ${label}? Isso será refletido na planilha.`)) {
                        togglePaymentMutation.mutate({ pedidoId: selectedOrder.pedidoId, status: novoStatus });
                      }
                    }}
                    disabled={togglePaymentMutation.isPending}
                    className={`w-full font-medium py-2.5 rounded-xl text-sm transition-colors border disabled:opacity-50 ${
                      selectedOrder.status === 'PAGO'
                        ? 'border-yellow-800/60 text-yellow-400 hover:bg-yellow-950/30'
                        : 'border-green-800/60 text-green-400 hover:bg-green-950/30'
                    }`}
                  >
                    {togglePaymentMutation.isPending
                      ? 'Atualizando...'
                      : selectedOrder.status === 'PAGO'
                        ? '↩ Marcar como Pendente'
                        : '✓ Marcar como Pago'
                    }
                  </button>

                  {/* Cancelar pedido */}
                  <button
                    onClick={() => {
                      if (confirm("Cancelar este pedido? O estoque será devolvido.")) {
                        cancelMutation.mutate({ pedidoId: selectedOrder.pedidoId, status: "CANCELADO" });
                      }
                    }}
                    disabled={cancelMutation.isPending}
                    className="w-full border border-red-900/50 text-red-400 hover:bg-red-950/30 font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar Pedido'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PdvLayout>
  );
}
