import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Store, UtensilsCrossed, ClipboardList, LogOut, ChevronRight, Menu, X, Settings, HelpCircle, Trash2, User, ChevronUp, Users, UserCheck, Printer, Key, Mail as MailIcon, AlertTriangle, Grid, CreditCard, Layout, Star, MessageSquare, Megaphone, DollarSign, Gift, Volume2, VolumeX, Shield } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { updateUserEmail, updateUserPassword } from '../../lib/auth-service';
import { doc, getDoc, deleteDoc, collection, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useGlobalAudioAlerts } from '../../hooks/useGlobalAudioAlerts';
import { useHaptics } from '../../hooks/useHaptics';

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
    const [showConfigMenu, setShowConfigMenu] = React.useState(false);
    const [configMode, setConfigMode] = React.useState<'none' | 'email' | 'password'>('none');
    const [newValue, setNewValue] = React.useState('');
    const [isUpdating, setIsUpdating] = React.useState(false);
    const [notifications, setNotifications] = React.useState<any[]>([]);
    const [billingInfo, setBillingInfo] = React.useState<{ type: 'warning' | 'danger' | 'none', daysLeft?: number, daysLate?: number, amount?: number }>({ type: 'none' });
    const [audioAlertsEnabled, setAudioAlertsEnabled] = React.useState(true);
    const [isUpdatingAudio, setIsUpdatingAudio] = React.useState(false);
    const [isActive, setIsActive] = React.useState<boolean | null>(null);
    const [supportPhone, setSupportPhone] = React.useState<string>('');
    const { vibrateSelection } = useHaptics();

    useGlobalAudioAlerts('restaurant', user?.uid);

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
                if (data.billingDay && data.billingAmount) {
                    calculateBilling(data.billingDay, data.billingAmount);
                }
                setAudioAlertsEnabled(data.audioAlertsEnabled ?? true);
                setIsActive(data.isActive !== false);
            } else {
                setIsActive(false);
            }
        }
        const fetchSupport = async () => {
            try {
                const sRef = doc(db, 'settings', 'customer_service');
                const sSnap = await getDoc(sRef);
                if (sSnap.exists()) {
                    setSupportPhone(sSnap.data().phoneNumber || '');
                }
            } catch (err) {
                console.error("Error fetching support settings:", err);
            }
        };
        fetchRestaurant();
        fetchSupport();

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

    const calculateBilling = (billingDay: number, amount: number) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let currentMonthRef = new Date(today.getFullYear(), today.getMonth(), billingDay);
        let diffDays = Math.round((currentMonthRef.getTime() - today.getTime()) / (1000 * 3600 * 24));

        let lastMonthRef = new Date(today.getFullYear(), today.getMonth() - 1, billingDay);
        let diffDaysLastMonth = Math.round((lastMonthRef.getTime() - today.getTime()) / (1000 * 3600 * 24));

        let nextMonthRef = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
        let diffDaysNextMonth = Math.round((nextMonthRef.getTime() - today.getTime()) / (1000 * 3600 * 24));

        if (diffDaysLastMonth <= 0 && diffDaysLastMonth >= -10) {
            setBillingInfo({ type: 'danger', daysLate: Math.abs(diffDaysLastMonth), amount });
            return;
        }
        if (diffDays <= 0 && diffDays >= -10) {
            setBillingInfo({ type: 'danger', daysLate: Math.abs(diffDays), amount });
            return;
        }
        if (diffDays > 0 && diffDays <= 5) {
            setBillingInfo({ type: 'warning', daysLeft: diffDays, amount });
            return;
        }
        if (diffDaysNextMonth > 0 && diffDaysNextMonth <= 5) {
            setBillingInfo({ type: 'warning', daysLeft: diffDaysNextMonth, amount });
            return;
        }

        setBillingInfo({ type: 'none' });
    };

    const handleLogout = async () => {
        await auth.signOut();
        navigate('/');
    };

    const handleUpdateConfig = async () => {
        if (!newValue) return;
        setIsUpdating(true);
        try {
            if (configMode === 'email') {
                await updateUserEmail(newValue);
                alert("Correo actualizado con éxito. Es posible que debas iniciar sesión de nuevo.");
            } else if (configMode === 'password') {
                await updateUserPassword(newValue);
                alert("Contraseña actualizada con éxito.");
            }
            setConfigMode('none');
            setNewValue('');
        } catch (error: any) {
            console.error("Error updating config:", error);
            if (error.code === 'auth/requires-recent-login') {
                alert("Por seguridad, esta acción requiere que hayas iniciado sesión recientemente. Por favor, cierra sesión e ingresa de nuevo.");
            } else {
                alert(`Error: ${error.message || "No se pudo actualizar"}`);
            }
        } finally {
            setIsUpdating(false);
        }
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

    const handleToggleAudio = async () => {
        if (!user) return;
        setIsUpdatingAudio(true);
        try {
            const newValue = !audioAlertsEnabled;
            setAudioAlertsEnabled(newValue);
            await updateDoc(doc(db, 'restaurants', user.uid), {
                audioAlertsEnabled: newValue
            });
        } catch (error) {
            console.error("Error toggling audio alerts:", error);
            setAudioAlertsEnabled(!audioAlertsEnabled); // Revert
            alert("Error al actualizar la configuración de alertas sonoras.");
        } finally {
            setIsUpdatingAudio(false);
        }
    };

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/orders', icon: ClipboardList, label: 'Pedidos' },
        { path: '/finance', icon: DollarSign, label: 'Caja y Finanzas' },
        { path: '/products', icon: UtensilsCrossed, label: 'Productos' },
        { path: '/clients', icon: Users, label: 'Clientes' },
        { path: '/fidelization', icon: Gift, label: 'Fidelización' },
        { path: '/waiters', icon: UserCheck, label: 'Meseros' },
        { path: '/cashiers', icon: Shield, label: 'Cajeras' },
        { path: '/tables', icon: Grid, label: 'Mesas' },
        { path: '/stations', icon: Printer, label: 'Estaciones' },
        { path: '/profile', icon: Store, label: 'Mi Negocio' },
        { path: '/banners', icon: Layout, label: 'Publicidad' },
        { path: '/push-campaigns', icon: Megaphone, label: 'Campañas Push' },
        { path: '/reviews', icon: MessageSquare, label: 'Reseñas' },
        { path: '/subscriptions', icon: CreditCard, label: 'Suscripción' },
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
            <aside className={`fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-slate-950 border-r border-white/10 z-50 transform transition-transform duration-300 ease-in-out md:relative md:w-72 md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full pt-safe">
                    {/* Sidebar Header */}
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3 cursor-pointer active:scale-95 transition-transform" onClick={() => window.location.href = 'https://deliexpress.app'}>
                            <div className="w-14 h-14 flex items-center justify-center p-1 overflow-visible">
                                <img
                                    src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&v=1.1"
                                    alt="Encontrado en un 2x3"
                                    className="w-full h-full object-contain filter drop-shadow-sm brightness-110"
                                />
                            </div>
                            <div className="flex flex-col">
                                <h1 className="font-black text-white leading-tight">Encontrado en un 2x3</h1>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Business Hub</p>
                            </div>
                        </div>
                        <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
                            <X className="w-6 h-6 text-slate-400" />
                        </button>
                    </div>

                    {/* Nav Items */}
                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    `flex items-center justify-between p-4 rounded-2xl font-bold transition-all group ${isActive
                                        ? 'bg-primary text-slate-900 shadow-lg shadow-primary/20'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                    }`
                                }
                                onClick={() => { vibrateSelection(); setIsSidebarOpen(false); }}
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
                                        <HelpCircle className="w-5 h-5 text-slate-900" />
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
                                <div className="p-4 bg-slate-50 border-t border-slate-100 italic">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Configuración de Cuenta</p>
                                    <div className="space-y-2">
                                        <button
                                            onClick={handleToggleAudio}
                                            disabled={isUpdatingAudio}
                                            className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:border-primary transition-all text-sm disabled:opacity-70"
                                        >
                                            <div className="flex items-center gap-3">
                                                {audioAlertsEnabled ? (
                                                    <Volume2 className="w-4 h-4 text-slate-900" />
                                                ) : (
                                                    <VolumeX className="w-4 h-4 text-slate-400" />
                                                )}
                                                <span>Alertas Sonoras</span>
                                            </div>
                                            <div
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${audioAlertsEnabled ? 'bg-primary' : 'bg-slate-300'
                                                    }`}
                                            >
                                                <span
                                                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${audioAlertsEnabled ? 'translate-x-5' : 'translate-x-1'
                                                        }`}
                                                />
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => { setConfigMode('email'); setShowConfigMenu(true); setIsProfileMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:border-primary transition-all text-sm"
                                        >
                                            <MailIcon className="w-4 h-4 text-slate-900" />
                                            <span>Cambiar Correo</span>
                                        </button>
                                        <button
                                            onClick={() => { setConfigMode('password'); setShowConfigMenu(true); setIsProfileMenuOpen(false); }}
                                            className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:border-primary transition-all text-sm"
                                        >
                                            <Key className="w-4 h-4 text-slate-900" />
                                            <span>Cambiar Contraseña</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            className={`w-full p-4 rounded-2xl flex items-center gap-3 mb-3 transition-all ${isProfileMenuOpen ? 'bg-primary/10 ring-2 ring-primary/20' : 'bg-white/5 hover:bg-white/10'}`}
                        >
                            <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center border border-white/10 shadow-sm flex-shrink-0">
                                <span className="text-white font-black">{restaurantName[0]}</span>
                            </div>
                            <div className="min-w-0 flex-1 text-left">
                                <p className="text-sm font-bold text-white truncate">{restaurantName}</p>
                                <p className="text-[10px] text-slate-400 truncate capitalize">Business Manager</p>
                            </div>
                            <ChevronUp className={`w-4 h-4 text-slate-500 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 font-bold hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors"
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

                    {/* Config Modal */}
                    {showConfigMenu && configMode !== 'none' && (
                        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-white rounded-[40px] p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300 shadow-2xl italic">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                                    {configMode === 'email' ? <MailIcon className="w-8 h-8 text-slate-900" /> : <Key className="w-8 h-8 text-slate-900" />}
                                </div>
                                <div className="text-center space-y-2">
                                    <h3 className="text-xl font-black text-slate-900">
                                        {configMode === 'email' ? 'Cambiar Correo' : 'Cambiar Contraseña'}
                                    </h3>
                                    <p className="text-slate-500 font-medium leading-relaxed">
                                        Ingresa {configMode === 'email' ? 'tu nuevo correo electrónico' : 'tu nueva contraseña'}.
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <input
                                        type={configMode === 'email' ? 'email' : 'password'}
                                        value={newValue}
                                        onChange={(e) => setNewValue(e.target.value)}
                                        placeholder={configMode === 'email' ? 'nuevo@correo.com' : '••••••••'}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    />
                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={handleUpdateConfig}
                                            disabled={isUpdating || !newValue}
                                            className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70"
                                        >
                                            {isUpdating ? 'Actualizando...' : 'confirmar cambio'}
                                        </button>
                                        <button
                                            onClick={() => { setShowConfigMenu(false); setConfigMode('none'); setNewValue(''); }}
                                            className="w-full bg-slate-50 text-slate-900 py-4 rounded-2xl font-black hover:bg-slate-100 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 relative pb-[65px] md:pb-0">
                {/* Top Header */}
                <header className="h-14 md:h-20 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between flex-shrink-0 pt-safe">
                    <button
                        className="md:hidden p-2 -ml-2 text-slate-500 active:scale-95 transition-transform"
                        onClick={() => { vibrateSelection(); setIsSidebarOpen(true); }}
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-4">
                        {/* Notifications indicator could go here */}
                    </div>
                </header>

                {/* Billing Banner */}
                {billingInfo.type === 'danger' && (
                    <div className="bg-red-500 text-white px-4 py-3 flex items-center justify-center gap-3 text-sm font-bold flex-shrink-0 animate-in slide-in-from-top duration-500 z-10 shadow-md">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-center">¡Aviso Importante! Su suscripción mensual de ${billingInfo.amount?.toFixed(2)} está vencida por {billingInfo.daysLate} {billingInfo.daysLate === 1 ? 'día' : 'días'}. Por favor, realice el pago para evitar suspensión del servicio.</span>
                    </div>
                )}
                {billingInfo.type === 'warning' && (
                    <div className="bg-amber-400 text-amber-950 px-4 py-3 flex items-center justify-center gap-3 text-sm font-bold flex-shrink-0 animate-in slide-in-from-top duration-500 z-10 shadow-md">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-center">Recordatorio: Su suscripción mensual de ${billingInfo.amount?.toFixed(2)} vence en {billingInfo.daysLeft} {billingInfo.daysLeft === 1 ? 'día' : 'días'}.</span>
                    </div>
                )}

                {/* Notifications Toast Container */}
                <div className="fixed top-24 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
                    {notifications.map(notification => (
                        <div key={notification.id} className="bg-white rounded-2xl shadow-2xl border border-primary/20 p-4 w-80 animate-in slide-in-from-right-8 fade-in pointer-events-auto flex gap-3 items-start">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <ClipboardList className="w-5 h-5 text-slate-900" />
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

                <div className="flex-1 overflow-y-auto p-2 md:p-8 relative custom-scrollbar">
                    {children}
                </div>

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
                        to="/orders"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-primary' : 'text-slate-400'}`}
                    >
                        <ClipboardList className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Pedidos</span>
                    </NavLink>
                    <NavLink
                        to="/finance"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-primary' : 'text-slate-400'}`}
                    >
                        <DollarSign className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Caja</span>
                    </NavLink>
                    <button
                        onClick={() => { vibrateSelection(); setIsSidebarOpen(true); }}
                        className="flex flex-col items-center justify-center w-full h-full space-y-1 text-slate-400"
                    >
                        <Menu className="w-5 h-5" />
                        <span className="text-[10px] font-bold">Más</span>
                    </button>
                </nav>
            </main>
            {/* Suspension Overlay */}
            {isActive === false && (
                <div className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6 text-center">
                    <div className="bg-white rounded-[40px] p-8 md:p-12 max-w-lg w-full space-y-8 animate-in zoom-in-95 duration-500 shadow-2xl border border-slate-100 italic">
                        <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mx-auto animate-bounce duration-[2000ms]">
                            <Shield className="w-12 h-12 text-rose-500" />
                        </div>
                        
                        <div className="space-y-4">
                            <h2 className="text-3xl font-black text-slate-900 leading-tight">Acceso Restringido</h2>
                            <div className="h-1.5 w-20 bg-primary mx-auto rounded-full" />
                            <p className="text-lg text-slate-500 font-medium leading-relaxed">
                                Tu cuenta se encuentra <span className="text-rose-600 font-black">Inactiva o Suspendida</span>. 
                                Para reactivar tu servicio y continuar gestionando tu negocio, por favor contacta con soporte técnico.
                            </p>
                        </div>

                        <div className="flex flex-col gap-4">
                            <a 
                                href={`https://wa.me/${supportPhone?.replace(/\D/g, '') || '584243258536'}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full bg-primary text-slate-900 py-5 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-lg"
                            >
                                <MessageSquare className="w-6 h-6" />
                                Contactar Soporte
                            </a>
                            
                            <button 
                                onClick={handleLogout}
                                className="w-full bg-slate-50 text-slate-500 py-4 rounded-2xl font-bold hover:bg-slate-100 hover:text-slate-900 transition-all flex items-center justify-center gap-2"
                            >
                                <LogOut className="w-5 h-5" />
                                Cerrar Sesión
                            </button>
                        </div>

                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                            ID del Negocio: {user?.uid}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
