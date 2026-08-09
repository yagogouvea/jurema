import ExcelJS from "exceljs";
import type {
  ExtractLine,
  OrderConfirmedRow,
  OrderReviewRow,
  OrderUnmatchedRow,
  ReconcileResult,
} from "./types";

const COLORS = {
  navy: "FF17365D",
  blue: "FF1F4E78",
  blueLight: "FFD9EAF7",
  green: "FF548235",
  greenLight: "FFE2F0D9",
  amber: "FFFFC000",
  amberLight: "FFFFF2CC",
  red: "FFC00000",
  redLight: "FFF4CCCC",
  gray: "FFE7E6E6",
  white: "FFFFFFFF",
};

type PairRow = {
  status: string;
  extract?: ExtractLine;
  order?: OrderConfirmedRow | OrderUnmatchedRow | OrderReviewRow["candidates"][number];
  confidence?: string;
  matchBasis?: string;
};

function money(cents?: number): number | null {
  return typeof cents === "number" ? cents / 100 : null;
}

function styleHeader(row: ExcelJS.Row, fill: string): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.white } },
      bottom: { style: "thin", color: { argb: COLORS.white } },
    };
  });
  row.height = 32;
}

function setTitle(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  lastColumn: number
): void {
  sheet.mergeCells(1, 1, 1, lastColumn);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 18, color: { argb: COLORS.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, lastColumn);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { italic: true, color: { argb: "FF44546A" } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.gray } };
}

function orderFields(
  value?: PairRow["order"]
): {
  pedidoId: string;
  date: string;
  cliente: string;
  quemPagou: string;
  forma: string;
  value: number | null;
  vendedor: string;
  canal: string;
} {
  if (!value) {
    return {
      pedidoId: "",
      date: "",
      cliente: "",
      quemPagou: "",
      forma: "",
      value: null,
      vendedor: "",
      canal: "",
    };
  }
  const candidate = value as OrderReviewRow["candidates"][number];
  const confirmed = value as OrderConfirmedRow;
  const unmatched = value as OrderUnmatchedRow;
  return {
    pedidoId: value.order?.pedidoId || "",
    date: value.order?.pedidoCreatedAt || "",
    cliente: value.order?.clienteNome || "",
    quemPagou: value.nomePix || "",
    forma: confirmed.formaPagamento || unmatched.formaPagamento || "PIX",
    value: money(
      typeof confirmed.valorPdvCents === "number"
        ? confirmed.valorPdvCents
        : typeof unmatched.valorCents === "number"
          ? unmatched.valorCents
          : candidate.valorCents
    ),
    vendedor: value.order?.sellerName || "",
    canal: value.order?.canal || "",
  };
}

function buildPairs(result: ReconcileResult): PairRow[] {
  const pairs: PairRow[] = [];
  for (const row of result.ordersConfirmed || []) {
    if (row.extract?.length) {
      for (const extract of row.extract) {
        pairs.push({
          status: "LOCALIZADO",
          extract: extract as ExtractLine,
          order: row,
          confidence: row.confidence,
          matchBasis: row.matchBasis,
        });
      }
    } else {
      pairs.push({ status: "LOCALIZADO", order: row, confidence: row.confidence });
    }
  }
  for (const review of result.ordersReview || []) {
    const candidate = review.candidates?.[0];
    for (const extract of review.extract || []) {
      pairs.push({
        status: "REVISAR",
        extract,
        order: candidate,
        confidence: candidate ? `score ${candidate.score}` : "",
        matchBasis: "confirmação manual necessária",
      });
    }
  }
  for (const extract of result.extractUnmatched || result.onlyExtract || []) {
    pairs.push({
      status: "NÃO IDENTIFICADO",
      extract,
      matchBasis: "Nenhum pedido compatível foi identificado",
    });
  }
  for (const order of result.ordersUnmatched || []) {
    pairs.push({
      status: "PEDIDO SEM EXTRATO",
      order,
      matchBasis: "Pagamento do PDV sem lançamento correspondente",
    });
  }
  return pairs.sort((a, b) =>
    (a.extract?.datetimeIso || orderFields(a.order).date).localeCompare(
      b.extract?.datetimeIso || orderFields(b.order).date
    )
  );
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  result: ReconcileResult,
  generatedBy: string
): void {
  const sheet = workbook.addWorksheet("Resumo", {
    views: [{ showGridLines: false }],
  });
  setTitle(
    sheet,
    "Conciliação financeira — Jurema",
    `Período ${result.period?.start || "—"} a ${result.period?.end || "—"} · Gerado por ${generatedBy}`,
    4
  );
  sheet.columns = [{ width: 28 }, { width: 18 }, { width: 24 }, { width: 58 }];
  const rows: Array<[string, string | number, string, string]> = [
    ["Indicador", "Quantidade", "Valor", "Orientação"],
    [
      "Localizados",
      result.ordersConfirmed?.length || 0,
      money(result.totals.matchedCents)?.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }) || "R$ 0,00",
      "Linhas conciliadas automaticamente ou confirmadas.",
    ],
    [
      "Revisar",
      result.ordersReview?.length || 0,
      "—",
      "Há candidato, mas é necessária confirmação manual.",
    ],
    [
      "Não identificados no extrato",
      result.extractUnmatched?.length || result.onlyExtract?.length || 0,
      money(result.totals.onlyExtractCents)?.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }) || "R$ 0,00",
      "Destacados em vermelho na planilha.",
    ],
    [
      "Pedidos sem extrato",
      result.ordersUnmatched?.length || 0,
      money(result.totals.onlyPdvCents)?.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }) || "R$ 0,00",
      "Existem no PDV, mas não foram encontrados nos extratos.",
    ],
  ];
  rows.forEach((values, index) => {
    const row = sheet.addRow(values);
    if (index === 0) styleHeader(row, COLORS.navy);
    else {
      row.alignment = { vertical: "top", wrapText: true };
      if (index === 3) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.redLight } };
          cell.font = { color: { argb: COLORS.red }, bold: true };
        });
      }
    }
  });
  sheet.addRow([]);
  sheet.addRow(["Legenda", "", "", ""]);
  sheet.addRow(["Azul", "", "", "Dados que vieram dos extratos bancários"]);
  sheet.addRow(["Verde", "", "", "Dados dos pedidos e pagamentos do PDV"]);
  sheet.addRow(["Amarelo", "", "", "Dúvida que precisa ser revisada"]);
  sheet.addRow(["Vermelho", "", "", "Linha do extrato não identificada"]);
}

function addReconciliationSheet(workbook: ExcelJS.Workbook, result: ReconcileResult): void {
  const sheet = workbook.addWorksheet("Conciliação", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });
  const headers = [
    "Situação",
    "Arquivo",
    "Origem",
    "Data",
    "Hora",
    "Pagador no extrato",
    "Valor extrato",
    "",
    "Pedido",
    "Data do pedido",
    "Cliente",
    "Quem pagou (PDV)",
    "Forma",
    "Valor PDV",
    "Vendedor",
    "Canal",
    "Confiança / critério",
  ];
  setTitle(
    sheet,
    "Conciliação linha a linha",
    "AZUL = extrato bancário · VERDE = pedido PDV · VERMELHO = não identificado",
    headers.length
  );
  sheet.mergeCells(3, 1, 3, 7);
  sheet.getCell(3, 1).value = "DADOS DO EXTRATO";
  sheet.mergeCells(3, 9, 3, 17);
  sheet.getCell(3, 9).value = "DADOS DO PEDIDO PDV";
  for (const [cell, fill] of [
    [sheet.getCell(3, 1), COLORS.blue],
    [sheet.getCell(3, 9), COLORS.green],
  ] as const) {
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.alignment = { horizontal: "center" };
  }
  const header = sheet.addRow(headers);
  for (let column = 1; column <= headers.length; column++) {
    const cell = header.getCell(column);
    const fill = column <= 7 ? COLORS.blue : column >= 9 ? COLORS.green : COLORS.gray;
    cell.font = { bold: true, color: { argb: column === 8 ? COLORS.navy : COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  header.height = 34;

  for (const pair of buildPairs(result)) {
    const order = orderFields(pair.order);
    const row = sheet.addRow([
      pair.status,
      pair.extract?.extractFileName || "",
      pair.extract?.source || "",
      pair.extract?.date || "",
      pair.extract?.time || "",
      pair.extract?.payerNameRaw || "",
      money(pair.extract?.amountCents),
      "",
      order.pedidoId,
      order.date,
      order.cliente,
      order.quemPagou,
      order.forma,
      order.value,
      order.vendedor,
      order.canal,
      [pair.confidence, pair.matchBasis].filter(Boolean).join(" · "),
    ]);
    for (let column = 1; column <= 7; column++) {
      row.getCell(column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.blueLight },
      };
    }
    for (let column = 9; column <= 17; column++) {
      row.getCell(column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.greenLight },
      };
    }
    if (pair.status === "NÃO IDENTIFICADO") {
      for (let column = 1; column <= 7; column++) {
        row.getCell(column).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.redLight },
        };
        row.getCell(column).font = { color: { argb: COLORS.red }, bold: true };
      }
    } else if (pair.status === "REVISAR") {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.amberLight },
        };
      });
    }
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(7).numFmt = '"R$" #,##0.00';
    row.getCell(14).numFmt = '"R$" #,##0.00';
  }

  sheet.columns = [
    { width: 22 }, { width: 28 }, { width: 18 }, { width: 13 }, { width: 9 },
    { width: 34 }, { width: 16 }, { width: 3 }, { width: 18 }, { width: 23 },
    { width: 28 }, { width: 32 }, { width: 14 }, { width: 16 }, { width: 20 },
    { width: 16 }, { width: 32 },
  ];
  sheet.autoFilter = { from: "A4", to: "Q4" };
}

function addRawSheets(workbook: ExcelJS.Workbook, result: ReconcileResult): void {
  const extract = workbook.addWorksheet("Extrato completo", {
    views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
  });
  setTitle(extract, "Dados dos extratos", "Todas as entradas consideradas na análise", 9);
  const extractHeader = extract.addRow([
    "Situação", "Arquivo", "Origem", "Data", "Hora", "Pagador", "Valor", "Tipo", "Referência",
  ]);
  styleHeader(extractHeader, COLORS.blue);
  const pairs = buildPairs(result).filter((row) => row.extract);
  for (const pair of pairs) {
    const line = pair.extract!;
    const row = extract.addRow([
      pair.status,
      line.extractFileName || "",
      line.source,
      line.date,
      line.time,
      line.payerNameRaw,
      money(line.amountCents),
      line.kindLabel || line.type,
      line.operationId || line.id,
    ]);
    row.getCell(7).numFmt = '"R$" #,##0.00';
    if (pair.status === "NÃO IDENTIFICADO") {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.redLight } };
        cell.font = { color: { argb: COLORS.red }, bold: true };
      });
    } else if (pair.status === "REVISAR") {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.amberLight } };
      });
    }
  }
  extract.columns = [
    { width: 22 }, { width: 28 }, { width: 18 }, { width: 13 }, { width: 9 },
    { width: 38 }, { width: 16 }, { width: 16 }, { width: 34 },
  ];
  extract.autoFilter = { from: "A3", to: "I3" };

  const orders = workbook.addWorksheet("Pedidos PDV", {
    views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
  });
  setTitle(orders, "Dados dos pedidos PDV", "Pagamentos encontrados no período selecionado", 11);
  const orderHeader = orders.addRow([
    "Situação", "Pedido", "Data", "Cliente", "Quem pagou", "Forma", "Valor",
    "Vendedor", "Canal", "Itens", "Observação pagamento",
  ]);
  styleHeader(orderHeader, COLORS.green);
  const confirmed = (result.ordersConfirmed || []).map((row) => ({
    status: "LOCALIZADO",
    row,
  }));
  const review = (result.ordersReview || []).flatMap((item) =>
    item.candidates.map((row) => ({ status: "REVISAR", row }))
  );
  const unmatched = (result.ordersUnmatched || []).map((row) => ({
    status: "PEDIDO SEM EXTRATO",
    row,
  }));
  for (const entry of [...confirmed, ...review, ...unmatched]) {
    const value = orderFields(entry.row);
    const row = orders.addRow([
      entry.status,
      value.pedidoId,
      value.date,
      value.cliente,
      value.quemPagou,
      value.forma,
      value.value,
      value.vendedor,
      value.canal,
      entry.row.order?.itemsSummary || "",
      "obsPagamento" in entry.row ? entry.row.obsPagamento || "" : "",
    ]);
    row.getCell(7).numFmt = '"R$" #,##0.00';
    if (entry.status === "REVISAR") {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.amberLight } };
      });
    }
  }
  orders.columns = [
    { width: 22 }, { width: 18 }, { width: 23 }, { width: 28 }, { width: 32 },
    { width: 14 }, { width: 16 }, { width: 20 }, { width: 16 }, { width: 48 },
    { width: 38 },
  ];
  orders.autoFilter = { from: "A3", to: "K3" };
}

export async function buildReconcileReportExcel(
  result: ReconcileResult,
  options: { generatedBy: string }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Jurema Sport";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = "Conciliação financeira entre extratos e pedidos PDV";

  addSummarySheet(workbook, result, options.generatedBy);
  addReconciliationSheet(workbook, result);
  addRawSheets(workbook, result);

  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}
