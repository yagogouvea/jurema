/**
 * Refinamento do treinamento da IA a partir de pedido em linguagem natural (admin).
 */

import { z } from "zod";
import { invokeLLM } from "../_core/llm";

/** Patches: string vazio = sem alteração nesse campo. escalateKeywords: JSON array ou "__KEEP__". */
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
      patch_personality: { type: "string" },
      patch_businessContext: { type: "string" },
      patch_greetingMessage: { type: "string" },
      patch_systemPrompt: { type: "string" },
      patch_catalogLink: { type: "string" },
      patch_groupLink: { type: "string" },
      patch_instagramLink: { type: "string" },
      patch_escalateKeywordsJson: { type: "string" },
    },
    required: [
      "outcome",
      "messageForUser",
      "rejectCode",
      "patch_personality",
      "patch_businessContext",
      "patch_greetingMessage",
      "patch_systemPrompt",
      "patch_catalogLink",
      "patch_groupLink",
      "patch_instagramLink",
      "patch_escalateKeywordsJson",
    ],
    additionalProperties: false,
  },
} as const;

export const refineTrainingInputSchema = z.object({
  instanceId: z.number(),
  request: z
    .string()
    .min(12, "Descreva com um pouco mais de detalhe o que deseja (pelo menos 12 caracteres).")
    .max(4000),
  current: z.object({
    personality: z.string(),
    businessContext: z.string(),
    greetingMessage: z.string(),
    systemPrompt: z.string(),
    catalogLink: z.string().optional(),
    groupLink: z.string().optional(),
    instagramLink: z.string().optional(),
    escalateKeywords: z.array(z.string()),
  }),
});

export type RefineTrainingUpdates = {
  personality: string | null;
  businessContext: string | null;
  greetingMessage: string | null;
  systemPrompt: string | null;
  catalogLink: string | null;
  groupLink: string | null;
  instagramLink: string | null;
  escalateKeywords: string[] | null;
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

function hasNonEmptyPatch(parsed: Record<string, string>): boolean {
  const keys = [
    "patch_personality",
    "patch_businessContext",
    "patch_greetingMessage",
    "patch_systemPrompt",
    "patch_catalogLink",
    "patch_groupLink",
    "patch_instagramLink",
  ];
  if (keys.some((k) => (parsed[k] ?? "").trim().length > 0)) return true;
  const kw = (parsed.patch_escalateKeywordsJson ?? "").trim();
  return kw.length > 0 && kw !== "__KEEP__";
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
  } else if (kwRaw === "__KEEP__") {
    escalateKeywords = null;
  }

  const pick = (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };

  return {
    personality: pick(parsed.patch_personality),
    businessContext: pick(parsed.patch_businessContext),
    greetingMessage: pick(parsed.patch_greetingMessage),
    systemPrompt: pick(parsed.patch_systemPrompt),
    catalogLink: pick(parsed.patch_catalogLink),
    groupLink: pick(parsed.patch_groupLink),
    instagramLink: pick(parsed.patch_instagramLink),
    escalateKeywords,
  };
}

export async function refineAiTrainingFromNaturalLanguage(
  input: z.infer<typeof refineTrainingInputSchema>
): Promise<RefineTrainingResult> {
  const { request, current } = input;

  const payload = {
    personality: clip(current.personality, 12_000),
    businessContext: clip(current.businessContext, 24_000),
    greetingMessage: clip(current.greetingMessage, 500),
    systemPrompt: clip(current.systemPrompt, 24_000),
    catalogLink: current.catalogLink ?? "",
    groupLink: current.groupLink ?? "",
    instagramLink: current.instagramLink ?? "",
    escalateKeywords: current.escalateKeywords,
  };

  const system = `Você é um assistente interno da Jurema Sport que ajuda LOJISTAS (sem conhecimento técnico) a melhorar o TREINAMENTO da atendente virtual no WhatsApp.

FORMATO DA RESPOSTA (JSON obrigatório):
- outcome: "proposal" se puder sugerir mudanças seguras só nos textos de treinamento; "reject" se não puder.
- messageForUser: texto em português claro para a pessoa ler na tela.
- rejectCode: se outcome for "reject", use "too_advanced" (infra/código/servidor), "unsafe" (ilegal/fraude/ódio/dados de terceiros), ou "unclear" (pedido vago). Se outcome for "proposal", use "none".
- patch_* : strings. REGRA: deixe string VAZIA para NÃO alterar aquele campo. Só preencha patch_* com texto novo quando for mudar de fato.

Campos patch:
- patch_personality, patch_businessContext, patch_greetingMessage, patch_systemPrompt
- patch_catalogLink, patch_groupLink, patch_instagramLink (URLs públicas)
- patch_escalateKeywordsJson: JSON array de strings em minúsculas, ex: ["reclamação","gerente"] OU exatamente __KEEP__ para manter a lista atual.

ESCOPO PERMITIDO (proposal):
- Tom, formalidade, emojis, cordialidade (personality).
- Manual da loja: horários, endereço, políticas, pedido, frete, trocas, atacado (businessContext). Preserve seções === quando fizer sentido.
- Saudação (greetingMessage).
- Texto completo systemPrompt apenas se for coerente com as mudanças pedidas.
- Links e palavras-chave de escalação.

REJEITE (outcome=reject) se pedirem: servidor, banco, SQL, API, webhook, chaves, código, wa-bridge, Railway, segurança, logs, alterar sistema de outras lojas, ilegalidade, diagnóstico médico, parecer jurídico definitivo, ou qualquer coisa que não se resolva editando só estes textos. messageForUser deve orientar a falar com o desenvolvedor.

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

  const updates = patchesToUpdates(parsed);

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
