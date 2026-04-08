import { useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { X, ShoppingCart, Trash2, Plus, Minus, MessageCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const WHATSAPP_NUMBER = "5511981693476";

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value;
}

function maskCEP(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function buildWhatsAppMessage(
  customer: { name: string; phone: string; cep: string },
  items: Array<{ productName: string; size: string; quantity: number; unitPrice: number }>,
  subtotal: number
): string {
  const lines: string[] = [];

  lines.push("NOVO PEDIDO - JUMERA SPORT");
  lines.push("=============================\n");
  lines.push("DADOS DO CLIENTE:");
  lines.push(`Nome: ${customer.name}`);
  lines.push(`Telefone: ${customer.phone}`);
  lines.push(`CEP: ${customer.cep}\n`);
  lines.push("=============================\n");
  lines.push("ITENS DO PEDIDO:");
  lines.push("");

  items.forEach((item, i) => {
    const itemTotal = (item.unitPrice * item.quantity).toFixed(2).replace(".", ",");
    const unitFmt = item.unitPrice.toFixed(2).replace(".", ",");
    lines.push(
      `${i + 1}. ${item.productName}\n   Tamanho: ${item.size} | Qtd: ${item.quantity} | R$ ${unitFmt} cada\n   Subtotal: R$ ${itemTotal}`
    );
  });

  lines.push("");
  lines.push("=============================");
  lines.push(`TOTAL: R$ ${subtotal.toFixed(2).replace(".", ",")}`);
  lines.push("=============================");
  lines.push("Pedido realizado via Jumera Sport");

  return lines.join("\n");
}

export default function CartDrawer() {
  const { items, isOpen, setIsOpen, removeItem, updateQuantity, subtotal, itemCount, clearCart } = useCart();
  const [step, setStep] = useState<"cart" | "checkout">("cart");
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    cep: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  function handleQuantityChange(productId: number, size: string, newQuantity: number) {
    if (newQuantity <= 0) {
      removeItem(productId, size);
    } else {
      updateQuantity(productId, size, newQuantity);
    }
  }

  function handleProceedToCheckout() {
    // Validar quantidade mínima
    if (itemCount < 10) {
      toast.error("Quantidade mínima: 10 peças. Você tem " + itemCount + " peça(s) no carrinho.");
      return;
    }
    setStep("checkout");
  }

  function handleFormChange(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmitCheckout(e: React.FormEvent) {
    e.preventDefault();

    // Validar campos obrigatórios
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    if (!formData.phone.trim() || formData.phone.replace(/\D/g, "").length < 10) {
      toast.error("Telefone inválido.");
      return;
    }
    if (!formData.cep.trim() || formData.cep.replace(/\D/g, "").length !== 8) {
      toast.error("CEP inválido.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Monta a mensagem WhatsApp
      const message = buildWhatsAppMessage(
        {
          name: formData.name,
          phone: formData.phone,
          cep: formData.cep,
        },
        items,
        subtotal
      );

      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank");

      // Limpar carrinho e fechar
      clearCart();
      setIsOpen(false);
      setStep("cart");
      setFormData({ name: "", phone: "", cep: "" });
      toast.success("Pedido enviado via WhatsApp! Aguarde o contato da nossa equipe.");
    } catch (error) {
      toast.error("Erro ao enviar pedido. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-[#0D0D0D] shadow-2xl z-50 flex flex-col border-l border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          {step === "checkout" && (
            <button
              onClick={() => setStep("cart")}
              className="text-gray-400 hover:text-white transition"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 className="text-white font-black text-lg flex items-center gap-2">
            <ShoppingCart size={20} />
            {step === "cart" ? "CARRINHO" : "DADOS DE ENTREGA"}
          </h2>
          {step === "cart" && (
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition"
            >
              <X size={20} />
            </button>
          )}
          {step === "checkout" && <div className="w-5" />}
        </div>

        {/* Content */}
        {step === "cart" ? (
          <>
            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <ShoppingCart size={48} className="text-gray-600 mb-2" />
                  <p className="text-gray-400 text-sm">Seu carrinho está vazio</p>
                </div>
              ) : (
                items.map((item) => (
                  <div key={`${item.productId}-${item.size}`} className="bg-[#1A1A1A] rounded-lg p-3 border border-white/10">
                    <div className="flex gap-3">
                      <img
                        src={item.productImage}
                        alt={item.productName}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{item.productName}</p>
                        <p className="text-gray-400 text-xs">Tamanho: {item.size}</p>
                        <p className="text-[#C8102E] text-sm font-bold">
                          R$ {(item.unitPrice * item.quantity).toFixed(2).replace(".", ",")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2 bg-[#0D0D0D] rounded px-2 py-1">
                        <button
                          onClick={() => handleQuantityChange(item.productId, item.size, item.quantity - 1)}
                          className="text-gray-400 hover:text-white"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-white text-sm font-semibold w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => handleQuantityChange(item.productId, item.size, item.quantity + 1)}
                          className="text-gray-400 hover:text-white"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.productId, item.size)}
                        className="text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="p-4 border-t border-[#1E1E1E] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Subtotal</span>
                  <span className="text-white font-bold text-lg">
                    R$ {subtotal.toFixed(2).replace(".", ",")}
                  </span>
                </div>

                {/* Aviso de quantidade mínima */}
                {itemCount < 10 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                    <span className="text-red-400 text-xs font-semibold">Atenção!</span>
                    <p className="text-red-300 text-xs">
                      Quantidade mínima: 10 peças. Você tem {itemCount} peça(s). Adicione mais itens para continuar.
                    </p>
                  </div>
                )}

                {/* Botão principal */}
                <Button
                  disabled={itemCount < 10}
                  className="w-full bg-[#25D366] hover:bg-[#1ebe5d] disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-black py-3 text-base flex items-center gap-2 justify-center"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.1em" }}
                  onClick={handleProceedToCheckout}
                >
                  <MessageCircle size={20} />
                  {itemCount < 10 ? `ADICIONE ${10 - itemCount} PEÇA(S)` : "PROSSEGUIR"}
                </Button>

                <Button
                  variant="outline"
                  className="w-full border-[#333] text-gray-400 hover:text-white hover:border-[#555] bg-transparent"
                  onClick={() => setIsOpen(false)}
                >
                  Continuar Comprando
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Checkout Form */}
            <div className="flex-1 overflow-y-auto p-4">
              <form onSubmit={handleSubmitCheckout} className="space-y-4">
                {/* Nome */}
                <div>
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">
                    Nome Completo *
                  </Label>
                  <Input
                    placeholder="Seu nome"
                    value={formData.name}
                    onChange={(e) => handleFormChange("name", e.target.value)}
                    required
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-10"
                  />
                </div>

                {/* Telefone */}
                <div>
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">
                    Telefone *
                  </Label>
                  <Input
                    placeholder="(00) 94729-3221"
                    value={formData.phone}
                    onChange={(e) => handleFormChange("phone", maskPhone(e.target.value))}
                    required
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-10"
                  />
                </div>

                {/* CEP */}
                <div>
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">
                    CEP *
                  </Label>
                  <Input
                    placeholder="00000-000"
                    value={formData.cep}
                    onChange={(e) => handleFormChange("cep", maskCEP(e.target.value))}
                    required
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-10"
                  />
                </div>

                {/* Resumo do Pedido */}
                <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-3 mt-6">
                  <p className="text-gray-400 text-xs font-semibold mb-2">RESUMO DO PEDIDO:</p>
                  <div className="space-y-1 text-xs text-gray-300">
                    <div className="flex justify-between">
                      <span>Total de itens:</span>
                      <span className="font-semibold">{itemCount} peça(s)</span>
                    </div>
                    <div className="flex justify-between text-[#C8102E] font-bold">
                      <span>Total:</span>
                      <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
                    </div>
                  </div>
                </div>

                {/* Botões */}
                <div className="space-y-2 pt-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[#25D366] hover:bg-[#1ebe5d] disabled:bg-gray-600 text-white font-black py-3 text-base flex items-center gap-2 justify-center"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.1em" }}
                  >
                    <MessageCircle size={20} />
                    {isSubmitting ? "ENVIANDO..." : "ENVIAR VIA WHATSAPP"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-[#333] text-gray-400 hover:text-white hover:border-[#555] bg-transparent"
                    onClick={() => setStep("cart")}
                  >
                    Voltar
                  </Button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </>
  );
}
