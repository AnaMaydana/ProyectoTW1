import { api, ApiError } from './api';

describe('api', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('envía credentials include y lanza ApiError', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: () => Promise.resolve('Conflicto')
    }) as any;

    await expect(api('/orders')).rejects.toBeInstanceOf(ApiError);
    expect((global.fetch as jest.Mock).mock.calls[0][1].credentials).toBe('include');
  });

  it('muestra el mensaje del cuerpo JSON en vez del texto crudo', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('{"message":["Estado no permitido"],"statusCode":400}')
    }) as any;

    await expect(api('/cashier/orders/7/status')).rejects.toMatchObject({
      message: 'Estado no permitido'
    });
  });

  it('devuelve JSON cuando la respuesta es correcta', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true })
    }) as any;

    await expect(api('/products')).resolves.toEqual({ ok: true });
  });

  it('usa la base relativa /api sin duplicar barras', async () => {
    const anterior = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = '/api';
    jest.resetModules();
    const { api: apiRelativa } = require('./api') as typeof import('./api');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true })
    }) as any;

    await apiRelativa('/products');

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/products');
    if (anterior === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = anterior;
    jest.resetModules();
  });
});
