/** Slots do wa-bridge (Baileys). Devem bater com MAX_SESSIONS do microserviço. */
export const WA_MAX_SLOTS = 5;
export const WA_PLACEHOLDER_PHONE = "00000000000";

export function parseBridgeSlot(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > WA_MAX_SLOTS) return null;
  return n;
}

export function isValidBridgeSlot(value: unknown): boolean {
  return parseBridgeSlot(value) != null;
}

/** Extrai slot de IDs legados tipo "jurema-2" ou "instancia_3". */
export function guessSlotFromLegacyId(raw: unknown, fallbackId?: number): number | null {
  const direct = parseBridgeSlot(raw);
  if (direct) return direct;
  const text = String(raw ?? "").trim();
  const match = text.match(/(\d+)/);
  if (match) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n >= 1 && n <= WA_MAX_SLOTS) return n;
  }
  if (fallbackId != null) return parseBridgeSlot(fallbackId);
  return null;
}

export function defaultInstanceName(slot: number): string {
  return `Instância ${slot}`;
}

export function instanceSlotOf(inst: { id?: number; instanceId?: string | number | null }): number {
  const slot = parseBridgeSlot(inst.instanceId);
  if (slot) return slot;
  const idSlot = parseBridgeSlot(inst.id);
  if (idSlot) return idSlot;
  return Number(inst.id) || 0;
}

export function findInstanceForConversation<T extends { id: number; instanceId?: string | number | null }>(
  instances: T[],
  conversationInstanceId: number
): T | undefined {
  return instances.find(
    (inst) =>
      inst.id === conversationInstanceId ||
      parseBridgeSlot(inst.instanceId) === conversationInstanceId
  );
}
