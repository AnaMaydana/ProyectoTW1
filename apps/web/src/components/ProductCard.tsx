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
    <article className="card product-card">
      <div className="product-media">
        <img
          src={product.imageUrl ?? 'https://placehold.co/600x400?text=Salteña'}
          alt={product.name}
          width={300}
          height={200}
          className="product-img"
        />
        {!product.availableToday && (
          <span className="badge badge-out-stock">Agotado hoy</span>
        )}
      </div>
      <div className="product-body">
        <div className="product-category-label">{product.categoryName}</div>
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{product.description}</p>
        <div className="product-footer">
          <strong className="product-price">Bs {product.priceBs}</strong>
          <button
            className="btn btn-primary"
            onClick={add}
            disabled={!product.availableToday}
          >
            Agregar
          </button>
        </div>
      </div>
    </article>
  );
}
