import { ProductCard } from '../../components/ProductCard';
import { BusinessInfo } from '../../components/BusinessInfo';
import { Product } from '../../lib/types';

// Server Components corren dentro del contenedor `web`: ahí `localhost` es el
// propio contenedor. En Docker se usa el nombre de servicio `api`.
const BASE = process.env.API_INTERNAL_URL ?? process.env.API_URL ?? (process.env.NEXT_PUBLIC_API_URL?.startsWith('http') ? process.env.NEXT_PUBLIC_API_URL : 'https://saltenanga-api.onrender.com');

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
      <h1>Menú</h1>
      <form method="get" className="menu-search-form">
        <label>
          Buscar
          <input name="search" defaultValue={search} placeholder="Buscar salteña..." />
        </label>
        <label>
          Categoría
          <select name="category" defaultValue={category}>
            <option value="">Todas</option>
            <option value="salteñas">Salteñas</option>
            <option value="bebidas">Bebidas</option>
          </select>
        </label>
        <button type="submit">Buscar</button>
      </form>
      <section className="grid">
        {(products ?? []).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
      <BusinessInfo />
    </main>
  );
}
