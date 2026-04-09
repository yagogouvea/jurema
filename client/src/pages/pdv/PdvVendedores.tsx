import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { useLocation } from "wouter";
import PdvLayout from "./PdvLayout";
import { toast } from "sonner";
import {
  Plus, Edit2, Trash2, User, Shield, Eye, EyeOff,
  CheckCircle, XCircle, Target, Save, X
} from "lucide-react";

interface SellerForm {
  name: string;
  username: string;
  password: string;
  role: "seller" | "admin";
}

const DEFAULT_FORM: SellerForm = {
  name: "",
  username: "",
  password: "",
  role: "seller",
};

export default function PdvVendedores() {
  const { isAdmin } = usePdvAuth();
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SellerForm>(DEFAULT_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [goals, setGoals] = useState({
    BRONZE: "14000",
    PRATA: "23000",
    OURO: "28000",
    META_LOJA: "84000",
  });

  if (!isAdmin) {
    navigate("/pdv");
    return null;
  }

  const utils = trpc.useUtils();

  const { data: sellers, isLoading } = trpc.pdvSellers.list.useQuery();
  const { data: goalsData } = trpc.pdvDashboard.getGoals.useQuery(undefined, {
    onSuccess: (data: any[]) => {
      const g: any = {};
      data.forEach(item => { g[item.key] = item.value; });
      setGoals(prev => ({ ...prev, ...g }));
    },
  } as any);

  const createMutation = trpc.pdvSellers.create.useMutation({
    onSuccess: () => {
      toast.success("Vendedor criado com sucesso");
      utils.pdvSellers.list.invalidate();
      setShowForm(false);
      setForm(DEFAULT_FORM);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.pdvSellers.update.useMutation({
    onSuccess: () => {
      toast.success("Vendedor atualizado");
      utils.pdvSellers.list.invalidate();
      setShowForm(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.pdvSellers.delete.useMutation({
    onSuccess: () => {
      toast.success("Vendedor desativado");
      utils.pdvSellers.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateGoalsMutation = trpc.pdvDashboard.updateGoals.useMutation({
    onSuccess: () => {
      toast.success("Metas atualizadas");
      setShowGoals(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.username.trim()) {
      toast.error("Nome e usuário são obrigatórios");
      return;
    }
    if (!editingId && !form.password) {
      toast.error("Senha é obrigatória para novo vendedor");
      return;
    }

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name,
        username: form.username,
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
      });
    } else {
      createMutation.mutate({
        name: form.name,
        username: form.username,
        password: form.password,
        role: form.role,
      });
    }
  };

  const handleEdit = (seller: any) => {
    setEditingId(seller.id);
    setForm({
      name: seller.name,
      username: seller.username,
      password: "",
      role: seller.role,
    });
    setShowForm(true);
  };

  const handleSaveGoals = () => {
    const goalsArray = Object.entries(goals).map(([key, value]) => ({
      key,
      value: parseFloat(value.replace(",", ".")) || 0,
    }));
    updateGoalsMutation.mutate(goalsArray);
  };

  return (
    <PdvLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Vendedores</h1>
            <p className="text-gray-400 text-sm mt-0.5">Gerencie a equipe de vendas</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowGoals(true)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
            >
              <Target className="w-4 h-4 text-yellow-400" />
              Metas
            </button>
            <button
              onClick={() => { setShowForm(true); setEditingId(null); setForm(DEFAULT_FORM); }}
              className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Vendedor
            </button>
          </div>
        </div>

        {/* Sellers Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 animate-pulse">
                <div className="h-10 w-10 bg-gray-800 rounded-xl mb-3" />
                <div className="h-4 bg-gray-800 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sellers?.map((seller: any) => (
              <div key={seller.id} className={`bg-gray-900 border rounded-2xl p-5 transition-all ${
                seller.isActive ? "border-gray-800" : "border-gray-800 opacity-50"
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    seller.role === "admin" ? "bg-yellow-950/50" : "bg-gray-800"
                  }`}>
                    {seller.role === "admin" ? (
                      <Shield className="w-5 h-5 text-yellow-400" />
                    ) : (
                      <User className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(seller)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {seller.isActive && (
                      <button
                        onClick={() => {
                          if (confirm(`Desativar ${seller.name}?`)) {
                            deleteMutation.mutate({ id: seller.id });
                          }
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="font-bold text-white">{seller.name}</div>
                <div className="text-gray-400 text-sm">@{seller.username}</div>

                <div className="flex items-center gap-2 mt-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    seller.role === "admin"
                      ? "bg-yellow-950/50 text-yellow-400 border border-yellow-900/50"
                      : "bg-gray-800 text-gray-400"
                  }`}>
                    {seller.role === "admin" ? "Administrador" : "Vendedor"}
                  </span>
                  {seller.isActive ? (
                    <span className="text-xs flex items-center gap-1 text-green-400">
                      <CheckCircle className="w-3 h-3" />
                      Ativo
                    </span>
                  ) : (
                    <span className="text-xs flex items-center gap-1 text-red-400">
                      <XCircle className="w-3 h-3" />
                      Inativo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-lg">
                {editingId ? "Editar Vendedor" : "Novo Vendedor"}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Usuário</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value.toLowerCase() }))}
                  placeholder="nome_usuario"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Senha {editingId && <span className="text-gray-600">(deixe em branco para manter)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={editingId ? "Nova senha (opcional)" : "Senha"}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Perfil</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, role: "seller" }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      form.role === "seller"
                        ? "bg-gray-700 text-white border border-gray-600"
                        : "bg-gray-800 text-gray-400 border border-gray-800 hover:border-gray-700"
                    }`}
                  >
                    Vendedor
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, role: "admin" }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      form.role === "admin"
                        ? "bg-yellow-950 text-yellow-400 border border-yellow-900"
                        : "bg-gray-800 text-gray-400 border border-gray-800 hover:border-gray-700"
                    }`}
                  >
                    Administrador
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {editingId ? "Salvar" : "Criar"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 text-gray-400 hover:text-white py-3 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Goals Modal */}
      {showGoals && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-yellow-400" />
                Configurar Metas
              </h3>
              <button onClick={() => setShowGoals(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {[
                { key: "BRONZE", label: "Bronze", color: "text-orange-400" },
                { key: "PRATA", label: "Prata", color: "text-gray-300" },
                { key: "OURO", label: "Ouro", color: "text-yellow-400" },
                { key: "META_LOJA", label: "Meta Loja", color: "text-red-400" },
              ].map(goal => (
                <div key={goal.key} className="flex items-center gap-3">
                  <label className={`w-24 text-sm font-semibold ${goal.color}`}>{goal.label}</label>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                    <input
                      type="text"
                      value={goals[goal.key as keyof typeof goals]}
                      onChange={(e) => setGoals(prev => ({ ...prev, [goal.key]: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleSaveGoals}
                disabled={updateGoalsMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Salvar Metas
              </button>
              <button
                onClick={() => setShowGoals(false)}
                className="px-6 text-gray-400 hover:text-white py-3 rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </PdvLayout>
  );
}
