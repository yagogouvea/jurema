import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Mapeamento de nomes de exibição
export const CATEGORIES = [
  { key: '1linha-nacional',        label: 'R$30,00/at - 1 LINHA - NACIONAL' },
  { key: 'tailandesa-promocao',    label: 'R$35,00/at - TAILANDESA Promoção (PEQUENAS MANCHAS)' },
  { key: 'conj-calor-nacional',    label: 'R$50,00/at - CONJ CALOR - NACIONAL' },
  { key: 'conj-calor-tailandesa',  label: 'R$75,00/at - CONJ CALOR TAILANDESA' },
  { key: 'tailandesa',             label: 'R$80,00/at - TAILANDESA' },
  { key: 'infantil',               label: 'R$80,00/at Infantil' },
  { key: 'jogador-tailandesa',     label: 'R$110,00/at - JOGADOR TAILANDESA' },
  { key: 'retro-tailandesa',       label: 'R$110,00/at - RETRO TAILANDESA' },
  { key: 'conj-frio-tailandes',    label: 'R$180,00/at - CONJ FRIO TAILANDÊS' },
  { key: 'tailandesa-3xl',         label: 'R$variado - tailandesa 3XL' },
  { key: 'tailandesa-4xl',         label: 'R$variados - tailandesa 4XL' },
];

const TEAMS = ['Flamengo', 'Corinthians', 'Palmeiras', 'São Paulo', 'Grêmio', 'Internacional', 'Santos', 'Cruzeiro', 'Atlético-MG', 'Botafogo'];
const SELECOES = ['Brasil', 'Argentina', 'Portugal', 'França', 'Alemanha', 'Espanha', 'Inglaterra', 'Itália', 'Uruguai', 'México'];
const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

function slug(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

try {
  // 1. Limpar produtos antigos PRIMEIRO (para poder alterar o enum)
  console.log('Removendo produtos antigos...');
  await conn.execute('DELETE FROM product_stock');
  await conn.execute('DELETE FROM products');
  console.log('✓ Produtos antigos removidos');

  // 2. Alterar enum no banco
  console.log('Atualizando enum category no banco...');
  await conn.execute(`
    ALTER TABLE \`products\`
    MODIFY COLUMN \`category\` enum(
      '1linha-nacional','tailandesa-promocao','conj-calor-nacional',
      'conj-calor-tailandesa','tailandesa','infantil','jogador-tailandesa',
      'retro-tailandesa','conj-frio-tailandes','tailandesa-3xl','tailandesa-4xl'
    ) NOT NULL DEFAULT 'tailandesa'
  `);
  console.log('✓ Enum atualizado');

  // 3. Inserir novos produtos por categoria
  const products = [
    // 1 LINHA NACIONAL - R$30
    ...TEAMS.slice(0, 5).map(t => ({ name: `Camisa ${t} 1 Linha Nacional`, team: t, category: '1linha-nacional', price: '30.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*30)+5 })),
    ...SELECOES.slice(0, 3).map(t => ({ name: `Camisa ${t} 1 Linha Nacional`, team: t, category: '1linha-nacional', price: '30.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*30)+5 })),

    // TAILANDESA PROMOÇÃO - R$35
    ...TEAMS.slice(0, 4).map(t => ({ name: `Camisa ${t} Tailandesa Promoção`, team: t, category: 'tailandesa-promocao', price: '35.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*20)+3 })),
    ...SELECOES.slice(0, 3).map(t => ({ name: `Camisa ${t} Tailandesa Promoção`, team: t, category: 'tailandesa-promocao', price: '35.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*20)+3 })),

    // CONJ CALOR NACIONAL - R$50
    ...TEAMS.slice(0, 3).map(t => ({ name: `Conjunto Calor ${t} Nacional`, team: t, category: 'conj-calor-nacional', price: '50.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*15)+2 })),
    ...SELECOES.slice(0, 2).map(t => ({ name: `Conjunto Calor ${t} Nacional`, team: t, category: 'conj-calor-nacional', price: '50.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*15)+2 })),

    // CONJ CALOR TAILANDESA - R$75
    ...TEAMS.slice(0, 3).map(t => ({ name: `Conjunto Calor ${t} Tailandesa`, team: t, category: 'conj-calor-tailandesa', price: '75.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*15)+2 })),
    ...SELECOES.slice(0, 2).map(t => ({ name: `Conjunto Calor ${t} Tailandesa`, team: t, category: 'conj-calor-tailandesa', price: '75.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*15)+2 })),

    // TAILANDESA - R$80 (principal)
    ...TEAMS.map(t => ({ name: `Camisa ${t} Tailandesa 2025`, team: t, category: 'tailandesa', price: '80.00', gender: 'masculino', featured: true, sales: Math.floor(Math.random()*80)+20 })),
    ...SELECOES.map(t => ({ name: `Camisa ${t} Tailandesa 2025`, team: t, category: 'tailandesa', price: '80.00', gender: 'masculino', featured: true, sales: Math.floor(Math.random()*80)+20 })),
    // Feminino
    ...TEAMS.slice(0, 4).map(t => ({ name: `Camisa ${t} Tailandesa Feminina`, team: t, category: 'tailandesa', price: '80.00', gender: 'feminino', featured: false, sales: Math.floor(Math.random()*40)+10 })),
    ...SELECOES.slice(0, 3).map(t => ({ name: `Camisa ${t} Tailandesa Feminina`, team: t, category: 'tailandesa', price: '80.00', gender: 'feminino', featured: false, sales: Math.floor(Math.random()*40)+10 })),

    // INFANTIL - R$80
    ...TEAMS.slice(0, 5).map(t => ({ name: `Camisa ${t} Infantil`, team: t, category: 'infantil', price: '80.00', gender: 'infantil', featured: false, sales: Math.floor(Math.random()*30)+5 })),
    ...SELECOES.slice(0, 4).map(t => ({ name: `Camisa ${t} Infantil`, team: t, category: 'infantil', price: '80.00', gender: 'infantil', featured: false, sales: Math.floor(Math.random()*30)+5 })),

    // JOGADOR TAILANDESA - R$110
    ...TEAMS.slice(0, 5).map(t => ({ name: `Camisa ${t} Jogador Tailandesa`, team: t, category: 'jogador-tailandesa', price: '110.00', gender: 'masculino', featured: true, sales: Math.floor(Math.random()*50)+15 })),
    ...SELECOES.slice(0, 4).map(t => ({ name: `Camisa ${t} Jogador Tailandesa`, team: t, category: 'jogador-tailandesa', price: '110.00', gender: 'masculino', featured: true, sales: Math.floor(Math.random()*50)+15 })),

    // RETRO TAILANDESA - R$110
    { name: 'Camisa Brasil Retrô 1970 Tailandesa', team: 'Brasil', category: 'retro-tailandesa', price: '110.00', gender: 'masculino', featured: true, sales: 55 },
    { name: 'Camisa Brasil Retrô 1994 Tailandesa', team: 'Brasil', category: 'retro-tailandesa', price: '110.00', gender: 'masculino', featured: false, sales: 42 },
    { name: 'Camisa Argentina Retrô 1986 Tailandesa', team: 'Argentina', category: 'retro-tailandesa', price: '110.00', gender: 'masculino', featured: true, sales: 61 },
    { name: 'Camisa Flamengo Retrô 1981 Tailandesa', team: 'Flamengo', category: 'retro-tailandesa', price: '110.00', gender: 'masculino', featured: false, sales: 38 },
    { name: 'Camisa Corinthians Retrô 1977 Tailandesa', team: 'Corinthians', category: 'retro-tailandesa', price: '110.00', gender: 'masculino', featured: false, sales: 29 },
    { name: 'Camisa Palmeiras Retrô 1993 Tailandesa', team: 'Palmeiras', category: 'retro-tailandesa', price: '110.00', gender: 'masculino', featured: false, sales: 25 },
    { name: 'Camisa Portugal Retrô 2004 Tailandesa', team: 'Portugal', category: 'retro-tailandesa', price: '110.00', gender: 'masculino', featured: false, sales: 33 },
    { name: 'Camisa Itália Retrô 1982 Tailandesa', team: 'Itália', category: 'retro-tailandesa', price: '110.00', gender: 'masculino', featured: false, sales: 27 },

    // CONJ FRIO TAILANDÊS - R$180
    ...TEAMS.slice(0, 4).map(t => ({ name: `Conjunto Frio ${t} Tailandês`, team: t, category: 'conj-frio-tailandes', price: '180.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*20)+5 })),
    ...SELECOES.slice(0, 3).map(t => ({ name: `Conjunto Frio ${t} Tailandês`, team: t, category: 'conj-frio-tailandes', price: '180.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*20)+5 })),

    // TAILANDESA 3XL
    ...TEAMS.slice(0, 4).map(t => ({ name: `Camisa ${t} Tailandesa 3XL`, team: t, category: 'tailandesa-3xl', price: '90.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*15)+3 })),
    ...SELECOES.slice(0, 3).map(t => ({ name: `Camisa ${t} Tailandesa 3XL`, team: t, category: 'tailandesa-3xl', price: '90.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*15)+3 })),

    // TAILANDESA 4XL
    ...TEAMS.slice(0, 3).map(t => ({ name: `Camisa ${t} Tailandesa 4XL`, team: t, category: 'tailandesa-4xl', price: '100.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*10)+2 })),
    ...SELECOES.slice(0, 2).map(t => ({ name: `Camisa ${t} Tailandesa 4XL`, team: t, category: 'tailandesa-4xl', price: '100.00', gender: 'masculino', featured: false, sales: Math.floor(Math.random()*10)+2 })),
  ];

  // Deduplicar slugs
  const usedSlugs = new Set();
  let inserted = 0;
  for (const p of products) {
    let s = slug(p.name);
    let i = 1;
    while (usedSlugs.has(s)) s = slug(p.name) + '-' + (i++);
    usedSlugs.add(s);

    await conn.execute(`
      INSERT INTO products (name, slug, description, price, images, team, category, subcategory, gender, isActive, isFeatured, salesCount)
      VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, 1, ?, ?)
    `, [p.name, s, `${p.name} - Qualidade premium para revendedores.`, p.price, p.team, p.category, p.team, p.gender, p.featured ? 1 : 0, p.sales]);

    const [rows] = await conn.execute('SELECT id FROM products WHERE slug = ?', [s]);
    const productId = rows[0].id;

    for (const size of SIZES) {
      const qty = Math.floor(Math.random() * 30) + 10;
      await conn.execute(
        'INSERT INTO product_stock (productId, size, quantity) VALUES (?, ?, ?)',
        [productId, size, qty]
      );
    }
    inserted++;
  }

  console.log(`✓ ${inserted} produtos inseridos com estoque`);

  // Resumo
  const [summary] = await conn.execute(`SELECT category, COUNT(*) as total FROM products GROUP BY category ORDER BY category`);
  console.log('\nDistribuição por categoria:');
  summary.forEach(r => console.log(`  ${r.category}: ${r.total} produtos`));

  console.log('\n✅ Migração concluída!');
} catch (err) {
  console.error('❌ Erro:', err.message);
  console.error(err);
} finally {
  await conn.end();
}
