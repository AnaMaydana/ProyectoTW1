'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { User } from '../../lib/types';

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<User>('/auth/me')
      .then((res) => {
        setUser(res);
        setName(res.name);
      })
      .catch(() => { window.location.href = '/login'; });
  }, []);

  const save = async () => {
    setMessage('');
    try {
      const res = await api<User>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name })
      });
      setUser(res);
      setMessage('Nombre actualizado');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo guardar');
    }
  };

  if (!user) return <main><h1>Mi perfil</h1><p>Cargando…</p></main>;

  return (
    <main>
      <h1>Mi perfil</h1>
      <p>Correo: {user.email}</p>
      <p>Celular: {user.phone}</p>
      <label>
        Nombre
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button onClick={save}>Guardar nombre</button>
      {message && <p role="status">{message}</p>}
    </main>
  );
}
