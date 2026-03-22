import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Store, Users, Image as ImageIcon, LogOut, ChevronRight, Menu, X, Tag, Truck, Wallet, Car, Share2, Gift, Ticket } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useGlobalAudioAlerts } from '../../hooks/useGlobalAudioAlerts';

interface CpanelLayoutProps {
    children: React.ReactNode;
    onLogout: () => void;
}

export default function CpanelLayout({ children, onLogout }: CpanelLayoutProps) {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [pendingTransports, setPendingTransports] = useState(0);

    useGlobalAudioAlerts('cpanel');

    useEffect(() => {
        // Listen to pending transport requests that need admin payment verification
        const q = query(
            collection(db, 'transport_requests'),
            where('status', '==', 'verifying_payment')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingTransports(snapshot.size);
        });

        return () => unsubscribe();
    }, []);

    const handleLogout = () => {
        onLogout();
        navigate('/');
    };

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Resumen' },
        { path: '/restaurants', icon: Store, label: 'Restaurantes' },
        { path: '/users', icon: Users, label: 'Usuarios' },
        { path: '/banners', icon: ImageIcon, label: 'Banners' },
        { path: '/categories', icon: Tag, label: 'Categorías' },
        { path: '/delivery', icon: Truck, label: 'Delivery Express' },
        { path: '/transports', icon: Car, label: 'Viajes (Taxis)', badge: pendingTransports },
        { path: '/finances', icon: Wallet, label: 'Finanzas' },
        { path: '/fidelization', icon: Gift, label: 'Fidelización' },
        { path: '/raffles', icon: Ticket, label: 'Sorteos y Rifas' },
        { path: '/icons', icon: Share2, label: 'Iconos' },
    ];

    return (
        <div className="h-[100dvh] bg-slate-50 flex overflow-hidden">
            {/* Mobile Sidebar Backdrop */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 w-72 bg-slate-900 border-r border-slate-800 z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    {/* Sidebar Header */}
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-sm ring-1 ring-slate-800">
                                <img
                                    src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20oficial.png?alt=media&token=2dd047ea-6c45-4347-8869-1a1edf4253f4"
                                    alt="2X3 Logo"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <div>
                                <h1 className="font-black text-white leading-tight">2X3 Panel</h1>
                                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Cpanel Administrativo</p>
                            </div>
                        </div>
                        <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
                            <X className="w-6 h-6 text-slate-400" />
                        </button>
                    </div>

                    {/* Nav Items */}
                    <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto custom-scrollbar">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    `flex items-center justify-between py-2.5 px-4 rounded-xl font-bold transition-all group relative ${isActive
                                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                    }`
                                }
                                onClick={() => setIsSidebarOpen(false)}
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon className="w-5 h-5" />
                                    <span className="text-[15px]">{item.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!!item.badge && item.badge > 0 && (
                                        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                                            {item.badge}
                                        </span>
                                    )}
                                    <ChevronRight className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`} />
                                </div>
                            </NavLink>
                        ))}
                    </nav>

                    {/* Sidebar Footer */}
                    <div className="p-3 border-t border-slate-800">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 font-bold hover:bg-red-500/10 hover:text-red-400 rounded-xl transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>Cerrar Sesión</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Top Header */}
                <header className="h-20 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
                    <button
                        className="md:hidden p-2 text-slate-500"
                        onClick={() => setIsSidebarOpen(true)}
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-black text-slate-900">Control Principal</h2>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
                    {children}
                </div>
            </main>
        </div>
    );
}
