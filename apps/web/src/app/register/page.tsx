'use client';

import { useState } from 'react';
import { AuthForm, AuthFormData } from '../../components/AuthForm';
import { api, ApiError } from '../../lib/api';

export default function RegisterPage() {
  const [error, setError] = useState('');

  const submit = async (data: AuthFormData) => {
    setError('');
    try {
      await api('/auth/register', { method: 'POST', body: JSON.stringify(data) });
      window.location.href = '/menu';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar');
    }
  };

  return (
    <main>
      <h1>Registro</h1>
      <AuthForm mode="register" onSubmit={submit} />
      {error && <p role="alert" className="alert">{error}</p>}
      <p>¿Ya tenés cuenta? <a href="/login">Ingresá</a></p>
    </main>
  );
}
