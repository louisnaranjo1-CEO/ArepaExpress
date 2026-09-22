import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Compass, DollarSign, User, Trophy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { driversApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { setDriverAvailability, AvailabilityStatus } from '../../lib/delivery-service';
import { useGlobalAudioAlerts } from '../../hooks/useGlobalAudioAlerts';
import { UN2X3_LOGO } from '../../lib/env';
import { useBranding } from '../../context/BrandingContext';

interface DeliveryLayoutProps {
    children: React.ReactNode;
}

export default function DeliveryLayout({ children }: DeliveryLayoutProps) {
    const { user } = useAuth();
    const { branding } = useBranding();
    const [driverStatus, setDriverStatus] = useState<AvailabilityStatus>('offline');
    const [updating, setUpdating] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [hasActiveService, setHasActiveService] = useState(false);

    useGlobalAudioAlerts('delivery', user?.uid);

    // Monitor active service in real time for persistent banner & recovery
    useEffect(() => {
        if (!user) return;
        let isMounted = true;

        const checkActive = async () => {
            try {
                const { data: transports } = await supabase
                    .from('transport_requests')
                    .select('id')
                    .eq('driver_id', user.uid)
                    .in('status', ['accepted', 'arriving', 'in_progress'])
                    .limit(1);

                if (transports && transports.length > 0) {
                    if (isMounted) setHasActiveService(true);
                    return;
                }

                const { data: orders } = await supabase
                    .from('orders')
                    .select('id')
                    .eq('delivery_driver_id', user.uid)
                    .in('status', ['en_camino', 'in_transit'])
                    .limit(1);

                if (orders && orders.length > 0) {
                    if (isMounted) setHasActiveService(true);
                    return;
                }

                if (isMounted) setHasActiveService(false);
            } catch (e) {
                console.error("Error checking active service:", e);
            }
        };

        checkActive();

        const channelTransport = supabase.channel(`layout_active_trans_${user.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, checkActive)
            .subscribe();

        const channelOrder = supabase.channel(`layout_active_ord_${user.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, checkActive)
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channelTransport);
            supabase.removeChannel(channelOrder);
        };
    }, [user]);

    useEffect(() => {
        let isMounted = true;
        if (!user) return;

        const fetchStatus = async () => {
            try {
                const profile = await driversApi.getDriver(user.uid);
                if (isMounted) {
                    if (profile) {
                        setDriverStatus((profile.availability as AvailabilityStatus) || (profile.isOnline ? 'active' : 'offline'));
                    } else {
                        setDriverStatus('offline');
                    }
                }
            } catch (error) {
                console.error("Error fetching driver status:", error);
            }
        };

        fetchStatus();

        const channel = supabase.channel(`public:drivers:status:${user.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${user.uid}` }, async () => {
                if (!isMounted) return;
                try {
                    const profile = await driversApi.getDriver(user.uid);
                    if (profile) {
                        setDriverStatus((profile.availability as AvailabilityStatus) || (profile.isOnline ? 'active' : 'offline'));
                    } else {
                        setDriverStatus('offline');
                    }
                } catch(e) {}
            })
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [user]);

    const handleStatusUpdate = async (newStatus: AvailabilityStatus) => {
        if (!user || updating) return;

        setUpdating(true);
        try {
            await setDriverAvailability(user.uid, newStatus);
            setShowPicker(false);
        } catch (error) {
            console.error("Error toggling status", error);
        } finally {
            setUpdating(false);
        }
    };

    const getStatusStyle = (status: AvailabilityStatus) => {
        switch (status) {
            case 'active': return 'bg-emerald-500 text-white';
            case 'busy': return 'bg-amber-500 text-white';
            case 'offline': return 'bg-slate-400 text-white';
            default: return 'bg-slate-400 text-white';
        }
    };

    const getStatusLabel = (status: AvailabilityStatus) => {
        switch (status) {
            case 'active': return 'Activo';
            case 'busy': return 'Ocupado';
            case 'offline': return 'Desconectado';
            default: return 'Desconectado';
        }
    };

    const navItems = [
        { path: '/radar', icon: Compass, label: 'Radar' },
        { path: '/earnings', icon: DollarSign, label: 'Ganancias' },
        { path: '/achievements', icon: Trophy, label: 'Logros' },
        { path: '/profile', icon: User, label: 'Perfil' },
    ];

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 w-full max-w-md mx-auto relative overflow-hidden shadow-2xl">
            {/* Cabecera Fija con Safe Area para Móviles */}
            <header className="bg-secondary text-white px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3.5 flex items-center justify-between shadow-md z-[60] shrink-0">
                <div className="flex items-center gap-2">
                    <img
                        src={branding.app_driver_logo || UN2X3_LOGO}
                        alt="Logo Repartidor"
                        className="w-10 h-10 object-contain"
                        onError={(e: any) => { e.target.src = '/icon-192.png'; }}
                    />
                    <div>
                        <h1 className="font-black text-lg tracking-tighter leading-none">Centro de comandas</h1>
                        <p className="text-[10px] font-bold text-white/70 italic leading-none mt-1">Llega en un 2x3 a tu destino.</p>
                    </div>
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowPicker(!showPicker)}
                        disabled={updating}
                        className={`flex items-center gap-2 px-4 py-2 rounded-2xl transition-all shadow-lg active:scale-95 ${getStatusStyle(driverStatus)} shadow-${driverStatus === 'active' ? 'emerald' : driverStatus === 'busy' ? 'amber' : 'slate'}-500/20`}
                    >
                        <span className={`w-2.5 h-2.5 rounded-full bg-white shadow-sm ${driverStatus === 'active' ? 'animate-pulse' : ''}`}></span>
                        <span className="text-[12px] font-black uppercase tracking-widest">
                            {updating ? '...' : getStatusLabel(driverStatus)}
                        </span>
                    </button>

                    {showPicker && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-[24px] shadow-2xl border border-slate-100 p-2 overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-200">
                            {[
                                { id: 'active', label: 'Activo', color: 'emerald', desc: 'Recibir pedidos ya' },
                                { id: 'busy', label: 'Ocupado', color: 'amber', desc: 'En otra gestión' },
                                { id: 'offline', label: 'Desconectado', color: 'slate', desc: 'No disponible' },
                            ].map((s) => (
                                <button
                                    key={s.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleStatusUpdate(s.id as AvailabilityStatus);
                                    }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-slate-50 text-left ${driverStatus === s.id ? 'bg-slate-50 ring-1 ring-slate-100' : ''}`}
                                >
                                    <div className={`w-3 h-3 rounded-full bg-${s.color}-500 shadow-sm shadow-${s.color}-500/30`}></div>
                                    <div className="flex-1">
                                        <p className={`text-[11px] font-black uppercase tracking-wider ${driverStatus === s.id ? `text-${s.color}-600` : 'text-slate-700'}`}>{s.label}</p>
                                        <p className="text-[9px] text-slate-400 font-medium italic">{(s as any).desc}</p>
                                    </div>
                                    {driverStatus === s.id && <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            {/* Banner Persistente de Alta Prioridad: Servicio en Curso */}
            {hasActiveService && (
                <div className="bg-amber-400 border-b-2 border-amber-500 text-slate-950 px-4 py-2.5 flex items-center justify-between shadow-lg z-50 shrink-0 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-2.5 w-2.5 relative shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-950 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-950"></span>
                        </span>
                        <div className="truncate">
                            <p className="text-[11px] font-black uppercase tracking-wider truncate">
                                ⚠️ SERVICIO EN CURSO ACTIVO
                            </p>
                            <p className="text-[9px] font-bold text-slate-800 leading-tight">
                                Viaje o entrega en desarrollo
                            </p>
                        </div>
                    </div>
                    <NavLink
                        to="/radar"
                        className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-900 active:scale-95 text-amber-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md shrink-0 ml-2"
                    >
                        Ver Servicio
                    </NavLink>
                </div>
            )}

            {/* Click-away backdrop when picker is open */}
            {showPicker && (
                <div
                    className="fixed inset-0 z-50 overflow-hidden bg-black/5"
                    onClick={() => setShowPicker(false)}
                ></div>
            )}

            {/* Contenido Principal (Scrollable) */}
            <main className="flex-1 overflow-y-auto pb-24 pt-3 px-3.5 sm:px-4">
                {children}
            </main>

            {/* Bottom Navigation Bar con Safe Area */}
            <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-slate-200 px-6 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] flex justify-between items-center z-20 shadow-lg">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-1 min-w-[64px] transition-all ${isActive
                                ? 'text-slate-900'
                                : 'text-slate-400 hover:text-slate-600'
                            }`
                        }
                    >
                        <item.icon className="w-6 h-6" />
                        <span className="text-[10px] font-bold">{item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
