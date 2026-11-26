'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '../../../lib/api';
import { AdminCategory, AdminProduct } from '../../../lib/types';

interface FormState {
  idCategoria: string;
  nombre: string;
  descripcion: string;
  precio: string;
  stock: string;
  fotoUrl: string;
  disponibleHoy: boolean;
}

const empty: FormState = {
  idCategoria: '',
  nombre: '',
  descripcion: '',
  precio: '',
  stock: '',
  fotoUrl: '',
  disponibleHoy: true
};

export default function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);

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

  const handleEdit = (p: AdminProduct) => {
    setEditing(p.id);
    setForm({
      idCategoria: p.idCategoria,
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio: p.precio,
      stock: String(p.stock),
      fotoUrl: p.fotoUrl ?? '',
      disponibleHoy: p.disponibleHoy
    });
    setError('');
    setNotice('');
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelEdit = () => {
    setEditing(null);
    setForm(empty);
    setError('');
    setNotice('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const body: Record<string, unknown> = {
      idCategoria: Number(form.idCategoria),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || undefined,
      precio: Number(form.precio),
      stock: Number(form.stock || 0),
      fotoUrl: form.fotoUrl.trim() || undefined,
      disponibleHoy: form.disponibleHoy
    };
    try {
      if (editing) {
        await api(`/admin/products/${editing}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        setNotice(`Producto "${form.nombre}" actualizado correctamente.`);
      } else {
        await api('/admin/products', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        setNotice(`Producto "${form.nombre}" creado exitosamente.`);
      }
      setForm(empty);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  const deactivate = async (product: AdminProduct) => {
    if (!window.confirm(`¿Desactivar "${product.nombre}"? Dejará de estar disponible.`)) return;
    setError('');
    setNotice('');
    try {
      await api(`/admin/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: false, disponibleHoy: false })
      });
      setNotice(`Producto "${product.nombre}" desactivado.`);
      load();
    } catch {
      setError('No se pudo desactivar el producto');
    }
  };

  const activate = async (product: AdminProduct) => {
    setError('');
    setNotice('');
    try {
      await api(`/admin/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: true, disponibleHoy: true })
      });
      setNotice(`Producto "${product.nombre}" activado.`);
      load();
    } catch {
      setError('No se pudo activar el producto');
    }
  };

  const deleteProduct = async (product: AdminProduct) => {
    if (!window.confirm(`¿Eliminar definitivamente el producto "${product.nombre}"?`)) return;
    setError('');
    setNotice('');
    try {
      const res = await api<{ message?: string }>(`/admin/products/${product.id}`, {
        method: 'DELETE'
      });
      setNotice(res.message || `Producto "${product.nombre}" eliminado.`);
      if (editing === product.id) {
        handleCancelEdit();
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el producto');
    }
  };

  return (
    <section className="admin-section">
      <div className="section-header">
        <div>
          <h1>Gestión de Productos</h1>
          <p className="section-subtitle">
            Crea, modifica fotos e información, o elimina productos del catálogo.
          </p>
        </div>
      </div>

      <div className="admin-card form-card">
        <h2>{editing ? 'Modificar Producto' : 'Crear Nuevo Producto'}</h2>
        <form ref={formRef} onSubmit={submit} className="admin-product-form">
          <div className="form-grid">
            <label className="form-group">
              <span className="label-text">Categoría</span>
              <select
                value={form.idCategoria}
                onChange={(e) => setForm({ ...form, idCategoria: e.target.value })}
                required
                className="form-control"
              >
                <option value="">Elegí una categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-group">
              <span className="label-text">Nombre del Producto</span>
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                required
                placeholder="Ej. Salteña de Carne Especial"
                className="form-control"
              />
            </label>

            <label className="form-group">
              <span className="label-text">Precio (Bs)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.precio}
                onChange={(e) => setForm({ ...form, precio: e.target.value })}
                required
                placeholder="0.00"
                className="form-control"
              />
            </label>

            <label className="form-group">
              <span className="label-text">Stock Inicial</span>
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="0"
                className="form-control"
              />
            </label>
          </div>

          <label className="form-group">
            <span className="label-text">Descripción</span>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              placeholder="Ingredientes, nivel de picante, etc."
              className="form-control"
            />
          </label>

          <div className="form-image-row">
            <label className="form-group flex-1">
              <span className="label-text">URL de la Imagen (Foto del Producto)</span>
              <input
                type="url"
                value={form.fotoUrl}
                onChange={(e) => setForm({ ...form, fotoUrl: e.target.value })}
                placeholder="https://ejemplo.com/foto-saltena.jpg"
                className="form-control"
              />
              <span className="helper-text">
                Solo el administrador puede asignar o modificar la imagen de los productos.
              </span>
            </label>

            {form.fotoUrl && (
              <div className="image-preview-box">
                <span className="preview-label">Vista previa:</span>
                <img
                  src={form.fotoUrl}
                  alt="Vista previa"
                  className="image-preview-thumb"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = 'https://placehold.co/120x80?text=Error';
                  }}
                />
              </div>
            )}
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.disponibleHoy}
              onChange={(e) => setForm({ ...form, disponibleHoy: e.target.checked })}
            />
            <span>Disponible para la venta el día de hoy</span>
          </label>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editing ? 'Guardar cambios' : 'Crear producto'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="btn btn-secondary"
              >
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </div>

      {notice && <div className="notice-banner">{notice}</div>}
      {error && <p role="alert" className="error-banner">{error}</p>}

      <div className="admin-card">
        <h2>Catálogo de Productos ({products.length})</h2>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                    No hay productos registrados.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className={!p.activo ? 'row-inactive' : ''}>
                    <td className="table-img-cell">
                      <img
                        src={p.fotoUrl || 'https://placehold.co/80x60?text=Sin+Foto'}
                        alt={p.nombre}
                        className="table-product-thumb"
                      />
                    </td>
                    <td>
                      <div className="product-table-title">{p.nombre}</div>
                      {p.descripcion && (
                        <div className="product-table-desc">{p.descripcion}</div>
                      )}
                    </td>
                    <td>
                      <span className="badge category-badge">{p.categoria}</span>
                    </td>
                    <td className="table-price">Bs {p.precio}</td>
                    <td>
                      <span className={p.stock <= 5 ? 'stock-warning' : ''}>
                        {p.stock} unidades
                      </span>
                    </td>
                    <td>
                      {p.activo ? (
                        p.disponibleHoy ? (
                          <span className="status-pill status-available">Disponible</span>
                        ) : (
                          <span className="status-pill status-low">Sin stock del día</span>
                        )
                      ) : (
                        <span className="status-pill status-inactive">Inactivo</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn-action btn-edit"
                          onClick={() => handleEdit(p)}
                        >
                          Editar
                        </button>
                        {p.activo ? (
                          <button
                            type="button"
                            className="btn-action btn-deactivate"
                            onClick={() => deactivate(p)}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-action btn-activate"
                            onClick={() => activate(p)}
                          >
                            Activar
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}