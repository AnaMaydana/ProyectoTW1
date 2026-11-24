'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Order } from '../../../lib/types';
import { orderLines, savedOrderMatches } from '../../../lib/order';

export default function OrderConfirmation({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ code: value }) => {
      setCode(value);
      const saved = savedOrderMatches(sessionStorage.getItem('lastOrder'), value);
      if (saved) {
        setOrder(saved);
        setLoading(false);
        return;
      }
      api<{ orders: Order[] }>('/orders')
        .then((res) => setOrder(res.orders.find((item) => item.code === value) ?? null))
        .catch(() => setOrder(null))
        .finally(() => setLoading(false));
    });
  }, [params]);

  return (
    <main>
      <h1>Pedido confirmado</h1>
      {order ? (
        <>
          <p>Código de pedido: <strong>{order.code}</strong></p>
          <p>Total: Bs {order.totalBs}</p>
          <p>Hora de recojo: {order.pickupTime}</p>
          <p>Método de pago: {order.paymentMethod}</p>
          <ul>
            {orderLines(order).map((item) => (
              <li key={item.productId}>
                {item.quantity} × {item.name} — Bs {item.unitPriceBs}
              </li>
            ))}
          </ul>
          <p>Mostrá el código {order.code} en la sucursal.</p>
        </>
      ) : loading ? (
        <p>Cargando pedido {code}…</p>
      ) : (
        <p>No encontramos el pedido {code}. Revisá tu historial o llamá al local.</p>
      )}
      <p><a href="/orders">Ver mis pedidos</a></p>
    </main>
  );
}
