'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { PublicOrder } from '../../../lib/types';

export default function OrderConfirmation({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [receipt, setReceipt] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ code: value }) => {
      setCode(value);
      api<{ order: PublicOrder }>(`/orders/code/${encodeURIComponent(value)}`)
        .then((res) => setReceipt(res.order))
        .catch(() => setReceipt(null))
        .finally(() => setLoading(false));
    });
  }, [params]);

  return (
    <main>
      <h1>Pedido confirmado</h1>
      {receipt ? (
        <>
          <p>Código de pedido: <strong>{receipt.code}</strong></p>
          <p>Total: Bs {receipt.totalBs}</p>
          <p>Hora de recojo: {receipt.pickupTime}</p>
          <p>Estado: {receipt.status}</p>
          <ul>
            {receipt.items.map((item) => (
              <li key={`${item.name}-${item.quantity}`}>
                {item.quantity} × {item.name} — Bs {item.unitPriceBs}
              </li>
            ))}
          </ul>
          {receipt.comprobante && (
            <p>Comprobante: <strong>{receipt.comprobante.numero}</strong> — {receipt.comprobante.fechaEmision}</p>
          )}
          <p>Mostrá el código {receipt.code} en la sucursal.</p>
        </>
      ) : loading ? (
        <p>Cargando pedido {code}…</p>
      ) : (
        <p>No encontramos el pedido {code}. Revisá tu historial o llamá al local.</p>
      )}
      <p><a href="/orders">Ver mis pedidos</a></p>
    </main>
  );
}
