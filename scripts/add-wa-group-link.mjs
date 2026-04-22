import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

const grupoLink = 'https://chat.whatsapp.com/HIZ9GN5gFnG5n3Rf5LIaJ6?mode=gi_t';

const grupoTexto = `

GRUPO DO WHATSAPP:
Link para entrar no grupo VIP da Jumera Sport:
${grupoLink}
Quando o cliente quiser entrar no grupo, envie esse link.`;

// 1. Adicionar link do grupo no businessContext de todas as instâncias
const [configs] = await db.query('SELECT id FROM wa_ai_config');
for (const cfg of configs) {
  const [rows] = await db.query('SELECT businessContext FROM wa_ai_config WHERE id = ?', [cfg.id]);
  const current = rows[0].businessContext;
  // Evitar duplicar se já existir
  if (current.includes('GRUPO DO WHATSAPP')) {
    // Atualizar o link existente
    const updated = current.replace(
      /GRUPO DO WHATSAPP:[\s\S]*?(?=\n\n[A-Z]|$)/,
      `GRUPO DO WHATSAPP:\nLink para entrar no grupo VIP da Jumera Sport:\n${grupoLink}\nQuando o cliente quiser entrar no grupo, envie esse link.`
    );
    await db.query('UPDATE wa_ai_config SET businessContext=?, updatedAt=NOW() WHERE id=?', [updated, cfg.id]);
    console.log(`✅ Link do grupo atualizado na instância ${cfg.id}`);
  } else {
    const updated = current + grupoTexto;
    await db.query('UPDATE wa_ai_config SET businessContext=?, updatedAt=NOW() WHERE id=?', [updated, cfg.id]);
    console.log(`✅ Link do grupo adicionado na instância ${cfg.id}`);
  }
}

// 2. Criar/atualizar resposta rápida /grupo
const grupoContent = `Entre no nosso grupo VIP do WhatsApp para receber novidades, promoções e lançamentos em primeira mão! 🏆\n\n${grupoLink}`;

const [existing] = await db.query("SELECT id FROM wa_quick_replies WHERE shortcut='/grupo'");
if (existing.length > 0) {
  await db.query(
    "UPDATE wa_quick_replies SET title='Grupo WhatsApp', content=?, updatedAt=NOW() WHERE shortcut='/grupo'",
    [grupoContent]
  );
  console.log('✅ Resposta rápida /grupo atualizada');
} else {
  await db.query(
    "INSERT INTO wa_quick_replies (instanceId, title, shortcut, content, active, createdAt, updatedAt) VALUES (NULL, 'Grupo WhatsApp', '/grupo', ?, true, NOW(), NOW())",
    [grupoContent]
  );
  console.log('✅ Resposta rápida /grupo criada');
}

await db.end();
console.log('\n🎉 Link do grupo WhatsApp configurado com sucesso!');
