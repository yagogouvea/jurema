import { useState, useEffect, useRef } from "react";
import PdvLayout from "./PdvLayout";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import {
  Bot, Save, Plus, Wifi, WifiOff, Settings,
  Clock, Zap, Brain, Link2, Users, Trash2,
  ChevronLeft, Eye, RefreshCw, AlertCircle,
  QrCode, RotateCcw, CheckCircle2, Radio, ExternalLink, ChevronDown, Sparkles, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Link } from "wouter";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DEFAULT_AI_NAME,
  DEFAULT_AWAY_MESSAGE,
  DEFAULT_BUSINESS_CONTEXT,
  DEFAULT_ESCALATE_KEYWORDS,
  DEFAULT_GREETING_MESSAGE,
  DEFAULT_PERSONALITY,
} from "@shared/waAiDefaultStrings";

const AWAY_DAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const;
const AWAY_DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Modelos rápidos de tom — substituem o campo "comportamento" inteiro; a equipe pode editar depois. */
const PERSONALITY_PRESETS: { label: string; text: string }[] = [
  {
    label: "Padrão Jurema (recomendado)",
    text: `Você representa uma atendente humana da Jurema Sport no WhatsApp.

Como falar:
- Educação e clareza em primeiro lugar; frases curtas (em geral até 2 ou 3).
- Tom profissional e acolhedor, sem exageros, sem gírias forçadas.
- Evite emojis; use no máximo um quando fizer muito sentido.
- Nunca diga que é robô, inteligência artificial, chatbot ou "sistema automático".
- Não repita o nome do cliente em toda mensagem.
- Se não souber preço, estoque, prazo ou política com certeza, responda exatamente: "Só um momento." e não invente dados.

O que evitar:
- Prometer desconto ou brinde sem base nas regras da loja.
- Discutir assuntos que não sejam compra, pedido, produto ou logística da loja.`,
  },
  {
    label: "Mais formal",
    text: `Atendimento cordial e formal, com vocabulário neutro e respeitoso.
- Evite gírias, abreviações e emojis.
- Frases claras e curtas.
- Nunca mencione automação ou inteligência artificial.
- Em dúvida sobre dados sensíveis (preço, estoque, prazo), responda apenas: "Só um momento."`,
  },
  {
    label: "Mais leve (ainda profissional)",
    text: `Atendimento simpático e leve, como uma loja que conhece bem o cliente de WhatsApp.
- Pode usar uma ou outra expressão calorosa, sem exagerar.
- No máximo um emoji por mensagem, só quando combinar com o tom do cliente.
- Nunca diga que é robô ou IA.
- Não invente informações; se não souber, diga "Só um momento."`,
  },
];

type AwayMode = "legacy" | "closed" | "open";

function parseScheduleToState(raw: unknown): {
  modes: Record<string, AwayMode>;
  opens: Record<string, { start: string; end: string }>;
} {
  const modes: Record<string, AwayMode> = {};
  const opens: Record<string, { start: string; end: string }> = {};
  for (const k of AWAY_DAY_KEYS) {
    modes[k] = "legacy";
    opens[k] = { start: "09:00", end: "18:00" };
  }
  let parsed: Record<string, { mode?: string; start?: string; end?: string }> | null = null;
  if (typeof raw === "string" && raw.trim() && raw !== "null") {
    try {
      parsed = JSON.parse(raw) as Record<string, { mode?: string; start?: string; end?: string }>;
    } catch {
      parsed = null;
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw as Record<string, { mode?: string; start?: string; end?: string }>;
  }
  if (parsed && typeof parsed === "object") {
    for (const k of AWAY_DAY_KEYS) {
      const r = parsed[k];
      if (!r || typeof r !== "object") continue;
      if (r.mode === "closed") modes[k] = "closed";
      else if (r.mode === "open" && r.start && r.end) {
        modes[k] = "open";
        opens[k] = { start: String(r.start), end: String(r.end) };
      } else if (r.mode === "legacy") modes[k] = "legacy";
    }
  }
  return { modes, opens };
}

function buildAwaySchedulePayload(
  modes: Record<string, AwayMode>,
  opens: Record<string, { start: string; end: string }>
): Record<string, { mode: string; start?: string; end?: string }> {
  const out: Record<string, { mode: string; start?: string; end?: string }> = {};
  for (const k of AWAY_DAY_KEYS) {
    const m = modes[k] ?? "legacy";
    if (m === "closed") out[k] = { mode: "closed" };
    else if (m === "open") {
      const o = opens[k] ?? { start: "09:00", end: "18:00" };
      out[k] = { mode: "open", start: o.start, end: o.end };
    } else out[k] = { mode: "legacy" };
  }
  return out;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "instancias" | "treinamento" | "respostas" | "horarios";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "instancias", label: "Instâncias", icon: <Wifi className="w-4 h-4" /> },
  { id: "treinamento", label: "Treinamento IA", icon: <Brain className="w-4 h-4" /> },
  { id: "respostas", label: "Respostas Rápidas", icon: <Zap className="w-4 h-4" /> },
  { id: "horarios", label: "Horários", icon: <Clock className="w-4 h-4" /> },
];

/** QR por instância wa-bridge — monta só quando status=qr, sem precisar clicar em “Ver QR”. */
function BridgeWaQrPanel({ bridgeInstanceId }: { bridgeInstanceId: number }) {
  const { data: qrImageData, refetch: refetchQrImage, isFetching: qrFetching } = trpc.wa.bridgeQrImage.useQuery(
    { bridgeInstanceId },
    { enabled: true, refetchInterval: 2_000, refetchOnWindowFocus: true }
  );
  const [qrAge, setQrAge] = useState(0);
  const [qrLastUpdated, setQrLastUpdated] = useState<Date | null>(null);
  const prevQrRef = useRef<string | null>(null);
  useEffect(() => {
    if (qrImageData?.ok && qrImageData.qr && qrImageData.qr !== prevQrRef.current) {
      prevQrRef.current = qrImageData.qr;
      setQrLastUpdated(new Date());
      setQrAge(0);
    }
  }, [qrImageData?.qr]);
  useEffect(() => {
    if (!qrLastUpdated) return;
    const t = setInterval(() => setQrAge(Math.floor((Date.now() - qrLastUpdated.getTime()) / 1000)), 1000);
    return () => clearInterval(t);
  }, [qrLastUpdated]);

  return (
    <div className="flex flex-col items-center gap-2">
      {qrImageData?.ok && qrImageData.qr ? (
        <>
          <div className="relative">
            <div className="bg-white p-2 rounded-xl">
              <img src={qrImageData.qr} alt="QR Code" className="w-48 h-48" />
            </div>
            <div
              className="absolute -top-2 -right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold"
              style={{
                background: qrAge > 15 ? "#ef444420" : "#25D36620",
                color: qrAge > 15 ? "#ef4444" : "#25D366",
                border: `1px solid ${qrAge > 15 ? "#ef444440" : "#25D36640"}`,
              }}
            >
              {qrFetching ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : null}
              {qrAge}s
            </div>
          </div>
          <p className="text-[10px] text-center" style={{ color: "#fbbf24" }}>
            Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
          </p>
          {qrAge > 15 && (
            <p className="text-[9px] text-center" style={{ color: "#ef4444" }}>
              QR antigo — aguarde atualizar antes de escanear
            </p>
          )}
          <button
            type="button"
            onClick={() => refetchQrImage()}
            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded"
            style={{ color: "#888", background: "#1a1a1a" }}
          >
            <RefreshCw className="w-3 h-3" /> Atualizar QR
          </button>
        </>
      ) : (qrImageData as { status?: string; dashboardUrl?: string } | undefined)?.status === "use_dashboard" &&
        (qrImageData as { dashboardUrl?: string }).dashboardUrl ? (
        <>
          <p className="text-[10px] text-center" style={{ color: "#fbbf24" }}>
            QR disponível no Railway. Clique para escanear:
          </p>
          <a
            href={(qrImageData as { dashboardUrl: string }).dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold"
            style={{ background: "#fbbf2420", color: "#fbbf24", border: "1px solid #fbbf2440" }}
          >
            <ExternalLink className="w-4 h-4" /> Abrir QR Code
          </a>
          <p className="text-[10px] text-center" style={{ color: "#666" }}>
            Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
          </p>
        </>
      ) : (
        <div className="flex items-center gap-2 text-xs" style={{ color: "#888" }}>
          <RefreshCw className="w-4 h-4 animate-spin" /> Carregando QR...
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PdvWhatsAppConfig() {
  const { isAdmin } = usePdvAuth();
  const [activeTab, setActiveTab] = useState<Tab>("instancias");
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [trainingAdvancedOpen, setTrainingAdvancedOpen] = useState(true);
  const [refineWish, setRefineWish] = useState("");
  const [refinePreview, setRefinePreview] = useState<
    | { outcome: "proposal"; messageForUser: string; updates: Record<string, unknown> }
    | { outcome: "reject"; messageForUser: string; rejectCode: string }
    | null
  >(null);

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
    systemPrompt: "",
    catalogLink: "",
    groupLink: "",
    instagramLink: "",
    maxContextMessages: 10,
    responseDelayMin: 1000,
    responseDelayMax: 3000,
    escalateKeywords: [] as string[],
    newKeyword: "",
  });

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
  const [awayDayMode, setAwayDayMode] = useState<Record<string, AwayMode>>({});
  const [awayDayOpen, setAwayDayOpen] = useState<Record<string, { start: string; end: string }>>({});
  const [awayTargetInstanceIds, setAwayTargetInstanceIds] = useState<number[]>([]);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: instances = [], refetch: refetchInst } = trpc.wa.listInstances.useQuery();

  const {
    data: aiConfig,
    isLoading: aiConfigLoading,
    isError: aiConfigIsError,
    refetch: refetchAiConfig,
  } = trpc.wa.getAiConfig.useQuery(
    { instanceId: selectedInstanceId! },
    { enabled: !!selectedInstanceId, staleTime: 0, retry: 1 }
  );

  const {
    data: aiTrainingDefaults,
    isLoading: aiDefaultsLoading,
    refetch: refetchAiDefaults,
  } = trpc.wa.getAiTrainingDefaults.useQuery(undefined, {
    /** Com instância selecionada já buscamos o modelo — assim o rascunho não fica vazio se getAiConfig falhar. */
    enabled: !!selectedInstanceId,
    staleTime: 60_000,
  });

  const aiUiPayload = aiConfig ?? aiTrainingDefaults;
  const aiHydrationPending =
    !!selectedInstanceId &&
    (aiConfigLoading ||
      (aiConfig === undefined && aiTrainingDefaults === undefined && aiDefaultsLoading));

  const warnedAiLoadRef = useRef(false);
  useEffect(() => {
    warnedAiLoadRef.current = false;
  }, [selectedInstanceId]);

  const { data: quickReplies = [], refetch: refetchQr } = trpc.wa.listQuickReplies.useQuery(
    { instanceId: selectedInstanceId ?? undefined }
  );

  // Status real do wa-bridge (Railway) — atualiza a cada 15s
  const { data: bridgeData, refetch: refetchBridge, isFetching: bridgeFetching } = trpc.wa.bridgeStatus.useQuery(
    undefined,
    { refetchInterval: 15_000 }
  );

  // Preenche o formulário: getAiConfig (banco + defaults) ou, se falhar, getAiTrainingDefaults; se ambos falharem, defaults do pacote compartilhado.
  useEffect(() => {
    if (!selectedInstanceId) return;
    if (aiConfigLoading) return;
    if (aiConfig === undefined && aiTrainingDefaults === undefined && aiDefaultsLoading) return;

    const d = aiTrainingDefaults;
    const cfg = aiConfig ?? aiTrainingDefaults;

    const pickStr = (apiVal: string | null | undefined, draftVal: string | null | undefined, fallback: string) => {
      const s = apiVal != null ? String(apiVal).trim() : "";
      if (s) return s;
      const t = draftVal != null ? String(draftVal).trim() : "";
      if (t) return t;
      return fallback;
    };

    if (cfg === undefined) {
      const { modes, opens } = parseScheduleToState(null);
      setAwayDayMode(modes);
      setAwayDayOpen(opens);
      setAiForm({
        enabled: false,
        aiName: DEFAULT_AI_NAME,
        personality: DEFAULT_PERSONALITY,
        businessContext: DEFAULT_BUSINESS_CONTEXT,
        greetingMessage: DEFAULT_GREETING_MESSAGE,
        systemPrompt: "",
        catalogLink: "",
        groupLink: "",
        instagramLink: "",
        maxContextMessages: 10,
        responseDelayMin: 1000,
        responseDelayMax: 3000,
        escalateKeywords: [...DEFAULT_ESCALATE_KEYWORDS],
        newKeyword: "",
      });
      setAwayForm({
        awayEnabled: false,
        awayStart: "18:00",
        awayEnd: "08:00",
        awayMessage: DEFAULT_AWAY_MESSAGE,
      });
      if (aiConfigIsError && !warnedAiLoadRef.current) {
        warnedAiLoadRef.current = true;
        toast.error(
          "Não foi possível carregar a configuração da IA no servidor. Mostramos o modelo local — após atualizar o sistema, use \"Buscar de novo\"."
        );
      }
      return;
    }

    const { modes, opens } = parseScheduleToState(cfg.awaySchedule);
    setAwayDayMode(modes);
    setAwayDayOpen(opens);
    setAiForm({
      enabled: Boolean(cfg.enabled),
      aiName: pickStr(cfg.aiName, d?.aiName, DEFAULT_AI_NAME),
      personality: pickStr(cfg.personality, d?.personality, DEFAULT_PERSONALITY),
      businessContext: pickStr(cfg.businessContext, d?.businessContext, DEFAULT_BUSINESS_CONTEXT),
      greetingMessage: pickStr(cfg.greetingMessage, d?.greetingMessage, DEFAULT_GREETING_MESSAGE),
      systemPrompt: cfg.systemPrompt,
      catalogLink: cfg.catalogLink,
      groupLink: cfg.groupLink,
      instagramLink: cfg.instagramLink,
      maxContextMessages: cfg.maxContextMessages,
      responseDelayMin: cfg.responseDelayMin,
      responseDelayMax: cfg.responseDelayMax,
      escalateKeywords: Array.isArray(cfg.escalateKeywords) ? [...cfg.escalateKeywords] : [],
      newKeyword: "",
    });
    setAwayForm({
      awayEnabled: Boolean(cfg.awayEnabled),
      awayStart: cfg.awayStart,
      awayEnd: cfg.awayEnd,
      awayMessage: pickStr(cfg.awayMessage, d?.awayMessage, DEFAULT_AWAY_MESSAGE),
    });
  }, [
    selectedInstanceId,
    aiConfig,
    aiTrainingDefaults,
    aiConfigLoading,
    aiDefaultsLoading,
    aiConfigIsError,
  ]);

  useEffect(() => {
    if (activeTab !== "horarios" || !instances.length) return;
    setAwayTargetInstanceIds((prev) => (prev.length > 0 ? prev : (instances as { id: number }[]).map((i) => i.id)));
  }, [activeTab, instances]);

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

  const autoBridgeStartOnce = useRef<Set<number>>(new Set());

  const bridgeReset = trpc.wa.bridgeReset.useMutation({
    onSuccess: (_data, vars) => {
      autoBridgeStartOnce.current.delete(vars.bridgeInstanceId);
      toast.success("Sessão resetada — aguarde o QR Code aparecer.");
      setTimeout(() => refetchBridge(), 5000);
    },
    onError: (e) => toast.error(e.message),
  });

  const bridgeStart = trpc.wa.bridgeStart.useMutation({
    onSuccess: () => {
      toast.success("Iniciando conexão — aguarde o QR Code aparecer.");
      setTimeout(() => refetchBridge(), 5000);
    },
    onError: (e, vars) => {
      autoBridgeStartOnce.current.delete(vars.bridgeInstanceId);
      toast.error(e.message);
    },
  });

  // Ao abrir a aba Instâncias: se wa-bridge estiver parado (desconectado), inicia sozinho uma vez por sessão
  // para gerar QR sem precisar apertar “Iniciar”. Após “Resetar sessão”, volta a poder auto-iniciar.
  useEffect(() => {
    if (activeTab !== "instancias" || !bridgeData?.available || !bridgeData.sessions?.length) return;
    for (const sess of bridgeData.sessions) {
      if (sess.status !== "disconnected") continue;
      if (autoBridgeStartOnce.current.has(sess.instanceId)) continue;
      autoBridgeStartOnce.current.add(sess.instanceId);
      bridgeStart.mutate({ bridgeInstanceId: sess.instanceId });
    }
  }, [activeTab, bridgeData?.available, bridgeData?.sessions]);

  const refineTrainingAi = trpc.wa.refineAiTrainingFromRequest.useMutation({
    onSuccess: (data) => {
      setRefinePreview(data);
      if (data.outcome === "proposal") {
        toast.success("Sugestão pronta — leia o resumo e confirme para aplicar.");
      } else {
        toast.message(data.messageForUser);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const saveAiConfig = trpc.wa.saveAiConfig.useMutation({
    onSuccess: (data) => {
      toast.success("Configuração da IA salva!");
      if (data.systemPrompt != null) {
        setAiForm((f) => ({ ...f, systemPrompt: data.systemPrompt as string }));
      }
      refetchAiConfig();
    },
    onError: (e) => toast.error(e.message),
  });

  const saveAwayBatch = trpc.wa.saveAwayBatch.useMutation({
    onSuccess: () => {
      toast.success("Horários e ausência aplicados nas instâncias selecionadas.");
      refetchAiConfig();
      refetchInst();
    },
    onError: (e) => toast.error(e.message),
  });

  const setInstanceAi = trpc.wa.setInstanceAiEnabled.useMutation({
    onSuccess: () => {
      toast.success("Preferência da instância salva.");
      refetchInst();
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

  /** Recoloca no formulário o texto modelo completo (não grava no banco até Salvar). */
  function applyTrainingDefaultsDraft() {
    if (!aiTrainingDefaults) {
      toast.error("Aguarde o carregamento do modelo e tente de novo.");
      return;
    }
    const d = aiTrainingDefaults;
    const { modes, opens } = parseScheduleToState(d.awaySchedule);
    setAwayDayMode(modes);
    setAwayDayOpen(opens);
    setAiForm({
      enabled: d.enabled,
      aiName: d.aiName,
      personality: d.personality,
      businessContext: d.businessContext,
      greetingMessage: d.greetingMessage,
      systemPrompt: d.systemPrompt,
      catalogLink: d.catalogLink,
      groupLink: d.groupLink,
      instagramLink: d.instagramLink,
      maxContextMessages: d.maxContextMessages,
      responseDelayMin: d.responseDelayMin,
      responseDelayMax: d.responseDelayMax,
      escalateKeywords: [...d.escalateKeywords],
      newKeyword: "",
    });
    setAwayForm({
      awayEnabled: d.awayEnabled,
      awayStart: d.awayStart,
      awayEnd: d.awayEnd,
      awayMessage: d.awayMessage,
    });
    toast.success("Rascunho atualizado com o modelo Jurema. Revise e clique em Salvar para gravar.");
  }

  function applyPersonalityPreset(text: string) {
    setAiForm((f) => ({ ...f, personality: text }));
    toast.success("Tom aplicado — ajuste o texto como quiser.");
  }

  function handleSaveAi() {
    if (!selectedInstanceId) return toast.error("Selecione uma instância");
    saveAiConfig.mutate({
      instanceId: selectedInstanceId,
      ...aiForm,
      ...awayForm,
      escalateKeywords: aiForm.escalateKeywords,
      systemPrompt: aiForm.systemPrompt,
    });
  }

  type RefineUpdates = {
    personality?: string | null;
    businessContext?: string | null;
    greetingMessage?: string | null;
    systemPrompt?: string | null;
    catalogLink?: string | null;
    groupLink?: string | null;
    instagramLink?: string | null;
    escalateKeywords?: string[] | null;
  };

  function mergeRefineIntoAiForm(base: typeof aiForm, u: RefineUpdates): typeof aiForm {
    const pick = (patch: string | null | undefined, prev: string) =>
      patch != null && String(patch).trim().length > 0 ? String(patch).trim() : prev;
    return {
      ...base,
      personality: pick(u.personality ?? undefined, base.personality),
      businessContext: pick(u.businessContext ?? undefined, base.businessContext),
      greetingMessage: pick(u.greetingMessage ?? undefined, base.greetingMessage),
      systemPrompt: pick(u.systemPrompt ?? undefined, base.systemPrompt),
      catalogLink: pick(u.catalogLink ?? undefined, base.catalogLink),
      groupLink: pick(u.groupLink ?? undefined, base.groupLink),
      instagramLink: pick(u.instagramLink ?? undefined, base.instagramLink),
      escalateKeywords: Array.isArray(u.escalateKeywords) ? u.escalateKeywords : base.escalateKeywords,
    };
  }

  function refineChangedLabels(u: RefineUpdates): string {
    const out: string[] = [];
    if (u.personality != null && String(u.personality).trim()) out.push("comportamento");
    if (u.businessContext != null && String(u.businessContext).trim()) out.push("base de conhecimento");
    if (u.greetingMessage != null && String(u.greetingMessage).trim()) out.push("saudação");
    if (u.systemPrompt != null && String(u.systemPrompt).trim()) out.push("texto completo (system)");
    if (u.catalogLink != null && String(u.catalogLink).trim()) out.push("link catálogo");
    if (u.groupLink != null && String(u.groupLink).trim()) out.push("link grupo");
    if (u.instagramLink != null && String(u.instagramLink).trim()) out.push("links úteis");
    if (Array.isArray(u.escalateKeywords)) out.push("palavras de escalação");
    return out.length ? out.join(", ") : "—";
  }

  function submitRefineTrainingRequest() {
    if (!selectedInstanceId) return toast.error("Selecione uma instância");
    const t = refineWish.trim();
    if (t.length < 12) return toast.error("Escreva um pouco mais de detalhe (mínimo 12 caracteres).");
    setRefinePreview(null);
    refineTrainingAi.mutate({
      instanceId: selectedInstanceId,
      request: t,
      current: {
        personality: aiForm.personality,
        businessContext: aiForm.businessContext,
        greetingMessage: aiForm.greetingMessage,
        systemPrompt: aiForm.systemPrompt,
        catalogLink: aiForm.catalogLink,
        groupLink: aiForm.groupLink,
        instagramLink: aiForm.instagramLink,
        escalateKeywords: aiForm.escalateKeywords,
      },
    });
  }

  function applyRefineDraft() {
    if (!refinePreview || refinePreview.outcome !== "proposal") return;
    const merged = mergeRefineIntoAiForm(aiForm, refinePreview.updates as RefineUpdates);
    setAiForm(merged);
    setRefinePreview(null);
    setRefineWish("");
    setTrainingAdvancedOpen(true);
    toast.success("Sugestão aplicada ao rascunho. Revise os campos e clique em Salvar para gravar no servidor.");
  }

  function applyRefineAndSave() {
    if (!refinePreview || refinePreview.outcome !== "proposal" || !selectedInstanceId) return;
    const merged = mergeRefineIntoAiForm(aiForm, refinePreview.updates as RefineUpdates);
    setAiForm(merged);
    setRefinePreview(null);
    setRefineWish("");
    setTrainingAdvancedOpen(true);
    saveAiConfig.mutate({
      instanceId: selectedInstanceId,
      ...merged,
      ...awayForm,
      escalateKeywords: merged.escalateKeywords,
      systemPrompt: merged.systemPrompt,
    });
  }

  function toggleAwayTarget(id: number) {
    setAwayTargetInstanceIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (next.length === 0) {
          toast.error("Mantenha ao menos uma instância selecionada.");
          return prev;
        }
        return next;
      }
      return [...prev, id];
    });
  }

  function handleSaveAwayBatch() {
    const ids =
      awayTargetInstanceIds.length > 0
        ? awayTargetInstanceIds
        : selectedInstanceId
          ? [selectedInstanceId]
          : [];
    if (!ids.length) return toast.error("Selecione ao menos uma instância.");
    const msg = awayForm.awayMessage.trim();
    if (!msg) return toast.error("Preencha a mensagem de ausência.");
    saveAwayBatch.mutate({
      instanceIds: ids,
      awayEnabled: awayForm.awayEnabled,
      awayMessage: msg,
      awayStart: awayForm.awayStart,
      awayEnd: awayForm.awayEnd,
      awaySchedule: buildAwaySchedulePayload(awayDayMode, awayDayOpen),
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
        <div className="flex-1 overflow-y-auto p-4 md:p-6">          {/* ── Tab: Instâncias ────────────────────────────────────────────────── */}
          {activeTab === "instancias" && (
            <div className="max-w-3xl space-y-6">

              {/* ─── Status ao vivo do wa-bridge ─────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-white font-semibold flex items-center gap-2">
                      <Radio className="w-4 h-4 text-green-400" />
                      Conexões WhatsApp (wa-bridge)
                    </h2>
                    <p className="text-gray-400 text-xs mt-0.5">Status em tempo real das instâncias no Railway — atualiza a cada 15s</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => refetchBridge()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors border-gray-700 text-gray-400 hover:text-white"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${bridgeFetching ? "animate-spin" : ""}`} />
                      Atualizar
                    </button>
                    <a
                      href={(import.meta.env.VITE_WA_BRIDGE_DASHBOARD_URL as string | undefined) || "https://wa-bridge-production-c9a2.up.railway.app/dashboard"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors"
                      style={{ borderColor: "#25D36633", color: "#25D366" }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Painel QR
                    </a>
                  </div>
                </div>

                <div className="mb-3 rounded-xl border border-gray-800 bg-gray-900/60 p-3 text-[11px] text-gray-400 leading-relaxed">
                  <p className="text-gray-300 font-medium mb-1">Comportamento da conexão</p>
                  <p>
                    Com o servidor estável, a sessão permanece autenticada no wa-bridge (disco no Railway). O QR aparece
                    automaticamente quando a instância está aguardando pareamento; não é necessário resetar. Use{" "}
                    <span className="text-orange-300/90">Resetar sessão</span> só para trocar de WhatsApp ou refazer o
                    pareamento — isso desconecta de propósito. Enquanto estiver <span className="text-green-400/90">Conectado</span>, o
                    botão de reset fica oculto para não desligar sem querer; use o painel do wa-bridge se precisar forçar despareamento.
                  </p>
                </div>

                {bridgeData && !bridgeData.available && (
                  <div className="flex items-center gap-2 p-3 rounded-xl text-xs bg-red-950/20 border border-red-800/30 text-red-400 mb-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    wa-bridge indisponível — verifique o deploy no Railway.
                  </div>
                )}

                {bridgeData?.available && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    {bridgeData.sessions.map((sess: any) => {
                      const linkedInst = (instances as any[]).find((i: any) => String(i.instanceId) === String(sess.instanceId));
                      const isConnected = sess.status === "connected";
                      const isQr = sess.status === "qr";
                      return (
                        <div key={sess.instanceId} className="rounded-xl border p-4 space-y-3"
                          style={{ background: isConnected ? "rgba(37,211,102,0.05)" : "#111", borderColor: isConnected ? "#25D36633" : isQr ? "#fbbf2433" : "#2a2a2a" }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black"
                                style={{ background: isConnected ? "#25D36620" : "#1a1a1a", color: isConnected ? "#25D366" : "#555" }}>
                                {sess.instanceId}
                              </div>
                              <div>
                                <div className="text-white text-xs font-semibold">{sess.name ?? `Instância ${sess.instanceId}`}</div>
                                {sess.phone && <div className="text-[10px] font-mono" style={{ color: "#25D366" }}>+{sess.phone}</div>}
                              </div>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: isConnected ? "#25D36620" : isQr ? "#fbbf2420" : "#1a1a1a", color: isConnected ? "#25D366" : isQr ? "#fbbf24" : "#555" }}>
                              {isConnected ? "Conectado" : isQr ? "Aguard. QR" : "Desconectado"}
                            </span>
                          </div>
                          {/* Ícone central */}
                          <div className="flex justify-center py-1">
                            {isConnected && <CheckCircle2 className="w-8 h-8" style={{ color: "#25D366" }} />}
                            {isQr && <QrCode className="w-8 h-8" style={{ color: "#fbbf24" }} />}
                            {!isConnected && !isQr && <WifiOff className="w-8 h-8" style={{ color: "#444" }} />}
                          </div>

                          {isQr && <BridgeWaQrPanel bridgeInstanceId={sess.instanceId} />}

                          {linkedInst ? (
                            <div className="text-[10px] text-center" style={{ color: "#555" }}>
                              Vinculado: <span style={{ color: "#888" }}>{linkedInst.name}</span>
                              {linkedInst.phone && <span className="font-mono ml-1" style={{ color: "#666" }}>({linkedInst.phone})</span>}
                            </div>
                          ) : (
                            <div className="text-[10px] text-center" style={{ color: "#444" }}>Sem número vinculado</div>
                          )}

                          <div className="flex flex-col gap-1.5">
                            {!isConnected && !isQr && (
                              <button
                                type="button"
                                onClick={() => {
                                  autoBridgeStartOnce.current.delete(sess.instanceId);
                                  bridgeStart.mutate({ bridgeInstanceId: sess.instanceId });
                                }}
                                disabled={bridgeStart.isPending}
                                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold border"
                                style={{ color: "#25D366", borderColor: "#25D36633", background: "#25D36610" }}
                              >
                                {bridgeStart.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                                Iniciar conexão
                              </button>
                            )}
                            {!isConnected && (
                            <button
                              type="button"
                              onClick={() => bridgeReset.mutate({ bridgeInstanceId: sess.instanceId })}
                              disabled={bridgeReset.isPending}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold border"
                              style={{ color: "#f87171", borderColor: "#f8717122", background: "#f8717108" }}
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Resetar sessão (novo QR)
                            </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!bridgeData && (
                  <div className="flex items-center justify-center h-16 text-xs" style={{ color: "#444" }}>
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Consultando wa-bridge...
                  </div>
                )}
              </div>

              {/* ─── Números cadastrados no banco ────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-white font-semibold">Números cadastrados</h2>
                    <p className="text-gray-400 text-xs mt-0.5">Vincule cada número a uma instância wa-bridge (1, 2 ou 3)</p>
                  </div>
                  <Button
                    onClick={() => { setInstForm({ id: 0, name: "", phone: "", instanceId: "", apiKey: "", webhookUrl: "", active: true }); setEditingInst(true); }}
                    className="bg-green-700 hover:bg-green-600 gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" /> Novo Número
                  </Button>
                </div>
              {/* Lista de números */}
                <div className="space-y-3">
                  {instances.map((inst: any) => (
                    <div key={inst.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0"
                            style={{ background: "#1a1a1a", color: "#25D366" }}>
                            {inst.instanceId || "?"}
                          </div>
                          <div className="min-w-0">
                            <div className="text-white font-semibold text-sm">{inst.name}</div>
                            <div className="text-gray-400 text-xs font-mono">{inst.phone}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 text-[10px] uppercase tracking-wide">IA</span>
                            <Switch
                              checked={Boolean(inst.aiEnabledGlobal)}
                              disabled={setInstanceAi.isPending}
                              onCheckedChange={(v) => setInstanceAi.mutate({ instanceId: inst.id, enabled: v })}
                            />
                          </div>
                          <Button variant="ghost" size="sm"
                            onClick={() => { setInstForm({ id: inst.id, name: inst.name, phone: inst.phone, instanceId: inst.instanceId ?? "", apiKey: inst.apiKey ?? "", webhookUrl: inst.webhookUrl ?? "", active: inst.active }); setEditingInst(true); }}
                            className="text-gray-400 hover:text-white text-xs h-7">
                            Editar
                          </Button>
                        </div>
                      </div>
                      {!inst.instanceId && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-orange-400 bg-orange-950/20 rounded-lg px-3 py-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          Defina o <strong>ID da instância wa-bridge</strong> (1, 2 ou 3) para vincular este número.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Form de edição */}
              {editingInst && (
                <div className="bg-gray-900 rounded-xl border border-green-800/50 p-5 space-y-4">
                  <h3 className="text-white font-semibold text-sm">
                    {instForm.id ? "Editar Número" : "Novo Número"}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Nome *</Label>
                      <Input value={instForm.name} onChange={e => setInstForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="ex: Jurema Principal" className="bg-gray-800 border-gray-700 text-white text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Número (com DDI) *</Label>
                      <Input value={instForm.phone} onChange={e => setInstForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="5511999999999" className="bg-gray-800 border-gray-700 text-white text-sm font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">ID da instância wa-bridge *</Label>
                      <Input value={instForm.instanceId} onChange={e => setInstForm(f => ({ ...f, instanceId: e.target.value }))}
                        placeholder="1, 2 ou 3" className="bg-gray-800 border-gray-700 text-white text-sm font-mono" />
                      <p className="text-gray-500 text-xs">Corresponde ao número da instância no wa-bridge (1 = Jurema 1, 2 = Jurema 2, 3 = Jurema 3).</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Webhook URL (opcional)</Label>
                      <Input value={instForm.webhookUrl} onChange={e => setInstForm(f => ({ ...f, webhookUrl: e.target.value }))}
                        placeholder="https://juremasports2.com.br/api/trpc/wa.receiveWebhook"
                        className="bg-gray-800 border-gray-700 text-white text-sm font-mono" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => upsertInst.mutate(instForm.id ? instForm : { name: instForm.name, phone: instForm.phone, instanceId: instForm.instanceId || undefined, apiKey: instForm.apiKey || undefined, webhookUrl: instForm.webhookUrl || undefined, active: instForm.active })}
                      disabled={upsertInst.isPending || !instForm.name || !instForm.phone}
                      className="bg-green-700 hover:bg-green-600 gap-2">
                      {upsertInst.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingInst(false)} className="text-gray-400">Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* ── Tab: Treinamento IA ────────────────────────────────────────────── */}
          {activeTab === "treinamento" && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h2 className="text-white font-semibold">Treinamento da IA</h2>
                <p className="text-gray-400 text-sm mt-0.5">
                  Tudo que você editar aqui vira instrução para a atendente virtual — em linguagem simples, sem programação.
                </p>
              </div>

              {selectedInstanceId && aiConfigIsError && (
                <div className="rounded-xl border border-red-800/45 bg-red-950/25 px-4 py-3 text-red-100/95 text-xs leading-relaxed">
                  <strong className="text-red-200">Aviso:</strong> a configuração desta instância não foi carregada do
                  servidor (sessão, rede ou versão antiga do backend). Os campos podem mostrar só o modelo local até a
                  correção subir em produção. Use &quot;Buscar de novo&quot; após o deploy.
                </div>
              )}

              {selectedInstanceId && aiUiPayload && !aiHydrationPending && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-green-800/40 bg-green-950/15 p-4 text-[13px] text-gray-200 leading-relaxed space-y-3">
                    <p>
                      <span className="font-semibold text-green-300">Como usar:</span> os blocos abaixo já vêm com um{" "}
                      <strong>modelo completo da Jurema Sport</strong>. A equipe só precisa ler, completar o que estiver
                      entre parênteses ou “(Completar…)”, e salvar. Quanto mais preciso o texto da base de conhecimento,
                      melhor a IA responde sobre preços, prazos e políticas — ela{" "}
                      <span className="text-amber-200/90">não deve inventar</span> o que não estiver escrito.
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-gray-300 text-xs">
                      <li>
                        <strong>Comportamento</strong>: define tom de voz e limites (use os botões de modelo rápido se
                        quiser começar de um perfil pronto).
                      </li>
                      <li>
                        <strong>Base de conhecimento</strong>: o “manual” da loja; use títulos com === para organizar
                        (pode apagar seções que não usar).
                      </li>
                      <li>
                        <strong>Links</strong>: catálogo, grupo e Linktree — a IA usa quando o cliente pedir.
                      </li>
                      <li>
                        <strong>Palavras de escalação</strong>: se o cliente escrever algo parecido, a conversa pode ir
                        para humano com “Só um momento.”
                      </li>
                    </ul>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-green-700/50 text-green-200 hover:bg-green-900/30"
                        onClick={applyTrainingDefaultsDraft}
                        disabled={!aiTrainingDefaults}
                      >
                        Recarregar modelo Jurema no rascunho
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-white"
                        onClick={() => {
                          void refetchAiConfig();
                          void refetchAiDefaults();
                        }}
                      >
                        Buscar de novo no servidor
                      </Button>
                    </div>
                  </div>
                  {!aiUiPayload.hasPersistedRow && (
                    <p className="text-amber-200/90 text-xs bg-amber-950/20 border border-amber-900/30 rounded-lg px-3 py-2">
                      Ainda não há configuração salva para esta instância no banco. Ao clicar em{" "}
                      <strong className="text-amber-100">Salvar Configuração da IA</strong>, o registro será criado com o
                      que estiver nos campos.
                    </p>
                  )}
                </div>
              )}

              {selectedInstanceId && !aiHydrationPending && (
                <div className="rounded-xl border border-violet-800/40 bg-violet-950/20 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-5 h-5 text-violet-300 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-white font-semibold text-sm">Assistente para melhorar o treinamento</h3>
                      <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
                        Escreva em português o que deseja mudar no comportamento ou nas regras da atendente (ex.: &quot;mais
                        formal&quot;, &quot;sem emoji&quot;, &quot;sempre perguntar tamanho antes do preço&quot;). A IA lê o treinamento
                        atual, propõe alterações e você confirma antes de aplicar. Pedidos técnicos (servidor, senha,
                        código) ou fora do escopo são recusados com orientação para falar com o desenvolvedor.
                      </p>
                    </div>
                  </div>
                  <Textarea
                    value={refineWish}
                    onChange={(e) => setRefineWish(e.target.value)}
                    placeholder='Ex.: "Quero respostas mais curtas e que nunca prometa entrega no mesmo dia."'
                    className="bg-gray-900/80 border-violet-900/40 text-white text-sm min-h-[96px] leading-relaxed"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={submitRefineTrainingRequest}
                      disabled={refineTrainingAi.isPending}
                      className="bg-violet-700 hover:bg-violet-600 gap-2"
                    >
                      {refineTrainingAi.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      Pedir sugestão da IA
                    </Button>
                    {refinePreview && (
                      <Button type="button" variant="ghost" size="sm" className="text-gray-400" onClick={() => setRefinePreview(null)}>
                        Limpar resultado
                      </Button>
                    )}
                  </div>
                  {refinePreview?.outcome === "proposal" && (
                    <div className="rounded-lg border border-green-800/35 bg-green-950/25 p-3 space-y-3">
                      <p className="text-green-100 text-sm whitespace-pre-wrap leading-relaxed">{refinePreview.messageForUser}</p>
                      <p className="text-gray-400 text-[11px]">
                        Campos afetados:{" "}
                        <span className="text-gray-200">{refineChangedLabels(refinePreview.updates as RefineUpdates)}</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="border-green-700/50 text-green-200" onClick={applyRefineDraft}>
                          Aplicar no rascunho
                        </Button>
                        <Button type="button" className="bg-green-700 hover:bg-green-600" onClick={applyRefineAndSave}>
                          Aplicar e salvar agora
                        </Button>
                      </div>
                    </div>
                  )}
                  {refinePreview?.outcome === "reject" && (
                    <div className="rounded-lg border border-amber-800/35 bg-amber-950/20 p-3">
                      <p className="text-amber-100 text-sm whitespace-pre-wrap leading-relaxed">{refinePreview.messageForUser}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Aviso sem instância */}
              {!selectedInstanceId && (
                <div className="bg-yellow-950/20 border border-yellow-800/40 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-yellow-300 text-xs">Selecione uma instância no seletor acima para ver e editar as configurações da IA.</p>
                </div>
              )}

              {/* Skeleton de carregamento */}
              {aiHydrationPending && selectedInstanceId && (
                <div className="space-y-4 animate-pulse">
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 h-16" />
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 h-40" />
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 h-80" />
                  <p className="text-center text-gray-500 text-sm py-2">Carregando configurações da IA...</p>
                </div>
              )}

              {/* Conteúdo real — só renderiza após dados carregarem */}
              {!aiHydrationPending && selectedInstanceId && (<>
              {/* Toggle IA */}              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center justify-between">
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
                  <p className="text-gray-500 text-[11px]">
                    Descreva como a pessoa deve falar no WhatsApp. Modelos rápidos (substituem este bloco inteiro):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PERSONALITY_PRESETS.map((p) => (
                      <Button
                        key={p.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-[11px] border-gray-600 text-gray-300 hover:bg-gray-800"
                        onClick={() => applyPersonalityPreset(p.text)}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    value={aiForm.personality}
                    onChange={e => setAiForm(f => ({ ...f, personality: e.target.value }))}
                    className="bg-gray-800 border-gray-700 text-white text-sm min-h-[140px] leading-relaxed"
                  />
                  <p className="text-gray-500 text-xs">
                    Dica: quem não programa não precisa de termos técnicos — escreva como se estivesse treinando uma
                    funcionária nova.
                  </p>
                </div>
              </div>

              {/* Base de conhecimento */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-green-400" /> Base de Conhecimento
                </h3>
                <p className="text-gray-400 text-xs">
                  Manual da loja em texto corrido. Mantenha os títulos com <span className="font-mono text-gray-300">===</span> para
                  organizar; apague blocos que não forem usar. Troque todo &quot;(Completar…)&quot; por informação real — a IA só pode
                  afirmar o que estiver escrito aqui (ou no histórico recente com o cliente).
                </p>
                <Textarea
                  value={aiForm.businessContext}
                  onChange={e => setAiForm(f => ({ ...f, businessContext: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white text-sm min-h-[360px] leading-relaxed"
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

              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
                <Collapsible open={trainingAdvancedOpen} onOpenChange={setTrainingAdvancedOpen}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 text-left hover:bg-gray-800">
                    <div>
                      <h3 className="text-white font-semibold text-sm">Texto completo da IA (edição direta)</h3>
                      <p className="text-gray-500 text-[11px] font-normal">
                        Abaixo está o prompt completo enviado ao modelo. Está aberto por padrão para quem preferir
                        ajustar linha a linha. Se esvaziar e salvar, o sistema regenera a partir dos blocos principais.
                      </p>
                    </div>
                    <ChevronDown className={`w-5 h-5 shrink-0 text-gray-400 transition-transform ${trainingAdvancedOpen ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 space-y-2">
                    <p className="text-gray-500 text-xs">
                      Se limpar este campo e salvar, o sistema monta de novo o texto a partir de identidade, base e
                      links.
                    </p>
                    <Textarea
                      value={aiForm.systemPrompt}
                      onChange={(e) => setAiForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                      placeholder="Deixe em branco ao salvar para regenerar a partir dos campos principais."
                      className="bg-gray-800 border-gray-700 text-white text-xs font-mono min-h-[220px] leading-relaxed"
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <Button
                onClick={handleSaveAi}
                disabled={saveAiConfig.isPending || !selectedInstanceId}
                className="bg-green-700 hover:bg-green-600 gap-2 w-full sm:w-auto"
              >
                {saveAiConfig.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Configuração da IA
              </Button>
              </>)} {/* fecha !aiHydrationPending && selectedInstanceId */}
            </div>
          )}
          {/* ── Tab: Respostas Rápidass ──────────────────────────────────────── */}
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

            {/* ── Tab: Horários ────────────────────────────────────────────── */}
          {activeTab === "horarios" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-white font-semibold">Horário de Atendimento</h2>
                <p className="text-gray-400 text-sm mt-0.5">Configure a mensagem de ausência fora do horário comercial</p>
              </div>

              {/* Aviso sem instância */}
              {!selectedInstanceId && (
                <div className="bg-yellow-950/20 border border-yellow-800/40 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-yellow-300 text-xs">Selecione uma instância no seletor acima para ver e editar os horários.</p>
                </div>
              )}

              {/* Skeleton */}
              {aiHydrationPending && selectedInstanceId && (
                <div className="space-y-4 animate-pulse">
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 h-48" />
                  <p className="text-center text-gray-500 text-sm py-2">Carregando horários...</p>
                </div>
              )}

              {!aiHydrationPending && selectedInstanceId && (<>
              {/* Aviso de integração com IA */}
              {aiForm.enabled && (
                <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-4 flex gap-3">
                  <Bot className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-blue-300 text-xs font-medium">Integração com a IA ativa</p>
                    <p className="text-blue-400/70 text-xs mt-0.5">
                      Quando a mensagem de ausência estiver ativada, a IA <strong className="text-blue-300">não responderá</strong> fora do horário configurado — apenas a mensagem de ausência será enviada. Não há conflito entre os dois sistemas.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white text-sm font-medium">Ativar mensagem de ausência automática</div>
                    <div className="text-gray-400 text-xs mt-0.5">
                      Fora do horário configurado abaixo, será enviada a mensagem de ausência
                    </div>
                  </div>
                  <Switch
                    checked={awayForm.awayEnabled}
                    onCheckedChange={(v) => setAwayForm((f) => ({ ...f, awayEnabled: v }))}
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-800">
                  <Label className="text-gray-300 text-xs">Aplicar esta configuração às instâncias</Label>
                  <p className="text-gray-500 text-[11px]">Marque uma ou mais linhas (números). O mesmo horário e a mesma mensagem serão gravados em todas.</p>
                  <div className="flex flex-wrap gap-3">
                    {(instances as { id: number; name: string }[]).map((inst) => (
                      <label
                        key={inst.id}
                        className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"
                      >
                        <Checkbox
                          checked={awayTargetInstanceIds.includes(inst.id)}
                          onCheckedChange={() => toggleAwayTarget(inst.id)}
                        />
                        <span>{inst.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={`space-y-4 transition-opacity duration-200 ${awayForm.awayEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Início da ausência (loja fecha)</Label>
                      <Input
                        type="time"
                        value={awayForm.awayStart}
                        onChange={(e) => setAwayForm((f) => ({ ...f, awayStart: e.target.value }))}
                        className="bg-gray-800 border-gray-700 text-white text-sm"
                      />
                      <p className="text-gray-500 text-xs">Usado nos dias em modo &quot;horário global&quot;</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-300 text-xs">Fim da ausência (loja abre)</Label>
                      <Input
                        type="time"
                        value={awayForm.awayEnd}
                        onChange={(e) => setAwayForm((f) => ({ ...f, awayEnd: e.target.value }))}
                        className="bg-gray-800 border-gray-700 text-white text-sm"
                      />
                      <p className="text-gray-500 text-xs">Aberto entre este horário e o início da ausência</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-300 text-xs">Por dia da semana (fuso São Paulo)</Label>
                    <p className="text-gray-500 text-[11px]">
                      Domingo = 0 … Sábado = 6. &quot;Horário global&quot; repete o intervalo acima. &quot;Fechado o dia todo&quot; envia ausência o dia inteiro.
                    </p>
                    <div className="rounded-lg border border-gray-800 divide-y divide-gray-800 overflow-hidden">
                      {AWAY_DAY_KEYS.map((key, idx) => (
                        <div key={key} className="bg-gray-900/80 p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                          <div className="text-gray-200 text-xs font-medium w-28 shrink-0">{AWAY_DAY_LABELS[idx]}</div>
                          <Select
                            value={awayDayMode[key] ?? "legacy"}
                            onValueChange={(v) =>
                              setAwayDayMode((m) => ({ ...m, [key]: v as AwayMode }))
                            }
                          >
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs w-full lg:w-72 h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-800 border-gray-700 text-white">
                              <SelectItem value="legacy" className="text-xs">Horário global (acima)</SelectItem>
                              <SelectItem value="closed" className="text-xs">Fechado o dia todo</SelectItem>
                              <SelectItem value="open" className="text-xs">Aberto só entre…</SelectItem>
                            </SelectContent>
                          </Select>
                          {awayDayMode[key] === "open" && (
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                type="time"
                                value={awayDayOpen[key]?.start ?? "09:00"}
                                onChange={(e) =>
                                  setAwayDayOpen((o) => ({
                                    ...o,
                                    [key]: { ...(o[key] ?? { start: "09:00", end: "18:00" }), start: e.target.value },
                                  }))
                                }
                                className="bg-gray-800 border-gray-700 text-white text-xs w-28 h-9"
                              />
                              <span className="text-gray-500 text-xs">até</span>
                              <Input
                                type="time"
                                value={awayDayOpen[key]?.end ?? "18:00"}
                                onChange={(e) =>
                                  setAwayDayOpen((o) => ({
                                    ...o,
                                    [key]: { ...(o[key] ?? { start: "09:00", end: "18:00" }), end: e.target.value },
                                  }))
                                }
                                className="bg-gray-800 border-gray-700 text-white text-xs w-28 h-9"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-xs">Mensagem de ausência</Label>
                    <Textarea
                      value={awayForm.awayMessage}
                      onChange={(e) => setAwayForm((f) => ({ ...f, awayMessage: e.target.value }))}
                      placeholder="Ex: No momento estamos fora do horário de atendimento. Retornaremos em breve. Nosso horário é de segunda a sábado, das 6h às 15h."
                      className="bg-gray-800 border-gray-700 text-white text-sm min-h-[100px]"
                    />
                    <p className="text-gray-500 text-xs">Sem emojis. Resposta direta informando o horário de retorno.</p>
                  </div>

                  {awayForm.awayStart && awayForm.awayEnd && (
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-gray-400 text-xs">
                        <span className="text-gray-300 font-medium">Resumo (dias em modo global): </span>
                        Loja <span className="text-green-400">aberta</span> das{" "}
                        <span className="text-white font-mono">{awayForm.awayEnd}</span> às{" "}
                        <span className="text-white font-mono">{awayForm.awayStart}</span>.
                        Fora desse período (nesses dias), a ausência será enviada.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={handleSaveAwayBatch}
                disabled={saveAwayBatch.isPending || !selectedInstanceId}
                className="bg-green-700 hover:bg-green-600 gap-2"
              >
                {saveAwayBatch.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar horários (instâncias marcadas)
              </Button>
              </>)} {/* fecha !aiHydrationPending && selectedInstanceId */}
            </div>
          )}
        </div>
      </div>
    </PdvLayout>
  );
}
