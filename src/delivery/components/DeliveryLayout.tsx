import React from 'react';
import { NavLink } from 'react-router-dom';
import { Compass, DollarSign, User } from 'lucide-react';

interface DeliveryLayoutProps {
    children: React.ReactNode;
}

export default function DeliveryLayout({ children }: DeliveryLayoutProps) {
    const navItems = [
        { path: '/delivery/radar', icon: Compass, label: 'Radar' },
        { path: '/delivery/earnings', icon: DollarSign, label: 'Ganancias' },
        { path: '/delivery/profile', icon: User, label: 'Perfil' },
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
                {/* Status Online/Offline toggle can go here later */}
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-xs font-bold">Activo</span>
                </div>
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
