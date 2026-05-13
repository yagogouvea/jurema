/**
 * Estatísticas rápidas: wa_messages de mídia + mediaStorageKey.
 * Uso: node --import dotenv/config scripts/wa-messages-media-stats.mjs
 */
import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url?.trim()) {
  console.error("DATABASE_URL não definido.");
  process.exit(1);
}

const conn = await createConnection(url);
try {
  const [[summary]] = await conn.query(`
    SELECT
      COUNT(*) AS total_media_msgs,
      SUM(CASE WHEN mediaStorageKey IS NOT NULL AND TRIM(mediaStorageKey) <> '' THEN 1 ELSE 0 END) AS with_storage_key,
      SUM(CASE WHEN mediaUrl IS NOT NULL AND TRIM(mediaUrl) <> '' THEN 1 ELSE 0 END) AS with_media_url,
      SUM(CASE WHEN type IN ('image','video','audio','document','sticker')
               AND mediaUrl IS NOT NULL AND TRIM(mediaUrl) <> ''
               AND mediaStorageKey IS NOT NULL AND TRIM(mediaStorageKey) <> '' THEN 1 ELSE 0 END) AS media_url_and_key
    FROM wa_messages
    WHERE type IN ('image','video','audio','document','sticker')
  `);

  const [anyMedia] = await conn.query(`
    SELECT id, type, instanceId, fromMe, senderType,
      LENGTH(COALESCE(mediaUrl,'')) AS media_url_len,
      LENGTH(COALESCE(mediaStorageKey,'')) AS storage_key_len,
      LEFT(COALESCE(mediaUrl,''), 80) AS url_prefix,
      LEFT(COALESCE(mediaStorageKey,''), 80) AS key_prefix,
      LEFT(COALESCE(content,''), 60) AS content_prefix,
      \`timestamp\`
    FROM wa_messages
    WHERE type IN ('image','video','audio','document','sticker')
    ORDER BY id DESC
    LIMIT 10
  `);

  console.log(JSON.stringify({ summary, recentMediaRows: anyMedia }, null, 2));
} finally {
  await conn.end();
}
