import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AdminController } from '../src/admin/admin.controller';
import { AdminCatalogService } from '../src/admin/admin-catalog.service';
import { AdminReportsService } from '../src/admin/admin-reports.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { AuthService } from '../src/auth/auth.service';
import { CookieService } from '../src/common/cookies/cookie.service';

describe('Admin E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const catalog = {
      listCategories: jest.fn().mockResolvedValue([]),
      createCategory: jest.fn().mockResolvedValue({ id: '1', nombre: 'Postres', activa: true, productCount: 0 }),
      listProducts: jest.fn().mockResolvedValue([]),
      listInventory: jest.fn().mockResolvedValue([])
    };
    const reports = {
      sales: jest.fn().mockResolvedValue([]), topProducts: jest.fn().mockResolvedValue([]),
      ordersByStatus: jest.fn().mockResolvedValue([]), lowStock: jest.fn().mockResolvedValue([])
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
        RolesGuard
      ]
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  it('401 sin cookie', async () => {
    await request(app.getHttpServer()).get('/admin/categories').expect(401);
  });

  it('403 para CLIENTE', async () => {
    await request(app.getHttpServer())
      .get('/admin/categories').set('Cookie', 'sb_access=cliente-token').expect(403);
  });

  it('200 para ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/categories').set('Cookie', 'sb_access=admin-token').expect(200);
    expect(res.body).toEqual({ categories: [] });
  });

  it('400 en body invalido', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories').set('Cookie', 'sb_access=admin-token')
      .send({ activa: true }).expect(400);
  });

  it('400 en rango de fechas invalido', async () => {
    await request(app.getHttpServer())
      .get('/admin/reports/sales?from=25-11-2026').set('Cookie', 'sb_access=admin-token')
      .expect(400);
  });

  afterAll(async () => app.close());
});
