import React, { useState, useEffect } from 'react';
import { Users, Store, TrendingUp, ShoppingBag, ArrowUpRight, Award, BarChart3, Activity } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

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
                const usersSnap = await getDocs(collection(db, 'users'));
                const usersCount = usersSnap.size;

                // Simple "New Today" (based on createdAt if available)
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                let newToday = 0;
                usersSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.createdAt && data.createdAt.toDate() >= today) {
                        newToday++;
                    }
                });

                // Fetch restaurants
                const restaurantsSnap = await getDocs(collection(db, 'restaurants'));
                const restaurantsCount = restaurantsSnap.size;
                const restaurantMap: Record<string, { name: string, logo: string }> = {};
                restaurantsSnap.forEach(doc => {
                    const data = doc.data();
                    restaurantMap[doc.id] = {
                        name: data.name,
                        logo: data.logoUrl || data.image
                    };
                });

                // Fetch orders
                const ordersSnap = await getDocs(collection(db, 'orders'));
                const transportSnap = await getDocs(collection(db, 'transport_requests'));

                let totalRevenue = 0;
                const revenueByRestaurant: Record<string, { sales: number, count: number }> = {};

                ordersSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.status === 'completed' || data.status === 'confirmed' || data.status === 'delivered') {
                        totalRevenue += (data.total || 0);

                        if (data.restaurantId) {
                            if (!revenueByRestaurant[data.restaurantId]) {
                                revenueByRestaurant[data.restaurantId] = { sales: 0, count: 0 };
                            }
                            revenueByRestaurant[data.restaurantId].sales += (data.total || 0);
                            revenueByRestaurant[data.restaurantId].count += 1;
                        }
                    }
                });

                // Include transport revenue
                transportSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.status === 'completed') {
                        totalRevenue += (data.total || data.price || 0);
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
                    orders: ordersSnap.size + transportSnap.size,
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
        <div className="space-y-8 pb-10">
            <div>
                <h1 className="text-3xl font-black text-slate-900 leading-tight">Control Principal</h1>
                <p className="text-slate-500 font-medium mt-1">Monitorea el rendimiento de Deliexpress en tiempo real.</p>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Usuarios Totales"
                    value={stats.users.toLocaleString()}
                    trend={`+${stats.newUsersToday} hoy`}
                    icon={Users}
                    color="bg-blue-600"
                />
                <StatCard
                    title="Restaurantes"
                    value={stats.restaurants.toString()}
                    trend="Activos"
                    icon={Store}
                    color="bg-orange-500"
                />
                <StatCard
                    title="Órdenes (Total)"
                    value={stats.orders.toLocaleString()}
                    trend="Plataforma"
                    icon={ShoppingBag}
                    color="bg-emerald-500"
                />
                <StatCard
                    title="Ingresos"
                    value={`$${stats.revenue.toLocaleString()}`}
                    trend="Histórico"
                    icon={TrendingUp}
                    color="bg-violet-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Ranking Table */}
                <div className="lg:col-span-2 bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
                    <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-primary/10 text-slate-900 rounded-2xl flex items-center justify-center">
                                <Award className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase">Top 5 Restaurants</h3>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Por nivel de facturación</p>
                            </div>
                        </div>
                        <BarChart3 className="w-6 h-6 text-slate-200" />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
                                <tr>
                                    <th className="px-8 py-4">Ranking</th>
                                    <th className="px-8 py-4">Restaurante</th>
                                    <th className="px-8 py-4 text-center">Pedidos</th>
                                    <th className="px-8 py-4 text-right">Ingresos</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {topRestaurants.map((res, index) => {
                                    const logoImg = res.logo;

                                    return (
                                        <tr key={res.id} className="group hover:bg-slate-50/80 transition-all cursor-default">
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${index === 0 ? 'bg-yellow-400 text-white shadow-lg shadow-yellow-200' :
                                                        index === 1 ? 'bg-slate-300 text-white shadow-lg shadow-slate-200' :
                                                            index === 2 ? 'bg-orange-300 text-white shadow-lg shadow-orange-200' : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                        {index + 1}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden border-2 border-white shadow-sm shrink-0">
                                                        {logoImg ? (
                                                            <img src={logoImg} alt={res.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-slate-50">
                                                                <Store className="w-6 h-6 text-slate-200" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="font-bold text-slate-800 group-hover:text-slate-900 transition-colors">{res.name}</span>
                                                </div>
                                            </td>

                                            <td className="px-8 py-5 text-center">
                                                <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-600">
                                                    {res.orderCount}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-right font-black text-slate-900 text-lg">
                                                ${res.sales.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}

                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Platform Summary / Activity */}
                <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/50 p-8 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                                    <Activity className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900 uppercase">Tráfico App</h3>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="p-6 rounded-[32px] bg-slate-50/50 border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">Crecimiento Hoy</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-4xl font-black text-slate-900">{stats.newUsersToday}</span>
                                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider">Altos</span>
                                </div>
                            </div>

                            <div className="p-6 rounded-[32px] bg-slate-50/50 border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">Conversión Órdenes</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-4xl font-black text-slate-900">{((stats.orders / (stats.users || 1)) * 10).toFixed(1)}%</span>
                                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-wider">Avg</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-8">
                        <button className="w-full py-5 bg-slate-950 text-white rounded-[24px] font-black text-xs uppercase tracking-widest shadow-2xl shadow-slate-900/40 hover:scale-[1.02] transition-transform active:scale-[0.98]">
                            VER REPORTES COMPLETOS
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, trend, icon: Icon, color }: { title: string, value: string, trend: string, icon: any, color: string }) {
    return (
        <div className="bg-white p-7 rounded-[40px] shadow-xl shadow-slate-200/40 border border-slate-50 group hover:-translate-y-1 transition-transform cursor-default">
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div className={`w-14 h-14 ${color} text-white rounded-[22px] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                        <Icon className="w-7 h-7" />
                    </div>
                    <div className="flex items-center gap-1 text-emerald-600 font-bold text-[10px] bg-emerald-50 px-3 py-1.5 rounded-full uppercase tracking-widest">
                        <ArrowUpRight className="w-3 h-3" />
                        {trend}
                    </div>
                </div>
                <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{title}</h4>
                    <p className="text-3xl font-black text-slate-950 mt-1 tracking-tight">{value}</p>
                </div>
            </div>
        </div>
    );
}
