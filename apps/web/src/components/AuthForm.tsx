'use client';

import { useState } from 'react';

export interface AuthFormData {
  name?: string;
  phone?: string;
  email: string;
  password: string;
  remember?: boolean;
}

export function AuthForm({
  mode,
  onSubmit
}: {
  mode: 'register' | 'login';
  onSubmit: (data: AuthFormData) => void;
}) {
  const [form, setForm] = useState<Partial<AuthFormData>>({});
  const update = (key: keyof AuthFormData) => (event: any) =>
    setForm({ ...form, [key]: event.target.value });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form as AuthFormData);
      }}
    >
      {mode === 'register' && (
        <>
          <label>
            Nombre
            <input aria-label="Nombre" onChange={update('name')} required />
          </label>
          <label>
            Celular
            <input aria-label="Celular" onChange={update('phone')} required />
          </label>
        </>
      )}
      <label>
        Correo
        <input aria-label="Correo" type="email" onChange={update('email')} required />
      </label>
      <label>
        Contraseña
        <input
          aria-label="Contraseña"
          type="password"
          minLength={8}
          onChange={update('password')}
          required
        />
      </label>
      {mode === 'login' && (
        <label>
          <input
            aria-label="Recordarme"
            type="checkbox"
            onChange={(event) => setForm({ ...form, remember: event.target.checked })}
          />{' '}
          Recordarme
        </label>
      )}
      <button type="submit">{mode === 'register' ? 'Crear cuenta' : 'Ingresar'}</button>
    </form>
  );
}
