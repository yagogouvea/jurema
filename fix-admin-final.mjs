import mysql from 'mysql2/promise';

// Usar DATABASE_URL se disponível
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL não está definida');
  process.exit(1);
}

// Parse DATABASE_URL: mysql://user:password@host:port/database
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
  const hash = '$2b$10$kC1L5AcUmMzwZ9wm8OINsOU//zRZm4rAB36NytftzUug8TSGvUD36';
  const [result] = await connection.execute(
    'UPDATE admin_users SET password = ? WHERE username = ?',
    [hash, 'jurema@adm']
  );
  console.log('✓ Senha do admin resetada com sucesso!');
  console.log('Username: jurema@adm');
  console.log('Password: jurema@adm');
  console.log('Rows affected:', result.affectedRows);
} catch (e) {
  console.error('Erro:', e.message);
} finally {
  await connection.end();
}
