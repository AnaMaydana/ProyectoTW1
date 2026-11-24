create extension if not exists pgcrypto;

create type user_role as enum ('CLIENTE','CAJERO','ADMIN');
create type payment_method as enum ('EFECTIVO','QR','TRANSFERENCIA');
create type order_status as enum ('PENDIENTE','CONFIRMADO','CANCELADO','ENTREGADO');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  role user_role not null default 'CLIENTE',
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  name text not null,
  description text not null,
  price_bs numeric(10,2) not null check (price_bs >= 0),
  image_url text,
  available_today boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cart_items (
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity integer not null check (quantity > 0),
  primary key (cart_id, product_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid null references auth.users(id),
  customer_name text not null,
  customer_phone text not null,
  pickup_time time not null,
  notes text,
  payment_method payment_method not null,
  total_bs numeric(10,2) not null check (total_bs >= 0),
  status order_status not null default 'PENDIENTE',
  expires_at timestamptz not null,
  cashier_id uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity integer not null check (quantity > 0),
  unit_price_bs numeric(10,2) not null check (unit_price_bs >= 0)
);

alter table profiles enable row level security;
alter table carts enable row level security;
alter table orders enable row level security;
alter table products enable row level security;
alter table categories enable row level security;

create policy profiles_own on profiles for select using (auth.uid() = id);
create policy profiles_update_own on profiles for update using (auth.uid() = id);
create policy carts_own on carts for select using (auth.uid() = user_id);
create policy orders_own on orders for select using (auth.uid() = user_id);
create policy products_public on products for select using (active = true);
create policy categories_public on categories for select using (active = true);

create or replace function create_order_from_cart(
  p_user_id uuid, p_cart_id uuid, p_customer_name text, p_customer_phone text,
  p_pickup_time time, p_notes text, p_payment_method payment_method, p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_order_id uuid; v_total numeric(10,2); v_bad integer;
begin
  perform pg_advisory_xact_lock(hashtext('saltenanga_order_code'));
  select count(*) into v_bad
    from cart_items ci join products p on p.id = ci.product_id
    where ci.cart_id = p_cart_id and (p.active = false or p.available_today = false);
  if v_bad > 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  select coalesce(sum(ci.quantity * p.price_bs), 0) into v_total
    from cart_items ci join products p on p.id = ci.product_id
    where ci.cart_id = p_cart_id;
  if v_total <= 0 then raise exception 'CART_EMPTY'; end if;
  v_code := 'SAL-' || to_char(now() at time zone 'America/La_Paz','YYYYMMDD') || '-' ||
            lpad(((select count(*) + 1 from orders
                   where code like 'SAL-' || to_char(now() at time zone 'America/La_Paz','YYYYMMDD') || '-%'))::text, 4, '0');
  insert into orders (code,user_id,customer_name,customer_phone,pickup_time,notes,
                      payment_method,total_bs,status,expires_at)
    values (v_code,p_user_id,p_customer_name,p_customer_phone,p_pickup_time,p_notes,
            p_payment_method,v_total,'PENDIENTE',p_expires_at)
    returning id into v_order_id;
  insert into order_items (order_id,product_id,quantity,unit_price_bs)
    select v_order_id, ci.product_id, ci.quantity, p.price_bs
    from cart_items ci join products p on p.id = ci.product_id where ci.cart_id = p_cart_id;
  delete from cart_items where cart_id = p_cart_id;
  return v_order_id;
end $$;
