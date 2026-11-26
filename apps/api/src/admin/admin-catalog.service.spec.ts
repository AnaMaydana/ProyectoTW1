import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminCatalogService } from './admin-catalog.service';
import { DatabaseService } from '../database/database.service';
import { PhotoStorageService } from './photo-storage.service';

const db = { query: jest.fn(), transaction: jest.fn() } as unknown as DatabaseService;
const photos = {
  isManagedUrl: jest.fn(), remove: jest.fn(), upload: jest.fn(), publicUrlPrefix: jest.fn()
} as unknown as PhotoStorageService;
const service = new AdminCatalogService(db, photos);

const photoRow = {
  id_producto: 1, id_categoria: 1, categoria: 'Salteñas', nombre: 'Carne',
  precio: '12.00', foto_url: null, activo: true, stock: 3, disponible_hoy: true
};

const mockUpdateFlow = (foto_url: string | null = null) => {
  (db.query as jest.Mock)
    .mockResolvedValueOnce({ rows: [{ nombre: 'Carne' }], rowCount: 1 }) // SELECT actual
    .mockResolvedValueOnce({ rows: [] })                                // UPDATE producto
    .mockResolvedValueOnce({ rows: [{ ...photoRow, foto_url }] });      // oneProduct
};

describe('AdminCatalogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (photos.isManagedUrl as jest.Mock).mockReturnValue(true);
    (photos.remove as jest.Mock).mockResolvedValue(undefined);
  });

  it('lista categorias con conteo de productos', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id_categoria: 1, nombre: 'Salteñas', activa: true, product_count: '5' }]
    });
    await expect(service.listCategories()).resolves.toEqual([
      { id: '1', nombre: 'Salteñas', activa: true, productCount: 5 }
    ]);
  });

  it('rechaza categoria duplicada con 409', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [{ 1: 1 }], rowCount: 1 });
    await expect(service.createCategory('Salteñas')).rejects.toBeInstanceOf(ConflictException);
  });

  it('crea producto e inventario en una transaccion sin pedir otra conexion al pool', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // SELECT categoria
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // ensureUnique con el client de la transacción
      .mockResolvedValueOnce({ rows: [{ id_producto: 7 }] })    // INSERT producto
      .mockResolvedValueOnce({ rows: [] })                      // INSERT inventario
      .mockResolvedValueOnce({
        rows: [{ id_producto: 7, id_categoria: 1, categoria: 'Salteñas', nombre: 'Carne',
                 precio: '12.00', foto_url: null, activo: true, stock: 0, disponible_hoy: false }]
      });                                                      // oneProduct EN la transacción
    (db.transaction as jest.Mock).mockImplementation((work: any) => work(client));

    const product = await service.createProduct({
      idCategoria: 1, nombre: 'Carne', precio: 12
    });

    expect((db.transaction as jest.Mock)).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledTimes(5);
    expect(product).toMatchObject({ id: '7', stock: 0, disponibleHoy: false, precio: '12.00' });
  });

  it('baja logica: desactivar producto apaga disponible_hoy', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ nombre: 'Carne' }], rowCount: 1 }) // SELECT actual
      .mockResolvedValueOnce({ rows: [] })                                // UPDATE producto
      .mockResolvedValueOnce({ rows: [] })                                // UPDATE inventario
      .mockResolvedValueOnce({ rows: [{
        id_producto: 1, id_categoria: 1, categoria: 'Salteñas', nombre: 'Carne',
        precio: '12.00', foto_url: null, activo: false, stock: 3, disponible_hoy: false
      }] });                                                              // oneProduct

    const product = await service.updateProduct('1', { activo: false });

    expect((db.query as jest.Mock).mock.calls[2][0]).toContain('UPDATE inventario SET disponible_hoy');
    expect(product.activo).toBe(false);
    expect(product.disponibleHoy).toBe(false);
  });

  it('404 al actualizar inventario inexistente', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });
    await expect(service.updateInventory('99', { stock: 2 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stock negativo se rechaza en el servicio', async () => {
    await expect(service.updateInventory('1', { stock: -1 })).rejects.toThrow('stock');
  });

  it('rechaza stock negativo en updateProduct antes de escribir', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [{ nombre: 'Carne' }], rowCount: 1 });
    await expect(service.updateProduct('1', { stock: -1 })).rejects.toThrow('stock');
    expect((db.query as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it('usa LOW_STOCK_THRESHOLD del entorno por defecto', async () => {
    const previous = process.env.LOW_STOCK_THRESHOLD;
    process.env.LOW_STOCK_THRESHOLD = '9';
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    try {
      await service.listInventory();
      const params = (db.query as jest.Mock).mock.calls[0][1];
      expect(params).toEqual([9]);
    } finally {
      if (previous === undefined) delete process.env.LOW_STOCK_THRESHOLD;
      else process.env.LOW_STOCK_THRESHOLD = previous;
    }
  });

  it('fotoUrl ausente conserva la foto actual', async () => {
    mockUpdateFlow('https://demo.supabase.co/productos/vieja.png');
    await service.updateProduct('1', { nombre: 'Carne' });
    const [sql, params] = (db.query as jest.Mock).mock.calls[1];
    expect(sql).toContain('foto_url = CASE WHEN $6::boolean THEN $7::text ELSE foto_url END');
    expect(params[5]).toBe(false);
    expect(params[6]).toBeNull();
    expect(photos.remove).not.toHaveBeenCalled();
  });

  it('fotoUrl null quita la foto', async () => {
    mockUpdateFlow(null);
    const result = await service.updateProduct('1', { fotoUrl: null });
    const params = (db.query as jest.Mock).mock.calls[1][1];
    expect(params[5]).toBe(true);
    expect(params[6]).toBeNull();
    expect(result.fotoUrl).toBeNull();
  });

  it('fotoUrl con URL reemplaza y borra la anterior después del update', async () => {
    const anterior = 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/vieja.png';
    const nueva = 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/nueva.png';
    mockUpdateFlow(nueva);
    await service.updateProduct('1', { fotoUrl: nueva, fotoUrlAnterior: anterior });
    const params = (db.query as jest.Mock).mock.calls[1][1];
    expect(params[5]).toBe(true);
    expect(params[6]).toBe(nueva);
    expect(photos.isManagedUrl).toHaveBeenCalledWith(anterior);
    expect(photos.remove).toHaveBeenCalledWith(anterior);
    const updateOrder = (db.query as jest.Mock).mock.invocationCallOrder[1];
    const removeOrder = (photos.remove as jest.Mock).mock.invocationCallOrder[0];
    expect(removeOrder).toBeGreaterThan(updateOrder);
  });

  it('no borra si la foto anterior es igual a la nueva', async () => {
    const url = 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/igual.png';
    mockUpdateFlow(url);
    await service.updateProduct('1', { fotoUrl: url, fotoUrlAnterior: url });
    expect(photos.remove).not.toHaveBeenCalled();
  });

  it('no borra una URL fuera del bucket', async () => {
    (photos.isManagedUrl as jest.Mock).mockReturnValue(false);
    mockUpdateFlow('https://externo.test/foto.png');
    await service.updateProduct('1', {
      fotoUrl: 'https://externo.test/foto.png',
      fotoUrlAnterior: 'https://otro.test/vieja.png'
    });
    expect(photos.remove).not.toHaveBeenCalled();
  });
});
