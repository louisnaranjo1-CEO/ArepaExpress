import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Compass, DollarSign, User, Trophy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { setDriverAvailability, AvailabilityStatus } from '../../lib/delivery-service';
import { useGlobalAudioAlerts } from '../../hooks/useGlobalAudioAlerts';

interface DeliveryLayoutProps {
    children: React.ReactNode;
}

export default function DeliveryLayout({ children }: DeliveryLayoutProps) {
    const { user } = useAuth();
    const [driverStatus, setDriverStatus] = useState<AvailabilityStatus>('offline');
    const [updating, setUpdating] = useState(false);
    const [showPicker, setShowPicker] = useState(false);

    useGlobalAudioAlerts('delivery', user?.uid);

    useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(doc(db, 'delivery_drivers', user.uid), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setDriverStatus(data.availability || (data.isOnline ? 'active' : 'offline'));
            }
        });
        return () => unsub();
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
            {/* Cabecera Fija */}
            <header className="bg-secondary text-white px-4 py-4 flex items-center justify-between shadow-md z-[60] shrink-0">
                <div className="flex items-center gap-2">
                    <img
                        src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&v=1.1"
                        alt="Deliexpress"
                        className="w-10 h-10 object-contain"
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

            {/* Click-away backdrop when picker is open */}
            {showPicker && (
                <div
                    className="fixed inset-0 z-50 overflow-hidden bg-black/5"
                    onClick={() => setShowPicker(false)}
                ></div>
            )}

            {/* Contenido Principal (Scrollable) */}
            <main className="flex-1 overflow-y-auto pb-20 pt-4 px-4">
                {children}
            </main>

            {/* Bottom Navigation Bar */}
            <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center z-20 pb-safe">
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
