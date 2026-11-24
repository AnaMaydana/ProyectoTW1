import { OrdersService } from './orders.service';

const sb = { admin: { rpc: jest.fn(), from: jest.fn() } } as any;
const cart = {
  getCart: jest.fn().mockResolvedValue({ items: [{ productId: 'p1', quantity: 2 }], totalBs: '24.00' })
} as any;
const service = new OrdersService(sb, cart);

function mockChain(result: any) {
  const chain: any = {};
  for (const method of ['select', 'eq', 'gt', 'in', 'update', 'insert', 'delete', 'upsert', 'order']) {
    chain[method] = jest.fn(() => chain);
  }
  chain.single = jest.fn(() => Promise.resolve(result));
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

const orderRow = {
  id: 'o1',
  code: 'SAL-20261124-0001',
  total_bs: '24.00',
  status: 'PENDIENTE',
  pickup_time: '10:50',
  notes: null,
  payment_method: 'EFECTIVO',
  expires_at: '2026-11-24T15:00:00.000Z',
  created_at: '2026-11-24T14:50:00.000Z',
  order_items: []
};

const dto = { pickupTime: '10:50', notes: undefined, paymentMethod: 'EFECTIVO' as const };
const customer = { name: 'Ana', phone: '70000000' };

describe('OrdersService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-24T14:50:00.000Z'));
    cart.getCart.mockResolvedValue({ items: [{ productId: 'p1', quantity: 2 }], totalBs: '24.00' });
  });

  afterEach(() => jest.useRealTimers());

  it('crea pedido con expires_at calculado y código', async () => {
    sb.admin.rpc.mockResolvedValue({ data: 'o1', error: null });
    sb.admin.from.mockReturnValue(mockChain({ data: orderRow, error: null }));

    const order = await service.create('u1', 'cart1', dto, customer);

    expect(sb.admin.rpc).toHaveBeenCalledWith(
      'create_order_from_cart',
      expect.objectContaining({ p_expires_at: expect.any(Date), p_customer_name: 'Ana' })
    );
    expect(order.code).toBe('SAL-20261124-0001');
  });

  it('rechaza carrito vacío', async () => {
    cart.getCart.mockResolvedValue({ items: [], totalBs: '0.00' });
    await expect(service.create('u1', 'cart1', dto, customer)).rejects.toThrow('Carrito vacío');
    expect(sb.admin.rpc).not.toHaveBeenCalled();
  });

  it('rechaza pedido anónimo sin nombre o celular', async () => {
    await expect(
      service.create(null, 'cart1', dto, { name: '', phone: '' })
    ).rejects.toThrow('Nombre y celular son obligatorios');
    expect(sb.admin.rpc).not.toHaveBeenCalled();
  });

  it('no cancela pedido vencido o ya confirmado', async () => {
    sb.admin.from.mockReturnValue(mockChain({ data: null, error: { message: 'no rows' } }));
    await expect(service.cancel('u1', 'o1')).rejects.toThrow('llamá al local');
  });

  it('repite pedido omitiendo productos agotados', async () => {
    sb.admin.from
      .mockReturnValueOnce(mockChain({ data: { id: 'o1' }, error: null }))
      .mockReturnValueOnce(mockChain({
        data: [{ product_id: 'p1', quantity: 2 }, { product_id: 'p2', quantity: 1 }],
        error: null
      }))
      .mockReturnValueOnce(mockChain({
        data: [
          { id: 'p1', name: 'Carne', active: true, available_today: true },
          { id: 'p2', name: 'Queso', active: true, available_today: false }
        ],
        error: null
      }))
      .mockReturnValueOnce(mockChain({ data: null, error: null }));

    const result = await service.repeat('u1', 'cart1', 'o1');

    expect(result.skipped).toEqual(['Queso']);
    expect(sb.admin.from).toHaveBeenCalledWith('cart_items');
  });
});
