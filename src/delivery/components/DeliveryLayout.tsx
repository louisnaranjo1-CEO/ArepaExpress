import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Compass, DollarSign, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { setDriverOnlineStatus } from '../../lib/delivery-service';

interface DeliveryLayoutProps {
    children: React.ReactNode;
}

export default function DeliveryLayout({ children }: DeliveryLayoutProps) {
    const { user } = useAuth();
    const [isOnline, setIsOnline] = useState(false);
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(doc(db, 'delivery_drivers', user.uid), (snap) => {
            if (snap.exists()) {
                setIsOnline(snap.data().isOnline || false);
            }
        });
        return () => unsub();
    }, [user]);

    const handleToggleStatus = async () => {
        if (!user || updating) return;
        setUpdating(true);
        try {
            await setDriverOnlineStatus(user.uid, !isOnline);
        } catch (error) {
            console.error("Error toggling status", error);
        } finally {
            setUpdating(false);
        }
    };

    const navItems = [
        { path: '/radar', icon: Compass, label: 'Radar' },
        { path: '/earnings', icon: DollarSign, label: 'Ganancias' },
        { path: '/profile', icon: User, label: 'Perfil' },
    ];

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 w-full max-w-md mx-auto relative overflow-hidden shadow-2xl">
            {/* Cabecera Fija */}
            <header className="bg-indigo-600 text-white px-4 py-4 flex items-center justify-between shadow-md z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <img
                        src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/arepalogo.png?alt=media&token=c2ce79eb-c0fb-484d-b353-8d6bd1ce32c6"
                        alt="Arepa Express"
                        className="w-8 h-8 rounded-full bg-white p-1"
                    />
                    <h1 className="font-black text-lg tracking-tight">Delivery Express</h1>
                </div>

                <button
                    onClick={handleToggleStatus}
                    disabled={updating}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all active:scale-95 ${isOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'
                        }`}
                >
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
                    <span className="text-[10px] font-black uppercase tracking-widest">
                        {updating ? '...' : (isOnline ? 'En línea' : 'Desconectado')}
                    </span>
                </button>
            </header>

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
                                ? 'text-indigo-600'
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
