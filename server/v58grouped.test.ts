/**
 * v58 — Testes de unificação de produtos por modelo (listGrouped)
 * Valida a lógica de extração do código base e agrupamento de variantes
 */

import { describe, it, expect } from "vitest";

// ─── Helpers (replicados da lógica do pdvProducts.ts) ───────────────────────

function extractBaseCode(codigo: string): string {
  const parts = codigo.split("-");
  return parts.length > 1 ? parts.slice(0, -1).join("-") : codigo;
}

interface MockProduct {
  id: number;
  codigo: string;
  linha: string;
  modelo: string;
  time: string;
  descricao?: string;
  tipo?: string;
  tamanho: string;
  estoque: number;
  precoAtacado: number;
  precoVarejo: number;
}

function groupProducts(products: MockProduct[]) {
  const groupMap = new Map<string, any>();

  for (const p of products) {
    const baseCode = extractBaseCode(p.codigo);

    if (!groupMap.has(baseCode)) {
      groupMap.set(baseCode, {
        baseCode,
        linha: p.linha,
        modelo: p.modelo,
        time: p.time,
        descricao: p.descricao,
        tipo: p.tipo,
        precoAtacado: p.precoAtacado,
        precoVarejo: p.precoVarejo,
        estoqueTotal: 0,
        variantes: [],
      });
    }

    const group = groupMap.get(baseCode)!;
    group.estoqueTotal += p.estoque;
    group.variantes.push({
      id: p.id,
      tamanho: p.tamanho,
      estoque: p.estoque,
      codigo: p.codigo,
      precoAtacado: p.precoAtacado,
      precoVarejo: p.precoVarejo,
    });
  }

  return Array.from(groupMap.values());
}

// ─── Dados de teste ──────────────────────────────────────────────────────────

const mockProducts: MockProduct[] = [
  { id: 1, codigo: "CA-T-TO-BRA-AMAR-S",  linha: "TAILANDESA", modelo: "TORCEDOR", time: "BRASIL", descricao: "AMARELA", tipo: "CAMISETA", tamanho: "S",  estoque: 8,  precoAtacado: 89.90, precoVarejo: 129.90 },
  { id: 2, codigo: "CA-T-TO-BRA-AMAR-M",  linha: "TAILANDESA", modelo: "TORCEDOR", time: "BRASIL", descricao: "AMARELA", tipo: "CAMISETA", tamanho: "M",  estoque: 12, precoAtacado: 89.90, precoVarejo: 129.90 },
  { id: 3, codigo: "CA-T-TO-BRA-AMAR-L",  linha: "TAILANDESA", modelo: "TORCEDOR", time: "BRASIL", descricao: "AMARELA", tipo: "CAMISETA", tamanho: "L",  estoque: 10, precoAtacado: 89.90, precoVarejo: 129.90 },
  { id: 4, codigo: "CA-T-TO-BRA-AMAR-XL", linha: "TAILANDESA", modelo: "TORCEDOR", time: "BRASIL", descricao: "AMARELA", tipo: "CAMISETA", tamanho: "XL", estoque: 5,  precoAtacado: 89.90, precoVarejo: 129.90 },
  { id: 5, codigo: "CA-T-TO-BRA-AZUL-M",  linha: "TAILANDESA", modelo: "TORCEDOR", time: "BRASIL", descricao: "AZUL",   tipo: "CAMISETA", tamanho: "M",  estoque: 6,  precoAtacado: 89.90, precoVarejo: 129.90 },
  { id: 6, codigo: "CA-T-TO-BRA-AZUL-G",  linha: "TAILANDESA", modelo: "TORCEDOR", time: "BRASIL", descricao: "AZUL",   tipo: "CAMISETA", tamanho: "G",  estoque: 4,  precoAtacado: 89.90, precoVarejo: 129.90 },
  { id: 7, codigo: "CA-N-TO-ARG-BRA-M",   linha: "NACIONAL",   modelo: "TORCEDOR", time: "ARGENTINA", descricao: "BRANCA", tipo: "CAMISETA", tamanho: "M",  estoque: 3,  precoAtacado: 59.90, precoVarejo: 89.90 },
  { id: 8, codigo: "CA-N-TO-ARG-BRA-G",   linha: "NACIONAL",   modelo: "TORCEDOR", time: "ARGENTINA", descricao: "BRANCA", tipo: "CAMISETA", tamanho: "G",  estoque: 7,  precoAtacado: 59.90, precoVarejo: 89.90 },
];

// ─── Testes ──────────────────────────────────────────────────────────────────

describe("v58 — listGrouped: extração de código base", () => {
  it("deve extrair código base removendo o último segmento", () => {
    expect(extractBaseCode("CA-T-TO-BRA-AMAR-XL")).toBe("CA-T-TO-BRA-AMAR");
    expect(extractBaseCode("CA-T-TO-BRA-AMAR-M")).toBe("CA-T-TO-BRA-AMAR");
    expect(extractBaseCode("CA-N-TO-ARG-BRA-G")).toBe("CA-N-TO-ARG-BRA");
  });

  it("deve manter código sem hífens intacto", () => {
    expect(extractBaseCode("PRODUTO")).toBe("PRODUTO");
  });

  it("deve funcionar com tamanhos numéricos", () => {
    expect(extractBaseCode("CA-T-TO-BRA-AMAR-16")).toBe("CA-T-TO-BRA-AMAR");
    expect(extractBaseCode("CA-T-TO-BRA-AMAR-2XL")).toBe("CA-T-TO-BRA-AMAR");
    expect(extractBaseCode("CA-T-TO-BRA-AMAR-3XL")).toBe("CA-T-TO-BRA-AMAR");
  });
});

describe("v58 — listGrouped: agrupamento de produtos", () => {
  it("deve agrupar 8 produtos em 3 modelos", () => {
    const groups = groupProducts(mockProducts);
    expect(groups).toHaveLength(3);
  });

  it("deve agrupar 4 variantes de BRASIL AMARELA em 1 grupo", () => {
    const groups = groupProducts(mockProducts);
    const brasilAmar = groups.find(g => g.baseCode === "CA-T-TO-BRA-AMAR");
    expect(brasilAmar).toBeDefined();
    expect(brasilAmar!.variantes).toHaveLength(4);
    expect(brasilAmar!.variantes.map((v: any) => v.tamanho)).toEqual(["S", "M", "L", "XL"]);
  });

  it("deve calcular estoque total corretamente", () => {
    const groups = groupProducts(mockProducts);
    const brasilAmar = groups.find(g => g.baseCode === "CA-T-TO-BRA-AMAR");
    // S=8, M=12, L=10, XL=5 → total=35
    expect(brasilAmar!.estoqueTotal).toBe(35);
  });

  it("deve agrupar BRASIL AZUL com 2 variantes", () => {
    const groups = groupProducts(mockProducts);
    const brasilAzul = groups.find(g => g.baseCode === "CA-T-TO-BRA-AZUL");
    expect(brasilAzul).toBeDefined();
    expect(brasilAzul!.variantes).toHaveLength(2);
    expect(brasilAzul!.estoqueTotal).toBe(10);
  });

  it("deve agrupar ARGENTINA com 2 variantes", () => {
    const groups = groupProducts(mockProducts);
    const argentina = groups.find(g => g.baseCode === "CA-N-TO-ARG-BRA");
    expect(argentina).toBeDefined();
    expect(argentina!.variantes).toHaveLength(2);
    expect(argentina!.estoqueTotal).toBe(10);
  });

  it("deve preservar preços do grupo", () => {
    const groups = groupProducts(mockProducts);
    const brasilAmar = groups.find(g => g.baseCode === "CA-T-TO-BRA-AMAR");
    expect(brasilAmar!.precoAtacado).toBe(89.90);
    expect(brasilAmar!.precoVarejo).toBe(129.90);
  });

  it("deve preservar dados do produto (linha, modelo, time, descricao)", () => {
    const groups = groupProducts(mockProducts);
    const brasilAmar = groups.find(g => g.baseCode === "CA-T-TO-BRA-AMAR");
    expect(brasilAmar!.linha).toBe("TAILANDESA");
    expect(brasilAmar!.modelo).toBe("TORCEDOR");
    expect(brasilAmar!.time).toBe("BRASIL");
    expect(brasilAmar!.descricao).toBe("AMARELA");
  });

  it("deve incluir código completo em cada variante", () => {
    const groups = groupProducts(mockProducts);
    const brasilAmar = groups.find(g => g.baseCode === "CA-T-TO-BRA-AMAR");
    const codigos = brasilAmar!.variantes.map((v: any) => v.codigo);
    expect(codigos).toContain("CA-T-TO-BRA-AMAR-S");
    expect(codigos).toContain("CA-T-TO-BRA-AMAR-XL");
  });
});

describe("v58 — listGrouped: paginação de grupos", () => {
  it("deve paginar grupos corretamente", () => {
    const groups = groupProducts(mockProducts);
    const limit = 2;
    const page1 = groups.slice(0, limit);
    const page2 = groups.slice(limit, limit * 2);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
  });

  it("deve calcular totalPages corretamente", () => {
    const groups = groupProducts(mockProducts);
    const total = groups.length; // 3
    const limit = 2;
    const totalPages = Math.ceil(total / limit);
    expect(totalPages).toBe(2);
  });
});
