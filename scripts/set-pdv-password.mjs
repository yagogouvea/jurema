/**
 * Atualiza passwordHash de um vendedor PDV (mesmo algoritmo do servidor: SHA256(senha + "pdv_salt_jumera")).
 * Uso:
 *   node --import dotenv/config scripts/set-pdv-password.mjs vanessa "suaSenhaAqui"
 */
import crypto from "crypto";
import mysql from "mysql2/promise";

const PDV_SALT = "pdv_salt_jumera";

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + PDV_SALT).digest("hex");
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL");
  process.exit(1);
}

const username = (process.argv[2] || "").trim().toLowerCase();
const password = process.argv[3] || "";
if (!username || !password) {
  console.error("Uso: node --import dotenv/config scripts/set-pdv-password.mjs <usuario> <senha>");
  process.exit(1);
}

const hash = hashPassword(password);
const db = await mysql.createConnection(url);
const [r] = await db.execute(
  "UPDATE pdv_sellers SET passwordHash = ? WHERE LOWER(username) = ?",
  [hash, username]
);
const n = Number(r.affectedRows ?? 0);
await db.end();
if (n === 0) {
  console.error(`Nenhuma linha atualizada. Existe pdv_sellers com username "${username}"?`);
  process.exit(1);
}
console.log(`OK: senha atualizada para ${username}`);
