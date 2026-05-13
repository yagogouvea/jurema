import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Base de conhecimento da IA ───────────────────────────────────────────────

const personality = `Você é a Ju, atendente virtual da Jumera Sport. Responda de forma calorosa, simpática e natural, como uma vendedora experiente e amigável. Use linguagem informal mas profissional. Nunca revele que é uma IA. Use emojis com moderação para deixar a conversa mais leve. Seja objetiva e direta nas respostas.`;

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

COMO FAZER UM PEDIDO:
Para separação do pedido:
• Enviar um print da foto do catálogo enviado por nós
• Na descrição colocar tamanho e quantidade
• Aguardar o processo de separação

POLÍTICA DE TROCAS:
Defeito:
• Caso alguma mercadoria tenha algum defeito, fazemos a troca se o produto estiver devidamente ETIQUETADO, não haverá troca de produtos sem etiqueta de forma nenhuma.
• Os cuidados com a peça precisam ser observados e seguidos.

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
`.trim();

const greetingMessage = `Olá! 😊 Seja bem-vindo(a) à Jumera Sport! Sou a Ju, como posso te ajudar hoje?`;

const awayMessage = `Olá! 😊 No momento estamos fora do horário de atendimento. Assim que retornarmos, te responderemos com prazer! Nossa Loja 2 funciona de segunda a sexta das 06h às 15h e sábado das 08h às 16h.`;

const systemPrompt = `Você é a Ju, atendente virtual da Jumera Sport. Responda sempre em português brasileiro, de forma natural e humanizada. Use as informações do contexto da loja para responder perguntas sobre produtos, preços, horários, frete, trocas e pagamentos. Nunca invente informações que não estejam no contexto. Se não souber responder, diga que vai verificar e que um atendente humano entrará em contato em breve.`;

const escalateKeywords = JSON.stringify([
  'reclamação', 'problema', 'errado', 'defeito', 'não chegou', 'faltou', 'faltando',
  'cancelar', 'cancelamento', 'reembolso', 'devolução', 'responsável', 'gerente'
]);

// ─── Verificar se já existem instâncias ──────────────────────────────────────

const [instances] = await db.query('SELECT id, name FROM wa_instances LIMIT 10');
console.log('Instâncias encontradas:', instances);

if (instances.length === 0) {
  // Criar 3 instâncias padrão se não existirem
  console.log('Criando 3 instâncias padrão...');
  await db.query(`
    INSERT INTO wa_instances (name, phone, status, instanceId, apiKey, createdAt)
    VALUES
      ('Jurema 1', '', 'disconnected', '', '', NOW()),
      ('Jurema 2', '', 'disconnected', '', '', NOW()),
      ('Jurema 3', '', 'disconnected', '', '', NOW())
  `);
  const [newInstances] = await db.query('SELECT id, name FROM wa_instances');
  console.log('Instâncias criadas:', newInstances);
  instances.push(...newInstances);
}

// ─── Inserir/atualizar wa_ai_config para cada instância ──────────────────────

for (const inst of instances) {
  const [existing] = await db.query('SELECT id FROM wa_ai_config WHERE instanceId = ?', [inst.id]);
  
  if (existing.length > 0) {
    await db.query(`
      UPDATE wa_ai_config SET
        aiName = 'Ju',
        personality = ?,
        businessContext = ?,
        greetingMessage = ?,
        awayMessage = ?,
        awayEnabled = false,
        awayStart = '15:00',
        awayEnd = '06:00',
        catalogLink = 'https://drive.google.com/drive/mobile/folders/1jFP5im7LtNC08WRKlew9imkAPDixOJob',
        groupLink = '',
        instagramLink = 'https://instagram.com/jumerasport',
        maxContextMessages = 10,
        responseDelayMin = 3500,
        responseDelayMax = 9000,
        escalateKeywords = ?,
        systemPrompt = ?,
        updatedAt = NOW()
      WHERE instanceId = ?
    `, [personality, businessContext, greetingMessage, awayMessage, escalateKeywords, systemPrompt, inst.id]);
    console.log(`✅ Atualizado config da instância ${inst.name} (id=${inst.id})`);
  } else {
    await db.query(`
      INSERT INTO wa_ai_config (
        instanceId, enabled, aiName, personality, businessContext,
        greetingMessage, awayMessage, awayEnabled, awayStart, awayEnd,
        catalogLink, groupLink, instagramLink, maxContextMessages,
        responseDelayMin, responseDelayMax, escalateKeywords, systemPrompt, updatedAt
      ) VALUES (?, false, 'Ju', ?, ?, ?, ?, false, '15:00', '06:00',
        'https://drive.google.com/drive/mobile/folders/1jFP5im7LtNC08WRKlew9imkAPDixOJob',
        '', 'https://instagram.com/jumerasport', 10, 3500, 9000, ?, ?, NOW())
    `, [inst.id, personality, businessContext, greetingMessage, awayMessage, escalateKeywords, systemPrompt]);
    console.log(`✅ Criado config da instância ${inst.name} (id=${inst.id})`);
  }
}

// ─── Inserir respostas rápidas globais ───────────────────────────────────────

const quickReplies = [
  {
    title: 'Enviar Catálogo',
    shortcut: '/catalogo',
    content: `⚠️SEGUE CATÁLOGO⚠️\n\n✅https://drive.google.com/drive/mobile/folders/1jFP5im7LtNC08WRKlew9imkAPDixOJob\n\nPastas com qualidade e valor do produto`
  },
  {
    title: 'Tabela de Valores',
    shortcut: '/valores',
    content: `VALORES 💰💸\n\nMODELO 21/22/23/24/25: Varejo R$50 | Atacado R$35\nMODELO 25/26: Varejo R$100\nModelo Jogador: R$130 varejo\nRetrô: R$130 | Retrô Brasil: R$150\nConj. Frio Tailandês: R$230\nConj. Calor Tailandês: R$90\nConj. Infantil Tailandês: R$100\nNacional Premium: R$50-R$60\nConj. Nacional: R$50-R$100`
  },
  {
    title: 'Como Fazer Pedido',
    shortcut: '/pedido',
    content: `Para separação do pedido:\n\n• Enviar um print da foto do catálogo enviado por nós\n• Na descrição colocar tamanho e quantidade\n• Aguardar o processo de separação`
  },
  {
    title: 'Política de Trocas',
    shortcut: '/troca',
    content: `Defeito\n• Caso alguma mercadoria tenha algum defeito, fazemos a troca se o produto estiver devidamente ETIQUETADO, não haverá troca de produtos sem etiqueta de forma nenhuma.\n• Os cuidados com a peça precisam ser observados e seguidos.`
  },
  {
    title: 'Frete e Entrega',
    shortcut: '/frete',
    content: `Frete varia de acordo com peso do pacote e a distância. Para saber o valor estimado e o tempo de entrega dos correios, nos envie seu CEP para cotação 📦`
  },
  {
    title: 'Dados para Pagamento',
    shortcut: '/pix',
    content: `Chave Pix: aobstinada.a@gmail.com\nOBSTINADA APOIO INTERMEDIAÇÃO E AGENCIAMENTOS DE SERVIÇOS LTDA\nBanco: Infinity Pay`
  },
  {
    title: 'Horário de Funcionamento',
    shortcut: '/horario',
    content: `HORÁRIO DE FUNCIONAMENTO\n\nLOJA 2 - Shopping Stunt\nSeg-Sex: 06h às 15h | Sáb: 08h às 16h | Dom: FECHADO\n\nLOJA 1 - Shopping Juta Mix\nSeg-Sex: 06h às 14h | Sáb: 06h às 13h | Dom: FECHADO`
  },
  {
    title: 'Endereço',
    shortcut: '/endereco',
    content: `Loja 2 - Shopping Stunt\nRua: Conselheiro Belisário, 41 - Box ST2.085 - 2º andar`
  },
  {
    title: 'Mensagem Pós-Compra',
    shortcut: '/obrigada',
    content: `Muito obrigada pela compra, precisando sabe onde nos encontrar!\n\n~ Ao receber seu pacote, grave um vídeo abrindo, e contando as peças, pois essa é uma forma de segurança, tanto para você, quanto para nós. Reclamações feitas sem o vídeo, não serão aceitas.`
  },
];

for (const qr of quickReplies) {
  const [existing] = await db.query('SELECT id FROM wa_quick_replies WHERE shortcut = ?', [qr.shortcut]);
  if (existing.length > 0) {
    await db.query('UPDATE wa_quick_replies SET title=?, content=?, updatedAt=NOW() WHERE shortcut=?',
      [qr.title, qr.content, qr.shortcut]);
    console.log(`✅ Atualizado resposta rápida: ${qr.title}`);
  } else {
    await db.query('INSERT INTO wa_quick_replies (instanceId, title, shortcut, content, active, createdAt, updatedAt) VALUES (NULL, ?, ?, ?, true, NOW(), NOW())',
      [qr.title, qr.shortcut, qr.content]);
    console.log(`✅ Criado resposta rápida: ${qr.title}`);
  }
}

await db.end();
console.log('\n🎉 Base de conhecimento da IA configurada com sucesso!');
