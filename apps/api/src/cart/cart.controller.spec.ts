import { CartController } from './cart.controller';

describe('CartController', () => {
  it('renueva la cookie del carrito al quitar un producto', async () => {
    const cart = {
      getOrCreate: jest.fn().mockResolvedValue('cart1'),
      removeItem: jest.fn().mockResolvedValue({ items: [], totalBs: '0.00' })
    } as any;
    const cookies = {
      read: jest.fn().mockReturnValue('cart1'),
      setCart: jest.fn()
    } as any;
    const controller = new CartController(cart, cookies);
    const res = { json: jest.fn() } as any;

    await controller.remove({} as any, res, 'p1');

    expect(cookies.setCart).toHaveBeenCalledWith(res, 'cart1');
  });
});
