import React, { useState, useEffect } from 'react';
import { User, Camera, TrendingUp, Calendar, Clock, LogOut, ChevronRight, Award, ShoppingBag, DollarSign } from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import WaiterLayout from '../components/WaiterLayout';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function WaiterProfile() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        day: { count: 0, total: 0 },
        week: { count: 0, total: 0 },
        month: { count: 0, total: 0 }
    });
    const [loading, setLoading] = useState(true);
    const waiterData = JSON.parse(localStorage.getItem('waiterData') || '{}');
    const restaurantId = localStorage.getItem('waiterRestaurantId');

    useEffect(() => {
        const fetchStats = async () => {
            if (!waiterData.id || !restaurantId) {
                setLoading(false);
                return;
            }

            try {
                // Fetch all orders created by this waiter in this restaurant
                // Note: In a real app we would filter by a 'waiterId' field in the order
                // For now, assuming orders have 'waiterId' or just fetching restaurant orders to demonstrate UI
                const q = query(
                    collection(db, 'orders'),
                    where('restaurantId', '==', restaurantId),
                    where('waiterId', '==', waiterData.id),
                    orderBy('createdAt', 'desc')
                );

                const snapshot = await getDocs(q);
                const orders = snapshot.docs.map(doc => ({
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toMillis() || 0
                }));

                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000;
                const oneWeek = 7 * oneDay;
                const oneMonth = 30 * oneDay;

                const dayOrders = orders.filter(o => now - o.createdAt < oneDay);
                const weekOrders = orders.filter(o => now - o.createdAt < oneWeek);
                const monthOrders = orders.filter(o => now - o.createdAt < oneMonth);

                setStats({
                    day: { count: dayOrders.length, total: dayOrders.reduce((acc, o: any) => acc + (o.total || 0), 0) },
                    week: { count: weekOrders.length, total: weekOrders.reduce((acc, o: any) => acc + (o.total || 0), 0) },
                    month: { count: monthOrders.length, total: monthOrders.reduce((acc, o: any) => acc + (o.total || 0), 0) }
                });

            } catch (err) {
                console.error("Error fetching stats:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [waiterData.id, restaurantId]);

    const handleLogout = () => {
        localStorage.removeItem('waiterData');
        localStorage.removeItem('waiterRestaurantId');
        localStorage.removeItem('isWaiter');
        navigate('/login');
    };

    return (
        <WaiterLayout>
            {/* Header / Profile Info */}
            <div className="bg-gradient-to-br from-primary to-orange-400 p-10 pt-16 pb-20 text-white rounded-b-[3.5rem] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>

                <div className="relative z-10 flex flex-col items-center">
                    <div className="relative group">
                        <div className="w-28 h-28 bg-white/20 backdrop-blur-md rounded-full border-4 border-white/30 flex items-center justify-center overflow-hidden shadow-2xl">
                            {waiterData.photoURL ? (
                                <img src={waiterData.photoURL} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-12 h-12 text-white" />
                            )}
                        </div>
                        <button className="absolute bottom-0 right-0 bg-white text-primary p-2.5 rounded-full shadow-lg border-2 border-primary/10 active:scale-90 transition-transform">
                            <Camera className="w-4 h-4" />
                        </button>
                    </div>

                    <h2 className="text-2xl font-black mt-5 tracking-tight">{waiterData.name}</h2>
                    <div className="flex items-center gap-2 mt-1 opacity-80">
                        <Award className="w-3.5 h-3.5" />
                        <span className="text-xs font-bold uppercase tracking-widest">{waiterData.role || 'Mesero'}</span>
                    </div>
                </div>
            </div>

            <main className="px-5 -mt-10 space-y-6 relative z-20 pb-10">
                {/* Stats Cards */}
                <section className="bg-white rounded-[2.5rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col gap-6">
                    <div className="flex items-center gap-2 px-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-black text-slate-800 tracking-tight">Mis Estadísticas</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {[
                            { label: 'Últimas 24h', value: stats.day, icon: Clock, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                            { label: 'Esta Semana', value: stats.week, icon: Calendar, color: 'text-indigo-500', bg: 'bg-indigo-50' },
                            { label: 'Este Mes', value: stats.month, icon: Award, color: 'text-amber-500', bg: 'bg-amber-50' }
                        ].map((item, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className={`flex items-center justify-between p-5 rounded-[2rem] ${item.bg} border-2 border-white`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm ${item.color}`}>
                                        <item.icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{item.label}</p>
                                        <p className="font-bold text-slate-700">{item.value.count} pedidos realizados</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Ventas</p>
                                    <p className="font-black text-slate-800 text-lg">${item.value.total.toFixed(2)}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* Account Actions */}
                <div className="space-y-3">
                    <button className="w-full flex items-center justify-between p-5 bg-white rounded-[2rem] shadow-sm border border-slate-50 hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-white transition-colors">
                                <User className="w-5 h-5 text-slate-400" />
                            </div>
                            <span className="font-bold text-slate-700 text-sm">Editar Información</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-between p-5 bg-rose-50/30 rounded-[2.5rem] border-2 border-rose-50 hover:bg-rose-50 transition-all font-bold text-rose-500 group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                <LogOut className="w-5 h-5" />
                            </div>
                            <span>Cerrar Sesión</span>
                        </div>
                        <ChevronRight className="w-4 h-4 opacity-30" />
                    </button>
                </div>

                <p className="text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] pt-4">
                    Arepa Express v1.0.4
                </p>
            </main>
        </WaiterLayout>
    );
}
