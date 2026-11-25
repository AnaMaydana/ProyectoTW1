import { BadRequestException } from '@nestjs/common';

const WINDOW_MINUTES = 30;
const CLOSING_TIME = '11:00:00-04:00';

/**
 * Reloj del negocio. `E2E_FIXED_NOW` solo se respeta fuera de producción para
 * poder ejecutar el flujo de pedidos a cualquier hora (tests E2E).
 */
export function businessNow(): Date {
  const fixed = process.env.E2E_FIXED_NOW;
  if (fixed && process.env.NODE_ENV !== 'production') {
    const parsed = new Date(fixed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function buildExpiry(now: Date = businessNow()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const minutesNow = Number(part('hour')) * 60 + Number(part('minute'));
  if (minutesNow < 6 * 60 || minutesNow >= 11 * 60) {
    throw new BadRequestException('Fuera de horario: atendemos de 06:00 a 11:00');
  }
  const closing = new Date(
    `${part('year')}-${part('month')}-${part('day')}T${CLOSING_TIME}`
  );
  const plusWindow = new Date(now.getTime() + WINDOW_MINUTES * 60 * 1000);
  const expiresAt = plusWindow < closing ? plusWindow : closing;
  const minutesLeft = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now.getTime()) / 60000)
  );
  return { expiresAt, minutesLeft };
}
