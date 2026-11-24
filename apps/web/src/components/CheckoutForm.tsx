'use client';

import { useState } from 'react';
import { PaymentMethod } from '../lib/types';

export interface CheckoutData {
  pickupTime: string;
  notes: string;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
}

export function CheckoutForm({
  expiresAt,
  now = () => new Date(),
  showCustomerFields = false,
  onSubmit
}: {
  expiresAt: string;
  now?: () => Date;
  showCustomerFields?: boolean;
  onSubmit: (data: CheckoutData) => void;
}) {
  const [pickupTime, setPickupTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const minutes = Math.floor(
    (new Date(expiresAt).getTime() - now().getTime()) / 60000
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ pickupTime, notes, paymentMethod, customerName, customerPhone });
      }}
    >
      {showCustomerFields && (
        <>
          <label>
            Nombre
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          </label>
          <label>
            Celular
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required />
          </label>
        </>
      )}
      {minutes > 0 && minutes < 10 && (
        <p role="alert">Te quedan menos de 10 minutos para recoger tu pedido</p>
      )}
      {minutes <= 0 && (
        <p role="alert">El tiempo de recojo venció. Llamá al local antes de confirmar.</p>
      )}
      <label>
        Hora de recojo
        <input
          type="time"
          min="06:00"
          max="11:00"
          value={pickupTime}
          onChange={(e) => setPickupTime(e.target.value)}
          required
        />
      </label>
      <label>
        Observaciones
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label>
        Método de pago
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
        >
          <option value="EFECTIVO">Efectivo</option>
          <option value="QR">QR</option>
          <option value="TRANSFERENCIA">Transferencia</option>
        </select>
      </label>
      <button type="submit">Confirmar pedido</button>
    </form>
  );
}
