import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Clientes da loja (cadastro próprio, sem OAuth)
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  cpf: varchar("cpf", { length: 14 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  // Endereço
  addressZip: varchar("addressZip", { length: 10 }),
  addressStreet: varchar("addressStreet", { length: 255 }),
  addressNumber: varchar("addressNumber", { length: 20 }),
  addressComplement: varchar("addressComplement", { length: 100 }),
  addressNeighborhood: varchar("addressNeighborhood", { length: 100 }),
  addressCity: varchar("addressCity", { length: 100 }),
  addressState: varchar("addressState", { length: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// Produtos
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("originalPrice", { precision: 10, scale: 2 }),
  images: json("images").$type<string[]>().default([]),
  team: varchar("team", { length: 100 }),
  category: mysqlEnum("category", [
    "1linha-nacional",
    "tailandesa-promocao",
    "itens-brasil",
    "conj-calor-nacional",
    "conj-calor-tailandesa",
    "tailandesa",
    "infantil",
    "jogador-tailandesa",
    "retro-tailandesa",
    "conj-frio-tailandes",
    "tailandesa-3xl",
    "tailandesa-4xl"
  ]).default("tailandesa").notNull(),
  gender: mysqlEnum("gender", ["masculino", "feminino", "infantil"]).default("masculino").notNull(),
  // Subcategoria: nome do time ou seleção específica (ex: "Corinthians", "Brasil", "Flamengo")
  subcategory: varchar("subcategory", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  featuredSection: mysqlEnum("featuredSection", ["destaque", "mais-vendidos", "nova-colecao"]),
  reference: varchar("reference", { length: 100 }),
  salesCount: int("salesCount").default(0).notNull(),
  // Integração PDV: código base do produto no sistema PDV (ex: CA-T-TO-ALH-VERM)
  pdvCodigoBase: varchar("pdvCodigoBase", { length: 100 }),
  // Flag de sincronização com o PDV
  pdvSynced: boolean("pdvSynced").default(false).notNull(),
  // Flag de produto novo: true até o admin editar/ativar pela primeira vez na Gestão do Site
  isNewProduct: boolean("isNewProduct").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// Estoque por tamanho
export const productStock = mysqlTable("product_stock", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  // size como varchar livre para aceitar qualquer tamanho do PDV (PP, P, M, G, GG, XGG, XL, 2XL, 3XL, 4XL, 5XL, etc.)
  size: varchar("size", { length: 20 }).notNull(),
  quantity: int("quantity").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductStock = typeof productStock.$inferSelect;
export type InsertProductStock = typeof productStock.$inferInsert;

// Pedidos
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 20 }).notNull().unique(),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 20 }),
  // Endereço
  addressStreet: varchar("addressStreet", { length: 255 }),
  addressNumber: varchar("addressNumber", { length: 20 }),
  addressComplement: varchar("addressComplement", { length: 100 }),
  addressNeighborhood: varchar("addressNeighborhood", { length: 100 }),
  addressCity: varchar("addressCity", { length: 100 }),
  addressState: varchar("addressState", { length: 2 }),
  addressZip: varchar("addressZip", { length: 10 }),
  // Pagamento
  paymentMethod: mysqlEnum("paymentMethod", ["pix", "credit_card", "boleto"]).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "failed", "refunded"]).default("pending").notNull(),
  mercadoPagoId: varchar("mercadoPagoId", { length: 100 }),
  // Valores
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  shippingCost: decimal("shippingCost", { precision: 10, scale: 2 }).default("0").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  // Status do pedido
  status: mysqlEnum("status", ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]).default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

// Itens do pedido
export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId").notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  productImage: text("productImage"),
  size: varchar("size", { length: 10 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

// Banners
export const banners = mysqlTable("banners", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("imageUrl").notNull(),
  linkUrl: varchar("linkUrl", { length: 500 }),
  buttonText: varchar("buttonText", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Banner = typeof banners.$inferSelect;
export type InsertBanner = typeof banners.$inferInsert;

// Configurações da loja
export const storeSettings = mysqlTable("store_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StoreSetting = typeof storeSettings.$inferSelect;

// Usuários admin da loja
export const adminUsers = mysqlTable("admin_users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = typeof adminUsers.$inferInsert;

// ============================================================
// PDV JUMERA — Tabelas isoladas do sistema de vendas
// ============================================================

// Vendedores do PDV
export const pdvSellers = mysqlTable("pdv_sellers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["seller", "admin"]).default("seller").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  /** Ajuste para alinhar PT ao Manus no mês `pontosOffsetMes` (somado à soma de itens no período). */
  pontosOffset: decimal("pontosOffset", { precision: 12, scale: 2 }).default("0").notNull(),
  /** YYYY-MM em que `pontosOffset` entra na pontuação exibida; fora desse mês o offset é ignorado. */
  pontosOffsetMes: varchar("pontosOffsetMes", { length: 7 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PdvSeller = typeof pdvSellers.$inferSelect;
export type InsertPdvSeller = typeof pdvSellers.$inferInsert;

// Produtos do PDV (catálogo próprio, independente da loja)
export const pdvProducts = mysqlTable("pdv_products", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 100 }),
  linha: varchar("linha", { length: 100 }).notNull().default(''),
  modelo: varchar("modelo", { length: 100 }).notNull().default(''),
  time: varchar("time", { length: 100 }).notNull(),
  descricao: varchar("descricao", { length: 255 }),
  tamanho: varchar("tamanho", { length: 20 }).notNull(),
  tipo: varchar("tipo", { length: 100 }).notNull().default('CAMISETA'),
  estoque: int("estoque").default(0).notNull(),
  precoAtacado: decimal("precoAtacado", { precision: 10, scale: 2 }).default("0").notNull(),
  precoVarejo: decimal("precoVarejo", { precision: 10, scale: 2 }).default("0").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // Campos adicionais sincronizados com a planilha
  isSofia: boolean("isSofia").default(false).notNull(),
  fotoUrl: varchar("fotoUrl", { length: 1000 }),          // URL CDN da foto do produto
  temporada: varchar("temporada", { length: 100 }),       // ex: 2024/25
  ptAtacado: decimal("ptAtacado", { precision: 10, scale: 2 }).default("0").notNull(),  // ponto de atacado
  ptVarejo: decimal("ptVarejo", { precision: 10, scale: 2 }).default("0").notNull(),    // ponto de varejo
  custo: decimal("custo", { precision: 10, scale: 2 }).default("0").notNull(),          // custo do produto
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PdvProduct = typeof pdvProducts.$inferSelect;
export type InsertPdvProduct = typeof pdvProducts.$inferInsert;

// Pedidos do PDV
export const pdvOrders = mysqlTable("pdv_orders", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: varchar("pedidoId", { length: 50 }).notNull().unique(), // PED-{timestamp}
  sellerId: int("sellerId").notNull(),
  sellerName: varchar("sellerName", { length: 255 }).notNull(),
  canal: mysqlEnum("canal", ["BALCAO", "WHATSAPP"]).notNull(),
  clienteNome: varchar("clienteNome", { length: 255 }),
  clienteTelefone: varchar("clienteTelefone", { length: 20 }),
  regime: mysqlEnum("regime", ["ATACADO", "VAREJO"]).notNull(),
  totalVarejo: decimal("totalVarejo", { precision: 10, scale: 2 }).default("0").notNull(),
  totalAtacado: decimal("totalAtacado", { precision: 10, scale: 2 }).default("0").notNull(),
  totalAplicado: decimal("totalAplicado", { precision: 10, scale: 2 }).notNull(),
  totalPago: decimal("totalPago", { precision: 10, scale: 2 }).default("0").notNull(),
  totalPendente: decimal("totalPendente", { precision: 10, scale: 2 }).default("0").notNull(),
  justificativa: text("justificativa"),
   isSofia: boolean("isSofia").default(false).notNull(),
  status: mysqlEnum("status", ["PAGO", "PENDENTE", "CANCELADO"]).default("PAGO").notNull(),
  fotoUrl: varchar("fotoUrl", { length: 2000 }),              // URL S3 da foto anexada ao pedido
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PdvOrder = typeof pdvOrders.$inferSelect;
export type InsertPdvOrder = typeof pdvOrders.$inferInsert;

// Itens dos pedidos PDV
export const pdvOrderItems = mysqlTable("pdv_order_items", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: varchar("pedidoId", { length: 50 }).notNull(),
  productId: int("productId"),
  linha: varchar("linha", { length: 50 }),
  modelo: varchar("modelo", { length: 50 }),
  time: varchar("time", { length: 100 }),
  descricao: varchar("descricao", { length: 255 }),
  tipo: varchar("tipo", { length: 100 }),
  tamanho: varchar("tamanho", { length: 20 }).notNull(),
  quantidade: int("quantidade").notNull(),
  precoUnitario: decimal("precoUnitario", { precision: 10, scale: 2 }).notNull(),
  totalItem: decimal("totalItem", { precision: 10, scale: 2 }).notNull(),
  isSofia: boolean("isSofia").default(false).notNull(),
  comissaoUnitaria: decimal("comissaoUnitaria", { precision: 10, scale: 2 }).notNull().default("0.50"),
  comissaoLojaSofia: decimal("comissaoLojaSofia", { precision: 10, scale: 2 }),
  ptAtacado: decimal("ptAtacado", { precision: 10, scale: 2 }).default("0").notNull(),
  ptVarejo: decimal("ptVarejo", { precision: 10, scale: 2 }).default("0").notNull(),
});

export type PdvOrderItem = typeof pdvOrderItems.$inferSelect;
export type InsertPdvOrderItem = typeof pdvOrderItems.$inferInsert;

// Pagamentos dos pedidos PDV
export const pdvOrderPayments = mysqlTable("pdv_order_payments", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: varchar("pedidoId", { length: 50 }).notNull(),
  formaPagamento: mysqlEnum("formaPagamento", ["PIX", "DINHEIRO", "DEBITO", "CREDITO", "DESCONTO_FOLHA"]).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  taxa: decimal("taxa", { precision: 10, scale: 2 }).default("0").notNull(),
  valorLiquido: decimal("valorLiquido", { precision: 10, scale: 2 }).notNull(),
  nomePix: varchar("nomePix", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PdvOrderPayment = typeof pdvOrderPayments.$inferSelect;
export type InsertPdvOrderPayment = typeof pdvOrderPayments.$inferInsert;

// Serviços extras dos pedidos PDV
export const pdvOrderServices = mysqlTable("pdv_order_services", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: varchar("pedidoId", { length: 50 }).notNull(),
  tipo: varchar("tipo", { length: 100 }).notNull(), // CORREIO, CARRETO, CAIXINHA, etc.
  descricao: varchar("descricao", { length: 255 }),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  cep: varchar("cep", { length: 10 }), // CEP do destinatário (obrigatório para CORREIO)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PdvOrderService = typeof pdvOrderServices.$inferSelect;
export type InsertPdvOrderService = typeof pdvOrderServices.$inferInsert;

// Fluxo de caixa PDV (suprimentos e sangrias)
export const pdvCashFlow = mysqlTable("pdv_cash_flow", {
  id: int("id").autoincrement().primaryKey(),
  tipo: mysqlEnum("tipo", ["SUPRIMENTO", "SANGRIA"]).notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(), // positivo = entrada, negativo = saída
  usuario: varchar("usuario", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PdvCashFlow = typeof pdvCashFlow.$inferSelect;
export type InsertPdvCashFlow = typeof pdvCashFlow.$inferInsert;

/** Histórico de conciliações extrato × pedidos (Financeiro). */
export const pdvReconciliations = mysqlTable("pdv_reconciliations", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 40 }).notNull(),
  periodStart: timestamp("periodStart"),
  periodEnd: timestamp("periodEnd"),
  accountLabel: varchar("accountLabel", { length: 255 }),
  createdBy: varchar("createdBy", { length: 255 }),
  totalsJson: json("totalsJson").notNull(),
  resultJson: text("resultJson").notNull(),
  narrativeText: text("narrativeText"),
  reportPdf: text("reportPdf"), // armazenado como LONGBLOB no MySQL (migração runtime)
  originalFileName: varchar("originalFileName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PdvReconciliation = typeof pdvReconciliations.$inferSelect;

// Metas do PDV
export const pdvGoals = mysqlTable("pdv_goals", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(), // BRONZE, PRATA, OURO, META_LOJA
  label: varchar("label", { length: 100 }).notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PdvGoal = typeof pdvGoals.$inferSelect;
export type InsertPdvGoal = typeof pdvGoals.$inferInsert;

// Desconto em Folha — funcionários pegam mercadoria e pagam depois
export const pdvDescontoFolha = mysqlTable("pdv_desconto_folha", {
  id: int("id").autoincrement().primaryKey(),
  sellerId: int("sellerId").notNull(),
  sellerName: varchar("sellerName", { length: 255 }).notNull(),
  pedidoId: varchar("pedidoId", { length: 50 }),
  descricao: varchar("descricao", { length: 500 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  quitado: boolean("quitado").default(false).notNull(),
  quitadoEm: timestamp("quitadoEm"),
  quitadoPor: varchar("quitadoPor", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PdvDescontoFolha = typeof pdvDescontoFolha.$inferSelect;
export type InsertPdvDescontoFolha = typeof pdvDescontoFolha.$inferInsert;

// Configuração do produto Sofia (terceirizado)
export const pdvSofiaConfig = mysqlTable("pdv_sofia_config", {
  id: int("id").autoincrement().primaryKey(),
  comissaoLoja: decimal("comissaoLoja", { precision: 10, scale: 2 }).default("10.00").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PdvSofiaConfig = typeof pdvSofiaConfig.$inferSelect;

// Notificações internas do PDV (sincronização, alertas de estoque/preço)
export const pdvNotifications = mysqlTable("pdv_notifications", {
  id: int("id").autoincrement().primaryKey(),
  tipo: varchar("tipo", { length: 50 }).notNull(), // novo_produto | alteracao_produto | sync_concluido | alerta_estoque
  titulo: varchar("titulo", { length: 255 }).notNull(),
  mensagem: text("mensagem").notNull(),
  lida: boolean("lida").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PdvNotification = typeof pdvNotifications.$inferSelect;
export type InsertPdvNotification = typeof pdvNotifications.$inferInsert;

// ============================================================
// MÓDULO WHATSAPP IA — Jumera Sport
// ============================================================

// Instâncias WhatsApp (uma por número de telefone)
export const waInstances = mysqlTable("wa_instances", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // ex: "Jumera Principal", "Jumera Atacado"
  phone: varchar("phone", { length: 20 }).notNull(), // número com DDI: 5511999999999
  instanceId: varchar("instanceId", { length: 100 }), // ID retornado pelo evocloud.pro
  apiKey: varchar("apiKey", { length: 255 }), // chave da instância no evocloud.pro
  status: mysqlEnum("status", ["disconnected", "connecting", "connected", "error"]).default("disconnected").notNull(),
  webhookUrl: varchar("webhookUrl", { length: 500 }), // URL do webhook configurado
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WaInstance = typeof waInstances.$inferSelect;
export type InsertWaInstance = typeof waInstances.$inferInsert;

// Conversas (uma por contato por instância)
export const waConversations = mysqlTable("wa_conversations", {
  id: int("id").autoincrement().primaryKey(),
  instanceId: int("instanceId").notNull(), // FK -> wa_instances.id
  remoteJid: varchar("remoteJid", { length: 100 }).notNull(), // número do contato: 5511999999999@s.whatsapp.net
  contactName: varchar("contactName", { length: 255 }), // nome salvo no WhatsApp
  contactPhone: varchar("contactPhone", { length: 20 }), // número formatado para exibição
  contactAvatar: text("contactAvatar"), // URL da foto do contato
  lastMessage: text("lastMessage"), // preview da última mensagem
  lastMessageAt: timestamp("lastMessageAt"), // horário da última mensagem
  unreadCount: int("unreadCount").default(0).notNull(), // mensagens não lidas
  aiEnabled: boolean("aiEnabled").default(true).notNull(), // IA ativa nesta conversa?
  aiDisabledBy: varchar("aiDisabledBy", { length: 100 }), // quem desativou a IA
  aiDisabledAt: timestamp("aiDisabledAt"), // quando foi desativada
  status: mysqlEnum("status", ["novo", "em_atendimento", "aguardando", "proposta_enviada", "finalizado", "spam", "intervencao"]).default("novo").notNull(),
  tags: json("tags"), // tags para organização: ["atacado", "cliente_vip", etc]
  notes: text("notes"), // anotações internas sobre o contato
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WaConversation = typeof waConversations.$inferSelect;
export type InsertWaConversation = typeof waConversations.$inferInsert;

// Mensagens de cada conversa
export const waMessages = mysqlTable("wa_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(), // FK -> wa_conversations.id
  instanceId: int("instanceId").notNull(), // FK -> wa_instances.id
  messageId: varchar("messageId", { length: 255 }), // ID da mensagem no WhatsApp
  fromMe: boolean("fromMe").default(false).notNull(), // true = enviada por nós
  senderType: mysqlEnum("senderType", ["ai", "human", "customer"]).default("customer").notNull(),
  senderName: varchar("senderName", { length: 100 }), // nome do atendente ou "IA"
  type: mysqlEnum("type", ["text", "image", "audio", "video", "document", "sticker", "location", "contact", "reaction"]).default("text").notNull(),
  content: text("content"), // texto da mensagem
  mediaUrl: text("mediaUrl"), // URL da mídia (imagem, áudio, etc.)
  mediaStorageKey: varchar("mediaStorageKey", { length: 512 }), // chave relativa no storage (ex.: wa-media/1/abc.jpg)
  mediaCaption: text("mediaCaption"), // legenda da mídia
  quotedMessageId: varchar("quotedMessageId", { length: 255 }), // ID da mensagem citada
  status: mysqlEnum("status", ["pending", "sent", "delivered", "read", "failed"]).default("pending").notNull(),
  timestamp: timestamp("timestamp").notNull(), // horário real da mensagem
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WaMessage = typeof waMessages.$inferSelect;
export type InsertWaMessage = typeof waMessages.$inferInsert;

// Configuração da IA por instância
export const waAiConfig = mysqlTable("wa_ai_config", {
  id: int("id").autoincrement().primaryKey(),
  instanceId: int("instanceId").notNull().unique(), // FK -> wa_instances.id (uma config por instância)
  enabled: boolean("enabled").default(false).notNull(), // IA habilitada globalmente nesta instância?
  aiName: varchar("aiName", { length: 100 }).default("Ju").notNull(), // nome da IA
  personality: text("personality"), // descrição da personalidade e tom de voz
  businessContext: text("businessContext"), // contexto da loja (produtos, preços, horários, etc.)
  greetingMessage: text("greetingMessage"), // mensagem de boas-vindas para novos contatos
  awayMessage: text("awayMessage"), // mensagem fora do horário de atendimento
  awayEnabled: boolean("awayEnabled").default(false).notNull(),
  awayStart: varchar("awayStart", { length: 5 }), // horário início ausência: "18:00"
  awayEnd: varchar("awayEnd", { length: 5 }), // horário fim ausência: "08:00"
  awaySchedule: json("awaySchedule"), // grade por dia da semana (0=dom … 6=sáb); null = só legado awayStart/awayEnd
  catalogLink: text("catalogLink"), // link do catálogo de produtos
  groupLink: text("groupLink"), // link do grupo WhatsApp
  instagramLink: text("instagramLink"), // link do Instagram
  /** Links extras configuráveis (catálogo/grupo/linktree continuam nos campos fixos). JSON: [{ label, url }, ...] */
  extraLinks: json("extraLinks"),
  maxContextMessages: int("maxContextMessages").default(10).notNull(), // quantas mensagens anteriores enviar para a IA
  responseDelayMin: int("responseDelayMin").default(1000).notNull(), // delay mínimo em ms (humanização)
  responseDelayMax: int("responseDelayMax").default(3000).notNull(), // delay máximo em ms
  escalateKeywords: json("escalateKeywords"), // palavras que transferem para humano: ["reclamação", "problema"]
  systemPrompt: text("systemPrompt"), // prompt completo gerado automaticamente
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WaAiConfig = typeof waAiConfig.$inferSelect;
export type InsertWaAiConfig = typeof waAiConfig.$inferInsert;

// Respostas rápidas (templates de mensagem)
export const waQuickReplies = mysqlTable("wa_quick_replies", {
  id: int("id").autoincrement().primaryKey(),
  instanceId: int("instanceId"), // null = global para todas as instâncias
  title: varchar("title", { length: 100 }).notNull(), // título interno: "Enviar catálogo"
  shortcut: varchar("shortcut", { length: 50 }), // atalho: "/catalogo"
  content: text("content").notNull(), // conteúdo da mensagem
  category: varchar("category", { length: 50 }), // categoria: "catalogo", "pagamento", "entrega"
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WaQuickReply = typeof waQuickReplies.$inferSelect;
export type InsertWaQuickReply = typeof waQuickReplies.$inferInsert;

// Log de ações da IA (auditoria)
export const waAiLogs = mysqlTable("wa_ai_logs", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  action: mysqlEnum("action", ["ai_enabled", "ai_disabled", "ai_responded", "escalated_to_human", "error"]).notNull(),
  performedBy: varchar("performedBy", { length: 100 }), // nome do atendente ou "system"
  details: text("details"), // detalhes adicionais
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WaAiLog = typeof waAiLogs.$inferSelect;

// ============================================================
// MÓDULO SOCIAL — Gestão de redes sociais (Instagram + TikTok)
// Fase 1: conteúdo orgânico + análise. Publicação via agregador (Ayrshare).
// ============================================================

// Perfis sociais conectados (um por rede)
export const socialAccounts = mysqlTable("social_accounts", {
  id: int("id").autoincrement().primaryKey(),
  network: mysqlEnum("network", ["instagram", "tiktok"]).notNull(),
  handle: varchar("handle", { length: 120 }), // @perfil
  displayName: varchar("displayName", { length: 255 }),
  // ID do perfil no agregador (Ayrshare profileKey) ou na API oficial
  externalId: varchar("externalId", { length: 255 }),
  // Token de acesso (caso futuramente usemos API oficial direta)
  accessToken: text("accessToken"),
  status: mysqlEnum("status", ["connected", "disconnected", "error"]).default("disconnected").notNull(),
  meta: json("meta"), // dados extras retornados pelo provedor
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type InsertSocialAccount = typeof socialAccounts.$inferInsert;

// Mídias (imagens/vídeos) usadas nos posts — armazenadas no S3/storage
export const socialAssets = mysqlTable("social_assets", {
  id: int("id").autoincrement().primaryKey(),
  storageKey: varchar("storageKey", { length: 512 }), // chave relativa no storage
  url: text("url").notNull(), // URL pública (necessária para publicar via API)
  kind: mysqlEnum("kind", ["image", "video"]).default("image").notNull(),
  source: mysqlEnum("source", ["ai", "upload", "template"]).default("ai").notNull(),
  prompt: text("prompt"), // prompt usado caso gerado por IA
  width: int("width"),
  height: int("height"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SocialAsset = typeof socialAssets.$inferSelect;
export type InsertSocialAsset = typeof socialAssets.$inferInsert;

// Campanhas (agrupador de posts por objetivo/tema + público-alvo sugerido pela IA)
export const socialCampaigns = mysqlTable("social_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  objective: varchar("objective", { length: 120 }), // ex: "alcance", "vendas", "engajamento"
  theme: text("theme"), // tema/briefing da campanha
  targetAudience: json("targetAudience"), // sugestão de público-alvo gerada pela IA
  status: mysqlEnum("status", ["rascunho", "ativa", "encerrada"]).default("rascunho").notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SocialCampaign = typeof socialCampaigns.$inferSelect;
export type InsertSocialCampaign = typeof socialCampaigns.$inferInsert;

// Publicações (rascunho → aprovado → agendado → publicado)
export const socialPosts = mysqlTable("social_posts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }), // título interno (não vai pro post)
  caption: text("caption"), // legenda final
  hashtags: json("hashtags").$type<string[]>().default([]),
  networks: json("networks").$type<string[]>().default([]), // ["instagram", "tiktok"]
  assetId: int("assetId"), // FK -> social_assets.id (imagem/vídeo principal)
  campaignId: int("campaignId"), // FK -> social_campaigns.id (opcional)
  status: mysqlEnum("status", [
    "rascunho",
    "aprovado",
    "agendado",
    "publicando",
    "publicado",
    "falhou",
  ]).default("rascunho").notNull(),
  scheduledAt: timestamp("scheduledAt"), // horário agendado de publicação
  publishedAt: timestamp("publishedAt"), // horário em que foi publicado
  externalPostId: varchar("externalPostId", { length: 255 }), // id retornado pelo agregador
  externalUrl: varchar("externalUrl", { length: 1000 }), // link do post publicado
  error: text("error"), // mensagem de erro caso falhe
  createdBy: varchar("createdBy", { length: 120 }), // nome de quem criou
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = typeof socialPosts.$inferInsert;

// Brand Kit — identidade visual aplicada às artes (single-tenant por enquanto;
// clientKey já previsto para evoluir a multicliente sem migração disruptiva)
export const socialBrandKit = mysqlTable("social_brand_kit", {
  id: int("id").autoincrement().primaryKey(),
  clientKey: varchar("clientKey", { length: 64 }).default("default").notNull().unique(),
  brandName: varchar("brandName", { length: 255 }),
  primaryColor: varchar("primaryColor", { length: 9 }), // hex #RRGGBB(AA)
  secondaryColor: varchar("secondaryColor", { length: 9 }),
  accentColor: varchar("accentColor", { length: 9 }),
  logoUrl: text("logoUrl"),
  logoStorageKey: varchar("logoStorageKey", { length: 512 }),
  fontFamily: varchar("fontFamily", { length: 120 }),
  slogan: varchar("slogan", { length: 255 }),
  tone: text("tone"), // tom de voz
  guidelines: text("guidelines"), // do's & don'ts / instruções de estilo
  referenceImages: json("referenceImages").$type<string[]>().default([]), // URLs de referência de estilo
  logoPosition: mysqlEnum("logoPosition", [
    "top-left", "top-right", "bottom-left", "bottom-right", "center", "none",
  ]).default("bottom-right").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SocialBrandKit = typeof socialBrandKit.$inferSelect;
export type InsertSocialBrandKit = typeof socialBrandKit.$inferInsert;

// Métricas de desempenho por post/rede (coletadas periodicamente)
export const socialMetrics = mysqlTable("social_metrics", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(), // FK -> social_posts.id
  network: mysqlEnum("network", ["instagram", "tiktok"]).notNull(),
  likes: int("likes").default(0).notNull(),
  comments: int("comments").default(0).notNull(),
  shares: int("shares").default(0).notNull(),
  saves: int("saves").default(0).notNull(),
  reach: int("reach").default(0).notNull(),
  impressions: int("impressions").default(0).notNull(),
  views: int("views").default(0).notNull(), // relevante para TikTok
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SocialMetric = typeof socialMetrics.$inferSelect;
export type InsertSocialMetric = typeof socialMetrics.$inferInsert;
