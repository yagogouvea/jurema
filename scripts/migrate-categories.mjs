import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  console.log('Aplicando migration de categorias...');

  // 1. Adicionar infantil ao enum category
  await conn.execute(`
    ALTER TABLE \`products\`
    MODIFY COLUMN \`category\` enum('times','selecoes','retro','infantil') NOT NULL DEFAULT 'times'
  `);
  console.log('✓ Enum category atualizado com infantil');

  // 2. Adicionar coluna subcategory (se não existir)
  const [cols] = await conn.execute(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'subcategory'
  `);
  if (cols.length === 0) {
    await conn.execute(`ALTER TABLE \`products\` ADD COLUMN \`subcategory\` varchar(100)`);
    console.log('✓ Coluna subcategory adicionada');
  } else {
    console.log('✓ Coluna subcategory já existe');
  }

  // 3. Atualizar produtos existentes com subcategory baseado no campo team
  await conn.execute(`UPDATE \`products\` SET \`subcategory\` = \`team\` WHERE \`subcategory\` IS NULL AND \`team\` IS NOT NULL`);
  console.log('✓ Subcategories preenchidas a partir do campo team');

  // 4. Verificar resultado
  const [rows] = await conn.execute(`SELECT category, subcategory, COUNT(*) as total FROM products GROUP BY category, subcategory ORDER BY category, subcategory`);
  console.log('\nDistribuição atual de produtos:');
  rows.forEach(r => console.log(`  ${r.category} / ${r.subcategory || '(sem subcategoria)'}: ${r.total} produto(s)`));

  console.log('\n✅ Migration concluída com sucesso!');
} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await conn.end();
}
