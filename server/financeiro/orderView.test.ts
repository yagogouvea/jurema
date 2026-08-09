import { describe, expect, it } from "vitest";
import {
  buildOrderCentricView,
  filterOnlyPdvToPeriod,
  sheetsLabelForStatus,
} from "./orderView";
import type { OrderSnapshot } from "./types";

describe("orderView", () => {
  it("monta confirmados e dúvidas a partir do core", () => {
    const snap: OrderSnapshot = {
      pedidoId: "PED-1",
      pedidoCreatedAt: "2026-07-01T12:00:00.000Z",
      clienteNome: "Maria",
      clienteTelefone: "11999999999",
      sellerName: "GABRIEL",
      canal: "BALCAO",
      regime: "ATACADO",
      status: "PAGO",
      justificativa: null,
      itemsSummary: "1x Camisa",
    };
    const map = new Map([["PED-1", snap]]);
    const view = buildOrderCentricView(
      {
        matched: [
          {
            kind: "1:1",
            confidence: "high",
            score: 90,
            extract: [
              {
                id: "e1",
                source: "infinitepay",
                date: "2026-07-01",
                time: "10:00",
                datetimeIso: "2026-07-01T10:00:00-03:00",
                type: "PIX",
                direction: "in",
                payerNameRaw: "MARIA SILVA",
                payerNameNorm: "MARIA SILVA",
                amountCents: 10000,
                page: 1,
              },
            ],
            payment: {
              pedidoId: "PED-1",
              paymentId: 9,
              valorCents: 10000,
              nomePix: "Maria",
              clienteNome: "Maria",
              pedidoCreatedAt: snap.pedidoCreatedAt,
              status: "PAGO",
              formaPagamento: "PIX",
            },
          },
        ],
        review: [
          {
            reason: "score_baixo",
            extract: [],
            candidates: [
              {
                paymentId: 10,
                pedidoId: "PED-1",
                score: 40,
                valorCents: 5000,
                clienteNome: "Maria",
                nomePix: null,
              },
            ],
          },
        ],
        onlyPdv: [],
        onlyExtract: [],
      },
      map
    );
    expect(view.ordersConfirmed).toHaveLength(1);
    expect(view.ordersConfirmed[0].order.sellerName).toBe("GABRIEL");
    expect(view.ordersReview).toHaveLength(1);
    expect(view.ordersReview[0].candidates[0].order.itemsSummary).toBe("1x Camisa");
    expect(sheetsLabelForStatus("confirmed")).toBe("Localizado");
    expect(sheetsLabelForStatus("pending")).toBe("Dúvida");
  });

  it("mantém em 'sem extrato' apenas pedidos do período selecionado", () => {
    const onlyPdv = [
      { paymentId: 1, pedidoCreatedAt: "2026-07-06T20:00:00.000Z" }, // 06/07 SP
      { paymentId: 2, pedidoCreatedAt: "2026-07-10T14:00:00.000Z" }, // dentro
      { paymentId: 3, pedidoCreatedAt: "2026-07-16T03:00:00.000Z" }, // 16/07 SP → fora
      { paymentId: 4, pedidoCreatedAt: "2026-07-14T02:30:00.000Z" }, // 13/07 SP → dentro
    ];
    const kept = filterOnlyPdvToPeriod(onlyPdv, "2026-07-07", "2026-07-13");
    expect(kept.map((p) => p.paymentId)).toEqual([2, 4]);
  });

  it("sem período definido não descarta nada", () => {
    const onlyPdv = [{ paymentId: 1, pedidoCreatedAt: "2026-07-06T20:00:00.000Z" }];
    expect(filterOnlyPdvToPeriod(onlyPdv, null, null)).toHaveLength(1);
  });
});
