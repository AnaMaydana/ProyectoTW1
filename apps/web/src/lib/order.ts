import { Order } from './types';

export function savedOrderMatches(saved: string | null, code: string): Order | null {
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as Order;
    return parsed?.code === code ? parsed : null;
  } catch {
    return null;
  }
}

export function orderLines(order: Order | null): Order['items'] {
  return order?.items ?? [];
}
