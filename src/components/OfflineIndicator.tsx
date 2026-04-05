import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl transform scale-100 animate-in fade-in zoom-in duration-300">
        <div className="bg-red-100 text-red-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <WifiOff size={40} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-3">¡Vaya! Te quedaste sin internet</h2>
        <p className="text-gray-600 mb-6">
          Conéctate en un 2x3 para seguir disfrutando de Deliexpress. Verificaremos tu conexión automáticamente.
        </p>
        <div className="animate-pulse flex space-x-2 items-center justify-center">
          <div className="w-3 h-3 bg-red-400 rounded-full"></div>
          <div className="w-3 h-3 bg-red-400 rounded-full animation-delay-200"></div>
          <div className="w-3 h-3 bg-red-400 rounded-full animation-delay-400"></div>
        </div>
      </div>
    </div>
  );
};
