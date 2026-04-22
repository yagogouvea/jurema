import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// URL da imagem de tamanhos (via storage proxy)
const TABELA_TAMANHOS_URL = '/manus-storage/tabela-tamanhos-jumera_65e10a7d.png';

// ─── Base de conhecimento ATUALIZADA ─────────────────────────────────────────

const businessContext = `
SOBRE A JUMERA SPORT:
Loja especializada em camisas de times e seleções, atacado e varejo.

CATÁLOGO:
Quando o cliente pedir o catálogo, envie exatamente:
⚠️SEGUE CATÁLOGO⚠️
✅https://drive.google.com/drive/mobile/folders/1jFP5im7LtNC08WRKlew9imkAPDixOJob
Pastas com qualidade e valor do produto

TABELA DE VALORES:
MODELO 21/22/23/24/25 (ressalva alguns modelos)
- Varejo: R$50,00
- Atacado: R$35,00 (Nome da pasta no link)

MODELO 25/26
- Varejo: R$100,00
- *Modelos novidades podem variar de valor

Modelo Jogador
- R$130,00 varejo

Retrô
- R$130,00 varejo
- R$150,00 varejo - Retrô do Brasil

CONJUNTO DE FRIO - TAILANDÊS
- R$230,00 varejo

CONJUNTO TAILANDÊS CALOR
- R$90,00 varejo

CONJUNTO TAILANDÊS INFANTIL
- R$100,00 varejo

NACIONAIS:
- Premium nacional - variedades: R$50,00 varejo
- Premium nacional - Brasil copa atual: R$60,00
- Conjunto nacional verão - variedades: R$50,00 varejo
- Conjunto nacional verão - Brasil: R$60,00 varejo
- Conjunto nacional frio - Brasil: R$100,00 varejo

MÍNIMO PARA ATACADO:
Para se caracterizar ATACADO, você precisa comprar 6 ou mais produtos na loja e para envio 10 peças, SEJA QUAL FOR O PRODUTO, pode mesclar tamanhos, modelos e qualidade.

FORMAS DE PAGAMENTO:
- Pix (chave: aobstinada.a@gmail.com)
- Crédito (com 5% de acréscimo) até R$500,00 reais, somente na loja física
- Débito (com 3% de acréscimo)
- Não parcelamos

FORMAS DE ENVIO:
- Correios
- Ônibus (cliente informa a empresa e endereço da empresa que pegará a mercadoria na região do Brás)

COMO FAZER UM PEDIDO:
Para separação do pedido:
• Enviar um print da foto do catálogo enviado por nós
• Na descrição colocar tamanho e quantidade
• Aguardar o processo de separação

POLÍTICA DE TROCAS / PROBLEMA COM MERCADORIA:
Quando o cliente tiver um problema com a mercadoria, responda:
"Sinto muito pelo ocorrido, as peças vem do fabricante já embaladas e não temos tempo hábil para abrir todas, e é possível que ocorra essas intercorrência, podemos fazer o envio da etiqueta para que você possa postar nos correios ou te daremos o desconto da peça no próximo pedido. Veja o que se enquadra melhor para você."

Defeito - Troca:
• Caso alguma mercadoria tenha algum defeito, fazemos a troca se o produto estiver devidamente ETIQUETADO, não haverá troca de produtos sem etiqueta de forma nenhuma.
• Os cuidados com a peça precisam ser observados e seguidos.

TABELA DE TAMANHOS E MEDIDAS:
Quando o cliente perguntar sobre tamanhos, medidas ou grade, envie a imagem da tabela de tamanhos.
Tabela de tamanhos adultos (imagem disponível):
- P: Comprimento 69-71cm, Largura 53-55cm, Altura 162-170cm, Peso 50-62kg
- M: Comprimento 71-73cm, Largura 55-57cm, Altura 170-176cm, Peso 62-78kg
- G: Comprimento 73-75cm, Largura 57-58cm, Altura 176-182cm, Peso 78-83kg
- XL: Comprimento 75-78cm, Largura 58-60cm, Altura 182-190cm, Peso 83-90kg
- 2XL: Comprimento 78-81cm, Largura 60-62cm, Altura 190-195cm, Peso 90-97kg
Considerar margem de erro de 1-3cm em cada medida.
Segunda linha: P, M, G e GG
Primeira linha: P (poucos modelos), M, G e GG
Tailandesa: P (poucos modelos), M, G, GG, GGG (pouquíssimos modelos, não chega ser G1)
Conjunto infantil Time: 2, 4, 6, 8, 10, 12 e 14
Conjunto infantil basquete: 6, 8, 10, 12, 14 e 16

FRETE E ENTREGA:
Frete varia de acordo com peso do pacote e a distância. Para saber o valor estimado e o tempo de entrega dos correios, nos envie seu CEP para cotação 📦

DADOS PARA PAGAMENTO (PIX):
Chave Pix: aobstinada.a@gmail.com
OBSTINADA APOIO INTERMEDIAÇÃO E AGENCIAMENTOS DE SERVIÇOS LTDA
Banco: Infinity Pay

ENDEREÇOS:
Loja 2 - Shopping Stunt
Rua: Conselheiro Belisário, 41 - Box ST2.085 - 2º andar

Loja 1 - Shopping Juta Mix
(endereço a confirmar)

HORÁRIO DE FUNCIONAMENTO:
LOJA 2 - Shopping Stunt:
- Segunda a Sexta: 06h às 15h
- Sábado: 08h às 16h
- Domingo: FECHADO

LOJA 1 - Shopping Juta Mix:
- Segunda a Sexta: 06h às 14h
- Sábado: 06h às 13h
- Domingo: FECHADO

MENSAGEM APÓS FINALIZAR COMPRA:
Muito obrigada pela compra, precisando sabe onde nos encontrar!
~ Ao receber seu pacote, grave um vídeo abrindo, e contando as peças, pois essa é uma forma de segurança, tanto para você, quanto para nós. Reclamações feitas sem o vídeo, não serão aceitas.

AVISO SOBRE RESTRIÇÃO WHATSAPP BUSINESS:
Se o cliente reclamar que não recebeu resposta ou que o número não está funcionando, envie:
EQUIPE JUREMA SPORT 🚨🚨🚨
Devido à nova atualização do WhatsApp, todos os WhatsApp Business estão sendo restringidos. Se por acaso não receber a resposta à sua nova mensagem, pedimos que entre no link e chame outros números descritos no site:
https://linktr.ee/Aobstinada
`.trim();

// Atualizar todas as instâncias
const [instances] = await db.query('SELECT id, name FROM wa_instances');
console.log('Atualizando', instances.length, 'instâncias...');

for (const inst of instances) {
  await db.query(
    'UPDATE wa_ai_config SET businessContext=?, updatedAt=NOW() WHERE instanceId=?',
    [businessContext, inst.id]
  );
  console.log(`✅ businessContext atualizado: ${inst.name}`);
}

// ─── Atualizar/adicionar respostas rápidas ───────────────────────────────────

const quickReplies = [
  {
    title: 'Problema com Mercadoria',
    shortcut: '/problema',
    content: `Sinto muito pelo ocorrido, as peças vem do fabricante já embaladas e não temos tempo hábil para abrir todas, e é possível que ocorra essas intercorrência, podemos fazer o envio da etiqueta para que você possa postar nos correios ou te daremos o desconto da peça no próximo pedido.\n\nVeja o que se enquadra melhor para você.`
  },
  {
    title: 'Formas de Envio',
    shortcut: '/envio',
    content: `Forma de envio:\n\n• Correios\n• Ônibus (nos informe a empresa e o endereço da empresa que pegará a mercadoria aqui na região do Brás)`
  },
  {
    title: 'Mínimo Atacado',
    shortcut: '/atacado',
    content: `Para se caracterizar ATACADO, você precisa comprar 6 ou mais produtos na loja e para envio 10 peças, SEJA QUAL FOR O PRODUTO, pode mesclar tamanhos, modelos e qualidade.`
  },
  {
    title: 'Formas de Pagamento',
    shortcut: '/pagamento',
    content: `Formas de pagamento:\n\n• Pix\n• Crédito (com 5% de acréscimo) até R$500,00 reais, somente na loja física\n• Débito (com 3% de acréscimo)\n\nNão parcelamos`
  },
  {
    title: 'Tabela de Tamanhos',
    shortcut: '/tamanhos',
    content: `Segue a tabela de tamanhos adultos 👆\n\nSegunda linha: P, M, G e GG\nPrimeira linha: P (poucos modelos), M, G e GG\nTailandesa: P (poucos modelos), M, G, GG, GGG\nConj. infantil Time: 2, 4, 6, 8, 10, 12 e 14\nConj. infantil basquete: 6, 8, 10, 12, 14 e 16\n\n*Considerar margem de erro de 1-3cm`,
    imageUrl: TABELA_TAMANHOS_URL
  },
  {
    title: 'Aviso Restrição WhatsApp',
    shortcut: '/aviso',
    content: `EQUIPE JUREMA SPORT 🚨🚨🚨\n\nDevido à nova atualização do WhatsApp, todos os WhatsApp Business estão sendo restringidos. Se por acaso não receber a resposta à sua nova mensagem, pedimos que entre no link e chame outros números descritos no site:\nhttps://linktr.ee/Aobstinada`
  },
];

for (const qr of quickReplies) {
  const [existing] = await db.query('SELECT id FROM wa_quick_replies WHERE shortcut = ?', [qr.shortcut]);
  if (existing.length > 0) {
    await db.query(
      'UPDATE wa_quick_replies SET title=?, content=?, updatedAt=NOW() WHERE shortcut=?',
      [qr.title, qr.content, qr.shortcut]
    );
    console.log(`✅ Atualizado: ${qr.title}`);
  } else {
    await db.query(
      'INSERT INTO wa_quick_replies (instanceId, title, shortcut, content, active, createdAt, updatedAt) VALUES (NULL, ?, ?, ?, true, NOW(), NOW())',
      [qr.title, qr.shortcut, qr.content]
    );
    console.log(`✅ Criado: ${qr.title}`);
  }
}

// Atualizar resposta rápida de trocas com o novo texto
await db.query(
  `UPDATE wa_quick_replies SET content=?, updatedAt=NOW() WHERE shortcut='/troca'`,
  [`Defeito\n• Caso alguma mercadoria tenha algum defeito, fazemos a troca se o produto estiver devidamente ETIQUETADO, não haverá troca de produtos sem etiqueta de forma nenhuma.\n• Os cuidados com a peça precisam ser observados e seguidos.\n\nSe tiver um problema com a mercadoria, use /problema para ver as opções de solução.`]
);
console.log('✅ Atualizado: Política de Trocas');

await db.end();
console.log('\n🎉 Base de conhecimento atualizada com sucesso!');
console.log(`📸 Imagem de tamanhos: ${TABELA_TAMANHOS_URL}`);
