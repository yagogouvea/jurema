import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, CheckCircle, Send,
  CreditCard, Banknote, Smartphone, Building, ChevronDown, ChevronUp,
  Pencil, Check, X, Camera, ImagePlus, AlertTriangle,
  Loader2, XCircle, MapPin
} from "lucide-react";
import { useCepLookup } from "@/hooks/useCepLookup";

interface CartItem {
  productId?: number;
  linha: string;
  modelo: string;
  time: string;
  descricao?: string;
  tipo?: string;
  tamanho: string;
  quantidade: number;
  precoUnitario: number;
  totalItem: number;
  isSofia?: boolean;
}

interface ServiceItem {
  tipo: string;
  descricao?: string;
  valor: number;
  cep?: string;
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
  regime: "ATACADO" | "VAREJO";
  totalVarejo: number;
  totalAtacado: number;
  onBack: () => void;
  onSuccess: () => void;
}

function fmt(v: number) {
  return v.toFixed(2).replace(".", ",");
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function parseMoney(s: string) {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export default function PdvCheckout({
  cart, regime,
  totalVarejo, totalAtacado, onBack, onSuccess
}: PdvCheckoutProps) {
  const utils = trpc.useUtils();
  const { seller } = usePdvAuth();
  // Canal é selecionado aqui na configuração do pedido
  const [canal, setCanal] = useState<"BALCAO" | "WHATSAPP">("BALCAO");
  // Dados do cliente preenchidos no checkout
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newServiceTipo, setNewServiceTipo] = useState("CORREIO");
  const [newServiceDescricao, setNewServiceDescricao] = useState("");
  const [newServiceValor, setNewServiceValor] = useState("");
  const [newServiceCep, setNewServiceCep] = useState("");
  // Validação automática de CEP via ViaCEP (debounce 350 ms)
  const cepLookup = useCepLookup(newServiceCep);
  const [newPaymentMethod, setNewPaymentMethod] = useState<typeof PAYMENT_METHODS[number]["key"]>("PIX");
  const [newPaymentValor, setNewPaymentValor] = useState("");
  const [newPaymentNomePix, setNewPaymentNomePix] = useState("");
  // editing maquininha value for an existing payment
  const [editingMaquininhaIdx, setEditingMaquininhaIdx] = useState<number | null>(null);
  const [editingMaquininhaVal, setEditingMaquininhaVal] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [showItems, setShowItems] = useState(false);
  // Pendente explícito: checkbox + valor manual + justificativa
  const [isPendente, setIsPendente] = useState(false);
  const [valorPendenteManual, setValorPendenteManual] = useState("");
  // Sofia por item: mapa de índice do carrinho -> boolean
  const [sofiaItems, setSofiaItems] = useState<Record<number, boolean>>({});
  /** Preço unitário negociado na venda (Sofia) — não usar só o preço do catálogo × regime */
  const [sofiaPrecoUnitario, setSofiaPrecoUnitario] = useState<Record<number, string>>({});
  // Comissão da loja por item Sofia (personalizada): mapa de índice -> valor string
  const [sofiaComissao, setSofiaComissao] = useState<Record<number, string>>({});
  const toggleSofiaItem = (idx: number) => {
    setSofiaItems(prev => {
      const nextOn = !prev[idx];
      if (nextOn) {
        const base = cart[idx]?.precoUnitario ?? 0;
        setSofiaPrecoUnitario(sp => ({
          ...sp,
          [idx]: sp[idx] ?? String(base).replace(".", ","),
        }));
        setSofiaComissao(c =>
          c[idx] != null && String(c[idx]).trim() !== "" ? c : { ...c, [idx]: "10" }
        );
      } else {
        setSofiaPrecoUnitario(sp => {
          const { [idx]: _, ...rest } = sp;
          return rest;
        });
      }
      return { ...prev, [idx]: nextOn };
    });
  };
  const updateSofiaComissao = (idx: number, val: string) => {
    setSofiaComissao(prev => ({ ...prev, [idx]: val }));
  };
  const updateSofiaPrecoUnitario = (idx: number, val: string) => {
    setSofiaPrecoUnitario(prev => ({ ...prev, [idx]: val }));
  };

  const lineTotalCheckout = (idx: number, item: CartItem) => {
    if (sofiaItems[idx]) {
      const pu = parseMoney(sofiaPrecoUnitario[idx] ?? "");
      if (!Number.isFinite(pu)) return item.totalItem;
      return roundMoney(pu * item.quantidade);
    }
    return roundMoney(item.totalItem);
  };
  const hasSofiaItems = Object.values(sofiaItems).some(v => v);
  const sofiaCount = Object.values(sofiaItems).filter(v => v).length;

  // Imagem obrigatória para pedidos com item Sofia
  const [sofiaImageBase64, setSofiaImageBase64] = useState<string | null>(null);
  const [sofiaImageMimeType, setSofiaImageMimeType] = useState<string>("image/jpeg");
  const [sofiaImagePreview, setSofiaImagePreview] = useState<string | null>(null);
  const [uploadingSofiaImage, setUploadingSofiaImage] = useState(false);

  function handleSofiaImageSelect(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64 = result.split(",")[1];
      setSofiaImageBase64(base64);
      setSofiaImageMimeType(file.type);
      setSofiaImagePreview(result);
    };
    reader.readAsDataURL(file);
  }

  function removeSofiaImage() {
    setSofiaImageBase64(null);
    setSofiaImagePreview(null);
  }

  const uploadFotoCheckoutMutation = trpc.pdvSofia.uploadFoto.useMutation({
    onSuccess: () => { setUploadingSofiaImage(false); },
    onError: () => {
      toast.error("Erro ao salvar imagem Sofia — pedido criado, adicione a foto manualmente no painel Sofia");
      setUploadingSofiaImage(false);
    },
  });

  const totalServicos = useMemo(() => services.reduce((sum, s) => sum + s.valor, 0), [services]);
  const subtotalProdutos = useMemo(
    () => cart.reduce((sum, item, idx) => sum + lineTotalCheckout(idx, item), 0),
    [cart, sofiaItems, sofiaPrecoUnitario]
  );
  const totalGeral = subtotalProdutos + totalServicos;
  const totalPago = useMemo(() => payments.reduce((sum, p) => sum + p.valor, 0), [payments]);
  /** Positivo = falta pagamento para fechar o total; negativo = pago a mais que o total. */
  const diffPagamentoVenda = roundMoney(totalGeral - totalPago);
  // Pendente: usa valor manual se checkbox ativo, senão calcula automaticamente
  const totalPendente = isPendente
    ? (parseFloat(valorPendenteManual.replace(',', '.')) || Math.max(0, totalGeral - totalPago))
    : Math.max(0, totalGeral - totalPago);
  const statusPedido = isPendente || totalPendente > 0 ? 'PENDENTE' : 'PAGO';

  // Preview of taxa/maquininha while user types in the add-payment form
  const previewVal = parseFloat(newPaymentValor.replace(",", "."));
  const previewMethod = PAYMENT_METHODS.find(m => m.key === newPaymentMethod)!;
  const previewTaxa = !isNaN(previewVal) && previewMethod.taxa > 0
    ? (previewVal * previewMethod.taxa) / 100
    : 0;
  const previewMaquininha = !isNaN(previewVal) ? previewVal + previewTaxa : 0;

  const createOrderMutation = trpc.pdvOrders.create.useMutation({
    onSuccess: (data) => {
      void utils.pdvDashboard.summary.invalidate();
      void utils.pdvDashboard.getMyProgress.invalidate();
      void utils.pdvDashboard.getMyHistory.invalidate();
      void utils.pdvDashboard.sellerPanel.invalidate();
      void utils.pdvComissoes.ranking.invalidate();
      void utils.pdvOrders.list.invalidate();
      // Se há imagem Sofia, fazer upload após criar o pedido
      if (hasSofiaItems && sofiaImageBase64 && data?.pedidoId) {
        setUploadingSofiaImage(true);
        uploadFotoCheckoutMutation.mutate({
          pedidoId: data.pedidoId,
          base64: sofiaImageBase64,
          mimeType: sofiaImageMimeType,
        });
      }
      onSuccess();
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao finalizar pedido");
    },
  });

  const buildWhatsAppMessage = (pedidoId: string): string => {
    const lines = [
      `*JUREMA SPORT - PEDIDO ${pedidoId}*`,
      ``,
      `*Vendedor:* ${seller?.name}`,
      `*Canal:* ${canal}`,
      `*Regime:* ${regime}`,
      clienteNome ? `*Cliente:* ${clienteNome}` : "",
      ``,
      `*ITENS:*`,
      ...cart.map((item, idx) =>
        `${item.quantidade}x ${item.time} (${item.tamanho}) - R$ ${fmt(lineTotalCheckout(idx, item))}`
      ),
      ``,
      `*SUBTOTAL:* R$ ${fmt(subtotalProdutos)}`,
    ];

    if (services.length > 0) {
      lines.push(``, `*SERVIÇOS:*`);
      services.forEach(s => {
        lines.push(`${s.tipo}${s.descricao ? ` (${s.descricao})` : ""}${s.cep ? ` - CEP: ${s.cep}` : ""}: R$ ${fmt(s.valor)}`);
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
    // Regra: Correio mínimo R$ 45
    if (newServiceTipo === "CORREIO" && valor < 45) {
      toast.error("O valor mínimo para Correio é R$ 45,00");
      return;
    }
    // Regra: Correio requer CEP válido (verificado nos Correios via ViaCEP)
    if (newServiceTipo === "CORREIO") {
      const cepLimpo = newServiceCep.replace(/\D/g, '');
      if (cepLimpo.length !== 8) {
        toast.error("CEP obrigatório para Correio (8 dígitos)");
        return;
      }
      if (cepLookup.status === "loading") {
        toast.error("Aguarde a validação do CEP…");
        return;
      }
      if (cepLookup.status !== "valid") {
        toast.error(cepLookup.errorMessage || "CEP inválido — confira o número");
        return;
      }
    }
    const cepFormatado = newServiceTipo === "CORREIO"
      ? (cepLookup.cepFormatado || newServiceCep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2'))
      : undefined;
    setServices(prev => [...prev, { tipo: newServiceTipo, descricao: newServiceDescricao || undefined, valor, cep: cepFormatado }]);
    setNewServiceValor("");
    setNewServiceDescricao("");
    setNewServiceCep("");
    setShowAddService(false);
  };

  const addPayment = () => {
    const valor = parseFloat(newPaymentValor.replace(",", "."));
    if (isNaN(valor) || valor <= 0) { toast.error("Valor inválido"); return; }
    const method = PAYMENT_METHODS.find(m => m.key === newPaymentMethod)!;
    const taxa = (valor * method.taxa) / 100;
    const valorLiquido = valor - taxa;
    const valorMaquininha = valor + taxa; // valor que passa na maquininha
    // Cada linha em payments é gravada tal qual digitada — sem rateio 50/50 nem redistribuição
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

  const totalPecas = cart.reduce((sum, item) => sum + item.quantidade, 0);

  // Regra: atacado com menos de 6 peças requer justificativa
  const isAtacadoMenos6 = regime === "ATACADO" && totalPecas < 6;
  // Pedido apenas com serviços (sem produtos no carrinho)
  const isSomenteServico = cart.length === 0;

  const handleFinalize = () => {
    // Se carrinho vazio, precisa ter pelo menos 1 serviço
    if (isSomenteServico && services.length === 0) {
      toast.error("Adicione pelo menos um serviço (Caixinha, Carreto ou Correio)");
      return;
    }
    // Nome do cliente obrigatório
    if (!clienteNome.trim()) {
      toast.error("Nome do cliente é obrigatório");
      return;
    }
    if (payments.length === 0 && totalGeral > 0) {
      toast.error("Adicione pelo menos uma forma de pagamento");
      return;
    }
    if (isPendente && !justificativa.trim()) {
      toast.error("Informe a justificativa para o valor pendente");
      return;
    }
    // Atacado com menos de 6 peças: justificativa obrigatória
    if (isAtacadoMenos6 && !justificativa.trim()) {
      toast.error("Atacado com menos de 6 peças: informe a justificativa no campo Observações");
      return;
    }
    // Imagem obrigatória para pedidos com item Sofia
    if (hasSofiaItems && !sofiaImageBase64) {
      toast.error("Pedido com item Sofia requer foto obrigatória. Anexe a imagem antes de finalizar.");
      return;
    }
    for (let idx = 0; idx < cart.length; idx++) {
      if (!sofiaItems[idx]) continue;
      const pu = parseMoney(sofiaPrecoUnitario[idx] ?? "");
      if (!Number.isFinite(pu) || pu < 0) {
        toast.error(`Informe o preço por peça (R$) válido no item Sofia: ${cart[idx].time}`);
        return;
      }
    }
    // Sem "Pendente" marcado: não permitir fechar com valor a menos do total (evita Bug 1 / pagamentos mirando total errado)
    if (!isPendente && totalGeral > 0 && diffPagamentoVenda > 0.02) {
      toast.error(
        `Falta R$ ${fmt(diffPagamentoVenda)} para fechar o total (R$ ${fmt(totalGeral)}). ` +
        `Adicione outra forma de pagamento ou ative Valor Pendente.`
      );
      return;
    }
    createOrderMutation.mutate({
      canal,
      clienteNome: clienteNome.trim() as string,
      clienteTelefone: clienteTelefone || undefined,
      regime,
      totalVarejo,
      totalAtacado,
      // totalAplicado = subtotal dos produtos + serviços extras (valor real da venda sem taxa de cartão)
      totalAplicado: totalGeral,
      totalPago,
      totalPendente,
      justificativa: justificativa || undefined,
      status: statusPedido,
      items: cart.map((item, idx) => {
        const isSof = !!sofiaItems[idx];
        const precoUnitario = isSof
          ? roundMoney(parseMoney(sofiaPrecoUnitario[idx] ?? "") || 0)
          : roundMoney(item.precoUnitario);
        const totalItem = roundMoney(precoUnitario * item.quantidade);
        return {
          productId: item.productId,
          linha: item.linha,
          modelo: item.modelo,
          time: item.time,
          descricao: item.descricao,
          tipo: item.tipo,
          tamanho: item.tamanho,
          quantidade: item.quantidade,
          precoUnitario,
          totalItem,
          isSofia: isSof,
          comissaoLojaSofia: isSof ? parseFloat((sofiaComissao[idx] || "0").replace(",", ".")) || 0 : undefined,
        };
      }),
      payments,
      services,
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">Voltar</span>
        </button>
        <div>
          <h1 className="text-white font-bold">{isSomenteServico ? "Lançar Serviço" : "Finalizar Venda"}</h1>
          <p className="text-gray-400 text-xs">
            {isSomenteServico ? "Apenas serviços" : `${totalPecas} peças`} · {regime} · {canal}
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
              onClick={() => !isSomenteServico && setShowItems(!showItems)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-800/50 transition-colors"
            >
              <div>
                <h3 className="text-white font-semibold">Resumo do Pedido</h3>
                <p className="text-gray-400 text-sm">
                  {isSomenteServico
                    ? <span className="text-orange-400 text-xs">Nenhum produto — apenas serviços serão lançados</span>
                    : `${totalPecas} peças · R$ ${fmt(subtotalProdutos)}`
                  }
                </p>
              </div>
              {!isSomenteServico && (showItems ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />)}
            </button>
            {showItems && (
              <div className="border-t border-gray-800 p-4 space-y-2">
                {cart.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-gray-300 truncate">{item.quantidade}x {item.time} ({item.tamanho})</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleSofiaItem(i)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-all border ${
                          sofiaItems[i]
                            ? "bg-purple-600 border-purple-500 text-white"
                            : "bg-gray-800 border-gray-700 text-gray-500 hover:border-purple-700 hover:text-purple-400"
                        }`}
                        title="Marcar como produto Sofia (terceirizado)"
                      >
                        Sofia
                      </button>
                      {sofiaItems[i] && (
                        <>
                          <div className="flex items-center gap-0.5">
                            <span className="text-purple-400 text-[10px] whitespace-nowrap">R$/pç</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sofiaPrecoUnitario[i] ?? ""}
                              onChange={e => updateSofiaPrecoUnitario(i, e.target.value)}
                              className="w-[3.25rem] text-[11px] px-1 py-0.5 rounded bg-purple-950/50 border border-purple-800 text-purple-200 text-center focus:outline-none focus:border-purple-500"
                              title="Preço unitário negociado na venda (Sofia — não só catálogo)"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-purple-400 text-[10px]">Bôn.</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sofiaComissao[i] || ""}
                              onChange={e => updateSofiaComissao(i, e.target.value)}
                              placeholder="10"
                              className="w-14 text-[11px] px-1.5 py-0.5 rounded bg-purple-950/50 border border-purple-800 text-purple-200 text-center placeholder-purple-600 focus:outline-none focus:border-purple-500"
                              title="Bônus da loja por peça (R$)"
                            />
                          </div>
                        </>
                      )}
                      <span className="text-white font-medium">R$ {fmt(lineTotalCheckout(i, item))}</span>
                    </div>
                  </div>
                ))}
                <div className="border-t border-gray-700 pt-2 flex justify-between font-semibold">
                  <span className="text-gray-300">Subtotal</span>
                  <span className="text-white">R$ {fmt(subtotalProdutos)}</span>
                </div>
                {hasSofiaItems && (
                  <div className="bg-purple-950/30 border border-purple-900/50 rounded-xl p-3 mt-2 space-y-1">
                    <p className="text-purple-300 text-xs font-semibold">
                      {sofiaCount} {sofiaCount === 1 ? 'item marcado' : 'itens marcados'} como Sofia (terceirizado)
                    </p>
                    <p className="text-purple-400/70 text-[10px]">
                      Ajuste R$/peça ao preço negociado (Sofia). Informe o bônus da loja ao lado. Esses itens não entram no bônus do vendedor.
                    </p>
                    {cart.map((item, i) => sofiaItems[i] ? (
                      <div key={i} className="flex items-center justify-between text-[11px] text-purple-300">
                        <span className="truncate">{item.time} ({item.tamanho}) x{item.quantidade}</span>
                        <span>Bôn: R$ {(parseFloat((sofiaComissao[i] || "0").replace(",", ".")) || 0).toFixed(2)}/pç → Reemb: R$ {Math.max(0, lineTotalCheckout(i, item) - ((parseFloat((sofiaComissao[i] || "0").replace(",", ".")) || 0) * item.quantidade)).toFixed(2)}</span>
                      </div>
                    ) : null)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Imagem Sofia — obrigatória quando há item Sofia */}
          {hasSofiaItems && (
            <div className={`rounded-2xl p-4 border transition-all ${
              !sofiaImageBase64
                ? "bg-purple-950/30 border-purple-600/70 ring-1 ring-purple-600/30"
                : "bg-gray-900 border-purple-800/40"
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <Camera className="w-4 h-4 text-purple-400" />
                <h3 className="text-white font-semibold">Foto do Item Sofia</h3>
                <span className="text-red-400 text-xs font-semibold">* obrigatória</span>
              </div>

              {!sofiaImageBase64 ? (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-purple-700 rounded-xl cursor-pointer hover:border-purple-500 hover:bg-purple-950/20 transition-all group">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSofiaImageSelect(f); }}
                  />
                  <ImagePlus className="w-8 h-8 text-purple-500 group-hover:text-purple-400 mb-2" />
                  <span className="text-purple-400 text-sm font-medium">Clique para anexar foto</span>
                  <span className="text-purple-600 text-xs mt-0.5">JPG, PNG ou WEBP · máx. 5MB</span>
                </label>
              ) : (
                <div className="relative">
                  <img
                    src={sofiaImagePreview!}
                    alt="Foto Sofia"
                    className="w-full max-h-48 object-contain rounded-xl border border-purple-800/50 bg-gray-950"
                  />
                  <button
                    onClick={removeSofiaImage}
                    className="absolute top-2 right-2 bg-gray-900/80 hover:bg-red-900/80 text-gray-400 hover:text-red-400 rounded-full p-1.5 transition-colors"
                    title="Remover imagem"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 text-xs font-medium">Foto anexada — pronta para envio</span>
                  </div>
                </div>
              )}

              {!sofiaImageBase64 && (
                <div className="flex items-start gap-2 mt-3 bg-purple-950/40 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                  <p className="text-purple-300 text-xs">
                    Este pedido contém <strong>{sofiaCount} item{sofiaCount > 1 ? 'ns' : ''} Sofia</strong>. A foto é obrigatória para registrar o pedido.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Canal do Pedido */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h3 className="text-white font-semibold mb-3">Canal de Venda</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setCanal("BALCAO")}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
                  canal === "BALCAO"
                    ? "bg-green-700 border-green-700 text-white shadow-lg shadow-green-700/20"
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
            {canal === "WHATSAPP" && (
              <p className="text-gray-500 text-xs mt-2">Canal indicativo: a venda será registrada como originada pelo WhatsApp.</p>
            )}
          </div>

          {/* Dados do Cliente */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <span>Dados do Cliente</span>
              <span className="text-xs text-red-400 font-normal">* obrigatório</span>
            </h3>
            <div className="grid grid-cols-1 gap-3 md:gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nome <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  placeholder="Nome do cliente (obrigatório)"
                  className={`w-full bg-gray-800 border rounded-xl px-4 py-3 md:py-3.5 text-white text-sm md:text-base placeholder-gray-500 focus:outline-none transition-colors ${
                    !clienteNome.trim() ? "border-red-700 focus:border-red-500" : "border-gray-700 focus:border-green-600"
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Telefone / WhatsApp</label>
                <input
                  type="tel"
                  value={clienteTelefone}
                  onChange={(e) => setClienteTelefone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 md:py-3.5 text-white text-sm md:text-base placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Serviços Extras</h3>
              <button
                onClick={() => setShowAddService(!showAddService)}
                className="text-green-500 hover:text-green-400 text-sm md:text-base flex items-center gap-1 transition-colors active:text-green-600 p-2 -m-2 rounded-lg"
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
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 md:py-3.5 text-white text-sm md:text-base focus:outline-none focus:border-green-600"
                  >
                    {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="text"
                    value={newServiceValor}
                    onChange={(e) => setNewServiceValor(e.target.value)}
                    placeholder="Valor"
                    className="w-32 md:w-40 bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 md:py-3.5 text-white text-sm md:text-base focus:outline-none focus:border-green-600"
                  />
                </div>
                <input
                  type="text"
                  value={newServiceDescricao}
                  onChange={(e) => setNewServiceDescricao(e.target.value)}
                  placeholder={
                    newServiceTipo === "CARRETO"
                      ? "Trecho ou observação (ex: Cantagalo, urgente, taxa extra...)"
                      : newServiceTipo === "CAIXINHA"
                        ? "Observação (opcional)"
                        : newServiceTipo === "OUTRO"
                          ? "Descrição do serviço *"
                          : "Observação (opcional)"
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 md:py-3.5 text-white text-sm md:text-base focus:outline-none focus:border-green-600"
                />
                {newServiceTipo === "CORREIO" && (() => {
                  const cepDigits = newServiceCep.replace(/\D/g, "");
                  const showStatus = cepDigits.length === 8;
                  const status = cepLookup.status;
                  // Cor da borda em função do status (foco mantém o tom mais vivo).
                  const borderClass =
                    showStatus && status === "valid"
                      ? "border-green-500 focus:border-green-400"
                      : showStatus && status === "invalid"
                        ? "border-red-500 focus:border-red-400"
                        : "border-orange-500 focus:border-orange-400";
                  return (
                    <div>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={newServiceCep}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                            setNewServiceCep(v.length > 5 ? v.replace(/(\d{5})(\d+)/, '$1-$2') : v);
                          }}
                          placeholder="CEP do destinatário *"
                          maxLength={9}
                          aria-invalid={showStatus && status === "invalid"}
                          className={`w-full bg-gray-700 ${borderClass} rounded-lg px-3 pr-10 py-3 md:py-3.5 text-white text-sm md:text-base focus:outline-none placeholder-orange-300/60`}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          {status === "loading" && <Loader2 className="w-5 h-5 text-orange-300 animate-spin" />}
                          {showStatus && status === "valid" && <CheckCircle className="w-5 h-5 text-green-400" />}
                          {showStatus && status === "invalid" && <XCircle className="w-5 h-5 text-red-400" />}
                        </div>
                      </div>
                      {showStatus && status === "valid" && cepLookup.enderecoResumo && (
                        <p className="text-green-400 text-xs mt-1 flex items-start gap-1">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span className="break-words">{cepLookup.enderecoResumo}</span>
                        </p>
                      )}
                      {showStatus && status === "invalid" && (
                        <p className="text-red-400 text-xs mt-1">
                          {cepLookup.errorMessage || "CEP inválido — confira o número"}
                        </p>
                      )}
                      {!showStatus && (
                        <p className="text-orange-400 text-xs mt-1">CEP obrigatório para envio pelos Correios</p>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const cepDigits = newServiceCep.replace(/\D/g, "");
                  const blockingCep =
                    newServiceTipo === "CORREIO" &&
                    (cepDigits.length !== 8 || cepLookup.status === "loading" || cepLookup.status === "invalid");
                  return (
                    <div className="flex gap-2">
                      <button
                        onClick={addService}
                        disabled={blockingCep}
                        className="flex-1 bg-green-700 hover:bg-green-800 active:bg-green-900 text-white text-sm md:text-base py-3 md:py-3.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-700"
                      >
                        {newServiceTipo === "CORREIO" && cepLookup.status === "loading" ? "Validando CEP…" : "Adicionar"}
                      </button>
                      <button onClick={() => setShowAddService(false)} className="px-4 md:px-6 text-gray-400 hover:text-white text-sm md:text-base py-3 md:py-3.5 rounded-lg transition-colors">Cancelar</button>
                    </div>
                  );
                })()}
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
                      {service.cep && <span className="text-orange-400 text-xs ml-2">CEP: {service.cep}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white text-sm font-semibold">R$ {fmt(service.valor)}</span>
                      <button onClick={() => setServices(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-green-500 transition-colors">
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
                className="text-green-500 hover:text-green-400 text-sm flex items-center gap-1 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>

            {showAddPayment && (
              <div className="bg-gray-800 rounded-xl p-3 mb-3 space-y-3">
                {/* Dica de referência: total geral */}
                <div className="bg-gray-900/60 rounded-lg px-3 py-2 flex justify-between items-center border border-gray-700">
                  <span className="text-xs text-gray-400">Total a pagar</span>
                  <span className="text-white font-bold text-sm">R$ {fmt(totalGeral)}</span>
                </div>

                {/* Method selector */}
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method.key}
                      onClick={() => setNewPaymentMethod(method.key)}
                      className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                        newPaymentMethod === method.key
                          ? "bg-green-700 text-white"
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
                    {previewMethod.taxa > 0
                      ? `Valor recebido pela loja (sem taxa ${previewMethod.label} ${previewMethod.taxa}%)`
                      : "Valor"}
                  </label>
                  <input
                    type="text"
                    value={newPaymentValor}
                    onChange={(e) => setNewPaymentValor(e.target.value)}
                    placeholder={fmt(totalGeral - payments.reduce((s,p)=>s+p.valor,0))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600"
                  />
                </div>

                {/* PIX name */}
                {newPaymentMethod === "PIX" && (
                  <input
                    type="text"
                    value={newPaymentNomePix}
                    onChange={(e) => setNewPaymentNomePix(e.target.value)}
                    placeholder="Nome do PIX (opcional)"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-600"
                  />
                )}

                {/* Taxa preview — sempre visível para débito/crédito */}
                {previewMethod.taxa > 0 && (
                  <div className="bg-gray-900 rounded-xl p-3 space-y-1.5 border border-yellow-900/40">
                    {!isNaN(previewVal) && previewVal > 0 ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Loja recebe (você digitou)</span>
                          <span className="text-white font-semibold">R$ {fmt(previewVal)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Taxa {previewMethod.label} ({previewMethod.taxa}%)</span>
                          <span className="text-orange-400">+ R$ {fmt(previewTaxa)}</span>
                        </div>
                        <div className="border-t border-gray-700 pt-1.5 flex justify-between text-sm font-bold">
                          <span className="text-yellow-400">Passar na maquininha</span>
                          <span className="text-yellow-300 text-base">R$ {fmt(previewMaquininha)}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-yellow-600">
                        {previewMethod.label} tem taxa de {previewMethod.taxa}%. Digite o valor que a loja recebe — o sistema calcula o valor da maquininha automaticamente.
                      </p>
                    )}
                    <p className="text-[10px] text-gray-500">
                      Você pode editar o valor da maquininha após adicionar.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={addPayment} className="flex-1 bg-green-700 hover:bg-green-800 text-white text-sm py-2 rounded-lg font-medium transition-colors">Adicionar</button>
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
                            className="text-gray-600 hover:text-green-500 transition-colors"
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
                {totalGeral > 0 && payments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700 space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Soma das formas (loja recebe)</span>
                      <span className="text-white tabular-nums">R$ {fmt(totalPago)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-gray-200">
                      <span>Total da venda</span>
                      <span className="text-white tabular-nums">R$ {fmt(totalGeral)}</span>
                    </div>
                    {Math.abs(diffPagamentoVenda) > 0.02 && (
                      <p className={`text-xs font-medium ${diffPagamentoVenda > 0.02 ? "text-orange-400" : "text-yellow-400"}`}>
                        {diffPagamentoVenda > 0.02
                          ? `Falta R$ ${fmt(diffPagamentoVenda)} — inclui itens Sofia e serviços no total acima.`
                          : `Acima do total em R$ ${fmt(Math.abs(diffPagamentoVenda))} (confira troco / valores).`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pendente */}
          <div className={`border rounded-2xl p-4 transition-all ${
            isPendente
              ? 'bg-yellow-950/30 border-yellow-800/60'
              : 'bg-gray-900 border-gray-800'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-white font-semibold">Valor Pendente</h3>
                <p className="text-gray-400 text-xs mt-0.5">Marque se parte do pagamento ficou pendente</p>
              </div>
              <button
                onClick={() => { setIsPendente(!isPendente); if (isPendente) setValorPendenteManual(''); }}
                className={`relative w-12 h-6 rounded-full transition-all ${
                  isPendente ? 'bg-yellow-600' : 'bg-gray-700'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                  isPendente ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>

            {isPendente && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-yellow-400 mb-1">Valor pendente (R$) <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={valorPendenteManual}
                    onChange={(e) => setValorPendenteManual(e.target.value)}
                    placeholder={`Sugerido: ${fmt(Math.max(0, totalGeral - totalPago))}`}
                    className="w-full bg-gray-800 border border-yellow-800 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-600 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-yellow-400 mb-1">Justificativa <span className="text-red-400">*</span></label>
                  <textarea
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    placeholder="Ex: cliente vai pagar amanha, faltou R$20..."
                    rows={2}
                    className="w-full bg-gray-800 border border-yellow-800 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-600 resize-none transition-colors"
                  />
                </div>
                <div className="bg-yellow-900/30 border border-yellow-800/50 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                    <span className="text-yellow-300 text-xs font-semibold">Modalidade: PENDENTE</span>
                  </div>
                  <p className="text-yellow-400/70 text-xs mt-1">
                    Este pedido será registrado como pendente e aparecerá no relatório de pendências.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Aviso: Atacado com menos de 6 peças */}
          {isAtacadoMenos6 && (
            <div className="bg-orange-950/40 border border-orange-700/60 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-orange-400 text-lg mt-0.5">⚠️</span>
                <div>
                  <p className="text-orange-300 font-semibold text-sm">Atacado com menos de 6 peças</p>
                  <p className="text-orange-400/80 text-xs mt-1">
                    Esta modalidade só é permitida no Varejo. A venda pode ser realizada, mas é obrigatório informar a justificativa no campo Observações abaixo.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Observações (apenas quando não está pendente) */}
          {!isPendente && (
          <div className={`rounded-2xl p-4 border transition-all ${
            isAtacadoMenos6
              ? "bg-orange-950/20 border-orange-700/50"
              : "bg-gray-900 border-gray-800"
          }`}>
            <h3 className="text-white font-semibold mb-2">
              Observações
              {isAtacadoMenos6 && <span className="text-red-400 ml-1">*</span>}
            </h3>
            {isAtacadoMenos6 && (
              <p className="text-orange-400 text-xs mb-2">Justificativa obrigatória para atacado com menos de 6 peças</p>
            )}
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder={isAtacadoMenos6 ? "Informe o motivo da venda no atacado com menos de 6 peças..." : "Observações do pedido (opcional)"}
              rows={2}
              className={`w-full bg-gray-800 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none resize-none transition-colors border ${
                isAtacadoMenos6 && !justificativa.trim()
                  ? "border-orange-700 focus:border-orange-500"
                  : "border-gray-700 focus:border-green-600"
              }`}
            />
          </div>
          )}

          {/* Total Summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Subtotal ({regime})</span>
              <span className="text-white">R$ {fmt(subtotalProdutos)}</span>
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
          className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-colors text-lg shadow-lg shadow-green-700/20"
        >
          {createOrderMutation.isPending ? (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <><CheckCircle className="w-5 h-5" />Finalizar Venda</>
          )}
        </button>
      </div>
    </div>
  );
}
