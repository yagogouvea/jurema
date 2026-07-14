import { describe, expect, it } from "vitest";
import { parseInfinitePayText } from "./infinitePayParser";
import { ensurePeriodFromLines } from "./parseExtrato";
import { reconcileExtractToPayments, scoreMatch, withinWindow } from "./matchReconcile";
import { bestNameScore, normalizeName, parseBrlAmountToCents, toCents } from "./normalize";
import type { ExtractLine, PdvPixPayment } from "./types";
import { DEFAULT_TOLERANCE } from "./types";

const SAMPLE = `
Relatório de movimentações
OBSTINADA INTERMEDIACAO & AGENCIAMENTO DE SERVICOS LTDA - CNPJ: 55.819.723/0001-09
CLOUDWALK - 0001 - 27244528-6
01 Jul, 2026 - 02 Jul, 2026
05:50
Pix
Pix GIL MARCOS DE OLIVEIRA BARBOSA CRUZ
Recebido
+180,00
06:27
Pix
Pix 56.119.430 DEIVID DOS SANTOS PIZELLI
Recebido
+315,00
06:54
Pix
Pix Victor Sidnei Sena da Silva
Enviado
-360,00
08:23
Pix
Pix RAFAELA BARBARA DE AZEVEDO
Recebido
+315,00
08:26
Pix
Pix RAFAELA BARBARA DE AZEVEDO
Recebido
+20,00
01 Jul, 2026
Página 1 de 1
`;

function line(
  partial: Partial<ExtractLine> & Pick<ExtractLine, "id" | "date" | "time" | "amountCents" | "payerNameRaw">
): ExtractLine {
  const payerNameNorm = normalizeName(partial.payerNameRaw);
  return {
    source: "infinitepay",
    datetimeIso: `${partial.date}T${partial.time}:00-03:00`,
    type: "PIX",
    direction: "in",
    payerNameNorm,
    page: 1,
    ...partial,
  };
}

function pay(partial: Partial<PdvPixPayment> & Pick<PdvPixPayment, "paymentId" | "pedidoId" | "valorCents" | "pedidoCreatedAt">): PdvPixPayment {
  return {
    status: "PAGO",
    clienteNome: null,
    nomePix: null,
    paymentCreatedAt: partial.pedidoCreatedAt,
    ...partial,
  };
}

describe("normalize", () => {
  it("parseia valores BR", () => {
    expect(parseBrlAmountToCents("+1.565,00")).toBe(156500);
    expect(parseBrlAmountToCents("-360,00")).toBe(-36000);
    expect(toCents("315.00")).toBe(31500);
  });

  it("normaliza nome com CNPJ", () => {
    expect(normalizeName("Pix 56.119.430 DEIVID DOS SANTOS PIZELLI")).toContain("DEIVID");
    expect(normalizeName("Pix 56.119.430 DEIVID DOS SANTOS PIZELLI")).not.toMatch(/56119430/);
  });

  it("compara nomes parciais", () => {
    expect(bestNameScore("IGOR LEITE TROMBELA", "Igor Leite", null)).toBeGreaterThanOrEqual(0.55);
  });
});

describe("infinitePayParser", () => {
  it("extrai só Pix Recebido e período", () => {
    const parsed = parseInfinitePayText(SAMPLE);
    expect(parsed.period).toEqual({ start: "2026-07-01", end: "2026-07-02" });
    expect(parsed.lines.every((l) => l.direction === "in")).toBe(true);
    expect(parsed.ignoredOutCount).toBe(1);
    expect(parsed.lines.find((l) => l.amountCents === 18000)?.payerNameNorm).toContain("GIL");
    expect(parsed.lines.filter((l) => l.amountCents === 31500).length).toBe(2);
    // Rafaela 315 + 20
    expect(parsed.lines.some((l) => l.amountCents === 2000)).toBe(true);
  });

  it("deriva período pelas datas dos lançamentos se cabeçalho faltar", () => {
    const parsed = parseInfinitePayText(SAMPLE);
    const withoutHeader = ensurePeriodFromLines({
      ...parsed,
      period: null,
      ignoredOtherCount: 0,
    });
    expect(withoutHeader.period).toEqual({ start: "2026-07-01", end: "2026-07-01" });
  });

  it("extrai formato colapsado do unpdf (uma linha por Pix)", () => {
    const collapsed = `
Relatório de movimentações CLOUDWALK - 0001 - 27244528-6
01 Jul, 2026 - 02 Jul, 2026
Data Hora Tipo de transação Nome Detalhe Valor (R$)
05:50 Pix Pix GIL MARCOS DE OLIVEIRA BARBOSA CRUZ Recebido +180,00
06:27 Pix Pix 56.119.430 DEIVID DOS SANTOS PIZELLI Recebido +315,00
06:54 Pix Pix Victor Sidnei Sena da Silva Enviado -360,00
01 Jul, 2026
Página 1 de 1
`;
    const parsed = parseInfinitePayText(collapsed);
    expect(parsed.lines.length).toBe(2);
    expect(parsed.ignoredOutCount).toBe(1);
    expect(parsed.lines[0].amountCents).toBe(18000);
    expect(parsed.lines[0].date).toBe("2026-07-01");
  });
});

describe("match", () => {
  it("T1: valor + mesmo dia + nome → high", () => {
    const lines = [
      line({
        id: "a",
        date: "2026-07-01",
        time: "06:27",
        amountCents: 31500,
        payerNameRaw: "DEIVID DOS SANTOS PIZELLI",
      }),
    ];
    const payments = [
      pay({
        paymentId: 1,
        pedidoId: "PED-1",
        valorCents: 31500,
        nomePix: "Deivid dos Santos",
        pedidoCreatedAt: new Date("2026-07-01T09:30:00-03:00"),
      }),
    ];
    const r = reconcileExtractToPayments({
      source: "infinitepay",
      period: { start: "2026-07-01", end: "2026-07-01" },
      accountLabel: null,
      lines,
      payments,
    });
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].confidence).toBe("high");
    expect(r.onlyExtract).toHaveLength(0);
    expect(r.onlyPdv).toHaveLength(0);
  });

  it("T2: dois pedidos mesmo valor → revisar", () => {
    const lines = [
      line({
        id: "a",
        date: "2026-07-01",
        time: "10:00",
        amountCents: 31500,
        payerNameRaw: "DESCONHECIDO X",
      }),
    ];
    const payments = [
      pay({
        paymentId: 1,
        pedidoId: "PED-1",
        valorCents: 31500,
        clienteNome: "Cliente A",
        pedidoCreatedAt: new Date("2026-07-01T11:00:00-03:00"),
      }),
      pay({
        paymentId: 2,
        pedidoId: "PED-2",
        valorCents: 31500,
        clienteNome: "Cliente B",
        pedidoCreatedAt: new Date("2026-07-01T12:00:00-03:00"),
      }),
    ];
    const r = reconcileExtractToPayments({
      source: "infinitepay",
      period: null,
      accountLabel: null,
      lines,
      payments,
    });
    expect(r.matched).toHaveLength(0);
    expect(r.review.length).toBeGreaterThanOrEqual(1);
  });

  it("T3: PIX antes do lançamento do pedido (dentro de 36h)", () => {
    const pixAt = new Date("2026-07-01T10:00:00-03:00");
    const pedidoAt = new Date("2026-07-01T15:00:00-03:00");
    expect(withinWindow(pixAt, pedidoAt, DEFAULT_TOLERANCE)).toBe(true);

    const lines = [
      line({
        id: "a",
        date: "2026-07-01",
        time: "10:00",
        amountCents: 50000,
        payerNameRaw: "JOAO SILVA",
      }),
    ];
    const payments = [
      pay({
        paymentId: 1,
        pedidoId: "PED-9",
        valorCents: 50000,
        nomePix: "Joao Silva",
        pedidoCreatedAt: pedidoAt,
      }),
    ];
    const r = reconcileExtractToPayments({
      source: "infinitepay",
      period: null,
      accountLabel: null,
      lines,
      payments,
    });
    expect(r.matched).toHaveLength(1);
  });

  it("T6: Pix Enviado não entra nas lines do parser", () => {
    const parsed = parseInfinitePayText(SAMPLE);
    expect(parsed.lines.every((l) => l.amountCents > 0)).toBe(true);
    expect(parsed.lines.some((l) => l.payerNameRaw.includes("Victor Sidnei"))).toBe(false);
  });

  it("T7: split 315+20 = 335", () => {
    const lines = [
      line({
        id: "1",
        date: "2026-07-01",
        time: "08:23",
        amountCents: 31500,
        payerNameRaw: "RAFAELA BARBARA DE AZEVEDO",
      }),
      line({
        id: "2",
        date: "2026-07-01",
        time: "08:26",
        amountCents: 2000,
        payerNameRaw: "RAFAELA BARBARA DE AZEVEDO",
      }),
    ];
    const payments = [
      pay({
        paymentId: 10,
        pedidoId: "PED-SUM",
        valorCents: 33500,
        nomePix: "Rafaela Barbara",
        pedidoCreatedAt: new Date("2026-07-01T09:00:00-03:00"),
      }),
    ];
    const r = reconcileExtractToPayments({
      source: "infinitepay",
      period: null,
      accountLabel: null,
      lines,
      payments,
    });
    expect(r.matched.some((m) => m.kind === "split")).toBe(true);
    expect(r.matched[0].payment.pedidoId).toBe("PED-SUM");
  });

  it("score bloqueia fora da janela", () => {
    const l = line({
      id: "x",
      date: "2026-07-01",
      time: "10:00",
      amountCents: 10000,
      payerNameRaw: "A",
    });
    const p = pay({
      paymentId: 1,
      pedidoId: "P",
      valorCents: 10000,
      pedidoCreatedAt: new Date("2026-07-10T10:00:00-03:00"),
    });
    expect(scoreMatch(l, p, 0)).toBe(Number.NEGATIVE_INFINITY);
  });
});
