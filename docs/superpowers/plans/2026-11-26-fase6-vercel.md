# Fase 6 — Web en Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir solo la web Next.js desde Vercel en `https://www.$DOMAIN`, manteniendo la API NestJS en el VPS de Fase 5 bajo `https://$DOMAIN/api`, sin cambiar cookies, esquema ni reglas de negocio.

**Architecture:** Se agrega `WEB_ORIGIN` como override opcional del origen permitido por CORS en la API (`WEB_ORIGIN || CORS_ORIGIN || 'http://localhost:3000'`), y Compose deriva `CORS_ORIGIN` de él con default `https://$DOMAIN`. `vercel.json` en la raíz define el build del workspace `apps/web`; `NEXT_PUBLIC_API_URL=https://$DOMAIN/api` se configura como variable del proyecto de Vercel, no en el repo. El despliegue real queda detrás de un gate que exige token, dominio exacto y CNAME de `www` listo.

**Tech Stack:** TypeScript, NestJS 10, Next.js 15, Jest 29, npm workspaces, Docker Compose + Caddy (VPS), Vercel CLI (`npx vercel@latest`), PowerShell 7 en Windows.

**Spec:** `docs/superpowers/specs/2026-11-26-fase6-vercel-design.md`

## Global Constraints

- UI en español, precios en Bs, responsive 360×800 / 768×1024 / 1366×768, botones ≥44 px y contraste: **no se modifica ningún componente de UI en esta fase**.
- Horario `06:00–11:00` en `America/La_Paz`; `expires_at = min(confirmación + 30 min, 11:00)`; aviso si faltan <10 min: sin cambios.
- `saltenanga_schema.sql` intacto; correcciones solo aditivas; sin renombrar tablas ni columnas.
- Sin push/PR/merge sin aprobación explícita del usuario; la nota **“No hacer push a GitHub sin la aprobación final del usuario.”** debe permanecer al final de `README.md`.
- Solo la web va a Vercel; la API sigue en el VPS; mismo dominio raíz (`www.$DOMAIN` → Vercel, `$DOMAIN` → VPS).
- Sin `sameSite=none`, sin subdominio `api.$DOMAIN`, sin publicar el puerto 3001 ni 3000.
- Sin cambios de esquema, migraciones, reglas de negocio ni interfaz.
- `VERCEL_TOKEN` nunca se versiona ni se imprime en logs; no desplegar sin token, dominio exacto y CNAME de `www` listo.
- `E2E_FIXED_NOW` solo en verificación local; se ignora con `NODE_ENV=production` y su línea se quita de `.env` al terminar.
- Ramas: trabajo en `feature/fase6-vercel` (worktree `C:\Users\airto\opencode-worktrees\fase5-despliegue`, base `edd03ee`). No hacer push sin aprobación.

## Review Focus

1. **`WEB_ORIGIN=` vacío en `.env` del VPS** → debe interpretarse como “no definido” y nunca dejar `corsOrigin` vacío (CORS con credenciales fallaría). Pin: Task 1 Step 1, caso 4.
2. **VPS actualizado sin `WEB_ORIGIN`** → `api` y `web` deben seguir recibiendo `https://$DOMAIN` y `NEXT_PUBLIC_API_URL=https://$DOMAIN/api`, sin publicar puertos; la Fase 5 queda intacta. Pin: Task 2 Step 3.
3. **VPS con `WEB_ORIGIN=https://www.$DOMAIN`** → `api` debe recibir exactamente ese valor (origen con credenciales desde `www`), sin tocar `Caddyfile` ni agregar `ports`. Pin: Task 2 Step 4.
4. **`NEXT_PUBLIC_API_URL` se incrusta en build time** → si no se configura en Vercel, el bundle cae a `http://localhost:3001`; `vercel.json` no debe fijarlo y el README debe documentar el valor y el redeploy obligatorio al cambiarlo. Pin: Task 3 Step 2 y Task 4 Step 1.
5. **Deploy sin `VERCEL_TOKEN`, dominio exacto o CNAME de `www`** → no debe ejecutarse; se verifica token sin imprimirlo y se consulta DNS antes de cualquier comando de deploy. Pin: Task 6 Step 1.

---

### Task 1: Precedencia de `WEB_ORIGIN` en la configuración de la API (TDD)

**Files:**
- Modify: `apps/api/src/config/env.ts:9`
- Create: `apps/api/src/config/env.spec.ts`

**Interfaces:**
- Consumes: `loadEnv()` de `apps/api/src/config/env.ts`, que devuelve `{ databaseUrl, jwtSecret, corsOrigin, cartDays, refreshDays }`. `apps/api/jest.setup.ts` ya define `DATABASE_URL`, `JWT_SECRET` y `CORS_ORIGIN` por defecto.
- Produces: `loadEnv().corsOrigin` con precedencia `WEB_ORIGIN || CORS_ORIGIN || 'http://localhost:3000'`. `apps/api/src/main.ts:13` sigue leyendo `env.corsOrigin` sin cambios.

- [ ] **Step 1: Write the failing test**

Crear `apps/api/src/config/env.spec.ts` con este contenido exacto:

```ts
import { loadEnv } from './env';

const original = { ...process.env };

afterEach(() => {
  process.env.DATABASE_URL =
    original.DATABASE_URL ?? 'postgres://test:test@localhost:5432/saltenanga';
  process.env.JWT_SECRET = original.JWT_SECRET ?? 'test-secret';
  if (original.CORS_ORIGIN === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = original.CORS_ORIGIN;
  if (original.WEB_ORIGIN === undefined) delete process.env.WEB_ORIGIN;
  else process.env.WEB_ORIGIN = original.WEB_ORIGIN;
});

describe('loadEnv().corsOrigin', () => {
  it('usa WEB_ORIGIN cuando está definido', () => {
    process.env.WEB_ORIGIN = 'https://www.ejemplo.test';
    process.env.CORS_ORIGIN = 'https://ejemplo.test';

    expect(loadEnv().corsOrigin).toBe('https://www.ejemplo.test');
  });

  it('usa CORS_ORIGIN cuando WEB_ORIGIN no está definido', () => {
    delete process.env.WEB_ORIGIN;
    process.env.CORS_ORIGIN = 'https://ejemplo.test';

    expect(loadEnv().corsOrigin).toBe('https://ejemplo.test');
  });

  it('mantiene localhost:3000 cuando no hay ninguno', () => {
    delete process.env.WEB_ORIGIN;
    delete process.env.CORS_ORIGIN;

    expect(loadEnv().corsOrigin).toBe('http://localhost:3000');
  });

  it('ignora un WEB_ORIGIN vacío como hace ${WEB_ORIGIN:-...} en Compose', () => {
    process.env.WEB_ORIGIN = '';
    process.env.CORS_ORIGIN = 'https://ejemplo.test';

    expect(loadEnv().corsOrigin).toBe('https://ejemplo.test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npm -w apps/api test -- --runInBand env.spec.ts
```

Esperado: FAIL, 1 pasado / 3 fallidos. El primero dice `Expected: "https://www.ejemplo.test"` / `Received: "https://ejemplo.test"` porque hoy `WEB_ORIGIN` se ignora. El cuarto también falla (`Received: ""`).

- [ ] **Step 3: Write minimal implementation**

En `apps/api/src/config/env.ts`, reemplazar exactamente la línea 9:

```ts
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
```

por:

```ts
    // WEB_ORIGIN gana cuando la web se sirve desde www.$DOMAIN (Vercel).
    // Se usa || (no ??) para que un WEB_ORIGIN= vacío se trate como no definido,
    // igual que ${WEB_ORIGIN:-...} en docker-compose.yml.
    corsOrigin: process.env.WEB_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:3000',
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npm -w apps/api test -- --runInBand
```

Esperado: PASS **83/83** (79 del baseline + 4 nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/config/env.spec.ts
git commit -m "feat: WEB_ORIGIN como origen CORS preferido de la API"
```

---

### Task 2: Compose y `.env.example` derivan el origen de la web

**Files:**
- Modify: `docker-compose.yml:39` y `docker-compose.yml:60`
- Modify: `.env.example` (insertar después de la línea 33)

**Interfaces:**
- Consumes: `WEB_ORIGIN` y `DOMAIN` del entorno de Compose; `loadEnv()` de Task 1 lee la variable inyectada como `CORS_ORIGIN`.
- Produces: `CORS_ORIGIN` en los servicios `api` y `web`; sin cambios en `Caddyfile`, `ports`, healthchecks ni `NEXT_PUBLIC_API_URL`.

- [ ] **Step 1: Actualizar `docker-compose.yml`**

Reemplazar la línea 39 (`web`):

```yaml
      CORS_ORIGIN: https://${DOMAIN:-localhost}
```

por:

```yaml
      CORS_ORIGIN: ${WEB_ORIGIN:-https://${DOMAIN:-localhost}}
```

Reemplazar la línea 60 (`api`) por el mismo valor:

```yaml
      CORS_ORIGIN: ${WEB_ORIGIN:-https://${DOMAIN:-localhost}}
```

No tocar nada más: `NEXT_PUBLIC_API_URL` sigue siendo `https://${DOMAIN:-localhost}/api` en `build.args` y en `environment`, y `API_INTERNAL_URL` sigue siendo `http://api:3001`.

- [ ] **Step 2: Documentar `WEB_ORIGIN` en `.env.example`**

Insertar después de `HTTPS_PORT=443`:

```text
# Modo Vercel: la web se sirve en https://www.$DOMAIN y la API en
# https://$DOMAIN/api. WEB_ORIGIN debe ser https://www.tu-dominio.com para que
# la API acepte credenciales desde la web. Ausente o vacío = https://$DOMAIN
# (comportamiento de la Fase 5). DOMAIN no lleva https:// ni barra final.
# WEB_ORIGIN=https://www.tu-dominio.com
```

- [ ] **Step 3: Verificar el default sin override (Review Focus 2)**

```powershell
$env:DOMAIN = 'ejemplo.test'
Remove-Item Env:WEB_ORIGIN -ErrorAction SilentlyContinue
$c = docker compose config --format json | ConvertFrom-Json
"api=$($c.services.api.environment.CORS_ORIGIN) web=$($c.services.web.environment.CORS_ORIGIN) url=$($c.services.web.environment.NEXT_PUBLIC_API_URL) ports_api=$($c.services.api.ports.Count) ports_web=$($c.services.web.ports.Count)"
```

Esperado exacto: `api=https://ejemplo.test web=https://ejemplo.test url=https://ejemplo.test/api ports_api=0 ports_web=0`. Esto pinned también el formato de `DOMAIN` sin `https://` ni `/` final (Review Focus 4).

- [ ] **Step 4: Verificar el modo Vercel (Review Focus 3)**

```powershell
$env:WEB_ORIGIN = 'https://www.ejemplo.test'
$c = docker compose config --format json | ConvertFrom-Json
"api=$($c.services.api.environment.CORS_ORIGIN) web=$($c.services.web.environment.CORS_ORIGIN) url=$($c.services.web.environment.NEXT_PUBLIC_API_URL) ports_api=$($c.services.api.ports.Count) ports_web=$($c.services.web.ports.Count)"
```

Esperado exacto: `api=https://www.ejemplo.test web=https://www.ejemplo.test url=https://ejemplo.test/api ports_api=0 ports_web=0`.

Restaurar el entorno del shell para no contaminar los pasos siguientes:

```powershell
Remove-Item Env:WEB_ORIGIN -ErrorAction SilentlyContinue
Remove-Item Env:DOMAIN -ErrorAction SilentlyContinue
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: derivar CORS_ORIGIN de WEB_ORIGIN en Compose"
```

---

### Task 3: `vercel.json` para el build del monorepo

**Files:**
- Create: `vercel.json`

**Interfaces:**
- Consumes: `package.json` (workspaces `["apps/api", "apps/web"]`) y `apps/web/package.json` (`build: next build`).
- Produces: configuración leída por Vercel desde la raíz del repo. `NEXT_PUBLIC_API_URL` **no** se define aquí: se configura en el proyecto de Vercel.

- [ ] **Step 1: Crear `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm install",
  "buildCommand": "npm -w apps/web run build",
  "outputDirectory": "apps/web/.next"
}
```

- [ ] **Step 2: Validar forma y ausencia de secretos/URLs fijas (Review Focus 4)**

```powershell
node -e "const v=require('./vercel.json'); const ok=v.framework==='nextjs'&&v.installCommand==='npm install'&&v.buildCommand==='npm -w apps/web run build'&&v.outputDirectory==='apps/web/.next'&&!JSON.stringify(v).includes('NEXT_PUBLIC_API_URL'); console.log(ok?'VERCEL JSON OK':'VERCEL JSON FAIL'); process.exit(ok?0:1)"
```

Esperado: `VERCEL JSON OK` y exit code 0.

- [ ] **Step 3: Probar el build exacto con una URL de ejemplo**

```powershell
$env:NEXT_PUBLIC_API_URL = 'https://ejemplo.test/api'
npm -w apps/web run build
"build_id=$(Test-Path apps/web/.next/BUILD_ID)"
Remove-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
```

Esperado: `next build` exit 0 y `build_id=True`. Esto demuestra que el comando de `vercel.json` genera `apps/web/.next`; el valor real de producción se inyecta en Vercel y requiere redeploy si cambia.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "chore: configurar build de la web en Vercel"
```

---

### Task 4: Runbook del despliegue híbrido en README

**Files:**
- Modify: `README.md` (insertar antes de `## Pruebas`, después de la línea 137)

**Interfaces:**
- Consumes: `vercel.json` (Task 3), `WEB_ORIGIN` (Task 2), DNS apex/`www`, `NEXT_PUBLIC_API_URL`, `VERCEL_TOKEN`.
- Produces: procedimiento operativo de deploy, verificación y rollback. No altera la sección «Despliegue en VPS» ni la nota final de no push.

- [ ] **Step 1: Insertar la sección**

Insertar este bloque exacto entre la línea 137 y `## Pruebas`:

````markdown
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
````

- [ ] **Step 2: Verificar el documento**

```powershell
Select-String -Path README.md -Pattern '## Despliegue híbrido \(Vercel \+ VPS\)','WEB_ORIGIN','NEXT_PUBLIC_API_URL','vercel@latest rollback','No hacer push a GitHub sin la aprobación final del usuario.'
git diff --check
```

Esperado: las cinco cadenas aparecen (la última exactamente al final del archivo) y `git diff --check` sin salida. Confirmar que no aparece ningún valor real de token ni de dominio del usuario.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: guia de despliegue hibrido Vercel + VPS"
```

---

### Task 5: Regresión local completa antes del deploy

**Files:** ninguno (verificación). Consumes los cuatro tasks anteriores; produce la evidencia de que la Fase 5 sigue intacta.

- [ ] **Step 1: Unitarios y build de la API**

```powershell
npm -w apps/api test -- --runInBand
npm -w apps/api run build
```

Esperado: API **83/83** y `nest build` exit 0. El build de Web ya se validó en Task 3 Step 3; no se repite.

- [ ] **Step 2: Unitarios de la Web**

```powershell
npm -w apps/web test -- --runInBand
```

Esperado: Web **51/51**.

- [ ] **Step 3: Smoke HTTPS local con el stack recreado**

```powershell
$env:DOMAIN = 'localhost'
docker compose down
docker compose up -d --build
Start-Sleep -Seconds 20
curl -k -i https://localhost/api/health
curl -k -s -o NUL -w "%{http_code}`n" https://localhost/menu
docker compose ps
```

Esperado: `/api/health` → 200 con `"status":"ok"`; `/menu` → 200; `caddy`, `web` y `api` `healthy`; solo Caddy publica 80/443. Si faltan credenciales de administrador en el entorno, este paso no las necesita.

- [ ] **Step 4: E2E con reloj fijo (9/9 en tres viewports)**

Solo si faltan menos de 10 minutos para las 11:00 de Bolivia, esperar al día siguiente. Agregar temporalmente al final de `.env` (no commitear) `E2E_FIXED_NOW=2026-11-25T14:00:00.000Z` y definir `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` en el shell.

```powershell
$env:E2E_BASE_URL = 'https://localhost'
docker compose -f docker-compose.yml -f deploy/docker-compose.e2e.yml up -d
npm -w apps/web run e2e
```

Esperado: **9/9** en 360×800, 768×1024 y 1366×768.

- [ ] **Step 5: Restaurar el stack de producción local**

```powershell
# Quitar la línea E2E_FIXED_NOW de .env antes de este paso.
docker compose down
docker compose up -d
curl -k -s -o NUL -w "%{http_code}`n" https://localhost/api/products
git status -sb
```

Esperado: 200 con reloj real; `git status` limpio salvo los commits ya creados (nada sin commitear). Quedan 5 commits nuevos sobre `edd03ee`.

- [ ] **Step 6: Sin commit**

Esta task no modifica archivos. Si `git status` muestra cambios, detenerse y revisar antes de pasar a Task 6.

---

### Task 6: Despliegue real en Vercel (gateado)

**Files:** ninguno en el repo. Ejecuta comandos externos; no versiona nada.

**Interfaces:**
- Consumes: todo lo anterior; requiere del usuario el **dominio exacto**, la **IP del VPS**, confirmación de que el **CNAME de `www`** ya apunta a Vercel y un **`VERCEL_TOKEN`** válido en el entorno.
- Produces: web en `https://www.$DOMAIN` y API verificada en `https://$DOMAIN/api`. Rollback documentado en Task 4.

- [ ] **Step 1: Gate de prerrequisitos (Review Focus 5). NO OMITIR**

Pedir al usuario los valores exactos si aún no los dio. Comprobar sin imprimir el token:

```powershell
"token_present=$([bool]$env:VERCEL_TOKEN)"
```

Si el resultado es `token_present=False`, **detenerse** y pedir que configure `VERCEL_TOKEN` en el entorno (nunca en el chat ni en un archivo del repo). Luego verificar DNS con el dominio exacto que confirmó el usuario:

```powershell
$DOMAIN = '<dominio-exacto-sin-https>'
Resolve-DnsName -Name $DOMAIN -Type A
Resolve-DnsName -Name "www.$DOMAIN" -Type CNAME
```

Esperado: el registro A devuelve la IP del VPS confirmada; el CNAME de `www` resuelve a `cname.vercel-dns.com`. Si falta cualquiera de los tres (token, dominio/IP, CNAME), **no ejecutar** los pasos 2–5 y reportar qué falta.

- [ ] **Step 2: Lado VPS — activar el nuevo origen permitido**

En el VPS (por SSH; si no hay acceso desde aquí, el usuario lo ejecuta y lo confirma):

```bash
cd /ruta/al/repo
# Editar .env: agregar o actualizar WEB_ORIGIN=https://www.<dominio-exacto>
docker compose up -d --build api
docker compose ps
curl -i https://<dominio-exacto>/api/health
```

Esperado: `api` `healthy` y `/api/health` 200. Verificar además que el contenedor recibió el origen:

```bash
docker compose config | grep -A2 CORS_ORIGIN
```

Esperado: `CORS_ORIGIN: https://www.<dominio-exacto>`.

- [ ] **Step 3: Vincular proyecto y configurar la variable de build en Vercel**

`vercel env add` requiere un proyecto vinculado: hacer `link` primero. Si la variable ya existe (cambio de dominio), usar `env update ... --yes` con el valor por stdin, o `env add ... --force`; `env add` sin `--force` falla si la variable ya está definida.

```powershell
npx vercel@latest whoami
npx vercel@latest link --yes
"https://$DOMAIN/api" | npx vercel@latest env add NEXT_PUBLIC_API_URL --environment production --yes
```

Esperado: `whoami` identifica la cuenta correcta; `link` vincula o crea el proyecto; exit 0 y la variable queda disponible para el build. No imprimir el token.

- [ ] **Step 4: Deploy y asignación de dominio**

```powershell
npx vercel@latest deploy --prod --yes
npx vercel@latest domains add "www.$DOMAIN" --yes
npx vercel@latest alias set <url-del-deployment> "www.$DOMAIN"
```

Esperado: `deploy` imprime la URL de producción; el dominio queda asignado. Reemplazar `<url-del-deployment>` por la URL impresa. Si `domains add` pide verificación y el CNAME no está listo, volver al Step 1.

- [ ] **Step 5: Verificación en los URLs reales y cierre**

```powershell
curl -I "https://www.$DOMAIN/menu"
curl -i "https://$DOMAIN/api/health"
```

Esperado: 200 en ambos. Comprobar en el navegador registro + carrito persistente + checkout dentro de 06:00–11:00 Bolivia; fuera de ese horario solo humo HTTP. Si algo falla, ejecutar el rollback de Task 4 (promover deployment anterior) sin tocar el VPS ni la base.

- [ ] **Step 6: Sin commit ni push**

No hacer push ni PR: el usuario debe aprobarlo explícitamente. Actualizar el panel de progreso con el resultado.
