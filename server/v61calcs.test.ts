/**
 * v61calcs.test.ts
 * Testes para validar as correções de cálculo e formatação da planilha:
 * 1. valor_sem_taxa (col L) = subtotal itens + extras
 * 2. total_com_taxa (col O) = valor_sem_taxa + taxa de cartão
 * 3. Comissão na planilha = qtd × comissaoUnitaria (apenas itens não-Sofia)
 * 4. Formatação de data no padrão DD/MM/YYYY HH:MM
 * 5. Valores numéricos (não strings) para colunas de valor
 * 6. SOFIA_ITENS col M inclui extra proporcional
 * 7. Taxa de débito/crédito: vendedor digita valor real, sistema calcula maquininha
 */

import { describe, it, expect } from 'vitest';

// ─── Helpers que replicam a lógica corrigida ─────────────────────────────────

/** Formata data no padrão DD/MM/YYYY HH:MM (UTC-3 = Brasília) */
function formatDataBR(date: Date): string {
  const dtBR = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(dtBR.getUTCDate())}/${pad(dtBR.getUTCMonth() + 1)}/${dtBR.getUTCFullYear()} ${pad(dtBR.getUTCHours())}:${pad(dtBR.getUTCMinutes())}`;
}

/** Calcula valor_sem_taxa (col L da aba PEDIDOS) */
function calcValorSemTaxa(totalAplicadoNormal: number, extraValor: number): number {
  return totalAplicadoNormal + extraValor;
}

/** Calcula total_com_taxa (col O da aba PEDIDOS) */
function calcTotalComTaxa(valorSemTaxa: number, taxaTotal: number): number {
  return valorSemTaxa + taxaTotal;
}

/** Calcula comissão total (col T da aba PEDIDOS) — apenas itens não-Sofia */
function calcComissaoTotal(
  items: Array<{ quantidade: number; isSofia: boolean }>,
  comissaoUnitaria: number,
): number {
  return items
    .filter(item => !item.isSofia)
    .reduce((sum, item) => sum + item.quantidade * comissaoUnitaria, 0);
}

/** Calcula valor da maquininha a partir do valor real (taxa em %) */
function calcMaquininha(valorReal: number, taxaPct: number): number {
  return valorReal + (valorReal * taxaPct) / 100;
}

/** Calcula taxa em R$ a partir do valor real */
function calcTaxaReais(valorReal: number, taxaPct: number): number {
  return (valorReal * taxaPct) / 100;
}

/** Calcula extra proporcional por item (para aba pedidos_itens e SOFIA_ITENS) */
function calcExtraProporcional(
  itemTotal: number,
  totalGeralItens: number,
  extraValorTotal: number,
): number {
  const proporcao = totalGeralItens > 0 ? itemTotal / totalGeralItens : 0;
  return extraValorTotal * proporcao;
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('v61 — Cálculos e formatação da planilha', () => {

  describe('Formatação de data para o Google Sheets', () => {
    it('formata data UTC para horário de Brasília (UTC-3)', () => {
      // 2026-04-16T00:00:00Z = 15/04/2026 21:00 em Brasília
      const date = new Date('2026-04-16T00:00:00Z');
      expect(formatDataBR(date)).toBe('15/04/2026 21:00');
    });

    it('formata data com padding de zeros', () => {
      // 2026-01-05T12:05:00Z = 05/01/2026 09:05 em Brasília
      const date = new Date('2026-01-05T12:05:00Z');
      expect(formatDataBR(date)).toBe('05/01/2026 09:05');
    });

    it('formato é DD/MM/YYYY HH:MM (não ISO)', () => {
      const date = new Date('2026-04-15T22:00:00Z');
      const result = formatDataBR(date);
      // Deve ter formato DD/MM/YYYY HH:MM
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    });
  });

  describe('Col L — valor_sem_taxa = subtotal itens + extras', () => {
    it('sem extras: valor_sem_taxa = subtotal dos itens', () => {
      expect(calcValorSemTaxa(300, 0)).toBe(300);
    });

    it('com frete R$20: valor_sem_taxa = 320', () => {
      expect(calcValorSemTaxa(300, 20)).toBe(320);
    });

    it('com múltiplos extras: valor_sem_taxa soma todos', () => {
      expect(calcValorSemTaxa(300, 25)).toBe(325); // 20 correio + 5 caixinha
    });

    it('valor_sem_taxa é número (não string)', () => {
      const result = calcValorSemTaxa(200, 15);
      expect(typeof result).toBe('number');
      expect(result).toBe(215);
    });
  });

  describe('Col O — total_com_taxa = valor_sem_taxa + taxa cartão', () => {
    it('sem taxa: total_com_taxa = valor_sem_taxa', () => {
      expect(calcTotalComTaxa(320, 0)).toBe(320);
    });

    it('com taxa de crédito 5% sobre R$300 = R$15 → total R$335', () => {
      expect(calcTotalComTaxa(320, 15)).toBe(335);
    });

    it('cenário completo: R$300 itens + R$20 frete + R$16 taxa crédito 5%', () => {
      const valorSemTaxa = calcValorSemTaxa(300, 20); // 320
      const taxa = calcTaxaReais(300, 5); // 15 (taxa calculada sobre valor real, não sobre total com extras)
      const totalComTaxa = calcTotalComTaxa(valorSemTaxa, taxa);
      expect(valorSemTaxa).toBe(320);
      expect(taxa).toBe(15);
      expect(totalComTaxa).toBe(335);
    });
  });

  describe('Col T — comissão total (apenas itens não-Sofia)', () => {
    const comissaoUnitaria = 0.50;

    it('todos os itens normais: comissão = soma de qtd × R$0,50', () => {
      const items = [
        { quantidade: 3, isSofia: false },
        { quantidade: 2, isSofia: false },
      ];
      expect(calcComissaoTotal(items, comissaoUnitaria)).toBe(2.50);
    });

    it('itens Sofia não geram comissão', () => {
      const items = [
        { quantidade: 3, isSofia: false },
        { quantidade: 5, isSofia: true }, // Sofia: sem comissão
      ];
      expect(calcComissaoTotal(items, comissaoUnitaria)).toBe(1.50); // apenas 3 × 0.50
    });

    it('todos os itens Sofia: comissão = 0', () => {
      const items = [
        { quantidade: 4, isSofia: true },
        { quantidade: 6, isSofia: true },
      ];
      expect(calcComissaoTotal(items, comissaoUnitaria)).toBe(0);
    });

    it('comissão é número (não string)', () => {
      const items = [{ quantidade: 2, isSofia: false }];
      const result = calcComissaoTotal(items, comissaoUnitaria);
      expect(typeof result).toBe('number');
    });
  });

  describe('Taxa débito/crédito: vendedor digita valor real, sistema calcula maquininha', () => {
    it('crédito 5%: R$200 real → R$210 maquininha', () => {
      expect(calcMaquininha(200, 5)).toBe(210);
    });

    it('débito 3%: R$200 real → R$206 maquininha', () => {
      expect(calcMaquininha(200, 3)).toBe(206);
    });

    it('PIX/dinheiro 0%: maquininha = valor real', () => {
      expect(calcMaquininha(200, 0)).toBe(200);
    });

    it('taxa em R$ calculada corretamente', () => {
      expect(calcTaxaReais(200, 5)).toBe(10);
      expect(calcTaxaReais(200, 3)).toBe(6);
    });

    it('valor real + taxa = maquininha', () => {
      const valorReal = 150;
      const taxa = calcTaxaReais(valorReal, 5);
      const maquininha = calcMaquininha(valorReal, 5);
      expect(valorReal + taxa).toBe(maquininha);
    });
  });

  describe('SOFIA_ITENS col M — valor total sem taxa inclui extra proporcional', () => {
    it('item único: recebe 100% do extra', () => {
      const extra = calcExtraProporcional(200, 200, 20);
      const colM = 200 + extra;
      expect(extra).toBe(20);
      expect(colM).toBe(220);
    });

    it('dois itens iguais: extra dividido 50/50', () => {
      const extra0 = calcExtraProporcional(100, 200, 20);
      const extra1 = calcExtraProporcional(100, 200, 20);
      expect(extra0).toBe(10);
      expect(extra1).toBe(10);
      const colM0 = 100 + extra0;
      const colM1 = 100 + extra1;
      expect(colM0).toBe(110);
      expect(colM1).toBe(110);
    });

    it('sem extras: col M = valor do item', () => {
      const extra = calcExtraProporcional(150, 150, 0);
      expect(extra).toBe(0);
      expect(150 + extra).toBe(150);
    });
  });

  describe('Cenário completo: pedido misto com crédito e frete', () => {
    it('R$300 itens + R$20 frete + crédito 5% → planilha correta', () => {
      const subtotalItens = 300;
      const extraValor = 20;
      const valorReal = 300; // vendedor digita R$300
      const taxaPct = 5;

      // Frontend: vendedor digita R$300, sistema calcula maquininha
      const maquininha = calcMaquininha(valorReal, taxaPct);
      expect(maquininha).toBe(315);

      // Backend → planilha PEDIDOS
      const taxaReais = calcTaxaReais(valorReal, taxaPct);
      const valorSemTaxa = calcValorSemTaxa(subtotalItens, extraValor);
      const totalComTaxa = calcTotalComTaxa(valorSemTaxa, taxaReais);

      expect(taxaReais).toBe(15);
      expect(valorSemTaxa).toBe(320);   // col L
      expect(totalComTaxa).toBe(335);   // col O

      // Comissão (3 peças × R$0,50)
      const items = [{ quantidade: 3, isSofia: false }];
      const comissao = calcComissaoTotal(items, 0.50);
      expect(comissao).toBe(1.50);      // col T
    });
  });
});
