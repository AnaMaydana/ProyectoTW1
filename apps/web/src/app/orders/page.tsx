'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Order } from '../../lib/types';
import { OrdersHistory } from '../../components/OrdersHistory';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    api<{ orders: Order[] }>('/orders')
      .then((res) => setOrders(res.orders))
      .catch(() => setOrders([]));
  }, []);

  return (
    <main>
      <h1>Mis pedidos</h1>
      <OrdersHistory initialOrders={orders} onChange={setOrders} />
      <p><a href="/menu">Volver al menú</a></p>
    </main>
  );
}
