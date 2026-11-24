import { orderLines, savedOrderMatches } from './order';

const order: any = {
  id: 'o1', code: 'SAL-20261124-0001', totalBs: '24.00', status: 'PENDIENTE',
  pickupTime: '10:50', notes: null, paymentMethod: 'EFECTIVO',
  expiresAt: '2026-11-24T15:00:00.000Z', createdAt: '2026-11-24T14:50:00.000Z',
  items: [{ productId: 'p1', name: 'Carne', quantity: 2, unitPriceBs: '12.00' }]
};

describe('savedOrderMatches', () => {
  it('devuelve el pedido cuando el código coincide', () => {
    expect(savedOrderMatches(JSON.stringify(order), order.code)).toEqual(order);
  });

  it('ignora un pedido guardado de otro código', () => {
    expect(savedOrderMatches(JSON.stringify(order), 'SAL-20261124-9999')).toBeNull();
  });

  it('ignora datos corruptos', () => {
    expect(savedOrderMatches('{no es json', order.code)).toBeNull();
  });
});

describe('orderLines', () => {
  it('devuelve lista vacía cuando el pedido del historial no trae items', () => {
    expect(orderLines({ ...order, items: undefined })).toEqual([]);
  });
});
