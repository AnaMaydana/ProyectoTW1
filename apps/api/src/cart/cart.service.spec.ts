import { CartService } from './cart.service';
import { DatabaseService } from '../database/database.service';

const db = { query: jest.fn() } as unknown as DatabaseService;
const service = new CartService(db);

describe('CartService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calcula el total desde la BD', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id_producto: 1, nombre: 'Carne', cantidad: 2, precio: '12.00' }]
    });

    const cart = await service.getCart('token-1');

    expect(cart.items[0].subtotalBs).toBe('24.00');
    expect(cart.totalBs).toBe('24.00');
  });

  it('rechaza cantidad menor a 1', async () => {
    await expect(service.addItem('token-1', '1', 0)).rejects.toThrow('Cantidad inválida');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('responde 409 cuando el producto está agotado hoy', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ activo: true, disponible_hoy: false }]
    });

    await expect(service.addItem('token-1', '1', 1)).rejects.toMatchObject({ status: 409 });
  });

  it('reutiliza el token de un carrito existente', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ token: 'token-1' }]
    });

    await expect(service.getOrCreate('token-1')).resolves.toBe('token-1');
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual(['token-1']);
  });
});
