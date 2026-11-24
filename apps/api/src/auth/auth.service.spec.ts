import { AuthService } from './auth.service';
import { CookieService } from '../common/cookies/cookie.service';

const sb = {
  anon: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      getUser: jest.fn(),
      refreshSession: jest.fn()
    }
  },
  admin: { from: jest.fn() }
} as any;

const service = new AuthService(sb, new CookieService());

describe('AuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registro crea perfil con rol CLIENTE', async () => {
    sb.anon.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
      error: null
    });
    sb.admin.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: () => ({
          single: () => Promise.resolve({
            data: { name: 'Ana', phone: '70000000', role: 'CLIENTE' },
            error: null
          })
        })
      })
    });

    const user = await service.register({
      name: 'Ana', phone: '70000000', email: 'a@b.com', password: 'secret123'
    });

    expect(user.role).toBe('CLIENTE');
    expect(sb.admin.from).toHaveBeenCalledWith('profiles');
  });

  it('login con remember setea sb_refresh por 30 días', async () => {
    sb.anon.auth.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'a', refresh_token: 'r' }, user: { id: 'u1', email: 'a@b.com' } },
      error: null
    });
    sb.anon.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    sb.admin.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: () => ({
          single: () => Promise.resolve({
            data: { name: 'Ana', phone: '70000000', role: 'CLIENTE' }, error: null
          })
        })
      })
    });
    const res = { cookie: jest.fn() } as any;

    await service.login({ email: 'a@b.com', password: 'secret123', remember: true }, res);

    const call = res.cookie.mock.calls.find((c: any[]) => c[0] === 'sb_refresh');
    expect(call).toBeDefined();
    expect(call[2].maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('renueva la sesión aunque exista sb_access vencido', async () => {
    sb.anon.auth.getUser
      .mockResolvedValueOnce({ data: { user: null }, error: { message: 'expired' } })
      .mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'a@b.com' } },
        error: null
      });
    sb.anon.auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'new', refresh_token: 'r2' } },
      error: null
    });
    sb.admin.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: () => ({
          single: () => Promise.resolve({
            data: { name: 'Ana', phone: '70000000', role: 'CLIENTE' }, error: null
          })
        })
      })
    });
    const res = { cookie: jest.fn() } as any;

    const user = await service.me('old', 'r', res);

    expect(sb.anon.auth.refreshSession).toHaveBeenCalledWith({ refresh_token: 'r' });
    expect(res.cookie).toHaveBeenCalledWith('sb_access', 'new', expect.anything());
    expect(user.id).toBe('u1');
  });
});
