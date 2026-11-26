'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, ApiError } from '../../../../lib/api';
import { PublicOrder } from '../../../../lib/types';

export default function ComprobantePage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ code: value }) => {
      setCode(value);
      api<{ order: PublicOrder }>(`/orders/code/${encodeURIComponent(value)}`)
        .then((res) => setOrder(res.order))
        .catch((err) => setError(
          err instanceof ApiError ? err.message : 'No se pudo cargar el comprobante'
        ))
        .finally(() => setLoading(false));
    });
  }, [params]);

  const back = (
    <p className="no-print">
      <a href={`/order/${encodeURIComponent(code)}`}>Volver al pedido</a>
    </p>
  );

  if (loading) return <main><p>Cargando comprobante…</p></main>;
  if (error) return <main><h1>Comprobante</h1><p role="alert">{error}</p>{back}</main>;
  if (!order) {
    return <main><h1>Comprobante</h1><p role="alert">No se pudo cargar el comprobante</p>{back}</main>;
  }
  if (!order.comprobante) {
    return (
      <main>
        <h1>Comprobante</h1>
        <p>El comprobante todavía no fue emitido.</p>
        {back}
      </main>
    );
  }

  const comprobante = order.comprobante;
  return (
    <main className="comprobante">
      <h1>Comprobante</h1>
      <p>Número: <strong>{comprobante.numero}</strong></p>
      <p>Fecha de emisión: {comprobante.fechaEmision}</p>
      <p>Pedido: {order.code}</p>
      <p>Estado: {order.status}</p>
      <p>Hora de recojo: {order.pickupTime}</p>
      <table>
        <thead>
          <tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th></tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={`${item.name}-${item.quantity}`}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>Bs {item.unitPriceBs}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="comprobante-total">Total: Bs {order.totalBs}</p>
      <div
        className="comprobante-qr"
        data-testid="comprobante-qr"
        role="img"
        aria-label={`QR del pedido ${order.code}`}
      >
        <QRCodeSVG value={order.code} size={160} level="M" />
      </div>
      <p className="no-print">
        <button type="button" onClick={() => window.print()}>Imprimir / guardar como PDF</button>
      </p>
      {back}
    </main>
  );
}
