import mysql from "mysql2/promise";

/**
 * Garante colunas para armazenar a mídia do WhatsApp diretamente em MySQL (LONGBLOB).
 * Solução independente do storage Manus — usada quando BUILT_IN_FORGE_API_URL/KEY não estão configurados.
 */
const REQUIRED_COLUMNS: Array<{ name: string; ddl: string }> = [
  {
    name: "mediaBlob",
    ddl: "ALTER TABLE `wa_messages` ADD COLUMN `mediaBlob` LONGBLOB NULL AFTER `mediaStorageKey`",
  },
  {
    name: "mediaMimeType",
    ddl: "ALTER TABLE `wa_messages` ADD COLUMN `mediaMimeType` VARCHAR(120) NULL AFTER `mediaBlob`",
  },
  {
    name: "mediaSizeBytes",
    ddl: "ALTER TABLE `wa_messages` ADD COLUMN `mediaSizeBytes` INT NULL AFTER `mediaMimeType`",
  },
];

export async function runWaMediaBlobMigration(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn("[wa-media-blob migration] DATABASE_URL ausente, pulando.");
    return;
  }

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(url);
    const [tableRows] = await conn.execute("SHOW TABLES LIKE 'wa_messages'");
    if (!(tableRows as any[]).length) {
      return;
    }

    const [colsRaw] = await conn.execute("SHOW COLUMNS FROM `wa_messages`");
    const existing = new Set(
      (colsRaw as any[]).map((c) => String(c.Field ?? c.field ?? "").toLowerCase())
    );

    for (const col of REQUIRED_COLUMNS) {
      if (existing.has(col.name.toLowerCase())) continue;
      try {
        await conn.execute(col.ddl);
        console.log(`[wa-media-blob migration] Coluna ${col.name} adicionada em wa_messages.`);
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? "");
        if (/duplicate column/i.test(msg) || /already exists/i.test(msg)) {
          continue;
        }
        console.error(`[wa-media-blob migration] Falha ao adicionar ${col.name}:`, e);
      }
    }
  } catch (err) {
    console.error("[wa-media-blob migration] Erro inesperado:", err);
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch {
        /* ignore */
      }
    }
  }
}
