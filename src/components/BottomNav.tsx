import { Home, Search, ShoppingBag, Heart, User, Car } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export default function BottomNav() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { totalItems } = useCart();

  return (
    <nav className="relative z-50 bg-white border-t border-slate-100 pb-safe shrink-0">
      <div className="flex items-center justify-around px-2 py-3">
        <Link to="/" className="flex flex-col items-center gap-1 flex-1 group">
          <Home className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/' ? 'text-primary fill-primary/20' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Inicio</span>
        </Link>
        <Link to="/cart" className="flex flex-col items-center gap-1 flex-1 group">
          <ShoppingBag className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/cart' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/cart' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Pedidos</span>
        </Link>
        <Link to="/taxi" className="relative flex flex-col items-center gap-1 flex-1 group">
          <Car className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/taxi' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
          {totalItems > 0 && (
            <span className="absolute top-0 right-1/4 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-black text-white ring-2 ring-white">
              {totalItems}
            </span>
          )}
          <span className={`text-[10px] font-bold ${currentPath === '/taxi' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Taxi</span>
        </Link>
        <Link to="/favorites" className="flex flex-col items-center gap-1 flex-1 group">
          <Heart className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/favorites' ? 'text-primary fill-primary/20' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/favorites' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Favoritos</span>
        </Link>
        <Link to="/profile" className="flex flex-col items-center gap-1 flex-1 group">
          <User className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/profile' ? 'text-primary fill-primary/20' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/profile' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Perfil</span>
        </Link>
      </div>
    </nav>
  );
}
