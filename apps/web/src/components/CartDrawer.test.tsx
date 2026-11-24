import { render, screen } from '@testing-library/react';
import { CartDrawer } from './CartDrawer';

const cart = {
  items: [{
    productId: 'p1',
    name: 'Carne',
    quantity: 2,
    unitPriceBs: '12.00',
    subtotalBs: '24.00'
  }],
  totalBs: '24.00'
};

describe('CartDrawer', () => {
  it('muestra el total en Bs y permite cambiar cantidad', () => {
    render(<CartDrawer initialCart={cart} onChange={jest.fn()} />);
    expect(screen.getByText(/Total: Bs 24\.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quitar/i })).toBeInTheDocument();
  });

  it('muestra estado vacío', () => {
    render(<CartDrawer initialCart={{ items: [], totalBs: '0.00' }} onChange={jest.fn()} />);
    expect(screen.getByText(/Tu carrito está vacío/i)).toBeInTheDocument();
  });
});
