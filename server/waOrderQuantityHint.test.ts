import { describe, expect, it } from "vitest";
import {
  buildOrderQuantitySystemHint,
  collectTrailingCustomerTextParts,
  joinTrailingCustomerTextMessages,
} from "@shared/waOrderQuantityHint";

describe("buildOrderQuantitySystemHint", () => {
  it("soma duas linhas (4 + 6 = 10) como no WhatsApp multilinha", () => {
    const blob = `4 camisas do brasil azul copa 2026
6 camisas corinthinas laranja`;
    const h = buildOrderQuantitySystemHint(blob);
    expect(h).toBeTruthy();
    expect(h).toContain("10");
    expect(h).toContain("4 + 6");
  });

  it("concatena duas mensagens de texto seguidas do cliente", () => {
    const msgs = [
      { fromMe: true, type: "text", content: "Quantas peças?" },
      { fromMe: false, type: "text", content: "4 camisas brasil" },
      { fromMe: false, type: "text", content: "6 camisas corinthians" },
    ];
    const parts = collectTrailingCustomerTextParts(msgs);
    expect(parts).toEqual(["4 camisas brasil", "6 camisas corinthians"]);
    const h = buildOrderQuantitySystemHint(joinTrailingCustomerTextMessages(parts));
    expect(h).toBeTruthy();
    expect(h).toContain("10");
  });
});
