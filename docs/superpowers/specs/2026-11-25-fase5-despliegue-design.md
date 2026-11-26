# Fase 5: despliegue con HTTPS, rendimiento y disponibilidad — Design

## Contexto

SALTEÑANGA tiene las fases 1–4 implementadas y verificadas. Hoy el arranque es puramente de desarrollo:

- `apps/web/Dockerfile` y `apps/api/Dockerfile` terminan en `npm run dev` / `nest start --watch`.
- `docker-compose.yml` publica 3000 y 3001 directamente, sin proxy, sin TLS, sin healthchecks y sin `restart`.
- `next.config.ts` está vacío; no hay output standalone ni build de producción en ejecución.
- La API no expone ningún endpoint de salud (`main.ts` solo registra CORS, cookies y validación).
- Las cookies ya usan `secure` cuando `NODE_ENV=production` y `sameSite=lax`; CORS se toma de `env.corsOrigin`.
- Supabase provee Postgres mediante el session pooler; no hay BD local que gestionar.

La Fase 5 debe convertir ese arranque en un despliegue repetible en un VPS con Docker, con HTTPS automático, builds de producción y recuperación ante fallos.

## Objetivo y criterios de éxito

**Objetivo:** dejar el repositorio listo para que el usuario, con su dominio y su VPS, despliegue la app completa detrás de un único punto HTTPS, sin exponer puertos internos y con contenedores que se recuperan solos.

**Criterios de éxito:**

1. `https://$DOMAIN` sirve la web y `https://$DOMAIN/api/...` sirve la API con un certificado válido emitido automáticamente.
2. Los contenedores `web` y `api` no publican puertos al host; solo Caddy publica 80/443.
3. `GET /api/health` responde 200 con `{"status":"ok",...}` y el healthcheck de Compose lo usa.
4. Los tres servicios tienen `restart: unless-stopped` y `web`/`api` arrancan solo cuando su dependencia está sana.
5. La suite completa sigue verde: API 78+, Web 51+, builds, `verify-schema`, `verify-db` y E2E 9/9 en los tres viewports.
6. La verificación local con `DOMAIN=localhost` funciona sin DNS ni certificados reales.

## Fuera de alcance

- Ejecutar el despliegue real: no hay dominio ni acceso al VPS en este entorno. El usuario lo ejecuta.
- Subdominio `api.$DOMAIN`, publicar el puerto 3001, o cualquier topología con dos orígenes.
- Rate limiting, WAF, firma digital, backups automatizados, monitoreo externo y alarmas.
- Cambios en reglas de negocio, esquema SQL, migraciones o contratos de la API (salvo agregar `/health`).
- Refactors de componentes React ni optimización de imágenes más allá de lo que Next hace por defecto.

## Decisiones

| ID | Decisión | Alternativa descartada | Costo si está mal |
|---|---|---|---|
| D1 | Caddy como único punto de entrada TLS; `handle_path /api/*` → `api:3001`, resto → `web:3000` | Subdominio `api.$DOMAIN` (más DNS y CORS), API publicada aparte (más superficie) | Requiere que el build conozca el dominio; si cambia, hay que reconstruir |
| D2 | `DOMAIN` es la única fuente; `CORS_ORIGIN` y `NEXT_PUBLIC_API_URL` se derivan en Compose | Tres variables independientes en `.env` | Divergencia entre CORS y la URL que usa el navegador |
| D3 | Dockerfiles multi-etapa con `npm ci` desde el lockfile de la raíz, context de build en la raíz, usuario no-root | Context por app con `npm install` (sin lockfile) | Imagen más grande o build no reproducible |
| D4 | `/health` es liveness puro: no consulta Supabase | readiness con `SELECT 1` | Un hiccup externo provocaría reinicios en cascada |
| D5 | `enableShutdownHooks()` + `restart: unless-stopped` + healthchecks + `depends_on` saludable | Arranque simple sin orden ni salud | Conexiones abruptas y arranques contra servicios caídos |
| D6 | Verificación local con `DOMAIN=localhost` y CA interna de Caddy; E2E con `ignoreHTTPSErrors` condicional | Certificado real de producción | No se puede probar ACME sin dominio |

## Arquitectura y flujo de datos

```
Navegador --HTTPS--> Caddy (:443)
                       |-- handle_path /api/* --> api:3001 (prefijo removido)
                       `-- handle /*         --> web:3000
web:3000 --HTTP (API_INTERNAL_URL)--> api:3001   [Server Components]
api:3001 --TLS--> Supabase pooler (DATABASE_URL)
Caddy --ACME--> Let's Encrypt ; certificados en volumen caddy_data
```

- Los controllers siguen con sus rutas actuales (`/products`, `/orders`, `/auth`, `/cart`, `/admin`, `/cashier`): `handle_path` quita `/api` antes de proxyar. No se agrega prefijo global en Nest.
- `NEXT_PUBLIC_API_URL=https://$DOMAIN/api` se incrusta en el bundle del navegador en **build time**; por eso se pasa como build-arg de `web`.
- `API_INTERNAL_URL=http://api:3001` se usa en **runtime** dentro del Server Component de `/menu`; no se incrusta.
- `CORS_ORIGIN=https://$DOMAIN` y `NODE_ENV=production` activan `secure` en las cookies; al estar todo bajo el mismo sitio, `sameSite=lax` basta.
- La API sigue escuchando en 3001 y la web en 3000 dentro de la red interna de Compose; Caddy resuelve por nombre de servicio.

## Componentes

### 1. `deploy/Caddyfile` (nuevo)

Sitio `{$DOMAIN:localhost}` con `encode zstd gzip`, `handle_path /api/*` → `reverse_proxy api:3001` y `handle` → `reverse_proxy web:3000`. No se incluye la directiva `email`: Caddy obtiene el certificado sin correo, y una directiva con valor vacío rompería el parseo. Si el usuario quiere notificaciones de ACME, agrega manualmente `email <correo>` al bloque global; la sintaxis con default `{$ENV:valor}` está confirmada en la documentación de Caddy. Para `localhost`, Caddy usa su CA interna y no contacta a Let's Encrypt.

Se monta read-only en `/etc/caddy/Caddyfile`; el volumen `caddy_data` conserva certificados y la renovación automática.

### 2. `docker-compose.yml` (modificar)

- Servicios `caddy`, `web`, `api` en la misma red. Solo `caddy` tiene `ports: "${HTTP_PORT:-80}:80"` y `"${HTTPS_PORT:-443}:443"`.
- `web.build`: context `.` , dockerfile `apps/web/Dockerfile`, build-arg `NEXT_PUBLIC_API_URL=https://${DOMAIN:-localhost}/api`.
- `api.build`: context `.` , dockerfile `apps/api/Dockerfile`.
- `env_file: .env` en `web` y `api`; `environment` explícito para `CORS_ORIGIN=https://${DOMAIN:-localhost}`, `API_INTERNAL_URL=http://api:3001`, `NODE_ENV=production` y `DOMAIN`.
- `restart: unless-stopped`, `stop_grace_period: 30s` y healthchecks:
  - `api`: `wget -qO- http://localhost:3001/health` cada 10 s, 3 reintentos, periodo de arranque 20 s.
  - `web`: `wget -qO- http://localhost:3000/menu` cada 15 s, 3 reintentos, periodo de arranque 30 s (la raíz `/` no está garantizada; `/menu` sí existe).
  - `caddy`: `caddy validate --config /etc/caddy/Caddyfile` cada 30 s.
- `depends_on`: `web` espera a `api` saludable; `caddy` espera a `web` y `api` saludables.
- `volumes`: `caddy_data:/data` y `caddy_config:/config`.

### 3. Dockerfiles (modificar) y `.dockerignore` (nuevo en la raíz)

- `apps/api/Dockerfile`: etapas `deps` (`npm ci` con `package.json` + `package-lock.json` + `apps/api/package.json` de la raíz), `build` (`npm -w api run build`) y `runtime` (`node:20-alpine`, usuario `node`, copia de `dist` y dependencias de producción, `CMD ["node", "dist/main.js"]`).
- `apps/web/Dockerfile`: etapas `deps`, `build` (recibe `ARG NEXT_PUBLIC_API_URL` y corre `npm -w web run build`) y `runtime` (usuario `node`, copia `.next`, `public`, dependencias de producción, `CMD ["npm", "run", "start"]` con `next start -p 3000`).
- `.dockerignore` en la raíz excluye `node_modules`, `apps/*/.next`, `apps/api/dist`, `.env`, `.git`, `.superpowers`, `test-results`, `playwright-report`, `*.log` y cobertura.

### 4. Salud y apagado de la API (nuevo/modificar)

- `apps/api/src/health/health.controller.ts`: `GET /health` devuelve `{ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }`. No toca la BD.
- `apps/api/src/health/health.module.ts` y su import en `app.module.ts`.
- `apps/api/src/health/health.controller.spec.ts` con TDD: verifica el status 200 y el payload.
- `apps/api/src/main.ts`: `app.enableShutdownHooks()` antes de `listen`.
- Scripts: `apps/api/package.json` → `"start:prod": "node dist/main.js"`; `apps/web/package.json` → `"start": "next start -p 3000"`.

### 5. Variables y documentación

- `.env.example`: agrega `DOMAIN=localhost`, `HTTP_PORT=80` y `HTTPS_PORT=443`. `ACME_EMAIL` queda como línea comentada opcional: si se descomenta, el usuario además debe agregar `email {$ACME_EMAIL}` al bloque global del Caddyfile. Se documenta que `CORS_ORIGIN` y `NEXT_PUBLIC_API_URL` se derivan de `DOMAIN` en Compose y no se editan a mano en producción.
- `apps/web/playwright.config.ts`: `ignoreHTTPSErrors: (process.env.E2E_BASE_URL ?? '').startsWith('https://')`, para que el E2E local contra `https://localhost` acepte la CA interna sin relajar el modo normal.
- `README.md`: nueva sección “Despliegue en VPS” con los pasos: DNS → Docker → copiar `.env` → definir `DOMAIN` → `docker compose up -d --build` → verificar `https://$DOMAIN/api/health` y la web → logs y rollback → renovación automática de certificados. Se elimina la Fase 5 de “Fases pendientes” y se actualiza el título a “Fases 1, 2, 3, 4 y 5”. La nota de no pushear sin aprobación se conserva.

## Manejo de errores

- Si un contenedor falla el healthcheck de forma sostenida, Docker lo reinicia (`restart: unless-stopped`); el orden de arranque evita que `web` o Caddy inicien antes que una dependencia sana.
- Si la API está caída en runtime, Caddy responde 502. El healthcheck no reescribe el upstream en caliente; se documenta como comportamiento esperado, no como fallo de la spec.
- `/health` no consulta Supabase a propósito: una caída del proveedor externo no debe reinterpretarse como proceso muerto.
- Ante SIGTERM, Nest cierra hooks y Next termina ordenadamente; `stop_grace_period: 30s` da margen antes del kill.
- Un `DOMAIN` vacío cae al default `localhost` en Compose, para que la verificación local nunca rompa la config.

## Pruebas

1. **Unitarios:** API (incluye el nuevo spec de `/health`) y Web completos con `--runInBand`.
2. **Builds:** `npm -w apps/api run build` y `npm -w apps/web run build`, más `docker compose build` con `DOMAIN=localhost`.
3. **Esquema y BD:** `node scripts/verify-schema.mjs` y `node --env-file=.env scripts/verify-db.mjs`; se espera `SCHEMA OK (45 base + 15 aditivas)` y `DB OK (12 tablas)`.
4. **Smoke local:** `docker compose up -d`; `curl -k https://localhost/api/health` → 200 con `status: ok`; `curl -k https://localhost/menu` → 200; `docker ps --format` confirma que solo Caddy publica 80/443.
5. **E2E:** `E2E_BASE_URL=https://localhost` con el reloj fijo ya documentado; 9/9 en 360×800, 768×1024 y 1366×768. Al terminar se quita el reloj fijo y se recrea `api`.
6. **Cierre:** `git status -sb` sin cambios sin commitear salvo artefactos ya ignorados. Sin push, PR ni merge sin aprobación explícita.

## Riesgos y mitigaciones

- **`NEXT_PUBLIC_*` se incrusta en el build:** si el dominio cambia después, hay que reconstruir `web`. Se documenta en el README.
- **ACME con dominio nuevo:** si el DNS aún no apunta al VPS, Caddy no podrá emitir el certificado. El README lo pone como primer paso y la verificación local usa `localhost`.
- **Caddy `handle_path` y rutas absolutas del frontend:** todos los fetch usan rutas relativas al `BASE` configurado, así que no hay rutas absolutas que se rompan; se verifica con el smoke de `/api/products`.
- **Imagen multi-workspace:** `npm ci` desde la raíz instala dependencias de ambos workspaces; el stage runtime se poda con `npm prune --omit=dev` para no arrastrar herramientas de build.
- **Salud sin BD:** `/health` puede estar verde mientras Supabase falla. Es deliberado; se documenta y se complementa con `verify-db` en el pipeline manual.
