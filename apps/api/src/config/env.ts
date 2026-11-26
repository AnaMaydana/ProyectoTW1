export function loadEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Falta ${key}`);
  }
  return {
    databaseUrl: process.env.DATABASE_URL!,
    jwtSecret: process.env.JWT_SECRET!,
    // WEB_ORIGIN gana cuando la web se sirve desde www.$DOMAIN (Vercel).
    // Se usa || (no ??) para que un WEB_ORIGIN= vacío se trate como no definido,
    // igual que ${WEB_ORIGIN:-...} en docker-compose.yml.
    corsOrigin: process.env.WEB_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:3000',
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

/** Puerto de escucha: Render inyecta PORT; en local se usa API_PORT o 3001. */
export function apiPort(): number {
  const value = Number(process.env.PORT || process.env.API_PORT || 3001);
  return Number.isFinite(value) && value > 0 && value <= 65535 ? Math.floor(value) : 3001;
}

/** Se leen al usar Storage, no al importar el módulo, para no romper tests sin Storage. */
export function supabaseUrl(): string {
  const value = process.env.SUPABASE_URL;
  if (!value) throw new Error('Falta SUPABASE_URL');
  return value.replace(/\/$/, '');
}

export function supabaseServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return value;
}
