import 'reflect-metadata';
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
