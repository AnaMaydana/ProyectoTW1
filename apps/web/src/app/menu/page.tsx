import { ProductCard } from '../../components/ProductCard';
import { BusinessInfo } from '../../components/BusinessInfo';
import { Product } from '../../lib/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default async function Menu({
  searchParams
}: {
  searchParams: Promise<{ search?: string; category?: string }>;
}) {
  const { search = '', category = '' } = await searchParams;
  const params = new URLSearchParams({ search, category });
  const res = await fetch(`${BASE}/products?${params}`);
  const { products } = (await res.json()) as { products: Product[] };

  return (
    <main>
      <h1>Menú</h1>
      <form method="get">
        <label>
          Buscar
          <input name="search" defaultValue={search} placeholder="Buscar salteña" />
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
