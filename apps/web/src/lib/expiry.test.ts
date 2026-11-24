import { computeExpiry } from './expiry';

describe('computeExpiry', () => {
  it('pedido a las 10:50 vence a las 11:00', () => {
    expect(computeExpiry(new Date('2026-11-24T14:50:00.000Z')).toISOString())
      .toBe('2026-11-24T15:00:00.000Z');
  });

  it('pedido a las 09:00 vence a las 09:30', () => {
    expect(computeExpiry(new Date('2026-11-24T13:00:00.000Z')).toISOString())
      .toBe('2026-11-24T13:30:00.000Z');
  });
});
