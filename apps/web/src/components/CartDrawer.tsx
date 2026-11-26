'use client';

import { useEffect, useRef, useState } from 'react';
import { Cart } from '../lib/types';
import { api } from '../lib/api';
import { useCart } from './CartProvider';

export function CartDrawer({
  initialCart,
  onChange
}: {
  initialCart: Cart;
  onChange: (cart: Cart) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const itemCount = initialCart.items.reduce((sum, item) => sum + item.quantity, 0);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

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
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cart-trigger"
        aria-label={`Abrir carrito, ${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}`}
        aria-expanded={open}
        aria-controls={open ? 'cart-panel' : undefined}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 4h2l2.2 10.5a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 7H6" />
          <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="17" cy="20" r="1.4" fill="currentColor" stroke="none" />
        </svg>
        <span className="cart-count" aria-hidden="true">{itemCount}</span>
      </button>

      {open && (
        <div
          className="cart-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <aside id="cart-panel" className="cart-panel" role="dialog" aria-modal="true" aria-label="Tu carrito">
            <div className="cart-panel-header">
              <h2>Tu carrito</h2>
              <button ref={closeRef} type="button" className="cart-close" aria-label="Cerrar carrito" onClick={close}>
                ×
              </button>
            </div>

            <div className="cart-items">
              {initialCart.items.length === 0 ? (
                <p className="cart-empty">Tu carrito está vacío</p>
              ) : (
                initialCart.items.map((item) => (
                  <div className="cart-item" key={item.productId}>
                    <span className="cart-item-name">{item.name}</span>
                    <strong className="cart-item-price">Bs {item.subtotalBs}</strong>
                    <div className="cart-item-actions">
                      <button type="button" aria-label="+" onClick={() => increase(item.productId, item.quantity)}>
                        +
                      </button>
                      <span className="cart-item-quantity">{item.quantity} × Bs {item.unitPriceBs}</span>
                      <button type="button" className="cart-remove" onClick={() => remove(item.productId)}>
                        Quitar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="cart-panel-footer">
              <p className="cart-total">Total: Bs {initialCart.totalBs}</p>
              <a className="button-link" href="/checkout">Confirmar pedido</a>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export function CartNav() {
  const { cart, setCart } = useCart();
  return <CartDrawer initialCart={cart} onChange={setCart} />;
}
