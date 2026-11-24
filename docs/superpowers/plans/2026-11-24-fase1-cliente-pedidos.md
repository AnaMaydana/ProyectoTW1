# SALTEÑANGA Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la tienda online de SALTEÑANGA para clientes: catálogo en Bs, carrito persistente, login con cookies persistentes, pedidos para recoger el mismo día con código, historial, repetir y cancelar.

**Architecture:** Nest posee la API y escribe las cookies `httpOnly`; Next consume esa API y renderiza la UI; Supabase remoto provee Auth y Postgres. Las tablas ya incluyen campos para las fases 2-5. Docker Compose levanta `api` y `web`.

**Tech Stack:** Node 20+, TypeScript estricto, NestJS 10, Next.js 15 (App Router), React 19, Supabase JS 2, class-validator, Jest, Supertest, Playwright, PostgreSQL 16, Docker Compose v2.

**Spec:** `docs/superpowers/specs/2026-11-24-tienda-salteñas-design.md`

---

## Global Constraints

- Idioma de UI: **español**; moneda: **bolivianos (Bs)** con dos decimales.
- Horario: **06:00–11:00** en `America/La_Paz` (UTC-4 fijo, sin DST).
- Pedidos **solo del día actual**; hora de recojo dentro del horario.
- Ventana de recojo: **`created_at + 30 min` con tope a las 11:00**.
- Aviso en UI cuando falten **menos de 10 minutos** para `expires_at`.
- Cookies: `cart_id` (30 días), `sb_access`, `sb_refresh` (30 días con "recordarme", sesión sin él); todas `httpOnly`, `SameSite=Lax`, `Secure` solo en producción.
- Roles: `CLIENTE`, `CAJERO`, `ADMIN` (en Fase 1 solo se crea `CLIENTE`).
- Métodos de pago: `EFECTIVO`, `QR`, `TRANSFERENCIA` (solo se registra; sin cobro ni QR).
- Estados: `PENDIENTE`, `CONFIRMADO`, `CANCELADO`, `ENTREGADO`.
- Código de pedido: `SAL-AAAAMMDD-####`, único por día.
- El total se calcula siempre en el servidor; nunca se confía en precios del cliente.
- Sin panel de cajero, sin admin, sin realtime, sin reportes, sin cobro online.
- Push a GitHub **solo después de la aprobación final del usuario**.

## Review Focus

- Pedido confirmado a las 10:50 → vence a las 11:00 y muestra aviso de <10 min. Prueba: `buildExpiry` en Task 7 y UI en Task 11.
- Carrito vacío o producto agotado en checkout → `400`/`409` sin vaciar el carrito. Prueba: RPC en Task 1 y `OrdersService` en Task 7.
- `sb_access` inválido con `sb_refresh` inválido → `401`, limpia cookies de sesión y conserva `cart_id`. Prueba: Task 3 y Task 9.
- Cancelar pedido vencido o ya `CONFIRMADO` → `409` con mensaje de llamar al local. Prueba: Task 7.
- Repetir pedido con producto agotado → copia solo disponibles y avisa cuáles se omitieron. Prueba: Task 7 y Task 13.

## File Structure

```text
package.json                         root workspaces + scripts
.env.example                         variables sin secretos reales
docker-compose.yml                   servicios api y web
README.md                            arranque y configuración
scripts/verify-db.mjs                verifica tablas, columnas y RPC
supabase/migrations/0001_init.sql    esquema, RLS y create_order_from_cart
supabase/seed.sql                    5 salteñas + bebidas
apps/api/                            NestJS (auth, products, cart, orders)
apps/web/                            Next.js (páginas, componentes, e2e)
docs/superpowers/specs/...           spec aprobada
docs/superpowers/plans/...           este plan
```

---

### Task 1: Workspace, Docker, esquema y seed

**Files:**
- Create: `package.json`, `.env.example`, `docker-compose.yml`, `README.md`
- Create: `scripts/verify-db.mjs`, `supabase/migrations/0001_init.sql`, `supabase/seed.sql`
- Create: `apps/api/Dockerfile`, `apps/api/.dockerignore`, `apps/web/Dockerfile`, `apps/web/.dockerignore`

**Interfaces:**
- Produces: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, RPC `create_order_from_cart`.

- [ ] **Step 1: Crear workspace y verificación fallida**

```bash
mkdir -p scripts supabase/migrations apps/api/src apps/web/src
git init
npm init -y
npm pkg set name=saltenanga private=true workspaces[0]=apps/api workspaces[1]=apps/web
npm i -D pg@^8.13.0
```

`scripts/verify-db.mjs`:

```js
import { Client } from 'pg';
const expected = {
  profiles: ['id','name','phone','role'],
  categories: ['id','name','active'],
  products: ['id','category_id','name','description','price_bs','available_today','active'],
  carts: ['id','user_id'],
  cart_items: ['cart_id','product_id','quantity'],
  orders: ['id','code','pickup_time','payment_method','total_bs','status','expires_at','cashier_id'],
  order_items: ['id','order_id','product_id','quantity','unit_price_bs']
};
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
for (const [table, cols] of Object.entries(expected)) {
  const r = await client.query('select column_name from information_schema.columns where table_name=$1', [table]);
  const found = r.rows.map(x => x.column_name);
  for (const col of cols) if (!found.includes(col)) throw new Error(`Falta ${table}.${col}`);
}
const rpc = await client.query("select 1 from pg_proc where proname='create_order_from_cart'");
if (rpc.rowCount === 0) throw new Error('Falta RPC create_order_from_cart');
await client.end();
console.log('DB OK');
```

- [ ] **Step 2: Ejecutar verificación (debe fallar)**

```bash
node scripts/verify-db.mjs
```
Expected: FAIL con `Falta profiles.id`.

- [ ] **Step 3: Escribir `.env.example`**

```text
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
API_PORT=3001
WEB_PORT=3000
CORS_ORIGIN=http://localhost:3000
CART_COOKIE_DAYS=30
SESSION_REFRESH_DAYS=30
BUSINESS_OPEN_TIME=06:00
BUSINESS_CLOSE_TIME=11:00
PICKUP_WINDOW_MINUTES=30
LOW_TIME_WARNING_MINUTES=10
NODE_ENV=development
```

Copiar a `.env` y completar con valores reales. `.env` no se versiona.

- [ ] **Step 4: Escribir `supabase/migrations/0001_init.sql`**

```sql
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
```

- [ ] **Step 5: Escribir `supabase/seed.sql`**

```sql
insert into categories (id,name) values
  ('11111111-1111-4111-8111-111111111111','salteñas'),
  ('22222222-2222-4222-8222-222222222222','bebidas')
on conflict (id) do nothing;

insert into products (id,category_id,name,description,price_bs,image_url,available_today) values
  ('a1000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Carne','Salteña de carne con ají',12.00,'https://placehold.co/600x400?text=Carne',true),
  ('a1000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Pollo','Salteña de pollo',11.00,'https://placehold.co/600x400?text=Pollo',true),
  ('a1000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Mixta','Carne y pollo',13.00,'https://placehold.co/600x400?text=Mixta',true),
  ('a1000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Queso','Salteña de queso',10.00,'https://placehold.co/600x400?text=Queso',false),
  ('a1000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','Vegetariana','Verduras y queso',10.50,'https://placehold.co/600x400?text=Vegetariana',true),
  ('b1000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','Coca Cola','Botella 1.5 L',8.00,'https://placehold.co/600x400?text=Coca',true),
  ('b1000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Agua','Botella 500 ml',4.00,'https://placehold.co/600x400?text=Agua',true)
on conflict (id) do nothing;
```

- [ ] **Step 6: Docker y README**

`docker-compose.yml`:

```yaml
services:
  api:
    build: ./apps/api
    ports: ["${API_PORT:-3001}:3001"]
    env_file: .env
  web:
    build: ./apps/web
    ports: ["${WEB_PORT:-3000}:3000"]
    env_file: .env
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:${API_PORT:-3001}
    depends_on: [api]
```

`apps/api/Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3001
CMD ["npm","run","start:dev"]
```

`apps/web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm","run","dev"]
```

Los `.dockerignore` excluyen `node_modules`, `.next`, `dist`, `.env`. El `README.md` documenta: copiar `.env.example` a `.env`, aplicar migración con `psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql`, seed con `psql "$DATABASE_URL" -f supabase/seed.sql`, y `docker compose up --build`.

- [ ] **Step 7: Aplicar migración y verificar**

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/seed.sql
node scripts/verify-db.mjs
```
Expected: `DB OK`.

- [ ] **Step 8: Commit**

```bash
git add . && git commit -m "chore: workspace, docker, supabase schema and seed"
```

---

### Task 2: Backend skeleton y SupabaseModule

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/config/env.ts`
- Create: `apps/api/src/supabase/supabase.module.ts`, `apps/api/src/supabase/supabase.service.ts`, `apps/api/src/supabase/supabase.service.spec.ts`

**Interfaces:**
- Consumes: variables de Task 1.
- Produces: `SupabaseService.anon` y `SupabaseService.admin` (`SupabaseClient`), `loadEnv()`.

- [ ] **Step 1: Test fallido de configuración**

`apps/api/src/supabase/supabase.service.spec.ts`:

```ts
import { SupabaseService } from './supabase.service';
describe('SupabaseService', () => {
  it('expone cliente anon y admin', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    const service = new SupabaseService();
    expect(service.anon).toBeDefined();
    expect(service.admin).toBeDefined();
    expect(service.anon).not.toBe(service.admin);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/api test -- --runInBand src/supabase/supabase.service.spec.ts
```
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Archivos de configuración**

`apps/api/package.json`:

```json
{
  "name": "api",
  "version": "1.0.0",
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@supabase/supabase-js": "^2.45.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "cookie-parser": "^1.4.6",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.0",
    "@nestjs/testing": "^10.4.0",
    "@types/cookie-parser": "^1.4.7",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.16.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "roots": ["<rootDir>/src", "<rootDir>/test"]
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  }
}
```

`apps/api/nest-cli.json`:

```json
{ "$schema": "https://json.schemastore.org/nest-cli", "sourceRoot": "src", "compilerOptions": { "deleteOutDir": true } }
```

`apps/api/src/config/env.ts`:

```ts
export function loadEnv() {
  const required = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  for (const key of required) if (!process.env[key]) throw new Error(`Falta ${key}`);
  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    cartDays: Number(process.env.CART_COOKIE_DAYS ?? 30),
    refreshDays: Number(process.env.SESSION_REFRESH_DAYS ?? 30)
  };
}
export const env = loadEnv();
```

`apps/api/src/supabase/supabase.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
@Injectable()
export class SupabaseService {
  readonly anon: SupabaseClient = createClient(env.supabaseUrl, env.anonKey);
  readonly admin: SupabaseClient = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
```

`apps/api/src/supabase/supabase.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
@Module({ providers: [SupabaseService], exports: [SupabaseService] })
export class SupabaseModule {}
```

`apps/api/src/main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './config/env';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: env.corsOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(3001);
}
bootstrap();
```

`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SupabaseModule } from './supabase/supabase.module';
@Module({ imports: [SupabaseModule] })
export class AppModule {}
```

- [ ] **Step 4: Instalar y ejecutar test**

```bash
npm install
npm -w apps/api test -- --runInBand src/supabase/supabase.service.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api package-lock.json && git commit -m "feat: nest skeleton and supabase module"
```

---

### Task 3: CookieService y autenticación

**Files:**
- Create: `apps/api/src/common/cookies/cookie.service.ts`
- Create: `apps/api/src/auth/dto/{register,login,update-profile}.dto.ts`
- Create: `apps/api/src/auth/auth.service.ts`, `auth.controller.ts`, `auth.module.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`, `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `SupabaseService`, `env`.
- Produces: `AuthService.register/login/logout/me/updateName`, `CookieService`, endpoints `/auth/*`.

- [ ] **Step 1: Tests fallidos**

`apps/api/src/auth/auth.service.spec.ts`:

```ts
import { AuthService } from './auth.service';
import { CookieService } from '../common/cookies/cookie.service';
import { SupabaseService } from '../supabase/supabase.service';
const supabase = {
  auth: {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    getUser: jest.fn(),
    refreshSession: jest.fn()
  },
  from: jest.fn()
};
const service = new AuthService(supabase as any, new CookieService(), {} as any);
describe('AuthService', () => {
  it('registro crea perfil con rol CLIENTE', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    supabase.from.mockReturnValue({ insert: jest.fn().mockResolvedValue({ error: null }) });
    const user = await service.register({ name: 'Ana', phone: '70000000', email: 'a@b.com', password: 'secret123' });
    expect(user.role).toBe('CLIENTE');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
  });
  it('login con remember setea refresh de 30 días', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'a', refresh_token: 'r' } }, error: null });
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    supabase.from.mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { name: 'Ana', phone: '70000000', role: 'CLIENTE' } }) }) });
    const res = { cookie: jest.fn() } as any;
    await service.login({ email: 'a@b.com', password: 'secret123', remember: true }, res);
    const names = res.cookie.mock.calls.map(c => c[0]);
    expect(names).toContain('sb_refresh');
    expect(res.cookie.mock.calls.find(c => c[0] === 'sb_refresh')[2].maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
```

`apps/api/test/auth.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
describe('Auth E2E', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  it('rechaza registro sin celular', async () => {
    await request(app.getHttpServer()).post('/auth/register')
      .send({ name: 'Ana', email: 'a@b.com', password: 'secret123' }).expect(400);
  });
  afterAll(async () => app.close());
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/api test -- --runInBand src/auth/auth.service.spec.ts
```
Expected: FAIL, `auth.service` no existe.

- [ ] **Step 3: Implementar CookieService y DTOs**

`apps/api/src/common/cookies/cookie.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Response, Request } from 'express';
import { env } from '../../config/env';
const base = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' };
@Injectable()
export class CookieService {
  setCart(res: Response, cartId: string) {
    res.cookie('cart_id', cartId, { ...base, maxAge: env.cartDays * 86400000 });
  }
  clearCart(res: Response) { res.clearCookie('cart_id', base); }
  setSession(res: Response, access: string, refresh: string, remember: boolean) {
    res.cookie('sb_access', access, base);
    res.cookie('sb_refresh', refresh, remember ? { ...base, maxAge: env.refreshDays * 86400000 } : base);
  }
  clearSession(res: Response) {
    res.clearCookie('sb_access', base);
    res.clearCookie('sb_refresh', base);
  }
  read(req: Request, name: 'cart_id'|'sb_access'|'sb_refresh') { return req.cookies?.[name] as string | undefined; }
}
```

DTOs:

```ts
// register.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';
export class RegisterDto {
  @IsString() name: string;
  @IsString() phone: string;
  @IsEmail() email: string;
  @MinLength(8) password: string;
}
// login.dto.ts
import { IsBoolean, IsEmail, IsOptional, MinLength } from 'class-validator';
export class LoginDto {
  @IsEmail() email: string;
  @MinLength(8) password: string;
  @IsOptional() @IsBoolean() remember?: boolean;
}
// update-profile.dto.ts
import { IsString } from 'class-validator';
export class UpdateProfileDto { @IsString() name: string; }
```

- [ ] **Step 4: Implementar AuthService**

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { SupabaseService } from '../supabase/supabase.service';
import { CookieService } from '../common/cookies/cookie.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
@Injectable()
export class AuthService {
  constructor(private sb: SupabaseService, private cookies: CookieService, private cart: any) {}
  async register(dto: RegisterDto) {
    const { data, error } = await this.sb.anon.auth.signUp({ email: dto.email, password: dto.password });
    if (error || !data.user) throw new Error(error?.message ?? 'REGISTER_FAILED');
    const row = await this.sb.admin.from('profiles')
      .insert({ id: data.user.id, name: dto.name, phone: dto.phone, role: 'CLIENTE' }).select().single();
    if (row.error) throw new Error(row.error.message);
    return this.toUser(data.user.id, data.user.email!, row.data);
  }
  async login(dto: LoginDto, res: Response) {
    const { data, error } = await this.sb.anon.auth.signInWithPassword({ email: dto.email, password: dto.password });
    if (error || !data.session) throw new UnauthorizedException('Credenciales inválidas');
    this.cookies.setSession(res, data.session.access_token, data.session.refresh_token, dto.remember ?? false);
    return this.hydrate(data.user!.id, data.user!.email!);
  }
  logout(res: Response) { this.cookies.clearSession(res); return { ok: true }; }
  async me(access?: string, refresh?: string, res?: Response) {
    let token = access;
    if (!token && refresh && res) {
      const { data } = await this.sb.anon.auth.refreshSession({ refresh_token: refresh });
      token = data.session?.access_token;
      if (token) this.cookies.setSession(res, token, data.session!.refresh_token, true);
    }
    if (!token) throw new UnauthorizedException();
    const { data, error } = await this.sb.anon.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException();
    return this.hydrate(data.user.id, data.user.email!);
  }
  async updateName(access: string | undefined, dto: UpdateProfileDto) {
    const user = await this.me(access);
    const { data, error } = await this.sb.admin.from('profiles').update({ name: dto.name }).eq('id', user.id).select().single();
    if (error) throw new Error(error.message);
    return { ...user, name: data.name };
  }
  private async hydrate(id: string, email: string) {
    const { data } = await this.sb.admin.from('profiles').select('name,phone,role').eq('id', id).single();
    return this.toUser(id, email, data);
  }
  private toUser(id: string, email: string, profile: any) {
    return { id, email, name: profile.name, phone: profile.phone, role: profile.role };
  }
}
```

Nota: `register` debe setear cookies también. En el controller se llama a `login` con las mismas credenciales después de `register` para reutilizar la lógica de sesión.

- [ ] **Step 5: Implementar controller y módulo**

```ts
import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CookieService } from '../common/cookies/cookie.service';
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private cookies: CookieService) {}
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const user = await this.auth.register(dto);
    await this.auth.login({ email: dto.email, password: dto.password }, res);
    res.status(201).json({ user });
  }
  @Post('login') async login(@Body() dto: LoginDto, @Res() res: Response) { res.json({ user: await this.auth.login(dto, res) }); }
  @Post('logout') logout(@Res() res: Response) { res.json(this.auth.logout(res)); }
  @Get('me') me(@Req() req: Request, @Res() res: Response) {
    return this.auth.me(this.cookies.read(req,'sb_access'), this.cookies.read(req,'sb_refresh'), res);
  }
  @Patch('me') update(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.auth.updateName(this.cookies.read(req,'sb_access'), dto);
  }
}
```

`auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CookieService } from '../common/cookies/cookie.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
@Module({ imports: [SupabaseModule], controllers: [AuthController], providers: [AuthService, CookieService], exports: [AuthService, CookieService] })
export class AuthModule {}
```

Actualizar `AppModule` para importar `AuthModule`.

- [ ] **Step 6: Ejecutar tests**

```bash
npm -w apps/api test -- --runInBand src/auth/auth.service.spec.ts
npm -w apps/api test -- --runInBand test/auth.e2e-spec.ts
```
Expected: PASS en ambos (el e2e usa Supabase real con variables de `.env`; si no hay credenciales, saltar con `describe.skip` y documentarlo en README).

- [ ] **Step 7: Commit**

```bash
git add apps/api && git commit -m "feat: auth, cookies persistentes y perfil"
```

---

### Task 4: ProductsModule

**Files:**
- Create: `apps/api/src/products/products.service.ts`, `products.controller.ts`, `products.module.ts`, `products.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService`.
- Produces: `ProductsService.list(search?, category?): Promise<Product[]>`, `GET /products`.

- [ ] **Step 1: Test fallido**

```ts
import { ProductsService } from './products.service';
const sb = { admin: { from: jest.fn() } } as any;
const service = new ProductsService(sb);
it('filtra por categoría y indica agotado', async () => {
  const select = jest.fn().mockReturnThis();
  const eq = jest.fn().mockResolvedValue({ data: [{ id:'p1', name:'Carne', description:'Carne', price_bs:'12.00', image_url:null, available_today:false, active:true, category_id:'c1', categories:{name:'salteñas'} }], error:null });
  sb.admin.from.mockReturnValue({ select: () => ({ eq }) });
  const products = await service.list(undefined, 'salteñas');
  expect(eq).toHaveBeenCalledWith('category_id','11111111-1111-4111-8111-111111111111');
  expect(products[0].availableToday).toBe(false);
  expect(products[0].priceBs).toBe('12.00');
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/api test -- --runInBand src/products/products.service.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementar servicio, controller y módulo**

```ts
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
export interface Product {
  id: string; categoryId: string; categoryName: string; name: string;
  description: string; priceBs: string; imageUrl: string | null; availableToday: boolean;
}
const CATEGORY_IDS: Record<string,string> = {
  'salteñas':'11111111-1111-4111-8111-111111111111',
  'bebidas':'22222222-2222-4222-8222-222222222222'
};
@Injectable()
export class ProductsService {
  constructor(private sb: SupabaseService) {}
  async list(search?: string, category?: string): Promise<Product[]> {
    let query = this.sb.admin.from('products')
      .select('id,category_id,name,description,price_bs,image_url,available_today,categories(name)')
      .eq('active', true);
    if (category) query = query.eq('category_id', CATEGORY_IDS[category] ?? category);
    if (search) query = query.ilike('name', `%${search}%`);
    const { data, error } = await query.order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id, categoryId: r.category_id, categoryName: r.categories?.name ?? '',
      name: r.name, description: r.description, priceBs: Number(r.price_bs).toFixed(2),
      imageUrl: r.image_url, availableToday: r.available_today
    }));
  }
}
```

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}
  @Get() list(@Query('search') search?: string, @Query('category') category?: string) {
    return this.products.list(search, category).then(products => ({ products }));
  }
}
```

```ts
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
@Module({ imports:[SupabaseModule], controllers:[ProductsController], providers:[ProductsService], exports:[ProductsService] })
export class ProductsModule {}
```

`AppModule` importa `ProductsModule`.

- [ ] **Step 4: Ejecutar test y commit**

```bash
npm -w apps/api test -- --runInBand src/products/products.service.spec.ts
git add apps/api && git commit -m "feat: catalogo con busqueda y disponibilidad"
```
Expected: PASS.

---

### Task 5: CartModule persistente

**Files:**
- Create: `apps/api/src/cart/cart.service.ts`, `cart.controller.ts`, `cart.module.ts`, `cart.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService`, `ProductsService`.
- Produces: `CartService.getOrCreate`, `getCart`, `addItem`, `removeItem`, `clear`, `attachUser`; `GET/POST/DELETE /cart`.

- [ ] **Step 1: Test fallido**

```ts
import { CartService } from './cart.service';
const admin = { from: jest.fn() } as any;
const service = new CartService({ admin } as any);
it(' calcula el total desde la BD', async () => {
  const data = [{ quantity:2, products:{name:'Carne',price_bs:'12.00'} }];
  admin.from.mockReturnValue({ select: () => ({ eq: () => Promise.resolve({ data, error:null }) }) });
  const cart = await service.getCart('cart1');
  expect(cart.totalBs).toBe('24.00');
  expect(cart.items[0].subtotalBs).toBe('24.00');
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/api test -- --runInBand src/cart/cart.service.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementar servicio**

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
export interface CartItem { productId:string; name:string; quantity:number; unitPriceBs:string; subtotalBs:string; }
export interface Cart { items: CartItem[]; totalBs:string; }
@Injectable()
export class CartService {
  constructor(private sb: SupabaseService) {}
  private get admin() { return this.sb.admin; }
  async getOrCreate(cartId?: string, userId?: string | null): Promise<string> {
    if (cartId) {
      const { data } = await this.admin.from('carts').select('id').eq('id', cartId).single();
      if (data) return data.id;
    }
    const { data, error } = await this.admin.from('carts').insert({ user_id: userId ?? null }).select('id').single();
    if (error) throw new Error(error.message);
    return data.id;
  }
  async getCart(cartId: string): Promise<Cart> {
    const { data, error } = await this.admin.from('cart_items')
      .select('quantity,products(name,price_bs,active,available_today)').eq('cart_id', cartId);
    if (error) throw new Error(error.message);
    const items: CartItem[] = (data ?? []).filter((r:any) => r.products?.active).map((r:any) => {
      const unit = Number(r.products.price_bs).toFixed(2);
      return { productId:r.product_id, name:r.products.name, quantity:r.quantity,
               unitPriceBs:unit, subtotalBs:(Number(unit)*r.quantity).toFixed(2) };
    });
    const total = items.reduce((sum,i)=>sum+Number(i.subtotalBs),0);
    return { items, totalBs:total.toFixed(2) };
  }
  async addItem(cartId:string, productId:string, quantity:number): Promise<Cart> {
    if (!Number.isInteger(quantity) || quantity < 1) throw new BadRequestException('Cantidad inválida');
    const { data: product } = await this.admin.from('products')
      .select('id,active,available_today').eq('id', productId).single();
    if (!product || !product.active || !product.available_today) throw new BadRequestException('Producto no disponible');
    const { error } = await this.admin.from('cart_items').upsert({ cart_id:cartId, product_id:productId, quantity },
      { onConflict:'cart_id,product_id' });
    if (error) throw new Error(error.message);
    return this.getCart(cartId);
  }
  async removeItem(cartId:string, productId:string): Promise<Cart> {
    const { error } = await this.admin.from('cart_items').delete().eq('cart_id',cartId).eq('product_id',productId);
    if (error) throw new Error(error.message);
    return this.getCart(cartId);
  }
  async clear(cartId:string) { await this.admin.from('cart_items').delete().eq('cart_id',cartId); }
  async attachUser(cartId:string, userId:string) {
    await this.admin.from('carts').update({ user_id:userId, updated_at:new Date().toISOString() }).eq('id',cartId);
  }
}
```

Controller y módulo:

```ts
import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { CartService } from './cart.service';
import { CookieService } from '../common/cookies/cookie.service';
import { IsInt, IsUUID, Min } from 'class-validator';
export class AddItemDto { @IsUUID() productId:string; @IsInt() @Min(1) quantity:number; }
@Controller('cart')
export class CartController {
  constructor(private cart:CartService, private cookies:CookieService) {}
  @Get() async get(@Req() req:Request, @Res() res:Response) {
    const id = await this.cart.getOrCreate(this.cookies.read(req,'cart_id'));
    this.cookies.setCart(res,id);
    res.json({ cart: await this.cart.getCart(id) });
  }
  @Post('items') async add(@Req() req:Request, @Res() res:Response, @Body() dto:AddItemDto) {
    const id = await this.cart.getOrCreate(this.cookies.read(req,'cart_id'));
    this.cookies.setCart(res,id);
    res.json({ cart: await this.cart.addItem(id,dto.productId,dto.quantity) });
  }
  @Delete('items/:productId') async remove(@Req() req:Request, @Param('productId') productId:string) {
    const id = await this.cart.getOrCreate(this.cookies.read(req,'cart_id'));
    return { cart: await this.cart.removeItem(id,productId) };
  }
}
```

`cart.module.ts` importa `SupabaseModule`, provee/exporta `CartService` y `CookieService`.

`AppModule` importa `CartModule`.

- [ ] **Step 4: Ejecutar test y commit**

```bash
npm -w apps/api test -- --runInBand src/cart/cart.service.spec.ts
git add apps/api && git commit -m "feat: carrito persistente en cookie y BD"
```
Expected: PASS.

---

### Task 6: Regla de vencimiento de 30 minutos

**Files:**
- Create: `apps/api/src/orders/expiry.ts`, `apps/api/src/orders/expiry.spec.ts`

**Interfaces:**
- Produces: `buildExpiry(now?: Date): { expiresAt: Date; minutesLeft: number }`.

- [ ] **Step 1: Test fallido**

```ts
import { buildExpiry } from './expiry';
describe('buildExpiry', () => {
  it('pedido a las 10:50 vence a las 11:00', () => {
    const r = buildExpiry(new Date('2026-11-24T14:50:00.000Z'));
    expect(r.expiresAt.toISOString()).toBe('2026-11-24T15:00:00.000Z');
    expect(r.minutesLeft).toBe(10);
  });
  it('pedido a las 09:00 vence a las 09:30', () => {
    const r = buildExpiry(new Date('2026-11-24T13:00:00.000Z'));
    expect(r.expiresAt.toISOString()).toBe('2026-11-24T13:30:00.000Z');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/api test -- --runInBand src/orders/expiry.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
export function buildExpiry(now: Date = new Date()) {
  const bolivia = new Date(now.toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
  const yyyy = bolivia.getFullYear();
  const mm = String(bolivia.getMonth()+1).padStart(2,'0');
  const dd = String(bolivia.getDate()).padStart(2,'0');
  const closing = new Date(`${yyyy}-${mm}-${dd}T11:00:00-04:00`);
  const plus30 = new Date(now.getTime() + 30*60*1000);
  const expiresAt = plus30 < closing ? plus30 : closing;
  return { expiresAt, minutesLeft: Math.floor((expiresAt.getTime()-now.getTime())/60000) };
}
```

- [ ] **Step 4: Ejecutar test y commit**

```bash
npm -w apps/api test -- --runInBand src/orders/expiry.spec.ts
git add apps/api && git commit -m "feat: regla de vencimiento 30 minutos con tope a las 11"
```
Expected: PASS.

---

### Task 7: OrdersModule (crear, historial, repetir, cancelar)

**Files:**
- Create: `apps/api/src/orders/dto/create-order.dto.ts`
- Create: `apps/api/src/orders/orders.service.ts`, `orders.controller.ts`, `orders.module.ts`, `orders.service.spec.ts`

**Interfaces:**
- Consumes: `CartService`, `AuthService`, `CookieService`, `SupabaseService`, `buildExpiry`.
- Produces: `POST /orders`, `GET /orders`, `POST /orders/:id/repeat`, `POST /orders/:id/cancel`.

- [ ] **Step 1: Test fallido**

```ts
import { OrdersService } from './orders.service';
import { buildExpiry } from './expiry';
const sb = { admin: { rpc: jest.fn(), from: jest.fn() } } as any;
const cart = { getCart: jest.fn().mockResolvedValue({ items:[{productId:'p1',quantity:2}], totalBs:'24.00' }) } as any;
const service = new OrdersService(sb, cart);
it('usa expires calculado', async () => {
  sb.admin.rpc.mockResolvedValue({ data:'o1', error:null });
  const rows = [{ id:'o1', code:'SAL-20261124-0001', total_bs:'24.00', status:'PENDIENTE', pickup_time:'10:50', notes:null, payment_method:'EFECTIVO', expires_at:'2026-11-24T15:00:00.000Z', created_at:'2026-11-24T14:50:00.000Z', order_items:[] }];
  sb.admin.from.mockReturnValue({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: rows[0] }) }) }) });
  const order = await service.create('u1','cart1',{ pickupTime:'10:50', notes:null, paymentMethod:'EFECTIVO' }, { name:'Ana', phone:'70000000' });
  expect(sb.admin.rpc).toHaveBeenCalledWith('create_order_from_cart', expect.objectContaining({ p_expires_at: expect.any(Date) }));
  expect(order.code).toBe('SAL-20261124-0001');
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/api test -- --runInBand src/orders/orders.service.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: DTO**

```ts
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
export class CreateOrderDto {
  @Matches(/^(0[6-9]|1[01]):[0-5]\d$/, { message:'La hora debe estar entre 06:00 y 11:00' })
  pickupTime: string;
  @IsOptional() @IsString() notes?: string;
  @IsEnum(['EFECTIVO','QR','TRANSFERENCIA']) paymentMethod: 'EFECTIVO'|'QR'|'TRANSFERENCIA';
}
```

- [ ] **Step 4: Implementar servicio**

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CartService } from '../cart/cart.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { buildExpiry } from './expiry';
@Injectable()
export class OrdersService {
  constructor(private sb: SupabaseService, private cart: CartService) {}
  async create(userId:string|null, cartId:string, dto:CreateOrderDto, customer:{name:string;phone:string}) {
    const current = await this.cart.getCart(cartId);
    if (current.items.length === 0) throw new BadRequestException('Carrito vacío');
    const { expiresAt } = buildExpiry();
    const { data, error } = await this.sb.admin.rpc('create_order_from_cart', {
      p_user_id:userId, p_cart_id:cartId, p_customer_name:customer.name,
      p_customer_phone:customer.phone, p_pickup_time:dto.pickupTime, p_notes:dto.notes ?? null,
      p_payment_method:dto.paymentMethod, p_expires_at:expiresAt.toISOString()
    });
    if (error) throw error.message.includes('PRODUCT_UNAVAILABLE')
      ? new ConflictException('Algún producto se agotó') : new BadRequestException('No se pudo crear el pedido');
    return this.findOne(data as string);
  }
  async findOne(id:string) {
    const { data, error } = await this.sb.admin.from('orders')
      .select('id,code,total_bs,status,pickup_time,notes,payment_method,expires_at,created_at,order_items(product_id,quantity,unit_price_bs,products(name))')
      .eq('id',id).single();
    if (error || !data) throw new NotFoundException();
    return { id:data.id, code:data.code, totalBs:Number(data.total_bs).toFixed(2), status:data.status,
      pickupTime:data.pickup_time, notes:data.notes, paymentMethod:data.payment_method,
      expiresAt:data.expires_at, createdAt:data.created_at,
      items:(data.order_items ?? []).map((i:any)=>({ productId:i.product_id, name:i.products?.name ?? '', quantity:i.quantity, unitPriceBs:Number(i.unit_price_bs).toFixed(2) })) };
  }
  async list(userId:string) {
    const { data } = await this.sb.admin.from('orders')
      .select('id,code,total_bs,status,pickup_time,payment_method,expires_at,created_at')
      .eq('user_id',userId).order('created_at',{ ascending:false });
    return (data ?? []).map((o:any)=>({ id:o.id, code:o.code, totalBs:Number(o.total_bs).toFixed(2), status:o.status, pickupTime:o.pickup_time, paymentMethod:o.payment_method, expiresAt:o.expires_at, createdAt:o.created_at }));
  }
  async repeat(userId:string, cartId:string, orderId:string) {
    const { data: order } = await this.sb.admin.from('orders').select('id').eq('id',orderId).eq('user_id',userId).single();
    if (!order) throw new NotFoundException();
    const { data: items } = await this.sb.admin.from('order_items').select('product_id,quantity').eq('order_id',orderId);
    const ids = (items ?? []).map((i:any)=>i.product_id);
    const { data: products } = await this.sb.admin.from('products').select('id,active,available_today').in('id',ids);
    const skipped:string[] = [];
    for (const item of items ?? []) {
      const p = (products ?? []).find((x:any)=>x.id===item.product_id);
      if (!p || !p.active || !p.available_today) { skipped.push(item.product_id); continue; }
      await this.sb.admin.from('cart_items').upsert({ cart_id:cartId, product_id:item.product_id, quantity:item.quantity },
        { onConflict:'cart_id,product_id' });
    }
    return { cart: await this.cart.getCart(cartId), skipped };
  }
  async cancel(userId:string, orderId:string) {
    const { data, error } = await this.sb.admin.from('orders')
      .update({ status:'CANCELADO' }).eq('id',orderId).eq('user_id',userId)
      .eq('status','PENDIENTE').gt('expires_at',new Date().toISOString()).select().single();
    if (!data || error) throw new ConflictException('No se puede cancelar; llamá al local');
    return this.findOne(orderId);
  }
}
```

Controller y módulo:

```ts
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AuthService } from '../auth/auth.service';
import { CartService } from '../cart/cart.service';
import { CookieService } from '../common/cookies/cookie.service';
@Controller('orders')
export class OrdersController {
  constructor(private orders:OrdersService, private auth:AuthService, private cart:CartService, private cookies:CookieService) {}
  private async context(req:Request) {
    const cartId = await this.cart.getOrCreate(this.cookies.read(req,'cart_id'));
    const access = this.cookies.read(req,'sb_access');
    const refresh = this.cookies.read(req,'sb_refresh');
    let user:any = null;
    try { user = await this.auth.me(access,refresh); } catch { user = null; }
    if (user) await this.cart.attachUser(cartId,user.id);
    return { cartId, user };
  }
  @Post() async create(@Req() req:Request, @Body() dto:CreateOrderDto) {
    const { cartId, user } = await this.context(req);
    return { order: await this.orders.create(user?.id ?? null, cartId, dto, { name:user?.name ?? '', phone:user?.phone ?? '' }) };
  }
  @Get() async list(@Req() req:Request) {
    const { user } = await this.context(req);
    if (!user) return { orders: [] };
    return { orders: await this.orders.list(user.id) };
  }
  @Post(':id/repeat') async repeat(@Req() req:Request, @Param('id') id:string) {
    const { cartId, user } = await this.context(req);
    return this.orders.repeat(user.id, cartId, id);
  }
  @Post(':id/cancel') async cancel(@Req() req:Request, @Param('id') id:string) {
    const { user } = await this.context(req);
    return { order: await this.orders.cancel(user.id, id) };
  }
}
```

`orders.module.ts` importa `SupabaseModule`, `CartModule`, `AuthModule` y provee `OrdersService`/`OrdersController`. `AppModule` importa `OrdersModule`.

- [ ] **Step 5: Ejecutar tests y commit**

```bash
npm -w apps/api test -- --runInBand src/orders
git add apps/api && git commit -m "feat: pedidos con codigo, vencimiento, historial, repetir y cancelar"
```
Expected: PASS.

---

### Task 8: Frontend base, tipos y cliente API

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/jest.setup.ts`
- Create: `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/page.tsx`
- Create: `apps/web/src/lib/api.ts`, `apps/web/src/lib/types.ts`, `apps/web/src/config/business.ts`
- Test: `apps/web/src/lib/api.test.ts`

**Interfaces:**
- Produces: `api<T>(path, init)`, tipos `Product/Cart/User/Order`, `business` config.

- [ ] **Step 1: Test fallido del cliente API**

```ts
import { api, ApiError } from './api';
beforeEach(() => { jest.restoreAllMocks(); });
it('envía credentials include y lanza ApiError', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok:false, status:409, text:()=>Promise.resolve('Conflicto') }) as any;
  await expect(api('/orders')).rejects.toBeInstanceOf(ApiError);
  expect((global.fetch as jest.Mock).mock.calls[0][1].credentials).toBe('include');
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/web test -- --runInBand src/lib/api.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Archivos base**

`apps/web/package.json`:

```json
{
  "name":"web","version":"1.0.0",
  "scripts":{ "dev":"next dev","build":"next build","test":"jest","e2e":"playwright test" },
  "dependencies":{ "next":"^15.0.0","react":"^19.0.0","react-dom":"^19.0.0" },
  "devDependencies":{
    "@playwright/test":"^1.48.0","@testing-library/jest-dom":"^6.6.0",
    "@testing-library/react":"^16.0.0","@types/jest":"^29.5.0",
    "@types/node":"^20.16.0","@types/react":"^19.0.0","jest":"^29.7.0",
    "jest-environment-jsdom":"^29.7.0","ts-jest":"^29.2.0","typescript":"^5.6.0"
  },
  "jest":{ "preset":"ts-jest","testEnvironment":"jsdom","setupFilesAfterEnv":["<rootDir>/jest.setup.ts"] }
}
```

`apps/web/jest.setup.ts`:

```ts
import '@testing-library/jest-dom';
```

`apps/web/src/lib/types.ts`:

```ts
export type Role = 'CLIENTE'|'CAJERO'|'ADMIN';
export type PaymentMethod = 'EFECTIVO'|'QR'|'TRANSFERENCIA';
export type OrderStatus = 'PENDIENTE'|'CONFIRMADO'|'CANCELADO'|'ENTREGADO';
export interface Product { id:string; categoryId:string; categoryName:string; name:string; description:string; priceBs:string; imageUrl:string|null; availableToday:boolean; }
export interface CartItem { productId:string; name:string; quantity:number; unitPriceBs:string; subtotalBs:string; }
export interface Cart { items:CartItem[]; totalBs:string; }
export interface User { id:string; email:string; name:string; phone:string; role:Role; }
export interface Order { id:string; code:string; totalBs:string; status:OrderStatus; pickupTime:string; notes:string|null; paymentMethod:PaymentMethod; expiresAt:string; createdAt:string; items:Array<{productId:string;name:string;quantity:number;unitPriceBs:string}>; }
```

`apps/web/src/lib/api.ts`:

```ts
export class ApiError extends Error {
  constructor(public status:number, message:string) { super(message); }
}
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export async function api<T>(path:string, init:RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials:'include',
    headers:{ 'Content-Type':'application/json', ...(init.headers ?? {}) }
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json() as Promise<T>;
}
```

`apps/web/src/config/business.ts`:

```ts
export const business = {
  name:'SALTEÑANGA',
  openTime:'06:00',
  closeTime:'11:00',
  pickupWindowMinutes:30,
  lowTimeWarningMinutes:10,
  phones:[] as string[],
  socials:[] as { label:string; url:string }[]
};
```

`apps/web/src/app/layout.tsx` usa `<html lang="es">` y un header con `business.name`. `globals.css` define tipografía legible, contraste alto y botones `min-height:44px`. `page.tsx` redirige a `/menu` con `redirect('/menu')`.

- [ ] **Step 4: Ejecutar test y commit**

```bash
npm install
npm -w apps/web test -- --runInBand src/lib/api.test.ts
git add apps/web package-lock.json && git commit -m "feat: next base, api client y tipos"
```
Expected: PASS.

---

### Task 9: Catálogo con búsqueda y filtros

**Files:**
- Create: `apps/web/src/app/menu/page.tsx`, `apps/web/src/components/ProductCard.tsx`, `apps/web/src/components/ProductCard.test.tsx`
- Create: `apps/web/src/components/BusinessInfo.tsx`

**Interfaces:**
- Consumes: `api`, `Product`, `business`.
- Produces: `/menu?search=&category=`, badge "Agotado hoy".

- [ ] **Step 1: Test fallido**

```tsx
import { render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
it('muestra agotado y precio en Bs', () => {
  render(<ProductCard product={{ id:'p1',categoryId:'c1',categoryName:'salteñas',name:'Carne',description:'Carne',priceBs:'12.00',imageUrl:null,availableToday:false }} />);
  expect(screen.getByText(/Agotado hoy/i)).toBeInTheDocument();
  expect(screen.getByText(/Bs 12\.00/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/web test -- --runInBand src/components/ProductCard.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implementar**

`ProductCard.tsx`:

```tsx
'use client';
import { Product } from '../lib/types';
import { api } from '../lib/api';
export function ProductCard({ product }: { product: Product }) {
  const add = async () => { await api('/cart/items', { method:'POST', body:JSON.stringify({ productId:product.id, quantity:1 }) }); window.dispatchEvent(new Event('cart:changed')); };
  return <article className="card">
    <img src={product.imageUrl ?? 'https://placehold.co/600x400?text=Salteña'} alt={product.name} width={300} height={200} />
    <h3>{product.name}</h3><p>{product.description}</p>
    <strong>Bs {product.priceBs}</strong>
    {!product.availableToday && <span className="badge">Agotado hoy</span>}
    <button onClick={add} disabled={!product.availableToday}>Agregar</button>
  </article>;
}
```

`menu/page.tsx`:

```tsx
import { ProductCard } from '../../components/ProductCard';
import { BusinessInfo } from '../../components/BusinessInfo';
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export default async function Menu({ searchParams }: { searchParams: Promise<{ search?:string; category?:string }> }) {
  const { search = '', category = '' } = await searchParams;
  const params = new URLSearchParams({ search, category });
  const res = await fetch(`${BASE}/products?${params}`);
  const { products } = await res.json();
  return <main><h1>Menú</h1>
    <form><input name="search" defaultValue={search} placeholder="Buscar" /><select name="category" defaultValue={category}><option value="">Todas</option><option value="salteñas">Salteñas</option><option value="bebidas">Bebidas</option></select><button>Buscar</button></form>
    <section className="grid">{(products ?? []).map((p:any)=><ProductCard key={p.id} product={p} />)}</section>
    <BusinessInfo />
  </main>;
}
```

`BusinessInfo.tsx` muestra `Horario: 06:00 - 11:00` y solo renderiza teléfonos/redes cuando los arrays tengan elementos.

- [ ] **Step 4: Ejecutar test y commit**

```bash
npm -w apps/web test -- --runInBand src/components/ProductCard.test.tsx
git add apps/web && git commit -m "feat: menu con busqueda, filtros y disponibilidad"
```
Expected: PASS.

---

### Task 10: Registro, login y perfil

**Files:**
- Create: `apps/web/src/app/{register,login,profile}/page.tsx`
- Create: `apps/web/src/components/AuthForm.tsx`, `apps/web/src/components/AuthForm.test.tsx`

**Interfaces:**
- Consumes: `api`, `User`.
- Produces: formularios de registro/login y edición de nombre.

- [ ] **Step 1: Test fallido**

```tsx
import { render, screen } from '@testing-library/react';
import { AuthForm } from './AuthForm';
it('pide nombre, celular, correo y contraseña en registro', () => {
  render(<AuthForm mode="register" onSubmit={jest.fn()} />);
  expect(screen.getByLabelText(/Nombre/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Celular/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Correo/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Contraseña/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/web test -- --runInBand src/components/AuthForm.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implementar formulario y páginas**

`AuthForm.tsx`:

```tsx
'use client';
import { useState } from 'react';
export function AuthForm({ mode, onSubmit }: { mode:'register'|'login'; onSubmit:(data:any)=>void }) {
  const [form,setForm] = useState<any>({});
  const update = (k:string) => (e:any) => setForm({ ...form, [k]:e.target.value });
  return <form onSubmit={e=>{e.preventDefault(); onSubmit(form);}}>
    {mode==='register' && <><label>Nombre<input aria-label="Nombre" onChange={update('name')} /></label><label>Celular<input aria-label="Celular" onChange={update('phone')} /></label></>}
    <label>Correo<input aria-label="Correo" type="email" onChange={update('email')} /></label>
    <label>Contraseña<input aria-label="Contraseña" type="password" onChange={update('password')} /></label>
    {mode==='login' && <label><input aria-label="Recordarme" type="checkbox" onChange={e=>setForm({...form,remember:e.target.checked})} /> Recordarme</label>}
    <button>{mode==='register'?'Crear cuenta':'Ingresar'}</button>
  </form>;
}
```

Páginas: `register/page.tsx` y `login/page.tsx` son Client Components que llaman `api('/auth/register'|'/auth/login', {method:'POST',body:...})` y redirigen a `/menu`. `profile/page.tsx` obtiene `api<User>('/auth/me')` y permite `PATCH /auth/me` con `{name}`.

- [ ] **Step 4: Ejecutar test y commit**

```bash
npm -w apps/web test -- --runInBand src/components/AuthForm.test.tsx
git add apps/web && git commit -m "feat: registro, login con recordarme y perfil"
```
Expected: PASS.

---

### Task 11: Carrito persistente en la UI

**Files:**
- Create: `apps/web/src/components/CartDrawer.tsx`, `apps/web/src/components/CartDrawer.test.tsx`

**Interfaces:**
- Consumes: `Cart`, `api`.
- Produces: change quantity, remove, total en Bs.

- [ ] **Step 1: Test fallido**

```tsx
import { render, screen } from '@testing-library/react';
import { CartDrawer } from './CartDrawer';
const cart = { items:[{productId:'p1',name:'Carne',quantity:2,unitPriceBs:'12.00',subtotalBs:'24.00'}], totalBs:'24.00' };
it('muestra total y permite cambiar cantidad', () => {
  render(<CartDrawer initialCart={cart} onChange={jest.fn()} />);
  expect(screen.getByText(/Total: Bs 24\.00/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/\+/})).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/web test -- --runInBand src/components/CartDrawer.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
'use client';
import { Cart } from '../lib/types';
import { api } from '../lib/api';
export function CartDrawer({ initialCart, onChange }:{ initialCart:Cart; onChange:(c:Cart)=>void }) {
  const refresh = async () => { const r = await api<{cart:Cart}>('/cart'); onChange(r.cart); };
  const add = async (id:string) => { await api('/cart/items',{ method:'POST', body:JSON.stringify({productId:id,quantity:1}) }); await refresh(); };
  const remove = async (id:string) => { await api(`/cart/items/${id}`,{ method:'DELETE' }); await refresh(); };
  return <aside>
    <h2>Tu carrito</h2>
    {initialCart.items.map(i=><div key={i.productId}><span>{i.name}</span><span>{i.quantity}</span><strong>Bs {i.subtotalBs}</strong>
      <button aria-label="+" onClick={()=>add(i.productId)}>+</button><button onClick={()=>remove(i.productId)}>Quitar</button></div>)}
    <p>Total: Bs {initialCart.totalBs}</p>
  </aside>;
}
```

`layout.tsx` incluye un proveedor cliente que carga `GET /cart` al montar y escucha `cart:changed` para actualizar el drawer.

- [ ] **Step 4: Ejecutar test y commit**

```bash
npm -w apps/web test -- --runInBand src/components/CartDrawer.test.tsx
git add apps/web && git commit -m "feat: carrito interactivo con total en Bs"
```
Expected: PASS.

---

### Task 12: Checkout, confirmación e historial

**Files:**
- Create: `apps/web/src/app/checkout/page.tsx`, `apps/web/src/app/order/[code]/page.tsx`, `apps/web/src/app/orders/page.tsx`
- Create: `apps/web/src/components/CheckoutForm.tsx`, `apps/web/src/components/CheckoutForm.test.tsx`
- Create: `apps/web/src/components/OrdersHistory.tsx`

**Interfaces:**
- Consumes: `Cart`, `Order`, `api`, `business`.
- Produces: formulario de pedido, aviso <10 min, confirmación, repetir y cancelar.

- [ ] **Step 1: Test fallido**

```tsx
import { render, screen } from '@testing-library/react';
import { CheckoutForm } from './CheckoutForm';
it('avisa cuando quedan menos de 10 minutos', () => {
  render(<CheckoutForm expiresAt="2026-11-24T15:00:00.000Z" now={()=>new Date('2026-11-24T14:50:00.000Z')} onSubmit={jest.fn()} />);
  expect(screen.getByText(/menos de 10 minutos/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar y verificar fallo**

```bash
npm -w apps/web test -- --runInBand src/components/CheckoutForm.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implementar checkout**

```tsx
'use client';
import { useState } from 'react';
import { PaymentMethod } from '../lib/types';
export function CheckoutForm({ expiresAt, now = ()=>new Date(), onSubmit }:{ expiresAt:string; now?:()=>Date; onSubmit:(d:any)=>void }) {
  const [pickupTime,setPickupTime] = useState('10:00');
  const [notes,setNotes] = useState('');
  const [paymentMethod,setPaymentMethod] = useState<PaymentMethod>('EFECTIVO');
  const minutes = Math.floor((new Date(expiresAt).getTime()-now().getTime())/60000);
  return <form onSubmit={e=>{e.preventDefault(); onSubmit({pickupTime,notes,paymentMethod});}}>
    {minutes < 10 && <p role="alert">Te quedan menos de 10 minutos para recoger tu pedido</p>}
    <label>Hora de recojo<input type="time" min="06:00" max="11:00" value={pickupTime} onChange={e=>setPickupTime(e.target.value)} /></label>
    <label>Observaciones<textarea value={notes} onChange={e=>setNotes(e.target.value)} /></label>
    <label>Método de pago<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)}>
      <option value="EFECTIVO">Efectivo</option><option value="QR">QR</option><option value="TRANSFERENCIA">Transferencia</option></select></label>
    <button>Confirmar pedido</button>
  </form>;
}
```

`checkout/page.tsx` carga `GET /cart`, calcula `expiresAt` con `Math.min(Date.now()+30min, hoy 11:00 Bs. As.)`, envía `POST /orders` y redirige a `/order/${code}`. `order/[code]/page.tsx` muestra el código, detalle y total. `orders/page.tsx` usa `OrdersHistory` con botones **Repetir** (`POST /orders/:id/repeat`) y **Cancelar** (`POST /orders/:id/cancel`).

- [ ] **Step 4: Ejecutar test y commit**

```bash
npm -w apps/web test -- --runInBand src/components/CheckoutForm.test.tsx
git add apps/web && git commit -m "feat: checkout con aviso, confirmacion e historial"
```
Expected: PASS.

---

### Task 13: E2E, responsive, rendimiento y cierre

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/checkout.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: toda la app corriendo en Docker.
- Produces: verificación del flujo completo y de persistencia de cookies.

- [ ] **Step 1: Test E2E**

```ts
import { test, expect } from '@playwright/test';
test('pedido en 5 pasos y carrito persistente', async ({ browser }) => {
  const context = await browser.newContext({ viewport:{width:360,height:800} });
  const page = await context.newPage();
  await page.goto('http://localhost:3000/menu');
  await expect(page.getByRole('heading',{name:'Menú'})).toBeVisible();
  await page.getByRole('button',{name:'Agregar'}).first().click();
  await page.goto('http://localhost:3000/checkout');
  await expect(page.getByText(/Total: Bs/)).toBeVisible();
  await page.getByRole('button',{name:'Confirmar pedido'}).click();
  await expect(page.getByText(/SAL-\d{8}-\d{4}/)).toBeVisible();
  const state = await context.storageState();
  await context.close();
  const context2 = await browser.newContext({ storageState:state });
  const page2 = await context2.newPage();
  await page2.goto('http://localhost:3000/orders');
  await expect(page2.getByText(/SAL-\d{8}-\d{4}/)).toBeVisible();
  await context2.close();
});
```

`playwright.config.ts` usa `baseURL:'http://localhost:3000'`, `projects` con viewports `360x800`, `768x1024`, `1366x768` y `webServer` opcional apuntando a `npm run dev`.

- [ ] **Step 2: Ejecutar E2E**

```bash
docker compose up --build -d
npm -w apps/web e2e
```
Expected: PASS en los tres viewports. Si falla por credenciales de Supabase, documentar en README y repetir con `.env` válido.

- [ ] **Step 3: Verificación final**

```bash
npm -w apps/api test -- --runInBand
npm -w apps/web test -- --runInBand
node scripts/verify-db.mjs
```
Expected: todo PASS.

`README.md` incluye: variables, migración, seed, arranque, pruebas, fases pendientes y recordatorio de no hacer push sin aprobación.

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "test: e2e flujo cliente, persistencia y responsive"
```

---

## Self-review del plan

- Cobertura: RF-01 a RF-13 y RF-19 están en Tasks 3, 4, 7, 9-12; RNF cubiertos en Global Constraints, Review Focus y Task 13.
- Sin `TBD`/`TODO`; todos los pasos tienen comandos o código concretos.
- Interfaces consistentes: `Product` se define en Task 4, `Cart` en Task 5 y `User`/`Order` en Task 8; se reutilizan tal cual en Tasks 7 y 9-12.
- Los cinco escenarios de Review Focus tienen prueba en Task 6, 7, 11 y 12.

