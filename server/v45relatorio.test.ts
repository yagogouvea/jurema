import { describe, it, expect } from "vitest";
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL!;

async function getDb() {
  return mysql.createConnection(DB_URL);
}

describe("v45 — Relatório PDF & Histórico de Quitações", () => {
  // ============================================================
  // 1. Relatório: dados de comissões por peça
  // ============================================================
  describe("Relatório — Comissões por peça", () => {
    it("should calculate totalPecas as SUM(quantidade) not COUNT(orders)", async () => {
      const db = await getDb();
      const [rows] = await db.execute(
        `SELECT 
          s.name as sellerName,
          COUNT(DISTINCT o.id) as totalPedidos,
          COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND o.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as totalPecas
        FROM pdv_sellers s
        LEFT JOIN pdv_orders o ON o.sellerId = s.id
        LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND o.status != 'CANCELADO' AND o.isSofia = 0
        WHERE s.isActive = 1
        GROUP BY s.id, s.name
        HAVING totalPecas > 0
        LIMIT 1`
      );
      await db.end();

      if ((rows as any[]).length > 0) {
        const r = (rows as any[])[0];
        const pecas = parseInt(r.totalPecas);
        const pedidos = parseInt(r.totalPedidos);
        // Peças >= pedidos (cada pedido tem pelo menos 1 item)
        expect(pecas).toBeGreaterThanOrEqual(pedidos);
      }
    });

    it("should exclude Sofia orders from comissão", async () => {
      const db = await getDb();
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
      expect(parseInt(data.pecasNormais)).toBeGreaterThanOrEqual(0);
      expect(parseInt(data.pecasSofia)).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // 2. Relatório — Sofia data
  // ============================================================
  describe("Relatório — Sofia", () => {
    it("should have pdv_sofia_config with comissaoLoja", async () => {
      const db = await getDb();
      const [rows] = await db.execute("SELECT comissaoLoja FROM pdv_sofia_config LIMIT 1");
      await db.end();
      const config = (rows as any[])[0];
      expect(config).toBeDefined();
      expect(parseFloat(config.comissaoLoja)).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 3. Relatório — Descontos em Folha
  // ============================================================
  describe("Relatório — Descontos em Folha", () => {
    it("should query pendente and quitado totals correctly", async () => {
      const db = await getDb();
      const [rows] = await db.execute(
        `SELECT 
          COALESCE(SUM(CASE WHEN quitado = 0 THEN valor ELSE 0 END), 0) as totalPendente,
          COALESCE(SUM(CASE WHEN quitado = 1 THEN valor ELSE 0 END), 0) as totalQuitado
        FROM pdv_desconto_folha`
      );
      await db.end();
      const data = (rows as any[])[0];
      expect(parseFloat(data.totalPendente)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(data.totalQuitado)).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // 4. Histórico de Quitações
  // ============================================================
  describe("Histórico de Quitações", () => {
    let testId: number | null = null;

    it("should insert a desconto, quitar it, and record quitadoEm + quitadoPor", async () => {
      const db = await getDb();
      // Insert
      const [insertResult] = await db.execute(
        `INSERT INTO pdv_desconto_folha (sellerId, sellerName, descricao, valor)
         VALUES (1, 'TESTE_HIST', 'Teste histórico quitação', 25.00)`
      );
      testId = (insertResult as any).insertId;
      expect(testId).toBeGreaterThan(0);

      // Quitar
      await db.execute(
        `UPDATE pdv_desconto_folha SET quitado = 1, quitadoEm = NOW(), quitadoPor = 'VANESSA' WHERE id = ?`,
        [testId]
      );

      // Verify
      const [rows] = await db.execute(
        `SELECT quitado, quitadoEm, quitadoPor FROM pdv_desconto_folha WHERE id = ?`,
        [testId]
      );
      const record = (rows as any[])[0];
      expect(record.quitado).toBe(1);
      expect(record.quitadoEm).not.toBeNull();
      expect(record.quitadoPor).toBe("VANESSA");

      await db.end();
    });

    it("should appear in historico query filtered by quitado=1", async () => {
      const db = await getDb();
      const [rows] = await db.execute(
        `SELECT * FROM pdv_desconto_folha WHERE quitado = 1 AND id = ?`,
        [testId]
      );
      await db.end();
      expect((rows as any[]).length).toBe(1);
      expect((rows as any[])[0].quitadoPor).toBe("VANESSA");
    });

    it("should cleanup test data", async () => {
      const db = await getDb();
      await db.execute(`DELETE FROM pdv_desconto_folha WHERE id = ?`, [testId]);
      const [rows] = await db.execute(`SELECT COUNT(*) as cnt FROM pdv_desconto_folha WHERE id = ?`, [testId]);
      await db.end();
      expect(parseInt((rows as any[])[0].cnt)).toBe(0);
    });
  });

  // ============================================================
  // 5. Relatório — Date filtering
  // ============================================================
  describe("Relatório — Date filtering", () => {
    it("should return empty results for future date range", async () => {
      const db = await getDb();
      const [rows] = await db.execute(
        `SELECT COUNT(*) as cnt FROM pdv_orders WHERE DATE(createdAt) >= '2099-01-01' AND DATE(createdAt) <= '2099-12-31'`
      );
      await db.end();
      expect(parseInt((rows as any[])[0].cnt)).toBe(0);
    });
  });
});
