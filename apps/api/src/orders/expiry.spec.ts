import { buildExpiry } from './expiry';

describe('buildExpiry', () => {
  it('pedido a las 10:50 vence a las 11:00', () => {
    const result = buildExpiry(new Date('2026-11-24T14:50:00.000Z'));
    expect(result.expiresAt.toISOString()).toBe('2026-11-24T15:00:00.000Z');
    expect(result.minutesLeft).toBe(10);
  });

  it('pedido a las 09:00 vence a las 09:30', () => {
    const result = buildExpiry(new Date('2026-11-24T13:00:00.000Z'));
    expect(result.expiresAt.toISOString()).toBe('2026-11-24T13:30:00.000Z');
  });

  it('nunca pasa del cierre de las 11:00', () => {
    const result = buildExpiry(new Date('2026-11-24T14:59:00.000Z'));
    expect(result.expiresAt.toISOString()).toBe('2026-11-24T15:00:00.000Z');
    expect(result.minutesLeft).toBe(1);
  });

  it('rechaza pedidos fuera del horario 06:00-11:00', () => {
    expect(() => buildExpiry(new Date('2026-11-24T16:00:00.000Z'))).toThrow(
      'Fuera de horario'
    );
    expect(() => buildExpiry(new Date('2026-11-24T09:00:00.000Z'))).toThrow(
      'Fuera de horario'
    );
  });

  it('respeta E2E_FIXED_NOW solo fuera de produccion', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.E2E_FIXED_NOW = '2026-11-24T13:00:00.000Z';
    try {
      process.env.NODE_ENV = 'test';
      expect(buildExpiry().minutesLeft).toBe(30);
      process.env.NODE_ENV = 'production';
      expect(() => buildExpiry()).toThrow('Fuera de horario');
    } finally {
      process.env.NODE_ENV = originalEnv;
      delete process.env.E2E_FIXED_NOW;
    }
  });
});
