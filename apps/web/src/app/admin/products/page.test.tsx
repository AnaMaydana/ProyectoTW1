import { fireEvent, render, screen } from '@testing-library/react';
import AdminProducts from './page';
import { api } from '../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../../lib/api', () => ({ api: jest.fn() }));

const product = {
  id: '7', idCategoria: '1', categoria: 'Salteñas', nombre: 'Carne',
  precio: '12.00', fotoUrl: null, activo: true, stock: 3, disponibleHoy: true
};
const category = { id: '1', nombre: 'Salteñas', activa: true, productCount: 1 };

function mockApi(patchFails = false) {
  (api as jest.Mock).mockImplementation((path: string, init?: RequestInit) => {
    if (path.startsWith('/admin/products?')) return Promise.resolve({ products: [product] });
    if (path === '/admin/categories') return Promise.resolve({ categories: [category] });
    if (init?.method === 'PATCH') {
      return patchFails ? Promise.reject(new Error('Sesión vencida')) : Promise.resolve({});
    }
    return Promise.resolve({});
  });
}

describe('AdminProducts', () => {
  beforeEach(() => { jest.resetAllMocks(); mockApi(); });
  afterEach(() => jest.restoreAllMocks());

  it('pide confirmación antes de desactivar', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AdminProducts />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalledWith('/admin/products/7', expect.anything());
  });

  it('muestra error en español si falla la desactivación', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi(true);
    render(<AdminProducts />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo desactivar el producto');
  });
});
