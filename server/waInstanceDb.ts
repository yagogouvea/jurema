import type { Connection } from "mysql2/promise";
import {
  WA_MAX_SLOTS,
  WA_PLACEHOLDER_PHONE,
  defaultInstanceName,
  guessSlotFromLegacyId,
  parseBridgeSlot,
} from "@shared/waInstanceSlots";

export { WA_MAX_SLOTS, defaultInstanceName, parseBridgeSlot, guessSlotFromLegacyId };

export async function resolveConversationInstanceIds(
  db: Connection,
  inputId: number
): Promise<number[]> {
  const ids = new Set<number>([inputId]);
  const [rows] = (await db.execute(
    "SELECT id, instanceId FROM wa_instances WHERE id=? OR instanceId=?",
    [inputId, String(inputId)]
  )) as any;
  for (const row of rows as Array<{ id: number; instanceId?: string | null }>) {
    ids.add(Number(row.id));
    const slot = parseBridgeSlot(row.instanceId);
    if (slot) ids.add(slot);
  }
  return Array.from(ids).filter((n) => Number.isInteger(n) && n > 0);
}

/** PK da linha em wa_instances / wa_ai_config a partir do slot do webhook ou do próprio PK. */
export async function resolveAiConfigPk(db: Connection, rawId: number): Promise<number> {
  const [rows] = (await db.execute(
    `SELECT id FROM wa_instances
     WHERE id=? OR instanceId=?
     ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END
     LIMIT 1`,
    [rawId, String(rawId), rawId]
  )) as any;
  const pk = Number(rows?.[0]?.id);
  return Number.isInteger(pk) && pk > 0 ? pk : rawId;
}

export async function ensureInstanceSlots(db: Connection): Promise<void> {
  const [rows] = (await db.execute(
    "SELECT id, name, instanceId FROM wa_instances"
  )) as any;
  const used = new Set<number>();

  for (const row of rows as Array<{ id: number; name: string; instanceId?: string | null }>) {
    const slot = parseBridgeSlot(row.instanceId);
    if (slot) used.add(slot);
  }

  for (const row of rows as Array<{ id: number; name: string; instanceId?: string | null }>) {
    if (parseBridgeSlot(row.instanceId)) continue;
    const guessed = guessSlotFromLegacyId(row.instanceId, row.id);
    if (guessed && !used.has(guessed)) {
      await db.execute("UPDATE wa_instances SET instanceId=? WHERE id=?", [String(guessed), row.id]);
      used.add(guessed);
    }
  }

  for (let slot = 1; slot <= WA_MAX_SLOTS; slot++) {
    if (used.has(slot)) continue;
    await db.execute(
      "INSERT INTO wa_instances (name, phone, instanceId, status, active) VALUES (?,?,?,?,?)",
      [defaultInstanceName(slot), WA_PLACEHOLDER_PHONE, String(slot), "disconnected", true]
    );
    used.add(slot);
  }
}

export async function syncNameToBridge(slot: number, name: string): Promise<void> {
  const bridgeUrl = process.env.WA_BRIDGE_URL;
  const bridgeKey = process.env.WA_BRIDGE_API_KEY;
  if (!bridgeUrl) return;
  try {
    await fetch(`${bridgeUrl.replace(/\/$/, "")}/instances/${slot}/name`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-wa-bridge-key": bridgeKey ?? "",
      },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    console.warn(`[wa] falha ao sincronizar nome da instância ${slot}:`, e);
  }
}
