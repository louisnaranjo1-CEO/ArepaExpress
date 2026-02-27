import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Store, UtensilsCrossed, ClipboardList, LogOut, ChevronRight, Menu, X } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

interface AdminLayoutProps {
    children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

    const handleLogout = async () => {
        await auth.signOut();
        navigate('/');
    };

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/orders', icon: ClipboardList, label: 'Pedidos' },
        { path: '/products', icon: UtensilsCrossed, label: 'Productos' },
        { path: '/profile', icon: Store, label: 'Mi Negocio' },
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Mobile Sidebar Backdrop */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    {/* Sidebar Header */}
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                                <Store className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="font-black text-slate-900 leading-tight">DeliExpress</h1>
                                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Business Panel</p>
                            </div>
                        </div>
                        <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
                            <X className="w-6 h-6 text-slate-400" />
                        </button>
                    </div>

                    {/* Nav Items */}
                    <nav className="flex-1 p-4 space-y-1">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    `flex items-center justify-between p-4 rounded-2xl font-bold transition-all group ${isActive
                                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                    }`
                                }
                                onClick={() => setIsSidebarOpen(false)}
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon className="w-5 h-5" />
                                    <span>{item.label}</span>
                                </div>
                                <ChevronRight className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`} />
                            </NavLink>
                        ))}
                    </nav>

                    {/* Sidebar Footer */}
                    <div className="p-4 border-t border-slate-100 italic">
                        <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-3 mb-3 overflow-hidden">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-slate-200 shadow-sm flex-shrink-0">
                                <span className="text-primary font-black">{user?.displayName?.[0] || 'R'}</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">{user?.displayName || 'Restaurante'}</p>
                                <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>Cerrar Sesión</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* Top Header */}
                <header className="h-20 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30">
                    <button
                        className="md:hidden p-2 text-slate-500"
                        onClick={() => setIsSidebarOpen(true)}
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-4">
                        {/* Notifications or search can go here */}
                    </div>
                </header>

                <div className="p-6 md:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
