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
      .then((r) => setCategories(r.categories))
      .catch((err) => {
        setCategories([]);
        setError(err instanceof Error ? err.message : 'No se pudo cargar las categorías');
      });
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
    if (category.activa &&
        !window.confirm(`¿Desactivar la categoría "${category.nombre}"?`)) return;
    setError('');
    try {
      await api(`/admin/categories/${category.id}`, {
        method: 'PATCH', body: JSON.stringify({ activa: !category.activa })
      });
      load();
    } catch {
      setError('No se pudo actualizar la categoría');
    }
  };

  return (
    <section>
      <h1>Categorías</h1>
      <form onSubmit={submit} className="category-form">
        <label>
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Tradicionales"
            required
          />
        </label>
        <div className="form-actions">
          <button type="submit">Crear categoría</button>
        </div>
      </form>
      {error && <p role="alert" className="alert">{error}</p>}
      <ul className="category-list">
        {categories.map((c) => (
          <li key={c.id} className="category-item card">
            <div>
              <strong>{c.nombre}</strong>
              <span className="category-meta">{c.productCount} productos</span>
              <span className="badge">{c.activa ? 'Activa' : 'Inactiva'}</span>
            </div>
            <div className="table-actions">
              <button
                type="button"
                className={`btn-action ${c.activa ? 'btn-deactivate' : 'btn-edit'}`}
                onClick={() => toggle(c)}
              >
                {c.activa ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
