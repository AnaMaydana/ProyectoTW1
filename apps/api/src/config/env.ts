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
