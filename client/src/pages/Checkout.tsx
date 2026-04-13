import { useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { Link } from "wouter";

// Esta página é um fallback — o checkout principal acontece no CartDrawer
export default function Checkout() {
  const { items } = useCart();

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] pt-20 flex items-center justify-center">
        <div className="text-center">
          <ShoppingCart size={48} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-400 text-xl mb-4">Seu carrinho está vazio</p>
          <Link href="/produtos">
            <Button className="bg-[#1B8C3D] hover:bg-green-700 text-white">Ver Produtos</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] pt-20 flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <ShoppingCart size={48} className="text-[#1B8C3D] mx-auto mb-4" />
        <h1 className="font-['Bebas_Neue'] text-4xl text-white tracking-wider mb-3">FINALIZAR COMPRA</h1>
        <p className="text-gray-400 mb-6">
          Para finalizar sua compra, clique no ícone do carrinho no canto superior direito e siga as instruções.
        </p>
        <Link href="/produtos">
          <Button className="bg-[#1B8C3D] hover:bg-green-700 text-white font-bold px-8 py-3">
            Continuar Comprando
          </Button>
        </Link>
      </div>
    </div>
  );
}
