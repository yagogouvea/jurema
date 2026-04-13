import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import { Wallet, Calendar, CheckCircle2, Plus, Trash2, DollarSign, User, AlertTriangle, History, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function PdvDescontoFolha() {
  const { isAdmin, seller } = usePdvAuth();

  const [startDate, setStartDate] = useState(() => {
    // Início da semana (segunda-feira)
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showAdd, setShowAdd] = useState(false);
  const [filterQuitado, setFilterQuitado] = useState<boolean | undefined>(false);

  // Form state
  const [formSellerId, setFormSellerId] = useState<number | null>(null);
  const [formDescricao, setFormDescricao] = useState("");
  const [formValor, setFormValor] = useState("");

  const utils = trpc.useUtils();

  // Resumo por vendedor (admin)
  const { data: resumo, isLoading: loadingResumo } = trpc.pdvDescontoFolha.resumoPorVendedor.useQuery(
    { startDate, endDate },
    { enabled: isAdmin }
  );

  // Lista detalhada
  const { data: lista, isLoading: loadingLista } = trpc.pdvDescontoFolha.list.useQuery(
    { startDate, endDate, quitado: filterQuitado, page: 1, limit: 100 },
  );

  // Vendedores para o form
  const { data: sellersData } = trpc.pdvSellers.list.useQuery(undefined, { enabled: isAdmin });
  const sellers = useMemo(() => (sellersData as any[])?.filter((s: any) => s.isActive) || [], [sellersData]);

  const createMutation = trpc.pdvDescontoFolha.create.useMutation({
    onSuccess: () => {
      toast.success("Desconto registrado!");
      utils.pdvDescontoFolha.list.invalidate();
      utils.pdvDescontoFolha.resumoPorVendedor.invalidate();
      setShowAdd(false);
      setFormDescricao("");
      setFormValor("");
      setFormSellerId(null);
    },
    onError: () => toast.error("Erro ao registrar"),
  });

  const quitarMutation = trpc.pdvDescontoFolha.quitar.useMutation({
    onSuccess: () => {
      toast.success("Desconto quitado!");
      utils.pdvDescontoFolha.list.invalidate();
      utils.pdvDescontoFolha.resumoPorVendedor.invalidate();
    },
    onError: () => toast.error("Erro ao quitar"),
  });

  const quitarTodosMutation = trpc.pdvDescontoFolha.quitarTodos.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.quitados} desconto(s) quitado(s)!`);
      utils.pdvDescontoFolha.list.invalidate();
      utils.pdvDescontoFolha.resumoPorVendedor.invalidate();
    },
    onError: () => toast.error("Erro ao quitar"),
  });

  const deleteMutation = trpc.pdvDescontoFolha.delete.useMutation({
    onSuccess: () => {
      toast.success("Registro removido!");
      utils.pdvDescontoFolha.list.invalidate();
      utils.pdvDescontoFolha.resumoPorVendedor.invalidate();
    },
    onError: () => toast.error("Erro ao remover"),
  });

  function handleCreate() {
    if (!formSellerId || !formDescricao || !formValor) {
      toast.error("Preencha todos os campos");
      return;
    }
    const sellerObj = sellers.find((s: any) => s.id === formSellerId);
    createMutation.mutate({
      sellerId: formSellerId,
      sellerName: sellerObj?.name || "Desconhecido",
      descricao: formDescricao,
      valor: parseFloat(formValor),
    });
  }

  // Histórico de quitações
  const [activeTab, setActiveTab] = useState<"pendentes" | "historico">("pendentes");
  const [histPage, setHistPage] = useState(1);
  const { data: historico, isLoading: loadingHistorico } = trpc.pdvRelatorio.historicoQuitacoes.useQuery(
    { startDate, endDate, page: histPage, limit: 20 },
    { enabled: isAdmin && activeTab === "historico" }
  );

  const items = lista?.items || [];
  const porVendedor = resumo?.porVendedor || [];
  const totalPendente = resumo?.totalPendente || 0;

  return (
    <PdvLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-white text-2xl font-bold">Desconto em Folha</h1>
            <p className="text-gray-400 text-sm mt-0.5">Mercadorias retiradas por funcionários para pagamento posterior</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-700 hover:bg-green-600 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Registrar
            </button>
          )}
        </div>

        {/* Add form */}
        {showAdd && isAdmin && (
          <div className="bg-gray-900 border border-green-900/50 rounded-2xl p-5 space-y-4">
            <h3 className="text-white font-semibold">Novo Desconto em Folha</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Funcionário</label>
                <select
                  value={formSellerId || ""}
                  onChange={(e) => setFormSellerId(parseInt(e.target.value) || null)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-600"
                >
                  <option value="">Selecione...</option>
                  {sellers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Descrição</label>
                <input
                  type="text" placeholder="Ex: 1 Camiseta Flamengo M"
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-600"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Valor (R$)</label>
                <input
                  type="number" min={0} step={0.01} placeholder="0.00"
                  value={formValor}
                  onChange={(e) => setFormValor(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green-600"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={createMutation.isPending}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50">
                {createMutation.isPending ? "Salvando..." : "Registrar"}
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
          <div className="flex items-center gap-2">
            <select
              value={filterQuitado === undefined ? "all" : filterQuitado ? "quitado" : "pendente"}
              onChange={(e) => {
                const v = e.target.value;
                setFilterQuitado(v === "all" ? undefined : v === "quitado");
              }}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600"
            >
              <option value="all">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="quitado">Quitados</option>
            </select>
          </div>
        </div>

        {loadingResumo || loadingLista ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Total pendente (destaque) */}
            {isAdmin && totalPendente > 0 && (
              <div className="bg-green-950/30 border border-green-900/50 rounded-2xl p-5 flex items-center gap-4">
                <AlertTriangle className="w-8 h-8 text-green-400 flex-shrink-0" />
                <div>
                  <div className="text-green-400 font-bold text-xl">{formatCurrency(totalPendente)}</div>
                  <div className="text-green-400/70 text-sm">Total pendente de desconto em folha</div>
                </div>
              </div>
            )}

            {/* Resumo por vendedor (admin) */}
            {isAdmin && porVendedor.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Saldo por Funcionário</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Funcionário</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Itens</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Pendente</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Quitado</th>
                        <th className="text-center text-gray-400 text-xs font-semibold px-4 py-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porVendedor.map((v: any) => (
                        <tr key={v.sellerId} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-500" />
                              <span className="text-white font-medium text-sm">{v.sellerName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300 text-sm">{v.totalItens}</td>
                          <td className="px-4 py-3 text-right text-green-400 font-semibold text-sm">{formatCurrency(v.pendente)}</td>
                          <td className="px-4 py-3 text-right text-green-400 text-sm">{formatCurrency(v.quitado)}</td>
                          <td className="px-4 py-3 text-center">
                            {v.pendente > 0 && (
                              <button
                                onClick={() => {
                                  if (confirm(`Quitar todos os pendentes de ${v.sellerName}? (${formatCurrency(v.pendente)})`)) {
                                    quitarTodosMutation.mutate({ sellerId: v.sellerId });
                                  }
                                }}
                                disabled={quitarTodosMutation.isPending}
                                className="px-3 py-1.5 bg-green-800/50 hover:bg-green-700/50 border border-green-800 rounded-lg text-green-400 text-xs font-medium transition-colors disabled:opacity-50"
                              >
                                Quitar Tudo
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tabs (admin) */}
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("pendentes")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    activeTab === "pendentes" ? "bg-green-700 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  Registros
                </button>
                <button
                  onClick={() => setActiveTab("historico")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    activeTab === "historico" ? "bg-green-700 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  <History className="w-4 h-4" />
                  Histórico de Quitações
                </button>
              </div>
            )}

            {/* Histórico de Quitações */}
            {isAdmin && activeTab === "historico" && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="text-white font-semibold">Histórico de Quitações</h3>
                  {historico && (
                    <span className="text-gray-400 text-xs">
                      {historico.total} registro(s) — Total: {formatCurrency(historico.totalValor)}
                    </span>
                  )}
                </div>
                {loadingHistorico ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : !historico || historico.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                    <History className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma quitação no período</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-800">
                            <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Funcionário</th>
                            <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Descrição</th>
                            <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Valor</th>
                            <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Quitado Em</th>
                            <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Quitado Por</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historico.items.map((item: any) => (
                            <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                              <td className="px-4 py-3 text-white text-sm font-medium">{item.sellerName}</td>
                              <td className="px-4 py-3 text-gray-300 text-sm">
                                {item.descricao}
                                {item.pedidoId && <span className="text-gray-600 text-xs ml-2">({item.pedidoId})</span>}
                              </td>
                              <td className="px-4 py-3 text-right text-green-400 font-semibold text-sm">{formatCurrency(item.valor)}</td>
                              <td className="px-4 py-3 text-gray-300 text-sm">
                                {item.quitadoEm ? new Date(item.quitadoEm).toLocaleString("pt-BR") : "—"}
                              </td>
                              <td className="px-4 py-3 text-gray-300 text-sm">{item.quitadoPor || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Paginação */}
                    {historico.totalPages > 1 && (
                      <div className="flex items-center justify-center gap-3 py-3 border-t border-gray-800">
                        <button
                          onClick={() => setHistPage(p => Math.max(1, p - 1))}
                          disabled={histPage <= 1}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-gray-400 text-xs">
                          Página {histPage} de {historico.totalPages}
                        </span>
                        <button
                          onClick={() => setHistPage(p => Math.min(historico.totalPages, p + 1))}
                          disabled={histPage >= historico.totalPages}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Lista detalhada (tab registros) */}
            {(activeTab === "pendentes" || !isAdmin) && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h3 className="text-white font-semibold">
                  {isAdmin ? "Detalhamento" : "Meus Descontos em Folha"}
                </h3>
              </div>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                  <Wallet className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Nenhum registro no período</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Data</th>
                        {isAdmin && <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Funcionário</th>}
                        <th className="text-left text-gray-400 text-xs font-semibold px-4 py-3">Descrição</th>
                        <th className="text-right text-gray-400 text-xs font-semibold px-4 py-3">Valor</th>
                        <th className="text-center text-gray-400 text-xs font-semibold px-4 py-3">Status</th>
                        {isAdmin && <th className="text-center text-gray-400 text-xs font-semibold px-4 py-3">Ações</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: any) => (
                        <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3 text-gray-300 text-sm">
                            {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-3 text-white text-sm">{item.sellerName}</td>
                          )}
                          <td className="px-4 py-3 text-gray-300 text-sm">
                            {item.descricao}
                            {item.pedidoId && (
                              <span className="text-gray-600 text-xs ml-2">({item.pedidoId})</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-white font-semibold text-sm">
                            {formatCurrency(parseFloat(item.valor))}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.quitado ? (
                              <span className="text-xs px-2.5 py-1 rounded-full bg-green-950/40 border border-green-900/50 text-green-400 font-medium">
                                Quitado
                              </span>
                            ) : (
                              <span className="text-xs px-2.5 py-1 rounded-full bg-green-950/40 border border-green-900/50 text-green-400 font-medium">
                                Pendente
                              </span>
                            )}
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {!item.quitado && (
                                  <button
                                    onClick={() => quitarMutation.mutate({ id: item.id })}
                                    disabled={quitarMutation.isPending}
                                    className="p-1.5 hover:bg-green-900/30 rounded-lg text-green-500 transition-colors"
                                    title="Quitar"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (confirm("Remover este registro?")) {
                                      deleteMutation.mutate({ id: item.id });
                                    }
                                  }}
                                  disabled={deleteMutation.isPending}
                                  className="p-1.5 hover:bg-green-900/30 rounded-lg text-green-500 transition-colors"
                                  title="Remover"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}
          </>
        )}
      </div>
    </PdvLayout>
  );
}
