import React, { useState, useEffect } from 'react';
import ClientApp from './ClientApp';
import AdminApp from './admin/AdminApp';
import CpanelApp from './cpanel/CpanelApp';
import WaiterApp from './waiter/WaiterApp';
import DeliveryApp from './delivery/DeliveryApp';
import CashierApp from './cashier/CashierApp';
import { OfflineIndicator } from './components/OfflineIndicator';
import SplashScreen from './components/SplashScreen';

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const isDevAdminPath = window.location.pathname.startsWith('/admin');
  const isAdminSubdomain = window.location.hostname.startsWith('restaurante.');
  const isCpanelSubdomain = window.location.hostname.startsWith('cpanel.') || window.location.pathname.startsWith('/cpanel');
  const isWaiterSubdomain = window.location.hostname.startsWith('meseros.');
  const isDeliveryPath = window.location.pathname.startsWith('/delivery') || window.location.hostname.startsWith('delivery.');
  const isCashierSubdomain = window.location.hostname.startsWith('caja.') || window.location.pathname.startsWith('/caja');

  const renderApp = () => {
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
  };

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <div className={showSplash ? 'hidden' : 'block animate-fade-in'}>
        {renderApp()}
        <OfflineIndicator />
      </div>
    </>
  );
}

export default App;
