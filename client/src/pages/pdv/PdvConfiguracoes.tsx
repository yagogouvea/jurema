import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import PdvLayout from "./PdvLayout";
import { toast } from "sonner";
import {
  Settings, Save, Phone, Percent, ShoppingBag, Store, RefreshCw,
  CheckCircle, AlertCircle, ExternalLink, Database, Trophy,
  DollarSign, Target, Crown, Medal, Award
} from "lucide-react";

type TabKey = "geral" | "comissoes" | "metas" | "sofia" | "sync";

export default function PdvConfiguracoes() {
  const { isAdmin } = usePdvAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("geral");

  if (!isAdmin) {
    return (
      <PdvLayout>
        <div className="flex items-center justify-center h-64 text-gray-500">
          Acesso restrito ao administrador.
        </div>
      </PdvLayout>
    );
  }

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "geral", label: "Geral", icon: Settings },
    { key: "comissoes", label: "Bônus", icon: DollarSign },
    { key: "metas", label: "Metas", icon: Target },
    { key: "sofia", label: "Sofia", icon: Crown },
    { key: "sync", label: "Sincronização", icon: Database },
  ];

  return (
    <PdvLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-950/50 border border-green-900/50 rounded-xl flex items-center justify-center">
            <Settings className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h1 className="text-white text-2xl font-bold">Configurações PDV</h1>
            <p className="text-gray-400 text-sm">Parâmetros do sistema de vendas</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? "bg-green-700 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "geral" && <TabGeral />}
        {activeTab === "comissoes" && <TabComissoes />}
        {activeTab === "metas" && <TabMetas />}
        {activeTab === "sofia" && <TabSofia />}
        {activeTab === "sync" && <TabSync />}
      </div>
    </PdvLayout>
  );
}

// ===================== TAB GERAL =====================
function TabGeral() {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, refetch } = trpc.pdvConfig.getAll.useQuery();
  const saveMutation = trpc.pdvConfig.setMany.useMutation({
    onSuccess: () => { toast.success("Configurações salvas!"); setDirty(false); refetch(); },
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

  const FIELD_CONFIG: Record<string, { label: string; icon: any; type: string; placeholder: string; hint?: string }> = {
    nome_loja: { label: "Nome da Loja", icon: Store, type: "text", placeholder: "Jurema Sport" },
    whatsapp_recibo: { label: "WhatsApp para Recibos", icon: Phone, type: "text", placeholder: "5511999999999", hint: "Número com DDI + DDD + número. Ex: 5511987654321" },
    taxa_debito: { label: "Taxa Débito (%)", icon: Percent, type: "number", placeholder: "3", hint: "Percentual aplicado em pagamentos no débito" },
    taxa_credito: { label: "Taxa Crédito (%)", icon: Percent, type: "number", placeholder: "5", hint: "Percentual aplicado em pagamentos no crédito" },
    min_atacado: { label: "Mínimo de Peças para Atacado", icon: ShoppingBag, type: "number", placeholder: "6", hint: "Quantidade mínima de itens para aplicar preço de atacado" },
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">Configurações Gerais</h2>
        <SaveButton dirty={dirty} saving={saveMutation.isPending} onClick={handleSave} />
      </div>

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
            {field.hint && <p className="text-gray-500 text-xs mt-2">{field.hint}</p>}
          </div>
        );
      })}

      {configs.whatsapp_recibo && (
        <div className="bg-green-950/30 border border-green-900/50 rounded-2xl p-4">
          <p className="text-green-400 text-sm font-semibold mb-1">Recibos serão enviados para:</p>
          <a href={`https://wa.me/${configs.whatsapp_recibo}`} target="_blank" rel="noopener noreferrer" className="text-green-300 text-sm underline">
            wa.me/{configs.whatsapp_recibo}
          </a>
        </div>
      )}
    </div>
  );
}

// ===================== TAB BÔNUS =====================
function TabComissoes() {
  const [comissaoPeca, setComissaoPeca] = useState("");
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, refetch } = trpc.pdvConfig.get.useQuery({ key: "comissao_peca" });
  const saveMutation = trpc.pdvConfig.set.useMutation({
    onSuccess: () => { toast.success("Bônus por peça atualizado!"); setDirty(false); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  useEffect(() => {
    if (data) setComissaoPeca(data.value || "5");
  }, [data]);

  function handleSave() {
    saveMutation.mutate({ key: "comissao_peca", value: comissaoPeca });
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">Bônus</h2>
        <SaveButton dirty={dirty} saving={saveMutation.isPending} onClick={handleSave} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-green-400" />
          <label className="text-white font-semibold text-sm">Bônus por Peça (R$)</label>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">R$</span>
          <input
            type="number"
            step="0.50"
            min="0"
            value={comissaoPeca}
            onChange={(e) => { setComissaoPeca(e.target.value); setDirty(true); }}
            placeholder="5.00"
            className="w-32 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
          />
          <span className="text-gray-500 text-sm">por peça vendida</span>
        </div>
        <p className="text-gray-500 text-xs mt-3">
          Cada vendedor recebe R$ {comissaoPeca || "0"} por peça vendida (excluindo itens Sofia).
          O valor é calculado automaticamente no relatório de bônus.
        </p>
      </div>

      <div className="bg-blue-950/30 border border-blue-900/50 rounded-2xl p-4">
        <p className="text-blue-300 text-sm">
          <strong>Como funciona:</strong> O bônus é calculado por quantidade de peças vendidas, não por pedido.
          Itens marcados como "Sofia" (terceirizado) são excluídos automaticamente do cálculo.
        </p>
      </div>
    </div>
  );
}

// ===================== TAB METAS =====================
function TabMetas() {
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, refetch } = trpc.pdvConfig.getGoals.useQuery();
  const saveMutation = trpc.pdvConfig.updateGoals.useMutation({
    onSuccess: () => { toast.success("Metas atualizadas!"); setDirty(false); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  useEffect(() => {
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((g: any) => { map[g.key] = String(g.value); });
      setGoals(map);
    }
  }, [data]);

  function handleChange(key: string, value: string) {
    setGoals(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSave() {
    const items = Object.entries(goals).map(([key, value]) => ({ key, value: parseFloat(value) || 0 }));
    saveMutation.mutate(items);
  }

  if (isLoading) return <LoadingSpinner />;

  const goalFields = [
    { key: "BRONZE", label: "Meta Bronze", icon: Medal, color: "text-amber-600" },
    { key: "PRATA", label: "Meta Prata", icon: Award, color: "text-gray-300" },
    { key: "OURO", label: "Meta Ouro", icon: Trophy, color: "text-yellow-400" },
    { key: "META_LOJA", label: "Meta da Loja (Total)", icon: Target, color: "text-green-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">Metas de Vendas</h2>
        <SaveButton dirty={dirty} saving={saveMutation.isPending} onClick={handleSave} />
      </div>

      {goalFields.map(field => {
        const Icon = field.icon;
        return (
          <div key={field.key} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon className={`w-4 h-4 ${field.color}`} />
              <label className="text-white font-semibold text-sm">{field.label}</label>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">R$</span>
              <input
                type="number"
                step="1000"
                min="0"
                value={goals[field.key] ?? ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder="0"
                className="w-40 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
              />
            </div>
          </div>
        );
      })}

      <div className="bg-blue-950/30 border border-blue-900/50 rounded-2xl p-4">
        <p className="text-blue-300 text-sm">
          <strong>Metas por vendedor:</strong> Bronze, Prata e Ouro definem os níveis de desempenho individual.
          A Meta da Loja é o objetivo total de faturamento de todos os vendedores combinados.
        </p>
      </div>
    </div>
  );
}

// ===================== TAB SOFIA =====================
function TabSofia() {
  const [comissaoLoja, setComissaoLoja] = useState("");
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, refetch } = trpc.pdvConfig.getSofiaConfig.useQuery();
  const saveMutation = trpc.pdvConfig.updateSofiaConfig.useMutation({
    onSuccess: () => { toast.success("Configuração Sofia atualizada!"); setDirty(false); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  useEffect(() => {
    if (data) setComissaoLoja(String(data.comissaoLoja));
  }, [data]);

  function handleSave() {
    saveMutation.mutate({ comissaoLoja: parseFloat(comissaoLoja) || 0 });
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">Produto Sofia (Terceirizado)</h2>
        <SaveButton dirty={dirty} saving={saveMutation.isPending} onClick={handleSave} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-4 h-4 text-purple-400" />
          <label className="text-white font-semibold text-sm">Bônus da Loja por Peça (R$)</label>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">R$</span>
          <input
            type="number"
            step="1"
            min="0"
            value={comissaoLoja}
            onChange={(e) => { setComissaoLoja(e.target.value); setDirty(true); }}
            placeholder="10"
            className="w-32 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors"
          />
          <span className="text-gray-500 text-sm">por peça Sofia</span>
        </div>
        <p className="text-gray-500 text-xs mt-3">
          Esse valor é descontado do faturamento Sofia para calcular o reembolso ao vendedor.
          Exemplo: peça vendida a R$50 com bônus R${comissaoLoja || "10"} = reembolso R${Math.max(0, 50 - (parseFloat(comissaoLoja) || 10))}.
        </p>
      </div>

      <div className="bg-purple-950/30 border border-purple-900/50 rounded-2xl p-4">
        <p className="text-purple-300 text-sm">
          <strong>Como funciona:</strong> No checkout, cada item pode ser marcado individualmente como "Sofia".
          Itens Sofia não entram no bônus dos vendedores. No final do dia, o Dashboard Sofia
          calcula automaticamente o reembolso (faturamento - bônus da loja).
        </p>
      </div>
    </div>
  );
}

// ===================== TAB SINCRONIZAÇÃO =====================
function TabSync() {
  const { isAdmin } = usePdvAuth();
  const [showPreview, setShowPreview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ updated: number; skipped: number; errors: number; message: string } | null>(null);

  const { data: syncStatus, refetch: refetchStatus } = trpc.pdvSync.status.useQuery(undefined, { enabled: isAdmin });
  const { data: syncPreview, isLoading: previewLoading } = trpc.pdvSync.preview.useQuery(undefined, { enabled: isAdmin && showPreview });

  const backfillMutation = trpc.pdvSync.backfillPedidosItens.useMutation({
    onSuccess: (result: any) => {
      setBackfillResult(result);
      toast.success(result.message);
    },
    onError: (err: any) => { toast.error(`Erro no backfill: ${err.message}`); },
  });

  const syncMutation = trpc.pdvSync.sync.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Sincronização concluída! ${result.inseridos} novos, ${result.atualizados} atualizados, ${result.ignorados} ignorados.`);
      setSyncing(false);
      setShowPreview(false);
      refetchStatus();
    },
    onError: (err: any) => { toast.error(`Erro: ${err.message}`); setSyncing(false); },
  });

  function handleSync() {
    setSyncing(true);
    syncMutation.mutate({ confirmar: true });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-white font-bold text-lg">Sincronização Google Sheets</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-950/50 border border-green-900/50 rounded-xl flex items-center justify-center">
              <Database className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Catálogo de Produtos</h3>
              <p className="text-gray-500 text-xs">Google Sheets → Banco de Dados PDV</p>
            </div>
          </div>
          <a
            href="https://docs.google.com/spreadsheets/d/1z-Qr08Oy9tc3c7rd1nspR0F20oP0cRskEXmUxPxvo7M"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Abrir planilha
          </a>
        </div>

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

        {!showPreview ? (
          <button
            onClick={() => setShowPreview(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl text-sm font-semibold transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Ver prévia da sincronização
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
                        <span className="text-orange-400 text-xs font-semibold">{syncPreview.totalInvalidos} produto(s) ignorados:</span>
                      </div>
                      {syncPreview.invalidos.map((inv: any, i: number) => (
                        <p key={i} className="text-gray-500 text-xs ml-5">• {inv.codigo}: {inv.motivo}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setShowPreview(false)} className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-semibold transition-all">
                    Cancelar
                  </button>
                  <button
                    onClick={handleSync}
                    disabled={syncing || syncMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-700 hover:bg-green-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  >
                    {syncing ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sincronizando...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4" /> Confirmar Sincronização</>
                    )}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}

        <p className="text-gray-600 text-xs">
          A sincronização é somente leitura — o sistema nunca modifica a planilha.
        </p>
      </div>

      {/* Backfill pedidos_itens */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-950/50 border border-blue-900/50 rounded-xl flex items-center justify-center">
            <Database className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">Preencher Dados Retroativos</h3>
            <p className="text-gray-500 text-xs">Adiciona Data, Cliente e CEP nas linhas antigas da aba pedidos_itens</p>
          </div>
        </div>

        <div className="bg-blue-950/20 border border-blue-900/30 rounded-xl p-3">
          <p className="text-blue-300 text-xs">
            <strong>O que faz:</strong> Percorre todas as linhas da aba <code className="bg-gray-800 px-1 rounded">pedidos_itens</code> que ainda
            não têm as colunas O (data), P (cliente) e Q (CEP) preenchidas, busca os dados no banco e atualiza a planilha.
            Linhas já preenchidas não são alteradas.
          </p>
        </div>

        {backfillResult && (
          <div className="bg-green-950/30 border border-green-900/50 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-400 text-sm font-semibold">Backfill concluído</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs mt-2">
              <div className="text-center">
                <p className="text-green-400 font-bold text-base">{backfillResult.updated}</p>
                <p className="text-gray-400">Atualizadas</p>
              </div>
              <div className="text-center">
                <p className="text-gray-300 font-bold text-base">{backfillResult.skipped}</p>
                <p className="text-gray-400">Já preenchidas</p>
              </div>
              <div className="text-center">
                <p className="text-red-400 font-bold text-base">{backfillResult.errors}</p>
                <p className="text-gray-400">Erros</p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => { setBackfillResult(null); backfillMutation.mutate(); }}
          disabled={backfillMutation.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-800 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
        >
          {backfillMutation.isPending ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processando...</>
          ) : (
            <><RefreshCw className="w-4 h-4" /> Preencher Dados Retroativos</>
          )}
        </button>
        <p className="text-gray-600 text-xs">
          Execute apenas uma vez. Linhas já preenchidas serão ignoradas automaticamente.
        </p>
      </div>
    </div>
  );
}

// ===================== COMPONENTES AUXILIARES =====================
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function SaveButton({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!dirty || saving}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
        dirty
          ? "bg-green-700 hover:bg-green-800 text-white"
          : "bg-gray-800 text-gray-500 cursor-not-allowed"
      }`}
    >
      <Save className="w-4 h-4" />
      {saving ? "Salvando..." : "Salvar"}
    </button>
  );
}
