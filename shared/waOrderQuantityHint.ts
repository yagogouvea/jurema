/**
 * Heurística para o atendimento IA: somar quantidades em pedidos por texto (várias linhas no mesmo balão
 * ou várias mensagens de texto seguidas do cliente antes da última resposta da loja).
 * Não substitui a leitura humana; só injeta um lembrete numérico no system prompt.
 */

const PRODUCTISH =
  /camisa|bermuda|calç|calc|short|agasalho|jaqueta|meia|boné|bone|t[eê]nis|chuteira|kit|conjunto|sele|brasil|corinth|flamen|atl[eé]tic|s[aã]o paulo|spfc|pe[cç]a|produto|unidade|torcedor|personaliz/i;

const INLINE_QTY = /\b(\d{1,4})\s+(?:camisas?|pe[cç]as?|bermudas?|shorts?|kits?|unidades?|agasalhos?|jaquetas?)\b/gi;

/**
 * Junta as últimas mensagens de texto do cliente (até encontrar mensagem nossa), em ordem cronológica.
 */
export function joinTrailingCustomerTextMessages(parts: string[]): string {
  return parts
    .map((s) => s.replace(/\r\n/g, "\n").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Monta um bloco curto para o system prompt quando detecta várias quantidades ou várias linhas.
 */
export function buildOrderQuantitySystemHint(blob: string): string | null {
  const text = (blob || "").replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const fromLines: number[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*0*(\d{1,4})\b/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n < 1 || n > 5000) continue;
    if (lines.length >= 2 || PRODUCTISH.test(line)) fromLines.push(n);
  }

  const inlineMatches = Array.from(text.matchAll(INLINE_QTY));
  const inlineNums = inlineMatches.map((m) => parseInt(m[1], 10)).filter((n) => n >= 1 && n <= 5000);

  let chosen: number[];
  if (fromLines.length >= 2) chosen = fromLines;
  else if (inlineNums.length >= 2) chosen = inlineNums;
  else if (fromLines.length === 1 && inlineNums.length >= 2) chosen = inlineNums;
  else if (fromLines.length === 1) chosen = fromLines;
  else if (inlineNums.length === 1) chosen = inlineNums;
  else return null;

  const sum = chosen.reduce((a, b) => a + b, 0);
  const multiLineOrMultiQty = lines.length >= 2 || chosen.length >= 2 || inlineNums.length >= 2;

  const shouldInject =
    chosen.length >= 2 ||
    lines.length >= 2 ||
    inlineNums.length >= 2 ||
    (sum >= 6 && chosen.length >= 1);

  if (!shouldInject) return null;

  const detail = chosen.join(" + ");
  return (
    `===== LEITURA AUTOMÁTICA DO PEDIDO (use para total de peças; não ignore o texto do cliente) =====\n` +
    `Neste trecho recente do cliente foram detectadas quantidades que somam aproximadamente ${sum} peça(s)/unidade(s) ` +
    `(parcelas numéricas: ${detail}).\n` +
    `Antes de falar em mínimo de atacado (ex.: 6 peças) ou em "faltam X peças", compare esse TOTAL ao mínimo — ` +
    `não use só o primeiro número, nem só a primeira linha do texto${multiLineOrMultiQty ? " nem só a última mensagem isolada" : ""}.`
  );
}

/**
 * Extrai textos do cliente desde a última resposta nossa até o fim do array `msgs` (cronológico).
 */
export function collectTrailingCustomerTextParts(msgs: { fromMe: number | boolean; type: string; content: string | null }[]): string[] {
  const chunks: string[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.fromMe) break;
    if (m.type === "text" && m.content?.trim()) {
      chunks.push(m.content.trim());
    }
  }
  return chunks.reverse();
}
