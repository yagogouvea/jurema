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
} from "../../shared/waAiDefaultStrings";

export {
  DEFAULT_AI_NAME,
  DEFAULT_AWAY_MESSAGE,
  DEFAULT_BUSINESS_CONTEXT,
  DEFAULT_ESCALATE_KEYWORDS,
  DEFAULT_GREETING_MESSAGE,
  DEFAULT_PERSONALITY,
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

export function buildSystemPrompt(config: {
  aiName?: string;
  personality?: string;
  businessContext?: string;
  catalogLink?: string;
  groupLink?: string;
  instagramLink?: string;
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
- Se não tiver certeza absoluta, responda exatamente: "Só um momento."`;

  if (nz(config.catalogLink)) {
    prompt += `\n\nCATÁLOGO / PRODUTOS:\n${config.catalogLink}\nQuando o cliente pedir catálogo, fotos ou lista de produtos, envie este link de forma natural.`;
  }
  if (nz(config.groupLink)) {
    prompt += `\n\nGRUPO DE OFERTAS (WhatsApp):\n${config.groupLink}\nEnvie quando o cliente quiser entrar no grupo ou receber novidades.`;
  }
  if (nz(config.instagramLink)) {
    prompt += `\n\nLINKS ÚTEIS (Linktree, Instagram, outros números):\n${config.instagramLink}\nUse quando fizer sentido (ex.: restrição do WhatsApp Business, contato alternativo).`;
  }
  if (kw.length) {
    prompt += `\n\nESCALAÇÃO PARA ATENDENTE HUMANO:\nSe o assunto indicar insatisfação grave, pedido de gerente, cancelamento sensível, ameaça legal ou palavras como: ${kw.join(
      ", "
    )}, responda primeiro com "Só um momento." e não continue argumentando.`;
  }

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
  maxContextMessages: number;
  responseDelayMin: number;
  responseDelayMax: number;
  escalateKeywords: string[];
  /** Texto efetivo mostrado no painel (gerado se o banco estiver vazio). */
  systemPrompt: string;
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

  const escalateKeywords = parseEscalateKeywords(rowVal(row, "escalateKeywords"));

  const storedPrompt = nz(rowVal(row, "systemPrompt"));
  const systemPrompt =
    storedPrompt ??
    buildSystemPrompt({
      aiName,
      personality,
      businessContext,
      catalogLink: catalogLink || undefined,
      groupLink: groupLink || undefined,
      instagramLink: instagramLink || undefined,
      escalateKeywords,
    });

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
    maxContextMessages: Math.max(1, Math.min(50, Number(rowVal(row, "maxContextMessages")) || 10)),
    responseDelayMin: Number(rowVal(row, "responseDelayMin")) >= 0 ? Number(rowVal(row, "responseDelayMin")) : 1000,
    responseDelayMax: Number(rowVal(row, "responseDelayMax")) >= 0 ? Number(rowVal(row, "responseDelayMax")) : 3000,
    escalateKeywords,
    systemPrompt,
  };
}
