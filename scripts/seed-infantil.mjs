import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const infantilProducts = [
  // Times - Infantil
  { name: 'Camisa Flamengo Infantil 2025', slug: 'camisa-flamengo-infantil-2025', description: 'Camisa oficial do Flamengo para os pequenos torcedores. Tecido leve e confortável.', price: '89.90', originalPrice: '119.90', team: 'Flamengo', category: 'infantil', subcategory: 'Flamengo', gender: 'infantil', isFeatured: true, salesCount: 45 },
  { name: 'Camisa Corinthians Infantil 2025', slug: 'camisa-corinthians-infantil-2025', description: 'Camisa do Corinthians para crianças. Fiel desde pequeno!', price: '89.90', originalPrice: null, team: 'Corinthians', category: 'infantil', subcategory: 'Corinthians', gender: 'infantil', isFeatured: false, salesCount: 38 },
  { name: 'Camisa Palmeiras Infantil 2025', slug: 'camisa-palmeiras-infantil-2025', description: 'Vista seu filho com as cores do Palmeiras. Qualidade e conforto.', price: '89.90', originalPrice: '109.90', team: 'Palmeiras', category: 'infantil', subcategory: 'Palmeiras', gender: 'infantil', isFeatured: false, salesCount: 29 },
  { name: 'Camisa São Paulo Infantil 2025', slug: 'camisa-sao-paulo-infantil-2025', description: 'Camisa tricolor para os pequenos são-paulinos.', price: '84.90', originalPrice: null, team: 'São Paulo', category: 'infantil', subcategory: 'São Paulo', gender: 'infantil', isFeatured: false, salesCount: 22 },
  { name: 'Camisa Grêmio Infantil 2025', slug: 'camisa-gremio-infantil-2025', description: 'Camisa do Grêmio para crianças. Azul, preto e branco desde cedo!', price: '84.90', originalPrice: null, team: 'Grêmio', category: 'infantil', subcategory: 'Grêmio', gender: 'infantil', isFeatured: false, salesCount: 18 },
  // Seleções - Infantil
  { name: 'Camisa Brasil Infantil 2026', slug: 'camisa-brasil-infantil-2026', description: 'Camisa da Seleção Brasileira para os pequenos craques. Verde e amarelo!', price: '94.90', originalPrice: '129.90', team: 'Brasil', category: 'infantil', subcategory: 'Brasil', gender: 'infantil', isFeatured: true, salesCount: 67 },
  { name: 'Camisa Argentina Infantil 2025', slug: 'camisa-argentina-infantil-2025', description: 'Camisa da Argentina para crianças. Campeões do mundo!', price: '94.90', originalPrice: null, team: 'Argentina', category: 'infantil', subcategory: 'Argentina', gender: 'infantil', isFeatured: false, salesCount: 41 },
  { name: 'Camisa Portugal Infantil 2025', slug: 'camisa-portugal-infantil-2025', description: 'Camisa de Portugal para os pequenos fãs do Cristiano.', price: '89.90', originalPrice: null, team: 'Portugal', category: 'infantil', subcategory: 'Portugal', gender: 'infantil', isFeatured: false, salesCount: 25 },
];

try {
  console.log('Inserindo produtos infantis...');
  for (const p of infantilProducts) {
    await conn.execute(`
      INSERT IGNORE INTO products (name, slug, description, price, originalPrice, images, team, category, subcategory, gender, isActive, isFeatured, salesCount)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, 1, ?, ?)
    `, [p.name, p.slug, p.description, p.price, p.originalPrice, p.team, p.category, p.subcategory, p.gender, p.isFeatured ? 1 : 0, p.salesCount]);

    const [rows] = await conn.execute('SELECT id FROM products WHERE slug = ?', [p.slug]);
    const productId = rows[0].id;

    // Estoque infantil: tamanhos 2, 4, 6, 8, 10, 12 anos → mapeados para PP, P, M, G, GG, XGG
    const sizes = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
    for (const size of sizes) {
      const qty = Math.floor(Math.random() * 20) + 5;
      await conn.execute(`
        INSERT INTO product_stock (productId, size, quantity) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE quantity = ?
      `, [productId, size, qty, qty]);
    }
    console.log(`  ✓ ${p.name}`);
  }

  console.log('\n✅ Produtos infantis inseridos com sucesso!');
} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  await conn.end();
}
