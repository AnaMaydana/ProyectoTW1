import { render, screen } from '@testing-library/react';
import AdminLayout from './layout';
import { api } from '../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../lib/api', () => ({ api: jest.fn() }));

describe('AdminLayout', () => {
  beforeEach(() => jest.resetAllMocks());

  it('muestra sin permiso a CLIENTE', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ role: 'CLIENTE' });
    render(<AdminLayout><div>secreto</div></AdminLayout>);
    expect(await screen.findByText('Sin permiso')).toBeInTheDocument();
    expect(screen.queryByText('secreto')).not.toBeInTheDocument();
  });

  it('muestra el contenido a ADMIN', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ role: 'ADMIN' });
    render(<AdminLayout><div>secreto</div></AdminLayout>);
    expect(await screen.findByText('secreto')).toBeInTheDocument();
  });
});
