import { useState } from "react";
import { useLocation } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShoppingCart, CreditCard, QrCode, FileText, ChevronRight, Lock, Truck } from "lucide-react";
import { Link } from "wouter";

type PaymentMethod = 'pix' | 'credit_card' | 'boleto';

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<'address' | 'payment' | 'review'>('address');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    addressZip: '',
    addressStreet: '',
    addressNumber: '',
    addressComplement: '',
    addressNeighborhood: '',
    addressCity: '',
    addressState: '',
  });

  const createOrder = trpc.orders.create.useMutation();
  const createPayment = trpc.payment.createPreference.useMutation();

  const shippingCost = subtotal >= 200 ? 0 : 19.90;
  const total = subtotal + shippingCost;

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const fetchCep = async (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          addressStreet: data.logradouro || prev.addressStreet,
          addressNeighborhood: data.bairro || prev.addressNeighborhood,
          addressCity: data.localidade || prev.addressCity,
          addressState: data.uf || prev.addressState,
        }));
      }
    } catch {}
  };

  const validateAddress = () => {
    if (!form.customerName.trim()) { toast.error("Nome é obrigatório"); return false; }
    if (!form.customerEmail.trim() || !form.customerEmail.includes('@')) { toast.error("Email inválido"); return false; }
    if (!form.addressZip.trim()) { toast.error("CEP é obrigatório"); return false; }
    if (!form.addressStreet.trim()) { toast.error("Endereço é obrigatório"); return false; }
    if (!form.addressCity.trim()) { toast.error("Cidade é obrigatória"); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (items.length === 0) { toast.error("Carrinho vazio"); return; }
    setIsSubmitting(true);
    try {
      const order = await createOrder.mutateAsync({
        ...form,
        paymentMethod,
        subtotal: subtotal.toFixed(2),
        shippingCost: shippingCost.toFixed(2),
        total: total.toFixed(2),
        items: items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          productImage: item.productImage,
          size: item.size,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          total: (item.unitPrice * item.quantity).toFixed(2),
        })),
      });

      // Create payment preference
      try {
        const payment = await createPayment.mutateAsync({
          orderId: order.orderId,
          items: items.map(item => ({
            title: `${item.productName} - ${item.size}`,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          })),
          payer: { name: form.customerName, email: form.customerEmail },
          paymentMethod,
        });

        clearCart();
        navigate(`/pedido/confirmacao?numero=${order.orderNumber}&pagamento=${payment.init_point || ''}`);
      } catch {
        clearCart();
        navigate(`/pedido/confirmacao?numero=${order.orderNumber}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao finalizar pedido. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] pt-20 flex items-center justify-center">
        <div className="text-center">
          <ShoppingCart size={48} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400 text-xl mb-4">Seu carrinho está vazio</p>
          <Link href="/produtos">
            <Button className="bg-[#C8102E] hover:bg-red-700 text-white">Ver Produtos</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] pt-20">
      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-0.5 bg-[#C8102E]" />
            <span className="text-[#C8102E] text-xs font-bold uppercase tracking-[0.3em]">Finalizar Compra</span>
          </div>
          <h1 className="font-['Bebas_Neue'] text-4xl text-white tracking-wider">CHECKOUT</h1>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-2 mb-8">
          {[
            { key: 'address', label: 'Endereço' },
            { key: 'payment', label: 'Pagamento' },
            { key: 'review', label: 'Revisão' },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                step === s.key ? 'bg-[#C8102E] text-white' :
                ['address','payment','review'].indexOf(step) > i ? 'bg-green-600 text-white' :
                'bg-[#1A1A1A] text-gray-500'
              }`}>
                <span>{i + 1}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < 2 && <ChevronRight size={14} className="text-gray-700" />}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            {/* Address step */}
            {step === 'address' && (
              <div className="bg-[#111111] rounded-xl p-6 border border-[#1E1E1E]">
                <h2 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider mb-5 flex items-center gap-2">
                  <Truck size={20} className="text-[#C8102E]" /> DADOS DE ENTREGA
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label className="text-gray-400 text-xs mb-1">Nome completo *</Label>
                    <Input name="customerName" value={form.customerName} onChange={handleFormChange}
                      placeholder="Seu nome completo"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs mb-1">E-mail *</Label>
                    <Input name="customerEmail" value={form.customerEmail} onChange={handleFormChange}
                      type="email" placeholder="seu@email.com"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs mb-1">Telefone / WhatsApp</Label>
                    <Input name="customerPhone" value={form.customerPhone} onChange={handleFormChange}
                      placeholder="(00) 00000-0000"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs mb-1">CEP *</Label>
                    <Input name="addressZip" value={form.addressZip} onChange={handleFormChange}
                      onBlur={e => fetchCep(e.target.value)}
                      placeholder="00000-000"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs mb-1">Estado</Label>
                    <Input name="addressState" value={form.addressState} onChange={handleFormChange}
                      placeholder="SP"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-gray-400 text-xs mb-1">Endereço *</Label>
                    <Input name="addressStreet" value={form.addressStreet} onChange={handleFormChange}
                      placeholder="Rua, Avenida..."
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs mb-1">Número</Label>
                    <Input name="addressNumber" value={form.addressNumber} onChange={handleFormChange}
                      placeholder="123"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs mb-1">Complemento</Label>
                    <Input name="addressComplement" value={form.addressComplement} onChange={handleFormChange}
                      placeholder="Apto, Bloco..."
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs mb-1">Bairro</Label>
                    <Input name="addressNeighborhood" value={form.addressNeighborhood} onChange={handleFormChange}
                      placeholder="Bairro"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs mb-1">Cidade *</Label>
                    <Input name="addressCity" value={form.addressCity} onChange={handleFormChange}
                      placeholder="Cidade"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600" />
                  </div>
                </div>
                <Button
                  onClick={() => { if (validateAddress()) setStep('payment'); }}
                  className="w-full mt-6 bg-[#C8102E] hover:bg-red-700 text-white font-bold py-3"
                >
                  Continuar para Pagamento
                </Button>
              </div>
            )}

            {/* Payment step */}
            {step === 'payment' && (
              <div className="bg-[#111111] rounded-xl p-6 border border-[#1E1E1E]">
                <h2 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider mb-5 flex items-center gap-2">
                  <CreditCard size={20} className="text-[#C8102E]" /> FORMA DE PAGAMENTO
                </h2>
                <div className="space-y-3">
                  {[
                    { value: 'pix' as const, label: 'PIX', desc: 'Aprovação imediata · 5% de desconto', icon: QrCode },
                    { value: 'credit_card' as const, label: 'Cartão de Crédito', desc: 'Em até 12x sem juros', icon: CreditCard },
                    { value: 'boleto' as const, label: 'Boleto Bancário', desc: 'Vencimento em 3 dias úteis', icon: FileText },
                  ].map(({ value, label, desc, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setPaymentMethod(value)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                        paymentMethod === value
                          ? 'border-[#C8102E] bg-[#C8102E]/10'
                          : 'border-[#1E1E1E] hover:border-[#333] bg-[#1A1A1A]'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        paymentMethod === value ? 'bg-[#C8102E]' : 'bg-[#2A2A2A]'
                      }`}>
                        <Icon size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{label}</p>
                        <p className="text-gray-500 text-xs">{desc}</p>
                      </div>
                      {paymentMethod === value && (
                        <div className="ml-auto w-5 h-5 rounded-full bg-[#C8102E] flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 mt-6">
                  <Button variant="outline" onClick={() => setStep('address')}
                    className="border-[#333] text-gray-400 hover:text-white bg-transparent">
                    Voltar
                  </Button>
                  <Button onClick={() => setStep('review')}
                    className="flex-1 bg-[#C8102E] hover:bg-red-700 text-white font-bold py-3">
                    Revisar Pedido
                  </Button>
                </div>
              </div>
            )}

            {/* Review step */}
            {step === 'review' && (
              <div className="bg-[#111111] rounded-xl p-6 border border-[#1E1E1E]">
                <h2 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider mb-5">REVISÃO DO PEDIDO</h2>
                <div className="space-y-3 mb-5">
                  {items.map(item => (
                    <div key={`${item.productId}-${item.size}`} className="flex gap-3 bg-[#1A1A1A] rounded-lg p-3">
                      <img src={item.productImage || `https://placehold.co/60x60/1A1A1A/C8102E?text=${item.productName[0]}`}
                        alt={item.productName} className="w-14 h-14 object-cover rounded-md" />
                      <div className="flex-1">
                        <p className="text-white text-sm font-semibold">{item.productName}</p>
                        <p className="text-gray-500 text-xs">Tam: {item.size} · Qtd: {item.quantity}</p>
                        <p className="text-white font-bold text-sm">R$ {(item.unitPrice * item.quantity).toFixed(2).replace('.', ',')}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-[#1A1A1A] rounded-lg p-4 mb-5 text-sm space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span>Endereço:</span>
                    <span className="text-white text-right max-w-[60%]">{form.addressStreet}, {form.addressNumber} - {form.addressCity}/{form.addressState}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Pagamento:</span>
                    <span className="text-white capitalize">{paymentMethod === 'credit_card' ? 'Cartão de Crédito' : paymentMethod === 'pix' ? 'PIX' : 'Boleto'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-5">
                  <Lock size={12} className="text-[#C8102E]" />
                  <span>Pagamento processado com segurança via Mercado Pago</span>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep('payment')}
                    className="border-[#333] text-gray-400 hover:text-white bg-transparent">
                    Voltar
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1 bg-[#C8102E] hover:bg-red-700 text-white font-bold py-3"
                  >
                    {isSubmitting ? 'Processando...' : 'Confirmar Pedido'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Order summary */}
          <div className="lg:col-span-1">
            <div className="bg-[#111111] rounded-xl p-5 border border-[#1E1E1E] sticky top-24">
              <h3 className="font-['Bebas_Neue'] text-xl text-white tracking-wider mb-4">RESUMO DO PEDIDO</h3>
              <div className="space-y-2 mb-4">
                {items.map(item => (
                  <div key={`${item.productId}-${item.size}`} className="flex justify-between text-sm">
                    <span className="text-gray-400 line-clamp-1 flex-1 mr-2">
                      {item.productName} ({item.size}) x{item.quantity}
                    </span>
                    <span className="text-white font-semibold flex-shrink-0">
                      R$ {(item.unitPrice * item.quantity).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#1E1E1E] pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="text-white">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Frete</span>
                  <span className={shippingCost === 0 ? 'text-green-400 font-semibold' : 'text-white'}>
                    {shippingCost === 0 ? 'GRÁTIS' : `R$ ${shippingCost.toFixed(2).replace('.', ',')}`}
                  </span>
                </div>
                {shippingCost > 0 && (
                  <p className="text-gray-600 text-xs">Frete grátis em compras acima de R$ 200,00</p>
                )}
              </div>
              <div className="border-t border-[#1E1E1E] pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="text-white font-bold">Total</span>
                  <span className="text-white font-bold text-xl">R$ {total.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
