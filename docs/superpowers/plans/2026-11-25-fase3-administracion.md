# SALTEÑANGA Fase 3 — Administración — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el panel de administración de SALTEÑANGA: CRUD de categorías, productos e inventario, cuatro reportes y acceso restringido al rol `ADMIN`.

**Architecture:** Se agrega un módulo `admin` al Nest existente con un guard por rol que obtiene el rol desde `AuthService.me()` (el JWT no cambia), servicios de catálogo y reportes sobre `DatabaseService`/`pg`, y páginas `/admin/*` en Next que consumen la misma API con `credentials: 'include'`. No se agregan dependencias npm ni tablas nuevas.

**Tech Stack:** Node 20+, TypeScript estricto, NestJS 10, Next.js 15 (App Router), React 19, `pg`, `bcryptjs`, `class-validator`, Jest, Supertest, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-25-fase3-administracion-design.md`

---

## Global Constraints

- Idioma de UI: **español**; moneda: **bolivianos (Bs)** con dos decimales.
- Fuentes de verdad: `saltenanga_schema.sql` y `saltenanga_schema_adaptado.sql`. **No renombrar tablas ni columnas.**
- La bandera operativa de disponibilidad es `inventario.disponible_hoy`; `inventario.disponible` no se modifica.
- Bajas **lógicas** únicamente: `categoria.activa`, `producto.activo`, `inventario.disponible_hoy`. Nunca `DELETE` físico.
- IDs numéricos se exponen al frontend como **string** en JSON.
- Sin dependencias npm nuevas, sin cambios en Docker, CORS, cookies ni JWT.
- Sin push a GitHub sin aprobación explícita del usuario.
- Los 23 tests de API, 22 de Web y 3 E2E de Fase 1 deben seguir pasando.

## Review Focus

- Usuario `CLIENTE` que navega directo a `/admin/*` → API `403` y UI muestra "Sin permiso", no datos.
- Usuario dado de baja (`activo = FALSE`) con cookie `sb_access` todavía vigente → `401`, porque `me()` filtra `activo`.
- Nombre duplicado en `categoria` o `producto` → `409` y ninguna fila creada.
- `stock` negativo, `precio` negativo o rango de fechas inválido → `400` y ninguna escritura.
- Desactivar un producto que ya tiene `detalle_pedido` → desaparece del catálogo pero el historial sigue intacto.

---

## File Structure

```text
apps/api/src/common/guards/roles.decorator.ts       metadata @Roles
apps/api/src/common/guards/roles.guard.ts           guard 401/403
apps/api/src/common/guards/roles.guard.spec.ts      tests del guard
apps/api/src/admin/admin.module.ts                  módulo admin
apps/api/src/admin/admin.controller.ts              rutas /admin
apps/api/src/admin/admin-catalog.service.ts         categoria/producto/inventario
apps/api/src/admin/admin-catalog.service.spec.ts    tests de catálogo
apps/api/src/admin/admin-reports.service.ts         cuatro reportes
apps/api/src/admin/admin-reports.service.spec.ts    tests de reportes
apps/api/src/admin/dto/*.dto.ts                     validación de bodies/query
apps/api/src/app.module.ts                          registra AdminModule (modificar)
apps/api/test/admin.e2e.spec.ts                     Supertest guard+controller
scripts/create-admin.mjs                            primer ADMIN por entorno
.env.example                                        variables opcionales (modificar)
README.md                                           documentación (modificar)
apps/web/src/lib/types.ts                           tipos admin (modificar)
apps/web/src/components/AuthNav.tsx                 link ADMIN (modificar)
apps/web/src/components/AuthNav.test.tsx            test del link (modificar)
apps/web/src/app/admin/layout.tsx                   verificación de rol
apps/web/src/app/admin/layout.test.tsx              test del gate
apps/web/src/app/admin/page.tsx                     resumen
apps/web/src/app/admin/products/page.tsx            alta/edición/desactivación
apps/web/src/app/admin/categories/page.tsx          alta/edición/activación
apps/web/src/app/admin/inventory/page.tsx           stock y disponible_hoy
apps/web/src/app/admin/reports/page.tsx             cuatro reportes
apps/web/e2e/admin.spec.ts                          flujo admin en navegador
```

---

### Task 1: Guard de roles

**Files:**
- Create: `apps/api/src/common/guards/roles.decorator.ts`
- Create: `apps/api/src/common/guards/roles.guard.ts`
- Test: `apps/api/src/common/guards/roles.guard.spec.ts`

**Interfaces:**
- Consumes: `AuthService.me(access?: string)` → `{ id, email, name, phone, role }`; `CookieService.read(req, 'sb_access')` → `string | undefined`; `Reflector.getAllAndOverride(key, targets)`.
- Produces: `Roles(...roles: string[])`, `RolesGuard` (guard de Nest que deja `req.user` con el usuario hidratado).

- [ ] **Step 1: Write the failing test**

`apps/api/src/common/guards/roles.guard.spec.ts`:

```ts
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

const auth = { me: jest.fn() } as any;
const cookies = { read: jest.fn() } as any;
const reflector = { getAllAndOverride: jest.fn() } as any;
const guard = new RolesGuard(reflector, auth, cookies);

function ctx(cookie?: string): ExecutionContext {
  const req = { cookies: cookie ? { sb_access: cookie } : {} };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req })
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
  });

  it('401 sin cookie', async () => {
    cookies.read.mockReturnValue(undefined);
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.me).not.toHaveBeenCalled();
  });

  it('401 cuando la sesión es inválida', async () => {
    cookies.read.mockReturnValue('token');
    auth.me.mockRejectedValue(new UnauthorizedException());
    await expect(guard.canActivate(ctx('token'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('403 para CLIENTE', async () => {
    cookies.read.mockReturnValue('token');
    auth.me.mockResolvedValue({ id: '1', role: 'CLIENTE' });
    await expect(guard.canActivate(ctx('token'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite ADMIN y expone req.user', async () => {
    cookies.read.mockReturnValue('token');
    const user = { id: '1', role: 'ADMIN' };
    auth.me.mockResolvedValue(user);
    const context = ctx('token');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((context.switchToHttp().getRequest() as any).user).toEqual(user);
  });

  it('no exige roles cuando no hay metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(cookies.read).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w apps/api test -- --runInBand roles.guard`
Expected: FAIL con `Cannot find module './roles.guard'`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/common/guards/roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

`apps/api/src/common/guards/roles.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { CookieService } from '../cookies/cookie.service';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private auth: AuthService,
    private cookies: CookieService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.cookies.read(req, 'sb_access');
    if (!token) throw new UnauthorizedException();

    const user = await this.auth.me(token); // lanza 401 si es inválido o está inactivo
    if (!required.includes(user.role)) throw new ForbiddenException();
    (req as Request & { user?: unknown }).user = user;
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w apps/api test -- --runInBand roles.guard`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/guards/roles.decorator.ts apps/api/src/common/guards/roles.guard.ts apps/api/src/common/guards/roles.guard.spec.ts
git commit -m "feat: guard de roles ADMIN para el panel de administracion"
```

---

### Task 2: Servicio de catálogo (categorías, productos e inventario)

**Files:**
- Create: `apps/api/src/admin/admin-catalog.service.ts`
- Test: `apps/api/src/admin/admin-catalog.service.spec.ts`

**Interfaces:**
- Consumes: `DatabaseService.query<T>(text, params)` y `DatabaseService.transaction(work)`.
- Produces: `AdminCatalogService` con `listCategories()`, `createCategory(nombre)`, `updateCategory(id, dto)`, `listProducts(category?, includeInactive?)`, `createProduct(dto)`, `updateProduct(id, dto)`, `listInventory()`, `updateInventory(id, dto)`. Formas de respuesta: categoría `{ id, nombre, activa, productCount }`; producto `{ id, idCategoria, categoria, nombre, precio, fotoUrl, activo, stock, disponibleHoy }`; inventario `{ id, productId, nombre, stock, disponibleHoy, lowStock }`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/admin/admin-catalog.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminCatalogService } from './admin-catalog.service';
import { DatabaseService } from '../database/database.service';

const db = { query: jest.fn(), transaction: jest.fn() } as unknown as DatabaseService;
const service = new AdminCatalogService(db);

describe('AdminCatalogService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lista categorias con conteo de productos', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id_categoria: 1, nombre: 'Salteñas', activa: true, product_count: '5' }]
    });
    await expect(service.listCategories()).resolves.toEqual([
      { id: '1', nombre: 'Salteñas', activa: true, productCount: 5 }
    ]);
  });

  it('rechaza categoria duplicada con 409', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [{ 1: 1 }], rowCount: 1 });
    await expect(service.createCategory('Salteñas')).rejects.toBeInstanceOf(ConflictException);
  });

  it('crea producto e inventario en una transaccion', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // SELECT categoria
      .mockResolvedValueOnce({ rows: [{ id_producto: 7 }] })    // INSERT producto
      .mockResolvedValueOnce({ rows: [] });                     // INSERT inventario
    (db.transaction as jest.Mock).mockImplementation((work: any) => work(client));
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // ensureUnique
      .mockResolvedValueOnce({
        rows: [{ id_producto: 7, id_categoria: 1, categoria: 'Salteñas', nombre: 'Carne',
                 precio: '12.00', foto_url: null, activo: true, stock: 0, disponible_hoy: false }]
      });                                                      // oneProduct

    const product = await service.createProduct({
      idCategoria: 1, nombre: 'Carne', precio: 12
    });

    expect((db.transaction as jest.Mock)).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(product).toMatchObject({ id: '7', stock: 0, disponibleHoy: false, precio: '12.00' });
  });

  it('baja logica: desactivar producto apaga disponible_hoy', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ nombre: 'Carne' }], rowCount: 1 }) // SELECT actual
      .mockResolvedValueOnce({ rows: [] })                                // UPDATE producto
      .mockResolvedValueOnce({ rows: [] })                                // UPDATE inventario
      .mockResolvedValueOnce({ rows: [{
        id_producto: 1, id_categoria: 1, categoria: 'Salteñas', nombre: 'Carne',
        precio: '12.00', foto_url: null, activo: false, stock: 3, disponible_hoy: false
      }] });                                                              // oneProduct

    const product = await service.updateProduct('1', { activo: false });

    expect((db.query as jest.Mock).mock.calls[2][0]).toContain('UPDATE inventario SET disponible_hoy');
    expect(product.activo).toBe(false);
    expect(product.disponibleHoy).toBe(false);
  });

  it('404 al actualizar inventario inexistente', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });
    await expect(service.updateInventory('99', { stock: 2 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stock negativo se rechaza en el servicio', async () => {
    await expect(service.updateInventory('1', { stock: -1 })).rejects.toThrow('stock');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w apps/api test -- --runInBand admin-catalog`
Expected: FAIL con `Cannot find module './admin-catalog.service'`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/admin/admin-catalog.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface AdminCategory {
  id: string; nombre: string; activa: boolean; productCount: number;
}
export interface AdminProduct {
  id: string; idCategoria: string; categoria: string; nombre: string;
  precio: string; fotoUrl: string | null; activo: boolean;
  stock: number; disponibleHoy: boolean;
}
export interface AdminInventoryItem {
  id: string; productId: string; nombre: string;
  stock: number; disponibleHoy: boolean; lowStock: boolean;
}
export interface CreateProductDtoShape {
  idCategoria: number; nombre: string; descripcion?: string;
  precio: number; fotoUrl?: string; stock?: number; disponibleHoy?: boolean;
}
export interface UpdateProductDtoShape extends Partial<CreateProductDtoShape> {
  activo?: boolean;
}

interface CategoryRow {
  id_categoria: number; nombre: string; activa: boolean; product_count: string;
}
interface ProductRow {
  id_producto: number; id_categoria: number; categoria: string; nombre: string;
  precio: string; foto_url: string | null; activo: boolean;
  stock: number | null; disponible_hoy: boolean;
}
interface InventoryRow {
  id_inventario: number; id_producto: number; nombre: string;
  stock: number; disponible_hoy: boolean;
}

const productSelect = `
  SELECT p.id_producto, c.id_categoria, c.nombre AS categoria, p.nombre,
         p.precio, p.foto_url, p.activo, i.stock, i.disponible_hoy
  FROM producto p
  JOIN categoria c ON c.id_categoria = p.id_categoria
  LEFT JOIN inventario i ON i.id_producto = p.id_producto`;

@Injectable()
export class AdminCatalogService {
  constructor(private db: DatabaseService) {}

  private async ensureUnique(table: 'categoria' | 'producto', nombre: string, exceptId?: number) {
    const result = await this.db.query(
      `SELECT 1 FROM ${table} WHERE lower(nombre) = lower($1)
       AND ($2::int IS NULL OR id_${table === 'categoria' ? 'categoria' : 'producto'} <> $2)`,
      [nombre, exceptId ?? null]
    );
    if (result.rowCount) {
      throw new ConflictException(
        table === 'categoria' ? 'Ya existe esa categoría' : 'Ya existe ese producto'
      );
    }
  }

  private toCategory(row: CategoryRow): AdminCategory {
    return {
      id: String(row.id_categoria), nombre: row.nombre, activa: row.activa,
      productCount: Number(row.product_count)
    };
  }

  private toProduct(row: ProductRow): AdminProduct {
    return {
      id: String(row.id_producto), idCategoria: String(row.id_categoria),
      categoria: row.categoria, nombre: row.nombre,
      precio: Number(row.precio).toFixed(2), fotoUrl: row.foto_url,
      activo: row.activo, stock: Number(row.stock ?? 0),
      disponibleHoy: Boolean(row.disponible_hoy)
    };
  }

  private async oneProduct(id: number): Promise<AdminProduct> {
    const result = await this.db.query<ProductRow>(`${productSelect} WHERE p.id_producto = $1`, [id]);
    if (!result.rowCount) throw new NotFoundException('Producto no encontrado');
    return this.toProduct(result.rows[0]);
  }

  async listCategories(): Promise<AdminCategory[]> {
    const result = await this.db.query<CategoryRow>(`
      SELECT c.id_categoria, c.nombre, c.activa,
             (SELECT COUNT(*) FROM producto p WHERE p.id_categoria = c.id_categoria) AS product_count
      FROM categoria c ORDER BY c.nombre`);
    return result.rows.map((row) => this.toCategory(row));
  }

  async createCategory(nombre: string): Promise<AdminCategory> {
    await this.ensureUnique('categoria', nombre);
    const result = await this.db.query<CategoryRow>(
      `INSERT INTO categoria (nombre, activa) VALUES ($1, TRUE)
       RETURNING id_categoria, nombre, activa, 0::bigint AS product_count`,
      [nombre]
    );
    return this.toCategory(result.rows[0]);
  }

  async updateCategory(id: number, dto: { nombre?: string; activa?: boolean }): Promise<AdminCategory> {
    const current = await this.db.query<CategoryRow>(
      'SELECT id_categoria, nombre, activa FROM categoria WHERE id_categoria = $1', [id]
    );
    if (!current.rowCount) throw new NotFoundException('Categoría no encontrada');
    if (dto.nombre && dto.nombre !== current.rows[0].nombre) {
      await this.ensureUnique('categoria', dto.nombre, id);
    }
    await this.db.query(
      `UPDATE categoria SET nombre = COALESCE($2, nombre), activa = COALESCE($3, activa)
       WHERE id_categoria = $1`,
      [id, dto.nombre ?? null, dto.activa ?? null]
    );
    return (await this.listCategories()).find((c) => c.id === String(id))!;
  }

  async listProducts(category?: string, includeInactive = false): Promise<AdminProduct[]> {
    const where = ['($1::text IS NULL OR c.id_categoria::text = $1)', '($2::boolean OR p.activo = TRUE)'];
    const result = await this.db.query<ProductRow>(
      `${productSelect} WHERE ${where.join(' AND ')} ORDER BY p.nombre`,
      [category ?? null, includeInactive]
    );
    return result.rows.map((row) => this.toProduct(row));
  }

  async createProduct(dto: CreateProductDtoShape): Promise<AdminProduct> {
    return this.db.transaction(async (client) => {
      const category = await client.query('SELECT 1 FROM categoria WHERE id_categoria = $1', [dto.idCategoria]);
      if (!category.rowCount) throw new NotFoundException('Categoría no encontrada');
      await this.ensureUnique('producto', dto.nombre);

      const inserted = await client.query<{ id_producto: number }>(
        `INSERT INTO producto (id_categoria, nombre, descripcion, precio, foto_url, activo)
         VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id_producto`,
        [dto.idCategoria, dto.nombre, dto.descripcion ?? null, dto.precio.toFixed(2), dto.fotoUrl ?? null]
      );
      await client.query(
        `INSERT INTO inventario (id_producto, stock, disponible, disponible_hoy)
         VALUES ($1,$2,TRUE,$3)`,
        [inserted.rows[0].id_producto, dto.stock ?? 0, dto.disponibleHoy ?? false]
      );
      return this.oneProduct(inserted.rows[0].id_producto);
    });
  }

  async updateProduct(id: number, dto: UpdateProductDtoShape): Promise<AdminProduct> {
    const current = await this.db.query<{ nombre: string }>(
      'SELECT nombre FROM producto WHERE id_producto = $1', [id]
    );
    if (!current.rowCount) throw new NotFoundException('Producto no encontrado');
    if (dto.nombre && dto.nombre !== current.rows[0].nombre) {
      await this.ensureUnique('producto', dto.nombre, id);
    }

    await this.db.query(
      `UPDATE producto SET
         id_categoria = COALESCE($2, id_categoria), nombre = COALESCE($3, nombre),
         descripcion = COALESCE($4, descripcion), precio = COALESCE($5, precio),
         foto_url = COALESCE($6, foto_url), activo = COALESCE($7, activo)
       WHERE id_producto = $1`,
      [id, dto.idCategoria ?? null, dto.nombre ?? null, dto.descripcion ?? null,
       dto.precio === undefined ? null : dto.precio.toFixed(2), dto.fotoUrl ?? null, dto.activo ?? null]
    );

    if (dto.stock !== undefined) {
      if (dto.stock < 0) throw new BadRequestException('stock no puede ser negativo');
      await this.db.query('UPDATE inventario SET stock = $2 WHERE id_producto = $1', [id, dto.stock]);
    }
    if (dto.disponibleHoy !== undefined || dto.activo === false) {
      const value = dto.activo === false ? false : dto.disponibleHoy;
      await this.db.query('UPDATE inventario SET disponible_hoy = $2 WHERE id_producto = $1', [id, value]);
    }
    return this.oneProduct(id);
  }

  async listInventory(threshold = 5): Promise<AdminInventoryItem[]> {
    const result = await this.db.query<InventoryRow>(`
      SELECT i.id_inventario, i.id_producto, p.nombre, i.stock, i.disponible_hoy
      FROM inventario i JOIN producto p ON p.id_producto = i.id_producto
      ORDER BY i.stock ASC, p.nombre`);
    return result.rows.map((row) => ({
      id: String(row.id_inventario), productId: String(row.id_producto), nombre: row.nombre,
      stock: Number(row.stock), disponibleHoy: row.disponible_hoy,
      lowStock: Number(row.stock) <= threshold
    }));
  }

  async updateInventory(id: number, dto: { stock?: number; disponibleHoy?: boolean }): Promise<AdminInventoryItem> {
    if (dto.stock !== undefined && dto.stock < 0) {
      throw new BadRequestException('stock no puede ser negativo');
    }
    const exists = await this.db.query('SELECT 1 FROM inventario WHERE id_inventario = $1', [id]);
    if (!exists.rowCount) throw new NotFoundException('Inventario no encontrado');
    await this.db.query(
      `UPDATE inventario SET stock = COALESCE($2, stock),
         disponible_hoy = COALESCE($3, disponible_hoy) WHERE id_inventario = $1`,
      [id, dto.stock ?? null, dto.disponibleHoy ?? null]
    );
    const all = await this.listInventory();
    return all.find((item) => item.id === String(id))!;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w apps/api test -- --runInBand admin-catalog`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/admin-catalog.service.ts apps/api/src/admin/admin-catalog.service.spec.ts
git commit -m "feat: servicio de catalogo administrativo con bajas logicas"
```

---

### Task 3: Servicio de reportes

**Files:**
- Create: `apps/api/src/admin/admin-reports.service.ts`
- Test: `apps/api/src/admin/admin-reports.service.spec.ts`

**Interfaces:**
- Consumes: `DatabaseService.query<T>`; `businessNow()` de `../orders/expiry`.
- Produces: `AdminReportsService` con `sales(from?, to?)`, `topProducts(from?, to?, limit?)`, `ordersByStatus(from?, to?)`, `lowStock(threshold?)`. Todos devuelven `{ rows: ... }` desde el controlador; el servicio devuelve el array de filas.

- [ ] **Step 1: Write the failing test**

`apps/api/src/admin/admin-reports.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { AdminReportsService } from './admin-reports.service';
import { DatabaseService } from '../database/database.service';

const db = { query: jest.fn() } as unknown as DatabaseService;
const service = new AdminReportsService(db);

describe('AdminReportsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('valida formato de fecha', async () => {
    await expect(service.sales('25-11-2026', undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.sales('2026-11-25', '2026-11-24')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('desplaza 4 horas los limites si Postgres esta en UTC', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ TimeZone: 'UTC' }] })
      .mockResolvedValueOnce({ rows: [] });
    await service.sales('2026-11-25', '2026-11-25');
    const params = (db.query as jest.Mock).mock.calls[1][1];
    expect(params[0]).toBe('2026-11-24T20:00:00.000Z');
    expect(params[1]).toBe('2026-11-25T20:00:00.000Z');
  });

  it('excluye cancellados de ventas y top productos', async () => {
    (db.query as jest.Mock)
      .mockResolvedValue({ rows: [{ TimeZone: 'America/La_Paz' }] });
    await service.sales(undefined, undefined);
    await service.topProducts(undefined, undefined, 10);
    expect((db.query as jest.Mock).mock.calls[1][0]).toContain("estado <> 'CANCELADO'");
    expect((db.query as jest.Mock).mock.calls[3][0]).toContain("estado <> 'CANCELADO'");
  });

  it('stock bajo usa el umbral por defecto 5', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    await service.lowStock(undefined);
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual([5]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w apps/api test -- --runInBand admin-reports`
Expected: FAIL con `Cannot find module './admin-reports.service'`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/admin/admin-reports.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { businessNow } from '../orders/expiry';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(businessNow());
}

@Injectable()
export class AdminReportsService {
  constructor(private db: DatabaseService) {}

  private validate(from?: string, to?: string): [string, string] {
    if (from && !DATE.test(from)) throw new BadRequestException('from debe ser AAAA-MM-DD');
    if (to && !DATE.test(to)) throw new BadRequestException('to debe ser AAAA-MM-DD');
    const start = from ?? localToday();
    const end = to ?? start;
    if (start > end) throw new BadRequestException('from no puede ser mayor que to');
    return [start, end];
  }

  private async bounds(from?: string, to?: string): Promise<[string, string]> {
    const [start, end] = this.validate(from, to);
    const tz = await this.db.query<{ TimeZone: string }>('SHOW TIMEZONE');
    const shift = tz.rows[0]?.TimeZone === 'UTC' ? 4 : 0;
    const begin = new Date(`${start}T00:00:00.000Z`);
    begin.setUTCHours(begin.getUTCHours() - shift);
    const finish = new Date(`${end}T00:00:00.000Z`);
    finish.setUTCHours(finish.getUTCHours() - shift + 24);
    return [begin.toISOString(), finish.toISOString()];
  }

  async sales(from?: string, to?: string) {
    const [begin, finish] = await this.bounds(from, to);
    const result = await this.db.query(
      `SELECT fecha_creacion::date::text AS fecha, COUNT(*)::int AS pedidos,
              COALESCE(SUM(total), 0)::text AS "totalBs"
       FROM pedido
       WHERE fecha_creacion >= $1 AND fecha_creacion < $2
         AND estado <> 'CANCELADO'
       GROUP BY fecha_creacion::date ORDER BY fecha`,
      [begin, finish]
    );
    return result.rows;
  }

  async topProducts(from?: string, to?: string, limit = 10) {
    const capped = Math.min(Math.max(limit, 1), 50);
    const [begin, finish] = await this.bounds(from, to);
    const result = await this.db.query(
      `SELECT p.id_producto::text AS "productId", p.nombre,
              SUM(d.cantidad)::int AS unidades,
              COALESCE(SUM(d.subtotal), 0)::text AS "totalBs"
       FROM detalle_pedido d
       JOIN pedido pe ON pe.id_pedido = d.id_pedido
       JOIN producto p ON p.id_producto = d.id_producto
       WHERE pe.fecha_creacion >= $1 AND pe.fecha_creacion < $2
         AND pe.estado <> 'CANCELADO'
       GROUP BY p.id_producto, p.nombre
       ORDER BY SUM(d.subtotal) DESC LIMIT $3`,
      [begin, finish, capped]
    );
    return result.rows;
  }

  async ordersByStatus(from?: string, to?: string) {
    const [begin, finish] = await this.bounds(from, to);
    const result = await this.db.query(
      `SELECT estado, COUNT(*)::int AS pedidos
       FROM pedido WHERE fecha_creacion >= $1 AND fecha_creacion < $2
       GROUP BY estado ORDER BY estado`,
      [begin, finish]
    );
    return result.rows;
  }

  async lowStock(threshold = 5) {
    const result = await this.db.query(
      `SELECT p.id_producto::text AS "productId", p.nombre, i.stock
       FROM inventario i JOIN producto p ON p.id_producto = i.id_producto
       WHERE i.stock <= $1 AND p.activo = TRUE
       ORDER BY i.stock ASC, p.nombre`,
      [threshold]
    );
    return result.rows;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w apps/api test -- --runInBand admin-reports`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/admin-reports.service.ts apps/api/src/admin/admin-reports.service.spec.ts
git commit -m "feat: reportes de ventas, productos, estados y stock bajo"
```

---

### Task 4: Controlador, módulo y validación HTTP

**Files:**
- Create: `apps/api/src/admin/dto/category.dto.ts`
- Create: `apps/api/src/admin/dto/product.dto.ts`
- Create: `apps/api/src/admin/dto/report.dto.ts`
- Create: `apps/api/src/admin/admin.controller.ts`
- Create: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/app.module.ts:1-11`
- Test: `apps/api/test/admin.e2e.spec.ts`

**Interfaces:**
- Consumes: `AdminCatalogService`, `AdminReportsService`, `RolesGuard`, `Roles`, DTOs.
- Produces: rutas `/admin/*` protegidas; respuestas `{ categories }`, `{ category }`, `{ products }`, `{ product }`, `{ items }`, `{ item }`, `{ rows }`.

- [ ] **Step 1: Write the failing test**

`apps/api/test/admin.e2e.spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AdminController } from '../src/admin/admin.controller';
import { AdminCatalogService } from '../src/admin/admin-catalog.service';
import { AdminReportsService } from '../src/admin/admin-reports.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { AuthService } from '../src/auth/auth.service';
import { CookieService } from '../src/common/cookies/cookie.service';

describe('Admin E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const catalog = {
      listCategories: jest.fn().mockResolvedValue([]),
      createCategory: jest.fn().mockResolvedValue({ id: '1', nombre: 'Postres', activa: true, productCount: 0 }),
      listProducts: jest.fn().mockResolvedValue([]),
      listInventory: jest.fn().mockResolvedValue([])
    };
    const reports = {
      sales: jest.fn().mockResolvedValue([]), topProducts: jest.fn().mockResolvedValue([]),
      ordersByStatus: jest.fn().mockResolvedValue([]), lowStock: jest.fn().mockResolvedValue([])
    };
    const auth = {
      me: jest.fn((token: string) => Promise.resolve(
        token === 'admin-token' ? { id: '1', role: 'ADMIN' } : { id: '2', role: 'CLIENTE' }
      ))
    };
    const cookies = { read: jest.fn((req: any) => req.cookies?.sb_access) };

    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminCatalogService, useValue: catalog },
        { provide: AdminReportsService, useValue: reports },
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

  it('401 sin cookie', async () => {
    await request(app.getHttpServer()).get('/admin/categories').expect(401);
  });

  it('403 para CLIENTE', async () => {
    await request(app.getHttpServer())
      .get('/admin/categories').set('Cookie', 'sb_access=cliente-token').expect(403);
  });

  it('200 para ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/categories').set('Cookie', 'sb_access=admin-token').expect(200);
    expect(res.body).toEqual({ categories: [] });
  });

  it('400 en body invalido', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories').set('Cookie', 'sb_access=admin-token')
      .send({ activa: true }).expect(400);
  });

  it('400 en rango de fechas invalido', async () => {
    await request(app.getHttpServer())
      .get('/admin/reports/sales?from=25-11-2026').set('Cookie', 'sb_access=admin-token')
      .expect(400);
  });

  afterAll(async () => app.close());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w apps/api test -- --runInBand admin.e2e`
Expected: FAIL con `Cannot find module '../src/admin/admin.controller'`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/admin/dto/category.dto.ts`:

```ts
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateCategoryDto {
  @IsString() @Length(1, 80) nombre: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @Length(1, 80) nombre?: string;
  @IsOptional() @IsBoolean() activa?: boolean;
}
```

`apps/api/src/admin/dto/product.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateProductDto {
  @Type(() => Number) @IsInt() idCategoria: number;
  @IsString() @Length(1, 120) nombre: string;
  @IsOptional() @IsString() descripcion?: string;
  @Type(() => Number) @IsNumber() @Min(0) precio: number;
  @IsOptional() @IsString() fotoUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsBoolean() disponibleHoy?: boolean;
}

export class UpdateProductDto {
  @IsOptional() @Type(() => Number) @IsInt() idCategoria?: number;
  @IsOptional() @IsString() @Length(1, 120) nombre?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precio?: number;
  @IsOptional() @IsString() fotoUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsBoolean() disponibleHoy?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
}

export class UpdateInventoryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsBoolean() disponibleHoy?: boolean;
}
```

`apps/api/src/admin/dto/report.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportRangeDto {
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
}

export class TopProductsDto extends ReportRangeDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class LowStockDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) threshold?: number;
}
```

`apps/api/src/admin/admin.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/guards/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminReportsService } from './admin-reports.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateProductDto, UpdateProductDto, UpdateInventoryDto } from './dto/product.dto';
import { LowStockDto, ReportRangeDto, TopProductsDto } from './dto/report.dto';

@Controller('admin')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private catalog: AdminCatalogService,
    private reports: AdminReportsService
  ) {}

  @Get('categories')
  async categories() { return { categories: await this.catalog.listCategories() }; }

  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto) {
    return { category: await this.catalog.createCategory(dto.nombre) };
  }

  @Patch('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return { category: await this.catalog.updateCategory(Number(id), dto) };
  }

  @Get('products')
  async products(
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    return { products: await this.catalog.listProducts(category, includeInactive === 'true') };
  }

  @Post('products')
  async createProduct(@Body() dto: CreateProductDto) {
    return { product: await this.catalog.createProduct(dto) };
  }

  @Patch('products/:id')
  async updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return { product: await this.catalog.updateProduct(Number(id), dto) };
  }

  @Get('inventory')
  async inventory(@Query('threshold') threshold?: string) {
    return { items: await this.catalog.listInventory(threshold ? Number(threshold) : 5) };
  }

  @Patch('inventory/:id')
  async updateInventory(@Param('id') id: string, @Body() dto: UpdateInventoryDto) {
    return { item: await this.catalog.updateInventory(Number(id), dto) };
  }

  @Get('reports/sales')
  async sales(@Query() query: ReportRangeDto) {
    return { rows: await this.reports.sales(query.from, query.to) };
  }

  @Get('reports/top-products')
  async topProducts(@Query() query: TopProductsDto) {
    return { rows: await this.reports.topProducts(query.from, query.to, query.limit) };
  }

  @Get('reports/orders-by-status')
  async byStatus(@Query() query: ReportRangeDto) {
    return { rows: await this.reports.ordersByStatus(query.from, query.to) };
  }

  @Get('reports/low-stock')
  async lowStock(@Query() query: LowStockDto) {
    return { rows: await this.reports.lowStock(query.threshold) };
  }
}
```

`apps/api/src/admin/admin.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminController } from './admin.controller';
import { AdminReportsService } from './admin-reports.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminCatalogService, AdminReportsService, RolesGuard]
})
export class AdminModule {}
```

En `apps/api/src/app.module.ts`, agregar el import y registrar el módulo:

```ts
import { AdminModule } from './admin/admin.module';
```

y dejar el array así:

```ts
imports: [DatabaseModule, AuthModule, ProductsModule, CartModule, OrdersModule, AdminModule]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w apps/api test -- --runInBand admin.e2e`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin apps/api/src/app.module.ts apps/api/test/admin.e2e.spec.ts
git commit -m "feat: endpoints /admin protegidos por rol con validacion"
```

---

### Task 5: Script para crear el primer ADMIN y documentación

**Files:**
- Create: `scripts/create-admin.mjs`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` del entorno; tablas `rol` y `usuario`.
- Produces: usuario con `rol = 'ADMIN'`, idempotente; instrucciones en README.

- [ ] **Step 1: Write the failing verification**

No hay test unitario del script (es `.mjs` fuera de los roots de Jest). La verificación es de comportamiento:

```bash
$env:ADMIN_EMAIL = 'admin@ejemplo.test'
$env:ADMIN_PASSWORD = 'AdminSecret123'
node --env-file=.env scripts/create-admin.mjs
```

Expected antes del script: **falla** con `Cannot find module` / archivo inexistente.

- [ ] **Step 2: Run verification to confirm it fails**

Run el comando del Step 1.
Expected: FAIL porque `scripts/create-admin.mjs` no existe.

- [ ] **Step 3: Write minimal implementation**

`scripts/create-admin.mjs`:

```js
import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error('Definí ADMIN_EMAIL y ADMIN_PASSWORD en el entorno');
}
if (password.length < 8) throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
await client.connect();
try {
  const role = await client.query("SELECT id_rol FROM rol WHERE nombre = 'ADMIN'");
  if (!role.rowCount) throw new Error('Falta el rol ADMIN en la BD');

  const existing = await client.query(
    'SELECT id_usuario FROM usuario WHERE lower(correo) = lower($1)', [email]
  );
  if (existing.rowCount) {
    await client.query('UPDATE usuario SET id_rol = $2, activo = TRUE WHERE id_usuario = $1', [
      existing.rows[0].id_usuario, role.rows[0].id_rol
    ]);
    console.log(`ADMIN actualizado: ${email}`);
  } else {
    const hash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO usuario (id_rol, nombre, celular, correo, password_hash, activo)
       VALUES ($1,'Administrador',NULL,$2,$3,TRUE)`,
      [role.rows[0].id_rol, email, hash]
    );
    console.log(`ADMIN creado: ${email}`);
  }
} finally {
  await client.end();
}
```

En `.env.example`, agregar al final:

```text
# Opcional: credenciales para scripts/create-admin.mjs (no versionar valores reales).
# ADMIN_EMAIL=
# ADMIN_PASSWORD=
# Umbral de stock bajo para reportes (default 5).
LOW_STOCK_THRESHOLD=5
```

En `README.md`, agregar bajo "Arranque":

```text
### Crear el primer administrador

Con `ADMIN_EMAIL` y `ADMIN_PASSWORD` definidos en `.env`:

node --env-file=.env scripts/create-admin.mjs

El script es idempotente: si el correo ya existe, lo promueve a ADMIN. Después iniciá sesión con ese correo y vas a ver el enlace "Administración" en la navegación.
```

- [ ] **Step 4: Run verification to confirm it passes**

Run otra vez el comando del Step 1 (mismo correo) y comprobar que diga `ADMIN actualizado` en vez de crear otro usuario. Después verificar por API:

```bash
curl -i -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@ejemplo.test","password":"AdminSecret123","remember":true}' \
  http://localhost:3001/auth/login
```

Expected: HTTP 201 con `"role":"ADMIN"` y luego `GET /admin/categories` con esa cookie devuelve 200.

- [ ] **Step 5: Commit**

```bash
git add scripts/create-admin.mjs .env.example README.md
git commit -m "feat: script idempotente para crear el primer usuario ADMIN"
```

---

### Task 6: Panel web `/admin`

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/components/AuthNav.tsx`
- Modify: `apps/web/src/components/AuthNav.test.tsx`
- Create: `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/app/admin/layout.test.tsx`
- Create: `apps/web/src/app/admin/page.tsx`
- Create: `apps/web/src/app/admin/products/page.tsx`
- Create: `apps/web/src/app/admin/categories/page.tsx`
- Create: `apps/web/src/app/admin/inventory/page.tsx`
- Create: `apps/web/src/app/admin/reports/page.tsx`

**Interfaces:**
- Consumes: `api<T>(path, init)` de `../lib/api`; tipos `User`, `Role`; endpoints de la Task 4.
- Produces: panel `/admin` con cuatro secciones; link condicional en `AuthNav`.

- [ ] **Step 1: Write the failing test**

Agregar a `apps/web/src/components/AuthNav.test.tsx`:

```tsx
it('muestra Administración solo para ADMIN', async () => {
  (api as jest.Mock).mockResolvedValueOnce({ ...user, role: 'ADMIN' });
  render(<AuthNav />);
  expect(await screen.findByRole('link', { name: 'Administración' })).toBeInTheDocument();
});
```

`apps/web/src/app/admin/layout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import AdminLayout from './layout';
import { api } from '../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../lib/api', () => ({ api: jest.fn() }));

describe('AdminLayout', () => {
  beforeEach(() => jest.resetAllMocks());

  it('muestra sin permiso a CLIENTE', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ role: 'CLIENTE' });
    render(<AdminLayout><div>secreto</div></AdminLayout>);
    expect(await screen.findByText('Sin permiso')).toBeInTheDocument();
    expect(screen.queryByText('secreto')).not.toBeInTheDocument();
  });

  it('muestra el contenido a ADMIN', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ role: 'ADMIN' });
    render(<AdminLayout><div>secreto</div></AdminLayout>);
    expect(await screen.findByText('secreto')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w apps/web test -- --runInBand AuthNav admin/layout`
Expected: FAIL con `Cannot find module './layout'`.

- [ ] **Step 3: Write minimal implementation**

En `apps/web/src/lib/types.ts`, agregar:

```ts
export interface AdminCategory {
  id: string; nombre: string; activa: boolean; productCount: number;
}
export interface AdminProduct {
  id: string; idCategoria: string; categoria: string; nombre: string;
  precio: string; fotoUrl: string | null; activo: boolean;
  stock: number; disponibleHoy: boolean;
}
export interface AdminInventoryItem {
  id: string; productId: string; nombre: string;
  stock: number; disponibleHoy: boolean; lowStock: boolean;
}
export interface ReportRow { [key: string]: string | number; }
```

En `apps/web/src/components/AuthNav.tsx`, dentro del `user ? (...)`:

```tsx
      {user.role === 'ADMIN' && <a href="/admin">Administración</a>}
```

`apps/web/src/app/admin/layout.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { User } from '../../lib/types';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    api<User>('/auth/me').then((user) => setRole(user.role)).catch(() => setRole('INVITADO'));
  }, []);

  if (role === null) return <main><p>Cargando…</p></main>;
  if (role !== 'ADMIN') {
    return (
      <main>
        <h1>Sin permiso</h1>
        <p>Esta sección es solo para administradores.</p>
        <p><a href="/menu">Volver al menú</a></p>
      </main>
    );
  }

  return (
    <main>
      <nav className="admin-nav">
        <a href="/admin">Panel</a>
        <a href="/admin/products">Productos</a>
        <a href="/admin/categories">Categorías</a>
        <a href="/admin/inventory">Inventario</a>
        <a href="/admin/reports">Reportes</a>
      </nav>
      {children}
    </main>
  );
}
```

`apps/web/src/app/admin/page.tsx`:

```tsx
export default function AdminHome() {
  return (
    <section>
      <h1>Administración</h1>
      <ul>
        <li><a href="/admin/products">Productos</a></li>
        <li><a href="/admin/categories">Categorías</a></li>
        <li><a href="/admin/inventory">Inventario</a></li>
        <li><a href="/admin/reports">Reportes</a></li>
      </ul>
    </section>
  );
}
```

`apps/web/src/app/admin/products/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminCategory, AdminProduct } from '../../../lib/types';

const empty = { idCategoria: '', nombre: '', precio: '', stock: '' };

export default function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    api<{ products: AdminProduct[] }>('/admin/products?includeInactive=true')
      .then((r) => setProducts(r.products)).catch(() => setProducts([]));
    api<{ categories: AdminCategory[] }>('/admin/categories')
      .then((r) => setCategories(r.categories)).catch(() => setCategories([]));
  };
  useEffect(load, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const body = {
      idCategoria: Number(form.idCategoria), nombre: form.nombre,
      precio: Number(form.precio), stock: Number(form.stock || 0)
    };
    try {
      if (editing) await api(`/admin/products/${editing}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/admin/products', { method: 'POST', body: JSON.stringify(body) });
      setForm(empty); setEditing(null); load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  const deactivate = async (product: AdminProduct) => {
    await api(`/admin/products/${product.id}`, {
      method: 'PATCH', body: JSON.stringify({ activo: false, disponibleHoy: false })
    });
    load();
  };

  return (
    <section>
      <h1>Productos</h1>
      <form onSubmit={submit}>
        <label>Categoría
          <select value={form.idCategoria} onChange={(e) => setForm({ ...form, idCategoria: e.target.value })} required>
            <option value="">Elegí una categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
        <label>Precio Bs<input type="number" min="0" step="0.01" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} required /></label>
        <label>Stock<input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label>
        <button type="submit">{editing ? 'Guardar cambios' : 'Crear producto'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.nombre}</td><td>{p.categoria}</td><td>Bs {p.precio}</td>
              <td>{p.stock}</td><td>{p.activo ? (p.disponibleHoy ? 'Disponible' : 'Sin stock del día') : 'Inactivo'}</td>
              <td>
                <button onClick={() => { setEditing(p.id); setForm({ idCategoria: p.idCategoria, nombre: p.nombre, precio: p.precio, stock: String(p.stock) }); }}>Editar</button>
                {p.activo && <button onClick={() => deactivate(p)}>Desactivar</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

`apps/web/src/app/admin/categories/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminCategory } from '../../../lib/types';

export default function AdminCategories() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api<{ categories: AdminCategory[] }>('/admin/categories')
      .then((r) => setCategories(r.categories)).catch(() => setCategories([]));
  };
  useEffect(load, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try {
      await api('/admin/categories', { method: 'POST', body: JSON.stringify({ nombre }) });
      setNombre(''); load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear'); }
  };

  const toggle = async (category: AdminCategory) => {
    await api(`/admin/categories/${category.id}`, {
      method: 'PATCH', body: JSON.stringify({ activa: !category.activa })
    });
    load();
  };

  return (
    <section>
      <h1>Categorías</h1>
      <form onSubmit={submit}>
        <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label>
        <button type="submit">Crear categoría</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul>
        {categories.map((c) => (
          <li key={c.id}>
            {c.nombre} — {c.productCount} productos — {c.activa ? 'Activa' : 'Inactiva'}
            <button onClick={() => toggle(c)}>{c.activa ? 'Desactivar' : 'Activar'}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`apps/web/src/app/admin/inventory/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { AdminInventoryItem } from '../../../lib/types';

export default function AdminInventory() {
  const [items, setItems] = useState<AdminInventoryItem[]>([]);

  const load = () => {
    api<{ items: AdminInventoryItem[] }>('/admin/inventory')
      .then((r) => setItems(r.items)).catch(() => setItems([]));
  };
  useEffect(load, []);

  const changeStock = async (item: AdminInventoryItem, stock: number) => {
    if (stock < 0) return;
    await api(`/admin/inventory/${item.id}`, { method: 'PATCH', body: JSON.stringify({ stock }) });
    load();
  };

  const toggle = async (item: AdminInventoryItem) => {
    await api(`/admin/inventory/${item.id}`, {
      method: 'PATCH', body: JSON.stringify({ disponibleHoy: !item.disponibleHoy })
    });
    load();
  };

  return (
    <section>
      <h1>Inventario</h1>
      <table>
        <thead><tr><th>Producto</th><th>Stock</th><th>Disponible hoy</th><th></th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={item.lowStock ? 'low-stock' : undefined}>
              <td>{item.nombre}</td>
              <td>
                <input aria-label={`Stock de ${item.nombre}`} type="number" min="0"
                  value={item.stock} onChange={(e) => changeStock(item, Number(e.target.value))} />
              </td>
              <td>{item.disponibleHoy ? 'Sí' : 'No'}</td>
              <td><button onClick={() => toggle(item)}>
                {item.disponibleHoy ? 'Marcar agotado' : 'Marcar disponible'}
              </button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.some((i) => i.lowStock) && <p role="status">Hay productos con stock bajo.</p>}
    </section>
  );
}
```

`apps/web/src/app/admin/reports/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { ReportRow } from '../../../lib/types';

export default function AdminReports() {
  const [sales, setSales] = useState<ReportRow[]>([]);
  const [top, setTop] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState<ReportRow[]>([]);
  const [low, setLow] = useState<ReportRow[]>([]);

  useEffect(() => {
    api<{ rows: ReportRow[] }>('/admin/reports/sales').then((r) => setSales(r.rows)).catch(() => {});
    api<{ rows: ReportRow[] }>('/admin/reports/top-products').then((r) => setTop(r.rows)).catch(() => {});
    api<{ rows: ReportRow[] }>('/admin/reports/orders-by-status').then((r) => setStatus(r.rows)).catch(() => {});
    api<{ rows: ReportRow[] }>('/admin/reports/low-stock').then((r) => setLow(r.rows)).catch(() => {});
  }, []);

  function table(title: string, rows: ReportRow[]) {
    const keys = rows.length ? Object.keys(rows[0]) : [];
    return (
      <section key={title}>
        <h2>{title}</h2>
        <table>
          <thead><tr>{keys.map((k) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => (
            <tr key={i}>{keys.map((k) => <td key={k}>{String(row[k])}</td>)}</tr>
          ))}</tbody>
        </table>
      </section>
    );
  }

  return (
    <section>
      <h1>Reportes</h1>
      {table('Ventas por día', sales)}
      {table('Productos más vendidos', top)}
      {table('Pedidos por estado', status)}
      {table('Stock bajo', low)}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm -w apps/web test -- --runInBand`
Expected: PASS (24 tests: los 22原有 + 2 nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/components/AuthNav.tsx apps/web/src/components/AuthNav.test.tsx apps/web/src/app/admin
git commit -m "feat: panel web de administracion con catalogo, inventario y reportes"
```

---

### Task 7: E2E del panel y regresión completa

**Files:**
- Create: `apps/web/e2e/admin.spec.ts`
- Modify: `apps/web/playwright.config.ts` (solo si hace falta un proyecto ADMIN; no es necesario)
- Modify: `README.md` (nota del E2E admin)

**Interfaces:**
- Consumes: `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` del entorno; app corriendo en `:3000` y `:3001`.
- Produces: verificación del flujo administrativo en navegador.

- [ ] **Step 1: Write the failing test**

`apps/web/e2e/admin.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';

test('admin crea y desactiva un producto', async ({ page }) => {
  test.skip(!email || !password, 'Requiere E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD');
  const suffix = Date.now().toString().slice(-6);

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/menu/);
  await page.waitForLoadState('networkidle');

  await page.goto('/admin/products', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Categoría' }).selectOption({ index: 1 });
  await page.getByLabel('Nombre').fill(`Prueba ${suffix}`);
  await page.getByLabel('Precio Bs').fill('9.50');
  await page.getByLabel('Stock').fill('3');
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page.getByText(`Prueba ${suffix}`)).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: `Prueba ${suffix}` });
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await expect(row.getByText('Inactivo')).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Con admin creado y app corriendo:

```powershell
$env:E2E_ADMIN_EMAIL = 'admin@ejemplo.test'
$env:E2E_ADMIN_PASSWORD = 'AdminSecret123'
$env:E2E_FIXED_NOW = '2026-11-25T14:00:00.000Z'
npm -w apps/web run e2e -- admin.spec.ts
```

Expected antes de crear el spec: FAIL con `No tests found`. Después de crear el spec, si no hay credenciales: `1 skipped`.

- [ ] **Step 3: Write minimal implementation**

El spec del Step 1 es la implementación. Si el flujo falla por hidratación, agregar `await page.waitForLoadState('networkidle')` después de cada navegación, igual que en `checkout.spec.ts`.

En `README.md`, bajo la sección de E2E, agregar:

```text
El spec `admin.spec.ts` requiere `E2E_ADMIN_EMAIL` y `E2E_ADMIN_PASSWORD` (credenciales creadas con `scripts/create-admin.mjs`). Si no están definidas, se omite.
```

- [ ] **Step 4: Run full regression**

```bash
npm -w apps/api test -- --runInBand
npm -w apps/web test -- --runInBand
npm -w apps/api run build
npm -w apps/web run build
node scripts/verify-schema.mjs
node --env-file=.env scripts/verify-db.mjs
```

Expected: API 43/43 (23 existentes + 20 nuevos: 5 guard + 6 catálogo + 4 reportes + 5 E2E HTTP), Web 24/24 (22 existentes + 2 nuevos), builds exit 0, `SCHEMA OK`, `DB OK`. E2E: 3 del flujo cliente + 1 admin (o skipped si no hay credenciales).

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/admin.spec.ts README.md
git commit -m "test: e2e del panel de administracion y regresión completa"
```

---

## Self-Review

1. **Spec coverage:** guard (Task 1), catálogo (Task 2), reportes (Task 3), endpoints y validación (Task 4), script ADMIN (Task 5), UI (Task 6), tests y E2E (Task 7). Sin huecos.
2. **Placeholders:** ningún `TBD`/`TODO`; todos los pasos de código incluyen el contenido.
3. **Type consistency:** las respuestas de `AdminCatalogService` (`idCategoria` incluido) coinciden con `AdminProduct` en Web; `rows` de reportes usa claves `productId` y `totalBs` en SQL y `ReportRow` en Web.
4. **Review Focus:** CLIENTE→403 cubierto en Task 4; inactivo→401 en Task 1 vía `me()`; duplicados en Task 2; stock/fechas inválidos en Tasks 2, 3 y 4; baja lógica sin borrado físico en Task 2 y se comprueba en Task 7.
