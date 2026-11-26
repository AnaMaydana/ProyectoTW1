'use client';

import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Cart, Order } from '../lib/types';

export function OrdersHistory({
  initialOrders,
  onChange
}: {
  initialOrders: Order[];
  onChange: (orders: Order[]) => void;
}) {
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const response = await api<{ orders: Order[] }>('/orders');
    onChange(response.orders);
  };

  const repeat = async (order: Order) => {
    setMessage('');
    try {
      const response = await api<{ cart: Cart; skipped: string[] }>(
        `/orders/${order.id}/repeat`,
        { method: 'POST' }
      );
      window.dispatchEvent(new Event('cart:changed'));
      setMessage(
        response.skipped.length > 0
          ? `Productos agotados omitidos: ${response.skipped.join(', ')}`
          : 'Productos copiados al carrito'
      );
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo repetir el pedido');
    }
  };

  const cancel = async (order: Order) => {
    setMessage('');
    try {
      await api(`/orders/${order.id}/cancel`, { method: 'POST' });
      await refresh();
      setMessage('Pedido cancelado');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo cancelar');
    }
  };

  if (initialOrders.length === 0) return <p>Todavía no tenés pedidos.</p>;

  return (
    <>
      <ul className="orders-list">
        {initialOrders.map((order) => {
          const expired = new Date(order.expiresAt).getTime() <= Date.now();
          const cancellable = order.status === 'PENDIENTE' && !expired;
          return (
            <li key={order.id} className="card order-card">
              <p>Código: <strong>{order.code}</strong></p>
              <p>Total: Bs {order.totalBs} — Estado: <span className="badge">{order.status}</span></p>
              <p>Recojo: {order.pickupTime}</p>
              <div className="order-actions">
                <button
                  type="button"
                  className="btn-action btn-edit"
                  onClick={() => repeat(order)}
                >
                  Repetir
                </button>
                {cancellable ? (
                  <button
                    type="button"
                    className="btn-action btn-delete"
                    onClick={() => cancel(order)}
                  >
                    Cancelar
                  </button>
                ) : (
                  <span className="order-note">Si necesitás cancelar, llamá al local</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {message && <p role="status">{message}</p>}
    </>
  );
}
