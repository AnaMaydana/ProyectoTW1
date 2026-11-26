import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AdminController } from '../src/admin/admin.controller';
import { AdminCatalogService } from '../src/admin/admin-catalog.service';
import { AdminReportsService } from '../src/admin/admin-reports.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { AuthService } from '../src/auth/auth.service';
import { CookieService } from '../src/common/cookies/cookie.service';
import { PhotoStorageService } from '../src/admin/photo-storage.service';

describe('Admin E2E', () => {
  let app: INestApplication;
  let catalog: Record<string, jest.Mock>;
  let reports: Record<string, jest.Mock>;
  let photos: Record<string, jest.Mock>;

  const asAdmin = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    (request(app.getHttpServer()) as any)[method](path).set('Cookie', 'sb_access=admin-token');

  beforeAll(async () => {
    catalog = {
      listCategories: jest.fn(), createCategory: jest.fn(), updateCategory: jest.fn(),
      listProducts: jest.fn(), createProduct: jest.fn(), updateProduct: jest.fn(),
      listInventory: jest.fn(), updateInventory: jest.fn()
    };
    reports = {
      sales: jest.fn(), topProducts: jest.fn(), ordersByStatus: jest.fn(), lowStock: jest.fn()
    };
    photos = {
      upload: jest.fn(), remove: jest.fn(), isManagedUrl: jest.fn(), publicUrlPrefix: jest.fn()
    };
    const auth = {
      me: jest.fn((token: string) => Promise.resolve(
        token === 'admin-token' ? { id: '1', role: 'ADMIN' } : { id: '2', role: 'CLIENTE' }
      ))
    };
    const cookies = { read: jest.fn((req: any) => req.cookies?.sb_access) };

    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminCatalogService, useValue: catalog },
        { provide: AdminReportsService, useValue: reports },
        { provide: AuthService, useValue: auth },
        { provide: CookieService, useValue: cookies },
        { provide: PhotoStorageService, useValue: photos },
        RolesGuard
      ]
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    catalog.listCategories.mockResolvedValue([]);
    catalog.createCategory.mockResolvedValue({ id: '1', nombre: 'Postres', activa: true, productCount: 0 });
    catalog.updateCategory.mockResolvedValue({ id: '1', nombre: 'Postres', activa: false, productCount: 0 });
    catalog.listProducts.mockResolvedValue([]);
    catalog.createProduct.mockResolvedValue({ id: '7', nombre: 'Carne', activo: true });
    catalog.updateProduct.mockResolvedValue({ id: '7', nombre: 'Carne', activo: false, disponibleHoy: false });
    catalog.listInventory.mockResolvedValue([]);
    catalog.updateInventory.mockResolvedValue({ id: '1', stock: 2 });
    reports.sales.mockResolvedValue([]);
    reports.topProducts.mockResolvedValue([]);
    reports.ordersByStatus.mockResolvedValue([]);
    reports.lowStock.mockResolvedValue([]);
    photos.upload.mockResolvedValue(
      'https://demo.supabase.co/storage/v1/object/public/portadas/productos/abc.png'
    );
    photos.remove.mockResolvedValue(undefined);
    photos.isManagedUrl.mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('401 sin cookie', async () => {
    await request(app.getHttpServer()).get('/admin/categories').expect(401);
  });

  it('403 para CLIENTE', async () => {
    await request(app.getHttpServer())
      .get('/admin/categories').set('Cookie', 'sb_access=cliente-token').expect(403);
  });

  it('200 para ADMIN', async () => {
    const res = await asAdmin('get','/admin/categories').expect(200);
    expect(res.body).toEqual({ categories: [] });
  });

  it('400 en body invalido', async () => {
    await asAdmin('post','/admin/categories').send({ activa: true }).expect(400);
  });

  it('400 en rango de fechas invalido', async () => {
    await asAdmin('get','/admin/reports/sales?from=25-11-2026').expect(400);
  });

  it('400 en fecha inexistente', async () => {
    await asAdmin('get','/admin/reports/sales?from=2026-02-30').expect(400);
  });

  it('400 en threshold no numerico', async () => {
    await asAdmin('get','/admin/inventory?threshold=abc').expect(400);
  });

  it('ADMIN crea y edita categoria con auditoria', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const created = await asAdmin('post','/admin/categories').send({ nombre: 'Postres' }).expect(201);
    expect(created.body).toEqual({ category: { id: '1', nombre: 'Postres', activa: true, productCount: 0 } });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('crear_categoria id_usuario=1'));

    await asAdmin('patch','/admin/categories/1').send({ activa: false }).expect(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('editar_categoria id_usuario=1'));
    expect(catalog.updateCategory).toHaveBeenCalledWith(1, { activa: false });
  });

  it('ADMIN crea, desactiva producto y edita inventario', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const created = await asAdmin('post','/admin/products')
      .send({ idCategoria: 1, nombre: 'Carne', precio: 12, stock: 3 }).expect(201);
    expect(created.body.product.id).toBe('7');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('crear_producto id_usuario=1'));

    const updated = await asAdmin('patch','/admin/products/7').send({ activo: false }).expect(200);
    expect(updated.body.product.activo).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('editar_producto id_usuario=1'));

    await asAdmin('patch','/admin/inventory/1').send({ stock: 2 }).expect(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('editar_inventario id_usuario=1'));
  });

  it('ADMIN consulta los cuatro reportes', async () => {
    for (const route of ['sales', 'top-products', 'orders-by-status', 'low-stock']) {
      const res = await asAdmin('get',`/admin/reports/${route}`).expect(200);
      expect(res.body).toEqual({ rows: [] });
    }
    expect(reports.sales).toHaveBeenCalled();
    expect(reports.topProducts).toHaveBeenCalled();
    expect(reports.ordersByStatus).toHaveBeenCalled();
    expect(reports.lowStock).toHaveBeenCalled();
  });

  it('fallo de BD responde 502 con mensaje generico y log', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    catalog.listCategories.mockRejectedValueOnce(new Error('detalle interno de pg'));
    const res = await asAdmin('get','/admin/categories').expect(502);
    expect(res.body).toEqual({ message: 'Error de base de datos', error: 'Bad Gateway', statusCode: 502 });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('GET /admin/categories'));
  });

  it('nombre duplicado responde 409', async () => {
    catalog.createCategory.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await asAdmin('post','/admin/categories').send({ nombre: 'Postres' }).expect(409);
    expect(res.body.message).toBe('Nombre duplicado');
  });

  it('401 y 403 en la subida de fotos', async () => {
    const body = { fileName: 'foto.png', contentType: 'image/png', base64: 'aW1n' };
    await request(app.getHttpServer()).post('/admin/products/photo').send(body).expect(401);
    await request(app.getHttpServer())
      .post('/admin/products/photo').set('Cookie', 'sb_access=cliente-token').send(body).expect(403);
  });

  it('ADMIN sube una foto y devuelve la URL', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const res = await asAdmin('post', '/admin/products/photo')
      .send({ fileName: 'foto.png', contentType: 'image/png', base64: 'aW1n' })
      .expect(201);
    expect(res.body).toEqual({
      url: 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/abc.png'
    });
    expect(photos.upload).toHaveBeenCalledWith('aW1n', 'image/png');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('subir_foto id_usuario=1'));
  });

  it('400 si el tipo de foto no está permitido', async () => {
    const res = await asAdmin('post', '/admin/products/photo')
      .send({ fileName: 'foto.gif', contentType: 'image/gif', base64: 'aW1n' })
      .expect(400);
    expect(res.body.message).toContain('Formato de imagen no permitido (usa JPG, PNG o WebP)');
  });

  it('ADMIN borra una foto propia', async () => {
    const res = await asAdmin('delete', '/admin/products/photo')
      .send({ url: 'https://demo.supabase.co/storage/v1/object/public/portadas/productos/abc.png' })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(photos.remove).toHaveBeenCalledWith(
      'https://demo.supabase.co/storage/v1/object/public/portadas/productos/abc.png'
    );
  });

  afterAll(async () => app.close());
});
