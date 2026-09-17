import { describe, expect, it } from "vitest";
import { OrderServiceSchema } from "./routers/pdvOrders";

describe("OrderServiceSchema carreto", () => {
  it("bloqueia carreto sem observação", () => {
    const r = OrderServiceSchema.safeParse({ tipo: "CARRETO", valor: 50 });
    expect(r.success).toBe(false);
  });

  it("aceita carreto com quem recebe", () => {
    const r = OrderServiceSchema.safeParse({
      tipo: "CARRETO",
      valor: 50,
      descricao: "João no Cantagalo",
    });
    expect(r.success).toBe(true);
  });

  it("não exige observação em caixinha", () => {
    const r = OrderServiceSchema.safeParse({ tipo: "CAIXINHA", valor: 10 });
    expect(r.success).toBe(true);
  });
});
