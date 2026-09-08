import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Verificar instâncias existentes
const [existing] = await db.execute("SELECT * FROM wa_instances");
console.log("Instâncias existentes:", existing.length);
existing.forEach(r => console.log(" -", r.id, r.name, r.phone));

if (existing.length === 0) {
  console.log("\nCriando 5 instâncias padrão...");
  await db.execute(`
    INSERT INTO wa_instances (name, phone, instanceId, apiKey, webhookUrl, status, active, color) VALUES
    ('Instância 1', '00000000000', '1', '', '', 'disconnected', true, '#25D366'),
    ('Instância 2', '00000000000', '2', '', '', 'disconnected', true, '#3B82F6'),
    ('Instância 3', '00000000000', '3', '', '', 'disconnected', true, '#F59E0B'),
    ('Instância 4', '00000000000', '4', '', '', 'disconnected', true, '#8B5CF6'),
    ('Instância 5', '00000000000', '5', '', '', 'disconnected', true, '#EC4899')
  `);
  console.log("5 instâncias criadas com sucesso!");
  
  // Verificar wa_ai_config — atualizar instanceId para os IDs corretos
  const [newInst] = await db.execute("SELECT id, name FROM wa_instances ORDER BY id");
  console.log("\nInstâncias criadas:");
  newInst.forEach(r => console.log(" -", r.id, r.name));
  
  // Verificar se wa_ai_config tem registros com instanceId 1,2,3
  const [aiConfigs] = await db.execute("SELECT instanceId FROM wa_ai_config ORDER BY instanceId");
  console.log("\nConfigs IA existentes para instanceIds:", aiConfigs.map(r => r.instanceId));
} else {
  console.log("\nInstâncias já existem, nenhuma ação necessária.");
}

await db.end();
