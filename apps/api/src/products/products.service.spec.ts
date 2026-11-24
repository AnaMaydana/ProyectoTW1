import { ProductsService } from './products.service';

const sb = { admin: { from: jest.fn() } } as any;
const service = new ProductsService(sb);

describe('ProductsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('filtra por categoría y marca agotado', async () => {
    const rows = [{
      id: 'p1',
      category_id: '11111111-1111-4111-8111-111111111111',
      name: 'Carne',
      description: 'Salteña de carne',
      price_bs: '12.00',
      image_url: null,
      available_today: false,
      active: true,
      categories: { name: 'salteñas' }
    }];
    const order = jest.fn().mockResolvedValue({ data: rows, error: null });
    const chain: any = { order };
    chain.eq = jest.fn().mockReturnValue(chain);
    sb.admin.from.mockReturnValue({ select: () => chain });

    const products = await service.list(undefined, 'salteñas');

    expect(chain.eq).toHaveBeenCalledWith('active', true);
    expect(chain.eq).toHaveBeenCalledWith(
      'category_id',
      '11111111-1111-4111-8111-111111111111'
    );
    expect(order).toHaveBeenCalledWith('name');
    expect(products[0].availableToday).toBe(false);
    expect(products[0].priceBs).toBe('12.00');
    expect(products[0].categoryName).toBe('salteñas');
  });

  it('busca por nombre con ilike', async () => {
    const chain: any = { order: jest.fn().mockResolvedValue({ data: [], error: null }) };
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.ilike = jest.fn().mockReturnValue(chain);
    sb.admin.from.mockReturnValue({ select: () => chain });

    await service.list('carne');

    expect(chain.ilike).toHaveBeenCalledWith('name', '%carne%');
  });
});
