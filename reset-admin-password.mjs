import { getDb } from './server/db.ts';
import bcrypt from 'bcryptjs';

const db = await getDb();
if (db) {
  try {
    // Hash da senha "jurema@adm"
    const hashedPassword = await bcrypt.hash('jurema@adm', 10);
    
    // Atualizar senha do admin
    await db.execute(
      'UPDATE admin_users SET password = ? WHERE username = ?',
      [hashedPassword, 'jurema@adm']
    );
    
    console.log('✓ Senha do admin resetada com sucesso!');
    console.log('Username: jurema@adm');
    console.log('Password: jurema@adm');
  } catch (e) {
    console.error('Erro:', e.message);
  }
}
