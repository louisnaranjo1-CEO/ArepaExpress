import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Bike, Package, ShoppingBag, Utensils, ArrowRight, MapPin } from 'lucide-react';
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
                    .limit(5);

                // 2. Fetch active food/store delivery orders
                const { data: orders } = await supabase
                    .from('orders')
                    .select('*')
                    .or(`user_id.eq.${userId},userId.eq.${userId}`)
                    .in('status', ['pending', 'confirmed', 'preparing', 'ready', 'on_way', 'arrived'])
                    .order('created_at', { ascending: false })
                    .limit(5);

                const activeList: ActiveTask[] = [];

                (transports || []).forEach((t: any) => {
                    let catName = 'Viaje Taxi';
                    if (t.service_category === 'mototaxi') catName = 'Mototaxi';
                    else if (t.service_category === 'taxi_driver') catName = 'Taxi Driver';
                    else if (t.service_category === 'carro_confort') catName = 'Carro Confort';
                    else if (t.service_category === 'delivery_envios') catName = 'Envío de Paquete';
                    else if (t.service_category === 'muchacho_mandado') catName = "Muchacho e' Mandado";

                    let statusText = 'Buscando conductor...';
                    if (t.status === 'accepted') statusText = 'Conductor asignado en camino';
                    else if (t.status === 'arriving') statusText = '¡Conductor afuera en el sitio!';
                    else if (t.status === 'in_progress') statusText = 'Viaje en curso a tu destino';

                    activeList.push({
                        id: t.id,
                        type: 'transport',
                        serviceCategory: t.service_category,
                        status: t.status,
                        title: catName,
                        subtitle: statusText,
                        price: parseFloat(t.price || t.total || 0),
                        destinationName: t.destination?.address || 'Destino',
                        createdAt: t.created_at,
                        url: `/taxi-tracker/${t.id}`
                    });
                });

                (orders || []).forEach((o: any) => {
                    let statusText = 'Procesando pedido...';
                    if (o.status === 'confirmed') statusText = 'Pedido confirmado por el comercio';
                    else if (o.status === 'preparing') statusText = 'Preparando tus productos...';
                    else if (o.status === 'ready') statusText = 'Listo, esperando repartidor';
                    else if (o.status === 'on_way') statusText = 'Repartidor en camino a tu dirección';
                    else if (o.status === 'arrived') statusText = '¡Repartidor afuera en tu puerta!';

                    activeList.push({
                        id: o.id,
                        type: 'order',
                        status: o.status,
                        title: o.restaurant_name || o.restaurantName || 'Pedido en Comercio',
                        subtitle: statusText,
                        price: parseFloat(o.total || 0),
                        destinationName: o.delivery_address?.address || o.deliveryAddress?.address || 'Entrega a domicilio',
                        createdAt: o.created_at,
                        url: `/order-tracking/${o.id}`
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
        <section className="px-5 mt-3 mb-1 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-2">
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
                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-[0.99] flex items-center justify-between gap-3 ${
                                isArriving
                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-emerald-400 ring-2 ring-emerald-300 animate-pulse'
                                    : isInProgress
                                    ? 'bg-slate-900 text-white border-slate-800'
                                    : 'bg-gradient-to-r from-amber-500 to-primary text-slate-950 border-amber-300'
                            }`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                                    isArriving || isInProgress ? 'bg-white/20 text-white' : 'bg-white text-slate-900'
                                }`}>
                                    {task.serviceCategory === 'mototaxi' ? (
                                        <Bike className="w-5 h-5" />
                                    ) : task.serviceCategory === 'delivery_envios' ? (
                                        <Package className="w-5 h-5" />
                                    ) : task.serviceCategory === 'muchacho_mandado' ? (
                                        <ShoppingBag className="w-5 h-5" />
                                    ) : task.type === 'order' ? (
                                        <Utensils className="w-5 h-5" />
                                    ) : (
                                        <Car className="w-5 h-5" />
                                    )}
                                </div>

                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black tracking-tight truncate">
                                            {task.title}
                                        </span>
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                                            isArriving ? 'bg-white animate-ping' : isInProgress ? 'bg-emerald-400 animate-pulse' : 'bg-slate-950 animate-pulse'
                                        }`} />
                                    </div>
                                    <p className={`text-[11px] font-bold truncate leading-tight mt-0.5 ${
                                        isArriving || isInProgress ? 'text-white/90' : 'text-slate-900'
                                    }`}>
                                        {task.subtitle}
                                    </p>
                                    <p className={`text-[9px] font-medium truncate flex items-center gap-1 mt-0.5 ${
                                        isArriving || isInProgress ? 'text-white/70' : 'text-slate-800/80'
                                    }`}>
                                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                                        <span>{task.destinationName}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {task.price !== undefined && task.price > 0 && (
                                    <span className="text-xs font-black">
                                        ${task.price.toFixed(2)}
                                    </span>
                                )}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    isArriving || isInProgress ? 'bg-white/20 text-white' : 'bg-slate-950 text-white'
                                }`}>
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
