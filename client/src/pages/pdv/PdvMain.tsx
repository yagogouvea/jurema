import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, ArrowRight,
  Package, X, ChevronLeft, ChevronRight as ChevronRightIcon,
  RefreshCw, Bell, Layers
} from "lucide-react";
import PdvLayout from "./PdvLayout";
import PdvCheckout from "./PdvCheckout";
import SizePickerModal from "@/components/pdv/SizePickerModal";
import type { GroupedProduct } from "@/components/pdv/SizePickerModal";
import { ProductPhotoAvatar, ProductPhotoLightbox } from "@/components/ProductPhotoLightbox";

// Re-export CartItem type used throughout this file
interface CartItem {
  productId?: number;
  linha: string;
  modelo: string;
  time: string;
  descricao?: string;
  tipo?: string;
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
      utils.pdvProducts.listGrouped.invalidate();
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

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, selectedLinha, apenasComEstoque]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [regimeManual, setRegimeManual] = useState<"ATACADO" | "VAREJO" | null>(null);

  // Size picker modal state
  const [selectedGroup, setSelectedGroup] = useState<GroupedProduct | null>(null);
  // Lightbox state
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);

  // Fetch grouped products
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(PAGE_SIZE) && PAGE_SIZE >= 1 ? Math.floor(PAGE_SIZE) : 60;

  const { data: groupedData, isLoading } = trpc.pdvProducts.listGrouped.useQuery({
    search: debouncedSearch || undefined,
    linha: selectedLinha || undefined,
    apenasComEstoque: apenasComEstoque || undefined,
    page: safePage,
    limit: safeLimit,
  }, {
    placeholderData: (prev) => prev,
  });

  const { data: linhas } = trpc.pdvProducts.getLinhas.useQuery();

  const groups: GroupedProduct[] = groupedData?.groups || [];

  // Cart calculations
  const totalPecas = useMemo(() => cart.reduce((sum, item) => sum + item.quantidade, 0), [cart]);
  const regimeAuto = useMemo(() => totalPecas >= 6 ? "ATACADO" : "VAREJO", [totalPecas]);
  const regime = regimeManual ?? regimeAuto;
  const isRegimeManual = regimeManual !== null;

  // For price recalculation we need a flat product lookup by id
  // We build it from the grouped data
  const productLookup = useMemo(() => {
    const map = new Map<number, { precoAtacado: number; precoVarejo: number; estoque: number }>();
    for (const g of groups) {
      for (const v of g.variantes) {
        map.set(v.id, { precoAtacado: v.precoAtacado, precoVarejo: v.precoVarejo, estoque: v.estoque });
      }
    }
    return map;
  }, [groups]);

  const cartWithPrices = useMemo(() => {
    return cart.map(item => {
      if (!item.productId) return item;
      const p = productLookup.get(item.productId);
      if (!p) return item;
      const precoUnitario = regime === "ATACADO" ? p.precoAtacado : p.precoVarejo;
      return { ...item, precoUnitario, totalItem: item.quantidade * precoUnitario };
    });
  }, [cart, regime, productLookup]);

  const totalAtacado = useMemo(() => {
    return cart.reduce((sum, item) => {
      if (!item.productId) return sum + item.totalItem;
      const p = productLookup.get(item.productId);
      if (!p) return sum + item.totalItem;
      return sum + item.quantidade * p.precoAtacado;
    }, 0);
  }, [cart, productLookup]);

  const totalVarejo = useMemo(() => {
    return cart.reduce((sum, item) => {
      if (!item.productId) return sum + item.totalItem;
      const p = productLookup.get(item.productId);
      if (!p) return sum + item.totalItem;
      return sum + item.quantidade * p.precoVarejo;
    }, 0);
  }, [cart, productLookup]);

  const totalAplicado = regime === "ATACADO" ? totalAtacado : totalVarejo;

  // Add multiple items from SizePickerModal
  const addItemsToCart = useCallback((newItems: CartItem[]) => {
    setCart(prev => {
      let updated = [...prev];
      for (const newItem of newItems) {
        const existingIdx = updated.findIndex(
          i => i.productId === newItem.productId && i.tamanho === newItem.tamanho
        );
        if (existingIdx >= 0) {
          const existing = updated[existingIdx];
          // Check stock limit
          const p = newItem.productId != null ? productLookup.get(newItem.productId) : undefined;
          const maxEstoque = p?.estoque ?? 999;
          const novaQtd = existing.quantidade + newItem.quantidade;
          if (novaQtd > maxEstoque) {
            toast.error(`Estoque insuficiente para ${newItem.tamanho}! Disponível: ${maxEstoque} un.`);
            continue;
          }
          updated[existingIdx] = {
            ...existing,
            quantidade: novaQtd,
            totalItem: novaQtd * existing.precoUnitario,
          };
        } else {
          updated.push(newItem);
        }
      }
      return updated;
    });
  }, [productLookup]);

  const updateQuantity = (index: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantidade + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        if (delta > 0 && item.productId) {
          const p = productLookup.get(item.productId);
          if (p && newQty > p.estoque) {
            toast.error(`Estoque insuficiente! Disponível: ${p.estoque} un.`);
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

  const clearCart = () => setCart([]);

  const handleCheckout = () => {
    if (cartWithPrices.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }
    setShowCheckout(true);
  };

  // Group products by time for display
  const groupedByTime = useMemo(() => {
    const map: Record<string, GroupedProduct[]> = {};
    for (const g of groups) {
      if (!map[g.time]) map[g.time] = [];
      map[g.time].push(g);
    }
    return map;
  }, [groups]);

  if (showCheckout) {
    return (
      <PdvLayout>
        <PdvCheckout
          cart={cartWithPrices}
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
              {/* Regime toggle */}
              <div className="flex flex-col gap-0.5">
                <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
                  <button
                    onClick={() => setRegimeManual("ATACADO")}
                    title="Forçar Atacado"
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
                    title="Forçar Varejo"
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
                      title="Voltar para modo automático"
                      className="px-2 py-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-all text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-center text-gray-600" style={{ fontSize: "10px" }}>
                  {isRegimeManual ? "⚠️ manual" : "⚙️ auto"}
                </span>
              </div>

              {/* Admin buttons */}
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
                      <span className="absolute -top-1 -right-1 bg-green-700 text-white text-xs font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                        {unreadData!.count > 99 ? "99+" : unreadData!.count}
                      </span>
                    )}
                  </a>
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por time, modelo, código..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-10 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-600"
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

            {/* Filters */}
            <div className="flex gap-1.5 flex-wrap items-center">
              <button
                onClick={() => setSelectedLinha("")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedLinha === ""
                    ? "bg-green-700 text-white"
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
                      ? "bg-green-700 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
                  }`}
                >
                  {l}
                </button>
              ))}
              <button
                onClick={() => setApenasComEstoque(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                  apenasComEstoque
                    ? "bg-green-700 text-white border border-green-600"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
                }`}
              >
                <Package className="w-3 h-3" />
                Com estoque
              </button>
              {(search || selectedLinha || apenasComEstoque) && (
                <span className="ml-auto text-xs text-gray-500 self-center">
                  {groupedData?.total ?? 0} modelo{(groupedData?.total ?? 0) !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                <Package className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Nenhum produto encontrado</p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="mt-2 text-green-500 text-sm hover:text-green-400"
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 space-y-4">
                {Object.entries(groupedByTime).map(([time, timeGroups]) => (
                  <div key={time}>
                    <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-600 rounded-full" />
                      {time}
                      <span className="text-gray-600">({timeGroups.length} modelo{timeGroups.length !== 1 ? "s" : ""})</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {timeGroups.map((group) => (
                        <GroupedProductCard
                          key={group.baseCode}
                          group={group}
                          regime={regime}
                          onSelect={setSelectedGroup}
                          onOpenLightbox={(src, name) => setLightbox({ src, name })}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {groupedData && groupedData.totalPages > 1 && (
            <div className="bg-gray-900/95 backdrop-blur border-t border-gray-800 py-3 px-4 flex items-center justify-between gap-2 shrink-0">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(7, groupedData.totalPages) }, (_, i) => {
                  const total = groupedData.totalPages;
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
                          ? "bg-green-700 text-white"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage(p => Math.min(groupedData.totalPages, p + 1))}
                disabled={page >= groupedData.totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
              >
                Próxima
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
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
          className="lg:hidden fixed bottom-4 right-4 bg-green-700 text-white rounded-2xl px-5 py-3 flex items-center gap-3 shadow-2xl shadow-green-700/30 z-40"
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

      {/* Size Picker Modal */}
      {selectedGroup && (
        <SizePickerModal
          product={selectedGroup}
          regime={regime}
          onClose={() => setSelectedGroup(null)}
          onAddToCart={addItemsToCart}
        />
      )}
      {/* Lightbox de foto */}
      {lightbox && (
        <ProductPhotoLightbox
          src={lightbox.src}
          productName={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowSyncModal(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-400" />
                <h2 className="text-white font-semibold">Sincronizar Catálogo</h2>
              </div>
              <button onClick={() => setShowSyncModal(false)} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
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
                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center py-8 gap-3 text-gray-400">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Carregando prévia da planilha...</span>
                    </div>
                  ) : syncPreview ? (
                    <div className="space-y-3">
                      {syncPreview.novos === 0 && syncPreview.alterados === 0 ? (
                        <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3 text-center">
                          <p className="text-green-400 font-semibold text-sm">✅ Catálogo atualizado</p>
                          <p className="text-xs text-gray-400 mt-1">Nenhuma alteração detectada</p>
                        </div>
                      ) : (
                        <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-xl p-3 text-center">
                          <p className="text-yellow-400 font-semibold text-sm">⚠️ Atualizações pendentes</p>
                          <p className="text-xs text-gray-400 mt-1">{syncPreview.novos + syncPreview.alterados} produto(s) serão sincronizados</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-green-400">{syncPreview.novos}</p>
                          <p className="text-xs text-gray-400">Novos produtos</p>
                        </div>
                        <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-yellow-400">{syncPreview.alterados}</p>
                          <p className="text-xs text-gray-400">Com alterações</p>
                        </div>
                        <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-gray-400">{syncPreview.semAlteracao ?? 0}</p>
                          <p className="text-xs text-gray-500">Já atualizados</p>
                        </div>
                        <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-green-500">{syncPreview.totalInvalidos}</p>
                          <p className="text-xs text-gray-400">Ignorados</p>
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
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => refetchPreview()}
                      disabled={isLoadingPreview}
                      className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingPreview ? "animate-spin" : ""}`} />
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

// Grouped Product Card Component
function GroupedProductCard({
  group,
  regime,
  onSelect,
  onOpenLightbox,
}: {
  group: GroupedProduct;
  regime: "ATACADO" | "VAREJO";
  onSelect: (g: GroupedProduct) => void;
  onOpenLightbox: (src: string, name: string) => void;
}) {
  const precoAtual = regime === "ATACADO" ? group.precoAtacado : group.precoVarejo;
  const semEstoque = group.estoqueTotal <= 0;

  // Count variants with stock
  const variantesComEstoque = group.variantes.filter(v => v.estoque > 0);
  const tamanhos = variantesComEstoque.map(v => v.tamanho);

  // Check if prices vary across variants
  const precos = group.variantes.map(v => regime === "ATACADO" ? v.precoAtacado : v.precoVarejo);
  const minPreco = Math.min(...precos);
  const maxPreco = Math.max(...precos);
  const precoVaria = Math.abs(maxPreco - minPreco) > 0.01;

  return (
    <button
      onClick={() => onSelect(group)}
      disabled={semEstoque}
      className={`w-full text-left bg-gray-800 border rounded-xl p-3 transition-all group ${
        semEstoque
          ? "border-gray-700 opacity-60 cursor-not-allowed"
          : "border-gray-700 hover:border-green-600 hover:bg-gray-750 cursor-pointer"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {/* Avatar foto — clique abre lightbox sem selecionar o produto */}
          <div onClick={(e) => { e.stopPropagation(); if (group.fotoUrl) onOpenLightbox(group.fotoUrl, group.time); }} className="shrink-0 mt-0.5">
            <ProductPhotoAvatar
              fotoUrl={group.fotoUrl}
              productName={group.time}
              size={28}
              onOpenLightbox={onOpenLightbox}
            />
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate">{group.time}</div>
            <div className="text-gray-400 text-xs">
              {group.linha} · {group.modelo}
              {group.descricao ? ` · ${group.descricao}` : ""}
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-white font-bold text-sm">
            {precoVaria
              ? `R$ ${minPreco.toFixed(2).replace(".", ",")}+`
              : `R$ ${precoAtual.toFixed(2).replace(".", ",")}`
            }
          </div>
          {regime === "ATACADO" && group.precoVarejo > 0 && (
            <div className="text-gray-500 text-xs line-through">
              R$ {group.precoVarejo.toFixed(2).replace(".", ",")}
            </div>
          )}
        </div>
      </div>

      {/* Tamanhos disponíveis */}
      <div className="flex flex-wrap gap-1 mb-2">
        {tamanhos.slice(0, 8).map(t => (
          <span
            key={t}
            className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded font-medium"
          >
            {t}
          </span>
        ))}
        {tamanhos.length > 8 && (
          <span className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-500 rounded">
            +{tamanhos.length - 8}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
          semEstoque
            ? "bg-red-950/50 text-red-500"
            : group.estoqueTotal <= 10
            ? "bg-yellow-950/50 text-yellow-400"
            : "bg-green-950/50 text-green-400"
        }`}>
          {semEstoque ? "Sem estoque" : `${group.estoqueTotal} un.`}
        </div>
        <div className={`flex items-center gap-1 text-xs font-semibold transition-colors ${
          semEstoque ? "text-gray-600" : "text-green-500 group-hover:text-green-400"
        }`}>
          <Layers className="w-3.5 h-3.5" />
          {group.variantes.length} tam.
        </div>
      </div>
    </button>
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
              <span className="bg-green-700 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
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
                    {item.linha} · <span className="font-semibold text-gray-300">{item.tamanho}</span>
                  </div>
                </div>
                <button
                  onClick={() => onRemove(index)}
                  className="text-gray-600 hover:text-red-500 transition-colors flex-shrink-0"
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
              className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
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
