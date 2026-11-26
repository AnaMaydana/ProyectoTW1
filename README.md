# SALTEÑANGA — Fases 1, 2, 3, 4 y 5: tienda, cajero, administración, comprobantes y despliegue

Tienda online para clientes y panel interno: catálogo en Bs, carrito persistente, pedidos con código e historial, gestión del cajero con cambio de estados y entrega, administración de productos, inventario y reportes, y comprobante imprimible con QR de entrega, con un despliegue en VPS detrás de un único origen HTTPS con Caddy.

## Arquitectura

- **Next.js** (`:3000`) renderiza la UI y consume la API.
- **NestJS** (`:3001`) es dueño de la API, del acceso a Postgres y de las cookies `httpOnly` (`cart_id`, `sb_access`).
- **Supabase (proyecto salteñanga)** provee Postgres. La autenticación es propia: `bcryptjs` + JWT firmado, sin Supabase Auth.
- El esquema lógico es `saltenanga_schema.sql`; el ejecutable, con las correcciones aditivas, es `saltenanga_schema_adaptado.sql`.
- Docker Compose levanta `caddy`, `web` y `api`. Solo Caddy publica 80/443; `web` y `api` quedan en la red interna.
- Caddy termina TLS y enruta `https://$DOMAIN/api/*` a la API (quitando el prefijo) y el resto a Next.js. `DOMAIN` es la única fuente: `CORS_ORIGIN` y `NEXT_PUBLIC_API_URL` se derivan de él en Compose.

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
docker compose up -d --build
```

Con `DOMAIN=localhost` (valor por defecto), Caddy usa su CA interna:

- Web: https://localhost/menu
- API: https://localhost/api/health

`curl -k` acepta el certificado interno; el navegador puede pedir confirmación de seguridad la primera vez. `web` y `api` no publican puertos: todo el tráfico entra por Caddy. Dentro de Docker, el servidor de Next.js llama a la API por `API_INTERNAL_URL=http://api:3001` (nombre de servicio); el navegador usa `NEXT_PUBLIC_API_URL=https://$DOMAIN/api`. `API_INTERNAL_URL` lo define `docker-compose.yml`, no hace falta ponerlo en `.env`.

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
- El comprobante se descarga desde `/order/<código>/comprobante` (imprimir o guardar como PDF). El QR codifica solo el código `SAL-AAAAMMDD-####` para que el cajero lo lea como teclado; no es un QR de cobro.

## Despliegue en VPS

Requisitos: VPS con Docker y Docker Compose, dominio apuntando a la IP del servidor (registro A) y puertos 80/443 libres.

1. Instalar Docker y el plugin de Compose en el servidor.
2. Clonar el repositorio y copiar `.env.example` a `.env`. Completar `DATABASE_URL` (session pooler de Supabase), `JWT_SECRET` y definir `DOMAIN=tu-dominio.com` (sin `https://` ni barra final).
3. Si se quieren notificaciones de ACME, descomentar `ACME_EMAIL` en `.env` y agregar `email {$ACME_EMAIL}` al bloque global de `deploy/Caddyfile` antes de arrancar. Sin correo, Caddy igual emite y renueva el certificado.
4. Arrancar:

   ```bash
   docker compose up -d --build
   ```

5. Verificar (en el mismo shell, exportar primero la variable para que `curl` la expanda correctamente):

   ```bash
   export DOMAIN=tu-dominio.com          # el mismo valor que en .env
   curl -i https://$DOMAIN/api/health    # 200, {"status":"ok",...}
   curl -I https://$DOMAIN/menu          # 200
   docker compose ps                     # los tres servicios "healthy"
   ```

La primera vez, Caddy obtiene el certificado de Let's Encrypt automáticamente; el volumen `caddy_data` lo conserva y Caddy renueva solo. Si el DNS aún no apunta al VPS, la emisión falla: corregir el DNS y reiniciar `caddy`.

Comandos útiles:

```bash
docker compose logs -f caddy
docker compose logs -f web api
docker compose restart api
docker compose down            # conserva caddy_data y caddy_config
```

Para rollback, volver al commit conocido y ejecutar `docker compose up -d --build`; los volúmenes `caddy_data` y `caddy_config` se conservan, así que no se pierde el certificado.

Si `DOMAIN` cambia, hay que reconstruir `web`: `NEXT_PUBLIC_API_URL` se incrusta en el bundle de Next en build time (`docker compose up -d --build web`). El servidor de Next llama a la API por `API_INTERNAL_URL=http://api:3001` en runtime, sin exponer el puerto 3001.

La API responde 502 si el upstream está caído: el healthcheck reinicia el contenedor, pero no reescribe el proxy en caliente. `/health` es un liveness check (no consulta Supabase), así que una caída del proveedor externo no dispara reinicios en cascada.

Para probar el stack HTTPS en local, usar `DOMAIN=localhost`: Caddy usa su CA interna y `curl -k` acepta el certificado. Los E2E contra `https://localhost` usan `E2E_BASE_URL=https://localhost` y el overlay `deploy/docker-compose.e2e.yml`, que solo habilita el reloj fijo E2E; **no usarlo en producción**.

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

Con Docker, esa variable debe estar en `.env` al recrear el contenedor `api` (las variables del host no se propagan). El overlay local `deploy/docker-compose.e2e.yml` cambia `NODE_ENV` de `api` a `test` para que el reloj fijo se aplique; **no usarlo en producción**.

Con el stack HTTPS local:

```powershell
$env:E2E_BASE_URL = 'https://localhost'
docker compose -f docker-compose.yml -f deploy/docker-compose.e2e.yml up -d
npm -w apps/web run e2e
```

Después de la corrida, quitá la línea `E2E_FIXED_NOW` de `.env` y recreá el stack sin overlay para volver a la hora real.

**No hacer push a GitHub sin la aprobación final del usuario.**
