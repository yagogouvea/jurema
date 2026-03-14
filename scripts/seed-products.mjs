import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

const products = [
  // Times Brasileiros - Masculino
  { name: 'Camisa Flamengo I 2024/25', slug: 'camisa-flamengo-i-2024-25', description: 'Camisa oficial do Flamengo temporada 2024/25. Tecido dry-fit de alta performance.', price: '189.90', originalPrice: '229.90', images: JSON.stringify(['https://placehold.co/600x600/CC0000/FFFFFF?text=FLAMENGO+I']), team: 'Flamengo', category: 'times', gender: 'masculino', isActive: 1, isFeatured: 1, salesCount: 342 },
  { name: 'Camisa Flamengo II 2024/25', slug: 'camisa-flamengo-ii-2024-25', description: 'Camisa alternativa do Flamengo. Preta com detalhes vermelhos.', price: '189.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/111111/CC0000?text=FLAMENGO+II']), team: 'Flamengo', category: 'times', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 198 },
  { name: 'Camisa Corinthians I 2024/25', slug: 'camisa-corinthians-i-2024-25', description: 'Camisa oficial do Corinthians. Branca com detalhes pretos, símbolo do Timão.', price: '179.90', originalPrice: '219.90', images: JSON.stringify(['https://placehold.co/600x600/FFFFFF/111111?text=CORINTHIANS']), team: 'Corinthians', category: 'times', gender: 'masculino', isActive: 1, isFeatured: 1, salesCount: 287 },
  { name: 'Camisa Palmeiras I 2024/25', slug: 'camisa-palmeiras-i-2024-25', description: 'Camisa oficial do Palmeiras. Verde alviverde com escudo bordado.', price: '199.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/006633/FFFFFF?text=PALMEIRAS']), team: 'Palmeiras', category: 'times', gender: 'masculino', isActive: 1, isFeatured: 1, salesCount: 265 },
  { name: 'Camisa São Paulo I 2024/25', slug: 'camisa-sao-paulo-i-2024-25', description: 'Camisa oficial do São Paulo. Tricolor com listras clássicas.', price: '179.90', originalPrice: '209.90', images: JSON.stringify(['https://placehold.co/600x600/CC0000/FFFFFF?text=SÃO+PAULO']), team: 'São Paulo', category: 'times', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 156 },
  { name: 'Camisa Santos I 2024/25', slug: 'camisa-santos-i-2024-25', description: 'Camisa oficial do Santos. Branca com escudo do Peixe.', price: '169.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/FFFFFF/000000?text=SANTOS']), team: 'Santos', category: 'times', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 134 },
  { name: 'Camisa Grêmio I 2024/25', slug: 'camisa-gremio-i-2024-25', description: 'Camisa oficial do Grêmio. Tricolor gaúcho azul, preto e branco.', price: '179.90', originalPrice: '199.90', images: JSON.stringify(['https://placehold.co/600x600/003399/FFFFFF?text=GRÊMIO']), team: 'Grêmio', category: 'times', gender: 'masculino', isActive: 1, isFeatured: 1, salesCount: 178 },
  { name: 'Camisa Internacional I 2024/25', slug: 'camisa-internacional-i-2024-25', description: 'Camisa oficial do Internacional. Vermelha com escudo do Colorado.', price: '179.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/CC0000/FFFFFF?text=INTER']), team: 'Internacional', category: 'times', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 145 },
  // Seleções - Masculino
  { name: 'Camisa Brasil I 2024 - Amarela', slug: 'camisa-brasil-i-2024-amarela', description: 'Camisa oficial da Seleção Brasileira. Amarela com escudo da CBF bordado.', price: '299.90', originalPrice: '349.90', images: JSON.stringify(['https://placehold.co/600x600/FFD700/009C3B?text=BRASIL+I']), team: 'Brasil', category: 'selecoes', gender: 'masculino', isActive: 1, isFeatured: 1, salesCount: 521 },
  { name: 'Camisa Brasil II 2024 - Azul', slug: 'camisa-brasil-ii-2024-azul', description: 'Camisa alternativa da Seleção Brasileira. Azul com detalhes dourados.', price: '299.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/002776/FFD700?text=BRASIL+II']), team: 'Brasil', category: 'selecoes', gender: 'masculino', isActive: 1, isFeatured: 1, salesCount: 389 },
  { name: 'Camisa Argentina I 2024', slug: 'camisa-argentina-i-2024', description: 'Camisa oficial da Argentina. Listrada azul e branca, modelo campeão do mundo.', price: '279.90', originalPrice: '319.90', images: JSON.stringify(['https://placehold.co/600x600/74ACDF/FFFFFF?text=ARGENTINA']), team: 'Argentina', category: 'selecoes', gender: 'masculino', isActive: 1, isFeatured: 1, salesCount: 445 },
  { name: 'Camisa Portugal I 2024', slug: 'camisa-portugal-i-2024', description: 'Camisa oficial de Portugal. Vermelha com escudo da FPF.', price: '269.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/CC0000/006600?text=PORTUGAL']), team: 'Portugal', category: 'selecoes', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 312 },
  { name: 'Camisa França I 2024', slug: 'camisa-franca-i-2024', description: 'Camisa oficial da França. Azul com detalhes tricolores.', price: '269.90', originalPrice: '299.90', images: JSON.stringify(['https://placehold.co/600x600/002395/FFFFFF?text=FRANÇA']), team: 'França', category: 'selecoes', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 234 },
  { name: 'Camisa Alemanha I 2024', slug: 'camisa-alemanha-i-2024', description: 'Camisa oficial da Alemanha. Branca com escudo da DFB.', price: '259.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/FFFFFF/000000?text=ALEMANHA']), team: 'Alemanha', category: 'selecoes', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 189 },
  { name: 'Camisa Espanha I 2024', slug: 'camisa-espanha-i-2024', description: 'Camisa oficial da Espanha. Vermelha com escudo da RFEF.', price: '269.90', originalPrice: '299.90', images: JSON.stringify(['https://placehold.co/600x600/AA151B/FFD700?text=ESPANHA']), team: 'Espanha', category: 'selecoes', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 201 },
  // Feminino
  { name: 'Camisa Brasil Feminina 2024', slug: 'camisa-brasil-feminina-2024', description: 'Camisa oficial da Seleção Feminina do Brasil. Corte especial feminino.', price: '279.90', originalPrice: '319.90', images: JSON.stringify(['https://placehold.co/600x600/FFD700/009C3B?text=BRASIL+FEM']), team: 'Brasil', category: 'selecoes', gender: 'feminino', isActive: 1, isFeatured: 1, salesCount: 267 },
  { name: 'Camisa Flamengo Feminina 2024', slug: 'camisa-flamengo-feminina-2024', description: 'Camisa do Flamengo corte feminino. Vermelha e preta com ajuste anatômico.', price: '169.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/CC0000/111111?text=FLA+FEM']), team: 'Flamengo', category: 'times', gender: 'feminino', isActive: 1, isFeatured: 1, salesCount: 198 },
  { name: 'Camisa Palmeiras Feminina 2024', slug: 'camisa-palmeiras-feminina-2024', description: 'Camisa do Palmeiras corte feminino. Verde com detalhes brancos.', price: '169.90', originalPrice: '189.90', images: JSON.stringify(['https://placehold.co/600x600/006633/FFFFFF?text=PAL+FEM']), team: 'Palmeiras', category: 'times', gender: 'feminino', isActive: 1, isFeatured: 0, salesCount: 145 },
  { name: 'Camisa Argentina Feminina 2024', slug: 'camisa-argentina-feminina-2024', description: 'Camisa da Argentina corte feminino. Listrada azul e branca.', price: '249.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/74ACDF/FFFFFF?text=ARG+FEM']), team: 'Argentina', category: 'selecoes', gender: 'feminino', isActive: 1, isFeatured: 0, salesCount: 167 },
  // Infantil
  { name: 'Camisa Brasil Infantil 2024', slug: 'camisa-brasil-infantil-2024', description: 'Camisa da Seleção Brasileira tamanho infantil. Para os pequenos torcedores.', price: '159.90', originalPrice: '189.90', images: JSON.stringify(['https://placehold.co/600x600/FFD700/009C3B?text=BRASIL+INF']), team: 'Brasil', category: 'selecoes', gender: 'infantil', isActive: 1, isFeatured: 1, salesCount: 312 },
  { name: 'Camisa Flamengo Infantil 2024', slug: 'camisa-flamengo-infantil-2024', description: 'Camisa do Flamengo tamanho infantil. Perfeita para o pequeno rubro-negro.', price: '139.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/CC0000/111111?text=FLA+INF']), team: 'Flamengo', category: 'times', gender: 'infantil', isActive: 1, isFeatured: 0, salesCount: 234 },
  { name: 'Camisa Argentina Infantil 2024', slug: 'camisa-argentina-infantil-2024', description: 'Camisa da Argentina tamanho infantil. Listrada azul e branca.', price: '149.90', originalPrice: '169.90', images: JSON.stringify(['https://placehold.co/600x600/74ACDF/FFFFFF?text=ARG+INF']), team: 'Argentina', category: 'selecoes', gender: 'infantil', isActive: 1, isFeatured: 0, salesCount: 189 },
  { name: 'Camisa Palmeiras Infantil 2024', slug: 'camisa-palmeiras-infantil-2024', description: 'Camisa do Palmeiras tamanho infantil. Verde para os pequenos palmeirenses.', price: '139.90', originalPrice: '159.90', images: JSON.stringify(['https://placehold.co/600x600/006633/FFFFFF?text=PAL+INF']), team: 'Palmeiras', category: 'times', gender: 'infantil', isActive: 1, isFeatured: 0, salesCount: 156 },
  // Retrô
  { name: 'Camisa Brasil Retrô 1970', slug: 'camisa-brasil-retro-1970', description: 'Camisa retrô da Seleção Brasileira Copa 1970. Pelé, Tostão e Rivelino.', price: '219.90', originalPrice: '259.90', images: JSON.stringify(['https://placehold.co/600x600/FFD700/009C3B?text=BRASIL+1970']), team: 'Brasil', category: 'retro', gender: 'masculino', isActive: 1, isFeatured: 1, salesCount: 178 },
  { name: 'Camisa Flamengo Retrô 1981', slug: 'camisa-flamengo-retro-1981', description: 'Camisa retrô do Flamengo Campeão Libertadores 1981. Zico, Júnior e Adílio.', price: '199.90', originalPrice: null, images: JSON.stringify(['https://placehold.co/600x600/CC0000/111111?text=FLA+1981']), team: 'Flamengo', category: 'retro', gender: 'masculino', isActive: 1, isFeatured: 1, salesCount: 156 },
  { name: 'Camisa Argentina Retrô 1986', slug: 'camisa-argentina-retro-1986', description: 'Camisa retrô da Argentina Copa 1986. Maradona e a mão de Deus.', price: '229.90', originalPrice: '269.90', images: JSON.stringify(['https://placehold.co/600x600/74ACDF/FFFFFF?text=ARG+1986']), team: 'Argentina', category: 'retro', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 223 },
  { name: 'Camisa Corinthians Retrô 1977', slug: 'camisa-corinthians-retro-1977', description: 'Camisa retrô do Corinthians. Clássica branca com detalhes pretos.', price: '189.90', originalPrice: '219.90', images: JSON.stringify(['https://placehold.co/600x600/FFFFFF/111111?text=COR+1977']), team: 'Corinthians', category: 'retro', gender: 'masculino', isActive: 1, isFeatured: 0, salesCount: 134 },
];

let inserted = 0;
for (const p of products) {
  try {
    await conn.query(
      `INSERT IGNORE INTO products (name, slug, description, price, originalPrice, images, team, category, gender, isActive, isFeatured, salesCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.name, p.slug, p.description, p.price, p.originalPrice, p.images, p.team, p.category, p.gender, p.isActive, p.isFeatured, p.salesCount]
    );
    inserted++;
  } catch(e) {
    console.log('Skip:', p.slug, e.message);
  }
}
console.log(`Inserted ${inserted} products`);

// Inserir estoque para cada produto
const [rows] = await conn.query('SELECT id FROM products');
const sizes = ['PP','P','M','G','GG','XGG'];
let stockInserted = 0;
for (const row of rows) {
  for (const size of sizes) {
    const qty = Math.floor(Math.random() * 30) + 5;
    try {
      await conn.query(
        'INSERT IGNORE INTO product_stock (productId, size, quantity) VALUES (?, ?, ?)',
        [row.id, size, qty]
      );
      stockInserted++;
    } catch(e) {}
  }
}
console.log(`Inserted ${stockInserted} stock entries`);
await conn.end();
