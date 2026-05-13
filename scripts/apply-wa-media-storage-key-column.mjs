/**
 * Aplica apenas a migração 0020 (coluna mediaStorageKey em wa_messages).
 * Rode onde DATABASE_URL aponte para o MySQL correto (ex.: Railway shell).
 *
 *   node --import dotenv/config scripts/apply-wa-media-storage-key-column.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createConnection } from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sqlPath = join(root, "drizzle", "0020_wa_messages_media_storage_key.sql");

const url = process.env.DATABASE_URL;
if (!url || !String(url).trim()) {
  console.error("DATABASE_URL não definido.");
  process.exit(1);
}

const sqlRaw = readFileSync(sqlPath, "utf8");
const statements = sqlRaw
  .split(";")
  .map((s) => s.replace(/^\s*--[^\n]*/gm, "").trim())
  .filter(Boolean);

const conn = await createConnection(url);
try {
  for (const stmt of statements) {
    await conn.execute(stmt);
    console.log("OK:", stmt.split("\n")[0].slice(0, 120) + (stmt.length > 120 ? "…" : ""));
  }
  console.log("\nMigração 0020 aplicada com sucesso.");
} catch (e) {
  const code = e && typeof e === "object" && "errno" in e ? e.errno : null;
  const msg = String((e && e.message) || e);
  if (code === 1060 || msg.includes("Duplicate column")) {
    console.log("Coluna mediaStorageKey já existe — nada a fazer.");
    process.exit(0);
  }
  console.error(e);
  process.exit(1);
} finally {
  await conn.end();
}
