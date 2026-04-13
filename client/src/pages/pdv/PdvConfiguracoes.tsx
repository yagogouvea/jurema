import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import { toast } from "sonner";
import { Settings, Save, Phone, Percent, ShoppingBag, Store, RefreshCw, CheckCircle, AlertCircle, ExternalLink, Database } from "lucide-react";

export default function PdvConfiguracoes() {
  const { isAdmin } = usePdvAuth();
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: syncStatus, refetch: refetchStatus } = trpc.pdvSync.status.useQuery(undefined, {
    enabled: isAdmin,
  });

  const { data: syncPreview, isLoading: previewLoading, refetch: refetchPreview } = trpc.pdvSync.preview.useQuery(undefined, {
    enabled: isAdmin && showPreview,
  });

  const syncMutation = trpc.pdvSync.sync.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Sincronização concluída! ${result.inseridos} novos, ${result.atualizados} atualizados, ${result.ignorados} ignorados.`);
      setSyncing(false);
      setShowPreview(false);
      refetchStatus();
    },
    onError: (err: any) => {
      toast.error(`Erro na sincronização: ${err.message}`);
      setSyncing(false);
    },
  });

  function handleSync() {
    setSyncing(true);
    syncMutation.mutate({ confirmar: true });
  }

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
      placeholder: "Jurema Sport",
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
            <div className="w-10 h-10 bg-green-950/50 border border-green-900/50 rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5 text-green-500" />
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
                ? "bg-green-700 hover:bg-green-800 text-white"
                : "bg-gray-800 text-gray-500 cursor-not-allowed"
            }`}
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
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

        {/* Sincronização Google Sheets */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-green-950/50 border border-green-900/50 rounded-xl flex items-center justify-center">
                <Database className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-sm">Sincronizar Catálogo</h2>
                <p className="text-gray-500 text-xs">Google Sheets → Banco de Dados PDV</p>
              </div>
            </div>
            <a
              href={`https://docs.google.com/spreadsheets/d/1z-Qr08Oy9tc3c7rd1nspR0F20oP0cRskEXmUxPxvo7M`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Abrir planilha
            </a>
          </div>

          {/* Status atual */}
          {syncStatus && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-white font-bold text-lg">{syncStatus.totalProdutos}</p>
                <p className="text-gray-400 text-xs">Total no banco</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-green-400 font-bold text-lg">{syncStatus.produtosAtivos}</p>
                <p className="text-gray-400 text-xs">Ativos</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-gray-300 font-bold text-xs">
                  {syncStatus.ultimaAtualizacao
                    ? new Date(syncStatus.ultimaAtualizacao).toLocaleString('pt-BR')
                    : 'Nunca'}
                </p>
                <p className="text-gray-400 text-xs mt-1">Última sync</p>
              </div>
            </div>
          )}

          {/* Preview antes de sincronizar */}
          {!showPreview ? (
            <button
              onClick={() => setShowPreview(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl text-sm font-semibold transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Ver prévia da sincronização
            </button>
          ) : (
            <div className="space-y-3">
              {previewLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-gray-400 text-sm">Consultando planilha...</span>
                </div>
              ) : syncPreview ? (
                <>
                  <div className="bg-gray-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-white font-semibold text-sm">Prévia da Sincronização</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total na planilha:</span>
                        <span className="text-white font-semibold">{syncPreview.totalPlanilha}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Válidos:</span>
                        <span className="text-green-400 font-semibold">{syncPreview.totalValidos}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Novos produtos:</span>
                        <span className="text-blue-400 font-semibold">{syncPreview.novos}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Atualizações:</span>
                        <span className="text-yellow-400 font-semibold">{syncPreview.atualizacoes}</span>
                      </div>
                    </div>
                    {syncPreview.totalInvalidos > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                          <span className="text-orange-400 text-xs font-semibold">{syncPreview.totalInvalidos} produto(s) serão ignorados (dados incompletos na planilha):</span>
                        </div>
                        {syncPreview.invalidos.map((inv: any, i: number) => (
                          <p key={i} className="text-gray-500 text-xs ml-5">• {inv.codigo}: {inv.motivo}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowPreview(false)}
                      className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-semibold transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSync}
                      disabled={syncing || syncMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-700 hover:bg-green-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                      {syncing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Confirmar Sincronização
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}

          <p className="text-gray-600 text-xs">
            A sincronização é somente leitura — o sistema nunca modifica a planilha.
            Produtos com campos incompletos na planilha são ignorados automaticamente.
          </p>
        </div>
      </div>
    </PdvLayout>
  );
}
