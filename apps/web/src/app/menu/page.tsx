import { ProductCard } from '../../components/ProductCard';
import { BusinessInfo } from '../../components/BusinessInfo';
import { Product } from '../../lib/types';

// Server Components corren dentro del contenedor `web`: ahí `localhost` es el
// propio contenedor. En Docker se usa el nombre de servicio `api`.
const BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default async function Menu({
  searchParams
}: {
  searchParams: Promise<{ search?: string; category?: string }>;
}) {
  const { search = '', category = '' } = await searchParams;
  const params = new URLSearchParams({ search, category });
  let products: Product[] = [];

  try {
    const res = await fetch(`${BASE}/products?${params}`, { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { products: Product[] };
      products = data.products || [];
    }
  } catch {
    products = [];
  }

  return (
    <main>
      <div className="section-header">
        <div>
          <h1>Menú de Salteñas y Bebidas</h1>
          <p className="section-subtitle">
            Horario de atención: 06:00 a 11:00. Haz tu pedido y recógelo caliente en sucursal.
          </p>
        </div>
      </div>

      <div className="card" style={{ margin: '1.25rem 0' }}>
        <form method="get" className="form-grid" style={{ marginBottom: 0, alignItems: 'flex-end' }}>
          <label className="form-group" style={{ flex: 2, margin: 0 }}>
            <span className="label-text">Buscar por nombre</span>
            <input
              name="search"
              defaultValue={search}
              placeholder="Ej. Carne, Pollo, Mixta..."
              className="form-control"
            />
          </label>
          <label className="form-group" style={{ flex: 1, margin: 0 }}>
            <span className="label-text">Categoría</span>
            <select name="category" defaultValue={category} className="form-control">
              <option value="">Todas las categorías</option>
              <option value="salteñas">Salteñas</option>
              <option value="bebidas">Bebidas</option>
              <option value="postres">Postres</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary" style={{ height: '44px' }}>
            Buscar
          </button>
        </form>
      </div>

      <section className="grid">
        {products.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 1rem' }}>
            <h3>No se encontraron productos</h3>
            <p className="helper-text">
              Intenta con otro término de búsqueda o selecciona todas las categorías.
            </p>
          </div>
        ) : (
          products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))
        )}
      </section>

      <BusinessInfo />
    </main>
  );
}
