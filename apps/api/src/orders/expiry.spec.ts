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
});
