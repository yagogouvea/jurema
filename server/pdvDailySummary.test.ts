import { describe, expect, it } from "vitest";
import {
  buildDailySummaryMessage,
  buildOrderCancelledNotice,
  cancelledStatusLine,
  type DailySummaryStats,
} from "./pdvDailySummary";

describe("pdvDailySummary", () => {
  it("inclui faturamento do mês e não menciona fechamento pendente", () => {
    const stats: DailySummaryStats = {
      dia: "2026-08-10",
      totalPedidos: 12,
      faturamento: 8450,
      ticketMedio: 704.17,
      faturamentoAtacado: 6000,
      faturamentoVarejo: 2450,
      faturamentoBalcao: 5000,
      faturamentoWhatsapp: 3450,
      faturamentoMes: 125000,
      pedidosMes: 180,
      pontosDia: 28,
      bySeller: [
        { sellerName: "GABRIEL", pedidos: 5, faturamento: 4000 },
        { sellerName: "MURILO", pedidos: 4, faturamento: 3000 },
      ],
      byPayment: [
        { formaPagamento: "PIX", total: 7000 },
        { formaPagamento: "DEBITO", total: 1550 },
      ],
      suprimentosHoje: 200,
      sangriasHoje: 100,
      saldoCaixa: 2340,
      cancelados: 1,
      faturamentoCancelado: 350,
    };

    const msg = buildDailySummaryMessage(stats);
    expect(msg).toContain("Faturamento do mês");
    expect(msg).toContain("125000,00");
    expect(msg).toContain("Pedidos no mês: 180");
    expect(msg.toLowerCase()).not.toContain("fechamento");
    expect(msg.toLowerCase()).not.toContain("pendente");
    expect(msg).toContain("Caixa: saldo");
    expect(msg).toContain("Cancelados");
    expect(msg).toContain("350,00");
    expect(msg).toContain("fora do total");
  });
});

describe("cancelledStatusLine", () => {
  it("some quando não há cancelado", () => {
    expect(cancelledStatusLine(0, 0)).toBeNull();
  });

  it("mostra o valor fora do total", () => {
    expect(cancelledStatusLine(1, 200)).toContain("fora do total");
    expect(cancelledStatusLine(2, 400)).toContain("2 pedidos");
  });
});

describe("buildOrderCancelledNotice", () => {
  it("deixa claro que o valor saiu do faturamento", () => {
    const msg = buildOrderCancelledNotice({
      pedidoId: "PED-9",
      sellerName: "GABRIEL",
      totalAplicado: 180,
    });
    expect(msg).toContain("PED-9");
    expect(msg).toContain("não entra");
    expect(msg).toContain("180,00");
  });
});
