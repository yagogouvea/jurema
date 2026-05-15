/**
 * Detecção de indicação por influenciador.
 *
 * Os clientes mencionam o influenciador em formas diversas:
 *   "vim pela indicação do Carlão"
 *   "fui indicado pelo Alex"
 *   "o Sheik me passou o número"
 *   "o Faraó disse que vocês tinham..."
 *
 * Regra: para considerar indicação, é preciso TER o nome (ou variação) E
 * uma palavra de contexto (indicação/indicou/passou/mandou/etc) dentro da
 * mesma mensagem. Evita falsos positivos como "meu nome é Carlos" ou
 * "Alex, tudo bem?".
 */

export type InfluencerMatch = {
  source: string;           // canonical: "Carlos", "Alex", "Sheik", "Faraó"
  matchedAs: string;        // exato como apareceu na mensagem
};

type InfluencerDef = {
  canonical: string;
  patterns: RegExp[];
};

export const KNOWN_INFLUENCERS: InfluencerDef[] = [
  {
    canonical: "Faraó",
    patterns: [
      /\bfara[óoôò]\b/i,
    ],
  },
  {
    canonical: "Carlos",
    patterns: [
      // "Carlão das Fontes" / "Carlos das Fontes" tem prioridade (mais específico)
      /\bcarl[aã]o\s+das\s+fontes\b/i,
      /\bcarlos\s+das\s+fontes\b/i,
      /\bcarl[aã]o\b/i,
      /\bcarlos\b/i,
    ],
  },
  {
    canonical: "Alex",
    patterns: [
      /\balex\b/i,
    ],
  },
  {
    canonical: "Sheik",
    patterns: [
      /\bsheik\b/i,
      /\bxeique\b/i,
      /\bcheik\b/i,
    ],
  },
];

/**
 * Palavras/expressões que indicam "essa pessoa veio por indicação".
 * Aceita acentos e variações. Aplicado ao texto inteiro do cliente.
 */
const REFERRAL_CONTEXT_REGEX = new RegExp(
  [
    String.raw`\bindica[cç][aã]o\b`,
    String.raw`\bindicad[aoe]s?\b`,
    String.raw`\bindicou\b`,
    String.raw`\bindica\b`,
    String.raw`\brecomend(?:ou|a|ado|ada)\b`,
    String.raw`\bvim\s+pel[oa]\b`,
    String.raw`\bveio\s+pel[oa]\b`,
    String.raw`\bsoube\s+pel[oa]\b`,
    String.raw`\bsoube\s+do\s+voc[eê]s\b`,
    String.raw`\bpassou\s+(?:seu|o)\s+(?:n[uú]mero|contato|whats?(?:app)?)\b`,
    String.raw`\bme\s+passou\b`,
    String.raw`\bme\s+mandou\s+aqui\b`,
    String.raw`\bmandou\s+(?:eu\s+)?(?:falar|procurar|chamar|chamar\s+aqui)\b`,
    String.raw`\bdisse\s+(?:que|pra|para)\s+(?:eu\s+)?(?:falar|chamar|comprar|procurar|olhar)\b`,
    String.raw`\bfalou\s+(?:de|do|da|sobre)\s+voc[eê]s\b`,
    String.raw`\bfalou\s+(?:pra|para)\s+(?:eu\s+)?(?:vir|chamar|procurar)\b`,
    String.raw`\bvi(?:m)?\s+com\s+o\b`,
    String.raw`\bs[oô]u\s+amig[oa]\s+do\b`,
    String.raw`\bconhe[cç]o\s+(?:o|a)\b`,
  ].join("|"),
  "i"
);

function normalizeAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Detecta indicação de influenciador na mensagem do cliente.
 * Retorna a primeira correspondência válida ou null.
 *
 * Regra: nome do influencer aparece E há contexto de indicação no texto.
 * O contexto pode estar em qualquer parte da mensagem (não exige proximidade).
 */
export function detectInfluencerReferral(text: string | null | undefined): InfluencerMatch | null {
  if (!text) return null;
  const t = String(text).trim();
  if (t.length < 3) return null;

  const hasContext = REFERRAL_CONTEXT_REGEX.test(t) || REFERRAL_CONTEXT_REGEX.test(normalizeAccents(t));
  if (!hasContext) return null;

  for (const inf of KNOWN_INFLUENCERS) {
    for (const re of inf.patterns) {
      const m = t.match(re);
      if (m) {
        return { source: inf.canonical, matchedAs: m[0] };
      }
    }
  }
  return null;
}

/** Lista de canonicals para o painel/UI montar dropdown. */
export const INFLUENCER_CANONICALS = KNOWN_INFLUENCERS.map((i) => i.canonical);
