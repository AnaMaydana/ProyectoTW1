'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Cart } from '../lib/types';
import { api } from '../lib/api';

const EMPTY_CART: Cart = { items: [], totalBs: '0.00' };

const CartContext = createContext<{ cart: Cart; setCart: (cart: Cart) => void } | null>(null);

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart debe usarse dentro de CartProvider');
  return context;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api<{ cart: Cart }>('/cart');
        setCart(response.cart);
      } catch {
        setCart(EMPTY_CART);
      }
    };
    load();
    window.addEventListener('cart:changed', load);
    return () => window.removeEventListener('cart:changed', load);
  }, []);

  return <CartContext.Provider value={{ cart, setCart }}>{children}</CartContext.Provider>;
}
