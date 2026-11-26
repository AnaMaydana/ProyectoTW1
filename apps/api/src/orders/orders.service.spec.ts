import { OrdersService } from './orders.service';
import { DatabaseService } from '../database/database.service';

const client = { query: jest.fn() };
const db = {
  query: jest.fn(),
  transaction: jest.fn((work: (c: typeof client) => Promise<unknown>) => work(client))
} as unknown as DatabaseService;

const cart = { getCart: jest.fn() } as any;
const service = new OrdersService(db, cart);

const dto = { pickupTime: '10:50', notes: undefined, paymentMethod: 'EFECTIVO' as const };
const customer = { name: 'Ana', phone: '70000000' };

const orderRow = {
  id_pedido: 9,
  codigo: 'SAL-20261124-0001',
  total: '24.00',
  estado: 'PENDIENTE',
  observaciones: null,
  pickup_time: '10:50',
  payment_method: 'EFECTIVO',
  fecha_expiracion: new Date('2026-11-24T15:00:00.000Z'),
  fecha_creacion: new Date('2026-11-24T14:50:00.000Z'),
  id_producto: 1,
  cantidad: 2,
  precio_unitario: '12.00',
  product_name: 'Carne'
};

describe('OrdersService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-24T14:50:00.000Z'));
    cart.getCart.mockResolvedValue({
      items: [{ productId: '1', quantity: 2, subtotalBs: '24.00' }],
      totalBs: '24.00'
    });
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id_carrito')) return { rowCount: 1, rows: [{ id_carrito: 1 }] };
      if (sql.includes('FROM carrito_detalle cd')) {
        return {
          rowCount: 1,
          rows: [{
            id_producto: 1, cantidad: 2, precio: '12.00', nombre: 'Carne',
            activo: true, disponible_hoy: true
          }]
        };
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 0, rows: [] };
      if (sql.includes('COUNT(*)::int AS n')) return { rowCount: 1, rows: [{ n: 0 }] };
      if (sql.includes('SELECT id_metodo_pago')) {
        return { rowCount: 1, rows: [{ id_metodo_pago: 1 }] };
      }
      if (sql.includes('INSERT INTO pedido')) {
        return { rowCount: 1, rows: [{ id_pedido: 9 }] };
      }
      return { rowCount: 1, rows: [] };
    });
    (db.query as jest.Mock).mockResolvedValue({ rowCount: 1, rows: [orderRow] });
  });

  afterEach(() => jest.useRealTimers());

  it('crea pedido con expiración a las 11:00 y código secuencial', async () => {
    const order = await service.create('1', 'token-1', dto, customer);

    expect(order.code).toBe('SAL-20261124-0001');
    expect(order.expiresAt).toEqual(new Date('2026-11-24T15:00:00.000Z'));
    expect(order.totalBs).toBe('24.00');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO detalle_pedido'),
      [9, 1, 2, '12.00', '24.00']
    );
  });

  it('rechaza carrito vacío', async () => {
    cart.getCart.mockResolvedValue({ items: [], totalBs: '0.00' });
    await expect(service.create('1', 'token-1', dto, customer)).rejects.toThrow('Carrito vacío');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rechaza pedido anónimo sin nombre o celular', async () => {
    await expect(service.create(null, 'token-1', dto, { name: '', phone: '' })).rejects.toThrow(
      'Nombre y celular son obligatorios'
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('no cancela pedido vencido o ya confirmado', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.cancel('1', '9')).rejects.toThrow('llamá al local');
  });

  it('repite pedido omitiendo productos agotados', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ 1: 1 }] })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { id_producto: 1, cantidad: 2, nombre: 'Carne', activo: true, disponible_hoy: true },
          { id_producto: 2, cantidad: 1, nombre: 'Queso', activo: true, disponible_hoy: false }
        ]
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_carrito: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const result = await service.repeat('1', 'token-1', '9');

    expect(result.skipped).toEqual(['Queso']);
    expect((db.query as jest.Mock).mock.calls[3][0]).toContain('ON CONFLICT');
  });

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
});
