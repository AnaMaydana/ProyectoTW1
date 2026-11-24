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

  it('devuelve JSON cuando la respuesta es correcta', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true })
    }) as any;

    await expect(api('/products')).resolves.toEqual({ ok: true });
  });
});
