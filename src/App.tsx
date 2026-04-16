import React, { useState, useEffect } from 'react';
import ClientApp from './ClientApp';
import AdminApp from './admin/AdminApp';
import CpanelApp from './cpanel/CpanelApp';
import WaiterApp from './waiter/WaiterApp';
import DeliveryApp from './delivery/DeliveryApp';
import CashierApp from './cashier/CashierApp';
import { OfflineIndicator } from './components/OfflineIndicator';
import SplashScreen from './components/SplashScreen';
import LockScreen from './components/LockScreen';
import { useAuth } from './context/AuthContext';
import { UN2X3_LOGO } from './lib/env';

function App() {
  const { isUnlocked, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  // Solicitar ubicación al cargar
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => console.log("Ubicación permitida"),
        () => console.log("Ubicación denegada")
      );
    }
  }, []);

  const isDevAdminPath = window.location.pathname.startsWith('/admin');
  const isAdminSubdomain = window.location.hostname.startsWith('restaurante.');
  const isCpanelSubdomain = window.location.hostname.startsWith('cpanel.') || window.location.hostname.startsWith('admin.');
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

  // The app is ready when the splash timer finishes AND auth loading is done
  const isTransitioning = showSplash || loading;

  return (
    <div className="w-full h-full bg-white">
      {isTransitioning ? (
        <SplashScreen 
          onComplete={() => setShowSplash(false)} 
          isAuthLoading={loading} 
        />
      ) : (
        <div className="animate-fade-in h-screen overflow-hidden bg-white">
          {!isUnlocked ? <LockScreen /> : renderApp()}
          <OfflineIndicator />
        </div>
      )}
    </div>
  );
}

export default App;
