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

  useEffect(() => {
    api<{ rows: ReportRow[] }>('/admin/reports/sales').then((r) => setSales(r.rows)).catch(() => {});
    api<{ rows: ReportRow[] }>('/admin/reports/top-products').then((r) => setTop(r.rows)).catch(() => {});
    api<{ rows: ReportRow[] }>('/admin/reports/orders-by-status').then((r) => setStatus(r.rows)).catch(() => {});
    api<{ rows: ReportRow[] }>('/admin/reports/low-stock').then((r) => setLow(r.rows)).catch(() => {});
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
      {table('Ventas por día', sales)}
      {table('Productos más vendidos', top)}
      {table('Pedidos por estado', status)}
      {table('Stock bajo', low)}
    </section>
  );
}
