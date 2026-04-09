import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, User, Mail, Phone, Lock } from "lucide-react";

// ─── Helpers de máscara ──────────────────────────────────────────────────────
function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value;
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
    phone: "",
    addressZip: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const register = trpc.customerAuth.register.useMutation({
    onSuccess: () => {
      toast.success("Cadastro realizado com sucesso! Bem-vindo à Jurema Sport!");
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (form.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    register.mutate({
      ...form,
      cpf: "",
      addressStreet: "",
      addressNumber: "",
      addressComplement: "",
      addressNeighborhood: "",
      addressCity: "",
      addressState: "",
    });
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center px-4 py-12">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#C8102E]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#C8102E]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-sport-logo-Xd8RgKFqGxqJNKQzVwNpWf.webp"
              alt="Jurema Sport"
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

            {/* Telefone */}
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

            {/* CEP */}
            <div>
              <Label className="text-gray-300 text-sm font-medium mb-1.5 block">CEP</Label>
              <Input
                placeholder="00000-000"
                value={form.addressZip}
                onChange={(e) => {
                  const masked = maskCEP(e.target.value);
                  handleChange("addressZip", masked);
                }}
                required
                className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11"
              />
            </div>

            {/* Senha */}
            <div>
              <Label className="text-gray-300 text-sm font-medium mb-1.5 flex items-center gap-2">
                <Lock size={14} className="text-[#C8102E]" /> Senha
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha"
                  value={form.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  required
                  className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirmação de Senha */}
            <div>
              <Label className="text-gray-300 text-sm font-medium mb-1.5 flex items-center gap-2">
                <Lock size={14} className="text-[#C8102E]" /> Confirmar Senha
              </Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  placeholder="Confirme sua senha"
                  value={form.confirmPassword}
                  onChange={(e) => handleChange("confirmPassword", e.target.value)}
                  required
                  className="bg-[#0D0D0D] border-white/20 text-white placeholder:text-gray-600 focus:border-[#C8102E] h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-3 text-gray-500 hover:text-gray-300"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Botão de Cadastro */}
            <Button
              type="submit"
              disabled={register.isPending}
              className="w-full bg-[#C8102E] hover:bg-red-700 text-white font-black py-3 h-11 text-base"
              style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.1em" }}
            >
              {register.isPending ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                "CRIAR CONTA"
              )}
            </Button>

            {/* Link para Login */}
            <p className="text-center text-gray-400 text-sm">
              Já tem conta?{" "}
              <Link href="/login" className="text-[#C8102E] font-semibold hover:underline">
                Faça login
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
