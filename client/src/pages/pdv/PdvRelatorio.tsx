import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FileText, Download, Calendar, Filter, TrendingUp, Package, Wallet,
  Image as ImageIcon, Loader2, Truck, PiggyBank, Mail
} from "lucide-react";
import PdvLayout from "./PdvLayout";
import { firstOfMonthYmdSaoPaulo, lastOfMonthYmdSaoPaulo } from "@shared/spCalendar";

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

export default function PdvRelatorio() {
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

  const { data, isLoading, refetch } = trpc.pdvRelatorio.getData.useQuery(
    { startDate, endDate, sections },
    { enabled: showPreview }
  );

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
                Comprovantes Sofia ({data.sofia.totalComFoto || 0} com foto · {data.sofia.totalSemFoto || 0} sem foto)
              </div>
              <div className="sofia-gallery" style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}>
                {data.sofia.pedidos.map((p: any) => {
                  const url = absoluteUrl(p.fotoUrl);
                  return (
                    <div key={p.pedidoId} className="sofia-card" style={{
                      border: "1px solid #e9d5ff",
                      borderRadius: 8,
                      padding: 8,
                      background: "#faf5ff",
                      pageBreakInside: "avoid",
                    }}>
                      {url ? (
                        <img
                          src={url}
                          alt={`Pedido ${p.pedidoId}`}
                          crossOrigin="anonymous"
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
                <td style={tdStyle}>{it.descricao || "—"}</td>
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
