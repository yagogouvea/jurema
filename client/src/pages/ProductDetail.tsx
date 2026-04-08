import { useState } from "react";
import { useParams, Link } from "wouter";
import { ShoppingCart, Heart, ChevronLeft, ChevronRight, Truck, Shield, RotateCcw, Minus, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ProductCard from "@/components/ProductCard";

const SIZES = ["PP", "P", "M", "G", "GG", "XGG"];

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading } = trpc.products.bySlug.useQuery({ slug: slug! }, { enabled: !!slug });
  const { data: relatedData } = trpc.products.list.useQuery(
    { category: product?.category, limit: 4 },
    { enabled: !!product }
  );

  const [selectedSize, setSelectedSize] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [currentImage, setCurrentImage] = useState(0);
  const { addItem } = useCart();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] pt-20">
        <div className="container py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="aspect-square bg-[#111111] rounded-xl animate-pulse" />
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 bg-[#111111] rounded animate-pulse" style={{ width: `${80 - i * 10}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] pt-20 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-xl mb-4">Produto não encontrado</p>
          <Link href="/produtos">
            <Button className="bg-[#C8102E] hover:bg-red-700 text-white">Voltar aos Produtos</Button>
          </Link>
        </div>
      </div>
    );
  }

  const images = (product.images as string[]) || [];
  const imageUrl = images[currentImage] || `https://placehold.co/600x600/1A1A1A/C8102E?text=${encodeURIComponent(product.name)}`;
  const numPrice = parseFloat(String(product.price));
  const numOriginal = product.originalPrice ? parseFloat(String(product.originalPrice)) : null;
  const discount = numOriginal ? Math.round((1 - numPrice / numOriginal) * 100) : null;

  const stockMap: Record<string, number> = {};
  (product.stock || []).forEach((s: any) => { 
    stockMap[s.size] = s.quantity; 
  });
  
  const availableSizes = product.stock?.map((s: any) => s.size) || [];

  const selectedStockQty = selectedSize ? (stockMap[selectedSize] ?? 0) : null;

  const handleAddToCart = () => {
    if (!selectedSize) {
      toast.error("Selecione um tamanho antes de adicionar ao carrinho");
      return;
    }
    if (selectedStockQty !== null && selectedStockQty <= 0) {
      toast.error("Tamanho sem estoque disponível");
      return;
    }
    addItem({
      productId: product.id,
      productName: product.name,
      productImage: imageUrl,
      size: selectedSize,
      quantity,
      unitPrice: numPrice,
      team: product.team || undefined,
      reference: product.reference || undefined,
    });
    toast.success("Produto adicionado ao carrinho!", { duration: 2000 });
  };

  const relatedProducts = (relatedData?.items ?? []).filter(p => p.id !== product.id).slice(0, 4);

  return (
    <div className="min-h-screen bg-[#0D0D0D] pt-20">
      <div className="container py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-600 mb-6">
          <Link href="/" className="hover:text-[#C8102E] transition-colors">Início</Link>
          <span>/</span>
          <Link href="/produtos" className="hover:text-[#C8102E] transition-colors">Produtos</Link>
          {product.team && (
            <>
              <span>/</span>
              <span className="text-gray-500">{product.team}</span>
            </>
          )}
          <span>/</span>
          <span className="text-gray-400 line-clamp-1">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Images */}
          <div className="space-y-3">
            {/* Main image */}
            <div className="relative aspect-square bg-[#111111] rounded-xl overflow-hidden">
              <img
                src={imageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
              {discount && (
                <span className="absolute top-3 right-3 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full">
                  -{discount}%
                </span>
              )}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImage(i => (i - 1 + images.length) % images.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-[#C8102E] flex items-center justify-center text-white transition-all"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setCurrentImage(i => (i + 1) % images.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-[#C8102E] flex items-center justify-center text-white transition-all"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>
            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImage(i)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      i === currentImage ? 'border-[#C8102E]' : 'border-[#1E1E1E] hover:border-[#333]'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="space-y-5">
            {product.team && (
              <p className="text-[#C8102E] text-sm font-bold uppercase tracking-widest">{product.team}</p>
            )}
            <h1 className="font-['Bebas_Neue'] text-3xl md:text-4xl text-white tracking-wider leading-tight">
              {product.name}
            </h1>

            {/* Price */}
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold text-white">
                R$ {numPrice.toFixed(2).replace('.', ',')}
              </span>
              {numOriginal && numOriginal > numPrice && (
                <span className="text-gray-500 text-lg line-through">
                  R$ {numOriginal.toFixed(2).replace('.', ',')}
                </span>
              )}
              {discount && (
                <Badge className="bg-yellow-500 text-black font-bold text-xs">-{discount}%</Badge>
              )}
            </div>
            <p className="text-gray-600 text-xs">Em até 12x no cartão</p>

            {/* Size selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-300 text-sm font-semibold">Tamanho</label>
              </div>
              <div className="flex flex-wrap gap-2">
                {SIZES.map(size => {
                  const qty = stockMap[size] ?? 0;
                  const outOfStock = qty === 0;
                  const isAvailable = product.stock?.some((s: any) => s.size === size) ?? false;
                  
                  if (!isAvailable) return null;
                  
                  return (
                    <button
                      key={size}
                      disabled={outOfStock}
                      onClick={() => setSelectedSize(size)}
                      className={`w-14 h-10 rounded-lg text-sm font-bold border-2 transition-all ${
                        selectedSize === size
                          ? 'bg-[#C8102E] border-[#C8102E] text-white'
                          : outOfStock
                          ? 'bg-transparent border-[#1E1E1E] text-gray-700 cursor-not-allowed line-through'
                          : 'bg-transparent border-[#333] text-gray-300 hover:border-[#C8102E] hover:text-white'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
              {availableSizes.length === 0 && (
                <p className="text-xs mt-2 text-red-500">Nenhum tamanho disponível</p>
              )}
              {selectedSize && selectedStockQty !== null && (
                <p className={`text-xs mt-2 ${selectedStockQty <= 3 ? 'text-yellow-500' : 'text-green-500'}`}>
                  {selectedStockQty <= 0 ? 'Sem estoque' :
                   selectedStockQty <= 3 ? `Últimas ${selectedStockQty} unidades!` :
                   `${selectedStockQty} em estoque`}
                </p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="text-gray-300 text-sm font-semibold mb-2 block">Quantidade</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-lg bg-[#1A1A1A] border border-[#333] flex items-center justify-center text-gray-300 hover:text-white hover:border-[#C8102E] transition-all"
                >
                  <Minus size={14} />
                </button>
                <span className="text-white font-bold text-lg w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-9 h-9 rounded-lg bg-[#1A1A1A] border border-[#333] flex items-center justify-center text-gray-300 hover:text-white hover:border-[#C8102E] transition-all"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={handleAddToCart}
                className="flex-1 bg-[#C8102E] hover:bg-red-700 text-white font-bold py-3 text-base gap-2"
              >
                <ShoppingCart size={18} />
                Adicionar ao Carrinho
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="border-[#333] text-gray-400 hover:text-[#C8102E] hover:border-[#C8102E] bg-transparent w-12 h-12"
                onClick={() => toast.info("Lista de desejos em breve!")}
              >
                <Heart size={18} />
              </Button>
            </div>



            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { icon: Truck, text: "Entrega Rápida" },
                { icon: Shield, text: "Compra Segura" },
                { icon: RotateCcw, text: "Troca Fácil" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex flex-col items-center gap-1 p-2 bg-[#111111] rounded-lg text-center">
                  <Icon size={16} className="text-[#C8102E]" />
                  <span className="text-gray-500 text-xs">{text}</span>
                </div>
              ))}
            </div>

            {/* Descrição */}
            {product.description && (
              <div className="border-t border-[#1E1E1E] pt-4">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Descrição</p>
                <p className="text-gray-300 text-sm leading-relaxed">{product.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <section className="mt-16">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-0.5 bg-[#C8102E]" />
                <span className="text-[#C8102E] text-xs font-bold uppercase tracking-[0.3em]">Você também pode gostar</span>
              </div>
              <h2 className="font-['Bebas_Neue'] text-3xl text-white tracking-wider">PRODUTOS RELACIONADOS</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {relatedProducts.map(p => (
                <ProductCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  slug={p.slug}
                  price={p.price}
                  originalPrice={p.originalPrice}
                  images={p.images as string[]}
                  team={p.team}
                  gender={p.gender}
                  category={p.category}
                  isFeatured={p.isFeatured}
                  salesCount={p.salesCount}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
