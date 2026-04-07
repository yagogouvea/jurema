import { getDb } from './server/db.ts';
import bcrypt from 'bcryptjs';

const db = await getDb();
if (db) {
  try {
    // Verificar admins existentes
    const result = await db.execute('SELECT id, username, name FROM admin_users');
    console.log('Admin users:', result);
    
    if (!result || result.length === 0) {
      console.log('\nNenhum admin encontrado. Criando admin padrão...');
      
      // Hash da senha "jurema@adm"
      const hashedPassword = await bcrypt.hash('jurema@adm', 10);
      
      await db.execute(
        'INSERT INTO admin_users (username, password, name) VALUES (?, ?, ?)',
        ['jurema@adm', hashedPassword, 'Jurema Admin']
      );
      
      console.log('✓ Admin criado com sucesso!');
      console.log('Username: jurema@adm');
      console.log('Password: jurema@adm');
    }
  } catch (e) {
    console.error('Erro:', e.message);
  }
}
