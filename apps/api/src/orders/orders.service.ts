import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CartService } from '../cart/cart.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { buildExpiry, businessNow } from './expiry';

interface OrderItemRow {
  id_producto: number;
  cantidad: number;
  precio: string;
  nombre: string;
  activo: boolean;
  disponible_hoy: boolean;
}

function localDate(now: Date = businessNow()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

@Injectable()
export class OrdersService {
  constructor(private db: DatabaseService, private cart: CartService) {}

  async create(
    userId: string | null,
    cartToken: string,
    dto: CreateOrderDto,
    customer: { name: string; phone: string }
  ) {
    if (!userId && (!customer.name?.trim() || !customer.phone?.trim())) {
      throw new BadRequestException('Nombre y celular son obligatorios');
    }
    const current = await this.cart.getCart(cartToken);
    if (current.items.length === 0) throw new BadRequestException('Carrito vacío');

    const { expiresAt } = buildExpiry();
    const date = localDate();
    const pickup = `${date}T${dto.pickupTime}:00`;

    const orderId = await this.db.transaction(async (client) => {
      const cart = await client.query<{ id_carrito: number }>(
        'SELECT id_carrito FROM carrito WHERE token = $1 FOR UPDATE',
        [cartToken]
      );
      if (!cart.rowCount) throw new BadRequestException('Carrito no encontrado');
      const idCarrito = cart.rows[0].id_carrito;

      const items = await client.query<OrderItemRow>(
        `SELECT cd.id_producto, cd.cantidad, p.precio, p.nombre, p.activo,
                COALESCE(i.disponible_hoy, FALSE) AS disponible_hoy
         FROM carrito_detalle cd
         JOIN producto p ON p.id_producto = cd.id_producto
         LEFT JOIN inventario i ON i.id_producto = p.id_producto
         WHERE cd.id_carrito = $1`,
        [idCarrito]
      );
      if (!items.rowCount) throw new BadRequestException('Carrito vacío');
      if (items.rows.some((item) => !item.activo || !item.disponible_hoy)) {
        throw new ConflictException('Algún producto se agotó');
      }

      const total = items.rows.reduce(
        (sum, item) => sum + Number(item.precio) * item.cantidad,
        0
      );

      await client.query("SELECT pg_advisory_xact_lock(hashtext('saltenanga_order_code'))");
      const dayCode = date.replace(/-/g, '');
      const sequence = await client.query<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM pedido WHERE codigo LIKE $1',
        [`SAL-${dayCode}-%`]
      );
      const code = `SAL-${dayCode}-${String(sequence.rows[0].n + 1).padStart(4, '0')}`;

      const method = await client.query<{ id_metodo_pago: number }>(
        'SELECT id_metodo_pago FROM metodo_pago WHERE nombre = $1',
        [dto.paymentMethod]
      );
      if (!method.rowCount) throw new BadRequestException('Método de pago inválido');

      const inserted = await client.query<{ id_pedido: number }>(
        `INSERT INTO pedido
           (codigo, id_usuario, cliente_nombre, cliente_celular, fecha_hora_recojo,
            observaciones, total, estado, fecha_creacion, fecha_confirmacion, fecha_expiracion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDIENTE',NOW(),NOW(),$8)
         RETURNING id_pedido`,
        [
          code,
          userId ? Number(userId) : null,
          customer.name,
          customer.phone,
          pickup,
          dto.notes ?? null,
          total.toFixed(2),
          expiresAt
        ]
      );
      const idPedido = inserted.rows[0].id_pedido;

      for (const item of items.rows) {
        await client.query(
          `INSERT INTO detalle_pedido
             (id_pedido, id_producto, cantidad, precio_unitario, subtotal)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            idPedido,
            item.id_producto,
            item.cantidad,
            Number(item.precio).toFixed(2),
            (Number(item.precio) * item.cantidad).toFixed(2)
          ]
        );
      }

      await client.query(
        `INSERT INTO pago (id_pedido, id_metodo_pago, monto, estado)
         VALUES ($1,$2,$3,'PENDIENTE')`,
        [idPedido, method.rows[0].id_metodo_pago, total.toFixed(2)]
      );
      await client.query('DELETE FROM carrito_detalle WHERE id_carrito = $1', [idCarrito]);
      return idPedido;
    });

    return this.findOne(String(orderId));
  }

  async findOne(id: string) {
    const result = await this.db.query<any>(
      `SELECT p.id_pedido, p.codigo, p.total, p.estado, p.observaciones,
              to_char(p.fecha_hora_recojo, 'HH24:MI') AS pickup_time,
              p.fecha_expiracion, p.fecha_creacion,
              mp.nombre AS payment_method,
              c.numero AS comprobante_numero,
              to_char(c.fecha_emision, 'YYYY-MM-DD"T"HH24:MI:SS') AS comprobante_fecha,
              d.id_producto, d.cantidad, d.precio_unitario, pr.nombre AS product_name
       FROM pedido p
       LEFT JOIN pago pg ON pg.id_pedido = p.id_pedido
       LEFT JOIN metodo_pago mp ON mp.id_metodo_pago = pg.id_metodo_pago
       LEFT JOIN comprobante c ON c.id_pedido = p.id_pedido
       LEFT JOIN detalle_pedido d ON d.id_pedido = p.id_pedido
       LEFT JOIN producto pr ON pr.id_producto = d.id_producto
       WHERE p.id_pedido = $1`,
      [Number(id)]
    );
    if (!result.rowCount) throw new NotFoundException('Pedido no encontrado');

    const first = result.rows[0];
    return {
      id: String(first.id_pedido),
      code: first.codigo,
      totalBs: Number(first.total).toFixed(2),
      status: first.estado,
      pickupTime: first.pickup_time,
      notes: first.observaciones,
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

  async list(userId: string) {
    const result = await this.db.query<any>(
      `SELECT p.id_pedido, p.codigo, p.total, p.estado,
              to_char(p.fecha_hora_recojo, 'HH24:MI') AS pickup_time,
              mp.nombre AS payment_method, p.fecha_expiracion, p.fecha_creacion,
              c.numero AS comprobante_numero,
              to_char(c.fecha_emision, 'YYYY-MM-DD"T"HH24:MI:SS') AS comprobante_fecha
       FROM pedido p
       LEFT JOIN pago pg ON pg.id_pedido = p.id_pedido
       LEFT JOIN metodo_pago mp ON mp.id_metodo_pago = pg.id_metodo_pago
       LEFT JOIN comprobante c ON c.id_pedido = p.id_pedido
       WHERE p.id_usuario = $1
       ORDER BY p.fecha_creacion DESC`,
      [Number(userId)]
    );
    return result.rows.map((order) => ({
      id: String(order.id_pedido),
      code: order.codigo,
      totalBs: Number(order.total).toFixed(2),
      status: order.estado,
      pickupTime: order.pickup_time,
      paymentMethod: order.payment_method ?? 'EFECTIVO',
      expiresAt: order.fecha_expiracion,
      createdAt: order.fecha_creacion,
      comprobante: order.comprobante_numero
        ? { numero: order.comprobante_numero, fechaEmision: order.comprobante_fecha }
        : null
    }));
  }

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
      items: (row.items as Array<{ name: string; quantity: number; unitPriceBs: string }>).map(
        (item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPriceBs: Number(item.unitPriceBs).toFixed(2)
        })
      ),
      comprobante: row.comprobante_numero
        ? { numero: row.comprobante_numero, fechaEmision: row.comprobante_fecha }
        : null
    };
  }

  async repeat(userId: string, cartToken: string, orderId: string) {
    const owned = await this.db.query(
      'SELECT 1 FROM pedido WHERE id_pedido = $1 AND id_usuario = $2',
      [Number(orderId), Number(userId)]
    );
    if (!owned.rowCount) throw new NotFoundException('Pedido no encontrado');

    const items = await this.db.query<{
      id_producto: number;
      cantidad: number;
      nombre: string;
      activo: boolean;
      disponible_hoy: boolean;
    }>(
      `SELECT d.id_producto, d.cantidad, p.nombre, p.activo,
              COALESCE(i.disponible_hoy, FALSE) AS disponible_hoy
       FROM detalle_pedido d
       JOIN producto p ON p.id_producto = d.id_producto
       LEFT JOIN inventario i ON i.id_producto = p.id_producto
       WHERE d.id_pedido = $1`,
      [Number(orderId)]
    );
    const cart = await this.db.query<{ id_carrito: number }>(
      'SELECT id_carrito FROM carrito WHERE token = $1',
      [cartToken]
    );
    if (!cart.rowCount) throw new BadRequestException('Carrito no encontrado');

    const skipped: string[] = [];
    for (const item of items.rows) {
      if (!item.activo || !item.disponible_hoy) {
        skipped.push(item.nombre);
        continue;
      }
      await this.db.query(
        `INSERT INTO carrito_detalle (id_carrito, id_producto, cantidad)
         VALUES ($1,$2,$3)
         ON CONFLICT (id_carrito, id_producto) DO UPDATE SET cantidad = EXCLUDED.cantidad`,
        [cart.rows[0].id_carrito, item.id_producto, item.cantidad]
      );
    }
    return { cart: await this.cart.getCart(cartToken), skipped };
  }

  async cancel(userId: string, orderId: string) {
    const updated = await this.db.query(
      `UPDATE pedido
       SET estado = 'CANCELADO'
       WHERE id_pedido = $1 AND id_usuario = $2 AND estado = 'PENDIENTE'
         AND fecha_expiracion > NOW()
       RETURNING id_pedido`,
      [Number(orderId), Number(userId)]
    );
    if (!updated.rowCount) {
      throw new ConflictException('No se puede cancelar; llamá al local');
    }
    return this.findOne(orderId);
  }
}
