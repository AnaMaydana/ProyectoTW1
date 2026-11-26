import { render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';

const product = {
  id: 'p1',
  categoryId: 'c1',
  categoryName: 'salteñas',
  name: 'Carne',
  description: 'Salteña de carne con ají',
  priceBs: '12.00',
  imageUrl: null,
  availableToday: false
};

describe('ProductCard', () => {
  it('muestra agotado, descripción y precio en Bs', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText(/Agotado hoy/i)).toBeInTheDocument();
    expect(screen.getByText(/Bs 12\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Salteña de carne con ají/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar/i })).toBeDisabled();
  });

  it('permite agregar cuando está disponible', () => {
    render(<ProductCard product={{ ...product, availableToday: true }} />);
    expect(screen.queryByText(/Agotado hoy/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar/i })).toBeEnabled();
  });

  it('usa botón no submit y clase de precio para el nuevo estilo', () => {
    render(<ProductCard product={{ ...product, availableToday: true }} />);
    const boton = screen.getByRole('button', { name: /Agregar/i }) as HTMLButtonElement;
    expect(boton.type).toBe('button');
    expect(screen.getByText(/Bs 12\.00/)).toHaveClass('precio');
  });
});
