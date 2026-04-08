import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
try {
  await conn.execute("ALTER TABLE `products` ADD `reference` varchar(100);");
  console.log("✅ Coluna 'reference' adicionada com sucesso!");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") {
    console.log("ℹ️  Coluna 'reference' já existe.");
  } else {
    throw e;
  }
} finally {
  await conn.end();
}
