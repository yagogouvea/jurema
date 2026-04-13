import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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
  return (
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
      {/* PDV independente — PdvAuthProvider aqui para isolar o cookie pdv_token das outras páginas */}
      <Route path="/pdv/login" component={() => <PdvAuthProvider><PdvLogin /></PdvAuthProvider>} />
      <Route path="/pdv/dashboard" component={() => <PdvAuthProvider><PdvDashboard /></PdvAuthProvider>} />
      <Route path="/pdv/vendedores" component={() => <PdvAuthProvider><PdvVendedores /></PdvAuthProvider>} />
      <Route path="/pdv/historico" component={() => <PdvAuthProvider><PdvHistorico /></PdvAuthProvider>} />
      <Route path="/pdv/configuracoes" component={() => <PdvAuthProvider><PdvConfiguracoes /></PdvAuthProvider>} />
      <Route path="/pdv/comissoes" component={() => <PdvAuthProvider><PdvComissoes /></PdvAuthProvider>} />
      <Route path="/pdv/sofia" component={() => <PdvAuthProvider><PdvSofia /></PdvAuthProvider>} />
      <Route path="/pdv/desconto-folha" component={() => <PdvAuthProvider><PdvDescontoFolha /></PdvAuthProvider>} />
      <Route path="/pdv/relatorio" component={() => <PdvAuthProvider><PdvRelatorio /></PdvAuthProvider>} />
      <Route path="/pdv/notificacoes" component={() => <PdvNotificacoes />} />
      <Route path="/pdv" component={() => <PdvAuthProvider><PdvMain /></PdvAuthProvider>} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
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
