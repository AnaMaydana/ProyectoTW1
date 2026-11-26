# Fase 6 gratuita (Vercel + Render) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar la tienda sin costo con la web Next.js en Vercel y la API NestJS en un Web Service gratuito de Render, detrás de un proxy `/api/*` del mismo origen, sin cambiar UI, cookies, esquema ni reglas de negocio.

**Architecture:** Vercel sirve la web y reescribe `/api/:path*` hacia la URL pública de Render, que corre la API contra el Supabase existente. Render inyecta `PORT`, así que la API debe escuchar en ese puerto en vez del `3001` fijo. Los secretos viven solo en variables de entorno de Render/Vercel y en el `.env` local; `vercel.json` solo contiene la URL pública de Render.

**Tech Stack:** Next.js 15, NestJS 10, TypeScript, Jest, Playwright, Vercel CLI (`npx vercel@latest`), Render Web Service free, Supabase Postgres, PowerShell en Windows.

**Spec:** `docs/superpowers/specs/2026-11-26-fase6-gratis-vercel-render-design.md`

## Global Constraints

- Horario de atención: **06:00–11:00** en `America/La_Paz`; `expires_at = min(confirmación + 30 min, 11:00)`; aviso si faltan **menos de 10 minutos**. No se modifica ninguna de estas reglas.
- No modificar `saltenanga_schema.sql`, `saltenanga_schema_adaptado.sql`, `supabase/migrations/*` ni entidades/reglas de negocio. Solo cambios aditivos.
- Cookies `cart_id` y `sb_access`: host-only, `httpOnly`, `sameSite=lax`, `secure` cuando `NODE_ENV=production`. **Nunca** `sameSite=none`. No cambiar `apps/api/src/common/cookies/cookie.service.ts`.
- UI en español, precios en Bs, responsive 360×800 / 768×1024 / 1366×768, botones ≥44 px y contraste. Sin cambios de UI en esta fase.
- `VERCEL_TOKEN` y cualquier token de Render nunca se versionan ni se imprimen. El de Vercel está en `C:\Users\airto\AppData\Local\Temp\opencode\vercel-token.txt`; cargarlo con `Get-Content ... -Raw).Trim()` sin mostrarlo.
- **No hacer push, PR ni merge sin aprobación explícita.** Conservar la nota “No hacer push a GitHub sin la aprobación final del usuario.” en `README.md`.
- PR #2 ya abierto (`feature/fase6-vercel` → `feature/fase1`): actualizarlo solo con aprobación explícita; nunca hacer merge.
- Sin VPS, sin compra de dominio, sin publicar el puerto 3001, sin WAF, rate limiting, backups ni alarmas.
- La rama de trabajo es `feature/fase6-vercel`; el default remoto es `feature/fase1`. Render debe apuntar a `feature/fase6-vercel`.

## Review Focus

1. **Render inyecta `PORT` (normalmente 10000) y espera el health check ahí.** Si la API sigue escuchando en 3001, el deploy queda unhealthy. Pin: tests de `apiPort()` en Task 1 Step 1 + verificación de `main.ts` en Task 1 Step 5.
2. **Faltan `DATABASE_URL` o `JWT_SECRET` en el Web Service.** La API debe fallar con el mensaje en español ya existente, no con un error críptico. Pin: dos tests en Task 1 Step 1.
3. **`NEXT_PUBLIC_API_URL=/api` y todos los `path` empiezan con `/`.** Una doble barra (`/api//products`) rompería las rutas de Nest. Pin: test en Task 4 Step 2 que asserta `fetch('/api/products')`.
4. **El rewrite debe devolver `Set-Cookie` bajo el host de Vercel.** Si la cookie viniera con `Domain=render...` o `SameSite=None`, el carrito no persistiría. Pin: verificación de headers en Task 6 Step 4.
5. **Render free duerme tras 15 min y Supabase free se pausa tras 1 semana.** La primera petición debe terminar 200 sin error de timeout. Pin: `Invoke-WebRequest -TimeoutSec 180` en Task 3 Step 6 y Task 6 Step 4.

---

### Task 1: La API escucha en el puerto que inyecta Render

**Files:**
- Modify: `apps/api/src/config/env.ts` (agregar `apiPort()`)
- Modify: `apps/api/src/config/env.spec.ts` (tests nuevos)
- Modify: `apps/api/src/main.ts:6,17` (importar y usar `apiPort()`)

**Interfaces:**
- Consumes: `process.env.PORT`, `process.env.API_PORT`, comportamiento actual de `loadEnv()`.
- Produces: `apiPort(): number` con prioridad `PORT` → `API_PORT` → `3001`, con fallback a `3001` para valores vacíos, no numéricos o fuera de 1..65535. `main.ts` lo usa en `app.listen()`.

- [ ] **Step 1: Write the failing tests**

En `apps/api/src/config/env.spec.ts`: cambiar la primera línea a `import { apiPort, loadEnv } from './env';`. Dentro del `afterEach` existente, agregar al final:

```ts
  if (original.PORT === undefined) delete process.env.PORT;
  else process.env.PORT = original.PORT;
  if (original.API_PORT === undefined) delete process.env.API_PORT;
  else process.env.API_PORT = original.API_PORT;
```

Agregar al final del archivo:

```ts
describe('apiPort()', () => {
  it('usa PORT cuando Render lo inyecta', () => {
    process.env.PORT = '10000';
    process.env.API_PORT = '3001';

    expect(apiPort()).toBe(10000);
  });

  it('usa API_PORT cuando no hay PORT', () => {
    delete process.env.PORT;
    process.env.API_PORT = '3100';

    expect(apiPort()).toBe(3100);
  });

  it('usa 3001 cuando no hay ninguno', () => {
    delete process.env.PORT;
    delete process.env.API_PORT;

    expect(apiPort()).toBe(3001);
  });

  it('ignora un PORT vacío', () => {
    process.env.PORT = '';
    process.env.API_PORT = '3200';

    expect(apiPort()).toBe(3200);
  });
});

describe('loadEnv() variables obligatorias', () => {
  it('falla en español si falta DATABASE_URL', () => {
    delete process.env.DATABASE_URL;

    expect(() => loadEnv()).toThrow('Falta DATABASE_URL');
  });

  it('falla en español si falta JWT_SECRET', () => {
    delete process.env.JWT_SECRET;

    expect(() => loadEnv()).toThrow('Falta JWT_SECRET');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w apps/api test -- --runInBand src/config/env.spec.ts`
Expected: FAIL con error de TypeScript `Module '"./env"' has no exported member 'apiPort'` (o `apiPort is not a function` en runtime). Las suites de variables obligatorias pasan porque `loadEnv()` ya valida.

- [ ] **Step 3: Write minimal implementation**

Agregar al final de `apps/api/src/config/env.ts`, después de `lowStockThreshold()`:

```ts
/** Puerto de escucha: Render inyecta PORT; en local se usa API_PORT o 3001. */
export function apiPort(): number {
  const value = Number(process.env.PORT || process.env.API_PORT || 3001);
  return Number.isFinite(value) && value > 0 && value <= 65535 ? Math.floor(value) : 3001;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm -w apps/api test -- --runInBand src/config/env.spec.ts`
Expected: PASS (10 tests en este archivo: 4 existentes + 6 nuevos).

- [ ] **Step 5: Use the port in bootstrap and verify the whole suite**

En `apps/api/src/main.ts`, cambiar el import:

```ts
import { env, apiPort } from './config/env';
```

y cambiar `await app.listen(3001);` por:

```ts
  await app.listen(apiPort());
```

Verificación rápida (debe imprimir exactamente una coincidencia):

```powershell
Select-String -Path 'apps\api\src\main.ts' -Pattern 'app\.listen\(apiPort\(\)\)'
```

Run: `npm -w apps/api test -- --runInBand`
Expected: PASS (89 tests: 83 existentes + 6 nuevos).

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/config/env.ts apps/api/src/config/env.spec.ts apps/api/src/main.ts
git commit -m "feat(fase6): la API escucha en el puerto que inyecta Render"
```

---

### Task 2: Gate de aprobación y push del commit a `feature/fase6-vercel`

**Files:** ninguno en el repo. Publica el commit de Task 1 para que Render pueda clonarlo.

**Interfaces:**
- Consumes: commit local de Task 1 en `feature/fase6-vercel`.
- Produces: el mismo SHA en `refs/heads/feature/fase6-vercel` del remoto `origin`.

- [ ] **Step 1: Commitear el spec y el plan aprobados (sin push) y verificar el estado**

```powershell
git add docs/superpowers/specs/2026-11-26-fase6-gratis-vercel-render-design.md docs/superpowers/plans/2026-11-26-fase6-gratis-vercel-render.md
git commit -m "docs(fase6): spec y plan de despliegue gratuito"
git status --short
git log -2 --oneline
```

Expected: `git status --short` sin salida y los dos commits en HEAD (docs y `feat(fase6): la API escucha...`).

- [ ] **Step 2: Pedir aprobación explícita antes de hacer push**

Preguntar al usuario: «¿Autorizás que suba a GitHub el commit que preparó la API para Render?» **No ejecutar el push si la respuesta no es explícitamente afirmativa.** Esta es la excepción permitida a la regla “no push sin aprobación”.

- [ ] **Step 3: Push y verificación del remoto**

```powershell
git push origin feature/fase6-vercel
$local = (git rev-parse HEAD).Trim()
$remoteLine = git ls-remote --heads origin feature/fase6-vercel
$remote = ($remoteLine -split '\s+')[0]
"local=$local"
"remote=$remote"
"coinciden=$($local -eq $remote)"
```

Expected: `coinciden=True`. Si el push falla por la interpretación de PowerShell de `remote:`, verificar con `git ls-remote` antes de repetirlo (ya pasó en esta rama).

---

### Task 3: Web Service gratuito en Render

**Files:** ninguno en el repo. Configura la API fuera del repositorio.

**Interfaces:**
- Consumes: commit publicado en Task 2; valores de `.env` local; repo `https://github.com/AnaMaydana/ProyectoTW1`.
- Produces: servicio Render con URL pública `https://<nombre>.onrender.com`, guardada en `C:\Users\airto\AppData\Local\Temp\opencode\render-url.txt` (sin secretos), y `/health` respondiendo 200.

- [ ] **Step 1: Crear la cuenta y el servicio (intervención del usuario)**

El usuario crea cuenta en Render con GitHub y autoriza el acceso al repo. Si aún no lo hizo, pedirle que lo haga; **no se guarda ninguna contraseña**. En el dashboard: *New* → *Web Service* → conectar `AnaMaydana/ProyectoTW1`.

- [ ] **Step 2: Completar los campos del servicio**

En el formulario de Render, cargar exactamente:

| Campo | Valor |
|---|---|
| Name | `saltenanga-api` (o el nombre disponible que elija Render) |
| Runtime | `Node` |
| Branch | `feature/fase6-vercel` (**no** el default `feature/fase1`) |
| Root Directory | vacío (raíz del monorepo) |
| Build Command | `npm install && npm -w apps/api run build` |
| Start Command | `npm -w api run start:prod` |
| Instance Type | `Free` |
| Health Check Path | `/health` |

- [ ] **Step 3: Copiar secretos al portapapeles sin imprimirlos**

Para cada variable, ejecutar el comando y pegar el valor en el formulario de Render. **No mostrar el valor en la terminal ni en el chat.**

```powershell
$line = Get-Content -Path '.\.env' | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { throw 'Falta DATABASE_URL en .env' }
Set-Clipboard -Value $line.Substring($line.IndexOf('=') + 1)
'datos_copied=True'
```

```powershell
$line = Get-Content -Path '.\.env' | Where-Object { $_ -match '^JWT_SECRET=' } | Select-Object -First 1
if (-not $line) { throw 'Falta JWT_SECRET en .env' }
Set-Clipboard -Value $line.Substring($line.IndexOf('=') + 1)
'datos_copied=True'
```

Agregar además en Render: `CORS_ORIGIN` con la URL de Vercel que se obtendrá en Task 6 (puede dejarse provisionalmente `http://localhost:3000` y actualizarse después) y `NODE_ENV=production`. Render agrega `PORT` automáticamente: **no** definirlo a mano.

- [ ] **Step 4: Guardar la URL pública del servicio**

Copiar la URL `https://....onrender.com` que muestra Render y guardarla sin secretos:

```powershell
$url = Read-Host 'Pegá la URL .onrender.com que muestra Render'
$url = $url.Trim().TrimEnd('/')
if ($url -notmatch '^https://[A-Za-z0-9.-]+\.onrender\.com$') { throw 'URL de Render inválida' }
$url | Set-Content -Path 'C:\Users\airto\AppData\Local\Temp\opencode\render-url.txt'
"render_url=$url"
```

- [ ] **Step 5: Esperar el deploy y verificar el health check directo**

```powershell
$render = (Get-Content -Path 'C:\Users\airto\AppData\Local\Temp\opencode\render-url.txt' -Raw).Trim().TrimEnd('/')
try {
  $r = Invoke-WebRequest -Uri "$render/health" -UseBasicParsing -TimeoutSec 180
  "health_status=$($r.StatusCode)"
  "cuerpo=$($r.Content)"
} catch {
  "health_error=$($_.Exception.Message)"
  exit 1
}
```

Expected: `health_status=200` y un cuerpo con `"status":"ok"`. Si tarda, es el cold start del plan free; esperar hasta 180 s. Si falla, revisar los logs de Render antes de seguir.

---

### Task 4: Proxy `/api/*` en `vercel.json` con la URL real de Render

**Files:**
- Modify: `vercel.json` (agregar `rewrites`)
- Modify: `apps/web/src/lib/api.test.ts` (test de base relativa)

**Interfaces:**
- Consumes: `C:\Users\airto\AppData\Local\Temp\opencode\render-url.txt` de Task 3; `api()` en `apps/web/src/lib/api.ts` (sin cambios).
- Produces: `vercel.json` con `rewrites[0] = { source: '/api/:path*', destination: '<URL de Render>/:path*' }`. El navegador llama siempre a `/api/...`.

- [ ] **Step 1: Verificar que hoy falta el rewrite (debe fallar)**

```powershell
node -e "const c=require('./vercel.json'); if(!c.rewrites || !c.rewrites.some(r=>r.source==='/api/:path*')) { console.error('FAIL: falta rewrite'); process.exit(1) } console.log('OK')"
```

Expected: FAIL con `FAIL: falta rewrite`.

- [ ] **Step 2: Write the failing web test**

Agregar al `describe('api', ...)` de `apps/web/src/lib/api.test.ts`:

```ts
  it('usa la base relativa /api sin duplicar barras', async () => {
    const anterior = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = '/api';
    jest.resetModules();
    const { api: apiRelativa } = require('./api') as typeof import('./api');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true })
    }) as any;

    await apiRelativa('/products');

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/products');
    if (anterior === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = anterior;
    jest.resetModules();
  });
```

- [ ] **Step 3: Run test to verify it passes with the existing helper**

Run: `npm -w apps/web test -- --runInBand src/lib/api.test.ts`
Expected: PASS (4 tests). Confirma que `api.ts` no necesita cambios.

- [ ] **Step 4: Generar `vercel.json` con la URL de Render**

Desde la raíz del repo:

```powershell
node -e "const fs=require('fs');const u=fs.readFileSync('C:/Users/airto/AppData/Local/Temp/opencode/render-url.txt','utf8').trim().replace(/\/+$/,'');if(!/^https:\/\/[A-Za-z0-9.-]+\.onrender\.com$/.test(u))throw new Error('URL de Render inválida');const c={'$schema':'https://openapi.vercel.sh/vercel.json',framework:'nextjs',installCommand:'npm install',buildCommand:'npm -w apps/web run build',outputDirectory:'apps/web/.next',rewrites:[{source:'/api/:path*',destination:u+'/:path*'}]};fs.writeFileSync('vercel.json',JSON.stringify(c,null,2)+'\n');console.log('rewrite='+u+'/:path*')"
```

- [ ] **Step 5: Verify the config and the full web suite**

```powershell
node -e "const fs=require('fs');const u=fs.readFileSync('C:/Users/airto/AppData/Local/Temp/opencode/render-url.txt','utf8').trim().replace(/\/+$/,'');const c=require('./vercel.json');const r=c.rewrites.find(x=>x.source==='/api/:path*');if(!r||r.destination!==u+'/:path*')process.exit(1);console.log('rewrite_ok')"
```

Run: `npm -w apps/web test -- --runInBand`
Expected: `rewrite_ok` y PASS (52 tests: 51 existentes + 1 nuevo).

- [ ] **Step 6: Commit**

```powershell
git add vercel.json apps/web/src/lib/api.test.ts
git commit -m "feat(fase6): proxy de /api hacia Render en Vercel"
```

---

### Task 5: Runbook gratuito en el README

**Files:**
- Modify: `README.md` (nueva sección antes de «## Despliegue en VPS»; conservar la sección VPS y la nota final)

**Interfaces:**
- Consumes: URL de Render de Task 3, URL de Vercel de Task 6 (documentadas con la notación `https://<proyecto>.vercel.app`).
- Produces: instrucciones repetibles para el modo gratuito, sin secretos y sin borrar el runbook anterior.

- [ ] **Step 1: Insertar la sección nueva**

Insertar justo antes de la línea `## Despliegue en VPS`:

```markdown
## Despliegue gratuito (Vercel + Render)

La web se sirve desde Vercel en `https://<proyecto>.vercel.app` y la API desde un Web Service gratuito de Render en `https://<servicio>.onrender.com`. Vercel reescribe `/api/:path*` hacia Render, así que el navegador ve un único origen: las cookies `cart_id` y `sb_access` siguen siendo host-only, `httpOnly`, `sameSite=lax` y `secure` en producción, sin pasar a `sameSite=none`. No hace falta dominio propio ni VPS.

### Render

Crear un *Web Service* free apuntando a `https://github.com/AnaMaydana/ProyectoTW1`, rama `feature/fase6-vercel`, raíz del repo, Runtime `Node`, Health Check Path `/health`.

- Build Command: `npm install && npm -w apps/api run build`
- Start Command: `npm -w api run start:prod`
- Variables: `DATABASE_URL` (URI del pooler de Supabase), `JWT_SECRET`, `CORS_ORIGIN` (URL de Vercel) y `NODE_ENV=production`. Render define `PORT`; la API lo lee con `apiPort()` y usa `API_PORT`/`3001` solo en local.
- Los secretos se toman del `.env` local y se cargan en el dashboard; nunca se versionan ni se imprimen.

Verificación directa (el plan free duerme tras 15 min; la primera llamada puede tardar ~1 min):

```bash
curl -i https://<servicio>.onrender.com/health    # 200, {"status":"ok",...}
```

### Vercel

`vercel.json` contiene el build del workspace `apps/web` y el rewrite a la URL pública de Render. Configurar la variable de entorno del proyecto (no del repo):

```powershell
'/api' | npx vercel@latest env add NEXT_PUBLIC_API_URL --environment production --force --yes
npx --yes vercel@latest deploy --prod --yes
```

Si `--force` no está disponible, borrar la variable con `npx vercel@latest env rm NEXT_PUBLIC_API_URL production --yes` y repetir `env add`. Cambiar `NEXT_PUBLIC_API_URL` exige un nuevo deploy porque se incrusta en el bundle.

### Verificación

```bash
curl -I https://<proyecto>.vercel.app/menu          # 200
curl -i https://<proyecto>.vercel.app/api/health    # 200 a través del proxy
curl -i https://<proyecto>.vercel.app/api/cart      # Set-Cookie: cart_id=...; HttpOnly; SameSite=Lax; Secure
```

En el navegador: registro, carrito persistente al cerrar y checkout dentro de 06:00–11:00 de America/La_Paz. Fuera de horario solo se verifica el humo HTTP; `E2E_FIXED_NOW` es exclusivo de pruebas locales.

### Rollback y límites

Promover un deployment anterior en Vercel («Promote») o seleccionar un commit anterior en Render. La base no se toca, así que no hay migración inversa. Render free duerme tras 15 min y Supabase free se pausa tras una semana de inactividad; para disponibilidad continua se migra a plan pago o VPS sin cambiar el código.

```

- [ ] **Step 2: Verificar que el runbook anterior y la nota siguen intactos**

```powershell
$txt = Get-Content -Path 'README.md' -Raw
"seccion_gratuita=$($txt -match '## Despliegue gratuito \(Vercel \+ Render\)')"
"seccion_vps=$($txt -match '## Despliegue en VPS')"
"nota_no_push=$($txt -match 'No hacer push a GitHub sin la aprobación final del usuario\.')"
```

Expected: las tres líneas en `True`.

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs(fase6): runbook de despliegue gratuito Vercel + Render"
```

---

### Task 6: Deploy en Vercel y verificación final

**Files:** ninguno en el repo. Usa los commits locales de Task 4 y 5; despliega el working tree actual.

**Interfaces:**
- Consumes: token de Vercel en archivo temporal, `vercel.json` de Task 4, variable `NEXT_PUBLIC_API_URL=/api`.
- Produces: web en `https://<proyecto>.vercel.app`, `/api/health` respondiendo a través del proxy, cookie `cart_id` host-only, suites en verde y panel actualizado.

- [ ] **Step 1: Gate del token sin imprimirlo**

```powershell
$env:VERCEL_TOKEN = (Get-Content -Path 'C:\Users\airto\AppData\Local\Temp\opencode\vercel-token.txt' -Raw).Trim()
"token_present=$([bool]$env:VERCEL_TOKEN)"
npx --yes vercel@latest whoami
```

Expected: `token_present=True` y `airton20`. Si el token falta o es inválido, **detenerse**; no desplegar.

- [ ] **Step 2: Vincular proyecto, configurar variable y desplegar**

```powershell
npx --yes vercel@latest link --yes
'/api' | npx --yes vercel@latest env add NEXT_PUBLIC_API_URL --environment production --force --yes
$url = npx --yes vercel@latest deploy --prod --yes | Where-Object { $_ -match '^https://' } | Select-Object -Last 1
if (-not $url) { throw 'No se obtuvo URL de deployment' }
$url | Set-Content -Path 'C:\Users\airto\AppData\Local\Temp\opencode\vercel-url.txt'
"web_url=$url"
```

Si `env add --force` no es aceptado, ejecutar `npx --yes vercel@latest env rm NEXT_PUBLIC_API_URL production --yes` y repetir el `env add`. Actualizar `CORS_ORIGIN` en Render con esta URL y esperar a que redespliegue.

- [ ] **Step 3: Verificar HTML y Health Check a través del proxy**

```powershell
$web = (Get-Content -Path 'C:\Users\airto\AppData\Local\Temp\opencode\vercel-url.txt' -Raw).Trim().TrimEnd('/')
$menu = Invoke-WebRequest -Uri "$web/menu" -UseBasicParsing -TimeoutSec 60
"menu_status=$($menu.StatusCode)"
$health = Invoke-WebRequest -Uri "$web/api/health" -UseBasicParsing -TimeoutSec 180
"api_health_status=$($health.StatusCode)"
"api_health_body=$($health.Content)"
```

Expected: `menu_status=200`, `api_health_status=200` y cuerpo con `"status":"ok"`.

- [ ] **Step 4: Verificar la cookie `cart_id` sin imprimir su valor**

```powershell
$cart = Invoke-WebRequest -Uri "$web/api/cart" -UseBasicParsing -TimeoutSec 180
$cookie = ($cart.Headers['Set-Cookie'] -join ';')
"cart_status=$($cart.StatusCode)"
"cart_cookie=$($cookie -match 'cart_id=')"
"http_only=$($cookie -match 'HttpOnly')"
"same_site_lax=$($cookie -match 'SameSite=Lax')"
"secure=$($cookie -match 'Secure')"
"sin_domain=$(-not ($cookie -match 'Domain='))"
```

Expected: `cart_status=200` y las cinco comprobaciones en `True`. Si aparece `Domain=` o `SameSite=None`, detenerse: el rewrite no está haciendo de proxy.

- [ ] **Step 5: Correr todas las suites y los builds**

```powershell
npm -w apps/api test -- --runInBand
npm -w apps/web test -- --runInBand
npm -w apps/api run build
npm -w apps/web run build
```

Expected: los cuatro comandos con exit 0 (89 tests API, 52 tests Web). Verificar además que no aparecen archivos de esquema/migraciones en `git status --short`.

- [ ] **Step 6: E2E con reloj fijo (fuera de horario real)**

Con la app local corriendo en otras terminales (`npm -w apps/api run start:dev` y `npm -w apps/web run dev`, según «Arranque» del README) y `E2E_BASE_URL` sin definir:

```powershell
$env:E2E_FIXED_NOW = '2026-11-25T14:00:00.000Z'
npm -w apps/web run e2e
Remove-Item Env:E2E_FIXED_NOW
git status --short
```

Expected: 9/9 E2E en verde para 360×800, 768×1024 y 1366×768. La variable se usa solo en la corrida local; nunca en producción.

- [ ] **Step 7: Actualizar el panel y pedir aprobación para publicar los commits finales**

Actualizar `C:\Users\airto\AppData\Local\Temp\opencode\fase6-progress.html` con: web desplegada, URL real, health 200, cookie verificada, suites y E2E en verde. Mostrarlo con `tools.browser.preview`.

Luego preguntar explícitamente: «¿Autorizás que suba los commits de `vercel.json` y `README.md` y que actualice el PR #2? No voy a hacer merge.» **Sin respuesta afirmativa, no ejecutar** `git push` ni tocar el PR. Si hay aprobación:

```powershell
git push origin feature/fase6-vercel
```

y actualizar título/cuerpo del PR #2 a la modalidad gratuita, manteniendo la base `feature/fase1`. El merge queda pendiente de otra aprobación explícita.
