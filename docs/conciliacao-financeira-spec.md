# Financeiro → Conciliação de Extrato — Spec (MVP)

> Base: pedidos PDV (`pdv_orders` + `pdv_order_payments`) × extratos InfinitePay + Mercado Pago  
> LLM: matching por regras; `gpt-4o` só no resumo/PDF final  
> Parsers: `server/financeiro/infinitePayParser.ts`, `mercadoPagoParser.ts`

---

## 1. Objetivo

A cliente anexa o PDF de um período e o sistema devolve:

1. O que foi possível identificar como **localizado** (PIX do extrato ↔ pagamento PIX do PDV)
2. O que ficou **pendente / não localizado**
3. Relatório **PDF** + **resumo em texto** (bem composto)

Não marcar “pago automático” no pedido. A conciliação é **conferência assistida**.

---

## 2. Fontes de dados

### 2.1 PDV (candidatos)

```
SELECT
  o.pedidoId, o.clienteNome, o.clienteTelefone, o.status,
  o.createdAt AS pedidoCreatedAt,
  o.totalAplicado, o.totalPago, o.totalPendente,
  p.id AS paymentId, p.formaPagamento, p.valor, p.taxa, p.valorLiquido,
  p.nomePix, p.createdAt AS paymentCreatedAt
FROM pdv_orders o
JOIN pdv_order_payments p ON p.pedidoId = o.pedidoId
WHERE p.formaPagamento = 'PIX'
  AND o.status <> 'CANCELADO'
  AND CONVERT_TZ(o.createdAt, '+00:00', '-03:00')
        BETWEEN :periodoInicioExpandido AND :periodoFimExpandido
```

- Âncora de tempo do pedido: `pedidoCreatedAt` (lançamento no sistema; pode ser antes/depois do PIX real).
- Nomes para match: `nomePix` **e** `clienteNome` (pega o melhor score).
- Valores em **centavos** (`round(valor * 100)`).

### 2.2 Extrato InfinitePay (linhas)

Parser exclusivo `source = infinitepay`:

- Ignorar: cabeçalho, totais, saldo do dia, rodapé, **Pix Enviado**
- Manter: **Pix + Recebido + valor +**
- Campos normalizados por linha:

```ts
type ExtractLine = {
  id: string;            // hash estável (data+hora+nome+valor+page)
  source: "infinitepay";
  date: string;          // YYYY-MM-DD (SP)
  time: string;          // HH:mm
  datetime: Date;        // America/Sao_Paulo
  type: "PIX";
  direction: "in";
  payerNameRaw: string;
  payerNameNorm: string;
  amountCents: number;   // positivo
  page: number;
};
```

### 2.3 Janela de período

Período do PDF = `[D0, D1]`.

Candidatos PDV buscam com expansão:

```
pedidoCreatedAt ∈ [D0 00:00 SP − 36h  …  D1 23:59 SP + 72h]
```

Tolerância default no score (configurável na UI):

```
PIX_datetime ∈ [pedidoCreatedAt − 36h  …  pedidoCreatedAt + 72h]
```

---

## 3. Normalização

### 3.1 Valor

```
toCents(v) = round(v * 100)   // nunca fuzzy ±1 no MVP
```

### 3.2 Nome

```
normalizeName(s):
  upper, strip accents
  remove leading "PIX "
  remove CNPJ/CPF tokens (digits / dotted tax ids)
  collapse whitespace
  return string
```

Similaridade: tokens Jaccard ou Levenshtein normalizado (0..1).

```
nameScore(extractName, pedido):
  best = max(
    similarity(extractName, normalize(pedido.nomePix)),
    similarity(extractName, normalize(pedido.clienteNome))
  )
  if nomePix and clienteNome both empty → 0
```

---

## 4. Score

| Sinal | Pontos |
|-------|--------:|
| Valor exato | +50 |
| Mesmo dia calendário SP | +20 |
| \|Δt\| ≤ 24h | +15 |
| \|Δt\| ≤ 72h (e > 24h) | +8 |
| Nome ≥ 0,85 | +25 |
| Nome 0,55..0,84 | +12 |
| Nome &lt; 0,55 ou ausente | +0 |
| Outro candidato com mesmo valor no pool | −20 |
| Pedido status `PENDENTE` | −10 |
| Fora da janela de tolerância | bloqueio (score = −∞) |
| Pedido `CANCELADO` | bloqueio |

Cortes:

| Score | Ação |
|------:|------|
| ≥ 80 | **LOCALIZADO** auto (alta) |
| 55–79 | **LOCALIZADO** médio se único; senão **REVISAR** |
| &lt; 55 | não casar / **REVISAR** se havia valor igual |

Empate (2+ com mesmo score top): sempre **REVISAR**.

---

## 5. Pseudo-código — matching

```
function reconcile(extractPdf, period, options):
  lines = parseInfinitePay(extractPdf)          // só Pix Recebido
  payments = loadPdvPixPayments(period ± expand) // status ≠ CANCELADO

  poolLines = set(lines)
  poolPays  = set(payments)
  matches = []
  review = []

  // Passada 1 — 1:1 por score (maior valor primeiro para estabilidade)
  for line in sortBy(poolLines, amountCents DESC, datetime ASC):
    cands = [p in poolPays where p.valorCents == line.amountCents
             and withinWindow(line.datetime, p.pedidoCreatedAt, options.tolerance)]
    if cands empty:
      continue

    scored = sortBy(cands, score(line, p) DESC)
    top = scored[0]
    tied = scored.filter(s => s.score == top.score)

    if tied.length == 1 and top.score >= 80:
      matches.push({ line, pay: top, confidence: "high", score: top.score, kind: "1:1" })
      remove line, top from pools
    else if tied.length == 1 and top.score >= 55:
      matches.push({ line, pay: top, confidence: "medium", score: top.score, kind: "1:1" })
      remove line, top from pools
    else:
      review.push({ line, candidates: scored.take(3), reason: "empate_ou_score_baixo" })

  // Passada 2 — split: vários PIX do mesmo pagador no mesmo dia = 1 payment
  for pay in remaining poolPays:
    sameDayGroups = group lines remaining by (payerNameNorm, date)
    for group in sameDayGroups:
      if sum(group.amountCents) == pay.valorCents
         and withinWindow(min/max datetime group, pay.pedidoCreatedAt)
         and no other pay claims that exact sum uniquely:
        if nameScore(group[0], pay) >= 0.55 or group unique by sum:
          matches.push({ lines: group, pay, confidence: "medium", kind: "split" })
          remove group + pay from pools
        else:
          review.push({ lines: group, pay, reason: "split_nome_fraco" })

  // Passada 3 — (MVP: só revisar) 1 PIX = soma de 2 payments
  // Não auto-casar; listar hipóteses óbvias no review

  onlyExtract = remaining poolLines
  onlyPdv     = remaining poolPays

  summary = buildStructuredResult(matches, review, onlyExtract, onlyPdv, extractTotals)
  narrative = invokeLLM_gpt4o(summary)           // não inventa novos matches
  pdf = renderReportPdf(summary, narrative)
  return { summary, narrative, pdf, matches, review, onlyExtract, onlyPdv }
```

### `withinWindow`

```
withinWindow(pixAt, pedidoAt, tol):
  // default: -36h .. +72h
  return pixAt >= pedidoAt - tol.before
     and pixAt <= pedidoAt + tol.after
```

### `score(line, pay)` — resumo

```
if not withinWindow → return -Infinity
s = 50  // valor já filtrado igual
if sameCalendarDay(line, pay) → s += 20
dt = abs(line.datetime - pay.pedidoCreatedAt)
if dt <= 24h → s += 15
else if dt <= 72h → s += 8
ns = nameScore(line.payerNameNorm, pay)
if ns >= 0.85 → s += 25
else if ns >= 0.55 → s += 12
if countOtherSameValueInPool(pay) > 0 → s -= 20
if pay.status == PENDENTE → s -= 10
return s
```

---

## 6. Saídas da API (contrato sugerido)

```ts
type ReconcileResult = {
  source: "infinitepay";
  period: { start: string; end: string };
  totals: {
    extractInCents: number;
    matchedCents: number;
    onlyExtractCents: number;
    onlyPdvCents: number;
    matchCount: number;
    reviewCount: number;
  };
  matched: Array<{
    kind: "1:1" | "split";
    confidence: "high" | "medium";
    score: number;
    extract: ExtractLine | ExtractLine[];
    payment: { pedidoId; paymentId; valor; nomePix; clienteNome; pedidoCreatedAt };
    notes?: string;
  }>;
  review: Array<{ reason: string; extract?; payment?; candidates? }>;
  onlyExtract: ExtractLine[];
  onlyPdv: Array<{ pedidoId; paymentId; valor; clienteNome; nomePix; pedidoCreatedAt }>;
  narrativeText: string;   // para WhatsApp / tela
  reportPdfUrl: string;    // storage
};
```

---

## 7. UI (MVP)

**PDV → Financeiro → Conciliação**

1. Período + upload PDF + origem `InfinitePay`
2. Botão **Analisar**
3. Abas/seções: Localizados · Revisar · Só extrato · Só PDV
4. Totais no topo
5. Botões: baixar PDF · copiar resumo texto
6. Histórico da rodada (quem, quando, arquivo)

Admin: tolerância de data (preset 36h/72h).

---

## 8. LLM (só narrativa)

- Modelo: `OPENAI_MODEL_REPORT` = `gpt-4o`
- Input: JSON estruturado do resultado (sem re-parse do PDF)
- Output: texto PT-BR com:
  - totais
  - o que casou
  - o que falta e hipóteses curtas
  - próximos passos (ex.: “lançar pedido X”, “preencher nomePix”)
- Proibido: inventar pedidoId ou declarar LOCALIZADO o que está em `review`/`only*`

PDF: template server-side (tabelas) + bloco de narrativa gerada.

---

## 9. Checklist de aceite

### Parser InfinitePay

- [ ] Lê PDF texto (exemplo 9 páginas) sem OCR
- [ ] Extrai período do cabeçalho
- [ ] Ignora Pix Enviado e linhas de saldo/rodapé
- [ ] Mantém Data, Hora, Nome, Valor(+), página
- [ ] Valores `1.565,00` → 156500 centavos corretos
- [ ] Nomes com CNPJ/CPF no início normalizam

### Carga PDV

- [ ] Só `formaPagamento = PIX`
- [ ] Exclui `CANCELADO`
- [ ] Inclui `PENDENTE` com score penalizado
- [ ] Expande busca além do período do PDF (−36h / +72h)

### Matching

- [ ] Valor diferente nunca casa
- [ ] Valor igual + único candidato + janela → LOCALIZADO
- [ ] Dois pedidos mesmo valor mesmo dia sem nome → REVISAR (não auto)
- [ ] Pedido lançado depois do PIX (até 36h) pode casar
- [ ] Pedido lançado antes do PIX (até 72h) pode casar
- [ ] Fora da janela → não auto-casa
- [ ] `nomePix` vazio usa `clienteNome`
- [ ] Split mesmo pagador mesmo dia (soma = payment) → LOCALIZADO médio ou REVISAR
- [ ] Cada linha e cada payment casam no máximo uma vez
- [ ] Pix Enviado nunca entra em matched

### Relatório

- [ ] Totais extrato vs casado vs sobras batem (soma)
- [ ] PDF lista as 4 categorias
- [ ] Texto resumo coerente com as tabelas (sem match inventado)
- [ ] Usa `gpt-4o` só na narrativa; matching não depende do LLM

### UX / segurança

- [ ] Upload com limite de tamanho/páginas
- [ ] Guarda arquivo original + resultado (auditoria)
- [ ] Só roles admin/gerente (alinhar ao PDV)
- [ ] Não altera status do pedido no MVP

### Cartão / Liberação (etapa 2 — implementado)

- [x] Parser Mercado Pago (Pix + Liberação)
- [x] Match liberação × DEBITO/CREDITO por líquido / bruto / maquininha
- [x] Lote: soma de liquidos = liberação
- [x] Janela cartão: −48h / +30 dias

### Fora de escopo (ainda)

- [ ] Fuzzy de valor ± R$ 0,01
- [ ] Auto 1 PIX = N pedidos
- [ ] Dinheiro / desconto em folha no extrato bancário
- [ ] Extrato MP detalhado por NSU (quando houver)

---

## 10. Casos de teste mínimos

| # | Cenário | Esperado |
|---|---------|----------|
| T1 | 1 PIX R$ 315, 1 payment R$ 315, mesmo dia, nomes parecidos | LOCALIZADO high |
| T2 | 1 PIX R$ 315, 2 payments R$ 315 no dia, nomes fracos | REVISAR |
| T3 | PIX 10:00; pedido createdAt +5h mesmo valor | LOCALIZADO |
| T4 | Pedido dia 1; PIX dia 2 (+30h), valor único | LOCALIZADO medium/high |
| T5 | PIX dia 1; pedido só no dia 3 (+48h após), valor único | LOCALIZADO se ≤72h |
| T6 | PIX Enviado −2000 | ignorado |
| T7 | Dois PIX 315+20 mesmo nome; payment 335 | LOCALIZADO split |
| T8 | PIX sem pedido correspondente | onlyExtract |
| T9 | Payment PIX sem linha | onlyPdv |
| T10 | Narrativa LLM não cita pedido inexistente | ok |

---

## 11. Ordem de implementação

1. Parser `infinitepay` + testes com PDF exemplo  
2. `loadPdvPixPayments` + score + passadas 1–2  
3. Endpoint `financeiro.reconcile` + persistência  
4. UI Financeiro  
5. PDF + narrativa `gpt-4o`  
6. Depois: parser Mercado Pago  

---

## 12. Evolução (pós-MVP)

- Gravar NSU / E2E / hora do PIX no checkout  
- CSV/OFX InfinitePay se existir  
- Confirmação manual na UI (promove REVISAR → LOCALIZADO)  
- Alerta semanal de só-PDV sem match  

*Spec alinhada ao schema atual (`nomePix`, `clienteNome`, `createdAt`, enum PIX) e ao layout InfinitePay analisado em 2026-07.*
