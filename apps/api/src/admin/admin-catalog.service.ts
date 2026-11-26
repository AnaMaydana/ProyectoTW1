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
    if (!result.rows.length) throw new NotFoundException('Producto no encontrado');
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

  async updateCategory(id: string | number, dto: { nombre?: string; activa?: boolean }): Promise<AdminCategory> {
    const categoryId = Number(id);
    const current = await this.db.query<CategoryRow>(
      'SELECT id_categoria, nombre, activa FROM categoria WHERE id_categoria = $1', [categoryId]
    );
    if (!current.rowCount) throw new NotFoundException('Categoría no encontrada');
    if (dto.nombre && dto.nombre !== current.rows[0].nombre) {
      await this.ensureUnique('categoria', dto.nombre, categoryId);
    }
    await this.db.query(
      `UPDATE categoria SET nombre = COALESCE($2, nombre), activa = COALESCE($3, activa)
       WHERE id_categoria = $1`,
      [categoryId, dto.nombre ?? null, dto.activa ?? null]
    );
    return (await this.listCategories()).find((c) => c.id === String(categoryId))!;
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

  async updateProduct(id: string | number, dto: UpdateProductDtoShape): Promise<AdminProduct> {
    const productId = Number(id);
    const current = await this.db.query<{ nombre: string }>(
      'SELECT nombre FROM producto WHERE id_producto = $1', [productId]
    );
    if (!current.rowCount) throw new NotFoundException('Producto no encontrado');
    if (dto.nombre && dto.nombre !== current.rows[0].nombre) {
      await this.ensureUnique('producto', dto.nombre, productId);
    }

    await this.db.query(
      `UPDATE producto SET
         id_categoria = COALESCE($2, id_categoria), nombre = COALESCE($3, nombre),
         descripcion = COALESCE($4, descripcion), precio = COALESCE($5, precio),
         foto_url = COALESCE($6, foto_url), activo = COALESCE($7, activo)
       WHERE id_producto = $1`,
      [productId, dto.idCategoria ?? null, dto.nombre ?? null, dto.descripcion ?? null,
       dto.precio === undefined ? null : dto.precio.toFixed(2), dto.fotoUrl ?? null, dto.activo ?? null]
    );

    if (dto.stock !== undefined) {
      if (dto.stock < 0) throw new BadRequestException('stock no puede ser negativo');
      await this.db.query('UPDATE inventario SET stock = $2 WHERE id_producto = $1', [productId, dto.stock]);
    }
    if (dto.disponibleHoy !== undefined || dto.activo === false) {
      const value = dto.activo === false ? false : dto.disponibleHoy;
      await this.db.query('UPDATE inventario SET disponible_hoy = $2 WHERE id_producto = $1', [productId, value]);
    }
    return this.oneProduct(productId);
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

  async updateInventory(id: string | number, dto: { stock?: number; disponibleHoy?: boolean }): Promise<AdminInventoryItem> {
    const inventoryId = Number(id);
    if (dto.stock !== undefined && dto.stock < 0) {
      throw new BadRequestException('stock no puede ser negativo');
    }
    const exists = await this.db.query('SELECT 1 FROM inventario WHERE id_inventario = $1', [inventoryId]);
    if (!exists.rowCount) throw new NotFoundException('Inventario no encontrado');
    await this.db.query(
      `UPDATE inventario SET stock = COALESCE($2, stock),
         disponible_hoy = COALESCE($3, disponible_hoy) WHERE id_inventario = $1`,
      [inventoryId, dto.stock ?? null, dto.disponibleHoy ?? null]
    );
    const all = await this.listInventory();
    return all.find((item) => item.id === String(inventoryId))!;
  }
}
