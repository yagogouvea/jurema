import { getDb } from './server/db.ts';

const db = await getDb();
if (db) {
  try {
    const result = await db.execute('ALTER TABLE products ADD COLUMN featuredSection enum("destaque","mais-vendidos","nova-colecao") DEFAULT NULL');
    console.log('✓ Migration applied');
  } catch (e) {
    if (e.message.includes('Duplicate column')) {
      console.log('✓ Column already exists');
    } else {
      console.error('✗ Error:', e.message);
    }
  }
}
