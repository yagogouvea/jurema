import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, CheckCircle, Send,
  CreditCard, Banknote, Smartphone, Building, ChevronDown, ChevronUp,
  Pencil, Check, X
} from "lucide-react";

interface CartItem {
  productId?: number;
  linha: string;
  modelo: string;
  time: string;
  descricao?: string;
  tamanho: string;
  quantidade: number;
  precoUnitario: number;
  totalItem: number;
}

interface ServiceItem {
  tipo: string;
  descricao?: string;
  valor: number;
}

interface PaymentItem {
  formaPagamento: "PIX" | "DINHEIRO" | "DEBITO" | "CREDITO" | "DESCONTO_FOLHA";
  /** Valor real (sem taxa) — o que a loja recebe */
  valor: number;
  /** Taxa calculada */
  taxa: number;
  /** Valor líquido (valor - taxa) */
  valorLiquido: number;
  /** Valor a passar na maquininha (pode ser editado) */
  valorMaquininha: number;
  nomePix?: string;
}

const PAYMENT_METHODS = [
  { key: "PIX",            label: "PIX",          taxa: 0, icon: Smartphone, color: "text-green-400" },
  { key: "DINHEIRO",       label: "Dinheiro",      taxa: 0, icon: Banknote,   color: "text-yellow-400" },
  { key: "DEBITO",         label: "Débito",        taxa: 3, icon: CreditCard, color: "text-blue-400" },
  { key: "CREDITO",        label: "Crédito",       taxa: 5, icon: CreditCard, color: "text-purple-400" },
  { key: "DESCONTO_FOLHA", label: "Desc. Folha",   taxa: 0, icon: Building,   color: "text-orange-400" },
] as const;

const SERVICE_TYPES = ["CORREIO", "CARRETO", "CAIXINHA", "OUTRO"];

interface PdvCheckoutProps {
  cart: CartItem[];
  clienteNome: string;
  clienteTelefone: string;
  regime: "ATACADO" | "VAREJO";
  totalVarejo: number;
  totalAtacado: number;
  totalAplicado: number;
  onBack: () => void;
  onSuccess: () => void;
}

function fmt(v: number) {
  return v.toFixed(2).replace(".", ",");
}

export default function PdvCheckout({
  cart, clienteNome, clienteTelefone, regime,
  totalVarejo, totalAtacado, totalAplicado, onBack, onSuccess
}: PdvCheckoutProps) {
  const { seller } = usePdvAuth();
  // Canal é selecionado aqui na configuração do pedido
  const [canal, setCanal] = useState<"BALCAO" | "WHATSAPP">("BALCAO");
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newServiceTipo, setNewServiceTipo] = useState("CORREIO");
  const [newServiceDescricao, setNewServiceDescricao] = useState("");
  const [newServiceValor, setNewServiceValor] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] = useState<typeof PAYMENT_METHODS[number]["key"]>("PIX");
  const [newPaymentValor, setNewPaymentValor] = useState("");
  const [newPaymentNomePix, setNewPaymentNomePix] = useState("");
  // editing maquininha value for an existing payment
  const [editingMaquininhaIdx, setEditingMaquininhaIdx] = useState<number | null>(null);
  const [editingMaquininhaVal, setEditingMaquininhaVal] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [showItems, setShowItems] = useState(false);

  const totalServicos = useMemo(() => services.reduce((sum, s) => sum + s.valor, 0), [services]);
  const totalGeral = totalAplicado + totalServicos;
  const totalPago = useMemo(() => payments.reduce((sum, p) => sum + p.valor, 0), [payments]);
  const totalPendente = Math.max(0, totalGeral - totalPago);

  // Preview of taxa/maquininha while user types in the add-payment form
  const previewVal = parseFloat(newPaymentValor.replace(",", "."));
  const previewMethod = PAYMENT_METHODS.find(m => m.key === newPaymentMethod)!;
  const previewTaxa = !isNaN(previewVal) && previewMethod.taxa > 0
    ? (previewVal * previewMethod.taxa) / 100
    : 0;
  const previewMaquininha = !isNaN(previewVal) ? previewVal + previewTaxa : 0;

  const createOrderMutation = trpc.pdvOrders.create.useMutation({
    onSuccess: (data) => {
      if (canal === "WHATSAPP" && clienteTelefone) {
        const msg = buildWhatsAppMessage(data.pedidoId);
        const phone = clienteTelefone.replace(/\D/g, "");
        const url = `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank");
      }
      onSuccess();
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao finalizar pedido");
    },
  });

  const buildWhatsAppMessage = (pedidoId: string): string => {
    const lines = [
      `*JUMERA SPORT - PEDIDO ${pedidoId}*`,
      ``,
      `*Vendedor:* ${seller?.name}`,
      `*Canal:* ${canal}`,
      `*Regime:* ${regime}`,
      clienteNome ? `*Cliente:* ${clienteNome}` : "",
      ``,
      `*ITENS:*`,
      ...cart.map(item =>
        `${item.quantidade}x ${item.time} (${item.tamanho}) - R$ ${fmt(item.totalItem)}`
      ),
      ``,
      `*SUBTOTAL:* R$ ${fmt(totalAplicado)}`,
    ];

    if (services.length > 0) {
      lines.push(``, `*SERVIÇOS:*`);
      services.forEach(s => {
        lines.push(`${s.tipo}${s.descricao ? ` (${s.descricao})` : ""}: R$ ${fmt(s.valor)}`);
      });
    }

    lines.push(``, `*TOTAL GERAL:* R$ ${fmt(totalGeral)}`, ``, `*PAGAMENTO:*`);

    payments.forEach(p => {
      const method = PAYMENT_METHODS.find(m => m.key === p.formaPagamento);
      const label = method?.label || p.formaPagamento;
      if (p.taxa > 0) {
        lines.push(`${label}: R$ ${fmt(p.valor)} (maquininha: R$ ${fmt(p.valorMaquininha)})`);
      } else {
        lines.push(`${label}: R$ ${fmt(p.valor)}`);
      }
    });

    if (totalPendente > 0) {
      lines.push(`*PENDENTE:* R$ ${fmt(totalPendente)}`);
    }

    return lines.filter(l => l !== "").join("\n");
  };

  const addService = () => {
    const valor = parseFloat(newServiceValor.replace(",", "."));
    if (isNaN(valor) || valor <= 0) { toast.error("Valor inválido"); return; }
    setServices(prev => [...prev, { tipo: newServiceTipo, descricao: newServiceDescricao || undefined, valor }]);
    setNewServiceValor("");
    setNewServiceDescricao("");
    setShowAddService(false);
  };

  const addPayment = () => {
    const valor = parseFloat(newPaymentValor.replace(",", "."));
    if (isNaN(valor) || valor <= 0) { toast.error("Valor inválido"); return; }
    const method = PAYMENT_METHODS.find(m => m.key === newPaymentMethod)!;
    const taxa = (valor * method.taxa) / 100;
    const valorLiquido = valor - taxa;
    const valorMaquininha = valor + taxa; // valor que passa na maquininha
    setPayments(prev => [...prev, {
      formaPagamento: newPaymentMethod as any,
      valor,
      taxa,
      valorLiquido,
      valorMaquininha,
      nomePix: newPaymentMethod === "PIX" ? newPaymentNomePix : undefined,
    }]);
    setNewPaymentValor("");
    setNewPaymentNomePix("");
    setShowAddPayment(false);
  };

  const startEditMaquininha = (idx: number) => {
    setEditingMaquininhaIdx(idx);
    setEditingMaquininhaVal(payments[idx].valorMaquininha.toFixed(2).replace(".", ","));
  };

  const confirmEditMaquininha = (idx: number) => {
    const val = parseFloat(editingMaquininhaVal.replace(",", "."));
    if (isNaN(val) || val <= 0) { toast.error("Valor inválido"); return; }
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, valorMaquininha: val } : p));
    setEditingMaquininhaIdx(null);
  };

  const handleFinalize = () => {
    if (payments.length === 0 && totalGeral > 0) {
      toast.error("Adicione pelo menos uma forma de pagamento");
      return;
    }
    createOrderMutation.mutate({
      canal,
      clienteNome: clienteNome || undefined,
      clienteTelefone: clienteTelefone || undefined,
      regime,
      totalVarejo,
      totalAtacado,
      totalAplicado,
      totalPago,
      totalPendente,
      justificativa: justificativa || undefined,
      status: totalPendente > 0 ? "PENDENTE" : "PAGO",
      items: cart.map(item => ({
        productId: item.productId,
        linha: item.linha,
        modelo: item.modelo,
        time: item.time,
        descricao: item.descricao,
        tamanho: item.tamanho,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        totalItem: item.totalItem,
      })),
      payments,
      services,
    });
  };

  const totalPecas = cart.reduce((sum, item) => sum + item.quantidade, 0);

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">Voltar</span>
        </button>
        <div>
          <h1 className="text-white font-bold">Finalizar Venda</h1>
          <p className="text-gray-400 text-xs">
            {totalPecas} peças · {regime} · {canal}
            {clienteNome && ` · ${clienteNome}`}
          </p>
        </div>
        <div className={`ml-auto text-xs px-3 py-1 rounded-full font-semibold ${
          regime === "ATACADO"
            ? "bg-blue-950 text-blue-400 border border-blue-800"
            : "bg-orange-950 text-orange-400 border border-orange-800"
        }`}>
          {regime}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-6">

          {/* Order Summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowItems(!showItems)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-800/50 transition-colors"
            >
              <div>
                <h3 className="text-white font-semibold">Resumo do Pedido</h3>
                <p className="text-gray-400 text-sm">{totalPecas} peças · R$ {fmt(totalAplicado)}</p>
              </div>
              {showItems ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            {showItems && (
              <div className="border-t border-gray-800 p-4 space-y-2">
                {cart.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{item.quantidade}x {item.time} ({item.tamanho})</span>
                    <span className="text-white font-medium">R$ {fmt(item.totalItem)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-700 pt-2 flex justify-between font-semibold">
                  <span className="text-gray-300">Subtotal</span>
                  <span className="text-white">R$ {fmt(totalAplicado)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Canal do Pedido */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h3 className="text-white font-semibold mb-3">Canal de Venda</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setCanal("BALCAO")}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                  canal === "BALCAO"
                    ? "bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
                }`}
              >
                Balcão
              </button>
              <button
                onClick={() => setCanal("WHATSAPP")}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                  canal === "WHATSAPP"
                    ? "bg-green-600 border-green-600 text-white shadow-lg shadow-green-600/20"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
                }`}
              >
                WhatsApp
              </button>
            </div>
            {canal === "WHATSAPP" && !clienteTelefone && (
              <p className="text-yellow-500 text-xs mt-2">⚠️ Sem telefone do cliente — o link do WhatsApp não será gerado automaticamente.</p>
            )}
          </div>

          {/* Services */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Serviços Extras</h3>
              <button
                onClick={() => setShowAddService(!showAddService)}
                className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>

            {showAddService && (
              <div className="bg-gray-800 rounded-xl p-3 mb-3 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={newServiceTipo}
                    onChange={(e) => setNewServiceTipo(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                  >
                    {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="text"
                    value={newServiceValor}
                    onChange={(e) => setNewServiceValor(e.target.value)}
                    placeholder="Valor"
                    className="w-28 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                  />
                </div>
                <input
                  type="text"
                  value={newServiceDescricao}
                  onChange={(e) => setNewServiceDescricao(e.target.value)}
                  placeholder="Descrição (opcional)"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                />
                <div className="flex gap-2">
                  <button onClick={addService} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded-lg font-medium transition-colors">Adicionar</button>
                  <button onClick={() => setShowAddService(false)} className="px-4 text-gray-400 hover:text-white text-sm py-2 rounded-lg transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {services.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum serviço adicionado</p>
            ) : (
              <div className="space-y-2">
                {services.map((service, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2">
                    <div>
                      <span className="text-white text-sm font-medium">{service.tipo}</span>
                      {service.descricao && <span className="text-gray-400 text-xs ml-2">{service.descricao}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white text-sm font-semibold">R$ {fmt(service.valor)}</span>
                      <button onClick={() => setServices(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payments */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Formas de Pagamento</h3>
              <button
                onClick={() => setShowAddPayment(!showAddPayment)}
                className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>

            {showAddPayment && (
              <div className="bg-gray-800 rounded-xl p-3 mb-3 space-y-3">
                {/* Method selector */}
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method.key}
                      onClick={() => setNewPaymentMethod(method.key)}
                      className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                        newPaymentMethod === method.key
                          ? "bg-red-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      {method.label}
                      {method.taxa > 0 && <span className="block text-[10px] opacity-70">+{method.taxa}%</span>}
                    </button>
                  ))}
                </div>

                {/* Valor input */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">
                    {previewMethod.taxa > 0 ? "Valor real (o que a loja recebe)" : "Valor"}
                  </label>
                  <input
                    type="text"
                    value={newPaymentValor}
                    onChange={(e) => setNewPaymentValor(e.target.value)}
                    placeholder="0,00"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                  />
                </div>

                {/* PIX name */}
                {newPaymentMethod === "PIX" && (
                  <input
                    type="text"
                    value={newPaymentNomePix}
                    onChange={(e) => setNewPaymentNomePix(e.target.value)}
                    placeholder="Nome do PIX (opcional)"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                  />
                )}

                {/* Taxa preview — only for credit/debit */}
                {!isNaN(previewVal) && previewVal > 0 && previewMethod.taxa > 0 && (
                  <div className="bg-gray-900 rounded-xl p-3 space-y-1.5 border border-gray-700">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Valor real (loja recebe)</span>
                      <span className="text-white font-semibold">R$ {fmt(previewVal)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Taxa {previewMethod.label} ({previewMethod.taxa}%)</span>
                      <span className="text-red-400">+ R$ {fmt(previewTaxa)}</span>
                    </div>
                    <div className="border-t border-gray-700 pt-1.5 flex justify-between text-sm font-bold">
                      <span className="text-yellow-400">Valor maquininha</span>
                      <span className="text-yellow-400">R$ {fmt(previewMaquininha)}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Você pode editar o valor da maquininha após adicionar.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={addPayment} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded-lg font-medium transition-colors">Adicionar</button>
                  <button onClick={() => setShowAddPayment(false)} className="px-4 text-gray-400 hover:text-white text-sm py-2 rounded-lg transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {payments.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum pagamento adicionado</p>
            ) : (
              <div className="space-y-2">
                {payments.map((payment, i) => {
                  const method = PAYMENT_METHODS.find(m => m.key === payment.formaPagamento)!;
                  const hasTaxa = payment.taxa > 0;
                  return (
                    <div key={i} className={`bg-gray-800 rounded-xl px-3 py-3 ${hasTaxa ? "space-y-2" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${method.color}`}>{method.label}</span>
                          {payment.nomePix && <span className="text-gray-400 text-xs">({payment.nomePix})</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-white text-sm font-semibold">R$ {fmt(payment.valor)}</span>
                          <button
                            onClick={() => setPayments(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-gray-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Maquininha row — only for credit/debit */}
                      {hasTaxa && (
                        <div className="bg-gray-900 rounded-lg px-3 py-2 border border-yellow-900/40">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Valor real (loja recebe)</p>
                              <p className="text-white text-sm font-medium">R$ {fmt(payment.valor)}</p>
                            </div>
                            <div className="text-gray-600 text-xs">→</div>
                            <div className="flex-1">
                              <p className="text-[10px] text-yellow-500 uppercase tracking-wide">Passar na maquininha</p>
                              {editingMaquininhaIdx === i ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="text-yellow-400 text-sm">R$</span>
                                  <input
                                    type="text"
                                    value={editingMaquininhaVal}
                                    onChange={(e) => setEditingMaquininhaVal(e.target.value)}
                                    className="w-24 bg-gray-800 border border-yellow-600 rounded px-2 py-0.5 text-yellow-300 text-sm focus:outline-none"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") confirmEditMaquininha(i);
                                      if (e.key === "Escape") setEditingMaquininhaIdx(null);
                                    }}
                                  />
                                  <button onClick={() => confirmEditMaquininha(i)} className="text-green-400 hover:text-green-300">
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setEditingMaquininhaIdx(null)} className="text-gray-500 hover:text-gray-300">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-yellow-400 font-bold text-sm">R$ {fmt(payment.valorMaquininha)}</span>
                                  <button
                                    onClick={() => startEditMaquininha(i)}
                                    className="text-gray-500 hover:text-yellow-400 transition-colors"
                                    title="Editar valor maquininha"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-600 mt-1">
                            Taxa {method.label} {method.taxa}%: +R$ {fmt(payment.taxa)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Observações */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h3 className="text-white font-semibold mb-2">Observações</h3>
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Observações do pedido (opcional)"
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          {/* Total Summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Subtotal ({regime})</span>
              <span className="text-white">R$ {fmt(totalAplicado)}</span>
            </div>
            {totalServicos > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Serviços</span>
                <span className="text-white">R$ {fmt(totalServicos)}</span>
              </div>
            )}
            <div className="border-t border-gray-700 pt-2 flex justify-between font-bold">
              <span className="text-white">Total Geral</span>
              <span className="text-white text-lg">R$ {fmt(totalGeral)}</span>
            </div>
            {payments.length > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total Pago</span>
                  <span className="text-green-400">R$ {fmt(totalPago)}</span>
                </div>
                {/* Show maquininha total if any payment has taxa */}
                {payments.some(p => p.taxa > 0) && (
                  <div className="flex justify-between text-sm">
                    <span className="text-yellow-500">Total maquininha</span>
                    <span className="text-yellow-400 font-semibold">
                      R$ {fmt(payments.reduce((sum, p) => sum + (p.taxa > 0 ? p.valorMaquininha : p.valor), 0))}
                    </span>
                  </div>
                )}
                {totalPendente > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Pendente</span>
                    <span className="text-yellow-400">R$ {fmt(totalPendente)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-900 border-t border-gray-800 p-4">
        <button
          onClick={handleFinalize}
          disabled={createOrderMutation.isPending}
          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-colors text-lg shadow-lg shadow-red-600/20"
        >
          {createOrderMutation.isPending ? (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : canal === "WHATSAPP" ? (
            <><Send className="w-5 h-5" />Finalizar e Enviar WhatsApp</>
          ) : (
            <><CheckCircle className="w-5 h-5" />Finalizar Venda</>
          )}
        </button>
      </div>
    </div>
  );
}
