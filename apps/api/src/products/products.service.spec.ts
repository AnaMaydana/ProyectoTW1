import { ProductsService } from './products.service';
import { DatabaseService } from '../database/database.service';

const db = { query: jest.fn() } as unknown as DatabaseService;
const service = new ProductsService(db);

describe('ProductsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('filtra por categoría y marca agotado', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id_producto: 1,
        id_categoria: 1,
        categoria: 'Salteñas',
        nombre: 'Carne',
        descripcion: 'Salteña de carne',
        precio: '12.00',
        foto_url: null,
        disponible_hoy: false
      }]
    });

    const products = await service.list(undefined, 'salteñas');

    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual(['salteñas']);
    expect(products[0].availableToday).toBe(false);
    expect(products[0].priceBs).toBe('12.00');
    expect(products[0].categoryName).toBe('Salteñas');
    expect(products[0].id).toBe('1');
  });

  it('busca por nombre con parámetro LIKE', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await service.list('carne');

    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual(['%carne%']);
  });
});
