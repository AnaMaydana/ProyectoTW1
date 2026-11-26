'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { User } from '../../lib/types';

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    api<User>('/auth/me').then((user) => setRole(user.role)).catch(() => setRole('INVITADO'));
  }, []);

  if (role === null) return <main><p>Cargando…</p></main>;
  if (role !== 'CAJERO' && role !== 'ADMIN') {
    return (
      <main>
        <h1>Sin permiso</h1>
        <p>Esta sección es solo para el cajero.</p>
        <p><a href="/menu">Volver al menú</a></p>
      </main>
    );
  }
  return <main>{children}</main>;
}
