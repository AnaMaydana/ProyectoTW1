import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/0001_init.sql', 'utf8');
const required = [
  'create table profiles',
  'create table categories',
  'create table products',
  'create table carts',
  'create table cart_items',
  'create table orders',
  'create table order_items',
  'create or replace function create_order_from_cart',
  'revoke all on function create_order_from_cart',
  'from public, anon, authenticated',
  'grant execute on function create_order_from_cart',
  'to service_role',
  'alter table cart_items enable row level security',
  'alter table order_items enable row level security',
  'with check (auth.uid() = id',
  'revoke update on profiles from anon, authenticated',
  "raise exception 'CUSTOMER_REQUIRED'",
  "raise exception 'OUT_OF_HOURS'",
  "raise exception 'INVALID_PICKUP_TIME'",
  "raise exception 'INVALID_EXPIRY'",
  "raise exception 'CART_FORBIDDEN'"
];
for (const fragment of required) {
  if (!sql.includes(fragment)) throw new Error(`Falta: ${fragment}`);
}
console.log('SCHEMA OK');
