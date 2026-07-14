/** Normalização de valores e nomes para conciliação. */

export function toCents(value: number | string): number {
  if (typeof value === "number") return Math.round(value * 100);
  const s = value.trim().replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  // BR: 1.565,00
  if (s.includes(",") && s.includes(".")) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  // BR só vírgula: 315,00
  if (s.includes(",")) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  // US / MySQL decimal string: 315.00
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Parseia "+1.565,00" / "-360,00" do extrato InfinitePay. */
export function parseBrlAmountToCents(raw: string): number {
  const s = (raw || "").trim().replace(/\s/g, "").replace(/^R\$/i, "");
  const negative = s.startsWith("-") || s.startsWith("−");
  const digits = s.replace(/[^\d,]/g, "");
  const cents = toCents(digits);
  return negative ? -Math.abs(cents) : Math.abs(cents);
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Remove CNPJ/CPF soltos e prefixo PIX. */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  let s = stripAccents(raw).toUpperCase().trim();
  s = s.replace(/^PIX\s+/i, "");
  // CNPJ formatado no início: 56.119.430 NOME
  s = s.replace(/^\d{2}\.?\d{3}\.?\d{3}\s+/, "");
  // CPF 11 dígitos grudado ou separado
  s = s.replace(/\b\d{11}\b/g, " ");
  s = s.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, " ");
  s = s.replace(/[^A-Z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function nameTokens(norm: string): string[] {
  return norm.split(" ").filter((t) => t.length >= 2);
}

/** Similaridade 0..1 (Jaccard de tokens, com bônus de substring). */
export function nameSimilarity(aRaw: string, bRaw: string): number {
  const a = normalizeName(aRaw);
  const b = normalizeName(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return Math.max(0.7, shorter / longer);
  }
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

export function bestNameScore(
  extractName: string,
  nomePix: string | null | undefined,
  clienteNome: string | null | undefined
): number {
  return Math.max(nameSimilarity(extractName, nomePix || ""), nameSimilarity(extractName, clienteNome || ""));
}

export function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function stableLineId(parts: (string | number)[]): string {
  return parts.map(String).join("|");
}
