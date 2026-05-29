// Simula EXATAMENTE o payload que o Apps Script envia para validar compatibilidade
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

console.log('═══ Teste 1: webhookNewProduct (mesmo payload do Apps Script) ═══\n');
const payload1 = {
  json: {
    secret: 'jurema-pdv-2024',
    product: {
      codigo: '__TESTE_CUTOVER_DELETAR__',
      linha: 'TESTE',
      modelo: 'TESTE',
      time: 'TESTE',
      descricao: 'TESTE DE WEBHOOK CUTOVER — DELETAR',
      tamanho: 'X',
      tipo: 'CAMISETA',
      estoque: 0,
      precoAtacado: 0,
      precoVarejo: 0,
      isActive: false  // já cria inativo para não aparecer no PDV
    }
  }
};
const r1 = await fetch('https://jurema-production.up.railway.app/api/trpc/pdvSync.webhookNewProduct', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload1),
});
console.log(`  HTTP ${r1.status}`);
console.log(`  Resposta: ${(await r1.text()).slice(0, 300)}`);

const [created] = await db.execute(`SELECT codigo, descricao, estoque, isActive FROM pdv_products WHERE codigo = '__TESTE_CUTOVER_DELETAR__'`);
if (created.length > 0) {
  console.log(`  ✓ Produto criado no banco: ${created[0].codigo} isActive=${created[0].isActive}`);
} else {
  console.log(`  ✗ Produto NÃO foi criado no banco`);
}

// Teste 2: webhookReconcile (envia lista vazia, mas isso desativaria TUDO!)
// Vamos enviar a lista atual real para que nada mude
console.log('\n═══ Teste 2: webhookReconcile (com lista completa atual) ═══\n');
const [todos] = await db.execute(`SELECT codigo FROM pdv_products`);
const codigosReais = todos.map(t => t.codigo);
console.log(`  Enviando ${codigosReais.length} códigos (deve resultar em 0 desativações)`);
const payload2 = { json: { secret: 'jurema-pdv-2024', codigos: codigosReais } };
const r2 = await fetch('https://jurema-production.up.railway.app/api/trpc/pdvSync.webhookReconcile', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload2),
});
console.log(`  HTTP ${r2.status}`);
console.log(`  Resposta: ${(await r2.text()).slice(0, 300)}`);

// Limpa produto teste
console.log('\n═══ Limpeza ═══');
await db.execute(`DELETE FROM pdv_products WHERE codigo = '__TESTE_CUTOVER_DELETAR__'`);
console.log(`  ✓ Produto teste removido`);

await db.end();
