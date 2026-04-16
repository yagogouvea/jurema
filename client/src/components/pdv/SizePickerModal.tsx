import { useState, useMemo } from "react";
import { X, Plus, Minus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

export interface ProductVariant {
  id: number;
  tamanho: string;
  estoque: number;
  codigo: string;
  precoAtacado: number;
  precoVarejo: number;
}

export interface GroupedProduct {
  baseCode: string;
  linha: string;
  modelo: string;
  time: string;
  descricao?: string;
  tipo?: string;
  precoAtacado: number;
  precoVarejo: number;
  estoqueTotal: number;
  variantes: ProductVariant[];
  fotoUrl?: string | null;
}

export interface CartItem {
  productId: number;
  linha: string;
  modelo: string;
  time: string;
  descricao?: string;
  tipo?: string;
  tamanho: string;
  quantidade: number;
  precoUnitario: number;
  totalItem: number;
}

interface SizePickerModalProps {
  product: GroupedProduct;
  regime: "ATACADO" | "VAREJO";
  onClose: () => void;
  onAddToCart: (items: CartItem[]) => void;
}

// Canonical size order for sorting
const SIZE_ORDER: Record<string, number> = {
  PP: 1, P: 2, M: 3, G: 4, GG: 5, XG: 6, XGG: 7,
  S: 10, L: 12, XL: 13, "2XL": 14, "3XL": 15, "4XL": 16,
  "2": 20, "4": 21, "6": 22, "8": 23, "10": 24, "12": 25,
  "14": 26, "16": 27, "18": 28, "20": 29, "22": 30, "24": 31, "26": 32,
};

function sortVariants(variants: ProductVariant[]): ProductVariant[] {
  return [...variants].sort((a, b) => {
    const ao = SIZE_ORDER[a.tamanho] ?? 99;
    const bo = SIZE_ORDER[b.tamanho] ?? 99;
    if (ao !== bo) return ao - bo;
    return a.tamanho.localeCompare(b.tamanho);
  });
}

export default function SizePickerModal({
  product,
  regime,
  onClose,
  onAddToCart,
}: SizePickerModalProps) {
  const sortedVariants = useMemo(() => sortVariants(product.variantes), [product.variantes]);

  // quantities[variantId] = selected quantity
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  const totalSelected = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
    [quantities]
  );

  const totalValue = useMemo(() => {
    return sortedVariants.reduce((sum, v) => {
      const qty = quantities[v.id] || 0;
      const price = regime === "ATACADO" ? v.precoAtacado : v.precoVarejo;
      return sum + qty * price;
    }, 0);
  }, [quantities, sortedVariants, regime]);

  const setQty = (variantId: number, delta: number, maxEstoque: number) => {
    setQuantities((prev) => {
      const current = prev[variantId] || 0;
      const next = Math.max(0, Math.min(maxEstoque, current + delta));
      if (next === 0) {
        const { [variantId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [variantId]: next };
    });
  };

  const handleAdd = () => {
    const items: CartItem[] = [];
    for (const v of sortedVariants) {
      const qty = quantities[v.id] || 0;
      if (qty <= 0) continue;
      const price = regime === "ATACADO" ? v.precoAtacado : v.precoVarejo;
      items.push({
        productId: v.id,
        linha: product.linha,
        modelo: product.modelo,
        time: product.time,
        descricao: product.descricao,
        tipo: product.tipo,
        tamanho: v.tamanho,
        quantidade: qty,
        precoUnitario: price,
        totalItem: qty * price,
      });
    }

    if (items.length === 0) {
      toast.error("Selecione pelo menos 1 tamanho");
      return;
    }

    onAddToCart(items);
    onClose();
    const totalPecas = items.reduce((s, i) => s + i.quantidade, 0);
    toast.success(`${totalPecas} peça${totalPecas !== 1 ? "s" : ""} de ${product.time} adicionada${totalPecas !== 1 ? "s" : ""} ao carrinho`);
  };

  const precoAtualBase = regime === "ATACADO" ? product.precoAtacado : product.precoVarejo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-800 shrink-0">
          {/* Mini foto do produto no modal */}
          {product.fotoUrl && (
            <div className="shrink-0 mr-3">
              <img
                src={product.fotoUrl}
                alt={product.time}
                className="w-14 h-14 object-cover rounded-xl border border-white/10"
              />
            </div>
          )}
          <div className="min-w-0 flex-1 pr-3">
            <h2 className="text-white font-bold text-base leading-tight">{product.time}</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {product.linha} · {product.modelo}
              {product.descricao ? ` · ${product.descricao}` : ""}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-green-400 font-bold text-sm">
                R$ {precoAtualBase.toFixed(2).replace(".", ",")}
                <span className="text-gray-500 font-normal text-xs ml-1">
                  ({regime === "ATACADO" ? "atacado" : "varejo"})
                </span>
              </span>
              {product.estoqueTotal > 0 && (
                <span className="text-gray-500 text-xs">{product.estoqueTotal} un. total</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Variants Grid */}
        <div className="overflow-y-auto flex-1 p-4">
          <p className="text-gray-500 text-xs mb-3 uppercase tracking-wider font-semibold">
            Selecione os tamanhos e quantidades
          </p>

          <div className="grid grid-cols-2 gap-2">
            {sortedVariants.map((v) => {
              const qty = quantities[v.id] || 0;
              const semEstoque = v.estoque <= 0;
              const price = regime === "ATACADO" ? v.precoAtacado : v.precoVarejo;
              const hasCustomPrice = Math.abs(price - precoAtualBase) > 0.01;

              return (
                <div
                  key={v.id}
                  className={`rounded-xl border p-3 transition-all ${
                    semEstoque
                      ? "border-gray-800 bg-gray-800/30 opacity-50"
                      : qty > 0
                      ? "border-green-600 bg-green-900/20"
                      : "border-gray-700 bg-gray-800/60 hover:border-gray-600"
                  }`}
                >
                  {/* Tamanho + Estoque */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-bold text-sm ${qty > 0 ? "text-green-400" : "text-white"}`}>
                      {v.tamanho}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        semEstoque
                          ? "bg-red-950/50 text-red-500"
                          : v.estoque <= 3
                          ? "bg-yellow-950/50 text-yellow-400"
                          : "bg-green-950/50 text-green-400"
                      }`}
                    >
                      {semEstoque ? "Esgotado" : `${v.estoque} un.`}
                    </span>
                  </div>

                  {/* Custom price badge */}
                  {hasCustomPrice && !semEstoque && (
                    <div className="text-xs text-blue-400 mb-2">
                      R$ {price.toFixed(2).replace(".", ",")}
                    </div>
                  )}

                  {/* Quantity selector */}
                  {semEstoque ? (
                    <div className="h-8 flex items-center justify-center">
                      <span className="text-gray-600 text-xs">Indisponível</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1">
                      <button
                        onClick={() => setQty(v.id, -1, v.estoque)}
                        disabled={qty === 0}
                        className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className={`text-sm font-bold min-w-[24px] text-center ${
                          qty > 0 ? "text-green-400" : "text-gray-500"
                        }`}
                      >
                        {qty}
                      </span>
                      <button
                        onClick={() => setQty(v.id, 1, v.estoque)}
                        disabled={qty >= v.estoque}
                        className="w-7 h-7 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 shrink-0">
          {totalSelected > 0 && (
            <div className="flex items-center justify-between mb-3 text-sm">
              <span className="text-gray-400">
                {totalSelected} peça{totalSelected !== 1 ? "s" : ""} selecionada{totalSelected !== 1 ? "s" : ""}
              </span>
              <span className="text-white font-bold">
                R$ {totalValue.toFixed(2).replace(".", ",")}
              </span>
            </div>
          )}
          <button
            onClick={handleAdd}
            disabled={totalSelected === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            {totalSelected === 0
              ? "Selecione um tamanho"
              : `Adicionar ${totalSelected} peça${totalSelected !== 1 ? "s" : ""} ao carrinho`}
          </button>
        </div>
      </div>
    </div>
  );
}
