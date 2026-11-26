import { fireEvent, render, screen } from '@testing-library/react';
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

const abrirCarrito = () => fireEvent.click(screen.getByRole('button', { name: /Abrir carrito/i }));

describe('CartDrawer', () => {
  it('mantiene el detalle oculto hasta abrir el carrito', () => {
    render(<CartDrawer initialCart={cart} onChange={jest.fn()} />);
    expect(screen.queryByText('Carne')).not.toBeInTheDocument();
    expect(screen.queryByText(/Total: Bs 24\.00/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir carrito/i })).toBeInTheDocument();
  });

  it('muestra productos, total y confirmar pedido al abrir el carrito', () => {
    render(<CartDrawer initialCart={cart} onChange={jest.fn()} />);
    abrirCarrito();
    expect(screen.getByText('Carne')).toBeInTheDocument();
    expect(screen.getByText(/Total: Bs 24\.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quitar/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Confirmar pedido/i })).toBeInTheDocument();
  });

  it('muestra la cantidad total de productos en el botón', () => {
    render(<CartDrawer initialCart={cart} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Abrir carrito/i })).toHaveTextContent('2');
  });

  it('cierra el panel al pulsar Escape', () => {
    render(<CartDrawer initialCart={cart} onChange={jest.fn()} />);
    abrirCarrito();
    expect(screen.getByText('Carne')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Carne')).not.toBeInTheDocument();
  });

  it('muestra estado vacío al abrir un carrito sin productos', () => {
    render(<CartDrawer initialCart={{ items: [], totalBs: '0.00' }} onChange={jest.fn()} />);
    abrirCarrito();
    expect(screen.getByText(/Tu carrito está vacío/i)).toBeInTheDocument();
  });
});
