import { describe, expect, it } from "vitest";
import {
  buildOrderNotificationMessage,
  receiptNotifyCaption,
  receiptStatusLine,
  sofiaPhotoCaption,
  sofiaPhotoStatusLine,
} from "./pdvWaNotify";

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

  it("não menciona foto Sofia em pedido sem peça de fora", () => {
    expect(buildOrderNotificationMessage({ ...base, sofiaPhotoCount: 0 })).not.toContain("peça Sofia");
  });

  it("menciona foto Sofia quando o pedido tem peça de fora", () => {
    const withSofia = {
      ...base,
      sofiaPhotoCount: 1,
      input: {
        ...base.input,
        items: [{ time: "Palmeiras", descricao: "home", tamanho: "M", quantidade: 1, precoUnitario: 100, isSofia: true }],
      },
    };
    expect(buildOrderNotificationMessage(withSofia)).toContain("Foto da peça Sofia anexada");
  });

  it("inclui observações do pedido mesmo quando está pago", () => {
    const msg = buildOrderNotificationMessage({
      ...base,
      input: {
        ...base.input,
        justificativa: "Sem internet, não deu para tirar foto do comprovante",
      },
    });
    expect(msg).toContain("Observações");
    expect(msg).toContain("Sem internet, não deu para tirar foto do comprovante");
  });

  it("não mostra bloco de observações se o campo estiver vazio", () => {
    expect(buildOrderNotificationMessage(base)).not.toContain("Observações");
  });
});

describe("sofiaPhotoCaption", () => {
  it("identifica o pedido na foto da peça", () => {
    expect(sofiaPhotoCaption("PED-9")).toBe("Foto da peça Sofia · PED-9");
  });
});

describe("sofiaPhotoStatusLine", () => {
  it("não aparece sem item Sofia", () => {
    expect(sofiaPhotoStatusLine(false, false)).toBeNull();
  });

  it("avisa quando falta a foto", () => {
    expect(sofiaPhotoStatusLine(true, false)).toContain("Sem foto da peça Sofia");
  });

  it("avisa quando a foto foi anexada", () => {
    expect(sofiaPhotoStatusLine(true, true)).toContain("Foto da peça Sofia anexada");
  });
});
