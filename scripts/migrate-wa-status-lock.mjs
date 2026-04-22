import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

console.log("Adicionando campos de controle de status na wa_conversations...");

try {
  await db.execute(`ALTER TABLE wa_conversations ADD COLUMN statusSetBy ENUM('ai', 'human') NOT NULL DEFAULT 'ai'`);
  await db.execute(`ALTER TABLE wa_conversations ADD COLUMN statusLockedUntil TIMESTAMP NULL DEFAULT NULL`);
  console.log("✅ Campos statusSetBy e statusLockedUntil adicionados com sucesso!");
} catch (e) {
  if (e.message.includes("Duplicate column")) {
    console.log("ℹ️ Campos já existem, nenhuma ação necessária.");
  } else {
    throw e;
  }
}

// Verificar resultado
const [cols] = await db.execute("DESCRIBE wa_conversations");
console.log("\nColunas atuais:");
cols.forEach(c => console.log(" -", c.Field, c.Type, c.Null === 'YES' ? 'NULL' : 'NOT NULL'));

await db.end();
