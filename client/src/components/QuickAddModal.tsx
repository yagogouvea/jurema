import { useState, useEffect } from "react";
import { X, ShoppingCart, Plus, Minus, Package } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

const SIZES = ["PP", "P", "M", "G", "GG", "XGG"];

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: number;
    name: string;
    slug: string;
    price: number;
    originalPrice?: number | null;
    image: string;
    team?: string | null;
  };
}

export default function QuickAddModal({ isOpen, onClose, product }: QuickAddModalProps) {
  const { addItem } = useCart();
  // Map de tamanho → quantidade
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(SIZES.map(s => [s, 0]))
  );

  // Fechar com ESC
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Reset ao abrir
  useEffect(() => {
    if (isOpen) setQuantities(Object.fromEntries(SIZES.map(s => [s, 0])));
  }, [isOpen]);

  if (!isOpen) return null;

  const totalPecas = Object.values(quantities).reduce((a, b) => a + b, 0);
  const totalValor = totalPecas * product.price;

  const increment = (size: string) =>
    setQuantities(prev => ({ ...prev, [size]: prev[size] + 1 }));

  const decrement = (size: string) =>
    setQuantities(prev => ({ ...prev, [size]: Math.max(0, prev[size] - 1) }));

  const handleAddToCart = () => {
    const selected = SIZES.filter(s => quantities[s] > 0);
    if (selected.length === 0) {
      toast.error("Selecione ao menos um tamanho e quantidade.");
      return;
    }
    selected.forEach(size => {
      addItem({
        productId: product.id,
        productName: product.name,
        productImage: product.image,
        size,
        quantity: quantities[size],
        unitPrice: product.price,
        team: product.team || undefined,
      });
    });
    const totalQty = selected.reduce((sum, s) => sum + quantities[s], 0);
    toast.success(`${totalQty} ${totalQty === 1 ? "peça adicionada" : "peças adicionadas"} ao carrinho!`, {
      description: selected.map(s => `${s}: ${quantities[s]}x`).join("  •  "),
      duration: 4000,
    });
    onClose();
  };

  const discount = product.originalPrice && product.originalPrice > product.price
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm bg-[#111111] border border-[#C8102E]/30 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative flex items-start gap-3 p-4 border-b border-[#1E1E1E]">
            <img
              src={product.image}
              alt={product.name}
              className="w-16 h-16 rounded-lg object-cover bg-[#1A1A1A] flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              {product.team && (
                <p className="text-[#C8102E] text-[10px] font-bold uppercase tracking-widest mb-0.5">
                  {product.team}
                </p>
              )}
              <h3 className="text-white font-bold text-sm leading-tight line-clamp-2">
                {product.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white font-bold text-base">
                  R$ {product.price.toFixed(2).replace(".", ",")}
                </span>
                {product.originalPrice && product.originalPrice > product.price && (
                  <span className="text-gray-500 text-xs line-through">
                    R$ {product.originalPrice.toFixed(2).replace(".", ",")}
                  </span>
                )}
                {discount && (
                  <span className="bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    -{discount}%
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tamanhos e quantidades */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package size={14} className="text-[#C8102E]" />
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
                Selecione tamanho e quantidade
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {SIZES.map(size => {
                const qty = quantities[size];
                const isSelected = qty > 0;
                return (
                  <div
                    key={size}
                    className={`rounded-xl border transition-all duration-150 ${
                      isSelected
                        ? "border-[#C8102E] bg-[#C8102E]/10"
                        : "border-[#2A2A2A] bg-[#1A1A1A]"
                    }`}
                  >
                    {/* Label do tamanho */}
                    <div className={`text-center py-1.5 text-sm font-bold tracking-wider ${
                      isSelected ? "text-[#C8102E]" : "text-gray-400"
                    }`}>
                      {size}
                    </div>

                    {/* Controles de quantidade */}
                    <div className="flex items-center justify-between px-1.5 pb-2">
                      <button
                        onClick={() => decrement(size)}
                        disabled={qty === 0}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                          qty === 0
                            ? "text-gray-700 cursor-not-allowed"
                            : "text-white bg-[#2A2A2A] hover:bg-[#C8102E] active:scale-95"
                        }`}
                      >
                        <Minus size={12} />
                      </button>

                      <span className={`text-sm font-bold w-6 text-center ${
                        isSelected ? "text-white" : "text-gray-600"
                      }`}>
                        {qty}
                      </span>

                      <button
                        onClick={() => increment(size)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white bg-[#2A2A2A] hover:bg-[#C8102E] active:scale-95 transition-all"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumo */}
            {totalPecas > 0 && (
              <div className="mt-3 p-3 bg-[#1A1A1A] rounded-xl border border-[#2A2A2A]">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    {totalPecas} {totalPecas === 1 ? "peça" : "peças"}
                  </span>
                  <span className="text-white font-bold">
                    R$ {totalValor.toFixed(2).replace(".", ",")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {SIZES.filter(s => quantities[s] > 0).map(s => (
                    <span key={s} className="text-[10px] bg-[#C8102E]/20 text-[#C8102E] font-bold px-2 py-0.5 rounded-full">
                      {s}: {quantities[s]}x
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-400 bg-[#1A1A1A] hover:bg-[#222] rounded-xl transition-colors border border-[#2A2A2A]"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddToCart}
              disabled={totalPecas === 0}
              className={`flex-[2] py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all ${
                totalPecas > 0
                  ? "bg-[#C8102E] hover:bg-red-700 text-white active:scale-[0.98]"
                  : "bg-[#2A2A2A] text-gray-600 cursor-not-allowed"
              }`}
            >
              <ShoppingCart size={16} />
              {totalPecas > 0
                ? `Adicionar ${totalPecas} ${totalPecas === 1 ? "peça" : "peças"}`
                : "Selecione um tamanho"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
