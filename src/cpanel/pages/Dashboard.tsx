import React, { useState, useEffect } from 'react';
import { Users, Store, TrendingUp, ShoppingBag } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function Dashboard() {
    const [stats, setStats] = useState({
        users: 0,
        restaurants: 0,
        orders: 0,
        revenue: 0
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Fetch users
                const usersSnap = await getDocs(collection(db, 'users'));
                const usersCount = usersSnap.size;

                // Fetch restaurants
                const restaurantsSnap = await getDocs(collection(db, 'restaurants'));
                const restaurantsCount = restaurantsSnap.size;

                // Fetch orders
                const ordersSnap = await getDocs(collection(db, 'orders'));
                let totalRevenue = 0;
                ordersSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.status === 'completed' || data.status === 'confirmed') {
                        totalRevenue += (data.total || 0);
                    }
                });

                setStats({
                    users: usersCount,
                    restaurants: restaurantsCount,
                    orders: ordersSnap.size,
                    revenue: totalRevenue
                });
            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (isLoading) {
        return <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-6 py-1"><div className="h-4 bg-slate-200 rounded w-1/4"></div><div className="space-y-3"><div className="grid grid-cols-4 gap-6"><div className="h-24 bg-slate-200 rounded"></div><div className="h-24 bg-slate-200 rounded"></div><div className="h-24 bg-slate-200 rounded"></div><div className="h-24 bg-slate-200 rounded"></div></div></div></div></div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">Resumen Estadístico</h1>
            <p className="text-slate-500">Vista general de la plataforma.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Usuarios Totales" value={stats.users.toString()} icon={Users} color="bg-blue-500" />
                <StatCard title="Restaurantes" value={stats.restaurants.toString()} icon={Store} color="bg-indigo-500" />
                <StatCard title="Órdenes (Total)" value={stats.orders.toString()} icon={ShoppingBag} color="bg-emerald-500" />
                <StatCard title="Ingresos Estimados" value={`$${stats.revenue.toFixed(2)}`} icon={TrendingUp} color="bg-violet-500" />
            </div>

            {/* Future: Add Charts here */}
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color }: { title: string, value: string, icon: any, color: string }) {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-4">
                <div className={`w-12 h-12 ${color} bg-opacity-10 rounded-xl flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-500">{title}</p>
                    <p className="text-2xl font-bold text-slate-900">{value}</p>
                </div>
            </div>
        </div>
    );
}
