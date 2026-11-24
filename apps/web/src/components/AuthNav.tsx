'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { User } from '../lib/types';

export function AuthNav() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.assign('/menu');
  };

  return user ? (
    <>
      <a href="/profile">Mi perfil</a>
      <button onClick={logout}>Cerrar sesión</button>
    </>
  ) : (
    <a href="/login">Ingresar</a>
  );
}
