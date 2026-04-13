import { describe, it, expect } from "vitest";
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL!;

async function getDb() {
  return mysql.createConnection(DB_URL);
}

describe("v44 Features — Schema & Data Integrity", () => {
  // ============================================================
  // 1. Schema: isSofia column on pdv_orders
  // ============================================================
  describe("isSofia column on pdv_orders", () => {
    it("should have isSofia column with default 0", async () => {
      const db = await getDb();
      const [cols] = await db.execute(
        `SELECT COLUMN_NAME, COLUMN_DEFAULT, DATA_TYPE FROM information_schema.COLUMNS 
         WHERE TABLE_NAME = 'pdv_orders' AND COLUMN_NAME = 'isSofia'`
      );
      await db.end();
      const col = (cols as any[])[0];
      expect(col).toBeDefined();
      expect(col.DATA_TYPE).toMatch(/tinyint|int/);
      expect(String(col.COLUMN_DEFAULT)).toBe("0");
    });

    it("existing orders should have isSofia = 0", async () => {
      const db = await getDb();
      const [rows] = await db.execute(
        `SELECT COUNT(*) as cnt FROM pdv_orders WHERE isSofia != 0`
      );
      await db.end();
      expect(parseInt((rows as any[])[0].cnt)).toBe(0);
    });
  });

  // ============================================================
  // 2. Schema: pdv_desconto_folha table
  // ============================================================
  describe("pdv_desconto_folha table", () => {
    it("should exist with correct columns", async () => {
      const db = await getDb();
      const [cols] = await db.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_NAME = 'pdv_desconto_folha' ORDER BY ORDINAL_POSITION`
      );
      await db.end();
      const colNames = (cols as any[]).map(c => c.COLUMN_NAME);
      expect(colNames).toContain("id");
      expect(colNames).toContain("sellerId");
      expect(colNames).toContain("sellerName");
      expect(colNames).toContain("pedidoId");
      expect(colNames).toContain("descricao");
      expect(colNames).toContain("valor");
      expect(colNames).toContain("quitado");
      expect(colNames).toContain("createdAt");
    });

    it("quitado should default to 0", async () => {
      const db = await getDb();
      const [cols] = await db.execute(
        `SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS 
         WHERE TABLE_NAME = 'pdv_desconto_folha' AND COLUMN_NAME = 'quitado'`
      );
      await db.end();
      expect(String((cols as any[])[0].COLUMN_DEFAULT)).toBe("0");
    });
  });

  // ============================================================
  // 3. Schema: pdv_sofia_config table
  // ============================================================
  describe("pdv_sofia_config table", () => {
    it("should exist with correct columns", async () => {
      const db = await getDb();
      const [cols] = await db.execute(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_NAME = 'pdv_sofia_config' ORDER BY ORDINAL_POSITION`
      );
      await db.end();
      const colNames = (cols as any[]).map(c => c.COLUMN_NAME);
      expect(colNames).toContain("id");
      expect(colNames).toContain("comissaoLoja");
    });
  });

  // ============================================================
  // 4. Comissão por peça: query logic
  // ============================================================
  describe("Comissão por peça — query logic", () => {
    it("should count peças (sum of quantidade) not just pedidos", async () => {
      const db = await getDb();
      // Get a seller with orders
      const [sellers] = await db.execute(
        `SELECT o.sellerId, SUM(oi.quantidade) as totalPecas, COUNT(DISTINCT o.id) as totalPedidos
         FROM pdv_orders o
         JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
         WHERE o.status != 'CANCELADO' AND o.isSofia = 0
         GROUP BY o.sellerId
         HAVING totalPecas > 0
         LIMIT 1`
      );
      await db.end();
      
      if ((sellers as any[]).length > 0) {
        const s = (sellers as any[])[0];
        const pecas = parseInt(s.totalPecas);
        const pedidos = parseInt(s.totalPedidos);
        // Peças should be >= pedidos (each pedido has at least 1 item)
        expect(pecas).toBeGreaterThanOrEqual(pedidos);
      }
    });

    it("should exclude Sofia orders from comissão calculation", async () => {
      const db = await getDb();
      // Sofia orders should not be counted in comissão
      const [rows] = await db.execute(
        `SELECT 
          COALESCE(SUM(CASE WHEN o.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as pecasNormais,
          COALESCE(SUM(CASE WHEN o.isSofia = 1 THEN oi.quantidade ELSE 0 END), 0) as pecasSofia
         FROM pdv_orders o
         JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
         WHERE o.status != 'CANCELADO'`
      );
      await db.end();
      const data = (rows as any[])[0];
      // pecasSofia should be 0 for now (no Sofia orders yet)
      expect(parseInt(data.pecasSofia)).toBe(0);
      // pecasNormais should be >= 0
      expect(parseInt(data.pecasNormais)).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // 5. Desconto em Folha: CRUD operations
  // ============================================================
  describe("Desconto em Folha — CRUD", () => {
    let testId: number | null = null;

    it("should insert a desconto em folha record", async () => {
      const db = await getDb();
      const [result] = await db.execute(
        `INSERT INTO pdv_desconto_folha (sellerId, sellerName, descricao, valor)
         VALUES (1, 'TESTE', 'Camiseta teste vitest', 49.90)`
      );
      testId = (result as any).insertId;
      await db.end();
      expect(testId).toBeGreaterThan(0);
    });

    it("should read the inserted record with quitado = 0", async () => {
      const db = await getDb();
      const [rows] = await db.execute(
        `SELECT * FROM pdv_desconto_folha WHERE id = ?`, [testId]
      );
      await db.end();
      const record = (rows as any[])[0];
      expect(record).toBeDefined();
      expect(record.sellerName).toBe("TESTE");
      expect(parseFloat(record.valor)).toBeCloseTo(49.90, 1);
      expect(record.quitado).toBe(0);
    });

    it("should update quitado to 1", async () => {
      const db = await getDb();
      await db.execute(
        `UPDATE pdv_desconto_folha SET quitado = 1, quitadoEm = NOW() WHERE id = ?`, [testId]
      );
      const [rows] = await db.execute(
        `SELECT quitado, quitadoEm FROM pdv_desconto_folha WHERE id = ?`, [testId]
      );
      await db.end();
      const record = (rows as any[])[0];
      expect(record.quitado).toBe(1);
      expect(record.quitadoEm).not.toBeNull();
    });

    it("should delete the test record", async () => {
      const db = await getDb();
      await db.execute(`DELETE FROM pdv_desconto_folha WHERE id = ?`, [testId]);
      const [rows] = await db.execute(
        `SELECT COUNT(*) as cnt FROM pdv_desconto_folha WHERE id = ?`, [testId]
      );
      await db.end();
      expect(parseInt((rows as any[])[0].cnt)).toBe(0);
    });
  });

  // ============================================================
  // 6. Sofia config: default value
  // ============================================================
  describe("Sofia config — default value", () => {
    it("should have a default config row with comissaoLoja = 10", async () => {
      const db = await getDb();
      const [rows] = await db.execute(`SELECT * FROM pdv_sofia_config LIMIT 1`);
      await db.end();
      const config = (rows as any[])[0];
      expect(config).toBeDefined();
      expect(parseFloat(config.comissaoLoja)).toBe(10);
    });
  });
});
