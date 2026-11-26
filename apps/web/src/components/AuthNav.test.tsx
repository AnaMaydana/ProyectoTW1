import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthNav } from './AuthNav';
import { api } from '../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../lib/api', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {}
}));

const user = {
  id: 'u1', email: 'ana@ejemplo.test', name: 'Ana', phone: '70000000', role: 'CLIENTE'
} as const;

describe('AuthNav', () => {
  beforeEach(() => jest.resetAllMocks());

  it('muestra perfil y cerrar sesión cuando hay usuario', async () => {
    (api as jest.Mock).mockResolvedValueOnce(user);

    render(<AuthNav />);

    expect(await screen.findByRole('link', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('muestra ingresar cuando no hay sesión', async () => {
    (api as jest.Mock).mockRejectedValueOnce(new Error('401'));

    render(<AuthNav />);

    expect(await screen.findByRole('link', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('cierra sesión al hacer click', async () => {
    (api as jest.Mock).mockResolvedValueOnce(user).mockResolvedValueOnce({ ok: true });
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign, href: '' }
    });

    render(<AuthNav />);
    const button = await screen.findByRole('button', { name: 'Cerrar sesión' });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(api).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
    expect(assign).toHaveBeenCalledWith('/menu');
  });

  it('muestra Administración solo para ADMIN', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ ...user, role: 'ADMIN' });
    render(<AuthNav />);
    expect(await screen.findByRole('link', { name: 'Administración' })).toBeInTheDocument();
  });

  it('muestra Cajero para CAJERO y ADMIN', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ ...user, role: 'CAJERO' });
    render(<AuthNav />);
    expect(await screen.findByRole('link', { name: 'Cajero' })).toBeInTheDocument();
  });
});
