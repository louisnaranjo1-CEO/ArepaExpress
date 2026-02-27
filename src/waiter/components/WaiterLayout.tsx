import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, ClipboardList, Utensils, User } from 'lucide-react';

interface WaiterLayoutProps {
    children: React.ReactNode;
}

export default function WaiterLayout({ children }: WaiterLayoutProps) {
    const navItems = [
        { path: '/', icon: LayoutGrid, label: 'Mesas' },
        { path: '/orders', icon: ClipboardList, label: 'Pedidos' },
        { path: '/menu', icon: Utensils, label: 'Menú' },
        { path: '/profile', icon: User, label: 'Perfil' },
    ];

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 relative overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto hide-scrollbar pb-24">
                {children}
            </div>

            {/* Bottom Navigation */}
            <nav className="absolute bottom-0 left-0 w-full bg-white border-t border-slate-100 flex justify-around items-center px-4 py-3 pb-6 z-50">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-1 transition-all ${isActive ? 'text-primary scale-110' : 'text-slate-400 opacity-60'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <div className={`p-2 rounded-2xl transition-all ${isActive ? 'bg-primary/10 shadow-sm' : ''}`}>
                                    <item.icon className="w-6 h-6" />
                                </div>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'opacity-100' : 'opacity-80'}`}>
                                    {item.label}
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
