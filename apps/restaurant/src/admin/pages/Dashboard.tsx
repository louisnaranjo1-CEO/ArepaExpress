import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, ShoppingBag, DollarSign, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

export default function Dashboard() {
    const { user, userData } = useAuth();
    const [stats, setStats] = useState({
        totalSales: 0,
        ordersToday: 0,
        activeProducts: 0,
        growth: 12
    });
    const [recentOrders, setRecentOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        const rid = userData?.managedRestaurantId || user?.uid;
        if (!rid) return;

        const loadDashboardData = async () => {
            try {
                // 1. Orders
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('restaurant_id', rid);

                let sales = 0;
                let todayCount = 0;
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                (ordersData || []).forEach((order: any) => {
                    if (order.status === 'delivered') {
                        sales += Number(order.total) || 0;
                    }
                    const createdAt = order.created_at ? new Date(order.created_at) : null;
                    if (createdAt && createdAt >= startOfToday) {
                        todayCount++;
                    }
                });

                // 2. Active products
                const { count: prodCount } = await supabase
                    .from('products')
                    .select('*', { count: 'exact', head: true })
                    .eq('restaurant_id', rid)
                    .eq('is_active', true);

                setStats(prev => ({
                    ...prev,
                    totalSales: sales,
                    ordersToday: todayCount,
                    activeProducts: prodCount || 0
                }));

                // 3. Recent orders
                const { data: recent } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('restaurant_id', rid)
                    .order('created_at', { ascending: false })
                    .limit(5);

                setRecentOrders(recent || []);
            } catch (err) {
                console.error("Error loading dashboard data:", err);
            } finally {
                setLoading(false);
            }
        };

        loadDashboardData();

        const channel = supabase
            .channel(`dashboard_${rid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, () => {
                loadDashboardData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, userData]);

    const cards = [
        { title: 'Ventas Totales', value: `$${stats.totalSales.toFixed(2)}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
        { title: 'Pedidos Hoy', value: stats.ordersToday.toString(), icon: ShoppingBag, color: 'text-blue-600', bg: 'bg-blue-50' },
        { title: 'Productos Activos', value: stats.activeProducts.toString(), icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
        { title: 'Crecimiento', value: `+${stats.growth}%`, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
    ];

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Analizando rendimiento...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div>
                <h1 className="text-3xl font-black text-slate-900">¡Hola, {user?.displayName || 'Propietario'}! 👋</h1>
                <p className="text-slate-500 font-medium">Aquí tienes el resumen de tu negocio para hoy.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {cards.map((card, i) => (
                    <div key={i} className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
                        <div className={`w-14 h-14 ${card.bg} ${card.color} rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3`}>
                            <card.icon className="w-7 h-7" />
                        </div>
                        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest mb-1">{card.title}</p>
                        <h3 className="text-3xl font-black text-slate-900">{card.value}</h3>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Orders */}
                <div className="lg:col-span-2 bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <Clock className="w-6 h-6 text-slate-900" />
                            Pedidos Recientes
                        </h2>
                        <Link to="/orders" className="text-slate-900 font-bold text-sm flex items-center gap-1 hover:underline">
                            Ver todos <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>

                    <div className="space-y-4">
                        {recentOrders.length === 0 ? (
                            <div className="p-12 text-center grayscale opacity-50">
                                <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                                <p className="text-slate-400 font-bold">No hay pedidos registrados aún</p>
                            </div>
                        ) : (
                            recentOrders.map((order) => (
                                <div key={order.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-200 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                            <ShoppingBag className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-700">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{order.status}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-slate-900">${(Number(order.total) || 0).toFixed(2)}</p>
                                        <p className="text-[10px] font-bold text-slate-400">
                                            {order.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Popular Products Placeholder */}
                <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm">
                    <h2 className="text-xl font-black text-slate-900 mb-8 items-center gap-2 flex">
                        <TrendingUp className="w-6 h-6 text-slate-900" />
                        Populares
                    </h2>
                    <div className="space-y-6">
                        <div className="p-12 text-center grayscale opacity-50">
                            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                            <p className="text-slate-400 font-bold">Datos de popularidad próximamente</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
