/**
 * v60cancel.test.ts
 * Testes para validar a lógica de deleção de linhas da planilha ao cancelar pedido.
 * 
 * As funções reais fazem chamadas à API do Google Sheets, então testamos
 * a lógica de localização de linhas e ordenação decrescente para deleção.
 */

import { describe, it, expect } from 'vitest';

// ─── Helpers que replicam a lógica interna das funções ───────────────────────

/**
 * Simula a lógica de localização de um pedidoId em uma lista de linhas
 * (equivalente ao que deleteOrderFromSheet faz ao ler a coluna A).
 */
function findOrderRowIndex(rows: string[][], pedidoId: string): number {
  return rows.findIndex(row => row[0]?.toString().trim() === pedidoId.trim());
}

/**
 * Simula a lógica de localização de múltiplas linhas de itens
 * (equivalente ao que deleteOrderItemsFromSheet faz).
 */
function findItemRowIndexes(rows: string[][], pedidoId: string): number[] {
  const indexes: number[] = [];
  rows.forEach((row, idx) => {
    if (row[0]?.toString().trim() === pedidoId.trim()) {
      indexes.push(idx + 1); // +1 para pular cabeçalho (linha 0-based)
    }
  });
  return indexes;
}

/**
 * Simula a ordenação decrescente dos índices antes de deletar.
 * Necessário para que a deleção de linhas de baixo não desloque as de cima.
 */
function sortDescending(indexes: number[]): number[] {
  return [...indexes].sort((a, b) => b - a);
}

/**
 * Simula a deleção física de linhas em uma lista (sem deixar buracos).
 * Equivale ao comportamento do batchUpdate deleteRange com shiftDimension=ROWS.
 */
function simulateDeleteRows(rows: string[][], sheetRowIndexes: number[]): string[][] {
  // Ordenar decrescente para deletar de baixo para cima
  const sorted = sortDescending(sheetRowIndexes);
  const result = [...rows];
  for (const idx of sorted) {
    result.splice(idx, 1); // remove 1 elemento no índice (sem deixar buraco)
  }
  return result;
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('v60 — Cancelamento: deleção de linhas na planilha', () => {

  describe('Localização de pedido na aba PEDIDOS', () => {
    const pedidosRows = [
      ['PED-001', '15/04/2026', 'Gianluca', 'Balcão'],
      ['PED-002', '15/04/2026', 'Murilo',   'WhatsApp'],
      ['PED-003', '15/04/2026', 'Vanessa',  'Balcão'],
    ];

    it('encontra o pedido correto pelo ID', () => {
      expect(findOrderRowIndex(pedidosRows, 'PED-002')).toBe(1);
    });

    it('retorna -1 para pedido inexistente', () => {
      expect(findOrderRowIndex(pedidosRows, 'PED-999')).toBe(-1);
    });

    it('converte índice de array para índice de planilha (+1 pelo cabeçalho)', () => {
      const arrayIdx = findOrderRowIndex(pedidosRows, 'PED-001');
      const sheetRowIndex = arrayIdx + 1; // +1 pula o cabeçalho
      expect(sheetRowIndex).toBe(1); // linha 2 da planilha (0-based = índice 1)
    });
  });

  describe('Localização de itens na aba pedidos_itens', () => {
    const itensRows = [
      ['PED-001', 'COD-A', 'Camisa Brasil M'],
      ['PED-001', 'COD-B', 'Camisa Brasil G'],
      ['PED-002', 'COD-C', 'Camisa Argentina P'],
      ['PED-001', 'COD-D', 'Camisa Brasil XG'],
      ['PED-003', 'COD-E', 'Camisa Flamengo M'],
    ];

    it('encontra todas as linhas do pedido PED-001 (3 itens)', () => {
      const indexes = findItemRowIndexes(itensRows, 'PED-001');
      expect(indexes).toHaveLength(3);
      expect(indexes).toContain(1); // linha 2 da planilha (idx 0 + 1)
      expect(indexes).toContain(2); // linha 3
      expect(indexes).toContain(4); // linha 5
    });

    it('retorna array vazio para pedido sem itens', () => {
      const indexes = findItemRowIndexes(itensRows, 'PED-999');
      expect(indexes).toHaveLength(0);
    });

    it('encontra apenas 1 item do pedido PED-002', () => {
      const indexes = findItemRowIndexes(itensRows, 'PED-002');
      expect(indexes).toHaveLength(1);
      expect(indexes[0]).toBe(3); // linha 4 da planilha
    });
  });

  describe('Ordenação decrescente para deleção segura', () => {
    it('ordena índices em ordem decrescente', () => {
      const indexes = [1, 4, 2];
      expect(sortDescending(indexes)).toEqual([4, 2, 1]);
    });

    it('não modifica o array original', () => {
      const original = [3, 1, 5];
      sortDescending(original);
      expect(original).toEqual([3, 1, 5]); // imutável
    });

    it('índice único não muda', () => {
      expect(sortDescending([7])).toEqual([7]);
    });
  });

  describe('Simulação de deleção física (sem linhas em branco)', () => {
    const planilha = [
      ['cabeçalho', 'A', 'B'],         // linha 0 (índice 0)
      ['PED-001',   'v1', 'x1'],       // linha 1 (índice 1)
      ['PED-002',   'v2', 'x2'],       // linha 2 (índice 2)
      ['PED-001',   'v3', 'x3'],       // linha 3 (índice 3)
      ['PED-003',   'v4', 'x4'],       // linha 4 (índice 4)
    ];

    it('deleta uma linha e as demais sobem (sem buraco)', () => {
      const resultado = simulateDeleteRows(planilha, [2]);
      expect(resultado).toHaveLength(4); // 5 - 1 = 4
      expect(resultado[2][0]).toBe('PED-001'); // PED-001 segunda linha subiu para posição 2
      expect(resultado[3][0]).toBe('PED-003'); // PED-003 subiu para posição 3
    });

    it('deleta múltiplas linhas de um mesmo pedido sem deslocamento errado', () => {
      const resultado = simulateDeleteRows(planilha, [1, 3]); // as duas linhas de PED-001
      expect(resultado).toHaveLength(3); // 5 - 2 = 3
      expect(resultado[0][0]).toBe('cabeçalho');
      expect(resultado[1][0]).toBe('PED-002');
      expect(resultado[2][0]).toBe('PED-003');
    });

    it('após deleção não há linhas undefined ou vazias', () => {
      const resultado = simulateDeleteRows(planilha, [1, 3]);
      resultado.forEach(row => {
        expect(row).toBeDefined();
        expect(row.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Cenário completo: cancelar pedido com 2 itens', () => {
    it('remove pedido e itens corretamente, planilha reorganizada', () => {
      const pedidosSheet = [
        ['cabeçalho'],
        ['PED-001'],
        ['PED-002'],
        ['PED-003'],
      ];
      const itensSheet = [
        ['cabeçalho'],
        ['PED-001', 'item A'],
        ['PED-001', 'item B'],
        ['PED-002', 'item C'],
        ['PED-003', 'item D'],
      ];

      // Cancelar PED-001
      const pedidoIdx = findOrderRowIndex(pedidosSheet.slice(1), 'PED-001') + 1;
      const pedidosApos = simulateDeleteRows(pedidosSheet, [pedidoIdx]);

      const itemIndexes = findItemRowIndexes(itensSheet.slice(1), 'PED-001').map(i => i); // já +1
      const itensApos = simulateDeleteRows(itensSheet, itemIndexes);

      // Planilha de pedidos: PED-001 removido, PED-002 e PED-003 permanecem
      expect(pedidosApos.map(r => r[0])).toEqual(['cabeçalho', 'PED-002', 'PED-003']);

      // Planilha de itens: 2 linhas de PED-001 removidas, restam PED-002 e PED-003
      expect(itensApos.map(r => r[0])).toEqual(['cabeçalho', 'PED-002', 'PED-003']);
    });
  });
});
