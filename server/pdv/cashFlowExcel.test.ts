import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildCashFlowExcel } from "./cashFlowExcel";

describe("cashFlowExcel", () => {
  it("mantém cabeçalhos e dados alinhados nas 12 colunas", async () => {
    const buf = await buildCashFlowExcel({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      saldoAnterior: 100,
      saldoGeral: 558.3,
      geradoPor: "VANESSA",
      entries: [
        {
          id: 10,
          tipo: "SUPRIMENTO",
          descricao: "Venda PED-77086826 - Balcão por GABRIEL",
          valor: 435,
          usuario: "GABRIEL",
          createdAt: "2026-08-31T16:00:00.000Z",
          dia: "2026-08-31",
          hora: "13:00:00",
        },
        {
          id: 11,
          tipo: "SANGRIA",
          descricao: "Pagamento Murilo por BEATRIZ",
          valor: 1500,
          usuario: "BEATRIZ",
          createdAt: "2026-08-31T17:00:00.000Z",
          dia: "2026-08-31",
          hora: "14:00:00",
        },
      ],
      closures: [
        {
          dia: "2026-08-29",
          saldoSistema: 123.3,
          valorContado: 123.3,
          diferenca: 0,
          justificativa: null,
          usuario: "VANESSA",
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "Movimentações",
      "Resumo",
      "Fechamentos",
    ]);

    const mov = workbook.getWorksheet("Movimentações")!;
    const headers = [
      "Data",
      "Hora",
      "Tipo",
      "Categoria",
      "Descrição",
      "Pedido",
      "Canal",
      "Usuário",
      "Entrada (R$)",
      "Saída (R$)",
      "Saldo acumulado (R$)",
      "ID",
    ];
    headers.forEach((h, i) => {
      expect(mov.getRow(4).getCell(i + 1).value).toBe(h);
    });

    expect(mov.getRow(5).getCell(1).value).toBe("31/08/2026");
    expect(mov.getRow(5).getCell(2).value).toBe("13:00:00");
    expect(mov.getRow(5).getCell(3).value).toBe("Suprimento");
    expect(mov.getRow(5).getCell(4).value).toBe("Venda");
    expect(mov.getRow(5).getCell(6).value).toBe("PED-77086826");
    expect(mov.getRow(5).getCell(7).value).toBe("Balcão");
    expect(mov.getRow(5).getCell(8).value).toBe("GABRIEL");
    expect(mov.getRow(5).getCell(9).value).toBe(435);
    expect(mov.getRow(5).getCell(10).value).toBeNull();
    expect(mov.getRow(5).getCell(11).value).toBe(535);
    expect(mov.getRow(5).getCell(12).value).toBe(10);

    expect(mov.getRow(6).getCell(1).value).toBe("31/08/2026");
    expect(mov.getRow(6).getCell(3).value).toBe("Sangria");
    expect(mov.getRow(6).getCell(4).value).toBe("Pagamento");
    expect(mov.getRow(6).getCell(9).value).toBeNull();
    expect(mov.getRow(6).getCell(10).value).toBe(1500);
    expect(mov.getRow(6).getCell(11).value).toBe(-965);
    expect(mov.getRow(6).getCell(12).value).toBe(11);

    expect(mov.getRow(7).getCell(1).value).toBe("TOTAL DO PERÍODO");
    expect(mov.getRow(7).getCell(9).value).toBe(435);
    expect(mov.getRow(7).getCell(10).value).toBe(1500);

    const fech = workbook.getWorksheet("Fechamentos")!;
    expect(fech.getRow(3).getCell(1).value).toBe("Data");
    expect(fech.getRow(4).getCell(1).value).toBe("29/08/2026");
    expect(fech.getRow(4).getCell(2).value).toBe(123.3);
    expect(fech.getRow(4).getCell(5).value).toBe("VANESSA");
  });
});
