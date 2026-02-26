import { Home, Search, ShoppingBag, Heart, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function BottomNav() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <nav className="relative z-50 bg-white border-t border-slate-100 pb-safe shrink-0">
      <div className="flex items-center justify-around px-2 py-3">
        <Link to="/" className="flex flex-col items-center gap-1 flex-1 group">
          <Home className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/' ? 'text-primary fill-primary/20' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Inicio</span>
        </Link>
        <Link to="/search" className="flex flex-col items-center gap-1 flex-1 group">
          <Search className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/search' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/search' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Buscar</span>
        </Link>
        <Link to="/cart" className="relative flex flex-col items-center gap-1 flex-1 group">
          <ShoppingBag className={`w-6 h-6 transition-transform group-hover:scale-110 ${currentPath === '/cart' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
          <span className={`text-[10px] font-bold ${currentPath === '/cart' ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`}>Pedidos</span>
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
