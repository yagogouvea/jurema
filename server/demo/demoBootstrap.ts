/**
 * Bootstrap exclusivo do ambiente de DEMONSTRAÇÃO (Street Sportes).
 *
 * Só roda quando DEMO_MODE=1|true|yes.
 * Nunca deve ser ativado no projeto de produção da cliente.
 */
import mysql from "mysql2/promise";

function isDemoMode(): boolean {
  const v = String(process.env.DEMO_MODE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Fotos de catálogo servidas por client/public/demo-produtos. */
const DEMO_PHOTO_BASE = "/demo-produtos";

const DEMO_PHOTO_BY_TIME: Record<string, string> = {
  Flamengo: "jersey-red-black.jpg",
  Corinthians: "jersey-white-black.jpg",
  Palmeiras: "jersey-green.jpg",
  Brasil: "jersey-yellow.jpg",
  "São Paulo": "jersey-retro-white.jpg",
  Santos: "jersey-white-stripes.jpg",
  "Real Madrid": "jersey-all-white.jpg",
  Barcelona: "jersey-blue-garnet.jpg",
};

const STORE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT NOT NULL,
  openId VARCHAR(64) NOT NULL,
  name TEXT NULL,
  email VARCHAR(320) NULL,
  loginMethod VARCHAR(64) NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT users_id PRIMARY KEY(id),
  CONSTRAINT users_openId_unique UNIQUE(openId)
);

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL,
  cpf VARCHAR(14) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  passwordHash VARCHAR(255) NOT NULL,
  addressZip VARCHAR(10) NULL,
  addressStreet VARCHAR(255) NULL,
  addressNumber VARCHAR(20) NULL,
  addressComplement VARCHAR(100) NULL,
  addressNeighborhood VARCHAR(100) NULL,
  addressCity VARCHAR(100) NULL,
  addressState VARCHAR(2) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT customers_id PRIMARY KEY(id),
  CONSTRAINT customers_email_unique UNIQUE(email),
  CONSTRAINT customers_cpf_unique UNIQUE(cpf)
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT NULL,
  price DECIMAL(10,2) NOT NULL,
  originalPrice DECIMAL(10,2) NULL,
  images JSON NULL,
  team VARCHAR(100) NULL,
  category ENUM(
    '1linha-nacional','tailandesa-promocao','itens-brasil','conj-calor-nacional',
    'conj-calor-tailandesa','tailandesa','infantil','jogador-tailandesa',
    'retro-tailandesa','conj-frio-tailandes','tailandesa-3xl','tailandesa-4xl'
  ) NOT NULL DEFAULT 'tailandesa',
  gender ENUM('masculino','feminino','infantil') NOT NULL DEFAULT 'masculino',
  subcategory VARCHAR(100) NULL,
  isActive BOOLEAN NOT NULL DEFAULT true,
  isFeatured BOOLEAN NOT NULL DEFAULT false,
  featuredSection ENUM('destaque','mais-vendidos','nova-colecao') NULL,
  reference VARCHAR(100) NULL,
  salesCount INT NOT NULL DEFAULT 0,
  pdvCodigoBase VARCHAR(100) NULL,
  pdvSynced BOOLEAN NOT NULL DEFAULT false,
  isNewProduct BOOLEAN NOT NULL DEFAULT true,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT products_id PRIMARY KEY(id),
  CONSTRAINT products_slug_unique UNIQUE(slug)
);

CREATE TABLE IF NOT EXISTS product_stock (
  id INT AUTO_INCREMENT NOT NULL,
  productId INT NOT NULL,
  size VARCHAR(20) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT product_stock_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT NOT NULL,
  orderNumber VARCHAR(20) NOT NULL,
  customerName VARCHAR(255) NOT NULL,
  customerEmail VARCHAR(320) NOT NULL,
  customerPhone VARCHAR(20) NULL,
  addressStreet VARCHAR(255) NULL,
  addressNumber VARCHAR(20) NULL,
  addressComplement VARCHAR(100) NULL,
  addressNeighborhood VARCHAR(100) NULL,
  addressCity VARCHAR(100) NULL,
  addressState VARCHAR(2) NULL,
  addressZip VARCHAR(10) NULL,
  paymentMethod ENUM('pix','credit_card','boleto') NOT NULL,
  paymentStatus ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  mercadoPagoId VARCHAR(100) NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  shippingCost DECIMAL(10,2) NOT NULL DEFAULT '0',
  total DECIMAL(10,2) NOT NULL,
  status ENUM('pending','confirmed','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT orders_id PRIMARY KEY(id),
  CONSTRAINT orders_orderNumber_unique UNIQUE(orderNumber)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT NOT NULL,
  orderId INT NOT NULL,
  productId INT NOT NULL,
  productName VARCHAR(255) NOT NULL,
  productImage TEXT NULL,
  size VARCHAR(10) NOT NULL,
  quantity INT NOT NULL,
  unitPrice DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  CONSTRAINT order_items_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS banners (
  id INT AUTO_INCREMENT NOT NULL,
  title VARCHAR(255) NOT NULL,
  subtitle TEXT NULL,
  imageUrl TEXT NOT NULL,
  linkUrl VARCHAR(500) NULL,
  buttonText VARCHAR(100) NULL,
  isActive BOOLEAN NOT NULL DEFAULT true,
  sortOrder INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT banners_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS store_settings (
  id INT AUTO_INCREMENT NOT NULL,
  \`key\` VARCHAR(100) NOT NULL,
  value TEXT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT store_settings_id PRIMARY KEY(id),
  CONSTRAINT store_settings_key_unique UNIQUE(\`key\`)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT NOT NULL,
  username VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT admin_users_id PRIMARY KEY(id),
  CONSTRAINT admin_users_username_unique UNIQUE(username)
);
`;

async function execStatements(db: mysql.Connection, sql: string): Promise<void> {
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
}

async function countRows(db: mysql.Connection, table: string): Promise<number> {
  const [rows] = await db.execute(`SELECT COUNT(*) as c FROM ${table}`);
  return Number((rows as { c: number }[])[0]?.c ?? 0);
}

async function seedStore(db: mysql.Connection): Promise<void> {
  // Admin loja: admin / demo123
  if ((await countRows(db, "admin_users")) === 0) {
    await db.execute(
      "INSERT INTO admin_users (username, password, name) VALUES (?, ?, ?)",
      [
        "admin",
        "$2b$10$ZdVTVXL5vUzdp2Fto4A5s.Ba.AiD6sGrsXB6T03bdC/AO1RNCw./q",
        "Admin Demo",
      ]
    );
  }

  const settings: Array<[string, string]> = [
    ["store_name", "Street Sportes"],
    ["store_phone", "11999990000"],
    ["store_email", "contato@streetsportes.com.br"],
    ["store_instagram", "https://instagram.com/streetsportes"],
    ["store_facebook", "https://facebook.com/streetsportes"],
    ["whatsapp_number", "5511999990000"],
  ];
  for (const [key, value] of settings) {
    await db.execute(
      "INSERT INTO store_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [key, value]
    );
  }

  if ((await countRows(db, "banners")) === 0) {
    await db.execute(
      `INSERT INTO banners (title, subtitle, imageUrl, linkUrl, buttonText, isActive, sortOrder) VALUES
       (?, ?, ?, ?, ?, 1, 0),
       (?, ?, ?, ?, ?, 1, 1)`,
      [
        "Street Sportes",
        "Camisas oficiais e promoção de lançamento",
        "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1600&q=80",
        "/produtos",
        "Ver catálogo",
        "Nova Coleção 25/26",
        "Qualidade premium para o seu time",
        "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1600&q=80",
        "/produtos",
        "Comprar agora",
      ]
    );
  }

  if ((await countRows(db, "products")) === 0) {
    const siteProducts = [
      {
        name: "Camisa Flamengo Home 25/26",
        slug: "camisa-flamengo-home-2526",
        team: "Flamengo",
        price: "389.90",
        original: "449.90",
        featured: "destaque",
        ref: "SS-FLA-HOM",
      },
      {
        name: "Camisa Corinthians Away 25/26",
        slug: "camisa-corinthians-away-2526",
        team: "Corinthians",
        price: "369.90",
        original: "429.90",
        featured: "mais-vendidos",
        ref: "SS-COR-AWY",
      },
      {
        name: "Camisa Brasil Treino",
        slug: "camisa-brasil-treino",
        team: "Brasil",
        price: "299.90",
        original: null,
        featured: "nova-colecao",
        ref: "SS-BRA-TRN",
      },
      {
        name: "Camisa Palmeiras Home 25/26",
        slug: "camisa-palmeiras-home-2526",
        team: "Palmeiras",
        price: "389.90",
        original: "449.90",
        featured: null,
        ref: "SS-PAL-HOM",
      },
      {
        name: "Camisa São Paulo Retro",
        slug: "camisa-sao-paulo-retro",
        team: "São Paulo",
        price: "349.90",
        original: "399.90",
        featured: null,
        ref: "SS-SAO-RET",
      },
    ];

    for (const p of siteProducts) {
      const [result] = await db.execute(
        `INSERT INTO products
          (name, slug, description, price, originalPrice, images, team, category, gender,
           subcategory, isActive, isFeatured, featuredSection, reference, salesCount, pdvSynced, isNewProduct)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'tailandesa', 'masculino', ?, 1, ?, ?, ?, ?, 0, 0)`,
        [
          p.name,
          p.slug,
          `${p.name} - demonstracao Street Sportes.`,
          p.price,
          p.original,
          JSON.stringify([
            `${DEMO_PHOTO_BASE}/${DEMO_PHOTO_BY_TIME[p.team] ?? "jersey-red-black.jpg"}`,
          ]),
          p.team,
          p.team,
          p.featured ? 1 : 0,
          p.featured,
          p.ref,
          Math.floor(Math.random() * 180) + 40,
        ]
      );
      const productId = Number((result as { insertId?: number }).insertId);
      for (const size of ["P", "M", "G", "GG"]) {
        await db.execute(
          "INSERT INTO product_stock (productId, size, quantity) VALUES (?, ?, ?)",
          [productId, size, 40 + Math.floor(Math.random() * 80)]
        );
      }
    }
  }
}

async function seedFakeSellers(db: mysql.Connection): Promise<void> {
  // SHA256("demo123" + "pdv_salt_jumera")
  const DEMO_PASS = "5308d5b0188ce81e7d3cb567aa997270c4e42616df77f400ffd2b3595991af15";
  const sellers = [
    { name: "Lucas Almeida", username: "lucas", role: "seller" },
    { name: "Fernanda Costa", username: "fernanda", role: "seller" },
    { name: "Pedro Martins", username: "pedro", role: "seller" },
    { name: "Juliana Rocha", username: "juliana", role: "seller" },
    { name: "Camila Ferreira", username: "camila", role: "admin" },
  ];

  const [rows] = await db.execute("SELECT id FROM pdv_sellers ORDER BY id ASC");
  const ids = (rows as { id: number }[]).map((r) => r.id);

  if (ids.length === 0) {
    for (const s of sellers) {
      await db.execute(
        "INSERT INTO pdv_sellers (name, username, passwordHash, role, isActive) VALUES (?, ?, ?, ?, 1)",
        [s.name, s.username, DEMO_PASS, s.role]
      );
    }
    return;
  }

  for (let i = 0; i < Math.min(ids.length, sellers.length); i++) {
    await db.execute(
      "UPDATE pdv_sellers SET name=?, username=?, passwordHash=?, role=?, isActive=1 WHERE id=?",
      [sellers[i].name, sellers[i].username, DEMO_PASS, sellers[i].role, ids[i]]
    );
  }
  // Remove vendedores extras além dos 5 fakes (se houver)
  if (ids.length > sellers.length) {
    const extra = ids.slice(sellers.length);
    await db.execute(
      `UPDATE pdv_sellers SET isActive=0 WHERE id IN (${extra.map(() => "?").join(",")})`,
      extra
    );
  }
}

async function seedPdvExtras(db: mysql.Connection): Promise<void> {
  await seedFakeSellers(db);

  const configs: Array<[string, string]> = [
    ["nome_loja", "Street Sportes"],
    ["whatsapp_recibo", "5511999990000"],
    ["taxa_debito", "2.5"],
    ["taxa_credito", "4.5"],
    ["min_atacado", "6"],
    ["comissao_peca", "1.50"],
    ["notif_pedido_telefone", "5511999990000"],
  ];
  for (const [key, value] of configs) {
    await db.execute(
      "INSERT INTO pdv_config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [key, value]
    );
  }

  const goals = [
    { key: "BRONZE", label: "Bronze", value: 48000 },
    { key: "PRATA", label: "Prata", value: 82000 },
    { key: "OURO", label: "Ouro", value: 135000 },
    { key: "META_LOJA", label: "Meta Loja", value: 420000 },
  ];
  for (const g of goals) {
    await db.execute(
      "INSERT INTO pdv_goals (`key`, label, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE label=VALUES(label), value=VALUES(value)",
      [g.key, g.label, g.value]
    );
  }

  const [sofiaRows] = await db.execute("SELECT COUNT(*) as c FROM pdv_sofia_config");
  if (Number((sofiaRows as { c: number }[])[0]?.c ?? 0) === 0) {
    await db.execute("INSERT INTO pdv_sofia_config (comissaoLoja) VALUES (10.00)");
  }

  // Produtos PDV: recria com valores maiores se ainda estiverem baixos / vazios
  const [priceCheck] = await db.execute(
    "SELECT COUNT(*) as c FROM pdv_products WHERE precoVarejo >= 250"
  );
  const hasBigPrices = Number((priceCheck as { c: number }[])[0]?.c ?? 0) > 0;

  if ((await countRows(db, "pdv_products")) === 0 || !hasBigPrices) {
    // Limpa pedidos demo antigos antes de trocar catálogo
    await db.execute("DELETE FROM pdv_order_payments WHERE pedidoId LIKE 'DEMO-%'");
    await db.execute("DELETE FROM pdv_order_items WHERE pedidoId LIKE 'DEMO-%'");
    await db.execute("DELETE FROM pdv_order_services WHERE pedidoId LIKE 'DEMO-%'");
    await db.execute("DELETE FROM pdv_orders WHERE pedidoId LIKE 'DEMO-%'");
    await db.execute("DELETE FROM pdv_products");

    const models = [
      { time: "Flamengo", modelo: "Home", linha: "TAILANDESA", codigoBase: "CA-T-TO-FLA-HOM", atacado: 185, varejo: 349.9, foto: "jersey-red-black.jpg" },
      { time: "Corinthians", modelo: "Away", linha: "TAILANDESA", codigoBase: "CA-T-TO-COR-AWY", atacado: 175, varejo: 329.9, foto: "jersey-white-black.jpg" },
      { time: "Palmeiras", modelo: "Home", linha: "TAILANDESA", codigoBase: "CA-T-TO-PAL-HOM", atacado: 185, varejo: 349.9, foto: "jersey-green.jpg" },
      { time: "Brasil", modelo: "Treino", linha: "NACIONAL", codigoBase: "CA-N-TO-BRA-TRN", atacado: 145, varejo: 279.9, foto: "jersey-yellow.jpg" },
      { time: "São Paulo", modelo: "Retro", linha: "TAILANDESA", codigoBase: "CA-T-TO-SAO-RET", atacado: 165, varejo: 319.9, foto: "jersey-retro-white.jpg" },
      { time: "Santos", modelo: "Home", linha: "TAILANDESA", codigoBase: "CA-T-TO-SAN-HOM", atacado: 175, varejo: 329.9, foto: "jersey-white-stripes.jpg" },
      { time: "Real Madrid", modelo: "Home", linha: "TAILANDESA", codigoBase: "CA-T-TO-RMA-HOM", atacado: 210, varejo: 399.9, foto: "jersey-all-white.jpg" },
      { time: "Barcelona", modelo: "Away", linha: "TAILANDESA", codigoBase: "CA-T-TO-BAR-AWY", atacado: 205, varejo: 389.9, foto: "jersey-blue-garnet.jpg" },
    ];
    const sizes = ["P", "M", "G", "GG", "XG"];
    for (const m of models) {
      for (const tamanho of sizes) {
        await db.execute(
          `INSERT INTO pdv_products
            (codigo, linha, modelo, time, descricao, tamanho, tipo, estoque,
             precoAtacado, precoVarejo, isActive, isSofia, temporada, ptAtacado, ptVarejo, custo, fotoUrl)
           VALUES (?, ?, ?, ?, ?, ?, 'CAMISETA', ?, ?, ?, 1, 0, '2025/26', ?, ?, ?, ?)`,
          [
            `${m.codigoBase}-${tamanho}`,
            m.linha,
            m.modelo,
            m.time,
            `Camisa ${m.time} ${m.modelo}`,
            tamanho,
            90 + Math.floor(Math.random() * 160),
            m.atacado,
            m.varejo,
            3.5,
            6.0,
            Math.round(m.atacado * 0.52 * 100) / 100,
            `${DEMO_PHOTO_BASE}/${m.foto}`,
          ]
        );
      }
    }
  }

  // Garante foto mesmo em bancos que já tinham produtos sem fotoUrl
  for (const [time, foto] of Object.entries(DEMO_PHOTO_BY_TIME)) {
    await db.execute(
      "UPDATE pdv_products SET fotoUrl = ? WHERE time = ? AND (fotoUrl IS NULL OR fotoUrl = '')",
      [`${DEMO_PHOTO_BASE}/${foto}`, time]
    );
  }

  // O router usa colunas em inglês (type/title/content/isRead).
  await db.execute("DROP TABLE IF EXISTS pdv_notifications");
  await db.execute(`
    CREATE TABLE pdv_notifications (
      id INT AUTO_INCREMENT NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      isRead BOOLEAN NOT NULL DEFAULT false,
      createdAt TIMESTAMP NOT NULL DEFAULT (now()),
      CONSTRAINT pdv_notifications_id PRIMARY KEY(id)
    )
  `);
  await db.execute(
    `INSERT INTO pdv_notifications (type, title, content, isRead) VALUES
     ('sync_concluido', 'Catálogo atualizado', 'Mais de 40 variantes com estoque alto para a demonstração.', 0),
     ('novo_produto', 'Linha europeia no PDV', 'Real Madrid e Barcelona disponíveis com preços premium.', 0)`
  );

  // Recria pedidos demo (sempre) para refletir vendedores/valores novos
  await db.execute("DELETE FROM pdv_order_payments WHERE pedidoId LIKE 'DEMO-%'");
  await db.execute("DELETE FROM pdv_order_items WHERE pedidoId LIKE 'DEMO-%'");
  await db.execute("DELETE FROM pdv_order_services WHERE pedidoId LIKE 'DEMO-%'");
  await db.execute("DELETE FROM pdv_orders WHERE pedidoId LIKE 'DEMO-%'");

  {
    const [sellerRows] = await db.execute(
      "SELECT id, name FROM pdv_sellers WHERE isActive = 1 ORDER BY id"
    );
    const sellers = sellerRows as { id: number; name: string }[];
    const [prodRows] = await db.execute(
      "SELECT id, codigo, linha, modelo, time, descricao, tamanho, precoVarejo, precoAtacado, ptAtacado, ptVarejo FROM pdv_products WHERE isActive = 1 ORDER BY id"
    );
    const products = prodRows as any[];

    if (sellers.length && products.length) {
      const today = new Date();
      const demoOrders = [
        { offsetDays: 0, regime: "VAREJO" as const, canal: "BALCAO" as const, cliente: "Ana Beatriz Souza", quemPagou: "ANA BEATRIZ SOUZA", forma: "PIX" as const, qtyMult: 3 },
        { offsetDays: 0, regime: "ATACADO" as const, canal: "WHATSAPP" as const, cliente: "Arena Sports Ltda", quemPagou: "MARCOS VINICIUS OLIVEIRA", forma: "PIX" as const, qtyMult: 8 },
        { offsetDays: 1, regime: "VAREJO" as const, canal: "BALCAO" as const, cliente: "Carlos Eduardo Lima", quemPagou: "CARLOS EDUARDO LIMA", forma: "DINHEIRO" as const, qtyMult: 4 },
        { offsetDays: 1, regime: "ATACADO" as const, canal: "WHATSAPP" as const, cliente: "Mega Futebol Store", quemPagou: "PATRICIA HELENA SANTOS", forma: "CREDITO" as const, qtyMult: 12 },
        { offsetDays: 2, regime: "ATACADO" as const, canal: "WHATSAPP" as const, cliente: "Sport Shop Recife", quemPagou: "ROBERTO CARLOS NUNES", forma: "PIX" as const, qtyMult: 10 },
        { offsetDays: 3, regime: "VAREJO" as const, canal: "BALCAO" as const, cliente: "Beatriz Nunes", quemPagou: "BEATRIZ NUNES", forma: "DEBITO" as const, qtyMult: 3 },
        { offsetDays: 4, regime: "ATACADO" as const, canal: "WHATSAPP" as const, cliente: "Camisas & Cia", quemPagou: "FELIPE AUGUSTO DIAS", forma: "PIX" as const, qtyMult: 15 },
        { offsetDays: 5, regime: "VAREJO" as const, canal: "BALCAO" as const, cliente: "Rafael Dias", quemPagou: "RAFAEL DIAS", forma: "PIX" as const, qtyMult: 5 },
      ];

      for (let i = 0; i < demoOrders.length; i++) {
        const o = demoOrders[i];
        const seller = sellers[i % sellers.length];
        const d = new Date(today);
        d.setDate(d.getDate() - o.offsetDays);
        d.setHours(9 + (i % 8), 10 + i * 4, 0, 0);
        const pedidoId = `DEMO-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${i + 1}`;
        const itemCount = o.regime === "ATACADO" ? 6 : 3;
        const start = (i * 3) % Math.max(1, products.length - itemCount);
        const chosen = products.slice(start, start + itemCount);
        if (!chosen.length) continue;

        let totalVarejo = 0;
        let totalAtacado = 0;
        const items: Array<{
          productId: number;
          linha: string;
          modelo: string;
          time: string;
          descricao: string;
          tamanho: string;
          qty: number;
          preco: number;
          total: number;
          ptA: number;
          ptV: number;
        }> = [];

        for (const p of chosen) {
          const qty = o.regime === "ATACADO" ? o.qtyMult : Math.max(1, Math.floor(o.qtyMult / 2));
          const preco =
            o.regime === "ATACADO"
              ? parseFloat(p.precoAtacado) || 0
              : parseFloat(p.precoVarejo) || 0;
          const total = preco * qty;
          totalVarejo += (parseFloat(p.precoVarejo) || 0) * qty;
          totalAtacado += (parseFloat(p.precoAtacado) || 0) * qty;
          items.push({
            productId: p.id,
            linha: p.linha,
            modelo: p.modelo,
            time: p.time,
            descricao: p.descricao || `${p.time} ${p.modelo}`,
            tamanho: p.tamanho,
            qty,
            preco,
            total,
            ptA: parseFloat(p.ptAtacado) || 3.5,
            ptV: parseFloat(p.ptVarejo) || 6,
          });
        }

        const totalAplicado = o.regime === "ATACADO" ? totalAtacado : totalVarejo;
        const createdAt = d.toISOString().slice(0, 19).replace("T", " ");

        await db.execute(
          `INSERT INTO pdv_orders
            (pedidoId, sellerId, sellerName, canal, clienteNome, clienteTelefone, regime,
             totalVarejo, totalAtacado, totalAplicado, totalPago, totalPendente, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PAGO', ?, ?)`,
          [
            pedidoId,
            seller.id,
            seller.name,
            o.canal,
            o.cliente,
            "11988887777",
            o.regime,
            totalVarejo.toFixed(2),
            totalAtacado.toFixed(2),
            totalAplicado.toFixed(2),
            totalAplicado.toFixed(2),
            createdAt,
            createdAt,
          ]
        );

        for (const it of items) {
          await db.execute(
            `INSERT INTO pdv_order_items
              (pedidoId, productId, linha, modelo, time, descricao, tipo, tamanho, quantidade,
               precoUnitario, totalItem, comissaoUnitaria, ptAtacado, ptVarejo)
             VALUES (?, ?, ?, ?, ?, ?, 'CAMISETA', ?, ?, ?, ?, 1.50, ?, ?)`,
            [
              pedidoId,
              it.productId,
              it.linha,
              it.modelo,
              it.time,
              it.descricao,
              it.tamanho,
              it.qty,
              it.preco.toFixed(2),
              it.total.toFixed(2),
              it.ptA,
              it.ptV,
            ]
          );
        }

        const taxa =
          o.forma === "CREDITO" ? Number((totalAplicado * 0.045).toFixed(2))
          : o.forma === "DEBITO" ? Number((totalAplicado * 0.025).toFixed(2))
          : 0;

        await db.execute(
          `INSERT INTO pdv_order_payments
            (pedidoId, formaPagamento, valor, taxa, valorLiquido, nomePix, obsPagamento, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pedidoId,
            o.forma,
            totalAplicado.toFixed(2),
            taxa.toFixed(2),
            (totalAplicado - taxa).toFixed(2),
            o.quemPagou,
            "Pedido demonstracao Street Sportes",
            createdAt,
          ]
        );
      }
    }
  }

  await db.execute("DELETE FROM pdv_cash_flow");
  await db.execute(
    `INSERT INTO pdv_cash_flow (tipo, descricao, valor, usuario) VALUES
     ('SUPRIMENTO', 'Abertura de caixa demo', 2500.00, 'Camila Ferreira'),
     ('SUPRIMENTO', 'Reforco meio do dia', 1800.00, 'Lucas Almeida'),
     ('SANGRIA', 'Retirada para deposito', -3200.00, 'Camila Ferreira')`
  );
}

const WA_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS wa_instances (
  id INT AUTO_INCREMENT NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  instanceId VARCHAR(100) NULL,
  apiKey VARCHAR(255) NULL,
  status ENUM('disconnected','connecting','connected','error') NOT NULL DEFAULT 'disconnected',
  webhookUrl VARCHAR(500) NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT wa_instances_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS wa_conversations (
  id INT AUTO_INCREMENT NOT NULL,
  instanceId INT NOT NULL,
  remoteJid VARCHAR(100) NOT NULL,
  contactName VARCHAR(255) NULL,
  contactPhone VARCHAR(20) NULL,
  contactAvatar TEXT NULL,
  lastMessage TEXT NULL,
  lastMessageAt TIMESTAMP NULL,
  unreadCount INT NOT NULL DEFAULT 0,
  aiEnabled BOOLEAN NOT NULL DEFAULT true,
  aiDisabledBy VARCHAR(100) NULL,
  aiDisabledAt TIMESTAMP NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'novo',
  tags JSON NULL,
  notes TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT wa_conversations_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS wa_messages (
  id INT AUTO_INCREMENT NOT NULL,
  conversationId INT NOT NULL,
  instanceId INT NOT NULL,
  messageId VARCHAR(255) NULL,
  fromMe BOOLEAN NOT NULL DEFAULT false,
  senderType ENUM('ai','human','customer') NOT NULL DEFAULT 'customer',
  senderName VARCHAR(100) NULL,
  type ENUM('text','image','audio','video','document','sticker','location','contact','reaction') NOT NULL DEFAULT 'text',
  content TEXT NULL,
  mediaUrl TEXT NULL,
  mediaStorageKey VARCHAR(512) NULL,
  mediaCaption TEXT NULL,
  quotedMessageId VARCHAR(255) NULL,
  status ENUM('pending','sent','delivered','read','failed') NOT NULL DEFAULT 'pending',
  timestamp TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT wa_messages_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS wa_ai_config (
  id INT AUTO_INCREMENT NOT NULL,
  instanceId INT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  aiName VARCHAR(100) NOT NULL DEFAULT 'Ju',
  personality TEXT NULL,
  businessContext TEXT NULL,
  greetingMessage TEXT NULL,
  awayMessage TEXT NULL,
  awayEnabled BOOLEAN NOT NULL DEFAULT false,
  awayStart VARCHAR(5) NULL,
  awayEnd VARCHAR(5) NULL,
  awaySchedule JSON NULL,
  catalogLink TEXT NULL,
  groupLink TEXT NULL,
  instagramLink TEXT NULL,
  extraLinks JSON NULL,
  maxContextMessages INT NOT NULL DEFAULT 10,
  responseDelayMin INT NOT NULL DEFAULT 1000,
  responseDelayMax INT NOT NULL DEFAULT 3000,
  escalateKeywords JSON NULL,
  systemPrompt TEXT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT wa_ai_config_id PRIMARY KEY(id),
  CONSTRAINT wa_ai_config_instanceId_unique UNIQUE(instanceId)
);

CREATE TABLE IF NOT EXISTS wa_quick_replies (
  id INT AUTO_INCREMENT NOT NULL,
  instanceId INT NULL,
  title VARCHAR(100) NOT NULL,
  shortcut VARCHAR(50) NULL,
  content TEXT NOT NULL,
  category VARCHAR(50) NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  updatedAt TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT wa_quick_replies_id PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS wa_ai_logs (
  id INT AUTO_INCREMENT NOT NULL,
  conversationId INT NOT NULL,
  action ENUM('ai_enabled','ai_disabled','ai_responded','escalated_to_human','error') NOT NULL,
  performedBy VARCHAR(100) NULL,
  details TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT (now()),
  CONSTRAINT wa_ai_logs_id PRIMARY KEY(id)
);
`;

async function seedWhatsAppDemo(db: mysql.Connection): Promise<void> {
  await execStatements(db, WA_SCHEMA_SQL);

  if ((await countRows(db, "wa_instances")) === 0) {
    const [ins] = await db.execute(
      `INSERT INTO wa_instances (name, phone, instanceId, apiKey, status, active)
       VALUES ('Street Sportes Principal', '5511999990000', 'demo-street-1', 'demo-key', 'connected', 1)`
    );
    const instancePk = Number((ins as { insertId?: number }).insertId);
    // Faz o JOIN do router (i.instanceId = c.instanceId) funcionar com FK numérica
    await db.execute("UPDATE wa_instances SET instanceId = ? WHERE id = ?", [String(instancePk), instancePk]);

    await db.execute(
      `INSERT INTO wa_ai_config
        (instanceId, enabled, aiName, personality, businessContext, greetingMessage, catalogLink, instagramLink)
       VALUES (?, 1, 'Lia', ?, ?, ?, ?, ?)`,
      [
        instancePk,
        "Atendente amigavel e objetiva da Street Sportes. Responde curto, com precos e disponibilidade.",
        "Loja de camisas de futebol Street Sportes. Atacado a partir de 6 pecas. Entrega em todo Brasil.",
        "Ola! Sou a Lia da Street Sportes. Quer ver o catalogo ou ja sabe o time?",
        "https://street-sportes-production.up.railway.app/produtos",
        "https://instagram.com/streetsportes",
      ]
    );

    await db.execute(
      `INSERT INTO wa_quick_replies (instanceId, title, shortcut, content, category, active) VALUES
       (?, 'Catalogo', '/catalogo', 'Segue nosso catalogo: https://street-sportes-production.up.railway.app/produtos', 'catalogo', 1),
       (?, 'Atacado', '/atacado', 'No atacado o minimo e 6 pecas. Posso montar um kit com os times que voce quiser!', 'pagamento', 1)`,
      [instancePk, instancePk]
    );
  }

  const [instRows] = await db.execute("SELECT id FROM wa_instances ORDER BY id LIMIT 1");
  const instanceId = Number((instRows as { id: number }[])[0]?.id);
  if (!instanceId) return;

  // Garante instanceId string alinhado ao id (para o JOIN do listConversations)
  await db.execute("UPDATE wa_instances SET instanceId = ? WHERE id = ?", [String(instanceId), instanceId]);

  if ((await countRows(db, "wa_conversations")) > 0) return;

  const chats: Array<{
    name: string;
    phone: string;
    status: string;
    unread: number;
    ai: boolean;
    messages: Array<{ fromMe: boolean; senderType: "ai" | "human" | "customer"; senderName: string; content: string; minutesAgo: number }>;
  }> = [
    {
      name: "Thiago Mendes",
      phone: "5511987654321",
      status: "em_atendimento",
      unread: 1,
      ai: true,
      messages: [
        { fromMe: false, senderType: "customer", senderName: "Thiago Mendes", content: "Oi, tem camisa do Flamengo G?", minutesAgo: 45 },
        { fromMe: true, senderType: "ai", senderName: "Lia", content: "Tem sim! Flamengo Home 25/26 tamanho G por R$ 349,90 no varejo. Quer atacado tambem?", minutesAgo: 44 },
        { fromMe: false, senderType: "customer", senderName: "Thiago Mendes", content: "Varejo mesmo. Voces fazem entrega em SP?", minutesAgo: 40 },
        { fromMe: true, senderType: "ai", senderName: "Lia", content: "Fazemos! Frete calculado no checkout. Posso reservar a peca pra voce?", minutesAgo: 38 },
        { fromMe: false, senderType: "customer", senderName: "Thiago Mendes", content: "Pode reservar 1 G e me passar o PIX.", minutesAgo: 5 },
      ],
    },
    {
      name: "Loja Arena Fit",
      phone: "5511977001122",
      status: "proposta_enviada",
      unread: 0,
      ai: true,
      messages: [
        { fromMe: false, senderType: "customer", senderName: "Loja Arena Fit", content: "Bom dia! Quero atacado de Corinthians e Palmeiras.", minutesAgo: 180 },
        { fromMe: true, senderType: "ai", senderName: "Lia", content: "Otimo! No atacado: Corinthians Away R$ 175 e Palmeiras Home R$ 185. Minimo 6 pecas no total.", minutesAgo: 178 },
        { fromMe: false, senderType: "customer", senderName: "Loja Arena Fit", content: "Fecha 12 de cada, misturando M/G/GG.", minutesAgo: 160 },
        { fromMe: true, senderType: "ai", senderName: "Lia", content: "Perfeito. Total aproximado R$ 4.320. Segue o catalogo pra confirmar grades: https://street-sportes-production.up.railway.app/produtos", minutesAgo: 155 },
      ],
    },
    {
      name: "Marina Lopes",
      phone: "5511966123456",
      status: "novo",
      unread: 2,
      ai: true,
      messages: [
        { fromMe: false, senderType: "customer", senderName: "Marina Lopes", content: "Olaa", minutesAgo: 12 },
        { fromMe: false, senderType: "customer", senderName: "Marina Lopes", content: "Tem camisa do Real Madrid?", minutesAgo: 11 },
      ],
    },
    {
      name: "Bruno Carvalho",
      phone: "5511955443322",
      status: "intervencao",
      unread: 1,
      ai: false,
      messages: [
        { fromMe: false, senderType: "customer", senderName: "Bruno Carvalho", content: "Paguei o PIX ha 2 horas e nao recebi confirmacao.", minutesAgo: 90 },
        { fromMe: true, senderType: "ai", senderName: "Lia", content: "Vou verificar com o financeiro e ja te retorno, Bruno!", minutesAgo: 88 },
        { fromMe: false, senderType: "customer", senderName: "Bruno Carvalho", content: "Preciso falar com um humano, por favor.", minutesAgo: 70 },
        { fromMe: true, senderType: "human", senderName: "Camila Ferreira", content: "Oi Bruno, aqui e a Camila. Me manda o comprovante que eu confirmo agora.", minutesAgo: 60 },
      ],
    },
    {
      name: "Cafe & Bola Store",
      phone: "5511944332211",
      status: "finalizado",
      unread: 0,
      ai: true,
      messages: [
        { fromMe: false, senderType: "customer", senderName: "Cafe & Bola Store", content: "Quero 20 camisas sortidas Europa.", minutesAgo: 1440 },
        { fromMe: true, senderType: "ai", senderName: "Lia", content: "Temos Real Madrid e Barcelona. Posso montar 10 de cada no atacado.", minutesAgo: 1430 },
        { fromMe: false, senderType: "customer", senderName: "Cafe & Bola Store", content: "Fecha. PIX enviado.", minutesAgo: 1400 },
        { fromMe: true, senderType: "ai", senderName: "Lia", content: "Pagamento confirmado! Pedido em separacao. Obrigada pela preferencia.", minutesAgo: 1380 },
      ],
    },
    {
      name: "Spam Promo",
      phone: "5511911112222",
      status: "spam",
      unread: 0,
      ai: false,
      messages: [
        { fromMe: false, senderType: "customer", senderName: "Spam Promo", content: "GANHE DINHEIRO FACIL CLICANDO AQUI!!!", minutesAgo: 3000 },
      ],
    },
  ];

  for (const chat of chats) {
    const last = chat.messages[chat.messages.length - 1];
    const lastAt = new Date(Date.now() - last.minutesAgo * 60_000);
    const [convIns] = await db.execute(
      `INSERT INTO wa_conversations
        (instanceId, remoteJid, contactName, contactPhone, lastMessage, lastMessageAt,
         unreadCount, aiEnabled, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        instanceId,
        `${chat.phone}@s.whatsapp.net`,
        chat.name,
        chat.phone,
        last.content.slice(0, 120),
        lastAt.toISOString().slice(0, 19).replace("T", " "),
        chat.unread,
        chat.ai ? 1 : 0,
        chat.status,
        "Conversa ficticia para demonstracao Street Sportes",
      ]
    );
    const conversationId = Number((convIns as { insertId?: number }).insertId);

    for (const m of chat.messages) {
      const ts = new Date(Date.now() - m.minutesAgo * 60_000);
      await db.execute(
        `INSERT INTO wa_messages
          (conversationId, instanceId, messageId, fromMe, senderType, senderName, type, content, status, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, 'text', ?, 'read', ?)`,
        [
          conversationId,
          instanceId,
          `demo-msg-${conversationId}-${m.minutesAgo}`,
          m.fromMe ? 1 : 0,
          m.senderType,
          m.senderName,
          m.content,
          ts.toISOString().slice(0, 19).replace("T", " "),
        ]
      );
    }
  }
}

export async function runDemoBootstrap(): Promise<void> {
  if (!isDemoMode()) {
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[DEMO] DEMO_MODE ativo, mas DATABASE_URL ausente — pulando bootstrap");
    return;
  }

  console.log("[DEMO] Bootstrap de demonstracao iniciado (Street Sportes)");
  const db = await mysql.createConnection(url);
  try {
    await execStatements(db, STORE_SCHEMA_SQL);
    await seedStore(db);
    // Atualiza precos da vitrine se ainda estiverem baixos
    await db.execute(
      "UPDATE products SET price = price * 1.35, originalPrice = IFNULL(originalPrice, price) * 1.4 WHERE price < 300"
    );
    // Troca fotos genericas da vitrine pelas fotos de catalogo locais
    for (const [time, foto] of Object.entries(DEMO_PHOTO_BY_TIME)) {
      await db.execute("UPDATE products SET images = ? WHERE team = ?", [
        JSON.stringify([`${DEMO_PHOTO_BASE}/${foto}`]),
        time,
      ]);
    }
    await seedPdvExtras(db);
    await seedWhatsAppDemo(db);
    console.log("[DEMO] Schema, vendedores fakes, valores altos e WhatsApp demo prontos");
  } catch (err) {
    console.error("[DEMO] Bootstrap error:", err);
  } finally {
    await db.end();
  }
}
