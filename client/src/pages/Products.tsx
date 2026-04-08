import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Filter, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  { value: "all",                  label: "Todas as Categorias" },
  { value: "1linha-nacional",       label: "R$30,00/at - 1 LINHA - NACIONAL" },
  { value: "tailandesa-promocao",   label: "R$35,00/at - TAILANDESA Promoção (PEQUENAS MANCHAS)" },
  { value: "itens-brasil",          label: "ITENS BRASIL" },
  { value: "conj-calor-nacional",   label: "R$50,00/at - CONJ CALOR - NACIONAL" },
  { value: "conj-calor-tailandesa", label: "R$75,00/at - CONJ CALOR TAILANDESA" },
  { value: "tailandesa",            label: "R$80,00/at - TAILANDESA" },
  { value: "infantil",              label: "R$80,00/at Infantil" },
  { value: "jogador-tailandesa",    label: "R$110,00/at - JOGADOR TAILANDESA" },
  { value: "retro-tailandesa",      label: "R$110,00/at - RETRO TAILANDESA" },
  { value: "conj-frio-tailandes",   label: "R$180,00/at - CONJ FRIO TAILANDÊS" },
  { value: "tailandesa-3xl",        label: "R$variado - tailandesa 3XL" },
  { value: "tailandesa-4xl",        label: "R$variados - tailandesa 4XL" },
];

const GENDERS = [
  { value: "all", label: "Todos os Gêneros" },
  { value: "masculino", label: "Masculino" },
  { value: "feminino", label: "Feminino" },
  { value: "infantil", label: "Infantil" },
];

const ORDER_OPTIONS = [
  { value: "featured", label: "Destaques" },
  { value: "newest", label: "Mais Recentes" },
  { value: "sales", label: "Mais Vendidos" },
  { value: "price_asc", label: "Menor Preço" },
  { value: "price_desc", label: "Maior Preço" },
];

function parseSearch(search: string) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    categoria: params.get('categoria') || 'all',
    genero: params.get('genero') || 'all',
    busca: params.get('busca') || '',
    ordem: params.get('ordem') || 'featured',
  };
}

export default function Products() {
  const [location] = useLocation();
  const searchStr = typeof window !== 'undefined' ? window.location.search : '';
  const initial = parseSearch(searchStr);

  const [category, setCategory] = useState(initial.categoria);
  const [gender, setGender] = useState(initial.genero);
  const [search, setSearch] = useState(initial.busca);
  const [orderBy, setOrderBy] = useState(initial.ordem);
  const [page, setPage] = useState(0);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const LIMIT = 16;

  // Sync with URL params
  useEffect(() => {
    const params = parseSearch(window.location.search);
    setCategory(params.categoria);
    setGender(params.genero);
    setSearch(params.busca);
    setOrderBy(params.ordem);
    setPage(0);
  }, [location]);

  const { data, isLoading } = trpc.products.list.useQuery({
    category: category !== 'all' ? category : undefined,
    gender: gender !== 'all' ? gender : undefined,
    search: search || undefined,
    orderBy,
    limit: LIMIT,
    offset: page * LIMIT,
  });

  const products = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const clearFilters = () => {
    setCategory('all');
    setGender('all');
    setSearch('');
    setOrderBy('featured');
    setPage(0);
  };

  const hasFilters = category !== 'all' || gender !== 'all' || search !== '';

  const FilterPanel = () => (
    <div className="space-y-5">
      <div>
        <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">Buscar</label>
        <Input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Nome do time ou seleção..."
          className="bg-[#1A1A1A] border-[#333] text-white placeholder:text-gray-600 text-sm"
        />
      </div>

      <div>
        <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">Categoria</label>
        <div className="space-y-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => { setCategory(cat.value); setPage(0); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                category === cat.value
                  ? 'bg-[#C8102E] text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">Gênero</label>
        <div className="space-y-1">
          {GENDERS.map(g => (
            <button
              key={g.value}
              onClick={() => { setGender(g.value); setPage(0); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                gender === g.value
                  ? 'bg-[#C8102E] text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {hasFilters && (
        <Button
          variant="outline"
          size="sm"
          onClick={clearFilters}
          className="w-full border-[#333] text-gray-400 hover:text-white hover:border-[#555] bg-transparent text-xs"
        >
          <X size={12} className="mr-1" /> Limpar Filtros
        </Button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0D0D0D] pt-20">
      {/* Page header */}
      <div className="bg-[#0A0A0A] border-b border-[#1E1E1E] py-8">
        <div className="container">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-0.5 bg-[#C8102E]" />
            <span className="text-[#C8102E] text-xs font-bold uppercase tracking-[0.3em]">Loja</span>
          </div>
          <h1 className="font-['Bebas_Neue'] text-4xl md:text-5xl text-white tracking-wider">
            {category === 'times' ? 'TIMES BRASILEIROS' :
             category === 'selecoes' ? 'SELEÇÕES NACIONAIS' :
             category === 'retro' ? 'COLEÇÃO RETRÔ' : 'TODOS OS PRODUTOS'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {total > 0 ? `${total} produto${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}` : 'Nenhum produto encontrado'}
          </p>
        </div>
      </div>

      <div className="container py-8">
        {/* Mobile filter toggle */}
        <div className="flex items-center justify-between gap-3 mb-6 lg:hidden">
          <Button
            variant="outline"
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className="border-[#333] text-gray-300 hover:text-white bg-transparent gap-2"
          >
            <SlidersHorizontal size={16} />
            Filtros {hasFilters && <span className="bg-[#C8102E] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">!</span>}
          </Button>
          <Select value={orderBy} onValueChange={v => { setOrderBy(v); setPage(0); }}>
            <SelectTrigger className="w-44 bg-[#1A1A1A] border-[#333] text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1A1A1A] border-[#333]">
              {ORDER_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-gray-300 focus:bg-[#C8102E] focus:text-white">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mobile filters */}
        {mobileFiltersOpen && (
          <div className="lg:hidden bg-[#111111] rounded-xl p-4 mb-6 border border-[#1E1E1E]">
            <FilterPanel />
          </div>
        )}

        <div className="flex gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="bg-[#111111] rounded-xl p-4 border border-[#1E1E1E] sticky top-24">
              <div className="flex items-center gap-2 mb-4">
                <Filter size={16} className="text-[#C8102E]" />
                <h3 className="font-['Bebas_Neue'] text-lg text-white tracking-wider">FILTROS</h3>
              </div>
              <FilterPanel />
            </div>
          </aside>

          {/* Products grid */}
          <div className="flex-1 min-w-0">
            {/* Desktop sort */}
            <div className="hidden lg:flex items-center justify-between mb-6">
              <p className="text-gray-500 text-sm">{total} produtos</p>
              <Select value={orderBy} onValueChange={v => { setOrderBy(v); setPage(0); }}>
                <SelectTrigger className="w-48 bg-[#1A1A1A] border-[#333] text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A1A1A] border-[#333]">
                  {ORDER_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-gray-300 focus:bg-[#C8102E] focus:text-white">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-[#111111] rounded-xl aspect-[3/4] animate-pulse" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="text-6xl">😕</div>
                <p className="text-gray-400 font-semibold text-lg">Nenhum produto encontrado</p>
                <p className="text-gray-600 text-sm">Tente ajustar os filtros</p>
                <Button onClick={clearFilters} className="bg-[#C8102E] hover:bg-red-700 text-white">
                  Limpar Filtros
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-10">
                    <Button
                      variant="outline"
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                      className="border-[#333] text-gray-400 hover:text-white bg-transparent"
                    >
                      Anterior
                    </Button>
                    <span className="text-gray-500 text-sm px-4">
                      Página {page + 1} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                      className="border-[#333] text-gray-400 hover:text-white bg-transparent"
                    >
                      Próxima
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
