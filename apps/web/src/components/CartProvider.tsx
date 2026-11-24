'use client';

import { useEffect, useState } from 'react';
import { Cart } from '../lib/types';
import { api } from '../lib/api';
import { CartDrawer } from './CartDrawer';

const EMPTY_CART: Cart = { items: [], totalBs: '0.00' };

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

  return (
    <>
      {children}
      <CartDrawer initialCart={cart} onChange={setCart} />
    </>
  );
}
