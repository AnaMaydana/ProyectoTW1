import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException
} from '@nestjs/common';
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
}
