/** Detecta quando a base de conhecimento perde informações críticas (ex.: loja física). */

const STORE_MARKERS =
  /endere|shopping|stunt|conselheiro|juta|loja\s*f[ií]sica|retirada|box\s*st/i;

export function businessContextHasStoreInfo(text: string): boolean {
  return STORE_MARKERS.test(text);
}

/**
 * Retorna mensagem de erro se a nova base apagou loja/endereço ou encolheu demais.
 * Usado no save manual e na ferramenta de refinamento.
 */
export function detectBusinessContextRegression(oldBc: string, newBc: string): string | null {
  const old = (oldBc ?? "").trim();
  const neu = (newBc ?? "").trim();
  if (!old || !neu || old === neu) return null;

  const hadStore = businessContextHasStoreInfo(old);
  const hasStore = businessContextHasStoreInfo(neu);

  if (hadStore && !hasStore && neu.length < Math.max(800, old.length * 0.55)) {
    return (
      'A "Base de conhecimento" perdeu endereço ou loja física. Para mudar só preços, use o campo "Regras de preço" — não substitua toda a base.'
    );
  }

  if (old.length > 2000 && neu.length < 600 && !hasStore) {
    return (
      "A base de conhecimento ficou muito curta e pode ter apagado informações importantes (endereço, horário, pagamento). Revise antes de salvar."
    );
  }

  return null;
}

/** Se o patch parece ser só tabela de preços, redireciona para pricingRules. */
export function looksLikePricingOnlySnippet(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const pricingHits = (t.match(/tabela de valor|varejo|atacado|nacional|tailand|pre[cç]o|r\$\s*\d/gi) ?? [])
    .length;
  return pricingHits >= 2 && !businessContextHasStoreInfo(t);
}
