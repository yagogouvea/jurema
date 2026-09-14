import { describe, expect, it } from "vitest";
import { collectReceiptBase64, decodePaymentReceipt, OrderPaymentSchema } from "./pdvOrderPaymentSchema";

const base = {
  valor: 100,
  taxa: 0,
  valorLiquido: 100,
};

describe("OrderPaymentSchema", () => {
  it("exige comprovante em PIX, débito e crédito", () => {
    for (const formaPagamento of ["PIX", "DEBITO", "CREDITO"] as const) {
      const r = OrderPaymentSchema.safeParse({ ...base, formaPagamento });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("comprovanteBase64"))).toBe(true);
      }
    }
  });

  it("aceita PIX com comprovante e sem titular/obs", () => {
    const r = OrderPaymentSchema.safeParse({
      ...base,
      formaPagamento: "PIX",
      comprovanteBase64: "abc123",
    });
    expect(r.success).toBe(true);
  });

  it("aceita PIX com dois comprovantes (PIX picado)", () => {
    const r = OrderPaymentSchema.safeParse({
      ...base,
      formaPagamento: "PIX",
      comprovantesBase64: ["foto1", "foto2"],
    });
    expect(r.success).toBe(true);
    expect(collectReceiptBase64(r.success ? r.data : {})).toEqual(["foto1", "foto2"]);
  });

  it("aceita dinheiro e desconto em folha sem comprovante", () => {
    expect(OrderPaymentSchema.safeParse({ ...base, formaPagamento: "DINHEIRO" }).success).toBe(true);
    expect(OrderPaymentSchema.safeParse({ ...base, formaPagamento: "DESCONTO_FOLHA" }).success).toBe(true);
  });
});

describe("decodePaymentReceipt", () => {
  it("rejeita buffer que não é imagem", () => {
    expect(() => decodePaymentReceipt(Buffer.from("nao-e-foto").toString("base64"))).toThrow(
      /inválida|JPEG, PNG ou WebP/
    );
    const garbage = Buffer.alloc(300, 0x41).toString("base64");
    expect(() => decodePaymentReceipt(garbage)).toThrow(/JPEG, PNG ou WebP/);
  });
});
