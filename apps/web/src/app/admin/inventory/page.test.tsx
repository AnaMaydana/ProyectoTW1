import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminInventory from './page';
import { api } from '../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../../lib/api', () => ({ api: jest.fn() }));

const item = {
  id: '1', productId: '7', nombre: 'Agua', stock: 3, disponibleHoy: true, lowStock: true
};

function mockApi(patchFails = false) {
  (api as jest.Mock).mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/admin/inventory' && !init) {
      return Promise.resolve({ items: [item] });
    }
    if (init?.method === 'PATCH') {
      return patchFails ? Promise.reject(new Error('Fallo de BD')) : Promise.resolve({});
    }
    return Promise.resolve({});
  });
}

describe('AdminInventory', () => {
  beforeEach(() => { jest.resetAllMocks(); mockApi(); });

  it('guarda el stock al perder el foco, no en cada tecla', async () => {
    render(<AdminInventory />);
    const input = await screen.findByLabelText('Stock de Agua');
    fireEvent.change(input, { target: { value: '12' } });
    expect(api).not.toHaveBeenCalledWith('/admin/inventory/1', expect.anything());
    fireEvent.blur(input);
    await waitFor(() => expect(api).toHaveBeenCalledWith(
      '/admin/inventory/1', expect.objectContaining({ method: 'PATCH' })
    ));
  });

  it('muestra error en español si falla el guardado', async () => {
    mockApi(true);
    render(<AdminInventory />);
    const input = await screen.findByLabelText('Stock de Agua');
    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el stock');
  });

  it('muestra badge de stock bajo', async () => {
    render(<AdminInventory />);
    expect(await screen.findByText('Stock bajo')).toBeInTheDocument();
  });
});
