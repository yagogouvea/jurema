import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Package, Image, LogOut, Plus, Edit2, Trash2, X, Upload,
  Search, CheckCircle2, XCircle, Star, StarOff, ChevronDown,
  LayoutGrid, Menu, ShoppingBag, Settings
} from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-logo_2dee52ef.webp";

const CATEGORIES = [
  { value: "1linha-nacional",       label: "R$30 - 1 LINHA NACIONAL" },
  { value: "tailandesa-promocao",   label: "R$35 - TAILANDESA PROMOÇÃO" },
  { value: "conj-calor-nacional",   label: "R$50 - CONJ CALOR NACIONAL" },
  { value: "conj-calor-tailandesa", label: "R$75 - CONJ CALOR TAILANDESA" },
  { value: "tailandesa",            label: "R$80 - TAILANDESA" },
  { value: "infantil",              label: "R$80 - INFANTIL" },
  { value: "jogador-tailandesa",    label: "R$110 - JOGADOR TAILANDESA" },
  { value: "retro-tailandesa",      label: "R$110 - RETRO TAILANDESA" },
  { value: "conj-frio-tailandes",   label: "R$180 - CONJ FRIO TAILANDÊS" },
  { value: "tailandesa-3xl",        label: "3XL - TAILANDESA" },
  { value: "tailandesa-4xl",        label: "4XL - TAILANDESA" },
];

type Tab = "products" | "banners" | "orders" | "settings";

// ─── Product Form Modal ────────────────────────────────────────────────────────
function ProductFormModal({ product, onClose }: { product?: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    name: product?.name || "",
    slug: product?.slug || "",
    description: product?.description || "",
    price: product?.price ? String(product.price) : "",
    originalPrice: product?.originalPrice ? String(product.originalPrice) : "",
    team: product?.team || "",
    category: product?.category || "tailandesa",
    gender: product?.gender || "masculino",
    isActive: product?.isActive ?? true,
    isFeatured: product?.isFeatured ?? false,
    featuredSection: product?.featuredSection || "",
    images: (product?.images as string[]) || [],
    stock: [],
  });

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Produto criado!"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Produto atualizado!"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const generateSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": file.type, "x-filename": file.name },
          body: file,
        });
        const data = await res.json();
        if (data.url) newUrls.push(data.url);
      } catch {
        toast.error(`Erro ao enviar ${file.name}`);
      }
    }
    setForm(p => ({ ...p, images: [...p.images, ...newUrls] }));
    setUploading(false);
    if (newUrls.length > 0) toast.success(`${newUrls.length} foto(s) enviada(s)!`);
  };

  const removeImage = (idx: number) => {
    setForm(p => ({ ...p, images: p.images.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = () => {
    if (!form.name || !form.price) { toast.error("Nome e preço são obrigatórios"); return; }
    const slug = form.slug || generateSlug(form.name);
    const data = { ...form, slug };
    if (product) {
      updateMutation.mutate({ id: product.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-[#111111] rounded-t-2xl sm:rounded-2xl border border-[#1E1E1E] max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#111111] border-b border-[#1E1E1E] px-4 py-3 flex items-center justify-between z-10">
          <h2 className="font-['Bebas_Neue'] text-xl text-white tracking-wider">
            {product ? "EDITAR PRODUTO" : "NOVO PRODUTO"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Fotos — destaque principal */}
          <div>
            <Label className="text-gray-400 text-xs mb-2 block">FOTOS DO PRODUTO</Label>
            {/* Grid de fotos */}
            <div className="grid grid-cols-3 gap-2 mb-2">
              {form.images.map((url, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-[#333] group">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 bg-red-600 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} className="text-white" />
                  </button>
                  {idx === 0 && (
                    <span className="absolute bottom-1 left-1 bg-[#C8102E] text-white text-[9px] px-1.5 py-0.5 rounded font-bold">CAPA</span>
                  )}
                </div>
              ))}
              {/* Botão de adicionar foto */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="aspect-square rounded-lg border-2 border-dashed border-[#333] hover:border-[#C8102E] flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-[#C8102E] transition-colors"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Upload size={18} />
                    <span className="text-[10px] font-medium">Adicionar</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleImageUpload(e.target.files)}
            />
            <p className="text-gray-600 text-[11px]">A primeira foto será usada como capa. Arraste para reordenar.</p>
          </div>

          {/* Nome */}
          <div>
            <Label className="text-gray-400 text-xs mb-1 block">NOME DO PRODUTO *</Label>
            <Input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value, slug: generateSlug(e.target.value) }))}
              placeholder="Ex: Camisa Flamengo 2026 Home"
              className="bg-[#1A1A1A] border-[#333] text-white focus:border-[#C8102E]"
            />
          </div>

          {/* Time */}
          <div>
            <Label className="text-gray-400 text-xs mb-1 block">TIME / SELEÇÃO</Label>
            <Input
              value={form.team}
              onChange={e => setForm(p => ({ ...p, team: e.target.value }))}
              placeholder="Ex: Flamengo, Brasil, Argentina..."
              className="bg-[#1A1A1A] border-[#333] text-white focus:border-[#C8102E]"
            />
          </div>

          {/* Preços lado a lado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs mb-1 block">PREÇO (R$) *</Label>
              <Input
                value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                placeholder="80,00"
                className="bg-[#1A1A1A] border-[#333] text-white focus:border-[#C8102E]"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs mb-1 block">PREÇO ORIGINAL</Label>
              <Input
                value={form.originalPrice}
                onChange={e => setForm(p => ({ ...p, originalPrice: e.target.value }))}
                placeholder="110,00"
                className="bg-[#1A1A1A] border-[#333] text-white focus:border-[#C8102E]"
              />
            </div>
          </div>

          {/* Categoria */}
          <div>
            <Label className="text-gray-400 text-xs mb-1 block">CATEGORIA</Label>
            <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
              <SelectTrigger className="bg-[#1A1A1A] border-[#333] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A1A1A] border-[#333]">
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-gray-300 focus:bg-[#C8102E] focus:text-white">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Gênero */}
          <div>
            <Label className="text-gray-400 text-xs mb-1 block">GÊNERO</Label>
            <div className="grid grid-cols-3 gap-2">
              {["masculino", "feminino", "infantil"].map(g => (
                <button
                  key={g}
                  onClick={() => setForm(p => ({ ...p, gender: g }))}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-all capitalize ${
                    form.gender === g
                      ? "bg-[#C8102E] border-[#C8102E] text-white"
                      : "bg-[#1A1A1A] border-[#333] text-gray-400 hover:border-[#C8102E]/50"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <Label className="text-gray-400 text-xs mb-1 block">DESCRIÇÃO</Label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="Descrição do produto..."
              className="w-full bg-[#1A1A1A] border border-[#333] text-white rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-[#C8102E]"
            />
          </div>

          {/* Toggles */}
          <div className="flex gap-3">
            <button
              onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                form.isActive ? "bg-green-500/10 border-green-500/40 text-green-400" : "bg-[#1A1A1A] border-[#333] text-gray-500"
              }`}
            >
              {form.isActive ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {form.isActive ? "Ativo" : "Inativo"}
            </button>
            <button
              onClick={() => setForm(p => ({ ...p, isFeatured: !p.isFeatured }))}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                form.isFeatured ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-400" : "bg-[#1A1A1A] border-[#333] text-gray-500"
              }`}
            >
              {form.isFeatured ? <Star size={16} /> : <StarOff size={16} />}
              {form.isFeatured ? "Destaque" : "Sem destaque"}
            </button>
          </div>

          {/* Seção de Destaque */}
          {form.isFeatured && (
            <div>
              <Label className="text-gray-400 text-xs mb-1 block">SEÇÃO DE DESTAQUE</Label>
              <Select value={form.featuredSection} onValueChange={v => setForm(p => ({ ...p, featuredSection: v }))}>
                <SelectTrigger className="bg-[#1A1A1A] border-[#333] text-white">
                  <SelectValue placeholder="Selecione uma seção" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A1A1A] border-[#333]">
                  <SelectItem value="destaque" className="text-gray-300 focus:bg-[#C8102E] focus:text-white">PRODUTOS EM DESTAQUE</SelectItem>
                  <SelectItem value="mais-vendidos" className="text-gray-300 focus:bg-[#C8102E] focus:text-white">MAIS VENDIDOS</SelectItem>
                  <SelectItem value="nova-colecao" className="text-gray-300 focus:bg-[#C8102E] focus:text-white">NOVA COLEÇÃO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Footer fixo */}
        <div className="sticky bottom-0 bg-[#111111] border-t border-[#1E1E1E] p-4 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 border-[#333] text-gray-400 hover:text-white">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 bg-[#C8102E] hover:bg-red-700 text-white font-bold"
          >
            {isPending ? "SALVANDO..." : product ? "SALVAR" : "CRIAR"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Products Tab ──────────────────────────────────────────────────────────────
function ProductsTab() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [featuredSectionFilter, setFeaturedSectionFilter] = useState("all");
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data } = trpc.products.list.useQuery({ limit: 100, search: search || undefined, category: categoryFilter !== "all" ? categoryFilter : undefined });
  const products = data?.items ?? [];
  const filteredProducts = featuredSectionFilter === "all" ? products : products.filter((p: any) => p.featuredSection === featuredSectionFilter);

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Produto removido!"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = trpc.products.update.useMutation({
    onSuccess: () => utils.products.list.invalidate(),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="bg-[#1A1A1A] border-[#333] text-white pl-9 focus:border-[#C8102E]"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="bg-[#1A1A1A] border-[#333] text-white w-full sm:w-48">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1A1A] border-[#333]">
            <SelectItem value="all" className="text-gray-300 focus:bg-[#C8102E] focus:text-white">Todas</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value} className="text-gray-300 focus:bg-[#C8102E] focus:text-white">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={featuredSectionFilter} onValueChange={setFeaturedSectionFilter}>
          <SelectTrigger className="bg-[#1A1A1A] border-[#333] text-white w-full sm:w-48">
            <SelectValue placeholder="Seção" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A1A1A] border-[#333]">
            <SelectItem value="all" className="text-gray-300 focus:bg-[#C8102E] focus:text-white">Todas</SelectItem>
            <SelectItem value="destaque" className="text-gray-300 focus:bg-[#C8102E] focus:text-white">PRODUTOS EM DESTAQUE</SelectItem>
            <SelectItem value="mais-vendidos" className="text-gray-300 focus:bg-[#C8102E] focus:text-white">MAIS VENDIDOS</SelectItem>
            <SelectItem value="nova-colecao" className="text-gray-300 focus:bg-[#C8102E] focus:text-white">NOVA COLEÇÃO</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => { setEditingProduct(null); setShowForm(true); }}
          className="bg-[#C8102E] hover:bg-red-700 text-white gap-2 whitespace-nowrap"
        >
          <Plus size={16} /> Novo Produto
        </Button>
      </div>

      <p className="text-gray-600 text-sm">{products.length} produto(s)</p>

      {/* Grid de produtos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((p: any) => {
          const images = (p.images as string[]) || [];
          const coverImg = images[0];
          return (
            <div key={p.id} className="bg-[#111111] border border-[#1E1E1E] rounded-xl overflow-hidden group">
              {/* Imagem */}
              <div className="relative aspect-square bg-[#1A1A1A]">
                {coverImg ? (
                  <img src={coverImg} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-700">
                    <Image size={24} />
                    <span className="text-[10px]">Sem foto</span>
                  </div>
                )}
                {/* Badges */}
                <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                  {!p.isActive && (
                    <span className="bg-gray-800/90 text-gray-400 text-[9px] px-1.5 py-0.5 rounded font-bold">INATIVO</span>
                  )}
                  {p.isFeatured && (
                    <span className="bg-yellow-500/90 text-black text-[9px] px-1.5 py-0.5 rounded font-bold">★ DEST.</span>
                  )}
                </div>
                {/* Foto count */}
                {images.length > 1 && (
                  <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded">
                    {images.length} fotos
                  </span>
                )}
                {/* Quick actions overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => { setEditingProduct(p); setShowForm(true); }}
                    className="bg-[#C8102E] text-white rounded-lg p-2 hover:bg-red-700"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => toggleActive.mutate({ id: p.id, isActive: !p.isActive })}
                    className="bg-[#1A1A1A] text-gray-300 rounded-lg p-2 hover:bg-[#333]"
                  >
                    {p.isActive ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                  </button>
                  <button
                    onClick={() => { if (confirm("Remover produto?")) deleteMutation.mutate({ id: p.id }); }}
                    className="bg-[#1A1A1A] text-red-400 rounded-lg p-2 hover:bg-red-900/30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {/* Info */}
              <div className="p-2.5">
                <p className="text-white text-xs font-semibold truncate leading-tight">{p.name}</p>
                <p className="text-[#C8102E] text-sm font-bold mt-0.5">R$ {parseFloat(String(p.price)).toFixed(2).replace(".", ",")}</p>
                {p.team && <p className="text-gray-600 text-[10px] truncate">{p.team}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {products.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum produto encontrado</p>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <ProductFormModal
          product={editingProduct}
          onClose={() => { setShowForm(false); setEditingProduct(null); }}
        />
      )}
    </div>
  );
}

// ─── Orders Tab ────────────────────────────────────────────────────────────────
function OrdersTab() {
  const { data } = trpc.orders.list.useQuery({ limit: 50 });
  const orders = data?.items ?? [];
  const utils = trpc.useUtils();
  const updateStatus = trpc.orders.updateStatus.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); toast.success("Status atualizado!"); },
  });

  const STATUS_LABELS: Record<string, string> = {
    pending: "Pendente", confirmed: "Confirmado", processing: "Processando",
    shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado",
  };
  const STATUS_COLORS: Record<string, string> = {
    pending: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
    confirmed: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    processing: "text-purple-400 bg-purple-500/10 border-purple-500/30",
    shipped: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
    delivered: "text-green-400 bg-green-500/10 border-green-500/30",
    cancelled: "text-red-400 bg-red-500/10 border-red-500/30",
  };

  return (
    <div className="space-y-3">
      <p className="text-gray-500 text-sm">{orders.length} pedido(s)</p>
      {orders.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum pedido ainda</p>
        </div>
      ) : (
        orders.map(order => (
          <div key={order.id} className="bg-[#111111] border border-[#1E1E1E] rounded-xl p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="text-[#C8102E] font-bold text-sm">#{order.orderNumber}</span>
                <p className="text-white text-sm font-semibold">{order.customerName}</p>
                <p className="text-gray-500 text-xs">{order.customerPhone}</p>
              </div>
              <div className="text-right">
                <p className="text-white font-bold">R$ {parseFloat(String(order.total)).toFixed(2).replace(".", ",")}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[order.status] || "text-gray-400 bg-gray-500/10 border-gray-500/30"}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>
            </div>
            <Select
              value={order.status}
              onValueChange={v => updateStatus.mutate({ id: order.id, status: v as any })}
            >
              <SelectTrigger className="bg-[#1A1A1A] border-[#333] text-white text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A1A1A] border-[#333]">
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-gray-300 focus:bg-[#C8102E] focus:text-white text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Settings Tab ──────────────────────────────────────────────────────────────
function SettingsTab() {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const utils = trpc.useUtils();
  const setSettingMutation = trpc.settings.setMany.useMutation({
    onSuccess: () => { utils.settings.getAll.invalidate(); toast.success("Configuração salva!"); },
  });

  const settingsMap = (settings as Record<string, string>) || {};
  const [whatsapp, setWhatsapp] = useState(settingsMap.whatsapp_number || "");
  const [instagram, setInstagram] = useState(settingsMap.instagram_url || "");
  const [facebook, setFacebook] = useState(settingsMap.facebook_url || "");

  const save = (key: string, value: string) => {
    setSettingMutation.mutate([{ key, value }]);
  };

  return (
    <div className="space-y-4 max-w-md">
      <div className="bg-[#111111] border border-[#1E1E1E] rounded-xl p-4 space-y-4">
        <h3 className="text-white font-semibold">Contato & Redes Sociais</h3>
        <div>
          <Label className="text-gray-400 text-xs mb-1 block">WhatsApp (com DDD)</Label>
          <div className="flex gap-2">
            <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="11999999999" className="bg-[#1A1A1A] border-[#333] text-white focus:border-[#C8102E]" />
            <Button onClick={() => save("whatsapp_number", whatsapp)} className="bg-[#C8102E] hover:bg-red-700 text-white shrink-0">Salvar</Button>
          </div>
        </div>
        <div>
          <Label className="text-gray-400 text-xs mb-1 block">Instagram (@usuario)</Label>
          <div className="flex gap-2">
            <Input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@juremasport" className="bg-[#1A1A1A] border-[#333] text-white focus:border-[#C8102E]" />
            <Button onClick={() => save("instagram_url", instagram)} className="bg-[#C8102E] hover:bg-red-700 text-white shrink-0">Salvar</Button>
          </div>
        </div>
        <div>
          <Label className="text-gray-400 text-xs mb-1 block">Facebook</Label>
          <div className="flex gap-2">
            <Input value={facebook} onChange={e => setFacebook(e.target.value)} placeholder="Jumera Sport" className="bg-[#1A1A1A] border-[#333] text-white focus:border-[#C8102E]" />
            <Button onClick={() => save("facebook_url", facebook)} className="bg-[#C8102E] hover:bg-red-700 text-white shrink-0">Salvar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin Panel ──────────────────────────────────────────────────────────
export default function AdminPanel() {
  const { admin, isLoading } = useAdminAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("products");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const utils = trpc.useUtils();

  const logoutMutation = trpc.adminAuth.logout.useMutation({
    onSuccess: () => {
      utils.adminAuth.me.invalidate();
      navigate("/admin/login");
      toast.success("Saiu do painel");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!admin) {
    navigate("/admin/login");
    return null;
  }

  const tabs: { id: Tab; label: string; Icon: any }[] = [
    { id: "products", label: "Produtos", Icon: Package },
    { id: "orders", label: "Pedidos", Icon: ShoppingBag },
    { id: "settings", label: "Config.", Icon: Settings },
  ];

  const tabTitles: Record<Tab, string> = {
    products: "PRODUTOS",
    banners: "BANNERS",
    orders: "PEDIDOS",
    settings: "CONFIGURAÇÕES",
  };

  return (
    <div className="min-h-screen bg-[#0D0D0D]">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#0D0D0D] border-b border-[#1E1E1E] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={LOGO_URL} alt="Jumera" className="w-8 h-8 object-contain" />
          <div>
            <h1 className="font-['Bebas_Neue'] text-lg text-white tracking-widest leading-none">JUMERA SPORT</h1>
            <p className="text-gray-600 text-[10px] leading-none">Painel Admin</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs hidden sm:block">{String(admin.name)}</span>
          <button
            onClick={() => logoutMutation.mutate()}
            className="flex items-center gap-1.5 text-gray-400 hover:text-[#C8102E] text-sm transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:block text-xs">Sair</span>
          </button>
        </div>
      </header>

      {/* Tab Navigation — mobile bottom bar style */}
      <nav className="sticky top-[57px] z-30 bg-[#0D0D0D] border-b border-[#1E1E1E] flex">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2.5 text-xs sm:text-sm font-semibold transition-all border-b-2 ${
              tab === t.id
                ? "border-[#C8102E] text-[#C8102E]"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <t.Icon size={18} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="p-4 max-w-5xl mx-auto">
        <h2 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider mb-4">{tabTitles[tab]}</h2>
        {tab === "products" && <ProductsTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}
