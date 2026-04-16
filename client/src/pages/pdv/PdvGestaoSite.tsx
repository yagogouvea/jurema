/**
 * PdvGestaoSite.tsx
 * Painel admin do PDV para gerenciar os produtos do site (vitrine).
 *
 * Funcionalidades:
 * - Importar produtos do PDV para o site (agrupados por modelo)
 * - Ativar/desativar produtos no site
 * - Adicionar/trocar foto (upload S3)
 * - Marcar destaque (PRODUTOS EM DESTAQUE / MAIS VENDIDOS / NOVA COLEÇÃO)
 * - Definir categoria e gênero
 * - Sincronizar estoque PDV → Site
 */

import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RefreshCw, Upload, Star, Eye, EyeOff, Image as ImageIcon,
  Package, CheckCircle, XCircle, Zap, Filter, Search,
  BarChart3, ShoppingBag, Sparkles, Globe
} from "lucide-react";

// ─── tipos ────────────────────────────────────────────────────────────────────

type FeaturedSection = "destaque" | "mais-vendidos" | "nova-colecao" | null;

interface SiteProduct {
  id: number;
  name: string;
  slug: string;
  price: number;
  originalPrice: number | null;
  images: string[];
  team: string | null;
  category: string | null;
  gender: string | null;
  isActive: boolean;
  isFeatured: boolean;
  featuredSection: FeaturedSection;
  reference: string | null;
  pdvCodigoBase: string | null;
  salesCount: number;
  totalStock: number;
  stockDetails: string;
}

// ─── constantes ───────────────────────────────────────────────────────────────

const FEATURED_SECTIONS = [
  { value: "destaque", label: "Produtos em Destaque", icon: Star, color: "text-yellow-400" },
  { value: "mais-vendidos", label: "Mais Vendidos", icon: BarChart3, color: "text-green-400" },
  { value: "nova-colecao", label: "Nova Coleção", icon: Sparkles, color: "text-purple-400" },
] as const;

const CATEGORIES = [
  "tailandesa", "1linha-nacional", "tailandesa-promocao", "itens-brasil",
  "conj-calor-nacional", "conj-calor-tailandesa", "infantil",
  "jogador-tailandesa", "retro-tailandesa", "conj-frio-tailandes",
  "tailandesa-3xl", "tailandesa-4xl",
];

const GENDERS = [
  { value: "masculino", label: "Masculino" },
  { value: "feminino", label: "Feminino" },
  { value: "infantil", label: "Infantil" },
];

// ─── componente principal ─────────────────────────────────────────────────────

export default function PdvGestaoSite() {
  // filtros
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
  const [filterFeatured, setFilterFeatured] = useState<boolean | undefined>(undefined);
  const [filterSection, setFilterSection] = useState<FeaturedSection>(null);
  const [page, setPage] = useState(1);

  // modais
  const [importConfirm, setImportConfirm] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState(false);
  const [editProduct, setEditProduct] = useState<SiteProduct | null>(null);
  const [photoProduct, setPhotoProduct] = useState<SiteProduct | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // queries
  const statsQuery = trpc.pdvSiteSync.getSiteStats.useQuery();
  const productsQuery = trpc.pdvSiteSync.listSiteProducts.useQuery({
    search: search || undefined,
    isActive: filterActive,
    isFeatured: filterFeatured,
    featuredSection: filterSection ?? undefined,
    page,
    pageSize: 30,
  });

  // mutations
  const importMutation = trpc.pdvSiteSync.importSiteProducts.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      statsQuery.refetch();
      productsQuery.refetch();
      setImportConfirm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const syncMutation = trpc.pdvSiteSync.syncStockFromPdv.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      productsQuery.refetch();
      setSyncConfirm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.pdvSiteSync.updateSiteProduct.useMutation({
    onSuccess: () => {
      productsQuery.refetch();
      statsQuery.refetch();
      setEditProduct(null);
      toast.success("Produto atualizado");
    },
    onError: (e) => toast.error(e.message),
  });

  const photoMutation = trpc.pdvSiteSync.uploadProductPhoto.useMutation({
    onSuccess: () => {
      productsQuery.refetch();
      setPhotoProduct(null);
      setPhotoPreview(null);
      setPhotoBase64(null);
      toast.success("Foto atualizada com sucesso");
    },
    onError: (e) => toast.error(e.message),
  });

  // toggle rápido ativo/inativo
  const toggleActive = useCallback((product: SiteProduct) => {
    updateMutation.mutate({ productId: product.id, isActive: !product.isActive });
  }, [updateMutation]);

  // foto
  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPhotoPreview(result);
      setPhotoBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const submitPhoto = () => {
    if (!photoProduct || !photoBase64) return;
    photoMutation.mutate({
      codigoBase: photoProduct.pdvCodigoBase || photoProduct.reference || String(photoProduct.id),
      imageBase64: photoBase64,
      fileName: `${photoProduct.pdvCodigoBase || photoProduct.id}.jpg`,
    });
  };

  // edição inline de destaque/categoria/gênero
  const [editForm, setEditForm] = useState<{
    isActive: boolean;
    isFeatured: boolean;
    featuredSection: FeaturedSection;
    category: string;
    gender: string;
  } | null>(null);

  const openEdit = (p: SiteProduct) => {
    setEditProduct(p);
    setEditForm({
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      featuredSection: p.featuredSection,
      category: p.category || "tailandesa",
      gender: p.gender || "masculino",
    });
  };

  const submitEdit = () => {
    if (!editProduct || !editForm) return;
    updateMutation.mutate({
      productId: editProduct.id,
      isActive: editForm.isActive,
      isFeatured: editForm.isFeatured,
      featuredSection: editForm.isFeatured ? editForm.featuredSection : null,
      category: editForm.category,
      gender: editForm.gender as any,
    });
  };

  const stats = statsQuery.data;
  const products = productsQuery.data;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#111] px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold">Gestão do Site</h1>
              <p className="text-xs text-white/50">Sincronize e gerencie o catálogo da vitrine</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 bg-white/5 hover:bg-white/10"
              onClick={() => setSyncConfirm(true)}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Sincronizar Estoque
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => setImportConfirm(true)}
            >
              <Upload className="w-4 h-4 mr-1" />
              Importar do PDV
            </Button>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 px-6 py-4">
          {[
            { label: "Total", value: stats.total, icon: Package, color: "text-white" },
            { label: "Ativos", value: stats.active, icon: CheckCircle, color: "text-green-400" },
            { label: "Inativos", value: stats.inactive, icon: XCircle, color: "text-red-400" },
            { label: "Destaque", value: stats.sections.destaque, icon: Star, color: "text-yellow-400" },
            { label: "Mais Vendidos", value: stats.sections.maisVendidos, icon: BarChart3, color: "text-green-400" },
            { label: "Nova Coleção", value: stats.sections.novaColecao, icon: Sparkles, color: "text-purple-400" },
            { label: "Em Destaque", value: stats.featured, icon: Zap, color: "text-orange-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-white/50">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="px-6 pb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            placeholder="Buscar por nome, código, time..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
        </div>
        <Select
          value={filterActive === undefined ? "all" : filterActive ? "active" : "inactive"}
          onValueChange={(v) => {
            setFilterActive(v === "all" ? undefined : v === "active");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1a1a] border-white/10">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filterSection ?? "all"}
          onValueChange={(v) => {
            setFilterSection(v === "all" ? null : v as FeaturedSection);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white">
            <SelectValue placeholder="Seção" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1a1a] border-white/10">
            <SelectItem value="all">Todas as seções</SelectItem>
            {FEATURED_SECTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="border-white/20 bg-white/5 hover:bg-white/10"
          onClick={() => { setSearch(""); setFilterActive(undefined); setFilterFeatured(undefined); setFilterSection(null); setPage(1); }}
        >
          <Filter className="w-4 h-4 mr-1" />
          Limpar
        </Button>
      </div>

      {/* Tabela de produtos */}
      <div className="px-6 pb-8">
        {productsQuery.isLoading ? (
          <div className="flex items-center justify-center h-40 text-white/40">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Carregando...
          </div>
        ) : !products?.items.length ? (
          <div className="flex flex-col items-center justify-center h-40 text-white/40 gap-3">
            <ShoppingBag className="w-10 h-10" />
            <p>Nenhum produto encontrado.</p>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setImportConfirm(true)}>
              <Upload className="w-4 h-4 mr-1" />
              Importar produtos do PDV
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="text-left px-4 py-3 text-white/50 font-medium w-16">Foto</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium">Produto</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium hidden md:table-cell">Código</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium hidden lg:table-cell">Estoque</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-white/50 font-medium hidden sm:table-cell">Destaque</th>
                    <th className="text-right px-4 py-3 text-white/50 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {products.items.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      {/* Foto */}
                      <td className="px-4 py-3">
                        <div
                          className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden cursor-pointer flex items-center justify-center border border-white/10 hover:border-blue-400 transition-colors"
                          onClick={() => { setPhotoProduct(p as SiteProduct); setPhotoPreview(p.images[0] || null); }}
                        >
                          {p.images[0] ? (
                            <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-white/20" />
                          )}
                        </div>
                      </td>

                      {/* Nome */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-white leading-tight">{p.name}</p>
                        <p className="text-xs text-white/40 mt-0.5">{p.team || "—"}</p>
                      </td>

                      {/* Código */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <code className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded">
                          {p.pdvCodigoBase || p.reference || "—"}
                        </code>
                      </td>

                      {/* Estoque */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`text-sm font-medium ${p.totalStock > 0 ? "text-green-400" : "text-red-400"}`}>
                          {p.totalStock} un
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActive(p as SiteProduct)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                            p.isActive
                              ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                              : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                          }`}
                        >
                          {p.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {p.isActive ? "Ativo" : "Inativo"}
                        </button>
                      </td>

                      {/* Destaque */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {p.isFeatured && p.featuredSection ? (
                          <Badge className={`text-xs ${
                            p.featuredSection === "destaque" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                            p.featuredSection === "mais-vendidos" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                            "bg-purple-500/20 text-purple-400 border-purple-500/30"
                          }`}>
                            {FEATURED_SECTIONS.find(s => s.value === p.featuredSection)?.label || p.featuredSection}
                          </Badge>
                        ) : (
                          <span className="text-white/20 text-xs">—</span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/20 bg-white/5 hover:bg-white/10 text-xs"
                          onClick={() => openEdit(p as SiteProduct)}
                        >
                          Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {products.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-white/40">
                  {products.total} produtos · Página {products.page} de {products.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/20 bg-white/5"
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/20 bg-white/5"
                    disabled={page >= products.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal: Confirmar Importação ─────────────────────────────────────── */}
      <AlertDialog open={importConfirm} onOpenChange={setImportConfirm}>
        <AlertDialogContent className="bg-[#1a1a1a] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Importar produtos do PDV para o site</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Todos os produtos ativos do PDV serão importados para o catálogo do site,
              agrupados por modelo. Produtos já importados serão atualizados.
              Novos produtos ficam <strong className="text-white">desativados</strong> por padrão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20 bg-white/5 text-white hover:bg-white/10">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => importMutation.mutate({ clearExisting: true })}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 mr-1 animate-spin" />Importando...</>
              ) : "Importar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal: Confirmar Sincronização de Estoque ──────────────────────── */}
      <AlertDialog open={syncConfirm} onOpenChange={setSyncConfirm}>
        <AlertDialogContent className="bg-[#1a1a1a] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Sincronizar estoque PDV → Site</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Os estoques de todos os produtos do site serão atualizados com os valores
              atuais do PDV. Esta operação não altera preços, fotos ou configurações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20 bg-white/5 text-white hover:bg-white/10">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 mr-1 animate-spin" />Sincronizando...</>
              ) : "Sincronizar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal: Editar produto ──────────────────────────────────────────── */}
      <Dialog open={!!editProduct} onOpenChange={(o) => !o && setEditProduct(null)}>
        <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Editar produto no site</DialogTitle>
          </DialogHeader>
          {editProduct && editForm && (
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm font-medium text-white/80 mb-1">{editProduct.name}</p>
                <code className="text-xs text-white/40">{editProduct.pdvCodigoBase}</code>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs text-white/50 mb-2 block">Status no site</label>
                <div className="flex gap-2">
                  {[
                    { v: true, label: "Ativo", color: "bg-green-600 hover:bg-green-700" },
                    { v: false, label: "Inativo", color: "bg-red-600 hover:bg-red-700" },
                  ].map(({ v, label, color }) => (
                    <Button
                      key={label}
                      size="sm"
                      className={`flex-1 ${editForm.isActive === v ? color : "bg-white/10 hover:bg-white/20"}`}
                      onClick={() => setEditForm(f => f ? { ...f, isActive: v } : f)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Destaque */}
              <div>
                <label className="text-xs text-white/50 mb-2 block">Seção de destaque</label>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className={`text-xs ${!editForm.isFeatured ? "bg-white/20" : "bg-white/5 hover:bg-white/10"}`}
                    onClick={() => setEditForm(f => f ? { ...f, isFeatured: false, featuredSection: null } : f)}
                  >
                    Sem destaque
                  </Button>
                  {FEATURED_SECTIONS.map((s) => {
                    const Icon = s.icon;
                    const active = editForm.isFeatured && editForm.featuredSection === s.value;
                    return (
                      <Button
                        key={s.value}
                        size="sm"
                        className={`text-xs flex items-center gap-1 ${active ? "bg-yellow-600 hover:bg-yellow-700" : "bg-white/5 hover:bg-white/10"}`}
                        onClick={() => setEditForm(f => f ? { ...f, isFeatured: true, featuredSection: s.value as FeaturedSection } : f)}
                      >
                        <Icon className="w-3 h-3" />
                        {s.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className="text-xs text-white/50 mb-2 block">Categoria</label>
                <Select
                  value={editForm.category}
                  onValueChange={(v) => setEditForm(f => f ? { ...f, category: v } : f)}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10">
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Gênero */}
              <div>
                <label className="text-xs text-white/50 mb-2 block">Gênero</label>
                <div className="flex gap-2">
                  {GENDERS.map(({ value, label }) => (
                    <Button
                      key={value}
                      size="sm"
                      className={`flex-1 text-xs ${editForm.gender === value ? "bg-blue-600 hover:bg-blue-700" : "bg-white/5 hover:bg-white/10"}`}
                      onClick={() => setEditForm(f => f ? { ...f, gender: value } : f)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-white/20 bg-white/5 text-white" onClick={() => setEditProduct(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={submitEdit}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Upload de foto ──────────────────────────────────────────── */}
      <Dialog open={!!photoProduct} onOpenChange={(o) => !o && setPhotoProduct(null)}>
        <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Foto do produto</DialogTitle>
          </DialogHeader>
          {photoProduct && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-white/60">{photoProduct.name}</p>

              {/* Preview */}
              <div
                className="w-full aspect-square rounded-xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => photoInputRef.current?.click()}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-white/30">
                    <ImageIcon className="w-12 h-12" />
                    <p className="text-sm">Clique para selecionar</p>
                  </div>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoFile}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full border-white/20 bg-white/5 hover:bg-white/10"
                onClick={() => photoInputRef.current?.click()}
              >
                <ImageIcon className="w-4 h-4 mr-1" />
                {photoPreview ? "Trocar foto" : "Selecionar foto"}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-white/20 bg-white/5 text-white" onClick={() => setPhotoProduct(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={submitPhoto}
              disabled={!photoBase64 || photoMutation.isPending}
            >
              {photoMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Salvar foto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
