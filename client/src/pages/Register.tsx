import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, MapPin, User, Mail, Phone, Lock, CreditCard } from "lucide-react";

// ─── Helpers de máscara ──────────────────────────────────────────────────────
function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value;
}

function maskCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function maskCEP(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function Register() {
  const [, navigate] = useLocation();
  const { refetch } = useCustomerAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    cpf: "",
    phone: "",
    password: "",
    confirmPassword: "",
    addressZip: "",
    addressStreet: "",
    addressNumber: "",
    addressComplement: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingCEP, setLoadingCEP] = useState(false);

  const register = trpc.customerAuth.register.useMutation({
    onSuccess: () => {
      toast.success("Cadastro realizado com sucesso! Bem-vindo à Jumera Sport!");
      refetch();
      navigate("/");
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao realizar cadastro.");
    },
  });

  function handleChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCEP(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoadingCEP(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          addressStreet: data.logradouro || "",
          addressNeighborhood: data.bairro || "",
          addressCity: data.localidade || "",
          addressState: data.uf || "",
        }));
        toast.success("Endereço preenchido automaticamente!");
      } else {
        toast.error("CEP não encontrado.");
      }
    } catch {
      toast.error("Erro ao buscar CEP.");
    } finally {
      setLoadingCEP(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    register.mutate(form);
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center px-4 py-12">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#C8102E]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#C8102E]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-sport-logo-Xd8RgKFqGxqJNKQzVwNpWf.webp"
              alt="Jumera Sport"
              className="h-16 mx-auto mb-4 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </Link>
          <h1 className="text-3xl font-black text-white tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            CRIAR CONTA
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Cadastre-se para finalizar suas compras</p>
        </div>

        {/* Card do formulário */}
        <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Nome */}
            <div>
              <Label className="text-gray-300 text-sm font-medium mb-1.5 flex items-center gap-2">
                <User size={14} className="text-[#C8102E]" /> Nome Completo
              </Label>
              <Input
                placeholder="Seu nome completo"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
                className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
              />
            </div>

            {/* CPF e Telefone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300 text-sm font-medium mb-1.5 flex items-center gap-2">
                  <CreditCard size={14} className="text-[#C8102E]" /> CPF
                </Label>
                <Input
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={(e) => handleChange("cpf", maskCPF(e.target.value))}
                  required
                  className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
                />
              </div>
              <div>
                <Label className="text-gray-300 text-sm font-medium mb-1.5 flex items-center gap-2">
                  <Phone size={14} className="text-[#C8102E]" /> Telefone
                </Label>
                <Input
                  placeholder="(00) 94729-3221"
                  value={form.phone}
                  onChange={(e) => handleChange("phone", maskPhone(e.target.value))}
                  required
                  className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <Label className="text-gray-300 text-sm font-medium mb-1.5 flex items-center gap-2">
                <Mail size={14} className="text-[#C8102E]" /> E-mail
              </Label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                required
                className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
              />
            </div>

            {/* Endereço */}
            <div className="border-t border-white/10 pt-5">
              <p className="text-gray-400 text-sm font-medium mb-4 flex items-center gap-2">
                <MapPin size={14} className="text-[#C8102E]" /> Endereço de Entrega
              </p>

              {/* CEP */}
              <div className="mb-4">
                <Label className="text-gray-300 text-sm font-medium mb-1.5 block">CEP</Label>
                <div className="relative">
                  <Input
                    placeholder="00000-000"
                    value={form.addressZip}
                    onChange={(e) => {
                      const masked = maskCEP(e.target.value);
                      handleChange("addressZip", masked);
                      if (masked.replace(/\D/g, "").length === 8) handleCEP(masked);
                    }}
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11 pr-10"
                  />
                  {loadingCEP && (
                    <Loader2 size={16} className="absolute right-3 top-3.5 text-[#C8102E] animate-spin" />
                  )}
                </div>
              </div>

              {/* Rua e Número */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="col-span-2">
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">Rua / Logradouro</Label>
                  <Input
                    placeholder="Rua das Flores"
                    value={form.addressStreet}
                    onChange={(e) => handleChange("addressStreet", e.target.value)}
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">Número</Label>
                  <Input
                    placeholder="123"
                    value={form.addressNumber}
                    onChange={(e) => handleChange("addressNumber", e.target.value)}
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
                  />
                </div>
              </div>

              {/* Complemento e Bairro */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">Complemento</Label>
                  <Input
                    placeholder="Apto 42 (opcional)"
                    value={form.addressComplement}
                    onChange={(e) => handleChange("addressComplement", e.target.value)}
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">Bairro</Label>
                  <Input
                    placeholder="Centro"
                    value={form.addressNeighborhood}
                    onChange={(e) => handleChange("addressNeighborhood", e.target.value)}
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
                  />
                </div>
              </div>

              {/* Cidade e Estado */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">Cidade</Label>
                  <Input
                    placeholder="São Paulo"
                    value={form.addressCity}
                    onChange={(e) => handleChange("addressCity", e.target.value)}
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">UF</Label>
                  <Input
                    placeholder="SP"
                    value={form.addressState}
                    onChange={(e) => handleChange("addressState", e.target.value.toUpperCase().slice(0, 2))}
                    className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
                  />
                </div>
              </div>
            </div>

            {/* Senha */}
            <div className="border-t border-white/10 pt-5">
              <p className="text-gray-400 text-sm font-medium mb-4 flex items-center gap-2">
                <Lock size={14} className="text-[#C8102E]" /> Senha de Acesso
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">Senha</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      value={form.password}
                      onChange={(e) => handleChange("password", e.target.value)}
                      required
                      className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-gray-500 hover:text-white"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-gray-300 text-sm font-medium mb-1.5 block">Confirmar Senha</Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repita a senha"
                      value={form.confirmPassword}
                      onChange={(e) => handleChange("confirmPassword", e.target.value)}
                      required
                      className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-3.5 text-gray-500 hover:text-white"
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Botão */}
            <Button
              type="submit"
              disabled={register.isPending}
              className="w-full h-12 bg-[#C8102E] hover:bg-[#a00d24] text-white font-black text-base tracking-widest mt-2"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {register.isPending ? (
                <><Loader2 size={18} className="animate-spin mr-2" /> CRIANDO CONTA...</>
              ) : (
                "CRIAR MINHA CONTA"
              )}
            </Button>

            <p className="text-center text-gray-500 text-sm">
              Já tem uma conta?{" "}
              <Link href="/login" className="text-[#C8102E] hover:text-red-400 font-semibold">
                Fazer login
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
