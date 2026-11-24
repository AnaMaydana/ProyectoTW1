import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('adjunta el carrito anónimo al usuario al iniciar sesión', async () => {
    const auth = { login: jest.fn().mockResolvedValue({ id: 'u1' }) } as any;
    const cart = {
      getOrCreate: jest.fn().mockResolvedValue('cart1'),
      attachUser: jest.fn().mockResolvedValue(undefined)
    } as any;
    const cookies = {
      read: jest.fn().mockReturnValue(undefined),
      setCart: jest.fn()
    } as any;
    const res = { json: jest.fn() } as any;
    const controller = new AuthController(auth, cart, cookies);

    await controller.login({} as any, {} as any, res);

    expect(cart.getOrCreate).toHaveBeenCalledWith(undefined, 'u1');
    expect(cart.attachUser).toHaveBeenCalledWith('cart1', 'u1');
  });
});
