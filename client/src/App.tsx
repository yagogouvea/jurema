import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import { CustomerAuthProvider } from "./contexts/CustomerAuthContext";
import { AdminAuthProvider } from "./contexts/AdminAuthContext";
import Home from "./pages/Home";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import AdminPanel from "./pages/AdminPanel";
import AdminLogin from "./pages/AdminLogin";
// import Login from "./pages/Login";
// import Register from "./pages/Register";
import Header from "./components/Header";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
import CartDrawer from "./components/CartDrawer";
import { PdvAuthProvider } from "./contexts/PdvAuthContext";
import PdvLogin from "./pages/pdv/PdvLogin";
import PdvMain from "./pages/pdv/PdvMain";
import PdvDashboard from "./pages/pdv/PdvDashboard";
import PdvVendedores from "./pages/pdv/PdvVendedores";
import PdvHistorico from "./pages/pdv/PdvHistorico";
import PdvConfiguracoes from "./pages/pdv/PdvConfiguracoes";
import PdvComissoes from "./pages/pdv/PdvComissoes";
import PdvNotificacoes from "./pages/pdv/PdvNotificacoes";
import PdvSofia from "./pages/pdv/PdvSofia";
import PdvDescontoFolha from "./pages/pdv/PdvDescontoFolha";
import PdvRelatorio from "./pages/pdv/PdvRelatorio";
import PdvCadastroProdutos from "./pages/pdv/PdvCadastroProdutos";
import PdvGestaoSite from "./pages/pdv/PdvGestaoSite";
import PdvMeuPerfil from "./pages/pdv/PdvMeuPerfil";
import PdvWhatsApp from "./pages/pdv/PdvWhatsApp";
import PdvWhatsAppConfig from "./pages/pdv/PdvWhatsAppConfig";
import PdvSellerPanel from "./pages/pdv/PdvSellerPanel";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0D0D0D] flex flex-col">
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
      <WhatsAppButton />
      <CartDrawer />
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  /** Um único provider para todo /pdv/* — evita desmontar o contexto ao trocar de rota e reusar cache `me: null`. */
  const pdvShell = location.startsWith("/pdv");

  const routes = (
    <Switch>
      <Route path="/" component={() => <Layout><Home /></Layout>} />
      <Route path="/produtos" component={() => <Layout><Products /></Layout>} />
      <Route path="/produto/:slug" component={() => <Layout><ProductDetail /></Layout>} />
      <Route path="/checkout" component={() => <Layout><Checkout /></Layout>} />
      <Route path="/pedido/confirmacao" component={() => <Layout><OrderConfirmation /></Layout>} />
      {/* Auth pages — removidas, usar carrinho para dados */}
      {/* Admin independente */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminPanel} />
      <Route path="/admin/:rest*" component={AdminPanel} />
      <Route path="/pdv/login" component={PdvLogin} />
      <Route path="/pdv/dashboard" component={PdvDashboard} />
      <Route path="/pdv/vendedores" component={PdvVendedores} />
      <Route path="/pdv/historico" component={PdvHistorico} />
      <Route path="/pdv/configuracoes" component={PdvConfiguracoes} />
      <Route path="/pdv/comissoes" component={PdvComissoes} />
      <Route path="/pdv/sofia" component={PdvSofia} />
      <Route path="/pdv/desconto-folha" component={PdvDescontoFolha} />
      <Route path="/pdv/relatorio" component={PdvRelatorio} />
      <Route path="/pdv/cadastro-produtos" component={PdvCadastroProdutos} />
      <Route path="/pdv/gestao-site" component={PdvGestaoSite} />
      <Route path="/pdv/meu-perfil" component={PdvMeuPerfil} />
      <Route path="/pdv/whatsapp/config" component={PdvWhatsAppConfig} />
      <Route path="/pdv/painel-vendedor" component={PdvSellerPanel} />
      <Route path="/pdv/whatsapp" component={PdvWhatsApp} />
      <Route path="/pdv/notificacoes" component={PdvNotificacoes} />
      <Route path="/pdv" component={PdvMain} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );

  return pdvShell ? <PdvAuthProvider>{routes}</PdvAuthProvider> : routes;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AdminAuthProvider>
            <CustomerAuthProvider>
              <CartProvider>
                <TooltipProvider>
                  <Toaster richColors position="top-right" />
                  <Router />
                </TooltipProvider>
              </CartProvider>
            </CustomerAuthProvider>
        </AdminAuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
