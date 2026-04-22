import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  LayoutDashboard, Package, ShoppingBag, Image, Settings, LogOut,
  Plus, Edit, Trash2, Eye, EyeOff, Star, Upload, Wand2, X, Menu,
  TrendingUp, AlertTriangle, DollarSign, Clock
} from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-logo_2dee52ef.webp";
const SIZES = ["PP", "P", "M", "G", "GG", "XGG"];

type AdminTab = 'dashboard' | 'products' | 'orders' | 'banners' | 'settings';

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: ordersData } = trpc.orders.list.useQuery({ limit: 5 });
  const recentOrders = ordersData?.items ?? [];

  const statCards = [
    { label: 'Total de Pedidos', value: stats?.totalOrders ?? 0, icon: ShoppingBag, color: 'text-blue-400' },
    { label: 'Pedidos Hoje', value: stats?.todayOrders ?? 0, icon: Clock, color: 'text-green-400' },
    { label: 'Faturamento', value: `R$ ${(stats?.totalRevenue ?? 0).toFixed(2).replace('.', ',')}`, icon: DollarSign, color: 'text-yellow-400' },
    { label: 'Estoque Crítico', value: stats?.lowStockProducts ?? 0, icon: AlertTriangle, color: 'text-green-400' },
  ];

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    confirmed: 'bg-blue-500/20 text-blue-400',
    processing: 'bg-purple-500/20 text-purple-400',
    shipped: 'bg-indigo-500/20 text-indigo-400',
    delivered: 'bg-green-500/20 text-green-400',
    cancelled: 'bg-green-600/20 text-green-400',
  };
  const statusLabels: Record<string, string> = {
    pending: 'Pendente', confirmed: 'Confirmado', processing: 'Processando',
    shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-[#111111] rounded-xl p-4 border border-[#1E1E1E]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-xs">{card.label}</span>
              <card.icon size={16} className={card.color} />
            </div>
            <p className="text-white font-bold text-2xl">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#111111] rounded-xl p-5 border border-[#1E1E1E]">
        <h3 className="font-['Bebas_Neue'] text-xl text-white tracking-wider mb-4">PEDIDOS RECENTES</h3>
        {recentOrders.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">Nenhum pedido ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E1E1E]">
                  <th className="text-left py-2 text-gray-500 font-medium">Pedido</th>
                  <th className="text-left py-2 text-gray-500 font-medium hidden md:table-cell">Cliente</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Total</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(order => (
                  <tr key={order.id} className="border-b border-[#111111]">
                    <td className="py-2 text-[#1B8C3D] font-bold">#{order.orderNumber}</td>
                    <td className="py-2 text-gray-300 hidden md:table-cell">{order.customerName}</td>
                    <td className="py-2 text-white font-semibold">R$ {parseFloat(String(order.total)).toFixed(2).replace('.', ',')}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status] || 'bg-gray-500/20 text-gray-400'}`}>
                        {statusLabels[order.status] || order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────
function ProductsTab() {
  const utils = trpc.useUtils();
  const { data } = trpc.products.list.useQuery({ limit: 100 });
  const products = data?.items ?? [];
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Produto criado!"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Produto atualizado!"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Produto removido!"); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    name: '', slug: '', description: '', price: '', originalPrice: '',
    team: '', category: 'tailandesa' as any, gender: 'masculino' as any,
    isActive: true, isFeatured: false,
    images: [] as string[],
    stock: SIZES.map(s => ({ size: s, quantity: 0 })),
  });

  const openCreate = () => {
    setForm({ name: '', slug: '', description: '', price: '', originalPrice: '', team: '', category: 'tailandesa', gender: 'masculino', isActive: true, isFeatured: false, images: [], stock: SIZES.map(s => ({ size: s, quantity: 0 })) });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setForm({
      name: p.name, slug: p.slug, description: p.description || '', price: String(p.price),
      originalPrice: p.originalPrice ? String(p.originalPrice) : '',
      team: p.team || '', category: p.category, gender: p.gender,
      isActive: p.isActive, isFeatured: p.isFeatured,
      images: (p.images as string[]) || [],
      stock: SIZES.map(s => ({ size: s, quantity: 0 })),
    });
    setEditing(p);
    setShowForm(true);
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': file.type, 'x-filename': file.name },
          body: file,
        });
        const data = await res.json();
        if (data.url) newUrls.push(data.url);
      } catch (e) {
        toast.error(`Erro ao fazer upload de ${file.name}`);
      }
    }
    setForm(prev => ({ ...prev, images: [...prev.images, ...newUrls] }));
    setUploadingImages(false);
    if (newUrls.length > 0) toast.success(`${newUrls.length} imagem(ns) enviada(s)!`);
  };

  const handleSubmit = () => {
    if (!form.name || !form.slug || !form.price) { toast.error("Preencha nome, slug e preço"); return; }
    const data = { ...form, stock: form.stock.filter(s => s.quantity > 0) };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const generateSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider">PRODUTOS ({products.length})</h3>
        <Button onClick={openCreate} className="bg-[#1B8C3D] hover:bg-green-700 text-white gap-2">
          <Plus size={16} /> Novo Produto
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#111111] rounded-xl p-5 border border-[#1B8C3D]/30">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-['Bebas_Neue'] text-xl text-white">{editing ? 'EDITAR PRODUTO' : 'NOVO PRODUTO'}</h4>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} className="text-gray-400">
              <X size={16} />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Nome *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value, slug: generateSlug(e.target.value) }))}
                className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Slug *</Label>
              <Input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Preço (R$) *</Label>
              <Input value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                placeholder="89.90" className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Preço Original (R$)</Label>
              <Input value={form.originalPrice} onChange={e => setForm(p => ({ ...p, originalPrice: e.target.value }))}
                placeholder="119.90" className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Time/Seleção</Label>
              <Input value={form.team} onChange={e => setForm(p => ({ ...p, team: e.target.value }))}
                placeholder="Ex: Flamengo, Brasil..." className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v as any }))}>
                <SelectTrigger className="bg-[#1A1A1A] border-[#333] text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A1A1A] border-[#333]">
                  <SelectItem value="1linha-nacional" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$30,00/at - 1 LINHA - NACIONAL</SelectItem>
                  <SelectItem value="tailandesa-promocao" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$35,00/at - TAILANDESA Promoção</SelectItem>
                  <SelectItem value="conj-calor-nacional" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$50,00/at - CONJ CALOR NACIONAL</SelectItem>
                  <SelectItem value="conj-calor-tailandesa" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$75,00/at - CONJ CALOR TAILANDESA</SelectItem>
                  <SelectItem value="tailandesa" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$80,00/at - TAILANDESA</SelectItem>
                  <SelectItem value="infantil" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$80,00/at - Infantil</SelectItem>
                  <SelectItem value="jogador-tailandesa" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$110,00/at - JOGADOR TAILANDESA</SelectItem>
                  <SelectItem value="retro-tailandesa" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$110,00/at - RETRO TAILANDESA</SelectItem>
                  <SelectItem value="conj-frio-tailandes" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$180,00/at - CONJ FRIO TAILANDÊS</SelectItem>
                  <SelectItem value="tailandesa-3xl" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$variado - tailandesa 3XL</SelectItem>
                  <SelectItem value="tailandesa-4xl" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">R$variados - tailandesa 4XL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Gênero</Label>
              <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v as any }))}>
                <SelectTrigger className="bg-[#1A1A1A] border-[#333] text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A1A1A] border-[#333]">
                  <SelectItem value="masculino" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">Masculino</SelectItem>
                  <SelectItem value="feminino" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">Feminino</SelectItem>
                  <SelectItem value="infantil" className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">Infantil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Descrição</Label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={3} placeholder="Descrição do produto..."
                className="w-full mt-1 bg-[#1A1A1A] border border-[#333] text-white rounded-md p-2 text-sm resize-none focus:outline-none focus:border-[#1B8C3D]" />
            </div>
            {/* Image upload */}
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs mb-2 block">Imagens do Produto</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.images.map((img, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#333]">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setForm(p => ({ ...p, images: p.images.filter((_, idx) => idx !== i) }))}
                      className="absolute top-0 right-0 bg-green-600 rounded-bl-lg p-0.5">
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
                <button onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImages}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-[#333] hover:border-[#1B8C3D] flex items-center justify-center text-gray-600 hover:text-[#1B8C3D] transition-colors">
                  {uploadingImages ? <div className="w-4 h-4 border-2 border-[#1B8C3D] border-t-transparent rounded-full animate-spin" /> : <Upload size={18} />}
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => handleImageUpload(e.target.files)} />
              <p className="text-gray-600 text-xs">Clique no ícone + para adicionar imagens (máx 5MB cada)</p>
            </div>
            {/* Stock */}
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs mb-2 block">Estoque por Tamanho</Label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {form.stock.map((s, i) => (
                  <div key={s.size} className="text-center">
                    <p className="text-gray-500 text-xs mb-1">{s.size}</p>
                    <Input
                      type="number" min="0" value={s.quantity}
                      onChange={e => setForm(p => ({ ...p, stock: p.stock.map((st, idx) => idx === i ? { ...st, quantity: parseInt(e.target.value) || 0 } : st) }))}
                      className="bg-[#1A1A1A] border-[#333] text-white text-center text-sm h-8 p-1"
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* Toggles */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                  className="w-4 h-4 accent-[#1B8C3D]" />
                <span className="text-gray-300 text-sm">Ativo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(p => ({ ...p, isFeatured: e.target.checked }))}
                  className="w-4 h-4 accent-[#1B8C3D]" />
                <span className="text-gray-300 text-sm">Destaque</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <Button variant="outline" onClick={() => setShowForm(false)} className="border-[#333] text-gray-400 bg-transparent">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-[#1B8C3D] hover:bg-green-700 text-white">
              {editing ? 'Salvar Alterações' : 'Criar Produto'}
            </Button>
          </div>
        </div>
      )}

      {/* Products list */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1E1E1E]">
              <th className="text-left py-2 text-gray-500 font-medium">Produto</th>
              <th className="text-left py-2 text-gray-500 font-medium hidden md:table-cell">Time</th>
              <th className="text-left py-2 text-gray-500 font-medium">Preço</th>
              <th className="text-left py-2 text-gray-500 font-medium hidden sm:table-cell">Status</th>
              <th className="text-right py-2 text-gray-500 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-b border-[#111111] hover:bg-[#111111]">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-[#1A1A1A] overflow-hidden flex-shrink-0">
                      {(p.images as string[])?.[0] ? (
                        <img src={(p.images as string[])[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs">?</div>
                      )}
                    </div>
                    <div>
                      <p className="text-white font-medium line-clamp-1">{p.name}</p>
                      <p className="text-gray-600 text-xs">{p.gender} · {p.category}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-gray-400 hidden md:table-cell">{p.team || '-'}</td>
                <td className="py-2 text-white font-semibold">R$ {parseFloat(String(p.price)).toFixed(2).replace('.', ',')}</td>
                <td className="py-2 hidden sm:table-cell">
                  <div className="flex items-center gap-1">
                    {p.isActive ? <span className="text-green-400 text-xs">●</span> : <span className="text-gray-600 text-xs">●</span>}
                    {p.isFeatured && <Star size={12} className="text-yellow-400 fill-yellow-400" />}
                  </div>
                </td>
                <td className="py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-white" onClick={() => openEdit(p)}>
                      <Edit size={13} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-green-400"
                      onClick={() => { if (confirm('Remover produto?')) deleteMutation.mutate({ id: p.id }); }}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-8">Nenhum produto cadastrado. Clique em "Novo Produto" para começar.</p>
        )}
      </div>
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────
function OrdersTab() {
  const utils = trpc.useUtils();
  const { data } = trpc.orders.list.useQuery({ limit: 100 });
  const orders = data?.items ?? [];
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const { data: orderDetail } = trpc.orders.byId.useQuery(
    { id: selectedOrder?.id },
    { enabled: !!selectedOrder }
  );

  const updateStatus = trpc.orders.updateStatus.useMutation({
    onSuccess: () => { utils.orders.list.invalidate(); toast.success("Status atualizado!"); },
  });

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    processing: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    shipped: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    delivered: 'bg-green-500/20 text-green-400 border-green-500/30',
    cancelled: 'bg-green-600/20 text-green-400 border-green-600/30',
  };
  const statusLabels: Record<string, string> = {
    pending: 'Pendente', confirmed: 'Confirmado', processing: 'Processando',
    shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado',
  };

  return (
    <div className="space-y-4">
      <h3 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider">PEDIDOS ({orders.length})</h3>

      {selectedOrder && orderDetail ? (
        <div className="bg-[#111111] rounded-xl p-5 border border-[#1B8C3D]/30">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-['Bebas_Neue'] text-xl text-white">PEDIDO #{orderDetail.orderNumber}</h4>
            <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(null)} className="text-gray-400"><X size={16} /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-1">Cliente</p>
              <p className="text-white">{orderDetail.customerName}</p>
              <p className="text-gray-400">{orderDetail.customerEmail}</p>
              {orderDetail.customerPhone && <p className="text-gray-400">{orderDetail.customerPhone}</p>}
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Endereço</p>
              <p className="text-white">{orderDetail.addressStreet}, {orderDetail.addressNumber}</p>
              <p className="text-gray-400">{orderDetail.addressCity}/{orderDetail.addressState} - {orderDetail.addressZip}</p>
            </div>
          </div>
          <div className="mb-4">
            <p className="text-gray-500 text-xs mb-2">Itens</p>
            {orderDetail.items?.map((item: any) => (
              <div key={item.id} className="flex justify-between text-sm py-1 border-b border-[#1E1E1E]">
                <span className="text-gray-300">{item.productName} ({item.size}) x{item.quantity}</span>
                <span className="text-white">R$ {parseFloat(item.total).toFixed(2).replace('.', ',')}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-2 font-bold">
              <span className="text-white">Total</span>
              <span className="text-white">R$ {parseFloat(String(orderDetail.total)).toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={orderDetail.status} onValueChange={v => updateStatus.mutate({ id: orderDetail.id, status: v as any })}>
              <SelectTrigger className="w-44 bg-[#1A1A1A] border-[#333] text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A1A1A] border-[#333]">
                {Object.entries(statusLabels).map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={orderDetail.paymentStatus} onValueChange={v => updateStatus.mutate({ id: orderDetail.id, status: orderDetail.status as any, paymentStatus: v as any })}>
              <SelectTrigger className="w-36 bg-[#1A1A1A] border-[#333] text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A1A1A] border-[#333]">
                {[['pending','Pendente'],['paid','Pago'],['failed','Falhou'],['refunded','Reembolsado']].map(([v,l]) => (
                  <SelectItem key={v} value={v} className="text-gray-300 focus:bg-[#1B8C3D] focus:text-white">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E1E1E]">
                <th className="text-left py-2 text-gray-500 font-medium">Pedido</th>
                <th className="text-left py-2 text-gray-500 font-medium hidden md:table-cell">Cliente</th>
                <th className="text-left py-2 text-gray-500 font-medium">Total</th>
                <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                <th className="text-right py-2 text-gray-500 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className="border-b border-[#111111] hover:bg-[#111111]">
                  <td className="py-2 text-[#1B8C3D] font-bold">#{order.orderNumber}</td>
                  <td className="py-2 text-gray-300 hidden md:table-cell">{order.customerName}</td>
                  <td className="py-2 text-white font-semibold">R$ {parseFloat(String(order.total)).toFixed(2).replace('.', ',')}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[order.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {statusLabels[order.status] || order.status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)} className="text-gray-400 hover:text-white text-xs h-7">
                      Ver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="text-gray-600 text-sm text-center py-8">Nenhum pedido ainda.</p>}
        </div>
      )}
    </div>
  );
}

// ─── Banners Tab ──────────────────────────────────────────────────────────────
function BannersTab() {
  const utils = trpc.useUtils();
  const { data: banners } = trpc.banners.listAll.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [aiForm, setAiForm] = useState({ description: '', title: '', subtitle: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBanner, setGeneratedBanner] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ title: '', subtitle: '', imageUrl: '', linkUrl: '', buttonText: '', isActive: true, sortOrder: 0 });

  const createBanner = trpc.banners.create.useMutation({
    onSuccess: () => { utils.banners.listAll.invalidate(); toast.success("Banner criado!"); setShowForm(false); setGeneratedBanner(null); },
  });
  const updateBanner = trpc.banners.update.useMutation({
    onSuccess: () => { utils.banners.listAll.invalidate(); toast.success("Banner atualizado!"); },
  });
  const deleteBanner = trpc.banners.delete.useMutation({
    onSuccess: () => { utils.banners.listAll.invalidate(); toast.success("Banner removido!"); },
    onError: (e) => toast.error(e.message),
  });
  const generateBanner = trpc.banners.generateWithAI.useMutation({
    onSuccess: (data) => { setGeneratedBanner(data); setIsGenerating(false); toast.success("Banner gerado com IA!"); },
    onError: (e) => { setIsGenerating(false); toast.error(e.message); },
  });

  const handleBannerImageUpload = async (file: File) => {
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'x-filename': file.name },
        body: file,
      });
      const data = await res.json();
      if (data.url) setForm(p => ({ ...p, imageUrl: data.url }));
    } catch { toast.error("Erro no upload"); }
  };

  const handleGenerateAI = async () => {
    if (!aiForm.description || !aiForm.title) { toast.error("Preencha título e descrição"); return; }
    setIsGenerating(true);
    generateBanner.mutate(aiForm);
  };

  const handleSaveGenerated = () => {
    if (!generatedBanner) return;
    createBanner.mutate({
      title: generatedBanner.title,
      subtitle: generatedBanner.subtitle,
      imageUrl: generatedBanner.imageUrl,
      isActive: true,
      sortOrder: (banners?.length ?? 0),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider">BANNERS</h3>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[#1B8C3D] hover:bg-green-700 text-white gap-2">
          <Plus size={16} /> Novo Banner
        </Button>
      </div>

      {/* AI Banner Generator */}
      <div className="bg-[#111111] rounded-xl p-5 border border-[#1E1E1E]">
        <div className="flex items-center gap-2 mb-4">
          <Wand2 size={18} className="text-[#1B8C3D]" />
          <h4 className="font-['Bebas_Neue'] text-xl text-white tracking-wider">GERADOR DE BANNERS COM IA</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-400 text-xs">Título do Banner *</Label>
            <Input value={aiForm.title} onChange={e => setAiForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Ex: Nova Coleção 2025" className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Subtítulo</Label>
            <Input value={aiForm.subtitle} onChange={e => setAiForm(p => ({ ...p, subtitle: e.target.value }))}
              placeholder="Ex: Camisas dos melhores times" className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-gray-400 text-xs">Descrição para IA *</Label>
            <textarea value={aiForm.description} onChange={e => setAiForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="Descreva o banner que deseja gerar. Ex: Banner promocional de camisas do Flamengo com fundo escuro e detalhes em vermelho..."
              className="w-full mt-1 bg-[#1A1A1A] border border-[#333] text-white rounded-md p-2 text-sm resize-none focus:outline-none focus:border-[#1B8C3D]" />
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <Button onClick={handleGenerateAI} disabled={isGenerating}
            className="bg-gradient-to-r from-purple-600 to-[#1B8C3D] hover:from-purple-700 hover:to-green-700 text-white gap-2">
            <Wand2 size={16} />
            {isGenerating ? 'Gerando...' : 'Gerar Banner com IA'}
          </Button>
        </div>
        {generatedBanner && (
          <div className="mt-4 p-4 bg-[#1A1A1A] rounded-lg">
            <p className="text-gray-400 text-xs mb-2">Banner gerado:</p>
            <img src={generatedBanner.imageUrl} alt="Banner gerado" className="w-full max-h-40 object-cover rounded-lg mb-3" />
            <div className="flex gap-2">
              <Button onClick={handleSaveGenerated} className="bg-[#1B8C3D] hover:bg-green-700 text-white text-sm">
                Salvar Banner
              </Button>
              <Button variant="outline" onClick={() => setGeneratedBanner(null)} className="border-[#333] text-gray-400 bg-transparent text-sm">
                Descartar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Manual banner form */}
      {showForm && (
        <div className="bg-[#111111] rounded-xl p-5 border border-[#1B8C3D]/30">
          <h4 className="font-['Bebas_Neue'] text-xl text-white mb-4">NOVO BANNER MANUAL</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Título *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Subtítulo</Label>
              <Input value={form.subtitle} onChange={e => setForm(p => ({ ...p, subtitle: e.target.value }))}
                className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs mb-1 block">Imagem do Banner</Label>
              <div className="flex gap-2">
                <Input value={form.imageUrl} onChange={e => setForm(p => ({ ...p, imageUrl: e.target.value }))}
                  placeholder="URL da imagem ou faça upload" className="bg-[#1A1A1A] border-[#333] text-white flex-1" />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}
                  className="border-[#333] text-gray-400 bg-transparent gap-1 flex-shrink-0">
                  <Upload size={14} /> Upload
                </Button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleBannerImageUpload(e.target.files[0])} />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Link (URL)</Label>
              <Input value={form.linkUrl} onChange={e => setForm(p => ({ ...p, linkUrl: e.target.value }))}
                placeholder="/produtos" className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Texto do Botão</Label>
              <Input value={form.buttonText} onChange={e => setForm(p => ({ ...p, buttonText: e.target.value }))}
                placeholder="Ver Produtos" className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)} className="border-[#333] text-gray-400 bg-transparent">Cancelar</Button>
            <Button onClick={() => { if (!form.title || !form.imageUrl) { toast.error("Preencha título e imagem"); return; } createBanner.mutate(form as any); }}
              className="bg-[#1B8C3D] hover:bg-green-700 text-white">Criar Banner</Button>
          </div>
        </div>
      )}

      {/* Banners list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(banners ?? []).map(banner => (
          <div key={banner.id} className="bg-[#111111] rounded-xl overflow-hidden border border-[#1E1E1E]">
            <div className="relative h-28">
              <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-center px-3">
                <div>
                  <p className="text-white font-bold text-sm">{banner.title}</p>
                  {banner.subtitle && <p className="text-gray-300 text-xs">{banner.subtitle}</p>}
                </div>
              </div>
            </div>
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${banner.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {banner.isActive ? 'Ativo' : 'Inativo'}
                </span>
                <span className="text-gray-600 text-xs">Ordem: {banner.sortOrder}</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-white"
                  onClick={() => updateBanner.mutate({ id: banner.id, isActive: !banner.isActive })}>
                  {banner.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-green-400"
                  onClick={() => { if (confirm('Remover banner?')) deleteBanner.mutate({ id: banner.id }); }}>
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {(!banners || banners.length === 0) && (
          <p className="text-gray-600 text-sm col-span-2 text-center py-4">Nenhum banner cadastrado.</p>
        )}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const { data: settings } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({ onSuccess: () => toast.success("Configurações salvas!") });

  const [form, setForm] = useState({
    whatsapp_number: '', whatsapp_message: '',
    instagram_url: '', facebook_url: '', tiktok_url: '',
    mp_access_token: '', store_name: '',
  });

  // Sync with loaded settings
  const [loaded, setLoaded] = useState(false);
  if (settings && !loaded) {
    setForm({
      whatsapp_number: settings.whatsapp_number || '',
      whatsapp_message: settings.whatsapp_message || '',
      instagram_url: settings.instagram_url || '',
      facebook_url: settings.facebook_url || '',
      tiktok_url: settings.tiktok_url || '',
      mp_access_token: settings.mp_access_token || '',
      store_name: settings.store_name || 'Jurema Sport',
    });
    setLoaded(true);
  }

  const handleSave = () => {
    setMany.mutate(Object.entries(form).map(([key, value]) => ({ key, value })));
  };

  return (
    <div className="space-y-6">
      <h3 className="font-['Bebas_Neue'] text-2xl text-white tracking-wider">CONFIGURAÇÕES</h3>

      <div className="bg-[#111111] rounded-xl p-5 border border-[#1E1E1E] space-y-4">
        <h4 className="text-white font-semibold">WhatsApp</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-400 text-xs">Número do WhatsApp</Label>
            <Input value={form.whatsapp_number} onChange={e => setForm(p => ({ ...p, whatsapp_number: e.target.value }))}
              placeholder="5511999999999" className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            <p className="text-gray-600 text-xs mt-1">Formato: código do país + DDD + número</p>
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Mensagem Padrão</Label>
            <Input value={form.whatsapp_message} onChange={e => setForm(p => ({ ...p, whatsapp_message: e.target.value }))}
              placeholder="Olá! Tenho interesse em uma camisa..." className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
          </div>
        </div>
      </div>

      <div className="bg-[#111111] rounded-xl p-5 border border-[#1E1E1E] space-y-4">
        <h4 className="text-white font-semibold">Redes Sociais</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { key: 'instagram_url', label: 'Instagram URL', placeholder: 'https://instagram.com/...' },
            { key: 'facebook_url', label: 'Facebook URL', placeholder: 'https://facebook.com/...' },
            { key: 'tiktok_url', label: 'TikTok URL', placeholder: 'https://tiktok.com/@...' },
          ].map(field => (
            <div key={field.key}>
              <Label className="text-gray-400 text-xs">{field.label}</Label>
              <Input value={(form as any)[field.key]} onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                placeholder={field.placeholder} className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#111111] rounded-xl p-5 border border-[#1E1E1E] space-y-4">
        <h4 className="text-white font-semibold">Mercado Pago</h4>
        <div>
          <Label className="text-gray-400 text-xs">Access Token (MP_ACCESS_TOKEN)</Label>
          <Input value={form.mp_access_token} onChange={e => setForm(p => ({ ...p, mp_access_token: e.target.value }))}
            type="password" placeholder="APP_USR-..." className="bg-[#1A1A1A] border-[#333] text-white mt-1" />
          <p className="text-gray-600 text-xs mt-1">
            Obtenha em: <a href="https://www.mercadopago.com.br/developers" target="_blank" className="text-[#1B8C3D] hover:underline">mercadopago.com.br/developers</a>
          </p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={setMany.isPending}
        className="bg-[#1B8C3D] hover:bg-green-700 text-white font-bold px-8">
        {setMany.isPending ? 'Salvando...' : 'Salvar Configurações'}
      </Button>
    </div>
  );
}

// ─── Main Admin Component ─────────────────────────────────────────────────────
export default function Admin() {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems: { key: AdminTab; label: string; icon: any }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'products', label: 'Produtos', icon: Package },
    { key: 'orders', label: 'Pedidos', icon: ShoppingBag },
    { key: 'banners', label: 'Banners', icon: Image },
    { key: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-[#0A0A0A] border-r border-[#1E1E1E] flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}>
        <div className="p-4 border-b border-[#1E1E1E]">
          <div className="flex items-center gap-2">
            <img src={LOGO_URL} alt="Jurema Sport" className="h-8 w-8 rounded-full" />
            <div>
              <p className="font-['Bebas_Neue'] text-sm text-white tracking-wider">JUREMA SPORT</p>
              <p className="text-gray-600 text-xs">Admin Panel</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => { setActiveTab(item.key); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.key ? 'bg-[#1B8C3D] text-white' : 'text-gray-400 hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-[#1E1E1E]">
          <a href="/" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-[#1A1A1A] transition-colors">
            <LogOut size={16} /> Voltar à Loja
          </a>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#0A0A0A] border-b border-[#1E1E1E] lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="text-gray-400">
            <Menu size={20} />
          </Button>
          <span className="font-['Bebas_Neue'] text-lg text-white tracking-wider">
            {navItems.find(n => n.key === activeTab)?.label.toUpperCase()}
          </span>
        </div>

        <div className="flex-1 p-4 md:p-6 overflow-auto">
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'products' && <ProductsTab />}
          {activeTab === 'orders' && <OrdersTab />}
          {activeTab === 'banners' && <BannersTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}
