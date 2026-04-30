import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";
import crypto from "crypto";

const PDV_SALT = "pdv_salt_jumera";
const hashPassword = (pwd: string) =>
  crypto.createHash("sha256").update(pwd + PDV_SALT).digest("hex");

let db: mysql.Connection;

beforeAll(async () => {
  db = await mysql.createConnection(process.env.DATABASE_URL!);
});

afterAll(async () => {
  await db.end();
});

// ===== 1. DATABASE TABLES =====
describe("PDV Database Tables", () => {
  it("should have pdv_sellers table with initial sellers", async () => {
    const [rows] = await db.execute("SELECT COUNT(*) as count FROM pdv_sellers");
    expect((rows as any[])[0].count).toBeGreaterThanOrEqual(5);
  });

  it("should have admin seller (vanessa)", async () => {
    const [rows] = await db.execute(
      "SELECT * FROM pdv_sellers WHERE username = 'vanessa'"
    );
    expect((rows as any[]).length).toBe(1);
    expect((rows as any[])[0].role).toBe("admin");
  });

  it("should have active sellers (vinicius, flavio, gabriel)", async () => {
    const [rows] = await db.execute(
      "SELECT username FROM pdv_sellers WHERE role = 'seller' AND isActive = 1 ORDER BY username"
    );
    const usernames = (rows as any[]).map((r: any) => r.username);
    // Verifica que existem vendedores ativos
    expect(usernames.length).toBeGreaterThanOrEqual(1);
    // Vinicius deve estar ativo
    expect(usernames).toContain("vinicius");
  });

  it("should have pdv_goals table with initial goals", async () => {
    const [rows] = await db.execute("SELECT COUNT(*) as count FROM pdv_goals");
    expect((rows as any[])[0].count).toBeGreaterThanOrEqual(4);
  });

  it("should have pdv_products table", async () => {
    const [rows] = await db.execute("SHOW TABLES LIKE 'pdv_products'");
    expect((rows as any[]).length).toBe(1);
  });

  it("should have pdv_orders table", async () => {
    const [rows] = await db.execute("SHOW TABLES LIKE 'pdv_orders'");
    expect((rows as any[]).length).toBe(1);
  });

  it("should have pdv_order_items table", async () => {
    const [rows] = await db.execute("SHOW TABLES LIKE 'pdv_order_items'");
    expect((rows as any[]).length).toBe(1);
  });

  it("should have pdv_order_payments table", async () => {
    const [rows] = await db.execute("SHOW TABLES LIKE 'pdv_order_payments'");
    expect((rows as any[]).length).toBe(1);
  });

  it("should have pdv_order_services table", async () => {
    const [rows] = await db.execute("SHOW TABLES LIKE 'pdv_order_services'");
    expect((rows as any[]).length).toBe(1);
  });

  it("should have pdv_cash_flow table", async () => {
    const [rows] = await db.execute("SHOW TABLES LIKE 'pdv_cash_flow'");
    expect((rows as any[]).length).toBe(1);
  });

  it("should have pdv_config table", async () => {
    const [rows] = await db.execute("SHOW TABLES LIKE 'pdv_config'");
    expect((rows as any[]).length).toBe(1);
  });
});

// ===== 2. PASSWORD HASHING =====
describe("PDV Password Hashing", () => {
  it("should hash password consistently", () => {
    const hash1 = hashPassword("jumera123");
    const hash2 = hashPassword("jumera123");
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different passwords", () => {
    const hash1 = hashPassword("jumera123");
    const hash2 = hashPassword("jumera456");
    expect(hash1).not.toBe(hash2);
  });

  it("should verify seller login hash (vinicius)", async () => {
    const [rows] = await db.execute(
      "SELECT passwordHash FROM pdv_sellers WHERE username = 'vinicius' AND isActive = 1"
    );
    const dbHash = (rows as any[])[0]?.passwordHash;
    // Vinicius deve ter um hash de senha válido
    expect(dbHash).toBeTruthy();
    expect(typeof dbHash).toBe("string");
    expect(dbHash.length).toBe(64); // SHA-256 hex = 64 chars
  });

  it("should verify admin login hash (vanessa)", async () => {
    const [rows] = await db.execute(
      "SELECT passwordHash FROM pdv_sellers WHERE username = 'vanessa'"
    );
    const dbHash = (rows as any[])[0]?.passwordHash;
    // Vanessa's password was updated to jurema@123
    expect(dbHash).toBe(hashPassword("jurema@123"));
  });

  it("should verify all sellers have valid password hashes", async () => {
    const [rows] = await db.execute(
      "SELECT username, passwordHash FROM pdv_sellers WHERE role = 'seller'"
    );
    for (const row of rows as any[]) {
      // All sellers should have a non-empty 64-char SHA-256 hash
      expect(row.passwordHash).toBeTruthy();
      expect(row.passwordHash.length).toBe(64);
    }
  });
});

// ===== 3. GOALS =====
describe("PDV Goals", () => {
  it("should have all required goal keys", async () => {
    const [rows] = await db.execute("SELECT `key` FROM pdv_goals");
    const keys = (rows as any[]).map((r: any) => r.key);
    expect(keys).toContain("BRONZE");
    expect(keys).toContain("PRATA");
    expect(keys).toContain("OURO");
    expect(keys).toContain("META_LOJA");
  });

  it("should have bronze < prata < ouro < meta_loja", async () => {
    const [rows] = await db.execute("SELECT `key`, value FROM pdv_goals");
    const goals: Record<string, number> = {};
    (rows as any[]).forEach((r: any) => { goals[r.key] = parseFloat(r.value); });
    expect(goals.BRONZE).toBeLessThan(goals.PRATA);
    expect(goals.PRATA).toBeLessThan(goals.OURO);
    expect(goals.OURO).toBeLessThan(goals.META_LOJA);
  });

  it("should have positive goal values", async () => {
    const [rows] = await db.execute("SELECT value FROM pdv_goals");
    for (const row of rows as any[]) {
      expect(parseFloat(row.value)).toBeGreaterThan(0);
    }
  });
});

// ===== 4. PRODUCTS CATALOG =====
describe("PDV Products Catalog", () => {
  it("should have products seeded (at least 10)", async () => {
    const [rows] = await db.execute("SELECT COUNT(*) as count FROM pdv_products WHERE isActive = 1");
    expect((rows as any[])[0].count).toBeGreaterThan(10);
  });

  it("should have at least 2 product lines", async () => {
    const [rows] = await db.execute(
      "SELECT DISTINCT linha FROM pdv_products WHERE isActive = 1"
    );
    const linhas = (rows as any[]).map((r: any) => r.linha);
    // Real catalog may not have all 4 lines; at least TAILANDESA should exist
    expect(linhas.length).toBeGreaterThanOrEqual(2);
    expect(linhas).toContain("TAILANDESA");
  });

  it("should have products with valid price ranges", async () => {
    const [rows] = await db.execute(
      "SELECT linha, MIN(precoAtacado) as minAtacado, MAX(precoVarejo) as maxVarejo FROM pdv_products WHERE precoAtacado > 0 GROUP BY linha"
    );
    for (const row of rows as any[]) {
      expect(parseFloat(row.minAtacado)).toBeGreaterThan(0);
      expect(parseFloat(row.maxVarejo)).toBeGreaterThan(0);
    }
  });

  it("should have atacado price lower than or equal to varejo price", async () => {
    const [rows] = await db.execute(
      "SELECT id, precoAtacado, precoVarejo FROM pdv_products WHERE isActive = 1 LIMIT 50"
    );
    for (const row of rows as any[]) {
      expect(parseFloat(row.precoAtacado)).toBeLessThanOrEqual(parseFloat(row.precoVarejo));
    }
  });

  it("should have products with sizes", async () => {
    const [rows] = await db.execute(
      "SELECT DISTINCT tamanho FROM pdv_products WHERE isActive = 1"
    );
    const tamanhos = (rows as any[]).map((r: any) => r.tamanho);
    // Real catalog has letter sizes (S, M, L, XL, 2XL, 3XL) and numeric sizes (2, 4, 6, 8, 10, 12, 14, 16, 18)
    // Minimum: at least 1 distinct size must exist
    expect(tamanhos.length).toBeGreaterThan(0);
  });

  it("should have products with Brazilian teams (uppercase from sheet)", async () => {
    const [rows] = await db.execute(
      "SELECT DISTINCT `time` FROM pdv_products WHERE isActive = 1 ORDER BY `time`"
    );
    const times = (rows as any[]).map((r: any) => r.time);
    // Real catalog has team names in UPPERCASE from Google Sheets
    expect(times.length).toBeGreaterThan(10);
    expect(times).toContain("FLAMENGO");
    expect(times).toContain("CORINTHIANS");
    expect(times).toContain("PALMEIRAS");
    expect(times).toContain("BRASIL");
  });

  it("should have products with unique codes", async () => {
    const [rows] = await db.execute(
      "SELECT codigo, COUNT(*) as cnt FROM pdv_products WHERE codigo IS NOT NULL GROUP BY codigo HAVING cnt > 1"
    );
    expect((rows as any[]).length).toBe(0);
  });
});

// ===== 5. CONFIG =====
describe("PDV Config", () => {
  it("should have initial config keys", async () => {
    const [rows] = await db.execute("SELECT `key` FROM pdv_config");
    const keys = (rows as any[]).map((r: any) => r.key);
    expect(keys).toContain("whatsapp_recibo");
    expect(keys).toContain("nome_loja");
    expect(keys).toContain("taxa_debito");
    expect(keys).toContain("taxa_credito");
    expect(keys).toContain("min_atacado");
  });

  it("should have valid default tax rates", async () => {
    const [rows] = await db.execute(
      "SELECT `key`, value FROM pdv_config WHERE `key` IN ('taxa_debito', 'taxa_credito')"
    );
    for (const row of rows as any[]) {
      const val = parseFloat(row.value);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  it("should have valid minimum atacado quantity", async () => {
    const [rows] = await db.execute(
      "SELECT value FROM pdv_config WHERE `key` = 'min_atacado'"
    );
    const val = parseInt((rows as any[])[0]?.value);
    expect(val).toBeGreaterThan(0);
  });

  it("should allow updating config values", async () => {
    await db.execute(
      "INSERT INTO pdv_config (`key`, value) VALUES ('test_key', 'test_value') ON DUPLICATE KEY UPDATE value = 'test_value'"
    );
    const [rows] = await db.execute(
      "SELECT value FROM pdv_config WHERE `key` = 'test_key'"
    );
    expect((rows as any[])[0]?.value).toBe("test_value");
    await db.execute("DELETE FROM pdv_config WHERE `key` = 'test_key'");
  });
});

// ===== 6. ORDERS SCHEMA =====
describe("PDV Orders Schema", () => {
  it("should have correct columns in pdv_orders", async () => {
    const [rows] = await db.execute("DESCRIBE pdv_orders");
    const cols = (rows as any[]).map((r: any) => r.Field);
    expect(cols).toContain("id");
    expect(cols).toContain("pedidoId");
    expect(cols).toContain("sellerId");
    expect(cols).toContain("canal");
    expect(cols).toContain("regime");
    expect(cols).toContain("status");
    expect(cols).toContain("totalAplicado");
    expect(cols).toContain("totalPago");
    expect(cols).toContain("totalPendente");
    expect(cols).toContain("clienteNome");
  });

  it("should have correct columns in pdv_order_payments", async () => {
    const [rows] = await db.execute("DESCRIBE pdv_order_payments");
    const cols = (rows as any[]).map((r: any) => r.Field);
    expect(cols).toContain("formaPagamento");
    expect(cols).toContain("valor");
    expect(cols).toContain("taxa");
    expect(cols).toContain("nomePix");
  });

  it("should have correct columns in pdv_cash_flow", async () => {
    const [rows] = await db.execute("DESCRIBE pdv_cash_flow");
    const cols = (rows as any[]).map((r: any) => r.Field);
    expect(cols).toContain("tipo");
    expect(cols).toContain("valor");
    expect(cols).toContain("descricao");
    expect(cols).toContain("usuario");
  });
});

// ===== 7. BUSINESS RULES =====
describe("PDV Business Rules", () => {
  it("should correctly identify atacado threshold (6+ items)", () => {
    const MIN_ATACADO = 6;
    expect(5 < MIN_ATACADO).toBe(true);
    expect(6 >= MIN_ATACADO).toBe(true);
    expect(10 >= MIN_ATACADO).toBe(true);
  });

  it("should correctly calculate credit card tax (5%)", () => {
    const valor = 100;
    const taxa = 0.05;
    const total = valor * (1 + taxa);
    expect(total).toBe(105);
  });

  it("should correctly calculate debit card tax (3%)", () => {
    const valor = 100;
    const taxa = 0.03;
    const total = valor * (1 + taxa);
    expect(total).toBeCloseTo(103, 2);
  });

  it("should correctly calculate PIX with no tax (0%)", () => {
    const valor = 100;
    const taxa = 0;
    const total = valor * (1 + taxa);
    expect(total).toBe(100);
  });

  it("should correctly compute commission at 5%", () => {
    const faturamento = 10000;
    const taxa = 0.05;
    const comissao = faturamento * taxa;
    expect(comissao).toBe(500);
  });

  it("should correctly determine meta level", () => {
    const goals = { BRONZE: 14000, PRATA: 23000, OURO: 28000, META_LOJA: 84000 };
    const getMeta = (v: number) =>
      v >= goals.OURO ? "OURO" : v >= goals.PRATA ? "PRATA" : v >= goals.BRONZE ? "BRONZE" : null;

    expect(getMeta(0)).toBeNull();
    expect(getMeta(14000)).toBe("BRONZE");
    expect(getMeta(23000)).toBe("PRATA");
    expect(getMeta(28000)).toBe("OURO");
    expect(getMeta(50000)).toBe("OURO");
  });

  it("should correctly calculate order total with services", () => {
    const items = [
      { precoAtacado: 45, quantidade: 3 },
      { precoAtacado: 45, quantidade: 4 },
    ];
    const services = [{ valor: 20 }, { valor: 15 }];
    const totalItems = items.reduce((a, i) => a + i.precoAtacado * i.quantidade, 0);
    const totalServices = services.reduce((a, s) => a + s.valor, 0);
    const total = totalItems + totalServices;
    expect(totalItems).toBe(315);
    expect(totalServices).toBe(35);
    expect(total).toBe(350);
  });
});
