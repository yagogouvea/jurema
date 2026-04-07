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

// Categorias reais do catálogo
const CATEGORIES = [
  { key: '1linha-nacional',       label: 'R$30,00/at - 1 LINHA - NACIONAL' },
  { key: 'tailandesa-promocao',   label: 'R$35,00/at - TAILANDESA Promoção (PEQUENAS MANCHAS)' },
  { key: 'conj-calor-nacional',   label: 'R$50,00/at - CONJ CALOR - NACIONAL' },
  { key: 'conj-calor-tailandesa', label: 'R$75,00/at - CONJ CALOR TAILANDESA' },
  { key: 'tailandesa',            label: 'R$80,00/at - TAILANDESA' },
  { key: 'infantil',              label: 'R$80,00/at Infantil' },
  { key: 'jogador-tailandesa',    label: 'R$110,00/at - JOGADOR TAILANDESA' },
  { key: 'retro-tailandesa',      label: 'R$110,00/at - RETRO TAILANDESA' },
  { key: 'conj-frio-tailandes',   label: 'R$180,00/at - CONJ FRIO TAILANDÊS' },
  { key: 'tailandesa-3xl',        label: 'R$variado - tailandesa 3XL' },
  { key: 'tailandesa-4xl',        label: 'R$variados - tailandesa 4XL' },
];

function CustomerHeaderButton() {
  const { customer, isAuthenticated } = useCustomerAuth();
  const logout = trpc.customerAuth.logout.useMutation({
    onSuccess: () => {
      toast.success("Logout realizado com sucesso!");
      window.location.href = "/";
    },
  });

  if (isAuthenticated && customer) {
    return (
      <div className="hidden sm:flex items-center gap-1">
        <Link
          href="/minha-conta"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-colors"
        >
          <User size={14} className="text-[#C8102E]" />
          <span className="max-w-[80px] truncate">{customer.name.split(" ")[0]}</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-gray-500 hover:text-red-400"
          onClick={() => logout.mutate()}
          title="Sair"
        >
          <LogOut size={14} />
        </Button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#a00d24] rounded-md transition-colors"
    >
      <User size={14} />
      ENTRAR
    </Link>
  );
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
        <div className="absolute top-full left-0 mt-1 w-80 bg-[#111111] border border-[#C8102E]/30 rounded-xl shadow-2xl z-[100] overflow-hidden">
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
                className="flex items-center justify-between px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors group"
              >
                <span className="group-hover:text-[#C8102E] transition-colors font-medium">{cat.label}</span>
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileCatOpen, setMobileCatOpen] = useState(false);
  const { itemCount, setIsOpen } = useCart();
  const [location, navigate] = useLocation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/produtos?busca=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0D0D0D] border-b border-[#C8102E]/30">
      {/* Top bar */}
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
      <div className="flex items-center justify-between px-4 md:px-6 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <img src={LOGO_URL} alt="Jumera Sport" className="h-12 w-12 object-contain rounded-full" />
          <span className="hidden sm:block font-['Bebas_Neue'] text-2xl text-white tracking-widest">
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
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <Input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar camisas..."
                className="w-40 md:w-56 h-8 bg-[#1A1A1A] border-[#C8102E]/50 text-white placeholder:text-gray-500 text-sm"
              />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={() => setSearchOpen(false)}>
                <X size={16} />
              </Button>
            </form>
          ) : (
            <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white" onClick={() => setSearchOpen(true)}>
              <Search size={20} />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="relative text-gray-300 hover:text-white"
            onClick={() => setIsOpen(true)}
          >
            <ShoppingCart size={20} />
            {itemCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-[#C8102E] text-white text-xs rounded-full border-0">
                {itemCount > 9 ? '9+' : itemCount}
              </Badge>
            )}
          </Button>

          <CustomerHeaderButton />

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-gray-300 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-[#111111] border-t border-[#C8102E]/20 px-4 py-4 max-h-[80vh] overflow-y-auto">
          <nav className="flex flex-col gap-1">
            <Link
              href="/"
              className="px-4 py-3 text-sm font-semibold tracking-wider text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Início
            </Link>

            {/* Catálogo expansível no mobile */}
            <button
              onClick={() => setMobileCatOpen(v => !v)}
              className="flex items-center justify-between px-4 py-3 text-sm font-semibold tracking-wider text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors w-full text-left"
            >
              <span>CATÁLOGO</span>
              <ChevronDown size={14} className={`transition-transform ${mobileCatOpen ? "rotate-180" : ""}`} />
            </button>

            {mobileCatOpen && (
              <div className="ml-4 flex flex-col gap-0.5 border-l border-[#C8102E]/20 pl-3">
                <Link
                  href="/produtos"
                  onClick={() => setMobileOpen(false)}
                  className="py-2 text-xs font-bold text-[#C8102E] hover:text-red-400 transition-colors"
                >
                  Ver Todos os Produtos
                </Link>
                {CATEGORIES.map(cat => (
                  <Link
                    key={cat.key}
                    href={`/produtos?categoria=${cat.key}`}
                    onClick={() => setMobileOpen(false)}
                    className="py-2 text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    {cat.label}
                  </Link>
                ))}
              </div>
            )}
          </nav>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#333]">
            <a href="https://instagram.com/jumerasport" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#C8102E] transition-colors">
              <Instagram size={20} />
            </a>
            <a href="https://facebook.com/jumerasport" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#C8102E] transition-colors">
              <Facebook size={20} />
            </a>
            <a href="https://tiktok.com/@jumerasport" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#C8102E] transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>
            </a>
            {/* Login no mobile */}
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#a00d24] rounded-md transition-colors"
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
