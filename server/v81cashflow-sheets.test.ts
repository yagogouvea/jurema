/**
 * v81 — Testes de integração: Fluxo de Caixa ↔ Planilha Google Sheets
 *
 * Valida a sincronização bidirecional das abas FLUXO_CAIXA e VENDAS_CAIXA:
 *  - appendCashFlowToSheet: grava suprimento/sangria na planilha
 *  - readCashFlowFromSheet: lê movimentações da planilha
 *  - syncAllCashFlowToSheet: exporta em lote para FLUXO_CAIXA
 *  - syncAllSalesToCashFlowSheet: exporta pedidos para VENDAS_CAIXA
 *
 * NOTA: estes testes fazem chamadas reais à API do Google Sheets.
 * Eles limpam e reescrevem dados nas abas de teste ao final.
 */
import { describe, it, expect, afterAll } from 'vitest';
import {
  appendCashFlowToSheet,
  readCashFlowFromSheet,
  syncAllCashFlowToSheet,
  syncAllSalesToCashFlowSheet,
} from './routers/pdvSheetsWriter';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Aguarda N ms (para respeitar rate limit da API) */
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('Integração FLUXO_CAIXA ↔ Planilha', () => {
  afterAll(async () => {
    // Limpar as linhas de teste da planilha ao final
    await syncAllCashFlowToSheet([]);
    await wait(500);
  });

  it('deve gravar um suprimento na aba FLUXO_CAIXA', async () => {
    const result = await appendCashFlowToSheet({
      id: 'TEST-SUP-001',
      tipo: 'SUPRIMENTO',
      descricao: 'Teste de suprimento automatizado',
      valor: 500.00,
      responsavel: 'SISTEMA_TESTE',
    });
    expect(result).toBe(true);
  }, 15000);

  it('deve gravar uma sangria na aba FLUXO_CAIXA', async () => {
    await wait(1000); // rate limit
    const result = await appendCashFlowToSheet({
      id: 'TEST-SAN-001',
      tipo: 'SANGRIA',
      descricao: 'Teste de sangria automatizado',
      valor: 150.00,
      responsavel: 'SISTEMA_TESTE',
    });
    expect(result).toBe(true);
  }, 15000);

  it('deve ler as movimentações gravadas da planilha', async () => {
    await wait(1000); // rate limit
    const entries = await readCashFlowFromSheet();
    expect(Array.isArray(entries)).toBe(true);

    // Deve ter pelo menos as 2 linhas que gravamos
    expect(entries.length).toBeGreaterThanOrEqual(2);

    // Verificar estrutura dos campos
    const first = entries[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('tipo');
    expect(first).toHaveProperty('descricao');
    expect(first).toHaveProperty('valor');
    expect(first).toHaveProperty('usuario'); // campo retornado pelo readCashFlowFromSheet
    expect(['SUPRIMENTO', 'SANGRIA']).toContain(first.tipo);
  }, 15000);

  it('deve exportar em lote para FLUXO_CAIXA via syncAllCashFlowToSheet', async () => {
    await wait(1000);
    const entries = [
      {
        id: 'BATCH-001',
        tipo: 'SUPRIMENTO' as const,
        descricao: 'Exportação em lote — teste 1',
        valor: 1000.00,
        responsavel: 'ADMIN',
        createdAt: new Date(),
      },
      {
        id: 'BATCH-002',
        tipo: 'SANGRIA' as const,
        descricao: 'Exportação em lote — teste 2',
        valor: 200.00,
        responsavel: 'ADMIN',
        createdAt: new Date(),
      },
    ];
    const result = await syncAllCashFlowToSheet(entries);
    expect(result).toBe(true);
  }, 20000);

  it('deve confirmar que syncAllCashFlowToSheet sobrescreveu os dados anteriores', async () => {
    await wait(1500);
    const entries = await readCashFlowFromSheet();
    // Após o sync em lote com 2 registros, deve ter exatamente 2
    expect(entries.length).toBe(2);
    expect(entries[0].id).toBe('BATCH-001');
    expect(entries[1].id).toBe('BATCH-002');
  }, 15000);
});

describe('Integração VENDAS_CAIXA ↔ Planilha', () => {
  it('deve exportar pedidos para a aba VENDAS_CAIXA via syncAllSalesToCashFlowSheet', async () => {
    await wait(1000);
    const pedidos = [
      {
        id: 9001,
        sellerName: 'GIANLUCA',
        canal: 'Balcão',
        clienteNome: 'Cliente Teste',
        regime: 'VAREJO',
        totalComTaxa: 350.00,
        formaPagamento: 'PIX',
        status: 'fechado',
        qtdItens: 3,
        createdAt: new Date(),
      },
      {
        id: 9002,
        sellerName: 'MURILO',
        canal: 'WhatsApp',
        clienteNome: 'Cliente Atacado',
        regime: 'ATACADO',
        totalComTaxa: 1200.00,
        formaPagamento: 'Dinheiro',
        status: 'fechado',
        qtdItens: 12,
        createdAt: new Date(),
      },
    ];
    const result = await syncAllSalesToCashFlowSheet(pedidos);
    expect(result).toBe(true);
  }, 20000);

  it('deve limpar VENDAS_CAIXA ao chamar syncAllSalesToCashFlowSheet com array vazio', async () => {
    await wait(1500);
    // Limpar ao final
    const result = await syncAllSalesToCashFlowSheet([]);
    expect(result).toBe(true);
  }, 15000);
});
