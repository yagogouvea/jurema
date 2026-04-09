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

  it("should have regular sellers", async () => {
    const [rows] = await db.execute(
      "SELECT * FROM pdv_sellers WHERE role = 'seller'"
    );
    expect((rows as any[]).length).toBeGreaterThanOrEqual(4);
  });

  it("should have pdv_goals table with initial goals", async () => {
    const [rows] = await db.execute("SELECT COUNT(*) as count FROM pdv_goals");
    expect((rows as any[])[0].count).toBeGreaterThanOrEqual(4);
  });

  it("should have pdv_products table", async () => {
    const [rows] = await db.execute(
      "SHOW TABLES LIKE 'pdv_products'"
    );
    expect((rows as any[]).length).toBe(1);
  });

  it("should have pdv_orders table", async () => {
    const [rows] = await db.execute(
      "SHOW TABLES LIKE 'pdv_orders'"
    );
    expect((rows as any[]).length).toBe(1);
  });

  it("should have pdv_cash_flow table", async () => {
    const [rows] = await db.execute(
      "SHOW TABLES LIKE 'pdv_cash_flow'"
    );
    expect((rows as any[]).length).toBe(1);
  });
});

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

  it("should verify seller login hash", async () => {
    const [rows] = await db.execute(
      "SELECT passwordHash FROM pdv_sellers WHERE username = 'gianluca'"
    );
    const dbHash = (rows as any[])[0]?.passwordHash;
    const expectedHash = hashPassword("jumera123");
    expect(dbHash).toBe(expectedHash);
  });

  it("should verify admin login hash", async () => {
    const [rows] = await db.execute(
      "SELECT passwordHash FROM pdv_sellers WHERE username = 'vanessa'"
    );
    const dbHash = (rows as any[])[0]?.passwordHash;
    const expectedHash = hashPassword("jumera@admin");
    expect(dbHash).toBe(expectedHash);
  });
});

describe("PDV Goals", () => {
  it("should have all required goal keys", async () => {
    const [rows] = await db.execute("SELECT `key` FROM pdv_goals");
    const keys = (rows as any[]).map(r => r.key);
    expect(keys).toContain("BRONZE");
    expect(keys).toContain("PRATA");
    expect(keys).toContain("OURO");
    expect(keys).toContain("META_LOJA");
  });

  it("should have bronze < prata < ouro < meta_loja", async () => {
    const [rows] = await db.execute("SELECT `key`, value FROM pdv_goals");
    const goals: Record<string, number> = {};
    (rows as any[]).forEach(r => { goals[r.key] = parseFloat(r.value); });
    expect(goals.BRONZE).toBeLessThan(goals.PRATA);
    expect(goals.PRATA).toBeLessThan(goals.OURO);
    expect(goals.OURO).toBeLessThan(goals.META_LOJA);
  });
});
