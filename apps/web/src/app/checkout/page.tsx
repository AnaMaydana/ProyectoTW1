'use client';

import { useEffect, useState } from 'react';
import { CheckoutForm, CheckoutData } from '../../components/CheckoutForm';
import { api, ApiError } from '../../lib/api';
import { computeExpiry } from '../../lib/expiry';
import { Cart, Order, User } from '../../lib/types';

const EMPTY_CART: Cart = { items: [], totalBs: '0.00' };

export default function CheckoutPage() {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [user, setUser] = useState<User | null>(null);
  const [expiresAt, setExpiresAt] = useState(() => computeExpiry().toISOString());
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ cart: Cart }>('/cart').then((res) => setCart(res.cart)).catch(() => setCart(EMPTY_CART));
    api<User>('/auth/me').then(setUser).catch(() => setUser(null));
    setExpiresAt(computeExpiry().toISOString());
  }, []);

  const submit = async (data: CheckoutData) => {
    setError('');
    try {
      const response = await api<{ order: Order }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          pickupTime: data.pickupTime,
          notes: data.notes,
          paymentMethod: data.paymentMethod,
          customerName: data.customerName,
          customerPhone: data.customerPhone
        })
      });
      sessionStorage.setItem('lastOrder', JSON.stringify(response.order));
      window.location.href = `/order/${response.order.code}`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo confirmar el pedido');
    }
  };

  return (
    <main>
      <h1>Confirmar pedido</h1>
      <p>Total: Bs {cart.totalBs}</p>
      {cart.items.length === 0 ? (
        <p>Agregá productos al carrito antes de confirmar.</p>
      ) : (
        <CheckoutForm
          expiresAt={expiresAt}
          showCustomerFields={!user}
          onSubmit={submit}
        />
      )}
      {error && <p role="alert" className="alert">{error}</p>}
    </main>
  );
}
