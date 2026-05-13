import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

const tables = [
  {
    name: 'wa_instances',
    sql: `CREATE TABLE IF NOT EXISTS \`wa_instances\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`name\` varchar(100) NOT NULL,
  \`phone\` varchar(20) NOT NULL,
  \`instanceId\` varchar(100),
  \`apiKey\` varchar(255),
  \`status\` enum('disconnected','connecting','connected','error') NOT NULL DEFAULT 'disconnected',
  \`webhookUrl\` varchar(500),
  \`active\` boolean NOT NULL DEFAULT true,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`wa_instances_id\` PRIMARY KEY(\`id\`)
)`
  },
  {
    name: 'wa_conversations',
    sql: `CREATE TABLE IF NOT EXISTS \`wa_conversations\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`instanceId\` int NOT NULL,
  \`remoteJid\` varchar(100) NOT NULL,
  \`contactName\` varchar(255),
  \`contactPhone\` varchar(20),
  \`contactAvatar\` text,
  \`lastMessage\` text,
  \`lastMessageAt\` timestamp NULL,
  \`unreadCount\` int NOT NULL DEFAULT 0,
  \`aiEnabled\` boolean NOT NULL DEFAULT true,
  \`aiDisabledBy\` varchar(100),
  \`aiDisabledAt\` timestamp NULL,
  \`status\` enum('open','resolved','archived') NOT NULL DEFAULT 'open',
  \`tags\` json,
  \`notes\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`wa_conversations_id\` PRIMARY KEY(\`id\`)
)`
  },
  {
    name: 'wa_messages',
    sql: `CREATE TABLE IF NOT EXISTS \`wa_messages\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`conversationId\` int NOT NULL,
  \`instanceId\` int NOT NULL,
  \`messageId\` varchar(255),
  \`fromMe\` boolean NOT NULL DEFAULT false,
  \`senderType\` enum('ai','human','customer') NOT NULL DEFAULT 'customer',
  \`senderName\` varchar(100),
  \`type\` enum('text','image','audio','video','document','sticker','location','contact','reaction') NOT NULL DEFAULT 'text',
  \`content\` text,
  \`mediaUrl\` text,
  \`mediaStorageKey\` varchar(512),
  \`mediaCaption\` text,
  \`quotedMessageId\` varchar(255),
  \`status\` enum('pending','sent','delivered','read','failed') NOT NULL DEFAULT 'pending',
  \`timestamp\` timestamp NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`wa_messages_id\` PRIMARY KEY(\`id\`)
)`
  },
  {
    name: 'wa_ai_config',
    sql: `CREATE TABLE IF NOT EXISTS \`wa_ai_config\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`instanceId\` int NOT NULL,
  \`enabled\` boolean NOT NULL DEFAULT false,
  \`aiName\` varchar(100) NOT NULL DEFAULT 'Ju',
  \`personality\` text,
  \`businessContext\` text,
  \`greetingMessage\` text,
  \`awayMessage\` text,
  \`awayEnabled\` boolean NOT NULL DEFAULT false,
  \`awayStart\` varchar(5),
  \`awayEnd\` varchar(5),
  \`catalogLink\` text,
  \`groupLink\` text,
  \`instagramLink\` text,
  \`maxContextMessages\` int NOT NULL DEFAULT 10,
  \`responseDelayMin\` int NOT NULL DEFAULT 1000,
  \`responseDelayMax\` int NOT NULL DEFAULT 3000,
  \`escalateKeywords\` json,
  \`systemPrompt\` text,
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`wa_ai_config_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`wa_ai_config_instanceId_unique\` UNIQUE(\`instanceId\`)
)`
  },
  {
    name: 'wa_quick_replies',
    sql: `CREATE TABLE IF NOT EXISTS \`wa_quick_replies\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`instanceId\` int,
  \`title\` varchar(100) NOT NULL,
  \`shortcut\` varchar(50),
  \`content\` text NOT NULL,
  \`category\` varchar(50),
  \`active\` boolean NOT NULL DEFAULT true,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`wa_quick_replies_id\` PRIMARY KEY(\`id\`)
)`
  },
  {
    name: 'wa_ai_logs',
    sql: `CREATE TABLE IF NOT EXISTS \`wa_ai_logs\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`conversationId\` int NOT NULL,
  \`action\` enum('ai_enabled','ai_disabled','ai_responded','escalated_to_human','error') NOT NULL,
  \`performedBy\` varchar(100),
  \`details\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`wa_ai_logs_id\` PRIMARY KEY(\`id\`)
)`
  }
];

for (const table of tables) {
  await conn.execute(table.sql);
  console.log(`✅ ${table.name} OK`);
}

// Instalações antigas: coluna mediaStorageKey (idempotente)
try {
  await conn.execute(
    "ALTER TABLE `wa_messages` ADD COLUMN `mediaStorageKey` varchar(512) NULL COMMENT 'Chave no storage (ex.: wa-media/1/abc.jpg)' AFTER `mediaUrl`"
  );
  console.log("✅ wa_messages.mediaStorageKey adicionada");
} catch (e) {
  const code = e && typeof e === "object" && "errno" in e ? e.errno : null;
  const msg = String((e && e.message) || e);
  if (code === 1060 || msg.includes("Duplicate column")) {
    console.log("⏭ wa_messages.mediaStorageKey já existe");
  } else {
    throw e;
  }
}

// Seed: 3 instâncias padrão da Jumera
const [existing] = await conn.execute('SELECT COUNT(*) as cnt FROM wa_instances');
if (existing[0].cnt === 0) {
  await conn.execute(`INSERT INTO wa_instances (name, phone, status, active) VALUES 
    ('Jumera Principal', '5511000000001', 'disconnected', true),
    ('Jumera Atacado', '5511000000002', 'disconnected', true),
    ('Jumera Varejo', '5511000000003', 'disconnected', true)`);
  console.log('✅ Seed: 3 instâncias criadas (números placeholder)');
}

// Seed: respostas rápidas padrão
const [existingQR] = await conn.execute('SELECT COUNT(*) as cnt FROM wa_quick_replies');
if (existingQR[0].cnt === 0) {
  await conn.execute(`INSERT INTO wa_quick_replies (title, shortcut, content, category) VALUES 
    ('Enviar Catálogo', '/catalogo', 'Olá! Aqui está nosso catálogo completo com todos os produtos disponíveis 👕⚽\n\n📋 Acesse: [LINK_CATALOGO]\n\nQualquer dúvida estou à disposição! 😊', 'catalogo'),
    ('Entrar no Grupo', '/grupo', 'Olá! Para entrar no nosso grupo exclusivo com novidades e promoções, acesse o link abaixo:\n\n👥 [LINK_GRUPO]\n\nLá você fica por dentro de tudo em primeira mão! 🔥', 'grupo'),
    ('Formas de Pagamento', '/pagamento', 'Aceitamos as seguintes formas de pagamento:\n\n💳 Cartão de crédito/débito\n💰 PIX (desconto especial)\n🏦 Transferência bancária\n📄 Boleto bancário\n\nQual prefere? 😊', 'pagamento'),
    ('Prazo de Entrega', '/entrega', 'O prazo de entrega varia conforme sua região:\n\n📦 Capitais: 3-5 dias úteis\n🚚 Interior: 5-8 dias úteis\n⚡ Retirada em mãos: combinar\n\nAssim que o pedido for enviado, você recebe o código de rastreio! 📬', 'entrega'),
    ('Política de Troca', '/troca', 'Nossa política de trocas:\n\n✅ Prazo: até 7 dias após recebimento\n✅ Produto sem uso e com etiqueta\n✅ Embalagem original\n\nPara solicitar, entre em contato informando seu pedido e o motivo da troca. Vamos resolver rapidinho! 😊', 'troca'),
    ('Atacado - Mínimo', '/atacado', 'Para compras no atacado:\n\n📦 Mínimo: 6 peças por modelo\n💰 Preços especiais por quantidade\n🎁 Condições diferenciadas para revendedores\n\nQuer saber mais sobre nossas condições de atacado? Me conta o que você precisa! 🤝', 'atacado')`);
  console.log('✅ Seed: 6 respostas rápidas padrão criadas');
}

await conn.end();
console.log('\n🚀 Migration do módulo WhatsApp IA concluída com sucesso!');
