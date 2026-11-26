# Subida de fotos de productos por el admin

**Fecha:** 2026-11-26
**Estado:** propuesto — pendiente de revisión del spec escrito

## Contexto

La tienda pública ya está desplegada y verificada:

- Web en `https://saltenanga.vercel.app` (proyecto renombrado de `fase5-despliegue` a `saltenanga`; el link anterior redirige 308).
- API NestJS en `https://saltenanga-api.onrender.com`, con rewrite `/api/:path*` en `vercel.json`.
- Carrito en la cabecera desplegado y verificado.
- El menú ya lee `imageUrl` desde `producto.foto_url` y muestra una imagen por defecto cuando no hay foto (`apps/api/src/products/products.service.ts`, `apps/web/src/components/ProductCard.tsx`).
- El DTO de productos ya acepta `fotoUrl` como texto opcional y `AdminProduct.fotoUrl` ya es `string | null` (`apps/api/src/admin/dto/product.dto.ts`, `apps/api/src/admin/admin-catalog.service.ts`).
- Existe el bucket público `portadas` en el proyecto de Supabase `https://ywtzaogeokohhicptkja.supabase.co`.
- El `.env` local (no versionado) ya contiene `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; en Render todavía no están configuradas.

El usuario pide que el administrador pueda **poner fotos a los productos del menú desde su propio equipo**, no solo pegar una URL.

## Objetivo

Permitir al admin subir, reemplazar y quitar la foto de cada producto desde el formulario de administración, guardarla en Supabase Storage y mostrarla en el menú público, sin cambiar precios, rutas, reglas de negocio, cookies ni el diseño ya aprobado.

## Decisiones aprobadas en la charla

1. **Subida desde archivo**, no pegado de URL.
2. Disponible **al crear y al editar**, con opción de **quitar la foto**.
3. **JPG, PNG o WebP**, máximo **5 MB** por archivo.
4. Al reemplazar o quitar, **se borra la imagen anterior** del Storage.
5. **Enfoque 2**: la web envía la imagen en base64 a la API; la API la sube a Supabase Storage con la clave de servicio. La clave nunca sale del servidor.
6. Flujo y detalles de archivos/mensajes/seguridad aprobados por secciones.
7. Autorizado agregar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Render tomándolas del `.env` local, sin imprimirlas ni versionarlas.

## No objetivos

- No guardar imágenes dentro de Postgres.
- No usar URLs firmadas ni subida directa desde el navegador.
- No cambiar el menú público, los textos, los precios en Bs ni los tamaños de botones ya verificados.
- No modificar migraciones, esquema, reglas RLS, cookies, ni las reglas de horario/expiración.
- No agregar dependencias npm: se usa `fetch` nativo de Node para la REST de Storage y `FileReader` en el navegador.
- No hacer push, PR ni merge sin aprobación explícita. **PR #2 queda intacto y sin merge.**

## Arquitectura

```text
Navegador (admin)
   │  elige JPG/PNG/WebP ≤ 5 MB
   │  POST /api/admin/products/photo  { fileName, contentType, base64 }
   ▼
Vercel (rewrite /api/*)
   ▼
Render (API NestJS, rol ADMIN)
   │  valida tipo real + tamaño, genera nombre UUID
   │  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (solo servidor)
   ▼
Supabase Storage — bucket público "portadas"
   │  productos/<uuid>.<ext>
   ▼
URL pública → producto.foto_url → GET /api/products → /menu
```

La web solo conoce la URL pública devuelta. La clave de servicio no se expone como `NEXT_PUBLIC_*` ni se incluye en el bundle de Next.js.

## Contrato de la API

Todas las rutas siguen bajo `@Controller('admin')` con `RolesGuard` y `@Roles('ADMIN')`, y están sujetas al `AdminExceptionFilter` existente.

### `POST /admin/products/photo`

Cuerpo JSON:

```ts
{ fileName: string; contentType: string; base64: string }
```

Respuesta `201`:

```ts
{ url: string }
```

Reglas:

- `contentType` debe ser exactamente `image/jpeg`, `image/png` o `image/webp`.
- `base64` se decodifica en el servidor; el buffer resultante debe tener entre 1 byte y `5 * 1024 * 1024` bytes.
- Se valida también la **firma de bytes** (magic bytes) para no aceptar un archivo renombrado.
- La extensión final se deriva del `contentType` validado, **nunca del nombre que envía el usuario**.
- Nombre final: `productos/<uuid>.<ext>` con `crypto.randomUUID()`.
- La URL devuelta es `${SUPABASE_URL}/storage/v1/object/public/portadas/productos/<uuid>.<ext>`.
- Errores en español:
  - `400` — `Formato de imagen no permitido (usa JPG, PNG o WebP)`.
  - `400` — `La foto debe pesar 5 MB o menos`.
  - `400` — `El archivo de imagen no es válido`.
  - `503` — `No se pudo subir la foto` (fallo de Storage o variables faltantes), lanzado como `ServiceUnavailableException` para que el filtro no lo traduzca a “Error de base de datos”.
- Auditoría: reutilizar `this.audit(req, 'subir_foto')`, sin guardar la imagen ni el nombre original en logs.

### `DELETE /admin/products/photo`

Cuerpo JSON: `{ url: string }`. Respuesta `{ ok: true }`.

- Solo ADMIN.
- Solo acepta URLs que empiecen por `${SUPABASE_URL}/storage/v1/object/public/portadas/productos/`; cualquier otra se rechaza con `400`.
- Se usa para limpiar una foto recién subida cuando **falla el guardado del producto**. El borrado por reemplazo/quitado se hace dentro de `updateProduct` (ver abajo) para que ocurra después del commit en BD.

## Modelo y servicio de catálogo

- `CreateProductDto.fotoUrl?: string | null`.
- `UpdateProductDto.fotoUrl?: string | null`, más `fotoUrlAnterior?: string | null`.
- Interfaces `CreateProductDtoShape` / `UpdateProductDtoShape` ajustadas al mismo tipo.

Semántica en `PATCH /admin/products/:id`:

| Valor enviado | Significado |
|---|---|
| `fotoUrl` ausente (`undefined`) | No tocar la foto actual |
| `fotoUrl: null` | Quitar la foto (`foto_url = NULL`) |
| `fotoUrl: "https://..."` | Reemplazar con esa URL |

Hoy la sentencia usa `foto_url = COALESCE($6, foto_url)`, que **no permite poner NULL**. Se cambia por un flag explícito, por ejemplo:

```sql
foto_url = CASE WHEN $6::boolean THEN $7::text ELSE foto_url END
```

donde `$6 = dto.fotoUrl !== undefined` y `$7 = dto.fotoUrl ?? null`. Así se preserva el comportamiento actual cuando no se envía el campo y se habilita el quitado.

Borrado de la anterior:

- `updateProduct` guarda primero el cambio en BD.
- Solo si `fotoUrlAnterior` está presente, es distinta de la nueva y pasa el filtro de prefijo del bucket, llama al Storage para borrarla.
- Si el borrado falla, se registra un warning y **no se revierte ni falla** la respuesta del producto: la BD ya quedó consistente.
- `createProduct` no borra nada.

No se requiere migración: `foto_url` ya acepta `NULL` y el DTO/web ya manejan `fotoUrl: string | null`.

## Servicio de Storage (API)

- Nuevo provider, p. ej. `apps/api/src/admin/photo-storage.service.ts`, registrado en `AdminModule`.
- Configuración leída desde `apps/api/src/config/env.ts` mediante funciones `supabaseUrl()` y `supabaseServiceRoleKey()` que validan su presencia **al usar el servicio**, no al arrancar, para no romper entornos de test que no definen Storage.
- Métodos: `upload(base64, contentType): Promise<string>` y `remove(publicUrl): Promise<void>`.
- Llamadas REST:
  - Subida: `POST ${url}/storage/v1/object/portadas/<path>` con `Authorization: Bearer <service_role_key>`, `apikey: <service_role_key>` y `Content-Type` correspondiente; `x-upsert: false`.
  - Borrado: `DELETE ${url}/storage/v1/object/portadas/<path>` con los mismos headers.
- No se registran tokens, URLs firmadas ni contenido de la imagen en logs.

## Formulario del admin (web)

En `apps/web/src/app/admin/products/page.tsx`:

- Estado nuevo `fotoUrl: string | null`, inicializado con `product.fotoUrl` al editar y limpio al crear/cancelar.
- Estado `fotoUrlAnterior` para recordar la URL original cuando se reemplaza o quita.
- Campo **“Foto del producto”** con:
  - `<input type="file" accept="image/jpeg,image/png,image/webp">` (etiqueta visible “Elegir foto”).
  - Validación rápida en cliente del tipo y de los 5 MB antes de llamar a la API.
  - Texto “Subiendo foto…” mientras se espera la respuesta.
  - Vista previa `<img src={fotoUrl} alt="Vista previa de la foto" />` cuando hay foto.
  - Botón **“Quitar foto”** que pone `fotoUrl = null` y marca la anterior para borrado.
- Al elegir archivo: `FileReader.readAsDataURL`, se quita el prefijo `data:...;base64,` y se llama a `api('/admin/products/photo', { method: 'POST', body: JSON.stringify({ fileName, contentType, base64 }) })`.
- En `submit`:
  - Crear: se envía `fotoUrl`.
  - Editar: se envía `fotoUrl` y, solo si cambió respecto de la original, `fotoUrlAnterior`.
  - Si falla el guardado y se había subido una foto nueva en esta sesión, se llama a `DELETE /admin/products/photo` con esa URL para no dejar archivo huérfano.
- Mensajes de error en español, mostrados en el `<p role="alert">` existente: los mismos que la API más `No se pudo subir la foto` y `No se pudo guardar el producto`.
- La tabla de productos sigue igual; no se agrega una columna de foto para no romper el responsive ya auditado.

## Variables de entorno

| Variable | Dónde | Uso |
|---|---|---|
| `SUPABASE_URL` | Render (API) y `.env` local | Armar la URL pública y la REST de Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Render (API) y `.env` local | Autorizar subida/borrado; **nunca** en la web |

Ya autorizado: copiar ambos valores del `.env` local al panel de Render sin mostrarlos en chat, logs ni commits. Render redeploya la API al guardarlos. No se crean variables `NEXT_PUBLIC_*`.

## Verificación (TDD)

Se escriben primero los tests que fallan y luego la implementación.

### API

- Validación del DTO de subida: formatos permitidos/rechazados, 5 MB exactos y 5 MB + 1, base64 inválido, magic bytes incorrectos.
- `PhotoStorageService`: `upload` y `remove` con `fetch` mockeado; verifica headers, path `productos/<uuid>.<ext>` y URL pública; error 503 si faltan variables.
- `AdminCatalogService.updateProduct`: conserva `foto_url` cuando `fotoUrl` es `undefined`; la pone a `NULL` cuando es `null`; borra la anterior solo después de un update exitoso; no borra si el update falla.
- `DELETE /admin/products/photo`: rechaza URLs fuera del bucket.

### Web

- `apps/web/src/app/admin/products/page.test.tsx`: error de formato, error de tamaño, vista previa, “Quitar foto” envía `null`, `submit` incluye `fotoUrl`/`fotoUrlAnterior`, y limpieza cuando falla el guardado.

### E2E y build

- `apps/web/e2e/admin.spec.ts`: login admin, crear producto con foto (PNG mínimo generado en el test, sin archivo binario), verificar imagen en `/menu`, reemplazarla, quitarla y verificar la imagen por defecto.
- `npm -w apps/api run build` y `npm -w apps/web run build` sin errores.
- Suite unitaria web completa en verde (baseline: 58/58 en 19 suites).
- Auditoría visual en 360×800, 768×1024 y 1366×768: sin overflow horizontal y targets táctiles ≥ 44 px.

## Despliegue

1. Implementar con TDD y dejar tests + build en verde.
2. Agregar las dos variables en Render (autorizado) y esperar el redeploy.
3. Commitear los cambios **localmente**, sin push.
4. Pedir aprobación explícita para push y deploy.
5. Deploy de la API en Render y de la web en Vercel con el token leído desde archivo, sin imprimirlo.
6. Verificar en producción: login admin, subir/reemplazar/quitar foto, `/menu` muestra la foto, `/api/health` 200 con `Access-Control-Allow-Origin=https://saltenanga.vercel.app`, y que la clave de servicio no aparece en el bundle.
7. PR #2 sigue abierto; no se hace merge.

## Riesgos y limitaciones

- Render free duerme tras ~15 min y puede tardar ~1 min en despertar; la primera subida puede ser lenta.
- Supabase free se pausa tras una semana de inactividad; hay que reactivarlo desde el dashboard.
- Si el admin cierra la pestaña justo después de subir y antes de guardar, la foto queda huérfana. Se mitiga con el `DELETE` de limpieza cuando el guardado falla dentro de la misma sesión.
- El bucket `portadas` es público por diseño: quien tenga la URL puede ver la imagen. No es un problema para fotos de menú.
