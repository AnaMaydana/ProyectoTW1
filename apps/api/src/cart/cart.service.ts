import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';

export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceBs: string;
  subtotalBs: string;
}

export interface Cart {
  items: CartItem[];
  totalBs: string;
}

@Injectable()
export class CartService {
  constructor(private db: DatabaseService) {}

  async getOrCreate(token?: string, userId?: string | null): Promise<string> {
    if (token) {
      const found = await this.db.query<{ token: string }>(
        'SELECT token FROM carrito WHERE token = $1',
        [token]
      );
      if (found.rowCount) return found.rows[0].token;
    }
    const created = await this.db.query<{ token: string }>(
      `INSERT INTO carrito (token, id_usuario)
       VALUES ($1, $2)
       RETURNING token`,
      [randomUUID(), userId ? Number(userId) : null]
    );
    return created.rows[0].token;
  }

  private async cartId(token: string): Promise<number> {
    const result = await this.db.query<{ id_carrito: number }>(
      'SELECT id_carrito FROM carrito WHERE token = $1',
      [token]
    );
    if (!result.rowCount) throw new BadRequestException('Carrito no encontrado');
    return result.rows[0].id_carrito;
  }

  async getCart(token: string): Promise<Cart> {
    const result = await this.db.query<{
      id_producto: number;
      nombre: string;
      cantidad: number;
      precio: string;
    }>(
      `SELECT cd.id_producto, p.nombre, cd.cantidad, p.precio
       FROM carrito_detalle cd
       JOIN carrito c ON c.id_carrito = cd.id_carrito
       JOIN producto p ON p.id_producto = cd.id_producto
       WHERE c.token = $1 AND p.activo = TRUE
       ORDER BY p.nombre`,
      [token]
    );

    const items: CartItem[] = result.rows.map((row) => {
      const unit = Number(row.precio).toFixed(2);
      return {
        productId: String(row.id_producto),
        name: row.nombre,
        quantity: row.cantidad,
        unitPriceBs: unit,
        subtotalBs: (Number(unit) * row.cantidad).toFixed(2)
      };
    });
    const total = items.reduce((sum, item) => sum + Number(item.subtotalBs), 0);
    return { items, totalBs: total.toFixed(2) };
  }

  async addItem(token: string, productId: string, quantity: number): Promise<Cart> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Cantidad inválida');
    }
    if (!/^\d+$/.test(productId)) throw new BadRequestException('Producto inválido');

    const product = await this.db.query<{ activo: boolean; disponible_hoy: boolean }>(
      `SELECT p.activo, COALESCE(i.disponible_hoy, FALSE) AS disponible_hoy
       FROM producto p LEFT JOIN inventario i ON i.id_producto = p.id_producto
       WHERE p.id_producto = $1`,
      [Number(productId)]
    );
    if (!product.rowCount || !product.rows[0].activo || !product.rows[0].disponible_hoy) {
      throw new ConflictException('Producto agotado hoy');
    }

    const id = await this.cartId(token);
    await this.db.query(
      `INSERT INTO carrito_detalle (id_carrito, id_producto, cantidad)
       VALUES ($1, $2, $3)
       ON CONFLICT (id_carrito, id_producto) DO UPDATE SET cantidad = EXCLUDED.cantidad`,
      [id, Number(productId), quantity]
    );
    await this.db.query(
      'UPDATE carrito SET fecha_actualizacion = NOW() WHERE id_carrito = $1',
      [id]
    );
    return this.getCart(token);
  }

  async removeItem(token: string, productId: string): Promise<Cart> {
    const id = await this.cartId(token);
    await this.db.query(
      'DELETE FROM carrito_detalle WHERE id_carrito = $1 AND id_producto = $2',
      [id, Number(productId)]
    );
    await this.db.query(
      'UPDATE carrito SET fecha_actualizacion = NOW() WHERE id_carrito = $1',
      [id]
    );
    return this.getCart(token);
  }

  async clear(token: string) {
    const id = await this.cartId(token);
    await this.db.query('DELETE FROM carrito_detalle WHERE id_carrito = $1', [id]);
  }

  async attachUser(token: string, userId: string) {
    await this.db.query(
      'UPDATE carrito SET id_usuario = $1, fecha_actualizacion = NOW() WHERE token = $2',
      [Number(userId), token]
    );
  }
}
