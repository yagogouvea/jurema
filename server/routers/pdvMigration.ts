import { getDb } from "../db-connect";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const PDV_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS pdv_sellers (
  id INT AUTO_INCREMENT NOT NULL,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL,
  passwordHash VARCHAR(255) NOT NULL,
  role ENUM('seller','admin') NOT NULL DEFAULT 'seller',
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT pdv_sellers_id PRIMARY KEY(id),
  CONSTRAINT pdv_sellers_username_unique UNIQUE(username)
);

CREATE TABLE IF NOT EXISTS pdv_products (
  id INT AUTO_INCREMENT NOT NULL,
  codigo VARCHAR(100),
  linha ENUM('TAILANDESA','NACIONAL','TORCEDOR','PECA') NOT NULL,
  modelo ENUM('TORCEDOR','JOGADOR','TAILANDESA','VENDEDOR') NOT NULL,
  time VARCHAR(100) NOT NULL,
  descricao VARCHAR(255),
  tamanho VARCHAR(20) NOT NULL,
  tipo ENUM('CAMISETA','CONJUNTO','OUTRO') NOT NULL DEFAULT 'CAMISETA',
  estoque INT NOT NULL DEFAULT 0,
  precoAtacado DECIMAL(10,2) NOT NULL DEFAULT '0',
  precoVarejo DECIMAL(10,2) NOT NULL DEFAULT '0',
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT pdv_products_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS pdv_orders (
  id INT AUTO_INCREMENT NOT NULL,
  pedidoId VARCHAR(50) NOT NULL,
  sellerId INT NOT NULL,
  sellerName VARCHAR(255) NOT NULL,
  canal ENUM('BALCAO','WHATSAPP') NOT NULL,
  clienteNome VARCHAR(255),
  clienteTelefone VARCHAR(20),
  regime ENUM('ATACADO','VAREJO') NOT NULL,
  totalVarejo DECIMAL(10,2) NOT NULL DEFAULT '0',
  totalAtacado DECIMAL(10,2) NOT NULL DEFAULT '0',
  totalAplicado DECIMAL(10,2) NOT NULL,
  totalPago DECIMAL(10,2) NOT NULL DEFAULT '0',
  totalPendente DECIMAL(10,2) NOT NULL DEFAULT '0',
  justificativa TEXT,
  status ENUM('PAGO','PENDENTE','CANCELADO') NOT NULL DEFAULT 'PAGO',
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT pdv_orders_id PRIMARY KEY(id),
  CONSTRAINT pdv_orders_pedidoId_unique UNIQUE(pedidoId)
);

CREATE TABLE IF NOT EXISTS pdv_order_items (
  id INT AUTO_INCREMENT NOT NULL,
  pedidoId VARCHAR(50) NOT NULL,
  productId INT,
  linha VARCHAR(50),
  modelo VARCHAR(50),
  time VARCHAR(100),
  descricao VARCHAR(255),
  tamanho VARCHAR(20) NOT NULL,
  quantidade INT NOT NULL,
  precoUnitario DECIMAL(10,2) NOT NULL,
  totalItem DECIMAL(10,2) NOT NULL,
  CONSTRAINT pdv_order_items_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS pdv_order_payments (
  id INT AUTO_INCREMENT NOT NULL,
  pedidoId VARCHAR(50) NOT NULL,
  formaPagamento ENUM('PIX','DINHEIRO','DEBITO','CREDITO','DESCONTO_FOLHA') NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  taxa DECIMAL(10,2) NOT NULL DEFAULT '0',
  valorLiquido DECIMAL(10,2) NOT NULL,
  nomePix VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT pdv_order_payments_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS pdv_order_services (
  id INT AUTO_INCREMENT NOT NULL,
  pedidoId VARCHAR(50) NOT NULL,
  tipo VARCHAR(100) NOT NULL,
  descricao VARCHAR(255),
  valor DECIMAL(10,2) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT pdv_order_services_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS pdv_cash_flow (
  id INT AUTO_INCREMENT NOT NULL,
  tipo ENUM('SUPRIMENTO','SANGRIA') NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  usuario VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT pdv_cash_flow_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS pdv_goals (
  id INT AUTO_INCREMENT NOT NULL,
  \`key\` VARCHAR(50) NOT NULL,
  label VARCHAR(100) NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT pdv_goals_id PRIMARY KEY(id),
  CONSTRAINT pdv_goals_key_unique UNIQUE(\`key\`)
);
`;

export async function runPdvMigration(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[PDV Migration] DATABASE_URL not available, skipping");
    return;
  }
  try {
    const connection = await getDb(); if (!connection) throw new Error("DB unavailable");
    const statements = PDV_MIGRATION_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const stmt of statements) {
      await connection.execute(stmt);
    }
    await connection.end();
    console.log("[PDV Migration] Tables created successfully");
  } catch (error) {
    console.error("[PDV Migration] Error:", error);
  }
}

export async function seedPdvData(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  
  try {
    const connection = await getDb(); if (!connection) throw new Error("DB unavailable");
    
    // Check if sellers already exist
    const [rows] = await connection.execute("SELECT COUNT(*) as count FROM pdv_sellers");
    const count = (rows as any[])[0].count;
    
    if (count === 0) {
      // Insert initial sellers
      const sellers = [
        { name: 'GIANLUCA', username: 'gianluca', hash: 'bb1d68b7ec511537724669a0bfae226338edd5d02605e17f9cd70ffded67c022', role: 'seller' },
        { name: 'MURILO', username: 'murilo', hash: 'f5121f4c4e2519524b3a667ddb00fd4a21a990ca7b2fdc246cfbd3c5cc3ba024', role: 'seller' },
        { name: 'VINICIUS', username: 'vinicius', hash: 'cb55abf37f4c137e3f4c10e579826cb51478439b071d0b00994538b3963636f4', role: 'seller' },
        { name: 'KAWANE', username: 'kawane', hash: 'ef19553f9d12fb2bab42db0c4f589acacbe5cdf2c564295ee404f65b8b5e2896', role: 'seller' },
        { name: 'VANESSA', username: 'vanessa', hash: '0e9c4604b9b7e7d585c23c4adeb05314274f20c0156584375e4021c3238cded9', role: 'admin' },
      ];
      
      for (const s of sellers) {
        await connection.execute(
          "INSERT INTO pdv_sellers (name, username, passwordHash, role) VALUES (?, ?, ?, ?)",
          [s.name, s.username, s.hash, s.role]
        );
      }
      console.log("[PDV Seed] Sellers created");
      
      // Insert initial goals
      const goals = [
        { key: 'BRONZE', label: 'Bronze', value: 14000 },
        { key: 'PRATA', label: 'Prata', value: 23000 },
        { key: 'OURO', label: 'Ouro', value: 28000 },
        { key: 'META_LOJA', label: 'Meta Loja', value: 84000 },
      ];
      
      for (const g of goals) {
        await connection.execute(
          "INSERT INTO pdv_goals (`key`, label, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
          [g.key, g.label, g.value]
        );
      }
      console.log("[PDV Seed] Goals created");
    }
    
    await connection.end();
  } catch (error) {
    console.error("[PDV Seed] Error:", error);
  }
}
