import { render, screen } from '@testing-library/react';
import CashierLayout from './layout';
import { api } from '../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../../lib/api', () => ({ api: jest.fn() }));

describe('CashierLayout', () => {
  beforeEach(() => jest.resetAllMocks());

  it('niega el panel a CLIENTE', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ role: 'CLIENTE' });
    render(<CashierLayout><div>secreto</div></CashierLayout>);
    expect(await screen.findByText('Sin permiso')).toBeInTheDocument();
    expect(screen.queryByText('secreto')).not.toBeInTheDocument();
  });

  it('permite a CAJERO y ADMIN', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ role: 'CAJERO' });
    render(<CashierLayout><div>secreto</div></CashierLayout>);
    expect(await screen.findByText('secreto')).toBeInTheDocument();
  });
});
