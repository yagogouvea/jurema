import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);
const [c] = await db.query("SHOW COLUMNS FROM wa_ai_config LIKE 'pricingRules'");
if (!c.length) {
  await db.query("ALTER TABLE wa_ai_config ADD COLUMN pricingRules TEXT NULL AFTER businessContext");
  console.log("Coluna pricingRules criada.");
} else {
  console.log("Coluna pricingRules ja existe.");
}
await db.end();
