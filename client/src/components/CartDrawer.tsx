import { useCart } from "@/contexts/CartContext";
import { X, ShoppingCart, Trash2, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function CartDrawer() {
  const { items, isOpen, setIsOpen, removeItem, updateQuantity, subtotal, itemCount } = useCart();

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#111111] z-50 flex flex-col shadow-2xl border-l border-[#C8102E]/20 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1E1E1E]">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} className="text-[#C8102E]" />
            <h2 className="font-['Bebas_Neue'] text-xl text-white tracking-wider">
              CARRINHO ({itemCount})
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
            <X size={20} />
          </Button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <ShoppingCart size={48} className="text-gray-700" />
              <p className="text-gray-500 font-semibold">Seu carrinho está vazio</p>
              <p className="text-gray-600 text-sm">Adicione camisas incríveis!</p>
              <Button
                onClick={() => setIsOpen(false)}
                className="bg-[#C8102E] hover:bg-red-700 text-white"
                asChild
              >
                <Link href="/produtos">Ver Produtos</Link>
              </Button>
            </div>
          ) : (
            items.map(item => (
              <div key={`${item.productId}-${item.size}`} className="flex gap-3 bg-[#1A1A1A] rounded-lg p-3">
                <img
                  src={item.productImage || `https://placehold.co/80x80/1A1A1A/C8102E?text=${encodeURIComponent(item.productName[0])}`}
                  alt={item.productName}
                  className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold line-clamp-1">{item.productName}</p>
                  <p className="text-gray-500 text-xs mt-0.5">Tamanho: <span className="text-[#C8102E] font-bold">{item.size}</span></p>
                  <p className="text-white font-bold text-sm mt-1">
                    R$ {(item.unitPrice * item.quantity).toFixed(2).replace('.', ',')}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}
                      className="w-6 h-6 rounded bg-[#2A2A2A] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#C8102E] transition-colors"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-white text-sm font-bold w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}
                      className="w-6 h-6 rounded bg-[#2A2A2A] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#C8102E] transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={() => removeItem(item.productId, item.size)}
                      className="ml-auto text-gray-600 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
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
                R$ {subtotal.toFixed(2).replace('.', ',')}
              </span>
            </div>
            <p className="text-gray-600 text-xs text-center">Frete calculado no checkout</p>
            <Button
              className="w-full bg-[#C8102E] hover:bg-red-700 text-white font-bold py-3 text-base"
              onClick={() => setIsOpen(false)}
              asChild
            >
              <Link href="/checkout">Finalizar Compra</Link>
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
      </div>
    </>
  );
}
