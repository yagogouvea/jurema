import ExcelJS from "exceljs";

const COLORS = {
  navy: "FF17365D",
  green: "FF548235",
  greenLight: "FFE2F0D9",
  red: "FFC00000",
  redLight: "FFF4CCCC",
  gray: "FFE7E6E6",
  white: "FFFFFFFF",
  amber: "FFBF8F00",
  amberLight: "FFFFF2CC",
};

export type CashFlowExcelEntry = {
  id: number;
  tipo: "SUPRIMENTO" | "SANGRIA";
  descricao: string;
  valor: number;
  usuario: string | null;
  createdAt: Date | string;
  dia: string;
  hora: string;
};

export type CashFlowExcelClosure = {
  dia: string;
  saldoSistema: number;
  valorContado: number;
  diferenca: number;
  justificativa: string | null;
  usuario: string | null;
};

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function parsePedido(desc: string): string {
  const m = String(desc || "").match(/\b((?:PED|PDV)[- ]?\d+)\b/i);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : "";
}

function parseCanal(desc: string): string {
  const d = String(desc || "");
  if (/whats\s*app|whatsapp/i.test(d)) return "WhatsApp";
  if (/balc[aã]o|balão/i.test(d)) return "Balcão";
  return "";
}

function parseCategoria(tipo: string, desc: string): string {
  const d = String(desc || "");
  if (/fechamento/i.test(d)) return "Fechamento";
  if (/venda/i.test(d) || parsePedido(d)) return "Venda";
  if (/pagamento/i.test(d)) return "Pagamento";
  if (/sangria/i.test(d) || tipo === "SANGRIA") return "Sangria";
  return "Suprimento";
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
  row.height = 28;
}

function fmtYmd(ymd: string): string {
  const [y, m, d] = String(ymd).slice(0, 10).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export async function buildCashFlowExcel(input: {
  startDate: string;
  endDate: string;
  saldoAnterior: number;
  saldoGeral: number;
  entries: CashFlowExcelEntry[];
  closures: CashFlowExcelClosure[];
  geradoPor: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Jurema Sport PDV";
  workbook.created = new Date();

  const periodo = `${fmtYmd(input.startDate)} a ${fmtYmd(input.endDate)}`;
  const ordered = [...input.entries].sort((a, b) => {
    const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return ta - tb || a.id - b.id;
  });

  let saldo = money(input.saldoAnterior);
  let totalEntradas = 0;
  let totalSaidas = 0;
  let qtdSup = 0;
  let qtdSan = 0;

  const mov = workbook.addWorksheet("Movimentações", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  mov.mergeCells("A1:L1");
  mov.getCell("A1").value = "Jurema Sport — Fluxo de Caixa";
  mov.getCell("A1").font = { bold: true, size: 16, color: { argb: COLORS.white } };
  mov.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  mov.getRow(1).height = 28;

  mov.mergeCells("A2:L2");
  mov.getCell("A2").value = `Período: ${periodo}  ·  Gerado por ${input.geradoPor} em ${new Date().toLocaleString("pt-BR")}`;
  mov.getCell("A2").font = { italic: true, color: { argb: "FF44546A" } };
  mov.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.gray } };

  mov.mergeCells("A3:L3");
  mov.getCell("A3").value =
    `Saldo anterior ao período: ${input.saldoAnterior.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}  ·  Saldo geral do sistema: ${input.saldoGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
  mov.getCell("A3").font = { size: 10, color: { argb: "FF44546A" } };

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
  const headerRow = mov.getRow(4);
  headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  styleHeader(headerRow, COLORS.navy);

  ordered.forEach((e, idx) => {
    const entrada = e.tipo === "SUPRIMENTO" ? money(e.valor) : 0;
    const saida = e.tipo === "SANGRIA" ? money(e.valor) : 0;
    if (e.tipo === "SUPRIMENTO") {
      totalEntradas += entrada;
      qtdSup += 1;
      saldo = money(saldo + entrada);
    } else {
      totalSaidas += saida;
      qtdSan += 1;
      saldo = money(saldo - saida);
    }
    const row = mov.getRow(5 + idx);
    const isSan = e.tipo === "SANGRIA";
    row.values = [
      e.dia ? fmtYmd(e.dia) : "",
      e.hora || "",
      e.tipo === "SUPRIMENTO" ? "Suprimento" : "Sangria",
      parseCategoria(e.tipo, e.descricao),
      e.descricao || "",
      parsePedido(e.descricao),
      parseCanal(e.descricao),
      e.usuario || "",
      entrada || null,
      saida || null,
      saldo,
      e.id,
    ];
    row.eachCell((cell, col) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9D9D9" } },
        bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
        left: { style: "thin", color: { argb: "FFD9D9D9" } },
        right: { style: "thin", color: { argb: "FFD9D9D9" } },
      };
      if (col === 3 || col === 4) cell.alignment = { horizontal: "center" };
      if (isSan) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.redLight } };
      } else if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F7" } };
      }
    });
    row.getCell(9).numFmt = '"R$" #,##0.00';
    row.getCell(10).numFmt = '"R$" #,##0.00';
    row.getCell(11).numFmt = '"R$" #,##0.00';
    if (isSan) {
      row.getCell(3).font = { bold: true, color: { argb: COLORS.red } };
    } else {
      row.getCell(3).font = { bold: true, color: { argb: COLORS.green } };
    }
  });

  const totRow = mov.getRow(5 + ordered.length);
  totRow.getCell(1).value = "TOTAL DO PERÍODO";
  totRow.getCell(4).value = `${qtdSup} entradas · ${qtdSan} saídas`;
  totRow.getCell(9).value = money(totalEntradas);
  totRow.getCell(10).value = money(totalSaidas);
  totRow.getCell(11).value = money(saldo);
  totRow.font = { bold: true };
  totRow.getCell(9).numFmt = '"R$" #,##0.00';
  totRow.getCell(10).numFmt = '"R$" #,##0.00';
  totRow.getCell(11).numFmt = '"R$" #,##0.00';
  totRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.amberLight } };
  });

  mov.columns = [
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 48 },
    { width: 16 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 8 },
  ];
  mov.autoFilter = { from: "A4", to: "L4" };

  const resumo = workbook.addWorksheet("Resumo");
  resumo.mergeCells("A1:B1");
  resumo.getCell("A1").value = "Resumo do período";
  resumo.getCell("A1").font = { bold: true, size: 16, color: { argb: COLORS.white } };
  resumo.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  resumo.getRow(1).height = 28;

  const resumoRows: Array<[string, string | number]> = [
    ["Período", periodo],
    ["Movimentações", ordered.length],
    ["Qtd. suprimentos (entradas)", qtdSup],
    ["Total entradas", money(totalEntradas)],
    ["Qtd. sangrias (saídas)", qtdSan],
    ["Total saídas", money(totalSaidas)],
    ["Resultado do período (entradas − saídas)", money(totalEntradas - totalSaidas)],
    ["Saldo anterior ao período", money(input.saldoAnterior)],
    ["Saldo ao fim do período", money(saldo)],
    ["Saldo geral do sistema (hoje)", money(input.saldoGeral)],
    ["Fechamentos no período", input.closures.length],
  ];
  resumo.getRow(3).values = ["Indicador", "Valor"];
  styleHeader(resumo.getRow(3), COLORS.green);
  resumoRows.forEach((item, i) => {
    const row = resumo.getRow(4 + i);
    row.getCell(1).value = item[0];
    row.getCell(2).value = item[1];
    if (typeof item[1] === "number" && i >= 3 && i <= 9) {
      row.getCell(2).numFmt = '"R$" #,##0.00';
    }
  });
  resumo.columns = [{ width: 44 }, { width: 28 }];

  if (input.closures.length) {
    const fech = workbook.addWorksheet("Fechamentos");
    fech.mergeCells("A1:F1");
    fech.getCell("A1").value = `Fechamentos de caixa — ${periodo}`;
    fech.getCell("A1").font = { bold: true, size: 14, color: { argb: COLORS.white } };
    fech.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.amber } };
    const fh = fech.getRow(3);
    ["Data", "Saldo sistema", "Valor contado", "Diferença", "Usuário", "Justificativa"].forEach(
      (h, i) => {
        fh.getCell(i + 1).value = h;
      }
    );
    styleHeader(fh, COLORS.navy);
    input.closures.forEach((c, i) => {
      const row = fech.getRow(4 + i);
      row.values = [
        fmtYmd(c.dia),
        money(c.saldoSistema),
        money(c.valorContado),
        money(c.diferenca),
        c.usuario || "",
        c.justificativa || "",
      ];
      row.getCell(2).numFmt = '"R$" #,##0.00';
      row.getCell(3).numFmt = '"R$" #,##0.00';
      row.getCell(4).numFmt = '"R$" #,##0.00';
      if (Math.abs(c.diferenca) >= 0.01) {
        row.getCell(4).font = { bold: true, color: { argb: COLORS.red } };
      }
    });
    fech.columns = [
      { width: 12 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
      { width: 16 },
      { width: 40 },
    ];
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
