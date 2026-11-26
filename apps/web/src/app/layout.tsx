import type { Metadata, Viewport } from 'next';
import './globals.css';
import { business } from '../config/business';
import { CartProvider } from '../components/CartProvider';
import { AuthNav } from '../components/AuthNav';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
};

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
            <AuthNav />
          </nav>
        </header>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
