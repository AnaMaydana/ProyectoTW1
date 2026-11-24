# SALTEÑANGA — Fase 1: cliente y pedidos

Tienda online para clientes: catálogo en Bs, carrito persistente, login con cookies persistentes, pedidos para recoger el mismo día con código, historial, repetir y cancelar.

## Arquitectura

- **Next.js** (`:3000`) renderiza la UI y consume la API.
- **NestJS** (`:3001`) es dueño de la API y escribe las cookies `httpOnly` (`cart_id`, `sb_access`, `sb_refresh`).
- **Supabase remoto** provee Auth y Postgres. No se levanta Supabase en Docker.
- Docker Compose levanta solo `web` y `api`.

## Configuración

1. Crear un proyecto nuevo de Supabase llamado **salteñanga**.
2. Copiar `.env.example` a `.env` y completar con las credenciales de **ese** proyecto:

```text
DATABASE_URL=<cadena postgres del proyecto salteñanga>
SUPABASE_URL=<url del proyecto salteñanga>
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
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

3. Aplicar esquema y datos de prueba:

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

4. Verificar:

```bash
node scripts/verify-schema.mjs
node scripts/verify-db.mjs
```

Para pruebas de registro/login, desactivar la confirmación de correo en Supabase Auth o crear un usuario de prueba manualmente.

## Arranque

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:3001

Sin Docker, con Node 20+:

```bash
npm install
npm -w apps/api run start:dev
npm -w apps/web run dev
```

## Reglas de negocio

- Horario de atención: **06:00–11:00** (América/La_Paz).
- Pedidos solo para el día actual; hora aproximada de recojo dentro del horario.
- Ventana de recojo: **30 minutos desde la confirmación**, con tope a las 11:00.
- Si faltan **menos de 10 minutos**, el checkout muestra una advertencia.
- Código de pedido: `SAL-AAAAMMDD-####`.
- Método de pago: Efectivo, QR o Transferencia (solo se registra; sin cobro online).
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

Los tres proyectos de Playwright cubren 360×800, 768×1024 y 1366×768: registro, carrito persistente al cerrar el navegador, checkout y código de pedido.

## Fases pendientes

- Fase 2: panel del cajero, realtime, cambio de estados y entrega.
- Fase 3: administración de productos, inventario y reportes.
- Fase 4: QR/transferencia y descarga de comprobantes.
- Fase 5: despliegue con HTTPS, rendimiento y disponibilidad.

**No hacer push a GitHub hasta la aprobación final del usuario.**
