import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Upload,
  Package,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
} from "lucide-react";

// ─── Tamanhos padrão disponíveis ───────────────────────────────────────────────
const TAMANHOS_PADRAO = ["PP", "P", "M", "G", "GG", "XG", "XL", "2XL", "3XL", "4XL", "5XL"];
const LINHAS = ["TAILANDESA", "NACIONAL", "TORCEDOR", "PECA", "SOFIA"];
const TIPOS = ["CAMISETA", "CONJUNTO", "SHORTS", "OUTRO"];

interface TamanhoEntry {
  tamanho: string;
  estoque: number;
  precoAtacado?: number;
  precoVarejo?: number;
  customPrice: boolean;
}

interface FormState {
  linha: string;
  modelo: string;
  time: string;
  descricao: string;
  tipo: string;
  precoAtacado: string;
  precoVarejo: string;
  ptAtacado: string;
  ptVarejo: string;
  isSofia: boolean;
  temporada: string;
  codigoBase: string;
  tamanhos: TamanhoEntry[];
  fotoUrl: string;
}

const EMPTY_FORM: FormState = {
  linha: "TAILANDESA",
  modelo: "TORCEDOR",
  time: "",
  descricao: "",
  tipo: "CAMISETA",
  precoAtacado: "",
  precoVarejo: "",
  ptAtacado: "",
  ptVarejo: "",
  isSofia: false,
  temporada: "",
  codigoBase: "",
  tamanhos: [],
  fotoUrl: "",
};

export default function PdvCadastroProdutos() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [customTamanho, setCustomTamanho] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ tamanho: string; codigo: string }[] | null>(null);

  // ─── Mutations ────────────────────────────────────────────────────────────────
  const createBatch = trpc.pdvProducts.createBatch.useMutation({
    onSuccess: (data) => {
      setLastCreated(data.created);
      toast.success(`${data.created.length} variante(s) criadas e sincronizadas com a planilha.`);
      // Resetar form mantendo linha/tipo/preços para facilitar cadastro em série
      setForm(prev => ({
        ...EMPTY_FORM,
        linha: prev.linha,
        tipo: prev.tipo,
        precoAtacado: prev.precoAtacado,
        precoVarejo: prev.precoVarejo,
        ptAtacado: prev.ptAtacado,
        ptVarejo: prev.ptVarejo,
        isSofia: prev.isSofia,
        temporada: prev.temporada,
      }));
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao cadastrar produtos");
    },
  });

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const toggleTamanho = (tam: string) => {
    setForm(prev => {
      const exists = prev.tamanhos.find(t => t.tamanho === tam);
      if (exists) {
        return { ...prev, tamanhos: prev.tamanhos.filter(t => t.tamanho !== tam) };
      }
      return {
        ...prev,
        tamanhos: [...prev.tamanhos, { tamanho: tam, estoque: 0, customPrice: false }],
      };
    });
  };

  const addCustomTamanho = () => {
    const tam = customTamanho.trim().toUpperCase();
    if (!tam) return;
    if (form.tamanhos.find(t => t.tamanho === tam)) {
      toast.error("Tamanho já adicionado");
      return;
    }
    setForm(prev => ({
      ...prev,
      tamanhos: [...prev.tamanhos, { tamanho: tam, estoque: 0, customPrice: false }],
    }));
    setCustomTamanho("");
  };

  const updateTamanho = (tam: string, field: keyof TamanhoEntry, value: any) => {
    setForm(prev => ({
      ...prev,
      tamanhos: prev.tamanhos.map(t => t.tamanho === tam ? { ...t, [field]: value } : t),
    }));
  };

  const removeTamanho = (tam: string) => {
    setForm(prev => ({ ...prev, tamanhos: prev.tamanhos.filter(t => t.tamanho !== tam) }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Foto muito grande. Máximo 2MB.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        // Armazenar base64 temporariamente para enviar junto com o produto
        setForm(prev => ({ ...prev, _photoBase64: base64, _photoMime: file.type } as any));
        // Mostrar preview
        setForm(prev => ({ ...prev, fotoUrl: ev.target?.result as string }));
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingPhoto(false);
      toast.error("Erro ao processar foto");
    }
  };

  const handleSubmit = () => {
    if (!form.time.trim()) {
      toast.error("Informe o time/nome do produto");
      return;
    }
    if (form.tamanhos.length === 0) {
      toast.error("Selecione pelo menos um tamanho");
      return;
    }

    createBatch.mutate({
      linha: form.linha,
      modelo: form.modelo,
      time: form.time.trim().toUpperCase(),
      descricao: form.descricao.trim() || undefined,
      tipo: form.tipo,
      precoAtacado: parseFloat(form.precoAtacado) || 0,
      precoVarejo: parseFloat(form.precoVarejo) || 0,
      ptAtacado: parseFloat(form.ptAtacado) || 0,
      ptVarejo: parseFloat(form.ptVarejo) || 0,
      isSofia: form.isSofia,
      temporada: form.temporada.trim() || undefined,
      codigoBase: form.codigoBase.trim().toUpperCase() || undefined,
      fotoUrl: form.fotoUrl.startsWith("http") ? form.fotoUrl : undefined,
      tamanhos: form.tamanhos.map(t => ({
        tamanho: t.tamanho,
        estoque: t.estoque,
        precoAtacado: t.customPrice ? t.precoAtacado : undefined,
        precoVarejo: t.customPrice ? t.precoVarejo : undefined,
      })),
      syncSheet: true,
    });
  };

  const totalEstoque = form.tamanhos.reduce((s, t) => s + t.estoque, 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Package className="w-6 h-6 text-green-400" />
        <div>
          <h1 className="text-xl font-bold">Cadastro de Produtos</h1>
          <p className="text-sm text-gray-400">Adicione produtos em lote por tamanho</p>
        </div>
      </div>

      {/* Resultado do último cadastro */}
      {lastCreated && (
        <Card className="bg-green-950/40 border-green-800/50 mb-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-green-300 font-medium text-sm">
                {lastCreated.length} produto(s) cadastrado(s) e sincronizados com a planilha
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {lastCreated.map(p => (
                <Badge key={p.tamanho} variant="outline" className="text-xs border-green-700 text-green-300">
                  {p.codigo || p.tamanho}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4 max-w-2xl mx-auto">
        {/* ── Dados principais ── */}
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-200">Dados do Produto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Time */}
            <div>
              <Label className="text-gray-300 text-sm">Time / Nome do Produto *</Label>
              <Input
                value={form.time}
                onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
                placeholder="Ex: AL HALY, BRASIL, FLAMENGO..."
                className="mt-1 bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600"
              />
            </div>

            {/* Linha + Tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-sm">Linha *</Label>
                <select
                  value={form.linha}
                  onChange={e => setForm(p => ({ ...p, linha: e.target.value }))}
                  className="mt-1 w-full bg-[#1a1a1a] border border-[#333] text-white rounded-md px-3 py-2 text-sm"
                >
                  {LINHAS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Tipo *</Label>
                <select
                  value={form.tipo}
                  onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                  className="mt-1 w-full bg-[#1a1a1a] border border-[#333] text-white rounded-md px-3 py-2 text-sm"
                >
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Modelo */}
            <div>
              <Label className="text-gray-300 text-sm">Modelo</Label>
              <Input
                value={form.modelo}
                onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))}
                placeholder="Ex: TORCEDOR, JOGADOR..."
                className="mt-1 bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600"
              />
            </div>

            {/* Descrição */}
            <div>
              <Label className="text-gray-300 text-sm">Descrição</Label>
              <Input
                value={form.descricao}
                onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex: VERMELHA GOLA COM LISTRA FINA PRETA"
                className="mt-1 bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600"
              />
            </div>

            {/* Preços */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-sm">Preço Atacado (R$)</Label>
                <Input
                  type="number"
                  value={form.precoAtacado}
                  onChange={e => setForm(p => ({ ...p, precoAtacado: e.target.value }))}
                  placeholder="0,00"
                  className="mt-1 bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600"
                />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Preço Varejo (R$)</Label>
                <Input
                  type="number"
                  value={form.precoVarejo}
                  onChange={e => setForm(p => ({ ...p, precoVarejo: e.target.value }))}
                  placeholder="0,00"
                  className="mt-1 bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600"
                />
              </div>
            </div>

            {/* Sofia toggle */}
            <div className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
              <div>
                <p className="text-sm font-medium text-gray-200">Produto Sofia</p>
                <p className="text-xs text-gray-500">Produto terceirizado — comissão especial</p>
              </div>
              <Switch
                checked={form.isSofia}
                onCheckedChange={v => setForm(p => ({ ...p, isSofia: v }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Tamanhos e Estoque ── */}
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-gray-200">Tamanhos e Estoque</CardTitle>
              {form.tamanhos.length > 0 && (
                <Badge className="bg-green-900/50 text-green-300 border-green-800">
                  {form.tamanhos.length} tam · {totalEstoque} un
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Seleção rápida de tamanhos */}
            <div>
              <Label className="text-gray-300 text-sm mb-2 block">Selecionar tamanhos *</Label>
              <div className="flex flex-wrap gap-2">
                {TAMANHOS_PADRAO.map(tam => {
                  const selected = !!form.tamanhos.find(t => t.tamanho === tam);
                  return (
                    <button
                      key={tam}
                      type="button"
                      onClick={() => toggleTamanho(tam)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        selected
                          ? "bg-green-600 border-green-500 text-white"
                          : "bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-green-700 hover:text-green-300"
                      }`}
                    >
                      {tam}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tamanho customizado */}
            <div className="flex gap-2">
              <Input
                value={customTamanho}
                onChange={e => setCustomTamanho(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustomTamanho()}
                placeholder="Outro tamanho (ex: 6XL)"
                className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addCustomTamanho}
                className="border-[#333] text-gray-300 hover:bg-[#2a2a2a]"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Lista de tamanhos selecionados com estoque */}
            {form.tamanhos.length > 0 && (
              <div className="space-y-2">
                <Label className="text-gray-400 text-xs uppercase tracking-wider">Estoque por tamanho</Label>
                {form.tamanhos.map(t => (
                  <div key={t.tamanho} className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-3">
                    <div className="flex items-center gap-3">
                      <span className="w-12 text-center font-bold text-green-400 text-sm">{t.tamanho}</span>
                      <div className="flex-1">
                        <Label className="text-gray-400 text-xs">Estoque</Label>
                        <Input
                          type="number"
                          min={0}
                          value={t.estoque}
                          onChange={e => updateTamanho(t.tamanho, "estoque", parseInt(e.target.value) || 0)}
                          className="mt-0.5 h-8 bg-[#0a0a0a] border-[#333] text-white text-sm"
                        />
                      </div>
                      {/* Preço customizado por tamanho */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateTamanho(t.tamanho, "customPrice", !t.customPrice)}
                          className={`text-xs px-2 py-1 rounded border transition-all ${
                            t.customPrice
                              ? "bg-yellow-900/30 border-yellow-700 text-yellow-400"
                              : "border-[#333] text-gray-500 hover:border-yellow-700"
                          }`}
                          title="Preço diferente para este tamanho"
                        >
                          R$±
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTamanho(t.tamanho)}
                          className="text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {/* Preços customizados por tamanho */}
                    {t.customPrice && (
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#2a2a2a]">
                        <div>
                          <Label className="text-gray-400 text-xs">Atacado R$</Label>
                          <Input
                            type="number"
                            value={t.precoAtacado ?? ""}
                            onChange={e => updateTamanho(t.tamanho, "precoAtacado", parseFloat(e.target.value) || 0)}
                            placeholder={form.precoAtacado || "0"}
                            className="h-8 bg-[#0a0a0a] border-[#333] text-white text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-gray-400 text-xs">Varejo R$</Label>
                          <Input
                            type="number"
                            value={t.precoVarejo ?? ""}
                            onChange={e => updateTamanho(t.tamanho, "precoVarejo", parseFloat(e.target.value) || 0)}
                            placeholder={form.precoVarejo || "0"}
                            className="h-8 bg-[#0a0a0a] border-[#333] text-white text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Campos avançados (código, foto, temporada, pontos) ── */}
        <Card className="bg-[#141414] border-[#2a2a2a]">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className="text-base font-semibold text-gray-200">Campos Avançados</span>
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {showAdvanced && (
            <CardContent className="space-y-4 pt-0">
              {/* Código base */}
              <div>
                <Label className="text-gray-300 text-sm">Código Base</Label>
                <p className="text-xs text-gray-500 mb-1">
                  O sistema completa com o tamanho. Ex: CA-T-TO-ALH-VERM → CA-T-TO-ALH-VERM-M
                </p>
                <Input
                  value={form.codigoBase}
                  onChange={e => setForm(p => ({ ...p, codigoBase: e.target.value }))}
                  placeholder="Ex: CA-T-TO-ALH-VERM"
                  className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600 font-mono text-sm"
                />
                {form.codigoBase && form.tamanhos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {form.tamanhos.map(t => (
                      <Badge key={t.tamanho} variant="outline" className="text-xs font-mono border-[#444] text-gray-400">
                        {form.codigoBase.toUpperCase()}-{t.tamanho}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Temporada */}
              <div>
                <Label className="text-gray-300 text-sm">Temporada</Label>
                <Input
                  value={form.temporada}
                  onChange={e => setForm(p => ({ ...p, temporada: e.target.value }))}
                  placeholder="Ex: 2024/25"
                  className="mt-1 bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600"
                />
              </div>

              {/* Pontos */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300 text-sm">PT Atacado</Label>
                  <Input
                    type="number"
                    value={form.ptAtacado}
                    onChange={e => setForm(p => ({ ...p, ptAtacado: e.target.value }))}
                    placeholder="0"
                    className="mt-1 bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-sm">PT Varejo</Label>
                  <Input
                    type="number"
                    value={form.ptVarejo}
                    onChange={e => setForm(p => ({ ...p, ptVarejo: e.target.value }))}
                    placeholder="0"
                    className="mt-1 bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600"
                  />
                </div>
              </div>

              {/* Foto do produto */}
              <div>
                <Label className="text-gray-300 text-sm">Foto do Produto</Label>
                <p className="text-xs text-gray-500 mb-2">
                  A foto será aplicada a todas as variantes de tamanho deste modelo.
                </p>
                <div className="flex gap-3 items-start">
                  {/* Preview */}
                  <div className="w-20 h-20 rounded-lg border border-[#333] bg-[#1a1a1a] flex items-center justify-center overflow-hidden flex-shrink-0">
                    {form.fotoUrl ? (
                      <img src={form.fotoUrl} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="w-full border-[#333] text-gray-300 hover:bg-[#2a2a2a]"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingPhoto ? "Processando..." : "Selecionar foto"}
                    </Button>
                    <Input
                      value={form.fotoUrl.startsWith("data:") ? "" : form.fotoUrl}
                      onChange={e => setForm(p => ({ ...p, fotoUrl: e.target.value }))}
                      placeholder="Ou cole a URL da imagem"
                      className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600 text-xs"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </div>
                </div>
                {form.fotoUrl && (
                  <p className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    A foto será salva no banco. Para aparecer no catálogo, configure a exibição posteriormente.
                  </p>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* ── Resumo e Submit ── */}
        {form.tamanhos.length > 0 && (
          <Card className="bg-[#1a2a1a] border-green-900/50">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-green-300 mb-2">Resumo do Cadastro</h3>
              <div className="space-y-1 text-sm text-gray-300">
                <div className="flex justify-between">
                  <span>Produto:</span>
                  <span className="font-medium">{form.time || "—"} · {form.linha}</span>
                </div>
                <div className="flex justify-between">
                  <span>Variantes:</span>
                  <span className="font-medium">{form.tamanhos.length} tamanho(s)</span>
                </div>
                <div className="flex justify-between">
                  <span>Estoque total:</span>
                  <span className="font-medium">{totalEstoque} unidades</span>
                </div>
                <div className="flex justify-between">
                  <span>Preço atacado:</span>
                  <span className="font-medium">R$ {parseFloat(form.precoAtacado || "0").toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Preço varejo:</span>
                  <span className="font-medium">R$ {parseFloat(form.precoVarejo || "0").toFixed(2)}</span>
                </div>
                {form.isSofia && (
                  <div className="flex justify-between">
                    <span>Tipo:</span>
                    <span className="text-purple-400 font-medium">Sofia (terceirizado)</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          onClick={handleSubmit}
          disabled={createBatch.isPending || !form.time || form.tamanhos.length === 0}
          className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
        >
          {createBatch.isPending ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Cadastrando e sincronizando...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Cadastrar {form.tamanhos.length > 0 ? `${form.tamanhos.length} variante(s)` : "produto"}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
