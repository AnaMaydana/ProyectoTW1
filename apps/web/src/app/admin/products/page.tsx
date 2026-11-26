'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminCategory, AdminProduct } from '../../../lib/types';

type FormState = {
  idCategoria: string; nombre: string; precio: string; stock: string;
  fotoUrl: string | null;
};

const empty: FormState = { idCategoria: '', nombre: '', precio: '', stock: '', fotoUrl: null };

export default function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [form, setForm] = useState<FormState>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [fotoOriginal, setFotoOriginal] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    api<{ products: AdminProduct[] }>('/admin/products?includeInactive=true')
      .then((r) => setProducts(r.products))
      .catch((err) => {
        setProducts([]);
        setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de productos');
      });
    api<{ categories: AdminCategory[] }>('/admin/categories')
      .then((r) => setCategories(r.categories))
      .catch((err) => {
        setCategories([]);
        setError(err instanceof Error ? err.message : 'No se pudo cargar las categorías');
      });
  };
  useEffect(load, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const body: Record<string, unknown> = {
      idCategoria: Number(form.idCategoria),
      nombre: form.nombre,
      precio: Number(form.precio),
      stock: Number(form.stock || 0),
      fotoUrl: form.fotoUrl ? form.fotoUrl.trim() : null
    };
    try {
      if (editing) {
        await api(`/admin/products/${editing}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/admin/products', { method: 'POST', body: JSON.stringify(body) });
      }
      setForm(empty);
      setEditing(null);
      setFotoOriginal(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el producto');
    }
  };

  const deactivate = async (product: AdminProduct) => {
    if (!window.confirm(`¿Desactivar "${product.nombre}"? Dejará de estar disponible.`)) return;
    setError('');
    try {
      await api(`/admin/products/${product.id}`, {
        method: 'PATCH', body: JSON.stringify({ activo: false, disponibleHoy: false })
      });
      load();
    } catch {
      setError('No se pudo desactivar el producto');
    }
  };

  const deleteProduct = async (product: AdminProduct) => {
    if (!window.confirm(`¿Eliminar "${product.nombre}"?`)) return;
    setError('');
    try {
      await api(`/admin/products/${product.id}`, { method: 'DELETE' });
    } catch {
      // Si la API en la nube no tiene la ruta DELETE o el producto tiene ventas previas,
      // se desactiva para que desaparezca de la lista activa sin romper el historial
      try {
        await api(`/admin/products/${product.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ activo: false, disponibleHoy: false })
        });
      } catch (err2) {
        setError(err2 instanceof Error ? err2.message : 'No se pudo eliminar el producto');
        return;
      }
    }
    if (editing === product.id) {
      setEditing(null);
      setForm(empty);
      setFotoOriginal(null);
    }
    load();
  };

  const visibleProducts = products.filter((p) => filter === 'all' || p.activo);

  return (
    <section>
      <h1>Productos</h1>
      <form onSubmit={submit}>
        <label>Categoría
          <select value={form.idCategoria} onChange={(e) => setForm({ ...form, idCategoria: e.target.value })} required>
            <option value="">Elegí una categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
        <label>Precio Bs<input type="number" min="0" step="0.01" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} required /></label>
        <label>Stock<input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label>
        <label>
          URL de la foto del producto
          <input
            type="url"
            placeholder="https://ejemplo.com/foto-saltena.jpg"
            value={form.fotoUrl ?? ''}
            onChange={(e) => setForm({ ...form, fotoUrl: e.target.value.trim() || null })}
          />
        </label>
        {form.fotoUrl && (
          <div className="photo-actions" style={{ marginBottom: '1rem' }}>
            <img
              className="photo-preview"
              src={form.fotoUrl}
              alt="Vista previa de la foto"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = 'https://placehold.co/100x70?text=URL+no+valida';
              }}
            />
            <button
              type="button"
              className="btn-action btn-delete"
              onClick={() => setForm({ ...form, fotoUrl: null })}
            >
              Quitar foto
            </button>
          </div>
        )}
        <div className="form-actions">
          <button type="submit">{editing ? 'Guardar cambios' : 'Crear producto'}</button>
          {editing && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setEditing(null); setForm(empty); setFotoOriginal(null); }}
            >
              Cancelar edición
            </button>
          )}
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      
      <div className="admin-filter-bar">
        <button
          type="button"
          className={`btn-action ${filter === 'active' ? 'btn-edit' : 'btn-secondary'}`}
          onClick={() => setFilter('active')}
        >
          Solo activos ({products.filter(p => p.activo).length})
        </button>
        <button
          type="button"
          className={`btn-action ${filter === 'all' ? 'btn-edit' : 'btn-secondary'}`}
          onClick={() => setFilter('all')}
        >
          Todos ({products.length})
        </button>
      </div>

      <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Foto</th>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {visibleProducts.map((p) => (
            <tr key={p.id}>
              <td>
                <img
                  className="table-thumb"
                  src={p.fotoUrl || 'https://placehold.co/100x70?text=Sin+foto'}
                  alt={p.nombre}
                  width={56}
                  height={42}
                />
              </td>
              <td><strong>{p.nombre}</strong></td>
              <td>{p.categoria}</td>
              <td>Bs {p.precio}</td>
              <td>{p.stock}</td>
              <td>{p.activo ? (p.disponibleHoy ? 'Disponible' : 'Sin stock del día') : 'Inactivo'}</td>
              <td>
                <div className="table-actions">
                  <button
                    type="button"
                    className="btn-action btn-edit"
                    onClick={() => {
                      setEditing(p.id);
                      setForm({ idCategoria: p.idCategoria, nombre: p.nombre, precio: p.precio, stock: String(p.stock), fotoUrl: p.fotoUrl });
                      setFotoOriginal(p.fotoUrl);
                    }}
                  >
                    Editar
                  </button>
                  {p.activo && (
                    <button
                      type="button"
                      className="btn-action btn-deactivate"
                      onClick={() => deactivate(p)}
                    >
                      Desactivar
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-action btn-delete"
                    onClick={() => deleteProduct(p)}
                  >
                    Eliminar
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
