# Fase 6 — Web en Vercel con API en VPS

**Estado:** diseño aprobado en charla el 2026-11-26 (secciones de arquitectura y de cambios/verificación). Este documento es la autoridad para el plan de implementación.

## Contexto

La Fase 5 dejó el stack en Docker Compose con Caddy como único origen HTTPS (`$DOMAIN`), Next.js en `web:3000`, NestJS en `api:3001` y Supabase Postgres. Ese trabajo está publicado: PR #1 fusionado en `feature/fase1` (`edd03ee`). El usuario pide ahora que la **web Next.js se sirva desde Vercel**, manteniendo la API en el VPS de la Fase 5 y usando el mismo dominio raíz.

## Objetivos

- La UI Next.js se compila y sirve desde Vercel en `https://www.$DOMAIN`.
- La API NestJS sigue en el VPS detrás de Caddy en `https://$DOMAIN/api/*` (prefijo eliminado por `handle_path`).
- El navegador puede mantener sesión y carrito al cruzar de `www.$DOMAIN` a `$DOMAIN/api`.
- `DOMAIN` sigue siendo la fuente principal; `WEB_ORIGIN` es un override explícito solo para el modo Vercel.
- El despliegue se hace con la CLI de Vercel usando `VERCEL_TOKEN`, sin credenciales versionadas.
- La guía operativa queda documentada en `README.md`, incluyendo rollback.

## Fuera de alcance

- Migrar la API NestJS a Vercel Functions/serverless.
- Cambiar las cookies a `sameSite=none` (innecesario: ambos hosts comparten dominio raíz).
- Usar un subdominio `api.$DOMAIN` o publicar el puerto 3001.
- Cambios de esquema, migraciones, reglas de negocio, horario, precios o interfaz.
- WAF, rate limiting, backups, monitoreo externo y alarmas.
- Ejecutar el despliegue real sin `VERCEL_TOKEN`, sin el dominio exacto y sin el CNAME de `www` configurado.

## Arquitectura

```text
Navegador (https://www.$DOMAIN)
  │  HTML/JS servido por Vercel (Next.js)
  │  fetch https://$DOMAIN/api/*  credentials: include
  ▼
Caddy en VPS ($DOMAIN:443)
  handle_path /api/* → api:3001
  handle (resto)     → web:3000 (se mantiene para E2E local; canónico es www)
  ▼
NestJS (api:3001) → Supabase Postgres
```

- **DNS:** registro A de `$DOMAIN` a la IP del VPS; CNAME de `www.$DOMAIN` al destino que indique Vercel (`cname.vercel-dns.com`). TLS de `www` lo gestiona Vercel; TLS del apex lo gestiona Caddy.
- **Cookies:** `CookieService` emite `cart_id` y `sb_access` sin atributo `Domain` (host-only de `$DOMAIN`), `httpOnly`, `sameSite: lax` y `secure` en producción. Como `www.$DOMAIN` y `$DOMAIN` comparten dominio registrable, la petición es same-site y las cookies se envían al API sin cambios de código en `cookie.service.ts`.
- **Server Components:** `apps/web/src/app/menu/page.tsx` usa `API_INTERNAL_URL` si existe (Docker) y por defecto cae a `NEXT_PUBLIC_API_URL`. En Vercel no hay `API_INTERNAL_URL`, así que funciona con la URL pública sin cambios.
- **CORS:** `app.enableCors({ origin: env.corsOrigin, credentials: true })` sigue igual. `env.corsOrigin` pasa a resolver `WEB_ORIGIN ?? CORS_ORIGIN ?? 'http://localhost:3000'`, y Compose deriva `CORS_ORIGIN` de `WEB_ORIGIN` con default `https://$DOMAIN`. En modo Vercel se define `WEB_ORIGIN=https://www.$DOMAIN`.

## Variables de entorno

| Variable | Dónde | Valor | Observación |
| --- | --- | --- | --- |
| `DOMAIN` | `.env` del VPS | dominio raíz, sin `https://` ni `/` | Fuente principal; Caddy y Compose la usan |
| `WEB_ORIGIN` | `.env` del VPS (opcional) | `https://www.$DOMAIN` en modo Vercel | Si no se define, se mantiene `https://$DOMAIN` |
| `CORS_ORIGIN` | Compose (`environment`) | `${WEB_ORIGIN:-https://${DOMAIN:-localhost}}` | Se valida con `docker compose config` |
| `NEXT_PUBLIC_API_URL` | Proyecto de Vercel (build time) | `https://$DOMAIN/api` | Se incrusta en el bundle; no se guarda en el repo |
| `API_INTERNAL_URL` | Solo Compose | `http://api:3001` | No existe en Vercel; el fallback ya cubre el caso |
| `VERCEL_TOKEN` | Entorno del operador | token de Vercel | Nunca se commitea ni se pega en logs |

## Componentes a modificar

1. `apps/api/src/config/env.ts`: resolver `corsOrigin` con precedencia `WEB_ORIGIN` → `CORS_ORIGIN` → `http://localhost:3000`.
2. `apps/api/src/config/env.spec.ts` (nuevo; hoy no existe spec de configuración): casos RED→GREEN para el override y para el default actual.
3. `docker-compose.yml`: `CORS_ORIGIN` derivado de `WEB_ORIGIN` con default basado en `DOMAIN`; sin puertos nuevos ni cambios en Caddyfile.
4. `.env.example`: documentar `WEB_ORIGIN` como opcional y su valor en modo Vercel.
5. `vercel.json` (nuevo, raíz): `framework: nextjs`, `installCommand: npm install`, `buildCommand: npm -w apps/web run build`, `outputDirectory: apps/web/.next`. Sin dominios ni secretos hardcodeados.
6. `README.md`: sección «Despliegue híbrido (Vercel + VPS)» con DNS, variables, pasos de CLI, verificación y rollback. Conservar la sección de VPS y la nota «No hacer push a GitHub sin la aprobación final del usuario».

## Verificación

- Unitarios: API ≥ 79/79 (incluido el nuevo caso de `WEB_ORIGIN`) y Web 51/51, con TDD RED→GREEN para el cambio de `env.ts`.
- Builds: `npm -w apps/api run build` y `npm -w apps/web run build` exit 0.
- Compose: `docker compose config` confirma que con `WEB_ORIGIN=https://www.ejemplo.test` el API recibe ese origen y que sin la variable recibe `https://$DOMAIN`; `web`/`api` siguen sin `ports`.
- Stack local: smoke `https://localhost/api/health` 200, `/menu` 200 y E2E 9/9 en 360×800, 768×1024 y 1366×768 (el default sin `WEB_ORIGIN` no cambia).
- Despliegue real: `https://www.$DOMAIN/menu` 200 y flujo de registro/carrito/checkout en el dominio, más `https://$DOMAIN/api/health` 200. El reloj fijo E2E no se usa en producción; si la verificación cae fuera de 06:00–11:00 Bolivia, se comprueba solo el humo HTTP y se difiere el checkout a horario hábil.

## Despliegue y rollback

1. Confirmar DNS: apex al VPS y `www` a Vercel, con `VERCEL_TOKEN` disponible en el entorno.
2. Configurar `NEXT_PUBLIC_API_URL=https://$DOMAIN/api` en el proyecto de Vercel.
3. Ejecutar la CLI de Vercel desde la raíz del repo y verificar los URLs anteriores.
4. Si falla: promover el deployment anterior de Vercel (`vercel rollback` o promoción desde el dashboard). El VPS y la base no se tocan, así que no hay migración inversa.

## Riesgos

- Si el CNAME de `www` no está listo, Vercel no podrá emitir el certificado: corregir DNS y reintentar.
- Si `WEB_ORIGIN` queda con el valor viejo, el navegador verá error de CORS con credenciales; verificar `docker compose config` y reiniciar `api`.
- `NEXT_PUBLIC_API_URL` se incrusta en build time: cambiar el dominio exige redeploy de Vercel y recrear el API del VPS.

## Criterios de aceptación

- La web responde en `www.$DOMAIN` y la API en `$DOMAIN/api` con HTTPS válido.
- Login, carrito persistente y checkout funcionan cruzando ambos hosts.
- No hay cambios en `saltenanga_schema.sql` ni en las reglas de negocio.
- El token de Vercel no aparece en el repo, diffs ni logs.
- La documentación explica cómo desplegar, verificar y hacer rollback.
