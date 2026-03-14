import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingCart, Search, Menu, X, Instagram, Facebook } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-logo_2dee52ef.webp";

const navLinks = [
  { label: "Início", href: "/" },
  { label: "Produtos", href: "/produtos" },
  { label: "Times", href: "/produtos?categoria=times" },
  { label: "Seleções", href: "/produtos?categoria=selecoes" },
  { label: "Retrô", href: "/produtos?categoria=retro" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
      {/* Top bar - social links */}
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
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 text-sm font-semibold tracking-wider transition-colors rounded-md ${
                location === link.href
                  ? "text-[#C8102E] bg-[#C8102E]/10"
                  : "text-gray-300 hover:text-white hover:bg-white/5"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
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

          {/* Cart */}
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

          {/* Mobile menu */}
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
        <div className="lg:hidden bg-[#111111] border-t border-[#C8102E]/20 px-4 py-4">
          <nav className="flex flex-col gap-1">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-3 text-sm font-semibold tracking-wider text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
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
          </div>
        </div>
      )}
    </header>
  );
}
