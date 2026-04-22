import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Corrigir groupLink (link do grupo WhatsApp), instagramLink (Linktree) e awayMessage (sem emojis)
await db.execute(`
  UPDATE wa_ai_config SET
    groupLink = 'https://chat.whatsapp.com/HIZ9GN5gFnG5n3Rf5LIaJ6?mode=gi_t',
    instagramLink = 'https://linktr.ee/Aobstinada',
    awayMessage = 'No momento estamos fora do horario de atendimento. Retornaremos em breve. Funcionamos de segunda a sexta das 06h as 15h e sabado das 08h as 16h.'
`);

const [rows] = await db.execute("SELECT instanceId, groupLink, instagramLink, awayMessage FROM wa_ai_config");
console.log("Dados atualizados:");
rows.forEach((r) => {
  console.log(`\nInstancia ${r.instanceId}:`);
  console.log("  groupLink:", r.groupLink);
  console.log("  instagramLink (Linktree):", r.instagramLink);
  console.log("  awayMessage:", r.awayMessage);
});

await db.end();
console.log("\nOK - 3 instancias atualizadas");
