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
