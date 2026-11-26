'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { CashierOrder, CashierOrderDetail, OrderStatus } from '../lib/types';

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDIENTE: 'CONFIRMADO',
  CONFIRMADO: 'PREPARANDO',
  PREPARANDO: 'LISTO'
};

function expiryLabel(expiresAt: string, now = Date.now()): string {
  const time = new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(expiresAt));
  const minutes = Math.ceil((new Date(expiresAt).getTime() - now) / 60000);
  if (minutes <= 0) return `${time} — Vencido`;
  if (minutes < 10) return `${time} — Vence en ${minutes} min`;
  return time;
}

export function CashierOrders() {
  const [orders, setOrders] = useState<CashierOrder[]>([]);
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<CashierOrderDetail | null>(null);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ orders: CashierOrder[] }>('/cashier/orders');
      setOrders(res.orders);
    } catch {
      setMessage('No se pudo actualizar la lista');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const change = async (order: CashierOrder, status: OrderStatus) => {
    setMessage('');
    try {
      await api(`/cashier/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado');
    }
  };

  const cancel = async (order: CashierOrder) => {
    if (!window.confirm(`¿Cancelar el pedido ${order.code}?`)) return;
    await change(order, 'CANCELADO');
  };

  const search = async () => {
    setMessage('');
    try {
      const res = await api<{ order: CashierOrderDetail }>(
        `/cashier/orders/code/${encodeURIComponent(code)}`
      );
      setSelected(res.order);
      if (res.order.status !== 'LISTO') setMessage('El pedido no está listo para entrega');
    } catch (err) {
      setSelected(null);
      setMessage(err instanceof ApiError ? err.message : 'Pedido no encontrado');
    }
  };

  const deliver = async () => {
    if (!selected) return;
    setMessage('');
    try {
      const res = await api<{ comprobante: { numero: string } }>(
        `/cashier/orders/${selected.id}/deliver`,
        { method: 'POST', body: JSON.stringify({ code }) }
      );
      setMessage(`Comprobante ${res.comprobante.numero}`);
      setSelected(null);
      setCode('');
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo entregar el pedido');
    }
  };

  return (
    <section>
      {message && <p role="status">{message}</p>}
      <div>
        <label htmlFor="cashier-code">Código del pedido</label>
        <input id="cashier-code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="button" onClick={() => { void search(); }}>Buscar</button>
      </div>
      {selected?.status === 'LISTO' && selected.code === code && (
        <button type="button" onClick={() => { void deliver(); }}>Confirmar entrega</button>
      )}
      <button type="button" onClick={() => { void refresh(); }}>Actualizar</button>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Código</th><th>Cliente</th><th>Recojo</th><th>Vencimiento</th><th>Estado</th><th>Total</th><th>Pago</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.code}</td>
                <td>{order.customerName ?? 'Invitado'}</td>
                <td>{order.pickupTime}</td>
                <td>{expiryLabel(order.expiresAt)}</td>
                <td>{order.status}</td>
                <td>Bs {order.totalBs}</td>
                <td>{order.paymentMethod}</td>
                <td>
                  {NEXT[order.status] && (
                    <button type="button" onClick={() => {
                      const next = NEXT[order.status];
                      if (next) void change(order, next);
                    }}>
                      {order.status === 'PENDIENTE' ? 'Confirmar'
                        : order.status === 'CONFIRMADO' ? 'Preparar' : 'Marcar listo'}
                    </button>
                  )}
                  {(order.status === 'PENDIENTE' || order.status === 'CONFIRMADO') && (
                    <button type="button" onClick={() => { void cancel(order); }}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
