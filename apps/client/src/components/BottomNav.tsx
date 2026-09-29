import { Home, Search, ShoppingBag, User, Car } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { vibrate } from '../utils/haptics';
import LocationRequiredModal from './LocationRequiredModal';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function BottomNav() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user, userData } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [activeService, setActiveService] = useState<{ url: string; label: string } | null>(null);

  useEffect(() => {
    const rawUserId = user?.id || user?.uid || (userData as any)?.id || (userData as any)?.uid;
    const localTransportId = localStorage.getItem('active_transport_req_id');
    const localOrderId = localStorage.getItem('active_order_id');

    const checkActiveService = async () => {
      try {
        // 1. Check active transport_requests
        let trQuery = supabase
          .from('transport_requests')
          .select('id, status, service_category, order_id')
          .in('status', ['searching', 'accepted', 'arriving', 'in_progress', 'verifying_payment'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (rawUserId) {
          trQuery = trQuery.or(`user_id.eq.${rawUserId}${localTransportId ? `,id.eq.${localTransportId}` : ''}`);
        } else if (localTransportId) {
          trQuery = trQuery.eq('id', localTransportId);
        } else {
          trQuery = null as any;
        }

        if (trQuery) {
          const { data: trData } = await trQuery;
          if (trData && trData.length > 0) {
            const tr = trData[0];
            const isFood = tr.service_category === 'food_delivery' || Boolean(tr.order_id);
            const isMandado = tr.service_category === 'muchacho_mandado';
            const url = isFood && tr.order_id 
              ? `/track/${tr.order_id}` 
              : isMandado 
              ? `/mandado/tracking/${tr.id}` 
              : `/taxi/track/${tr.id}`;
            setActiveService({
              url,
              label: isFood ? 'Delivery' : isMandado ? 'Mandado' : 'En Viaje'
            });
            return;
          }
        }

        // 2. Check active orders
        let ordQuery = supabase
          .from('orders')
          .select('id, status')
          .not('status', 'in', '("completed","cancelled","rejected","delivered")')
          .order('created_at', { ascending: false })
          .limit(1);

        if (rawUserId) {
          ordQuery = ordQuery.or(`user_id.eq.${rawUserId}${localOrderId ? `,id.eq.${localOrderId}` : ''}`);
        } else if (localOrderId) {
          ordQuery = ordQuery.eq('id', localOrderId);
        } else {
          ordQuery = null as any;
        }

        if (ordQuery) {
          const { data: ordData } = await ordQuery;
          if (ordData && ordData.length > 0) {
            const o = ordData[0];
            setActiveService({
              url: `/track/${o.id}`,
              label: 'Activo'
            });
            return;
          }
        }

        setActiveService(null);
      } catch (err) {
        console.warn('Error checking active service in BottomNav:', err);
      }
    };

    checkActiveService();

    const channel = supabase.channel('bottom_nav_active_check')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, () => {
        checkActiveService();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        checkActiveService();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, (userData as any)?.id]);

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
            to={activeService ? activeService.url : "/taxi"} 
            onClick={(e) => {
              if (activeService) {
                vibrate(30);
                return;
              }
              handleTaxiClick(e);
            }}
            className="relative flex flex-col items-center justify-center flex-1 group"
        >
          <div className="bg-primary p-2.5 rounded-2xl shadow-[0_8px_16px_rgba(244,140,37,0.3)] transition-transform group-hover:scale-110 flex items-center justify-center relative">
            <Car className="w-6 h-6 text-secondary stroke-[2.5]" />
            {activeService && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
              </span>
            )}
          </div>
          <span className={`text-[10px] font-black mt-1 ${activeService ? 'text-emerald-700 animate-pulse' : 'text-secondary'}`}>
            {activeService ? activeService.label : 'Taxi'}
          </span>
        </Link>
        <Link to="/orders" onClick={() => vibrate(30)} className="relative flex flex-col items-center gap-1 flex-1 group">
          <div className="relative">
            <ShoppingBag className={`w-6 h-6 transition-transform group-hover:scale-110 ${(currentPath === '/orders' || currentPath === '/cart') ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-900'}`} />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-black text-slate-900 ring-2 ring-white shadow-md">
                {totalItems}
              </span>
            )}
          </div>
          <span className={`text-[10px] font-bold ${(currentPath === '/orders' || currentPath === '/cart') ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-900'}`}>Pedidos</span>
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
