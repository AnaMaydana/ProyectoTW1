# SALTEÑANGA — Fase 1: Cliente y pedidos — Diseño técnico

**Fecha:** 2026-11-24  
**Ubicación:** `H:\PROYECTO DE SALTEÑERIA` (vacío al momento de escribir este documento)  
**Publicación:** el contenido se subirá a `https://github.com/AnaMaydana/ProyectoTW1` solo cuando el usuario lo apruebe explícitamente al final del trabajo.  
**Idioma y moneda:** español, precios en bolivianos (Bs).

---

## 1. Contexto y alcance

El usuario entregó requisitos funcionales (RF-01 a RF-19) y no funcionales (RNF-01 a RNF-13). El proyecto es demasiado grande para una sola spec, por lo que se dividió en cinco fases. Este documento cubre **solo la Fase 1**.

### 1.1 Requisitos incluidos en la Fase 1

| ID | Requerimiento |
|---|---|
| RF-01 | Registro de clientes con nombre, celular, correo y contraseña |
| RF-02 | Inicio y cierre de sesión seguros |
| RF-03 | Roles definidos en el modelo (solo `CLIENTE` se usa en esta fase) |
| RF-04 | Perfil del cliente: ver y editar nombre |
| RF-05 | Ver menú: salteñas (carne, pollo, mixta, queso, vegetariana) y bebidas, con foto, descripción y precio en Bs |
| RF-06 | Búsqueda por nombre y filtro por categoría (salteñas, bebidas) |
| RF-07 | Indicar disponibilidad del producto en el día |
| RF-08 | Carrito: agregar, quitar y cambiar cantidad; total automático |
| RF-09 | Confirmar pedido eligiendo hora aproximada de recojo y observaciones |
| RF-10 | Código de pedido para mostrar en la sucursal |
| RF-11 | Historial de pedidos y repetir con un clic |
| RF-12 | Cancelar pedido, según las reglas de la sección 8 |
| RF-13 | Registrar método de pago elegido: Efectivo / QR / Transferencia |
| RF-19 | Información del negocio: horario, teléfonos y redes de SALTEÑANGA |

### 1.2 Requisitos diferidos

| Fase | Contenido |
|---|---|
| Fase 2 | Panel del cajero en tiempo real, cambio de estados, validación de código, entrega, comprobante (RF-14, RF-16) y uso real de roles `CAJERO`/`ADMIN` |
| Fase 3 | CRUD de productos y categorías, inventario de insumos y alertas, reportes (RF-15, RF-17, RF-18) |
| Fase 4 | Generación/lectura de QR y descarga del comprobante (RF-13 completo, RF-14) |
| Fase 5 | Despliegue con HTTPS, certificado, disponibilidad ≥95 % y optimización de carga (RNF-04, RNF-05, RNF-07) |

Las tablas de la Fase 1 ya incluyen `status`, `expires_at`, `cashier_id` y `payment_method` para evitar migraciones posteriores.

---

## 2. Decisiones confirmadas

| Tema | Decisión |
|---|---|
| Arquitectura | Nest es el dueño de la API y de las cookies; Next consume la API |
| Frontend | Next.js (App Router) |
| Backend | NestJS |
| Datos | Supabase remoto (Postgres + Auth), sin Supabase local en Docker |
| Autenticación | Supabase Auth; Nest transforma los tokens en cookies `httpOnly` persistentes |
| Carrito | Persistente en DB, vinculado a cookie `cart_id` de 30 días |
| Roles | Tabla `profiles` con enum `CLIENTE`/`CAJERO`/`ADMIN`; en Fase 1 solo se crea `CLIENTE` |
| Disponibilidad | Campo `available_today` booleano por producto |
| Pedido | Solo para el día actual; hora aproximada entre 06:00 y 11:00 |
| Vencimiento | `expires_at = min(confirmación + 30 min, 11:00 del día)` |
| Aviso | Si faltan menos de 10 minutos para `expires_at`, la UI lo advierte |
| Pago | Se registra el método elegido, sin cobro ni QR en esta fase |
| Repo GitHub | Intacto hasta la aprobación final del usuario |

---

## 3. No objetivos de la Fase 1

- Panel de cajero ni panel de administración.
- Realtime, reportes, inventario de insumos ni descarga de comprobantes.
- Cobro online, generación de QR ni validación de pagos.
- Pedidos para días futuros.
- Despliegue, certificado HTTPS ni monitoreo de uptime.

---

## 4. Arquitectura

```text
Navegador
   | cookies httpOnly: cart_id, sb_access, sb_refresh
   v
Next.js (:3000)  ---->  Nest API (:3001)  ---->  Supabase remoto
                                                 (Auth + Postgres)
```

- Next renderiza el catálogo en Server Components y maneja carrito/checkout en Client Components.
- Nest es el único que escribe cookies y el único que usa la service role key.
- Supabase Auth guarda correo y contraseña con hash; `profiles` guarda nombre, celular y rol.
- Docker Compose levanta únicamente `web` y `api`.

Se descartó que Next actúe como BFF y que el navegador hable directo con Supabase, porque concentrar cookies y tokens en Nest es más simple y seguro para este proyecto.

---

## 5. Componentes y responsabilidades

### 5.1 Frontend (Next.js)

- `MenuPage`: catálogo con búsqueda y filtro por categoría mediante query params.
- `ProductCard`: foto, descripción, precio en Bs y badge **"Agotado hoy"** si `available_today = false`.
- `CartDrawer`: agregar, quitar y cambiar cantidades; muestra el total.
- `AuthPages`: registro (nombre, celular, correo, contraseña), login, logout y edición de nombre.
- `CheckoutForm`: hora aproximada de recojo (06:00–11:00), observaciones (ej. "sin ají"), método de pago y aviso de <10 minutos.
- `OrderConfirmation`: número de pedido, detalle y total.
- `OrdersHistory`: pedidos anteriores, acciones **Repetir** y **Cancelar**.
- `BusinessInfo`: horario confirmado 06:00–11:00; teléfonos y redes se leen de `src/config/business.ts`.
- `lib/api.ts`: wrapper único de `fetch` con `credentials: 'include'`.

### 5.2 Backend (NestJS)

- `AuthModule`: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me`. Crea `profiles` con rol `CLIENTE`.
- `ProductsModule`: `GET /products?search=&category=`.
- `CartModule`: `GET /cart`, `POST /cart/items`, `DELETE /cart/items/:id`.
- `OrdersModule`: `POST /orders`, `GET /orders`, `POST /orders/:id/repeat`, `POST /orders/:id/cancel`.
- `SupabaseModule`: cliente anon para Auth y cliente service-role para DB.
- `CookieService`: centraliza atributos, expiración y limpieza de cookies.
- DTOs con `class-validator` para todos los bodies.

### 5.3 Infraestructura

- `docker-compose.yml` con `web` y `api`, puertos configurables y volúmenes de desarrollo.
- `Dockerfile` por servicio.
- `.env.example` sin secretos reales.
- `supabase/migrations/0001_init.sql` con tablas, enums, constraints e índices.
- `supabase/seed.sql` con 5 salteñas y bebidas de ejemplo.
- `README.md` con instrucciones de arranque y configuración de Supabase.
- `src/config/business.ts` con horario, teléfonos y redes de SALTEÑANGA.

---

## 6. Modelo de datos

```text
profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  role text not null default 'CLIENTE' check (role in ('CLIENTE','CAJERO','ADMIN')),
  created_at timestamptz not null default now()
)

categories(
  id uuid primary key,
  name text not null unique,          -- 'salteñas', 'bebidas'
  active boolean not null default true
)

products(
  id uuid primary key,
  category_id uuid not null references categories(id),
  name text not null,
  description text not null,
  price_bs numeric(10,2) not null check (price_bs >= 0),
  image_url text,
  available_today boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
)

carts(
  id uuid primary key,
  user_id uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

cart_items(
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity integer not null check (quantity > 0),
  primary key (cart_id, product_id)
)

orders(
  id uuid primary key,
  code text not null unique,          -- SAL-AAAAMMDD-####
  user_id uuid null references auth.users(id),
  customer_name text not null,
  customer_phone text not null,
  pickup_time time not null,
  notes text,
  payment_method text not null check (payment_method in ('EFECTIVO','QR','TRANSFERENCIA')),
  total_bs numeric(10,2) not null check (total_bs >= 0),
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE','CONFIRMADO','CANCELADO','ENTREGADO')),
  expires_at timestamptz not null,
  cashier_id uuid null references auth.users(id),
  created_at timestamptz not null default now()
)

order_items(
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity integer not null check (quantity > 0),
  unit_price_bs numeric(10,2) not null check (unit_price_bs >= 0)
)
```

**RLS:** `products` y `categories` legibles públicamente cuando `active = true`. `profiles` y `orders` legibles solo por su `user_id`. El backend escribe con service role. El `phone` no aparece en respuestas públicas.

---

## 7. Flujos

### 7.1 Registro y perfil

1. El cliente envía nombre, celular, correo y contraseña a `POST /auth/register`.
2. Supabase Auth crea el usuario con contraseña hasheada.
3. Nest inserta `profiles` con `role = 'CLIENTE'`.
4. `PATCH /auth/me` permite editar solo `name`.

### 7.2 Login y sesión persistente

1. `POST /auth/login` con correo y contraseña.
2. Nest valida con Supabase y setea `sb_access` y `sb_refresh` como cookies `httpOnly`.
3. Con "recordarme", `sb_refresh` dura 30 días; sin él, es cookie de sesión.
4. El `user_id` se asocia al carrito actual.
5. Nest valida `sb_access` en cada request y renueva con `sb_refresh` cuando vence.

### 7.3 Catálogo

`GET /products?search=&category=` devuelve productos activos con `available_today`, foto, descripción y precio en Bs. La búsqueda y el filtro se ejecutan en Supabase, no en el navegador.

### 7.4 Carrito

1. Sin cookie `cart_id`, Nest crea un carrito con `user_id = null` y setea la cookie por 30 días.
2. `POST /cart/items` y `DELETE /cart/items/:id` actualizan `cart_items`.
3. El total se calcula en servidor con precios de `products`.

### 7.5 Checkout

1. El cliente elige hora aproximada (06:00–11:00), observaciones y método de pago.
2. Nest valida: carrito no vacío, todos los productos `available_today = true`, hora dentro del horario.
3. Nest calcula `total_bs` desde la DB, sin confiar en montos del cliente.
4. Genera `code = SAL-AAAAMMDD-####` secuencial por día.
5. Calcula `expires_at = min(created_at + 30 minutos, 11:00 del día actual)`.
6. Inserta `orders` + `order_items`, vacía `cart_items` y devuelve el código.

### 7.6 Historial, repetir y cancelar

- `GET /orders`: pedidos del usuario autenticado.
- `POST /orders/:id/repeat`: copia los items al carrito actual, omitiendo productos con `available_today = false` y avisando cuáles se omitieron.
- `POST /orders/:id/cancel`: solo si `status = 'PENDIENTE'` y `now() < expires_at`; en caso contrario responde `409` indicando que se llame al local.

### 7.7 Logout

`POST /auth/logout` elimina las cookies de sesión y conserva `cart_id` y el carrito.

---

## 8. Reglas de negocio

- **Horario:** 06:00 a 11:00, todos los días atendidos por el negocio.
- **Pedidos:** solo para el día actual.
- **Recojo:** 30 minutos desde la confirmación, con tope a las 11:00.
- **Aviso:** si `expires_at - now() < 10 minutos`, el checkout muestra "Te quedan menos de 10 minutos para recoger tu pedido".
- **Ejemplo:** pedido confirmado a las 10:50 → `expires_at = 11:00` → aviso de <10 min → si no se recoge, el cajero podrá cancelarlo en Fase 2.
- **Cancelación del cliente:** permitida solo mientras esté `PENDIENTE` y no haya vencido.
- **Repetir pedido:** copia items al carrito; no crea un pedido nuevo automáticamente.
- **Código:** `SAL-AAAAMMDD-####`, único, visible en la confirmación y en el historial.
- **Pago:** se guarda `EFECTIVO`, `QR` o `TRANSFERENCIA`; no se procesa cobro ni se genera QR en esta fase.

---

## 9. Errores, seguridad y requisitos no funcionales

| Situación | Comportamiento |
|---|---|
| Cookie `cart_id` inválida | Se crea un carrito nuevo sin romper la página |
| Producto agotado o inactivo | `409`, el carrito queda intacto |
| Hora fuera de 06:00–11:00 | `400` con mensaje de horario |
| Cancelar pedido vencido o confirmado | `409`, mensaje de llamar al local |
| Carrito vacío en checkout | `400` |
| Token inválido o refresh fallido | `401`, se limpian cookies de sesión y se conserva el carrito |
| Fallo de Supabase | `502` con mensaje genérico y log en Nest |
| Body inválido | `400` con errores de `class-validator` |
| Concurrencia en carrito | Upsert en transacción; cantidad final recalculada en backend |

**Seguridad (RNF-06, 07, 08, 09):**

- Contraseñas hasheadas por Supabase Auth; nunca texto plano.
- Tokens en cookies `httpOnly`, `SameSite=Lax` y `Secure` en producción. HTTPS/certificado se configura en Fase 5.
- Queries parametrizadas con el SDK de Supabase; React escapa el contenido; sin `dangerouslySetInnerHTML`.
- RLS por rol y propietario; el celular solo lo ve el cliente y el personal autorizado.
- Service role key exclusivamente en Nest; nunca en variables `NEXT_PUBLIC_*`.
- CORS restringido al origin de Next con `credentials: true`.

**Usabilidad y calidad (RNF-01 a RNF-13):**

- El pedido se hace en 5 pasos: menú → agregar → carrito → datos/hora/pago → confirmación. Meta: menos de 3 minutos.
- Interfaz 100 % en español y precios en Bs.
- Diseño responsive verificado a 360, 768 y 1366 px.
- Contraste legible y botones de tamaño táctil.
- Catálogo en Server Components, imágenes optimizadas y consultas acotadas; objetivo de carga <3 s.
- Disponibilidad ≥95 % y HTTPS se formalizan en Fase 5.
- Código organizado, comentado y versionado en Git; push final al repo cuando el usuario lo apruebe.
- Nuevos productos y categorías se agregan por DB, sin cambiar código (RNF-11).

---

## 10. Configuración requerida

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
API_PORT=3001
WEB_PORT=3000
CORS_ORIGIN=http://localhost:3000
CART_COOKIE_DAYS=30
SESSION_REFRESH_DAYS=30
BUSINESS_OPEN_TIME=06:00
BUSINESS_CLOSE_TIME=11:00
PICKUP_WINDOW_MINUTES=30
LOW_TIME_WARNING_MINUTES=10
```

`src/config/business.ts` concentra horario, teléfonos y redes. El horario 06:00–11:00 ya está confirmado. Los teléfonos y redes se completarán con la información que el usuario entregue al final; hasta entonces, esos campos no se muestran en la UI en lugar de mostrar datos inventados.

Pasos previos:

1. Proyecto remoto de Supabase con URL y keys.
2. Aplicar `0001_init.sql` y `seed.sql`.
3. Permitir registro sin confirmación de email para pruebas, o crear un usuario de prueba manualmente.

---

## 11. Testing y verificación

- **Unitarias (Nest + Jest):** `AuthService`, `ProductsService`, `CartService`, `OrdersService`. Casos: rol `CLIENTE` en registro, filtros, carrito sin cookie, total en servidor, `expires_at`, código, repetir y cancelar.
- **E2E de API (Supertest):** registro → login → carrito → checkout → código → historial → repetir → cancelar. Caso especial: pedido a las 10:50 vence a las 11:00 y genera aviso de <10 min.
- **E2E de navegador (Playwright):** flujo en 5 pasos; cerrar y reabrir navegador con carrito intacto; login con "recordarme"; vistas a 360/768/1366 px; textos en español y precios en Bs.
- **Componentes (Testing Library):** badge "Agotado hoy", `CartDrawer` y validación de hora/método de pago.
- **Supabase:** migración y seed aplicados; RLS verificado como anónimo, cliente autenticado y service role.
- **Docker:** `docker compose up --build` desde cero.
- **Rendimiento:** medición simple de carga <3 s en catálogo y carrito.

---

## 12. Supuestos explícitos

- La moneda es bolivianos (Bs) y los precios se guardan con dos decimales.
- El horario de atención es 06:00–11:00 y aplica todos los días de operación.
- Las fotos de productos se cargan por URL; sin foto se usa un placeholder.
- El pedido requiere nombre y celular; la dirección no es necesaria porque se recoge en sucursal.
- "Repetir" copia items al carrito y no confirma un pedido nuevo automáticamente.
- Los roles `CAJERO` y `ADMIN` solo se crean en el modelo en esta fase; no hay UI para ellos todavía.
- El cobro con QR/transferencia en Fase 4 será referencial: se registra el método, no se integra una pasarela.

---

## 13. Handoff

Una vez revisada y aprobada esta spec, el siguiente paso es invocar `writing-plans` para generar el plan de implementación de la Fase 1. No se escribirá código de producto hasta que ese plan también sea revisado y aprobado. Las fases 2 a 5 se diseñarán con su propia spec cuando la Fase 1 esté terminada.
