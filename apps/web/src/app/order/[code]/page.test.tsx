import { render, screen } from '@testing-library/react';
import OrderConfirmation from './page';
import { api } from '../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-svg" data-value={value} />
}));
jest.mock('../../../lib/api', () => ({ api: jest.fn(), ApiError: class ApiError extends Error {} }));

describe('OrderConfirmation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sessionStorage.clear();
  });

  it('muestra comprobante, detalle, total, QR y enlace de descarga sin sesión', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ order: {
      code: 'SAL-20261125-0007', status: 'ENTREGADO', totalBs: '24.00', pickupTime: '10:00',
      items: [{ name: 'Carne', quantity: 2, unitPriceBs: '12.00' }],
      comprobante: { numero: 'COM-20261125-0007', fechaEmision: '2026-11-25T14:35:00' }
    } });
    render(<OrderConfirmation params={Promise.resolve({ code: 'SAL-20261125-0007' })} />);
    expect(await screen.findByText('COM-20261125-0007')).toBeInTheDocument();
    expect(screen.getByText(/2 × Carne/)).toBeInTheDocument();
    expect(screen.getByText(/Bs 24\.00/)).toBeInTheDocument();
    expect(screen.getByTestId('order-qr')).toHaveAttribute('aria-label', 'QR del pedido SAL-20261125-0007');
    expect(screen.getByTestId('qr-svg')).toHaveAttribute('data-value', 'SAL-20261125-0007');
    expect(screen.getByRole('link', { name: 'Descargar comprobante' }))
      .toHaveAttribute('href', '/order/SAL-20261125-0007/comprobante');
  });

  it('sigue mostrando el pedido y el QR, sin enlace de descarga, si no hay comprobante aún', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ order: {
      code: 'SAL-20261125-0008', status: 'PENDIENTE', totalBs: '12.00', pickupTime: '10:30',
      items: [], comprobante: null
    } });
    render(<OrderConfirmation params={Promise.resolve({ code: 'SAL-20261125-0008' })} />);
    expect(await screen.findByText(/Mostrá el código SAL-20261125-0008/)).toBeInTheDocument();
    expect(screen.getByTestId('qr-svg')).toHaveAttribute('data-value', 'SAL-20261125-0008');
    expect(screen.queryByRole('link', { name: 'Descargar comprobante' })).not.toBeInTheDocument();
  });
});
