import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Hash da senha
const hash = await bcrypt.hash('jurema@adm', 12);

// Criar tabela admin_users se não existir
await conn.execute(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(200),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Inserir ou atualizar admin
await conn.execute(`
  INSERT INTO admin_users (username, password, name)
  VALUES (?, ?, ?)
  ON DUPLICATE KEY UPDATE password = VALUES(password), name = VALUES(name)
`, ['jurema@adm', hash, 'Administrador Jumera Sport']);

console.log('✅ Usuário admin criado: jurema@adm / jurema@adm');
await conn.end();
