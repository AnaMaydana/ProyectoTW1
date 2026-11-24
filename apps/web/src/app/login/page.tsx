'use client';

import { useState } from 'react';
import { AuthForm, AuthFormData } from '../../components/AuthForm';
import { api, ApiError } from '../../lib/api';

export default function LoginPage() {
  const [error, setError] = useState('');

  const submit = async (data: AuthFormData) => {
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
      window.location.href = '/menu';
    } catch (err) {
      setError(err instanceof ApiError ? 'Correo o contraseña incorrectos' : 'No se pudo ingresar');
    }
  };

  return (
    <main>
      <h1>Ingresar</h1>
      <AuthForm mode="login" onSubmit={submit} />
      {error && <p role="alert" className="alert">{error}</p>}
      <p>¿No tenés cuenta? <a href="/register">Registrate</a></p>
    </main>
  );
}
