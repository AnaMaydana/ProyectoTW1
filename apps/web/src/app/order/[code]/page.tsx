'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Order } from '../../../lib/types';

export default function OrderConfirmation({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    params.then(({ code: value }) => {
      setCode(value);
      const saved = sessionStorage.getItem('lastOrder');
      if (saved) {
        setOrder(JSON.parse(saved) as Order);
        return;
      }
      api<{ orders: Order[] }>('/orders')
        .then((res) => setOrder(res.orders.find((item) => item.code === value) ?? null))
        .catch(() => setOrder(null));
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
            {order.items.map((item) => (
              <li key={item.productId}>
                {item.quantity} × {item.name} — Bs {item.unitPriceBs}
              </li>
            ))}
          </ul>
          <p>Mostrá el código {order.code} en la sucursal.</p>
        </>
      ) : (
        <p>Cargando pedido {code}…</p>
      )}
      <p><a href="/orders">Ver mis pedidos</a></p>
    </main>
  );
}
