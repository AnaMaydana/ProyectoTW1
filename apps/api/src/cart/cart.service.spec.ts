import { CartService } from './cart.service';

const admin = { from: jest.fn() } as any;
const service = new CartService({ admin } as any);

describe('CartService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calcula el total desde la BD', async () => {
    const data = [{
      cart_id: 'cart1',
      product_id: 'p1',
      quantity: 2,
      products: { name: 'Carne', price_bs: '12.00', active: true, available_today: true }
    }];
    admin.from.mockReturnValue({
      select: () => ({ eq: () => Promise.resolve({ data, error: null }) })
    });

    const cart = await service.getCart('cart1');

    expect(cart.items[0].subtotalBs).toBe('24.00');
    expect(cart.totalBs).toBe('24.00');
  });

  it('rechaza cantidad menor a 1', async () => {
    await expect(service.addItem('cart1', 'p1', 0)).rejects.toThrow('Cantidad inválida');
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('responde 409 cuando el producto está agotado', async () => {
    admin.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { id: 'p1', active: true, available_today: false },
            error: null
          })
        })
      })
    });

    await expect(service.addItem('cart1', 'p1', 1)).rejects.toMatchObject({ status: 409 });
  });
});
