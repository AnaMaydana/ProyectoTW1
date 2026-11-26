# Fase 2 — Panel del cajero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el panel `/cashier` para `CAJERO`/`ADMIN` con polling, transiciones de estado, entrega validada por código y comprobante visible por el cliente con o sin sesión.

**Architecture:** Módulo nuevo `cashier` en Nest (espejo de `admin`) con `RolesGuard`, servicio que dueño de las transacciones y DTOs validados; panel Next `/cashier` con polling de 4 s. `OrdersService` gana un endpoint público por código para el comprobante del cliente anónimo. Dos columnas aditivas en `pedido`; sin tablas nuevas ni dependencias nuevas.

**Tech Stack:** NestJS 10 + TypeScript + pg + class-validator; Next.js 15 + React 19 + Jest/Testing Library + Playwright; Postgres (Supabase).

**Spec:** `docs/superpowers/specs/2026-11-25-fase2-cajero-design.md`

## Global Constraints

- Respuestas e interfaz en español; montos en Bs con dos decimales; IDs numéricos expuestos al frontend como `string`.
- Responsive verificado en 360×800, 768×1024 y 1366×768; botones táctiles de al menos 44 px; tablas con scroll horizontal.
- `saltenanga_schema.sql` queda intacto. Solo correcciones aditivas en `saltenanga_schema_adaptado.sql`. No renombrar tablas ni columnas. No crear tablas nuevas.
- Horario `06:00–11:00` en `America/La_Paz`; `expires_at = min(confirmación + 30 min, 11:00)`; aviso si faltan menos de 10 minutos.
- Código de pedido `SAL-AAAAMMDD-####`; comprobante `COM-AAAAMMDD-####`.
- Al entregar: `pago` de `EFECTIVO` pasa a `PAGADO`; `QR`/`TRANSFERENCIA` quedan `PENDIENTE` hasta Fase 4.
- Auth propia: JWT en cookie `httpOnly` `sb_access`; `RolesGuard` decide con `AuthService.me()`, no decodificando el JWT.
- Auditoría: `Logger` con `id_usuario`, pedido y estados; nunca nombre, celular ni correo.
- Sin dependencias npm nuevas. Secretos solo en `.env`; no imprimirlos ni commitearlos.
- `E2E_FIXED_NOW` se ignora cuando `NODE_ENV=production`; debe estar en `.env` al recrear `api` con Docker; restaurar el reloj real al terminar.
- **No hacer push, PR ni merge sin aprobación explícita del usuario.**
- Aclaración del plan: el endpoint público incluye `items` (nombre, cantidad, precio; sin datos personales) para que el comprobante muestre “detalle” también cuando el cliente anónimo vuelve después con solo el código. La spec enumera campos mínimos pero no menciona los ítems; esta adición no expone `cliente_nombre`, `cliente_celular` ni `id_usuario`.

## Review Focus

- Cliente anónimo que vuelve con solo el código tras la entrega: debe ver número, detalle y total del comprobante. Prueba en Task 6 (`findPublicByCode`) y Task 8 (vista sin sesión).
- Código correcto pero pedido no `LISTO`: debe responder 409 sin mutar pedido, pago ni comprobante. Prueba en Task 4 (`deliver` rechaza estado) y Task 5 (Supertest 409).
- Salto de estado (`PATCH` a `ENTREGADO`/`PENDIENTE`, o `PENDIENTE → LISTO`): debe responder 400 y no ejecutar `UPDATE`. Prueba en Task 2 (DTO), Task 3 (service) y Task 5 (Supertest 400).
- Doble entrega/concurrencia: no deben emitirse dos comprobantes ni marcarse dos pagos. Prueba en Task 4 (`FOR UPDATE`, `ON CONFLICT (id_pedido) DO NOTHING`, rechazo de segundo `deliver`).
- Fallo de base de datos: debe responder 502 con mensaje genérico y log, sin filtrar el detalle de Postgres. Prueba en Task 5 (Supertest 502).

---

### Task 1: Columnas aditivas y verificador de esquema

**Files:**
- Modify: `saltenanga_schema_adaptado.sql` (bloque “Correcciones aditivas”, tras `CREATE INDEX idx_pedido_expiracion`)
- Modify: `scripts/verify-schema.mjs:31-45`

**Interfaces:**
- Consumes: `saltenanga_schema.sql` inmodificable y los 13 fragmentos aditivos actuales.
- Produces: columnas `pedido.id_cajero` y `pedido.fecha_entrega`; `verify-schema.mjs` espera 15 correcciones aditivas.

- [ ] **Step 1: Escribir el test que falla**

Agregar al array `additive` de `scripts/verify-schema.mjs`, después de `'idx_carrito_detalle_producto'`:

```js
  'idx_carrito_detalle_producto',
  'ALTER TABLE pedido ADD COLUMN id_cajero INT NULL REFERENCES usuario(id_usuario);',
  'ALTER TABLE pedido ADD COLUMN fecha_entrega TIMESTAMPTZ;'
```

- [ ] **Step 2: Verificar que falla**

Run: `node scripts/verify-schema.mjs`
Expected: falla con `Falta corrección aditiva: ALTER TABLE pedido ADD COLUMN id_cajero INT NULL REFERENCES usuario(id_usuario);`

- [ ] **Step 3: Implementación mínima**

Insertar en `saltenanga_schema_adaptado.sql`, después de `CREATE INDEX idx_pedido_expiracion ON pedido(fecha_expiracion);`:

```sql
ALTER TABLE pedido ADD COLUMN id_cajero INT NULL REFERENCES usuario(id_usuario);
ALTER TABLE pedido ADD COLUMN fecha_entrega TIMESTAMPTZ;
```

- [ ] **Step 4: Verificar que pasa**

Run: `node scripts/verify-schema.mjs`
Expected: `SCHEMA OK (45 elementos base, 15 correcciones aditivas)`

- [ ] **Step 5: Commit**

```bash
git add saltenanga_schema_adaptado.sql scripts/verify-schema.mjs
git commit -m "feat: columnas aditivas de cajero y entrega en pedido"
```

---

### Task 2: DTOs del cajero y validación de fechas

**Files:**
- Modify: `apps/api/src/admin/dto/report.dto.ts:18` (agregar `export` al validador existente; cambio de una palabra, sin alterar reportes)
- Create: `apps/api/src/cashier/dto/cashier.dto.ts`
- Test: `apps/api/src/cashier/dto/cashier.dto.spec.ts`

**Interfaces:**
- Consumes: `IsRealDate` de `ReportRangeDto`.
- Produces: `UpdateOrderStatusDto`, `DeliverOrderDto`, `CashierOrdersQueryDto`, `ORDER_STATUSES`, `PATCHABLE_STATUSES`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// apps/api/src/cashier/dto/cashier.dto.spec.ts
import { validate } from 'class-validator';
import { CashierOrdersQueryDto, DeliverOrderDto, UpdateOrderStatusDto } from './cashier.dto';

describe('DTOs del cajero', () => {
  it('PATCH acepta solo CONFIRMADO, PREPARANDO, LISTO y CANCELADO', async () => {
    expect(await validate(Object.assign(new UpdateOrderStatusDto(), { status: 'PREPARANDO' }))).toHaveLength(0);
    for (const status of ['PENDIENTE', 'ENTREGADO', 'OTRO']) {
      expect(await validate(Object.assign(new UpdateOrderStatusDto(), { status }))).toHaveLength(1);
    }
  });

  it('exige código SAL-AAAAMMDD-####', async () => {
    expect(await validate(Object.assign(new DeliverOrderDto(), { code: 'SAL-20261125-0007' }))).toHaveLength(0);
    for (const code of ['20261125-0007', 'SAL-2026-11-25-0007', 'SAL-20261125-07']) {
      expect(await validate(Object.assign(new DeliverOrderDto(), { code }))).toHaveLength(1);
    }
  });

  it('valida fecha real y estado en la consulta', async () => {
    const ok = Object.assign(new CashierOrdersQueryDto(), { status: 'LISTO', date: '2026-11-25' });
    expect(await validate(ok)).toHaveLength(0);
    for (const date of ['25-11-2026', '2026-02-30']) {
      const bad = Object.assign(new CashierOrdersQueryDto(), { date });
      expect(await validate(bad)).toHaveLength(1);
    }
    const badStatus = Object.assign(new CashierOrdersQueryDto(), { status: 'OTRO' });
    expect(await validate(badStatus)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm -w apps/api test -- --runInBand cashier.dto.spec.ts`
Expected: falla con `Cannot find module './cashier.dto'`.

- [ ] **Step 3: Implementación mínima**

```ts
// apps/api/src/cashier/dto/cashier.dto.ts
import { IsIn, IsOptional, Matches } from 'class-validator';
import { IsRealDate } from '../../admin/dto/report.dto';

export const ORDER_STATUSES = [
  'PENDIENTE', 'CONFIRMADO', 'PREPARANDO', 'LISTO', 'ENTREGADO', 'CANCELADO'
] as const;

export const PATCHABLE_STATUSES = [
  'CONFIRMADO', 'PREPARANDO', 'LISTO', 'CANCELADO'
] as const;

export class UpdateOrderStatusDto {
  @IsIn([...PATCHABLE_STATUSES], { message: 'Estado no permitido' })
  status: string;
}

export class DeliverOrderDto {
  @Matches(/^SAL-\d{8}-\d{4}$/, { message: 'El código debe tener el formato SAL-AAAAMMDD-####' })
  code: string;
}

export class CashierOrdersQueryDto {
  @IsOptional()
  @IsIn([...ORDER_STATUSES], { message: 'Estado inválido' })
  status?: string;

  @IsOptional()
  @IsRealDate({ message: 'La fecha debe ser AAAA-MM-DD válida' })
  date?: string;
}
```

Y en `apps/api/src/admin/dto/report.dto.ts` cambiar `function IsRealDate(options?: ValidationOptions) {` por `export function IsRealDate(options?: ValidationOptions) {`.

- [ ] **Step 4: Verificar que pasa**

Run: `npm -w apps/api test -- --runInBand cashier.dto.spec.ts`
Expected: 3 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/dto/report.dto.ts apps/api/src/cashier/dto
git commit -m "feat: DTOs de gestion del cajero"
```

---

### Task 3: CashierService — listado, detalle y transiciones

**Files:**
- Create: `apps/api/src/cashier/cashier.service.ts`
- Test: `apps/api/src/cashier/cashier.service.spec.ts`

**Interfaces:**
- Consumes: `DatabaseService.transaction(work)` y `DatabaseService.query(text, params)`.
- Produces: `CashierService.list(status?, date?)`, `CashierService.byCode(code)`, `CashierService.changeStatus(id, status, userId)`, y el mapa exportado `PATCH_TRANSITIONS`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// apps/api/src/cashier/cashier.service.spec.ts
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { CashierService, PATCH_TRANSITIONS } from './cashier.service';
import { DatabaseService } from '../database/database.service';

const client = { query: jest.fn() };
const db = {
  query: jest.fn(),
  transaction: jest.fn((work: (c: typeof client) => Promise<unknown>) => work(client))
} as unknown as DatabaseService;
const service = new CashierService(db);

const detail = {
  id: '7', code: 'SAL-20261125-0007', status: 'CONFIRMADO', totalBs: '24.00',
  customerName: 'Ana', customerPhone: '70000000', pickupTime: '10:00',
  notes: null, paymentMethod: 'EFECTIVO', expiresAt: new Date(), createdAt: new Date(),
  comprobante: null, items: []
};

describe('CashierService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(service, 'byCode').mockResolvedValue(detail as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it('el mapa prohíbe entregar por PATCH y retroceder', () => {
    expect(PATCH_TRANSITIONS.LISTO).toEqual([]);
    expect(PATCH_TRANSITIONS.ENTREGADO).toEqual([]);
    expect(PATCH_TRANSITIONS.PENDIENTE).toEqual(['CONFIRMADO', 'CANCELADO']);
  });

  it('lista con filtros opcionales y calcula itemCount', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [{
      id_pedido: 7, codigo: 'SAL-20261125-0007', cliente_nombre: 'Ana',
      cliente_celular: '70000000', pickup_time: '10:00', estado: 'LISTO', total: '24.00',
      payment_method: 'EFECTIVO', fecha_expiracion: new Date(), fecha_creacion: new Date(),
      item_count: 2
    }] });
    const rows = await service.list('LISTO', '2026-11-25');
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual(['LISTO', '2026-11-25']);
    expect(rows[0]).toMatchObject({ id: '7', totalBs: '24.00', itemCount: 2 });
  });

  it('busca por código y devuelve 404 si no existe', async () => {
    (service.byCode as jest.Mock).mockRestore();
    (db.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.byCode('SAL-20261125-9999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza salto PENDIENTE -> LISTO sin escribir', async () => {
    client.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ estado: 'PENDIENTE', codigo: 'SAL-20261125-0007' }] });
    await expect(service.changeStatus('7', 'LISTO', '3')).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('acepta PENDIENTE -> CONFIRMADO y audita sin datos personales', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ estado: 'PENDIENTE', codigo: 'SAL-20261125-0007' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await service.changeStatus('7', 'CONFIRMADO', '3');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('cambiar_estado id_usuario=3 pedido=7 de=PENDIENTE a=CONFIRMADO'));
    expect(log.mock.calls[0][0]).not.toContain('Ana');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm -w apps/api test -- --runInBand cashier.service.spec.ts`
Expected: falla con `Cannot find module './cashier.service'`.

- [ ] **Step 3: Implementación mínima**

```ts
// apps/api/src/cashier/cashier.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export const PATCH_TRANSITIONS: Record<string, string[]> = {
  PENDIENTE: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['LISTO'],
  LISTO: [],
  ENTREGADO: [],
  CANCELADO: []
};

@Injectable()
export class CashierService {
  private readonly logger = new Logger(CashierService.name);
  constructor(private db: DatabaseService) {}

  async list(status?: string, date?: string) {
    const result = await this.db.query(
      `SELECT p.id_pedido, p.codigo, p.cliente_nombre, p.cliente_celular,
              to_char(p.fecha_hora_recojo, 'HH24:MI') AS pickup_time,
              p.estado, p.total, mp.nombre AS payment_method,
              p.fecha_expiracion, p.fecha_creacion,
              (SELECT COUNT(*)::int FROM detalle_pedido d WHERE d.id_pedido = p.id_pedido) AS item_count
       FROM pedido p
       LEFT JOIN pago pg ON pg.id_pedido = p.id_pedido
       LEFT JOIN metodo_pago mp ON mp.id_metodo_pago = pg.id_metodo_pago
       WHERE ($1::text IS NULL OR p.estado = $1)
         AND ($2::date IS NULL OR p.fecha_creacion::date = $2::date)
       ORDER BY p.fecha_creacion DESC`,
      [status ?? null, date ?? null]
    );
    return result.rows.map((row) => ({
      id: String(row.id_pedido),
      code: row.codigo,
      customerName: row.cliente_nombre,
      customerPhone: row.cliente_celular,
      pickupTime: row.pickup_time,
      status: row.estado,
      totalBs: Number(row.total).toFixed(2),
      paymentMethod: row.payment_method ?? 'EFECTIVO',
      expiresAt: row.fecha_expiracion,
      createdAt: row.fecha_creacion,
      itemCount: row.item_count
    }));
  }

  async byCode(code: string) {
    const result = await this.db.query(
      `SELECT p.id_pedido, p.codigo, p.cliente_nombre, p.cliente_celular,
              to_char(p.fecha_hora_recojo, 'HH24:MI') AS pickup_time,
              p.estado, p.observaciones, p.total, mp.nombre AS payment_method,
              p.fecha_expiracion, p.fecha_creacion,
              c.numero AS comprobante_numero,
              to_char(c.fecha_emision, 'YYYY-MM-DD"T"HH24:MI:SS') AS comprobante_fecha,
              d.id_producto, d.cantidad, d.precio_unitario, pr.nombre AS product_name
       FROM pedido p
       LEFT JOIN pago pg ON pg.id_pedido = p.id_pedido
       LEFT JOIN metodo_pago mp ON mp.id_metodo_pago = pg.id_metodo_pago
       LEFT JOIN comprobante c ON c.id_pedido = p.id_pedido
       LEFT JOIN detalle_pedido d ON d.id_pedido = p.id_pedido
       LEFT JOIN producto pr ON pr.id_producto = d.id_producto
       WHERE p.codigo = $1`,
      [code]
    );
    if (!result.rowCount) throw new NotFoundException('Pedido no encontrado');
    const first = result.rows[0];
    return {
      id: String(first.id_pedido),
      code: first.codigo,
      customerName: first.cliente_nombre,
      customerPhone: first.cliente_celular,
      pickupTime: first.pickup_time,
      status: first.estado,
      notes: first.observaciones,
      totalBs: Number(first.total).toFixed(2),
      paymentMethod: first.payment_method ?? 'EFECTIVO',
      expiresAt: first.fecha_expiracion,
      createdAt: first.fecha_creacion,
      comprobante: first.comprobante_numero
        ? { numero: first.comprobante_numero, fechaEmision: first.comprobante_fecha }
        : null,
      items: result.rows
        .filter((row) => row.id_producto != null)
        .map((row) => ({
          productId: String(row.id_producto),
          name: row.product_name,
          quantity: row.cantidad,
          unitPriceBs: Number(row.precio_unitario).toFixed(2)
        }))
    };
  }

  async changeStatus(id: string, status: string, userId: string) {
    let previous = '';
    let code = '';
    await this.db.transaction(async (client) => {
      const current = await client.query<{ estado: string; codigo: string }>(
        'SELECT estado, codigo FROM pedido WHERE id_pedido = $1 FOR UPDATE', [Number(id)]
      );
      if (!current.rowCount) throw new NotFoundException('Pedido no encontrado');
      previous = current.rows[0].estado;
      code = current.rows[0].codigo;
      if (!PATCH_TRANSITIONS[previous]?.includes(status)) {
        throw new BadRequestException(`No se puede cambiar de ${previous} a ${status}`);
      }
      await client.query('UPDATE pedido SET estado = $1 WHERE id_pedido = $2', [status, Number(id)]);
    });
    this.logger.log(`cambiar_estado id_usuario=${userId} pedido=${id} de=${previous} a=${status}`);
    return this.byCode(code);
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm -w apps/api test -- --runInBand cashier.service.spec.ts`
Expected: 5 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cashier/cashier.service.ts apps/api/src/cashier/cashier.service.spec.ts
git commit -m "feat: servicio de cajero con transiciones y detalle"
```

---

### Task 4: Entrega validada, pago y comprobante

**Files:**
- Modify: `apps/api/src/cashier/cashier.service.ts:1` (import) y agregar método `deliver`
- Test: `apps/api/src/cashier/cashier.service.spec.ts`

**Interfaces:**
- Consumes: `CashierService.byCode(code)` de Task 3 y `DatabaseService.transaction`.
- Produces: `CashierService.deliver(id, code, userId)` → `{ order, comprobante: { numero, fechaEmision } }`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al `describe` de `cashier.service.spec.ts`:

```ts
  it('entrega solo si está LISTO y el código coincide', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ estado: 'LISTO', codigo: 'SAL-20261125-0007' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE pedido
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE pago
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // INSERT comprobante
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        numero: 'COM-20261125-0007', fecha_emision: '2026-11-25T10:05:00'
      }] });

    const result = await service.deliver('7', 'SAL-20261125-0007', '3');

    expect(result.comprobante).toEqual({ numero: 'COM-20261125-0007', fechaEmision: '2026-11-25T10:05:00' });
    expect(client.query.mock.calls[1][0]).toContain('id_cajero');
    expect(client.query.mock.calls[1][0]).toContain('fecha_entrega');
    expect(client.query.mock.calls[2][0]).toContain("nombre = 'EFECTIVO'");
    expect(client.query.mock.calls[3][0]).toContain('ON CONFLICT (id_pedido) DO NOTHING');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('entregar id_usuario=3 pedido=7 de=LISTO a=ENTREGADO'));
  });

  it('rechaza entrega si el pedido no está LISTO', async () => {
    client.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ estado: 'PENDIENTE', codigo: 'SAL-20261125-0007' }] });
    await expect(service.deliver('7', 'SAL-20261125-0007', '3')).rejects.toThrow('no está listo');
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rechaza entrega si el código no coincide', async () => {
    client.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ estado: 'LISTO', codigo: 'SAL-20261125-0007' }] });
    await expect(service.deliver('7', 'SAL-20261125-0008', '3')).rejects.toThrow('código no coincide');
    expect(client.query).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Verificar que falla**

Run: `npm -w apps/api test -- --runInBand cashier.service.spec.ts`
Expected: falla con `service.deliver is not a function`.

- [ ] **Step 3: Implementación mínima**

Cambiar el import primero:

```ts
import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException
} from '@nestjs/common';
```

Agregar el método antes del cierre de la clase:

```ts
  async deliver(id: string, code: string, userId: string) {
    let previous = '';
    let orderCode = '';
    const comprobante = await this.db.transaction(async (client) => {
      const current = await client.query<{ estado: string; codigo: string }>(
        'SELECT estado, codigo FROM pedido WHERE id_pedido = $1 FOR UPDATE', [Number(id)]
      );
      if (!current.rowCount) throw new NotFoundException('Pedido no encontrado');
      previous = current.rows[0].estado;
      orderCode = current.rows[0].codigo;
      if (previous !== 'LISTO') throw new ConflictException('El pedido no está listo para entrega');
      if (orderCode !== code) throw new ConflictException('El código no coincide con el pedido');

      const numero = `COM-${orderCode.slice(4, 12)}-${orderCode.slice(-4)}`;
      await client.query(
        `UPDATE pedido SET estado = 'ENTREGADO', id_cajero = $1, fecha_entrega = NOW()
         WHERE id_pedido = $2`, [Number(userId), Number(id)]
      );
      await client.query(
        `UPDATE pago SET estado = 'PAGADO', fecha_pago = NOW()
         WHERE id_pedido = $1
           AND id_metodo_pago = (SELECT id_metodo_pago FROM metodo_pago WHERE nombre = 'EFECTIVO')`,
        [Number(id)]
      );
      await client.query(
        `INSERT INTO comprobante (id_pedido, numero) VALUES ($1, $2)
         ON CONFLICT (id_pedido) DO NOTHING`, [Number(id), numero]
      );
      const saved = await client.query<{ numero: string; fecha_emision: string }>(
        `SELECT numero, to_char(fecha_emision, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_emision
         FROM comprobante WHERE id_pedido = $1`, [Number(id)]
      );
      return saved.rows[0];
    });
    this.logger.log(`entregar id_usuario=${userId} pedido=${id} de=${previous} a=ENTREGADO`);
    return {
      order: await this.byCode(orderCode),
      comprobante: { numero: comprobante.numero, fechaEmision: comprobante.fecha_emision }
    };
  }
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm -w apps/api test -- --runInBand cashier.service.spec.ts`
Expected: 8 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cashier/cashier.service.ts apps/api/src/cashier/cashier.service.spec.ts
git commit -m "feat: entrega con comprobante, pago y auditoria"
```

---

### Task 5: Controller, módulo, filtro y pruebas HTTP

**Files:**
- Create: `apps/api/src/cashier/cashier.controller.ts`
- Create: `apps/api/src/cashier/cashier.module.ts`
- Create: `apps/api/src/cashier/cashier-exception.filter.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/cashier.e2e.spec.ts`

**Interfaces:**
- Consumes: DTOs de Task 2 y `CashierService` de Tasks 3–4.
- Produces: rutas `GET /cashier/orders`, `GET /cashier/orders/code/:code`, `PATCH /cashier/orders/:id/status`, `POST /cashier/orders/:id/deliver`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// apps/api/test/cashier.e2e.spec.ts
import { ConflictException, INestApplication, Logger, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { CashierController } from '../src/cashier/cashier.controller';
import { CashierService } from '../src/cashier/cashier.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { AuthService } from '../src/auth/auth.service';
import { CookieService } from '../src/common/cookies/cookie.service';

describe('Cashier E2E', () => {
  let app: INestApplication;
  const cashier = {
    list: jest.fn(), byCode: jest.fn(), changeStatus: jest.fn(), deliver: jest.fn()
  };

  const as = (token: string) => (method: 'get' | 'patch' | 'post', path: string) =>
    (request(app.getHttpServer()) as any)[method](path).set('Cookie', `sb_access=${token}`);

  beforeAll(async () => {
    const auth = { me: jest.fn((token: string) => Promise.resolve(
      token === 'cajero-token' ? { id: '3', role: 'CAJERO' }
        : token === 'admin-token' ? { id: '1', role: 'ADMIN' }
          : { id: '2', role: 'CLIENTE' }
    )) };
    const cookies = { read: jest.fn((req: any) => req.cookies?.sb_access) };
    const module = await Test.createTestingModule({
      controllers: [CashierController],
      providers: [
        { provide: CashierService, useValue: cashier },
        { provide: AuthService, useValue: auth },
        { provide: CookieService, useValue: cookies },
        RolesGuard
      ]
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cashier.list.mockResolvedValue([]);
    cashier.byCode.mockResolvedValue({ code: 'SAL-20261125-0007' });
    cashier.changeStatus.mockResolvedValue({ code: 'SAL-20261125-0007' });
    cashier.deliver.mockResolvedValue({
      order: { code: 'SAL-20261125-0007' }, comprobante: { numero: 'COM-20261125-0007' }
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('401 sin cookie y 403 para CLIENTE', async () => {
    await request(app.getHttpServer()).get('/cashier/orders').expect(401);
    await as('cliente-token')('get', '/cashier/orders').expect(403);
  });

  it('200 para CAJERO y ADMIN', async () => {
    await as('cajero-token')('get', '/cashier/orders').expect(200, { orders: [] });
    await as('admin-token')('get', '/cashier/orders').expect(200, { orders: [] });
  });

  it('pasa el id_usuario del guard al servicio', async () => {
    await as('cajero-token')('patch', '/cashier/orders/7/status').send({ status: 'CONFIRMADO' }).expect(200);
    expect(cashier.changeStatus).toHaveBeenCalledWith('7', 'CONFIRMADO', '3');
  });

  it('400 por estado, código y fecha inválidos', async () => {
    await as('cajero-token')('patch', '/cashier/orders/7/status').send({ status: 'ENTREGADO' }).expect(400);
    await as('cajero-token')('post', '/cashier/orders/7/deliver').send({ code: 'malo' }).expect(400);
    await as('cajero-token')('get', '/cashier/orders?date=2026-02-30').expect(400);
  });

  it('404, 409 y 502 con mensaje generico', async () => {
    cashier.byCode.mockRejectedValueOnce(new NotFoundException('Pedido no encontrado'));
    await as('cajero-token')('get', '/cashier/orders/code/SAL-20261125-0007').expect(404);

    cashier.deliver.mockRejectedValueOnce(new ConflictException('El código no coincide con el pedido'));
    await as('cajero-token')('post', '/cashier/orders/7/deliver')
      .send({ code: 'SAL-20261125-0007' }).expect(409);

    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    cashier.list.mockRejectedValueOnce(new Error('detalle interno de pg'));
    const res = await as('cajero-token')('get', '/cashier/orders').expect(502);
    expect(res.body).toEqual({ message: 'Error de base de datos', error: 'Bad Gateway', statusCode: 502 });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('GET /cashier/orders'));
  });

  it('23505 responde 409', async () => {
    cashier.deliver.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await as('cajero-token')('post', '/cashier/orders/7/deliver')
      .send({ code: 'SAL-20261125-0007' }).expect(409);
    expect(res.body.statusCode).toBe(409);
  });

  afterAll(async () => app.close());
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm -w apps/api test -- --runInBand cashier.e2e.spec.ts`
Expected: falla con `Cannot find module '../src/cashier/cashier.controller'`.

- [ ] **Step 3: Implementación mínima**

```ts
// apps/api/src/cashier/cashier-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class CashierExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CashierExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(
        typeof body === 'string' ? { message: body, statusCode: status } : body
      );
      return;
    }
    if ((exception as { code?: string } | null)?.code === '23505') {
      res.status(409).json({ message: 'Conflicto con el pedido', error: 'Conflict', statusCode: 409 });
      return;
    }
    const detail = exception instanceof Error ? exception.message : 'desconocido';
    this.logger.error(`Error de BD en ${req.method} ${req.originalUrl ?? req.url}: ${detail}`);
    res.status(502).json({ message: 'Error de base de datos', error: 'Bad Gateway', statusCode: 502 });
  }
}
```

```ts
// apps/api/src/cashier/cashier.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/guards/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CashierExceptionFilter } from './cashier-exception.filter';
import { CashierService } from './cashier.service';
import { CashierOrdersQueryDto, DeliverOrderDto, UpdateOrderStatusDto } from './dto/cashier.dto';

@Controller('cashier')
@UseGuards(RolesGuard)
@UseFilters(CashierExceptionFilter)
@Roles('CAJERO', 'ADMIN')
export class CashierController {
  constructor(private cashier: CashierService) {}

  private userId(req: Request): string {
    return (req as Request & { user?: { id?: string } }).user?.id ?? 'desconocido';
  }

  @Get('orders')
  async orders(@Query() query: CashierOrdersQueryDto) {
    return { orders: await this.cashier.list(query.status, query.date) };
  }

  @Get('orders/code/:code')
  async byCode(@Param('code') code: string) {
    return { order: await this.cashier.byCode(code) };
  }

  @Patch('orders/:id/status')
  async status(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return { order: await this.cashier.changeStatus(id, dto.status, this.userId(req)) };
  }

  @Post('orders/:id/deliver')
  async deliver(@Req() req: Request, @Param('id') id: string, @Body() dto: DeliverOrderDto) {
    return this.cashier.deliver(id, dto.code, this.userId(req));
  }
}
```

```ts
// apps/api/src/cashier/cashier.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { CashierController } from './cashier.controller';
import { CashierService } from './cashier.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CashierController],
  providers: [CashierService, RolesGuard]
})
export class CashierModule {}
```

En `apps/api/src/app.module.ts` agregar el import y registrar el módulo:

```ts
import { CashierModule } from './cashier/cashier.module';

@Module({
  imports: [DatabaseModule, AuthModule, ProductsModule, CartModule, OrdersModule, AdminModule, CashierModule]
})
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm -w apps/api test -- --runInBand cashier.e2e.spec.ts`
Expected: 6 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cashier apps/api/src/app.module.ts apps/api/test/cashier.e2e.spec.ts
git commit -m "feat: endpoints del panel del cajero con guard y filtro"
```

---

### Task 6: Comprobante en los pedidos del cliente

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts:139-200` (`findOne`, `list`) y agregar `findPublicByCode`
- Modify: `apps/api/src/orders/orders.controller.ts:61-66` (nueva ruta)
- Test: `apps/api/src/orders/orders.service.spec.ts`

**Interfaces:**
- Consumes: tabla `comprobante` existente (`id_pedido UNIQUE`, `numero`, `fecha_emision`).
- Produces: `OrdersService.findPublicByCode(code)` → `{ code, status, totalBs, pickupTime, items, comprobante }`; `findOne`/`list` con campo `comprobante`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al `describe` de `orders.service.spec.ts`:

```ts
  it('findOne y list incluyen el comprobante cuando existe', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rowCount: 1, rows: [
      { ...orderRow, comprobante_numero: 'COM-20261124-0001', comprobante_fecha: '2026-11-24T14:55:00' }
    ] });
    const one = await service.findOne('9');
    expect(one.comprobante).toEqual({ numero: 'COM-20261124-0001', fechaEmision: '2026-11-24T14:55:00' });
    const list = await service.list('1');
    expect(list[0].comprobante?.numero).toBe('COM-20261124-0001');
  });

  it('findPublicByCode da detalle y comprobante sin datos personales', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1, rows: [{
      codigo: 'SAL-20261124-0001', estado: 'ENTREGADO', total: '24.00', pickup_time: '10:50',
      items: [{ name: 'Carne', quantity: 2, unitPriceBs: '12.00' }],
      comprobante_numero: 'COM-20261124-0001', comprobante_fecha: '2026-11-24T14:55:00'
    }] });
    const result = await service.findPublicByCode('SAL-20261124-0001');
    expect(result).toEqual({
      code: 'SAL-20261124-0001', status: 'ENTREGADO', totalBs: '24.00', pickupTime: '10:50',
      items: [{ name: 'Carne', quantity: 2, unitPriceBs: '12.00' }],
      comprobante: { numero: 'COM-20261124-0001', fechaEmision: '2026-11-24T14:55:00' }
    });
    expect(result).not.toHaveProperty('cliente_nombre');
    expect(result).not.toHaveProperty('cliente_celular');
  });

  it('findPublicByCode devuelve 404 si no existe', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.findPublicByCode('SAL-20261124-9999')).rejects.toThrow('Pedido no encontrado');
  });
```

- [ ] **Step 2: Verificar que falla**

Run: `npm -w apps/api test -- --runInBand orders.service.spec.ts`
Expected: falla porque `comprobante` no existe en la respuesta y `findPublicByCode is not a function`.

- [ ] **Step 3: Implementación mínima**

En `orders.service.ts`, dentro del `SELECT` de `findOne` agregar después de `mp.nombre AS payment_method,`:

```ts
               c.numero AS comprobante_numero,
               to_char(c.fecha_emision, 'YYYY-MM-DD"T"HH24:MI:SS') AS comprobante_fecha,
```

y después de `LEFT JOIN metodo_pago ...`:

```ts
        LEFT JOIN comprobante c ON c.id_pedido = p.id_pedido
```

En el objeto devuelto por `findOne`, antes de `items:`:

```ts
      comprobante: first.comprobante_numero
        ? { numero: first.comprobante_numero, fechaEmision: first.comprobante_fecha }
        : null,
```

Repetir los mismos tres cambios en `list` (usando `order` en vez de `first`) para que el historial muestre el comprobante.

Agregar el método público antes de `repeat`:

```ts
  async findPublicByCode(code: string) {
    const result = await this.db.query<any>(
      `SELECT p.codigo, p.estado, p.total,
              to_char(p.fecha_hora_recojo, 'HH24:MI') AS pickup_time,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'name', pr.nombre, 'quantity', d.cantidad, 'unitPriceBs', d.precio_unitario::text
                 ) ORDER BY d.id_detalle)
                 FROM detalle_pedido d JOIN producto pr ON pr.id_producto = d.id_producto
                 WHERE d.id_pedido = p.id_pedido), '[]'::json) AS items,
              c.numero AS comprobante_numero,
              to_char(c.fecha_emision, 'YYYY-MM-DD"T"HH24:MI:SS') AS comprobante_fecha
       FROM pedido p
       LEFT JOIN comprobante c ON c.id_pedido = p.id_pedido
       WHERE p.codigo = $1`,
      [code]
    );
    if (!result.rowCount) throw new NotFoundException('Pedido no encontrado');
    const row = result.rows[0];
    return {
      code: row.codigo,
      status: row.estado,
      totalBs: Number(row.total).toFixed(2),
      pickupTime: row.pickup_time,
      items: row.items.map((item: { name: string; quantity: number; unitPriceBs: string }) => ({
        name: item.name,
        quantity: item.quantity,
        unitPriceBs: Number(item.unitPriceBs).toFixed(2)
      })),
      comprobante: row.comprobante_numero
        ? { numero: row.comprobante_numero, fechaEmision: row.comprobante_fecha }
        : null
    };
  }
```

En `orders.controller.ts`, agregar la ruta pública después de `@Get()`:

```ts
  @Get('code/:code')
  async publicByCode(@Param('code') code: string) {
    return { order: await this.orders.findPublicByCode(code) };
  }
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm -w apps/api test -- --runInBand orders.service.spec.ts`
Expected: 7 tests en verde (4 existentes + 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.controller.ts apps/api/src/orders/orders.service.spec.ts
git commit -m "feat: comprobante en pedidos y consulta publica por codigo"
```

---

### Task 7: Panel web `/cashier`

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/app/cashier/layout.tsx`
- Create: `apps/web/src/app/cashier/layout.test.tsx`
- Create: `apps/web/src/app/cashier/page.tsx`
- Create: `apps/web/src/components/CashierOrders.tsx`
- Test: `apps/web/src/components/CashierOrders.test.tsx`

**Interfaces:**
- Consumes: `GET /cashier/orders`, `PATCH /cashier/orders/:id/status`, `POST /cashier/orders/:id/deliver`.
- Produces: tipos `CashierOrder`, `CashierOrderDetail`, `PublicOrder`, `Comprobante`; componente `CashierOrders`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// apps/web/src/components/CashierOrders.test.tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CashierOrders } from './CashierOrders';
import { api } from '../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../lib/api', () => ({ api: jest.fn(), ApiError: class ApiError extends Error {} }));

const order = {
  id: '7', code: 'SAL-20261125-0007', customerName: 'Ana', customerPhone: '70000000',
  pickupTime: '10:00', status: 'LISTO', totalBs: '24.00', paymentMethod: 'EFECTIVO',
  expiresAt: '2026-11-25T15:00:00.000Z', createdAt: '2026-11-25T14:30:00.000Z', itemCount: 2
};

describe('CashierOrders', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (api as jest.Mock).mockReset();
    (api as jest.Mock).mockResolvedValue({ orders: [order] });
  });
  afterEach(() => jest.useRealTimers());

  it('hace polling cada 4 segundos y limpia el intervalo', async () => {
    const { unmount } = render(<CashierOrders />);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/cashier/orders'));
    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(api).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('habilita entrega solo con código y pedido LISTO', async () => {
    render(<CashierOrders />);
    await waitFor(() => expect(screen.getByText(order.code)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Confirmar entrega' })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Código del pedido'), { target: { value: order.code } });
      fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    });
    expect(await screen.findByRole('button', { name: 'Confirmar entrega' })).toBeInTheDocument();
  });

  it('pide confirmación antes de cancelar', async () => {
    (api as jest.Mock).mockResolvedValue({ orders: [{ ...order, status: 'PENDIENTE' }] });
    render(<CashierOrders />);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await waitFor(() => expect(screen.getByText(order.code)).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    });
    expect(confirm).toHaveBeenCalled();
    expect(api).not.toHaveBeenCalledWith('/cashier/orders/7/status', expect.anything());
    confirm.mockRestore();
  });
});
```

```tsx
// apps/web/src/app/cashier/layout.test.tsx
import { render, screen } from '@testing-library/react';
import CashierLayout from './layout';
import { api } from '../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../lib/api', () => ({ api: jest.fn() }));

describe('CashierLayout', () => {
  beforeEach(() => jest.resetAllMocks());

  it('niega el panel a CLIENTE', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ role: 'CLIENTE' });
    render(<CashierLayout><div>secreto</div></CashierLayout>);
    expect(await screen.findByText('Sin permiso')).toBeInTheDocument();
    expect(screen.queryByText('secreto')).not.toBeInTheDocument();
  });

  it('permite a CAJERO y ADMIN', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ role: 'CAJERO' });
    render(<CashierLayout><div>secreto</div></CashierLayout>);
    expect(await screen.findByText('secreto')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm -w apps/web test -- --runInBand CashierOrders.test.tsx`
Expected: falla con `Cannot find module './CashierOrders'`.

- [ ] **Step 3: Implementación mínima**

En `apps/web/src/lib/types.ts` cambiar `OrderStatus` y agregar:

```ts
export type OrderStatus =
  | 'PENDIENTE' | 'CONFIRMADO' | 'PREPARANDO' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';

export interface Comprobante {
  numero: string;
  fechaEmision: string;
}

export interface PublicOrder {
  code: string;
  status: OrderStatus;
  totalBs: string;
  pickupTime: string;
  items: Array<{ name: string; quantity: number; unitPriceBs: string }>;
  comprobante: Comprobante | null;
}

export interface CashierOrder {
  id: string;
  code: string;
  customerName: string | null;
  customerPhone: string | null;
  pickupTime: string;
  status: OrderStatus;
  totalBs: string;
  paymentMethod: PaymentMethod;
  expiresAt: string;
  createdAt: string;
  itemCount: number;
}

export interface CashierOrderDetail extends CashierOrder {
  notes: string | null;
  items: Array<{ productId: string; name: string; quantity: number; unitPriceBs: string }>;
  comprobante: Comprobante | null;
}
```

Y agregar `comprobante?: Comprobante | null;` a `Order`.

```tsx
// apps/web/src/app/cashier/layout.tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { User } from '../../lib/types';

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    api<User>('/auth/me').then((user) => setRole(user.role)).catch(() => setRole('INVITADO'));
  }, []);

  if (role === null) return <main><p>Cargando…</p></main>;
  if (role !== 'CAJERO' && role !== 'ADMIN') {
    return (
      <main>
        <h1>Sin permiso</h1>
        <p>Esta sección es solo para el cajero.</p>
        <p><a href="/menu">Volver al menú</a></p>
      </main>
    );
  }
  return <main>{children}</main>;
}
```

```tsx
// apps/web/src/app/cashier/page.tsx
import { CashierOrders } from '../../components/CashierOrders';

export default function CashierHome() {
  return (
    <section>
      <h1>Cajero</h1>
      <p>Pedidos del día. La lista se actualiza sola cada 4 segundos.</p>
      <CashierOrders />
    </section>
  );
}
```

Los estilos globales ya cubren botones de 44 px y `.table-scroll` en `apps/web/src/app/globals.css`; no hace falta tocar CSS.

```tsx
// apps/web/src/components/CashierOrders.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { CashierOrder, CashierOrderDetail, OrderStatus } from '../lib/types';

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDIENTE: 'CONFIRMADO',
  CONFIRMADO: 'PREPARANDO',
  PREPARANDO: 'LISTO'
};

export function CashierOrders() {
  const [orders, setOrders] = useState<CashierOrder[]>([]);
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<CashierOrderDetail | null>(null);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ orders: CashierOrder[] }>('/cashier/orders');
      setOrders(res.orders);
    } catch {
      setMessage('No se pudo actualizar la lista');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const change = async (order: CashierOrder, status: OrderStatus) => {
    setMessage('');
    try {
      await api(`/cashier/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado');
    }
  };

  const cancel = async (order: CashierOrder) => {
    if (!window.confirm(`¿Cancelar el pedido ${order.code}?`)) return;
    await change(order, 'CANCELADO');
  };

  const search = async () => {
    setMessage('');
    try {
      const res = await api<{ order: CashierOrderDetail }>(
        `/cashier/orders/code/${encodeURIComponent(code)}`
      );
      setSelected(res.order);
      if (res.order.status !== 'LISTO') setMessage('El pedido no está listo para entrega');
    } catch (err) {
      setSelected(null);
      setMessage(err instanceof ApiError ? err.message : 'Pedido no encontrado');
    }
  };

  const deliver = async () => {
    if (!selected) return;
    setMessage('');
    try {
      const res = await api<{ comprobante: { numero: string } }>(
        `/cashier/orders/${selected.id}/deliver`,
        { method: 'POST', body: JSON.stringify({ code }) }
      );
      setMessage(`Comprobante ${res.comprobante.numero}`);
      setSelected(null);
      setCode('');
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo entregar el pedido');
    }
  };

  return (
    <section>
      {message && <p role="status">{message}</p>}
      <div>
        <label htmlFor="cashier-code">Código del pedido</label>
        <input id="cashier-code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="button" onClick={() => { void search(); }}>Buscar</button>
      </div>
      {selected?.status === 'LISTO' && selected.code === code && (
        <button type="button" onClick={() => { void deliver(); }}>Confirmar entrega</button>
      )}
      <button type="button" onClick={() => { void refresh(); }}>Actualizar</button>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Código</th><th>Cliente</th><th>Recojo</th><th>Estado</th><th>Total</th><th>Pago</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.code}</td>
                <td>{order.customerName ?? 'Invitado'}</td>
                <td>{order.pickupTime}</td>
                <td>{order.status}</td>
                <td>Bs {order.totalBs}</td>
                <td>{order.paymentMethod}</td>
                <td>
                  {NEXT[order.status] && (
                    <button type="button" onClick={() => {
                      const next = NEXT[order.status];
                      if (next) void change(order, next);
                    }}>
                      {order.status === 'PENDIENTE' ? 'Confirmar'
                        : order.status === 'CONFIRMADO' ? 'Preparar' : 'Marcar listo'}
                    </button>
                  )}
                  {(order.status === 'PENDIENTE' || order.status === 'CONFIRMADO') && (
                    <button type="button" onClick={() => { void cancel(order); }}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm -w apps/web test -- --runInBand CashierOrders.test.tsx`
Expected: 3 tests en verde.
Run: `npm -w apps/web test -- --runInBand layout.test.tsx`
Expected: 2 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/app/cashier apps/web/src/components/CashierOrders.tsx apps/web/src/components/CashierOrders.test.tsx
git commit -m "feat: panel del cajero con polling y entrega"
```

---

### Task 8: Comprobante en la vista del cliente y enlace de navegación

**Files:**
- Modify: `apps/web/src/app/order/[code]/page.tsx`
- Create: `apps/web/src/app/order/[code]/page.test.tsx`
- Modify: `apps/web/src/components/AuthNav.tsx`
- Modify: `apps/web/src/components/AuthNav.test.tsx`

**Interfaces:**
- Consumes: `GET /orders/code/:code` → `PublicOrder` de Task 6.
- Produces: vista que muestra número de comprobante, detalle y total con o sin sesión; enlace “Cajero” para `CAJERO`/`ADMIN`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// apps/web/src/app/order/[code]/page.test.tsx
import { render, screen } from '@testing-library/react';
import OrderConfirmation from './page';
import { api } from '../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../../lib/api', () => ({ api: jest.fn(), ApiError: class ApiError extends Error {} }));

describe('OrderConfirmation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sessionStorage.clear();
  });

  it('muestra comprobante, detalle y total sin sesión', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ order: {
      code: 'SAL-20261125-0007', status: 'ENTREGADO', totalBs: '24.00', pickupTime: '10:00',
      items: [{ name: 'Carne', quantity: 2, unitPriceBs: '12.00' }],
      comprobante: { numero: 'COM-20261125-0007', fechaEmision: '2026-11-25T14:35:00' }
    } });
    render(<OrderConfirmation params={Promise.resolve({ code: 'SAL-20261125-0007' })} />);
    expect(await screen.findByText('COM-20261125-0007')).toBeInTheDocument();
    expect(screen.getByText(/2 × Carne/)).toBeInTheDocument();
    expect(screen.getByText(/Bs 24\.00/)).toBeInTheDocument();
  });

  it('sigue mostrando el pedido si no hay comprobante aún', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ order: {
      code: 'SAL-20261125-0008', status: 'PENDIENTE', totalBs: '12.00', pickupTime: '10:30',
      items: [], comprobante: null
    } });
    render(<OrderConfirmation params={Promise.resolve({ code: 'SAL-20261125-0008' })} />);
    expect(await screen.findByText(/Mostrá el código SAL-20261125-0008/)).toBeInTheDocument();
  });
});
```

Agregar en `AuthNav.test.tsx`:

```tsx
  it('muestra Cajero para CAJERO y ADMIN', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ ...user, role: 'CAJERO' });
    render(<AuthNav />);
    expect(await screen.findByRole('link', { name: 'Cajero' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Verificar que falla**

Run: `npm -w apps/web test -- --runInBand page.test.tsx AuthNav.test.tsx`
Expected: falla porque no se muestra `COM-20261125-0007` ni el enlace “Cajero”.

- [ ] **Step 3: Implementación mínima**

Reemplazar `apps/web/src/app/order/[code]/page.tsx` por:

```tsx
'use client';

import { useEffect, useState } from 'react';
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
            <p>Comprobante: <strong>{receipt.comprobante.numero}</strong> — {receipt.comprobante.fechaEmision}</p>
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

En `AuthNav.tsx`, agregar después de la línea de “Administración”:

```tsx
      {(user.role === 'CAJERO' || user.role === 'ADMIN') && <a href="/cashier">Cajero</a>}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm -w apps/web test -- --runInBand page.test.tsx AuthNav.test.tsx`
Expected: 3 tests nuevos/actualizados en verde y los 4 existentes de `AuthNav` siguen en verde.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/order/[code]/page.tsx" "apps/web/src/app/order/[code]/page.test.tsx" apps/web/src/components/AuthNav.tsx apps/web/src/components/AuthNav.test.tsx
git commit -m "feat: comprobante visible para el cliente y enlace del cajero"
```

---

### Task 9: E2E del cajero, README y regresión final

**Files:**
- Create: `apps/web/e2e/cashier.spec.ts`
- Modify: `README.md`
- Verify: API/Web tests, builds, esquema, BD, E2E

**Interfaces:**
- Consumes: `E2E_ADMIN_EMAIL` y `E2E_ADMIN_PASSWORD` de `.env` (ADMIN está autorizado para operar `/cashier`; el rol `CAJERO` ya está cubierto por Supertest y el test de layout).
- Produces: E2E en tres viewports y documentación actualizada.

- [ ] **Step 1: Escribir el test E2E**

```ts
// apps/web/e2e/cashier.spec.ts
import { expect, test } from '@playwright/test';

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? '';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? '';
const clientEmail = `cliente-cajero-${Date.now()}@ejemplo.test`;
const clientPassword = 'secret123';

test('cajero cambia estados, entrega y muestra comprobante', async ({ browser }) => {
  test.skip(!adminEmail || !adminPassword, 'Requiere E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD');

  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await client.goto('/menu', { waitUntil: 'networkidle' });
  await client.getByRole('link', { name: 'Ingresar' }).click();
  await client.waitForLoadState('networkidle');
  await client.getByRole('link', { name: 'Registrate' }).click();
  await client.waitForLoadState('networkidle');
  await client.getByLabel('Nombre').fill('Ana');
  await client.getByLabel('Celular').fill('70000000');
  await client.getByLabel('Correo').fill(clientEmail);
  await client.getByLabel('Contraseña').fill(clientPassword);
  await client.getByRole('button', { name: 'Crear cuenta' }).click();
  await client.waitForLoadState('networkidle');
  await client.getByRole('button', { name: 'Agregar' }).first().click();
  await client.goto('/checkout', { waitUntil: 'networkidle' });
  await client.getByLabel('Hora de recojo').fill('10:00');
  await client.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(client).toHaveURL(/\/order\/SAL-\d{8}-\d{4}/);
  const code = client.url().split('/').pop() ?? '';
  expect(code).toMatch(/^SAL-\d{8}-\d{4}$/);

  const adminContext = await browser.newContext();
  const cashier = await adminContext.newPage();
  await cashier.goto('/login', { waitUntil: 'networkidle' });
  await cashier.getByLabel('Correo').fill(adminEmail);
  await cashier.getByLabel('Contraseña').fill(adminPassword);
  await cashier.getByRole('button', { name: 'Ingresar' }).click();
  await cashier.goto('/cashier', { waitUntil: 'networkidle' });
  await expect(cashier.getByRole('heading', { name: 'Cajero' })).toBeVisible();

  const row = cashier.getByRole('row').filter({ hasText: code });
  for (const label of ['Confirmar', 'Preparar', 'Marcar listo']) {
    await row.getByRole('button', { name: label }).click();
  }
  await cashier.getByLabel('Código del pedido').fill(code);
  await cashier.getByRole('button', { name: 'Buscar' }).click();
  await cashier.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(cashier.getByText(/COM-\d{8}-\d{4}/)).toBeVisible();

  await client.goto(`/order/${code}`, { waitUntil: 'networkidle' });
  await expect(client.getByText(/COM-\d{8}-\d{4}/)).toBeVisible();

  for (const page of [cashier, client]) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await clientContext.close();
  await adminContext.close();
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm -w apps/web run e2e -- cashier.spec.ts --project=360x800`
Expected: falla hasta que la app tenga `/cashier` y el endpoint público desplegados; con el código de Tasks 1–8, pasa.

- [ ] **Step 3: Actualizar README**

Cambiar el título y la descripción:

```md
# SALTEÑANGA — Fases 1, 2 y 3: tienda, cajero y administración

Tienda online para clientes y panel interno: catálogo en Bs, carrito persistente, pedidos con código e historial, gestión del cajero con cambio de estados y entrega, y administración de productos, inventario y reportes.
```

En “Crear el primer administrador”, agregar: “Ese mismo usuario puede operar `/cashier`; el enlace 'Cajero' aparece para `CAJERO` y `ADMIN`.”

Reemplazar “Fases pendientes” por:

```md
## Fases pendientes

- Fase 4: QR/transferencia y descarga de comprobantes.
- Fase 5: despliegue con HTTPS, rendimiento y disponibilidad.
```

En “Pruebas”, agregar: “`cashier.spec.ts` usa `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` y se omite si no están definidas. Crea un cliente y un pedido reales durante la corrida.”

- [ ] **Step 4: Regresión final**

Ejecutar en orden y confirmar todo en verde:

```bash
npm -w apps/api test -- --runInBand
npm -w apps/web test -- --runInBand
npm -w apps/api run build
npm -w apps/web run build
node scripts/verify-schema.mjs
node --env-file=.env scripts/verify-db.mjs
```

Expected: API 75/75 (55 existentes + 20 nuevos), Web 41/41 (33 existentes + 8 nuevos), builds OK, `SCHEMA OK (45 elementos base, 15 correcciones aditivas)`, `DB OK (12 tablas, seed …)`. Si el conteo exacto difiere, revisar el output y no afirmar éxito hasta que todos los comandos devuelvan 0.

Para E2E con reloj fijo: agregar `E2E_FIXED_NOW` a `.env`, recrear el contenedor `api` si se usa Docker, correr `npm -w apps/web run e2e`, y al terminar quitar la variable y recrear `api`. No imprimir secretos.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/cashier.spec.ts README.md
git commit -m "test: e2e del cajero y documentacion de la fase 2"
```

No hacer push sin aprobación explícita.
