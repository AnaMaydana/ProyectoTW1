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

Guardar `.env` sin BOM (UTF-8 sin marca de orden de bytes): con BOM, Node registra la primera clave como `\uFEFFDATABASE_URL` y los comandos con `node --env-file=.env` fallan con «Falta DATABASE_URL».

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
3. Si se quieren notificaciones de ACME, agregar literalmente `email tu-correo@ejemplo.com` al bloque global de `deploy/Caddyfile` antes de arrancar. No usar `{$ACME_EMAIL}`: el servicio `caddy` no lee `.env` y la directiva quedaría vacía. Sin correo, Caddy igual emite y renueva el certificado.
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

Si `DOMAIN` cambia, hay que reconstruir todos los servicios (`docker compose up -d --build`): `NEXT_PUBLIC_API_URL` se incrusta en el bundle de Next en build time y Caddy lee el dominio al arrancar. Reconstruir solo `web` dejaría a Caddy sirviendo el dominio anterior. El volumen `caddy_data` conserva el certificado viejo hasta que Caddy obtiene el nuevo. El servidor de Next llama a la API por `API_INTERNAL_URL=http://api:3001` en runtime, sin exponer el puerto 3001.

La API responde 502 si el upstream está caído. Los healthchecks solo informan del estado y ordenan el arranque (`depends_on` con `service_healthy`): Docker **no** reinicia contenedores `unhealthy` por sí solo; `restart: unless-stopped` actúa solo si el proceso termina. Para recuperar un contenedor marcado como unhealthy, reiniciarlo manualmente (`docker compose restart <servicio>`). `/health` es un liveness check (no consulta Supabase), así que una caída del proveedor externo no dispara reinicios en cascada.

Para probar el stack HTTPS en local, usar `DOMAIN=localhost`: Caddy usa su CA interna y `curl -k` acepta el certificado. Los E2E contra `https://localhost` usan `E2E_BASE_URL=https://localhost` y el overlay `deploy/docker-compose.e2e.yml`, que solo habilita el reloj fijo E2E; **no usarlo en producción**.

## Despliegue híbrido (Vercel + VPS)

La web se sirve desde Vercel en `https://www.$DOMAIN`; la API sigue en el VPS, detrás de Caddy, en `https://$DOMAIN/api`. Ambos comparten dominio raíz, así que las cookies `cart_id` y `sb_access` (host-only de `$DOMAIN`, `httpOnly`, `sameSite=lax`, `secure` en producción) siguen enviándose sin cambiar a `sameSite=none`.

### DNS

- `$DOMAIN` → registro **A** a la IP del VPS. Caddy termina el TLS del API y sigue enrutando solo `/api/*`.
- `www.$DOMAIN` → **CNAME** a `cname.vercel-dns.com`. Vercel termina el TLS de la web.

### Variables

- En el VPS, en `.env`: `DOMAIN=tu-dominio.com` (sin `https://` ni barra final) y `WEB_ORIGIN=https://www.tu-dominio.com`. Recrear la API con `docker compose up -d --build api`. Sin `WEB_ORIGIN`, la API acepta solo `https://$DOMAIN` (modo Fase 5).
- En el proyecto de Vercel: `NEXT_PUBLIC_API_URL=https://tu-dominio.com/api`. Se incrusta en el bundle durante el build; cambiarlo exige un redeploy.
- `VERCEL_TOKEN` se usa solo en el entorno del operador: nunca se guarda en el repo ni se muestra en logs.

### Despliegue

**Gate: no desplegar si falta cualquiera de estos tres prerrequisitos.** Verificar el token sin imprimirlo y confirmar DNS antes de cualquier comando de deploy:

```powershell
$DOMAIN = 'tu-dominio.com'
"token_present=$([bool]$env:VERCEL_TOKEN)"    # debe ser True
Resolve-DnsName -Name $DOMAIN -Type A          # IP del VPS
Resolve-DnsName -Name "www.$DOMAIN" -Type CNAME  # cname.vercel-dns.com
```

Si `token_present=False`, o el registro A no apunta al VPS, o el CNAME de `www` no apunta a Vercel, detenerse y corregirlo antes de seguir.

Desde la raíz del repo, con `VERCEL_TOKEN` ya exportado en el entorno:

```powershell
npm install
npx vercel@latest whoami
npx vercel@latest link --yes
'https://tu-dominio.com/api' | npx vercel@latest env add NEXT_PUBLIC_API_URL --environment production --yes
npx vercel@latest deploy --prod --yes
npx vercel@latest domains add www.tu-dominio.com --yes
npx vercel@latest alias set <url-del-deployment> www.tu-dominio.com
```

`link` vincula el proyecto existente (o crea uno si aún no hay). `env add` necesita ese proyecto vinculado. Si la variable ya existe porque cambiaste de dominio, usar `'https://nuevo-dominio.com/api' | npx vercel@latest env update NEXT_PUBLIC_API_URL --environment production --yes` (o `env add ... --force`) y luego un nuevo deploy; `env add` sin `--force` falla cuando la variable ya está definida. Reemplazar `<url-del-deployment>` por la URL que imprime `deploy`.

### Verificación

```bash
curl -I https://www.tu-dominio.com/menu       # 200, servido por Vercel
curl -i https://tu-dominio.com/api/health     # 200, {"status":"ok",...}, servido por Caddy
```

En el navegador, en `https://www.tu-dominio.com`: registro, carrito persistente al cerrar y checkout. Las peticiones a `/api/*` deben responder 200 y la cookie `cart_id` debe llegar a la API. Si aparece error de CORS, revisar `docker compose config` en el VPS (la variable `CORS_ORIGIN` del servicio `api` debe ser `https://www.tu-dominio.com`) y reiniciar con `docker compose restart api`.

Fuera del horario 06:00–11:00 de America/La_Paz se verifica solo el humo HTTP: el reloj fijo `E2E_FIXED_NOW` es exclusivo de pruebas locales y se ignora en producción.

### Rollback

Para volver a la web anterior: promover un deployment previo desde el dashboard de Vercel («Promote») o `npx vercel@latest rollback <url-del-deployment-anterior>`. El VPS y la base no se tocan, así que no hay migración inversa. Si el problema está en la API, volver al commit conocido en el VPS y ejecutar `docker compose up -d --build`.

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
