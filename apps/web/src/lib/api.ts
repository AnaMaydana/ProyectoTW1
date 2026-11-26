export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const body = JSON.parse(text);
      const raw = body?.message;
      if (Array.isArray(raw)) message = raw.join('; ');
      else if (typeof raw === 'string') message = raw;
    } catch {
      // El servidor respondió texto plano; se muestra tal cual.
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}
