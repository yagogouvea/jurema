/**
 * Backfill: preenche wa_messages.mediaStorageKey (e normaliza mediaUrl para /manus-storage/...)
 * quando dá para derivar a chave a partir do mediaUrl atual.
 *
 * Uso: node --import dotenv/config scripts/backfill-wa-media-storage-key.mjs
 *      node --import dotenv/config scripts/backfill-wa-media-storage-key.mjs --dry-run
 */
import { createConnection } from "mysql2/promise";

const dryRun = process.argv.includes("--dry-run");

function encodeManusPath(relKey) {
  const norm = String(relKey || "").replace(/^\/+/, "");
  if (!norm) return null;
  return "/manus-storage/" + norm.split("/").map((p) => encodeURIComponent(p)).join("/");
}

/** @param {string | null} mediaUrl */
function extractMediaStorageKey(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;
  const s = mediaUrl.trim();
  if (s.startsWith("/manus-storage/")) {
    const enc = s.slice("/manus-storage/".length);
    return enc.split("/").map((p) => decodeURIComponent(p)).join("/");
  }
  const m = s.match(/(wa-media\/\d+\/[^?\s#'"]+)/i);
  return m ? m[1] : null;
}

const url = process.env.DATABASE_URL;
if (!url || !String(url).trim()) {
  console.error("DATABASE_URL não definido.");
  process.exit(1);
}

const conn = await createConnection(url);
try {
  const [rows] = await conn.execute(
    `SELECT id, mediaUrl, mediaStorageKey
     FROM wa_messages
     WHERE mediaUrl IS NOT NULL
       AND TRIM(mediaUrl) <> ''
       AND type IN ('image','video','audio','document','sticker')
       AND (mediaStorageKey IS NULL OR TRIM(mediaStorageKey) = '')`
  );

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const key = extractMediaStorageKey(row.mediaUrl);
    if (!key) {
      skipped++;
      continue;
    }
    const proxy = encodeManusPath(key);
    if (!proxy) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] id=${row.id} key=${key} mediaUrl -> ${proxy}`);
      updated++;
      continue;
    }
    await conn.execute(
      `UPDATE wa_messages SET mediaStorageKey = ?, mediaUrl = ? WHERE id = ?`,
      [key, proxy, row.id]
    );
    updated++;
  }

  console.log(
    dryRun
      ? `[dry-run] ${updated} linha(s) seriam atualizadas; ${skipped} sem chave derivável.`
      : `Concluído: ${updated} mensagem(ns) atualizadas; ${skipped} ignoradas (sem wa-media nem /manus-storage/).`
  );
} finally {
  await conn.end();
}
