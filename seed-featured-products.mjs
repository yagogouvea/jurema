import mysql from 'mysql2/promise';

// Parse DATABASE_URL: mysql://user:password@host:port/database
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL não está definida');
  process.exit(1);
}

const url = new URL(dbUrl);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: url.port || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

try {
  // Produtos de teste para cada seção
  const products = [
    // DESTAQUE
    { name: 'Camisa São Paulo Tailandesa 2025', slug: 'camisa-sao-paulo-tailandesa-2025', price: '80.00', category: 'tailandesa', team: 'São Paulo', gender: 'masculino', featuredSection: 'destaque' },
    { name: 'Camisa Flamengo Retrô 1981', slug: 'camisa-flamengo-retro-1981', price: '95.00', category: 'retro-tailandesa', team: 'Flamengo', gender: 'masculino', featuredSection: 'destaque' },
    { name: 'Camisa Brasil Seleção Tailandesa', slug: 'camisa-brasil-selecao-tailandesa', price: '85.00', category: 'tailandesa', team: 'Brasil', gender: 'masculino', featuredSection: 'destaque' },
    { name: 'Camisa Corinthians 1 Linha', slug: 'camisa-corinthians-1-linha', price: '30.00', category: '1linha-nacional', team: 'Corinthians', gender: 'masculino', featuredSection: 'destaque' },
    { name: 'Camisa Palmeiras Tailandesa', slug: 'camisa-palmeiras-tailandesa', price: '80.00', category: 'tailandesa', team: 'Palmeiras', gender: 'masculino', featuredSection: 'destaque' },
    { name: 'Camisa Santos Retrô', slug: 'camisa-santos-retro', price: '90.00', category: 'retro-tailandesa', team: 'Santos', gender: 'masculino', featuredSection: 'destaque' },
    { name: 'Camisa Vasco Tailandesa', slug: 'camisa-vasco-tailandesa', price: '80.00', category: 'tailandesa', team: 'Vasco', gender: 'masculino', featuredSection: 'destaque' },
    { name: 'Camisa Botafogo 1 Linha', slug: 'camisa-botafogo-1-linha', price: '30.00', category: '1linha-nacional', team: 'Botafogo', gender: 'masculino', featuredSection: 'destaque' },

    // MAIS VENDIDOS
    { name: 'Camisa Argentina Seleção', slug: 'camisa-argentina-selecao', price: '85.00', category: 'tailandesa', team: 'Argentina', gender: 'masculino', featuredSection: 'mais-vendidos' },
    { name: 'Camisa Portugal Seleção', slug: 'camisa-portugal-selecao', price: '85.00', category: 'tailandesa', team: 'Portugal', gender: 'masculino', featuredSection: 'mais-vendidos' },
    { name: 'Camisa França Seleção', slug: 'camisa-franca-selecao', price: '85.00', category: 'tailandesa', team: 'França', gender: 'masculino', featuredSection: 'mais-vendidos' },
    { name: 'Camisa Alemanha Seleção', slug: 'camisa-alemanha-selecao', price: '85.00', category: 'tailandesa', team: 'Alemanha', gender: 'masculino', featuredSection: 'mais-vendidos' },
    { name: 'Camisa Itália Seleção', slug: 'camisa-italia-selecao', price: '85.00', category: 'tailandesa', team: 'Itália', gender: 'masculino', featuredSection: 'mais-vendidos' },
    { name: 'Camisa Espanha Seleção', slug: 'camisa-espanha-selecao', price: '85.00', category: 'tailandesa', team: 'Espanha', gender: 'masculino', featuredSection: 'mais-vendidos' },
    { name: 'Camisa Inglaterra Seleção', slug: 'camisa-inglaterra-selecao', price: '85.00', category: 'tailandesa', team: 'Inglaterra', gender: 'masculino', featuredSection: 'mais-vendidos' },
    { name: 'Camisa Holanda Seleção', slug: 'camisa-holanda-selecao', price: '85.00', category: 'tailandesa', team: 'Holanda', gender: 'masculino', featuredSection: 'mais-vendidos' },

    // NOVA COLEÇÃO
    { name: 'Camisa Uruguai Seleção 2025', slug: 'camisa-uruguai-selecao-2025', price: '85.00', category: 'tailandesa', team: 'Uruguai', gender: 'masculino', featuredSection: 'nova-colecao' },
    { name: 'Camisa Chile Seleção 2025', slug: 'camisa-chile-selecao-2025', price: '85.00', category: 'tailandesa', team: 'Chile', gender: 'masculino', featuredSection: 'nova-colecao' },
    { name: 'Camisa Colômbia Seleção 2025', slug: 'camisa-colombia-selecao-2025', price: '85.00', category: 'tailandesa', team: 'Colômbia', gender: 'masculino', featuredSection: 'nova-colecao' },
    { name: 'Camisa Peru Seleção 2025', slug: 'camisa-peru-selecao-2025', price: '85.00', category: 'tailandesa', team: 'Peru', gender: 'masculino', featuredSection: 'nova-colecao' },
    { name: 'Camisa Paraguai Seleção 2025', slug: 'camisa-paraguai-selecao-2025', price: '85.00', category: 'tailandesa', team: 'Paraguai', gender: 'masculino', featuredSection: 'nova-colecao' },
    { name: 'Camisa Equador Seleção 2025', slug: 'camisa-equador-selecao-2025', price: '85.00', category: 'tailandesa', team: 'Equador', gender: 'masculino', featuredSection: 'nova-colecao' },
    { name: 'Camisa Venezuela Seleção 2025', slug: 'camisa-venezuela-selecao-2025', price: '85.00', category: 'tailandesa', team: 'Venezuela', gender: 'masculino', featuredSection: 'nova-colecao' },
    { name: 'Camisa Bolívia Seleção 2025', slug: 'camisa-bolivia-selecao-2025', price: '85.00', category: 'tailandesa', team: 'Bolívia', gender: 'masculino', featuredSection: 'nova-colecao' },
  ];

  let count = 0;
  for (const product of products) {
    try {
      await connection.execute(
        `INSERT INTO products (name, slug, description, price, originalPrice, team, category, gender, isActive, isFeatured, featuredSection, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, NOW(), NOW())`,
        [
          product.name,
          product.slug,
          `${product.name} - Qualidade premium para revendedores.`,
          product.price,
          product.price,
          product.team,
          product.category,
          product.gender,
          product.featuredSection,
        ]
      );
      count++;
      console.log(`✓ ${product.name} adicionado à seção "${product.featuredSection}"`);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        console.log(`⚠ ${product.name} já existe (ignorado)`);
      } else {
        console.error(`✗ Erro ao adicionar ${product.name}:`, e.message);
      }
    }
  }

  console.log(`\n✅ ${count} produtos adicionados com sucesso!`);
} catch (e) {
  console.error('Erro:', e.message);
} finally {
  await connection.end();
}
