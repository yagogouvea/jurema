import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });

try {
  await conn.execute(`ALTER TABLE \`products\` MODIFY COLUMN \`category\` enum('1linha-nacional','tailandesa-promocao','itens-brasil','conj-calor-nacional','conj-calor-tailandesa','tailandesa','infantil','jogador-tailandesa','retro-tailandesa','conj-frio-tailandes','tailandesa-3xl','tailandesa-4xl') NOT NULL DEFAULT 'tailandesa'`);
  console.log("✅ Coluna category atualizada com itens-brasil!");
} catch (err) {
  console.error("Erro:", err.message);
} finally {
  await conn.end();
}
