/**
 * recibo.ts — Geração de recibo do PDV (impressão + exportação PDF).
 *
 * - printRecibo(data): abre o recibo formatado numa janela e dispara o diálogo
 *   de impressão do navegador (que também permite "Salvar como PDF").
 * - downloadReciboPdf(data): gera e baixa um PDF (estilo cupom 80mm) via jsPDF.
 *
 * Não depende de html2canvas — o PDF é montado com texto, garantindo nitidez.
 */
import { jsPDF } from "jspdf";

export interface ReciboItem {
  time?: string;
  descricao?: string | null;
  linha?: string | null;
  modelo?: string | null;
  tamanho?: string;
  quantidade: number;
  precoUnitario?: number | string;
  totalItem?: number | string;
  isSofia?: boolean | number;
}

export interface ReciboService {
  tipo: string;
  descricao?: string | null;
  valor: number | string;
  cep?: string | null;
}

export interface ReciboPayment {
  formaPagamento: string;
  valor: number | string;
  taxa?: number | string;
  nomePix?: string | null;
  obsPagamento?: string | null;
}

export interface ReciboData {
  storeName: string;
  whatsapp?: string;
  pedidoId: string;
  createdAt: string;
  sellerName?: string;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  canal?: string;
  regime?: string;
  status?: string;
  items: ReciboItem[];
  services: ReciboService[];
  payments: ReciboPayment[];
  totalPendente?: number | string;
  justificativa?: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  PIX: "PIX",
  DINHEIRO: "Dinheiro",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  DESCONTO_FOLHA: "Desconto em folha",
};

const STATUS_LABELS: Record<string, string> = {
  PAGO: "PAGO",
  PENDENTE: "PENDENTE",
  CANCELADO: "CANCELADO",
};

const n = (v: any): number => {
  const x = parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

const brl = (v: any): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n(v));

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export interface ReciboTotals {
  subtotalItens: number;
  totalServicos: number;
  taxaTotal: number;
  totalGeral: number;
  totalMaquininha: number;
  totalPago: number;
  pendente: number;
}

export function computeTotals(data: ReciboData): ReciboTotals {
  const subtotalItens = (data.items || []).reduce((s, i) => s + n(i.totalItem), 0);
  const totalServicos = (data.services || []).reduce((s, sv) => s + n(sv.valor), 0);
  const taxaTotal = (data.payments || []).reduce((s, p) => s + n(p.taxa), 0);
  const totalPago = (data.payments || []).reduce((s, p) => s + n(p.valor), 0);
  const totalMaquininha = (data.payments || []).reduce((s, p) => {
    const taxa = n(p.taxa);
    return s + (taxa > 0 ? n(p.valor) + taxa : n(p.valor));
  }, 0);
  const totalGeral = subtotalItens + totalServicos + taxaTotal;
  const pendente = n(data.totalPendente);
  return { subtotalItens, totalServicos, taxaTotal, totalGeral, totalMaquininha, totalPago, pendente };
}

function itemNome(it: ReciboItem): string {
  return [it.time, it.descricao].filter(Boolean).join(" ").trim() || "Item";
}

// ─────────────────────────────────────────────────────────────────────────────
// Impressão (HTML)
// ─────────────────────────────────────────────────────────────────────────────

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}

export function buildReciboHtml(data: ReciboData): string {
  const t = computeTotals(data);
  const itemRows = (data.items || [])
    .map((it) => {
      const unit = it.precoUnitario !== undefined ? n(it.precoUnitario) : n(it.totalItem) / (it.quantidade || 1);
      return `
        <tr>
          <td class="qty">${it.quantidade}x</td>
          <td class="name">${esc(itemNome(it))}${it.tamanho ? ` <span class="tam">(${esc(it.tamanho)})</span>` : ""}${it.isSofia ? ` <span class="tag">Sofia</span>` : ""}<br><span class="unit">un. ${brl(unit)}</span></td>
          <td class="val">${brl(it.totalItem)}</td>
        </tr>`;
    })
    .join("");

  const serviceRows = (data.services || [])
    .map(
      (s) => `
        <tr>
          <td class="qty"></td>
          <td class="name">${esc(s.tipo)}${s.descricao ? ` — ${esc(s.descricao)}` : ""}${s.cep ? `<br><span class="unit">CEP ${esc(s.cep)}</span>` : ""}</td>
          <td class="val">${brl(s.valor)}</td>
        </tr>`
    )
    .join("");

  const paymentRows = (data.payments || [])
    .map((p) => {
      const taxa = n(p.taxa);
      const exib = taxa > 0 ? n(p.valor) + taxa : n(p.valor);
      const label = PAYMENT_LABELS[p.formaPagamento] || p.formaPagamento;
      const quem = p.nomePix ? ` · ${esc(p.nomePix)}` : "";
      const obs = p.obsPagamento ? ` <span class="unit">(${esc(p.obsPagamento)})</span>` : "";
      return `<div class="row"><span>${esc(label)}${quem}${obs}${taxa > 0 ? ` <span class="unit">(taxa ${brl(taxa)})</span>` : ""}</span><span>${brl(exib)}</span></div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${esc(data.pedidoId)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .recibo { width: 300px; margin: 0 auto; padding: 16px; }
  .center { text-align: center; }
  .store { font-size: 18px; font-weight: 800; letter-spacing: .5px; }
  .sub { font-size: 11px; color: #555; margin-top: 2px; }
  .pedido { font-size: 13px; font-weight: 700; margin-top: 8px; }
  .meta { font-size: 11px; color: #444; margin-top: 2px; }
  hr { border: none; border-top: 1px dashed #bbb; margin: 10px 0; }
  .sectitle { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #666; margin: 6px 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 3px 0; font-size: 12px; }
  td.qty { width: 28px; color: #555; }
  td.val { text-align: right; white-space: nowrap; font-weight: 600; }
  .name .tam { color: #777; }
  .unit { font-size: 10px; color: #888; }
  .tag { font-size: 9px; background: #eee; border-radius: 4px; padding: 1px 4px; color: #555; }
  .row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .tot { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .tot.big { font-size: 15px; font-weight: 800; border-top: 1px solid #222; padding-top: 6px; margin-top: 4px; }
  .pend { color: #b45309; font-weight: 700; }
  .status { display: inline-block; margin-top: 6px; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; border: 1px solid #999; }
  .footer { text-align: center; font-size: 10px; color: #777; margin-top: 12px; }
  .obs { font-size: 11px; color: #555; margin-top: 6px; }
  @media print { @page { margin: 6mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
  <div class="recibo">
    <div class="center">
      <div class="store">${esc(data.storeName || "Jurema Sport")}</div>
      <div class="sub">RECIBO DE VENDA</div>
      <div class="pedido">Pedido ${esc(data.pedidoId)}</div>
      <div class="meta">${esc(formatDateTime(data.createdAt))}</div>
    </div>
    <hr>
    <div class="meta">Vendedor: <b>${esc(data.sellerName || "—")}</b></div>
    ${data.clienteNome ? `<div class="meta">Cliente: <b>${esc(data.clienteNome)}</b>${data.clienteTelefone ? ` · ${esc(data.clienteTelefone)}` : ""}</div>` : ""}
    <div class="meta">Canal: ${esc(data.canal || "—")} · Regime: ${esc(data.regime || "—")}</div>
    <hr>
    <div class="sectitle">Itens</div>
    <table>${itemRows || `<tr><td colspan="3" class="unit">Sem itens</td></tr>`}</table>
    ${serviceRows ? `<div class="sectitle">Serviços</div><table>${serviceRows}</table>` : ""}
    <hr>
    <div class="tot"><span>Subtotal (${esc(data.regime || "")})</span><span>${brl(t.subtotalItens)}</span></div>
    ${t.totalServicos > 0 ? `<div class="tot"><span>Serviços extras</span><span>${brl(t.totalServicos)}</span></div>` : ""}
    ${t.taxaTotal > 0 ? `<div class="tot"><span>Taxa de cartão</span><span>+ ${brl(t.taxaTotal)}</span></div>` : ""}
    <div class="tot big"><span>TOTAL</span><span>${brl(t.totalGeral)}</span></div>
    ${t.taxaTotal > 0 ? `<div class="tot"><span>Valor maquininha</span><span>${brl(t.totalMaquininha)}</span></div>` : ""}
    <div class="sectitle">Pagamento</div>
    ${paymentRows || `<div class="row unit">—</div>`}
    ${t.pendente > 0 ? `<div class="tot pend"><span>PENDENTE</span><span>${brl(t.pendente)}</span></div>` : ""}
    ${data.justificativa ? `<div class="obs">Obs.: ${esc(data.justificativa)}</div>` : ""}
    <div class="center"><span class="status">${esc(STATUS_LABELS[data.status || ""] || data.status || "")}</span></div>
    <div class="footer">${data.whatsapp ? `Contato: ${esc(data.whatsapp)}<br>` : ""}Obrigado pela preferência!</div>
  </div>
</body></html>`;
}

export function printRecibo(data: ReciboData): void {
  const html = buildReciboHtml(data);
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    alert("Permita pop-ups para imprimir o recibo.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Aguarda render antes de imprimir.
  const doPrint = () => { w.focus(); w.print(); };
  if (w.document.readyState === "complete") setTimeout(doPrint, 300);
  else w.onload = () => setTimeout(doPrint, 300);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exportação PDF (jsPDF, estilo cupom 80mm)
// ─────────────────────────────────────────────────────────────────────────────

export function downloadReciboPdf(data: ReciboData): void {
  const t = computeTotals(data);
  const W = 80;            // largura do cupom (mm)
  const M = 6;             // margem lateral (mm)
  const CW = W - M * 2;    // largura útil

  // Operações de desenho (montadas antes para calcular a altura total).
  type Op =
    | { k: "text"; text: string; size: number; style: "normal" | "bold"; align: "left" | "center"; h: number }
    | { k: "lr"; left: string; right: string; size: number; style: "normal" | "bold"; h: number }
    | { k: "hr"; h: number }
    | { k: "space"; h: number };

  // Doc temporário só para medir quebras de linha.
  const measure = new jsPDF({ unit: "mm", format: [W, 1000] });
  const lh = (size: number) => size * 0.42; // altura de linha aproximada (mm)

  const ops: Op[] = [];
  const pushText = (text: string, size: number, style: "normal" | "bold", align: "left" | "center", maxW = CW) => {
    measure.setFont("helvetica", style);
    measure.setFontSize(size);
    const lines = measure.splitTextToSize(text, maxW) as string[];
    for (const line of lines) ops.push({ k: "text", text: line, size, style, align, h: lh(size) });
  };
  const pushLR = (left: string, right: string, size: number, style: "normal" | "bold") => {
    ops.push({ k: "lr", left, right, size, style, h: lh(size) });
  };
  const hr = () => ops.push({ k: "hr", h: 2.5 });
  const space = (h = 1.5) => ops.push({ k: "space", h });

  // Cabeçalho
  pushText(data.storeName || "Jurema Sport", 13, "bold", "center");
  pushText("RECIBO DE VENDA", 8, "normal", "center");
  space(0.5);
  pushText(`Pedido ${data.pedidoId}`, 10, "bold", "center");
  pushText(formatDateTime(data.createdAt), 8, "normal", "center");
  hr();

  pushText(`Vendedor: ${data.sellerName || "—"}`, 8.5, "normal", "left");
  if (data.clienteNome) {
    pushText(`Cliente: ${data.clienteNome}${data.clienteTelefone ? ` (${data.clienteTelefone})` : ""}`, 8.5, "normal", "left");
  }
  pushText(`Canal: ${data.canal || "—"}  |  Regime: ${data.regime || "—"}`, 8.5, "normal", "left");
  hr();

  // Itens
  pushText("ITENS", 8, "bold", "left");
  for (const it of data.items || []) {
    const nome = `${it.quantidade}x ${itemNome(it)}${it.tamanho ? ` (${it.tamanho})` : ""}${it.isSofia ? " [Sofia]" : ""}`;
    pushLR(nome, brl(it.totalItem), 9, "normal");
    const unit = it.precoUnitario !== undefined ? n(it.precoUnitario) : n(it.totalItem) / (it.quantidade || 1);
    pushText(`   un. ${brl(unit)}`, 7.5, "normal", "left");
  }

  if ((data.services || []).length > 0) {
    space();
    pushText("SERVIÇOS", 8, "bold", "left");
    for (const s of data.services) {
      pushLR(`${s.tipo}${s.descricao ? ` - ${s.descricao}` : ""}`, brl(s.valor), 9, "normal");
      if (s.cep) pushText(`   CEP ${s.cep}`, 7.5, "normal", "left");
    }
  }
  hr();

  // Totais
  pushLR(`Subtotal (${data.regime || ""})`, brl(t.subtotalItens), 9, "normal");
  if (t.totalServicos > 0) pushLR("Serviços extras", brl(t.totalServicos), 9, "normal");
  if (t.taxaTotal > 0) pushLR("Taxa de cartão", `+ ${brl(t.taxaTotal)}`, 9, "normal");
  pushLR("TOTAL", brl(t.totalGeral), 12, "bold");
  if (t.taxaTotal > 0) pushLR("Valor maquininha", brl(t.totalMaquininha), 9, "normal");
  space();

  // Pagamento
  pushText("PAGAMENTO", 8, "bold", "left");
  for (const p of data.payments || []) {
    const taxa = n(p.taxa);
    const exib = taxa > 0 ? n(p.valor) + taxa : n(p.valor);
    const label = PAYMENT_LABELS[p.formaPagamento] || p.formaPagamento;
    const quemObs = [p.nomePix, p.obsPagamento].filter(Boolean).join(" · ");
    pushLR(`${label}${quemObs ? ` (${quemObs})` : ""}`, brl(exib), 9, "normal");
  }
  if (t.pendente > 0) {
    space(0.5);
    pushLR("PENDENTE", brl(t.pendente), 10, "bold");
  }
  if (data.justificativa) {
    space(0.5);
    pushText(`Obs.: ${data.justificativa}`, 7.5, "normal", "left");
  }
  hr();
  pushText(`Status: ${STATUS_LABELS[data.status || ""] || data.status || ""}`, 10, "bold", "center");
  space();
  if (data.whatsapp) pushText(`Contato: ${data.whatsapp}`, 7.5, "normal", "center");
  pushText("Obrigado pela preferência!", 8, "normal", "center");

  // Altura total
  const totalH = ops.reduce((s, o) => s + o.h, 0) + M * 2;
  const doc = new jsPDF({ unit: "mm", format: [W, Math.max(totalH, 60)] });

  let y = M + 3;
  for (const op of ops) {
    if (op.k === "hr") {
      doc.setDrawColor(180);
      doc.setLineDashPattern([0.6, 0.6], 0);
      doc.line(M, y, W - M, y);
      doc.setLineDashPattern([], 0);
      y += op.h;
      continue;
    }
    if (op.k === "space") { y += op.h; continue; }
    if (op.k === "text") {
      doc.setFont("helvetica", op.style);
      doc.setFontSize(op.size);
      if (op.align === "center") doc.text(op.text, W / 2, y, { align: "center" });
      else doc.text(op.text, M, y);
      y += op.h;
      continue;
    }
    // leftright
    doc.setFont("helvetica", op.style);
    doc.setFontSize(op.size);
    const rightW = doc.getTextWidth(op.right);
    const leftLines = doc.splitTextToSize(op.left, CW - rightW - 2) as string[];
    doc.text(leftLines, M, y);
    doc.text(op.right, W - M, y, { align: "right" });
    y += op.h * leftLines.length;
  }

  doc.save(`recibo-${data.pedidoId}.pdf`);
}
