import { useState, useEffect } from "react";
import PdvLayout from "./PdvLayout";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import {
  Bot, Save, Plus, Trash2, Wifi, WifiOff, Settings,
  MessageCircle, Link2, Users, Clock, Zap, Brain,
  ChevronLeft, Eye, EyeOff, RefreshCw, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Link } from "wouter";

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "instancias" | "treinamento" | "respostas" | "horarios";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "instancias", label: "Instâncias", icon: <Wifi className="w-4 h-4" /> },
  { id: "treinamento", label: "Treinamento IA", icon: <Brain className="w-4 h-4" /> },
  { id: "respostas", label: "Respostas Rápidas", icon: <Zap className="w-4 h-4" /> },
  { id: "horarios", label: "Horários", icon: <Clock className="w-4 h-4" /> },
];

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PdvWhatsAppConfig() {
  const { isAdmin } = usePdvAuth();
  const [activeTab, setActiveTab] = useState<Tab>("instancias");
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // ── Instâncias ──────────────────────────────────────────────────────────────
  const [instForm, setInstForm] = useState({ id: 0, name: "", phone: "", instanceId: "", apiKey: "", webhookUrl: "", active: true });
  const [editingInst, setEditingInst] = useState(false);

  // ── Config IA ───────────────────────────────────────────────────────────────
  const [aiForm, setAiForm] = useState({
    enabled: false,
    aiName: "Ju",
    personality: "",
    businessContext: "",
    greetingMessage: "",
    catalogLink: "",
    groupLink: "",
    instagramLink: "",
    maxContextMessages: 10,
    responseDelayMin: 1000,
    responseDelayMax: 3000,
    escalateKeywords: [] as string[],
    newKeyword: "",
  });
  const [systemPromptPreview, setSystemPromptPreview] = useState("");

  // ── Respostas Rápidas ───────────────────────────────────────────────────────
  const [qrForm, setQrForm] = useState({ id: 0, title: "", shortcut: "", content: "", category: "" });
  const [editingQr, setEditingQr] = useState(false);

  // ── Horários ────────────────────────────────────────────────────────────────
  const [awayForm, setAwayForm] = useState({
    awayEnabled: false,
    awayStart: "18:00",
    awayEnd: "08:00",
    awayMessage: "",
  });

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: instances = [], refetch: refetchInst } = trpc.wa.listInstances.useQuery();

  const { data: aiConfig, refetch: refetchAiConfig } = trpc.wa.getAiConfig.useQuery(
    { instanceId: selectedInstanceId! },
    { enabled: !!selectedInstanceId }
  );

  const { data: quickReplies = [], refetch: refetchQr } = trpc.wa.listQuickReplies.useQuery(
    { instanceId: selectedInstanceId ?? undefined }
  );

  // Preenche o form quando a config da IA é carregada
  useEffect(() => {
    if (aiConfig) {
      setAiForm({
        enabled: aiConfig.enabled ?? false,
        aiName: aiConfig.aiName ?? "Ju",
        personality: aiConfig.personality ?? "",
        businessContext: aiConfig.businessContext ?? "",
        greetingMessage: aiConfig.greetingMessage ?? "",
        catalogLink: aiConfig.catalogLink ?? "",
        groupLink: aiConfig.groupLink ?? "",
        instagramLink: aiConfig.instagramLink ?? "",
        maxContextMessages: aiConfig.maxContextMessages ?? 10,
        responseDelayMin: aiConfig.responseDelayMin ?? 1000,
        responseDelayMax: aiConfig.responseDelayMax ?? 3000,
        escalateKeywords: Array.isArray(aiConfig.escalateKeywords)
          ? aiConfig.escalateKeywords
          : (typeof aiConfig.escalateKeywords === "string" ? JSON.parse(aiConfig.escalateKeywords || "[]") : []),
        newKeyword: "",
      });
      setAwayForm({
        awayEnabled: aiConfig.awayEnabled ?? false,
        awayStart: aiConfig.awayStart ?? "18:00",
        awayEnd: aiConfig.awayEnd ?? "08:00",
        awayMessage: aiConfig.awayMessage ?? "",
      });
      setSystemPromptPreview(aiConfig.systemPrompt ?? "");
    }
  }, [aiConfig]);

  useEffect(() => {
    if (instances.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(instances[0].id);
    }
  }, [instances, selectedInstanceId]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const upsertInst = trpc.wa.upsertInstance.useMutation({
    onSuccess: () => { toast.success("Instância salva!"); refetchInst(); setEditingInst(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateStatus = trpc.wa.updateInstanceStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); refetchInst(); },
    onError: (e) => toast.error(e.message),
  });

  const saveAiConfig = trpc.wa.saveAiConfig.useMutation({
    onSuccess: (data) => {
      toast.success("Configuração da IA salva!");
      setSystemPromptPreview(data.systemPrompt ?? "");
      refetchAiConfig();
    },
    onError: (e) => toast.error(e.message),
  });

  const upsertQr = trpc.wa.upsertQuickReply.useMutation({
    onSuccess: () => { toast.success("Resposta rápida salva!"); refetchQr(); setEditingQr(false); resetQrForm(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteQr = trpc.wa.deleteQuickReply.useMutation({
    onSuccess: () => { toast.success("Removida!"); refetchQr(); },
    onError: (e) => toast.error(e.message),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function resetQrForm() {
    setQrForm({ id: 0, title: "", shortcut: "", content: "", category: "" });
  }

  function handleSaveAi() {
    if (!selectedInstanceId) return toast.error("Selecione uma instância");
    saveAiConfig.mutate({
      instanceId: selectedInstanceId,
      ...aiForm,
      ...awayForm,
      escalateKeywords: aiForm.escalateKeywords,
    });
  }

  function addKeyword() {
    const kw = aiForm.newKeyword.trim();
    if (!kw) return;
    setAiForm(f => ({ ...f, escalateKeywords: [...f.escalateKeywords, kw], newKeyword: "" }));
  }

  function removeKeyword(kw: string) {
    setAiForm(f => ({ ...f, escalateKeywords: f.escalateKeywords.filter(k => k !== kw) }));
  }

  if (!isAdmin) {
    return (
      <PdvLayout>
        <div className="flex items-center justify-center h-full text-gray-400">
          <AlertCircle className="w-5 h-5 mr-2" />
          Acesso restrito a administradores.
        </div>
      </PdvLayout>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PdvLayout>
      <div className="h-full flex flex-col bg-gray-950">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-4 bg-gray-900 border-b border-gray-800 shrink-0">
          <Link href="/pdv/whatsapp">
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white h-8 w-8">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-700 rounded-lg flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm">Configurações WhatsApp IA</h1>
              <p className="text-gray-400 text-xs">Gerencie instâncias, treinamento e respostas</p>
            </div>
          </div>

          {/* Seletor de instância */}
          {instances.length > 0 && (
            <div className="ml-auto">
              <Select
                value={selectedInstanceId?.toString() ?? ""}
                onValueChange={v => setSelectedInstanceId(Number(v))}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-xs w-44">
                  <SelectValue placeholder="Selecionar instância" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-white">
                  {instances.map((i: any) => (
                    <SelectItem key={i.id} value={i.id.toString()} className="text-xs">
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-3 bg-gray-900 border-b border-gray-800 overflow-x-auto shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-green-700 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">

          {/* ── Tab: Instâncias ─────────────────────────────────────────────── */}
          {activeTab === "instancias" && (
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-semibold">Instâncias WhatsApp</h2>
                  <p className="text-gray-400 text-sm mt-0.5">Gerencie os números conectados ao sistema</p>
                </div>
                <Button
                  onClick={() => { setInstForm({ id: 0, name: "", phone: "", instanceId: "", apiKey: "", webhookUrl: "", active: true }); setEditingInst(true); }}
                  className="bg-green-700 hover:bg-green-600 gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" /> Nova Instância
                </Button>
              </div>

              {/* Lista de instâncias */}
              <div className="space-y-3">
                {instances.map((inst: any) => (
                  <div key={inst.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          inst.status === "connected" ? "bg-green-900" : "bg-gray-800"
                        }`}>
                          {inst.status === "connected"
                            ? <Wifi className="w-5 h-5 text-green-400" />
                            : <WifiOff className="w-5 h-5 text-gray-500" />}
                        </div>
                        <div>
                          <div className="text-white font-semibold text-sm">{inst.name}</div>
                          <div className="text-gray-400 text-xs">{inst.phone}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${
                          inst.status === "connected" ? "bg-green-900/50 text-green-400 border-green-800" :
                          inst.status === "connecting" ? "bg-yellow-900/50 text-yellow-400 border-yellow-800" :
                          inst.status === "error" ? "bg-red-900/50 text-red-400 border-red-800" :
                          "bg-gray-800 text-gray-400 border-gray-700"
                        }`}>
                          {inst.status === "connected" ? "Conectado" :
                           inst.status === "connecting" ? "Conectando..." :
                           inst.status === "error" ? "Erro" : "Desconectado"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setInstForm({ id: inst.id, name: inst.name, phone: inst.phone, instanceId: inst.instanceId ?? "", apiKey: inst.apiKey ?? "", webhookUrl: inst.webhookUrl ?? "", active: inst.active }); setEditingInst(true); }}
                          className="text-gray-400 hover:text-white text-xs h-7"
                        >
                          Editar
                        </Button>
                      </div>
                    </div>

                    {/* Detalhes */}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-500">
                      {inst.instanceId && (
                        <div>
                          <span className="text-gray-600">ID Evocloud:</span>{" "}
                          <span className="text-gray-400 font-mono">{inst.instanceId}</span>
                        </div>
                      )}
                      {inst.webhookUrl && (
                        <div>
                          <span className="text-gray-600">Webhook:</span>{" "}
                          <span className="text-gray-400 truncate">{inst.webhookUrl}</span>
                        </div>
                      )}
                    </div>

                    {/* Aviso de configuração pendente */}
                    {(!inst.instanceId || !inst.apiKey) && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-orange-400 bg-orange-950/20 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        Configure o ID da instância e a API Key do evocloud.pro para conectar este número.
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Form de edição de instância */}
              {editingInst && (
                <div className="bg-gray-900 rounded-xl border border-green-800/50 p-5 space-y-4">
                  <h3 className="text-white font-semibold text-sm">
                    {instForm.id ? "Editar Instância" : "Nova Instância"}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Nome da instância *</Label>
                      <Input
                        value={instForm.name}
                        onChange={e => setInstForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="ex: Jumera Principal"
                        className="bg-gray-800 border-gray-700 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Número (com DDI) *</Label>
                      <Input
                        value={instForm.phone}
                        onChange={e => setInstForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="5511999999999"
                        className="bg-gray-800 border-gray-700 text-white text-sm font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Instance ID (evocloud.pro)</Label>
                      <Input
                        value={instForm.instanceId}
                        onChange={e => setInstForm(f => ({ ...f, instanceId: e.target.value }))}
                        placeholder="Obtido no painel do evocloud.pro"
                        className="bg-gray-800 border-gray-700 text-white text-sm font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">API Key (evocloud.pro)</Label>
                      <div className="relative">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          value={instForm.apiKey}
                          onChange={e => setInstForm(f => ({ ...f, apiKey: e.target.value }))}
                          placeholder="Chave de autenticação"
                          className="bg-gray-800 border-gray-700 text-white text-sm font-mono pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label className="text-gray-300 text-xs">URL do Webhook</Label>
                      <Input
                        value={instForm.webhookUrl}
                        onChange={e => setInstForm(f => ({ ...f, webhookUrl: e.target.value }))}
                        placeholder="https://seu-dominio.com/api/wa/webhook"
                        className="bg-gray-800 border-gray-700 text-white text-sm font-mono"
                      />
                      <p className="text-gray-500 text-xs">Configure esta URL no painel do evocloud.pro para receber mensagens em tempo real.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => upsertInst.mutate(instForm.id ? instForm : { name: instForm.name, phone: instForm.phone, instanceId: instForm.instanceId || undefined, apiKey: instForm.apiKey || undefined, webhookUrl: instForm.webhookUrl || undefined, active: instForm.active })}
                      disabled={upsertInst.isPending || !instForm.name || !instForm.phone}
                      className="bg-green-700 hover:bg-green-600 gap-2"
                    >
                      {upsertInst.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingInst(false)} className="text-gray-400">
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Treinamento IA ─────────────────────────────────────────── */}
          {activeTab === "treinamento" && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h2 className="text-white font-semibold">Treinamento da IA</h2>
                <p className="text-gray-400 text-sm mt-0.5">Configure como a IA deve se comportar e responder</p>
              </div>

              {/* Toggle IA */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${aiForm.enabled ? "bg-green-900" : "bg-gray-800"}`}>
                    <Bot className={`w-5 h-5 ${aiForm.enabled ? "text-green-400" : "text-gray-500"}`} />
                  </div>
                  <div>
                    <div className="text-white font-medium text-sm">IA {aiForm.enabled ? "Ativada" : "Desativada"}</div>
                    <div className="text-gray-400 text-xs">
                      {aiForm.enabled ? "A IA está respondendo automaticamente" : "A IA não está respondendo mensagens"}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={aiForm.enabled}
                  onCheckedChange={v => setAiForm(f => ({ ...f, enabled: v }))}
                />
              </div>

              {/* Identidade */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-green-400" /> Identidade da Atendente
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Nome da atendente</Label>
                    <Input
                      value={aiForm.aiName}
                      onChange={e => setAiForm(f => ({ ...f, aiName: e.target.value }))}
                      placeholder="ex: Ju"
                      className="bg-gray-800 border-gray-700 text-white text-sm"
                    />
                    <p className="text-gray-500 text-xs">O nome so sera revelado se o cliente perguntar diretamente.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Mensagem de boas-vindas</Label>
                    <Input
                      value={aiForm.greetingMessage}
                      onChange={e => setAiForm(f => ({ ...f, greetingMessage: e.target.value }))}
                      placeholder="ex: Ola, tudo bem?"
                      className="bg-gray-800 border-gray-700 text-white text-sm"
                    />
                    <p className="text-gray-500 text-xs">Enviada apenas na primeira mensagem de cada conversa.</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-gray-300 text-xs">Tom de voz e comportamento</Label>
                  <Textarea
                    value={aiForm.personality}
                    onChange={e => setAiForm(f => ({ ...f, personality: e.target.value }))}
                    className="bg-gray-800 border-gray-700 text-white text-sm min-h-[80px]"
                  />
                  <p className="text-gray-500 text-xs">Descreva como a atendente deve se comportar: tom, linguagem, limites. Sem emojis, sem excessos de cordialidade.</p>
                </div>
              </div>

              {/* Base de conhecimento */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-green-400" /> Base de Conhecimento
                </h3>
                <p className="text-gray-400 text-xs">Tudo que a IA sabe sobre a Jumera Sport. Edite conforme necessario — quanto mais completo, melhor o atendimento.</p>
                <Textarea
                  value={aiForm.businessContext}
                  onChange={e => setAiForm(f => ({ ...f, businessContext: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white text-sm min-h-[320px] font-mono text-xs leading-relaxed"
                />
                <div className="bg-gray-800/50 rounded-lg p-3 space-y-1">
                  <p className="text-gray-400 text-xs font-medium">Topicos ja configurados:</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {["Tabela de precos","Catalogo","Como fazer pedido","Minimo atacado","Trocas e defeitos","Formas de envio","Pagamento (Pix/Credito/Debito)","Tamanhos e medidas","Horarios","Endereco","Grupo WhatsApp","Linktree","Mensagem pos-compra","Aviso WhatsApp Business"].map(t => (
                      <span key={t} className="text-xs bg-green-950/40 text-green-400 border border-green-900/50 px-2 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Links */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-green-400" /> Links Automaticos
                </h3>
                <p className="text-gray-400 text-xs">A IA envia estes links automaticamente quando o cliente pedir. Atualize sempre que os links mudarem.</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Catalogo de Produtos</Label>
                    <div className="flex gap-2">
                      <Input
                        value={aiForm.catalogLink}
                        onChange={e => setAiForm(f => ({ ...f, catalogLink: e.target.value }))}
                        placeholder="https://drive.google.com/..."
                        className="bg-gray-800 border-gray-700 text-white text-sm font-mono text-xs"
                      />
                      {aiForm.catalogLink && (
                        <a href={aiForm.catalogLink} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="icon" className="border-gray-700 text-gray-400 hover:text-white shrink-0 h-9 w-9">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs">Enviado quando o cliente pedir o catalogo ou perguntar sobre produtos.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Grupo WhatsApp VIP</Label>
                    <div className="flex gap-2">
                      <Input
                        value={aiForm.groupLink}
                        onChange={e => setAiForm(f => ({ ...f, groupLink: e.target.value }))}
                        placeholder="https://chat.whatsapp.com/..."
                        className="bg-gray-800 border-gray-700 text-white text-sm font-mono text-xs"
                      />
                      {aiForm.groupLink && (
                        <a href={aiForm.groupLink} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="icon" className="border-gray-700 text-gray-400 hover:text-white shrink-0 h-9 w-9">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs">Enviado quando o cliente quiser entrar no grupo de novidades.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Linktree (numeros atualizados)</Label>
                    <div className="flex gap-2">
                      <Input
                        value={aiForm.instagramLink}
                        onChange={e => setAiForm(f => ({ ...f, instagramLink: e.target.value }))}
                        placeholder="https://linktr.ee/..."
                        className="bg-gray-800 border-gray-700 text-white text-sm font-mono text-xs"
                      />
                      {aiForm.instagramLink && (
                        <a href={aiForm.instagramLink} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="icon" className="border-gray-700 text-gray-400 hover:text-white shrink-0 h-9 w-9">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs">Enviado no aviso de restricao do WhatsApp Business para o cliente encontrar outros numeros.</p>
                  </div>
                </div>
              </div>

              {/* Escalamento para humano */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-400" /> Escalamento para Atendente
                </h3>
                <p className="text-gray-400 text-xs">
                  Quando o cliente mencionar estas palavras ou a IA nao souber responder, ela enviara "So um momento." e a conversa sera sinalizada para atendimento humano. Adicione palavras que indicam situacoes delicadas ou reclamacoes.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={aiForm.newKeyword}
                    onChange={e => setAiForm(f => ({ ...f, newKeyword: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addKeyword()}
                    placeholder="ex: reclamação, problema, cancelar..."
                    className="bg-gray-800 border-gray-700 text-white text-sm"
                  />
                  <Button onClick={addKeyword} variant="outline" className="border-gray-700 text-gray-300 hover:text-white shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {aiForm.escalateKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {aiForm.escalateKeywords.map(kw => (
                      <span key={kw} className="flex items-center gap-1.5 bg-gray-800 text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-gray-700">
                        {kw}
                        <button onClick={() => removeKeyword(kw)} className="text-gray-500 hover:text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Configurações avançadas */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <Settings className="w-4 h-4 text-green-400" /> Comportamento da IA
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Memoria da conversa</Label>
                    <Input
                      type="number"
                      value={aiForm.maxContextMessages}
                      onChange={e => setAiForm(f => ({ ...f, maxContextMessages: Number(e.target.value) }))}
                      min={1} max={50}
                      className="bg-gray-800 border-gray-700 text-white text-sm"
                    />
                    <p className="text-gray-500 text-xs">Quantas mensagens anteriores a IA lembra. Recomendado: 10 a 20.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Delay minimo de resposta (ms)</Label>
                    <Input
                      type="number"
                      value={aiForm.responseDelayMin}
                      onChange={e => setAiForm(f => ({ ...f, responseDelayMin: Number(e.target.value) }))}
                      min={0} max={10000}
                      className="bg-gray-800 border-gray-700 text-white text-sm"
                    />
                    <p className="text-gray-500 text-xs">Tempo minimo antes de responder. Simula digitacao humana. Recomendado: 1000ms.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Delay maximo de resposta (ms)</Label>
                    <Input
                      type="number"
                      value={aiForm.responseDelayMax}
                      onChange={e => setAiForm(f => ({ ...f, responseDelayMax: Number(e.target.value) }))}
                      min={0} max={30000}
                      className="bg-gray-800 border-gray-700 text-white text-sm"
                    />
                    <p className="text-gray-500 text-xs">Tempo maximo antes de responder. Recomendado: 3000ms.</p>
                  </div>
                </div>
                <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-3">
                  <p className="text-blue-300 text-xs font-medium mb-1">Como funciona o delay</p>
                  <p className="text-blue-400/70 text-xs">A IA aguarda um tempo aleatorio entre o delay minimo e maximo antes de enviar cada resposta. Isso simula o tempo de digitacao de uma pessoa real e torna o atendimento imperceptivel como automatizado.</p>
                </div>
              </div>

              {/* Preview do system prompt */}
              {systemPromptPreview && (
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Eye className="w-4 h-4 text-green-400" /> Instrucoes Enviadas para a IA (somente leitura)
                  </h3>
                  <p className="text-gray-500 text-xs">Este e o texto completo que a IA recebe antes de cada conversa. E gerado automaticamente com base nas configuracoes acima. Nao e necessario editar manualmente.</p>
                  <pre className="text-gray-400 text-xs whitespace-pre-wrap font-mono bg-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto leading-relaxed">
                    {systemPromptPreview}
                  </pre>
                </div>
              )}

              <Button
                onClick={handleSaveAi}
                disabled={saveAiConfig.isPending || !selectedInstanceId}
                className="bg-green-700 hover:bg-green-600 gap-2 w-full sm:w-auto"
              >
                {saveAiConfig.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Configuração da IA
              </Button>
            </div>
          )}

          {/* ── Tab: Respostas Rápidas ──────────────────────────────────────── */}
          {activeTab === "respostas" && (
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-semibold">Respostas Rápidas</h2>
                  <p className="text-gray-400 text-sm mt-0.5">Templates de mensagem para agilizar o atendimento</p>
                </div>
                <Button
                  onClick={() => { resetQrForm(); setEditingQr(true); }}
                  className="bg-green-700 hover:bg-green-600 gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" /> Nova Resposta
                </Button>
              </div>

              {/* Form */}
              {editingQr && (
                <div className="bg-gray-900 rounded-xl border border-green-800/50 p-5 space-y-4">
                  <h3 className="text-white font-semibold text-sm">
                    {qrForm.id ? "Editar Resposta" : "Nova Resposta Rápida"}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Título *</Label>
                      <Input
                        value={qrForm.title}
                        onChange={e => setQrForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="ex: Enviar Catálogo"
                        className="bg-gray-800 border-gray-700 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Atalho</Label>
                      <Input
                        value={qrForm.shortcut}
                        onChange={e => setQrForm(f => ({ ...f, shortcut: e.target.value }))}
                        placeholder="/catalogo"
                        className="bg-gray-800 border-gray-700 text-white text-sm font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Categoria</Label>
                      <Input
                        value={qrForm.category}
                        onChange={e => setQrForm(f => ({ ...f, category: e.target.value }))}
                        placeholder="ex: catalogo, pagamento, entrega"
                        className="bg-gray-800 border-gray-700 text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Conteúdo da mensagem *</Label>
                    <Textarea
                      value={qrForm.content}
                      onChange={e => setQrForm(f => ({ ...f, content: e.target.value }))}
                      placeholder="Digite o conteúdo da mensagem..."
                      className="bg-gray-800 border-gray-700 text-white text-sm min-h-[100px]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => upsertQr.mutate(qrForm.id
                        ? { id: qrForm.id, title: qrForm.title, shortcut: qrForm.shortcut || undefined, content: qrForm.content, category: qrForm.category || undefined }
                        : { instanceId: selectedInstanceId ?? undefined, title: qrForm.title, shortcut: qrForm.shortcut || undefined, content: qrForm.content, category: qrForm.category || undefined }
                      )}
                      disabled={upsertQr.isPending || !qrForm.title || !qrForm.content}
                      className="bg-green-700 hover:bg-green-600 gap-2"
                    >
                      {upsertQr.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar
                    </Button>
                    <Button variant="ghost" onClick={() => { setEditingQr(false); resetQrForm(); }} className="text-gray-400">
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista */}
              <div className="space-y-3">
                {quickReplies.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma resposta rápida cadastrada</p>
                  </div>
                ) : (
                  quickReplies.map((qr: any) => (
                    <div key={qr.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-medium text-sm">{qr.title}</span>
                            {qr.shortcut && (
                              <span className="text-green-400 text-xs font-mono bg-green-950/30 px-1.5 py-0.5 rounded">
                                {qr.shortcut}
                              </span>
                            )}
                            {qr.category && (
                              <Badge className="text-xs bg-gray-800 text-gray-400 border-gray-700">
                                {qr.category}
                              </Badge>
                            )}
                          </div>
                          <p className="text-gray-400 text-xs mt-1.5 line-clamp-2">{qr.content}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setQrForm({ id: qr.id, title: qr.title, shortcut: qr.shortcut ?? "", content: qr.content, category: qr.category ?? "" }); setEditingQr(true); }}
                            className="text-gray-400 hover:text-white h-7 text-xs"
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteQr.mutate({ id: qr.id })}
                            className="text-gray-500 hover:text-red-400 h-7 w-7"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Horários ───────────────────────────────────────────────── */}
          {activeTab === "horarios" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-white font-semibold">Horário de Atendimento</h2>
                <p className="text-gray-400 text-sm mt-0.5">Configure a mensagem de ausência fora do horário comercial</p>
              </div>

              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
                <div className="bg-amber-950/20 border border-amber-900/30 rounded-lg p-3 mb-2">
                  <p className="text-amber-300 text-xs font-medium">Horario configurado na base de conhecimento</p>
                  <div className="text-amber-400/70 text-xs mt-1 space-y-0.5">
                    <p>Shopping Stunt: segunda a sexta 06h-15h, sabado 08h-16h, domingo fechado</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white text-sm font-medium">Ativar mensagem de ausencia automatica</div>
                    <div className="text-gray-400 text-xs mt-0.5">
                      Fora do horario configurado abaixo, a IA enviara a mensagem de ausencia
                    </div>
                  </div>
                  <Switch
                    checked={awayForm.awayEnabled}
                    onCheckedChange={v => setAwayForm(f => ({ ...f, awayEnabled: v }))}
                  />
                </div>

                {awayForm.awayEnabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-gray-300 text-xs">Início da ausência</Label>
                        <Input
                          type="time"
                          value={awayForm.awayStart}
                          onChange={e => setAwayForm(f => ({ ...f, awayStart: e.target.value }))}
                          className="bg-gray-800 border-gray-700 text-white text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-gray-300 text-xs">Fim da ausência</Label>
                        <Input
                          type="time"
                          value={awayForm.awayEnd}
                          onChange={e => setAwayForm(f => ({ ...f, awayEnd: e.target.value }))}
                          className="bg-gray-800 border-gray-700 text-white text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Mensagem de ausencia</Label>
                      <Textarea
                        value={awayForm.awayMessage}
                        onChange={e => setAwayForm(f => ({ ...f, awayMessage: e.target.value }))}
                        placeholder="Ex: No momento estamos fora do horario de atendimento. Retornaremos em breve. Nosso horario e de segunda a sabado, das 6h as 15h."
                        className="bg-gray-800 border-gray-700 text-white text-sm min-h-[100px]"
                      />
                      <p className="text-gray-500 text-xs">Sem emojis. Resposta direta informando o horario de retorno.</p>
                    </div>
                  </>
                )}
              </div>

              <Button
                onClick={handleSaveAi}
                disabled={saveAiConfig.isPending || !selectedInstanceId}
                className="bg-green-700 hover:bg-green-600 gap-2"
              >
                {saveAiConfig.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Horários
              </Button>
            </div>
          )}
        </div>
      </div>
    </PdvLayout>
  );
}
