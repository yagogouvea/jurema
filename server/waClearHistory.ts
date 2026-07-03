import type { Connection } from "mysql2/promise";

export type WaClearHistoryResult = {
  before: { wa_conversations: number; wa_messages: number; wa_ai_logs: number };
  deleted: { wa_ai_logs: number; wa_messages: number; wa_conversations: number };
};

async function countTable(db: Connection, table: string): Promise<number> {
  const [rows] = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number((rows as { n: number }[])[0]?.n ?? 0);
}

/** Apaga todo o histórico de conversas do WhatsApp IA (mantém instâncias, config IA, respostas rápidas). */
export async function clearAllWaConversationHistory(db: Connection): Promise<WaClearHistoryResult> {
  const before = {
    wa_conversations: await countTable(db, "wa_conversations"),
    wa_messages: await countTable(db, "wa_messages"),
    wa_ai_logs: await countTable(db, "wa_ai_logs"),
  };

  const [rLogs] = await db.execute("DELETE FROM wa_ai_logs");
  const [rMsgs] = await db.execute("DELETE FROM wa_messages");
  const [rConvs] = await db.execute("DELETE FROM wa_conversations");

  for (const table of ["wa_ai_logs", "wa_messages", "wa_conversations"]) {
    try {
      await db.execute(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
    } catch {
      // não crítico
    }
  }

  return {
    before,
    deleted: {
      wa_ai_logs: Number((rLogs as { affectedRows?: number }).affectedRows ?? 0),
      wa_messages: Number((rMsgs as { affectedRows?: number }).affectedRows ?? 0),
      wa_conversations: Number((rConvs as { affectedRows?: number }).affectedRows ?? 0),
    },
  };
}
