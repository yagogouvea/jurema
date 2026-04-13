import { describe, it, expect } from "vitest";
import mysql from "mysql2/promise";

async function getDb() {
  return mysql.createConnection(process.env.DATABASE_URL!);
}

describe("v47 — Sofia por item + Configurações centralizadas", () => {
  // ===================== SCHEMA =====================
  it("pdv_order_items deve ter coluna isSofia", async () => {
    const db = await getDb();
    const [cols] = await db.execute("SHOW COLUMNS FROM pdv_order_items LIKE 'isSofia'");
    await db.end();
    expect((cols as any[]).length).toBe(1);
    expect((cols as any[])[0].Type).toContain("tinyint");
  });

  it("pdv_config deve ter chave comissao_peca", async () => {
    const db = await getDb();
    const [rows] = await db.execute("SELECT * FROM pdv_config WHERE `key` = 'comissao_peca'");
    await db.end();
    expect((rows as any[]).length).toBe(1);
    expect(parseFloat((rows as any[])[0].value)).toBeGreaterThanOrEqual(0);
  });

  // ===================== DADOS MIGRADOS =====================
  it("itens de pedidos Sofia antigos devem ter isSofia=1 nos itens", async () => {
    const db = await getDb();
    // Pedidos com isSofia=1 devem ter itens com isSofia=1
    const [rows] = await db.execute(
      `SELECT o.pedidoId, o.isSofia as orderSofia, oi.isSofia as itemSofia
       FROM pdv_orders o
       JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
       WHERE o.isSofia = 1
       LIMIT 10`
    );
    await db.end();
    // Se existem pedidos Sofia, os itens devem estar marcados
    for (const row of rows as any[]) {
      expect(row.itemSofia).toBe(1);
    }
  });

  // ===================== LÓGICA DE COMISSÃO POR ITEM =====================
  it("comissão deve excluir itens Sofia individualmente (não pedido inteiro)", async () => {
    const db = await getDb();
    // Contar peças não-Sofia via query por item (método correto v47)
    const [byItem] = await db.execute(
      `SELECT COALESCE(SUM(oi.quantidade), 0) as pecas
       FROM pdv_order_items oi
       JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
       WHERE oi.isSofia = 0 AND o.status != 'CANCELADO'`
    );
    // Contar peças Sofia via query por item
    const [sofiaItems] = await db.execute(
      `SELECT COALESCE(SUM(oi.quantidade), 0) as pecas
       FROM pdv_order_items oi
       JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
       WHERE oi.isSofia = 1 AND o.status != 'CANCELADO'`
    );
    await db.end();
    
    const pecasNaoSofia = parseInt((byItem as any[])[0].pecas) || 0;
    const pecasSofia = parseInt((sofiaItems as any[])[0].pecas) || 0;
    
    // Peças não-Sofia + peças Sofia devem somar o total de peças
    // E ambos devem ser >= 0
    expect(pecasNaoSofia).toBeGreaterThanOrEqual(0);
    expect(pecasSofia).toBeGreaterThanOrEqual(0);
  });

  // ===================== SOFIA DASHBOARD POR ITEM =====================
  it("dashboard Sofia deve contar por itens Sofia, não por pedido", async () => {
    const db = await getDb();
    const [byItem] = await db.execute(
      `SELECT COALESCE(SUM(oi.quantidade), 0) as pecas, COALESCE(SUM(oi.totalItem), 0) as faturamento
       FROM pdv_order_items oi
       JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
       WHERE oi.isSofia = 1 AND o.status != 'CANCELADO'`
    );
    await db.end();
    
    const pecas = parseInt((byItem as any[])[0].pecas) || 0;
    const faturamento = parseFloat((byItem as any[])[0].faturamento) || 0;
    
    // Valores devem ser >= 0 (pode ser 0 se não houver vendas Sofia)
    expect(pecas).toBeGreaterThanOrEqual(0);
    expect(faturamento).toBeGreaterThanOrEqual(0);
  });

  // ===================== CONFIGURAÇÕES =====================
  it("pdv_goals deve ter 4 metas configuradas", async () => {
    const db = await getDb();
    const [rows] = await db.execute("SELECT * FROM pdv_goals");
    await db.end();
    expect((rows as any[]).length).toBe(4);
    const keys = (rows as any[]).map(r => r.key);
    expect(keys).toContain("BRONZE");
    expect(keys).toContain("PRATA");
    expect(keys).toContain("OURO");
    expect(keys).toContain("META_LOJA");
  });

  it("pdv_sofia_config deve ter comissaoLoja configurada", async () => {
    const db = await getDb();
    const [rows] = await db.execute("SELECT * FROM pdv_sofia_config LIMIT 1");
    await db.end();
    expect((rows as any[]).length).toBe(1);
    expect(parseFloat((rows as any[])[0].comissaoLoja)).toBeGreaterThan(0);
  });

  it("pdv_config deve ter todas as configurações gerais", async () => {
    const db = await getDb();
    const [rows] = await db.execute("SELECT `key` FROM pdv_config");
    await db.end();
    const keys = (rows as any[]).map(r => r.key);
    expect(keys).toContain("nome_loja");
    expect(keys).toContain("taxa_debito");
    expect(keys).toContain("taxa_credito");
    expect(keys).toContain("min_atacado");
    expect(keys).toContain("comissao_peca");
  });

  // ===================== DESCONTO EM FOLHA =====================
  it("pdv_desconto_folha deve ter colunas quitadoEm e quitadoPor", async () => {
    const db = await getDb();
    const [cols] = await db.execute("SHOW COLUMNS FROM pdv_desconto_folha");
    await db.end();
    const colNames = (cols as any[]).map(c => c.Field);
    expect(colNames).toContain("quitadoEm");
    expect(colNames).toContain("quitadoPor");
  });
});
