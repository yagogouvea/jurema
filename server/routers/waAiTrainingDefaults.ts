/**
 * Conteúdo padrão do "Treinamento IA" — mesclado em getAiConfig quando o banco está vazio,
 * e usado como referência para o botão "Modelo da loja" no painel. Textos em português para
 * quem não programa: basta editar os campos e salvar.
 */

import {
  DEFAULT_AI_NAME,
  DEFAULT_AWAY_MESSAGE,
  DEFAULT_BUSINESS_CONTEXT,
  DEFAULT_ESCALATE_KEYWORDS,
  DEFAULT_GREETING_MESSAGE,
  DEFAULT_PERSONALITY,
  ORDER_QUANTITY_RULES_BLOCK,
  PRINTS_ORDER_CONTEXT_BLOCK,
  CORDIALITY_AND_KINDNESS_BLOCK,
} from "../../shared/waAiDefaultStrings";

export {
  DEFAULT_AI_NAME,
  DEFAULT_AWAY_MESSAGE,
  DEFAULT_BUSINESS_CONTEXT,
  DEFAULT_ESCALATE_KEYWORDS,
  DEFAULT_GREETING_MESSAGE,
  DEFAULT_PERSONALITY,
  ORDER_QUANTITY_RULES_BLOCK,
  PRINTS_ORDER_CONTEXT_BLOCK,
  CORDIALITY_AND_KINDNESS_BLOCK,
} from "../../shared/waAiDefaultStrings";

function rowVal(row: Record<string, unknown> | null | undefined, camelKey: string): unknown {
  if (!row) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, camelKey)) return (row as Record<string, unknown>)[camelKey];
  const lower = camelKey.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return (row as Record<string, unknown>)[k];
  }
  return undefined;
}

function nz(v: unknown): string | null {
  if (v == null) return null;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) {
    const s = v.toString("utf8").trim();
    return s.length ? s : null;
  }
  const s = String(v).trim();
  return s.length ? s : null;
}

export function parseEscalateKeywords(raw: unknown): string[] {
  if (!raw) return [...DEFAULT_ESCALATE_KEYWORDS];
  if (Array.isArray(raw)) {
    const a = raw.map((s) => String(s).trim()).filter(Boolean);
    return a.length ? a : [...DEFAULT_ESCALATE_KEYWORDS];
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [...DEFAULT_ESCALATE_KEYWORDS];
    if (t.startsWith("[")) {
      try {
        const j = JSON.parse(t);
        if (Array.isArray(j)) {
          const a = j.map((s) => String(s).trim()).filter(Boolean);
          return a.length ? a : [...DEFAULT_ESCALATE_KEYWORDS];
        }
      } catch {
        /* fallthrough */
      }
    }
    const a = t.split(",").map((k) => k.trim()).filter(Boolean);
    return a.length ? a : [...DEFAULT_ESCALATE_KEYWORDS];
  }
  return [...DEFAULT_ESCALATE_KEYWORDS];
}

export type WaExtraLink = { label: string; url: string };

export function parseExtraLinks(raw: unknown): WaExtraLink[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const o = x as Record<string, unknown>;
        return {
          label: String(o.label ?? "").trim(),
          url: String(o.url ?? "").trim(),
        };
      })
      .filter((x) => x.label && x.url);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t || t === "null") return [];
    try {
      return parseExtraLinks(JSON.parse(t));
    } catch {
      return [];
    }
  }
  return [];
}

export function buildSystemPrompt(config: {
  aiName?: string;
  personality?: string;
  businessContext?: string;
  catalogLink?: string;
  groupLink?: string;
  instagramLink?: string;
  extraLinks?: WaExtraLink[];
  escalateKeywords?: string[];
}): string {
  const name = nz(config.aiName) ?? DEFAULT_AI_NAME;
  const personality = nz(config.personality) ?? DEFAULT_PERSONALITY;
  const business = nz(config.businessContext) ?? DEFAULT_BUSINESS_CONTEXT;
  const kw = config.escalateKeywords?.length ? config.escalateKeywords : [...DEFAULT_ESCALATE_KEYWORDS];

  let prompt = `Você é ${name}, atendente da Jurema Sport no WhatsApp.

PERSONALIDADE E FORMA DE FALAR:
${personality}

CONHECIMENTO SOBRE A LOJA (use como base; se algo não estiver escrito aqui, não invente — diga "Só um momento."):
${business}

REGRAS GERAIS:
- Responda sempre em português brasileiro.
- Nunca diga que é inteligência artificial, robô ou sistema automatizado.
- Seja objetiva; evite blocos de texto longos sem necessidade.
- Não invente preço, estoque, prazo de entrega nem políticas que não estejam no texto acima ou nas mensagens recentes do cliente.
- Se o cliente pedir algo fora do escopo da loja, recuse com educação e ofereça ajuda com produtos/pedidos.
- Se não tiver certeza absoluta, responda exatamente: "Só um momento."
- Pedidos com vários números na mesma mensagem ou em várias linhas (mesmo balão no WhatsApp): interprete como quantidades de trechos diferentes e SOME as peças antes de falar em mínimo de atacado ou "falta comprar mais". Não use só a primeira linha nem só o primeiro número.`;

  if (nz(config.catalogLink)) {
    prompt += `\n\nCATÁLOGO / PRODUTOS:\n${config.catalogLink}\nQuando o cliente pedir catálogo, fotos ou lista de produtos, envie este link de forma natural.`;
  }
  if (nz(config.groupLink)) {
    prompt += `\n\nGRUPO DE OFERTAS (WhatsApp):\n${config.groupLink}\nEnvie quando o cliente quiser entrar no grupo ou receber novidades.`;
  }
  if (nz(config.instagramLink)) {
    prompt += `\n\nLINKS ÚTEIS (Linktree, Instagram, outros números):\n${config.instagramLink}\nUse quando fizer sentido (ex.: restrição do WhatsApp Business, contato alternativo).`;
  }
  const extras = (config.extraLinks ?? []).filter((e) => nz(e.label) && nz(e.url));
  if (extras.length) {
    prompt += `\n\nOUTROS LINKS (envie quando o assunto combinar com o rótulo; não invente URLs):\n${extras
      .map((e) => `- ${e.label}: ${e.url}`)
      .join("\n")}`;
  }
  if (kw.length) {
    prompt += `\n\nESCALAÇÃO PARA ATENDENTE HUMANO:\nSe o assunto indicar insatisfação grave, pedido de gerente, cancelamento sensível, ameaça legal ou palavras como: ${kw.join(
      ", "
    )}, responda primeiro com "Só um momento." e não continue argumentando.`;
  }

  prompt += `\n\n${CORDIALITY_AND_KINDNESS_BLOCK}`;
  prompt += `\n\n${ORDER_QUANTITY_RULES_BLOCK}`;
  prompt += `\n\n${PRINTS_ORDER_CONTEXT_BLOCK}`;
  return prompt;
}

/** Resposta unificada para o painel e para o botão "modelo da loja". */
export type AiTrainingConfigPayload = {
  hasPersistedRow: boolean;
  dbId: number | null;
  instanceId: number;
  enabled: boolean;
  aiName: string;
  personality: string;
  businessContext: string;
  greetingMessage: string;
  awayMessage: string;
  awayEnabled: boolean;
  awayStart: string;
  awayEnd: string;
  awaySchedule: unknown;
  catalogLink: string;
  groupLink: string;
  instagramLink: string;
  /** Links extras (rótulo + URL) além de catálogo / grupo / Linktree. */
  extraLinks: WaExtraLink[];
  maxContextMessages: number;
  responseDelayMin: number;
  responseDelayMax: number;
  escalateKeywords: string[];
  /** Texto efetivo: SEMPRE regerado a partir dos campos vivos + blocos atuais do sistema. */
  systemPrompt: string;
  /** Texto que está gravado em wa_ai_config.systemPrompt (pode estar desatualizado). */
  storedSystemPrompt: string;
  /** true quando o storedSystemPrompt difere do gerado — indica override manual antigo. */
  hasCustomSystemPrompt: boolean;
};

export function mergeDbRowWithDefaults(row: Record<string, unknown> | null | undefined, instanceId: number): AiTrainingConfigPayload {
  const hasPersistedRow = Boolean(row && rowVal(row, "id") != null);
  const idRaw = rowVal(row, "id");
  const dbId = row && idRaw != null ? Number(idRaw) : null;

  const aiName = nz(rowVal(row, "aiName")) ?? DEFAULT_AI_NAME;
  const personality = nz(rowVal(row, "personality")) ?? DEFAULT_PERSONALITY;
  const businessContext = nz(rowVal(row, "businessContext")) ?? DEFAULT_BUSINESS_CONTEXT;
  const greetingMessage = nz(rowVal(row, "greetingMessage")) ?? DEFAULT_GREETING_MESSAGE;
  const awayMessage = nz(rowVal(row, "awayMessage")) ?? DEFAULT_AWAY_MESSAGE;
  const catalogLink = nz(rowVal(row, "catalogLink")) ?? "";
  const groupLink = nz(rowVal(row, "groupLink")) ?? "";
  const instagramLink = nz(rowVal(row, "instagramLink")) ?? "";
  const extraLinks = parseExtraLinks(rowVal(row, "extraLinks"));

  const escalateKeywords = parseEscalateKeywords(rowVal(row, "escalateKeywords"));

  // SEMPRE regenera o systemPrompt mostrado no painel a partir dos campos vivos +
  // blocos atualizados do código (CORDIALITY, ORDER_QUANTITY, PRINTS).
  // O texto que está no banco vira apenas `storedSystemPrompt` (informativo, pode ter
  // override antigo do usuário).
  const storedPrompt = nz(rowVal(row, "systemPrompt"));
  const generatedPrompt = buildSystemPrompt({
    aiName,
    personality,
    businessContext,
    catalogLink: catalogLink || undefined,
    groupLink: groupLink || undefined,
    instagramLink: instagramLink || undefined,
    extraLinks: extraLinks.length ? extraLinks : undefined,
    escalateKeywords,
  });

  // Se o usuário editou manualmente no banco e o texto não bate com o regenerado,
  // marca como customizado para o painel oferecer a opção de "ver / restaurar".
  const hasCustomOverride =
    !!storedPrompt &&
    storedPrompt.replace(/\s+/g, " ").trim() !== generatedPrompt.replace(/\s+/g, " ").trim();

  return {
    hasPersistedRow,
    dbId,
    instanceId,
    enabled: Boolean(rowVal(row, "enabled")),
    aiName,
    personality,
    businessContext,
    greetingMessage,
    awayMessage,
    awayEnabled: Boolean(rowVal(row, "awayEnabled")),
    awayStart: nz(rowVal(row, "awayStart")) ?? "18:00",
    awayEnd: nz(rowVal(row, "awayEnd")) ?? "08:00",
    awaySchedule: rowVal(row, "awaySchedule") ?? null,
    catalogLink,
    groupLink,
    instagramLink,
    extraLinks,
    maxContextMessages: Math.max(1, Math.min(50, Number(rowVal(row, "maxContextMessages")) || 10)),
    responseDelayMin: Number(rowVal(row, "responseDelayMin")) >= 0 ? Number(rowVal(row, "responseDelayMin")) : 3500,
    responseDelayMax: Number(rowVal(row, "responseDelayMax")) >= 0 ? Number(rowVal(row, "responseDelayMax")) : 9000,
    escalateKeywords,
    systemPrompt: generatedPrompt,
    storedSystemPrompt: storedPrompt ?? "",
    hasCustomSystemPrompt: hasCustomOverride,
  };
}
