import { describe, expect, it } from "vitest";
import {
  WA_MAX_SLOTS,
  defaultInstanceName,
  findInstanceForConversation,
  guessSlotFromLegacyId,
  instanceSlotOf,
  isValidBridgeSlot,
  parseBridgeSlot,
} from "@shared/waInstanceSlots";

describe("waInstanceSlots", () => {
  it("aceita slots 1 a 5 e rejeita o resto", () => {
    expect(WA_MAX_SLOTS).toBe(5);
    expect(parseBridgeSlot("1")).toBe(1);
    expect(parseBridgeSlot("5")).toBe(5);
    expect(parseBridgeSlot("6")).toBeNull();
    expect(parseBridgeSlot("jurema-2")).toBeNull();
    expect(isValidBridgeSlot("3")).toBe(true);
    expect(isValidBridgeSlot("jurema-3")).toBe(false);
  });

  it("recupera slot de IDs legados inválidos", () => {
    expect(guessSlotFromLegacyId("jurema-2")).toBe(2);
    expect(guessSlotFromLegacyId("instancia_3")).toBe(3);
    expect(guessSlotFromLegacyId("x", 4)).toBe(4);
    expect(guessSlotFromLegacyId("jurema-9")).toBeNull();
  });

  it("usa o slot do bridge para filtrar e nomear no painel", () => {
    const instances = [
      { id: 10, instanceId: "2", name: "Atacado" },
      { id: 11, instanceId: "1", name: "Varejo" },
    ];
    expect(instanceSlotOf(instances[0])).toBe(2);
    expect(findInstanceForConversation(instances, 2)?.name).toBe("Atacado");
    expect(findInstanceForConversation(instances, 10)?.name).toBe("Atacado");
    expect(defaultInstanceName(5)).toBe("Instância 5");
  });
});
