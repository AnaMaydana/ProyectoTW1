# SALTEÑANGA — Fase 3: Administración — Diseño técnico

**Fecha:** 2026-11-25
**Ubicación:** `H:\PROYECTO DE SALTEÑERIA`
**Estado:** propuesto, pendiente de revisión del usuario. No se escribió código de producto.
**Idioma y moneda:** español, precios en bolivianos (Bs).

---

## 1. Contexto y alcance

La Fase 1 (cliente y pedidos) quedó terminada y verificada: 23 tests de API, 22 de Web, 3 E2E, builds, esquema y BD OK, y Docker respondiendo 200 en `web` y `api`. La spec de Fase 1 `docs/superpowers/specs/2026-11-24-tienda-salteñas-design.md` difirió a la Fase 3 el "CRUD de productos y categorías, inventario de insumos y alertas, reportes (RF-15, RF-17, RF-18)".

**No se dispone del texto original de RF-15, RF-17 y RF-18.** El usuario autorizó explícitamente trabajar con supuestos marcados. Este documento los enumera en la sección 11 y son parte del alcance aprobado a revisar.

Fuentes de verdad del modelo de datos: `saltenanga_schema.sql` (contenido exacto entregado, inmodificable) y `saltenanga_schema_adaptado.sql` (correcciones aditivas ya aplicadas). **No se renombran tablas ni columnas.**

### 1.1 Incluido

- CRUD administrativo de `categoria`, `producto` e `inventario`.
- Cuatro reportes básicos calculados sobre tablas existentes.
- Creación del primer usuario `ADMIN` mediante script controlado.
- Panel web `/admin` con acceso restringido por rol.

### 1.2 Diferido

- Fase 2: panel del cajero, cambio de estados, realtime y entrega.
- Fase 4: QR/transferencia y descarga de comprobantes.
- Fase 5: despliegue con HTTPS, certificado, monitoreo y optimización.
- Inventario de **insumos** (tablas nuevas): fuera de este alcance por el supuesto S1.
- Habilitación de `TARJETA`: sigue rechazada por la API.

---

## 2. Decisiones confirmadas

| Tema | Decisión |
|---|---|
| Enfoque | Módulo `admin` dentro del Nest actual + páginas `/admin` en Next (opción A). Sin portal separado. |
| Autorización | Guard `@Roles('ADMIN')` que obtiene el rol con `AuthService.me()`, no del JWT. |
| JWT | Sin cambios: sigue llevando solo `sub` y `email`. Un cambio de rol surte efecto sin re-login. |
| Primer ADMIN | Script `scripts/create-admin.mjs`, idempotente, con credenciales desde variables de entorno. |
| Reportes | Los 4 básicos: ventas por día, productos más vendidos, pedidos por estado y stock bajo. Sin librería de gráficos. |
| Bajas | Lógicas (`activo`/`activa`/`disponible_hoy`), nunca `DELETE` físico. |
| Disponibilidad | Se administra `inventario.disponible_hoy`, que es lo que ya consumen catálogo, carrito y pedidos. `inventario.disponible` se deja intacto. |
| RLS | Sin cambios: la API usa un único rol de BD (`saltenanga_app`), la autorización es de aplicación. |
| IDs | Numéricos expuestos como string en JSON, igual que Fase 1. |

---

## 3. Arquitectura

```text
Navegador (usuario ADMIN)
   | cookie httpOnly sb_access
   v
Next.js /admin/*  ---->  Nest /admin/*  ---->  Supabase Postgres
                          RolesGuard
                          AdminCatalogService
                          AdminReportsService
```

El guard y los servicios viven en el mismo proceso que la API de clientes. No se agrega ninguna dependencia npm nueva.

---

## 4. Componentes

### 4.1 Backend (NestJS)

- `apps/api/src/admin/admin.module.ts`: registra `AdminController`, `AdminCatalogService` y `AdminReportsService`.
- `apps/api/src/admin/admin.controller.ts`: rutas bajo `/admin`, con `@UseGuards(RolesGuard)` y `@Roles('ADMIN')` a nivel de controlador.
- `apps/api/src/admin/admin-catalog.service.ts`: operaciones sobre `categoria`, `producto` e `inventario`; transacciones para altas.
- `apps/api/src/admin/admin-reports.service.ts`: consultas agregadas de solo lectura.
- `apps/api/src/common/guards/roles.guard.ts` + `roles.decorator.ts`: lee `sb_access`, llama a `me()`, aplica 401/403.
- DTOs con `class-validator` para cada body y para los parámetros de reportes.
- `scripts/create-admin.mjs`: usa `pg` y `bcryptjs`; si el correo existe, promueve el rol a `ADMIN`; si no, crea el usuario. Imprime solo un resumen sin secretos.

### 4.2 Frontend (Next.js)

- `apps/web/src/app/admin/layout.tsx`: verificación de rol y navegación del panel.
- `apps/web/src/app/admin/page.tsx`: resumen con accesos a las tres secciones.
- `apps/web/src/app/admin/products/page.tsx`: tabla, formulario de alta/edición y desactivación.
- `apps/web/src/app/admin/categories/page.tsx`: alta, edición y activar/desactivar.
- `apps/web/src/app/admin/inventory/page.tsx`: edición de stock, toggle de `disponible_hoy`, badge de stock bajo.
- `apps/web/src/app/admin/reports/page.tsx`: las cuatro consultas en tablas y totales.
- `AuthNav`: link a "Administración" solo cuando `user.role === 'ADMIN'`.

### 4.3 Infraestructura

- `.env.example`: variables opcionales `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `LOW_STOCK_THRESHOLD` (default 5), comentadas.
- `README.md`: instrucciones del script de admin y del panel. Sin cambios en Docker ni en CORS.

---

## 5. Datos y endpoints

Todas las rutas responden JSON. Los IDs numéricos se devuelven como string.

| Método | Ruta | Body / parámetros | Respuesta |
|---|---|---|---|
| GET | `/admin/categories` | — | `{ categories: [{ id, nombre, activa, productCount }] }` |
| POST | `/admin/categories` | `{ nombre }` | `{ category }` · 201 |
| PATCH | `/admin/categories/:id` | `{ nombre?, activa? }` | `{ category }` |
| GET | `/admin/products` | `?category=&includeInactive=` | `{ products: [{ id, nombre, categoria, precio, fotoUrl, activo, stock, disponibleHoy }] }` |
| POST | `/admin/products` | `{ idCategoria, nombre, descripcion?, precio, fotoUrl?, stock?, disponibleHoy? }` | `{ product }` · 201 |
| PATCH | `/admin/products/:id` | los mismos campos, todos opcionales | `{ product }` |
| GET | `/admin/inventory` | — | `{ items: [{ id, productId, nombre, stock, disponibleHoy, lowStock }] }` |
| PATCH | `/admin/inventory/:id` | `{ stock?, disponibleHoy? }` | `{ item }` |
| GET | `/admin/reports/sales` | `?from=AAAA-MM-DD&to=AAAA-MM-DD` | `{ rows: [{ fecha, pedidos, totalBs }] }` |
| GET | `/admin/reports/top-products` | `?from=&to=&limit=` (default 10, máx. 50) | `{ rows: [{ productId, nombre, unidades, totalBs }] }` |
| GET | `/admin/reports/orders-by-status` | `?from=&to=` (default: día actual) | `{ rows: [{ estado, pedidos }] }` |
| GET | `/admin/reports/low-stock` | `?threshold=` (default `LOW_STOCK_THRESHOLD`) | `{ rows: [{ productId, nombre, stock }] }` |

Reglas de datos:

- El alta de producto inserta `producto` e `inventario` en **una transacción**. Sin `stock` explícito queda `stock = 0` y `disponible_hoy = false`.
- Bajas lógicas: `categoria.activa = false`, `producto.activo = false` + `inventario.disponible_hoy = false`. Nunca `DELETE`: `detalle_pedido` referencia productos y el historial debe conservarse.
- `categoria.nombre` y `producto.nombre` son únicos: duplicado devuelve 409.
- `stock` debe ser entero `>= 0`; `precio >= 0`; fechas `from`/`to` en formato `AAAA-MM-DD` y `from <= to`.
- Ordinalidad de precios y totales: `NUMERIC(10,2)` con dos decimales, mismo formato que Fase 1.

### 5.1 Definición de los reportes

- **sales**: agrupa `pedido` por `fecha_creacion::date`, cuenta pedidos y suma `total`; excluye `estado = 'CANCELADO'`.
- **top-products**: `detalle_pedido` join `pedido`, agrupa por producto, suma `cantidad` y `subtotal`; excluye cancelados; ordena por `totalBs DESC`.
- **orders-by-status**: cuenta `pedido` agrupado por `estado`, sin excluir cancelados (información de gestión).
- **low-stock**: `inventario.stock <= threshold`, ordenado por `stock ASC`.

**Riesgo a validar en implementación:** `fecha_creacion` se graba con `NOW()` (`orders.service.ts:97`) en columna `TIMESTAMP` sin zona. Antes de fijar los filtros se verificará la zona horaria de la sesión de Postgres; si es UTC, los rangos se convertirán con `AT TIME ZONE 'America/La_Paz'` para que "día" signifique día de Bolivia.

---

## 6. Seguridad y errores

- `RolesGuard`: sin cookie o JWT inválido → **401**; usuario autenticado con rol distinto de `ADMIN` → **403**. `me()` ya valida `usuario.activo = TRUE`.
- **RLS no distingue roles**: la API se conecta con un único rol de BD. La autorización administrativa es responsabilidad de Nest; no se agregan políticas de Postgres que den una falsa sensación de seguridad.
- `create-admin.mjs`: se ejecuta solo en servidor, lee `ADMIN_EMAIL`/`ADMIN_PASSWORD` del entorno, usa `bcryptjs` (mismo factor 10 que `AuthService`), es idempotente y nunca imprime la contraseña.
- Cada escritura administrativa escribe en logs el `id_usuario` del actor y la acción, sin datos personales.
- Matriz de errores: `400` body inválido / rango de fechas / stock negativo · `401` sin sesión · `403` no admin · `404` inexistente · `409` nombre duplicado · `502` fallo de BD con mensaje genérico y log en Nest.
- CORS y cookies quedan igual que en Fase 1.

---

## 7. Interfaz

- Panel con navegación propia; link en la nav global solo para `ADMIN`.
- Si un usuario sin ese rol navega directo a `/admin/*`, la API responde 403 y la página muestra "Sin permiso" con enlace de vuelta al menú.
- Formularios con validación en cliente y mensajes de error en español; confirmación antes de desactivar.
- Diseño responsive y botones táctiles como en Fase 1. Sin dependencias de gráficos: los reportes se muestran en tablas.

---

## 8. Pruebas

- **Unitarias API:** `AdminCatalogService` (alta transaccional, baja lógica, duplicados), `AdminReportsService` (exclusión de cancelados, rangos, umbral) y `RolesGuard` (401/403).
- **E2E API (Supertest):** un `CLIENTE` recibe 403 en `/admin/*`; un `ADMIN` crea/edita/desactiva y consulta los cuatro reportes.
- **Componentes Web:** formularios, validaciones y link condicional de la nav.
- **Playwright:** nuevo spec del flujo administrativo con credenciales de admin de prueba provistas por entorno (creadas con el script, nunca versionadas).
- **Regresión:** 23 tests API, 22 Web y 3 E2E de Fase 1 deben seguir pasando; builds y `verify-db` sin cambios.

---

## 9. Supuestos y riesgos explícitos

| ID | Supuesto / riesgo | impacto si es falso |
|---|---|---|
| S1 | "Inventario de insumos" no requiere tablas nuevas; se administra solo `inventario` por producto. | Habría que ampliar el esquema aditivo y rediseñar alertas. |
| S2 | RF-17/RF-18 se satisfacen con los 4 reportes definidos y umbral de stock. | Cambiaría la lista de reportes y/o las reglas de alerta. |
| S3 | `inventario.disponible_hoy` es la bandera operativa; `disponible` no se toca. | Si `disponible` tuviera otro significado de negocio, habría que sincronizarlo. |
| S4 | Zona horaria de `fecha_creacion` se valida en implementación. | Reportes diarios podrían desfasarse 4 horas. |
| S5 | Credenciales de admin de prueba disponibles por entorno para el E2E. | El nuevo E2E se omite o se usa un admin creado en la corrida. |
| S6 | La superposición comprobante Fase 2/Fase 4 de la spec vieja no afecta Fase 3. | Ninguno sobre este alcance; se resuelve en su fase. |

---

## 10. Handoff

Una vez revisada y aprobada esta spec, el siguiente paso es invocar `writing-plans` para generar el plan de implementación de la Fase 3. No se escribirá código de producto hasta que ese plan también sea revisado y aprobado.
