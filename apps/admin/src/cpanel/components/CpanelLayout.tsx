import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Store, Users, Image as ImageIcon, LogOut, ChevronRight, Menu, X, Tag, Truck, Wallet, Car, Share2, Gift, Ticket, MessageSquareWarning, Megaphone, ShoppingBag, Trophy, Shield, Palette } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { UN2X3_LOGO } from '../../lib/env';
import { useGlobalAudioAlerts } from '../../hooks/useGlobalAudioAlerts';
import { useHaptics } from '../../hooks/useHaptics';
import AuthorizedDevicesModal from './AuthorizedDevicesModal';

interface CpanelLayoutProps {
    children: React.ReactNode;
    onLogout: () => void;
    adminUser?: any;
}

export default function CpanelLayout({ children, onLogout, adminUser }: CpanelLayoutProps) {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showDevicesModal, setShowDevicesModal] = useState(false);
    const [pendingTransports, setPendingTransports] = useState(0);
    const [pendingTickets, setPendingTickets] = useState(0);
    const [pendingPayouts, setPendingPayouts] = useState(0);
    const { vibrateSelection } = useHaptics();

    useGlobalAudioAlerts('cpanel');

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const { count: transCount } = await supabase
                    .from('transport_requests')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'verifying_payment');
                setPendingTransports(transCount || 0);

                const { count: tickCount } = await supabase
                    .from('support_tickets')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'open');
                setPendingTickets(tickCount || 0);

                const { count: ordPayCount } = await supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .eq('payment_requested', true)
                    .eq('delivery_paid', false);

                const { count: transPayCount } = await supabase
                    .from('transport_requests')
                    .select('*', { count: 'exact', head: true })
                    .eq('payment_requested', true)
                    .eq('driver_paid', false);

                setPendingPayouts((ordPayCount || 0) + (transPayCount || 0));
            } catch (err) {
                console.error("Error fetching cpanel counts:", err);
            }
        };

        fetchCounts();

        const channel = supabase
            .channel('cpanel_layout_badges')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, fetchCounts)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, fetchCounts)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchCounts)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleLogout = () => {
        onLogout();
        navigate('/');
    };

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Resumen' },
        { path: '/app-orders', icon: ShoppingBag, label: 'Pedidos App en Vivo' },
        { path: '/restaurants', icon: Store, label: 'Restaurantes' },
        { path: '/users', icon: Users, label: 'Usuarios' },
        { path: '/banners', icon: ImageIcon, label: 'Banners' },
        { path: '/design', icon: Palette, label: 'Diseño' },
        { path: '/categories', icon: Tag, label: 'Categorías' },
        { path: '/delivery', icon: Truck, label: 'Delivery Express' },
        { path: '/transports', icon: Car, label: 'Viajes (Taxis)', badge: pendingTransports },
        { path: '/finances', icon: Wallet, label: 'Finanzas' },
        { path: '/liquidations', icon: Wallet, label: 'Liquidaciones', badge: pendingPayouts },
        { path: '/fidelization', icon: Gift, label: 'Fidelización' },
        { path: '/raffles', icon: Ticket, label: 'Sorteos y Rifas' },
        { path: '/achievements', icon: Trophy, label: 'Logros de Pilotos' },
        { path: '/marketing', icon: Megaphone, label: 'Marketing & Push' },
        { path: '/icons', icon: Share2, label: 'Iconos' },
        { path: '/support', icon: MessageSquareWarning, label: 'Reportes de Falla', badge: pendingTickets },
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
            <aside className={`fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-slate-900 border-r border-slate-800 z-50 transform transition-transform duration-300 ease-in-out md:relative md:w-72 md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full pt-safe">
                    {/* Sidebar Header */}
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3 cursor-pointer active:scale-95 transition-transform" onClick={() => window.location.href = 'https://deliexpress.app'}>
                            <div className="relative w-14 h-14 flex items-center justify-center p-1 overflow-visible">
                                <img
                                    src={UN2X3_LOGO}
                                    alt="Arepa Express"
                                    className="w-full h-full object-contain filter drop-shadow-sm"
                                />
                            </div>
                            <div className="flex flex-col">
                                <h1 className="font-black text-white leading-tight">Encontrado en un 2x3</h1>
                                <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Cpanel Administrativo</p>
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
                                        ? 'bg-primary !text-slate-900 shadow-lg shadow-primary/20'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                    }`
                                }
                                onClick={() => { vibrateSelection(); setIsSidebarOpen(false); }}
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
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative pb-[65px] md:pb-0">
                {/* Top Header */}
                <header className="h-14 md:h-20 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between flex-shrink-0 pt-safe">
                    <div className="flex items-center gap-3">
                        <button
                            className="md:hidden p-2 -ml-2 text-slate-500 active:scale-95 transition-transform"
                            onClick={() => { vibrateSelection(); setIsSidebarOpen(true); }}
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <h2 className="text-lg md:text-xl font-black text-slate-900">Control Principal</h2>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                        <button
                            onClick={() => setShowDevicesModal(true)}
                            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black transition-all shadow-sm border border-slate-200/60 active:scale-95"
                            title="Administrar Dispositivos Autorizados"
                        >
                            <Shield className="w-4 h-4 text-emerald-600" />
                            <span className="hidden sm:inline">Dispositivos</span>
                        </button>

                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-black transition-all border border-red-100 active:scale-95"
                            title="Cerrar Sesión"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="hidden md:inline">Salir</span>
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-2 md:p-8 relative custom-scrollbar">
                    {children}
                </div>

                <AuthorizedDevicesModal
                    isOpen={showDevicesModal}
                    onClose={() => setShowDevicesModal(false)}
                    userId={adminUser?.id || ''}
                />

                {/* Mobile Bottom Navigation */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around pb-safe z-40 h-[65px] px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                    <NavLink
                        to="/"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-primary' : 'text-slate-400'}`}
                    >
                        <LayoutDashboard className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Resumen</span>
                    </NavLink>
                    <NavLink
                        to="/restaurants"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-primary' : 'text-slate-400'}`}
                    >
                        <Store className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Tiendas</span>
                    </NavLink>
                    <NavLink
                        to="/transports"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full space-y-1 relative ${isActive ? 'text-primary' : 'text-slate-400'}`}
                    >
                        <Car className="w-5 h-5" />
                        {pendingTransports > 0 && (
                            <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
                        )}
                        <span className="text-[10px] font-bold">Taxis</span>
                    </NavLink>
                    <button
                        onClick={() => { vibrateSelection(); setIsSidebarOpen(true); }}
                        className="flex flex-col items-center justify-center w-full h-full space-y-1 text-slate-400 relative"
                    >
                        <Menu className="w-5 h-5" />
                        {pendingTickets > 0 && (
                            <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
                        )}
                        <span className="text-[10px] font-bold">Más</span>
                    </button>
                </nav>
            </main>
        </div>
    );
}
