import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, User, Eye, EyeOff, ShieldCheck } from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-logo_2dee52ef.webp";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const utils = trpc.useUtils();

  const loginMutation = trpc.adminAuth.login.useMutation({
    onSuccess: (data) => {
      toast.success(`Bem-vindo, ${data.name}!`);
      // Refetch admin auth state após login bem-sucedido
      utils.adminAuth.me.invalidate();
      setTimeout(() => navigate("/admin"), 500);
    },
    onError: (e) => {
      toast.error(e.message || "Credenciais inválidas");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Preencha usuário e senha");
      return;
    }
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center px-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `repeating-linear-gradient(45deg, #C8102E 0, #C8102E 1px, transparent 0, transparent 50%)`,
        backgroundSize: "20px 20px"
      }} />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src={LOGO_URL} alt="Jurema Sport" className="w-24 h-24 object-contain mb-3" />
          <h1 className="font-['Bebas_Neue'] text-3xl text-white tracking-widest">JUREMA SPORT</h1>
          <div className="flex items-center gap-2 mt-1">
            <ShieldCheck size={14} className="text-[#C8102E]" />
            <span className="text-[#C8102E] text-xs font-semibold tracking-widest uppercase">Área Administrativa</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#111111] border border-[#1E1E1E] rounded-2xl p-6 shadow-2xl">
          <h2 className="text-white font-semibold text-lg mb-1">Entrar no Painel</h2>
          <p className="text-gray-500 text-sm mb-6">Acesso restrito a administradores</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-gray-400 text-xs mb-1 block">Usuário</Label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="jurema@adm"
                  className="bg-[#1A1A1A] border-[#333] text-white pl-9 focus:border-[#C8102E] focus:ring-0"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-400 text-xs mb-1 block">Senha</Label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <Input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-[#1A1A1A] border-[#333] text-white pl-9 pr-10 focus:border-[#C8102E] focus:ring-0"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full bg-[#C8102E] hover:bg-red-700 text-white font-bold tracking-wider h-11 mt-2"
            >
              {loginMutation.isPending ? "ENTRANDO..." : "ENTRAR NO PAINEL"}
            </Button>
          </form>
        </div>

        <p className="text-center text-gray-700 text-xs mt-6">
          © 2026 Jurema Sport — Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
