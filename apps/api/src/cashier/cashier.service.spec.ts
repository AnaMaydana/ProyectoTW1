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
