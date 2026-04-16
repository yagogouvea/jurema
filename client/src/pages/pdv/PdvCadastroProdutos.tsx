import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import PdvLayout from "./PdvLayout";
import {
  Plus,
  Trash2,
  Upload,
  Package,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  X,
  ArrowRight,
} from "lucide-react";

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface LoteRow {
  id: number;
  tamanho: string;
  quantidade: string;
}

interface FormState {
  codigo: string;       // código base sem sufixo de tamanho
  linha: string;
  modelo: string;
  time: string;
  descricao: string;
  tipo: string;
  atc: string;          // preço atacado (R$)
  varejo: string;       // preço varejo (R$)
  ativo: boolean;
  isSofia: boolean;
  temporada: string;
  ptAtacado: string;
  ptVarejo: string;
  fotoUrl: string;
  fotoBase64?: string;
  fotoMime?: string;
}

const EMPTY_FORM: FormState = {
  codigo: "",
  linha: "",
  modelo: "",
  time: "",
  descricao: "",
  tipo: "",
  atc: "",
  varejo: "",
  ativo: true,
  isSofia: false,
  temporada: "",
  ptAtacado: "",
  ptVarejo: "",
  fotoUrl: "",
};

let nextId = 1;
const newRow = (): LoteRow => ({ id: nextId++, tamanho: "", quantidade: "" });

// ─── Máscara monetária ─────────────────────────────────────────────────────────
function formatMoney(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoney(masked: string): number {
  return parseFloat(masked.replace(/\./g, "").replace(",", ".")) || 0;
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function PdvCadastroProdutos() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [lote, setLote] = useState<LoteRow[]>([newRow()]);
  const [showExtra, setShowExtra] = useState(false);
  const [showFoto, setShowFoto] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ tamanho: string; codigo: string }[] | null>(null);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  // ─── Mutation ─────────────────────────────────────────────────────────────────
  const createBatch = trpc.pdvProducts.createBatch.useMutation({
    onSuccess: (data) => {
      setLastCreated(data.created);
      toast.success(`${data.created.length} variante(s) cadastrada(s) e sincronizadas com a planilha.`);
      setForm(prev => ({
        ...EMPTY_FORM,
        linha: prev.linha,
        tipo: prev.tipo,
        atc: prev.atc,
        varejo: prev.varejo,
        isSofia: prev.isSofia,
        temporada: prev.temporada,
      }));
      setLote([newRow()]);
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao cadastrar produtos");
    },
  });

  // ─── Lote handlers ────────────────────────────────────────────────────────────
  const addRow = () => setLote(prev => [...prev, newRow()]);

  const removeRow = (id: number) => {
    setLote(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  };

  const updateRow = (id: number, field: keyof LoteRow, value: string) => {
    setLote(prev => prev.map(r => r.id === id ? { ...r, [field]: field === "tamanho" ? value.toUpperCase() : value } : r));
  };

  // ─── Foto handler ─────────────────────────────────────────────────────────────
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Foto muito grande. Máximo 5MB."); return; }
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setForm(prev => ({ ...prev, fotoUrl: dataUrl, fotoBase64: base64, fotoMime: file.type }));
      setUploadingPhoto(false);
    };
    reader.readAsDataURL(file);
  };

  // ─── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!form.time.trim()) { toast.error("Informe o Time / Nome do produto"); return; }

    const tamanhos = lote
      .filter(r => r.tamanho.trim() && r.quantidade.trim())
      .map(r => ({
        tamanho: r.tamanho.trim().toUpperCase(),
        estoque: parseInt(r.quantidade) || 0,
      }));

    if (tamanhos.length === 0) {
      toast.error("Adicione pelo menos um tamanho com quantidade");
      return;
    }

    createBatch.mutate({
      linha: form.linha.trim().toUpperCase() || "GERAL",
      modelo: form.modelo.trim().toUpperCase() || "PADRAO",
      time: form.time.trim().toUpperCase(),
      descricao: form.descricao.trim() || undefined,
      tipo: form.tipo.trim().toUpperCase() || "CAMISETA",
      precoAtacado: parseMoney(form.atc),
      precoVarejo: parseMoney(form.varejo),
      ptAtacado: parseFloat(form.ptAtacado) || 0,
      ptVarejo: parseFloat(form.ptVarejo) || 0,
      isSofia: form.isSofia,
      temporada: form.temporada.trim() || undefined,
      codigoBase: form.codigo.trim().toUpperCase() || undefined,
      fotoUrl: form.fotoUrl.startsWith("http") ? form.fotoUrl : undefined,
      tamanhos,
      syncSheet: true,
    });
  };

  // ─── Prévia dos códigos ───────────────────────────────────────────────────────
  const validRows = lote.filter(r => r.tamanho.trim());
  const codigoBase = form.codigo.trim().toUpperCase();

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <PdvLayout>
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="max-w-2xl mx-auto px-4 py-6 pb-24">

          {/* ── Header ── */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center shadow-lg shadow-green-700/20">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Cadastro de Produtos</h1>
              <p className="text-sm text-gray-400">Preencha os dados e adicione os tamanhos em lote</p>
            </div>
          </div>

          {/* ── Resultado do último cadastro ── */}
          {lastCreated && (
            <div className="bg-green-950/40 border border-green-800/50 rounded-xl p-4 mb-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-green-300 font-medium text-sm">
                  {lastCreated.length} variante(s) cadastrada(s) e sincronizadas com a planilha
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {lastCreated.map(p => (
                  <Badge key={p.tamanho} variant="outline" className="text-xs border-green-700/60 text-green-300 font-mono">
                    {p.codigo || p.tamanho}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              SEÇÃO 1 — DADOS DO PRODUTO
          ══════════════════════════════════════════════════════════════ */}
          <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-[#1e1e1e]">
              <h2 className="font-semibold text-gray-100 text-sm uppercase tracking-wider">
                1 · Dados do Produto
              </h2>
            </div>
            <div className="px-5 py-4 space-y-4">

              {/* CÓDIGO */}
              <div>
                <Label className="text-gray-300 text-sm font-medium">Código Base</Label>
                <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
                  Sem o sufixo de tamanho. Ex: <span className="font-mono text-gray-400">CA-T-TO-ALH-VERM</span>
                  {codigoBase && validRows.length > 0 && (
                    <span className="ml-2 text-green-400">
                      → <span className="font-mono">{codigoBase}-{validRows[0].tamanho || "TAM"}</span>
                    </span>
                  )}
                </p>
                <Input
                  value={form.codigo}
                  onChange={e => set("codigo", e.target.value)}
                  placeholder="Ex: CA-T-TO-ALH-VERM"
                  className="bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 font-mono focus:border-green-600"
                />
              </div>

              {/* LINHA + MODELO */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300 text-sm font-medium">Linha</Label>
                  <Input
                    value={form.linha}
                    onChange={e => set("linha", e.target.value)}
                    placeholder="Ex: TAILANDESA"
                    className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-sm font-medium">Modelo</Label>
                  <Input
                    value={form.modelo}
                    onChange={e => set("modelo", e.target.value)}
                    placeholder="Ex: TORCEDOR"
                    className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                  />
                </div>
              </div>

              {/* TIME */}
              <div>
                <Label className="text-gray-300 text-sm font-medium">
                  Time / Nome do Produto <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={form.time}
                  onChange={e => set("time", e.target.value)}
                  placeholder="Ex: AL HALY, BRASIL, FLAMENGO..."
                  className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                />
              </div>

              {/* DESCRIÇÃO */}
              <div>
                <Label className="text-gray-300 text-sm font-medium">Descrição</Label>
                <Input
                  value={form.descricao}
                  onChange={e => set("descricao", e.target.value)}
                  placeholder="Ex: VERMELHA GOLA COM LISTRA FINA PRETA"
                  className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                />
              </div>

              {/* TIPO */}
              <div>
                <Label className="text-gray-300 text-sm font-medium">Tipo</Label>
                <Input
                  value={form.tipo}
                  onChange={e => set("tipo", e.target.value)}
                  placeholder="Ex: CAMISETA, CONJUNTO, SHORTS..."
                  className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                />
              </div>

              {/* ATC + VAR */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300 text-sm font-medium">ATC (Atacado)</Label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                    <Input
                      value={form.atc}
                      onChange={e => set("atc", formatMoney(e.target.value))}
                      placeholder="0,00"
                      className="pl-9 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-gray-300 text-sm font-medium">VAR (Varejo)</Label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                    <Input
                      value={form.varejo}
                      onChange={e => set("varejo", formatMoney(e.target.value))}
                      placeholder="0,00"
                      className="pl-9 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>

              {/* PONTOS ATACADO + VAREJO */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300 text-sm font-medium">PT Atacado</Label>
                  <Input
                    type="number"
                    value={form.ptAtacado}
                    onChange={e => set("ptAtacado", e.target.value)}
                    placeholder="0"
                    className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-sm font-medium">PT Varejo</Label>
                  <Input
                    type="number"
                    value={form.ptVarejo}
                    onChange={e => set("ptVarejo", e.target.value)}
                    placeholder="0"
                    className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                    inputMode="numeric"
                  />
                </div>
              </div>

              {/* ATIVO + SOFIA */}
              <div className="flex gap-3">
                {/* Ativo */}
                <div className={`flex-1 flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  form.ativo ? "bg-green-950/30 border-green-800/50" : "bg-[#1a1a1a] border-[#2e2e2e]"
                }`}>
                  <div>
                    <p className="text-sm font-medium text-gray-200">Ativo</p>
                    <p className="text-xs text-gray-500">Visível no catálogo</p>
                  </div>
                  <Switch
                    checked={form.ativo}
                    onCheckedChange={v => set("ativo", v)}
                    className="data-[state=checked]:bg-green-600"
                  />
                </div>
                {/* Sofia */}
                <div className={`flex-1 flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  form.isSofia ? "bg-purple-950/30 border-purple-800/50" : "bg-[#1a1a1a] border-[#2e2e2e]"
                }`}>
                  <div>
                    <p className="text-sm font-medium text-gray-200">Sofia</p>
                    <p className="text-xs text-gray-500">Terceirizado</p>
                  </div>
                  <Switch
                    checked={form.isSofia}
                    onCheckedChange={v => set("isSofia", v)}
                    className="data-[state=checked]:bg-purple-600"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════
              SEÇÃO 2 — ADICIONAR EM LOTE
          ══════════════════════════════════════════════════════════════ */}
          <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-[#1e1e1e] flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-100 text-sm uppercase tracking-wider">
                  2 · Tamanhos e Quantidades
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  O código será completado automaticamente com o tamanho
                </p>
              </div>
              {lote.filter(r => r.tamanho && r.quantidade).length > 0 && (
                <Badge className="bg-green-900/50 text-green-300 border-green-800/60 text-xs">
                  {lote.filter(r => r.tamanho && r.quantidade).length} tam ·{" "}
                  {lote.filter(r => r.tamanho && r.quantidade).reduce((s, r) => s + (parseInt(r.quantidade) || 0), 0)} un
                </Badge>
              )}
            </div>

            <div className="px-5 py-4 space-y-2">
              {/* Cabeçalho das colunas */}
              <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-1 mb-1">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Tamanho</span>
                <span className="text-xs text-gray-500 uppercase tracking-wider">Quantidade</span>
                <span className="text-xs text-gray-500 uppercase tracking-wider w-24 text-center">Código gerado</span>
                <span className="w-8" />
              </div>

              {/* Linhas de lote */}
              {lote.map((row, idx) => {
                const codGerado = codigoBase && row.tamanho
                  ? `${codigoBase}-${row.tamanho}`
                  : row.tamanho
                    ? `—-${row.tamanho}`
                    : "—";
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center group"
                  >
                    {/* Tamanho */}
                    <Input
                      value={row.tamanho}
                      onChange={e => updateRow(row.id, "tamanho", e.target.value)}
                      placeholder="Ex: M, G, XL"
                      className="bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600 font-mono uppercase h-10"
                      autoFocus={idx === lote.length - 1 && idx > 0}
                    />
                    {/* Quantidade */}
                    <Input
                      value={row.quantidade}
                      onChange={e => updateRow(row.id, "quantidade", e.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                      className="bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600 h-10"
                      inputMode="numeric"
                    />
                    {/* Código gerado */}
                    <div className="w-24 text-center">
                      <span className={`text-xs font-mono px-2 py-1 rounded-lg ${
                        row.tamanho
                          ? "bg-green-950/40 text-green-400 border border-green-800/40"
                          : "text-gray-600"
                      }`}>
                        {row.tamanho ? (codigoBase ? `${codigoBase}-${row.tamanho}` : row.tamanho) : "—"}
                      </span>
                    </div>
                    {/* Remover */}
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={lote.length === 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              {/* Botão adicionar linha */}
              <button
                type="button"
                onClick={addRow}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[#2e2e2e] text-gray-500 hover:border-green-700 hover:text-green-400 hover:bg-green-950/10 transition-all text-sm"
              >
                <Plus className="w-4 h-4" />
                Adicionar tamanho
              </button>

              {/* Prévia dos códigos que serão gerados */}
              {validRows.length > 0 && codigoBase && (
                <div className="mt-3 p-3 bg-[#0f0f0f] rounded-xl border border-[#1e1e1e]">
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Códigos que serão gerados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {validRows.map(r => (
                      <span key={r.id} className="text-xs font-mono bg-[#1a1a1a] border border-[#2e2e2e] text-gray-300 px-2 py-0.5 rounded-md">
                        {codigoBase}-{r.tamanho}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════
              SEÇÃO 3 — FOTO (COMPACTA / EXPANSÍVEL)
          ══════════════════════════════════════════════════════════════ */}
          <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-4">
            <button
              type="button"
              onClick={() => setShowFoto(!showFoto)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#1a1a1a] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  form.fotoUrl ? "bg-green-900/50" : "bg-[#1e1e1e]"
                }`}>
                  {form.fotoUrl ? (
                    <img src={form.fotoUrl} alt="preview" className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-gray-500" />
                  )}
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-100">Foto do Produto</span>
                  {form.fotoUrl ? (
                    <span className="ml-2 text-xs text-green-400">✓ Foto selecionada</span>
                  ) : (
                    <span className="ml-2 text-xs text-gray-500">Opcional</span>
                  )}
                </div>
              </div>
              {showFoto ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showFoto && (
              <div className="px-5 pb-5 space-y-3 border-t border-[#1e1e1e] pt-4">
                <p className="text-xs text-gray-500">
                  A foto será aplicada a todas as variantes de tamanho deste modelo.
                </p>
                <div className="flex gap-4 items-start">
                  {/* Preview */}
                  <div className="relative w-24 h-24 rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] overflow-hidden shrink-0">
                    {form.fotoUrl ? (
                      <>
                        <img src={form.fotoUrl} alt="preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => set("fotoUrl", "")}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center hover:bg-red-900/80 transition-colors"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                        <ImageIcon className="w-6 h-6 text-gray-600" />
                        <span className="text-xs text-gray-600">Sem foto</span>
                      </div>
                    )}
                  </div>

                  {/* Botões */}
                  <div className="flex-1 space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="w-full border-[#2e2e2e] text-gray-300 hover:bg-[#1e1e1e] hover:border-green-700 hover:text-green-300"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingPhoto ? "Carregando..." : "Selecionar arquivo"}
                    </Button>
                    <p className="text-xs text-gray-600">JPG, PNG ou WEBP · máx. 5MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════════════════════════════
              SEÇÃO 4 — CAMPOS EXTRAS (TEMPORADA, PONTOS) — COLAPSÁVEL
          ══════════════════════════════════════════════════════════════ */}
          <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-6">
            <button
              type="button"
              onClick={() => setShowExtra(!showExtra)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#1a1a1a] transition-colors"
            >
              <span className="text-sm font-semibold text-gray-100">Campos Adicionais</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Temporada</span>
                {showExtra ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </button>

            {showExtra && (
              <div className="px-5 pb-5 space-y-4 border-t border-[#1e1e1e] pt-4">
                <div>
                  <Label className="text-gray-300 text-sm font-medium">Temporada</Label>
                  <Input
                    value={form.temporada}
                    onChange={e => set("temporada", e.target.value)}
                    placeholder="Ex: 2024/25"
                    className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                  />
                </div>
              </div>
            )}
          </section>

          {/* ── Botão Salvar ── */}
          <Button
            onClick={handleSubmit}
            disabled={createBatch.isPending}
            className="w-full h-12 bg-green-700 hover:bg-green-600 text-white font-semibold text-base rounded-xl shadow-lg shadow-green-900/30 transition-all"
          >
            {createBatch.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Cadastrando e sincronizando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Cadastrar Produto(s)
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>

        </div>
      </div>
    </PdvLayout>
  );
}
