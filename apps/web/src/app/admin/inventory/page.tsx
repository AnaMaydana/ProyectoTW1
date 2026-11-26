'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminInventoryItem } from '../../../lib/types';

export default function AdminInventory() {
  const [items, setItems] = useState<AdminInventoryItem[]>([]);

  const load = () => {
    api<{ items: AdminInventoryItem[] }>('/admin/inventory')
      .then((r) => setItems(r.items)).catch(() => setItems([]));
  };
  useEffect(load, []);

  const changeStock = async (item: AdminInventoryItem, stock: number) => {
    if (stock < 0) return;
    await api(`/admin/inventory/${item.id}`, { method: 'PATCH', body: JSON.stringify({ stock }) });
    load();
  };

  const toggle = async (item: AdminInventoryItem) => {
    await api(`/admin/inventory/${item.id}`, {
      method: 'PATCH', body: JSON.stringify({ disponibleHoy: !item.disponibleHoy })
    });
    load();
  };

  return (
    <section>
      <h1>Inventario</h1>
      <table>
        <thead><tr><th>Producto</th><th>Stock</th><th>Disponible hoy</th><th></th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={item.lowStock ? 'low-stock' : undefined}>
              <td>{item.nombre}</td>
              <td>
                <input aria-label={`Stock de ${item.nombre}`} type="number" min="0"
                  value={item.stock} onChange={(e) => changeStock(item, Number(e.target.value))} />
              </td>
              <td>{item.disponibleHoy ? 'Sí' : 'No'}</td>
              <td><button onClick={() => toggle(item)}>
                {item.disponibleHoy ? 'Marcar agotado' : 'Marcar disponible'}
              </button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.some((i) => i.lowStock) && <p role="status">Hay productos con stock bajo.</p>}
    </section>
  );
}
