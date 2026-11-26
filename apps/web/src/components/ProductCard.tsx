'use client';

import { Product } from '../lib/types';
import { api } from '../lib/api';

export function ProductCard({ product }: { product: Product }) {
  const add = async () => {
    await api('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, quantity: 1 })
    });
    window.dispatchEvent(new Event('cart:changed'));
  };

  return (
    <article className="card">
      <img
        src={product.imageUrl ?? 'https://placehold.co/600x400?text=Salteña'}
        alt={product.name}
        width={300}
        height={200}
      />
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <strong className="precio">Bs {product.priceBs}</strong>
      {!product.availableToday && <span className="badge">Agotado hoy</span>}
      <div className="card-actions">
        <button type="button" onClick={add} disabled={!product.availableToday}>
          Agregar
        </button>
      </div>
    </article>
  );
}
