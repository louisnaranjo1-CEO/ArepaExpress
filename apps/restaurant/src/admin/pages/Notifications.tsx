import React, { useState, useEffect } from 'react';
import { Bell, Users, ShoppingBag, Star, Truck, Volume2, VolumeX, CheckCircle, Clock, Filter, Trash2, Settings, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useHaptics } from '../../hooks/useHaptics';

interface NotificationItem {
    id: string;
    type: 'follower' | 'order' | 'review' | 'general';
    title: string;
    message: string;
    date: Date;
    read?: boolean;
    data?: any;
}

interface NotificationPrefs {
    followers: boolean;
    orders: boolean;
    reviews: boolean;
    statusUpdates: boolean;
    soundEnabled: boolean;
}

export default function Notifications() {
    const { user, userData } = useAuth();
    const rid = userData?.managedRestaurantId || user?.uid;
    const { vibrateSelection, vibrateSuccess } = useHaptics();

    const [activeTab, setActiveTab] = useState<'feed' | 'settings'>('feed');
    const [feedFilter, setFeedFilter] = useState<'all' | 'follower' | 'order' | 'review'>('all');
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [prefs, setPrefs] = useState<NotificationPrefs>(() => {
        const saved = localStorage.getItem(`deliexpress_notif_prefs_${rid}`);
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { }
        }
        return {
            followers: true,
            orders: true,
            reviews: true,
            statusUpdates: true,
            soundEnabled: true,
        };
    });

    const [savingPrefs, setSavingPrefs] = useState(false);

    useEffect(() => {
        if (!rid) return;
        loadNotifications();

        // 1. Follower Realtime Listener
        const followersChannel = supabase.channel(`notifs-followers-${rid}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'restaurant_followers',
                    filter: `restaurant_id=eq.${rid}`
                },
                (payload) => {
                    const data = payload.new as any;
                    const item: NotificationItem = {
                        id: `f_${data.user_id}_${Date.now()}`,
                        type: 'follower',
                        title: '¡Nuevo Seguidor!',
                        message: `${data.user_name || 'Un usuario'} ha comenzado a seguir tu tienda`,
                        date: new Date(data.created_at || Date.now()),
                        read: false
                    };
                    setNotifications(prev => [item, ...prev]);
                    if (prefs.soundEnabled) playNotificationSound();
                }
            )
            .subscribe();

        // 2. Orders Realtime Listener
        const ordersChannel = supabase.channel(`notifs-orders-${rid}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orders',
                    filter: `restaurant_id=eq.${rid}`
                },
                (payload) => {
                    const data = payload.new as any;
                    const item: NotificationItem = {
                        id: `o_${data.id}`,
                        type: 'order',
                        title: '¡Nuevo Pedido Entrante!',
                        message: `Pedido de ${data.user_name || 'Cliente'} por $${Number(data.total || 0).toFixed(2)}`,
                        date: new Date(data.created_at || Date.now()),
                        read: false
                    };
                    setNotifications(prev => [item, ...prev]);
                    if (prefs.soundEnabled) playNotificationSound();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(followersChannel);
            supabase.removeChannel(ordersChannel);
        };
    }, [rid, prefs.soundEnabled]);

    const playNotificationSound = () => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.35);
        } catch (e) {
            console.error("Audio error", e);
        }
    };

    const loadNotifications = async () => {
        if (!rid) return;
        setLoading(true);
        try {
            const feed: NotificationItem[] = [];

            // A. Recent Followers
            const { data: followers } = await supabase
                .from('restaurant_followers')
                .select('*')
                .eq('restaurant_id', rid)
                .order('created_at', { ascending: false })
                .limit(25);

            (followers || []).forEach((f: any) => {
                feed.push({
                    id: `fol_${f.user_id}_${f.created_at}`,
                    type: 'follower',
                    title: 'Nuevo Seguidor',
                    message: `${f.user_name || 'Un usuario'} comenzó a seguir tu tienda`,
                    date: new Date(f.created_at || Date.now()),
                    read: true
                });
            });

            // B. Recent Orders
            const { data: orders } = await supabase
                .from('orders')
                .select('id, user_name, total, status, created_at')
                .eq('restaurant_id', rid)
                .order('created_at', { ascending: false })
                .limit(25);

            (orders || []).forEach((o: any) => {
                feed.push({
                    id: `ord_${o.id}`,
                    type: 'order',
                    title: o.status === 'delivered' ? 'Pedido Entregado' : 'Nuevo Pedido',
                    message: `${o.user_name || 'Cliente'} - Total: $${Number(o.total || 0).toFixed(2)} (${o.status})`,
                    date: new Date(o.created_at || Date.now()),
                    read: true
                });
            });

            // C. Recent Reviews
            const { data: reviews } = await supabase
                .from('reviews')
                .select('*')
                .eq('restaurant_id', rid)
                .order('created_at', { ascending: false })
                .limit(15);

            (reviews || []).forEach((r: any) => {
                feed.push({
                    id: `rev_${r.id}`,
                    type: 'review',
                    title: `Nueva Reseña (${r.rating || 5}★)`,
                    message: `${r.user_name || 'Cliente'}: "${r.comment || 'Excelente servicio'}"`,
                    date: new Date(r.created_at || Date.now()),
                    read: true
                });
            });

            // Sort all by date descending
            feed.sort((a, b) => b.date.getTime() - a.date.getTime());
            setNotifications(feed);
        } catch (err) {
            console.error("Error loading notifications:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleTogglePref = async (key: keyof NotificationPrefs) => {
        vibrateSelection();
        const updated = { ...prefs, [key]: !prefs[key] };
        setPrefs(updated);
        localStorage.setItem(`deliexpress_notif_prefs_${rid}`, JSON.stringify(updated));

        // Sync audio alert setting with comercios table if toggled
        if (key === 'soundEnabled') {
            setSavingPrefs(true);
            try {
                await supabase
                    .from('comercios')
                    .update({ audio_alerts_enabled: updated.soundEnabled })
                    .eq('id', rid);
            } catch (e) {
                console.error("Error syncing audio preference:", e);
            } finally {
                setSavingPrefs(false);
            }
        }
    };

    const filteredNotifications = notifications.filter(n => {
        if (feedFilter === 'all') return true;
        return n.type === feedFilter;
    });

    const getIcon = (type: string) => {
        switch (type) {
            case 'follower':
                return <Users className="w-4 h-4 text-emerald-600" />;
            case 'order':
                return <ShoppingBag className="w-4 h-4 text-blue-600" />;
            case 'review':
                return <Star className="w-4 h-4 text-amber-500 fill-amber-500" />;
            default:
                return <Bell className="w-4 h-4 text-slate-700" />;
        }
    };

    const getBadgeClass = (type: string) => {
        switch (type) {
            case 'follower':
                return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'order':
                return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'review':
                return 'bg-amber-50 text-amber-700 border-amber-100';
            default:
                return 'bg-slate-50 text-slate-700 border-slate-100';
        }
    };

    return (
        <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500 pb-20 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                        <Bell className="w-6 h-6 text-slate-900" />
                        Centro de Notificaciones
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                        Actividad de seguidores, pedidos y preferencias de aviso
                    </p>
                </div>

                {/* Top tabs */}
                <div className="flex bg-slate-100 p-1 rounded-xl sm:rounded-2xl shrink-0">
                    <button
                        onClick={() => { vibrateSelection(); setActiveTab('feed'); }}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-black transition-all ${activeTab === 'feed'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-900'
                            }`}
                    >
                        <Clock className="w-4 h-4" />
                        <span>Actividad ({notifications.length})</span>
                    </button>
                    <button
                        onClick={() => { vibrateSelection(); setActiveTab('settings'); }}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-black transition-all ${activeTab === 'settings'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-900'
                            }`}
                    >
                        <Settings className="w-4 h-4" />
                        <span>Ajustes</span>
                    </button>
                </div>
            </div>

            {/* TAB: FEED */}
            {activeTab === 'feed' && (
                <div className="space-y-3 sm:space-y-4">
                    {/* Filters Bar */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                        {[
                            { id: 'all', label: 'Todo' },
                            { id: 'follower', label: 'Seguidores' },
                            { id: 'order', label: 'Pedidos' },
                            { id: 'review', label: 'Reseñas' }
                        ].map((f) => (
                            <button
                                key={f.id}
                                onClick={() => { vibrateSelection(); setFeedFilter(f.id as any); }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 ${feedFilter === f.id
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                                    }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="p-12 text-center bg-white rounded-2xl border border-slate-100">
                            <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-xs font-bold text-slate-400">Cargando notificaciones...</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="p-12 text-center bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm">
                            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                                <Bell className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-black text-slate-800">No hay notificaciones</p>
                            <p className="text-xs text-slate-400 mt-1">Aquí verás cuando nuevos clientes te sigan o realicen compras.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredNotifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-3 hover:border-slate-200 transition-all"
                                >
                                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border ${getBadgeClass(notif.type)}`}>
                                        {getIcon(notif.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                                                {notif.title}
                                            </h4>
                                            <span className="text-[10px] font-bold text-slate-400 shrink-0">
                                                {notif.date.toLocaleDateString([], { month: 'short', day: 'numeric' })} {notif.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed">
                                            {notif.message}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB: SETTINGS */}
            {activeTab === 'settings' && (
                <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4">
                    <div>
                        <h2 className="text-base sm:text-lg font-black text-slate-900">
                            Preferencias de Avisos
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Elige qué eventos quieres que activen notificaciones y alertas de sonido.
                        </p>
                    </div>

                    <div className="divide-y divide-slate-100">
                        {/* Toggle: Seguidores */}
                        <div className="py-3.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                                    <Users className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-900">Nuevos Seguidores</p>
                                    <p className="text-xs text-slate-500 font-medium">Avisar en tiempo real cuando un usuario te siga</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleTogglePref('followers')}
                                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 p-0.5 ${prefs.followers ? 'bg-slate-900' : 'bg-slate-200'}`}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${prefs.followers ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Toggle: Pedidos */}
                        <div className="py-3.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                                    <ShoppingBag className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-900">Nuevos Pedidos y Compras</p>
                                    <p className="text-xs text-slate-500 font-medium">Alertas inmediatas en pantalla al recibir pedidos</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleTogglePref('orders')}
                                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 p-0.5 ${prefs.orders ? 'bg-slate-900' : 'bg-slate-200'}`}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${prefs.orders ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Toggle: Reseñas */}
                        <div className="py-3.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                                    <Star className="w-5 h-5 fill-amber-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-900">Calificaciones y Reseñas</p>
                                    <p className="text-xs text-slate-500 font-medium">Notificar opiniones dejadas por los clientes</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleTogglePref('reviews')}
                                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 p-0.5 ${prefs.reviews ? 'bg-slate-900' : 'bg-slate-200'}`}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${prefs.reviews ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Toggle: Audio Alerts */}
                        <div className="py-3.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
                                    {prefs.soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-900">Alertas Sonoras (Chime)</p>
                                    <p className="text-xs text-slate-500 font-medium">Reproducir timbre de audio al recibir eventos</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleTogglePref('soundEnabled')}
                                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 p-0.5 ${prefs.soundEnabled ? 'bg-slate-900' : 'bg-slate-200'}`}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${prefs.soundEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>

                    {/* Test Audio Button */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-bold">Probar sonido de notificación:</span>
                        <button
                            onClick={() => { playNotificationSound(); vibrateSuccess(); }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                            <Volume2 className="w-4 h-4 text-slate-900" />
                            Reproducir Timbre
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
