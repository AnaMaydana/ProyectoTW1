import { render, screen } from '@testing-library/react';
import { CheckoutForm } from './CheckoutForm';

const baseProps = {
  expiresAt: '2026-11-24T15:00:00.000Z',
  onSubmit: jest.fn()
};

describe('CheckoutForm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('avisa cuando quedan menos de 10 minutos', () => {
    render(
      <CheckoutForm
        {...baseProps}
        now={() => new Date('2026-11-24T14:51:00.000Z')}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/menos de 10 minutos/i);
  });

  it('no avisa cuando quedan exactamente 10 minutos', () => {
    render(
      <CheckoutForm
        {...baseProps}
        now={() => new Date('2026-11-24T14:50:00.000Z')}
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pide hora, observaciones y método de pago', () => {
    render(<CheckoutForm {...baseProps} />);
    expect(screen.getByLabelText(/Hora de recojo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Observaciones/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Método de pago/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar pedido/i })).toBeInTheDocument();
  });

  it('pide nombre y celular al cliente anónimo', () => {
    render(<CheckoutForm {...baseProps} showCustomerFields />);
    expect(screen.getByLabelText(/Nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Celular/i)).toBeInTheDocument();
  });
});
