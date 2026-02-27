import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Store, UtensilsCrossed, ClipboardList, LogOut, ChevronRight, Menu, X, Settings, HelpCircle, Trash2, User, ChevronUp, Users } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { doc, getDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdminLayoutProps {
    children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
    const [restaurantName, setRestaurantName] = React.useState('Mi Negocio');
    const [createdAt, setCreatedAt] = React.useState<Date | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [notifications, setNotifications] = React.useState<any[]>([]);

    // Sound for notifications (optional, if you have an asset, but we can rely on visual for now)
    const playNotificationSound = () => {
        try {
            // Just a simple beep using Web Audio API if browser allows
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.value = 800;
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            setTimeout(() => oscillator.stop(), 200);
        } catch (e) {
            console.log('Audio disabled by browser auto-play policy');
        }
    };

    React.useEffect(() => {
        if (!user) return;
        const fetchRestaurant = async () => {
            const docRef = doc(db, 'restaurants', user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setRestaurantName(data.name || 'Mi Negocio');
                if (data.createdAt) {
                    setCreatedAt(data.createdAt.toDate());
                }
            }
        }
        fetchRestaurant();

        // Listen for new orders
        const q = query(collection(db, 'orders'), where('restaurantId', '==', user.uid));
        let initialLoad = true;

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (initialLoad) {
                initialLoad = false;
                return;
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    // Solo notificar si el estado es 'pending' o 'confirmed' (nuevos)
                    if (data.status === 'pending' || data.status === 'confirmed') {
                        const newNotification = {
                            id: change.doc.id,
                            title: '¡Nuevo Pedido!',
                            message: `Has recibido un nuevo pedido de ${data.userName} por $${data.total.toFixed(2)}`,
                            createdAt: new Date().getTime(),
                        };

                        setNotifications(prev => [...prev, newNotification]);
                        playNotificationSound();

                        // Auto-dismiss after 8 seconds
                        setTimeout(() => {
                            setNotifications(prev => prev.filter(n => n.id !== change.doc.id));
                        }, 8000);
                    }
                }
            });
        });

        return () => unsubscribe();
    }, [user]);

    const handleLogout = async () => {
        await auth.signOut();
        navigate('/');
    };

    const handleDeleteAccount = async () => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'restaurants', user.uid));
            // In a real app, we'd also delete the auth user, but for demo we just sign out
            await auth.signOut();
            navigate('/');
        } catch (error) {
            console.error("Error deleting account:", error);
            alert("Error al eliminar la cuenta");
        }
    };

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/orders', icon: ClipboardList, label: 'Pedidos' },
        { path: '/products', icon: UtensilsCrossed, label: 'Productos' },
        { path: '/clients', icon: Users, label: 'Clientes' },
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
                    <div className="p-4 border-t border-slate-100 relative">
                        {/* Profile Menu Dropdown */}
                        {isProfileMenuOpen && (
                            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-3xl shadow-2xl border border-slate-100 p-2 overflow-hidden animate-in slide-in-from-bottom-4 duration-300 z-50">
                                <div className="p-4 border-b border-slate-50 italic">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Miembro desde</p>
                                    <p className="text-sm font-bold text-slate-700 capitalize">
                                        {createdAt ? format(createdAt, "MMMM yyyy", { locale: es }) : 'Reciente'}
                                    </p>
                                </div>
                                <div className="py-2">
                                    <a
                                        href="https://wa.me/584243258536"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                                    >
                                        <HelpCircle className="w-5 h-5 text-primary" />
                                        <span>Soporte Técnico</span>
                                    </a>
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                        <span>Eliminar Cuenta</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            className={`w-full p-4 rounded-2xl flex items-center gap-3 mb-3 transition-all ${isProfileMenuOpen ? 'bg-primary/5 ring-2 ring-primary/20' : 'bg-slate-50 hover:bg-slate-100'}`}
                        >
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-slate-200 shadow-sm flex-shrink-0">
                                <span className="text-primary font-black">{restaurantName[0]}</span>
                            </div>
                            <div className="min-w-0 flex-1 text-left">
                                <p className="text-sm font-bold text-slate-900 truncate">{restaurantName}</p>
                                <p className="text-[10px] text-slate-500 truncate capitalize">Business Manager</p>
                            </div>
                            <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 font-bold hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>Cerrar Sesión</span>
                        </button>
                    </div>

                    {/* Delete Confirmation Modal */}
                    {showDeleteConfirm && (
                        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-white rounded-[40px] p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300 shadow-2xl italic">
                                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                                    <Trash2 className="w-8 h-8 text-red-500" />
                                </div>
                                <div className="text-center space-y-2">
                                    <h3 className="text-xl font-black text-slate-900">¿Eliminar cuenta?</h3>
                                    <p className="text-slate-500 font-medium leading-relaxed">Esta acción borrará toda tu información y productos de forma permanente. No podrás deshacerlo.</p>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={handleDeleteAccount}
                                        className="w-full bg-red-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                    >
                                        Sí, eliminar cuenta
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        className="w-full bg-slate-50 text-slate-900 py-4 rounded-2xl font-black hover:bg-slate-100 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
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
                        {/* Notifications indicator could go here */}
                    </div>
                </header>

                {/* Notifications Toast Container */}
                <div className="fixed top-24 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
                    {notifications.map(notification => (
                        <div key={notification.id} className="bg-white rounded-2xl shadow-2xl border border-primary/20 p-4 w-80 animate-in slide-in-from-right-8 fade-in pointer-events-auto flex gap-3 items-start">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <ClipboardList className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-black text-slate-900 text-sm">{notification.title}</h4>
                                <p className="text-xs font-medium text-slate-500 mt-0.5 line-clamp-2">{notification.message}</p>
                            </div>
                            <button
                                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="p-6 md:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
