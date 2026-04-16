/**
 * ProductPhotoLightbox
 * Componente de lightbox para exibir foto de produto em tamanho grande.
 * - Abre ao clicar no avatar minúsculo
 * - Fecha com: botão X, tecla ESC, ou clique fora da imagem
 */
import { useEffect, useCallback } from "react";
import { X, Image as ImageIcon } from "lucide-react";
import { createPortal } from "react-dom";

interface ProductPhotoLightboxProps {
  /** URL da imagem a exibir */
  src: string;
  /** Nome do produto (usado no alt e no título) */
  productName: string;
  /** Callback para fechar o lightbox */
  onClose: () => void;
}

export function ProductPhotoLightbox({ src, productName, onClose }: ProductPhotoLightboxProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    // Bloqueia scroll do body enquanto aberto
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Foto de ${productName}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      {/* Container da imagem — clique aqui NÃO fecha */}
      <div
        className="relative z-10 max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão fechar */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-20 w-8 h-8 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500 transition-colors shadow-lg"
          aria-label="Fechar foto"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Imagem */}
        <img
          src={src}
          alt={productName}
          className="max-w-[85vw] max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10"
        />

        {/* Nome do produto */}
        <p className="text-white/70 text-sm text-center truncate max-w-[85vw]">{productName}</p>

        {/* Dica de fechar */}
        <p className="text-white/30 text-xs">Pressione ESC ou clique fora para fechar</p>
      </div>
    </div>,
    document.body
  );
}

/**
 * ProductPhotoAvatar
 * Avatar minúsculo (24×24) que exibe a foto do produto ou um ícone genérico.
 * Ao clicar, abre o lightbox se houver foto.
 */
interface ProductPhotoAvatarProps {
  fotoUrl?: string | null;
  productName: string;
  /** Tamanho do avatar em pixels (padrão: 24) */
  size?: number;
  onOpenLightbox: (src: string, name: string) => void;
}

export function ProductPhotoAvatar({
  fotoUrl,
  productName,
  size = 24,
  onOpenLightbox,
}: ProductPhotoAvatarProps) {
  const hasFoto = Boolean(fotoUrl);

  return (
    <button
      type="button"
      onClick={() => hasFoto && onOpenLightbox(fotoUrl!, productName)}
      className={`flex-shrink-0 rounded-md overflow-hidden border transition-all ${
        hasFoto
          ? "border-white/20 hover:border-green-500/60 hover:scale-110 cursor-zoom-in"
          : "border-white/10 cursor-default opacity-40"
      }`}
      style={{ width: size, height: size }}
      title={hasFoto ? `Ver foto: ${productName}` : "Sem foto"}
      aria-label={hasFoto ? `Ampliar foto de ${productName}` : `Sem foto para ${productName}`}
    >
      {hasFoto ? (
        <img
          src={fotoUrl!}
          alt={productName}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-white/5">
          <ImageIcon className="text-white/20" style={{ width: size * 0.55, height: size * 0.55 }} />
        </div>
      )}
    </button>
  );
}
