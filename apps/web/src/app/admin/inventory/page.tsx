'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminInventoryItem } from '../../../lib/types';

export default function AdminInventory() {
  const [items, setItems] = useState<AdminInventoryItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const load = () => {
    api<{ items: AdminInventoryItem[] }>('/admin/inventory')
      .then((r) => setItems(r.items)).catch(() => setError('No se pudo cargar el inventario'));
  };
  useEffect(load, []);

  const clearDraft = (id: string) => setDrafts((current) => {
    const next = { ...current };
    delete next[id];
    return next;
  });

  const saveStock = async (item: AdminInventoryItem, raw: string) => {
    const stock = Number(raw);
    if (!Number.isInteger(stock) || stock < 0) {
      setError('El stock debe ser un entero mayor o igual a cero');
      return;
    }
    if (stock === item.stock) { clearDraft(item.id); return; }
    setError('');
    try {
      await api(`/admin/inventory/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({ stock })
      });
      clearDraft(item.id);
      load();
    } catch {
      setError('No se pudo guardar el stock');
    }
  };

  const toggle = async (item: AdminInventoryItem) => {
    setError('');
    try {
      await api(`/admin/inventory/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({ disponibleHoy: !item.disponibleHoy })
      });
      load();
    } catch {
      setError('No se pudo actualizar la disponibilidad');
    }
  };

  return (
    <section>
      <h1>Inventario</h1>
      {error && <p role="alert">{error}</p>}
      <div className="table-scroll">
      <table>
        <thead><tr><th>Producto</th><th>Stock</th><th>Disponible hoy</th><th></th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={item.lowStock ? 'low-stock' : undefined}>
              <td>
                {item.nombre}
                {item.lowStock && <span className="badge">Stock bajo</span>}
              </td>
              <td>
                <input aria-label={`Stock de ${item.nombre}`} type="number" min="0"
                  value={drafts[item.id] ?? String(item.stock)}
                  onChange={(e) => setDrafts({ ...drafts, [item.id]: e.target.value })}
                  onBlur={(e) => saveStock(item, e.target.value)} />
              </td>
              <td>{item.disponibleHoy ? 'Sí' : 'No'}</td>
              <td>
                <div className="table-actions">
                  <button
                    type="button"
                    className={`btn-action ${item.disponibleHoy ? 'btn-deactivate' : 'btn-edit'}`}
                    onClick={() => toggle(item)}
                  >
                    {item.disponibleHoy ? 'Marcar agotado' : 'Marcar disponible'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
