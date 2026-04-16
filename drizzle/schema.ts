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
