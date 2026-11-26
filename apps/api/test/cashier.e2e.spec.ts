import { ConflictException, INestApplication, Logger, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { CashierController } from '../src/cashier/cashier.controller';
import { CashierService } from '../src/cashier/cashier.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { AuthService } from '../src/auth/auth.service';
import { CookieService } from '../src/common/cookies/cookie.service';

describe('Cashier E2E', () => {
  let app: INestApplication;
  const cashier = {
    list: jest.fn(), byCode: jest.fn(), changeStatus: jest.fn(), deliver: jest.fn()
  };

  const as = (token: string) => (method: 'get' | 'patch' | 'post', path: string) =>
    (request(app.getHttpServer()) as any)[method](path).set('Cookie', `sb_access=${token}`);

  beforeAll(async () => {
    const auth = { me: jest.fn((token: string) => Promise.resolve(
      token === 'cajero-token' ? { id: '3', role: 'CAJERO' }
        : token === 'admin-token' ? { id: '1', role: 'ADMIN' }
          : { id: '2', role: 'CLIENTE' }
    )) };
    const cookies = { read: jest.fn((req: any) => req.cookies?.sb_access) };
    const module = await Test.createTestingModule({
      controllers: [CashierController],
      providers: [
        { provide: CashierService, useValue: cashier },
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

  beforeEach(() => {
    jest.clearAllMocks();
    cashier.list.mockResolvedValue([]);
    cashier.byCode.mockResolvedValue({ code: 'SAL-20261125-0007' });
    cashier.changeStatus.mockResolvedValue({ code: 'SAL-20261125-0007' });
    cashier.deliver.mockResolvedValue({
      order: { code: 'SAL-20261125-0007' }, comprobante: { numero: 'COM-20261125-0007' }
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('401 sin cookie y 403 para CLIENTE', async () => {
    await request(app.getHttpServer()).get('/cashier/orders').expect(401);
    await as('cliente-token')('get', '/cashier/orders').expect(403);
  });

  it('200 para CAJERO y ADMIN', async () => {
    await as('cajero-token')('get', '/cashier/orders').expect(200, { orders: [] });
    await as('admin-token')('get', '/cashier/orders').expect(200, { orders: [] });
  });

  it('pasa el id_usuario del guard al servicio', async () => {
    await as('cajero-token')('patch', '/cashier/orders/7/status').send({ status: 'CONFIRMADO' }).expect(200);
    expect(cashier.changeStatus).toHaveBeenCalledWith('7', 'CONFIRMADO', '3');
  });

  it('400 por estado, código y fecha inválidos', async () => {
    await as('cajero-token')('patch', '/cashier/orders/7/status').send({ status: 'ENTREGADO' }).expect(400);
    await as('cajero-token')('post', '/cashier/orders/7/deliver').send({ code: 'malo' }).expect(400);
    await as('cajero-token')('get', '/cashier/orders?date=2026-02-30').expect(400);
  });

  it('404, 409 y 502 con mensaje generico', async () => {
    cashier.byCode.mockRejectedValueOnce(new NotFoundException('Pedido no encontrado'));
    await as('cajero-token')('get', '/cashier/orders/code/SAL-20261125-0007').expect(404);

    cashier.deliver.mockRejectedValueOnce(new ConflictException('El código no coincide con el pedido'));
    await as('cajero-token')('post', '/cashier/orders/7/deliver')
      .send({ code: 'SAL-20261125-0007' }).expect(409);

    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    cashier.list.mockRejectedValueOnce(new Error('detalle interno de pg'));
    const res = await as('cajero-token')('get', '/cashier/orders').expect(502);
    expect(res.body).toEqual({ message: 'Error de base de datos', error: 'Bad Gateway', statusCode: 502 });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('GET /cashier/orders'));
  });

  it('23505 responde 409', async () => {
    cashier.deliver.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await as('cajero-token')('post', '/cashier/orders/7/deliver')
      .send({ code: 'SAL-20261125-0007' }).expect(409);
    expect(res.body.statusCode).toBe(409);
  });

  afterAll(async () => app.close());
});
