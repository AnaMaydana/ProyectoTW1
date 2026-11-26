'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { ReportRow } from '../../../lib/types';

const HEADERS: Record<string, string> = {
  fecha: 'Fecha', pedidos: 'Pedidos', totalBs: 'Total Bs',
  productId: 'Producto', nombre: 'Nombre', unidades: 'Unidades',
  estado: 'Estado', stock: 'Stock'
};

export default function AdminReports() {
  const [sales, setSales] = useState<ReportRow[]>([]);
  const [top, setTop] = useState<ReportRow[]>([]);
  const [status, setStatus] = useState<ReportRow[]>([]);
  const [low, setLow] = useState<ReportRow[]>([]);
  const [error, setError] = useState('');

  const load = (path: string, setter: (rows: ReportRow[]) => void, fallback: string) => {
    api<{ rows: ReportRow[] }>(path)
      .then((r) => setter(r.rows))
      .catch((err) => setError(err instanceof Error ? err.message : fallback));
  };

  useEffect(() => {
    load('/admin/reports/sales', setSales, 'No se pudo cargar el reporte de ventas');
    load('/admin/reports/top-products', setTop, 'No se pudo cargar el reporte de productos');
    load('/admin/reports/orders-by-status', setStatus, 'No se pudo cargar el reporte de pedidos');
    load('/admin/reports/low-stock', setLow, 'No se pudo cargar el reporte de stock');
  }, []);

  function table(title: string, rows: ReportRow[]) {
    const keys = rows.length ? Object.keys(rows[0]) : [];
    return (
      <section key={title}>
        <h2>{title}</h2>
        <div className="table-scroll">
          <table>
            <thead><tr>{keys.map((k) => <th key={k}>{HEADERS[k] ?? k}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => (
              <tr key={i}>{keys.map((k) => <td key={k}>{String(row[k])}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>Reportes</h1>
      {error && <p role="alert">{error}</p>}
      {table('Ventas por día', sales)}
      {table('Productos más vendidos', top)}
      {table('Pedidos por estado', status)}
      {table('Stock bajo', low)}
    </section>
  );
}
