import ClientApp from './ClientApp';
import AdminApp from './admin/AdminApp';
import CpanelApp from './cpanel/CpanelApp';
import WaiterApp from './waiter/WaiterApp';
import DeliveryApp from './delivery/DeliveryApp';
import CashierApp from './cashier/CashierApp';

function App() {
  const isDevAdminPath = window.location.pathname.startsWith('/admin');
  const isAdminSubdomain = window.location.hostname.startsWith('restaurante.');
  const isCpanelSubdomain = window.location.hostname.startsWith('cpanel.') || window.location.pathname.startsWith('/cpanel');
  const isWaiterSubdomain = window.location.hostname.startsWith('meseros.');
  const isDeliveryPath = window.location.pathname.startsWith('/delivery') || window.location.hostname.startsWith('delivery.');
  const isCashierSubdomain = window.location.hostname.startsWith('caja.') || window.location.pathname.startsWith('/caja');

  if (isDeliveryPath) {
    return <DeliveryApp />;
  }

  if (isCpanelSubdomain) {
    return <CpanelApp />;
  }

  if (isWaiterSubdomain) {
    return <WaiterApp />;
  }

  if (isCashierSubdomain) {
    return <CashierApp />;
  }

  if (isDevAdminPath || isAdminSubdomain) {
    return <AdminApp />;
  }

  return <ClientApp />;
}

export default App;
