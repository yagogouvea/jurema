import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import {
  FileText, Download, Calendar, Filter, TrendingUp, Package, Wallet,
  Image as ImageIcon, Loader2, Truck, PiggyBank, Mail, Receipt, Search,
  DollarSign, ShoppingBag, BarChart3, Share2, Boxes
} from "lucide-react";
import PdvLayout from "./PdvLayout";
import {
  firstOfMonthYmdSaoPaulo, lastOfMonthYmdSaoPaulo, todayYmdSaoPaulo,
  yesterdayYmdSaoPaulo, mondayOfWeekYmdSaoPaulo, addCalendarDaysYmdSaoPaulo,
  firstDayOfPreviousMonthYmdSaoPaulo, lastDayOfPreviousMonthYmdSaoPaulo,
} from "@shared/spCalendar";

/**
 * Garante URL absoluta para que imagens hospedadas no MESMO host (`/api/...`)
 * funcionem dentro da janela de impressão (que é `about:blank`).
 */
function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${window.location.origin}${path}`;
}

/** Espera todas as <img> dentro do nó terminarem o `load` (ou erro). */
function waitForAllImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let pending = imgs.length;
    const done = () => { if (--pending <= 0) resolve(); };
    for (const img of imgs) {
      if (img.complete && img.naturalWidth > 0) { done(); continue; }
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }
    setTimeout(resolve, timeoutMs);
  });
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR");
}

function formatDateTime(d: string | Date) {
  return new Date(d).toLocaleString("pt-BR");
}

function getDefaultDates() {
  return {
    startDate: firstOfMonthYmdSaoPaulo(),
    endDate: lastOfMonthYmdSaoPaulo(),
  };
}

const PAYMENT_LABELS: Record<string, string> = {
  PIX: "PIX",
  DINHEIRO: "Dinheiro",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  DESCONTO_FOLHA: "Desconto em folha",
};

/** Converte qualquer valor (string DECIMAL do MySQL, número, etc) em number seguro. */
function toNum(v: any): number {
  const x = parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
}

/** Nome legível do item do pedido. */
function itemNome(it: any): string {
  return [it.time, it.descricao].filter(Boolean).join(" ").trim() || it.tipo || "Item";
}

type SalesQuickKey =
  | "hoje" | "ontem" | "semana" | "semana_passada" | "mes" | "mes_passado";

const SALES_QUICK: { key: SalesQuickKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "semana", label: "Esta semana" },
  { key: "semana_passada", label: "Semana passada" },
  { key: "mes", label: "Este mês" },
  { key: "mes_passado", label: "Mês passado" },
];

/** Calcula o intervalo (YYYY-MM-DD) de um atalho rápido, no fuso de São Paulo. */
function salesQuickRange(key: SalesQuickKey): { start: string; end: string } {
  const today = todayYmdSaoPaulo();
  switch (key) {
    case "hoje":
      return { start: today, end: today };
    case "ontem": {
      const y = yesterdayYmdSaoPaulo();
      return { start: y, end: y };
    }
    case "semana":
      return { start: mondayOfWeekYmdSaoPaulo(), end: today };
    case "semana_passada": {
      const mon = mondayOfWeekYmdSaoPaulo();
      return {
        start: addCalendarDaysYmdSaoPaulo(mon, -7),
        end: addCalendarDaysYmdSaoPaulo(mon, -1),
      };
    }
    case "mes":
      return { start: firstOfMonthYmdSaoPaulo(), end: today };
    case "mes_passado":
      return {
        start: firstDayOfPreviousMonthYmdSaoPaulo(),
        end: lastDayOfPreviousMonthYmdSaoPaulo(),
      };
  }
}

/** Rótulo legível de um intervalo (ex.: "Hoje · 22/06/2026" ou "01/06 a 22/06/2026"). */
function periodoLabel(start: string, end: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} a ${fmt(end)}`;
}

/** Monta um resumo do pedido em texto, pronto para enviar pelo WhatsApp. */
function buildOrderWhatsappText(order: any, storeName: string): string {
  const items: any[] = order.items || [];
  const services: any[] = order.services || [];
  const payments: any[] = order.payments || [];

  const subtotalItens = items.reduce((s, i) => s + toNum(i.totalItem), 0);
  const totalServicos = services.reduce((s, sv) => s + toNum(sv.valor), 0);
  const taxaTotal = payments.reduce((s, p) => s + toNum(p.taxa), 0);
  const totalGeral = subtotalItens + totalServicos + taxaTotal;
  const pendente = toNum(order.totalPendente);

  const linhas: string[] = [];
  linhas.push(`*${storeName || "Jurema Sport"}* — Pedido ${order.pedidoId}`);
  linhas.push(`🗓 ${formatDateTime(order.createdAt)}`);
  if (order.clienteNome) linhas.push(`Cliente: ${order.clienteNome}`);
  linhas.push(`Status: ${order.status}`);
  linhas.push("");

  if (items.length > 0) {
    linhas.push("*Itens:*");
    for (const it of items) {
      const nome = `${it.quantidade}x ${itemNome(it)}${it.tamanho ? ` (${it.tamanho})` : ""}`;
      linhas.push(`• ${nome} — ${formatCurrency(toNum(it.totalItem))}`);
    }
  }

  if (services.length > 0) {
    linhas.push("*Serviços:*");
    for (const sv of services) {
      linhas.push(`• ${sv.tipo}${sv.descricao ? ` - ${sv.descricao}` : ""} — ${formatCurrency(toNum(sv.valor))}`);
    }
  }

  linhas.push("");
  if (taxaTotal > 0) linhas.push(`Taxa de cartão: ${formatCurrency(taxaTotal)}`);
  linhas.push(`*Total: ${formatCurrency(totalGeral)}*`);
  if (pendente > 0) linhas.push(`Pendente: ${formatCurrency(pendente)}`);

  linhas.push("");
  linhas.push("Obrigado pela preferência!");

  return linhas.join("\n");
}

/** Normaliza um telefone brasileiro para uso no wa.me (com DDI 55). Retorna "" se inválido. */
function phoneToWaTarget(phone: string | null | undefined): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export default function PdvRelatorio() {
  const { isAdmin } = usePdvAuth();
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [sections, setSections] = useState({
    comissoes: true,
    sofia: true,
    descontos: true,
    servicos: {
      correios: false,
      caixinhas: false,
      carretos: false,
    },
  });
  const [includeSofiaPhotos, setIncludeSofiaPhotos] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [printing, setPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // ── Relatório por pedido (individual) ──────────────────────────────
  const [orderId, setOrderId] = useState("");
  const [orderToFetch, setOrderToFetch] = useState<string | null>(null);
  const [printingOrder, setPrintingOrder] = useState(false);
  const orderPrintRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = trpc.pdvRelatorio.getData.useQuery(
    { startDate, endDate, sections },
    { enabled: showPreview }
  );

  const {
    data: orderData,
    isFetching: orderLoading,
    isError: orderIsError,
    error: orderError,
  } = trpc.pdvOrders.getById.useQuery(
    { pedidoId: orderToFetch ?? "" },
    { enabled: !!orderToFetch, retry: false }
  );

  const { data: cfgNomeLoja } = trpc.pdvConfig.get.useQuery({ key: "nome_loja" });
  const { data: cfgWhatsapp } = trpc.pdvConfig.get.useQuery({ key: "whatsapp_recibo" });

  const handleGenerateOrder = () => {
    const id = orderId.trim();
    if (!id) {
      toast.error("Informe o número do pedido");
      return;
    }
    setOrderToFetch(id);
  };

  const handlePrintOrder = async () => {
    if (!orderPrintRef.current) return;
    const printContent = orderPrintRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup bloqueado. Permita popups para imprimir.");
      return;
    }
    setPrintingOrder(true);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório do Pedido ${orderData?.pedidoId ?? ""}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 24px; font-size: 12px; }
          .report-header { text-align: center; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #16a34a; }
          .report-header h1 { font-size: 20px; color: #16a34a; margin-bottom: 2px; }
          .report-header .sub { font-size: 12px; color: #666; }
          .section { margin-bottom: 18px; }
          .section-title { font-size: 14px; font-weight: 700; color: #16a34a; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
          th { background: #f0fdf4; color: #166534; font-weight: 600; text-align: left; padding: 7px 9px; border: 1px solid #d1d5db; font-size: 11px; }
          td { padding: 6px 9px; border: 1px solid #e5e7eb; font-size: 11px; }
          tr:nth-child(even) td { background: #fafafa; }
          .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; margin-bottom: 6px; }
          .info-row { display: flex; justify-content: space-between; border-bottom: 1px dotted #e5e7eb; padding: 3px 0; font-size: 11px; }
          .info-row .k { color: #666; }
          .info-row .v { font-weight: 600; }
          .summary-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; }
          .summary-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
          .summary-row.total { border-top: 1px solid #16a34a; margin-top: 6px; padding-top: 8px; font-size: 14px; font-weight: 800; color: #16a34a; }
          .summary-row .lbl { color: #555; }
          .right { text-align: right; }
          .obs { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #92400e; }
          .footer { text-align: center; margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #999; font-size: 10px; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        ${printContent}
        <div class="footer">
          Relatório gerado em ${new Date().toLocaleString("pt-BR")} — ${cfgNomeLoja?.value || "Jurema Sport"} PDV
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    try {
      const win: any = printWindow;
      if (win.document.readyState !== "complete") {
        await new Promise<void>((resolve) => {
          win.addEventListener("load", () => resolve(), { once: true });
          setTimeout(resolve, 3000);
        });
      }
      printWindow.focus();
      printWindow.print();
    } finally {
      setPrintingOrder(false);
    }
  };

  const handleShareOrderWhatsApp = () => {
    if (!orderData) {
      toast.error("Gere o relatório do pedido primeiro");
      return;
    }
    const texto = buildOrderWhatsappText(orderData, cfgNomeLoja?.value || "Jurema Sport");
    const target = phoneToWaTarget(orderData.clienteTelefone);
    const url = target
      ? `https://wa.me/${target}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ── Relatório de Vendas (admin) ────────────────────────────────────
  const [salesStart, setSalesStart] = useState(() => todayYmdSaoPaulo());
  const [salesEnd, setSalesEnd] = useState(() => todayYmdSaoPaulo());
  const [salesQuick, setSalesQuick] = useState<SalesQuickKey | "custom">("hoje");
  const [showSalesPreview, setShowSalesPreview] = useState(false);
  const [printingSales, setPrintingSales] = useState(false);
  const salesPrintRef = useRef<HTMLDivElement>(null);

  const { data: salesSummary, isFetching: salesLoading } = trpc.pdvDashboard.summary.useQuery(
    { startDate: salesStart, endDate: salesEnd },
    { enabled: isAdmin && showSalesPreview }
  );
  const { data: salesOrders } = trpc.pdvOrders.list.useQuery(
    { startDate: salesStart, endDate: salesEnd, page: 1, limit: 1000 },
    { enabled: isAdmin && showSalesPreview }
  );

  const applySalesQuick = (key: SalesQuickKey) => {
    const { start, end } = salesQuickRange(key);
    setSalesStart(start);
    setSalesEnd(end);
    setSalesQuick(key);
    setShowSalesPreview(false);
  };

  const handleGenerateSales = () => {
    if (!salesStart || !salesEnd) {
      toast.error("Selecione o período");
      return;
    }
    if (salesStart > salesEnd) {
      toast.error("A data inicial não pode ser maior que a final");
      return;
    }
    setShowSalesPreview(true);
  };

  const handlePrintSales = async () => {
    if (!salesPrintRef.current) return;
    const printContent = salesPrintRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup bloqueado. Permita popups para imprimir.");
      return;
    }
    setPrintingSales(true);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório de Vendas — ${periodoLabel(salesStart, salesEnd)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 24px; font-size: 12px; }
          .report-header { text-align: center; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #16a34a; }
          .report-header h1 { font-size: 20px; color: #16a34a; margin-bottom: 2px; }
          .report-header .sub { font-size: 12px; color: #666; }
          .section { margin-bottom: 18px; }
          .section-title { font-size: 14px; font-weight: 700; color: #16a34a; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
          th { background: #f0fdf4; color: #166534; font-weight: 600; text-align: left; padding: 7px 9px; border: 1px solid #d1d5db; font-size: 11px; }
          td { padding: 6px 9px; border: 1px solid #e5e7eb; font-size: 11px; }
          tr:nth-child(even) td { background: #fafafa; }
          .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 6px; }
          .kpi { border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 8px; padding: 10px 14px; }
          .kpi .k { font-size: 11px; color: #666; }
          .kpi .v { font-size: 18px; font-weight: 800; color: #16a34a; margin-top: 2px; }
          .footer { text-align: center; margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #999; font-size: 10px; }
          @media print { body { padding: 12px; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
        </style>
      </head>
      <body>
        ${printContent}
        <div class="footer">
          Relatório gerado em ${new Date().toLocaleString("pt-BR")} — ${cfgNomeLoja?.value || "Jurema Sport"} PDV
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    try {
      const win: any = printWindow;
      if (win.document.readyState !== "complete") {
        await new Promise<void>((resolve) => {
          win.addEventListener("load", () => resolve(), { once: true });
          setTimeout(resolve, 3000);
        });
      }
      printWindow.focus();
      printWindow.print();
    } finally {
      setPrintingSales(false);
    }
  };

  // ── Relatório por Produto (admin) ──────────────────────────────────
  type ProductSel =
    | { tipo: "sku"; codigo: string; label: string }
    | { tipo: "familia"; time: string; modelo: string; linha?: string | null; label: string };

  const [prodStart, setProdStart] = useState(() => firstOfMonthYmdSaoPaulo());
  const [prodEnd, setProdEnd] = useState(() => todayYmdSaoPaulo());
  const [prodQuick, setProdQuick] = useState<SalesQuickKey | "custom">("mes");
  const [prodSearch, setProdSearch] = useState("");
  const [prodSearchDebounced, setProdSearchDebounced] = useState("");
  const [prodSelected, setProdSelected] = useState<ProductSel | null>(null);
  const [showProdPreview, setShowProdPreview] = useState(false);
  const [printingProd, setPrintingProd] = useState(false);
  const [showProdDropdown, setShowProdDropdown] = useState(false);
  const prodPrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setProdSearchDebounced(prodSearch.trim()), 280);
    return () => clearTimeout(t);
  }, [prodSearch]);

  const { data: prodSearchData, isFetching: prodSearching } = trpc.pdvRelatorio.searchProducts.useQuery(
    { q: prodSearchDebounced },
    { enabled: isAdmin && prodSearchDebounced.length >= 1, staleTime: 20_000 }
  );

  const prodQueryInput =
    prodSelected?.tipo === "sku"
      ? {
          startDate: prodStart,
          endDate: prodEnd,
          modo: "sku" as const,
          codigo: prodSelected.codigo,
        }
      : prodSelected?.tipo === "familia"
        ? {
            startDate: prodStart,
            endDate: prodEnd,
            modo: "familia" as const,
            time: prodSelected.time,
            modelo: prodSelected.modelo,
          }
        : null;

  const {
    data: prodReport,
    isFetching: prodLoading,
    isError: prodIsError,
    error: prodError,
  } = trpc.pdvRelatorio.byProduct.useQuery(prodQueryInput!, {
    enabled: isAdmin && showProdPreview && !!prodQueryInput,
    retry: false,
  });

  const applyProdQuick = (key: SalesQuickKey) => {
    const { start, end } = salesQuickRange(key);
    setProdStart(start);
    setProdEnd(end);
    setProdQuick(key);
    setShowProdPreview(false);
  };

  const handleSelectProduct = (item: ProductSel) => {
    setProdSelected(item);
    setProdSearch(item.label);
    setShowProdDropdown(false);
    setShowProdPreview(false);
  };

  const resolveProductSelection = (): ProductSel | null => {
    if (prodSelected) return prodSelected;
    const q = prodSearch.trim();
    if (!q) return null;
    const skus = prodSearchData?.skus || [];
    const fams = prodSearchData?.familias || [];
    const exactSku = skus.find((s) => s.codigo.toLowerCase() === q.toLowerCase());
    if (exactSku) return { tipo: "sku", codigo: exactSku.codigo, label: exactSku.label };
    if (fams[0]) {
      return {
        tipo: "familia",
        time: fams[0].time,
        modelo: fams[0].modelo,
        linha: fams[0].linha,
        label: fams[0].label,
      };
    }
    if (skus[0]) return { tipo: "sku", codigo: skus[0].codigo, label: skus[0].label };
    if (/^[A-Za-z0-9._-]{2,}$/.test(q)) return { tipo: "sku", codigo: q, label: q };
    return null;
  };

  const handleGenerateProduct = () => {
    const resolved = resolveProductSelection();
    if (!resolved) {
      if (prodSearching) {
        toast.error("Aguarde a busca terminar e clique no produto da lista");
        return;
      }
      toast.error("Digite o nome ou código e clique no produto da lista");
      return;
    }
    if (!prodSelected) setProdSelected(resolved);
    if (!prodStart || !prodEnd) {
      toast.error("Selecione o período");
      return;
    }
    if (prodStart > prodEnd) {
      toast.error("A data inicial não pode ser maior que a final");
      return;
    }
    setShowProdPreview(true);
  };

  const handlePrintProduct = async () => {
    if (!prodPrintRef.current) return;
    const printContent = prodPrintRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup bloqueado. Permita popups para imprimir.");
      return;
    }
    setPrintingProd(true);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório por Produto — ${prodSelected?.label ?? ""}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 24px; font-size: 12px; }
          .report-header { text-align: center; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #16a34a; }
          .report-header h1 { font-size: 20px; color: #16a34a; margin-bottom: 2px; }
          .report-header .sub { font-size: 12px; color: #666; }
          .section { margin-bottom: 18px; }
          .section-title { font-size: 14px; font-weight: 700; color: #16a34a; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
          th { background: #f0fdf4; color: #166534; font-weight: 600; text-align: left; padding: 7px 9px; border: 1px solid #d1d5db; font-size: 11px; }
          td { padding: 6px 9px; border: 1px solid #e5e7eb; font-size: 11px; }
          tr:nth-child(even) td { background: #fafafa; }
          tr.sofia-row td { background: #faf5ff !important; border-color: #e9d5ff; }
          .sofia-badge { display: inline-block; background: #7c3aed; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 4px; letter-spacing: 0.02em; }
          .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 6px; }
          .kpi { border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 8px; padding: 10px 14px; }
          .kpi.sofia { border-color: #e9d5ff; background: #faf5ff; }
          .kpi .k { font-size: 11px; color: #666; }
          .kpi .v { font-size: 18px; font-weight: 800; color: #16a34a; margin-top: 2px; }
          .kpi.sofia .v { color: #7c3aed; }
          .legend { font-size: 11px; color: #6b21a8; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
          .footer { text-align: center; margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #999; font-size: 10px; }
          @media print { body { padding: 12px; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
        </style>
      </head>
      <body>
        ${printContent}
        <div class="footer">
          Relatório gerado em ${new Date().toLocaleString("pt-BR")} — ${cfgNomeLoja?.value || "Jurema Sport"} PDV
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    try {
      const win: any = printWindow;
      if (win.document.readyState !== "complete") {
        await new Promise<void>((resolve) => {
          win.addEventListener("load", () => resolve(), { once: true });
          setTimeout(resolve, 3000);
        });
      }
      printWindow.focus();
      printWindow.print();
    } finally {
      setPrintingProd(false);
    }
  };

  const handleGenerate = () => {
    if (!startDate || !endDate) {
      toast.error("Selecione o período");
      return;
    }
    const algumServico =
      sections.servicos.correios || sections.servicos.caixinhas || sections.servicos.carretos;
    if (!sections.comissoes && !sections.sofia && !sections.descontos && !algumServico) {
      toast.error("Selecione ao menos uma seção");
      return;
    }
    setShowPreview(true);
    refetch();
  };

  const handlePrint = async () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup bloqueado. Permita popups para imprimir.");
      return;
    }
    setPrinting(true);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório Jurema Sport PDV</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 24px; font-size: 12px; }
          .report-header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #16a34a; }
          .report-header h1 { font-size: 22px; color: #16a34a; margin-bottom: 4px; }
          .report-header .periodo { font-size: 13px; color: #666; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 15px; font-weight: 700; color: #16a34a; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #f0fdf4; color: #166534; font-weight: 600; text-align: left; padding: 8px 10px; border: 1px solid #d1d5db; font-size: 11px; }
          td { padding: 6px 10px; border: 1px solid #e5e7eb; font-size: 11px; }
          tr:nth-child(even) td { background: #fafafa; }
          .summary-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
          .summary-row { display: flex; justify-content: space-between; padding: 3px 0; }
          .summary-label { color: #666; font-size: 11px; }
          .summary-value { font-weight: 700; font-size: 12px; }
          .summary-value.highlight { color: #16a34a; font-size: 14px; }
          .footer { text-align: center; margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #999; font-size: 10px; }
          .sofia-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
          .sofia-card { border: 1px solid #e9d5ff; border-radius: 8px; padding: 8px; background: #faf5ff; page-break-inside: avoid; }
          .sofia-card img { display: block; width: 100%; height: 140px; object-fit: cover; border-radius: 6px; background: #f3f4f6; border: 1px solid #e5e7eb; }
          .sofia-card .meta { font-size: 10px; color: #4b5563; margin-top: 6px; line-height: 1.35; }
          .sofia-card .pid { font-weight: 700; color: #6b21a8; }
          .sofia-card .row { display: flex; justify-content: space-between; gap: 6px; }
          @media print {
            body { padding: 12px; }
            img { max-width: 100% !important; }
          }
        </style>
      </head>
      <body>
        ${printContent}
        <div class="footer">
          Relatório gerado em ${new Date().toLocaleString("pt-BR")} — Jurema Sport PDV
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    try {
      // Aguarda imagens carregarem na janela do print antes de chamar window.print()
      // (o navegador embute as imagens no PDF a partir do DOM já renderizado).
      const win: any = printWindow;
      if (win.document.readyState !== "complete") {
        await new Promise<void>((resolve) => {
          win.addEventListener("load", () => resolve(), { once: true });
          setTimeout(resolve, 4000);
        });
      }
      await waitForAllImages(printWindow.document.body);
      printWindow.focus();
      printWindow.print();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <PdvLayout>
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center shadow-lg shadow-green-700/20">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Relatório PDV</h1>
          <p className="text-gray-400 text-sm">Gere relatórios por período com bônus, Sofia e descontos</p>
        </div>
      </div>
      {isAdmin && (
        <div className="flex flex-wrap gap-2 mb-6">
          <a
            href="#relatorio-produto"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-800/80 text-amber-100 hover:bg-amber-700"
          >
            Ir para Relatório por Produto
          </a>
          <a
            href="#relatorio-vendas"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700"
          >
            Relatório de Vendas
          </a>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-green-500" />
          <h2 className="text-white font-semibold text-sm">Configuração do Relatório</h2>
        </div>

        {/* Período */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Data Início</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setShowPreview(false); }}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-3 py-2.5 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Data Fim</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setShowPreview(false); }}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-3 py-2.5 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
              />
            </div>
          </div>

        </div>

        {/* Seções */}
        <div className="flex flex-wrap gap-3 mb-5">
          <label className="flex items-center gap-2 cursor-pointer bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-700 hover:border-green-600 transition-colors">
            <input
              type="checkbox"
              checked={sections.comissoes}
              onChange={(e) => { setSections(s => ({ ...s, comissoes: e.target.checked })); setShowPreview(false); }}
              className="accent-green-600 w-4 h-4"
            />
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-white text-sm">Bônus</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-700 hover:border-green-600 transition-colors">
            <input
              type="checkbox"
              checked={sections.sofia}
              onChange={(e) => { setSections(s => ({ ...s, sofia: e.target.checked })); setShowPreview(false); }}
              className="accent-green-600 w-4 h-4"
            />
            <Package className="w-4 h-4 text-purple-500" />
            <span className="text-white text-sm">Sofia</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-700 hover:border-green-600 transition-colors">
            <input
              type="checkbox"
              checked={sections.descontos}
              onChange={(e) => { setSections(s => ({ ...s, descontos: e.target.checked })); setShowPreview(false); }}
              className="accent-green-600 w-4 h-4"
            />
            <Wallet className="w-4 h-4 text-amber-500" />
            <span className="text-white text-sm">Descontos em Folha</span>
          </label>
          <label
            className={`flex items-center gap-2 cursor-pointer bg-gray-800 rounded-lg px-4 py-2.5 border transition-colors ${
              sections.sofia ? "border-gray-700 hover:border-purple-600" : "border-gray-800 opacity-50 cursor-not-allowed"
            }`}
            title={sections.sofia ? "Inclui as fotos dos pedidos Sofia no preview e no PDF" : "Selecione Sofia para liberar"}
          >
            <input
              type="checkbox"
              checked={includeSofiaPhotos}
              disabled={!sections.sofia}
              onChange={(e) => setIncludeSofiaPhotos(e.target.checked)}
              className="accent-purple-600 w-4 h-4"
            />
            <ImageIcon className="w-4 h-4 text-purple-500" />
            <span className="text-white text-sm">Fotos Sofia no PDF</span>
          </label>
        </div>

        {/* Serviços (cada um pode ser emitido isoladamente) */}
        <div className="mb-2">
          <div className="text-gray-400 text-xs mb-2">Serviços (emita cada um separadamente ou combine)</div>
          <div className="flex flex-wrap gap-3 mb-5">
            <label className="flex items-center gap-2 cursor-pointer bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-700 hover:border-blue-600 transition-colors">
              <input
                type="checkbox"
                checked={sections.servicos.correios}
                onChange={(e) => { setSections(s => ({ ...s, servicos: { ...s.servicos, correios: e.target.checked } })); setShowPreview(false); }}
                className="accent-blue-600 w-4 h-4"
              />
              <Mail className="w-4 h-4 text-blue-400" />
              <span className="text-white text-sm">Correios</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-700 hover:border-pink-600 transition-colors">
              <input
                type="checkbox"
                checked={sections.servicos.caixinhas}
                onChange={(e) => { setSections(s => ({ ...s, servicos: { ...s.servicos, caixinhas: e.target.checked } })); setShowPreview(false); }}
                className="accent-pink-600 w-4 h-4"
              />
              <PiggyBank className="w-4 h-4 text-pink-400" />
              <span className="text-white text-sm">Caixinhas</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-700 hover:border-orange-600 transition-colors">
              <input
                type="checkbox"
                checked={sections.servicos.carretos}
                onChange={(e) => { setSections(s => ({ ...s, servicos: { ...s.servicos, carretos: e.target.checked } })); setShowPreview(false); }}
                className="accent-orange-600 w-4 h-4"
              />
              <Truck className="w-4 h-4 text-orange-400" />
              <span className="text-white text-sm">Carretos</span>
            </label>
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Gerar Relatório
          </button>
          {showPreview && data && (
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {printing ? "Preparando PDF…" : "Imprimir / PDF"}
            </button>
          )}
        </div>
      </div>

      {/* Preview do Relatório */}
      {showPreview && isLoading && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
          <span className="text-gray-400 ml-3">Gerando relatório...</span>
        </div>
      )}

      {showPreview && data && !isLoading && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-sm">Preview do Relatório</h2>
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {printing ? "Preparando PDF…" : "Imprimir / PDF"}
            </button>
          </div>

          {/* Conteúdo imprimível */}
          <div ref={printRef} className="bg-white rounded-xl p-6 text-gray-900">
            <ReportContent
              data={data}
              startDate={startDate}
              endDate={endDate}
              includeSofiaPhotos={includeSofiaPhotos}
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* Relatório por Pedido (individual)                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 mt-10 mb-4">
        <div className="w-10 h-10 bg-purple-700 rounded-xl flex items-center justify-center shadow-lg shadow-purple-700/20">
          <Receipt className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Relatório por Pedido</h2>
          <p className="text-gray-400 text-sm">Documento completo de um pedido específico (A4), com todos os dados</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
        <label className="text-gray-400 text-xs mb-1 block">Número do pedido</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleGenerateOrder(); }}
              placeholder="Ex: PDV-000123 (copie do Histórico)"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-3 py-2.5 text-sm focus:border-purple-600 focus:ring-1 focus:ring-purple-600 outline-none"
            />
          </div>
          <button
            onClick={handleGenerateOrder}
            disabled={orderLoading}
            className="flex items-center justify-center gap-2 bg-purple-700 hover:bg-purple-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {orderLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Gerar Relatório
          </button>
          {orderData && !orderLoading && (
            <button
              onClick={handlePrintOrder}
              disabled={printingOrder}
              className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {printingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {printingOrder ? "Preparando PDF…" : "Imprimir / PDF"}
            </button>
          )}
          {orderData && !orderLoading && (
            <button
              onClick={handleShareOrderWhatsApp}
              title={orderData.clienteTelefone ? `Enviar para ${orderData.clienteTelefone}` : "Escolher contato no WhatsApp"}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Compartilhar no WhatsApp
            </button>
          )}
        </div>

        {orderToFetch && orderIsError && (
          <p className="text-red-400 text-sm mt-3">
            {orderError?.data?.code === "NOT_FOUND"
              ? `Pedido "${orderToFetch}" não encontrado.`
              : `Não foi possível carregar o pedido (${orderError?.message ?? "erro"}).`}
          </p>
        )}
      </div>

      {orderData && !orderLoading && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="text-white font-semibold text-sm">Preview — Pedido {orderData.pedidoId}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleShareOrderWhatsApp}
                title={orderData.clienteTelefone ? `Enviar para ${orderData.clienteTelefone}` : "Escolher contato no WhatsApp"}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                WhatsApp
              </button>
              <button
                onClick={handlePrintOrder}
                disabled={printingOrder}
                className="flex items-center gap-2 bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
              >
                {printingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {printingOrder ? "Preparando PDF…" : "Imprimir / PDF"}
              </button>
            </div>
          </div>

          <div ref={orderPrintRef} className="bg-white rounded-xl p-6 text-gray-900">
            <OrderReportContent
              order={orderData}
              storeName={cfgNomeLoja?.value || "Jurema Sport"}
              whatsapp={cfgWhatsapp?.value || undefined}
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* Relatório de Vendas (admin)                                    */}
      {/* ════════════════════════════════════════════════════════════ */}
      {isAdmin && (
        <>
          <div id="relatorio-vendas" className="flex items-center gap-3 mt-10 mb-4">
            <div className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center shadow-lg shadow-green-700/20">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Relatório de Vendas</h2>
              <p className="text-gray-400 text-sm">Resumo de vendas do dia/período com atalhos rápidos — imprimível</p>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
            {/* Atalhos rápidos */}
            <div className="flex flex-wrap gap-2 mb-4">
              {SALES_QUICK.map((q) => (
                <button
                  key={q.key}
                  onClick={() => applySalesQuick(q.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    salesQuick === q.key
                      ? "bg-green-700 border-green-600 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* Período customizado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Data Início</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="date"
                    value={salesStart}
                    onChange={(e) => { setSalesStart(e.target.value); setSalesQuick("custom"); setShowSalesPreview(false); }}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-3 py-2.5 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Data Fim</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="date"
                    value={salesEnd}
                    onChange={(e) => { setSalesEnd(e.target.value); setSalesQuick("custom"); setShowSalesPreview(false); }}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-3 py-2.5 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleGenerateSales}
                disabled={salesLoading}
                className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {salesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Gerar Relatório
              </button>
              {showSalesPreview && salesSummary && !salesLoading && (
                <button
                  onClick={handlePrintSales}
                  disabled={printingSales}
                  className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {printingSales ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {printingSales ? "Preparando PDF…" : "Imprimir / PDF"}
                </button>
              )}
            </div>
          </div>

          {showSalesPreview && salesLoading && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 flex items-center justify-center mb-6">
              <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
              <span className="text-gray-400 ml-3">Gerando relatório...</span>
            </div>
          )}

          {showSalesPreview && salesSummary && !salesLoading && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-sm">Preview — {periodoLabel(salesStart, salesEnd)}</h2>
                <button
                  onClick={handlePrintSales}
                  disabled={printingSales}
                  className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
                >
                  {printingSales ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {printingSales ? "Preparando PDF…" : "Imprimir / PDF"}
                </button>
              </div>

              <div ref={salesPrintRef} className="bg-white rounded-xl p-6 text-gray-900">
                <SalesReportContent
                  summary={salesSummary}
                  orders={salesOrders?.orders || []}
                  totalOrders={salesOrders?.total ?? 0}
                  periodo={periodoLabel(salesStart, salesEnd)}
                  storeName={cfgNomeLoja?.value || "Jurema Sport"}
                />
              </div>
            </div>
          )}

          {/* Relatório por Produto */}
          <div id="relatorio-produto" className="flex items-center gap-3 mt-10 mb-4">
            <div className="w-10 h-10 bg-amber-700 rounded-xl flex items-center justify-center shadow-lg shadow-amber-700/20">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Relatório por Produto</h2>
              <p className="text-gray-400 text-sm">
                Digite o nome ou código, clique no resultado da lista e depois em Gerar Relatório. Sofia aparece em roxo.
              </p>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
            <div className="flex flex-wrap gap-2 mb-4">
              {SALES_QUICK.map((q) => (
                <button
                  key={q.key}
                  onClick={() => applyProdQuick(q.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    prodQuick === q.key
                      ? "bg-amber-700 border-amber-600 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>

            <div className="mb-4 relative">
              <label className="text-gray-400 text-xs mb-1 block">
                Produto — digite e clique na lista (família = todos os tamanhos)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={prodSearch}
                  onChange={(e) => {
                    setProdSearch(e.target.value);
                    setProdSelected(null);
                    setShowProdPreview(false);
                    setShowProdDropdown(true);
                  }}
                  onFocus={() => setShowProdDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleGenerateProduct();
                    }
                    if (e.key === "Escape") setShowProdDropdown(false);
                  }}
                  placeholder="Ex: código, Flamengo, modelo…"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-10 py-2.5 text-sm focus:border-amber-600 focus:ring-1 focus:ring-amber-600 outline-none"
                  autoComplete="off"
                />
                {prodSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 animate-spin" />
                )}
              </div>

              {showProdDropdown && prodSearchDebounced.length >= 1 && (
                <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-gray-950 border border-gray-700 rounded-xl shadow-xl">
                  {(prodSearchData?.familias?.length ?? 0) > 0 && (
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-amber-500/80 font-semibold border-b border-gray-800">
                      Famílias (todos os tamanhos)
                    </div>
                  )}
                  {(prodSearchData?.familias || []).map((f) => (
                    <button
                      key={`fam-${f.time}-${f.modelo}`}
                      type="button"
                      onClick={() =>
                        handleSelectProduct({
                          tipo: "familia",
                          time: f.time,
                          modelo: f.modelo,
                          linha: f.linha,
                          label: f.label,
                        })
                      }
                      className="w-full text-left px-3 py-2.5 hover:bg-amber-900/30 border-b border-gray-800/80"
                    >
                      <div className="text-sm text-white font-medium">{f.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[f.descricao, f.linha].filter(Boolean).join(" · ") || "—"}
                        {" · "}estoque {f.estoque}
                      </div>
                    </button>
                  ))}
                  {(prodSearchData?.skus?.length ?? 0) > 0 && (
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-gray-500 font-semibold border-b border-gray-800">
                      SKUs / códigos
                    </div>
                  )}
                  {(prodSearchData?.skus || []).map((s) => (
                    <button
                      key={`sku-${s.codigo}`}
                      type="button"
                      onClick={() =>
                        handleSelectProduct({
                          tipo: "sku",
                          codigo: s.codigo,
                          label: s.label,
                        })
                      }
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-800 border-b border-gray-800/80 last:border-0"
                    >
                      <div className="text-sm text-white font-medium">{s.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[s.linha, s.tipoProduto].filter(Boolean).join(" · ") || "—"}
                        {" · "}est. {s.estoque}
                      </div>
                    </button>
                  ))}
                  {!prodSearching &&
                    (prodSearchData?.skus?.length ?? 0) === 0 &&
                    (prodSearchData?.familias?.length ?? 0) === 0 && (
                      <div className="px-3 py-4 text-sm text-gray-500 text-center">Nenhum produto encontrado</div>
                    )}
                </div>
              )}

              {prodSelected && (
                <p className="text-amber-400/90 text-xs mt-2">
                  Selecionado:{" "}
                  <span className="font-semibold text-amber-300">{prodSelected.label}</span>
                  {prodSelected.tipo === "familia" ? " (todos os tamanhos)" : " (SKU único)"}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Data Início</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="date"
                    value={prodStart}
                    onChange={(e) => {
                      setProdStart(e.target.value);
                      setProdQuick("custom");
                      setShowProdPreview(false);
                    }}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-3 py-2.5 text-sm focus:border-amber-600 focus:ring-1 focus:ring-amber-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Data Fim</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="date"
                    value={prodEnd}
                    onChange={(e) => {
                      setProdEnd(e.target.value);
                      setProdQuick("custom");
                      setShowProdPreview(false);
                    }}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-3 py-2.5 text-sm focus:border-amber-600 focus:ring-1 focus:ring-amber-600 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleGenerateProduct}
                disabled={prodLoading}
                className="flex items-center gap-2 bg-amber-700 hover:bg-amber-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {prodLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Gerar Relatório
              </button>
              {showProdPreview && prodReport && !prodLoading && (
                <button
                  onClick={handlePrintProduct}
                  disabled={printingProd}
                  className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {printingProd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {printingProd ? "Preparando PDF…" : "Imprimir / PDF"}
                </button>
              )}
            </div>

            {showProdPreview && prodIsError && (
              <p className="text-red-400 text-sm mt-3">
                {prodError?.data?.code === "NOT_FOUND"
                  ? prodError.message
                  : `Não foi possível gerar o relatório (${prodError?.message ?? "erro"}).`}
              </p>
            )}
          </div>

          {showProdPreview && prodLoading && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 flex items-center justify-center mb-6">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
              <span className="text-gray-400 ml-3">Gerando relatório do produto...</span>
            </div>
          )}

          {showProdPreview && prodReport && !prodLoading && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <h2 className="text-white font-semibold text-sm">
                  Preview — Produto · {periodoLabel(prodStart, prodEnd)}
                </h2>
                <button
                  onClick={handlePrintProduct}
                  disabled={printingProd}
                  className="flex items-center gap-2 bg-amber-700 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
                >
                  {printingProd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {printingProd ? "Preparando PDF…" : "Imprimir / PDF"}
                </button>
              </div>

              <div ref={prodPrintRef} className="bg-white rounded-xl p-6 text-gray-900">
                <ProductReportContent
                  data={prodReport}
                  periodo={periodoLabel(prodStart, prodEnd)}
                  storeName={cfgNomeLoja?.value || "Jurema Sport"}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </PdvLayout>
  );
}

// ============================================================
// Componente de conteúdo do relatório (usado no preview e na impressão)
// ============================================================
function ReportContent({ data, startDate, endDate, includeSofiaPhotos }: {
  data: any;
  startDate: string;
  endDate: string;
  includeSofiaPhotos: boolean;
}) {
  return (
    <div>
      {/* Header */}
      <div className="report-header" style={{ textAlign: "center", marginBottom: 24, paddingBottom: 16, borderBottom: "2px solid #16a34a" }}>
        <h1 style={{ fontSize: 22, color: "#16a34a", marginBottom: 4, fontWeight: 700 }}>JUREMA SPORT — Relatório PDV</h1>
        <div style={{ fontSize: 13, color: "#666" }}>
          Período: {formatDate(startDate)} a {formatDate(endDate)}
        </div>
      </div>

      {/* COMISSÕES */}
      {data.comissoes && (
        <div className="section" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#16a34a", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>
            📊 Bônus por Vendedor (R$ {(data?.comissoes?.taxaComissao ?? 0.50).toFixed(2)}/peça)
          </div>

          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Total de Pedidos</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>{data.comissoes.totalPedidos}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Total de Peças</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>{data.comissoes.totalPecas}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Faturamento Total</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>{formatCurrency(data.comissoes.totalFaturamento)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Total em Bônus</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#16a34a" }}>{formatCurrency(data.comissoes.totalComissoes)}</span>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={thStyle}>Vendedor</th>
                <th style={thStyle}>Pedidos</th>
                <th style={thStyle}>Peças</th>
                <th style={thStyle}>Faturamento</th>
                <th style={thStyle}>Atacado</th>
                <th style={thStyle}>Varejo</th>
                <th style={thStyle}>Bônus</th>
              </tr>
            </thead>
            <tbody>
              {data.comissoes.sellers.map((s: any, i: number) => (
                <tr key={i}>
                  <td style={tdStyle}><strong>{s.sellerName}</strong></td>
                  <td style={tdStyleCenter}>{s.totalPedidos}</td>
                  <td style={tdStyleCenter}>{s.totalPecas}</td>
                  <td style={tdStyle}>{formatCurrency(s.faturamento)}</td>
                  <td style={tdStyle}>{formatCurrency(s.faturamentoAtacado)}</td>
                  <td style={tdStyle}>{formatCurrency(s.faturamentoVarejo)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#16a34a" }}>{formatCurrency(s.comissao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SOFIA */}
      {data.sofia && (
        <div className="section" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#7c3aed", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>
            📦 Vendas Sofia (Bônus Loja: R$ {data.sofia.comissaoLoja.toFixed(2)}/peça)
          </div>

          <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Total de Pedidos</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>{data.sofia.totalPedidos}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Total de Peças</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>{data.sofia.totalPecas}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Faturamento</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>{formatCurrency(data.sofia.faturamento)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Comissão da Loja</span>
              <span style={{ fontWeight: 700, fontSize: 12 }}>{formatCurrency(data.sofia.comissaoTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Reembolso Total</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#7c3aed" }}>{formatCurrency(data.sofia.reembolsoTotal)}</span>
            </div>
          </div>

          {data.sofia.porVendedor.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Vendedor</th>
                  <th style={thStyle}>Pedidos</th>
                  <th style={thStyle}>Peças</th>
                  <th style={thStyle}>Faturamento</th>
                  <th style={thStyle}>Comissão Loja</th>
                  <th style={thStyle}>Reembolso</th>
                </tr>
              </thead>
              <tbody>
                {data.sofia.porVendedor.map((s: any, i: number) => (
                  <tr key={i}>
                    <td style={tdStyle}><strong>{s.sellerName}</strong></td>
                    <td style={tdStyleCenter}>{s.pedidos}</td>
                    <td style={tdStyleCenter}>{s.pecas}</td>
                    <td style={tdStyle}>{formatCurrency(s.faturamento)}</td>
                    <td style={tdStyle}>{formatCurrency(s.comissao)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#7c3aed" }}>{formatCurrency(s.reembolso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Galeria de comprovantes Sofia (vai junto no PDF impresso) */}
          {includeSofiaPhotos && Array.isArray(data.sofia.pedidos) && data.sofia.pedidos.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#6b21a8", marginBottom: 8 }}>
                Comprovantes Sofia ({data.sofia.totalComFoto || 0} com foto
                {(data.sofia.totalFotoInvalida || 0) > 0
                  ? ` · ${data.sofia.totalFotoInvalida} inválida(s)`
                  : ""}
                {" · "}{data.sofia.totalSemFoto || 0} sem foto)
              </div>
              <div className="sofia-gallery" style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}>
                {data.sofia.pedidos.map((p: any) => {
                  const url = absoluteUrl(p.fotoUrl);
                  const invalid = !!p.fotoInvalida;
                  return (
                    <div key={p.pedidoId} className="sofia-card" style={{
                      border: "1px solid #e9d5ff",
                      borderRadius: 8,
                      padding: 8,
                      background: "#faf5ff",
                      pageBreakInside: "avoid",
                    }}>
                      {invalid ? (
                        <div style={{
                          width: "100%",
                          height: 140,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          padding: 8,
                          borderRadius: 6,
                          background: "#fee2e2",
                          color: "#991b1b",
                          fontSize: 10,
                          fontWeight: 600,
                          border: "1px dashed #f87171",
                        }}>
                          Foto corrompida — reenvie no Painel Sofia
                        </div>
                      ) : url ? (
                        <img
                          src={url}
                          alt={`Pedido ${p.pedidoId}`}
                          style={{
                            display: "block",
                            width: "100%",
                            height: 140,
                            objectFit: "cover",
                            borderRadius: 6,
                            background: "#f3f4f6",
                            border: "1px solid #e5e7eb",
                          }}
                        />
                      ) : (
                        <div style={{
                          width: "100%",
                          height: 140,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 6,
                          background: "#fef3c7",
                          color: "#92400e",
                          fontSize: 11,
                          fontWeight: 600,
                          border: "1px dashed #fbbf24",
                        }}>
                          Sem foto
                        </div>
                      )}
                      <div className="meta" style={{ fontSize: 10, color: "#4b5563", marginTop: 6, lineHeight: 1.35 }}>
                        <div className="row" style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <span className="pid" style={{ fontWeight: 700, color: "#6b21a8" }}>{p.pedidoId}</span>
                          <span>{formatDate(p.dia)}</span>
                        </div>
                        <div className="row" style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 2 }}>
                          <span>{p.sellerName}</span>
                          <span style={{ fontWeight: 700, color: "#111" }}>{formatCurrency(p.valorSofia)} · {p.pecasSofia}pç</span>
                        </div>
                        {p.clienteNome && (
                          <div style={{ marginTop: 2, color: "#6b7280" }}>{p.clienteNome}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SERVIÇOS — uma seção por tipo selecionado, podendo ser impressas separadamente */}
      {data.servicos?.correios && (
        <ServicoSection
          tipo="CORREIO"
          titulo="Correios"
          icone="📮"
          cor="#1d4ed8"
          bg="#eff6ff"
          borda="#bfdbfe"
          dados={data.servicos.correios}
          showCep
        />
      )}
      {data.servicos?.caixinhas && (
        <ServicoSection
          tipo="CAIXINHA"
          titulo="Caixinhas"
          icone="🐷"
          cor="#be185d"
          bg="#fdf2f8"
          borda="#fbcfe8"
          dados={data.servicos.caixinhas}
        />
      )}
      {data.servicos?.carretos && (
        <ServicoSection
          tipo="CARRETO"
          titulo="Carretos"
          icone="🚚"
          cor="#c2410c"
          bg="#fff7ed"
          borda="#fed7aa"
          dados={data.servicos.carretos}
        />
      )}

      {/* DESCONTOS EM FOLHA */}
      {data.descontos && (
        <div className="section" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#d97706", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>
            💰 Descontos em Folha
          </div>

          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Total Pendente</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#dc2626" }}>{formatCurrency(data.descontos.totalPendente)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "#666", fontSize: 11 }}>Total Quitado</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#16a34a" }}>{formatCurrency(data.descontos.totalQuitado)}</span>
            </div>
          </div>

          {data.descontos.porVendedor.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Funcionário</th>
                  <th style={thStyle}>Itens</th>
                  <th style={thStyle}>Pendente</th>
                  <th style={thStyle}>Quitado</th>
                  <th style={thStyle}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.descontos.porVendedor.map((s: any, i: number) => (
                  <tr key={i}>
                    <td style={tdStyle}><strong>{s.sellerName}</strong></td>
                    <td style={tdStyleCenter}>{s.totalItens}</td>
                    <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 600 }}>{formatCurrency(s.pendente)}</td>
                    <td style={{ ...tdStyle, color: "#16a34a" }}>{formatCurrency(s.quitado)}</td>
                    <td style={tdStyle}>{formatCurrency(s.totalGeral)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Histórico de Quitações */}
          {data.descontos.historicoQuitacoes && data.descontos.historicoQuitacoes.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#666", marginBottom: 8, marginTop: 16 }}>
                Histórico de Quitações no Período
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Funcionário</th>
                    <th style={thStyle}>Descrição</th>
                    <th style={thStyle}>Valor</th>
                    <th style={thStyle}>Quitado Em</th>
                    <th style={thStyle}>Quitado Por</th>
                  </tr>
                </thead>
                <tbody>
                  {data.descontos.historicoQuitacoes.map((q: any, i: number) => (
                    <tr key={i}>
                      <td style={tdStyle}>{q.sellerName}</td>
                      <td style={tdStyle}>{q.descricao}</td>
                      <td style={tdStyle}>{formatCurrency(q.valor)}</td>
                      <td style={tdStyle}>{q.quitadoEm ? formatDateTime(q.quitadoEm) : "—"}</td>
                      <td style={tdStyle}>{q.quitadoPor || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Estilos inline para o PDF
const thStyle: React.CSSProperties = {
  background: "#f0fdf4",
  color: "#166534",
  fontWeight: 600,
  textAlign: "left",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  fontSize: 11,
};

const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #e5e7eb",
  fontSize: 11,
};

const tdStyleCenter: React.CSSProperties = {
  ...tdStyle,
  textAlign: "center",
};

const tdRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const thRight: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

// ============================================================
// Relatório completo de UM pedido (A4) — usado no preview e na impressão
// ============================================================
function OrderReportContent({
  order,
  storeName,
  whatsapp,
}: {
  order: any;
  storeName: string;
  whatsapp?: string;
}) {
  const items: any[] = order.items || [];
  const services: any[] = order.services || [];
  const payments: any[] = order.payments || [];

  // Totais (mesma semântica do recibo: `valor` = líquido que a loja recebe;
  // `valor + taxa` = valor cobrado na maquininha).
  const subtotalItens = items.reduce((s, i) => s + toNum(i.totalItem), 0);
  const totalServicos = services.reduce((s, sv) => s + toNum(sv.valor), 0);
  const taxaTotal = payments.reduce((s, p) => s + toNum(p.taxa), 0);
  const totalLiquido = payments.reduce((s, p) => s + toNum(p.valor), 0);
  const totalMaquininha = payments.reduce((s, p) => {
    const taxa = toNum(p.taxa);
    return s + (taxa > 0 ? toNum(p.valor) + taxa : toNum(p.valor));
  }, 0);
  const totalGeral = subtotalItens + totalServicos + taxaTotal;
  const pendente = toNum(order.totalPendente);

  const statusCor =
    order.status === "PAGO" ? "#16a34a" : order.status === "PENDENTE" ? "#b45309" : "#dc2626";

  const InfoRow = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="info-row" style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dotted #e5e7eb", padding: "3px 0", fontSize: 11 }}>
      <span className="k" style={{ color: "#666" }}>{k}</span>
      <span className="v" style={{ fontWeight: 600 }}>{v}</span>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="report-header" style={{ textAlign: "center", marginBottom: 20, paddingBottom: 14, borderBottom: "2px solid #16a34a" }}>
        <h1 style={{ fontSize: 20, color: "#16a34a", marginBottom: 2, fontWeight: 700 }}>
          {(storeName || "JUREMA SPORT").toUpperCase()} — Relatório do Pedido
        </h1>
        <div className="sub" style={{ fontSize: 12, color: "#666" }}>
          Pedido <b>{order.pedidoId}</b> · {formatDateTime(order.createdAt)}
        </div>
        <div style={{ marginTop: 6 }}>
          <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, padding: "3px 12px", borderRadius: 999, border: `1px solid ${statusCor}`, color: statusCor }}>
            {order.status}
          </span>
        </div>
      </div>

      {/* Dados gerais */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
          Dados do Pedido
        </div>
        <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0 24px" }}>
          <InfoRow k="Vendedor" v={order.sellerName || "—"} />
          <InfoRow k="Canal" v={order.canal || "—"} />
          <InfoRow k="Cliente" v={order.clienteNome || "—"} />
          <InfoRow k="Telefone" v={order.clienteTelefone || "—"} />
          <InfoRow k="Regime" v={order.regime || "—"} />
          <InfoRow k="Data/Hora" v={formatDateTime(order.createdAt)} />
        </div>
      </div>

      {/* Itens */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
          Itens
        </div>
        {items.length === 0 ? (
          <div style={{ fontSize: 11, color: "#888" }}>Nenhum item (pedido somente de serviço).</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={thStyle}>Qtd</th>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Linha / Modelo</th>
                <th style={thStyle}>Tam.</th>
                <th style={thRight}>Preço unit.</th>
                <th style={thRight}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const unit = it.precoUnitario !== undefined && it.precoUnitario !== null
                  ? toNum(it.precoUnitario)
                  : toNum(it.totalItem) / (toNum(it.quantidade) || 1);
                return (
                  <tr key={i}>
                    <td style={tdStyleCenter}>{it.quantidade}x</td>
                    <td style={tdStyle}>{itemNome(it)}{it.isSofia ? " (Sofia)" : ""}</td>
                    <td style={tdStyle}>{[it.linha, it.modelo].filter(Boolean).join(" / ") || "—"}</td>
                    <td style={tdStyleCenter}>{it.tamanho || "—"}</td>
                    <td style={tdRight}>{formatCurrency(unit)}</td>
                    <td style={tdRight}>{formatCurrency(toNum(it.totalItem))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Serviços */}
      {services.length > 0 && (
        <div className="section" style={{ marginBottom: 18 }}>
          <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
            Serviços
          </div>
          <table>
            <thead>
              <tr>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Descrição</th>
                <th style={thStyle}>CEP</th>
                <th style={thRight}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{s.tipo}</td>
                  <td style={tdStyle}>{s.descricao || "—"}</td>
                  <td style={tdStyleCenter}>{s.cep || "—"}</td>
                  <td style={tdRight}>{formatCurrency(toNum(s.valor))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagamentos (com dados financeiros) */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
          Pagamentos
        </div>
        {payments.length === 0 ? (
          <div style={{ fontSize: 11, color: "#888" }}>Nenhum pagamento registrado.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={thStyle}>Forma</th>
                <th style={thStyle}>Quem pagou</th>
                <th style={thStyle}>Obs. pagamento</th>
                <th style={thRight}>Cobrado</th>
                <th style={thRight}>Taxa</th>
                <th style={thRight}>Líquido (loja)</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => {
                const taxa = toNum(p.taxa);
                const cobrado = taxa > 0 ? toNum(p.valor) + taxa : toNum(p.valor);
                return (
                  <tr key={i}>
                    <td style={tdStyle}>{PAYMENT_LABELS[p.formaPagamento] || p.formaPagamento}</td>
                    <td style={tdStyle}>{p.nomePix || "—"}</td>
                    <td style={tdStyle}>{p.obsPagamento || "—"}</td>
                    <td style={tdRight}>{formatCurrency(cobrado)}</td>
                    <td style={tdRight}>{taxa > 0 ? formatCurrency(taxa) : "—"}</td>
                    <td style={tdRight}>{formatCurrency(toNum(p.valor))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Resumo financeiro */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
          Resumo Financeiro
        </div>
        <div className="summary-box" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px" }}>
          <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
            <span style={{ color: "#555" }}>Subtotal dos itens ({order.regime || "—"})</span>
            <span>{formatCurrency(subtotalItens)}</span>
          </div>
          {totalServicos > 0 && (
            <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
              <span style={{ color: "#555" }}>Serviços extras</span>
              <span>{formatCurrency(totalServicos)}</span>
            </div>
          )}
          {taxaTotal > 0 && (
            <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
              <span style={{ color: "#555" }}>Taxa de cartão</span>
              <span style={{ color: "#b45309" }}>+ {formatCurrency(taxaTotal)}</span>
            </div>
          )}
          <div className="summary-row total" style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #16a34a", marginTop: 6, paddingTop: 8, fontSize: 14, fontWeight: 800, color: "#16a34a" }}>
            <span>Total Geral</span>
            <span>{formatCurrency(totalGeral)}</span>
          </div>
          {taxaTotal > 0 && (
            <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
              <span style={{ color: "#a16207" }}>Valor cobrado na maquininha</span>
              <span style={{ color: "#a16207", fontWeight: 700 }}>{formatCurrency(totalMaquininha)}</span>
            </div>
          )}
          <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
            <span style={{ color: "#555" }}>Líquido recebido (loja)</span>
            <span>{formatCurrency(totalLiquido)}</span>
          </div>
          {pendente > 0 && (
            <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
              <span style={{ color: "#b45309", fontWeight: 700 }}>Pendente</span>
              <span style={{ color: "#b45309", fontWeight: 700 }}>{formatCurrency(pendente)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Observações */}
      {order.justificativa && (
        <div className="section" style={{ marginBottom: 8 }}>
          <div className="obs" style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#92400e" }}>
            <b>Observações:</b> {order.justificativa}
          </div>
        </div>
      )}

      {whatsapp && (
        <div style={{ textAlign: "center", fontSize: 10, color: "#999", marginTop: 12 }}>
          Contato: {whatsapp}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Relatório de Vendas (resumo do período) — preview e impressão
// ============================================================
function SalesReportContent({
  summary,
  orders,
  totalOrders,
  periodo,
  storeName,
}: {
  summary: any;
  orders: any[];
  totalOrders: number;
  periodo: string;
  storeName: string;
}) {
  const s = summary?.summary ?? {};
  const faturamento = toNum(s.faturamento);
  const totalPedidos = Math.round(toNum(s.totalPedidos));
  const ticketMedio = toNum(s.ticketMedio);
  const fatAtacado = toNum(s.faturamentoAtacado);
  const fatVarejo = toNum(s.faturamentoVarejo);
  const fatBalcao = toNum(s.faturamentoBalcao);
  const fatWhatsapp = toNum(s.faturamentoWhatsapp);

  const byPayment: any[] = summary?.byPayment ?? [];
  const bySeller: any[] = summary?.bySeller ?? [];
  const byDay: any[] = summary?.byDay ?? [];
  const totalPagamentos = byPayment.reduce((acc, p) => acc + toNum(p.total), 0);

  const pct = (v: number, tot: number) => (tot > 0 ? `${Math.round((v / tot) * 100)}%` : "—");
  const fmtDia = (ymd: string) => {
    if (!ymd) return "—";
    const part = String(ymd).slice(0, 10).split("-");
    return part.length === 3 ? `${part[2]}/${part[1]}` : ymd;
  };

  const StatChip = ({ label, value }: { label: string; value: string }) => (
    <div className="kpi" style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 8, padding: "10px 14px" }}>
      <div className="k" style={{ fontSize: 11, color: "#666" }}>{label}</div>
      <div className="v" style={{ fontSize: 18, fontWeight: 800, color: "#16a34a", marginTop: 2 }}>{value}</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="report-header" style={{ textAlign: "center", marginBottom: 20, paddingBottom: 14, borderBottom: "2px solid #16a34a" }}>
        <h1 style={{ fontSize: 20, color: "#16a34a", marginBottom: 2, fontWeight: 700 }}>
          {(storeName || "JUREMA SPORT").toUpperCase()} — Relatório de Vendas
        </h1>
        <div className="sub" style={{ fontSize: 12, color: "#666" }}>Período: {periodo}</div>
      </div>

      {/* KPIs */}
      <div className="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
        <StatChip label="Faturamento (peças)" value={formatCurrency(faturamento)} />
        <StatChip label="Pedidos" value={String(totalPedidos)} />
        <StatChip label="Ticket Médio" value={formatCurrency(ticketMedio)} />
      </div>

      {/* Distribuição: Canal e Regime */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
          Distribuição
        </div>
        <table>
          <thead>
            <tr>
              <th style={thStyle}>Categoria</th>
              <th style={thStyle}>Tipo</th>
              <th style={thRight}>Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={tdStyle}>Canal</td><td style={tdStyle}>Balcão</td><td style={tdRight}>{formatCurrency(fatBalcao)}</td></tr>
            <tr><td style={tdStyle}>Canal</td><td style={tdStyle}>WhatsApp</td><td style={tdRight}>{formatCurrency(fatWhatsapp)}</td></tr>
            <tr><td style={tdStyle}>Regime</td><td style={tdStyle}>Atacado</td><td style={tdRight}>{formatCurrency(fatAtacado)}</td></tr>
            <tr><td style={tdStyle}>Regime</td><td style={tdStyle}>Varejo</td><td style={tdRight}>{formatCurrency(fatVarejo)}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Por forma de pagamento */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
          Por Forma de Pagamento
        </div>
        {byPayment.length === 0 ? (
          <div style={{ fontSize: 11, color: "#888" }}>Sem dados.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={thStyle}>Forma</th>
                <th style={thRight}>Total</th>
                <th style={thRight}>%</th>
              </tr>
            </thead>
            <tbody>
              {byPayment.map((p, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{PAYMENT_LABELS[p.formaPagamento] || p.formaPagamento}</td>
                  <td style={tdRight}>{formatCurrency(toNum(p.total))}</td>
                  <td style={tdRight}>{pct(toNum(p.total), totalPagamentos)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdStyle, fontWeight: 700 }}>Total recebido</td>
                <td style={{ ...tdRight, fontWeight: 700 }}>{formatCurrency(totalPagamentos)}</td>
                <td style={tdRight}>—</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Por vendedor */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
          Por Vendedor
        </div>
        {bySeller.length === 0 ? (
          <div style={{ fontSize: 11, color: "#888" }}>Sem dados.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={thStyle}>Vendedor</th>
                <th style={thRight}>Faturamento</th>
                <th style={thRight}>%</th>
              </tr>
            </thead>
            <tbody>
              {bySeller.map((v, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{v.sellerName}</td>
                  <td style={tdRight}>{formatCurrency(toNum(v.faturamento))}</td>
                  <td style={tdRight}>{pct(toNum(v.faturamento), faturamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Vendas por dia */}
      {byDay.length > 1 && (
        <div className="section" style={{ marginBottom: 18 }}>
          <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
            Vendas por Dia
          </div>
          <table>
            <thead>
              <tr>
                <th style={thStyle}>Dia</th>
                <th style={thRight}>Pedidos</th>
                <th style={thRight}>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map((d, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{fmtDia(d.dia)}</td>
                  <td style={tdRight}>{Math.round(toNum(d.pedidos))}</td>
                  <td style={tdRight}>{formatCurrency(toNum(d.faturamento))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lista de pedidos */}
      <div className="section" style={{ marginBottom: 8 }}>
        <div className="section-title" style={{ fontSize: 14, fontWeight: 700, color: "#16a34a", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #e5e7eb" }}>
          Pedidos do Período ({totalOrders})
        </div>
        {orders.length === 0 ? (
          <div style={{ fontSize: 11, color: "#888" }}>Nenhum pedido no período.</div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th style={thStyle}>Data/Hora</th>
                  <th style={thStyle}>Pedido</th>
                  <th style={thStyle}>Vendedor</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Canal</th>
                  <th style={thStyle}>Status</th>
                  <th style={thRight}>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{formatDateTime(o.createdAt)}</td>
                    <td style={tdStyle}>{o.pedidoId}</td>
                    <td style={tdStyle}>{o.sellerName || "—"}</td>
                    <td style={tdStyle}>{o.clienteNome || "—"}</td>
                    <td style={tdStyleCenter}>{o.canal}</td>
                    <td style={tdStyleCenter}>{o.status}</td>
                    <td style={tdRight}>{formatCurrency(toNum(o.totalAplicado))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalOrders > orders.length && (
              <div style={{ fontSize: 10, color: "#999", marginTop: 4 }}>
                Exibindo os primeiros {orders.length} de {totalOrders} pedidos.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Relatório por Produto (SKU / família) — preview e impressão
// ============================================================
function ProductReportContent({
  data,
  periodo,
  storeName,
}: {
  data: any;
  periodo: string;
  storeName: string;
}) {
  const p = data?.produto ?? {};
  const r = data?.resumo ?? {};
  const titulo =
    p.modo === "familia"
      ? `Família: ${[p.time, p.modelo].filter(Boolean).join(" / ")}`
      : `SKU ${p.codigo}`;
  const subtitulo = [
    p.descricao,
    p.linha,
    p.tamanho ? `Tam. ${p.tamanho}` : null,
    p.modo === "familia" && Array.isArray(p.variantes)
      ? `${p.variantes.length} tamanhos`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const fmtDia = (ymd: string) => {
    if (!ymd) return "—";
    const part = String(ymd).slice(0, 10).split("-");
    return part.length === 3 ? `${part[2]}/${part[1]}/${part[0]}` : ymd;
  };

  const Kpi = ({
    label,
    value,
    sofia,
  }: {
    label: string;
    value: string;
    sofia?: boolean;
  }) => (
    <div
      className={`kpi${sofia ? " sofia" : ""}`}
      style={{
        border: sofia ? "1px solid #e9d5ff" : "1px solid #bbf7d0",
        background: sofia ? "#faf5ff" : "#f0fdf4",
        borderRadius: 8,
        padding: "10px 14px",
      }}
    >
      <div className="k" style={{ fontSize: 11, color: "#666" }}>
        {label}
      </div>
      <div
        className="v"
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: sofia ? "#7c3aed" : "#16a34a",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );

  return (
    <div>
      <div
        className="report-header"
        style={{
          textAlign: "center",
          marginBottom: 20,
          paddingBottom: 14,
          borderBottom: "2px solid #16a34a",
        }}
      >
        <h1 style={{ fontSize: 20, color: "#16a34a", marginBottom: 2, fontWeight: 700 }}>
          {storeName} — Relatório por Produto
        </h1>
        <div className="sub" style={{ fontSize: 13, color: "#333", fontWeight: 600, marginTop: 4 }}>
          {titulo}
        </div>
        {subtitulo && (
          <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{subtitulo}</div>
        )}
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Período: {periodo}</div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
          Estoque atual: {Math.round(toNum(p.estoque))}
          {p.precoAtacado != null ? ` · Atacado ${formatCurrency(toNum(p.precoAtacado))}` : ""}
          {p.precoVarejo != null ? ` · Varejo ${formatCurrency(toNum(p.precoVarejo))}` : ""}
        </div>
      </div>

      {(toNum(r.pecasSofia) > 0 || toNum(r.faturamentoSofia) > 0) && (
        <div
          className="legend"
          style={{
            fontSize: 11,
            color: "#6b21a8",
            background: "#faf5ff",
            border: "1px solid #e9d5ff",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 12,
          }}
        >
          Linhas em roxo / badge <strong>SOFIA</strong> são itens Sofia — não confundir com vendas
          normais do estoque.
        </div>
      )}

      <div
        className="kpis"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Kpi label="Pedidos" value={String(Math.round(toNum(r.pedidos)))} />
        <Kpi label="Peças" value={String(Math.round(toNum(r.pecas)))} />
        <Kpi label="Faturamento" value={formatCurrency(toNum(r.faturamento))} />
        <Kpi label="Ticket / peça" value={formatCurrency(toNum(r.ticketPeca))} />
        <Kpi
          label="Peças normais"
          value={`${Math.round(toNum(r.pecasNormais))} · ${formatCurrency(toNum(r.faturamentoNormal))}`}
        />
        <Kpi
          label="Peças Sofia"
          value={`${Math.round(toNum(r.pecasSofia))} · ${formatCurrency(toNum(r.faturamentoSofia))}`}
          sofia
        />
      </div>

      {Array.isArray(p.variantes) && p.variantes.length > 0 && (
        <div className="section" style={{ marginBottom: 18 }}>
          <div
            className="section-title"
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#16a34a",
              marginBottom: 8,
              paddingBottom: 5,
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            Variantes da família
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Código</th>
                <th style={thStyle}>Tamanho</th>
                <th style={thRight}>Estoque</th>
                <th style={thStyle}>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {p.variantes.map((v: any, i: number) => (
                <tr key={i}>
                  <td style={tdStyle}>{v.codigo}</td>
                  <td style={tdStyleCenter}>{v.tamanho || "—"}</td>
                  <td style={tdRight}>{Math.round(toNum(v.estoque))}</td>
                  <td style={tdStyleCenter}>{v.isActive ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(data.porVendedor?.length ?? 0) > 0 && (
        <div className="section" style={{ marginBottom: 18 }}>
          <div
            className="section-title"
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#16a34a",
              marginBottom: 8,
              paddingBottom: 5,
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            Por vendedor
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Vendedor</th>
                <th style={thRight}>Pedidos</th>
                <th style={thRight}>Peças</th>
                <th style={thRight}>Sofia</th>
                <th style={thRight}>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {data.porVendedor.map((s: any, i: number) => (
                <tr key={i}>
                  <td style={tdStyle}>{s.sellerName}</td>
                  <td style={tdRight}>{Math.round(toNum(s.pedidos))}</td>
                  <td style={tdRight}>{Math.round(toNum(s.pecas))}</td>
                  <td style={{ ...tdRight, color: toNum(s.pecasSofia) > 0 ? "#7c3aed" : undefined }}>
                    {Math.round(toNum(s.pecasSofia))}
                  </td>
                  <td style={tdRight}>{formatCurrency(toNum(s.faturamento))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 18,
        }}
      >
        {(data.porCanal?.length ?? 0) > 0 && (
          <div className="section">
            <div
              className="section-title"
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#16a34a",
                marginBottom: 8,
                paddingBottom: 5,
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              Por canal
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Canal</th>
                  <th style={thRight}>Peças</th>
                  <th style={thRight}>Fat.</th>
                </tr>
              </thead>
              <tbody>
                {data.porCanal.map((c: any, i: number) => (
                  <tr key={i}>
                    <td style={tdStyle}>{c.canal}</td>
                    <td style={tdRight}>{Math.round(toNum(c.pecas))}</td>
                    <td style={tdRight}>{formatCurrency(toNum(c.faturamento))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(data.porRegime?.length ?? 0) > 0 && (
          <div className="section">
            <div
              className="section-title"
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#16a34a",
                marginBottom: 8,
                paddingBottom: 5,
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              Por regime
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Regime</th>
                  <th style={thRight}>Peças</th>
                  <th style={thRight}>Fat.</th>
                </tr>
              </thead>
              <tbody>
                {data.porRegime.map((c: any, i: number) => (
                  <tr key={i}>
                    <td style={tdStyle}>{c.regime}</td>
                    <td style={tdRight}>{Math.round(toNum(c.pecas))}</td>
                    <td style={tdRight}>{formatCurrency(toNum(c.faturamento))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(data.porDia?.length ?? 0) > 1 && (
        <div className="section" style={{ marginBottom: 18 }}>
          <div
            className="section-title"
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#16a34a",
              marginBottom: 8,
              paddingBottom: 5,
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            Por dia
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Dia</th>
                <th style={thRight}>Peças</th>
                <th style={thRight}>Sofia</th>
                <th style={thRight}>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {data.porDia.map((d: any, i: number) => (
                <tr key={i}>
                  <td style={tdStyle}>{fmtDia(d.dia)}</td>
                  <td style={tdRight}>{Math.round(toNum(d.pecas))}</td>
                  <td style={{ ...tdRight, color: toNum(d.pecasSofia) > 0 ? "#7c3aed" : undefined }}>
                    {Math.round(toNum(d.pecasSofia))}
                  </td>
                  <td style={tdRight}>{formatCurrency(toNum(d.faturamento))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section" style={{ marginBottom: 8 }}>
        <div
          className="section-title"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#16a34a",
            marginBottom: 8,
            paddingBottom: 5,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          Vendas no período ({data.vendas?.length ?? 0}
          {data.vendasTruncadas ? "+" : ""})
        </div>
        {(data.vendas?.length ?? 0) === 0 ? (
          <div style={{ fontSize: 11, color: "#888" }}>Nenhuma venda deste produto no período.</div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Pedido</th>
                  <th style={thStyle}>SKU</th>
                  <th style={thStyle}>Tam.</th>
                  <th style={thRight}>Qtd</th>
                  <th style={thStyle}>Vendedor</th>
                  <th style={thStyle}>Canal</th>
                  <th style={thRight}>Total</th>
                  <th style={thStyle}>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {data.vendas.map((v: any, i: number) => {
                  const sofia = !!v.isSofia;
                  const rowBg = sofia ? "#faf5ff" : undefined;
                  return (
                    <tr key={i} className={sofia ? "sofia-row" : undefined}>
                      <td style={{ ...tdStyle, background: rowBg }}>{fmtDia(v.dia)}</td>
                      <td style={{ ...tdStyle, background: rowBg }}>{v.pedidoId}</td>
                      <td style={{ ...tdStyle, background: rowBg }}>{v.codigo || "—"}</td>
                      <td style={{ ...tdStyleCenter, background: rowBg }}>{v.tamanho || "—"}</td>
                      <td style={{ ...tdRight, background: rowBg }}>{Math.round(toNum(v.quantidade))}</td>
                      <td style={{ ...tdStyle, background: rowBg }}>{v.sellerName}</td>
                      <td style={{ ...tdStyleCenter, background: rowBg }}>{v.canal}</td>
                      <td style={{ ...tdRight, background: rowBg }}>{formatCurrency(toNum(v.totalItem))}</td>
                      <td style={{ ...tdStyleCenter, background: rowBg }}>
                        {sofia ? (
                          <span
                            className="sofia-badge"
                            style={{
                              display: "inline-block",
                              background: "#7c3aed",
                              color: "#fff",
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: 4,
                            }}
                          >
                            SOFIA
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: "#6b7280" }}>Normal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.vendasTruncadas && (
              <div style={{ fontSize: 10, color: "#999", marginTop: 4 }}>
                Exibindo as primeiras 500 linhas de venda.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Seção genérica de Serviços (CORREIO / CAIXINHA / CARRETO)
// ============================================================
function ServicoSection({
  tipo,
  titulo,
  icone,
  cor,
  bg,
  borda,
  dados,
  showCep,
}: {
  tipo: "CORREIO" | "CAIXINHA" | "CARRETO";
  titulo: string;
  icone: string;
  cor: string;
  bg: string;
  borda: string;
  dados: {
    items: Array<{
      pedidoId: string;
      tipo: string;
      descricao: string | null;
      valor: number;
      cep: string | null;
      sellerName: string;
      clienteNome: string | null;
      clienteTelefone: string | null;
      canal: string | null;
      status: string | null;
      regime: string | null;
      orderCreatedAt: string | null;
      dia: string;
      somenteServico: boolean;
    }>;
    totalLancamentos: number;
    totalValor: number;
    totalPedidos: number;
    totalSomenteServico: number;
  };
  showCep?: boolean;
}) {
  const ticketMedio = dados.totalLancamentos > 0 ? dados.totalValor / dados.totalLancamentos : 0;
  return (
    <div className="section" style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: cor, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>
        {icone} {titulo}
      </div>

      <div style={{ background: bg, border: `1px solid ${borda}`, borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
          <span style={{ color: "#666", fontSize: 11 }}>Lançamentos</span>
          <span style={{ fontWeight: 700, fontSize: 12 }}>{dados.totalLancamentos}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
          <span style={{ color: "#666", fontSize: 11 }}>Pedidos com {titulo.toLowerCase()}</span>
          <span style={{ fontWeight: 700, fontSize: 12 }}>{dados.totalPedidos}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
          <span style={{ color: "#666", fontSize: 11 }}>Pedidos só com serviço (sem itens)</span>
          <span style={{ fontWeight: 700, fontSize: 12 }}>{dados.totalSomenteServico}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
          <span style={{ color: "#666", fontSize: 11 }}>Ticket médio</span>
          <span style={{ fontWeight: 700, fontSize: 12 }}>{formatCurrency(ticketMedio)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
          <span style={{ color: "#666", fontSize: 11 }}>Total Recebido</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: cor }}>{formatCurrency(dados.totalValor)}</span>
        </div>
      </div>

      {dados.items.length === 0 ? (
        <div style={{ fontSize: 11, color: "#9ca3af", padding: "8px 0", fontStyle: "italic" }}>
          Nenhum lançamento de {titulo.toLowerCase()} no período.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={thStyle}>Data/Hora</th>
              <th style={thStyle}>Pedido</th>
              <th style={thStyle}>Vendedor</th>
              <th style={thStyle}>Cliente</th>
              <th style={thStyle}>Telefone</th>
              <th style={thStyle}>Canal</th>
              {showCep && <th style={thStyle}>CEP</th>}
              <th style={thStyle}>Descrição</th>
              <th style={thStyle}>Tipo Pedido</th>
              <th style={thStyle}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {dados.items.map((it, i) => (
              <tr key={i}>
                <td style={tdStyle}>{it.orderCreatedAt ? formatDateTime(it.orderCreatedAt) : "—"}</td>
                <td style={tdStyle}><strong>{it.pedidoId}</strong></td>
                <td style={tdStyle}>{it.sellerName || "—"}</td>
                <td style={tdStyle}>{it.clienteNome || "—"}</td>
                <td style={tdStyle}>{it.clienteTelefone || "—"}</td>
                <td style={tdStyleCenter}>{it.canal || "—"}</td>
                {showCep && <td style={tdStyleCenter}>{it.cep || "—"}</td>}
                <td style={tdStyle}>
                  {it.descricao && it.descricao.trim() ? it.descricao : tipo}
                </td>
                <td style={tdStyleCenter}>
                  {it.somenteServico ? (
                    <span style={{ color: "#7c2d12", background: "#fed7aa", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                      Avulso
                    </span>
                  ) : (
                    <span style={{ color: "#1e40af", background: "#dbeafe", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                      Com produtos
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: cor, textAlign: "right" }}>{formatCurrency(it.valor)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...tdStyle, fontWeight: 700, background: bg }} colSpan={showCep ? 9 : 8}>TOTAL</td>
              <td style={{ ...tdStyle, fontWeight: 700, color: cor, background: bg, textAlign: "right" }}>{formatCurrency(dados.totalValor)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
