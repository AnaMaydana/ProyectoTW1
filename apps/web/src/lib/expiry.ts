const WINDOW_MINUTES = 30;
const CLOSING_TIME = '11:00:00-04:00';

export function computeExpiry(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const closing = new Date(`${part('year')}-${part('month')}-${part('day')}T${CLOSING_TIME}`);
  const plusWindow = new Date(now.getTime() + WINDOW_MINUTES * 60 * 1000);
  return plusWindow < closing ? plusWindow : closing;
}
