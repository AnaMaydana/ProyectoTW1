export function loadEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Falta ${key}`);
  }
  return {
    databaseUrl: process.env.DATABASE_URL!,
    jwtSecret: process.env.JWT_SECRET!,
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    cartDays: Number(process.env.CART_COOKIE_DAYS ?? 30),
    refreshDays: Number(process.env.SESSION_REFRESH_DAYS ?? 30)
  };
}

export const env = loadEnv();

/** Umbral de stock bajo, leído en cada llamada para poder ajustarlo sin reiniciar módulos. */
export function lowStockThreshold(): number {
  const value = Number(process.env.LOW_STOCK_THRESHOLD ?? 5);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 5;
}
