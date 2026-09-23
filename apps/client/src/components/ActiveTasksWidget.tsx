import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Car,
    Bike,
    Package,
    ShoppingBag,
    Utensils,
    ArrowRight,
    MapPin,
    Phone,
    MessageCircle,
    Clock,
    CheckCircle2,
    AlertCircle,
    XCircle,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Radio,
    Sparkles,
    Star,
    Store,
    RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { vibrate } from '../utils/haptics';

export interface BidItem {
    id: string;
    transport_request_id: string;
    driver_id: string;
    driver_name: string;
    driver_photo?: string | null;
    driver_phone?: string | null;
    vehicle_type?: string;
    vehicle_plate?: string;
    vehicle_model?: string;
    vehicle_brand?: string;
    vehicle_year?: string;
    vehicle_color?: string;
    has_ac?: boolean;
    has_thermal_bag?: boolean;
    driver_payment_info?: any;
    driver_rating?: number;
    amount: number;
    eta_minutes?: number;
    status: string;
}

export interface ActiveTask {
    id: string;
    type: 'transport' | 'order';
    serviceCategory?: string;
    status: string;
    title: string;
    subtitle: string;
    badgeStatus: string;
    badgeColor: string;
    driverName?: string;
    driverPhone?: string;
    driverPhoto?: string;
    vehicleType?: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    driverRating?: number;
    price?: number;
    destinationName?: string;
    originName?: string;
    mandadoDescription?: string;
    mandadoStoreName?: string;
    createdAt?: string;
    url: string;
    bids?: BidItem[];
    assignedDriverId?: string;
}

export default function ActiveTasksWidget() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<ActiveTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [bcvRate, setBcvRate] = useState<number>(45.0);
    const [expandedBidsTaskId, setExpandedBidsTaskId] = useState<string | null>(null);
    const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);
    const [taskToCancel, setTaskToCancel] = useState<ActiveTask | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
    const [now, setNow] = useState(Date.now());

    const prevBidsCountRef = useRef<Record<string, number>>({});

    // Live clock ticker for expiration detection (every 5 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const isValidUUID = (str?: string | null): boolean =>
        Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str));

    const rawUserId = user?.id || user?.uid || (userData as any)?.id || (userData as any)?.uid;
    const authUUID = isValidUUID(rawUserId) ? rawUserId : null;
    const localTransportId = localStorage.getItem('active_transport_req_id');
    const validLocalTransportUUID = isValidUUID(localTransportId) ? localTransportId : null;
    const localOrderId = localStorage.getItem('active_order_id');
    const validLocalOrderUUID = isValidUUID(localOrderId) ? localOrderId : null;

    // Fetch BCV Rate
    useEffect(() => {
        const fetchBcvRate = async () => {
            try {
                const { data } = await supabase
                    .from('system_configs')
                    .select('*')
                    .eq('id', 'finances')
                    .maybeSingle();
                if (data && (data.bcvRate || data.bcv_rate)) {
                    setBcvRate(Number(data.bcvRate || data.bcv_rate));
                }
            } catch (e) {
                console.warn('Error fetching bcv rate for widget:', e);
            }
        };
        fetchBcvRate();
    }, []);

    const fetchActiveTasks = useCallback(async () => {
        if (!authUUID && !validLocalTransportUUID && !validLocalOrderUUID) {
            setTasks([]);
            setLoading(false);
            return;
        }

        try {
            // 1. Fetch active transports (rides, deliveries, mandados, including unconfirmed payments)
            let transportsQuery = supabase
                .from('transport_requests')
                .select('*')
                .in('status', ['searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress', 'completed'])
                .order('created_at', { ascending: false })
                .limit(6);

            if (authUUID && validLocalTransportUUID && authUUID !== validLocalTransportUUID) {
                transportsQuery = transportsQuery.or(`user_id.eq.${authUUID},id.eq.${validLocalTransportUUID}`);
            } else if (authUUID) {
                transportsQuery = transportsQuery.eq('user_id', authUUID);
            } else if (validLocalTransportUUID) {
                transportsQuery = transportsQuery.eq('id', validLocalTransportUUID);
            }

            const { data: rawTransports, error: trErr } = await transportsQuery;
            if (trErr) console.warn('Error fetching transports for widget:', trErr);

            // Filter out completed transports whose payment is already fully confirmed
            const transports = (rawTransports || []).filter((t: any) => {
                if (t.status === 'completed') {
                    return t.payment_status !== 'confirmed';
                }
                return true;
            }).slice(0, 3);

            // Sync localStorage: if the local request is fully completed (with confirmed payment) or cancelled, clean it up
            if (validLocalTransportUUID && transports) {
                const found = transports.find((t: any) => t.id === validLocalTransportUUID);
                if (!found) {
                    supabase.from('transport_requests')
                        .select('status, payment_status')
                        .eq('id', validLocalTransportUUID)
                        .maybeSingle()
                        .then(({ data }) => {
                            if (data && (data.status === 'cancelled' || (data.status === 'completed' && data.payment_status === 'confirmed'))) {
                                localStorage.removeItem('active_transport_req_id');
                            }
                        });
                }
            }

            // 2. Fetch active food/store delivery orders
            let orders: any[] = [];
            if (authUUID || validLocalOrderUUID) {
                let ordersQuery = supabase
                    .from('orders')
                    .select('*')
                    .in('status', ['pending', 'payment_review', 'confirmed', 'preparing', 'ready', 'on_way', 'arrived'])
                    .order('created_at', { ascending: false })
                    .limit(3);

                if (authUUID && validLocalOrderUUID && authUUID !== validLocalOrderUUID) {
                    ordersQuery = ordersQuery.or(`user_id.eq.${authUUID},id.eq.${validLocalOrderUUID}`);
                } else if (authUUID) {
                    ordersQuery = ordersQuery.eq('user_id', authUUID);
                } else if (validLocalOrderUUID) {
                    ordersQuery = ordersQuery.eq('id', validLocalOrderUUID);
                }

                const { data: ordData, error: ordErr } = await ordersQuery;
                if (ordErr) console.warn('Error fetching orders for widget:', ordErr);
                orders = ordData || [];
            }

            // 3. For any active mandados in searching state, fetch incoming bids
            const mandadoReqIds = (transports || [])
                .filter((t: any) => (t.service_category === 'muchacho_mandado' || t.type === 'muchacho_mandado') && t.status === 'searching')
                .map((t: any) => t.id);

            let bidsMap: Record<string, BidItem[]> = {};
            if (mandadoReqIds.length > 0) {
                const { data: bidsData } = await supabase
                    .from('transport_bids')
                    .select('*')
                    .in('transport_request_id', mandadoReqIds)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false });

                (bidsData || []).forEach((b: any) => {
                    if (!bidsMap[b.transport_request_id]) bidsMap[b.transport_request_id] = [];
                    bidsMap[b.transport_request_id].push({
                        id: b.id,
                        transport_request_id: b.transport_request_id,
                        driver_id: b.driver_id,
                        driver_name: b.driver_name || 'Conductor',
                        driver_photo: b.driver_photo,
                        driver_phone: b.driver_phone,
                        vehicle_type: b.vehicle_type || 'moto',
                        vehicle_plate: b.vehicle_plate || '',
                        vehicle_model: b.vehicle_model || '',
                        vehicle_brand: b.vehicle_brand || '',
                        vehicle_year: b.vehicle_year || '',
                        vehicle_color: b.vehicle_color || '',
                        has_ac: Boolean(b.has_ac),
                        has_thermal_bag: Boolean(b.has_thermal_bag),
                        driver_payment_info: b.driver_payment_info || null,
                        driver_rating: b.driver_rating ? Number(b.driver_rating) : 5.0,
                        amount: Number(b.amount || 0),
                        eta_minutes: b.eta_minutes || 15,
                        status: b.status
                    });
                });
            }

            const activeList: ActiveTask[] = [];

            // Map transports
            (transports || []).forEach((t: any) => {
                let catName = 'Viaje Taxi';
                if (t.service_category === 'mototaxi') catName = 'Mototaxi';
                else if (t.service_category === 'taxi_driver') catName = 'Carro Taxi';
                else if (t.service_category === 'carro_confort') catName = 'Carro Confort';
                else if (t.service_category === 'delivery_envios') catName = 'Envío de Paquete';
                else if (t.service_category === 'muchacho_mandado') catName = "Muchacho e' Mandao";

                const bids = bidsMap[t.id] || [];

                // Audio / Haptic alert if new bids arrived
                const prevCount = prevBidsCountRef.current[t.id] || 0;
                if (bids.length > prevCount && prevCount > 0) {
                    vibrate(40);
                    toast(`¡Nueva oferta de $${bids[0].amount.toFixed(2)} recibida de ${bids[0].driver_name}!`, {
                        icon: '🔥',
                        duration: 3500
                    });
                }
                prevBidsCountRef.current[t.id] = bids.length;

                let subtitle = 'Buscando conductores para tu solicitud...';
                let badgeStatus = 'Buscando';
                let badgeColor = 'bg-amber-400 text-slate-950 font-black';

                if (t.service_category === 'muchacho_mandado' || t.type === 'muchacho_mandado') {
                    if (t.status === 'searching') {
                        if (bids.length > 0) {
                            subtitle = `🔥 ¡Ofertas recibidas: ${bids.length} ${bids.length === 1 ? 'piloto' : 'pilotos'}! Revisa las tarifas abajo y elige tu mejor opción:`;
                            badgeStatus = `${bids.length} ${bids.length === 1 ? 'Oferta' : 'Ofertas'}`;
                            badgeColor = 'bg-emerald-400 text-slate-950 font-black animate-pulse';
                        } else {
                            subtitle = 'Buscando conductores para tu solicitud...';
                            badgeStatus = 'Buscando';
                            badgeColor = 'bg-amber-400 text-slate-950 font-black';
                        }
                    } else if (t.status === 'accepted') {
                        subtitle = t.driver_name
                            ? `¡Piloto asignado! ${t.driver_name} va en camino a atender tu mandado`
                            : 'Piloto asignado va en camino';
                        badgeStatus = 'Piloto Asignado';
                        badgeColor = 'bg-sky-500 text-white font-black';
                    } else if (t.status === 'arriving') {
                        subtitle = '¡Tu piloto ya llegó al sitio de compra/recogida!';
                        badgeStatus = '¡Llegó al sitio!';
                        badgeColor = 'bg-emerald-500 text-white font-black animate-pulse';
                    } else if (t.status === 'in_progress') {
                        subtitle = 'Mandado en curso hacia el destino';
                        badgeStatus = 'En ruta';
                        badgeColor = 'bg-indigo-500 text-white font-black';
                    }
                } else if (t.service_category === 'delivery_envios' || t.type === 'package_delivery') {
                    if (t.status === 'searching') {
                        subtitle = 'Buscando conductores para tu solicitud...';
                        badgeStatus = 'Buscando';
                        badgeColor = 'bg-amber-400 text-slate-950 font-black';
                    } else if (t.status === 'accepted') {
                        subtitle = t.driver_name
                            ? `Repartidor asignado: ${t.driver_name} va en camino`
                            : 'Repartidor asignado va en camino';
                        badgeStatus = 'En camino';
                        badgeColor = 'bg-sky-500 text-white font-black';
                    } else if (t.status === 'arriving') {
                        subtitle = '¡Repartidor en el sitio de entrega!';
                        badgeStatus = 'En el sitio';
                        badgeColor = 'bg-emerald-500 text-white font-black animate-pulse';
                    } else if (t.status === 'in_progress') {
                        subtitle = 'Paquete en tránsito hacia el destino';
                        badgeStatus = 'En entrega';
                        badgeColor = 'bg-indigo-500 text-white font-black';
                    }
                } else {
                    // Taxi or Mototaxi
                    if (t.status === 'searching') {
                        if (t.assigned_driver_id) {
                            subtitle = 'Conectando con el conductor seleccionado...';
                            badgeStatus = 'Conectando';
                            badgeColor = 'bg-amber-400 text-slate-950 font-black';
                        } else {
                            subtitle = 'Buscando conductores para tu solicitud...';
                            badgeStatus = 'Buscando';
                            badgeColor = 'bg-amber-400 text-slate-950 font-black';
                        }
                    } else if (t.status === 'accepted') {
                        subtitle = t.driver_name
                            ? `¡Conductor aceptó tu viaje! ${t.driver_name} va en camino a buscarte`
                            : 'Conductor aceptó tu viaje y va en camino a buscarte';
                        badgeStatus = 'En camino';
                        badgeColor = 'bg-sky-500 text-white font-black';
                    } else if (t.status === 'arriving') {
                        subtitle = '¡Tu conductor ya llegó al punto de recogida!';
                        badgeStatus = '¡Llegó al sitio!';
                        badgeColor = 'bg-emerald-500 text-white font-black animate-pulse';
                    } else if (t.status === 'in_progress') {
                        subtitle = 'Viaje en curso rumbo a tu destino';
                        badgeStatus = 'En viaje';
                        badgeColor = 'bg-indigo-500 text-white font-black';
                    }
                }

                if (t.status === 'completed') {
                    if (t.payment_status === 'disputed') {
                        subtitle = '⚠️ Pago en disputa con conductor. Abre el viaje para solventarlo.';
                        badgeStatus = 'En Disputa';
                        badgeColor = 'bg-rose-600 text-white font-black animate-pulse';
                    } else if (t.payment_status === 'payment_reported') {
                        subtitle = '⏳ En espera de confirmación de pago por el chofer...';
                        badgeStatus = 'Validando';
                        badgeColor = 'bg-amber-400 text-slate-950 font-black';
                    } else {
                        subtitle = '💳 Viaje completado. Reporta tu comprobante al chofer.';
                        badgeStatus = 'Reportar Pago';
                        badgeColor = 'bg-[#FFB800] text-slate-950 font-black animate-bounce';
                    }
                }

                activeList.push({
                    id: t.id,
                    type: 'transport',
                    serviceCategory: t.service_category,
                    status: t.status,
                    title: catName,
                    subtitle,
                    badgeStatus,
                    badgeColor,
                    driverName: t.driver_name,
                    driverPhone: t.driver_phone,
                    price: parseFloat(t.price || t.total || 0),
                    destinationName: t.destination?.address || t.destination_address || 'Destino',
                    originName: t.origin?.address || t.origin_address || 'Punto de recogida',
                    mandadoDescription: t.mandado_details?.description || t.notes || '',
                    mandadoStoreName: t.mandado_details?.storeName || '',
                    createdAt: t.created_at,
                    url: `/taxi/track/${t.id}`,
                    bids,
                    assignedDriverId: t.assigned_driver_id
                });
            });

            // Map store orders
            (orders || []).forEach((o: any) => {
                let subtitle = 'Procesando tu pedido en tienda...';
                let badgeStatus = 'Procesando';
                let badgeColor = 'bg-amber-400 text-slate-950 font-black';

                const isPendingPayment = (o.payment_status === 'pending' || !o.payment_proof_url) && o.status === 'pending';
                const isPaymentReview = o.status === 'payment_review' || (o.payment_proof_url && o.payment_status !== 'paid' && o.status === 'pending');

                if (isPendingPayment) {
                    subtitle = 'Pago pendiente de validación • Envía tu comprobante para despachar';
                    badgeStatus = 'Pendiente Pago';
                    badgeColor = 'bg-rose-500 text-white font-black';
                } else if (isPaymentReview) {
                    subtitle = 'Comprobante en revisión por la tienda...';
                    badgeStatus = 'Revisando Pago';
                    badgeColor = 'bg-amber-400 text-slate-950 font-black';
                } else if (o.status === 'confirmed' || o.status === 'preparing') {
                    subtitle = 'La tienda está preparando tu pedido con esmero';
                    badgeStatus = 'Preparando';
                    badgeColor = 'bg-orange-500 text-white font-black';
                } else if (o.status === 'ready') {
                    subtitle = '¡Listo en el comercio! Esperando asignación de repartidor';
                    badgeStatus = 'Listo';
                    badgeColor = 'bg-emerald-500 text-white font-black';
                } else if (o.status === 'on_way') {
                    subtitle = 'Repartidor en camino a tu dirección de entrega';
                    badgeStatus = 'En ruta';
                    badgeColor = 'bg-sky-500 text-white font-black';
                } else if (o.status === 'arrived') {
                    subtitle = '¡El repartidor está afuera en tu puerta!';
                    badgeStatus = '¡Afuera!';
                    badgeColor = 'bg-emerald-500 text-white font-black animate-pulse';
                }

                activeList.push({
                    id: o.id,
                    type: 'order',
                    status: o.status,
                    title: o.restaurant_name || o.restaurantName || 'Pedido en Tienda',
                    subtitle,
                    badgeStatus,
                    badgeColor,
                    price: parseFloat(o.total || 0),
                    destinationName: o.delivery_address?.address || o.deliveryAddress?.address || 'Entrega a domicilio',
                    createdAt: o.created_at,
                    url: `/track/${o.id}`
                });
            });

            setTasks(activeList);
        } catch (err) {
            console.error('Error fetching active tasks for widget:', err);
        } finally {
            setLoading(false);
        }
    }, [authUUID, validLocalTransportUUID, validLocalOrderUUID]);

    useEffect(() => {
        fetchActiveTasks();

        // Realtime channels for transports, orders and mandado bids
        const trChannel = supabase
            .channel(`widget_tr_all`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_requests' },
                () => {
                    fetchActiveTasks();
                }
            )
            .subscribe();

        const ordChannel = supabase
            .channel(`widget_ord_all`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    fetchActiveTasks();
                }
            )
            .subscribe();

        const bidsChannel = supabase
            .channel(`widget_bids_all`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_bids' },
                () => {
                    fetchActiveTasks();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(trChannel);
            supabase.removeChannel(ordChannel);
            supabase.removeChannel(bidsChannel);
        };
    }, [fetchActiveTasks]);

    // Handle Accepting a Mandado Bid directly from the Home Widget
    const handleAcceptBid = async (taskId: string, bid: BidItem) => {
        setAcceptingBidId(bid.id);
        try {
            vibrate(30);
            // 1. Accept this bid
            const { error: err1 } = await supabase
                .from('transport_bids')
                .update({ status: 'accepted' })
                .eq('id', bid.id);
            if (err1) throw err1;

            // 2. Reject all other bids for this request
            await supabase
                .from('transport_bids')
                .update({ status: 'rejected' })
                .eq('transport_request_id', taskId)
                .neq('id', bid.id);

            // 3. Assign driver to the request
            const { error: err3 } = await supabase
                .from('transport_requests')
                .update({
                    status: 'accepted',
                    driver_id: bid.driver_id,
                    driver_name: bid.driver_name,
                    driver_phone: bid.driver_phone,
                    driver_photo: bid.driver_photo,
                    driver_payment_info: bid.driver_payment_info || null,
                    driver_vehicle_details: {
                        type: bid.vehicle_type,
                        plate: bid.vehicle_plate,
                        model: bid.vehicle_model,
                        brand: bid.vehicle_brand,
                        year: bid.vehicle_year,
                        color: bid.vehicle_color,
                        has_ac: bid.has_ac,
                        has_thermal_bag: bid.has_thermal_bag
                    },
                    driver_assigned_at: new Date().toISOString(),
                    price: Number(bid.amount),
                    total: Number(bid.amount),
                    commission_amount: 0.70
                })
                .eq('id', taskId);

            if (err3) throw err3;

            toast.success(`¡Oferta de ${bid.driver_name} aceptada!`, { icon: '🤝' });
            navigate(`/taxi/track/${taskId}`);
        } catch (err: any) {
            console.error('Error accepting bid from widget:', err);
            toast.error('No se pudo aceptar la oferta. Intenta nuevamente.');
        } finally {
            setAcceptingBidId(null);
        }
    };

    // Handle Re-triggering / Retrying Search (3-5 min expiration)
    const handleRetrySearch = async (taskId: string) => {
        setRetryingTaskId(taskId);
        try {
            vibrate(35);
            const { error } = await supabase
                .from('transport_requests')
                .update({
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    status: 'searching'
                })
                .eq('id', taskId);

            if (error) throw error;
            toast.success('¡Búsqueda reactivada! Escaneando conductores disponibles...', { icon: '🔄', duration: 4000 });
            setNow(Date.now());
            fetchActiveTasks();
        } catch (err) {
            console.error('Error retrying search:', err);
            toast.error('No se pudo reactivar la búsqueda. Intenta de nuevo.');
        } finally {
            setRetryingTaskId(null);
        }
    };

    // Handle Synchronized Cancellation (Instantly vanishes from client and all drivers)
    const handleConfirmCancel = async () => {
        if (!taskToCancel) return;
        setIsCancelling(true);
        try {
            vibrate(40);
            if (taskToCancel.type === 'transport') {
                // Cancel transport request in Supabase
                const { error: cancelErr } = await supabase
                    .from('transport_requests')
                    .update({ 
                        status: 'cancelled',
                        canceled_at: new Date().toISOString(),
                        canceled_by: 'client'
                    })
                    .eq('id', taskToCancel.id);

                if (cancelErr) throw cancelErr;

                // Delete bids to clean driver notifications
                await supabase
                    .from('transport_bids')
                    .delete()
                    .eq('transport_request_id', taskToCancel.id);

                localStorage.removeItem('active_transport_req_id');
            } else {
                // Cancel store order in Supabase
                const { error: cancelErr } = await supabase
                    .from('orders')
                    .update({ status: 'cancelled' })
                    .eq('id', taskToCancel.id);

                if (cancelErr) throw cancelErr;
                localStorage.removeItem('active_order_id');
            }

            // Immediately clear locally so Home card vanishes without waiting
            setTasks(prev => prev.filter(t => t.id !== taskToCancel.id));
            toast.success('Solicitud cancelada exitosamente', { icon: '🚫' });
            setTaskToCancel(null);
        } catch (err: any) {
            console.error('Error cancelling task:', err);
            toast.error('No se pudo cancelar la solicitud. Revisa tu conexión.');
        } finally {
            setIsCancelling(false);
        }
    };

    if (loading || tasks.length === 0) {
        return null;
    }

    return (
        <section className="px-5 mt-3 mb-3 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-3">
                {tasks.map((task) => {
                    const isArriving = task.status === 'arriving' || task.status === 'arrived';
                    const isInProgress = task.status === 'in_progress' || task.status === 'on_way';
                    const isSearching = task.status === 'searching';
                    const isMandado = task.serviceCategory === 'muchacho_mandado' || task.serviceCategory === 'mandado';
                    const bidsCount = (task.bids || []).length;
                    const hasBids = bidsCount > 0;

                    // Auto-expiration check: 3 minutes without driver/bid
                    const createdMs = task.createdAt ? new Date(task.createdAt).getTime() : now;
                    const elapsedMs = now - createdMs;
                    const isExpired = isSearching && !hasBids && elapsedMs >= 3 * 60 * 1000;

                    // Check if cancellable
                    const isCancellable =
                        (task.type === 'transport' && ['searching', 'accepted', 'arriving'].includes(task.status)) ||
                        (task.type === 'order' && ['pending', 'payment_review'].includes(task.status));

                    return (
                        <div
                            key={task.id}
                            className={`rounded-3xl border transition-all relative overflow-hidden shadow-lg hover:shadow-xl ${
                                isArriving
                                    ? 'bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-800 text-white border-emerald-400 ring-2 ring-emerald-400/50'
                                    : isInProgress
                                    ? 'bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white border-slate-800'
                                    : isMandado && hasBids
                                    ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-400/60'
                                    : isExpired
                                    ? 'bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 text-slate-950 border-rose-300 ring-2 ring-rose-400/50'
                                    : 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 text-slate-950 border-amber-300'
                            }`}
                        >
                            {/* Card Main Body */}
                            <div
                                onClick={() => {
                                    vibrate(25);
                                    navigate(task.url);
                                }}
                                className="p-4 cursor-pointer active:opacity-95 transition-opacity"
                            >
                                {/* Top row: Category, Badge and Price */}
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div
                                            className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                                                isArriving || isInProgress
                                                    ? 'bg-white/20 text-white'
                                                    : 'bg-slate-950/15 text-slate-950'
                                            }`}
                                        >
                                            {task.serviceCategory === 'mototaxi' ? (
                                                <Bike className="w-5 h-5" />
                                            ) : task.serviceCategory === 'delivery_envios' ? (
                                                <Package className="w-5 h-5" />
                                            ) : isMandado ? (
                                                <ShoppingBag className="w-5 h-5" />
                                            ) : task.type === 'transport' ? (
                                                <Car className="w-5 h-5" />
                                            ) : (
                                                <Store className="w-5 h-5" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-black uppercase tracking-wider truncate">
                                                    {task.title}
                                                </span>
                                                {isSearching && !isExpired && (
                                                    <span className="flex h-2 w-2 relative">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-950 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-950"></span>
                                                    </span>
                                                )}
                                            </div>
                                            {task.mandadoStoreName && (
                                                <p className="text-[10px] font-bold opacity-80 truncate">
                                                    🏪 {task.mandadoStoreName}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span
                                            className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm ${
                                                isExpired ? 'bg-rose-500 text-white font-black' : task.badgeColor
                                            }`}
                                        >
                                            {isExpired ? 'Sin Conductor' : task.badgeStatus}
                                        </span>
                                        {task.price !== undefined && task.price > 0 && (
                                            <div
                                                className={`text-right px-2 py-0.5 rounded-xl ${
                                                    isArriving || isInProgress
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-black/10 text-slate-950'
                                                }`}
                                            >
                                                <div className="text-xs font-black leading-tight">
                                                    ${task.price.toFixed(2)}
                                                </div>
                                                {bcvRate > 0 && (
                                                    <div className="text-[9px] font-bold opacity-75 leading-none">
                                                        {(task.price * bcvRate).toFixed(0)} Bs
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Subtitle / Realtime Description */}
                                <p
                                    className={`text-xs font-bold leading-snug mb-2 ${
                                        isArriving || isInProgress ? 'text-slate-100' : isExpired ? 'text-rose-900 font-black' : 'text-slate-900'
                                    }`}
                                >
                                    {isExpired ? '⚠️ No encontramos conductores disponibles en este momento.' : task.subtitle}
                                </p>

                                {/* Pastilla con ofertas recibidas para Muchacho e' Mandao */}
                                {isMandado && isSearching && hasBids && (
                                    <div className="mb-2.5 inline-flex items-center gap-2 bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-full text-xs font-black shadow-sm">
                                        <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping"></span>
                                        <span>Ofertas recibidas: {bidsCount} piloto{bidsCount === 1 ? '' : 's'}</span>
                                    </div>
                                )}

                                {/* Mandado Description preview if available */}
                                {task.mandadoDescription && isSearching && (
                                    <div
                                        className={`mb-2 p-2 rounded-xl text-[11px] font-medium line-clamp-2 ${
                                            isArriving || isInProgress
                                                ? 'bg-white/10 text-slate-200'
                                                : 'bg-black/5 text-slate-900'
                                        }`}
                                    >
                                        📝 "{task.mandadoDescription}"
                                    </div>
                                )}

                                {/* Auto-expiration warning and quick action banner */}
                                {isExpired && (
                                    <div className="mt-2 mb-2 p-3 bg-white/90 border border-rose-300 rounded-2xl shadow-sm space-y-2">
                                        <div className="flex items-center gap-2 text-rose-700 font-black text-xs">
                                            <AlertCircle className="w-4 h-4 shrink-0" />
                                            <span>¿Deseas intentar nuevamente o cancelar?</span>
                                        </div>
                                        <p className="text-[11px] text-slate-600 leading-tight">
                                            No se han postulado conductores aún. Puedes reintentar la búsqueda para volver a alertar a los conductores o cancelar la solicitud.
                                        </p>
                                        <div className="flex items-center gap-2 pt-1">
                                            <button
                                                type="button"
                                                disabled={retryingTaskId === task.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRetrySearch(task.id);
                                                }}
                                                className="flex-1 py-2 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] uppercase tracking-wider rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                            >
                                                <RefreshCw className={`w-3.5 h-3.5 ${retryingTaskId === task.id ? 'animate-spin' : ''}`} />
                                                <span>Reintentar búsqueda</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setTaskToCancel(task);
                                                }}
                                                className="py-2 px-3 bg-rose-100 hover:bg-rose-200 text-rose-800 font-black text-[11px] uppercase tracking-wider rounded-xl active:scale-95 transition-all"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Destination row */}
                                <div
                                    className={`pt-2 border-t flex items-center justify-between text-[11px] font-bold ${
                                        isArriving || isInProgress
                                            ? 'border-white/15 text-slate-200'
                                            : 'border-black/10 text-slate-800'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                                        <MapPin className="w-3.5 h-3.5 shrink-0 opacity-75" />
                                        <span className="truncate">{task.destinationName}</span>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0 font-black uppercase text-[10px] tracking-wider group-hover:translate-x-0.5 transition-transform">
                                        <span>Ver mapa en vivo</span>
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                            </div>

                            {/* MUCHACHO E' MANDAO: Live Driver Bids Tray */}
                            {isMandado && isSearching && hasBids && (
                                <div className="bg-slate-950 text-white p-3.5 border-t border-amber-400/40">
                                    <div className="flex items-center justify-between mb-2.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                                                Ofertas recibidas ({bidsCount})
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-bold">
                                            Toca "Aceptar" para elegir piloto
                                        </span>
                                    </div>

                                    <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                                        {task.bids?.map((bid) => {
                                            const isAccepting = acceptingBidId === bid.id;
                                            return (
                                                <div
                                                    key={bid.id}
                                                    className="bg-slate-900 border border-slate-800 hover:border-amber-400/60 rounded-2xl p-2.5 flex items-center justify-between gap-2.5 transition-all shadow-sm"
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="relative shrink-0">
                                                            <img
                                                                src={
                                                                    bid.driver_photo ||
                                                                    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'
                                                                }
                                                                alt={bid.driver_name}
                                                                className="w-10 h-10 rounded-xl object-cover border border-slate-700 bg-slate-800"
                                                                onError={(e: any) => {
                                                                    e.currentTarget.src =
                                                                        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80';
                                                                }}
                                                            />
                                                            <div className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 text-[8px] font-black px-1 rounded-md">
                                                                ★ {bid.driver_rating?.toFixed(1) || '5.0'}
                                                            </div>
                                                        </div>

                                                        <div className="min-w-0">
                                                            <p className="text-xs font-black text-white truncate">
                                                                {bid.driver_name}
                                                            </p>
                                                            <div className="text-[10px] text-slate-300 font-bold flex items-center flex-wrap gap-1 mt-0.5">
                                                                <span className="capitalize text-amber-400">
                                                                    {bid.vehicle_brand || bid.vehicle_type || 'Vehículo'} {bid.vehicle_model || ''}
                                                                </span>
                                                                {bid.vehicle_year && <span className="text-slate-400 text-[9px]">({bid.vehicle_year})</span>}
                                                                {bid.vehicle_color && <span className="text-slate-400 text-[9px]">{bid.vehicle_color}</span>}
                                                                {bid.vehicle_plate && (
                                                                    <span className="bg-slate-800 px-1 py-0.2 rounded text-[9px] font-mono text-amber-300 border border-slate-700">
                                                                        {bid.vehicle_plate}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                {bid.has_ac && (
                                                                    <span className="bg-cyan-500/20 text-cyan-300 text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-cyan-500/30">
                                                                        ❄️ A/A
                                                                    </span>
                                                                )}
                                                                {bid.has_thermal_bag && (
                                                                    <span className="bg-emerald-500/20 text-emerald-300 text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-emerald-500/30">
                                                                        🎒 Bolso Térmico
                                                                    </span>
                                                                )}
                                                                <span className="text-[9px] font-black text-emerald-400">
                                                                    Llega en ~{bid.eta_minutes || 15} min
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <div className="text-right">
                                                            <div className="text-sm font-black text-amber-400 leading-none">
                                                                ${bid.amount.toFixed(2)}
                                                            </div>
                                                            {bcvRate > 0 && (
                                                                <div className="text-[9px] font-bold text-slate-400">
                                                                    {(bid.amount * bcvRate).toFixed(0)} Bs
                                                                </div>
                                                            )}
                                                        </div>

                                                        <button
                                                            type="button"
                                                            disabled={isAccepting}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleAcceptBid(task.id, bid);
                                                            }}
                                                            className="px-3 py-2 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-[11px] uppercase tracking-wider rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-50"
                                                        >
                                                            {isAccepting ? 'Aceptando...' : 'Aceptar'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Bottom Action Bar: Prominent Cancel Button (Synchronized) */}
                            {isCancellable && (
                                <div
                                    className={`px-4 py-2.5 flex items-center justify-between border-t text-[11px] ${
                                        isArriving || isInProgress
                                            ? 'bg-slate-950/30 border-white/10 text-slate-300'
                                            : 'bg-black/5 border-black/10 text-slate-800'
                                    }`}
                                >
                                    <span className="text-[10px] font-medium opacity-80">
                                        ¿No deseas continuar?
                                    </span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setTaskToCancel(task);
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 font-black text-[11px] uppercase tracking-wider border border-rose-400/40 active:scale-95 transition-all shadow-sm"
                                    >
                                        <XCircle className="w-3.5 h-3.5" />
                                        <span>Cancelar solicitud</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Synchronized Cancellation Confirmation Modal */}
            {taskToCancel && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 border border-slate-200">
                        <div className="flex items-center gap-2.5 text-rose-600">
                            <AlertTriangle className="w-6 h-6 shrink-0" />
                            <h3 className="text-base font-black text-slate-900">
                                ¿Cancelar {taskToCancel.title}?
                            </h3>
                        </div>

                        {taskToCancel.bids && taskToCancel.bids.length > 0 ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-1 text-xs text-amber-950">
                                <p className="font-black text-amber-800">⚠️ Se perderán las ofertas recibidas</p>
                                <p className="text-[11px] text-amber-900 leading-snug">
                                    Ya tienes {taskToCancel.bids.length} oferta(s) de pilotos postulados. Si cancelas la solicitud, se borrará inmediatamente de todas las pantallas y se descartarán las ofertas.
                                </p>
                            </div>
                        ) : taskToCancel.status === 'arriving' ? (
                            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 space-y-1 text-xs text-rose-900">
                                <p className="font-black text-rose-700">⚠️ Conductor ya en el sitio</p>
                                <p className="text-[11px] text-rose-800 leading-snug">
                                    El conductor ya ha llegado al punto de recogida. Si confirmas la cancelación, se aplicará una penalidad del 50% (${(taskToCancel.price ? taskToCancel.price * 0.5 : 0.5).toFixed(2)}) para compensar el traslado.
                                </p>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-600 font-medium leading-relaxed">
                                Esta acción cancelará tu solicitud de inmediato en el sistema, la eliminará de la base de datos y la borrará de las pantallas de todos los conductores.
                            </p>
                        )}

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                disabled={isCancelling}
                                onClick={() => setTaskToCancel(null)}
                                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all disabled:opacity-50"
                            >
                                No, volver
                            </button>
                            <button
                                type="button"
                                disabled={isCancelling}
                                onClick={handleConfirmCancel}
                                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                {isCancelling ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <XCircle className="w-4 h-4" />
                                        <span>Sí, cancelar</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
