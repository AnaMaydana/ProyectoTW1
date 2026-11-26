import { fireEvent, render, screen } from '@testing-library/react';
import ComprobantePage from './page';
import { api, ApiError } from '../../../../lib/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-svg" data-value={value} />
}));
jest.mock('../../../../lib/api', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
}));

const params = Promise.resolve({ code: 'SAL-20261125-0007' });
const order = {
  code: 'SAL-20261125-0007', status: 'ENTREGADO', totalBs: '24.00', pickupTime: '10:00',
  items: [{ name: 'Carne', quantity: 2, unitPriceBs: '12.00' }],
  comprobante: { numero: 'COM-20261125-0007', fechaEmision: '2026-11-25T14:35:00' }
};

describe('ComprobantePage', () => {
  beforeEach(() => jest.resetAllMocks());

  it('muestra número, detalle, total y QR, e imprime al hacer clic', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    (api as jest.Mock).mockResolvedValueOnce({ order });
    render(<ComprobantePage params={params} />);
    expect(await screen.findByText('COM-20261125-0007')).toBeInTheDocument();
    expect(screen.getByText('Carne')).toBeInTheDocument();
    expect(screen.getByText(/Bs 24\.00/)).toBeInTheDocument();
    expect(screen.getByTestId('qr-svg')).toHaveAttribute('data-value', order.code);
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir / guardar como PDF' }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('avisa cuando todavía no hay comprobante', async () => {
    (api as jest.Mock).mockResolvedValueOnce({ order: { ...order, comprobante: null } });
    render(<ComprobantePage params={params} />);
    expect(await screen.findByText('El comprobante todavía no fue emitido.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Imprimir / guardar como PDF' })).not.toBeInTheDocument();
  });

  it('muestra el mensaje del servidor con role=alert si falla la carga', async () => {
    (api as jest.Mock).mockRejectedValueOnce(new ApiError(404, 'Pedido no encontrado'));
    render(<ComprobantePage params={params} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Pedido no encontrado');
  });

  it('usa un fallback en español si el error no es ApiError', async () => {
    (api as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    render(<ComprobantePage params={params} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el comprobante');
  });
});
