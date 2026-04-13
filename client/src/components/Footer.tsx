import { Link } from "wouter";
import { Instagram, Facebook, Mail, Phone, MapPin, Shield, Truck, CreditCard } from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-logo_2dee52ef.webp";

export default function Footer() {
  return (
    <footer className="bg-[#0A0A0A] border-t border-[#1B8C3D]/20 mt-16">
      {/* Trust badges */}
      <div className="border-b border-[#1A1A1A]">
        <div className="container py-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <div className="w-10 h-10 rounded-full bg-[#1B8C3D]/10 flex items-center justify-center flex-shrink-0">
                <Truck size={20} className="text-[#1B8C3D]" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Entrega Rápida</p>
                <p className="text-gray-500 text-xs">Para todo o Brasil</p>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center">
              <div className="w-10 h-10 rounded-full bg-[#1B8C3D]/10 flex items-center justify-center flex-shrink-0">
                <Shield size={20} className="text-[#1B8C3D]" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Compra Segura</p>
                <p className="text-gray-500 text-xs">Dados protegidos</p>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center sm:justify-end">
              <div className="w-10 h-10 rounded-full bg-[#1B8C3D]/10 flex items-center justify-center flex-shrink-0">
                <CreditCard size={20} className="text-[#1B8C3D]" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Pague com Facilidade</p>
                <p className="text-gray-500 text-xs">PIX, Cartão e Boleto</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="container py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <img src={LOGO_URL} alt="Jurema Sport" className="h-12 w-12 object-contain rounded-full" />
              <span className="font-['Bebas_Neue'] text-xl text-white tracking-widest">
                JUREMA <span className="text-[#1B8C3D]">SPORT</span>
              </span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed mb-4">
              Sua loja de camisas de times e seleções. Qualidade, estilo e paixão pelo futebol.
            </p>
            <div className="flex items-center gap-3">
              <a href="https://instagram.com/jumerasport" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-[#1A1A1A] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1B8C3D] transition-all">
                <Instagram size={16} />
              </a>
              <a href="https://facebook.com/jumerasport" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-[#1A1A1A] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1B8C3D] transition-all">
                <Facebook size={16} />
              </a>
              <a href="https://tiktok.com/@jumerasport" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-[#1A1A1A] flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1B8C3D] transition-all">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-['Bebas_Neue'] text-lg text-white tracking-wider mb-4">Categorias</h4>
            <ul className="space-y-2">
              {[
                { label: "Times Brasileiros", href: "/produtos?categoria=times" },
                { label: "Seleções", href: "/produtos?categoria=selecoes" },
                { label: "Camisas Retrô", href: "/produtos?categoria=retro" },
                { label: "Masculino", href: "/produtos?genero=masculino" },
                { label: "Feminino", href: "/produtos?genero=feminino" },
                { label: "Infantil", href: "/produtos?genero=infantil" },
              ].map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-gray-500 hover:text-[#1B8C3D] text-sm transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-['Bebas_Neue'] text-lg text-white tracking-wider mb-4">Informações</h4>
            <ul className="space-y-2">
              {[
                { label: "Sobre Nós", href: "/sobre" },
                { label: "Política de Troca", href: "/trocas" },
                { label: "Política de Privacidade", href: "/privacidade" },
                { label: "Termos de Uso", href: "/termos" },
                { label: "Rastrear Pedido", href: "/rastrear" },
              ].map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-gray-500 hover:text-[#1B8C3D] text-sm transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-['Bebas_Neue'] text-lg text-white tracking-wider mb-4">Contato</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-gray-500 text-sm">
                <Phone size={15} className="text-[#1B8C3D] mt-0.5 flex-shrink-0" />
                <span>(00) 00000-0000</span>
              </li>
              <li className="flex items-start gap-2 text-gray-500 text-sm">
                <Mail size={15} className="text-[#1B8C3D] mt-0.5 flex-shrink-0" />
                <span>contato@jumerasport.com.br</span>
              </li>
              <li className="flex items-start gap-2 text-gray-500 text-sm">
                <MapPin size={15} className="text-[#1B8C3D] mt-0.5 flex-shrink-0" />
                <span>Brasil</span>
              </li>
            </ul>
            {/* Payment methods */}
            <div className="mt-5">
              <p className="text-gray-600 text-xs mb-2">Formas de pagamento:</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-[#1A1A1A] text-gray-400 text-xs px-2 py-1 rounded">PIX</span>
                <span className="bg-[#1A1A1A] text-gray-400 text-xs px-2 py-1 rounded">Cartão</span>
                <span className="bg-[#1A1A1A] text-gray-400 text-xs px-2 py-1 rounded">Boleto</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#1A1A1A] py-4">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-gray-600 text-xs text-center sm:text-left">
            © {new Date().getFullYear()} Jurema Sport. Todos os direitos reservados.
          </p>
          <p className="text-gray-700 text-xs">
            Desenvolvido com paixão pelo futebol
          </p>
        </div>
      </div>
    </footer>
  );
}
