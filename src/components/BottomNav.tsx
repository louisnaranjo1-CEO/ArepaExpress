import { Home, Search, LifeBuoy, User, Car } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { vibrate } from '../utils/haptics';
import LocationRequiredModal from './LocationRequiredModal';
import React, { useState } from 'react';

export default function BottomNav() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [showLocationModal, setShowLocationModal] = useState(false);

  const handleTaxiClick = (e: React.MouseEvent) => {
    vibrate(30);
    if (!userData?.locationPermissionsAllowed) {
        e.preventDefault();
        setShowLocationModal(true);
    }
  };

  return (
    <nav className="relative z-50 bg-white border-t border-slate-100 pb-safe shrink-0">
      <div className="flex items-center justify-around px-2 py-3">
        <Link to="/" onClick={() => vibrate(30)} className="flex flex-col items-center gap-1 flex-1 group">
          <Home className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/' ? 'text-slate-900 fill-primary/20' : 'text-slate-400 group-hover:text-slate-900'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-900'}`}>Inicio</span>
        </Link>
        <Link to="/search" onClick={() => vibrate(30)} className="flex flex-col items-center gap-1 flex-1 group">
          <Search className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/search' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-900'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/search' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-900'}`}>Encuentralo</span>
        </Link>
        <Link 
            to="/taxi" 
            onClick={handleTaxiClick}
            className="relative flex flex-col items-center justify-center flex-1 group"
        >
          <div className="bg-primary p-2.5 rounded-2xl shadow-[0_8px_16px_rgba(244,140,37,0.3)] transition-transform group-hover:scale-110 flex items-center justify-center">
            <Car className="w-6 h-6 text-secondary stroke-[2.5]" />
          </div>
          <span className="text-[10px] font-black text-secondary mt-1">Taxi</span>
        </Link>
        <Link to="/services" onClick={() => vibrate(30)} className="relative flex flex-col items-center gap-1 flex-1 group">
          <LifeBuoy className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/services' ? 'text-slate-900 fill-primary/20' : 'text-slate-400 group-hover:text-slate-900'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/services' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-900'}`}>Servicios</span>
        </Link>
        <Link to="/profile" onClick={() => vibrate(30)} className="flex flex-col items-center gap-1 flex-1 group">
          <User className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/profile' ? 'text-slate-900 fill-primary/20' : 'text-slate-400 group-hover:text-slate-900'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/profile' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-900'}`}>Perfil</span>
        </Link>
      </div>

      <LocationRequiredModal 
        isOpen={showLocationModal} 
        onClose={() => setShowLocationModal(false)} 
      />
    </nav>
  );
}
