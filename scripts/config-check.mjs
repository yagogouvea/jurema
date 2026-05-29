// Verifica configurações do PDV e ENV crítica
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

console.log('═══ Configurações do PDV no banco ═══\n');
const [cfg] = await db.execute(`SELECT \`key\`, value FROM pdv_config`);
for (const c of cfg) console.log(`  ${c.key.padEnd(30)} = ${c.value}`);

// Testa que o webhook responde corretamente com POST + secret
console.log('\n═══ Teste de webhook (POST com secret) ═══\n');
const webhookUrl = 'https://jurema-production.up.railway.app/api/trpc/pdvSync.webhookNewProduct';
const r = await fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    json: {
      secret: 'jurema-pdv-2024',
      codigo: '__TESTE_INVALIDO__', // código fake apenas para validar resposta
      linha: 'TESTE',
      modelo: 'TESTE',
      time: 'TESTE',
      descricao: 'TESTE DE CONECTIVIDADE',
      tamanho: 'X',
      tipo: 'CAMISETA',
      estoque: 0,
      atc: 0,
      var: 0,
      ativo: false  // ativo false = vai criar mas marcar inativo
    }
  }),
});
console.log(`HTTP ${r.status}`);
const txt = await r.text();
console.log(`Resposta: ${txt.slice(0, 500)}`);

// Verifica que o produto teste NÃO foi criado (deve falhar pq não passou validação)
const [testes] = await db.execute(`SELECT codigo, descricao, isActive FROM pdv_products WHERE codigo = '__TESTE_INVALIDO__'`);
if (testes.length > 0) {
  console.log(`\n⚠ Produto teste foi criado — removendo:`);
  for (const t of testes) console.log(`  ${t.codigo} ${t.descricao} isActive=${t.isActive}`);
  await db.execute(`DELETE FROM pdv_products WHERE codigo = '__TESTE_INVALIDO__'`);
  console.log(`  ✓ removido`);
} else {
  console.log(`\n✓ Nenhum produto teste foi criado (esperado em caso de validação OK)`);
}

await db.end();
