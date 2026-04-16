import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  await conn.execute('ALTER TABLE `product_stock` MODIFY COLUMN `size` varchar(20) NOT NULL');
  console.log('✓ product_stock.size altered to varchar(20)');
} catch (e) {
  console.log('product_stock.size:', e.message);
}

try {
  await conn.execute('ALTER TABLE `products` ADD COLUMN `pdvCodigoBase` varchar(100)');
  console.log('✓ products.pdvCodigoBase added');
} catch (e) {
  console.log('products.pdvCodigoBase:', e.message);
}

try {
  await conn.execute('ALTER TABLE `products` ADD COLUMN `pdvSynced` boolean DEFAULT false NOT NULL');
  console.log('✓ products.pdvSynced added');
} catch (e) {
  console.log('products.pdvSynced:', e.message);
}

await conn.end();
console.log('Done.');
