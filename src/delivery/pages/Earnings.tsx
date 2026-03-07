import React, { useEffect, useState } from 'react';
import { DollarSign, Activity, Calendar, ArrowUpRight, Star, ExternalLink, PackageCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';

interface DeliveryOrder {
    id: string;
    total: number;
    deliveryFee: number;
    status: string;
    createdAt: any;
    address: { reference: string; name: string };
    restaurantId: string; // To get origin name
    deliveryPaid?: boolean; // True if admin already paid the driver for this order
    rating?: number; // 1-5 stars from client
    comment?: string; // Feedback from client
}

export default function Earnings() {
    const { user } = useAuth();
    const [orders, setOrders] = useState<DeliveryOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, 'orders'),
            where('deliveryDriverId', '==', user.uid),
            where('status', '==', 'completed')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedOrders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as DeliveryOrder));

            // Sort by date descending (client-side since we can't always do composite indexes without creating them first)
            fetchedOrders.sort((a, b) => {
                const dateA = a.createdAt?.seconds || 0;
                const dateB = b.createdAt?.seconds || 0;
                return dateB - dateA;
            });

            setOrders(fetchedOrders);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const pendingOrders = orders.filter(o => !o.deliveryPaid);
    const historyOrders = orders.filter(o => o.deliveryPaid);

    const pendingTotal = pendingOrders.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);
    const historyTotal = historyOrders.reduce((sum, order) => sum + (order.deliveryFee || 0), 0);

    const displayOrders = activeTab === 'pending' ? pendingOrders : historyOrders;

    // Simulate Distance for UI since we don't have real coords recorded in history
    const getSimulatedDistance = (id: string) => {
        // Just a determinist pseudo-random distance based on ID length
        return ((id.length % 5) + 1.5).toFixed(1);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-24">
            <div className="px-4">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Mis Ganancias</h2>
                <p className="text-slate-500 font-medium mt-1">Supervisa tus ingresos por delivery</p>
            </div>

            {/* Main Balance Card */}
            <div className="mx-4 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[32px] p-6 text-white shadow-xl shadow-indigo-600/30 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10"></div>

                <p className="text-indigo-100 font-bold mb-1 opacity-80 uppercase tracking-widest text-xs">
                    {activeTab === 'pending' ? 'Pendiente por cobrar' : 'Total Histórico Cobrado'}
                </p>
                <div className="flex items-end gap-2 mb-6 relative z-10">
                    <span className="text-5xl font-black tracking-tighter">
                        ${activeTab === 'pending' ? pendingTotal.toFixed(2) : historyTotal.toFixed(2)}
                    </span>
                    {activeTab === 'pending' && pendingTotal > 0 && (
                        <span className="bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 mb-2">
                            <ArrowUpRight className="w-3 h-3" /> Listo para pago
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4 relative z-10">
                    <div>
                        <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Viajes</p>
                        <p className="font-black text-xl">{activeTab === 'pending' ? pendingOrders.length : historyOrders.length}</p>
                    </div>
                    <div>
                        <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Promedio</p>
                        <p className="font-black text-xl">
                            ${displayOrders.length > 0
                                ? ((activeTab === 'pending' ? pendingTotal : historyTotal) / displayOrders.length).toFixed(2)
                                : '0.00'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="px-4 flex gap-2">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`flex-1 py-3 px-4 rounded-2xl font-bold text-sm transition-all ${activeTab === 'pending' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                >
                    Pendientes
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-3 px-4 rounded-2xl font-bold text-sm transition-all ${activeTab === 'history' ? 'bg-slate-800 text-white shadow-md shadow-slate-300' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                >
                    Historial Pagado
                </button>
            </div>

            {/* Transactions List */}
            <div className="space-y-4 px-4">
                {displayOrders.length === 0 ? (
                    <div className="text-center py-10 bg-slate-100 rounded-3xl border-2 border-dashed border-slate-200">
                        <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <h3 className="font-bold text-slate-700">No hay movimientos</h3>
                        <p className="text-sm text-slate-500 mt-1">Aún no tienes entregas en esta sección.</p>
                    </div>
                ) : (
                    displayOrders.map((order) => (
                        <div key={order.id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4 relative overflow-hidden">
                            {/* Header */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {order.createdAt?.seconds
                                            ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                            : 'Fecha reciente'}
                                    </p>
                                    <h3 className="font-black text-slate-900 leading-tight">Delivery Completado</h3>
                                </div>
                                <div className="text-right">
                                    <span className="font-black text-indigo-600 text-xl">+${(order.deliveryFee || 0).toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Details Route */}
                            <div className="bg-slate-50 rounded-2xl p-3 text-sm">
                                <div className="flex items-start gap-3 relative pb-4">
                                    <div className="absolute top-2.5 left-2 w-0.5 h-full bg-slate-200 -z-0"></div>
                                    <div className="w-4 h-4 rounded-full bg-slate-800 border-2 border-white relative z-10 shrink-0 mt-1"></div>
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-700 text-xs">Restaurante Aliado</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 relative">
                                    <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white relative z-10 shrink-0 mt-1"></div>
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-700">{order.address?.name || 'Cliente'}</p>
                                        <p className="text-xs text-slate-500 line-clamp-1">{order.address?.reference || 'Sin dirección de referencia'}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="bg-white border border-slate-200 text-slate-600 text-[10px] font-black px-2 py-1 rounded-lg">
                                            {getSimulatedDistance(order.id)} km
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Rating / Review from Client */}
                            {order.rating ? (
                                <div className="bg-orange-50/50 rounded-2xl p-3 border border-orange-100 flex items-start gap-3">
                                    <div className="flex items-center gap-0.5 text-orange-500 shrink-0 mt-0.5">
                                        <Star className="w-4 h-4 fill-current" />
                                        <span className="font-black text-sm ml-1">{order.rating}</span>
                                    </div>
                                    <div>
                                        {order.comment ? (
                                            <p className="text-xs text-slate-700 italic font-medium">"{order.comment}"</p>
                                        ) : (
                                            <p className="text-xs text-slate-500 font-medium">El cliente dejó una calificación sin comentarios.</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                                    <AlertCircle className="w-3 h-3" /> Sin calificación del cliente aún.
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
