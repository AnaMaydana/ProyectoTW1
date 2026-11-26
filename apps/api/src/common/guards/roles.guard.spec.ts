import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

const auth = { me: jest.fn() } as any;
const cookies = { read: jest.fn() } as any;
const reflector = { getAllAndOverride: jest.fn() } as any;
const guard = new RolesGuard(reflector, auth, cookies);

function ctx(cookie?: string): ExecutionContext {
  const req = { cookies: cookie ? { sb_access: cookie } : {} };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req })
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
  });

  it('401 sin cookie y mensaje en español', async () => {
    cookies.read.mockReturnValue(undefined);
    await expect(guard.canActivate(ctx())).rejects.toThrow('Inicie sesión para continuar');
    expect(auth.me).not.toHaveBeenCalled();
  });

  it('401 cuando la sesión es inválida', async () => {
    cookies.read.mockReturnValue('token');
    auth.me.mockRejectedValue(new UnauthorizedException());
    await expect(guard.canActivate(ctx('token'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('403 para CLIENTE con mensaje en español', async () => {
    cookies.read.mockReturnValue('token');
    auth.me.mockResolvedValue({ id: '1', role: 'CLIENTE' });
    await expect(guard.canActivate(ctx('token'))).rejects.toThrow('No tiene permiso para esta sección');
  });

  it('permite ADMIN y expone req.user', async () => {
    cookies.read.mockReturnValue('token');
    const user = { id: '1', role: 'ADMIN' };
    auth.me.mockResolvedValue(user);
    const context = ctx('token');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((context.switchToHttp().getRequest() as any).user).toEqual(user);
  });

  it('no exige roles cuando no hay metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(cookies.read).not.toHaveBeenCalled();
  });
});
