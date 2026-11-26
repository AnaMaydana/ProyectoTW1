# Fase 4: comprobante imprimible y QR de entrega — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cliente vea un QR con su código de pedido y pueda descargar/imprimir el comprobante entregado, y que el cajero pueda usar ese QR como lector tipo teclado sin cambiar la validación existente.

**Architecture:** Se agrega `qrcode.react` solo en `apps/web` y se dibuja el QR en cliente a partir del payload público existente `GET /orders/code/:code`. Se crea una ruta imprimible `/order/[code]/comprobante` con `window.print()` y CSS `@media print`. El input del cajero normaliza `trim().toUpperCase()` antes de buscar y entregar; ni la API ni la BD se modifican.

**Tech Stack:** Next.js 15 (App Router, React 19), Jest + Testing Library, Playwright, `qrcode.react@4.2.0`, NestJS (sin cambios), Postgres (sin cambios).

**Spec:** `docs/superpowers/specs/2026-11-25-fase4-comprobante-qr-design.md`

## Global Constraints

- El QR codifica únicamente `SAL-AAAAMMDD-####`; nunca una URL ni el número de comprobante.
- Sin cambios en `apps/api`, en `saltenanga_schema.sql`, en `saltenanga_schema_adaptado.sql` ni en migraciones.
- `qrcode.react@4.2.0` se instala solo en el workspace `web` (peer de React 19 confirmado).
- Interfaz en español y montos en Bs con dos decimales.
- Viewports obligatorios: 360×800, 768×1024 y 1366×768; controles táctiles de al menos 44 px; sin overflow horizontal.
- La ruta nueva es pública y usa el mismo endpoint sin datos personales; no se agrega `paymentMethod` ni `customerName` a la vista del cliente.
- No hacer push, PR ni merge sin aprobación explícita. PR #1 (`feature/fase2-cajero` → `feature/fase1`) queda intacto.
- Rama de trabajo: `feature/fase4-comprobante-qr`; no se rebasea ni se fusiona nada durante la implementación.

## Review Focus

- **QR con valor equivocado:** si se codifica una URL o `COM-…`, el lector escribe un texto que el cajero rechaza. Task 1 fija `data-value === code` en el test y Task 4 verificando el SVG real en E2E.
- **Cabecera del layout en el PDF:** `@media print` debe ocultar `.site-header` y los botones; si no, el comprobante impreso lleva navegación. Task 4 agrega `emulateMedia({ media: 'print' })` y comprueba que estén ocultos.
- **Pedido entregado sin comprobante:** abrir la ruta imprimible antes de la entrega no debe mostrar un papel vacío ni el botón de impresión. Task 2 cubre el mensaje “El comprobante todavía no fue emitido.” y la ausencia del botón.
- **Error 404 en el endpoint público:** la vista imprimible debe mostrar el mensaje del servidor en español con `role="alert"`, no una pantalla en blanco. Task 2 cubre `ApiError(404, 'Pedido no encontrado')` y el fallback genérico.
- **Lector que agrega espacios o salto de línea:** sin normalización aparece un falso “Pedido no encontrado” y el botón de entrega no se habilita. Task 3 cubre `  sal-20261125-0007\n` en búsqueda y entrega.

---

### Task 1: Dependencia QR y QR + enlace de descarga en `/order/[code]`

**Files:**
- Modify: `apps/web/package.json`, `package-lock.json`
- Modify: `apps/web/src/app/order/[code]/page.tsx`
- Modify: `apps/web/src/app/order/[code]/page.test.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `api<T>(path, init?)` de `apps/web/src/lib/api.ts` y `PublicOrder` de `apps/web/src/lib/types.ts` (ya existentes; `PublicOrder` tiene `code`, `status`, `totalBs`, `pickupTime`, `items[]`, `comprobante: { numero, fechaEmision } | null`).
- Produces: wrapper `[data-testid="order-qr"]` con `aria-label="QR del pedido <code>"`; enlace `Descargar comprobante` con `href="/order/<code>/comprobante"` cuando `comprobante !== null`. Clases CSS `.order-qr`, `.comprobante-qr`, `.button-link`, `.comprobante`, `.comprobante-total` y reglas `@media print` reutilizadas por Task 2.

- [ ] **Step 1: Instalar la dependencia**

Run:
```bash
npm install qrcode.react@4.2.0 -w web
```
Expected: `apps/web/package.json` queda con `"qrcode.react": "^4.2.0"` en `dependencies` y se actualiza `package-lock.json`. No se instala nada en `apps/api`.

- [ ] **Step 2: Escribir los tests que fallan**

Reemplazar `apps/web/src/app/order/[code]/page.test.tsx` por:

```tsx
import { render, screen } from '@testing-library/react';
import OrderConfirmation from './page';
import { api } from '../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-svg" data-value={value} />
}));
jest.mock('../../../lib/api', () => ({ api: jest.fn(), ApiError: class ApiError extends Error {} }));

describe('OrderConfirmation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sessionStorage.clear();
  });

  it('muestra comprobante, detalle, total, QR y enlace de descarga sin sesión', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ order: {
      code: 'SAL-20261125-0007', status: 'ENTREGADO', totalBs: '24.00', pickupTime: '10:00',
      items: [{ name: 'Carne', quantity: 2, unitPriceBs: '12.00' }],
      comprobante: { numero: 'COM-20261125-0007', fechaEmision: '2026-11-25T14:35:00' }
    } });
    render(<OrderConfirmation params={Promise.resolve({ code: 'SAL-20261125-0007' })} />);
    expect(await screen.findByText('COM-20261125-0007')).toBeInTheDocument();
    expect(screen.getByText(/2 × Carne/)).toBeInTheDocument();
    expect(screen.getByText(/Bs 24\.00/)).toBeInTheDocument();
    expect(screen.getByTestId('order-qr')).toHaveAttribute('aria-label', 'QR del pedido SAL-20261125-0007');
    expect(screen.getByTestId('qr-svg')).toHaveAttribute('data-value', 'SAL-20261125-0007');
    expect(screen.getByRole('link', { name: 'Descargar comprobante' }))
      .toHaveAttribute('href', '/order/SAL-20261125-0007/comprobante');
  });

  it('sigue mostrando el pedido y el QR, sin enlace de descarga, si no hay comprobante aún', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ order: {
      code: 'SAL-20261125-0008', status: 'PENDIENTE', totalBs: '12.00', pickupTime: '10:30',
      items: [], comprobante: null
    } });
    render(<OrderConfirmation params={Promise.resolve({ code: 'SAL-20261125-0008' })} />);
    expect(await screen.findByText(/Mostrá el código SAL-20261125-0008/)).toBeInTheDocument();
    expect(screen.getByTestId('qr-svg')).toHaveAttribute('data-value', 'SAL-20261125-0008');
    expect(screen.queryByRole('link', { name: 'Descargar comprobante' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Verificar que los tests fallan**

Run: `npm -w apps/web test -- --runInBand "src/app/order/[code]/page.test.tsx"`
Expected: FAIL porque `./page` aún no renderiza `[data-testid="order-qr"]` ni el enlace.

- [ ] **Step 4: Implementar el QR y el enlace**

Reemplazar `apps/web/src/app/order/[code]/page.tsx` por:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../../lib/api';
import { PublicOrder } from '../../../lib/types';

export default function OrderConfirmation({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [receipt, setReceipt] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ code: value }) => {
      setCode(value);
      api<{ order: PublicOrder }>(`/orders/code/${encodeURIComponent(value)}`)
        .then((res) => setReceipt(res.order))
        .catch(() => setReceipt(null))
        .finally(() => setLoading(false));
    });
  }, [params]);

  return (
    <main>
      <h1>Pedido confirmado</h1>
      {receipt ? (
        <>
          <p>Código de pedido: <strong>{receipt.code}</strong></p>
          <div
            className="order-qr"
            data-testid="order-qr"
            role="img"
            aria-label={`QR del pedido ${receipt.code}`}
          >
            <QRCodeSVG value={receipt.code} size={160} level="M" />
          </div>
          <p>Total: Bs {receipt.totalBs}</p>
          <p>Hora de recojo: {receipt.pickupTime}</p>
          <p>Estado: {receipt.status}</p>
          <ul>
            {receipt.items.map((item) => (
              <li key={`${item.name}-${item.quantity}`}>
                {item.quantity} × {item.name} — Bs {item.unitPriceBs}
              </li>
            ))}
          </ul>
          {receipt.comprobante && (
            <>
              <p>Comprobante: <strong>{receipt.comprobante.numero}</strong> — {receipt.comprobante.fechaEmision}</p>
              <p>
                <a className="button-link" href={`/order/${encodeURIComponent(receipt.code)}/comprobante`}>
                  Descargar comprobante
                </a>
              </p>
            </>
          )}
          <p>Mostrá el código {receipt.code} en la sucursal.</p>
        </>
      ) : loading ? (
        <p>Cargando pedido {code}…</p>
      ) : (
        <p>No encontramos el pedido {code}. Revisá tu historial o llamá al local.</p>
      )}
      <p><a href="/orders">Ver mis pedidos</a></p>
    </main>
  );
}
```

Agregar al final de `apps/web/src/app/globals.css` (después del bloque `@media (max-width: 600px)`):

```css
.order-qr, .comprobante-qr { margin: 1rem 0; max-width: 180px; }
.order-qr svg, .comprobante-qr svg { width: 100%; height: auto; }

.button-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: #7a1f1f;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
}

.comprobante { max-width: 700px; }
.comprobante table { border-collapse: collapse; width: 100%; }
.comprobante th, .comprobante td {
  padding: 0.5rem;
  text-align: left;
  border-bottom: 1px solid #ddd;
}
.comprobante-total { font-size: 1.25rem; font-weight: 700; }

@page { margin: 12mm; }

@media print {
  body { background: #fff; }
  .site-header, .no-print, button { display: none !important; }
  main { max-width: none; padding: 0; }
  .comprobante { border: 0; padding: 0; }
  .comprobante-qr { max-width: 40mm; }
}
```

- [ ] **Step 5: Verificar que los tests pasan**

Run: `npm -w apps/web test -- --runInBand "src/app/order/[code]/page.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json package-lock.json "apps/web/src/app/order/[code]/page.tsx" "apps/web/src/app/order/[code]/page.test.tsx" apps/web/src/app/globals.css
git commit -m "feat(web): QR y enlace de comprobante en la confirmacion del pedido"
```

---

### Task 2: Vista imprimible `/order/[code]/comprobante`

**Files:**
- Create: `apps/web/src/app/order/[code]/comprobante/page.tsx`
- Create: `apps/web/src/app/order/[code]/comprobante/page.test.tsx`

**Interfaces:**
- Consumes: `api` y `ApiError` de `../../../../lib/api` (ruta relativa desde la nueva carpeta), `PublicOrder` de `../../../../lib/types`, `QRCodeSVG` de `qrcode.react` y las clases `.comprobante`, `.comprobante-qr`, `.comprobante-total`, `.no-print` creadas en Task 1.
- Produces: ruta pública con wrapper `[data-testid="comprobante-qr"]`, botón `Imprimir / guardar como PDF` que llama a `window.print()`, mensaje `El comprobante todavía no fue emitido.` cuando `comprobante === null` y `role="alert"` en fallo de carga.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/web/src/app/order/[code]/comprobante/page.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import ComprobantePage from './page';
import { api, ApiError } from '../../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-svg" data-value={value} />
}));
jest.mock('../../../../lib/api', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
}));

const params = Promise.resolve({ code: 'SAL-20261125-0007' });
const order = {
  code: 'SAL-20261125-0007', status: 'ENTREGADO', totalBs: '24.00', pickupTime: '10:00',
  items: [{ name: 'Carne', quantity: 2, unitPriceBs: '12.00' }],
  comprobante: { numero: 'COM-20261125-0007', fechaEmision: '2026-11-25T14:35:00' }
};

describe('ComprobantePage', () => {
  beforeEach(() => jest.resetAllMocks());

  it('muestra número, detalle, total y QR, e imprime al hacer clic', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    (api as jest.Mock).mockResolvedValueOnce({ order });
    render(<ComprobantePage params={params} />);
    expect(await screen.findByText('COM-20261125-0007')).toBeInTheDocument();
    expect(screen.getByText('Carne')).toBeInTheDocument();
    expect(screen.getByText(/Bs 24\.00/)).toBeInTheDocument();
    expect(screen.getByTestId('qr-svg')).toHaveAttribute('data-value', order.code);
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir / guardar como PDF' }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('avisa cuando todavía no hay comprobante', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ order: { ...order, comprobante: null } });
    render(<ComprobantePage params={params} />);
    expect(await screen.findByText('El comprobante todavía no fue emitido.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Imprimir / guardar como PDF' })).not.toBeInTheDocument();
  });

  it('muestra el mensaje del servidor con role=alert si falla la carga', async () => {
    (api as jest.Mock).mockRejectedValueOnce(new ApiError(404, 'Pedido no encontrado'));
    render(<ComprobantePage params={params} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Pedido no encontrado');
  });

  it('usa un fallback en español si el error no es ApiError', async () => {
    (api as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    render(<ComprobantePage params={params} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el comprobante');
  });
});
```

- [ ] **Step 2: Verificar que los tests fallan**

Run: `npm -w apps/web test -- --runInBand "src/app/order/[code]/comprobante/page.test.tsx"`
Expected: FAIL con “Cannot find module './page'”.

- [ ] **Step 3: Implementar la vista imprimible**

Crear `apps/web/src/app/order/[code]/comprobante/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, ApiError } from '../../../../lib/api';
import { PublicOrder } from '../../../../lib/types';

export default function ComprobantePage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ code: value }) => {
      setCode(value);
      api<{ order: PublicOrder }>(`/orders/code/${encodeURIComponent(value)}`)
        .then((res) => setOrder(res.order))
        .catch((err) => setError(
          err instanceof ApiError ? err.message : 'No se pudo cargar el comprobante'
        ))
        .finally(() => setLoading(false));
    });
  }, [params]);

  const back = (
    <p className="no-print">
      <a href={`/order/${encodeURIComponent(code)}`}>Volver al pedido</a>
    </p>
  );

  if (loading) return <main><p>Cargando comprobante…</p></main>;
  if (error) return <main><h1>Comprobante</h1><p role="alert">{error}</p>{back}</main>;
  if (!order) {
    return <main><h1>Comprobante</h1><p role="alert">No se pudo cargar el comprobante</p>{back}</main>;
  }
  if (!order.comprobante) {
    return (
      <main>
        <h1>Comprobante</h1>
        <p>El comprobante todavía no fue emitido.</p>
        {back}
      </main>
    );
  }

  const comprobante = order.comprobante;
  return (
    <main className="comprobante">
      <h1>Comprobante</h1>
      <p>Número: <strong>{comprobante.numero}</strong></p>
      <p>Fecha de emisión: {comprobante.fechaEmision}</p>
      <p>Pedido: {order.code}</p>
      <p>Estado: {order.status}</p>
      <p>Hora de recojo: {order.pickupTime}</p>
      <table>
        <thead>
          <tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th></tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={`${item.name}-${item.quantity}`}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>Bs {item.unitPriceBs}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="comprobante-total">Total: Bs {order.totalBs}</p>
      <div
        className="comprobante-qr"
        data-testid="comprobante-qr"
        role="img"
        aria-label={`QR del pedido ${order.code}`}
      >
        <QRCodeSVG value={order.code} size={160} level="M" />
      </div>
      <p className="no-print">
        <button type="button" onClick={() => window.print()}>Imprimir / guardar como PDF</button>
      </p>
      {back}
    </main>
  );
}
```

- [ ] **Step 4: Verificar que los tests pasan**

Run: `npm -w apps/web test -- --runInBand "src/app/order/[code]/comprobante/page.test.tsx"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/order/[code]/comprobante/page.tsx" "apps/web/src/app/order/[code]/comprobante/page.test.tsx"
git commit -m "feat(web): comprobante imprimible con QR"
```

---

### Task 3: Normalización del código escaneado en el cajero

**Files:**
- Modify: `apps/web/src/components/CashierOrders.tsx`
- Modify: `apps/web/src/components/CashierOrders.test.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError` de `../lib/api`; `CashierOrder`, `CashierOrderDetail`, `OrderStatus` de `../lib/types`.
- Produces: `export function normalizeCode(raw: string): string` (`trim().toUpperCase()`). El componente usa `normalizedCode` en la URL de búsqueda, en el body de entrega y en la comparación que habilita el botón. Etiqueta del input: `Código del pedido (escaneá o escribí)`.

- [ ] **Step 1: Escribir el test que falla**

Agregar este test al final de `describe('CashierOrders', ...)` en `apps/web/src/components/CashierOrders.test.tsx`:

```tsx
  it('normaliza el código escaneado antes de buscar y entregar', async () => {
    const deliver = jest.fn().mockResolvedValue({ comprobante: { numero: 'COM-20261125-0007' } });
    (api as jest.Mock).mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/cashier/orders') return Promise.resolve({ orders: [order] });
      if (path.startsWith('/cashier/orders/code/')) return Promise.resolve({ order });
      if (path === '/cashier/orders/7/deliver') return deliver(path, init);
      return Promise.resolve({});
    });
    render(<CashierOrders />);
    await waitFor(() => expect(screen.getByText(order.code)).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Código del pedido (escaneá o escribí)'), {
        target: { value: `  ${order.code.toLowerCase()}\n` }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    });
    expect(api).toHaveBeenCalledWith(`/cashier/orders/code/${order.code}`);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirmar entrega' }));
    });
    expect(deliver).toHaveBeenCalledWith('/cashier/orders/7/deliver', {
      method: 'POST', body: JSON.stringify({ code: order.code })
    });
  });
```

Y cambiar la línea 39 del archivo:

```tsx
      fireEvent.change(screen.getByLabelText('Código del pedido'), { target: { value: order.code } });
```

por:

```tsx
      fireEvent.change(screen.getByLabelText('Código del pedido (escaneá o escribí)'), { target: { value: order.code } });
```

- [ ] **Step 2: Verificar que el test falla**

Run: `npm -w apps/web test -- --runInBand src/components/CashierOrders.test.tsx`
Expected: FAIL porque no existe la etiqueta nueva ni se normaliza el código.

- [ ] **Step 3: Implementar la normalización**

En `apps/web/src/components/CashierOrders.tsx`, agregar después de `NEXT`:

```tsx
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}
```

Dentro de `export function CashierOrders()`, después de los `useState`, agregar:

```tsx
  const normalizedCode = normalizeCode(code);
```

Reemplazar el cuerpo de `search` por:

```tsx
  const search = async () => {
    setMessage('');
    try {
      const res = await api<{ order: CashierOrderDetail }>(
        `/cashier/orders/code/${encodeURIComponent(normalizedCode)}`
      );
      setSelected(res.order);
      if (res.order.status !== 'LISTO') setMessage('El pedido no está listo para entrega');
    } catch (err) {
      setSelected(null);
      setMessage(err instanceof ApiError ? err.message : 'Pedido no encontrado');
    }
  };
```

En `deliver`, cambiar el body:

```tsx
        { method: 'POST', body: JSON.stringify({ code: normalizedCode }) }
```

En el JSX, cambiar la etiqueta y la condición del botón:

```tsx
        <label htmlFor="cashier-code">Código del pedido (escaneá o escribí)</label>
```

```tsx
      {selected?.status === 'LISTO' && selected.code === normalizedCode && (
```

- [ ] **Step 4: Verificar que los tests pasan**

Run: `npm -w apps/web test -- --runInBand src/components/CashierOrders.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/CashierOrders.tsx apps/web/src/components/CashierOrders.test.tsx
git commit -m "feat(web): normalizar el codigo leido por el escanner en el cajero"
```

---

### Task 4: Extensión E2E (QR, comprobante impresible y estilo de impresión)

**Files:**
- Modify: `apps/web/e2e/cashier.spec.ts`

**Interfaces:**
- Consumes: las rutas `/order/[code]`, `/order/[code]/comprobante` y `/cashier` de Tasks 1–3; el selector `[data-testid="order-qr"]`, `[data-testid="comprobante-qr"]`, el enlace `Descargar comprobante` y el botón `Imprimir / guardar como PDF`.
- Produces: un flujo E2E que simula el lector escribiendo el código y verifica impresión y ausencia de overflow en los tres viewports.

- [ ] **Step 1: Escribir la extensión del E2E**

Después de `const client = await clientContext.newPage();` (línea 12), agregar:

```ts
  await client.addInitScript(() => {
    (window as unknown as { __printCalled: boolean }).__printCalled = false;
    window.print = () => { (window as unknown as { __printCalled: boolean }).__printCalled = true; };
  });
```

Después de `expect(code).toMatch(/^SAL-\d{8}-\d{4}$/);` (línea 35), agregar:

```ts
  await expect(client.locator('[data-testid="order-qr"] svg')).toBeVisible();
```

Reemplazar el `fill` del cajero (`Código del pedido`) por:

```ts
  await cashier.getByLabel('Código del pedido (escaneá o escribí)').fill(`  ${code.toLowerCase()} `);
```

Reemplazar el bloque que navega a `/order/${code}` y verifica el comprobante por:

```ts
  await client.goto(`/order/${code}`, { waitUntil: 'networkidle' });
  await expect(client.getByText(/COM-\d{8}-\d{4}/)).toBeVisible();
  await client.getByRole('link', { name: 'Descargar comprobante' }).click();
  await expect(client).toHaveURL(/\/comprobante$/);
  await expect(client.getByText(/COM-\d{8}-\d{4}/)).toBeVisible();
  await expect(client.locator('.comprobante tbody tr').first().locator('td').first()).not.toBeEmpty();
  await expect(client.locator('.comprobante-total')).toContainText(/Bs \d+\.\d{2}/);
  await expect(client.locator('[data-testid="comprobante-qr"] svg')).toBeVisible();

  await client.getByRole('button', { name: 'Imprimir / guardar como PDF' }).click();
  expect(await client.evaluate(() => (window as any).__printCalled)).toBe(true);

  await client.emulateMedia({ media: 'print' });
  await expect(client.locator('.site-header')).toBeHidden();
  await expect(client.getByRole('button', { name: 'Imprimir / guardar como PDF' })).toBeHidden();
  await client.emulateMedia({ media: 'screen' });
```

El bucle de `overflow` existente se deja igual: ahora `client` está en la vista del comprobante, así que también cubre los tres viewports en esa ruta.

- [ ] **Step 2: Verificar que el spec compila y se descubre**

Run: `npm -w apps/web run e2e -- --list`
Expected: lista los specs, incluido `cashier.spec.ts › cajero cambia estados, entrega y muestra comprobante` en los tres proyectos. La ejecución real se hace en Task 5 con el reloj fijo.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/cashier.spec.ts
git commit -m "test(e2e): QR, comprobante imprimible y lector por teclado"
```

---

### Task 5: Documentación y regresión completa

**Files:**
- Modify: `README.md`
- Modify: `.env` solo de forma temporal (revertido al final de la corrida E2E)

**Interfaces:**
- Consumes: la app corriendo en Docker (`docker compose up --build`) y `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` en `.env`.
- Produces: README sin Fase 4 en pendientes y evidencia de regresión verde; workspace sin `E2E_FIXED_NOW` al terminar.

- [ ] **Step 1: Actualizar el README**

Cambiar la primera línea por:

```markdown
# SALTEÑANGA — Fases 1, 2, 3 y 4: tienda, cajero, administración y comprobantes
```

Cambiar el primer párrafo por:

```markdown
Tienda online para clientes y panel interno: catálogo en Bs, carrito persistente, pedidos con código e historial, gestión del cajero con cambio de estados y entrega, administración de productos, inventario y reportes, y comprobante imprimible con QR de entrega.
```

Agregar una viñeta al final de “Reglas de negocio”:

```markdown
- El comprobante se descarga desde `/order/<código>/comprobante` (imprimir o guardar como PDF). El QR codifica solo el código `SAL-AAAAMMDD-####` para que el cajero lo lea como teclado; no es un QR de cobro.
```

Reemplazar “## Fases pendientes” por:

```markdown
## Fases pendientes

- Fase 5: despliegue con HTTPS, rendimiento y disponibilidad.
```

- [ ] **Step 2: Unitarios y builds**

Run:
```bash
npm -w apps/api test -- --runInBand
npm -w apps/web test -- --runInBand
npm -w apps/api run build
npm -w apps/web run build
```
Expected: API 78/78, Web 51/51 (46 anteriores + 4 nuevos del comprobante + 1 nuevo del cajero), builds sin errores de TypeScript.

- [ ] **Step 3: Verificación de esquema y base**

Run:
```bash
node scripts/verify-schema.mjs
node --env-file=.env scripts/verify-db.mjs
```
Expected: `SCHEMA OK (45 elementos base, 15 correcciones aditivas)` y `DB OK (12 tablas, seed {"rol":3,"metodo_pago":4,"categoria":3,"producto":25,"inventario":25})`.

- [ ] **Step 4: E2E con reloj fijo**

Agregar temporalmente una línea al final de `.env`:

```text
E2E_FIXED_NOW=2026-11-25T14:00:00.000Z
```

Run:
```bash
docker compose up -d --force-recreate api
npm -w apps/web run e2e
```
Expected: todos los specs pasan en los tres proyectos (360×800, 768×1024, 1366×768), incluido `cashier.spec.ts` con QR, comprobante e impresión.

- [ ] **Step 5: Restaurar el reloj real**

Quitar la línea `E2E_FIXED_NOW` de `.env` y ejecutar:

```bash
docker compose up -d --force-recreate api
```
Expected: `.env` sin `E2E_FIXED_NOW` y `/products` responde 200 con la hora real.

- [ ] **Step 6: Commit y cierre**

```bash
git add README.md
git commit -m "docs: marcar la fase 4 como entregada"
git status -sb
```
Expected: workspace limpio salvo `.superpowers/` (git-ignorado). Sin push, PR ni merge.
