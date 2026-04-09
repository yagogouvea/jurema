import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, ChevronRight,
  Package, Users, ArrowRight, X, Tag, Filter, ChevronLeft, ChevronRight as ChevronRightIcon,
  RefreshCw, Bell
} from "lucide-react";
import PdvLayout from "./PdvLayout";
import PdvCheckout from "./PdvCheckout";

interface CartItem {
  productId?: number;
  linha: string;
  modelo: string;
  time: string;
  descricao?: string;
  tamanho: string;
  quantidade: number;
  precoUnitario: number;
  totalItem: number;
}

export default function PdvMain() {
  const { seller, isAdmin } = usePdvAuth();
  const utils = trpc.useUtils();

  // Modal de sincronização
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncPreview, setSyncPreview] = useState<any>(null);
  const [syncResult, setSyncResult] = useState<any>(null);

  const { data: previewData, isLoading: isLoadingPreview, refetch: refetchPreview } = trpc.pdvSync.preview.useQuery(
    undefined,
    { enabled: showSyncModal && isAdmin, staleTime: 0 }
  );

  const { data: unreadData } = trpc.pdvNotifications.unreadCount.useQuery(
    undefined,
    { enabled: isAdmin, refetchInterval: 30000 }
  );

  const syncMutation = trpc.pdvSync.sync.useMutation({
    onSuccess: (data) => {
      setSyncResult(data);
      utils.pdvProducts.list.invalidate();
      utils.pdvNotifications.unreadCount.invalidate();
      toast.success(`Sincronização concluída! ${data.inseridos} novos, ${data.atualizados} atualizados.`);
    },
    onError: (err) => {
      toast.error(`Erro na sincronização: ${err.message}`);
    },
  });

  useEffect(() => {
    if (previewData) setSyncPreview(previewData);
  }, [previewData]);

  const handleOpenSync = () => {
    setSyncPreview(null);
    setSyncResult(null);
    setShowSyncModal(true);
  };

  const handleSync = () => {
    syncMutation.mutate({ confirmar: true });
  };
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedLinha, setSelectedLinha] = useState("");
  const [apenasComEstoque, setApenasComEstoque] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 60;

  // Debounce search input — espera 350ms antes de disparar a query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Resetar para página 1 quando filtros mudam
  useEffect(() => { setPage(1); }, [debouncedSearch, selectedLinha, apenasComEstoque]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [canal, setCanal] = useState<"BALCAO" | "WHATSAPP">("BALCAO");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCart, setShowCart] = useState(false);
  // null = automático (baseado em quantidade), "ATACADO" ou "VAREJO" = forçado manualmente
  const [regimeManual, setRegimeManual] = useState<"ATACADO" | "VAREJO" | null>(null);

  // Fetch products — usa debouncedSearch para evitar queries a cada tecla
  // safePage/safeLimit garantem inteiros válidos mesmo em renders intermediários
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(PAGE_SIZE) && PAGE_SIZE >= 1 ? Math.floor(PAGE_SIZE) : 60;
  const { data: productsData, isLoading } = trpc.pdvProducts.list.useQuery({
    search: debouncedSearch || undefined,
    linha: selectedLinha || undefined,
    apenasComEstoque: apenasComEstoque || undefined,
    page: safePage,
    limit: safeLimit,
  }, {
    // Mantém dados anteriores enquanto carrega novos (evita flash de "nenhum produto")
    placeholderData: (prev) => prev,
  });

  const { data: linhas } = trpc.pdvProducts.getLinhas.useQuery();

  const products = productsData?.products || [];

  // Cart calculations
  const totalPecas = useMemo(() => cart.reduce((sum, item) => sum + item.quantidade, 0), [cart]);
  const regimeAuto = useMemo(() => totalPecas >= 6 ? "ATACADO" : "VAREJO", [totalPecas]);
  // Regime efetivo: manual tem prioridade, senão usa automático
  const regime = regimeManual ?? regimeAuto;
  const isRegimeManual = regimeManual !== null;
  
  const totalCart = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.totalItem, 0);
  }, [cart]);

  const addToCart = useCallback((product: any, tamanho: string) => {
    if (product.estoque <= 0) {
      toast.error("Produto sem estoque");
      return;
    }
    
    const precoAtacado = parseFloat(product.precoAtacado) || 0;
    const precoVarejo = parseFloat(product.precoVarejo) || 0;
    
    setCart(prev => {
      const existing = prev.find(
        item => item.productId === product.id && item.tamanho === tamanho
      );
      
      if (existing) {
        // Validar limite de estoque ao incrementar
        const novaQtd = existing.quantidade + 1;
        if (novaQtd > product.estoque) {
          toast.error(`Estoque insuficiente! Disponível: ${product.estoque} un.`);
          return prev;
        }
        return prev.map(item =>
          item.productId === product.id && item.tamanho === tamanho
            ? { ...item, quantidade: novaQtd, totalItem: novaQtd * item.precoUnitario }
            : item
        );
      }
      
      // Use varejo price initially (will be recalculated based on regime)
      const precoUnitario = precoVarejo;
      
      return [...prev, {
        productId: product.id,
        linha: product.linha,
        modelo: product.modelo,
        time: product.time,
        descricao: product.descricao,
        tamanho,
        quantidade: 1,
        precoUnitario,
        totalItem: precoUnitario,
      }];
    });
    
    toast.success(`${product.time} (${tamanho}) adicionado`);
  }, []);

  // Recalculate prices when regime changes
  const cartWithPrices = useMemo(() => {
    return cart.map(item => {
      // Find product to get atacado price
      const product = products.find(p => p.id === item.productId);
      if (!product) return item;
      
      const precoAtacado = parseFloat(product.precoAtacado) || 0;
      const precoVarejo = parseFloat(product.precoVarejo) || 0;
      const precoUnitario = regime === "ATACADO" ? precoAtacado : precoVarejo;
      
      return {
        ...item,
        precoUnitario,
        totalItem: item.quantidade * precoUnitario,
      };
    });
  }, [cart, regime, products]);

  const totalAtacado = useMemo(() => {
    return cart.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return sum + item.totalItem;
      return sum + item.quantidade * (parseFloat(product.precoAtacado) || 0);
    }, 0);
  }, [cart, products]);

  const totalVarejo = useMemo(() => {
    return cart.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return sum + item.totalItem;
      return sum + item.quantidade * (parseFloat(product.precoVarejo) || 0);
    }, 0);
  }, [cart, products]);

  const totalAplicado = regime === "ATACADO" ? totalAtacado : totalVarejo;

  const updateQuantity = (index: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantidade + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        // Validar limite de estoque ao incrementar
        if (delta > 0 && item.productId) {
          const product = products.find(p => p.id === item.productId);
          if (product && newQty > product.estoque) {
            toast.error(`Estoque insuficiente! Disponível: ${product.estoque} un.`);
            return prev;
          }
        }
        updated[index] = {
          ...updated[index],
          quantidade: newQty,
          totalItem: newQty * updated[index].precoUnitario,
        };
      }
      return updated;
    });
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
    setClienteNome("");
    setClienteTelefone("");
  };

  const handleCheckout = () => {
    if (cartWithPrices.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }
    setShowCheckout(true);
  };

  // Group products by time for display
  const groupedProducts = useMemo(() => {
    const groups: Record<string, any[]> = {};
    products.forEach(p => {
      if (!groups[p.time]) groups[p.time] = [];
      groups[p.time].push(p);
    });
    return groups;
  }, [products]);

  if (showCheckout) {
    return (
      <PdvLayout>
        <PdvCheckout
          cart={cartWithPrices}
          canal={canal}
          clienteNome={clienteNome}
          clienteTelefone={clienteTelefone}
          regime={regime}
          totalVarejo={totalVarejo}
          totalAtacado={totalAtacado}
          totalAplicado={totalAplicado}
          onBack={() => setShowCheckout(false)}
          onSuccess={() => {
            clearCart();
            setShowCheckout(false);
            toast.success("Pedido finalizado com sucesso!");
          }}
        />
      </PdvLayout>
    );
  }

  return (
    <PdvLayout>
      <div className="flex h-[calc(100vh-0px)] lg:h-screen overflow-hidden">
        {/* Products Panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="bg-gray-900 border-b border-gray-800 p-4">
            <div className="flex items-center gap-3 mb-3">
              {/* Canal selector */}
              <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setCanal("BALCAO")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    canal === "BALCAO"
                      ? "bg-red-600 text-white shadow-lg"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Balcao
                </button>
                <button
                  onClick={() => setCanal("WHATSAPP")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    canal === "WHATSAPP"
                      ? "bg-green-600 text-white shadow-lg"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  WhatsApp
                </button>
              </div>

              {/* Regime toggle: Atacado / Varejo */}
              <div className="flex flex-col gap-0.5">
                <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
                  <button
                    onClick={() => setRegimeManual("ATACADO")}
                    title="Forçar Atacado (independente da quantidade)"
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      regime === "ATACADO"
                        ? "bg-blue-600 text-white shadow-lg"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Atacado
                  </button>
                  <button
                    onClick={() => setRegimeManual("VAREJO")}
                    title="Forçar Varejo (independente da quantidade)"
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      regime === "VAREJO"
                        ? "bg-orange-600 text-white shadow-lg"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Varejo
                  </button>
                  {isRegimeManual && (
                    <button
                      onClick={() => setRegimeManual(null)}
                      title="Voltar para modo automático (≥6 peças = Atacado)"
                      className="px-2 py-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-all text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-center text-gray-600" style={{fontSize: '10px'}}>
                  {isRegimeManual ? "⚠️ manual" : "⚙️ auto"}
                </span>
              </div>

              {/* Client info */}
              <input
                type="text"
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Nome do cliente (opcional)"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
              <input
                type="text"
                value={clienteTelefone}
                onChange={(e) => setClienteTelefone(e.target.value)}
                placeholder="Telefone"
                className="w-40 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
              />

              {/* Botões admin: Sync + Notificações */}
              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleOpenSync}
                    title="Sincronizar catálogo com Google Sheets"
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-blue-900/50 border border-gray-700 hover:border-blue-600 rounded-xl text-gray-400 hover:text-blue-300 transition-all text-xs font-medium"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sync</span>
                  </button>
                  <a
                    href="/pdv/notificacoes"
                    title="Notificações do PDV"
                    className="relative flex items-center justify-center w-9 h-9 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 rounded-xl text-gray-400 hover:text-white transition-all"
                  >
                    <Bell className="w-4 h-4" />
                    {(unreadData?.count ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                        {unreadData!.count > 99 ? "99+" : unreadData!.count}
                      </span>
                    )}
                  </a>
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por time, modelo, código..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-10 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Linha filter + Filtro de estoque */}
            <div className="flex gap-1.5 flex-wrap items-center">
              <button
                onClick={() => setSelectedLinha("")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedLinha === ""
                    ? "bg-red-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
                }`}
              >
                Todas
              </button>
              {linhas?.map(l => (
                <button
                  key={l}
                  onClick={() => setSelectedLinha(selectedLinha === l ? "" : l)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedLinha === l
                      ? "bg-red-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
                  }`}
                >
                  {l}
                </button>
              ))}
              {/* Filtro: apenas com estoque */}
              <button
                onClick={() => setApenasComEstoque(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                  apenasComEstoque
                    ? "bg-green-700 text-white border border-green-600"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
                }`}
                title="Mostrar apenas produtos com estoque disponível"
              >
                <Package className="w-3 h-3" />
                Com estoque
              </button>
              {/* Indicador de busca ativa */}
              {(search || selectedLinha || apenasComEstoque) && (
                <span className="ml-auto text-xs text-gray-500 self-center">
                  {productsData?.total ?? 0} resultado{(productsData?.total ?? 0) !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                <Package className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Nenhum produto encontrado</p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="mt-2 text-red-400 text-sm hover:text-red-300"
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 space-y-4">
                {Object.entries(groupedProducts).map(([time, timeProducts]) => (
                  <div key={time}>
                    <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 bg-red-500 rounded-full" />
                      {time}
                      <span className="text-gray-600">({timeProducts.length})</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {timeProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          regime={regime}
                          onAdd={addToCart}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Paginação — mantém filtros ativos */}
            {productsData && productsData.totalPages > 1 && (
              <div className="sticky bottom-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 py-3 mt-4 flex items-center justify-between gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(7, productsData.totalPages) }, (_, i) => {
                    // Janela deslizante de páginas ao redor da atual
                    const total = productsData.totalPages;
                    let start = Math.max(1, page - 3);
                    let end = Math.min(total, start + 6);
                    if (end - start < 6) start = Math.max(1, end - 6);
                    const p = start + i;
                    if (p > total) return null;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          p === page
                            ? "bg-red-600 text-white"
                            : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage(p => Math.min(productsData.totalPages, p + 1))}
                  disabled={page >= productsData.totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                >
                  Próxima
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Cart Panel - Desktop */}
        <div className="hidden lg:flex w-80 bg-gray-900 border-l border-gray-800 flex-col">
          <CartPanel
            cart={cartWithPrices}
            regime={regime}
            totalPecas={totalPecas}
            totalAplicado={totalAplicado}
            onUpdateQuantity={updateQuantity}
            onRemove={removeFromCart}
            onClear={clearCart}
            onCheckout={handleCheckout}
          />
        </div>

        {/* Mobile Cart Button */}
        <button
          onClick={() => setShowCart(true)}
          className="lg:hidden fixed bottom-4 right-4 bg-red-600 text-white rounded-2xl px-5 py-3 flex items-center gap-3 shadow-2xl shadow-red-600/30 z-40"
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="font-semibold">{totalPecas} peças</span>
          <span className="font-bold">R$ {totalAplicado.toFixed(2).replace(".", ",")}</span>
        </button>

        {/* Mobile Cart Drawer */}
        {showCart && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCart(false)} />
            <div className="relative ml-auto w-full max-w-sm bg-gray-900 flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <h3 className="text-white font-semibold">Carrinho</h3>
                <button onClick={() => setShowCart(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CartPanel
                cart={cartWithPrices}
                regime={regime}
                totalPecas={totalPecas}
                totalAplicado={totalAplicado}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
                onClear={clearCart}
                onCheckout={() => { setShowCart(false); handleCheckout(); }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal de Sincronização */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowSyncModal(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-400" />
                <h2 className="text-white font-semibold">Sincronizar Catálogo</h2>
              </div>
              <button onClick={() => setShowSyncModal(false)} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Resultado da sync */}
              {syncResult ? (
                <div className="bg-green-900/30 border border-green-700/40 rounded-xl p-4 space-y-2">
                  <p className="text-green-400 font-semibold text-sm">✓ Sincronização concluída em {syncResult.tempoSegundos}s</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-800/50 rounded-lg p-2">
                      <p className="text-lg font-bold text-white">{syncResult.inseridos}</p>
                      <p className="text-xs text-gray-400">Inseridos</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2">
                      <p className="text-lg font-bold text-white">{syncResult.atualizados}</p>
                      <p className="text-xs text-gray-400">Atualizados</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2">
                      <p className="text-lg font-bold text-white">{syncResult.ignorados}</p>
                      <p className="text-xs text-gray-400">Ignorados</p>
                    </div>
                  </div>
                  {syncResult.alterados > 0 && (
                    <p className="text-xs text-yellow-400">⚠️ {syncResult.alterados} produto(s) com preço ou estoque alterado</p>
                  )}
                  <button
                    onClick={() => setShowSyncModal(false)}
                    className="w-full mt-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                <>
                  {/* Prévia */}
                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center py-8 gap-3 text-gray-400">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Carregando prévia da planilha...</span>
                    </div>
                  ) : syncPreview ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-white">{syncPreview.totalValidos}</p>
                          <p className="text-xs text-gray-400">Válidos na planilha</p>
                        </div>
                        <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-green-400">{syncPreview.novos}</p>
                          <p className="text-xs text-gray-400">Novos produtos</p>
                        </div>
                        <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-yellow-400">{syncPreview.alterados}</p>
                          <p className="text-xs text-gray-400">Com alterações</p>
                        </div>
                        <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-red-400">{syncPreview.totalInvalidos}</p>
                          <p className="text-xs text-gray-400">Ignorados (incompletos)</p>
                        </div>
                      </div>

                      {syncPreview.novosProdutos?.length > 0 && (
                        <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3">
                          <p className="text-xs text-green-400 font-semibold mb-1">Novos produtos (amostra):</p>
                          {syncPreview.novosProdutos.map((p: string, i: number) => (
                            <p key={i} className="text-xs text-gray-300">{p}</p>
                          ))}
                        </div>
                      )}

                      {syncPreview.alteradosProdutos?.length > 0 && (
                        <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-xl p-3">
                          <p className="text-xs text-yellow-400 font-semibold mb-1">Alterações detectadas (amostra):</p>
                          {syncPreview.alteradosProdutos.map((p: string, i: number) => (
                            <p key={i} className="text-xs text-gray-300">{p}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500 text-sm">
                      <p>Erro ao carregar prévia.</p>
                      <button onClick={() => refetchPreview()} className="mt-2 text-blue-400 hover:text-blue-300 text-xs">Tentar novamente</button>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => refetchPreview()}
                      disabled={isLoadingPreview}
                      className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                      Atualizar prévia
                    </button>
                    <button
                      onClick={handleSync}
                      disabled={syncMutation.isPending || isLoadingPreview || !syncPreview}
                      className="flex-1 px-4 py-2.5 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {syncMutation.isPending ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                      ) : (
                        <><RefreshCw className="w-4 h-4" /> Sincronizar Agora</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </PdvLayout>
  );
}

// Product Card Component
function ProductCard({ product, regime, onAdd }: {
  product: any;
  regime: "ATACADO" | "VAREJO";
  onAdd: (product: any, tamanho: string) => void;
}) {
  const precoAtacado = parseFloat(product.precoAtacado) || 0;
  const precoVarejo = parseFloat(product.precoVarejo) || 0;
  const precoAtual = regime === "ATACADO" ? precoAtacado : precoVarejo;
  const semEstoque = product.estoque <= 0;

  return (
    <div className={`bg-gray-800 border rounded-xl p-3 transition-all ${
      semEstoque ? "border-gray-700 opacity-60" : "border-gray-700 hover:border-gray-600"
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-white font-semibold text-sm truncate">{product.time}</div>
          <div className="text-gray-400 text-xs">
            {product.linha} · {product.modelo} · {product.tamanho}
          </div>
          {product.descricao && (
            <div className="text-gray-500 text-xs truncate">{product.descricao}</div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-white font-bold text-sm">
            R$ {precoAtual.toFixed(2).replace(".", ",")}
          </div>
          {regime === "ATACADO" && precoVarejo > 0 && (
            <div className="text-gray-500 text-xs line-through">
              R$ {precoVarejo.toFixed(2).replace(".", ",")}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className={`text-xs px-2 py-0.5 rounded-full ${
          semEstoque
            ? "bg-red-950/50 text-red-400"
            : product.estoque <= 5
            ? "bg-yellow-950/50 text-yellow-400"
            : "bg-green-950/50 text-green-400"
        }`}>
          {semEstoque ? "Sem estoque" : `${product.estoque} un.`}
        </div>
        <button
          onClick={() => onAdd(product, product.tamanho)}
          disabled={semEstoque}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar
        </button>
      </div>
    </div>
  );
}

// Cart Panel Component
function CartPanel({ cart, regime, totalPecas, totalAplicado, onUpdateQuantity, onRemove, onClear, onCheckout }: {
  cart: CartItem[];
  regime: "ATACADO" | "VAREJO";
  totalPecas: number;
  totalAplicado: number;
  onUpdateQuantity: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  return (
    <>
      {/* Cart Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-gray-400" />
            <span className="text-white font-semibold">Carrinho</span>
            {cart.length > 0 && (
              <span className="bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </div>
          <div className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
            regime === "ATACADO"
              ? "bg-blue-950/50 text-blue-400 border border-blue-800"
              : "bg-orange-950/50 text-orange-400 border border-orange-800"
          }`}>
            {regime}
          </div>
        </div>
        <div className="text-gray-400 text-xs mt-1">
          {totalPecas} peças · {regime === "ATACADO" ? "≥6 peças" : "<6 peças"}
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-600">
            <ShoppingCart className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Carrinho vazio</p>
          </div>
        ) : (
          cart.map((item, index) => (
            <div key={index} className="bg-gray-800 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-white text-sm font-medium truncate">{item.time}</div>
                  <div className="text-gray-400 text-xs">
                    {item.linha} · {item.tamanho}
                  </div>
                </div>
                <button
                  onClick={() => onRemove(index)}
                  className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQuantity(index, -1)}
                    className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center text-white transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-white font-semibold w-6 text-center">{item.quantidade}</span>
                  <button
                    onClick={() => onUpdateQuantity(index, 1)}
                    className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center text-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-white font-bold text-sm">
                  R$ {item.totalItem.toFixed(2).replace(".", ",")}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart Footer */}
      <div className="p-4 border-t border-gray-800 space-y-3">
        {cart.length > 0 && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{totalPecas} peças</span>
              <span className="text-white font-bold text-lg">
                R$ {totalAplicado.toFixed(2).replace(".", ",")}
              </span>
            </div>
            <button
              onClick={onCheckout}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              Finalizar Venda
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClear}
              className="w-full text-gray-500 hover:text-red-400 text-sm py-1 transition-colors"
            >
              Limpar carrinho
            </button>
          </>
        )}
      </div>
    </>
  );
}
