# SALTEÑANGA — Fase 2: Cajero y pedidos en tiempo real — Diseño técnico

**Fecha:** 2026-11-25  
**Ubicación:** `H:\PROYECTO DE SALTEÑERIA`  
**Estado:** diseño aprobado en conversación y auto-revisado contra el código y el esquema actuales; pendiente de revisión del usuario. No se escribió código de producto.  
**Idioma y moneda:** español, precios en bolivianos (Bs).

---

## 1. Contexto y alcance

La Fase 1 (cliente y pedidos) y la Fase 3 (administración) quedaron terminadas y verificadas: API 55/55, Web 33/33, builds, esquema, BD y E2E en 360/768/1366. Este documento cubre la Fase 2, que la spec de Fase 1 difirió con este texto:

> **RF-16 — Gestión de pedidos** (Alta): El cajero ve en tiempo real los pedidos que llegan, cambia su estado y confirma la entrega al validar el código del cliente.

> **RF-14 — Comprobante del pedido** (Media): El sistema genera un comprobante con número de pedido, detalle y total, que el cliente puede ver o descargar.

Fuentes de verdad del modelo: `saltenanga_schema.sql` (contenido exacto, inmodificable) y `saltenanga_schema_adaptado.sql` (correcciones aditivas). **No se renombran tablas ni columnas. No se crean tablas nuevas.**

### 1.1 Incluido

- Panel `/cashier` para roles `CAJERO` y `ADMIN`, con listado actualizado por polling.
- Cambio de estados hacia adelante y cancelación controlada.
- Validación de entrega por código `SAL-AAAAMMDD-####`.
- Generación del comprobante en BD y visualización por el cliente.
- Auditoría con `id_usuario` del cajero y acción, sin datos personales.

### 1.2 Diferido

- Descarga del comprobante y escaneo/lectura de QR: Fase 4.
- Cobro online, pasarela y validación real de transferencias: Fase 4.
- WebSockets, SMTP y reportería nueva: fuera de este alcance.
- El panel `/admin` y sus reportes ya existen; no se modifican.

---

## 2. Decisiones confirmadas

| Tema | Decisión |
|---|---|
| Tiempo real | Polling cada 4 segundos (rango aceptado 3–5 s), sin dependencias nuevas. |
| Roles | `CAJERO` y `ADMIN` pueden operar el panel; ADMIN conserva `/admin`. |
| Transiciones | `PENDIENTE → CONFIRMADO → PREPARANDO → LISTO → ENTREGADO`. `CANCELADO` solo desde `PENDIENTE` o `CONFIRMADO`, con confirmación en la UI. `ENTREGADO` es final. |
| Validación de entrega | El cajero busca/pega el código exacto; el escaneo QR queda para Fase 4. |
| Comprobante | Se genera al marcar `ENTREGADO`, si no existe. Fase 2 lo muestra; la descarga pasa a Fase 4. |
| Cliente anónimo | `GET /orders/code/:code`, público y con datos mínimos: código, estado, total, hora de recojo y comprobante. Sin nombre ni celular. |
| Auditoría | Columnas aditivas `id_cajero` y `fecha_entrega` en `pedido`, más `Logger` con `id_usuario` y acción. Sin tabla nueva. |
| Estructura | Módulo `cashier` en Nest + panel `/cashier` en Next, espejo del módulo `admin`. |
| Pago | Al entregar, `pago` de `EFECTIVO` pasa a `PAGADO`; `QR` y `TRANSFERENCIA` quedan `PENDIENTE` hasta Fase 4. |
| Push | No se sube a GitHub sin aprobación explícita del usuario. |

### Supuestos registrados

| ID | Supuesto | Si es incorrecto |
|---|---|---|
| S1 | “Tiempo real” = polling de 4 s, suficiente para el mostrador. | Se cambia a SSE/WebSockets; el resto del diseño no cambia. |
| S2 | ADMIN también confirma entregas porque la spec dice “uso real de roles CAJERO/ADMIN”. | Se restringe a CAJERO y ADMIN queda solo como supervisor. |
| S3 | No se permiten saltos ni retrocesos de estado. | Se amplía el mapa de transiciones; la UI debe reflejarlo. |
| S4 | El código impreso en la confirmación es la credencial de entrega. | Se agrega un segundo factor (últimos dígitos del celular). |
| S5 | El número de comprobante se deriva del sufijo del código de pedido: `COM-AAAAMMDD-####`. | Se define otra numeración; la tabla `comprobante` ya admite `VARCHAR(30)`. |
| S6 | El comprobante se emite al entregar, no al confirmar el pedido. | Se emite antes; cambia el momento del `INSERT`. |
| S7 | El endpoint público por código no expone datos personales. | Se decide otra forma de acceso para el cliente anónimo. |
| S8 | No se agregan dependencias npm para esta fase. | Se justifica la dependencia y se documenta. |

---

## 3. Arquitectura

```text
                              Nest (API)
  /cashier/*  ------- RolesGuard + CashierService   (cookie sb_access)
  /orders/*   ------- OrdersService                  (sesión opcional)
  /orders/code/:code -- OrdersService.findPublicByCode (público, datos mínimos)

  Next /cashier      -> /cashier/*   (polling cada 4 s)
  Next /order/[code] -> /orders (con sesión) o /orders/code/:code (sin sesión)
  Todo                -> Postgres: pedido, detalle_pedido, pago, comprobante, usuario
```

`CashierModule` importa `DatabaseModule` y `AuthModule`, y provee `RolesGuard`, `CashierService` y `CashierController`, igual que `AdminModule`. Se registra en `AppModule`.

---

## 4. Modelo de datos: correcciones aditivas

En `saltenanga_schema_adaptado.sql`, dentro del bloque de correcciones:

```sql
ALTER TABLE pedido ADD COLUMN id_cajero INT NULL REFERENCES usuario(id_usuario);
ALTER TABLE pedido ADD COLUMN fecha_entrega TIMESTAMPTZ;
```

No se toca `saltenanga_schema.sql`. La tabla `comprobante` ya existe con `id_pedido UNIQUE`, `numero UNIQUE` y `fecha_emision`. El `CHECK` de `pedido.estado` ya incluye los seis estados, así que no hace falta modificarlo.

El “detalle y total” de RF-14 no se duplican en `comprobante`: se derivan al mostrarlo desde `detalle_pedido` y `pedido.total`. La tabla solo guarda el número y la fecha de emisión.

El verificador de esquema pasa de 13 a 15 correcciones aditivas; se actualiza `scripts/verify-schema.mjs` para reflejarlo.

---

## 5. Reglas de estado

| Estado actual | Destinos permitidos |
|---|---|
| `PENDIENTE` | `CONFIRMADO`, `CANCELADO` |
| `CONFIRMADO` | `PREPARANDO`, `CANCELADO` |
| `PREPARANDO` | `LISTO` |
| `LISTO` | `ENTREGADO` |
| `ENTREGADO` | ninguno |
| `CANCELADO` | ninguno |

La entrega solo se ejecuta por `POST /cashier/orders/:id/deliver`, que exige `LISTO` y código exacto. `PATCH .../status` nunca puede escribir `ENTREGADO`; ese estado se reserva al endpoint de entrega para garantizar auditoría y comprobante.

---

## 6. API

### 6.1 Endpoints del cajero

Todos bajo `@Controller('cashier')`, `@UseGuards(RolesGuard)` y `@Roles('CAJERO','ADMIN')`.

| Método | Ruta | Body / query | Respuesta |
|---|---|---|---|
| GET | `/cashier/orders` | `?status=&date=AAAA-MM-DD` | `{ orders: [...] }` |
| GET | `/cashier/orders/code/:code` | código exacto | `{ order }` con detalle e ítems |
| PATCH | `/cashier/orders/:id/status` | `{ status }` | `{ order }` |
| POST | `/cashier/orders/:id/deliver` | `{ code }` | `{ order, comprobante: { numero, fechaEmision } }` |

Lista: `{ id, code, customerName, customerPhone, pickupTime, status, totalBs, paymentMethod, expiresAt, createdAt, itemCount }`.  
Detalle: los mismos campos más `notes` e `items: [{ productId, name, quantity, unitPriceBs }]`.

La entrega se ejecuta en una sola transacción: actualizar `pedido` (`estado`, `id_cajero`, `fecha_entrega`), actualizar `pago` si corresponde e insertar el comprobante con `ON CONFLICT (id_pedido) DO NOTHING`. Si falla cualquiera de las operaciones, se revierten todas.

### 6.2 Endpoint público del cliente

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/orders/code/:code` | `{ order: { code, status, totalBs, pickupTime, comprobante: { numero, fechaEmision } \| null } }` |

Se agrega el mismo campo `comprobante` a `OrdersService.findOne` y `OrdersService.list` mediante `LEFT JOIN comprobante`, para que el cliente con sesión también lo vea.

### 6.3 Validación y errores

DTOs con `class-validator`: `UpdateOrderStatusDto` (`@IsIn(['CONFIRMADO','PREPARANDO','LISTO','CANCELADO'])`; `ENTREGADO` solo se escribe desde `deliver`), `DeliverOrderDto` (`@Matches(/^SAL-\d{8}-\d{4}$/)`) y `CashierOrdersQueryDto` (`date` con el mismo validador `IsRealDate` de `ReportRangeDto`, y `status` con `@IsIn` sobre los seis estados).

| Código | Situación |
|---|---|
| 400 | Body inválido, fecha inexistente, transición no permitida (incluye `PATCH` a `ENTREGADO`/`PENDIENTE`) o código malformado. |
| 401 | Sin cookie `sb_access`. |
| 403 | Rol distinto de `CAJERO`/`ADMIN`. |
| 404 | Pedido inexistente. |
| 409 | En `deliver`: el código no coincide o el pedido no está `LISTO` (ya entregado, cancelado o en otro estado). |
| 502 | Fallo de BD; mensaje genérico y log en Nest. |

`CashierExceptionFilter` replica el mapeo revisado en Fase 3: `23505 → 409`, errores inesperados → 502 con log. Todas las consultas usan parámetros, nunca concatenación.

---

## 7. Frontend

### 7.1 Panel del cajero

- `apps/web/src/app/cashier/layout.tsx`: verifica `/auth/me` y muestra “Sin permiso” si el rol no es `CAJERO`/`ADMIN`, igual que `/admin`.
- `apps/web/src/app/cashier/page.tsx`: tabla de pedidos con código, cliente, hora de recojo, estado, total Bs, método de pago y vencimiento.
- `apps/web/src/components/CashierOrders.tsx`: polling cada 4 s con limpieza del `setInterval`, botón manual “Actualizar”, botones de transición y buscador por código.
- “Cancelar” pide confirmación. “Confirmar entrega” aparece solo cuando el pedido está `LISTO` y el código buscado coincide.
- Errores en español: “Pedido no encontrado”, “El código no coincide”, “No se pudo cambiar el estado”.
- `AuthNav`: agrega “Cajero” para `CAJERO`/`ADMIN`.

### 7.2 Vista del cliente

- `apps/web/src/app/order/[code]/page.tsx`: si hay sesión usa `/orders`; si no, usa `/orders/code/:code`. Muestra número de comprobante, detalle y total cuando existan.
- Sin enlace de descarga en esta fase; se agregará en Fase 4.

### 7.3 Diseño visual

Botones de al menos 44 px, contraste del panel `/admin`, tablas con scroll horizontal, etiquetas en español y montos en Bs. Responsive verificado en 360×800, 768×1024 y 1366×768. Sin librería de gráficos ni dependencias nuevas.

---

## 8. Auditoría y seguridad

- `RolesGuard` comprueba el rol con `AuthService.me()`, no con el JWT, igual que `/admin`.
- Cada cambio de estado y cada entrega registran `Logger.log` con `id_usuario`, `pedido`, estado anterior y nuevo. Nunca nombre, celular ni correo.
- `id_cajero` y `fecha_entrega` quedan en la fila del pedido para consulta posterior.
- El endpoint público por código devuelve solo los campos mínimos listados; no expone `cliente_nombre`, `cliente_celular` ni `id_usuario`.
- El service role de Supabase no se usa en el navegador.

---

## 9. Pruebas

### 9.1 API

- Unitarios de `CashierService`: mapa de transiciones, rechazo de saltos/retrocesos, validación de código, generación de comprobante idempotente, actualización de `pago` EFECTIVO y auditoría.
- Supertest: 401 sin cookie, 403 para `CLIENTE`, 200 para `CAJERO`/`ADMIN`, 400 body/fecha/código, 404 inexistente, 409 código o estado en conflicto, 502 con filtro.
- Regresión de los 55 tests API existentes.

### 9.2 Web

- Unitarios de `CashierOrders`: polling con limpieza, botones deshabilitados por estado, confirmación antes de cancelar, búsqueda por código y mensajes de error.
- Unitarios de la vista `/order/[code]` con y sin sesión.
- E2E `cashier.spec.ts` en 360/768/1366: login como cajero, cambio de estado, búsqueda por código, entrega y comprobante visible.

### 9.3 Verificación final

`npm -w apps/api test -- --runInBand`, `npm -w apps/web test -- --runInBand`, builds de ambos, `node scripts/verify-schema.mjs`, `node --env-file=.env scripts/verify-db.mjs` y los E2E cliente/admin/cajero con reloj fijo documentado en README.

Además se actualiza `README.md`: Fase 3 sale de “Fases pendientes” y se documenta el uso de `/cashier` junto con la nota del reloj fijo para E2E.

---

## 10. Fuera de alcance y riesgos

- QR y descarga de comprobantes: Fase 4.
- Pasarelas de pago y SMTP: Fase 4 o posterior.
- WebSockets/SSE: no se justifica para el volumen del local; se revisaría si el polling resulta insuficiente.
- Riesgo menor: el código de pedido actúa como credencial en el endpoint público. Se acepta porque ya se muestra en la sucursal; se puede limitar por tasa más adelante.
- Riesgo menor: polling genera consultas cada 4 s por cajero; con pocos puestos es aceptable y no requiere caché.

---

## 11. Criterios de aceptación

- [ ] Un `CAJERO` y un `ADMIN` pueden listar y operar pedidos; un `CLIENTE` recibe 403.
- [ ] Los pedidos nuevos aparecen sin recargar, en menos de 5 s.
- [ ] No se puede saltar ni retroceder de estado; `ENTREGADO` y `CANCELADO` son finales.
- [ ] La entrega exige código exacto y estado `LISTO`.
- [ ] Se genera un comprobante con número, detalle y total; el cliente lo ve con o sin cuenta.
- [ ] `id_cajero`, `fecha_entrega` y el log de auditoría quedan registrados sin datos personales.
- [ ] Esquema original intacto; solo dos columnas aditivas.
- [ ] Pruebas, builds, verificadores y E2E en verde; sin push sin aprobación.
