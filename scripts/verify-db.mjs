import { Client } from 'pg';

// Modelo lógico saltenanga + correcciones aditivas del script ejecutado.
const expected = {
  rol: ['id_rol', 'nombre'],
  usuario: ['id_usuario', 'id_rol', 'nombre', 'celular', 'correo', 'password_hash', 'activo'],
  categoria: ['id_categoria', 'nombre', 'activa'],
  producto: ['id_producto', 'id_categoria', 'nombre', 'descripcion', 'precio', 'foto_url', 'activo'],
  inventario: ['id_inventario', 'id_producto', 'stock', 'disponible', 'disponible_hoy'],
  pedido: [
    'id_pedido', 'codigo', 'id_usuario', 'cliente_nombre', 'cliente_celular',
    'fecha_hora_recojo', 'estado', 'observaciones', 'total', 'fecha_creacion',
    'fecha_confirmacion', 'fecha_expiracion'
  ],
  detalle_pedido: ['id_detalle', 'id_pedido', 'id_producto', 'cantidad', 'precio_unitario', 'subtotal'],
  metodo_pago: ['id_metodo_pago', 'nombre'],
  pago: ['id_pago', 'id_pedido', 'id_metodo_pago', 'monto', 'estado', 'fecha_pago', 'referencia'],
  comprobante: ['id_comprobante', 'id_pedido', 'numero', 'fecha_emision'],
  carrito: ['id_carrito', 'token', 'id_usuario', 'fecha_creacion', 'fecha_actualizacion'],
  carrito_detalle: ['id_carrito', 'id_producto', 'cantidad']
};

const forbidden = [
  'profiles', 'categories', 'products', 'carts', 'cart_items',
  'orders', 'order_items', 'order_status_history'
];

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL del proyecto Supabase salteñanga');
}
const connection = new URL(process.env.DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(connection.protocol) ||
    !(connection.hostname.startsWith('db.') || connection.hostname.includes('pooler.supabase.com'))) {
  throw new Error(
    'DATABASE_URL debe ser la URI Postgres de Supabase ' +
    '(postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres), ' +
    'no la URL HTTPS de la API. La sacás de Supabase → Project Settings → Database → Connection string → URI.'
  );
}
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
await client.connect();
let counts;
try {
  for (const [table, cols] of Object.entries(expected)) {
    const result = await client.query(
      'select column_name from information_schema.columns where table_schema=$1 and table_name=$2',
      ['public', table]
    );
    const found = result.rows.map((row) => row.column_name);
    for (const col of cols) {
      if (!found.includes(col)) throw new Error(`Falta ${table}.${col}`);
    }
  }

  const stale = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name = any($1)`,
    [forbidden]
  );
  if (stale.rowCount) {
    throw new Error(`Tablas del modelo anterior aún presentes: ${stale.rows.map((r) => r.table_name).join(', ')}`);
  }

  const rpc = await client.query(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_order_from_cart'"
  );
  if (rpc.rowCount) throw new Error('Queda la RPC obsoleta create_order_from_cart');

  const seeds = await client.query(`
    select 'rol' t, count(*)::int n from rol
    union all select 'metodo_pago', count(*)::int from metodo_pago
    union all select 'categoria', count(*)::int from categoria
    union all select 'producto', count(*)::int from producto
    union all select 'inventario', count(*)::int from inventario
  `);
  counts = Object.fromEntries(seeds.rows.map((r) => [r.t, r.n]));
  for (const [table, min] of Object.entries({ rol: 3, metodo_pago: 4, categoria: 3, producto: 7, inventario: 7 })) {
    if (counts[table] < min) throw new Error(`Seed incompleto en ${table}: ${counts[table]}`);
  }
} finally {
  await client.end();
}
console.log(`DB OK (${Object.keys(expected).length} tablas, seed ${JSON.stringify(counts)})`);
