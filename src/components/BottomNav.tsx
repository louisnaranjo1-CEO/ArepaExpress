import { Home, Search, ShoppingBag, User, Car } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { vibrate } from '../utils/haptics';

export default function BottomNav() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { totalItems } = useCart();

  return (
    <nav className="relative z-50 bg-white border-t border-slate-100 pb-safe shrink-0">
      <div className="flex items-center justify-around px-2 py-3">
        <Link to="/" onClick={() => vibrate(30)} className="flex flex-col items-center gap-1 flex-1 group">
          <Home className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/' ? 'text-primary fill-primary/20' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Inicio</span>
        </Link>
        <Link to="/search" onClick={() => vibrate(30)} className="flex flex-col items-center gap-1 flex-1 group">
          <Search className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/search' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/search' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Encuentralo</span>
        </Link>
        <Link to="/taxi" onClick={() => vibrate(30)} className="relative flex flex-col items-center justify-center flex-1 group">
          <div className="bg-primary p-2.5 rounded-2xl shadow-[0_8px_16px_rgba(244,140,37,0.3)] transition-transform group-hover:scale-110 flex items-center justify-center">
            <Car className="w-6 h-6 text-secondary stroke-[2.5]" />
          </div>
          <span className="text-[10px] font-black text-secondary mt-1">Taxi</span>
        </Link>
        <Link to="/cart" onClick={() => vibrate(30)} className="relative flex flex-col items-center gap-1 flex-1 group">
          <div className="relative">
            <ShoppingBag className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/cart' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[8px] font-black text-white ring-2 ring-white shadow-md">
                {totalItems}
              </span>
            )}
          </div>
          <span className={`text-[10px] font-bold ${currentPath === '/cart' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Pedidos</span>
        </Link>
        <Link to="/profile" onClick={() => vibrate(30)} className="flex flex-col items-center gap-1 flex-1 group">
          <User className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/profile' ? 'text-primary fill-primary/20' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/profile' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Perfil</span>
        </Link>
      </div>
    </nav>
  );
}
