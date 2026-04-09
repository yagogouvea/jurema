import mysql from "mysql2/promise";
import { createRequire } from "module";

// Catálogo representativo de produtos PDV Jumera Sport
// Linhas: TAILANDESA, NACIONAL, TORCEDOR, PECA
// Modelos: TORCEDOR, JOGADOR, TAILANDESA, VENDEDOR
// Tamanhos: PP, P, M, G, GG, XGG (camisetas) | P, M, G (conjuntos)

const TAMANHOS_CAMISA = ["PP", "P", "M", "G", "GG", "XGG"];
const TAMANHOS_CONJUNTO = ["P", "M", "G"];

// Preços por linha
const PRECOS = {
  TAILANDESA: { atacado: 45.00, varejo: 70.00 },
  NACIONAL:   { atacado: 35.00, varejo: 55.00 },
  TORCEDOR:   { atacado: 25.00, varejo: 40.00 },
  PECA:       { atacado: 20.00, varejo: 35.00 },
};

// Times e seleções por linha
const CATALOGO = [
  // === TAILANDESA — JOGADOR ===
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Flamengo", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Flamengo", tipo: "CONJUNTO" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Corinthians", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Corinthians", tipo: "CONJUNTO" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Palmeiras", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Palmeiras", tipo: "CONJUNTO" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "São Paulo", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Santos", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Atlético Mineiro", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Cruzeiro", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Grêmio", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Internacional", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Vasco", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Botafogo", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Fluminense", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Bahia", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Fortaleza", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Sport Recife", tipo: "CAMISETA" },
  // Seleções Tailandesa
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Brasil", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Brasil", tipo: "CONJUNTO" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Argentina", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Argentina", tipo: "CONJUNTO" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "França", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Portugal", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Espanha", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Alemanha", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Itália", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Inglaterra", tipo: "CAMISETA" },
  // Clubes europeus Tailandesa
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Real Madrid", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Barcelona", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Manchester City", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Manchester United", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Liverpool", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "PSG", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Bayern Munich", tipo: "CAMISETA" },
  { linha: "TAILANDESA", modelo: "JOGADOR", time: "Juventus", tipo: "CAMISETA" },

  // === NACIONAL — TORCEDOR ===
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Flamengo", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Corinthians", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Palmeiras", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "São Paulo", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Santos", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Atlético Mineiro", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Cruzeiro", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Grêmio", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Internacional", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Vasco", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Botafogo", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Fluminense", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Bahia", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Fortaleza", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Ceará", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Náutico", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Sport Recife", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Brasil", tipo: "CAMISETA" },
  { linha: "NACIONAL", modelo: "TORCEDOR", time: "Argentina", tipo: "CAMISETA" },

  // === TORCEDOR (linha mais barata) ===
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Flamengo", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Corinthians", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Palmeiras", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "São Paulo", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Santos", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Atlético Mineiro", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Cruzeiro", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Grêmio", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Internacional", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Vasco", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Botafogo", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Fluminense", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Brasil", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Argentina", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Portugal", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Real Madrid", tipo: "CAMISETA" },
  { linha: "TORCEDOR", modelo: "TORCEDOR", time: "Barcelona", tipo: "CAMISETA" },

  // === PECA (peças avulsas) ===
  { linha: "PECA", modelo: "VENDEDOR", time: "Shorts Futebol", tipo: "OUTRO" },
  { linha: "PECA", modelo: "VENDEDOR", time: "Meião Futebol", tipo: "OUTRO" },
  { linha: "PECA", modelo: "VENDEDOR", time: "Calção Futebol", tipo: "OUTRO" },
  { linha: "PECA", modelo: "VENDEDOR", time: "Agasalho", tipo: "OUTRO" },
  { linha: "PECA", modelo: "VENDEDOR", time: "Boné Esportivo", tipo: "OUTRO" },
];

async function seed() {
  const db = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Check if already seeded
  const [existing] = await db.execute("SELECT COUNT(*) as count FROM pdv_products");
  const count = existing[0].count;
  
  if (count > 0) {
    console.log(`[PDV Seed] Already has ${count} products. Clearing and re-seeding...`);
    await db.execute("DELETE FROM pdv_products");
  }
  
  let inserted = 0;
  let codigo = 1001;
  
  for (const item of CATALOGO) {
    const precos = PRECOS[item.linha];
    const tamanhos = item.tipo === "CONJUNTO" ? TAMANHOS_CONJUNTO : TAMANHOS_CAMISA;
    
    for (const tamanho of tamanhos) {
      const estoque = Math.floor(Math.random() * 15) + 3; // 3 a 17 unidades
      
      await db.execute(
        `INSERT INTO pdv_products (codigo, linha, modelo, time, descricao, tamanho, tipo, estoque, precoAtacado, precoVarejo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `JMP-${codigo}`,
          item.linha,
          item.modelo,
          item.time,
          `${item.time} — ${item.linha.charAt(0) + item.linha.slice(1).toLowerCase()} ${item.tipo === "CONJUNTO" ? "Conjunto" : ""}`.trim(),
          tamanho,
          item.tipo,
          estoque,
          precos.atacado,
          precos.varejo,
        ]
      );
      inserted++;
      codigo++;
    }
  }
  
  await db.end();
  console.log(`[PDV Seed] Inserted ${inserted} product variants from ${CATALOGO.length} base products`);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
