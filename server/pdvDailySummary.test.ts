import { describe, expect, it } from "vitest";
import {
  buildDailySummaryMessage,
  buildOrderCancelledNotice,
  cancelledObservation,
  type DailySummaryStats,
} from "./pdvDailySummary";

const baseStats: DailySummaryStats = {
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
  cancelados: 0,
  faturamentoCancelado: 0,
  cancelledOrders: [],
  faturamentoLoja: 8450,
};

describe("pdvDailySummary", () => {
  it("inclui faturamento do mês e não menciona fechamento pendente", () => {
    const msg = buildDailySummaryMessage(baseStats);
    expect(msg).toContain("Faturamento do mês");
    expect(msg).toContain("125000,00");
    expect(msg).toContain("Pedidos no mês: 180");
    expect(msg.toLowerCase()).not.toContain("fechamento");
    expect(msg.toLowerCase()).not.toContain("pendente");
    expect(msg).toContain("Caixa: saldo");
    expect(msg.toLowerCase()).not.toContain("obs.");
  });

  it("coloca cancelados só como observação, no fim", () => {
    const msg = buildDailySummaryMessage({
      ...baseStats,
      cancelados: 1,
      faturamentoCancelado: 350,
      cancelledOrders: [{ pedidoId: "PED-88", sellerName: "GABRIEL", totalAplicado: 350 }],
    });
    expect(msg).toContain("Obs.: 1 pedido cancelado");
    expect(msg).toContain("PED-88");
    expect(msg).toContain("já descontado");
    expect(msg.indexOf("Obs.:")).toBeGreaterThan(msg.indexOf("Caixa:"));
  });

  it("mostra Sofia/serviços quando o recebido é maior que a loja", () => {
    const msg = buildDailySummaryMessage({
      ...baseStats,
      faturamento: 9680,
      faturamentoLoja: 8450,
    });
    expect(msg).toContain("Faturamento do dia:");
    expect(msg).toContain("9680,00");
    expect(msg).toContain("Sofia/serviços");
    expect(msg).toContain("1230,00");
  });
});

describe("cancelledObservation", () => {
  it("some quando não há cancelado", () => {
    expect(cancelledObservation([])).toBeNull();
  });

  it("lista os pedidos e o valor já descontado", () => {
    const obs = cancelledObservation([
      { pedidoId: "PED-1", sellerName: "GABRIEL", totalAplicado: 200 },
      { pedidoId: "PED-2", sellerName: "MURILO", totalAplicado: 150 },
    ]);
    expect(obs).toContain("2 pedidos cancelados");
    expect(obs).toContain("PED-1");
    expect(obs).toContain("350,00");
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
