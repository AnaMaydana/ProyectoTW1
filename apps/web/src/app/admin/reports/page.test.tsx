import { render, screen } from '@testing-library/react';
import AdminReports from './page';
import { api } from '../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../../lib/api', () => ({ api: jest.fn() }));

describe('AdminReports', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (api as jest.Mock).mockResolvedValue({
      rows: [{ productId: '7', nombre: 'Carne', unidades: 2, totalBs: '24.00' }]
    });
  });

  it('muestra encabezados en español', async () => {
    render(<AdminReports />);
    expect((await screen.findAllByText('Producto')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Total Bs').length).toBeGreaterThan(0);
    expect(screen.queryByText('totalBs')).not.toBeInTheDocument();
  });
});
