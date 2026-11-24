import type { Metadata } from 'next';
import './globals.css';
import { business } from '../config/business';

export const metadata: Metadata = {
  title: business.name,
  description: 'Salteñas y bebidas para recoger en sucursal'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="site-header">
          <strong>{business.name}</strong>
          <nav>
            <a href="/menu">Menú</a>
            <a href="/orders">Mis pedidos</a>
            <a href="/login">Ingresar</a>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
