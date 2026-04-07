import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { refetch } = useCustomerAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const login = trpc.customerAuth.login.useMutation({
    onSuccess: () => {
      toast.success("Login realizado com sucesso! Bem-vindo de volta!");
      refetch();
      // Redireciona para o checkout se veio de lá, senão para home
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/";
      navigate(returnTo);
    },
    onError: (err) => {
      toast.error(err.message || "E-mail ou senha incorretos.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate({ email, password });
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
              alt="Jumera Sport"
              className="h-16 mx-auto mb-4 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </Link>
          <h1
            className="text-3xl font-black text-white tracking-wider"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            ENTRAR NA CONTA
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Acesse sua conta para finalizar compras</p>
        </div>

        {/* Card */}
        <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <Label className="text-gray-300 text-sm font-medium mb-1.5 flex items-center gap-2">
                <Mail size={14} className="text-[#C8102E]" /> E-mail
              </Label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            {/* Botão */}
            <Button
              type="submit"
              disabled={login.isPending}
              className="w-full h-12 bg-[#C8102E] hover:bg-[#a00d24] text-white font-black text-base tracking-widest mt-2"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {login.isPending ? (
                <><Loader2 size={18} className="animate-spin mr-2" /> ENTRANDO...</>
              ) : (
                "ENTRAR"
              )}
            </Button>

            <p className="text-center text-gray-500 text-sm">
              Não tem uma conta?{" "}
              <Link href="/cadastro" className="text-[#C8102E] hover:text-red-400 font-semibold">
                Criar conta grátis
              </Link>
            </p>
          </form>
        </div>

        {/* Voltar */}
        <p className="text-center mt-6">
          <Link href="/" className="text-gray-600 hover:text-gray-400 text-sm">
            ← Voltar para a loja
          </Link>
        </p>
      </div>
    </div>
  );
}
