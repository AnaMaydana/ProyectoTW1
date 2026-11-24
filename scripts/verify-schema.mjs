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
  'create or replace function create_order_from_cart'
];
for (const fragment of required) {
  if (!sql.includes(fragment)) throw new Error(`Falta: ${fragment}`);
}
console.log('SCHEMA OK');
