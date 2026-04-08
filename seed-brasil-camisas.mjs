import mysql from "mysql2/promise";

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("DATABASE_URL não encontrado nas variáveis de ambiente");
  process.exit(1);
}

const products = [
  {
    name: "Camisa Seleção 11",
    slug: "camisa-selecao-11",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/R_80_00-1-Brasil-Polo-preta_8ddbff04.jpg",
  },
  {
    name: "Camisa Seleção 12",
    slug: "camisa-selecao-12",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/R_80_00-1-Brasil-polo-amarelo_61a98538.jpg",
  },
  {
    name: "Camisa Seleção 13",
    slug: "camisa-selecao-13",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/R_80_00-1-Brasil-preto-dourado_4079785b.jpg",
  },
  {
    name: "Camisa Seleção 14",
    slug: "camisa-selecao-14",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/R_80_00-1-Brasil-treino_cb5278bc.jpg",
  },
  {
    name: "Camisa Seleção 15",
    slug: "camisa-selecao-15",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/Retro%20Tai%20R9%20130_0d33364f.jpg",
  },
  {
    name: "Camisa Seleção 16",
    slug: "camisa-selecao-16",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/Retro%20Tailandesa%20130_7737f3e4.jpg",
  },
  {
    name: "Camisa Seleção 17",
    slug: "camisa-selecao-17",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/Retro%20tailandesa%20130%20(1)_a1da3b0e.jpg",
  },
  {
    name: "Camisa Seleção 18",
    slug: "camisa-selecao-18",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/Retrotailandesa%20130_049f6c55.jpg",
  },
  {
    name: "Camisa Seleção 19",
    slug: "camisa-selecao-19",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/Tail%2080_1cf2ea5f.jpg",
  },
  {
    name: "Camisa Seleção 20",
    slug: "camisa-selecao-20",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/Tail%20Brasil%2080_1c341ec4.jpg",
  },
  {
    name: "Camisa Seleção 21",
    slug: "camisa-selecao-21",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/Tailandesa%20Retro%20130_a83cbd25.jpg",
  },
];

async function main() {
  const conn = await mysql.createConnection({
    uri: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Conectado ao banco de dados!");

  for (const p of products) {
    const imagesJson = JSON.stringify([p.image]);
    await conn.execute(
      `INSERT INTO products (name, slug, description, price, originalPrice, images, team, category, gender, isActive, isFeatured, featuredSection, reference, createdAt, updatedAt)
       VALUES (?, ?, '', 80.00, NULL, ?, 'Brasil', 'itens-brasil', 'masculino', 1, 0, NULL, '', NOW(), NOW())`,
      [p.name, p.slug, imagesJson]
    );
    console.log(`✓ Criado: ${p.name}`);
  }

  await conn.end();
  console.log("\n✅ 11 produtos criados com sucesso!");
}

main().catch(console.error);
