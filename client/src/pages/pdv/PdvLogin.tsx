import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import { Loader2, ShoppingBag, Eye, EyeOff } from "lucide-react";

export default function PdvLogin() {
  const [, navigate] = useLocation();
  const { refetch } = usePdvAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.pdvAuth.login.useMutation({
    onSuccess: async (data) => {
      toast.success(`Bem-vindo, ${data.seller.name}!`);
      // Aguarda o refetch do contexto antes de navegar para evitar redirect de volta ao login
      await refetch();
      navigate("/pdv");
    },
    onError: (err) => {
      toast.error(err.message || "Usuário ou senha inválidos");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("Preencha usuário e senha");
      return;
    }
    loginMutation.mutate({ username: username.trim(), password });
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-green-950/30 via-gray-950 to-gray-950" />
      
      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-700 rounded-2xl mb-4 shadow-lg shadow-green-700/30">
            <ShoppingBag className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            JUREMA <span className="text-green-600">PDV</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Sistema de Ponto de Venda</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">Entrar no sistema</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Usuário
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Seu nome de usuário"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 transition-colors"
                autoComplete="username"
                autoFocus
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 transition-colors"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Jurema Sport &copy; {new Date().getFullYear()} — Sistema PDV v1.0
        </p>
      </div>
    </div>
  );
}
