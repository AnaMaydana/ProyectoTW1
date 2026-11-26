'use client';

import { Cart } from '../lib/types';
import { api } from '../lib/api';

export function CartDrawer({
  initialCart,
  onChange
}: {
  initialCart: Cart;
  onChange: (cart: Cart) => void;
}) {
  const refresh = async () => {
    const response = await api<{ cart: Cart }>('/cart');
    onChange(response.cart);
  };

  const increase = async (productId: string, quantity: number) => {
    await api('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity: quantity + 1 })
    });
    await refresh();
  };

  const remove = async (productId: string) => {
    await api(`/cart/items/${productId}`, { method: 'DELETE' });
    await refresh();
  };

  return (
    <aside className="card" aria-label="Tu carrito">
      <h2>Tu carrito</h2>
      {initialCart.items.length === 0 ? (
        <p>Tu carrito está vacío</p>
      ) : (
        initialCart.items.map((item) => (
          <div key={item.productId} style={{ margin: '0.5rem 0' }}>
            <span>{item.name}</span> <span>{item.quantity}</span>{' '}
            <strong>Bs {item.subtotalBs}</strong>{' '}
            <button aria-label="+" onClick={() => increase(item.productId, item.quantity)}>
              +
            </button>{' '}
            <button onClick={() => remove(item.productId)}>Quitar</button>
          </div>
        ))
      )}
      <p>Total: Bs {initialCart.totalBs}</p>
      <a href="/checkout">Confirmar pedido</a>
    </aside>
  );
}
