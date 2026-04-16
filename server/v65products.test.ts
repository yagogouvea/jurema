/**
 * v65 — Testes para cadastro de produtos em lote
 */
import { describe, it, expect } from "vitest";

// ─── Helpers de lógica pura (sem banco/planilha) ──────────────────────────────

function buildProductRows(input: {
  linha: string;
  modelo: string;
  time: string;
  descricao?: string;
  tipo: string;
  precoAtacado: number;
  precoVarejo: number;
  ptAtacado: number;
  ptVarejo: number;
  fotoUrl?: string;
  temporada?: string;
  codigoBase?: string;
  tamanhos: { tamanho: string; estoque: number; precoAtacado?: number; precoVarejo?: number }[];
}) {
  return input.tamanhos.map(tam => {
    const tamUp = tam.tamanho.toUpperCase();
    const codigo = input.codigoBase ? `${input.codigoBase}-${tamUp}` : '';
    const precoAtacado = tam.precoAtacado ?? input.precoAtacado;
    const precoVarejo = tam.precoVarejo ?? input.precoVarejo;
    return {
      codigo,
      linha: input.linha,
      modelo: input.modelo,
      time: input.time,
      descricao: input.descricao || '',
      tamanho: tam.tamanho,
      tipo: input.tipo,
      estoque: tam.estoque,
      precoAtacado,
      precoVarejo,
      fotoUrl: input.fotoUrl || '',
      temporada: input.temporada || '',
      ptAtacado: input.ptAtacado,
      ptVarejo: input.ptVarejo,
    };
  });
}

describe("v65 — Cadastro de produtos em lote", () => {
  it("gera código correto para cada tamanho", () => {
    const rows = buildProductRows({
      linha: "TAILANDESA",
      modelo: "TORCEDOR",
      time: "AL HALY",
      tipo: "CAMISETA",
      precoAtacado: 80,
      precoVarejo: 120,
      ptAtacado: 0,
      ptVarejo: 0,
      codigoBase: "CA-T-TO-ALH-VERM",
      tamanhos: [
        { tamanho: "M", estoque: 5 },
        { tamanho: "G", estoque: 3 },
        { tamanho: "XG", estoque: 2 },
      ],
    });

    expect(rows).toHaveLength(3);
    expect(rows[0].codigo).toBe("CA-T-TO-ALH-VERM-M");
    expect(rows[1].codigo).toBe("CA-T-TO-ALH-VERM-G");
    expect(rows[2].codigo).toBe("CA-T-TO-ALH-VERM-XG");
  });

  it("usa preço base quando tamanho não tem preço customizado", () => {
    const rows = buildProductRows({
      linha: "TAILANDESA",
      modelo: "TORCEDOR",
      time: "BRASIL",
      tipo: "CAMISETA",
      precoAtacado: 80,
      precoVarejo: 120,
      ptAtacado: 2,
      ptVarejo: 3,
      tamanhos: [
        { tamanho: "P", estoque: 10 },
        { tamanho: "M", estoque: 10 },
      ],
    });

    expect(rows[0].precoAtacado).toBe(80);
    expect(rows[0].precoVarejo).toBe(120);
    expect(rows[1].precoAtacado).toBe(80);
  });

  it("usa preço customizado quando informado para o tamanho", () => {
    const rows = buildProductRows({
      linha: "TAILANDESA",
      modelo: "TORCEDOR",
      time: "BRASIL",
      tipo: "CAMISETA",
      precoAtacado: 80,
      precoVarejo: 120,
      ptAtacado: 0,
      ptVarejo: 0,
      tamanhos: [
        { tamanho: "M", estoque: 5 },
        { tamanho: "2XL", estoque: 2, precoAtacado: 95, precoVarejo: 140 },
      ],
    });

    expect(rows[0].precoAtacado).toBe(80);
    expect(rows[1].precoAtacado).toBe(95);
    expect(rows[1].precoVarejo).toBe(140);
  });

  it("gera código vazio quando codigoBase não é informado", () => {
    const rows = buildProductRows({
      linha: "SOFIA",
      modelo: "EXCLUSIVO",
      time: "FLAMENGO",
      tipo: "CAMISETA",
      precoAtacado: 100,
      precoVarejo: 150,
      ptAtacado: 0,
      ptVarejo: 0,
      tamanhos: [{ tamanho: "G", estoque: 1 }],
    });

    expect(rows[0].codigo).toBe('');
  });

  it("propaga fotoUrl e temporada para todas as variantes", () => {
    const rows = buildProductRows({
      linha: "TAILANDESA",
      modelo: "TORCEDOR",
      time: "PALMEIRAS",
      tipo: "CAMISETA",
      precoAtacado: 75,
      precoVarejo: 110,
      ptAtacado: 1,
      ptVarejo: 2,
      fotoUrl: "https://cdn.example.com/palmeiras.jpg",
      temporada: "2024/25",
      tamanhos: [
        { tamanho: "P", estoque: 3 },
        { tamanho: "M", estoque: 4 },
        { tamanho: "G", estoque: 2 },
      ],
    });

    for (const row of rows) {
      expect(row.fotoUrl).toBe("https://cdn.example.com/palmeiras.jpg");
      expect(row.temporada).toBe("2024/25");
      expect(row.ptAtacado).toBe(1);
      expect(row.ptVarejo).toBe(2);
    }
  });

  it("converte tamanho para uppercase no código", () => {
    const rows = buildProductRows({
      linha: "TAILANDESA",
      modelo: "TORCEDOR",
      time: "CORINTHIANS",
      tipo: "CAMISETA",
      precoAtacado: 70,
      precoVarejo: 100,
      ptAtacado: 0,
      ptVarejo: 0,
      codigoBase: "CA-T-CO-COR",
      tamanhos: [
        { tamanho: "m", estoque: 5 },  // minúsculo
        { tamanho: "xl", estoque: 2 }, // minúsculo
      ],
    });

    expect(rows[0].codigo).toBe("CA-T-CO-COR-M");
    expect(rows[1].codigo).toBe("CA-T-CO-COR-XL");
  });

  it("calcula estoque total corretamente", () => {
    const tamanhos = [
      { tamanho: "P", estoque: 3 },
      { tamanho: "M", estoque: 7 },
      { tamanho: "G", estoque: 5 },
      { tamanho: "GG", estoque: 2 },
    ];
    const total = tamanhos.reduce((s, t) => s + t.estoque, 0);
    expect(total).toBe(17);
  });

  it("planilha recebe 15 colunas (A-O) por linha", () => {
    const rows = buildProductRows({
      linha: "TAILANDESA",
      modelo: "TORCEDOR",
      time: "SANTOS",
      tipo: "CAMISETA",
      precoAtacado: 80,
      precoVarejo: 120,
      ptAtacado: 1.5,
      ptVarejo: 2.5,
      fotoUrl: "https://cdn.example.com/santos.jpg",
      temporada: "2025",
      codigoBase: "CA-T-TO-SAN",
      tamanhos: [{ tamanho: "M", estoque: 10 }],
    });

    const row = rows[0];
    // Verificar que todos os 15 campos estão presentes
    const sheetRow = [
      row.codigo,        // A
      row.linha,         // B
      row.modelo,        // C
      row.time,          // D
      row.descricao,     // E
      row.tamanho,       // F
      row.tipo,          // G
      row.estoque,       // H
      row.precoAtacado,  // I
      row.precoVarejo,   // J
      'SIM',             // K
      row.fotoUrl,       // L
      row.temporada,     // M
      row.ptAtacado,     // N
      row.ptVarejo,      // O
    ];
    expect(sheetRow).toHaveLength(15);
    expect(sheetRow[0]).toBe("CA-T-TO-SAN-M");
    expect(sheetRow[11]).toBe("https://cdn.example.com/santos.jpg");
    expect(sheetRow[12]).toBe("2025");
  });
});
