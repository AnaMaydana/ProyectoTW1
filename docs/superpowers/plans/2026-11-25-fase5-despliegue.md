# Fase 5: despliegue con HTTPS, rendimiento y disponibilidad — Plan de implementación

**Spec de autoridad:** `docs/superpowers/specs/2026-11-25-fase5-despliegue-design.md` (aprobada por el usuario).

## Objetivo

Dejar el repositorio listo para desplegar SALTEÑANGA en un VPS con Docker Compose y Caddy: un solo origen HTTPS, `/api/*` proxyado a NestJS, builds de producción, healthchecks, reinicio automático y documentación operativa. **No se ejecuta el despliegue real** (sin dominio ni VPS).

## Convenciones

- Todos los comandos se ejecutan desde la raíz del repo (`H:\PROYECTO DE SALTEÑERIA`) en PowerShell, salvo indicación contraria.
- Ramas: trabajar en `feature/fase2-cajero` (rama actual; la spec de Fase 5 ya está commiteada ahí como `259752d`).
- Seguir TDD: primero el test que falla (RED), después el código mínimo (GREEN), después la verificación completa.
- Commits frecuentes: uno por tarea, con mensajes en español y sin incluir artefactos generados.
- Docker disponible en este entorno: Docker `29.9.3`, Compose `v5.7.0`. Verificado con `docker version` y `docker compose version`.
- **No hacer push, PR ni merge** sin aprobación explícita del usuario. La nota ya existente en README se conserva.

## Ajustes detectados al escribir el plan (derivados de la spec, no cambios de negocio)

1. **Reloj E2E vs. producción:** `businessNow()` ignora `E2E_FIXED_NOW` cuando `NODE_ENV=production` (`apps/api/src/orders/expiry.ts`). Para poder correr los 9 tests E2E contra el stack HTTPS en cualquier hora, se agrega un overlay **solo de verificación local** (`deploy/docker-compose.e2e.yml`) que cambia `NODE_ENV` de `api` a `test`. La configuración de producción queda intacta y el overlay se documenta como "no usar en el VPS".
2. **Contextos de Playwright:** `checkout.spec.ts` y `cashier.spec.ts` crean contextos con `browser.newContext(...)`, que **no hereda** el `use.ignoreHTTPSErrors` del config. Se extrae un helper `apps/web/e2e/support/tls.ts` y se pasa explícitamente en esos dos archivos; si no, el E2E contra `https://localhost` falla por certificado interno de Caddy aunque el config esté bien.

---

## Task 1 — Endpoint `/health`, apagado ordenado y script de arranque de la API (TDD)

**Archivos:**
- `apps/api/src/health/health.controller.spec.ts` (nuevo)
- `apps/api/src/health/health.controller.ts` (nuevo)
- `apps/api/src/health/health.module.ts` (nuevo)
- `apps/api/src/app.module.ts` (modificar)
- `apps/api/src/main.ts` (modificar)
- `apps/api/package.json` (modificar)

### Paso 1: test que falla (RED)

Crear `apps/api/src/health/health.controller.spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from './health.controller';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 con status ok, uptime y timestamp sin tocar la BD', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(typeof response.body.uptime).toBe('number');
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });
});
```

Ejecutar:

```powershell
npm -w apps/api test -- --runInBand --runTestsByPath src/health/health.controller.spec.ts
```

Resultado esperado: falla con `Cannot find module './health.controller'`.

### Paso 2: implementación mínima (GREEN)

`apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
}
```

`apps/api/src/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

En `apps/api/src/app.module.ts`: importar `HealthModule` desde `./health/health.module` y agregarlo al array `imports` (al final, después de `CashierModule`). No se cambia ningún controller existente ni se agrega prefijo global.

En `apps/api/src/main.ts`: agregar `app.enableShutdownHooks();` justo después de `app.use(cookieParser());` y antes de `app.listen(3001)`.

En `apps/api/package.json`, dentro de `scripts`, agregar después de `build`:

```json
"start:prod": "node dist/src/main.js",
```

### Paso 3: verificación de la tarea

```powershell
npm -w apps/api test -- --runInBand --runTestsByPath src/health/health.controller.spec.ts
npm -w apps/api test -- --runInBand
npm -w apps/api run build
```

Esperado: 1/1 el test nuevo; suite API **79/79** (78 existentes + 1 nuevo); build sin errores.

### Commit

```powershell
git add apps/api/src/health apps/api/src/app.module.ts apps/api/src/main.ts apps/api/package.json
git commit -m "feat: endpoint /health y apagado ordenado de la API"
```

---

## Task 2 — Arranque de producción de Web y confianza TLS condicional en E2E

**Archivos:**
- `apps/web/package.json` (modificar)
- `apps/web/e2e/support/tls.ts` (nuevo)
- `apps/web/playwright.config.ts` (modificar)
- `apps/web/e2e/checkout.spec.ts` (modificar)
- `apps/web/e2e/cashier.spec.ts` (modificar)

### Paso 1: script de arranque

En `apps/web/package.json`, dentro de `scripts`, agregar después de `build`:

```json
"start": "next start -p 3000",
```

Verificar que `next start` existe en la dependencia instalada y que el build actual sirve:

```powershell
npm -w apps/web run build
npm -w apps/web test -- --runInBand
```

Esperado: build OK y suite Web **51/51**.

### Paso 2: helper TLS y contextos explícitos

Crear `apps/web/e2e/support/tls.ts`:

```ts
/** Solo en E2E local contra HTTPS con la CA interna de Caddy. */
export const ignoreHTTPSErrors = (process.env.E2E_BASE_URL ?? '').startsWith('https://');
```

Reemplazar `apps/web/playwright.config.ts` por:

```ts
import { defineConfig } from '@playwright/test';
import { ignoreHTTPSErrors } from './e2e/support/tls';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL, ignoreHTTPSErrors, trace: 'on-first-retry' },
  projects: [
    { name: '360x800', use: { browserName: 'chromium', viewport: { width: 360, height: 800 } } },
    { name: '768x1024', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } } },
    { name: '1366x768', use: { browserName: 'chromium', viewport: { width: 1366, height: 768 } } }
  ]
});
```

En `apps/web/e2e/checkout.spec.ts`: agregar `import { ignoreHTTPSErrors } from './support/tls';` y cambiar la línea del segundo contexto por:

```ts
  const context2 = await browser.newContext({ storageState: state, viewport, ignoreHTTPSErrors });
```

En `apps/web/e2e/cashier.spec.ts`: agregar el mismo import y cambiar **las dos** líneas `browser.newContext()`:

```ts
  const clientContext = await browser.newContext({ ignoreHTTPSErrors });
```

```ts
  const adminContext = await browser.newContext({ ignoreHTTPSErrors });
```

No se tocan aserciones ni flujos de negocio de los tests.

### Paso 3: verificación de la tarea

```powershell
npm -w apps/web test -- --runInBand
npm -w apps/web run build
```

Esperado: Web 51/51 y build OK. Con `E2E_BASE_URL` sin definir, `ignoreHTTPSErrors` es `false`, así que el modo normal no se relaja.

### Commit

```powershell
git add apps/web/package.json apps/web/playwright.config.ts apps/web/e2e
git commit -m "feat: arranque de produccion de web y E2E sobre HTTPS local"
```

---

## Task 3 — Dockerfiles multi-etapa y `.dockerignore`

**Archivos:**
- `.dockerignore` (nuevo en la raíz)
- `apps/api/Dockerfile` (reemplazar)
- `apps/web/Dockerfile` (reemplazar)

El context de build pasa a ser la raíz del repo porque el lockfile está ahí y los workspaces se llaman `api` y `web`.

### Paso 1: `.dockerignore`

```text
node_modules
**/node_modules
**/.next
**/dist
.env
.env.*
!.env.example
.git
.superpowers
docs
scripts
supabase
**/test-results
**/playwright-report
**/coverage
*.log
```

No se excluye `package-lock.json` ni los `package.json` de los workspaces: `npm ci` los necesita.

### Paso 2: `apps/api/Dockerfile`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm -w api run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev && chown -R node:node /app
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
```

`npm prune --omit=dev` corre antes del `COPY` final para no incluir herramientas de test/build en la imagen de runtime. `WORKDIR /app/apps/api` permite que Node resuelva `node_modules` en `/app/node_modules`. **No cambiar `dist/src/main.js` por `dist/main.js`**: el `apps/api/tsconfig.json` actual no restringe `include` a `src`, por lo que `nest build` compila también `test/` y el entrypoint queda en `dist/src/main.js` (verificado en el `dist` del repo).

### Paso 3: `apps/web/Dockerfile`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps ./apps
RUN npm -w web run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev && chown -R node:node /app
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/next.config.js ./apps/web/next.config.js
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
```

`NEXT_PUBLIC_API_URL` se incrusta en el build de Next; el default del `ARG` solo sirve para builds sueltos y Compose siempre pasa `https://${DOMAIN:-localhost}/api`.

**Corrección aplicada durante la verificación:** la configuración se renombró de `next.config.ts` a `next.config.js`. `next start` relee el archivo de configuración en runtime; con `next.config.ts` y `npm prune --omit=dev`, Next no encontraba `typescript` e intentaba instalarlo con yarn al arrancar, haciendo fallar el healthcheck por timeout. El `next.config.js` equivalente no requiere TypeScript en la imagen de runtime.

### Paso 4: verificación de la tarea

```powershell
docker build -f apps/api/Dockerfile -t saltenanga-api:phase5 .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://localhost/api -t saltenanga-web:phase5 .
```

Esperado: ambos builds terminan con `SUCCESS` y no copian `.env` ni `node_modules` del host (se instalan dentro de la imagen). Si un build falla por permisos de `node`, revisar que `chown` esté antes de `USER node`.

### Commit

```powershell
git add .dockerignore apps/api/Dockerfile apps/web/Dockerfile
git commit -m "build: Dockerfiles de produccion multi-etapa y .dockerignore"
```

---

## Task 4 — Caddy, Compose y variables parametrizadas por `DOMAIN`

**Archivos:**
- `deploy/Caddyfile` (nuevo)
- `docker-compose.yml` (reemplazar)
- `.env.example` (modificar)

### Paso 1: `deploy/Caddyfile`

```caddyfile
{$DOMAIN:localhost} {
	encode zstd gzip

	handle_path /api/* {
		reverse_proxy api:3001
	}

	handle {
		reverse_proxy web:3000
	}
}
```

No agregar `email {$ACME_EMAIL}`: el servicio `caddy` no lee `.env` y la directiva quedaría vacía, rompiendo el parseo. Para notificaciones se agrega literalmente `email <correo>`; queda documentado como paso manual opcional. Para `localhost`, Caddy usa su CA interna y no contacta a Let's Encrypt.

### Paso 2: `docker-compose.yml`

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    environment:
      DOMAIN: ${DOMAIN:-localhost}
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      web:
        condition: service_healthy
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "caddy", "validate", "--config", "/etc/caddy/Caddyfile"]
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: https://${DOMAIN:-localhost}/api
    restart: unless-stopped
    stop_grace_period: 30s
    env_file: .env
    environment:
      NODE_ENV: production
      DOMAIN: ${DOMAIN:-localhost}
      API_INTERNAL_URL: http://api:3001
      NEXT_PUBLIC_API_URL: https://${DOMAIN:-localhost}/api
      CORS_ORIGIN: https://${DOMAIN:-localhost}
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/menu"]
      interval: 15s
      timeout: 10s
      retries: 3
      start_period: 30s

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    stop_grace_period: 30s
    env_file: .env
    environment:
      NODE_ENV: production
      DOMAIN: ${DOMAIN:-localhost}
      CORS_ORIGIN: https://${DOMAIN:-localhost}
      API_INTERNAL_URL: http://api:3001
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 20s

volumes:
  caddy_data:
  caddy_config:
```

Puntos a no cambiar: `web` y `api` **no tienen** `ports`; `handle_path` quita `/api` antes de proxyar (los controllers siguen en `/products`, `/orders`, etc.); `environment` sobrescribe los valores de `.env` (`NODE_ENV=development`, `CORS_ORIGIN=http://localhost:3000`) dentro de los contenedores.

### Paso 3: `.env.example`

Agregar al final del archivo:

```text
# Dominio unico del despliegue. En local, localhost; en el VPS, el dominio real
# (sin https:// y sin barra final). CORS_ORIGIN y NEXT_PUBLIC_API_URL se derivan
# de esta variable en docker-compose.yml: no se editan a mano en produccion.
DOMAIN=localhost
HTTP_PORT=80
HTTPS_PORT=443
# Opcional: para recibir notificaciones de ACME, agregar literalmente
# `email tu-correo@ejemplo.com` al bloque global de deploy/Caddyfile.
# No usar una variable de entorno: el servicio caddy no lee .env.
```

No modificar `DATABASE_URL`, `JWT_SECRET`, horarios ni umbrales.

### Paso 4: verificación de la tarea

```powershell
$env:DOMAIN = 'localhost'
docker compose config
docker compose config --format json | ConvertFrom-Json | ForEach-Object { $_.services.PSObject.Properties | ForEach-Object { "{0}: ports={1}" -f $_.Name, ($_.Value.ports -join ',') } }
docker compose build
```

Esperado: `config` resuelve sin errores; solo `caddy` muestra `80:80` y `443:443` en `ports`; `web` y `api` muestran `ports=` vacío; los tres builds terminan OK.

### Commit

```powershell
git add deploy/Caddyfile docker-compose.yml .env.example
git commit -m "deploy: Caddy como unico origen HTTPS con healthchecks y restart"
```

---

## Task 5 — Overlay de verificación E2E contra HTTPS

**Archivos:**
- `deploy/docker-compose.e2e.yml` (nuevo)

### Paso 1: overlay

```yaml
# Solo verificación local. NO usar en el VPS: permite E2E_FIXED_NOW, que se
# ignora cuando NODE_ENV=production. El resto de la configuración es la base.
services:
  api:
    environment:
      NODE_ENV: test
```

Compose fusiona `environment` con el servicio base: se conservan `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, etc. No se publican puertos nuevos.

### Paso 2: verificación de la tarea

```powershell
$env:DOMAIN = 'localhost'
docker compose -f docker-compose.yml -f deploy/docker-compose.e2e.yml config --format json | ConvertFrom-Json | ForEach-Object { $_.services.api.environment.NODE_ENV }
```

Esperado: `test`. Sin el overlay, el mismo comando devuelve `production`.

### Commit

```powershell
git add deploy/docker-compose.e2e.yml
git commit -m "test: overlay local para E2E sobre el stack HTTPS"
```

---

## Task 6 — Documentación de despliegue en VPS

**Archivos:**
- `README.md` (modificar)

### Paso 1: título y arquitectura

- Línea 1: cambiar a `# SALTEÑANGA — Fases 1, 2, 3, 4 y 5: tienda, cajero, administración, comprobantes y despliegue`.
- Párrafo de introducción: agregar al final "y un despliegue en VPS detrás de un único origen HTTPS con Caddy."
- En `## Arquitectura`, reemplazar el bullet `- Docker Compose levanta solo web y api.` por:

```markdown
- Docker Compose levanta `caddy`, `web` y `api`. Solo Caddy publica 80/443; `web` y `api` quedan en la red interna.
- Caddy termina TLS y enruta `https://$DOMAIN/api/*` a la API (quitando el prefijo) y el resto a Next.js. `DOMAIN` es la única fuente: `CORS_ORIGIN` y `NEXT_PUBLIC_API_URL` se derivan de él en Compose.
```

### Paso 2: sección nueva `## Despliegue en VPS`

Insertarla antes de `## Pruebas` con este contenido:

```markdown
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

Si `DOMAIN` cambia, hay que reconstruir todos los servicios (`docker compose up -d --build`): `NEXT_PUBLIC_API_URL` se incrusta en el bundle de Next en build time y Caddy lee el dominio al arrancar. Reconstruir solo `web` dejaría a Caddy sirviendo el dominio anterior. El volumen `caddy_data` conserva el certificado viejo hasta que Caddy obtiene el nuevo. El servidor de Next llama a la API por `API_INTERNAL_URL=http://api:3001` en runtime, sin exponer el puerto 3001.

La API responde 502 si el upstream está caído. Los healthchecks solo informan del estado y ordenan el arranque (`depends_on` con `service_healthy`): Docker **no** reinicia contenedores `unhealthy` por sí solo; `restart: unless-stopped` actúa solo si el proceso termina. Para recuperar un contenedor marcado como unhealthy, reiniciarlo manualmente (`docker compose restart <servicio>`). `/health` es un liveness check (no consulta Supabase), así que una caída del proveedor externo no dispara reinicios en cascada.

Para probar el stack HTTPS en local, usar `DOMAIN=localhost`: Caddy usa su CA interna y `curl -k` acepta el certificado. Los E2E contra `https://localhost` usan `E2E_BASE_URL=https://localhost` y el overlay `deploy/docker-compose.e2e.yml`, que solo habilita el reloj fijo E2E; **no usarlo en producción**.
```

### Paso 3: sección de pruebas y cierre

- En la sección `## Pruebas`, agregar después del bloque E2E existente:

```markdown
Con el stack HTTPS local:

```powershell
$env:E2E_BASE_URL = 'https://localhost'
docker compose -f docker-compose.yml -f deploy/docker-compose.e2e.yml up -d
npm -w apps/web run e2e
```
```

- Reemplazar `## Fases pendientes` y su bullet por nada; el archivo debe terminar con:

```markdown
**No hacer push a GitHub sin la aprobación final del usuario.**
```

- Confirmar que no quedó la frase "Fase 5: despliegue..." en la sección de pendientes.

### Paso 4: verificación de la tarea

```powershell
git diff --check README.md
Select-String -Path README.md -Pattern 'Fases pendientes|Fase 5: despliegue|Despliegue en VPS|No hacer push'
```

Esperado: `git diff --check` sin salida; aparece `Despliegue en VPS` y la nota de no pushear; no aparece `Fases pendientes`.

### Commit

```powershell
git add README.md
git commit -m "docs: guia de despliegue en VPS y cierre de la fase 5"
```

---

## Task 7 — Verificación completa (sin cambios de código esperados)

Ejecutar en este orden y anotar la salida real de cada comando. Si algo falla, corregir en la tarea correspondiente y hacer un commit nuevo; no reescribir la historia.

### 1. Unitarios y builds

```powershell
npm -w apps/api test -- --runInBand
npm -w apps/web test -- --runInBand
npm -w apps/api run build
npm -w apps/web run build
```

Esperado: API **79/79**, Web **51/51**, ambos builds OK.

### 2. Esquema y base de datos

```powershell
node scripts/verify-schema.mjs
node --env-file=.env scripts/verify-db.mjs
```

Esperado: `SCHEMA OK (45 elementos base, 15 correcciones aditivas)` y `DB OK (12 tablas)`.

### 3. Smoke local sobre HTTPS con Caddy

```powershell
$env:DOMAIN = 'localhost'
docker compose down
docker compose up -d --build
Start-Sleep -Seconds 20
curl -k -i https://localhost/api/health
curl -k -s -o NUL -w "%{http_code}`n" https://localhost/menu
docker compose ps
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

Esperado: `/api/health` → 200 con `"status":"ok"`; `/menu` → 200; `caddy`, `web` y `api` en estado `healthy`; en `docker ps`, solo Caddy con `0.0.0.0:80->80/tcp` y `0.0.0.0:443->443/tcp`, sin puertos 3000/3001.

### 4. E2E sobre `https://localhost`

Solo si faltan menos de 10 minutos para las 11:00 de Bolivia, esperar al día siguiente: el reloj fijo se aplica al contenedor con el overlay, pero el servidor web y el navegador deben estar dentro de la ventana de negocio para las aserciones de checkout.

```powershell
# Agregar temporalmente al final de .env (no commitear):
# E2E_FIXED_NOW=2026-11-25T14:00:00.000Z
# Definir E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD en este shell con las credenciales
# del administrador creado con scripts/create-admin.mjs. No versionarlas.
$env:E2E_BASE_URL = 'https://localhost'
docker compose -f docker-compose.yml -f deploy/docker-compose.e2e.yml up -d
npm -w apps/web run e2e
```

Esperado: **9/9** en los tres viewports (360×800, 768×1024, 1366×768). Al terminar, quitar la línea `E2E_FIXED_NOW` de `.env` y restaurar la config normal:

```powershell
docker compose down
docker compose up -d
curl -k -s -o NUL -w "%{http_code}`n" https://localhost/api/products
```

Esperado: 200 con reloj real (si la hora real está fuera de 06:00–11:00, `/products` igual responde 200; el catálogo no depende del horario).

### 5. Cierre

```powershell
git status -sb
git log --oneline -8
```

Esperado: árbol limpio salvo `.superpowers/` (ya ignorado en el ledger de trabajo, no commitear). Sin push, PR ni merge: pedir aprobación explícita al usuario. PR #1 sigue abierto (`feature/fase2-cajero` → `feature/fase1`) y estos commits quedan solo en local hasta esa aprobación.

---

## Criterios de aceptación finales (checklist)

- [ ] `GET /health` responde 200 con `status: ok` y no consulta Supabase; test unitario incluido.
- [ ] `enableShutdownHooks()` presente; `start:prod` y `start` (next start) definidos.
- [ ] Dockerfiles multi-etapa con `npm ci` desde la raíz, usuario `node` y `.dockerignore`.
- [ ] Caddy es el único servicio con puertos publicados; `/api/*` llega a la API sin el prefijo.
- [ ] `DOMAIN` es la única fuente de CORS y de la URL pública de la API.
- [ ] `restart: unless-stopped`, `stop_grace_period`, healthchecks y `depends_on` con condición de salud en los tres servicios.
- [ ] README documenta DNS, `.env`, arranque, verificación, logs, rollback y renovación automática; Fase 5 ya no figura como pendiente.
- [ ] API 79/79, Web 51/51, builds, `verify-schema`, `verify-db`, smoke HTTPS y E2E 9/9 verificados con salida real.
- [ ] Sin push, PR ni merge sin aprobación del usuario.
