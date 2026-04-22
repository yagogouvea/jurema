import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Atualizar businessContext removendo referências à Loja 1
const [configs] = await db.query('SELECT id, businessContext FROM wa_ai_config');

for (const cfg of configs) {
  let updated = cfg.businessContext;

  // Remover bloco de horários da Loja 1
  updated = updated.replace(
    /LOJA 1 - Shopping Juta [Mm]ix:[\s\S]*?(?=\nLOJA 2|$)/g,
    ''
  );

  // Remover linha "Loja 1 - Shopping Juta Mix" dos endereços
  updated = updated.replace(/\nLoja 1 - Shopping Juta [Mm]ix\n\(endereço a confirmar\)/g, '');
  updated = updated.replace(/\nLoja 1 - Shopping Juta [Mm]ix[^\n]*/g, '');

  // Remover referências genéricas à Loja 1
  updated = updated.replace(/\nLOJA 1[^\n]*/g, '');

  // Limpar linhas em branco duplas extras
  updated = updated.replace(/\n{3,}/g, '\n\n').trim();

  await db.query('UPDATE wa_ai_config SET businessContext=?, updatedAt=NOW() WHERE id=?', [updated, cfg.id]);
  console.log(`✅ Loja 1 removida da instância ${cfg.id}`);
}

// Atualizar resposta rápida /endereco removendo Loja 1
await db.query(
  "UPDATE wa_quick_replies SET content=?, updatedAt=NOW() WHERE shortcut='/endereco'",
  ['Loja 2 - Shopping Stunt\nR. Conselheiro Belisário, 41 - Brás, São Paulo - SP, 03012-000\nBox ST2.085 - 2º andar']
);
console.log('✅ Resposta rápida /endereco atualizada (sem Loja 1)');

// Atualizar resposta rápida /horario removendo Loja 1
const [horario] = await db.query("SELECT content FROM wa_quick_replies WHERE shortcut='/horario'");
if (horario.length > 0) {
  let h = horario[0].content;
  h = h.replace(/LOJA 1[\s\S]*?(?=LOJA 2|$)/g, '').replace(/\n{3,}/g, '\n\n').trim();
  await db.query("UPDATE wa_quick_replies SET content=?, updatedAt=NOW() WHERE shortcut='/horario'", [h]);
  console.log('✅ Resposta rápida /horario atualizada (sem Loja 1)');
}

await db.end();
console.log('\n🎉 Loja 1 removida da base de conhecimento com sucesso!');
