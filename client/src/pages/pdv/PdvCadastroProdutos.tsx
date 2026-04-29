import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import PdvLayout from "./PdvLayout";
import { ProductPhotoAvatar, ProductPhotoLightbox } from "@/components/ProductPhotoLightbox";
import {
  Plus,
  Trash2,
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
  RefreshCw,
} from "lucide-react";

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface LoteRow {
  id: number;
  tamanho: string;
  quantidade: string;
  codigoGerado: string;   // código gerado automaticamente
  codigoEditado: string;  // código editado manualmente (vazio = usa gerado)
  modoEdicao: boolean;    // se o usuário está editando o código manualmente
  duplicado: boolean | null; // null=não verificado, true=duplicado, false=livre
  verificando: boolean;
}

interface FormState {
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
  custo: string;
  fotoUrl: string;
}

interface EditingRow {
  id: number;
  codigo: string;
  linha: string;
  time: string;
  modelo: string;
  tamanho: string;
  estoque: string;
  precoAtacado: string;
  precoVarejo: string;
  custo: string;
}

const EMPTY_FORM: FormState = {
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
  custo: "",
  fotoUrl: "",
};

let nextId = 1;
const newRow = (): LoteRow => ({
  id: nextId++,
  tamanho: "",
  quantidade: "",
  codigoGerado: "",
  codigoEditado: "",
  modoEdicao: false,
  duplicado: null,
  verificando: false,
});

// ─── Geração de código automático ─────────────────────────────────────────────
const LINHA_MAP: Record<string, string> = {
  'TAILANDESA': 'TA',
  'NACIONAL': 'NA',
  'TORCEDOR': 'TO',
  'PECA': 'PE',
};
const MODELO_MAP: Record<string, string> = {
  'JOGADOR': 'JG',
  'TORCEDOR': 'TO',
  'TAILANDESA': 'TA',
  'DRYFIT': 'DR',
  'VENDEDOR': 'VE',
  'CONJ.ADULTO': 'CO',
  'CONJ ADULTO': 'CO',
  'CONJUNTO ADULTO': 'CO',
  'CONJ.INFANTIL': 'CI',
  'CONJ INFANTIL': 'CI',
  'CONJUNTO INFANTIL': 'CI',
  'FEMININO': 'FE',
  'FEMI': 'FE',
  'MASCULINO': 'MA',
  'INFANTIL': 'IN',
  'REGATA': 'RG',
  'AGASALHO': 'AG',
  'SHORTS': 'SH',
  'CALCA': 'CL',
  'CALÇA': 'CL',
  'BERMUDA': 'BM',
  'MOLETOM': 'ML',
  'JAQUETA': 'JQ',
  'BLUSA': 'BL',
  'CAMISA': 'CM',
  'CAMISETA': 'CT',
  'POLO': 'PL',
  'MEIAS': 'ME',
  'BONE': 'BO',
  'BONÉ': 'BO',
  'MOCHILA': 'MO',
  'CHUTEIRA': 'CH',
};
const STOPWORDS = new Set(['COM', 'DE', 'DA', 'DO', 'NO', 'NA', 'E', 'A', 'O', 'EM', 'AO', 'AS', 'OS', 'UM', 'UMA']);

function removeAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function slugifyCode(s: string): string {
  if (!s) return '';
  let r = removeAcentos(s.trim().toUpperCase());
  r = r.replace(/[^A-Z0-9 \-]/g, '');
  r = r.replace(/\s+/g, '-');
  r = r.replace(/-+/g, '-');
  return r.replace(/^-|-$/g, '');
}
function abreviarCampo(s: string, mapa: Record<string, string>, n: number): string {
  if (!s) return '';
  const chave = s.trim().toUpperCase();
  if (mapa[chave]) return mapa[chave];
  return slugifyCode(chave).slice(0, n);
}
function palavrasSignificativas(desc: string): string[] {
  const s = removeAcentos(desc.toUpperCase());
  const palavras = s.match(/[A-Z0-9]+/g) || [];
  const sig = palavras.filter(p => !STOPWORDS.has(p));
  return sig.length > 0 ? sig : palavras;
}
function abreviarDesc(desc: string, nPalavras = 2, timeParaFiltrar = ''): string {
  if (!desc) return '';
  const sig = palavrasSignificativas(desc);
  // Filtrar palavras já presentes no time para evitar repetição no código
  // Ex: time='SAO PAULO', desc='SAO PAULO BRANCO' → filtrar SAO/PAULO → restam 'BRAN'
  let filtradas = sig;
  if (timeParaFiltrar) {
    const palavrasTime = new Set(palavrasSignificativas(timeParaFiltrar));
    filtradas = sig.filter(p => !palavrasTime.has(p));
    if (filtradas.length === 0) filtradas = sig;
  }
  return filtradas.slice(0, nPalavras).map(p => p.slice(0, 4)).join('-');
}
function gerarCodigo(linha: string, time: string, modelo: string, tamanho: string, descricao = ''): string {
  const partes: string[] = [];
  const l = abreviarCampo(linha, LINHA_MAP, 2); if (l) partes.push(l);
  const m = abreviarCampo(modelo, MODELO_MAP, 2); if (m) partes.push(m);
  const t = abreviarCampo(time, {}, 3); if (t) partes.push(t);
  // Passar o time como filtro para evitar repetição de palavras na descrição
  // Usar apenas 1 palavra da descrição por padrão para códigos mais curtos
  const d = abreviarDesc(descricao, 1, time); if (d) partes.push(d);
  const tam = slugifyCode(tamanho); if (tam) partes.push(tam);
  return partes.join('-');
}

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
  const [activeTab, setActiveTab] = useState<"cadastrar" | "listar">("cadastrar");

  // ── Estado do formulário de cadastro ──
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [lote, setLote] = useState<LoteRow[]>([newRow()]);
  const [showExtra, setShowExtra] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ tamanho: string; codigo: string }[] | null>(null);

  // ── Estado da listagem ──
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterLinha, setFilterLinha] = useState("");
  const [filterTime, setFilterTime] = useState("");
  const [page, setPage] = useState(1);
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // ── Lightbox de foto ──
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const productsQuery = trpc.pdvProducts.list.useQuery(
    { search: search || undefined, linha: filterLinha || undefined, time: filterTime || undefined, page, limit: PAGE_SIZE },
    { enabled: activeTab === "listar" }
  );

  const linhasQuery = trpc.pdvProducts.getLinhas.useQuery(undefined, { enabled: activeTab === "listar" });
  const timesQuery = trpc.pdvProducts.getTimes.useQuery(
    { linha: filterLinha || undefined },
    { enabled: activeTab === "listar" }
  );
  const linhasDisponiveis: string[] = (linhasQuery.data as any) ?? [];
  const timesDisponiveis: string[] = (timesQuery.data as any) ?? [];
  const utils = trpc.useUtils();

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
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao cadastrar produtos");
    },
  });

  const deleteProduct = trpc.pdvProducts.deleteProduct.useMutation({
    onSuccess: (data) => {
      toast.success(`Produto ${data.codigo} removido do sistema e da planilha`);
      setDeletingId(null);
      setConfirmDeleteId(null);
      productsQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao deletar produto");
      setDeletingId(null);
      setConfirmDeleteId(null);
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

  // ─── Regenerar códigos ao mudar campos base ───────────────────────────────────
  useEffect(() => {
    setLote(prev => prev.map(row => {
      // Só regenera se não está em modo edição manual
      if (row.modoEdicao) return row;
      const novo = gerarCodigo(form.linha, form.time, form.modelo, row.tamanho, form.descricao);
      if (novo === row.codigoGerado) return row;
      return { ...row, codigoGerado: novo, duplicado: null, verificando: false };
    }));
  }, [form.linha, form.time, form.modelo, form.descricao]);

  // ─── Verificar duplicidade de um código no banco ──────────────────────────────
  const verificarCodigo = useCallback(async (rowId: number, codigo: string) => {
    if (!codigo || codigo.length < 3) {
      setLote(prev => prev.map(r => r.id === rowId ? { ...r, duplicado: null, verificando: false } : r));
      return;
    }
    setLote(prev => prev.map(r => r.id === rowId ? { ...r, verificando: true } : r));
    try {
      const result = await utils.pdvProducts.checkExactCode.fetch({ codigo: codigo.trim().toUpperCase() });
      setLote(prev => prev.map(r => r.id === rowId ? { ...r, duplicado: result.exists, verificando: false } : r));
    } catch {
      setLote(prev => prev.map(r => r.id === rowId ? { ...r, verificando: false } : r));
    }
  }, [utils]);

  // ─── Lote handlers ────────────────────────────────────────────────────────────
  const addRow = () => setLote(prev => [...prev, newRow()]);

  const removeRow = (id: number) => {
    setLote(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  };

  const updateTamanho = (id: number, tamanho: string) => {
    const tam = tamanho.toUpperCase();
    setLote(prev => prev.map(r => {
      if (r.id !== id) return r;
      const novo = gerarCodigo(form.linha, form.time, form.modelo, tam, form.descricao);
      return { ...r, tamanho: tam, codigoGerado: novo, duplicado: null, verificando: false };
    }));
    // Verificar duplicidade após debounce
    const timer = setTimeout(() => {
      const row = lote.find(r => r.id === id);
      const cod = row?.modoEdicao ? row.codigoEditado : gerarCodigo(form.linha, form.time, form.modelo, tam, form.descricao);
      if (cod) verificarCodigo(id, cod);
    }, 600);
    return () => clearTimeout(timer);
  };

  const updateQuantidade = (id: number, quantidade: string) => {
    setLote(prev => prev.map(r => r.id === id ? { ...r, quantidade: quantidade.replace(/\D/g, "") } : r));
  };

  const updateCodigoManual = (id: number, codigo: string) => {
    const cod = codigo.toUpperCase();
    setLote(prev => prev.map(r => r.id === id ? { ...r, codigoEditado: cod, duplicado: null } : r));
  };

  const toggleModoEdicao = (id: number) => {
    setLote(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (r.modoEdicao) {
        // Sair do modo edição: restaurar código gerado
        return { ...r, modoEdicao: false, codigoEditado: "", duplicado: null };
      } else {
        // Entrar no modo edição: pré-preencher com o código gerado
        return { ...r, modoEdicao: true, codigoEditado: r.codigoGerado };
      }
    }));
  };

  const confirmarCodigoManual = (id: number) => {
    const row = lote.find(r => r.id === id);
    if (!row) return;
    verificarCodigo(id, row.codigoEditado);
  };

  // ─── Submit cadastro ──────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!form.time.trim()) { toast.error("Informe o Time / Nome do produto"); return; }

    const tamanhos = lote
      .filter(r => r.tamanho.trim() && r.quantidade.trim())
      .map(r => {
        const cod = r.modoEdicao ? r.codigoEditado : r.codigoGerado;
        return {
          tamanho: r.tamanho.trim().toUpperCase(),
          estoque: parseInt(r.quantidade) || 0,
          codigoCompleto: cod || undefined,
        };
      });

    if (tamanhos.length === 0) { toast.error("Adicione pelo menos um tamanho com quantidade"); return; }

    // Verificar se há duplicados não resolvidos
    const comDuplicado = lote.filter(r => r.tamanho.trim() && r.quantidade.trim() && r.duplicado === true);
    if (comDuplicado.length > 0) {
      toast.error(`${comDuplicado.length} código(s) já cadastrado(s). Edite os códigos duplicados antes de salvar.`);
      return;
    }

    // Verificar se há tamanhos sem código
    const semCodigo = tamanhos.filter(t => !t.codigoCompleto);
    if (semCodigo.length > 0) {
      toast.error("Preencha o Time para gerar os códigos automaticamente");
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
      custo: parseMoney(form.custo),
      isSofia: form.isSofia,
      temporada: form.temporada.trim() || undefined,
      fotoUrl: form.fotoUrl.startsWith("http") ? form.fotoUrl : undefined,
      tamanhos,
      syncSheet: true,
    });
  };

  // ─── Edição modal ─────────────────────────────────────────────────────────────
  const startEdit = (prod: any) => {
    setEditingRow({
      id: prod.id,
      codigo: prod.codigo ?? "",
      linha: prod.linha ?? "",
      time: prod.time ?? "",
      modelo: prod.modelo ?? "",
      tamanho: prod.tamanho ?? "",
      estoque: String(prod.estoque ?? 0),
      precoAtacado: formatMoney(String(Math.round((prod.precoAtacado ?? 0) * 100))),
      precoVarejo: formatMoney(String(Math.round((prod.precoVarejo ?? 0) * 100))),
      custo: formatMoney(String(Math.round((prod.custo ?? 0) * 100))),
    });
  };

  const saveEdit = () => {
    if (!editingRow) return;
    setSavingId(editingRow.id);
    updateProduct.mutate({
      id: editingRow.id,
      linha: editingRow.linha as any,
      modelo: editingRow.modelo as any,
      time: editingRow.time || undefined,
      estoque: parseInt(editingRow.estoque) || 0,
      precoAtacado: parseMoney(editingRow.precoAtacado),
      precoVarejo: parseMoney(editingRow.precoVarejo),
      custo: parseMoney(editingRow.custo),
      syncSheet: true,
    });
  };

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
                  <p className="text-xs text-gray-500 mt-0.5">
                    O código será gerado automaticamente: <span className="font-mono text-gray-400">LINHA-TIME-MODELO-TAMANHO</span>
                  </p>
                </div>
                <div className="px-5 py-4 space-y-4">

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

                  {/* CUSTO */}
                  <div>
                    <Label className="text-gray-300 text-sm font-medium">Custo (R$)</Label>
                    <Input
                      value={form.custo}
                      onChange={e => set("custo", formatMoney(e.target.value))}
                      placeholder="0,00"
                      inputMode="numeric"
                      className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-yellow-600"
                    />
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

              {/* ── SEÇÃO 2 — TAMANHOS E QUANTIDADES ── */}
              <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-[#1e1e1e] flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-100 text-sm uppercase tracking-wider">
                      2 · Tamanhos e Quantidades
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      O código é gerado automaticamente. Clique no lápis para editar manualmente.
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

                <div className="px-5 py-4 space-y-3">
                  {lote.map((row) => {
                    const codigoAtivo = row.modoEdicao ? row.codigoEditado : row.codigoGerado;
                    const temTamanho = row.tamanho.trim().length > 0;

                    return (
                      <div key={row.id} className="space-y-1.5">
                        {/* Linha 1: Tamanho + Quantidade + Botão remover */}
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                          <Input
                            value={row.tamanho}
                            onChange={e => updateTamanho(row.id, e.target.value)}
                            onBlur={() => {
                              const cod = row.modoEdicao ? row.codigoEditado : row.codigoGerado;
                              if (cod) verificarCodigo(row.id, cod);
                            }}
                            placeholder="TAM (ex: M, G, 42)"
                            className="bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600 h-9 text-sm font-mono"
                          />
                          <Input
                            value={row.quantidade}
                            onChange={e => updateQuantidade(row.id, e.target.value)}
                            placeholder="Qtd"
                            inputMode="numeric"
                            className="bg-[#1a1a1a] border-[#2e2e2e] text-white placeholder:text-gray-600 focus:border-green-600 h-9 text-sm"
                          />
                          <button
                            onClick={() => removeRow(row.id)}
                            className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-950/20"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Linha 2: Código gerado/editável */}
                        {temTamanho && (
                          <div className="flex items-center gap-2 pl-0">
                            {row.modoEdicao ? (
                              // Modo edição manual
                              <div className="flex-1 flex items-center gap-1.5">
                                <Input
                                  value={row.codigoEditado}
                                  onChange={e => updateCodigoManual(row.id, e.target.value)}
                                  onBlur={() => confirmarCodigoManual(row.id)}
                                  placeholder="Código personalizado"
                                  className="h-8 text-xs font-mono bg-[#1e1e1e] border-amber-700/50 text-amber-300 placeholder:text-gray-600 focus:border-amber-500"
                                  autoFocus
                                />
                                <button
                                  onClick={() => toggleModoEdicao(row.id)}
                                  title="Restaurar código gerado automaticamente"
                                  className="shrink-0 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-green-400 rounded-lg hover:bg-green-950/20 transition-colors"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              // Modo visualização (código gerado)
                              <div className="flex-1 flex items-center gap-1.5">
                                <span className={`flex-1 text-xs font-mono px-2 py-1 rounded-lg border ${
                                  codigoAtivo
                                    ? "bg-[#1a1a1a] border-[#2e2e2e] text-green-400"
                                    : "bg-[#1a1a1a] border-[#2e2e2e] text-gray-600"
                                }`}>
                                  {codigoAtivo || "— preencha o Time para gerar o código —"}
                                </span>
                                {codigoAtivo && (
                                  <button
                                    onClick={() => toggleModoEdicao(row.id)}
                                    title="Editar código manualmente"
                                    className="shrink-0 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-amber-400 rounded-lg hover:bg-amber-950/20 transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Status de verificação */}
                            {row.verificando && (
                              <span className="shrink-0 w-5 h-5 border-2 border-gray-600 border-t-green-500 rounded-full animate-spin" />
                            )}
                            {!row.verificando && row.duplicado === true && (
                              <div className="flex items-center gap-1 text-red-400 text-xs shrink-0">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>Já cadastrado</span>
                              </div>
                            )}
                            {!row.verificando && row.duplicado === false && codigoAtivo && (
                              <div className="flex items-center gap-1 text-green-500 text-xs shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Disponível</span>
                              </div>
                            )}
                          </div>
                        )}
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
              </section>

              {/* ── SEÇÃO 3 — FOTO (informativo) ── */}
              <section className="bg-[#141414] border border-[#252525] rounded-2xl overflow-hidden mb-4">
                <div className="flex items-center gap-3 px-5 py-4">
                  <ImageIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-100">Foto do Produto</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Adicione a foto após o cadastro em{" "}
                      <a href="/pdv/gestao-site" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                        Gestão do Site
                      </a>
                      {" "}— ela ficará disponível no site e no PDV automaticamente.
                    </p>
                  </div>
                </div>
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
              {/* Barra de busca + filtros */}
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex gap-2">
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
                  {(search || filterLinha || filterTime) && (
                    <Button
                      variant="outline"
                      onClick={() => { setSearch(""); setSearchInput(""); setFilterLinha(""); setFilterTime(""); setPage(1); }}
                      className="border-[#252525] text-gray-400 hover:bg-[#1a1a1a] px-3"
                      title="Limpar todos os filtros"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {/* Filtros por Linha e Time */}
                <div className="flex gap-2">
                  <select
                    value={filterLinha}
                    onChange={e => { setFilterLinha(e.target.value); setFilterTime(""); setPage(1); }}
                    className="flex-1 bg-[#141414] border border-[#252525] text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-green-600"
                  >
                    <option key="all-linhas" value="">Todas as linhas</option>
                    {linhasDisponiveis.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <select
                    value={filterTime}
                    onChange={e => { setFilterTime(e.target.value); setPage(1); }}
                    className="flex-1 bg-[#141414] border border-[#252525] text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-green-600"
                  >
                    <option key="all-times" value="">Todos os times</option>
                    {timesDisponiveis.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
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
                    <div className="hidden md:grid grid-cols-[24px_2fr_1fr_1fr_0.8fr_0.8fr_0.8fr_auto] gap-3 px-4 py-3 border-b border-[#1e1e1e] text-xs text-gray-500 font-medium uppercase tracking-wide">
                      <span />
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
                          className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#1a1a1a] transition-colors"
                        >
                          {/* Mobile layout */}
                          <div className="md:hidden px-4 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <div className="shrink-0 mt-0.5">
                                  <ProductPhotoAvatar
                                    fotoUrl={prod.fotoUrl}
                                    productName={`${prod.time}${prod.modelo ? ` ${prod.modelo}` : ""}`}
                                    size={28}
                                    onOpenLightbox={(src, name) => setLightbox({ src, name })}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-white truncate">
                                    {prod.time} {prod.modelo && `· ${prod.modelo}`}
                                  </p>
                                  <p className="text-xs text-gray-500 font-mono mt-0.5">{prod.codigo} · Tam: {prod.tamanho}</p>
                                  <div className="flex items-center gap-3 mt-1 text-xs">
                                    <span className={`font-medium ${prod.estoque > 0 ? "text-green-400" : "text-red-400"}`}>Estoque: {prod.estoque}</span>
                                    <span className="text-gray-400">ATC: R$ {Number(prod.precoAtacado).toFixed(2)}</span>
                                    <span className="text-gray-400">VAR: R$ {Number(prod.precoVarejo).toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => startEdit(prod)}
                                className="shrink-0 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-green-400 rounded-lg hover:bg-green-950/20 transition-colors"
                                title="Editar produto"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Desktop layout */}
                          <div className="hidden md:grid grid-cols-[24px_2fr_1fr_1fr_0.8fr_0.8fr_0.8fr_auto] gap-3 px-4 py-3 items-center">
                            <ProductPhotoAvatar
                              fotoUrl={prod.fotoUrl}
                              productName={`${prod.time}${prod.modelo ? ` ${prod.modelo}` : ""}`}
                              size={24}
                              onOpenLightbox={(src, name) => setLightbox({ src, name })}
                            />
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
                            <span className={`text-sm font-medium ${prod.estoque > 0 ? "text-green-400" : "text-red-400"}`}>{prod.estoque}</span>
                            <span className="text-sm text-gray-300">R$ {Number(prod.precoAtacado).toFixed(2)}</span>
                            <span className="text-sm text-gray-300">R$ {Number(prod.precoVarejo).toFixed(2)}</span>
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => startEdit(prod)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-green-400 rounded-lg hover:bg-green-950/20 transition-colors" title="Editar produto">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
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

      {/* ─── Modal de Edição de Produto ─────────────────────────────────────── */}
      {editingRow && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-[#252525] rounded-2xl w-full max-w-sm shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e]">
              <div className="min-w-0">
                <h3 className="text-white font-semibold text-base truncate">
                  {editingRow.time}{editingRow.modelo ? ` · ${editingRow.modelo}` : ""}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  {editingRow.codigo} &middot; Tam: {editingRow.tamanho}
                </p>
              </div>
              <button
                onClick={() => setEditingRow(null)}
                className="shrink-0 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white rounded-lg hover:bg-[#252525] transition-colors ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Campos */}
            <div className="px-5 py-4 space-y-3">
              {/* Linha + Modelo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Linha</Label>
                  <select
                    value={editingRow.linha}
                    onChange={e => setEditingRow(prev => prev ? { ...prev, linha: e.target.value } : null)}
                    className="mt-1.5 w-full bg-[#1a1a1a] border border-[#2e2e2e] text-white rounded-lg px-3 h-10 text-sm focus:outline-none focus:border-green-600"
                  >
                    <option value="">-- Linha --</option>
                    <option value="TAILANDESA">TAILANDESA</option>
                    <option value="NACIONAL">NACIONAL</option>
                    <option value="TORCEDOR">TORCEDOR</option>
                    <option value="PECA">PECA</option>
                  </select>
                </div>
                <div>
                  <Label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Modelo</Label>
                  <select
                    value={editingRow.modelo}
                    onChange={e => setEditingRow(prev => prev ? { ...prev, modelo: e.target.value } : null)}
                    className="mt-1.5 w-full bg-[#1a1a1a] border border-[#2e2e2e] text-white rounded-lg px-3 h-10 text-sm focus:outline-none focus:border-green-600"
                  >
                    <option value="">-- Modelo --</option>
                    <option value="TORCEDOR">TORCEDOR</option>
                    <option value="JOGADOR">JOGADOR</option>
                    <option value="TAILANDESA">TAILANDESA</option>
                    <option value="VENDEDOR">VENDEDOR</option>
                  </select>
                </div>
              </div>

              {/* Time */}
              <div>
                <Label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Time</Label>
                <Input
                  value={editingRow.time}
                  onChange={e => setEditingRow(prev => prev ? { ...prev, time: e.target.value.toUpperCase() } : null)}
                  className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white focus:border-green-600 h-10 text-base"
                  placeholder="Ex: BRASIL, FLAMENGO..."
                />
              </div>

              {/* Estoque */}
              <div>
                <Label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Estoque</Label>
                <Input
                  value={editingRow.estoque}
                  onChange={e => setEditingRow(prev => prev ? { ...prev, estoque: e.target.value.replace(/\D/g, "") } : null)}
                  className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white focus:border-green-600 h-10 text-base"
                  inputMode="numeric"
                  placeholder="0"
                  autoFocus
                />
              </div>

              {/* Preços */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Preço Atacado</Label>
                  <Input
                    value={editingRow.precoAtacado}
                    onChange={e => setEditingRow(prev => prev ? { ...prev, precoAtacado: formatMoney(e.target.value) } : null)}
                    className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white focus:border-green-600 h-10 text-base"
                    inputMode="numeric"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Preço Varejo</Label>
                  <Input
                    value={editingRow.precoVarejo}
                    onChange={e => setEditingRow(prev => prev ? { ...prev, precoVarejo: formatMoney(e.target.value) } : null)}
                    className="mt-1.5 bg-[#1a1a1a] border-[#2e2e2e] text-white focus:border-green-600 h-10 text-base"
                    inputMode="numeric"
                    placeholder="0,00"
                  />
                </div>
              </div>

              {/* Custo */}
              <div>
                <Label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Custo</Label>
                <Input
                  value={editingRow.custo}
                  onChange={e => setEditingRow(prev => prev ? { ...prev, custo: formatMoney(e.target.value) } : null)}
                  className="mt-1.5 bg-[#1a1a1a] border-yellow-900/50 text-white focus:border-yellow-600 h-10 text-base"
                  inputMode="numeric"
                  placeholder="0,00"
                />
              </div>
            </div>

            {/* Ações */}
            <div className="px-5 pb-5 space-y-2">
              {/* Salvar */}
              <Button
                onClick={saveEdit}
                disabled={savingId === editingRow.id}
                className="w-full bg-green-700 hover:bg-green-600 text-white h-11 font-semibold"
              >
                {savingId === editingRow.id ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><Save className="w-4 h-4 mr-2" />Salvar Alterações</>
                )}
              </Button>

              {/* Excluir */}
              {confirmDeleteId === editingRow.id ? (
                <div className="flex gap-2">
                  <Button
                    onClick={() => { setDeletingId(editingRow.id); deleteProduct.mutate({ id: editingRow.id }); }}
                    disabled={deletingId === editingRow.id}
                    className="flex-1 bg-red-800 hover:bg-red-700 text-white h-10 font-semibold"
                  >
                    {deletingId === editingRow.id ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><Trash2 className="w-4 h-4 mr-2" />Confirmar Exclusão</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-4 border-[#2e2e2e] text-gray-400 hover:bg-[#1a1a1a] h-10"
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setConfirmDeleteId(editingRow.id)}
                  className="w-full border-red-900/50 text-red-500 hover:bg-red-950/30 hover:text-red-400 hover:border-red-800/50 h-10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir Produto
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox de foto */}
      {lightbox && (
        <ProductPhotoLightbox
          src={lightbox.src}
          productName={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}
    </PdvLayout>
  );
}
