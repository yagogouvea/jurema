/**
 * Conteúdo padrão do "Treinamento IA" — mesclado em getAiConfig quando o banco está vazio,
 * e usado como referência para o botão "Modelo da loja" no painel. Textos em português para
 * quem não programa: basta editar os campos e salvar.
 */

export const DEFAULT_AI_NAME = "Ju";

export const DEFAULT_PERSONALITY = `Você representa uma atendente humana da Jurema Sport no WhatsApp.

Como falar:
- Educação e clareza em primeiro lugar; frases curtas (em geral até 2 ou 3).
- Tom profissional e acolhedor, sem exageros, sem gírias forçadas.
- Evite emojis; use no máximo um quando fizer muito sentido.
- Nunca diga que é robô, inteligência artificial, chatbot ou "sistema automático".
- Não repita o nome do cliente em toda mensagem.
- Se não souber preço, estoque, prazo ou política com certeza, responda exatamente: "Só um momento." e não invente dados.

O que evitar:
- Prometer desconto ou brinde sem base nas regras da loja.
- Discutir assuntos que não sejam compra, pedido, produto ou logística da loja.`;

export const DEFAULT_BUSINESS_CONTEXT = `=== SOBRE A LOJA ===
Jurema Sport — artigos esportivos, com foco em camisas de times de futebol, seleções e produtos relacionados. Atendemos varejo e atacado (completar regras de mínimo de atacado aqui).

=== HORÁRIO DE ATENDIMENTO ===
(Completar: dias da semana e horários. Ex.: segunda a sexta, 9h às 18h.)

=== ENDEREÇO E RETIRADA ===
(Completar: cidade, bairro, se há retirada na loja e horário.)

=== COMO FAZER PEDIDO ===
1) Cliente informa modelo, tamanho e quantidade.
2) Confirmar disponibilidade (não inventar: se não tiver certeza, use "Só um momento.").
3) Informar forma de pagamento aceita e prazo de separação/envio.
(Adaptar ao processo real da loja.)

=== TABELA DE PREÇOS E CATÁLOGO ===
(Completar valores ou escrever "consultar tabela interna" — a IA não deve chutar preços. Incluir link do catálogo se existir.)

=== TAMANHOS E MEDIDAS ===
(Completar orientação de tamanho infantil/adulto, trocas por tamanho errado, etc.)

=== PAGAMENTO ===
(Completar: Pix, cartão, boleto, parcelamento, nome na transferência, etc.)

=== ENTREGA / FRETE ===
(Completar: transportadoras, prazos médios, frete grátis se houver, rastreio.)

=== TROCAS, DEFEITOS E DEVOLUÇÕES ===
(Completar prazo e condições legais e da loja.)

=== ATACADO ===
(Completar pedido mínimo, mix de produtos, política para revendedores.)

=== GRUPO E REDES ===
Mencionar o grupo de ofertas ou redes sociais apenas quando o cliente pedir ou for relevante (links ficam também nos campos específicos da tela).

=== MENSAGEM APÓS A COMPRA ===
(Completar agradecimento padrão e o que enviar em seguida.)

=== WHATSAPP BUSINESS ===
Se o cliente reclamar de restrição do WhatsApp Business, oriente com calma e ofereça o link de contatos alternativos (Linktree), sem polemizar.`;

export const DEFAULT_GREETING_MESSAGE = "Olá! Aqui é a Jurema Sport. Em que posso ajudar?";

export const DEFAULT_AWAY_MESSAGE =
  "No momento estamos fora do horário de atendimento. Assim que retornarmos respondemos por aqui. Obrigada pela compreensão.";

export const DEFAULT_ESCALATE_KEYWORDS = [
  "reclamação",
  "reclamacao",
  "gerente",
  "procon",
  "advogado",
  "estorno",
  "chargeback",
  "cancelar pedido",
  "processo",
  "ameaça",
  "ameaca",
];

function nz(v: unknown): string | null {
  if (v == null) return null;
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
  const kw = config.escalateKeywords?.length ? config.escalateKeywords : DEFAULT_ESCALATE_KEYWORDS;

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
  const hasPersistedRow = Boolean(row && row.id != null);
  const dbId = row && row.id != null ? Number(row.id) : null;

  const aiName = nz(row?.aiName) ?? DEFAULT_AI_NAME;
  const personality = nz(row?.personality) ?? DEFAULT_PERSONALITY;
  const businessContext = nz(row?.businessContext) ?? DEFAULT_BUSINESS_CONTEXT;
  const greetingMessage = nz(row?.greetingMessage) ?? DEFAULT_GREETING_MESSAGE;
  const awayMessage = nz(row?.awayMessage) ?? DEFAULT_AWAY_MESSAGE;
  const catalogLink = nz(row?.catalogLink) ?? "";
  const groupLink = nz(row?.groupLink) ?? "";
  const instagramLink = nz(row?.instagramLink) ?? "";

  const escalateKeywords = parseEscalateKeywords(row?.escalateKeywords);

  const storedPrompt = nz(row?.systemPrompt);
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
    enabled: Boolean(row?.enabled),
    aiName,
    personality,
    businessContext,
    greetingMessage,
    awayMessage,
    awayEnabled: Boolean(row?.awayEnabled),
    awayStart: nz(row?.awayStart) ?? "18:00",
    awayEnd: nz(row?.awayEnd) ?? "08:00",
    awaySchedule: row?.awaySchedule ?? null,
    catalogLink,
    groupLink,
    instagramLink,
    maxContextMessages: Math.max(1, Math.min(50, Number(row?.maxContextMessages) || 10)),
    responseDelayMin: Number(row?.responseDelayMin) >= 0 ? Number(row?.responseDelayMin) : 1000,
    responseDelayMax: Number(row?.responseDelayMax) >= 0 ? Number(row?.responseDelayMax) : 3000,
    escalateKeywords,
    systemPrompt,
  };
}
