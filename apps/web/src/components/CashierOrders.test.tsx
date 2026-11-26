import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CashierOrders } from './CashierOrders';
import { api } from '../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('../lib/api', () => ({ api: jest.fn(), ApiError: class ApiError extends Error {} }));

const order = {
  id: '7', code: 'SAL-20261125-0007', customerName: 'Ana', customerPhone: '70000000',
  pickupTime: '10:00', status: 'LISTO', totalBs: '24.00', paymentMethod: 'EFECTIVO',
  expiresAt: '2026-11-25T15:00:00.000Z', createdAt: '2026-11-25T14:30:00.000Z', itemCount: 2
};

describe('CashierOrders', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (api as jest.Mock).mockReset();
    (api as jest.Mock).mockImplementation((path: string) => Promise.resolve(
      path.startsWith('/cashier/orders/code/') ? { order } : { orders: [order] }
    ));
  });
  afterEach(() => jest.useRealTimers());

  it('hace polling cada 4 segundos y limpia el intervalo', async () => {
    const { unmount } = render(<CashierOrders />);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/cashier/orders'));
    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(api).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('habilita entrega solo con código y pedido LISTO', async () => {
    render(<CashierOrders />);
    await waitFor(() => expect(screen.getByText(order.code)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Confirmar entrega' })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Código del pedido'), { target: { value: order.code } });
      fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    });
    expect(await screen.findByRole('button', { name: 'Confirmar entrega' })).toBeInTheDocument();
  });

  it('pide confirmación antes de cancelar', async () => {
    (api as jest.Mock).mockResolvedValue({ orders: [{ ...order, status: 'PENDIENTE' }] });
    render(<CashierOrders />);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await waitFor(() => expect(screen.getByText(order.code)).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    });
    expect(confirm).toHaveBeenCalled();
    expect(api).not.toHaveBeenCalledWith('/cashier/orders/7/status', expect.anything());
    confirm.mockRestore();
  });
});
