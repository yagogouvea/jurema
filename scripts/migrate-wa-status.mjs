/**
 * Migration: expandir enum status em wa_conversations
 * De: open | resolved | archived
 * Para: novo | em_atendimento | aguardando | proposta_enviada | finalizado | spam
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

try {
  console.log("🔄 Alterando enum status em wa_conversations...");

  // MySQL não suporta ALTER COLUMN para enum diretamente — precisa recriar a coluna
  await db.execute(`
    ALTER TABLE wa_conversations
    MODIFY COLUMN status ENUM(
      'novo',
      'em_atendimento',
      'aguardando',
      'proposta_enviada',
      'finalizado',
      'spam'
    ) NOT NULL DEFAULT 'novo'
  `);

  console.log("✅ Enum status atualizado com sucesso!");

  // Migrar dados existentes: open → novo, resolved → finalizado, archived → finalizado
  const [updated] = await db.execute(`
    UPDATE wa_conversations
    SET status = CASE
      WHEN status = 'open' THEN 'novo'
      WHEN status = 'resolved' THEN 'finalizado'
      WHEN status = 'archived' THEN 'finalizado'
      ELSE 'novo'
    END
  `);
  console.log(`✅ Dados migrados: ${updated.affectedRows} linhas atualizadas`);

} catch (err) {
  console.error("❌ Erro na migration:", err.message);
} finally {
  await db.end();
}
