'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminCategory, AdminProduct } from '../../../lib/types';

const empty = { idCategoria: '', nombre: '', precio: '', stock: '', fotoUrl: '', disponibleHoy: true };

export default function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
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
      fotoUrl: form.fotoUrl.trim() || undefined,
      disponibleHoy: form.disponibleHoy
    };
    try {
      if (editing) await api(`/admin/products/${editing}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/admin/products', { method: 'POST', body: JSON.stringify(body) });
      setForm(empty); setEditing(null); load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
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
    if (!window.confirm(`¿Eliminar definitivamente "${product.nombre}"?`)) return;
    setError('');
    try {
      await api(`/admin/products/${product.id}`, { method: 'DELETE' });
      if (editing === product.id) {
        setEditing(null);
        setForm(empty);
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el producto');
    }
  };

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
        <label>URL de la Foto (Solo Administrador)
          <input
            type="url"
            value={form.fotoUrl}
            onChange={(e) => setForm({ ...form, fotoUrl: e.target.value })}
            placeholder="https://ejemplo.com/foto.jpg"
          />
        </label>
        <div style={{ margin: '0.75rem 0' }}>
          <button type="submit">{editing ? 'Guardar cambios' : 'Crear producto'}</button>
          {editing && (
            <button
              type="button"
              style={{ marginLeft: '0.5rem', background: '#64748b' }}
              onClick={() => { setEditing(null); setForm(empty); }}
            >
              Cancelar edición
            </button>
          )}
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
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
          {products.map((p) => (
            <tr key={p.id}>
              <td>
                <img
                  src={p.fotoUrl || 'https://placehold.co/80x60?text=Sin+Foto'}
                  alt={p.nombre}
                  style={{ width: '60px', height: '45px', objectFit: 'cover', borderRadius: '4px' }}
                />
              </td>
              <td>{p.nombre}</td>
              <td>{p.categoria}</td>
              <td>Bs {p.precio}</td>
              <td>{p.stock}</td>
              <td>{p.activo ? (p.disponibleHoy ? 'Disponible' : 'Sin stock del día') : 'Inactivo'}</td>
              <td>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(p.id);
                    setForm({
                      idCategoria: p.idCategoria,
                      nombre: p.nombre,
                      precio: p.precio,
                      stock: String(p.stock),
                      fotoUrl: p.fotoUrl ?? '',
                      disponibleHoy: p.disponibleHoy
                    });
                  }}
                >
                  Editar
                </button>{' '}
                {p.activo && (
                  <button type="button" onClick={() => deactivate(p)}>
                    Desactivar
                  </button>
                )}{' '}
                <button
                  type="button"
                  style={{ background: '#b91c1c' }}
                  onClick={() => deleteProduct(p)}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
