'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { CashierOrder, CashierOrderDetail, OrderStatus } from '../lib/types';

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDIENTE: 'CONFIRMADO',
  CONFIRMADO: 'PREPARANDO',
  PREPARANDO: 'LISTO'
};

export interface ShiftSaleItem {
  orderId: string;
  orderCode: string;
  customerName: string;
  pickupTime: string;
  totalBs: string;
  paymentMethod: string;
  deliveredAt: string;
}

export interface CashierShift {
  id: string;
  cashierName: string;
  openedAt: string;
  initialCashBs: number;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string;
  closingNotes?: string;
  actualCashInDrawerBs?: number;
  sales: ShiftSaleItem[];
}

const SHIFT_STORAGE_KEY = 'saltenanga_cashier_shift_v2';
const SHIFT_HISTORY_KEY = 'saltenanga_cashier_shift_history_v2';

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function expiryLabel(expiresAt: string, now = Date.now()): string {
  const time = new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(expiresAt));
  const minutes = Math.ceil((new Date(expiresAt).getTime() - now) / 60000);
  if (minutes <= 0) return `${time} — Vencido`;
  if (minutes < 10) return `${time} — Vence en ${minutes} min`;
  return time;
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: 'America/La_Paz',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CashierOrders() {
  const [orders, setOrders] = useState<CashierOrder[]>([]);
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<CashierOrderDetail | null>(null);
  const [message, setMessage] = useState('');
  const normalizedCode = normalizeCode(code);

  // Estado del Turno
  const [shift, setShift] = useState<CashierShift | null>(null);
  const [lastClosedShift, setLastClosedShift] = useState<CashierShift | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [showLastReportModal, setShowLastReportModal] = useState(false);

  // Formulario Apertura
  const [openCashierName, setOpenCashierName] = useState('Cajero Principal');
  const [openInitialCash, setOpenInitialCash] = useState('0.00');

  // Formulario Cierre
  const [closeActualCash, setCloseActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  // Cargar estado guardado de turno en localStorage
  useEffect(() => {
    try {
      const storedActive = localStorage.getItem(SHIFT_STORAGE_KEY);
      if (storedActive) {
        const parsed: CashierShift = JSON.parse(storedActive);
        if (parsed.status === 'OPEN') {
          setShift(parsed);
        }
      }
      const storedHistory = localStorage.getItem(SHIFT_HISTORY_KEY);
      if (storedHistory) {
        const history: CashierShift[] = JSON.parse(storedHistory);
        if (history.length > 0) {
          setLastClosedShift(history[history.length - 1]);
        }
      }
    } catch {
      // Ignorar error de acceso a localStorage en entornos restringidos
    }
  }, []);

  // Guardar estado del turno activo
  const saveActiveShift = useCallback((currentShift: CashierShift | null) => {
    setShift(currentShift);
    try {
      if (currentShift && currentShift.status === 'OPEN') {
        localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(currentShift));
      } else {
        localStorage.removeItem(SHIFT_STORAGE_KEY);
      }
    } catch {
      // Ignorar errores en entornos sin storage
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ orders: CashierOrder[] }>('/cashier/orders');
      setOrders(res.orders);
    } catch {
      setMessage('No se pudo actualizar la lista');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const change = async (order: CashierOrder, status: OrderStatus) => {
    setMessage('');
    try {
      await api(`/cashier/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado');
    }
  };

  const cancel = async (order: CashierOrder) => {
    if (!window.confirm(`¿Cancelar el pedido ${order.code}?`)) return;
    await change(order, 'CANCELADO');
  };

  const search = async () => {
    setMessage('');
    try {
      const res = await api<{ order: CashierOrderDetail }>(
        `/cashier/orders/code/${encodeURIComponent(normalizedCode)}`
      );
      setSelected(res.order);
      if (res.order.status !== 'LISTO') setMessage('El pedido no está listo para entrega');
    } catch (err) {
      setSelected(null);
      setMessage(err instanceof ApiError ? err.message : 'Pedido no encontrado');
    }
  };

  const deliver = async () => {
    if (!selected) return;
    setMessage('');
    try {
      const res = await api<{ comprobante: { numero: string } }>(
        `/cashier/orders/${selected.id}/deliver`,
        { method: 'POST', body: JSON.stringify({ code: normalizedCode }) }
      );
      const numeroComprobante = res.comprobante?.numero ?? '';
      setMessage(`Comprobante ${numeroComprobante}`);

      // Registrar venta en el turno actual
      const saleItem: ShiftSaleItem = {
        orderId: selected.id,
        orderCode: selected.code,
        customerName: selected.customerName ?? 'Invitado',
        pickupTime: selected.pickupTime ?? '',
        totalBs: selected.totalBs,
        paymentMethod: selected.paymentMethod ?? 'EFECTIVO',
        deliveredAt: new Date().toISOString()
      };

      setShift((prev) => {
        const baseShift: CashierShift = prev ?? {
          id: String(Date.now()),
          cashierName: openCashierName || 'Cajero de turno',
          openedAt: new Date().toISOString(),
          initialCashBs: parseFloat(openInitialCash) || 0,
          status: 'OPEN',
          sales: []
        };
        const alreadyInSales = baseShift.sales.some((s) => s.orderId === saleItem.orderId);
        const updatedShift: CashierShift = {
          ...baseShift,
          sales: alreadyInSales ? baseShift.sales : [...baseShift.sales, saleItem]
        };
        try {
          localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(updatedShift));
        } catch {
          // Ignorar
        }
        return updatedShift;
      });

      setSelected(null);
      setCode('');
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo entregar el pedido');
    }
  };

  // Acciones de Apertura y Cierre de Turno
  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const initialCash = Math.max(0, parseFloat(openInitialCash) || 0);
    const newShift: CashierShift = {
      id: String(Date.now()),
      cashierName: openCashierName.trim() || 'Cajero Principal',
      openedAt: new Date().toISOString(),
      initialCashBs: initialCash,
      status: 'OPEN',
      sales: []
    };
    saveActiveShift(newShift);
    setMessage(`Turno abierto con éxito por ${newShift.cashierName}`);
  };

  const handleConfirmCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return;

    const actualCash = parseFloat(closeActualCash);
    const closedShift: CashierShift = {
      ...shift,
      status: 'CLOSED',
      closedAt: new Date().toISOString(),
      closingNotes: closeNotes.trim(),
      actualCashInDrawerBs: isNaN(actualCash) ? undefined : actualCash
    };

    // Guardar en historial
    try {
      const historyStr = localStorage.getItem(SHIFT_HISTORY_KEY);
      const history: CashierShift[] = historyStr ? JSON.parse(historyStr) : [];
      history.push(closedShift);
      localStorage.setItem(SHIFT_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Ignorar
    }

    setLastClosedShift(closedShift);
    saveActiveShift(null);
    setShowCloseModal(false);
    setShowLastReportModal(true);
    setCloseActualCash('');
    setCloseNotes('');
    setMessage('Turno cerrado correctamente. Puedes ver e imprimir el reporte de arqueo.');
  };

  // Métricas financieras calculadas para el turno activo
  const shiftMetrics = useMemo(() => {
    if (!shift) return { count: 0, efectivo: 0, qr: 0, transferencia: 0, totalVentas: 0, totalEfectivoCaja: 0 };
    let efectivo = 0;
    let qr = 0;
    let transferencia = 0;

    for (const sale of shift.sales) {
      const amount = parseFloat(sale.totalBs) || 0;
      const method = (sale.paymentMethod || '').toUpperCase();
      if (method.includes('QR')) {
        qr += amount;
      } else if (method.includes('TRANS') || method.includes('BANCO')) {
        transferencia += amount;
      } else {
        efectivo += amount;
      }
    }

    const totalVentas = efectivo + qr + transferencia;
    const totalEfectivoCaja = shift.initialCashBs + efectivo;

    return {
      count: shift.sales.length,
      efectivo,
      qr,
      transferencia,
      totalVentas,
      totalEfectivoCaja
    };
  }, [shift]);

  // Métricas para el reporte de turno cerrado
  const reportMetrics = useMemo(() => {
    const reportShift = showCloseModal ? shift : lastClosedShift;
    if (!reportShift) return { count: 0, efectivo: 0, qr: 0, transferencia: 0, totalVentas: 0, totalEfectivoCaja: 0 };
    let efectivo = 0;
    let qr = 0;
    let transferencia = 0;

    for (const sale of reportShift.sales) {
      const amount = parseFloat(sale.totalBs) || 0;
      const method = (sale.paymentMethod || '').toUpperCase();
      if (method.includes('QR')) {
        qr += amount;
      } else if (method.includes('TRANS') || method.includes('BANCO')) {
        transferencia += amount;
      } else {
        efectivo += amount;
      }
    }

    const totalVentas = efectivo + qr + transferencia;
    const totalEfectivoCaja = reportShift.initialCashBs + efectivo;

    return {
      count: reportShift.sales.length,
      efectivo,
      qr,
      transferencia,
      totalVentas,
      totalEfectivoCaja
    };
  }, [showCloseModal, shift, lastClosedShift]);

  const activeDifference = useMemo(() => {
    if (!closeActualCash || isNaN(parseFloat(closeActualCash))) return null;
    const actual = parseFloat(closeActualCash);
    return actual - shiftMetrics.totalEfectivoCaja;
  }, [closeActualCash, shiftMetrics.totalEfectivoCaja]);

  return (
    <section className="cashier-container">
      {message && <p className="alert" role="status">{message}</p>}

      {/* PANEL DE CONTROL DE TURNO */}
      <div className="shift-management-panel">
        {!shift ? (
          <div className="shift-card shift-card-closed">
            <div className="shift-card-header">
              <span className="shift-badge badge-closed">Turno de caja cerrado</span>
              <p className="shift-hint">
                Inicia tu turno de caja para registrar y cuadrar los pedidos, cobros y ventas del día.
              </p>
            </div>
            <form onSubmit={handleOpenShift} className="shift-open-form">
              <div className="shift-form-row">
                <div className="shift-form-field">
                  <label htmlFor="cashier-name">Nombre del cajero</label>
                  <input
                    id="cashier-name"
                    type="text"
                    required
                    value={openCashierName}
                    onChange={(e) => setOpenCashierName(e.target.value)}
                    placeholder="Ej. Ana Maydana"
                  />
                </div>
                <div className="shift-form-field">
                  <label htmlFor="initial-cash">Monto inicial en caja (Bs)</label>
                  <input
                    id="initial-cash"
                    type="number"
                    step="0.50"
                    min="0"
                    required
                    value={openInitialCash}
                    onChange={(e) => setOpenInitialCash(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="shift-form-submit">
                  <button type="submit" className="button-link btn-open-shift">
                    Abrir turno de caja
                  </button>
                </div>
              </div>
            </form>
            {lastClosedShift && (
              <div className="shift-previous-summary">
                <span>Último turno cerrado: {formatDateTime(lastClosedShift.closedAt || lastClosedShift.openedAt)}</span>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => setShowLastReportModal(true)}
                >
                  Ver último arqueo
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="shift-card shift-card-active">
            <div className="shift-card-header">
              <div className="shift-active-meta">
                <span className="shift-badge badge-open">Turno activo</span>
                <span className="shift-active-info">
                  <strong>Cajero:</strong> {shift.cashierName} &bull;{' '}
                  <strong>Apertura:</strong> {formatDateTime(shift.openedAt)} &bull;{' '}
                  <strong>Caja inicial:</strong> Bs {shift.initialCashBs.toFixed(2)}
                </span>
              </div>
              <div className="shift-header-actions">
                <button
                  type="button"
                  className="btn-action btn-edit"
                  onClick={() => setShowSalesModal(true)}
                >
                  Ventas del turno ({shift.sales.length})
                </button>
                <button
                  type="button"
                  className="btn-action btn-delete"
                  onClick={() => setShowCloseModal(true)}
                >
                  Cerrar turno y arqueo
                </button>
              </div>
            </div>

            {/* Tarjetas de Métricas en Tiempo Real */}
            <div className="shift-metrics-grid">
              <div className="metric-card">
                <span className="metric-title">Pedidos entregados</span>
                <span className="metric-value">{shiftMetrics.count}</span>
                <span className="metric-detail">En este turno</span>
              </div>
              <div className="metric-card">
                <span className="metric-title">Ventas en efectivo</span>
                <span className="metric-value">Bs {shiftMetrics.efectivo.toFixed(2)}</span>
                <span className="metric-detail">Cobrado en caja</span>
              </div>
              <div className="metric-card">
                <span className="metric-title">QR y Transferencias</span>
                <span className="metric-value">
                  Bs {(shiftMetrics.qr + shiftMetrics.transferencia).toFixed(2)}
                </span>
                <span className="metric-detail">
                  QR: Bs {shiftMetrics.qr.toFixed(2)} | Transf: Bs {shiftMetrics.transferencia.toFixed(2)}
                </span>
              </div>
              <div className="metric-card metric-card-highlight">
                <span className="metric-title">Total ventas del turno</span>
                <span className="metric-value">Bs {shiftMetrics.totalVentas.toFixed(2)}</span>
                <span className="metric-detail">
                  Efectivo total esperado: Bs {shiftMetrics.totalEfectivoCaja.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CONTROLES DE BÚSQUEDA Y PEDIDOS */}
      <div className="cashier-controls">
        <div className="cashier-search">
          <label htmlFor="cashier-code">Código del pedido (escaneá o escribí)</label>
          <div className="cashier-input-group">
            <input
              id="cashier-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ej: SLT-1234"
            />
            <button type="button" onClick={() => { void search(); }}>
              Buscar
            </button>
          </div>
        </div>
        <div className="cashier-actions">
          {selected?.status === 'LISTO' && selected.code === normalizedCode && (
            <button
              type="button"
              className="btn-action btn-edit"
              onClick={() => { void deliver(); }}
            >
              Confirmar entrega
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { void refresh(); }}
          >
            Actualizar lista
          </button>
        </div>
      </div>

      {/* TABLA DE PEDIDOS */}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente</th>
              <th>Recojo</th>
              <th>Vencimiento</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Pago</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.code}</td>
                <td>{order.customerName ?? 'Invitado'}</td>
                <td>{order.pickupTime}</td>
                <td>{expiryLabel(order.expiresAt)}</td>
                <td>{order.status}</td>
                <td>Bs {order.totalBs}</td>
                <td>{order.paymentMethod}</td>
                <td>
                  <div className="table-actions">
                    {NEXT[order.status] && (
                      <button
                        type="button"
                        className="btn-action btn-edit"
                        onClick={() => {
                          const next = NEXT[order.status];
                          if (next) void change(order, next);
                        }}
                      >
                        {order.status === 'PENDIENTE'
                          ? 'Confirmar'
                          : order.status === 'CONFIRMADO'
                          ? 'Preparar'
                          : 'Marcar listo'}
                      </button>
                    )}
                    {(order.status === 'PENDIENTE' || order.status === 'CONFIRMADO') && (
                      <button
                        type="button"
                        className="btn-action btn-delete"
                        onClick={() => { void cancel(order); }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL / VISTA DE CIERRE DE TURNO Y ARQUEO */}
      {showCloseModal && shift && (
        <div className="shift-modal-overlay">
          <div className="shift-modal-content">
            <div className="shift-modal-header">
              <h2>Cierre de Turno y Arqueo de Caja</h2>
              <button
                type="button"
                className="cart-close"
                onClick={() => setShowCloseModal(false)}
                aria-label="Cerrar modal"
              >
                &times;
              </button>
            </div>
            <div className="shift-modal-body">
              <div className="shift-summary-block">
                <p><strong>Cajero:</strong> {shift.cashierName}</p>
                <p><strong>Hora de apertura:</strong> {formatDateTime(shift.openedAt)}</p>
                <p><strong>Hora de cierre:</strong> {formatDateTime(new Date().toISOString())}</p>
                <p><strong>Pedidos entregados:</strong> {shiftMetrics.count}</p>
              </div>

              <div className="shift-arqueo-table">
                <table>
                  <tbody>
                    <tr>
                      <td>Fondo inicial en caja:</td>
                      <td className="text-right">Bs {shift.initialCashBs.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>(+) Ventas en efectivo:</td>
                      <td className="text-right">Bs {shiftMetrics.efectivo.toFixed(2)}</td>
                    </tr>
                    <tr className="row-highlight">
                      <td><strong>(=) Efectivo esperado en caja:</strong></td>
                      <td className="text-right"><strong>Bs {shiftMetrics.totalEfectivoCaja.toFixed(2)}</strong></td>
                    </tr>
                    <tr>
                      <td>(+) Ventas por QR:</td>
                      <td className="text-right">Bs {shiftMetrics.qr.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>(+) Ventas por Transferencia:</td>
                      <td className="text-right">Bs {shiftMetrics.transferencia.toFixed(2)}</td>
                    </tr>
                    <tr className="row-total">
                      <td><strong>TOTAL RECAUDADO EN EL TURNO:</strong></td>
                      <td className="text-right"><strong>Bs {shiftMetrics.totalVentas.toFixed(2)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Formulario de Arqueo Físico */}
              <form onSubmit={handleConfirmCloseShift} className="shift-close-form">
                <div className="shift-form-field">
                  <label htmlFor="actual-cash">Efectivo real contado en caja (Bs)</label>
                  <input
                    id="actual-cash"
                    type="number"
                    step="0.50"
                    min="0"
                    required
                    value={closeActualCash}
                    onChange={(e) => setCloseActualCash(e.target.value)}
                    placeholder={`Esperado: ${shiftMetrics.totalEfectivoCaja.toFixed(2)}`}
                  />
                  {activeDifference !== null && (
                    <div className={`difference-pill ${activeDifference === 0 ? 'diff-ok' : activeDifference > 0 ? 'diff-plus' : 'diff-minus'}`}>
                      {activeDifference === 0 && 'Caja cuadrada exactamente (Diferencia: Bs 0.00)'}
                      {activeDifference > 0 && `Sobrante de caja: +Bs ${activeDifference.toFixed(2)}`}
                      {activeDifference < 0 && `Faltante de caja: -Bs ${Math.abs(activeDifference).toFixed(2)}`}
                    </div>
                  )}
                </div>

                <div className="shift-form-field">
                  <label htmlFor="close-notes">Notas u observaciones del turno (opcional)</label>
                  <textarea
                    id="close-notes"
                    rows={2}
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Ej. Todo en orden, sin novedades."
                  />
                </div>

                <div className="shift-modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => window.print()}
                  >
                    Imprimir arqueo
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowCloseModal(false)}
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    className="button-link btn-confirm-close"
                  >
                    Confirmar cierre de turno
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE VENTAS DEL TURNO */}
      {showSalesModal && shift && (
        <div className="shift-modal-overlay">
          <div className="shift-modal-content">
            <div className="shift-modal-header">
              <h2>Ventas Entregadas en el Turno Actual</h2>
              <button
                type="button"
                className="cart-close"
                onClick={() => setShowSalesModal(false)}
                aria-label="Cerrar modal"
              >
                &times;
              </button>
            </div>
            <div className="shift-modal-body">
              {shift.sales.length === 0 ? (
                <p className="cart-empty">No se han registrado entregas todavía en este turno.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Código</th>
                        <th>Cliente</th>
                        <th>Hora</th>
                        <th>Método</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shift.sales.map((sale, idx) => (
                        <tr key={sale.orderId || idx}>
                          <td>{idx + 1}</td>
                          <td><strong>{sale.orderCode}</strong></td>
                          <td>{sale.customerName}</td>
                          <td>{formatDateTime(sale.deliveredAt)}</td>
                          <td>{sale.paymentMethod}</td>
                          <td>Bs {sale.totalBs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="shift-modal-actions" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowSalesModal(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REPORTE DE ÚLTIMO TURNO CERRADO */}
      {showLastReportModal && lastClosedShift && (
        <div className="shift-modal-overlay">
          <div className="shift-modal-content print-target">
            <div className="shift-modal-header">
              <h2>Reporte de Turno y Arqueo de Caja</h2>
              <button
                type="button"
                className="cart-close no-print"
                onClick={() => setShowLastReportModal(false)}
                aria-label="Cerrar reporte"
              >
                &times;
              </button>
            </div>
            <div className="shift-modal-body">
              <div className="shift-summary-block">
                <p><strong>Cajero:</strong> {lastClosedShift.cashierName}</p>
                <p><strong>Apertura:</strong> {formatDateTime(lastClosedShift.openedAt)}</p>
                <p><strong>Cierre:</strong> {formatDateTime(lastClosedShift.closedAt || lastClosedShift.openedAt)}</p>
                <p><strong>Pedidos entregados:</strong> {reportMetrics.count}</p>
                {lastClosedShift.closingNotes && (
                  <p><strong>Observaciones:</strong> {lastClosedShift.closingNotes}</p>
                )}
              </div>

              <div className="shift-arqueo-table">
                <table>
                  <tbody>
                    <tr>
                      <td>Fondo inicial en caja:</td>
                      <td className="text-right">Bs {lastClosedShift.initialCashBs.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>(+) Ventas en efectivo:</td>
                      <td className="text-right">Bs {reportMetrics.efectivo.toFixed(2)}</td>
                    </tr>
                    <tr className="row-highlight">
                      <td><strong>(=) Efectivo esperado en caja:</strong></td>
                      <td className="text-right"><strong>Bs {reportMetrics.totalEfectivoCaja.toFixed(2)}</strong></td>
                    </tr>
                    {lastClosedShift.actualCashInDrawerBs !== undefined && (
                      <tr>
                        <td>Efectivo real contado en caja:</td>
                        <td className="text-right">Bs {lastClosedShift.actualCashInDrawerBs.toFixed(2)}</td>
                      </tr>
                    )}
                    {lastClosedShift.actualCashInDrawerBs !== undefined && (
                      <tr className="row-highlight">
                        <td>Diferencia de caja:</td>
                        <td className="text-right">
                          {lastClosedShift.actualCashInDrawerBs - reportMetrics.totalEfectivoCaja === 0
                            ? 'Bs 0.00 (Cuadrada)'
                            : `${lastClosedShift.actualCashInDrawerBs - reportMetrics.totalEfectivoCaja > 0 ? '+' : ''}Bs ${(lastClosedShift.actualCashInDrawerBs - reportMetrics.totalEfectivoCaja).toFixed(2)}`}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td>(+) Ventas por QR:</td>
                      <td className="text-right">Bs {reportMetrics.qr.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>(+) Ventas por Transferencia:</td>
                      <td className="text-right">Bs {reportMetrics.transferencia.toFixed(2)}</td>
                    </tr>
                    <tr className="row-total">
                      <td><strong>TOTAL RECAUDADO EN EL TURNO:</strong></td>
                      <td className="text-right"><strong>Bs {reportMetrics.totalVentas.toFixed(2)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {lastClosedShift.sales.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h3>Detalle de Pedidos</h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Cliente</th>
                          <th>Hora</th>
                          <th>Pago</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastClosedShift.sales.map((sale, idx) => (
                          <tr key={sale.orderId || idx}>
                            <td>{sale.orderCode}</td>
                            <td>{sale.customerName}</td>
                            <td>{formatDateTime(sale.deliveredAt)}</td>
                            <td>{sale.paymentMethod}</td>
                            <td>Bs {sale.totalBs}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="shift-modal-actions no-print" style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => window.print()}
                >
                  Imprimir / Guardar reporte
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowLastReportModal(false)}
                >
                  Cerrar vista
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
