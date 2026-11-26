import type { Metadata } from 'next';
import './globals.css';
import { business } from '../config/business';
import { CartProvider } from '../components/CartProvider';
import { CartNav } from '../components/CartDrawer';
import { AuthNav } from '../components/AuthNav';

export const metadata: Metadata = {
  title: business.name,
  description: 'Salteñas y bebidas para recoger en sucursal'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <CartProvider>
          <a className="skip-link" href="#principal">Saltar al contenido</a>
          <header className="site-header">
            <strong className="header-brand">{business.name}</strong>
            <nav aria-label="Navegación principal">
              <a href="/menu">Menú</a>
              <a href="/orders">Mis pedidos</a>
              <AuthNav />
              <CartNav />
            </nav>
          </header>
          <div id="principal">{children}</div>
        </CartProvider>
      </body>
    </html>
  );
}
