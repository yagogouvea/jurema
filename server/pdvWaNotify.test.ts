import { describe, expect, it } from "vitest";
import { receiptNotifyCaption } from "./pdvWaNotify";

describe("receiptNotifyCaption", () => {
  it("identifica o pedido e a forma no caption da foto", () => {
    expect(receiptNotifyCaption("PED-123", "PIX", 1, 1)).toBe("Comprovante PIX · PED-123");
    expect(receiptNotifyCaption("PED-123", "PIX", 2, 2)).toBe("Comprovante PIX (2/2) · PED-123");
  });
});
