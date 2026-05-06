import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { toast } from "sonner";

import {
  ShoppingBag, History, Users, LogOut,
  ChevronRight, Menu, X, BarChart2, Settings, TrendingUp, Bell,
  Package, Wallet, FileText, PlusSquare, Globe, UserCircle, MessageCircle, LayoutGrid
} from "lucide-react";

interface PdvLayoutProps {
  children: React.ReactNode;
}

export default function PdvLayout({ children }: PdvLayoutProps) {
  const [location, navigate] = useLocation();
  const { seller, isAdmin, isLoading } = usePdvAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const utils = trpc.useUtils();

  // Swipe gesture para abrir/fechar sidebar
  useSwipeGesture(mainContentRef, {
    onSwipeRight: () => setSidebarOpen(true),
    onSwipeLeft: () => setSidebarOpen(false),
    threshold: 40
  });

  const logoutMutation = trpc.pdvAuth.logout.useMutation({
    onSuccess: () => {
      // Limpar token do localStorage ao fazer logout
      localStorage.removeItem("pdv_token");
      utils.pdvAuth.me.invalidate();
      navigate("/pdv/login");
      toast.success("Logout realizado com sucesso");
    },
  });

  // ⚠️ TODOS os hooks DEVEM ficar antes de qualquer return condicional (regra dos hooks do React)
  const { data: unreadData } = trpc.pdvNotifications.unreadCount.useQuery(
    undefined,
    { enabled: isAdmin && !!seller, refetchInterval: 30000 }
  );
  const unreadCount = unreadData?.count ?? 0;

  useEffect(() => {
    if (!isLoading && !seller) {
      navigate("/pdv/login");
    }
  }, [seller, isLoading, navigate]);

  // Returns condicionais APENAS após todos os hooks
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!seller) return null;

  const navItems = [
    { href: "/pdv", icon: ShoppingBag, label: "PDV", exact: true },
    { href: "/pdv/historico", icon: History, label: "Histórico" },
    { href: "/pdv/comissoes", icon: TrendingUp, label: "Bônus" },
    { href: "/pdv/meu-perfil", icon: UserCircle, label: "Meu Perfil" },
    { href: "/pdv/whatsapp", icon: MessageCircle, label: "WhatsApp IA" },
    ...(isAdmin ? [
      { href: "/pdv/dashboard", icon: BarChart2, label: "Dashboard" },
      { href: "/pdv/painel-vendedor", icon: LayoutGrid, label: "Painel Vendedor" },
      { href: "/pdv/vendedores", icon: Users, label: "Vendedores" },
      { href: "/pdv/sofia", icon: Package, label: "Sofia" },
      { href: "/pdv/desconto-folha", icon: Wallet, label: "Desc. Folha" },
      { href: "/pdv/relatorio", icon: FileText, label: "Relatório" },
      { href: "/pdv/cadastro-produtos", icon: PlusSquare, label: "Cadastrar Produtos" },
      { href: "/pdv/gestao-site", icon: Globe, label: "Gestão Site" },
      { href: "/pdv/notificacoes", icon: Bell, label: "Notificações", badge: unreadCount },
      { href: "/pdv/configuracoes", icon: Settings, label: "Configurações" },
    ] : []),
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location === href;
    return location.startsWith(href);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center shadow-lg shadow-green-700/20">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">JUREMA</div>
            <div className="text-green-600 font-bold text-sm leading-tight">PDV</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 md:p-6 space-y-1 md:space-y-2 overflow-y-auto overflow-x-hidden md:overflow-x-auto">
        {navItems.map((item: any) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3.5 md:py-4 rounded-xl text-sm md:text-base font-medium transition-all whitespace-nowrap ${
                active
                  ? "bg-green-700 text-white shadow-lg shadow-green-700/20"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.badge > 0 && (
                <span className="ml-auto bg-green-700 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
              {active && !item.badge && <ChevronRight className="w-4 h-4 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="p-4 border-t border-gray-800 shrink-0">
        <div className="bg-gray-800/50 rounded-xl p-3 mb-3">
          <div className="text-white font-semibold text-sm">{seller.name}</div>
          <div className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isAdmin ? "bg-yellow-400" : "bg-green-400"}`} />
            {isAdmin ? "Administrador" : "Vendedor"}
          </div>
        </div>
        <button
          onClick={() => logoutMutation.mutate()}
          className="w-full flex items-center gap-3 px-4 py-3 md:py-3.5 rounded-xl text-sm md:text-base font-medium text-gray-400 hover:text-green-500 hover:bg-green-950/30 transition-all active:bg-green-950/50"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden xl:flex w-64 bg-gray-900 border-r border-gray-800 flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile/Tablet Sidebar Overlay */}
      {sidebarOpen && (
        <div className="xl:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-10">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div ref={mainContentRef} className="flex-1 flex flex-col min-w-0">
        {/* Mobile/Tablet Header */}
        <header className="xl:hidden flex items-center gap-3 px-4 py-4 bg-gray-900 border-b border-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white active:text-green-500 p-2 -m-2 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6 md:w-7 md:h-7" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 md:w-9 md:h-9 bg-green-700 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <span className="text-white font-bold text-sm md:text-base">JUREMA PDV</span>
          </div>
          <div className="ml-auto text-gray-400 text-xs md:text-sm truncate">{seller.name}</div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
