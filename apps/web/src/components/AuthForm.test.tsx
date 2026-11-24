import { render, screen } from '@testing-library/react';
import { AuthForm } from './AuthForm';

describe('AuthForm', () => {
  it('pide nombre, celular, correo y contraseña en registro', () => {
    render(<AuthForm mode="register" onSubmit={jest.fn()} />);
    expect(screen.getByLabelText(/Nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Celular/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contraseña/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Recordarme/i)).not.toBeInTheDocument();
  });

  it('ofrece recordarme en login', () => {
    render(<AuthForm mode="login" onSubmit={jest.fn()} />);
    expect(screen.getByLabelText(/Recordarme/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nombre/i)).not.toBeInTheDocument();
  });
});
