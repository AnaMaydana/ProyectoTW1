import { loadEnv } from './env';

const original = { ...process.env };

afterEach(() => {
  process.env.DATABASE_URL =
    original.DATABASE_URL ?? 'postgres://test:test@localhost:5432/saltenanga';
  process.env.JWT_SECRET = original.JWT_SECRET ?? 'test-secret';
  if (original.CORS_ORIGIN === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = original.CORS_ORIGIN;
  if (original.WEB_ORIGIN === undefined) delete process.env.WEB_ORIGIN;
  else process.env.WEB_ORIGIN = original.WEB_ORIGIN;
});

describe('loadEnv().corsOrigin', () => {
  it('usa WEB_ORIGIN cuando está definido', () => {
    process.env.WEB_ORIGIN = 'https://www.ejemplo.test';
    process.env.CORS_ORIGIN = 'https://ejemplo.test';

    expect(loadEnv().corsOrigin).toBe('https://www.ejemplo.test');
  });

  it('usa CORS_ORIGIN cuando WEB_ORIGIN no está definido', () => {
    delete process.env.WEB_ORIGIN;
    process.env.CORS_ORIGIN = 'https://ejemplo.test';

    expect(loadEnv().corsOrigin).toBe('https://ejemplo.test');
  });

  it('mantiene localhost:3000 cuando no hay ninguno', () => {
    delete process.env.WEB_ORIGIN;
    delete process.env.CORS_ORIGIN;

    expect(loadEnv().corsOrigin).toBe('http://localhost:3000');
  });

  it('ignora un WEB_ORIGIN vacío como hace ${WEB_ORIGIN:-...} en Compose', () => {
    process.env.WEB_ORIGIN = '';
    process.env.CORS_ORIGIN = 'https://ejemplo.test';

    expect(loadEnv().corsOrigin).toBe('https://ejemplo.test');
  });
});
