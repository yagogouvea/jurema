import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import Home from "./pages/Home";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import Admin from "./pages/Admin";
import Header from "./components/Header";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
import CartDrawer from "./components/CartDrawer";

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
      <Route path="/admin" component={Admin} />
      <Route path="/admin/:rest*" component={Admin} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <CartProvider>
          <TooltipProvider>
            <Toaster richColors position="top-right" />
            <Router />
          </TooltipProvider>
        </CartProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
