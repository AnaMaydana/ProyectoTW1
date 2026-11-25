import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Product {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  priceBs: string;
  imageUrl: string | null;
  availableToday: boolean;
}

interface ProductRow {
  id_producto: number;
  id_categoria: number;
  categoria: string;
  nombre: string;
  descripcion: string | null;
  precio: string;
  foto_url: string | null;
  disponible_hoy: boolean;
}

@Injectable()
export class ProductsService {
  constructor(private db: DatabaseService) {}

  async list(search?: string, category?: string): Promise<Product[]> {
    const where = ['p.activo = TRUE', 'c.activa = TRUE'];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`LOWER(p.nombre) LIKE LOWER($${params.length})`);
    }
    if (category) {
      params.push(category);
      const placeholder = `$${params.length}`;
      where.push(
        /^\d+$/.test(category)
          ? `c.id_categoria = ${placeholder}`
          : `LOWER(c.nombre) = LOWER(${placeholder})`
      );
    }

    const result = await this.db.query<ProductRow>(
      `SELECT p.id_producto, c.id_categoria, c.nombre AS categoria, p.nombre,
              p.descripcion, p.precio, p.foto_url,
              COALESCE(i.disponible_hoy, FALSE) AS disponible_hoy
       FROM producto p
       JOIN categoria c ON c.id_categoria = p.id_categoria
       LEFT JOIN inventario i ON i.id_producto = p.id_producto
       WHERE ${where.join(' AND ')}
       ORDER BY p.nombre`,
      params
    );

    return result.rows.map((row) => ({
      id: String(row.id_producto),
      categoryId: String(row.id_categoria),
      categoryName: row.categoria,
      name: row.nombre,
      description: row.descripcion ?? '',
      priceBs: Number(row.precio).toFixed(2),
      imageUrl: row.foto_url,
      availableToday: row.disponible_hoy
    }));
  }
}
