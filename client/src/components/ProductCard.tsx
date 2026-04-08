import { useState } from "react";
import { Link } from "wouter";
import { ShoppingCart, Star } from "lucide-react";
import QuickAddModal from "./QuickAddModal";

interface ProductCardProps {
  id: number;
  name: string;
  slug: string;
  price: string | number;
  originalPrice?: string | number | null;
  images: string[];
  team?: string | null;
  gender: string;
  category: string;
  isFeatured?: boolean;
  salesCount?: number;
  reference?: string | null;
}

export default function ProductCard({
  id, name, slug, price, originalPrice, images, team, gender, category, isFeatured, salesCount, reference
}: ProductCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  const numOriginal = originalPrice
    ? (typeof originalPrice === 'string' ? parseFloat(originalPrice) : originalPrice)
    : null;
  const discount = numOriginal && numOriginal > numPrice
    ? Math.round((1 - numPrice / numOriginal) * 100)
    : null;
  const imageUrl =
    images?.[0] ||
    `https://placehold.co/400x400/1A1A1A/C8102E?text=${encodeURIComponent(name.split(' ')[0])}`;

  const handleOpenModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setModalOpen(true);
  };

  return (
    <>
      <div className="product-card bg-[#111111] rounded-xl overflow-hidden border border-[#1E1E1E] hover:border-[#C8102E]/40 transition-all group">
        {/* Image */}
        <Link href={`/produto/${slug}`}>
          <div className="relative aspect-square overflow-hidden bg-[#1A1A1A] cursor-pointer">
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />

            {/* Badges */}
            <div className="absolute top-2 left-2 flex flex-col gap-1">
              {isFeatured && (
                <span className="bg-[#C8102E] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  Destaque
                </span>
              )}
              {discount && discount > 0 && (
                <span className="bg-yellow-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  -{discount}%
                </span>
              )}
            </div>

            {/* Quick add overlay — desktop hover */}
            <div className="hidden md:flex absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity items-end justify-center pb-4">
              <button
                onClick={handleOpenModal}
                className="flex items-center gap-2 bg-[#C8102E] hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg"
              >
                <ShoppingCart size={16} />
                Selecionar Tamanho
              </button>
            </div>
          </div>
        </Link>

        {/* Info */}
        <div className="p-2.5 md:p-3">
          {team && (
            <p className="text-[#C8102E] text-[10px] font-bold uppercase tracking-wider mb-0.5 truncate">
              {team}
            </p>
          )}
          <Link href={`/produto/${slug}`}>
            <h3 className="text-white text-xs md:text-sm font-semibold leading-tight mb-1.5 line-clamp-2 hover:text-[#C8102E] transition-colors cursor-pointer">
              {name}
            </h3>
          </Link>

          {/* Price + Add button row */}
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0">
              {numOriginal && numOriginal > numPrice && (
                <p className="text-gray-600 text-[10px] line-through leading-none">
                  R$ {numOriginal.toFixed(2).replace('.', ',')}
                </p>
              )}
              <p className="text-white font-bold text-sm md:text-base leading-tight">
                R$ {numPrice.toFixed(2).replace('.', ',')}
              </p>
              {salesCount && salesCount > 0 ? (
                <div className="flex items-center gap-0.5 mt-0.5">
                  <Star size={10} className="text-yellow-500 fill-yellow-500" />
                  <span className="text-[10px] text-gray-500">{salesCount} vendas</span>
                </div>
              ) : null}
            </div>

            {/* Add button — always visible on mobile */}
            <button
              onClick={handleOpenModal}
              className="flex-shrink-0 flex items-center justify-center gap-1 bg-[#C8102E] hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-lg transition-colors
                px-2.5 py-2 text-[10px] md:px-3 md:py-2 md:text-xs"
              title="Selecionar tamanho"
            >
              <ShoppingCart size={13} />
              <span className="hidden sm:block">COMPRAR</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de seleção de tamanho/quantidade (atacado) */}
      <QuickAddModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        product={{
          id,
          name,
          slug,
          price: numPrice,
          originalPrice: numOriginal,
          image: imageUrl,
          team,
          reference: reference || undefined,
        }}
      />
    </>
  );
}
