import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Bike, Package, ShoppingBag, Utensils, ArrowRight, MapPin, Phone, MessageCircle, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { vibrate } from '../utils/haptics';

interface ActiveTask {
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
    price?: number;
    destinationName?: string;
    createdAt?: string;
    url: string;
}

export default function ActiveTasksWidget() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<ActiveTask[]>([]);
    const [loading, setLoading] = useState(true);

    const userId = user?.id || user?.uid || (userData as any)?.id || (userData as any)?.uid;

    useEffect(() => {
        if (!userId) {
            setTasks([]);
            setLoading(false);
            return;
        }

        const fetchActiveTasks = async () => {
            try {
                // 1. Fetch active transports (rides, deliveries, mandados)
                const { data: transports } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .or(`user_id.eq.${userId},userId.eq.${userId}`)
                    .in('status', ['searching', 'accepted', 'arriving', 'in_progress'])
                    .order('created_at', { ascending: false })
                    .limit(3);

                // 2. Fetch active food/store delivery orders
                const { data: orders } = await supabase
                    .from('orders')
                    .select('*')
                    .or(`user_id.eq.${userId},userId.eq.${userId}`)
                    .in('status', ['pending', 'payment_review', 'confirmed', 'preparing', 'ready', 'on_way', 'arrived'])
                    .order('created_at', { ascending: false })
                    .limit(3);

                const activeList: ActiveTask[] = [];

                (transports || []).forEach((t: any) => {
                    let catName = 'Viaje Taxi';
                    if (t.service_category === 'mototaxi') catName = 'Mototaxi';
                    else if (t.service_category === 'taxi_driver') catName = 'Carro Taxi';
                    else if (t.service_category === 'carro_confort') catName = 'Carro Confort';
                    else if (t.service_category === 'delivery_envios') catName = 'Envío de Paquete';
                    else if (t.service_category === 'muchacho_mandado') catName = "Muchacho e' Mandado";

                    let subtitle = 'Buscando conductor cercano...';
                    let badgeStatus = 'Buscando';
                    let badgeColor = 'bg-amber-500 text-slate-950';

                    if (t.status === 'accepted') {
                        subtitle = t.driver_name
                            ? `${t.driver_name} va en camino a buscarte`
                            : 'Conductor asignado en camino a buscarte';
                        badgeStatus = 'En camino';
                        badgeColor = 'bg-sky-500 text-white';
                    } else if (t.status === 'arriving') {
                        subtitle = '¡Tu conductor ya llegó al punto de recogida!';
                        badgeStatus = '¡Llegó al sitio!';
                        badgeColor = 'bg-emerald-500 text-white animate-pulse';
                    } else if (t.status === 'in_progress') {
                        subtitle = 'Viaje en curso rumbo a tu destino';
                        badgeStatus = 'En viaje';
                        badgeColor = 'bg-indigo-500 text-white';
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
                        createdAt: t.created_at,
                        url: `/taxi/track/${t.id}`
                    });
                });

                (orders || []).forEach((o: any) => {
                    let subtitle = 'Procesando tu pedido...';
                    let badgeStatus = 'Procesando';
                    let badgeColor = 'bg-amber-500 text-slate-950';

                    const isPendingPayment = (o.payment_status === 'pending' || !o.payment_proof_url) && o.status === 'pending';
                    const isPaymentReview = o.status === 'payment_review' || (o.payment_proof_url && o.payment_status !== 'paid' && o.status === 'pending');

                    if (isPendingPayment) {
                        subtitle = 'Pendiente por pagar • Envía el comprobante para despachar';
                        badgeStatus = 'Pendiente Pago';
                        badgeColor = 'bg-rose-500 text-white';
                    } else if (isPaymentReview) {
                        subtitle = 'Comprobante en revisión por la tienda...';
                        badgeStatus = 'Revisando Pago';
                        badgeColor = 'bg-amber-400 text-slate-950';
                    } else if (o.status === 'confirmed' || o.status === 'preparing') {
                        subtitle = 'El comercio está preparando tu pedido con esmero';
                        badgeStatus = 'Preparando';
                        badgeColor = 'bg-orange-500 text-white';
                    } else if (o.status === 'ready') {
                        subtitle = '¡Listo! Esperando asignación de repartidor';
                        badgeStatus = 'Listo';
                        badgeColor = 'bg-emerald-500 text-white';
                    } else if (o.status === 'on_way') {
                        subtitle = 'Repartidor en camino a tu dirección';
                        badgeStatus = 'Repartidor en ruta';
                        badgeColor = 'bg-sky-500 text-white';
                    } else if (o.status === 'arrived') {
                        subtitle = '¡El repartidor está afuera en tu puerta!';
                        badgeStatus = '¡Afuera!';
                        badgeColor = 'bg-emerald-500 text-white animate-pulse';
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
        };

        fetchActiveTasks();

        // Realtime channels for transports & orders
        const trChannel = supabase
            .channel(`widget_transports_${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_requests' },
                () => {
                    fetchActiveTasks();
                }
            )
            .subscribe();

        const ordChannel = supabase
            .channel(`widget_orders_${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    fetchActiveTasks();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(trChannel);
            supabase.removeChannel(ordChannel);
        };
    }, [userId]);

    if (loading || tasks.length === 0) {
        return null;
    }

    return (
        <section className="px-5 mt-4 mb-2 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-3">
                {tasks.map((task) => {
                    const isArriving = task.status === 'arriving' || task.status === 'arrived';
                    const isInProgress = task.status === 'in_progress' || task.status === 'on_way';

                    return (
                        <div
                            key={task.id}
                            onClick={() => {
                                vibrate(25);
                                navigate(task.url);
                            }}
                            className={`p-4 rounded-3xl border transition-all cursor-pointer shadow-lg hover:shadow-xl active:scale-[0.99] relative overflow-hidden group ${
                                isArriving
                                    ? 'bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-800 text-white border-emerald-400 ring-2 ring-emerald-400/50'
                                    : isInProgress
                                    ? 'bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white border-slate-800'
                                    : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-primary text-slate-950 border-amber-300'
                            }`}
                        >
                            {/* Top row: Category, Badge and Price */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                        isArriving || isInProgress ? 'bg-white/15 text-white' : 'bg-slate-950/10 text-slate-950'
                                    }`}>
                                        {task.serviceCategory === 'mototaxi' ? (
                                            <Bike className="w-4 h-4" />
                                        ) : task.serviceCategory === 'delivery_envios' ? (
                                            <Package className="w-4 h-4" />
                                        ) : task.serviceCategory === 'muchacho_mandado' ? (
                                            <ShoppingBag className="w-4 h-4" />
                                        ) : task.type === 'transport' ? (
                                            <Car className="w-4 h-4" />
                                        ) : (
                                            <Utensils className="w-4 h-4" />
                                        )}
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-wider truncate">
                                        {task.title}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm ${task.badgeColor}`}>
                                        {task.badgeStatus}
                                    </span>
                                    {task.price !== undefined && task.price > 0 && (
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${
                                            isArriving || isInProgress ? 'bg-white/15 text-white' : 'bg-black/10 text-slate-950'
                                        }`}>
                                            ${task.price.toFixed(2)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Subtitle / Status Explanation */}
                            <p className={`text-xs font-bold leading-snug mb-3 ${
                                isArriving || isInProgress ? 'text-slate-200' : 'text-slate-900'
                            }`}>
                                {task.subtitle}
                            </p>

                            {/* Bottom action bar with direct communication indicator */}
                            <div className={`pt-2.5 border-t flex items-center justify-between text-[11px] font-bold ${
                                isArriving || isInProgress ? 'border-white/15 text-emerald-300' : 'border-black/10 text-slate-900'
                            }`}>
                                <div className="flex items-center gap-1.5 truncate max-w-[210px]">
                                    <MapPin className="w-3.5 h-3.5 shrink-0 opacity-75" />
                                    <span className="truncate">{task.destinationName}</span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 font-extrabold uppercase text-[10px] tracking-wider group-hover:translate-x-0.5 transition-transform">
                                    {task.type === 'transport' && (
                                        <div className="flex items-center gap-1 mr-1">
                                            <Phone className="w-3 h-3" />
                                            <MessageCircle className="w-3 h-3" />
                                        </div>
                                    )}
                                    <span>Ver en vivo</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
