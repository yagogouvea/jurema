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
 * Descobre qual slot de instância usar para ENVIAR. Prioriza uma instância
 * conectada; cai para qualquer instância ativa com instanceId definido.
 * Retorna o número do slot (parseInt do wa_instances.instanceId) ou null.
 */
export async function resolveSenderInstanceSlot(db: Connection): Promise<number | null> {
  const [rows] = await db.execute(
    `SELECT instanceId FROM wa_instances
      WHERE active = 1 AND instanceId IS NOT NULL AND instanceId != ''
      ORDER BY (status = 'connected') DESC, id ASC
      LIMIT 1`
  );
  const raw = (rows as any[])[0]?.instanceId;
  if (raw === undefined || raw === null || `${raw}`.trim() === "") return null;
  const slot = parseInt(`${raw}`.trim(), 10);
  return Number.isFinite(slot) ? slot : null;
}
