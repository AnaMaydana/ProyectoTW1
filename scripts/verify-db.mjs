import { Client } from 'pg';

const expected = {
  profiles: ['id', 'name', 'phone', 'role'],
  categories: ['id', 'name', 'active'],
  products: ['id', 'category_id', 'name', 'description', 'price_bs', 'available_today', 'active'],
  carts: ['id', 'user_id'],
  cart_items: ['cart_id', 'product_id', 'quantity'],
  orders: ['id', 'code', 'pickup_time', 'payment_method', 'total_bs', 'status', 'expires_at', 'cashier_id'],
  order_items: ['id', 'order_id', 'product_id', 'quantity', 'unit_price_bs']
};

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
for (const [table, cols] of Object.entries(expected)) {
  const result = await client.query(
    'select column_name from information_schema.columns where table_name=$1',
    [table]
  );
  const found = result.rows.map((row) => row.column_name);
  for (const col of cols) {
    if (!found.includes(col)) throw new Error(`Falta ${table}.${col}`);
  }
}
const rpc = await client.query("select 1 from pg_proc where proname='create_order_from_cart'");
if (rpc.rowCount === 0) throw new Error('Falta RPC create_order_from_cart');
await client.end();
console.log('DB OK');
