import { fireEvent, render, screen } from '@testing-library/react';
import AdminCategories from './page';
import { api } from '../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../../lib/api', () => ({ api: jest.fn() }));

const category = { id: '1', nombre: 'Salteñas', activa: true, productCount: 1 };

function mockApi(patchFails = false) {
  (api as jest.Mock).mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/admin/categories' && !init) return Promise.resolve({ categories: [category] });
    if (init?.method === 'PATCH') {
      return patchFails ? Promise.reject(new Error('Sin permisos')) : Promise.resolve({});
    }
    return Promise.resolve({});
  });
}

describe('AdminCategories', () => {
  beforeEach(() => { jest.resetAllMocks(); mockApi(); });
  afterEach(() => jest.restoreAllMocks());

  it('pide confirmación antes de desactivar', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AdminCategories />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalledWith('/admin/categories/1', expect.anything());
  });

  it('muestra error en español si falla el cambio de estado', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi(true);
    render(<AdminCategories />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar la categoría');
  });

  it('muestra el error si falla la carga de categorías', async () => {
    (api as jest.Mock).mockRejectedValue(new Error('No se pudo cargar las categorías'));
    render(<AdminCategories />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar las categorías');
  });
});
