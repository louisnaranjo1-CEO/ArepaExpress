import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Store, UtensilsCrossed, ClipboardList, LogOut, ChevronRight, Menu, X, Settings, HelpCircle, Trash2, User, ChevronUp, Users, UserCheck, Printer, Key, Mail as MailIcon, AlertTriangle, Grid, CreditCard, Layout, Star, MessageSquare, Megaphone, DollarSign, Gift, Volume2, VolumeX, Shield, Bell, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { updateUserEmail, updateUserPassword } from '../../lib/auth-service';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useGlobalAudioAlerts } from '../../hooks/useGlobalAudioAlerts';
import { useHaptics } from '../../hooks/useHaptics';

interface AdminLayoutProps {
    children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    const { user, userData } = useAuth();
    const { branding } = useBranding();
    const navigate = useNavigate();
    const location = useLocation();
    const currentUid = userData?.managedRestaurantId || user?.uid || (user as any)?.id;
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
    const [restaurantName, setRestaurantName] = React.useState('Mi Negocio');
    const [createdAt, setCreatedAt] = React.useState<Date | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
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
    const [commercialData, setCommercialData] = React.useState<{
        billing_mode?: string;
        plan_id?: string;
        custom_features?: Record<string, boolean>;
    }>({});
    const [plansConfig, setPlansConfig] = React.useState<any>(null);
    const [showLockedModal, setShowLockedModal] = React.useState<string | null>(null);
    const { vibrateSelection } = useHaptics();

    useGlobalAudioAlerts('restaurant', currentUid);

    React.useEffect(() => {
        if (!currentUid) return;
        let isMounted = true;

        const fetchRestaurant = async () => {
            try {
                const { data, error } = await supabase
                    .from('comercios')
                    .select('*')
                    .eq('id', currentUid)
                    .maybeSingle();

                if (data) {
                    if (!isMounted) return;
                    setRestaurantName(data.name || 'Mi Negocio');
                    setCommercialData({
                        billing_mode: data.billing_mode,
                        plan_id: data.plan_id,
                        custom_features: data.custom_features || {}
                    });
                    if (data.created_at) {
                        setCreatedAt(new Date(data.created_at));
                    }
                    if (data.billing_day && data.billing_amount) {
                        calculateBilling(data.billing_day, Number(data.billing_amount));
                    }
                    setAudioAlertsEnabled(data.audio_alerts_enabled ?? true);
                    setIsActive(data.is_active !== false);
                } else {
                    // Auto-inicializar restaurante si es primera vez que entra con Google o Supabase
                    const defaultName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Mi Negocio';
                    const defaultRest = {
                        id: currentUid,
                        name: defaultName,
                        rif: 'PROVISIONAL',
                        owner_uid: currentUid,
                        email: user?.email || '',
                        business_type: 'restaurant',
                        locations: [],
                        whatsapp: '',
                        own_delivery: false,
                        is_approved: true,
                        is_active: true,
                        is_visible: false,
                        isVisible: false,
                        is_verified: false,
                        isVerified: false,
                        verification_status: 'unverified',
                        rating: 5.0,
                        delivery_time: '30-45 min',
                        delivery_fee: 1.5,
                        category: 'Varios',
                        audio_alerts_enabled: true
                    };
                    await supabase.from('comercios').insert(defaultRest);
                    if (!isMounted) return;
                    setRestaurantName(defaultRest.name);
                    setIsActive(true);
                }
            } catch (err) {
                console.error("Error cargando datos de negocio:", err);
                if (isMounted) setIsActive(true);
            }
        };

        const fetchSupport = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('*')
                    .eq('id', 'customer_service')
                    .maybeSingle();
                if (data && isMounted) {
                    setSupportPhone(data.phone_number || data.data?.phoneNumber || '');
                }
            } catch (err) {
                console.error("Error fetching support settings:", err);
            }
        };

        const fetchPlansConfig = async () => {
            try {
                const { data } = await supabase
                    .from('system_settings')
                    .select('*')
                    .eq('key', 'subscription_plans_config')
                    .maybeSingle();
                if (data && isMounted) {
                    setPlansConfig(data.value || data.data);
                }
            } catch (err) {
                console.warn("Error fetching plans config in layout:", err);
            }
        };

        fetchRestaurant();
        fetchPlansConfig();
        fetchSupport();

        // Listen for store commercial updates
        const comercioChannel = supabase.channel(`admin-layout-comercio:${currentUid}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'comercios',
                    filter: `id=eq.${currentUid}`
                },
                (payload) => {
                    const data = payload.new as any;
                    if (data && isMounted) {
                        setCommercialData({
                            billing_mode: data.billing_mode,
                            plan_id: data.plan_id,
                            custom_features: data.custom_features || {}
                        });
                    }
                }
            )
            .subscribe();

        // Listen for new orders via Supabase Realtime
        const ordersChannel = supabase.channel(`admin-layout-orders:${currentUid}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orders',
                    filter: `restaurant_id=eq.${currentUid}`
                },
                (payload) => {
                    const data = payload.new as any;
                    if (['pending', 'pendiente_pago', 'confirmed', 'preparing'].includes(data.status)) {
                        const itemsSummary = Array.isArray(data.items)
                            ? `${data.items.length} prod.: ` + data.items.map((i: any) => `${i.quantity || 1}x ${i.name}`).slice(0, 2).join(', ')
                            : '';
                        const method = (data.delivery_method === 'pickup' || data.order_type === 'pickup') ? 'PickUp' : 'Delivery';
                        const newNotification = {
                            id: data.id,
                            type: 'order',
                            title: '¡Nuevo Pedido!',
                            message: `Pedido de ${data.user_name || 'Cliente'} por $${Number(data.total || 0).toFixed(2)} (${method})${itemsSummary ? ` • ${itemsSummary}` : ''}`,
                            createdAt: Date.now(),
                            orderId: data.id
                        };

                        setNotifications(prev => [newNotification, ...prev]);

                        setTimeout(() => {
                            setNotifications(prev => prev.filter(n => n.id !== data.id));
                        }, 12000);
                    }
                }
            )
            .subscribe();

        // Listen for followers
        const followersChannel = supabase.channel(`admin-layout-followers:${currentUid}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'restaurant_followers',
                    filter: `restaurant_id=eq.${currentUid}`
                },
                (payload) => {
                    const data = payload.new as any;
                    const newNotification = {
                        id: `follower_${Date.now()}`,
                        type: 'new_follower',
                        title: '¡Nuevo Seguidor!',
                        message: `${data.user_name || 'Un usuario'} ha comenzado a seguir tu tienda`,
                        createdAt: Date.now(),
                    };

                    setNotifications(prev => [newNotification, ...prev]);

                    setTimeout(() => {
                        setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
                    }, 8000);
                }
            )
            .subscribe();

        // Listen for general notifications (new followers, reviews, etc.)
        const notifsChannel = supabase.channel(`admin-layout-notifs:${currentUid}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `restaurant_id=eq.${currentUid}`
                },
                (payload) => {
                    const data = payload.new as any;
                    const newNotification = {
                        id: data.id || `notif_${Date.now()}`,
                        type: data.type || 'general',
                        title: data.title || 'Notificación del negocio',
                        message: data.message || data.body || '',
                        createdAt: Date.now(),
                    };

                    setNotifications(prev => [...prev, newNotification]);

                    setTimeout(() => {
                        setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
                    }, 8000);
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(comercioChannel);
            supabase.removeChannel(ordersChannel);
            supabase.removeChannel(followersChannel);
            supabase.removeChannel(notifsChannel);
        };
    }, [user, currentUid]);

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
        await supabase.auth.signOut();
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
        if (!currentUid) return;
        setIsDeleting(true);
        try {
            // Call PostgreSQL RPC to cascade delete store and all foreign relations
            const { error: rpcErr } = await supabase.rpc('delete_comercio_cascade', { target_id: currentUid });
            if (rpcErr) {
                console.warn("RPC cascade delete failed, running manual cleanup fallback:", rpcErr);
                await supabase.from('products').delete().eq('restaurant_id', currentUid);
                await supabase.from('banners').delete().eq('restaurant_id', currentUid);
                await supabase.from('cashiers').delete().eq('restaurant_id', currentUid);
                await supabase.from('waiters').delete().eq('restaurant_id', currentUid);
                await supabase.from('restaurant_tables').delete().eq('restaurant_id', currentUid);
                await supabase.from('restaurant_followers').delete().eq('restaurant_id', currentUid);
                await supabase.from('printers').delete().eq('restaurant_id', currentUid);
                await supabase.from('reviews').delete().eq('restaurant_id', currentUid);
                await supabase.from('orders').delete().eq('restaurant_id', currentUid);
                const { error: delErr } = await supabase.from('comercios').delete().eq('id', currentUid);
                if (delErr) throw delErr;
            }

            await supabase.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/';
        } catch (error: any) {
            console.error("Error deleting account:", error);
            alert("Error al eliminar la cuenta: " + (error.message || "Por favor intenta de nuevo."));
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    const handleToggleAudio = async () => {
        if (!currentUid) return;
        setIsUpdatingAudio(true);
        try {
            const newValue = !audioAlertsEnabled;
            setAudioAlertsEnabled(newValue);
            await supabase.from('comercios').update({
                audio_alerts_enabled: newValue
            }).eq('id', currentUid);
        } catch (error) {
            console.error("Error toggling audio alerts:", error);
            setAudioAlertsEnabled(!audioAlertsEnabled); // Revert
            alert("Error al actualizar la configuración de alertas sonoras.");
        } finally {
            setIsUpdatingAudio(false);
        }
    };

    const isFeatureUnlocked = (featureKey?: string) => {
        if (!featureKey) return true;

        // 1. Desbloqueo manual en custom_features por el SuperAdmin
        if (commercialData.custom_features && commercialData.custom_features[featureKey] !== undefined) {
            return Boolean(commercialData.custom_features[featureKey]);
        }

        const mode = commercialData.billing_mode || 'subscription';

        // 2. Modalidad Comisión
        if (mode === 'commission') {
            return true;
        }

        // 3. Modalidad Cortesía / Free Custom
        if (mode === 'free_custom') {
            const advanced = ['waiters', 'cashiers', 'tables', 'printer_stations'];
            return !advanced.includes(featureKey);
        }

        // 4. Modalidad Suscripción
        const planId = commercialData.plan_id || 'emprendedor';
        let configuredPlan: any = null;
        if (Array.isArray(plansConfig?.plans)) {
            configuredPlan = plansConfig.plans.find((p: any) => p.id === planId);
        } else if (plansConfig?.plans && typeof plansConfig.plans === 'object') {
            configuredPlan = plansConfig.plans[planId];
        }

        if (configuredPlan?.features && configuredPlan.features[featureKey] !== undefined) {
            return Boolean(configuredPlan.features[featureKey]);
        }

        if (planId === 'corporativo') return true;

        // Plan Emprendedor: bloquea waiters, cashiers, tables, printer_stations por defecto
        const lockedInEmprendedor = ['waiters', 'cashiers', 'tables', 'printer_stations'];
        return !lockedInEmprendedor.includes(featureKey);
    };

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/orders', icon: ClipboardList, label: 'Pedidos' },
        { path: '/finance', icon: DollarSign, label: 'Caja y Finanzas' },
        { path: '/products', icon: UtensilsCrossed, label: 'Productos' },
        { path: '/notifications', icon: Bell, label: 'Notificaciones' },
        { path: '/clients', icon: Users, label: 'Clientes' },
        { path: '/fidelization', icon: Gift, label: 'Fidelización' },
        { path: '/waiters', icon: UserCheck, label: 'Meseros', featureKey: 'waiters' },
        { path: '/cashiers', icon: Shield, label: 'Cajeras', featureKey: 'cashiers' },
        { path: '/tables', icon: Grid, label: 'Mesas', featureKey: 'tables' },
        { path: '/stations', icon: Printer, label: 'Estaciones', featureKey: 'printer_stations' },
        { path: '/profile', icon: Store, label: 'Mi Negocio' },
        { path: '/banners', icon: Layout, label: 'Publicidad' },
        { path: '/push-campaigns', icon: Megaphone, label: 'Campañas Push' },
        { path: '/reviews', icon: MessageSquare, label: 'Reseñas' },
        { path: '/subscriptions', icon: CreditCard, label: 'Suscripción' },
    ];

    const currentCleanPath = location.pathname.replace(/^\/admin/, '') || '/';
    const currentNavItem = navItems.find(i => i.path === currentCleanPath);
    const isCurrentRouteLocked = currentNavItem?.featureKey && !isFeatureUnlocked(currentNavItem.featureKey);

    return (
        <div className="h-[100dvh] bg-slate-50 flex overflow-hidden">
            {/* Mobile/Tablet Sidebar Backdrop */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-slate-950 border-r border-white/10 z-50 transform transition-transform duration-300 ease-in-out lg:relative lg:w-72 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full pt-safe">
                    {/* Sidebar Header */}
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-14 h-14 flex items-center justify-center p-1 overflow-visible">
                                <img
                                    src={branding.app_restaurant_logo}
                                    alt={`${branding.app_client_name || 'Un 2x3'} Negocios`}
                                    className="w-full h-full object-contain filter drop-shadow-sm brightness-110"
                                />
                            </div>
                            <div className="flex flex-col">
                                <h1 className="font-black text-white leading-tight">{branding.app_client_name || 'Un 2x3'} Negocios</h1>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Business Hub</p>
                            </div>
                        </div>
                        <button className="lg:hidden p-2 text-slate-400 hover:text-white" onClick={() => setIsSidebarOpen(false)}>
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Nav Items */}
                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                        {navItems.map((item) => {
                            const isUnlocked = isFeatureUnlocked((item as any).featureKey);

                            if (!isUnlocked) {
                                return (
                                    <button
                                        key={item.path}
                                        type="button"
                                        onClick={() => {
                                            vibrateSelection();
                                            setShowLockedModal(item.label);
                                        }}
                                        className="w-full flex items-center justify-between p-4 rounded-2xl font-bold transition-all text-slate-500 hover:text-slate-300 hover:bg-white/5 opacity-75 group text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <item.icon className="w-5 h-5 text-slate-500 group-hover:text-slate-400" />
                                            <span>{item.label}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                Corporativo
                                            </span>
                                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                                        </div>
                                    </button>
                                );
                            }

                            return (
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
                            );
                        })}
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
                                <p className="text-[10px] text-slate-400 truncate lowercase font-medium">{user?.email || 'Business Manager'}</p>
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
                                        disabled={isDeleting}
                                        className="w-full bg-red-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                    >
                                        {isDeleting ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                <span>Eliminando cuenta...</span>
                                            </>
                                        ) : (
                                            'Sí, eliminar cuenta'
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        disabled={isDeleting}
                                        className="w-full bg-slate-50 text-slate-900 py-4 rounded-2xl font-black hover:bg-slate-100 transition-all disabled:opacity-50"
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
                {/* Sticky SuperAdmin Impersonation Banner */}
                {userData?.isImpersonating && (
                    <div className="sticky top-0 z-[100] bg-amber-400 text-amber-950 font-black text-xs md:text-sm px-4 py-2.5 flex items-center justify-between shadow-md border-b-2 border-amber-500 shrink-0">
                        <div className="flex items-center gap-2 truncate">
                            <span className="text-base animate-pulse">👁️</span>
                            <span className="truncate">
                                MODO SUPERADMIN: Gestionando el local <strong className="underline">{userData.impersonatedRestaurantName || restaurantName}</strong>
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                sessionStorage.removeItem('impersonate_restaurant_id');
                                const cleanUrl = window.location.origin + window.location.pathname;
                                window.location.href = cleanUrl;
                            }}
                            className="px-3.5 py-1 bg-amber-950 text-white rounded-xl text-xs uppercase tracking-wider hover:bg-black transition-all shrink-0 ml-3 shadow-xs active:scale-95"
                        >
                            Cerrar Vista Local
                        </button>
                    </div>
                )}

                {/* Top Header */}
                <header className="h-14 lg:h-20 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between flex-shrink-0 pt-safe">
                    <button
                        className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-900 active:scale-95 transition-transform"
                        onClick={() => { vibrateSelection(); setIsSidebarOpen(true); }}
                        aria-label="Abrir menú"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-4">
                        {/* Notifications indicator could go here */}
                    </div>
                </header>

                {/* Billing Banner */}
                {billingInfo.type === 'danger' && commercialData.billing_mode === 'subscription' && !plansConfig?.freeTrialEnabled && (
                    <div className="bg-red-500 text-white px-4 py-3 flex items-center justify-center gap-3 text-sm font-bold flex-shrink-0 animate-in slide-in-from-top duration-500 z-10 shadow-md">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-center">¡Aviso Importante! Su suscripción mensual de ${billingInfo.amount?.toFixed(2)} está vencida por {billingInfo.daysLate} {billingInfo.daysLate === 1 ? 'día' : 'días'}. Por favor, realice el pago para evitar suspensión del servicio.</span>
                    </div>
                )}
                {billingInfo.type === 'warning' && commercialData.billing_mode === 'subscription' && !plansConfig?.freeTrialEnabled && (
                    <div className="bg-amber-400 text-amber-950 px-4 py-3 flex items-center justify-center gap-3 text-sm font-bold flex-shrink-0 animate-in slide-in-from-top duration-500 z-10 shadow-md">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-center">Recordatorio: Su suscripción mensual de ${billingInfo.amount?.toFixed(2)} vence en {billingInfo.daysLeft} {billingInfo.daysLeft === 1 ? 'día' : 'días'}.</span>
                    </div>
                )}

                {/* Notifications Toast Container */}
                <div className="fixed top-24 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
                    {notifications.map(notification => (
                        <div 
                            key={notification.id} 
                            onClick={() => {
                                if (notification.type === 'order' || notification.orderId) {
                                    navigate('/orders');
                                } else {
                                    navigate('/notifications');
                                }
                                setNotifications(prev => prev.filter(n => n.id !== notification.id));
                            }}
                            className="bg-white rounded-2xl shadow-2xl border border-primary/20 p-4 w-84 animate-in slide-in-from-right-8 fade-in pointer-events-auto flex gap-3 items-start cursor-pointer hover:border-primary transition-all hover:scale-[1.02] active:scale-95"
                        >
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                {notification.type === 'new_follower' ? (
                                    <UserCheck className="w-5 h-5 text-primary" />
                                ) : notification.type === 'new_review' ? (
                                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                                ) : (
                                    <ClipboardList className="w-5 h-5 text-slate-900" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-black text-slate-900 text-sm">{notification.title}</h4>
                                <p className="text-xs font-medium text-slate-500 mt-0.5 line-clamp-2">{notification.message}</p>
                                <span className="text-[10px] font-bold text-primary block mt-1">Toca para ver detalles →</span>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setNotifications(prev => prev.filter(n => n.id !== notification.id));
                                }}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-2 md:p-8 relative custom-scrollbar">
                    {isCurrentRouteLocked ? (
                        <div className="flex items-center justify-center min-h-[500px]">
                            <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 text-center border-2 border-amber-200/80 shadow-xl shadow-amber-500/5 space-y-5 animate-in zoom-in-95">
                                <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                                    <Lock className="w-10 h-10" />
                                </div>
                                <div className="space-y-2">
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800">
                                        Plan Aliado Corporativo
                                    </span>
                                    <h2 className="text-2xl font-black text-slate-900">
                                        Módulo Bloqueado: {currentNavItem?.label}
                                    </h2>
                                    <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                        Este módulo no está habilitado para tu cuenta en este momento. Actualiza al <strong>Plan Aliado Corporativo</strong> o contacta al Superadministrador para desbloquearlo.
                                    </p>
                                </div>
                                <div className="pt-3 flex flex-col gap-2">
                                    <button
                                        onClick={() => navigate('/subscriptions')}
                                        className="w-full py-4 px-6 bg-primary hover:bg-amber-400 text-slate-900 font-black rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-95 text-sm cursor-pointer"
                                    >
                                        Ver Suscripción y Planes
                                    </button>
                                    <button
                                        onClick={() => navigate('/')}
                                        className="w-full py-3 px-6 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-2xl transition-colors text-xs cursor-pointer"
                                    >
                                        Volver al Inicio
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : children}
                </div>

                {/* Mobile Bottom Navigation */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-center justify-around pb-safe z-40 h-[64px] px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
                    <NavLink
                        to="/"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${isActive ? 'text-slate-900 font-black' : 'text-slate-400 font-bold hover:text-slate-600'}`}
                    >
                        {({ isActive }) => (
                            <>
                                <LayoutDashboard className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                                <span className="text-[10px] mt-0.5">Resumen</span>
                                {isActive && <span className="w-1 h-1 rounded-full bg-slate-900 mt-0.5"></span>}
                            </>
                        )}
                    </NavLink>
                    <NavLink
                        to="/orders"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${isActive ? 'text-slate-900 font-black' : 'text-slate-400 font-bold hover:text-slate-600'}`}
                    >
                        {({ isActive }) => (
                            <>
                                <ClipboardList className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                                <span className="text-[10px] mt-0.5">Pedidos</span>
                                {isActive && <span className="w-1 h-1 rounded-full bg-slate-900 mt-0.5"></span>}
                            </>
                        )}
                    </NavLink>
                    <NavLink
                        to="/products"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${isActive ? 'text-slate-900 font-black' : 'text-slate-400 font-bold hover:text-slate-600'}`}
                    >
                        {({ isActive }) => (
                            <>
                                <UtensilsCrossed className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                                <span className="text-[10px] mt-0.5">Menú</span>
                                {isActive && <span className="w-1 h-1 rounded-full bg-slate-900 mt-0.5"></span>}
                            </>
                        )}
                    </NavLink>
                    <NavLink
                        to="/finance"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${isActive ? 'text-slate-900 font-black' : 'text-slate-400 font-bold hover:text-slate-600'}`}
                    >
                        {({ isActive }) => (
                            <>
                                <DollarSign className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                                <span className="text-[10px] mt-0.5">Caja</span>
                                {isActive && <span className="w-1 h-1 rounded-full bg-slate-900 mt-0.5"></span>}
                            </>
                        )}
                    </NavLink>
                    <NavLink
                        to="/notifications"
                        onClick={() => vibrateSelection()}
                        className={({ isActive }) => `flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${isActive ? 'text-slate-900 font-black' : 'text-slate-400 font-bold hover:text-slate-600'}`}
                    >
                        {({ isActive }) => (
                            <>
                                <Bell className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                                <span className="text-[10px] mt-0.5">Avisos</span>
                                {isActive && <span className="w-1 h-1 rounded-full bg-slate-900 mt-0.5"></span>}
                            </>
                        )}
                    </NavLink>
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
                            ID del Negocio: {currentUid}
                        </p>
                    </div>
                </div>
            )}
            {/* Modal de Módulo Bloqueado */}
            {showLockedModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-[2.5rem] max-w-md w-full p-8 text-center space-y-5 shadow-2xl border border-slate-100">
                        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                            <Lock className="w-8 h-8" />
                        </div>
                        <div className="space-y-2">
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800">
                                Plan Aliado Corporativo
                            </span>
                            <h3 className="text-xl font-black text-slate-900">
                                Módulo: {showLockedModal}
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                                Este módulo está reservado para el <strong className="text-slate-800">Plan Aliado Corporativo</strong> o requiere habilitación personalizada por parte de la administración de Un 2x3.
                            </p>
                        </div>
                        <div className="pt-2 flex flex-col sm:flex-row gap-2">
                            <button
                                onClick={() => setShowLockedModal(null)}
                                className="flex-1 py-3.5 px-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-xs cursor-pointer"
                            >
                                Entendido
                            </button>
                            <button
                                onClick={() => {
                                    setShowLockedModal(null);
                                    setIsSidebarOpen(false);
                                    navigate('/subscriptions');
                                }}
                                className="flex-1 py-3.5 px-4 rounded-xl font-black text-slate-900 bg-primary hover:bg-amber-400 transition-all text-xs shadow-md shadow-primary/20 cursor-pointer"
                            >
                                Ver Planes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
