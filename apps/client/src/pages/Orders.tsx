import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingBag, Clock, ChevronRight, Bike, Navigation, Store, MessageCircle, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { sendAppNotification } from '../services/nativeNotificationService';
import Cart from './Cart';

type TabType = 'cart' | 'active';

export default function Orders() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab') as TabType;
    const [activeTab, setActiveTab] = useState<TabType>(tabParam || 'cart');
    const { user, userData } = useAuth();
    const { bcvRate } = useCurrency();
    const [activeOrders, setActiveOrders] = useState<any[]>([]);
    const [activeTransports, setActiveTransports] = useState<any[]>([]);
    const [restaurantLogos, setRestaurantLogos] = useState<Record<string, string>>({});
    const [loadingOrders, setLoadingOrders] = useState(true);
    const notifiedOrdersRef = useRef<Set<string>>(new Set());
    const navigate = useNavigate();

    const isValidUUID = (str?: string | null): boolean =>
        Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str));

    const rawUserId = user?.id || user?.uid || (userData as any)?.id || (userData as any)?.uid;
    const authUUID = isValidUUID(rawUserId) ? rawUserId : null;
    const localOrderId = localStorage.getItem('active_order_id');
    const validLocalOrderUUID = isValidUUID(localOrderId) ? localOrderId : null;

    const formatOrderDate = (dateVal: any) => {
        if (!dateVal) return 'Hoy';
        const d = typeof dateVal?.toDate === 'function' ? dateVal.toDate() : new Date(dateVal);
        if (isNaN(d.getTime())) return 'Hoy';
        return `${d.toLocaleDateString()} • ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                if (!authUUID && !validLocalOrderUUID) {
                    setActiveOrders([]);
                    setLoadingOrders(false);
                    return;
                }

                let ordersQuery = supabase
                    .from('orders')
                    .select('*')
                    .not('status', 'in', '("completed","cancelled","rejected","delivered")')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (authUUID && validLocalOrderUUID && authUUID !== validLocalOrderUUID) {
                    ordersQuery = ordersQuery.or(`user_id.eq.${authUUID},id.eq.${validLocalOrderUUID}`);
                } else if (authUUID) {
                    ordersQuery = ordersQuery.eq('user_id', authUUID);
                } else if (validLocalOrderUUID) {
                    ordersQuery = ordersQuery.eq('id', validLocalOrderUUID);
                }

                const { data, error } = await ordersQuery;

                // Also fetch active transport & logistics requests (Fase 4)
                let transportsQuery = supabase
                    .from('transport_requests')
                    .select('*')
                    .in('status', ['searching', 'accepted', 'arriving', 'in_progress', 'verifying_payment'])
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (authUUID) {
                    transportsQuery = transportsQuery.eq('user_id', authUUID);
                }
                const { data: trData } = await transportsQuery;
                if (trData) {
                    setActiveTransports(trData);
                }

                if (!error && data) {
                    setActiveOrders(data);

                    // If active orders exist and no explicit tab was requested in URL, switch to active orders tab
                    if (data.length > 0 && !tabParam) {
                        setActiveTab('active');
                    }

                    // Status bar native notification for mobile drawer
                    const pendingOrder = data.find((o: any) => o.status === 'pendiente_pago' || o.status === 'pending');
                    if (pendingOrder && !notifiedOrdersRef.current.has(pendingOrder.id)) {
                        notifiedOrdersRef.current.add(pendingOrder.id);
                        sendAppNotification({
                            title: `Pedido pendiente por pagar (#${pendingOrder.id.slice(0, 6).toUpperCase()})`,
                            body: `${pendingOrder.restaurant_name || 'Comercio'} • $${Number(pendingOrder.total || 0).toFixed(2)} - Toca para entrar al chat y reportar tu pago.`,
                            tag: `active-order-${pendingOrder.id}`,
                            soundType: 'client',
                            onClick: () => navigate(`/track/${pendingOrder.id}`)
                        }).catch(() => {});
                    }
                }
            } catch (err) {
                console.error("Error fetching active orders:", err);
            } finally {
                setLoadingOrders(false);
            }
        };

        fetchOrders();

        const channelId = authUUID || validLocalOrderUUID || 'client_orders';
        const channel = supabase
            .channel(`client_orders_${channelId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchOrders();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [authUUID, validLocalOrderUUID, tabParam]);

    // Fetch restaurant logos when orders change
    useEffect(() => {
        const fetchLogos = async () => {
            const newLogos = { ...restaurantLogos };
            let changed = false;

            for (const order of activeOrders) {
                const restId = order.restaurant_id || order.restaurantId;
                if (restId && !newLogos[restId]) {
                    try {
                        const { data } = await supabase
                            .from('comercios')
                            .select('logo_url, logoUrl, logo')
                            .eq('id', restId)
                            .maybeSingle();

                        if (data) {
                            newLogos[restId] = data.logo_url || data.logoUrl || data.logo || '';
                            changed = true;
                        }
                    } catch (err) {
                        console.error("Error fetching restaurant logo:", err);
                    }
                }
            }

            if (changed) {
                setRestaurantLogos(newLogos);
            }
        };

        if (activeOrders.length > 0) {
            fetchLogos();
        }
    }, [activeOrders]);

    // Update URL when tab changes
    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    if (activeTab === 'cart') {
        return (
            <div className="flex flex-col h-full bg-slate-50 relative">
                {/* Custom Tab Header for Cart */}
                <div className="bg-white px-4 pt-4 pb-2 sticky top-0 z-40 border-b border-slate-100 shadow-sm">
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                        <button
                            onClick={() => handleTabChange('cart')}
                            className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'cart' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <ShoppingBag className="w-4 h-4" />
                            Nuevo Pedido
                        </button>
                        <button
                            onClick={() => handleTabChange('active')}
                            className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative ${activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Clock className="w-4 h-4" />
                            Mis Pedidos
                            {activeOrders.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-slate-900 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-100 animate-bounce">
                                    {activeOrders.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <Cart hideHeader={true} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white px-4 pt-4 pb-2 sticky top-0 z-40 border-b border-slate-100 shadow-sm">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                    <button
                        onClick={() => handleTabChange('cart')}
                        className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'cart' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <ShoppingBag className="w-4 h-4" />
                        Nuevo Pedido
                    </button>
                    <button
                        onClick={() => handleTabChange('active')}
                        className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative ${activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Clock className="w-4 h-4" />
                        Mis Pedidos
                        {activeOrders.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-slate-900 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-100 animate-bounce">
                                {activeOrders.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingOrders ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Buscando tus pedidos...</p>
                    </div>
                ) : (activeOrders.length === 0 && activeTransports.length === 0) ? (
                    <div className="flex flex-col items-center justify-center py-20 px-10 text-center space-y-6">
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full"></div>
                            <Bike className="w-20 h-20 text-slate-200 relative z-10" />
                        </div>
                        <div className="space-y-2 relative z-10">
                            <h3 className="text-xl font-black text-slate-900">No tienes pedidos activos</h3>
                            <p className="text-slate-500 text-sm font-medium leading-relaxed">Explora todas las tiendas o solicita un servicio de transporte ahora mismo.</p>
                        </div>
                        <button
                            onClick={() => navigate('/')}
                            className="bg-primary text-slate-900 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/30 active:scale-95 transition-all w-full"
                        >
                            Ir al Inicio
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 pb-10">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Rastreo en Tiempo Real</h2>
                            <span className="text-[10px] font-bold text-slate-900 bg-primary/10 px-2 py-0.5 rounded-full">
                                {activeOrders.length + activeTransports.length} Activos
                            </span>
                        </div>

                        {/* Active Transports & Mandados (Fase 4) */}
                        {activeTransports.map((tr) => {
                            const isMandado = tr.service_category === 'muchacho_mandado' || tr.type === 'muchacho_mandado';
                            const trPrice = Number(tr.client_total || tr.price || 0);
                            const trBs = bcvRate > 0 ? (trPrice * bcvRate).toFixed(0) : '0';
                            const trRoute = isMandado ? `/mandado/tracking/${tr.id}` : `/transport/tracking/${tr.id}`;
                            const isSearching = tr.status === 'searching';

                            return (
                                <div
                                    key={tr.id}
                                    onClick={() => navigate(trRoute)}
                                    className="bg-slate-900 text-white rounded-3xl p-5 shadow-2xl shadow-slate-950/20 border border-slate-800 cursor-pointer active:scale-[0.98] transition-all relative overflow-hidden group"
                                >
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-md">
                                                {isMandado ? <ShoppingBag className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-black text-sm uppercase tracking-wide text-white truncate">
                                                    {isMandado ? "Muchacho e' Mandao" : (tr.service_category || 'Servicio de Transporte')}
                                                </p>
                                                <p className="text-[10px] text-amber-300 font-bold uppercase tracking-tight">
                                                    {isSearching ? 'Buscando conductor cercano...' : `Conductor: ${tr.driver_name || 'Asignado'}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right bg-white/10 px-2.5 py-1 rounded-xl border border-white/10 shrink-0">
                                            <div className="text-xs font-black text-white">
                                                ${trPrice.toFixed(2)}
                                            </div>
                                            <div className="text-[9px] font-bold text-slate-300">
                                                {trBs} Bs
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 text-xs text-slate-300 truncate mb-3">
                                        <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <span className="truncate">
                                            Destino: {tr.destination?.address || tr.destination?.name || 'Dirección de entrega'}
                                        </span>
                                    </div>

                                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-black">
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                                            isSearching ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30 animate-pulse' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                        }`}>
                                            {isSearching ? 'En Radar' : tr.status}
                                        </span>
                                        <span className="text-amber-400 flex items-center gap-1 text-[11px] group-hover:translate-x-1 transition-transform">
                                            Ver Mapa & Chat <ArrowRight className="w-3.5 h-3.5" />
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        {activeOrders.map((order) => {
                            const isPendingPayment = order.status === 'pending' || order.status === 'pendiente_pago';
                            const orderTotal = Number(order.total || 0);
                            const bsTotal = bcvRate > 0 ? (orderTotal * bcvRate).toFixed(0) : '0';
                            const deliveryLabel = order.delivery_method === 'pickup' 
                                ? 'Retiro en tienda (PickUp)' 
                                : (order.delivery_address || order.address?.name || 'Entrega a domicilio');

                            // High-visibility Material 3 Card for Pending Payment Orders (Synced with Home card)
                            if (isPendingPayment) {
                                return (
                                    <div
                                        key={order.id}
                                        onClick={() => navigate(`/track/${order.id}`)}
                                        className="bg-gradient-to-r from-red-600 via-orange-600 to-amber-500 text-white rounded-3xl p-5 shadow-2xl shadow-orange-500/25 border border-orange-400/30 cursor-pointer active:scale-[0.98] transition-all overflow-hidden relative"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 pointer-events-none"></div>

                                        {/* Header Row: Store + POR PAGAR Badge + Total */}
                                        <div className="flex items-center justify-between gap-2 mb-3 relative z-10">
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
                                                    <Store className="w-5 h-5 text-white" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-black text-sm uppercase tracking-wide truncate">
                                                        {order.restaurant_name || order.restaurantName || 'Comercio'}
                                                    </p>
                                                    <p className="text-[10px] text-white/80 font-bold uppercase tracking-tight">
                                                        {formatOrderDate(order.created_at || order.createdAt)}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="bg-yellow-400 text-slate-950 font-black px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider shadow-sm animate-pulse">
                                                    POR PAGAR
                                                </span>
                                                <div className="text-right bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/20">
                                                    <div className="text-xs font-black leading-tight">
                                                        ${orderTotal.toFixed(2)}
                                                    </div>
                                                    <div className="text-[9px] font-bold text-white/80 leading-none">
                                                        {bsTotal} Bs
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Frosted Chat Link Banner */}
                                        <div className="mb-3 p-3 rounded-2xl bg-white/15 border border-white/20 backdrop-blur-md flex items-start gap-2.5 relative z-10">
                                            <MessageCircle className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5 animate-bounce" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-white leading-snug">
                                                    Pago pendiente • Toca para revisar datos y reportar tu pago
                                                </p>
                                                <span className="text-[10px] font-black text-yellow-300 uppercase tracking-wider block mt-1">
                                                    💬 TOCA PARA ENTRAR AL CHAT EN VIVO Y ADMINISTRAR TU COMPRA
                                                </span>
                                            </div>
                                        </div>

                                        {/* Bottom Action Bar */}
                                        <div className="pt-2 border-t border-white/15 flex items-center justify-between text-[11px] font-bold relative z-10">
                                            <div className="flex items-center gap-1.5 truncate max-w-[190px] text-white/90">
                                                <Navigation className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                                                <span className="truncate">{deliveryLabel}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-yellow-300 font-black uppercase text-[10px] tracking-wider shrink-0 hover:translate-x-1 transition-transform">
                                                <span>ENTRAR AL CHAT Y ADMINISTRAR</span>
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            // Standard Card for Orders in Preparation / In Transit / Arriving
                            return (
                                <div
                                    key={order.id}
                                    onClick={() => navigate(`/track/${order.id}`)}
                                    className="bg-white rounded-3xl p-5 shadow-xl shadow-slate-200/40 border border-slate-100 group active:scale-[0.98] transition-all cursor-pointer overflow-hidden relative"
                                >
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                                    
                                    <div className="flex justify-between items-start mb-4 relative z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-primary/10 transition-all overflow-hidden border border-slate-100 shadow-inner">
                                                {restaurantLogos[order.restaurant_id || order.restaurantId] ? (
                                                    <img src={restaurantLogos[order.restaurant_id || order.restaurantId]} alt="Logo" className="w-full h-full object-cover" />
                                                ) : (
                                                    <ShoppingBag className="w-7 h-7" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 group-hover:text-slate-900 transition-colors text-lg">#{order.id.slice(-6).toUpperCase()}</p>
                                                <p className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{order.restaurant_name || order.restaurantName || 'Restaurante'}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">
                                                    {formatOrderDate(order.created_at || order.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                                            order.status === 'preparing' || order.status === 'accepted' ? 'bg-orange-100 text-orange-600 shadow-sm shadow-orange-100' :
                                            order.status === 'in_transit' || order.status === 'driver_assigned' || order.status === 'arriving' ? 'bg-emerald-100 text-emerald-600 shadow-sm shadow-emerald-100' :
                                            'bg-slate-100 text-slate-600'
                                        }`}>
                                            {order.status === 'preparing' ? 'Preparando' :
                                             order.status === 'accepted' ? 'Confirmado' :
                                             order.status === 'driver_assigned' ? 'Piloto Asignado' :
                                             order.status === 'in_transit' ? 'En Camino' :
                                             order.status === 'arriving' ? 'Llegando' : order.status}
                                        </span>
                                    </div>

                                    <div className="space-y-3 mb-5 relative z-10">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Navigation className="w-3.5 h-3.5 text-slate-400" />
                                            <p className="text-xs font-bold truncate flex-1">{deliveryLabel}</p>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <div className="flex -space-x-2">
                                                {order.items?.slice(0, 3).map((item: any, i: number) => (
                                                    <div key={i} className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-black text-slate-500 overflow-hidden">
                                                        {item.quantity}x
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-[10px] font-bold uppercase tracking-tighter">
                                                {order.items?.length || 0} productos • Total: ${orderTotal.toFixed(2)} ({bsTotal} Bs)
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 pt-4 border-t border-slate-50 relative z-10">
                                        <button className="flex-1 bg-primary text-slate-900 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 group-hover:bg-orange-600 transition-all">
                                            <MessageCircle className="w-4 h-4" />
                                            Ver Seguimiento & Chat
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
