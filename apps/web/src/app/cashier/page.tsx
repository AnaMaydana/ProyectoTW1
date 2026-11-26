import { CashierOrders } from '../../components/CashierOrders';

export default function CashierHome() {
  return (
    <section>
      <h1>Cajero</h1>
      <p>Pedidos recientes. La lista se actualiza sola cada 4 segundos.</p>
      <CashierOrders />
    </section>
  );
}
