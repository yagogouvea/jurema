import fs from "fs";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const url =
  process.env.MYSQL_PUBLIC_URL ||
  process.env.MYSQL_URL ||
  process.env.DATABASE_URL;

if (!url) {
  console.error("Defina MYSQL_PUBLIC_URL, MYSQL_URL ou DATABASE_URL.");
  process.exit(1);
}

const raw = fs.readFileSync(join(root, "drizzle", "0019_wa_ai_config_extra_links.sql"), "utf8");
// Remove comentários de linha e junta statements separados por ;
const withoutComments = raw.replace(/--[^\n]*/g, "").trim();
const statements = withoutComments
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const conn = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: false } });

for (const stmt of statements) {
  try {
    await conn.query(stmt);
    console.log("OK:", stmt.slice(0, 72) + (stmt.length > 72 ? "…" : ""));
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/Duplicate column name/i.test(msg) || /already exists/i.test(msg)) {
      console.log("Coluna extraLinks já existe — ignorado.");
    } else {
      console.error(msg);
      await conn.end();
      process.exit(1);
    }
  }
}

await conn.end();
console.log("Migração 0019 concluída.");
