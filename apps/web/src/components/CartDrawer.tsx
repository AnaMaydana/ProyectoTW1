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
    <aside className="card cart-drawer" aria-label="Tu carrito">
      <div className="cart-header">
        <h2>Tu carrito</h2>
        {initialCart.items.length > 0 && (
          <span className="cart-badge-count">
            {initialCart.items.reduce((acc, i) => acc + i.quantity, 0)} items
          </span>
        )}
      </div>

      {initialCart.items.length === 0 ? (
        <div className="cart-empty-state">
          <p>Tu carrito está vacío</p>
          <span className="cart-empty-hint">
            Agrega salteñas o bebidas para armar tu pedido.
          </span>
        </div>
      ) : (
        <div className="cart-items-list">
          {initialCart.items.map((item) => (
            <div key={item.productId} className="cart-item-row">
              <div className="cart-item-info">
                <span className="cart-item-name">{item.name}</span>
                <span className="cart-item-qty">Cant: {item.quantity}</span>
              </div>
              <strong className="cart-item-subtotal">Bs {item.subtotalBs}</strong>
              <div className="cart-item-actions">
                <button
                  type="button"
                  className="btn-cart-circle"
                  aria-label="+"
                  onClick={() => increase(item.productId, item.quantity)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="btn-cart-remove"
                  onClick={() => remove(item.productId)}
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="cart-footer">
        <p className="cart-total-text">Total: Bs {initialCart.totalBs}</p>
        {initialCart.items.length > 0 ? (
          <a href="/checkout" className="btn btn-primary btn-block text-center">
            Confirmar pedido
          </a>
        ) : (
          <button className="btn btn-secondary btn-block" disabled>
            Confirmar pedido
          </button>
        )}
      </div>
    </aside>
  );
}
