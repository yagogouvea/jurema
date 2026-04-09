import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import { toast } from "sonner";
import { Settings, Save, Phone, Percent, ShoppingBag, Store } from "lucide-react";

export default function PdvConfiguracoes() {
  const { isAdmin } = usePdvAuth();
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, refetch } = trpc.pdvConfig.getAll.useQuery(undefined, {
    enabled: isAdmin,
  });

  const saveMutation = trpc.pdvConfig.setMany.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas com sucesso!");
      setDirty(false);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  useEffect(() => {
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((c: any) => { map[c.key] = c.value || ""; });
      setConfigs(map);
    }
  }, [data]);

  function handleChange(key: string, value: string) {
    setConfigs(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSave() {
    const items = Object.entries(configs).map(([key, value]) => ({ key, value }));
    saveMutation.mutate(items);
  }

  if (!isAdmin) {
    return (
      <PdvLayout>
        <div className="flex items-center justify-center h-64 text-gray-500">
          Acesso restrito ao administrador.
        </div>
      </PdvLayout>
    );
  }

  const FIELD_CONFIG: Record<string, { label: string; icon: any; type: string; placeholder: string; hint?: string }> = {
    whatsapp_recibo: {
      label: "WhatsApp para Recibos",
      icon: Phone,
      type: "text",
      placeholder: "5511999999999",
      hint: "Número com DDI + DDD + número, sem espaços ou traços. Ex: 5511987654321",
    },
    nome_loja: {
      label: "Nome da Loja",
      icon: Store,
      type: "text",
      placeholder: "Jumera Sport",
    },
    taxa_debito: {
      label: "Taxa Débito (%)",
      icon: Percent,
      type: "number",
      placeholder: "3",
      hint: "Percentual aplicado automaticamente em pagamentos no débito",
    },
    taxa_credito: {
      label: "Taxa Crédito (%)",
      icon: Percent,
      type: "number",
      placeholder: "5",
      hint: "Percentual aplicado automaticamente em pagamentos no crédito",
    },
    min_atacado: {
      label: "Mínimo de Peças para Atacado",
      icon: ShoppingBag,
      type: "number",
      placeholder: "6",
      hint: "Quantidade mínima de itens no carrinho para aplicar preço de atacado",
    },
  };

  return (
    <PdvLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-950/50 border border-red-900/50 rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-white text-2xl font-bold">Configurações PDV</h1>
              <p className="text-gray-400 text-sm">Parâmetros do sistema de vendas</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saveMutation.isPending}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              dirty
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-gray-800 text-gray-500 cursor-not-allowed"
            }`}
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(FIELD_CONFIG).map(([key, field]) => {
              const Icon = field.icon;
              return (
                <div key={key} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <label className="text-white font-semibold text-sm">{field.label}</label>
                  </div>
                  <input
                    type={field.type}
                    value={configs[key] ?? ""}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                  {field.hint && (
                    <p className="text-gray-500 text-xs mt-2">{field.hint}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* WhatsApp Preview */}
        {configs.whatsapp_recibo && (
          <div className="bg-green-950/30 border border-green-900/50 rounded-2xl p-4">
            <p className="text-green-400 text-sm font-semibold mb-1">Recibos serão enviados para:</p>
            <a
              href={`https://wa.me/${configs.whatsapp_recibo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-300 text-sm underline"
            >
              wa.me/{configs.whatsapp_recibo}
            </a>
          </div>
        )}

        {!configs.whatsapp_recibo && (
          <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-2xl p-4">
            <p className="text-yellow-400 text-sm font-semibold">Atenção</p>
            <p className="text-yellow-300/70 text-sm mt-1">
              O número de WhatsApp para recibos ainda não foi configurado. 
              Pedidos pelo canal WhatsApp não terão envio automático de recibo até que seja definido.
            </p>
          </div>
        )}
      </div>
    </PdvLayout>
  );
}
