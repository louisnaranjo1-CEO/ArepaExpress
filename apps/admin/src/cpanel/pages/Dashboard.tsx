import React, { useState, useEffect } from 'react';
import { Users, Store, TrendingUp, ShoppingBag, ArrowUpRight, Award, BarChart3, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DualPrice from '../../components/DualPrice';

interface TopRestaurant {
    id: string;
    name: string;
    sales: number;
    orderCount: number;
    logo?: string;
}

export default function Dashboard() {
    const [stats, setStats] = useState({
        users: 0,
        restaurants: 0,
        orders: 0,
        revenue: 0,
        newUsersToday: 0
    });
    const [topRestaurants, setTopRestaurants] = useState<TopRestaurant[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                // Fetch users
                const { data: usersData } = await supabase.from('profiles').select('id, created_at');
                const usersCount = (usersData || []).length;

                // Simple "New Today"
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                let newToday = 0;
                (usersData || []).forEach((u: any) => {
                    if (u.created_at && new Date(u.created_at) >= today) {
                        newToday++;
                    }
                });

                // Fetch restaurants
                const { data: restaurantsData } = await supabase.from('comercios').select('id, name, logo_url, image_url');
                const restaurantsCount = (restaurantsData || []).length;
                const restaurantMap: Record<string, { name: string, logo: string }> = {};
                (restaurantsData || []).forEach((r: any) => {
                    restaurantMap[r.id] = {
                        name: r.name,
                        logo: r.logo_url || r.image_url
                    };
                });

                // Fetch orders & transport
                const { data: ordersData } = await supabase.from('orders').select('id, total, status, restaurant_id');
                const { data: transportData } = await supabase.from('transport_requests').select('id, total, price, status');

                let totalRevenue = 0;
                const revenueByRestaurant: Record<string, { sales: number, count: number }> = {};

                (ordersData || []).forEach((data: any) => {
                    if (data.status === 'completed' || data.status === 'confirmed' || data.status === 'delivered') {
                        totalRevenue += Number(data.total || 0);

                        const restId = data.restaurant_id || data.restaurantId;
                        if (restId) {
                            if (!revenueByRestaurant[restId]) {
                                revenueByRestaurant[restId] = { sales: 0, count: 0 };
                            }
                            revenueByRestaurant[restId].sales += Number(data.total || 0);
                            revenueByRestaurant[restId].count += 1;
                        }
                    }
                });

                // Include transport revenue
                (transportData || []).forEach((data: any) => {
                    if (data.status === 'completed') {
                        totalRevenue += Number(data.total || data.price || 0);
                    }
                });

                // Calculate Top Restaurants
                const topResSorted = Object.entries(revenueByRestaurant)
                    .map(([id, stats]) => ({
                        id,
                        name: restaurantMap[id]?.name || 'Restaurante Eliminado',
                        logo: restaurantMap[id]?.logo,
                        sales: stats.sales,
                        orderCount: stats.count
                    }))
                    .sort((a, b) => b.sales - a.sales)
                    .slice(0, 5);

                setTopRestaurants(topResSorted);
                setStats({
                    users: usersCount,
                    restaurants: restaurantsCount,
                    orders: (ordersData || []).length + (transportData || []).length,
                    revenue: totalRevenue,
                    newUsersToday: newToday
                });
            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    if (isLoading) {
        return (
            <div className="animate-pulse space-y-8">
                <div className="h-8 bg-slate-200 rounded w-1/4"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-slate-100 rounded-2xl"></div>)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="h-80 bg-slate-100 rounded-2xl"></div>
                    <div className="h-80 bg-slate-100 rounded-2xl"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 sm:space-y-6 pb-6 sm:pb-10">
            <div>
                <h1 className="text-xl sm:text-3xl font-black text-slate-900 leading-tight">Control Principal</h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">Monitorea el rendimiento de Un 2x3 en tiempo real.</p>
            </div>

            {/* Main Stats: 2 cols in mobile, 4 in desktop */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                <StatCard
                    title="Usuarios"
                    value={stats.users.toLocaleString()}
                    trend={`+${stats.newUsersToday} hoy`}
                    icon={Users}
                    color="bg-primary text-slate-900"
                />
                <StatCard
                    title="Negocios"
                    value={stats.restaurants.toString()}
                    trend="Activos"
                    icon={Store}
                    color="bg-slate-900 text-white"
                />
                <StatCard
                    title="Pedidos y Viajes"
                    value={stats.orders.toLocaleString()}
                    trend="Plataforma"
                    icon={ShoppingBag}
                    color="bg-emerald-500 text-slate-900"
                />
                <StatCard
                    title="Ingresos"
                    value={<DualPrice usdAmount={stats.revenue} usdClassName="text-lg sm:text-2xl font-black text-slate-950 tracking-tight" showDivider={false} className="flex flex-col" />}
                    trend="Total"
                    icon={TrendingUp}
                    color="bg-primary text-slate-900"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Ranking Table */}
                <div className="lg:col-span-2 bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-md sm:shadow-xl shadow-slate-200/40 overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-primary/10 text-slate-900 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                                <Award className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                            <div>
                                <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase">Top 5 Negocios</h3>
                                <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider">Por volumen de ventas</p>
                            </div>
                        </div>
                        <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-slate-300" />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50 text-slate-400 font-bold text-[9px] sm:text-[10px] uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 sm:px-6 py-3">#</th>
                                    <th className="px-4 sm:px-6 py-3">Negocio</th>
                                    <th className="px-3 sm:px-6 py-3 text-center">Pedidos</th>
                                    <th className="px-4 sm:px-6 py-3 text-right">Ventas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {topRestaurants.map((res, index) => {
                                    const logoImg = res.logo;

                                    return (
                                        <tr key={res.id} className="group hover:bg-slate-50/80 transition-all cursor-default">
                                            <td className="px-4 sm:px-6 py-3.5">
                                                <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-black text-xs ${index === 0 ? 'bg-primary text-slate-900 shadow-xs shadow-primary/20' :
                                                    index === 1 ? 'bg-emerald-500 text-slate-900 shadow-xs shadow-emerald-200' :
                                                        index === 2 ? 'bg-slate-900 text-white shadow-xs shadow-slate-200' : 'bg-slate-100 text-slate-500'
                                                    }`}>
                                                    {index + 1}
                                                </span>
                                            </td>
                                            <td className="px-4 sm:px-6 py-3.5">
                                                <div className="flex items-center gap-2.5 sm:gap-3">
                                                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200 shrink-0">
                                                        {logoImg ? (
                                                            <img src={logoImg} alt={res.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-slate-50">
                                                                <Store className="w-4 h-4 text-slate-300" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="font-bold text-xs sm:text-sm text-slate-800 group-hover:text-slate-900 transition-colors truncate max-w-[130px] sm:max-w-none">{res.name}</span>
                                                </div>
                                            </td>

                                            <td className="px-3 sm:px-6 py-3.5 text-center">
                                                <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] sm:text-xs font-black text-slate-600">
                                                    {res.orderCount}
                                                </span>
                                            </td>
                                            <td className="px-4 sm:px-6 py-3.5 text-right font-black text-slate-900 text-xs sm:text-base">
                                                <DualPrice usdAmount={res.sales} usdClassName="font-black text-slate-900 text-xs sm:text-base" showDivider={false} className="flex flex-col items-end" />
                                            </td>
                                        </tr>
                                    );
                                })}
                                {topRestaurants.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-xs text-slate-400 font-bold">
                                            Sin registros de ventas en comercios todavía.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Platform Summary / Activity */}
                <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-md sm:shadow-xl shadow-slate-200/40 p-4 sm:p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4 sm:mb-6">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-100 text-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                                    <Activity className="w-5 h-5" />
                                </div>
                                <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase">Tráfico App</h3>
                            </div>
                        </div>

                        <div className="space-y-3 sm:space-y-4">
                            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-50/70 border border-slate-100">
                                <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Nuevos Usuarios Hoy</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-2xl sm:text-3xl font-black text-slate-900">{stats.newUsersToday}</span>
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] sm:text-[10px] font-black uppercase">Activo</span>
                                </div>
                            </div>

                            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-50/70 border border-slate-100">
                                <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Ratio Órdenes / Usuario</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-2xl sm:text-3xl font-black text-slate-900">
                                        {stats.users > 0 ? (stats.orders / stats.users).toFixed(2) : '0'}
                                    </span>
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] sm:text-[10px] font-black uppercase">Promedio</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 sm:pt-6">
                        <button 
                            onClick={() => window.location.href = '/app-orders'}
                            className="w-full py-3 sm:py-3.5 bg-slate-950 text-white rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-xs uppercase tracking-wider shadow-lg shadow-slate-900/20 hover:scale-[1.01] transition-transform active:scale-[0.99] cursor-pointer"
                        >
                            VER PEDIDOS EN TIEMPO REAL
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, trend, icon: Icon, color }: { title: string, value: React.ReactNode, trend: string, icon: any, color: string }) {
    return (
        <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-xs sm:shadow-md border border-slate-100 hover:border-slate-200 transition-all cursor-default flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 ${color} rounded-xl flex items-center justify-center shadow-xs shrink-0`}>
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="flex items-center gap-0.5 text-emerald-600 font-bold text-[9px] sm:text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    <ArrowUpRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    {trend}
                </div>
            </div>
            <div>
                <h4 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider truncate">{title}</h4>
                <div className="mt-0.5">
                    {typeof value === 'string' ? (
                        <p className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">{value}</p>
                    ) : (
                        value
                    )}
                </div>
            </div>
        </div>
    );
}
