import { useState } from "react";
import { useLocation } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShoppingCart, MessageCircle, CheckCircle2, Lock, Edit2 } from "lucide-react";
import { Link } from "wouter";

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart();
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'review' | 'confirm'>('review');
  
  // Dados editáveis
  const [formData, setFormData] = useState({
    name: user?.name || '',
    cpf: '',
    addressZip: '',
    addressStreet: '',
    addressNumber: '',
    addressComplement: '',
    addressNeighborhood: '',
    addressCity: '',
    addressState: '',
  });

  const createOrder = trpc.orders.create.useMutation();

  const shippingCost = subtotal >= 200 ? 0 : 19.90;
  const total = subtotal + shippingCost;

  // Carregar dados
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] pt-20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C8102E] mx-auto mb-4"></div>
          <p className="text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  // Redirecionar para login se não estiver autenticado
  if (!user) {
    const loginUrl = `${window.location.origin}/_core/oauth/login?returnUrl=${encodeURIComponent("/checkout")}`;
    return (
      <div className="min-h-screen bg-[#0D0D0D] pt-20 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Lock size={48} className="text-[#C8102E] mx-auto mb-4" />
          <p className="text-gray-300 text-lg mb-2">Faça login para continuar</p>
          <p className="text-gray-500 text-sm mb-6">Você precisa estar logado para finalizar sua compra.</p>
          <a href={loginUrl}>
            <Button className="w-full bg-[#C8102E] hover:bg-red-700 text-white font-bold py-3">
              Fazer Login
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // Carrinho vazio
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

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleConfirmAndSendWhatsApp = async () => {
    if (!user.email || !formData.name) {
      toast.error("Nome é obrigatório");
      return;
    }

    setIsSubmitting(true);
    try {
      // Criar pedido no banco de dados
      const order = await createOrder.mutateAsync({
        customerName: formData.name,
        customerEmail: user.email,
        customerPhone: "",
        addressZip: formData.addressZip,
        addressStreet: formData.addressStreet,
        addressNumber: formData.addressNumber,
        addressComplement: formData.addressComplement,
        addressNeighborhood: formData.addressNeighborhood,
        addressCity: formData.addressCity,
        addressState: formData.addressState,
        paymentMethod: "pix",
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

      // Construir mensagem detalhada para WhatsApp (SEM EMOTICONS)
      const productsList = items
        .map(item => `* ${item.productName} (${item.size}) - Qtd: ${item.quantity} x R$ ${item.unitPrice.toFixed(2).replace(".", ",")} = R$ ${(item.unitPrice * item.quantity).toFixed(2).replace(".", ",")}`)
        .join("\n");

      const endereco = [
        formData.addressStreet,
        formData.addressNumber,
        formData.addressComplement,
        formData.addressNeighborhood,
        formData.addressCity,
        formData.addressState,
        formData.addressZip
      ].filter(Boolean).join(", ");

      const message = `NOVO PEDIDO - JUMERA SPORT

Numero do Pedido: ${order.orderNumber}

DADOS DO CLIENTE:
Nome: ${formData.name}
Email: ${user.email}
CPF: ${formData.cpf || "Nao informado"}

ENDERECO DE ENTREGA:
${endereco || "Nao informado"}

PRODUTOS:
${productsList}

RESUMO:
Subtotal: R$ ${subtotal.toFixed(2).replace(".", ",")}
Frete: ${shippingCost === 0 ? "GRATIS" : `R$ ${shippingCost.toFixed(2).replace(".", ",")}`}
TOTAL: R$ ${total.toFixed(2).replace(".", ",")}

Link de confirmacao: ${window.location.origin}/pedido/${order.orderNumber}`;

      // Enviar para WhatsApp (número será configurado no backend)
      const whatsappNumber = "5585987654321"; // Será substituído pela configuração real
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

      clearCart();
      toast.success("Pedido criado! Redirecionando para WhatsApp...");
      
      // Redirecionar para WhatsApp
      setTimeout(() => {
        window.open(whatsappUrl, "_blank");
        navigate(`/pedido/${order.orderNumber}`);
      }, 1000);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao finalizar pedido. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Conteúdo Principal */}
          <div className="lg:col-span-2">
            {step === 'review' && (
              <>
                {/* Resumo do Pedido */}
                <div className="bg-[#111111] rounded-xl p-6 border border-[#1E1E1E] mb-6">
                  <h2 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider mb-5">RESUMO DO PEDIDO</h2>
                  
                  {/* Produtos */}
                  <div className="space-y-3 mb-6">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start pb-3 border-b border-[#1E1E1E]">
                        <div className="flex-1">
                          <p className="text-white font-semibold">{item.productName}</p>
                          <p className="text-gray-500 text-sm">Tamanho: {item.size} | Qtd: {item.quantity}</p>
                        </div>
                        <p className="text-[#C8102E] font-bold">R$ {(item.unitPrice * item.quantity).toFixed(2).replace(".", ",")}</p>
                      </div>
                    ))}
                  </div>

                  {/* Totais */}
                  <div className="space-y-2 bg-[#0A0A0A] p-4 rounded-lg">
                    <div className="flex justify-between text-gray-400">
                      <span>Subtotal:</span>
                      <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Frete:</span>
                      <span>{shippingCost === 0 ? "GRATIS" : `R$ ${shippingCost.toFixed(2).replace(".", ",")}`}</span>
                    </div>
                    <div className="flex justify-between text-white font-bold text-lg pt-2 border-t border-[#1E1E1E]">
                      <span>Total:</span>
                      <span className="text-[#C8102E]">R$ {total.toFixed(2).replace(".", ",")}</span>
                    </div>
                  </div>
                </div>

                {/* Dados do Cliente */}
                <div className="bg-[#111111] rounded-xl p-6 border border-[#1E1E1E]">
                  <h2 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider mb-5 flex items-center gap-2">
                    <CheckCircle2 size={20} className="text-green-500" /> SEUS DADOS
                  </h2>
                  
                  <div className="space-y-3">
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Nome</p>
                      <p className="text-white font-semibold">{user.name}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Email</p>
                      <p className="text-white font-semibold">{user.email}</p>
                    </div>
                  </div>

                  <Button
                    onClick={() => setStep('confirm')}
                    className="w-full mt-6 bg-[#C8102E] hover:bg-red-700 text-white font-bold py-3 flex items-center justify-center gap-2"
                  >
                    <Edit2 size={18} />
                    Confirmar e Editar Dados
                  </Button>
                </div>
              </>
            )}

            {step === 'confirm' && (
              <div className="bg-[#111111] rounded-xl p-6 border border-[#1E1E1E]">
                <h2 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider mb-5">CONFIRME SEUS DADOS</h2>
                
                <div className="space-y-4 mb-6">
                  <div>
                    <Label className="text-gray-400 text-xs mb-1">Nome Completo *</Label>
                    <Input
                      name="name"
                      value={formData.name}
                      onChange={handleFormChange}
                      placeholder="Seu nome completo"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-400 text-xs mb-1">CPF *</Label>
                    <Input
                      name="cpf"
                      value={formData.cpf}
                      onChange={handleFormChange}
                      placeholder="000.000.000-00"
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-400 text-xs mb-1">CEP</Label>
                      <Input
                        name="addressZip"
                        value={formData.addressZip}
                        onChange={handleFormChange}
                        placeholder="00000-000"
                        className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs mb-1">Estado</Label>
                      <Input
                        name="addressState"
                        value={formData.addressState}
                        onChange={handleFormChange}
                        placeholder="SP"
                        className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-gray-400 text-xs mb-1">Endereço *</Label>
                    <Input
                      name="addressStreet"
                      value={formData.addressStreet}
                      onChange={handleFormChange}
                      placeholder="Rua, Avenida..."
                      className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-400 text-xs mb-1">Número</Label>
                      <Input
                        name="addressNumber"
                        value={formData.addressNumber}
                        onChange={handleFormChange}
                        placeholder="123"
                        className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs mb-1">Complemento</Label>
                      <Input
                        name="addressComplement"
                        value={formData.addressComplement}
                        onChange={handleFormChange}
                        placeholder="Apto, Bloco..."
                        className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-400 text-xs mb-1">Bairro</Label>
                      <Input
                        name="addressNeighborhood"
                        value={formData.addressNeighborhood}
                        onChange={handleFormChange}
                        placeholder="Bairro"
                        className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs mb-1">Cidade *</Label>
                      <Input
                        name="addressCity"
                        value={formData.addressCity}
                        onChange={handleFormChange}
                        placeholder="Cidade"
                        className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => setStep('review')}
                    variant="outline"
                    className="flex-1 border-[#333] text-gray-300 hover:text-white bg-transparent"
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={handleConfirmAndSendWhatsApp}
                    disabled={isSubmitting}
                    className="flex-1 bg-[#25D366] hover:bg-green-600 text-white font-bold py-3"
                  >
                    {isSubmitting ? "Processando..." : "Enviar para WhatsApp"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Resumo */}
          {step === 'review' && (
            <div>
              <div className="bg-[#111111] rounded-xl p-6 border border-[#1E1E1E] sticky top-24">
                <h3 className="font-['Bebas_Neue'] text-xl text-white tracking-wider mb-4">TOTAL DO PEDIDO</h3>
                
                <div className="space-y-2 bg-[#0A0A0A] p-4 rounded-lg mb-6">
                  <div className="flex justify-between text-gray-400">
                    <span>Subtotal:</span>
                    <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Frete:</span>
                    <span>{shippingCost === 0 ? "GRATIS" : `R$ ${shippingCost.toFixed(2).replace(".", ",")}`}</span>
                  </div>
                  <div className="flex justify-between text-white font-bold text-lg pt-2 border-t border-[#1E1E1E]">
                    <span>Total:</span>
                    <span className="text-[#C8102E]">R$ {total.toFixed(2).replace(".", ",")}</span>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-blue-300 text-sm">
                    Voce sera redirecionado para o WhatsApp para confirmar seu pedido.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
