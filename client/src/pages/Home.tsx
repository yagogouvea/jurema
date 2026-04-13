import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, ArrowRight, Zap, Trophy, Users, Flag, Globe, Clock, User, Baby, Shirt, TrendingUp, Sparkles, Medal } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-logo_2dee52ef.webp";

// Default banners when no banners in DB
const defaultBanners = [
  {
    id: 1,
    title: "NOVA COLEÇÃO 2026",
    subtitle: "As melhores camisas dos times e seleções do mundo",
    imageUrl: `https://placehold.co/1400x500/0D0D0D/1B8C3D?text=JUREMA+SPORT`,
    buttonText: "Ver Coleção",
    linkUrl: "/produtos",
  },
  {
    id: 2,
    title: "SELEÇÕES DO MUNDO",
    subtitle: "Vista a camisa do seu país com orgulho",
    imageUrl: `https://placehold.co/1400x500/1A0000/1B8C3D?text=SELEÇÕES+NACIONAIS`,
    buttonText: "Ver Tailandesa",
    linkUrl: "/produtos?categoria=tailandesa",
  },
  {
    id: 3,
    title: "CAMISAS RETRÔ",
    subtitle: "Reviva os momentos históricos do futebol",
    imageUrl: `https://placehold.co/1400x500/0D0D0D/888888?text=COLEÇÃO+RETRÔ`,
    buttonText: "Ver Retrô",
    linkUrl: "/produtos?categoria=retro-tailandesa",
  },
];

function HeroBanner() {
  const { data: dbBanners } = trpc.banners.list.useQuery();
  const banners = (dbBanners && dbBanners.length > 0) ? dbBanners : defaultBanners;
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % banners.length);
    }, 5000);
  };

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length]);

  const go = (idx: number) => {
    setCurrent(idx);
    startTimer();
  };

  const banner = banners[current];

  return (
    <div className="relative w-full bg-[#0D0D0D]">
      {/* Background image — posicionada como elemento de bloco para não cortar */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${banner.imageUrl})` }}
      />
      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D0D]/90 via-[#0D0D0D]/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D]/40 via-transparent to-transparent" />

      {/* Content — define a altura real do banner */}
      <div className="relative z-10">
        <div className="container">
          <div className="py-20 sm:py-24 md:py-32 max-w-xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-0.5 bg-[#1B8C3D]" />
              <span className="text-[#1B8C3D] text-xs font-bold uppercase tracking-[0.3em]">Jurema Sport</span>
            </div>
            <h1 className="font-['Bebas_Neue'] text-4xl sm:text-5xl md:text-7xl text-white leading-none tracking-wider mb-3">
              {banner.title}
            </h1>
            {banner.subtitle && (
              <p className="text-gray-300 text-sm sm:text-base md:text-lg mb-8 leading-relaxed">
                {banner.subtitle}
              </p>
            )}
            {banner.linkUrl && (
              <Link href={banner.linkUrl}>
                <Button className="bg-[#1B8C3D] hover:bg-green-700 text-white font-bold px-6 py-3 sm:px-8 text-sm sm:text-base rounded-lg flex items-center gap-2 transition-all hover:scale-105">
                  {banner.buttonText || "Ver Produtos"}
                  <ArrowRight size={16} />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Navigation arrows */}
      {banners.length > 1 && (
        <>
          <button
            onClick={() => go((current - 1 + banners.length) % banners.length)}
            className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-[#1B8C3D] flex items-center justify-center text-white transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => go((current + 1) % banners.length)}
            className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-[#1B8C3D] flex items-center justify-center text-white transition-all"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {banners.map((_, i) => (
          <button
            key={i}
            onClick={() => go(i)}
            className={`h-1.5 rounded-full transition-all ${i === current ? 'bg-[#1B8C3D] w-8' : 'bg-white/40 w-1.5'}`}
          />
        ))}
      </div>
    </div>
  );
}

function FeaturedProducts() {
  const { data, isLoading } = trpc.products.list.useQuery({ isFeatured: true, featuredSection: 'destaque', limit: 8 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-[#111111] rounded-xl aspect-square animate-pulse" />
        ))}
      </div>
    );
  }

  const products = data?.items ?? [];

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Nenhum produto em destaque ainda.</p>
        <Link href="/admin">
          <Button variant="outline" className="border-[#1B8C3D] text-[#1B8C3D] hover:bg-[#1B8C3D] hover:text-white bg-transparent">
            Adicionar Produtos (Admin)
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map(p => (
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
  );
}

function CategorySection() {
  const categories = [
    {
      title: "1 LINHA - NACIONAL",
      subtitle: "R$30,00/at — Camisas nacionais linha básica",
      href: "/produtos?categoria=1linha-nacional",
      Icon: Flag,
      accent: "#22C55E",
      borderColor: "border-[#22C55E]/30",
      hoverBorder: "hover:border-[#22C55E]",
      bg: "bg-gradient-to-br from-[#001A0A] to-[#0D0D0D]",
      iconBg: "bg-[#22C55E]/10",
    },
    {
      title: "TAILANDESA PROMOÇÃO",
      subtitle: "R$35,00/at — Pequenas manchas, preço imperdível",
      href: "/produtos?categoria=tailandesa-promocao",
      Icon: Zap,
      accent: "#F59E0B",
      borderColor: "border-[#F59E0B]/30",
      hoverBorder: "hover:border-[#F59E0B]",
      bg: "bg-gradient-to-br from-[#1A1000] to-[#0D0D0D]",
      iconBg: "bg-[#F59E0B]/10",
    },
    {
      title: "ITENS BRASIL",
      subtitle: "Produtos exclusivos da Seleção Brasileira",
      href: "/produtos?categoria=itens-brasil",
      Icon: Flag,
      accent: "#009C3B",
      borderColor: "border-[#009C3B]/30",
      hoverBorder: "hover:border-[#009C3B]",
      bg: "bg-gradient-to-br from-[#001A08] to-[#0D0D0D]",
      iconBg: "bg-[#009C3B]/10",
    },
    {
      title: "CONJ CALOR - NACIONAL",
      subtitle: "R$50,00/at — Conjunto calor nacional",
      href: "/produtos?categoria=conj-calor-nacional",
      Icon: Users,
      accent: "#3B82F6",
      borderColor: "border-[#3B82F6]/30",
      hoverBorder: "hover:border-[#3B82F6]",
      bg: "bg-gradient-to-br from-[#001020] to-[#0D0D0D]",
      iconBg: "bg-[#3B82F6]/10",
    },
    {
      title: "CONJ CALOR TAILANDESA",
      subtitle: "R$75,00/at — Conjunto calor tailandesa",
      href: "/produtos?categoria=conj-calor-tailandesa",
      Icon: Trophy,
      accent: "#8B5CF6",
      borderColor: "border-[#8B5CF6]/30",
      hoverBorder: "hover:border-[#8B5CF6]",
      bg: "bg-gradient-to-br from-[#0D0020] to-[#0D0D0D]",
      iconBg: "bg-[#8B5CF6]/10",
    },
    {
      title: "TAILANDESA",
      subtitle: "R$80,00/at — A mais vendida da loja",
      href: "/produtos?categoria=tailandesa",
      Icon: Globe,
      accent: "#1B8C3D",
      borderColor: "border-[#1B8C3D]/30",
      hoverBorder: "hover:border-[#1B8C3D]",
      bg: "bg-gradient-to-br from-[#1A0000] to-[#0D0D0D]",
      iconBg: "bg-[#1B8C3D]/10",
    },
    {
      title: "INFANTIL",
      subtitle: "R$80,00/at — Para os pequenos torcedores",
      href: "/produtos?categoria=infantil",
      Icon: Baby,
      accent: "#EC4899",
      borderColor: "border-[#EC4899]/30",
      hoverBorder: "hover:border-[#EC4899]",
      bg: "bg-gradient-to-br from-[#1A0010] to-[#0D0D0D]",
      iconBg: "bg-[#EC4899]/10",
    },
    {
      title: "JOGADOR TAILANDESA",
      subtitle: "R$110,00/at — Qualidade de jogador",
      href: "/produtos?categoria=jogador-tailandesa",
      Icon: Medal,
      accent: "#F97316",
      borderColor: "border-[#F97316]/30",
      hoverBorder: "hover:border-[#F97316]",
      bg: "bg-gradient-to-br from-[#1A0800] to-[#0D0D0D]",
      iconBg: "bg-[#F97316]/10",
    },
    {
      title: "RETRO TAILANDESA",
      subtitle: "R$110,00/at — Clássicos históricos",
      href: "/produtos?categoria=retro-tailandesa",
      Icon: Clock,
      accent: "#B8860B",
      borderColor: "border-[#B8860B]/30",
      hoverBorder: "hover:border-[#B8860B]",
      bg: "bg-gradient-to-br from-[#1A1400] to-[#0D0D0D]",
      iconBg: "bg-[#B8860B]/10",
    },
    {
      title: "CONJ FRIO TAILANDÊS",
      subtitle: "R$180,00/at — Conjunto frio premium",
      href: "/produtos?categoria=conj-frio-tailandes",
      Icon: Shirt,
      accent: "#06B6D4",
      borderColor: "border-[#06B6D4]/30",
      hoverBorder: "hover:border-[#06B6D4]",
      bg: "bg-gradient-to-br from-[#001A1A] to-[#0D0D0D]",
      iconBg: "bg-[#06B6D4]/10",
    },
    {
      title: "TAILANDESA 3XL",
      subtitle: "Preço variado — Plus size 3XL",
      href: "/produtos?categoria=tailandesa-3xl",
      Icon: Users,
      accent: "#84CC16",
      borderColor: "border-[#84CC16]/30",
      hoverBorder: "hover:border-[#84CC16]",
      bg: "bg-gradient-to-br from-[#0A1A00] to-[#0D0D0D]",
      iconBg: "bg-[#84CC16]/10",
    },
    {
      title: "TAILANDESA 4XL",
      subtitle: "Preço variado — Plus size 4XL",
      href: "/produtos?categoria=tailandesa-4xl",
      Icon: Users,
      accent: "#A855F7",
      borderColor: "border-[#A855F7]/30",
      hoverBorder: "hover:border-[#A855F7]",
      bg: "bg-gradient-to-br from-[#0D001A] to-[#0D0D0D]",
      iconBg: "bg-[#A855F7]/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {categories.map(cat => (
        <Link key={cat.href} href={cat.href}>
          <div className={`relative overflow-hidden rounded-xl ${cat.bg} border ${cat.borderColor} ${cat.hoverBorder} p-3 md:p-6 cursor-pointer group transition-all duration-300 active:scale-95 hover:scale-[1.02] hover:shadow-2xl`}>
            {/* Decorative diagonal stripe */}
            <div className="absolute top-0 right-0 w-24 h-24 opacity-5" style={{ background: `linear-gradient(135deg, ${cat.accent} 50%, transparent 50%)` }} />
            {/* Icon */}
            <div className={`w-9 h-9 md:w-12 md:h-12 rounded-lg ${cat.iconBg} flex items-center justify-center mb-2 md:mb-4 transition-transform group-hover:scale-110`}>
              <cat.Icon size={18} style={{ color: cat.accent }} />
            </div>
            <h3 className="font-['Bebas_Neue'] text-base md:text-2xl text-white tracking-wider group-hover:text-[#1B8C3D] transition-colors leading-tight">
              {cat.title}
            </h3>
            <p className="text-gray-500 text-xs mt-0.5 mb-2 md:mb-4 hidden sm:block">{cat.subtitle}</p>
            <div className="flex items-center gap-1 text-xs md:text-sm font-semibold transition-all group-hover:gap-2 mt-1" style={{ color: cat.accent }}>
              Ver <ArrowRight size={12} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function GenderSection() {
  const genders = [
    { label: "Masculino", href: "/produtos?genero=masculino", Icon: User, desc: "Camisas para homens", tag: "MAS" },
    { label: "Feminino", href: "/produtos?genero=feminino", Icon: Shirt, desc: "Camisas femininas", tag: "FEM" },
    { label: "Infantil", href: "/produtos?genero=infantil", Icon: Baby, desc: "Para os pequenos torcedores", tag: "INF" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 md:gap-6">
      {genders.map(g => (
        <Link key={g.href} href={g.href}>
          <div className="flex flex-col items-center gap-3 p-4 md:p-6 bg-[#111111] rounded-xl border border-[#1E1E1E] hover:border-[#1B8C3D]/60 cursor-pointer group transition-all hover:scale-105 text-center relative overflow-hidden">
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#1B8C3D] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
            {/* Tag badge */}
            <span className="absolute top-2 right-2 text-[9px] font-bold text-[#1B8C3D] border border-[#1B8C3D]/30 px-1.5 py-0.5 rounded tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">
              {g.tag}
            </span>
            {/* Icon */}
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] group-hover:border-[#1B8C3D]/40 flex items-center justify-center transition-all group-hover:bg-[#1B8C3D]/10">
              <g.Icon size={20} className="text-gray-400 group-hover:text-[#1B8C3D] transition-colors" />
            </div>
            <h3 className="font-['Bebas_Neue'] text-base md:text-xl text-white tracking-wider group-hover:text-[#1B8C3D] transition-colors">
              {g.label}
            </h3>
            <p className="text-gray-600 text-xs hidden md:block">{g.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function NewArrivals() {
  const { data, isLoading } = trpc.products.list.useQuery({ orderBy: 'newest', limit: 4 });
  const products = data?.items ?? [];

  if (isLoading || products.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {products.map(p => (
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
  );
}

function BestSellers() {
  const { data, isLoading } = trpc.products.list.useQuery({ isFeatured: true, featuredSection: 'mais-vendidos', limit: 8 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-[#111111] rounded-xl aspect-square animate-pulse" />
        ))}
      </div>
    );
  }

  const products = data?.items ?? [];
  if (products.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((p, idx) => (
        <div key={p.id} className="relative">
          {/* Ranking badge para top 3 */}
          {idx < 3 && (
            <div className={`absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold shadow-lg ${
              idx === 0 ? 'bg-yellow-500 text-black' :
              idx === 1 ? 'bg-gray-300 text-black' :
              'bg-amber-700 text-white'
            }`}>
              <Medal size={10} />
              #{idx + 1}
            </div>
          )}
          <ProductCard
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
        </div>
      ))}
    </div>
  );
}

function NewCollection() {
  const { data, isLoading } = trpc.products.list.useQuery({ isFeatured: true, featuredSection: 'nova-colecao', limit: 8 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-[#111111] rounded-xl aspect-square animate-pulse" />
        ))}
      </div>
    );
  }

  const products = data?.items ?? [];
  if (products.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((p, idx) => (
        <div key={p.id} className="relative">
          {idx < 4 && (
            <div className="absolute top-2 right-2 z-10 bg-[#1B8C3D] text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider shadow-lg">
              NOVO
            </div>
          )}
          <ProductCard
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
        </div>
      ))}
    </div>
  );
}

function StatsBar() {
  return (
    <div className="bg-[#1B8C3D] py-4">
      <div className="container">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-white" />
              <span className="font-['Bebas_Neue'] text-2xl text-white tracking-wider">500+</span>
            </div>
            <span className="text-green-200 text-xs">Produtos</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-white" />
              <span className="font-['Bebas_Neue'] text-2xl text-white tracking-wider">10K+</span>
            </div>
            <span className="text-green-200 text-xs">Clientes</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-white" />
              <span className="font-['Bebas_Neue'] text-2xl text-white tracking-wider">24H</span>
            </div>
            <span className="text-green-200 text-xs">Entrega Express</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0D0D0D]">
      {/* Hero Banner */}
      <HeroBanner />

      {/* Stats Bar */}
      <StatsBar />

      {/* Featured Products */}
      <section className="py-8 md:py-16">
        <div className="container">
          <div className="flex items-center justify-between mb-5 md:mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-0.5 bg-[#1B8C3D]" />
                <span className="text-[#1B8C3D] text-xs font-bold uppercase tracking-[0.3em]">Selecionados</span>
              </div>
              <h2 className="font-['Bebas_Neue'] text-2xl md:text-4xl text-white tracking-wider">PRODUTOS EM DESTAQUE</h2>
            </div>
            <Link href="/produtos">
              <Button variant="outline" className="hidden md:flex border-[#1B8C3D]/50 text-[#1B8C3D] hover:bg-[#1B8C3D] hover:text-white bg-transparent gap-2">
                Ver todos <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
          <FeaturedProducts />
          <div className="mt-6 text-center md:hidden">
            <Link href="/produtos">
              <Button className="bg-[#1B8C3D] hover:bg-green-700 text-white">Ver todos os produtos</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-8 md:py-12 bg-[#0A0A0A]">
        <div className="container">
          <div className="mb-5 md:mb-8">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-0.5 bg-[#1B8C3D]" />
              <span className="text-[#1B8C3D] text-xs font-bold uppercase tracking-[0.3em]">Explore</span>
            </div>
            <h2 className="font-['Bebas_Neue'] text-2xl md:text-4xl text-white tracking-wider">CATEGORIAS</h2>
          </div>
          <CategorySection />
        </div>
      </section>

      {/* Gender Section */}
      <section className="py-8 md:py-12">
        <div className="container">          <div className="mb-5 md:mb-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className="w-6 h-0.5 bg-[#1B8C3D]" />
              <span className="text-[#1B8C3D] text-xs font-bold uppercase tracking-[0.3em]">Para todos</span>
              <div className="w-6 h-0.5 bg-[#1B8C3D]" />
            </div>
            <h2 className="font-['Bebas_Neue'] text-2xl md:text-4xl text-white tracking-wider">COMPRE POR GÊNERO</h2>
          </div>
          <GenderSection />
        </div>
      </section>

      {/* Mais Vendidos */}
      <section className="py-8 md:py-16 bg-[#0A0A0A]">
        <div className="container">
          <div className="flex items-center justify-between mb-5 md:mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-[#1B8C3D]" />
                <span className="text-[#1B8C3D] text-xs font-bold uppercase tracking-[0.3em]">Campeões de venda</span>
              </div>
              <h2 className="font-['Bebas_Neue'] text-2xl md:text-4xl text-white tracking-wider">MAIS VENDIDOS</h2>
            </div>
            <Link href="/produtos?ordem=bestseller">
              <Button variant="outline" className="hidden md:flex border-[#1B8C3D]/50 text-[#1B8C3D] hover:bg-[#1B8C3D] hover:text-white bg-transparent gap-2">
                Ver todos <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
          <BestSellers />
          <div className="mt-6 text-center md:hidden">
            <Link href="/produtos?ordem=bestseller">
              <Button className="bg-[#1B8C3D] hover:bg-green-700 text-white">Ver todos os mais vendidos</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Nova Coleção */}
      <section className="py-8 md:py-16">
        <div className="container">
          <div className="flex items-center justify-between mb-5 md:mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="text-[#1B8C3D]" />
                <span className="text-[#1B8C3D] text-xs font-bold uppercase tracking-[0.3em]">Recém chegados</span>
              </div>
              <h2 className="font-['Bebas_Neue'] text-2xl md:text-4xl text-white tracking-wider">NOVA COLEÇÃO</h2>
            </div>
            <Link href="/produtos?ordem=newest">
              <Button variant="outline" className="hidden md:flex border-[#1B8C3D]/50 text-[#1B8C3D] hover:bg-[#1B8C3D] hover:text-white bg-transparent gap-2">
                Ver todas <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
          <NewCollection />
          <div className="mt-6 text-center md:hidden">
            <Link href="/produtos?ordem=newest">
              <Button className="bg-[#1B8C3D] hover:bg-green-700 text-white">Ver nova coleção completa</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Promo Banner */}
      <section className="py-12">
        <div className="container">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1B8C3D] to-[#8B0000] p-8 md:p-12 text-center">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-40 h-40 rounded-full bg-white -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute bottom-0 right-0 w-60 h-60 rounded-full bg-white translate-x-1/2 translate-y-1/2" />
            </div>
            <div className="relative">
              <img src={LOGO_URL} alt="Jurema Sport" className="h-16 w-16 mx-auto mb-4 rounded-full" />
              <h2 className="font-['Bebas_Neue'] text-4xl md:text-5xl text-white tracking-wider mb-2">
                FRETE GRÁTIS
              </h2>
              <p className="text-green-200 text-lg mb-6">Em compras acima de R$ 200,00</p>
              <Link href="/produtos">
                <Button className="bg-white text-[#1B8C3D] hover:bg-gray-100 font-bold px-8 py-3 text-base">
                  Aproveitar Agora
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
