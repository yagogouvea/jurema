import { describe, expect, it } from "vitest";
import { reconcileCardLiberations, type PdvCardPayment } from "./matchCardLiberations";
import { normalizeName } from "./normalize";
import type { ExtractLine } from "./types";

function liberacao(amountCents: number, date: string, id = "lib1"): ExtractLine {
  return {
    id,
    source: "mercado_pago",
    date,
    time: "12:00",
    datetimeIso: `${date}T12:00:00-03:00`,
    type: "PIX",
    direction: "in",
    payerNameRaw: `Liberação de dinheiro (#${id})`,
    payerNameNorm: normalizeName("Liberação de dinheiro"),
    amountCents,
    page: 1,
    operationId: id,
    kindLabel: "liberacao",
  };
}

function card(
  partial: Partial<PdvCardPayment> &
    Pick<PdvCardPayment, "paymentId" | "pedidoId" | "valorCents" | "pedidoCreatedAt">
): PdvCardPayment {
  const taxa = partial.taxaCents ?? Math.round(partial.valorCents * 0.03);
  const liquido = partial.valorLiquidoCents ?? partial.valorCents - taxa;
  return {
    status: "PAGO",
    clienteNome: null,
    nomePix: null,
    obsPagamento: null,
    formaPagamento: "DEBITO",
    taxaCents: taxa,
    valorLiquidoCents: liquido,
    valorMaquininhaCents: partial.valorCents + taxa,
    paymentCreatedAt: partial.pedidoCreatedAt,
    ...partial,
  };
}

describe("reconcileCardLiberations", () => {
  it("casa 1:1 por valor líquido", () => {
    // líquido = 9700 se valor 10000 taxa 3% → wait 10000*0.03=300, liquido=9700
    const liberacoes = [liberacao(9700, "2026-05-07")];
    const cards = [
      card({
        paymentId: 1,
        pedidoId: "PED-CARD-1",
        valorCents: 10000,
        taxaCents: 300,
        valorLiquidoCents: 9700,
        formaPagamento: "DEBITO",
        pedidoCreatedAt: new Date("2026-05-06T15:00:00-03:00"),
      }),
    ];
    const r = reconcileCardLiberations({ liberacoes, cardPayments: cards });
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].kind).toBe("card_1:1");
    expect(r.matched[0].payment.matchBasis).toBe("liquido");
    expect(r.onlyExtract).toHaveLength(0);
    expect(r.onlyPdv).toHaveLength(0);
  });

  it("casa lote: soma de liquidos = liberação", () => {
    const liberacoes = [liberacao(15000, "2026-05-10")];
    const cards = [
      card({
        paymentId: 1,
        pedidoId: "PED-A",
        valorCents: 10000,
        taxaCents: 300,
        valorLiquidoCents: 9700,
        pedidoCreatedAt: new Date("2026-05-08T10:00:00-03:00"),
      }),
      card({
        paymentId: 2,
        pedidoId: "PED-B",
        valorCents: 5500,
        taxaCents: 200,
        valorLiquidoCents: 5300,
        pedidoCreatedAt: new Date("2026-05-09T11:00:00-03:00"),
      }),
    ];
    // 9700+5300 = 15000
    const r = reconcileCardLiberations({ liberacoes, cardPayments: cards });
    expect(r.matched.some((m) => m.kind === "card_lote")).toBe(true);
    expect(r.matched[0].relatedPayments?.length).toBe(1);
  });

  it("empate de dois cartões com mesmo líquido → revisar", () => {
    const liberacoes = [liberacao(9700, "2026-05-07")];
    const cards = [
      card({
        paymentId: 1,
        pedidoId: "PED-1",
        valorCents: 10000,
        taxaCents: 300,
        valorLiquidoCents: 9700,
        pedidoCreatedAt: new Date("2026-05-06T10:00:00-03:00"),
      }),
      card({
        paymentId: 2,
        pedidoId: "PED-2",
        valorCents: 10000,
        taxaCents: 300,
        valorLiquidoCents: 9700,
        pedidoCreatedAt: new Date("2026-05-06T11:00:00-03:00"),
      }),
    ];
    const r = reconcileCardLiberations({ liberacoes, cardPayments: cards });
    expect(r.matched).toHaveLength(0);
    expect(r.review.length).toBeGreaterThanOrEqual(1);
  });

  it("fora da janela de 30 dias não casa", () => {
    const liberacoes = [liberacao(9700, "2026-07-01")];
    const cards = [
      card({
        paymentId: 1,
        pedidoId: "PED-OLD",
        valorCents: 10000,
        taxaCents: 300,
        valorLiquidoCents: 9700,
        pedidoCreatedAt: new Date("2026-05-01T10:00:00-03:00"),
      }),
    ];
    const r = reconcileCardLiberations({ liberacoes, cardPayments: cards });
    expect(r.matched).toHaveLength(0);
    expect(r.onlyExtract).toHaveLength(1);
    expect(r.onlyPdv).toHaveLength(1);
  });
});
