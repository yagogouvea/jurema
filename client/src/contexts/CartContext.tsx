import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface CartItem {
  productId: number;
  productName: string;
  productImage: string;
  size: string;
  quantity: number;
  unitPrice: number;
  team?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: number, size: string) => void;
  updateQuantity: (productId: number, size: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  subtotal: number;
  itemCount: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = "jumera_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((newItem: CartItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === newItem.productId && i.size === newItem.size);
      if (existing) {
        return prev.map(i =>
          i.productId === newItem.productId && i.size === newItem.size
            ? { ...i, quantity: i.quantity + newItem.quantity }
            : i
        );
      }
      return [...prev, newItem];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((productId: number, size: string) => {
    setItems(prev => prev.filter(i => !(i.productId === productId && i.size === size)));
  }, []);

  const updateQuantity = useCallback((productId: number, size: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId, size);
      return;
    }
    setItems(prev => prev.map(i =>
      i.productId === productId && i.size === size ? { ...i, quantity } : i
    ));
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const total = subtotal; // shipping calculated at checkout
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart,
      total, subtotal, itemCount, isOpen, setIsOpen,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
