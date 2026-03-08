import React, { useState, useEffect } from 'react';
import { ClipboardList, Clock, CheckCircle, Package, Search } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import WaiterLayout from '../components/WaiterLayout';
import { motion, AnimatePresence } from 'framer-motion';

export default function WaiterOrders() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('active');

    useEffect(() => {
        const restaurantId = localStorage.getItem('waiterRestaurantId');
        if (!restaurantId) {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'orders'),
            where('restaurantId', '==', restaurantId),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setOrders(fetched);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const activeOrders = orders.filter(o =>
        filter === 'active'
            ? ['pending', 'preparing', 'delivering', 'calling'].includes(o.status)
            : ['delivered', 'completed', 'rejected'].includes(o.status)
    );

    return (
        <WaiterLayout>
            <header className="px-5 py-6 bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-slate-50">
                <h1 className="text-2xl font-black text-slate-800">Pedidos</h1>
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={() => setFilter('active')}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filter === 'active' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-100 text-slate-400'}`}
                    >
                        ACTIVOS
                    </button>
                    <button
                        onClick={() => setFilter('history')}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filter === 'history' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-100 text-slate-400'}`}
                    >
                        HISTORIAL
                    </button>
                </div>
            </header>

            <main className="p-5">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : activeOrders.length > 0 ? (
                    <div className="space-y-4">
                        <AnimatePresence>
                            {activeOrders.map((order) => (
                                <motion.div
                                    key={order.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Mesa {order.table}</p>
                                            <p className="font-bold text-slate-800">#{order.id.slice(-6).toUpperCase()}</p>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${order.status === 'pending' ? 'bg-orange-50 text-orange-500' :
                                                order.status === 'preparing' ? 'bg-blue-50 text-blue-500' :
                                                    order.status === 'delivering' ? 'bg-indigo-50 text-indigo-500' :
                                                        'bg-emerald-50 text-emerald-500'
                                            }`}>
                                            {order.status}
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        {order.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                                <span className="text-slate-600 font-medium">{item.quantity}x {item.name}</span>
                                                <span className="text-slate-400 font-bold">${(item.price * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                                        <span className="text-sm font-black text-slate-400">Total</span>
                                        <span className="text-lg font-black text-primary">${order.total?.toFixed(2)}</span>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <ClipboardList className="w-10 h-10 text-slate-300" />
                        </div>
                        <h2 className="text-xl font-black text-slate-800 mb-1">Esperando pedidos nuevos</h2>
                        <p className="text-sm font-bold text-slate-400">Las comandas aparecerán aquí...</p>
                    </div>
                )}
            </main>
        </WaiterLayout>
    );
}
