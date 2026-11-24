import { fireEvent, render, screen } from '@testing-library/react';
import { OrdersHistory } from './OrdersHistory';
import { api } from '../lib/api';

jest.mock('../lib/api', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {}
}));

const order: any = {
  id: 'o1', code: 'SAL-20261124-0001', totalBs: '24.00', status: 'PENDIENTE',
  pickupTime: '10:50', notes: null, paymentMethod: 'EFECTIVO',
  expiresAt: '2026-11-24T15:00:00.000Z', createdAt: '2026-11-24T14:50:00.000Z',
  items: []
};

describe('OrdersHistory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('muestra los nombres de los productos omitidos al repetir', async () => {
    (api as jest.Mock).mockResolvedValueOnce({
      cart: { items: [], totalBs: '0.00' },
      skipped: ['Queso', 'Pollo']
    });

    render(<OrdersHistory initialOrders={[order]} onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Repetir' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Queso, Pollo');
  });
});
