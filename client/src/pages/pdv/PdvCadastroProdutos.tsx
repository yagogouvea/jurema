import { useState, useCallback, useRef, useEffect } from "react";
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
  Search,
  Edit2,
  Save,
  AlertCircle,
  List,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface LoteRow {
  id: number;
  tamanho: string;
  quantidade: string;
}

interface FormState {
  codigo: string;
  linha: string;
  modelo: string;
  time: string;
  descricao: string;
  tipo: string;
  atc: string;
  varejo: string;
  ativo: boolean;
  isSofia: boolean;
  temporada: string;
  ptAtacado: string;
  ptVarejo: string;
  fotoUrl: string;
  fotoBase64?: string;
  fotoMime?: string;
}

interface EditingRow {
  id: number;
  estoque: string;
  precoAtacado: string;
  precoVarejo: string;
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

const PAGE_SIZE = 20;

// ─── Componente principal ──────────────────────────────────────────────────────
export default function PdvCadastroProdutos() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"cadastrar" | "listar">("cadastrar");

  // ── Estado do formulário de cadastro ──
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [lote, setLote] = useState<LoteRow[]>([newRow()]);
  const [showExtra, setShowExtra] = useState(false);
  const [showFoto, setShowFoto] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ tamanho: string; codigo: string }[] | null>(null);
  const [codeCheck, setCodeCheck] = useState<{ exists: boolean; count: number; tamanhos: string[] } | null>(null);
  const [codeCheckTimer, setCodeCheckTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // ── Estado da listagem ──
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  // ─── Queries ──────────────────────────────────────────────────────────────────
  const productsQuery = trpc.pdvProducts.list.useQuery(
    { search: search || undefined, page, limit: PAGE_SIZE },
    { enabled: activeTab === "listar" }
  );

  const checkCodeQuery = trpc.pdvProducts.checkCodeExists.useQuery(
    { codigoBase: form.codigo.trim().toUpperCase() },
    {
      enabled: false, // só dispara manualmente
    }
  );

  // ─── Mutations ────────────────────────────────────────────────────────────────
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
      setCodeCheck(null);
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao cadastrar produtos");
    },
  });

  const updateProduct = trpc.pdvProducts.updateProduct.useMutation({
    onSuccess: () => {
      toast.success("Produto atualizado com sucesso");
      setEditingRow(null);
      setSavingId(null);
      productsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao atualizar produto");
      setSavingId(null);
    },
  });

  // ─── Validação de código duplicado (debounce) ─────────────────────────────────
  useEffect(() => {
    const base = form.codigo.trim().toUpperCase();
    if (!base || base.length < 3) {
      setCodeCheck(null);
      return;
    }
    if (codeCheckTimer) clearTimeout(codeCheckTimer);
    const timer = setTimeout(async () => {
      try {
        const result = await checkCodeQuery.refetch();
        if (result.data) setCodeCheck(result.data);
      } catch {
        // silencioso
      }
    }, 600);
    setCodeCheckTimer(timer);
    return () => clearTimeout(timer);
  }, [form.codigo]);

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

  // ─── Submit cadastro ──────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!form.time.trim()) { toast.error("Informe o Time / Nome do produto"); return; }
    const tamanhos = lote
      .filter(r => r.tamanho.trim() && r.quantidade.trim())
      .map(r => ({ tamanho: r.tamanho.trim().toUpperCase(), estoque: parseInt(r.quantidade) || 0 }));
    if (tamanhos.length === 0) { toast.error("Adicione pelo menos um tamanho com quantidade"); return; }

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

  // ─── Edição inline ────────────────────────────────────────────────────────────
  const startEdit = (prod: any) => {
    setEditingRow({
      id: prod.id,
      estoque: String(prod.estoque ?? 0),
      precoAtacado: String(prod.precoAtacado ?? 0),
      precoVarejo: String(prod.precoVarejo ?? 0),
    });
  };

  const saveEdit = () => {
    if (!editingRow) return;
    setSavingId(editingRow.id);
    updateProduct.mutate({
      id: editingRow.id,
      estoque: parseInt(editingRow.estoque) || 0,
      precoAtacado: parseFloat(editingRow.precoAtacado) || 0,
      precoVarejo: parseFloat(editingRow.precoVarejo) || 0,
      syncSheet: true,
    });
  };

  // ─── Prévia dos códigos ───────────────────────────────────────────────────────
  const validRows = lote.filter(r => r.tamanho.trim());
  const codigoBase = form.codigo.trim().toUpperCase();

  const products = (productsQuery.data as any)?.products ?? [];
  const totalCount = (productsQuery.data as any)?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <PdvLayout>
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="max-w-4xl mx-auto px-4 py-6 pb-24">

          {/* ── Header ── */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center shadow-lg shadow-green-700/20">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Produtos</h1>
              <p className="text-sm text-gray-400">Cadastre ou gerencie os produtos do PDV</p>
            </div>
          </div>

          {/* ── Abas ── */}
          <div className="flex gap-1 bg-[#141414] border border-[#252525] rounded-xl p-1 mb-6">
            <button
              onClick={() => setActiveTab("cadastrar")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "cadastrar"
                  ? "bg-green-700 text-white shadow-lg shadow-green-900/30"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              Cadastrar Produto
            </button>
            <button
              onClick={() => { setActiveTab("listar"); setPage(1); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "listar"
                  ? "bg-green-700 text-white shadow-lg shadow-green-900/30"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <List className="w-4 h-4" />
              Produtos Cadastrados
              {totalCount > 0 && activeTab === "listar" && (
                <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">{totalCount}</span>
              )}
            </button>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              ABA 1 — CADASTRAR PRODUTO
          ════════════════════════════════════════════════════════════════ */}
          {activeTab === "cadastrar" && (
            <>
              {/* Resultado do último cadastro */}
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

              {/* ── SEÇÃO 1 — DADOS DO PRODUTO ── */}
              <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-[#1e1e1e]">
                  <h2 className="font-semibold text-gray-100 text-sm uppercase tracking-wider">
                    1 · Dados do Produto
                  </h2>
                </div>
                <div className="px-5 py-4 space-y-4">

                  {/* CÓDIGO */}
                  <div>
                    <Label className="text-gray-300 text-sm font-medium">
                      Código Base <span className="text-gray-500 font-normal">(sem sufixo de tamanho)</span>
                    </Label>
                    <Input
                      value={form.codigo}
                      onChange={e => set("codigo", e.target.value.toUpperCase())}
                      placeholder="Ex: CA-T-TO-ALH-VERM"
                      className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600 font-mono"
                    />
                    {/* Aviso de código duplicado */}
                    {codeCheck && codeCheck.exists && (
                      <div className="mt-2 flex items-start gap-2 bg-amber-950/40 border border-amber-700/50 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-amber-300 text-xs font-medium">
                            Código já existe no sistema ({codeCheck.count} variante{codeCheck.count > 1 ? "s" : ""})
                          </p>
                          <p className="text-amber-400/70 text-xs mt-0.5">
                            Tamanhos: {codeCheck.tamanhos.join(", ")}
                          </p>
                        </div>
                      </div>
                    )}
                    {codeCheck && !codeCheck.exists && form.codigo.trim().length >= 3 && (
                      <p className="mt-1.5 text-green-500 text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Código disponível
                      </p>
                    )}
                  </div>

                  {/* LINHA + MODELO */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-gray-300 text-sm font-medium">Linha</Label>
                      <Input
                        value={form.linha}
                        onChange={e => set("linha", e.target.value)}
                        placeholder="Ex: Tailandesa"
                        className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm font-medium">Modelo</Label>
                      <Input
                        value={form.modelo}
                        onChange={e => set("modelo", e.target.value)}
                        placeholder="Ex: AL HALY"
                        className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                      />
                    </div>
                  </div>

                  {/* TIME */}
                  <div>
                    <Label className="text-gray-300 text-sm font-medium">
                      Time / Nome <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      value={form.time}
                      onChange={e => set("time", e.target.value)}
                      placeholder="Ex: FLAMENGO, BRASIL, REAL MADRID"
                      className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                    />
                  </div>

                  {/* DESCRIÇÃO */}
                  <div>
                    <Label className="text-gray-300 text-sm font-medium">Descrição</Label>
                    <Input
                      value={form.descricao}
                      onChange={e => set("descricao", e.target.value)}
                      placeholder="Ex: VERMELHA MANGA LONGA"
                      className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                    />
                  </div>

                  {/* TIPO */}
                  <div>
                    <Label className="text-gray-300 text-sm font-medium">Tipo</Label>
                    <Input
                      value={form.tipo}
                      onChange={e => set("tipo", e.target.value)}
                      placeholder="Ex: CAMISETA, SHORT, AGASALHO"
                      className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                    />
                  </div>

                  {/* PREÇOS */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-gray-300 text-sm font-medium">Preço Atacado (R$)</Label>
                      <Input
                        value={form.atc}
                        onChange={e => set("atc", formatMoney(e.target.value))}
                        placeholder="0,00"
                        inputMode="numeric"
                        className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm font-medium">Preço Varejo (R$)</Label>
                      <Input
                        value={form.varejo}
                        onChange={e => set("varejo", formatMoney(e.target.value))}
                        placeholder="0,00"
                        inputMode="numeric"
                        className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600"
                      />
                    </div>
                  </div>

                  {/* PONTOS */}
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

              {/* ── SEÇÃO 2 — ADICIONAR EM LOTE ── */}
              <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-[#1e1e1e] flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-100 text-sm uppercase tracking-wider">
                      2 · Tamanhos e Quantidades
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Cada linha gera uma variante com código completo
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={addRow}
                    size="sm"
                    className="bg-green-800/60 hover:bg-green-700 text-white border-0 rounded-lg gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tamanho
                  </Button>
                </div>

                <div className="px-5 py-4 space-y-2">
                  {/* Cabeçalho da tabela */}
                  <div className="grid grid-cols-[1fr_1fr_auto_2fr] gap-2 px-1 mb-1">
                    <span className="text-xs text-gray-500 font-medium uppercase">TAM</span>
                    <span className="text-xs text-gray-500 font-medium uppercase">QTD</span>
                    <span className="w-8" />
                    <span className="text-xs text-gray-500 font-medium uppercase">Código gerado</span>
                  </div>

                  {lote.map((row) => {
                    const codigoGerado = codigoBase
                      ? `${codigoBase}-${row.tamanho || "?"}`
                      : row.tamanho ? `...-${row.tamanho}` : "—";
                    return (
                      <div key={row.id} className="grid grid-cols-[1fr_1fr_auto_2fr] gap-2 items-center">
                        <Input
                          value={row.tamanho}
                          onChange={e => updateRow(row.id, "tamanho", e.target.value)}
                          placeholder="M"
                          className="bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600 h-9 text-sm font-mono"
                        />
                        <Input
                          value={row.quantidade}
                          onChange={e => updateRow(row.id, "quantidade", e.target.value.replace(/\D/g, ""))}
                          placeholder="0"
                          inputMode="numeric"
                          className="bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600 h-9 text-sm"
                        />
                        <button
                          onClick={() => removeRow(row.id)}
                          className="w-8 h-9 flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-950/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className={`text-xs font-mono truncate ${row.tamanho ? "text-green-400" : "text-gray-600"}`}>
                          {codigoGerado}
                        </span>
                      </div>
                    );
                  })}

                  {/* Botão adicionar linha */}
                  <button
                    onClick={addRow}
                    className="w-full mt-2 py-2.5 border border-dashed border-[#2e2e2e] rounded-xl text-gray-500 hover:text-gray-300 hover:border-green-800/50 transition-all text-sm flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar tamanho
                  </button>
                </div>

                {/* Prévia dos códigos que serão gerados */}
                {validRows.length > 0 && (
                  <div className="px-5 pb-4">
                    <p className="text-xs text-gray-500 mb-2">Variantes que serão criadas:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {validRows.map(r => (
                        <Badge key={r.id} variant="outline" className="text-xs border-green-800/50 text-green-400 font-mono">
                          {codigoBase ? `${codigoBase}-${r.tamanho}` : r.tamanho}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* ── SEÇÃO 3 — FOTO (compacta) ── */}
              <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-4">
                <button
                  onClick={() => setShowFoto(!showFoto)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#1a1a1a] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ImageIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-100">Foto do Produto</span>
                    {form.fotoUrl && (
                      <Badge variant="outline" className="text-xs border-green-700/60 text-green-400">
                        Selecionada
                      </Badge>
                    )}
                  </div>
                  {showFoto ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {showFoto && (
                  <div className="px-5 pb-5 border-t border-[#1e1e1e] pt-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                    {form.fotoUrl ? (
                      <div className="flex items-center gap-4">
                        <img
                          src={form.fotoUrl}
                          alt="Preview"
                          className="w-20 h-20 object-cover rounded-xl border border-[#2e2e2e]"
                        />
                        <div className="flex-1">
                          <p className="text-sm text-gray-300 mb-2">Foto selecionada</p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => fileInputRef.current?.click()}
                              className="border-[#2e2e2e] text-gray-300 hover:bg-[#1a1a1a] text-xs"
                            >
                              Trocar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => set("fotoUrl", "")}
                              className="border-red-800/50 text-red-400 hover:bg-red-950/20 text-xs"
                            >
                              <X className="w-3 h-3 mr-1" /> Remover
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="w-full py-8 border-2 border-dashed border-[#2e2e2e] rounded-xl flex flex-col items-center gap-2 text-gray-500 hover:text-gray-300 hover:border-green-800/50 transition-all"
                      >
                        {uploadingPhoto ? (
                          <span className="w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Upload className="w-6 h-6" />
                        )}
                        <span className="text-sm">{uploadingPhoto ? "Carregando..." : "Clique para selecionar foto"}</span>
                        <span className="text-xs">JPG, PNG ou WEBP · Máx. 5MB</span>
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* ── SEÇÃO 4 — CAMPOS ADICIONAIS ── */}
              <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-6">
                <button
                  onClick={() => setShowExtra(!showExtra)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#1a1a1a] transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-100">Campos Adicionais</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Temporada</span>
                    {showExtra ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
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
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              ABA 2 — PRODUTOS CADASTRADOS
          ════════════════════════════════════════════════════════════════ */}
          {activeTab === "listar" && (
            <>
              {/* Barra de busca */}
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { setSearch(searchInput); setPage(1); }
                    }}
                    placeholder="Buscar por código, time, modelo..."
                    className="pl-9 bg-[#141414] border-[#252525] text-white placeholder:text-gray-600 focus:border-green-600"
                  />
                </div>
                <Button
                  onClick={() => { setSearch(searchInput); setPage(1); }}
                  className="bg-green-700 hover:bg-green-600 text-white px-4"
                >
                  Buscar
                </Button>
                {search && (
                  <Button
                    variant="outline"
                    onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
                    className="border-[#252525] text-gray-400 hover:bg-[#1a1a1a] px-3"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Tabela */}
              <div className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden">
                {productsQuery.isLoading ? (
                  <div className="flex items-center justify-center py-16 text-gray-500">
                    <span className="w-5 h-5 border-2 border-gray-600 border-t-green-500 rounded-full animate-spin mr-3" />
                    Carregando produtos...
                  </div>
                ) : products.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                    <Package className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">Nenhum produto encontrado</p>
                    {search && <p className="text-xs mt-1 text-gray-600">Tente outro termo de busca</p>}
                  </div>
                ) : (
                  <>
                    {/* Cabeçalho */}
                    <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_0.8fr_0.8fr_0.8fr_auto] gap-3 px-4 py-3 border-b border-[#1e1e1e] text-xs text-gray-500 font-medium uppercase tracking-wide">
                      <span>Produto</span>
                      <span>Código</span>
                      <span>Tam</span>
                      <span>Estoque</span>
                      <span>ATC</span>
                      <span>VAR</span>
                      <span className="w-16" />
                    </div>

                    {/* Linhas */}
                    {products.map((prod: any) => {
                      const isEditing = editingRow?.id === prod.id;
                      const isSaving = savingId === prod.id;

                      return (
                        <div
                          key={prod.id}
                          className={`border-b border-[#1a1a1a] last:border-0 transition-colors ${
                            isEditing ? "bg-green-950/10" : "hover:bg-[#1a1a1a]"
                          }`}
                        >
                          {/* Mobile layout */}
                          <div className="md:hidden px-4 py-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                  {prod.time} {prod.modelo && `· ${prod.modelo}`}
                                </p>
                                <p className="text-xs text-gray-500 font-mono mt-0.5">{prod.codigo}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {!prod.isActive && (
                                  <Badge variant="outline" className="text-xs border-red-800/50 text-red-400">Inativo</Badge>
                                )}
                                {prod.isSofia && (
                                  <Badge variant="outline" className="text-xs border-purple-800/50 text-purple-400">Sofia</Badge>
                                )}
                              </div>
                            </div>
                            {isEditing ? (
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Estoque</p>
                                  <Input
                                    value={editingRow?.estoque ?? ""}
                                    onChange={e => setEditingRow(prev => prev ? { ...prev, estoque: e.target.value.replace(/\D/g, "") } : null)}
                                    className="h-8 text-sm bg-[#1a1a1a] border-green-700/50 text-white"
                                    inputMode="numeric"
                                  />
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">ATC</p>
                                  <Input
                                    value={editingRow?.precoAtacado ?? ""}
                                    onChange={e => setEditingRow(prev => prev ? { ...prev, precoAtacado: e.target.value } : null)}
                                    className="h-8 text-sm bg-[#1a1a1a] border-green-700/50 text-white"
                                    inputMode="decimal"
                                  />
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">VAR</p>
                                  <Input
                                    value={editingRow?.precoVarejo ?? ""}
                                    onChange={e => setEditingRow(prev => prev ? { ...prev, precoVarejo: e.target.value } : null)}
                                    className="h-8 text-sm bg-[#1a1a1a] border-green-700/50 text-white"
                                    inputMode="decimal"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-gray-400">Tam: <span className="text-white font-mono">{prod.tamanho}</span></span>
                                <span className="text-gray-400">Estoque: <span className={`font-medium ${prod.estoque > 0 ? "text-green-400" : "text-red-400"}`}>{prod.estoque}</span></span>
                                <span className="text-gray-400">ATC: <span className="text-white">R$ {Number(prod.precoAtacado).toFixed(2)}</span></span>
                              </div>
                            )}
                            <div className="flex gap-2 justify-end">
                              {isEditing ? (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => setEditingRow(null)} className="h-7 text-xs border-[#2e2e2e] text-gray-400">
                                    Cancelar
                                  </Button>
                                  <Button size="sm" onClick={saveEdit} disabled={isSaving} className="h-7 text-xs bg-green-700 hover:bg-green-600 text-white">
                                    {isSaving ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-3 h-3 mr-1" />Salvar</>}
                                  </Button>
                                </>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => startEdit(prod)} className="h-7 text-xs border-[#2e2e2e] text-gray-400 hover:text-white hover:border-green-700/50">
                                  <Edit2 className="w-3 h-3 mr-1" /> Editar
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Desktop layout */}
                          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_0.8fr_0.8fr_0.8fr_auto] gap-3 px-4 py-3 items-center">
                            <div className="min-w-0">
                              <p className="text-sm text-white truncate">
                                {prod.time}{prod.modelo ? ` · ${prod.modelo}` : ""}
                                {prod.descricao ? <span className="text-gray-500 text-xs ml-1">{prod.descricao}</span> : null}
                              </p>
                              <div className="flex gap-1 mt-0.5">
                                {!prod.isActive && <Badge variant="outline" className="text-xs border-red-800/50 text-red-400 h-4 px-1">Inativo</Badge>}
                                {prod.isSofia && <Badge variant="outline" className="text-xs border-purple-800/50 text-purple-400 h-4 px-1">Sofia</Badge>}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 font-mono truncate">{prod.codigo}</span>
                            <span className="text-sm text-gray-300 font-mono">{prod.tamanho}</span>

                            {isEditing ? (
                              <>
                                <Input
                                  value={editingRow?.estoque ?? ""}
                                  onChange={e => setEditingRow(prev => prev ? { ...prev, estoque: e.target.value.replace(/\D/g, "") } : null)}
                                  className="h-8 text-sm bg-[#1a1a1a] border-green-700/50 text-white px-2"
                                  inputMode="numeric"
                                />
                                <Input
                                  value={editingRow?.precoAtacado ?? ""}
                                  onChange={e => setEditingRow(prev => prev ? { ...prev, precoAtacado: e.target.value } : null)}
                                  className="h-8 text-sm bg-[#1a1a1a] border-green-700/50 text-white px-2"
                                  inputMode="decimal"
                                />
                                <Input
                                  value={editingRow?.precoVarejo ?? ""}
                                  onChange={e => setEditingRow(prev => prev ? { ...prev, precoVarejo: e.target.value } : null)}
                                  className="h-8 text-sm bg-[#1a1a1a] border-green-700/50 text-white px-2"
                                  inputMode="decimal"
                                />
                              </>
                            ) : (
                              <>
                                <span className={`text-sm font-medium ${prod.estoque > 0 ? "text-green-400" : "text-red-400"}`}>{prod.estoque}</span>
                                <span className="text-sm text-gray-300">R$ {Number(prod.precoAtacado).toFixed(2)}</span>
                                <span className="text-sm text-gray-300">R$ {Number(prod.precoVarejo).toFixed(2)}</span>
                              </>
                            )}

                            <div className="flex gap-1 w-16 justify-end">
                              {isEditing ? (
                                <>
                                  <button onClick={() => setEditingRow(null)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 rounded-lg hover:bg-[#252525]">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={saveEdit} disabled={isSaving} className="w-7 h-7 flex items-center justify-center text-green-400 hover:text-green-300 rounded-lg hover:bg-green-950/30">
                                    {isSaving ? <span className="w-3 h-3 border border-green-400/30 border-t-green-400 rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => startEdit(prod)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-green-400 rounded-lg hover:bg-green-950/20 transition-colors">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-1">
                  <span className="text-xs text-gray-500">
                    {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} produtos
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="h-8 w-8 p-0 border-[#252525] text-gray-400 hover:bg-[#1a1a1a] disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="h-8 px-3 flex items-center text-sm text-gray-300 bg-[#141414] border border-[#252525] rounded-md">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="h-8 w-8 p-0 border-[#252525] text-gray-400 hover:bg-[#1a1a1a] disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </PdvLayout>
  );
}
