'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminCategory } from '../../../lib/types';

export default function AdminCategories() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api<{ categories: AdminCategory[] }>('/admin/categories')
      .then((r) => setCategories(r.categories)).catch(() => setCategories([]));
  };
  useEffect(load, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try {
      await api('/admin/categories', { method: 'POST', body: JSON.stringify({ nombre }) });
      setNombre(''); load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear'); }
  };

  const toggle = async (category: AdminCategory) => {
    await api(`/admin/categories/${category.id}`, {
      method: 'PATCH', body: JSON.stringify({ activa: !category.activa })
    });
    load();
  };

  return (
    <section>
      <h1>Categorías</h1>
      <form onSubmit={submit}>
        <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label>
        <button type="submit">Crear categoría</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul>
        {categories.map((c) => (
          <li key={c.id}>
            {c.nombre} — {c.productCount} productos — {c.activa ? 'Activa' : 'Inactiva'}
            <button onClick={() => toggle(c)}>{c.activa ? 'Desactivar' : 'Activar'}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
