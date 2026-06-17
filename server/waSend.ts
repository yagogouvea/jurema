/**
 * waSend.ts
 * Envio de texto avulso via wa-bridge (microserviço Baileys), sem precisar de
 * uma conversa (wa_conversations) existente.
 *
 * Usado, por exemplo, para notificar a loja por WhatsApp quando um pedido é
 * criado no PDV.
 *
 * Requer as variáveis de ambiente:
 *  - WA_BRIDGE_URL      → URL base do microserviço (ex: https://wa-bridge.up.railway.app)
 *  - WA_BRIDGE_API_KEY  → chave enviada no header x-wa-bridge-key
 *
 * E uma sessão (instância) conectada no wa-bridge para enviar a partir dela.
 */

import type { Connection } from "mysql2/promise";

/** Converte um telefone (qualquer formato) no JID do WhatsApp. */
export function phoneToJid(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

/**
 * Envia uma mensagem de texto via wa-bridge.
 * Lança erro se a bridge responder status != 2xx. Silencioso (apenas log) se
 * WA_BRIDGE_URL não estiver configurado.
 */
export async function sendWaBridgeText(
  instanceId: number,
  remoteJid: string,
  content: string
): Promise<boolean> {
  const bridgeUrl = process.env.WA_BRIDGE_URL;
  const bridgeKey = process.env.WA_BRIDGE_API_KEY;

  if (!bridgeUrl) {
    console.log(
      `[waSend] WA_BRIDGE_URL não configurado — mensagem não enviada (instanceId=${instanceId}, jid=${remoteJid})`
    );
    return false;
  }

  const res = await fetch(`${bridgeUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wa-bridge-key": bridgeKey ?? "",
    },
    body: JSON.stringify({ instanceId, remoteJid, content }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`wa-bridge respondeu ${res.status}: ${text.substring(0, 200)}`);
  }
  return true;
}

/**
 * Consulta o status real do wa-bridge e retorna o slot de uma sessão conectada.
 * Esta é a fonte de verdade (a tabela wa_instances costuma estar desatualizada
 * ou mal configurada). Retorna o slot numérico conectado ou null.
 */
export async function resolveConnectedSlotFromBridge(): Promise<number | null> {
  const bridgeUrl = process.env.WA_BRIDGE_URL;
  const bridgeKey = process.env.WA_BRIDGE_API_KEY;
  if (!bridgeUrl) return null;
  try {
    const res = await fetch(`${bridgeUrl}/status`, {
      headers: { "x-wa-bridge-key": bridgeKey ?? "" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sessions?: any[] };
    const sessions = data?.sessions ?? [];
    const connected = sessions.find((s) => String(s?.status).toLowerCase() === "connected");
    if (!connected) return null;
    const slot = parseInt(`${connected.instanceId}`.trim(), 10);
    return Number.isFinite(slot) ? slot : null;
  } catch {
    return null;
  }
}

/**
 * Descobre qual slot de instância usar para ENVIAR.
 * 1) Prioriza o status REAL do wa-bridge (sessão conectada).
 * 2) Cai para a tabela wa_instances (apenas instanceId numérico).
 * Retorna o número do slot ou null.
 */
export async function resolveSenderInstanceSlot(db: Connection): Promise<number | null> {
  const fromBridge = await resolveConnectedSlotFromBridge();
  if (fromBridge !== null) return fromBridge;

  // Fallback: tabela wa_instances (só aceita instanceId puramente numérico).
  const [rows] = await db.execute(
    `SELECT instanceId FROM wa_instances
      WHERE active = 1 AND instanceId REGEXP '^[0-9]+$'
      ORDER BY (status = 'connected') DESC, id ASC
      LIMIT 1`
  );
  const raw = (rows as any[])[0]?.instanceId;
  if (raw === undefined || raw === null || `${raw}`.trim() === "") return null;
  const slot = parseInt(`${raw}`.trim(), 10);
  return Number.isFinite(slot) ? slot : null;
}
