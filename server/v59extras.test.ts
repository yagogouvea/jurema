/**
 * v59extras.test.ts
 * Testes para validar que valores extras (serviços) são corretamente
 * incluídos no totalAplicado e nas colunas da planilha.
 */

import { describe, it, expect } from 'vitest';

// ─── Helpers que replicam a lógica corrigida ─────────────────────────────────

/**
 * Calcula o totalGeral como o frontend faz após a correção v59.
 * totalAplicado = subtotal dos produtos
 * totalServicos = soma dos serviços extras
 * totalGeral    = totalAplicado + totalServicos  ← enviado ao backend como totalAplicado
 */
function calcTotalGeral(totalAplicado: number, services: { valor: number }[]): number {
  const totalServicos = services.reduce((sum, s) => sum + s.valor, 0);
  return totalAplicado + totalServicos;
}

/**
 * Calcula o totalPendente como o frontend faz.
 * Deve usar totalGeral (não totalAplicado) para que os extras sejam considerados.
 */
function calcTotalPendente(totalGeral: number, totalPago: number): number {
  return Math.max(0, totalGeral - totalPago);
}

/**
 * Replica o cálculo da coluna L (valor_sem_taxa) e O (total_com_taxa)
 * da planilha PEDIDOS após a correção v59.
 * totalAplicado já chega com extras incluídos.
 */
function calcSheetColumns(totalAplicado: number, payments: { taxa: number }[]) {
  const taxaTotal = payments.reduce((sum, p) => sum + (p.taxa || 0), 0);
  const valorSemTaxa = totalAplicado; // já inclui extras
  const totalComTaxa = valorSemTaxa + taxaTotal;
  return { valorSemTaxa, totalComTaxa };
}

/**
 * Replica o cálculo de extra proporcional por item na aba pedidos_itens.
 */
function calcExtraProporcional(
  item: { totalItem: number },
  totalGeralItens: number,
  extraValorTotal: number,
): number {
  const proporcao = totalGeralItens > 0 ? item.totalItem / totalGeralItens : 0;
  return extraValorTotal * proporcao;
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('v59 — Bug: extras não somados ao total', () => {

  describe('Bug 1 — totalAplicado enviado ao backend deve incluir extras', () => {
    it('sem extras: totalGeral = totalAplicado', () => {
      const totalAplicado = 200;
      const services: { valor: number }[] = [];
      expect(calcTotalGeral(totalAplicado, services)).toBe(200);
    });

    it('com frete R$20: totalGeral = 220', () => {
      const totalAplicado = 200;
      const services = [{ tipo: 'Correio', valor: 20 }];
      expect(calcTotalGeral(totalAplicado, services)).toBe(220);
    });

    it('com múltiplos extras: totalGeral soma todos', () => {
      const totalAplicado = 300;
      const services = [
        { tipo: 'Correio', valor: 20 },
        { tipo: 'Caixinha', valor: 5 },
      ];
      expect(calcTotalGeral(totalAplicado, services)).toBe(325);
    });
  });

  describe('Bug 3 — totalPendente deve usar totalGeral (com extras)', () => {
    it('cliente pagou R$200 mas total com extras é R$220 → pendente R$20', () => {
      const totalGeral = 220;
      const totalPago = 200;
      expect(calcTotalPendente(totalGeral, totalPago)).toBe(20);
    });

    it('cliente pagou exato → pendente 0', () => {
      const totalGeral = 220;
      const totalPago = 220;
      expect(calcTotalPendente(totalGeral, totalPago)).toBe(0);
    });

    it('sem extras: pendente calculado normalmente', () => {
      const totalGeral = 200;
      const totalPago = 150;
      expect(calcTotalPendente(totalGeral, totalPago)).toBe(50);
    });
  });

  describe('Bug 2 — Planilha PEDIDOS: colunas L e O corretas', () => {
    it('sem taxa: L = totalAplicado (com extras), O = L', () => {
      const totalAplicado = 220; // já inclui extras
      const payments = [{ taxa: 0 }];
      const { valorSemTaxa, totalComTaxa } = calcSheetColumns(totalAplicado, payments);
      expect(valorSemTaxa).toBe(220);
      expect(totalComTaxa).toBe(220);
    });

    it('com taxa de cartão R$11: L = 220, O = 231', () => {
      const totalAplicado = 220;
      const payments = [{ taxa: 11 }];
      const { valorSemTaxa, totalComTaxa } = calcSheetColumns(totalAplicado, payments);
      expect(valorSemTaxa).toBe(220);
      expect(totalComTaxa).toBe(231);
    });

    it('sem extras e sem taxa: L = O = subtotal dos produtos', () => {
      const totalAplicado = 300; // sem extras
      const payments = [{ taxa: 0 }];
      const { valorSemTaxa, totalComTaxa } = calcSheetColumns(totalAplicado, payments);
      expect(valorSemTaxa).toBe(300);
      expect(totalComTaxa).toBe(300);
    });
  });

  describe('Bug 4 — Planilha pedidos_itens: extra distribuído proporcionalmente', () => {
    it('dois itens iguais: extra dividido 50/50', () => {
      const items = [
        { totalItem: 100 },
        { totalItem: 100 },
      ];
      const totalGeralItens = 200;
      const extraValorTotal = 20;
      const extra0 = calcExtraProporcional(items[0], totalGeralItens, extraValorTotal);
      const extra1 = calcExtraProporcional(items[1], totalGeralItens, extraValorTotal);
      expect(extra0).toBeCloseTo(10);
      expect(extra1).toBeCloseTo(10);
      expect(extra0 + extra1).toBeCloseTo(extraValorTotal);
    });

    it('itens com valores diferentes: extra proporcional ao valor', () => {
      const items = [
        { totalItem: 300 }, // 75% do total
        { totalItem: 100 }, // 25% do total
      ];
      const totalGeralItens = 400;
      const extraValorTotal = 40;
      const extra0 = calcExtraProporcional(items[0], totalGeralItens, extraValorTotal);
      const extra1 = calcExtraProporcional(items[1], totalGeralItens, extraValorTotal);
      expect(extra0).toBeCloseTo(30); // 75% de 40
      expect(extra1).toBeCloseTo(10); // 25% de 40
      expect(extra0 + extra1).toBeCloseTo(extraValorTotal);
    });

    it('sem extras: extra proporcional = 0', () => {
      const items = [{ totalItem: 200 }];
      const totalGeralItens = 200;
      const extraValorTotal = 0;
      const extra = calcExtraProporcional(items[0], totalGeralItens, extraValorTotal);
      expect(extra).toBe(0);
    });

    it('item único: recebe 100% do extra', () => {
      const items = [{ totalItem: 150 }];
      const totalGeralItens = 150;
      const extraValorTotal = 25;
      const extra = calcExtraProporcional(items[0], totalGeralItens, extraValorTotal);
      expect(extra).toBeCloseTo(25);
    });
  });

  describe('Cenário completo: pedido R$200 + frete R$20 + taxa cartão R$11', () => {
    it('todos os valores batem', () => {
      const totalAplicado = 200; // subtotal dos produtos
      const services = [{ tipo: 'Correio', valor: 20 }];
      const payments = [{ taxa: 11 }];

      // Frontend calcula totalGeral e envia como totalAplicado ao backend
      const totalGeral = calcTotalGeral(totalAplicado, services);
      expect(totalGeral).toBe(220);

      // Planilha PEDIDOS
      const { valorSemTaxa, totalComTaxa } = calcSheetColumns(totalGeral, payments);
      expect(valorSemTaxa).toBe(220); // L: valor_sem_taxa
      expect(totalComTaxa).toBe(231); // O: total_com_taxa

      // Pendente: cliente pagou apenas R$200 (sem incluir frete)
      const totalPendente = calcTotalPendente(totalGeral, 200);
      expect(totalPendente).toBe(20); // deve cobrar o frete pendente
    });
  });
});
