import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingCart, Search, Menu, X, Instagram, Facebook, User, LogOut, ChevronDown } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-logo_2dee52ef.webp";

const CATEGORIES = [
  { key: '1linha-nacional',       label: 'R$30 - 1 LINHA NACIONAL' },
  { key: 'tailandesa-promocao',   label: 'R$35 - TAILANDESA PROMOÇÃO' },
  { key: 'itens-brasil',          label: 'ITENS BRASIL' },
  { key: 'conj-calor-nacional',   label: 'R$50 - CONJ CALOR NACIONAL' },
  { key: 'conj-calor-tailandesa', label: 'R$75 - CONJ CALOR TAILANDESA' },
  { key: 'tailandesa',            label: 'R$80 - TAILANDESA' },
  { key: 'infantil',              label: 'R$80 - INFANTIL' },
  { key: 'jogador-tailandesa',    label: 'R$110 - JOGADOR TAILANDESA' },
  { key: 'retro-tailandesa',      label: 'R$110 - RETRO TAILANDESA' },
  { key: 'conj-frio-tailandes',   label: 'R$180 - CONJ FRIO TAILANDÊS' },
  { key: 'tailandesa-3xl',        label: '3XL - TAILANDESA' },
  { key: 'tailandesa-4xl',        label: '4XL - TAILANDESA' },
];

function CustomerHeaderButton() {
  // Removido - não há mais autenticação de cliente
  return null;
}

function CatalogDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-4 py-2 text-sm font-semibold tracking-wider text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors"
      >
        CATÁLOGO
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-[#111111] border border-[#C8102E]/30 rounded-xl shadow-2xl z-[100] overflow-hidden">
          <div className="p-2">
            <Link
              href="/produtos"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[#C8102E] hover:bg-[#C8102E]/10 rounded-lg transition-colors uppercase tracking-wider"
            >
              Ver Todos os Produtos
            </Link>
            <div className="my-1 border-t border-[#222]" />
            {CATEGORIES.map(cat => (
              <Link
                key={cat.key}
                href={`/produtos?categoria=${cat.key}`}
                onClick={() => setOpen(false)}
                className="flex items-center px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors font-medium"
              >
                {cat.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileCatOpen, setMobileCatOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { itemCount, setIsOpen } = useCart();
  const [location, navigate] = useLocation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/produtos?busca=${encodeURIComponent(searchQuery.trim())}`);
      setMobileSearchOpen(false);
      setMobileOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0D0D0D] border-b border-[#C8102E]/30">
      {/* Top bar — desktop only */}
      <div className="hidden md:flex items-center justify-between px-6 py-1 bg-[#C8102E] text-white text-xs">
        <span className="font-medium tracking-wider">JUMERA SPORT — CAMISAS OFICIAIS DE TIMES E SELEÇÕES</span>
        <div className="flex items-center gap-3">
          <a href="https://instagram.com/jumerasport" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity flex items-center gap-1">
            <Instagram size={13} /> @jumerasport
          </a>
          <a href="https://facebook.com/jumerasport" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity flex items-center gap-1">
            <Facebook size={13} /> Jumera Sport
          </a>
          <a href="https://tiktok.com/@jumerasport" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity flex items-center gap-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>
            @jumerasport
          </a>
        </div>
      </div>

      {/* Main header */}
      <div className="flex items-center justify-between px-3 md:px-6 py-2.5">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0" onClick={() => setMobileOpen(false)}>
          <img src={LOGO_URL} alt="Jumera Sport" className="h-10 w-10 md:h-12 md:w-12 object-contain rounded-full" />
          <span className="font-['Bebas_Neue'] text-xl md:text-2xl text-white tracking-widest">
            JUMERA <span className="text-[#C8102E]">SPORT</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1">
          <Link
            href="/"
            className={`px-4 py-2 text-sm font-semibold tracking-wider transition-colors rounded-md ${
              location === "/" ? "text-[#C8102E] bg-[#C8102E]/10" : "text-gray-300 hover:text-white hover:bg-white/5"
            }`}
          >
            INÍCIO
          </Link>
          <CatalogDropdown />
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {/* Search — desktop */}
          <form onSubmit={handleSearch} className="hidden md:flex items-center gap-1">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar camisas..."
                className="w-40 lg:w-52 h-8 bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600 text-xs pl-8 focus:border-[#C8102E]"
              />
            </div>
          </form>

          {/* Search toggle — mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 text-gray-300 hover:text-white"
            onClick={() => setMobileSearchOpen(v => !v)}
          >
            <Search size={19} />
          </Button>

          {/* Cart */}
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 text-gray-300 hover:text-white"
            onClick={() => setIsOpen(true)}
          >
            <ShoppingCart size={19} />
            {itemCount > 0 && (
              <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center p-0 bg-[#C8102E] text-white text-[9px] rounded-full border-0 font-bold">
                {itemCount > 9 ? '9+' : itemCount}
              </Badge>
            )}
          </Button>

          {/* Customer auth */}
          <CustomerHeaderButton />

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9 text-gray-300 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {/* Mobile search bar */}
      {mobileSearchOpen && (
        <div className="md:hidden px-3 pb-2.5">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar camisas, times, seleções..."
              className="flex-1 h-9 bg-[#1A1A1A] border-[#C8102E]/50 text-white placeholder:text-gray-600 text-sm focus:border-[#C8102E]"
            />
            <Button type="submit" className="h-9 bg-[#C8102E] hover:bg-red-700 text-white px-3">
              <Search size={16} />
            </Button>
          </form>
        </div>
      )}

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-[#0D0D0D] border-t border-[#1E1E1E] max-h-[75vh] overflow-y-auto">
          <nav className="px-3 py-2">
            <Link
              href="/"
              className="flex items-center px-3 py-3 text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Início
            </Link>

            {/* Catálogo expansível */}
            <button
              onClick={() => setMobileCatOpen(v => !v)}
              className="flex items-center justify-between w-full px-3 py-3 text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <span>CATÁLOGO</span>
              <ChevronDown size={16} className={`transition-transform text-[#C8102E] ${mobileCatOpen ? "rotate-180" : ""}`} />
            </button>

            {mobileCatOpen && (
              <div className="mx-3 mb-1 bg-[#111111] rounded-xl overflow-hidden">
                <Link
                  href="/produtos"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-4 py-2.5 text-xs font-bold text-[#C8102E] border-b border-[#1E1E1E]"
                >
                  Ver Todos os Produtos →
                </Link>
                {CATEGORIES.map(cat => (
                  <Link
                    key={cat.key}
                    href={`/produtos?categoria=${cat.key}`}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center px-4 py-2.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 border-b border-[#1E1E1E] last:border-0 transition-colors"
                  >
                    {cat.label}
                  </Link>
                ))}
              </div>
            )}
          </nav>

          {/* Social + Login */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-[#1E1E1E]">
            <a href="https://instagram.com/jumerasport" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#C8102E] transition-colors">
              <Instagram size={20} />
            </a>
            <a href="https://facebook.com/jumerasport" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#C8102E] transition-colors">
              <Facebook size={20} />
            </a>
            <a href="https://tiktok.com/@jumerasport" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#C8102E] transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>
            </a>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-[#C8102E] hover:bg-[#a00d24] rounded-lg transition-colors"
            >
              <User size={14} />
              ENTRAR
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
