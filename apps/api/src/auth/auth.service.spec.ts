import { AuthService } from './auth.service';
import { CookieService } from '../common/cookies/cookie.service';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

const db = { query: jest.fn() } as unknown as DatabaseService;
const service = new AuthService(db, new CookieService());
const userRow = {
  id_usuario: 7,
  correo: 'a@b.com',
  nombre: 'Ana',
  celular: '70000000',
  role: 'CLIENTE'
};

describe('AuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registro crea usuario con rol CLIENTE', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_rol: 2 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_usuario: 7 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [userRow] });

    const user = await service.register({
      name: 'Ana', phone: '70000000', email: 'a@b.com', password: 'secret123'
    });

    expect(user.role).toBe('CLIENTE');
    expect(user.id).toBe('7');
    expect((db.query as jest.Mock).mock.calls[2][0]).toContain('INSERT INTO usuario');
  });

  it('login con remember setea sb_access por 30 días', async () => {
    const passwordHash = await bcrypt.hash('secret123', 10);
    (db.query as jest.Mock).mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...userRow, password_hash: passwordHash }]
    });
    const res = { cookie: jest.fn() } as any;

    const user = await service.login(
      { email: 'a@b.com', password: 'secret123', remember: true },
      res
    );

    const call = res.cookie.mock.calls.find((c: any[]) => c[0] === 'sb_access');
    expect(call).toBeDefined();
    expect(call[2].maxAge).toBe(30 * 24 * 60 * 60 * 1000);
    expect(jwt.verify(call[1], 'test-secret')).toMatchObject({ sub: '7' });
    expect(user.email).toBe('a@b.com');
  });

  it('rechaza credenciales inválidas', async () => {
    const passwordHash = await bcrypt.hash('otra-clave', 10);
    (db.query as jest.Mock).mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...userRow, password_hash: passwordHash }]
    });
    await expect(
      service.login({ email: 'a@b.com', password: 'secret123' }, { cookie: jest.fn() } as any)
    ).rejects.toThrow('Credenciales inválidas');
  });

  it('devuelve 401 en español cuando el token no es válido', async () => {
    await expect(service.me('token-invalido')).rejects.toThrow('Sesión inválida o vencida');
  });

  it('lee el usuario desde el JWT', async () => {
    const token = jwt.sign({ sub: '7' }, 'test-secret');
    (db.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1, rows: [userRow] });

    const user = await service.me(token);

    expect(user.id).toBe('7');
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual([7]);
  });
});
