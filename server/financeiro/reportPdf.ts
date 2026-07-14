import { jsPDF } from "jspdf";
import { formatCentsBRL } from "./normalize";
import type { ReconcileResult } from "./types";

function wrapLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

export function buildReconcileReportPdf(
  result: ReconcileResult,
  meta?: { generatedBy?: string }
): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const maxW = pageW - margin * 2;
  let y = 16;

  const ensureSpace = (need: number) => {
    if (y + need > 285) {
      doc.addPage();
      y = 16;
    }
  };

  const title = "Jurema Sport — Conciliação Financeira";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const period = result.period
    ? `${result.period.start} a ${result.period.end}`
    : "—";
  doc.text(`Origem: ${result.source}  |  Período: ${period}`, margin, y);
  y += 5;
  if (result.accountLabel) {
    doc.text(result.accountLabel, margin, y);
    y += 5;
  }
  if (meta?.generatedBy) {
    doc.text(`Gerado por: ${meta.generatedBy}`, margin, y);
    y += 5;
  }
  doc.text(`Data do relatório: ${new Date().toLocaleString("pt-BR")}`, margin, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Totais", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  const totals = [
    `Entradas extrato (Pix recebido): ${formatCentsBRL(result.totals.extractInCents)}`,
    `Localizados: ${result.totals.matchCount} — ${formatCentsBRL(result.totals.matchedCents)}`,
    `Revisar: ${result.totals.reviewCount}`,
    `Só extrato: ${result.onlyExtract.length} — ${formatCentsBRL(result.totals.onlyExtractCents)}`,
    `Só PDV: ${result.onlyPdv.length} — ${formatCentsBRL(result.totals.onlyPdvCents)}`,
  ];
  for (const t of totals) {
    ensureSpace(6);
    doc.text(t, margin, y);
    y += 5;
  }
  y += 3;

  const section = (heading: string) => {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(heading, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
  };

  section("Localizados");
  if (result.matched.length === 0) {
    doc.text("(nenhum)", margin, y);
    y += 5;
  }
  for (const m of result.matched.slice(0, 80)) {
    const pagar = m.extract.map((e) => e.payerNameRaw).join(" + ");
    const line = `${m.payment.pedidoId} | ${formatCentsBRL(m.payment.valorCents)} | ${m.kind}/${m.confidence} | ${pagar}`;
    for (const w of wrapLines(doc, line, maxW)) {
      ensureSpace(5);
      doc.text(w, margin, y);
      y += 4;
    }
  }

  section("Revisar");
  if (result.review.length === 0) {
    doc.text("(nenhum)", margin, y);
    y += 5;
  }
  for (const r of result.review.slice(0, 40)) {
    const ex = r.extract?.map((e) => `${e.date} ${formatCentsBRL(e.amountCents)} ${e.payerNameRaw}`).join("; ") || "";
    const line = `${r.reason}: ${ex}`;
    for (const w of wrapLines(doc, line, maxW)) {
      ensureSpace(5);
      doc.text(w, margin, y);
      y += 4;
    }
  }

  section("Só no extrato");
  for (const e of result.onlyExtract.slice(0, 60)) {
    const line = `${e.date} ${e.time} ${formatCentsBRL(e.amountCents)} — ${e.payerNameRaw}`;
    for (const w of wrapLines(doc, line, maxW)) {
      ensureSpace(5);
      doc.text(w, margin, y);
      y += 4;
    }
  }
  if (result.onlyExtract.length === 0) {
    doc.text("(nenhum)", margin, y);
    y += 5;
  }

  section("Só no PDV");
  for (const p of result.onlyPdv.slice(0, 60)) {
    const line = `${p.pedidoId} ${formatCentsBRL(p.valorCents)} — ${p.clienteNome || p.nomePix || "—"} (${p.status})`;
    for (const w of wrapLines(doc, line, maxW)) {
      ensureSpace(5);
      doc.text(w, margin, y);
      y += 4;
    }
  }
  if (result.onlyPdv.length === 0) {
    doc.text("(nenhum)", margin, y);
    y += 5;
  }

  section("Resumo (IA)");
  for (const w of wrapLines(doc, result.narrativeText || "", maxW)) {
    ensureSpace(5);
    doc.text(w, margin, y);
    y += 4;
  }

  ensureSpace(12);
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "Análise assistida por regras + redação IA. Confira itens manuais antes de fechar o caixa.",
    margin,
    y
  );
  doc.setTextColor(0);

  const ab = doc.output("arraybuffer");
  return Buffer.from(ab);
}
