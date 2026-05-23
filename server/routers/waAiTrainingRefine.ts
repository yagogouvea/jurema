/**
 * Refinamento do treinamento da IA a partir de pedido em linguagem natural (admin).
 * Pode propor alterações em todos os campos visíveis do Treinamento IA + texto completo (system)
 * e links extras dinâmicos, memória da conversa e delays — escopo limitado a texto de treinamento.
 */

import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import {
  detectBusinessContextRegression,
  looksLikePricingOnlySnippet,
} from "./waAiTrainingGuard";
import type { WaExtraLink } from "./waAiTrainingDefaults";

/** Patches: string vazio = sem alteração nesse campo. escalateKeywords / extraLinks: JSON ou "__KEEP__". */
const REFINE_SCHEMA = {
  name: "wa_ai_training_refine",
  strict: true,
  schema: {
    type: "object",
    properties: {
      outcome: {
        type: "string",
        enum: ["proposal", "reject"],
      },
      messageForUser: { type: "string" },
      rejectCode: {
        type: "string",
        enum: ["too_advanced", "unsafe", "unclear", "none"],
      },
      patch_aiName: { type: "string" },
      patch_personality: { type: "string" },
      patch_businessContext: { type: "string" },
      patch_pricingRules: { type: "string" },
      patch_greetingMessage: { type: "string" },
      patch_systemPrompt: { type: "string" },
      patch_catalogLink: { type: "string" },
      patch_groupLink: { type: "string" },
      patch_instagramLink: { type: "string" },
      patch_extraLinksJson: { type: "string" },
      patch_escalateKeywordsJson: { type: "string" },
      patch_maxContextMessages: { type: "string" },
      patch_responseDelayMin: { type: "string" },
      patch_responseDelayMax: { type: "string" },
    },
    required: [
      "outcome",
      "messageForUser",
      "rejectCode",
      "patch_aiName",
      "patch_personality",
      "patch_businessContext",
      "patch_pricingRules",
      "patch_greetingMessage",
      "patch_systemPrompt",
      "patch_catalogLink",
      "patch_groupLink",
      "patch_instagramLink",
      "patch_extraLinksJson",
      "patch_escalateKeywordsJson",
      "patch_maxContextMessages",
      "patch_responseDelayMin",
      "patch_responseDelayMax",
    ],
    additionalProperties: false,
  },
} as const;

const extraLinkSchema = z.object({
  label: z.string().max(120),
  url: z.string().max(2000),
});

export const refineTrainingInputSchema = z.object({
  instanceId: z.number(),
  request: z
    .string()
    .min(12, "Descreva com um pouco mais de detalhe o que deseja (pelo menos 12 caracteres).")
    .max(4000),
  current: z.object({
    aiName: z.string(),
    personality: z.string(),
    businessContext: z.string(),
    pricingRules: z.string().optional().default(""),
    greetingMessage: z.string(),
    systemPrompt: z.string(),
    catalogLink: z.string().optional(),
    groupLink: z.string().optional(),
    instagramLink: z.string().optional(),
    extraLinks: z.array(extraLinkSchema).max(20),
    escalateKeywords: z.array(z.string()),
    maxContextMessages: z.number().min(1).max(50),
    responseDelayMin: z.number().min(0).max(60000),
    responseDelayMax: z.number().min(0).max(120000),
  }),
});

export type RefineTrainingUpdates = {
  aiName: string | null;
  personality: string | null;
  businessContext: string | null;
  pricingRules: string | null;
  greetingMessage: string | null;
  systemPrompt: string | null;
  catalogLink: string | null;
  groupLink: string | null;
  instagramLink: string | null;
  extraLinks: WaExtraLink[] | null;
  escalateKeywords: string[] | null;
  maxContextMessages: number | null;
  responseDelayMin: number | null;
  responseDelayMax: number | null;
};

export type RefineTrainingResult =
  | {
      outcome: "proposal";
      messageForUser: string;
      updates: RefineTrainingUpdates;
    }
  | {
      outcome: "reject";
      messageForUser: string;
      rejectCode: "too_advanced" | "unsafe" | "unclear";
    };

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n…(texto truncado para análise)";
}

function pickStr(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

function parseIntPatch(v: string | undefined, min: number, max: number): number | null {
  const t = (v ?? "").trim();
  if (!t.length) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseExtraLinksPatch(raw: string | undefined): WaExtraLink[] | null {
  const t = (raw ?? "").trim();
  if (!t.length || t === "__KEEP__") return null;
  try {
    const j = JSON.parse(t);
    if (!Array.isArray(j)) return null;
    const out: WaExtraLink[] = [];
    for (const item of j) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const label = String(o.label ?? "").trim();
      const url = String(o.url ?? "").trim();
      if (label && url) out.push({ label, url });
      if (out.length >= 20) break;
    }
    return out;
  } catch {
    return null;
  }
}

function hasNonEmptyPatch(parsed: Record<string, string>): boolean {
  const strKeys = [
    "patch_aiName",
    "patch_personality",
    "patch_businessContext",
    "patch_pricingRules",
    "patch_greetingMessage",
    "patch_systemPrompt",
    "patch_catalogLink",
    "patch_groupLink",
    "patch_instagramLink",
  ];
  if (strKeys.some((k) => (parsed[k] ?? "").trim().length > 0)) return true;
  const kw = (parsed.patch_escalateKeywordsJson ?? "").trim();
  if (kw.length > 0 && kw !== "__KEEP__") return true;
  const ex = (parsed.patch_extraLinksJson ?? "").trim();
  if (ex.length > 0 && ex !== "__KEEP__") return true;
  if ((parsed.patch_maxContextMessages ?? "").trim().length > 0) return true;
  if ((parsed.patch_responseDelayMin ?? "").trim().length > 0) return true;
  if ((parsed.patch_responseDelayMax ?? "").trim().length > 0) return true;
  return false;
}

function patchesToUpdates(parsed: Record<string, string>): RefineTrainingUpdates {
  const kwRaw = parsed.patch_escalateKeywordsJson?.trim() ?? "";
  let escalateKeywords: string[] | null = null;
  if (kwRaw && kwRaw !== "__KEEP__") {
    try {
      const j = JSON.parse(kwRaw);
      if (Array.isArray(j)) escalateKeywords = j.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      escalateKeywords = null;
    }
  }

  const extraRaw = parsed.patch_extraLinksJson?.trim() ?? "";
  let extraLinks: WaExtraLink[] | null = null;
  if (extraRaw && extraRaw !== "__KEEP__") {
    extraLinks = parseExtraLinksPatch(extraRaw);
  }

  return {
    aiName: pickStr(parsed.patch_aiName),
    personality: pickStr(parsed.patch_personality),
    businessContext: pickStr(parsed.patch_businessContext),
    pricingRules: pickStr(parsed.patch_pricingRules),
    greetingMessage: pickStr(parsed.patch_greetingMessage),
    systemPrompt: pickStr(parsed.patch_systemPrompt),
    catalogLink: pickStr(parsed.patch_catalogLink),
    groupLink: pickStr(parsed.patch_groupLink),
    instagramLink: pickStr(parsed.patch_instagramLink),
    extraLinks,
    escalateKeywords,
    maxContextMessages: parseIntPatch(parsed.patch_maxContextMessages, 1, 50),
    responseDelayMin: parseIntPatch(parsed.patch_responseDelayMin, 0, 60000),
    responseDelayMax: parseIntPatch(parsed.patch_responseDelayMax, 0, 120000),
  };
}

export async function refineAiTrainingFromNaturalLanguage(
  input: z.infer<typeof refineTrainingInputSchema>
): Promise<RefineTrainingResult> {
  const { request, current } = input;

  const payload = {
    aiName: clip(current.aiName, 120),
    personality: clip(current.personality, 12_000),
    businessContext: clip(current.businessContext, 24_000),
    pricingRules: clip(current.pricingRules ?? "", 6_000),
    greetingMessage: clip(current.greetingMessage, 500),
    systemPrompt: clip(current.systemPrompt, 24_000),
    catalogLink: current.catalogLink ?? "",
    groupLink: current.groupLink ?? "",
    instagramLink: current.instagramLink ?? "",
    extraLinks: current.extraLinks,
    escalateKeywords: current.escalateKeywords,
    maxContextMessages: current.maxContextMessages,
    responseDelayMin: current.responseDelayMin,
    responseDelayMax: current.responseDelayMax,
  };

  const system = `Você é um assistente interno da Jurema Sport que ajuda LOJISTAS (sem conhecimento técnico) a melhorar o TREINAMENTO da atendente virtual no WhatsApp.

FORMATO DA RESPOSTA (JSON obrigatório):
- outcome: "proposal" se puder sugerir mudanças seguras só nos textos de treinamento e parâmetros listados abaixo; "reject" se não puder.
- messageForUser: texto em português claro para a pessoa ler na tela.
- rejectCode: se outcome for "reject", use "too_advanced" (infra/código/servidor), "unsafe" (ilegal/fraude/ódio/dados de terceiros), ou "unclear" (pedido vago). Se outcome for "proposal", use "none".
- patch_* : strings. REGRA: deixe string VAZIA para NÃO alterar aquele campo. Só preencha com conteúdo novo quando for mudar de fato.

Campos de texto (patch):
- patch_aiName: nome da atendente (curto).
- patch_personality: tom de voz e comportamento (substitui o bloco inteiro se preenchido).
- patch_businessContext: base de conhecimento / manual da loja (endereços, horários, pagamento, frete, trocas, catálogo interno). NUNCA substitua este campo inteiro só para mudar preço — isso apaga endereço e loja física.
- patch_pricingRules: REGRAS DE PREÇO (texto livre, autoritativo). Use SEMPRE este campo — e não o businessContext — quando o lojista pedir mudança de preço (varejo, atacado, mínimo, "a partir de", linha nacional/tailandesa, condição especial). Escreva em formato de lista clara, por linha, ex.:
   "- Camisa NACIONAL: varejo a partir de R$ 50,00; atacado (mín. 10 peças) a partir de R$ 20,00\\n- Camisa TAILANDESA: varejo a partir de R$ 60,00"
  Esse texto SUBSTITUI completamente o bloco default de preços que vai pro modelo. Quando vazio, o sistema usa o default. Se o lojista informar só uma linha, preserve as outras na nova versão (não apague o que já existia em pricingRules atual).
- patch_greetingMessage: mensagem de boas-vindas.
- patch_systemPrompt: texto completo enviado ao modelo (edição avançada). Só altere se fizer sentido com o pedido.
- patch_catalogLink, patch_groupLink, patch_instagramLink: URLs públicas (uma por campo).

Links extras dinâmicos:
- patch_extraLinksJson: JSON array de objetos {"label":"...","url":"https://..."} (até 20 itens). Use [] para remover todos os extras. Use exatamente __KEEP__ para manter a lista atual.

Escalação e comportamento da IA (painel):
- patch_escalateKeywordsJson: JSON array de strings em minúsculas OU exatamente __KEEP__.
- patch_maxContextMessages: número de 1 a 50 como string (ex.: "12") ou vazio para não mudar.
- patch_responseDelayMin / patch_responseDelayMax: milissegundos (ex.: "1000") ou vazio para não mudar. O máximo deve ser >= mínimo; se precisar ajustar os dois, envie os dois patches.

ESCOPO PERMITIDO (proposal):
- Tudo que estiver em CONFIGURAÇÃO ATUAL e for editável na tela Treinamento IA (identidade, base, links fixos e extras, palavras de escalação, memória da conversa, delays, texto completo).
- Você pode propor NOVOS links extras (mais linhas label+url) quando o lojista pedir (ex.: link de rastreio, política de privacidade, canal do Telegram).

REJEITE (outcome=reject) se pedirem: servidor, banco, SQL, API, webhook, chaves, código, wa-bridge, Railway, segurança, logs, alterar sistema de outras lojas, ilegalidade, diagnóstico médico, parecer jurídico definitivo, ou qualquer coisa que não se resolva editando só estes campos. messageForUser deve orientar a falar com o desenvolvedor.

Se o pedido for ambíguo ("melhore tudo") sem detalhe, outcome=reject, rejectCode=unclear.`;

  const user = `PEDIDO DO LOJISTA:\n${request}\n\nCONFIGURAÇÃO ATUAL:\n${JSON.stringify(payload, null, 2)}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: REFINE_SCHEMA,
    },
    max_tokens: 8192,
  });

  const rawContent = response?.choices?.[0]?.message?.content;
  const content =
    typeof rawContent === "string" ? rawContent : rawContent != null ? JSON.stringify(rawContent) : "";

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      outcome: "reject",
      messageForUser:
        "Não consegui interpretar a resposta da IA. Reformule o pedido em frases curtas ou fale com o desenvolvedor.",
      rejectCode: "unclear",
    };
  }

  if (parsed.outcome === "reject") {
    const rc = parsed.rejectCode;
    const code = rc === "unsafe" || rc === "unclear" ? rc : "too_advanced";
    return {
      outcome: "reject",
      messageForUser:
        parsed.messageForUser?.trim() ||
        "Esse tipo de alteração não pode ser feita por aqui. Procure o desenvolvedor ou suporte técnico.",
      rejectCode: code,
    };
  }

  let updates = patchesToUpdates(parsed);

  // Evita que refinamento de preço apague endereço/loja física da base completa.
  if (updates.businessContext && current.businessContext) {
    const regression = detectBusinessContextRegression(
      current.businessContext,
      updates.businessContext
    );
    if (regression && looksLikePricingOnlySnippet(updates.businessContext)) {
      updates = {
        ...updates,
        pricingRules: updates.pricingRules ?? updates.businessContext,
        businessContext: null,
      };
    } else if (regression) {
      return {
        outcome: "reject",
        messageForUser: `${regression} Reformule o pedido (ex.: "atualize só as regras de preço") ou edite manualmente no formulário.`,
        rejectCode: "unclear",
      };
    }
  }

  if (!hasNonEmptyPatch(parsed)) {
    return {
      outcome: "reject",
      messageForUser:
        parsed.messageForUser?.trim() ||
        "Não identifiquei mudanças seguras a aplicar com o nível de detalhe informado. Seja mais específico (ex.: 'fale de forma mais formal') ou peça ajuda ao desenvolvedor.",
      rejectCode: "unclear",
    };
  }

  return {
    outcome: "proposal",
    messageForUser:
      parsed.messageForUser?.trim() ||
      "Sugestão pronta. Confira o resumo e aplique no formulário se estiver de acordo.",
    updates,
  };
}
