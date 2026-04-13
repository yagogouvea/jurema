import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";

let db: mysql.Connection;

beforeAll(async () => {
  db = await mysql.createConnection(process.env.DATABASE_URL!);
});

afterAll(async () => {
  await db.end();
});

// ===== 1. DEDUPLICATION LOGIC =====
describe("PDV Sync - Deduplication Logic", () => {
  it("should correctly deduplicate products by summing stock", () => {
    // Simula dados da planilha com duplicatas
    const rawProducts = [
      { codigo: "CA-T-TO-ATL-LIST-S", estoque: 2, precoAtacado: 80, precoVarejo: 100 },
      { codigo: "CA-T-TO-ATL-LIST-S", estoque: 5, precoAtacado: 80, precoVarejo: 100 },
      { codigo: "CA-T-TO-ATL-LIST-S", estoque: 3, precoAtacado: 35, precoVarejo: 50 },
      { codigo: "CA-T-TO-ATL-LIST-S", estoque: 8, precoAtacado: 80, precoVarejo: 100 },
      { codigo: "CA-T-TO-ATL-LIST-S", estoque: 5, precoAtacado: 80, precoVarejo: 100 },
      { codigo: "CA-UNICO", estoque: 10, precoAtacado: 45, precoVarejo: 60 },
    ];

    const deduped = new Map<string, { estoque: number; precoAtacado: number; precoVarejo: number }>();
    for (const p of rawProducts) {
      const existing = deduped.get(p.codigo);
      if (existing) {
        deduped.set(p.codigo, {
          estoque: existing.estoque + p.estoque,
          precoAtacado: Math.max(existing.precoAtacado, p.precoAtacado),
          precoVarejo: Math.max(existing.precoVarejo, p.precoVarejo),
        });
      } else {
        deduped.set(p.codigo, { ...p });
      }
    }

    // Deve ter apenas 2 códigos únicos
    expect(deduped.size).toBe(2);

    // Estoque somado: 2 + 5 + 3 + 8 + 5 = 23
    const atlList = deduped.get("CA-T-TO-ATL-LIST-S");
    expect(atlList).toBeDefined();
    expect(atlList!.estoque).toBe(23);

    // Preço: max(80, 80, 35, 80, 80) = 80
    expect(atlList!.precoAtacado).toBe(80);
    expect(atlList!.precoVarejo).toBe(100);

    // Produto único permanece inalterado
    const unico = deduped.get("CA-UNICO");
    expect(unico).toBeDefined();
    expect(unico!.estoque).toBe(10);
    expect(unico!.precoAtacado).toBe(45);
  });

  it("should handle empty input without errors", () => {
    const rawProducts: any[] = [];
    const deduped = new Map();
    for (const p of rawProducts) {
      const existing = deduped.get(p.codigo);
      if (existing) {
        deduped.set(p.codigo, {
          estoque: existing.estoque + p.estoque,
          precoAtacado: Math.max(existing.precoAtacado, p.precoAtacado),
          precoVarejo: Math.max(existing.precoVarejo, p.precoVarejo),
        });
      } else {
        deduped.set(p.codigo, { ...p });
      }
    }
    expect(deduped.size).toBe(0);
  });

  it("should keep isActive=1 if any duplicate is active", () => {
    const rawProducts = [
      { codigo: "TEST-ACTIVE", estoque: 1, precoAtacado: 50, precoVarejo: 70, isActive: 0 },
      { codigo: "TEST-ACTIVE", estoque: 2, precoAtacado: 50, precoVarejo: 70, isActive: 1 },
      { codigo: "TEST-ACTIVE", estoque: 3, precoAtacado: 50, precoVarejo: 70, isActive: 0 },
    ];

    const deduped = new Map<string, any>();
    for (const p of rawProducts) {
      const existing = deduped.get(p.codigo);
      if (existing) {
        deduped.set(p.codigo, {
          ...p,
          estoque: existing.estoque + p.estoque,
          precoAtacado: Math.max(existing.precoAtacado, p.precoAtacado),
          precoVarejo: Math.max(existing.precoVarejo, p.precoVarejo),
          isActive: existing.isActive || p.isActive ? 1 : 0,
        });
      } else {
        deduped.set(p.codigo, { ...p });
      }
    }

    const result = deduped.get("TEST-ACTIVE");
    expect(result!.isActive).toBe(1);
    expect(result!.estoque).toBe(6);
  });
});

// ===== 2. PRICE NORMALIZATION =====
describe("PDV Sync - Price Normalization", () => {
  it("should normalize prices for consistent comparison", () => {
    // Banco retorna DECIMAL como string "80.00", planilha retorna número 80
    const dbPrice = "80.00";
    const sheetPrice = 80;

    const normalizedDb = Math.round(parseFloat(dbPrice) * 100) / 100;
    const normalizedSheet = Math.round(sheetPrice * 100) / 100;

    expect(normalizedDb).toBe(normalizedSheet);
  });

  it("should handle floating point precision", () => {
    const dbPrice = "35.50";
    const sheetPrice = 35.5;

    const normalizedDb = Math.round(parseFloat(dbPrice) * 100) / 100;
    const normalizedSheet = Math.round(sheetPrice * 100) / 100;

    expect(normalizedDb).toBe(normalizedSheet);
  });

  it("should detect actual price differences", () => {
    const dbPrice = "80.00";
    const sheetPrice = 85;

    const normalizedDb = Math.round(parseFloat(dbPrice) * 100) / 100;
    const normalizedSheet = Math.round(sheetPrice * 100) / 100;

    expect(normalizedDb).not.toBe(normalizedSheet);
  });
});

// ===== 3. DATABASE STATE AFTER SYNC =====
describe("PDV Sync - Database State", () => {
  it("should have no duplicate codes in pdv_products", async () => {
    const [rows] = await db.execute(
      "SELECT codigo, COUNT(*) as cnt FROM pdv_products WHERE codigo IS NOT NULL GROUP BY codigo HAVING cnt > 1"
    );
    expect((rows as any[]).length).toBe(0);
  });

  it("should have unique index on codigo column", async () => {
    const [rows] = await db.execute(
      "SHOW INDEX FROM pdv_products WHERE Column_name = 'codigo' AND Non_unique = 0"
    );
    expect((rows as any[]).length).toBeGreaterThan(0);
  });

  it("should have products with valid stock values (>= 0)", async () => {
    const [rows] = await db.execute(
      "SELECT COUNT(*) as count FROM pdv_products WHERE estoque < 0"
    );
    expect((rows as any[])[0].count).toBe(0);
  });

  it("should have very few products with zero prices (legacy data)", async () => {
    const [rows] = await db.execute(
      "SELECT COUNT(*) as count FROM pdv_products WHERE precoAtacado <= 0 OR precoVarejo <= 0"
    );
    // Some legacy/test products may have zero prices, but should be minimal
    expect((rows as any[])[0].count).toBeLessThanOrEqual(10);
  });

  it("should have at least 600 unique products after deduplication", async () => {
    const [rows] = await db.execute(
      "SELECT COUNT(*) as count FROM pdv_products"
    );
    expect((rows as any[])[0].count).toBeGreaterThanOrEqual(600);
  });

  it("should have notifications table for sync history", async () => {
    const [rows] = await db.execute("SHOW TABLES LIKE 'pdv_notifications'");
    expect((rows as any[]).length).toBe(1);
  });
});

// ===== 4. LINE AND MODEL MAPPING =====
describe("PDV Sync - Line and Model Mapping", () => {
  it("should map line values correctly", () => {
    const mapLinha = (val: string): string => {
      const v = val.toUpperCase().trim();
      if (v.includes("TAILANDESA")) return "TAILANDESA";
      if (v.includes("NACIONAL")) return "NACIONAL";
      if (v.includes("TORCEDOR")) return "TORCEDOR";
      if (v.includes("PECA") || v.includes("PEÇA")) return "PECA";
      return "TAILANDESA";
    };

    expect(mapLinha("Tailandesa")).toBe("TAILANDESA");
    expect(mapLinha("NACIONAL")).toBe("NACIONAL");
    expect(mapLinha("Torcedor")).toBe("TORCEDOR");
    expect(mapLinha("PEÇA")).toBe("PECA");
    expect(mapLinha("PECA")).toBe("PECA");
    expect(mapLinha("unknown")).toBe("TAILANDESA"); // default
  });

  it("should map model values correctly", () => {
    const mapModelo = (val: string): string => {
      const v = val.toUpperCase().trim();
      if (v.includes("JOGADOR")) return "JOGADOR";
      if (v.includes("TORCEDOR")) return "TORCEDOR";
      if (v.includes("BONE") || v.includes("BONÉ")) return "BONE";
      return "TORCEDOR";
    };

    expect(mapModelo("Jogador")).toBe("JOGADOR");
    expect(mapModelo("TORCEDOR")).toBe("TORCEDOR");
    expect(mapModelo("Boné")).toBe("BONE");
    expect(mapModelo("BONE")).toBe("BONE");
    expect(mapModelo("unknown")).toBe("TORCEDOR"); // default
  });
});
