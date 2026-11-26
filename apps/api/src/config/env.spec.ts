import { apiPort, loadEnv } from './env';

const original = { ...process.env };

afterEach(() => {
  process.env.DATABASE_URL =
    original.DATABASE_URL ?? 'postgres://test:test@localhost:5432/saltenanga';
  process.env.JWT_SECRET = original.JWT_SECRET ?? 'test-secret';
  if (original.CORS_ORIGIN === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = original.CORS_ORIGIN;
  if (original.WEB_ORIGIN === undefined) delete process.env.WEB_ORIGIN;
  else process.env.WEB_ORIGIN = original.WEB_ORIGIN;
  if (original.PORT === undefined) delete process.env.PORT;
  else process.env.PORT = original.PORT;
  if (original.API_PORT === undefined) delete process.env.API_PORT;
  else process.env.API_PORT = original.API_PORT;
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

describe('apiPort()', () => {
  it('usa PORT cuando Render lo inyecta', () => {
    process.env.PORT = '10000';
    process.env.API_PORT = '3001';

    expect(apiPort()).toBe(10000);
  });

  it('usa API_PORT cuando no hay PORT', () => {
    delete process.env.PORT;
    process.env.API_PORT = '3100';

    expect(apiPort()).toBe(3100);
  });

  it('usa 3001 cuando no hay ninguno', () => {
    delete process.env.PORT;
    delete process.env.API_PORT;

    expect(apiPort()).toBe(3001);
  });

  it('ignora un PORT vacío', () => {
    process.env.PORT = '';
    process.env.API_PORT = '3200';

    expect(apiPort()).toBe(3200);
  });
});

describe('loadEnv() variables obligatorias', () => {
  it('falla en español si falta DATABASE_URL', () => {
    delete process.env.DATABASE_URL;

    expect(() => loadEnv()).toThrow('Falta DATABASE_URL');
  });

  it('falla en español si falta JWT_SECRET', () => {
    delete process.env.JWT_SECRET;

    expect(() => loadEnv()).toThrow('Falta JWT_SECRET');
  });
});
