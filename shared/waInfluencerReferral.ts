/**
 * Detecção de ORIGEM da lead (referral source).
 *
 * Cobre dois tipos de canal de aquisição:
 *  - Influenciadores conhecidos (Faraó, Carlos, Alex, Sheik) — exige NOME + CONTEXTO.
 *  - Canais digitais (Facebook, Instagram, TikTok, YouTube, Google, Site) — flexível.
 *
 * As mensagens do cliente vêm em muitas formas:
 *   "vim pela indicação do Carlão"
 *   "vi seu anúncio no Facebook"
 *   "achei vocês pelo insta"
 *   "vi nos stories"           → Instagram (storiess/reels indicam IG)
 *   "vi seu anúncio"            → Anúncio (genérico — fonte desconhecida)
 *
 * Para evitar falso positivo (cliente que se chama "Carlos", ou que disse
 * "compartilhei no facebook"), exigimos um contexto associado ao nome.
 */

export type ReferralKind = "influencer" | "channel" | "generic";

export type ReferralMatch = {
  source: string;           // canonical: "Carlos", "Facebook", "Instagram", "Anúncio"
  kind: ReferralKind;
  matchedAs: string;        // exato como apareceu na mensagem
};

type SourceDef = {
  canonical: string;
  patterns: RegExp[];
};

// ─── Influencers (precisam de contexto de indicação) ────────────────────────

export const KNOWN_INFLUENCERS: SourceDef[] = [
  {
    canonical: "Faraó",
    patterns: [/\bfara[óoôò]\b/i],
  },
  {
    canonical: "Carlos",
    patterns: [
      /\bcarl[aã]o\s+das\s+fontes\b/i,
      /\bcarlos\s+das\s+fontes\b/i,
      /\bcarl[aã]o\b/i,
      /\bcarlos\b/i,
    ],
  },
  {
    canonical: "Alex",
    patterns: [/\balex\b/i],
  },
  {
    canonical: "Sheik",
    patterns: [/\bsheik\b/i, /\bxeique\b/i, /\bcheik\b/i],
  },
];

// ─── Canais digitais (flexível, aceita variações) ───────────────────────────

export const KNOWN_CHANNELS: SourceDef[] = [
  {
    canonical: "Facebook",
    patterns: [
      /\bfacebook\b/i,
      /\bface(?!\w)/i, // "face" sozinho, mas não "facebook" (já cobre acima)
      /\bfb\b/i,
      /\bf[\.\s]?b\b/i,
    ],
  },
  {
    canonical: "Instagram",
    patterns: [
      /\binstagram\b/i,
      /\binsta(?!gram)\b/i,
      /\big\b/i,
      /\bins\b/i,
      // Stories/Reels são fortemente Instagram (com captura como "matched")
      /\bstor(?:y|ies|ys?)\b/i,
      /\breels?\b/i,
    ],
  },
  {
    canonical: "TikTok",
    patterns: [
      /\btik[\s\-]?tok\b/i,
      /\btt\b/i,
    ],
  },
  {
    canonical: "YouTube",
    patterns: [
      /\byoutube\b/i,
      /\byou\s+tube\b/i,
      /\byt\b/i,
    ],
  },
  {
    canonical: "Google",
    patterns: [
      /\bgoogle\b/i,
      /\bgoogl[ae]\b/i,
      /\bgoogou\b/i,
    ],
  },
  {
    canonical: "Site",
    patterns: [
      /\bsite\s+de\s+voc[eê]s\b/i,
      /\bsite\s+da\s+loja\b/i,
      /\bp[áa]gina\s+da\s+loja\b/i,
    ],
  },
];

// ─── Contextos de indicação humana ──────────────────────────────────────────

const REFERRAL_HUMAN_CONTEXT = new RegExp(
  [
    String.raw`\bindica[cç][aã]o\b`,
    String.raw`\bindicad[aoe]s?\b`,
    String.raw`\bindicou\b`,
    String.raw`\bindica\b`,
    String.raw`\brecomend(?:ou|a|ado|ada)\b`,
    String.raw`\bvim\s+pel[oa]\b`,
    String.raw`\bveio\s+pel[oa]\b`,
    String.raw`\bsoube\s+pel[oa]\b`,
    String.raw`\bpassou\s+(?:seu|o)\s+(?:n[uú]mero|contato|whats?(?:app)?)\b`,
    String.raw`\bme\s+passou\b`,
    String.raw`\bme\s+mandou\s+aqui\b`,
    String.raw`\bmandou\s+(?:eu\s+)?(?:falar|procurar|chamar)\b`,
    String.raw`\bdisse\s+(?:que|pra|para)\s+(?:eu\s+)?(?:falar|chamar|comprar|procurar|olhar|vir)\b`,
    String.raw`\bfalou\s+(?:de|do|da|sobre)\s+voc[eê]s\b`,
    String.raw`\bfalou\s+(?:pra|para)\s+(?:eu\s+)?(?:vir|chamar|procurar)\b`,
    String.raw`\bs[oô]u\s+amig[oa]\s+do\b`,
    String.raw`\bconhe[cç]o\s+(?:o|a)\b`,
  ].join("|"),
  "i"
);

// ─── Contextos de canal digital ─────────────────────────────────────────────
// "vi/cheguei/achei + (no/pelo/pela) <canal>", "anúncio", "post", "publicação", etc.
// Usamos um contexto mais amplo: basta a frase soar como "vim de algum lugar online".

const REFERRAL_CHANNEL_CONTEXT = new RegExp(
  [
    String.raw`\b(vi|achei|encontrei|cheguei|conheci|vim|peguei|descobri|achamos|encontramos)\b`,
    String.raw`\b(an[uú]ncio|propaganda|publica[cç][aã]o|post(?:agem)?|public[ai])\b`,
    String.raw`\bpel[oa]\b`,
    String.raw`\b(?:no|na)\s+(?:face|insta|tik|youtube|google|site|p[áa]gina)\b`,
    String.raw`\bredes?\s+sociais\b`,
    String.raw`\bperfi[lú]\s+de\s+voc[eê]s\b`,
    String.raw`\bp[áa]gina\s+de\s+voc[eê]s\b`,
    String.raw`\bv[íi]deo\s+de\s+voc[eê]s\b`,
    String.raw`\bappareceu\b`,
    String.raw`\bapareceu\b`,
  ].join("|"),
  "i"
);

// ─── Detecção genérica "anúncio sem canal" ──────────────────────────────────

const AD_GENERIC_CONTEXT = new RegExp(
  [
    String.raw`\b(an[uú]ncio|propaganda|publica[cç][aã]o)\s+(?:de\s+voc[eê]s|da\s+loja|do?\s+jurema)\b`,
    String.raw`\bvi\s+(?:o\s+|seu\s+|um\s+)?an[uú]ncio\b`,
    String.raw`\b(?:apareceu|caiu)\s+(?:um\s+)?an[uú]ncio\b`,
    String.raw`\bvi\s+(?:o\s+)?post\b`,
    String.raw`\bvi\s+(?:o\s+)?v[íi]deo\b`,
  ].join("|"),
  "i"
);

function normalizeAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Detecta origem da lead.
 *
 * Prioridade:
 *  1. Influencer (nome + contexto de indicação humana).
 *  2. Canal digital (nome do canal + contexto online).
 *  3. Canal digital (nome do canal isolado e prominente).
 *  4. Anúncio genérico (frase indica anúncio/post/vídeo, sem canal explícito).
 */
export function detectReferralSource(text: string | null | undefined): ReferralMatch | null {
  if (!text) return null;
  const t = String(text).trim();
  if (t.length < 3) return null;

  const tNoAccents = normalizeAccents(t);

  // 1. Influencer (nome + contexto de indicação humana).
  const humanCtx = REFERRAL_HUMAN_CONTEXT.test(t) || REFERRAL_HUMAN_CONTEXT.test(tNoAccents);
  if (humanCtx) {
    for (const inf of KNOWN_INFLUENCERS) {
      for (const re of inf.patterns) {
        const m = t.match(re);
        if (m) return { source: inf.canonical, kind: "influencer", matchedAs: m[0] };
      }
    }
  }

  // 2. Canal digital (nome do canal + contexto online).
  const channelCtx =
    REFERRAL_CHANNEL_CONTEXT.test(t)
    || REFERRAL_CHANNEL_CONTEXT.test(tNoAccents);
  if (channelCtx) {
    for (const ch of KNOWN_CHANNELS) {
      for (const re of ch.patterns) {
        const m = t.match(re);
        if (m) return { source: ch.canonical, kind: "channel", matchedAs: m[0] };
      }
    }
  }

  // 3. Canal digital isolado e prominente (sem contexto explícito):
  //    aceita só nomes claros (facebook, instagram, tiktok, youtube, stories,
  //    reels). Evita ruído de abreviações como "fb", "ig" sozinhas.
  const explicitChannelMaps: Array<{ re: RegExp; canonical: string }> = [
    { re: /\bfacebook\b/i, canonical: "Facebook" },
    { re: /\binstagram\b/i, canonical: "Instagram" },
    { re: /\bstor(?:y|ies|ys?)\b/i, canonical: "Instagram" },
    { re: /\breels?\b/i, canonical: "Instagram" },
    { re: /\btik[\s\-]?tok\b/i, canonical: "TikTok" },
    { re: /\byoutube\b/i, canonical: "YouTube" },
  ];
  for (const { re, canonical } of explicitChannelMaps) {
    const m = t.match(re);
    if (m) return { source: canonical, kind: "channel", matchedAs: m[0] };
  }

  // 4. Anúncio genérico (sem identificar o canal).
  if (AD_GENERIC_CONTEXT.test(t) || AD_GENERIC_CONTEXT.test(tNoAccents)) {
    const adMatch = t.match(AD_GENERIC_CONTEXT) || tNoAccents.match(AD_GENERIC_CONTEXT);
    return {
      source: "Anúncio",
      kind: "generic",
      matchedAs: adMatch?.[0] ?? "anúncio",
    };
  }

  return null;
}

/** Alias backward compat. */
export const detectInfluencerReferral = detectReferralSource;
export type InfluencerMatch = ReferralMatch;

/** Lista plana de todos os canais conhecidos para o dropdown do painel. */
export const INFLUENCER_CANONICALS = KNOWN_INFLUENCERS.map((i) => i.canonical);
export const CHANNEL_CANONICALS = KNOWN_CHANNELS.map((c) => c.canonical);
export const GENERIC_CANONICALS = ["Anúncio", "Outro"];

export type ReferralOptionGroup = {
  group: string;
  options: string[];
};

export const REFERRAL_OPTION_GROUPS: ReferralOptionGroup[] = [
  { group: "Influenciadores", options: INFLUENCER_CANONICALS },
  { group: "Canais digitais", options: CHANNEL_CANONICALS },
  { group: "Outros", options: GENERIC_CANONICALS },
];
