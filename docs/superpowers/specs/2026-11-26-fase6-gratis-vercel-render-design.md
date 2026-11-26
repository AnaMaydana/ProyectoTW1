# Fase 6 (modalidad gratuita) — Web en Vercel con API en Render

**Fecha:** 2026-11-26
**Estado:** propuesto — pendiente de revisión del spec escrito

## Contexto

La Fase 5 dejó el repositorio preparado para VPS con Docker Compose + Caddy, pero **nunca se desplegó**: no hay VPS contratada, no hay IP de servidor y el dominio `salteñanga.com` (`xn--salteanga-p6a.com`) no tiene registros A ni CNAME. El spec anterior de Fase 6 asumía que la API ya corría en ese VPS; esa premisa es falsa.

Sí existen, y se reutilizan:

- Un proyecto de Supabase con el esquema completo (`rol`, `usuario`, `categoria`, `producto`, `inventario`, `pedido`, `detalle_pedido`, `metodo_pago`, `pago`, `comprobante`, `carrito`, `carrito_detalle`) y datos cargados.
- Un token válido de Vercel (cuenta `airton20`), guardado fuera del repositorio, nunca impreso ni versionado.
- El PR #2 con todos los commits de Fase 6 ya pusheados en `feature/fase6-vercel`.

El usuario pide publicar la aplicación **sin costo**, sin contratar servidor ni comprar dominio.

## Objetivo

Publicar la tienda de forma gratuita: la web Next.js en Vercel y la API NestJS en un Web Service gratuito de Render, compartiendo un mismo origen visible para el navegador, sin cambiar cookies, esquema, reglas de negocio ni interfaz.

## No objetivos

- No contratar VPS ni configurar Caddy en producción.
- No comprar ni configurar `salteñanga.com` en este alcance (se puede agregar después).
- No modificar `saltenanga_schema.sql`, migraciones, entidades ni reglas de horario/expiración.
- No cambiar `sameSite`, `httpOnly`, `secure` ni el nombre de las cookies.
- No cambiar textos, precios en Bs, colores, responsive ni tamaños de botones de la UI.
- No hacer push, PR ni merge adicionales sin aprobación explícita.

## Arquitectura

```text
Navegador
   │  https://<proyecto>.vercel.app        (páginas Next.js)
   │  GET/POST /api/...  (mismo origen)
   ▼
Vercel (rewrite externo)
   │  reenvía /api/:path* a la API
   ▼
Render Web Service (plan free) — NestJS
   │  DATABASE_URL / JWT_SECRET
   ▼
Supabase Postgres (proyecto existente)
```

La petición del navegador siempre es al dominio de Vercel. El rewrite de Vercel ocurre en el CDN, antes de llegar a la función: para el navegador no hay CORS ni preflight, y los encabezados `Set-Cookie` llegan con el dominio de Vercel.

### Decisiones clave

1. **Proxy en Vercel, no llamada directa.** El navegador usa rutas relativas `/api/*`. Así las cookies `cart_id` y `sb_access` siguen siendo `host-only`, `httpOnly`, `sameSite=lax` y `secure`, sin pasar a `sameSite=none`.
2. **Render como host de la API.** Es el único plan gratuito que no pide tarjeta, corre Node/NestJS y permite health check. Railway se descarta por su crédito mensual de US$1; Koyeb por exigir tarjeta con reserva de US$29.
3. **Base de datos existente.** No se crea otra base; se reutiliza el proyecto de Supabase ya aprovisionado.
4. **Dominio opcional.** Se publica primero en `*.vercel.app`. `www.salteñanga.com` puede agregarse después sin cambiar el código.
5. **Sin secretos en el repositorio.** La URL de Render es pública y va en `vercel.json`; tokens, `DATABASE_URL` y `JWT_SECRET` viven solo en variables de entorno de cada plataforma.

## Componentes y responsabilidades

### Web (Vercel)

- Compila el workspace `apps/web` con `npm -w apps/web run build` y sirve `apps/web/.next`.
- Variable de build: `NEXT_PUBLIC_API_URL=/api`. El helper `api()` concatena `${BASE}${path}` y todos los `path` empiezan con `/`, por lo que las llamadas quedan `/api/products`, `/api/orders`, etc. No requiere cambios en `apps/web/src/lib/api.ts`.
- `vercel.json` agrega el rewrite:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<servicio>.onrender.com/:path*" }
  ]
}
```

El nombre exacto del servicio se completa con la URL real que asigne Render; es un valor público.

### API (Render)

- Web Service gratuito (512 MB, 0.1 vCPU) apuntando al repositorio, con root directory en la raíz del monorepo.
- Build: `npm install && npm -w apps/api run build`.
- Start: `npm -w api run start:prod` (ejecuta `node dist/src/main.js` con cwd `apps/api`).
- Health check: `/health` (Vercel lo expone como `/api/health`).
- Render inyecta `PORT`; la API debe escuchar en ese puerto. Hoy `main.ts` llama a `app.listen(3001)` de forma fija: se extrae una función `apiPort()` en `apps/api/src/config/env.ts` que prioriza `PORT`, luego `API_PORT`, y por defecto `3001`. `main.ts` usa ese valor. La función se cubre con tests en `env.spec.ts` (TDD).

Variables de entorno en Render (nunca en el repo):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | URI del pooler de Supabase, tomada del `.env` local existente |
| `JWT_SECRET` | Secreto existente del `.env` local |
| `CORS_ORIGIN` | URL de Vercel, p. ej. `https://<proyecto>.vercel.app` |
| `NODE_ENV` | `production` |
| `PORT` | Lo asigna Render automáticamente |

### Base de datos (Supabase)

- Sin cambios de esquema ni migraciones.
- Plan free: se pausa tras una semana con poca actividad; se reactiva desde el dashboard. Aceptado como limitación del modo gratuito.

## Flujo de una petición

1. El usuario abre `/menu` en Vercel.
2. Un componente llama a `api('/products')`, que hace `fetch('/api/products', { credentials: 'include' })`.
3. Vercel reescribe la ruta y envía la petición a `https://<servicio>.onrender.com/products`.
4. NestJS valida la cookie `cart_id`, consulta Supabase y responde JSON.
5. Vercel devuelve la respuesta al navegador bajo su propio dominio, incluido `Set-Cookie` cuando corresponde.
6. La cookie queda ligada al host de Vercel y se envía de vuelta en la siguiente llamada `/api/*`.

## Manejo de errores y casos límite

- Si Render está dormido, la primera petición puede tardar ~1 minuto; no es un error. Se documenta en el README.
- Si Supabase está pausado, la API responde error de base; se reactiva el proyecto desde el dashboard y se reintenta.
- Si `PORT` no está definido (desarrollo local), `apiPort()` devuelve `API_PORT` o `3001`: el arranque local queda intacto.
- Si `DATABASE_URL` o `JWT_SECRET` faltan, `loadEnv()` sigue fallando con el mensaje en español actual.
- Un `WEB_ORIGIN` vacío sigue interpretándose como "no definido" (comportamiento ya cubierto por tests).
- No se agrega `sameSite=none`, por lo que no se requiere `Secure` adicional más allá del existente en producción.

## Verificación y criterios de aceptación

1. Suite API en verde (83 tests + los nuevos casos de `apiPort()`).
2. Suite Web en verde (51 tests).
3. Builds de producción con exit 0.
4. `GET https://<proyecto>.vercel.app/menu` → 200.
5. `GET https://<proyecto>.vercel.app/api/health` → 200 a través del proxy.
6. Tras una llamada que cree carrito, la respuesta incluye `Set-Cookie: cart_id=…; HttpOnly; SameSite=Lax; Secure` y el navegador la devuelve en la siguiente petición.
7. Registro, carrito persistente y checkout dentro de 06:00–11:00 de `America/La_Paz`; sin pendientes fuera de horario.
8. Sin cambios en `git status` sobre archivos de esquema, migraciones ni reglas de negocio.

## Límites conocidos del modo gratuito

- Render free duerme tras 15 minutos sin tráfico y tarda alrededor de un minuto en despertar; no está pensado para producción de alta disponibilidad.
- Supabase free se pausa por inactividad semanal y no incluye backups automáticos.
- Vercel Hobby tiene cuotas de ancho de banda y funciones; suficientes para una tienda chica.
- Si se necesita disponibilidad continua, la migración posterior a plan pago o VPS **no requiere cambiar el código**, solo el host de la API y la variable `NEXT_PUBLIC_API_URL`.

## Rollback

- Web: promover un deployment anterior desde el dashboard de Vercel.
- API: seleccionar un commit anterior en Render y redesplegar.
- Base de datos: no se toca, por lo que no hay migración inversa.

## Seguridad

- `VERCEL_TOKEN` y cualquier token de Render se guardan fuera del repositorio (mismo mecanismo que el archivo temporal ya usado) y nunca se imprimen en logs ni se versionan.
- La URL pública de Render no es un secreto; si se quiere limitar el acceso directo, se puede agregar un encabezado compartido entre Vercel y Render en una iteración posterior (fuera de este alcance).
- Se conserva la nota del README: “No hacer push a GitHub sin la aprobación final del usuario.”

## Historia

Este spec reemplaza la modalidad de VPS del spec `2026-11-26-fase6-vercel-design.md`, que queda como referencia histórica. El código de esa modalidad ya está en el PR #2 y se reutiliza íntegramente; los cambios de esta modalidad son aditivos.
