import { describe, expect, it } from "vitest";
import { buildOrderNotificationMessage, receiptNotifyCaption, receiptStatusLine } from "./pdvWaNotify";

describe("receiptNotifyCaption", () => {
  it("identifica o pedido e a forma no caption da foto", () => {
    expect(receiptNotifyCaption("PED-123", "PIX", 1, 1)).toBe("Comprovante PIX · PED-123");
    expect(receiptNotifyCaption("PED-123", "PIX", 2, 2)).toBe("Comprovante PIX (2/2) · PED-123");
  });
});

describe("receiptStatusLine", () => {
  it("avisa quando não há comprovante", () => {
    expect(receiptStatusLine(0)).toContain("Sem comprovante anexado");
  });

  it("avisa quando há comprovante", () => {
    expect(receiptStatusLine(2)).toContain("Comprovante anexado");
    expect(receiptStatusLine(2)).toContain("2 fotos");
  });
});

describe("buildOrderNotificationMessage", () => {
  const base = {
    pedidoId: "PED-1",
    sellerName: "Gabriel",
    totalAplicado: 100,
    input: { canal: "BALCAO", regime: "VAREJO", status: "PAGO", payments: [{ formaPagamento: "DINHEIRO", valor: 100 }] },
  };

  it("inclui sem comprovante no texto do pedido", () => {
    expect(buildOrderNotificationMessage({ ...base, receiptCount: 0 })).toContain("Sem comprovante anexado");
  });

  it("inclui comprovante anexado no texto do pedido", () => {
    expect(buildOrderNotificationMessage({ ...base, receiptCount: 1 })).toContain("Comprovante anexado");
  });
});
