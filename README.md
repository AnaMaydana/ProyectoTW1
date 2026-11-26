# SALTEÑANGA — Fases 1, 2 y 3: tienda, cajero y administración

Tienda online para clientes y panel interno: catálogo en Bs, carrito persistente, pedidos con código e historial, gestión del cajero con cambio de estados y entrega, y administración de productos, inventario y reportes.

## Arquitectura

- **Next.js** (`:3000`) renderiza la UI y consume la API.
- **NestJS** (`:3001`) es dueño de la API, del acceso a Postgres y de las cookies `httpOnly` (`cart_id`, `sb_access`).
- **Supabase (proyecto salteñanga)** provee Postgres. La autenticación es propia: `bcryptjs` + JWT firmado, sin Supabase Auth.
- El esquema lógico es `saltenanga_schema.sql`; el ejecutable, con las correcciones aditivas, es `saltenanga_schema_adaptado.sql`.
- Docker Compose levanta solo `web` y `api`.

## Configuración

1. Copiar `.env.example` a `.env` y completar con las credenciales del proyecto Supabase **salteñanga**:

```text
DATABASE_URL=<URI de conexión directa de Supabase, puerto 5432>
JWT_SECRET=<secreto largo y aleatorio>
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

En este entorno `.env` ya está configurado con el **session pooler** (`aws-1-us-west-2.pooler.supabase.com:5432`) y el rol dedicado `saltenanga_app` (credencial local, no versionada). El host directo `db.<ref>.supabase.co` no resuelve desde aquí, así que se usa el pooler.

2. El esquema y el seed ya están aplicados en Supabase. Para reaplicarlos desde cero:

```bash
# Con la URI de Supabase en DATABASE_URL:
psql "$DATABASE_URL" -f saltenanga_schema_adaptado.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

3. Verificar:

```bash
node scripts/verify-schema.mjs
node scripts/verify-db.mjs
```

`saltenanga_schema.sql` se conserva con el contenido exacto entregado. `saltenanga_schema_adaptado.sql` mantiene esos nombres de tablas y columnas y agrega: carrito, datos de cliente invitado, vencimiento, disponibilidad del día, consistencia de subtotal, cajero y fecha de entrega.

`supabase/migrations/0002_rls_policies.sql` habilita RLS en las 12 tablas: lectura pública de solo filas activas del catálogo (`categoria`, `producto`, `inventario`, `metodo_pago`) y acceso denegado a `anon`/`authenticated` en el resto. El rol de la API (`saltenanga_app`) tiene políticas `app_acceso` en las 12 tablas; `anon`/`authenticated` siguen sin acceso a datos de negocio. `supabase/migrations/0001_init.sql` pertenece al modelo anterior y no se aplica.

## Arranque

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:3001

Dentro de Docker, el servidor de Next.js llama a la API por `API_INTERNAL_URL=http://api:3001` (nombre de servicio); el navegador sigue usando `NEXT_PUBLIC_API_URL=http://localhost:3001`. `API_INTERNAL_URL` lo define `docker-compose.yml`, no hace falta ponerlo en `.env`.

Sin Docker, con Node 20+:

```bash
npm install
npm -w apps/api run start:dev
npm -w apps/web run dev
```

### Crear el primer administrador

Con `ADMIN_EMAIL` y `ADMIN_PASSWORD` definidos en `.env`:

```bash
node --env-file=.env scripts/create-admin.mjs
```

El script es idempotente: si el correo ya existe, lo promueve a ADMIN. Después iniciá sesión con ese correo y vas a ver el enlace "Administración" en la navegación. Ese mismo usuario puede operar `/cashier`; el enlace "Cajero" aparece para `CAJERO` y `ADMIN`.

## Reglas de negocio

- Horario de atención: **06:00–11:00** (América/La_Paz).
- Pedidos solo para el día actual; hora aproximada de recojo dentro del horario.
- Ventana de recojo: **30 minutos desde la confirmación**, con tope a las 11:00 (`pedido.fecha_expiracion`).
- Si faltan **menos de 10 minutos**, el checkout muestra una advertencia.
- Código de pedido: `SAL-AAAAMMDD-####`.
- Método de pago: Efectivo, QR o Transferencia (solo se registra; sin cobro online). `TARJETA` existe en la BD pero la API la rechaza.
- El cliente puede cancelar solo mientras el pedido esté `PENDIENTE` y no haya vencido; si no, debe llamar al local.

## Pruebas

```bash
npm install
npm -w apps/api test -- --runInBand
npm -w apps/web test -- --runInBand
npm -w apps/api run build
npm -w apps/web run build
```

E2E (requiere la app corriendo, Supabase configurado y los navegadores de Playwright instalados):

```bash
npx playwright install chromium
npm -w apps/web run e2e
```

Los tres proyectos de Playwright cubren 360×800, 768×1024 y 1366×768: registro, carrito persistente al cerrar el navegador, checkout y código de pedido, administración y entrega del cajero. Cada corrida crea un usuario y un pedido reales en Supabase.

El spec `admin.spec.ts` requiere `E2E_ADMIN_EMAIL` y `E2E_ADMIN_PASSWORD` (credenciales creadas con `scripts/create-admin.mjs`). Si no están definidas, se omite. `cashier.spec.ts` usa las mismas variables y se omite si no están definidas. Crea un cliente y un pedido reales durante la corrida.

Si se ejecutan fuera del horario 06:00–11:00, fijar el reloj del negocio solo para la corrida (se ignora cuando `NODE_ENV=production`):

```powershell
$env:E2E_FIXED_NOW = '2026-11-25T14:00:00.000Z'
npm -w apps/web run e2e
```

Con Docker, esa variable debe estar en `.env` al recrear el contenedor `api` (las variables del host no se propagan). Después de la corrida, quitá la línea y recreá `api` para volver a la hora real.

## Fases pendientes

- Fase 4: QR/transferencia y descarga de comprobantes.
- Fase 5: despliegue con HTTPS, rendimiento y disponibilidad.

**No hacer push a GitHub sin la aprobación final del usuario.**
