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
}

export default function ProductCard({
  id, name, slug, price, originalPrice, images, team, gender, category, isFeatured, salesCount
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

  const genderLabel: Record<string, string> = {
    masculino: 'Masculino', feminino: 'Feminino', infantil: 'Infantil',
  };
  const categoryLabel: Record<string, string> = {
    times: 'Times', selecoes: 'Seleções', retro: 'Retrô',
  };

  const handleOpenModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setModalOpen(true);
  };

  return (
    <>
      <Link href={`/produto/${slug}`}>
        <div className="product-card bg-[#111111] rounded-xl overflow-hidden cursor-pointer group border border-[#1E1E1E] hover:border-[#C8102E]/40">
          {/* Image */}
          <div className="relative aspect-square overflow-hidden bg-[#1A1A1A]">
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />

            {/* Badges */}
            {isFeatured && (
              <span className="absolute top-2 left-2 bg-[#C8102E] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Destaque
              </span>
            )}
            {discount && discount > 0 && (
              <span className="absolute top-2 right-2 bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                -{discount}%
              </span>
            )}

            {/* Quick add overlay — abre o modal */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
              <button
                onClick={handleOpenModal}
                className="flex items-center gap-2 bg-[#C8102E] hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg"
              >
                <ShoppingCart size={16} />
                Selecionar Tamanho
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="p-3">
            {team && (
              <p className="text-[#C8102E] text-xs font-semibold uppercase tracking-wider mb-1">
                {team}
              </p>
            )}
            <h3 className="text-white text-sm font-semibold leading-tight mb-1 line-clamp-2 group-hover:text-[#C8102E] transition-colors">
              {name}
            </h3>
            <div className="flex items-center gap-1 mb-2">
              <span className="text-gray-600 text-[10px]">
                {genderLabel[gender]} • {categoryLabel[category]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                {numOriginal && numOriginal > numPrice && (
                  <p className="text-gray-600 text-xs line-through">
                    R$ {numOriginal.toFixed(2).replace('.', ',')}
                  </p>
                )}
                <p className="text-white font-bold text-base">
                  R$ {numPrice.toFixed(2).replace('.', ',')}
                </p>
              </div>
              {salesCount && salesCount > 0 ? (
                <div className="flex items-center gap-1 text-yellow-500">
                  <Star size={12} fill="currentColor" />
                  <span className="text-xs text-gray-500">{salesCount} vendas</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Link>

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
        }}
      />
    </>
  );
}
