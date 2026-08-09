import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildReconcileReportExcel } from "./reportExcel";
import type { ReconcileResult } from "./types";

describe("reportExcel", () => {
  it("separa extrato e PDV e destaca linha não identificada", async () => {
    const unmatched = {
      id: "arquivo-1|linha-1",
      source: "infinitepay" as const,
      extractFileName: "infinitepay-julho.pdf",
      date: "2026-07-01",
      time: "10:00",
      datetimeIso: "2026-07-01T10:00:00-03:00",
      type: "PIX" as const,
      direction: "in" as const,
      payerNameRaw: "PAGADOR DESCONHECIDO",
      payerNameNorm: "PAGADOR DESCONHECIDO",
      amountCents: 12345,
      page: 1,
    };
    const result: ReconcileResult = {
      source: "infinitepay",
      period: { start: "2026-07-01", end: "2026-07-31" },
      accountLabel: "Conta principal",
      totals: {
        extractInCents: 12345,
        matchedCents: 0,
        onlyExtractCents: 12345,
        onlyPdvCents: 0,
        matchCount: 0,
        reviewCount: 0,
      },
      matched: [],
      review: [],
      onlyExtract: [unmatched],
      onlyPdv: [],
      ordersConfirmed: [],
      ordersReview: [],
      ordersUnmatched: [],
      extractUnmatched: [unmatched],
      narrativeText: "",
    };

    const data = await buildReconcileReportExcel(result, { generatedBy: "Admin" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumo",
      "Conciliação",
      "Extrato completo",
      "Pedidos PDV",
    ]);
    const sheet = workbook.getWorksheet("Conciliação")!;
    expect(sheet.getCell("A5").value).toBe("NÃO IDENTIFICADO");
    expect((sheet.getCell("A5").fill as ExcelJS.FillPattern).fgColor?.argb).toBe(
      "FFF4CCCC"
    );
    expect(sheet.getCell("B5").value).toBe("infinitepay-julho.pdf");
  });
});
