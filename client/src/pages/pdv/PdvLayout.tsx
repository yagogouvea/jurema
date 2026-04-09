import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePdvAuth } from "@/contexts/PdvAuthContext";
import { toast } from "sonner";
import {
  ShoppingBag, LayoutDashboard, History, Users, LogOut,
  ChevronRight, Menu, X, BarChart2, Settings, TrendingUp
} from "lucide-react";
import { useState } from "react";

interface PdvLayoutProps {
  children: React.ReactNode;
}

export default function PdvLayout({ children }: PdvLayoutProps) {
  const [location, navigate] = useLocation();
  const { seller, isAdmin, isLoading } = usePdvAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const utils = trpc.useUtils();

  const logoutMutation = trpc.pdvAuth.logout.useMutation({
    onSuccess: () => {
      utils.pdvAuth.me.invalidate();
      navigate("/pdv/login");
      toast.success("Logout realizado com sucesso");
    },
  });

  useEffect(() => {
    if (!isLoading && !seller) {
      navigate("/pdv/login");
    }
  }, [seller, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!seller) return null;

  const navItems = [
    { href: "/pdv", icon: ShoppingBag, label: "PDV", exact: true },
    { href: "/pdv/historico", icon: History, label: "Histórico" },
    ...(isAdmin ? [
      { href: "/pdv/dashboard", icon: BarChart2, label: "Dashboard" },
      { href: "/pdv/vendedores", icon: Users, label: "Vendedores" },
      { href: "/pdv/comissoes", icon: TrendingUp, label: "Comissões" },
      { href: "/pdv/configuracoes", icon: Settings, label: "Configurações" },
    ] : []),
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location === href;
    return location.startsWith(href);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">JUMERA</div>
            <div className="text-red-500 font-bold text-sm leading-tight">PDV</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
              {active && <ChevronRight className="w-4 h-4 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="p-4 border-t border-gray-800">
        <div className="bg-gray-800/50 rounded-xl p-3 mb-3">
          <div className="text-white font-semibold text-sm">{seller.name}</div>
          <div className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isAdmin ? "bg-yellow-400" : "bg-green-400"}`} />
            {isAdmin ? "Administrador" : "Vendedor"}
          </div>
        </div>
        <button
          onClick={() => logoutMutation.mutate()}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-950/30 transition-all"
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
      <aside className="hidden lg:flex w-64 bg-gray-900 border-r border-gray-800 flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-sm">JUMERA PDV</span>
          </div>
          <div className="ml-auto text-gray-400 text-sm">{seller.name}</div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
