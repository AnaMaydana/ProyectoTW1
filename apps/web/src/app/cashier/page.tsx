import { CashierOrders } from '../../components/CashierOrders';

export default function CashierHome() {
  return (
    <section>
      <h1>Cajero</h1>
      <p>Gestión de pedidos, apertura y cierre de turno con arqueo de caja.</p>
      <CashierOrders />
    </section>
  );
}
