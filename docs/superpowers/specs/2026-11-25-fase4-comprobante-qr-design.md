# Spec de diseño — Fase 4: comprobante imprimible y QR de entrega

**Fecha:** 2026-11-25
**Estado:** diseño aprobado en brainstorming; pendiente de revisión escrita y de plan de implementación.
**Autoridad:** complementa `docs/superpowers/specs/2026-11-24-tienda-salteñas-design.md` y `docs/superpowers/specs/2026-11-25-fase2-cajero-design.md`. En caso de conflicto, prevalecen esos documentos para las fases anteriores y esta spec para Fase 4.

## 1. Objetivo

Cerrar RF-14 (comprobante con número de pedido, detalle y total, que el cliente puede ver o descargar) y la parte de RF-16 que quedó diferida: la lectura del código por QR en el mostrador. El cliente obtiene un comprobante imprimible y un QR que el cajero puede escanear sin cambiar la validación de entrega ya implementada.

**Éxito observable:** desde `/order/[code]` el cliente ve el QR y, una vez entregado el pedido, descarga/guarda el comprobante en PDF desde el navegador; el cajero escanea ese QR y el flujo de entrega existente termina con el número `COM-…`, sin tocar la API ni la base de datos.

## 2. Requisitos

| Requisito | Tratamiento en esta fase |
|---|---|
| RF-14 — comprobante con número, detalle y total | Se genera en Fase 2; en Fase 4 se agrega la vista imprimible y el enlace de descarga. |
| RF-16 — validación de entrega | El cajero ya busca el código exacto; en Fase 4 se agrega un QR que un lector escribe en ese mismo campo. |
| RF-13 — método de pago | Sigue referencial: se registra, sin pasarela ni cobro real. |

## 3. Decisiones confirmadas

- **D1.** El lector de QR actúa como teclado: escribe el código en el input existente. No se usa cámara, `getUserMedia` ni `BarcodeDetector`.
- **D2.** El QR codifica únicamente `SAL-AAAAMMDD-####`. No codifica una URL: si el lector escribiera una dirección, rompería la validación actual del cajero.
- **D3.** Descarga = vista HTML optimizada para impresión más `window.print()`, con la que el navegador ofrece “Guardar como PDF”. No se genera PDF en el servidor.
- **D4.** El QR se genera en el cliente con `qrcode.react` (versión compatible con React 19). No se agrega ninguna dependencia en `apps/api`.
- **D5.** No hay cambios en esquema, migraciones ni endpoints. Se reutiliza `GET /orders/code/:code`.
- **D6.** Alcance según la spec original: sin pasarela de pago, sin WebSockets y sin reemplazar el polling de 4 s del cajero.
- **D7.** El QR de Fase 4 es de **validación de entrega**, no de cobro; esto resuelve la superposición RF-13/RF-14 de las specs anteriores.

## 4. Fuera de alcance

- Pasarela de pago, cobro real y validación real de transferencias.
- WebSockets/SSE; el panel del cajero sigue con polling de 4 s.
- QR que codifique una URL o un número de comprobante; firma digital del comprobante.
- Generación de PDF server-side.
- Reactivar productos, filtros de fecha en reportes y el resto de Minor registrados en el ledger de Fase 2.

## 5. Arquitectura y componentes

### 5.1 Dependencias

Una sola dependencia nueva, en `apps/web`: `qrcode.react`. Se usa el componente de SVG para que el QR sea nítido en pantalla y en impresión.

### 5.2 Archivos

| Archivo | Acción |
|---|---|
| `apps/web/package.json` | Agregar `qrcode.react`. |
| `apps/web/src/app/order/[code]/page.tsx` | Mostrar el QR de `receipt.code` y el enlace a la vista imprimible cuando exista comprobante. |
| `apps/web/src/app/order/[code]/page.test.tsx` | Cubrir QR y enlace condicional. |
| `apps/web/src/app/order/[code]/comprobante/page.tsx` | **Nuevo.** Vista imprimible del comprobante. |
| `apps/web/src/app/order/[code]/comprobante/page.test.tsx` | **Nuevo.** Cubrir render, error, sin comprobante e impresión. |
| `apps/web/src/components/CashierOrders.tsx` | Etiqueta del input y normalización del código escaneado. |
| `apps/web/src/components/CashierOrders.test.tsx` | Cubrir la normalización. |
| `apps/web/e2e/cashier.spec.ts` | Extender el flujo con QR y comprobante imprimible. |
| `apps/web/src/app/globals.css` | Reglas `@media print` y estilo del QR. |

`apps/api` y los archivos SQL no se modifican.

## 6. Flujo de datos

1. El cliente confirma el pedido y llega a `/order/[code]`. La página consulta `GET /orders/code/:code` (público) y obtiene código, estado, total, hora de recojo, ítems y comprobante.
2. La página dibuja el QR de `receipt.code` con `aria-label` que incluya el código, para que sea identificable en tests y lectores de pantalla.
3. En el mostrador, el lector escribe `SAL-AAAAMMDD-####`. El componente del cajero aplica `trim().toUpperCase()` antes de `search()` y `deliver()`.
4. `search()` y `deliver()` siguen igual: validan formato, estado `LISTO` y coincidencia del código; la entrega genera el comprobante en una transacción.
5. Con comprobante presente, `/order/[code]` muestra “Descargar comprobante” → `/order/[code]/comprobante`.
6. La vista imprimible consulta el mismo endpoint, muestra número `COM-…`, fecha, estado, detalle, total en Bs y el QR, y ofrece “Imprimir / guardar como PDF” (`window.print()`).

## 7. Contratos

No se introducen contratos nuevos. El payload existente es suficiente:

```
GET /orders/code/:code → {
  order: {
    code, status, totalBs, pickupTime, items[],
    comprobante: { numero, fechaEmision } | null
  }
}
```

Ese endpoint ya excluye nombre, celular e `id_usuario`. La vista imprimible usa exactamente ese objeto y **no** agrega `paymentMethod` ni otros campos del pedido.

## 8. UX, accesibilidad y responsive

- Botón “Descargar comprobante” de al menos 44 px de alto y contraste suficiente.
- El QR lleva `aria-label` con el código; el texto del código sigue visible para el caso de que no haya lector.
- `@media print` oculta navegación, botones y contenedores de scroll; la hoja impresa muestra solo el comprobante, con tipografía legible y montos en Bs.
- Sin overflow horizontal en 360×800, 768×1024 y 1366×768; el QR se reduce en pantallas chicas sin perder legibilidad.
- Interfaz en español en todos los textos nuevos.

## 9. Errores y seguridad

- Si `GET /orders/code/:code` falla en la vista imprimible, se muestra `role="alert"` con `ApiError.message` y fallback “No se pudo cargar el comprobante”.
- Si el pedido existe pero `comprobante === null`, la vista muestra “El comprobante todavía no fue emitido” y un enlace de vuelta al pedido; no se imprime un documento vacío.
- Si el código escaneado tiene espacios o salto de línea, la normalización evita un falso “Pedido no encontrado”. Los mensajes de error existentes no cambian.
- El QR se dibuja en el navegador: no se envían datos a servicios externos ni se expone información personal adicional.

## 10. Testing

**Unitarios (Jest):**
- `/order/[code]`: presencia del QR con el valor correcto y del enlace de descarga solo cuando hay comprobante.
- `/order/[code]/comprobante`: número, detalle, total y QR; aviso sin comprobante; `role="alert"` en fallo de carga; `window.print()` llamado por el botón.
- `CashierOrders`: el código con espacios/salto de línea se normaliza antes de buscar y entregar.

**E2E (Playwright):**
- Extender `cashier.spec.ts`: verificar el SVG del QR en `/order/[code]`; tras la entrega, abrir `/order/[code]/comprobante`, verificar `COM-…`, detalle y total, y la existencia del botón de impresión (con `window.print()` mockeado para no abrir el diálogo).
- Simular el escaneo escribiendo el código en el input, que es el comportamiento real de un lector tipo teclado. No se prueba cámara.
- Verificar los tres viewports y ausencia de overflow.

**Regresión:**
- API 78/78 (sin cambios), Web completa, builds de API y Web, `node scripts/verify-schema.mjs`, `node --env-file=.env scripts/verify-db.mjs` y E2E completo.
- `E2E_FIXED_NOW` se usa solo durante la corrida y se remueve después, recreando el contenedor `api`, como en Fase 2.

## 11. Compatibilidad y migraciones

- No hay DDL ni datos nuevos. No se toca `saltenanga_schema.sql` ni `saltenanga_schema_adaptado.sql`.
- La ruta nueva es aditiva: los enlaces antiguos a `/order/[code]` siguen funcionando.
- Las cookies, roles y guardas existentes no cambian; la nueva ruta es pública porque usa el mismo endpoint público.

## 12. Supuestos explícitos

- Los lectores de QR disponibles en el local escriben el contenido del código como texto; no se integra ningún SDK de escáner.
- `qrcode.react` es compatible con la versión de React del proyecto; se verifica en el build.
- Imprimir desde el navegador es suficiente para “descargar” el comprobante en este contexto; el usuario elige “Guardar como PDF” en el diálogo del sistema.
- El comprobante se emite al entregar, por lo que el enlace aparece recién en ese momento.

## 13. Notas de integración

- PR #1 (`feature/fase2-cajero` → `feature/fase1`) está abierto. La rama de Fase 4 se crea desde el commit actual `28d04e5` como `feature/fase4-comprobante-qr`; si PR #1 se fusiona antes de implementar, la rama se actualiza sobre `feature/fase1`.
- No se hace push, PR ni merge sin aprobación explícita.

## 14. Handoff

Una vez revisada y aprobada esta spec, el siguiente paso es invocar `writing-plans` para generar el plan de implementación. No se escribe código de producto hasta que ese plan también esté revisado y aprobado.
