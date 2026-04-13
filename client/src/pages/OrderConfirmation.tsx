import { useEffect } from "react";
import React from "react";
import { Link } from "wouter";
import { CheckCircle, ShoppingBag, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663427629051/9BCf3HWTZf6aELg8wntRub/jumera-logo_2dee52ef.webp";

export default function OrderConfirmation() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const orderNumber = params.get('numero') || '';
  const paymentUrl = params.get('pagamento') || '';

  return (
    <div className="min-h-screen bg-[#0D0D0D] pt-20 flex items-center justify-center">
      <div className="container max-w-lg py-12 text-center">
        <div className="bg-[#111111] rounded-2xl p-8 border border-[#1E1E1E]">
          <img src={LOGO_URL} alt="Jurema Sport" className="h-16 w-16 mx-auto mb-4 rounded-full" />
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <h1 className="font-['Bebas_Neue'] text-4xl text-white tracking-wider mb-2">PEDIDO CONFIRMADO!</h1>
          {orderNumber && (
            <p className="text-gray-400 text-sm mb-4">
              Número do pedido: <span className="text-[#1B8C3D] font-bold text-base">#{orderNumber}</span>
            </p>
          )}
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            Seu pedido foi recebido com sucesso! Você receberá um e-mail de confirmação em breve.
            Acompanhe o status do seu pedido pelo nosso WhatsApp.
          </p>

          {paymentUrl && paymentUrl.includes('mercadopago') && (
            <div className="bg-[#1A1A1A] rounded-xl p-4 mb-6">
              <p className="text-gray-400 text-sm mb-3">Clique abaixo para realizar o pagamento:</p>
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer">
                <Button className="w-full bg-[#009ee3] hover:bg-[#007ab8] text-white font-bold">
                  Pagar com Mercado Pago
                </Button>
              </a>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/" className="flex-1">
              <Button variant="outline" className="w-full border-[#333] text-gray-400 hover:text-white bg-transparent gap-2">
                <Home size={16} /> Início
              </Button>
            </Link>
            <Link href="/produtos" className="flex-1">
              <Button className="w-full bg-[#1B8C3D] hover:bg-green-700 text-white gap-2">
                <ShoppingBag size={16} /> Continuar Comprando
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
