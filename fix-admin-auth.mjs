import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

try {
  const hash = '$2b$10$kC1L5AcUmMzwZ9wm8OINsOU//zRZm4rAB36NytftzUug8TSGvUD36';
  await connection.execute(
    'UPDATE admin_users SET password = ? WHERE username = ?',
    [hash, 'jurema@adm']
  );
  console.log('✓ Senha do admin resetada com sucesso!');
  console.log('Username: jurema@adm');
  console.log('Password: jurema@adm');
} catch (e) {
  console.error('Erro:', e.message);
} finally {
  await connection.end();
}
