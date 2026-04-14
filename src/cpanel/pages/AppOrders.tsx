import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ShoppingBag, Clock, MapPin, Truck, Check, X, ShieldAlert, Phone, MessageCircle } from 'lucide-react';
import DualPrice from '../../components/DualPrice';
import OrderChatWindow from '../../components/chat/OrderChatWindow';

export default function AppOrders() {
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrderForChat, setSelectedOrderForChat] = useState<any | null>(null);

    useEffect(() => {
        // We query by source = client and order by createdAt desc
        // If an index is missing, we fallback to just order by createdAt desc and filter in JS
        const q = query(
            collection(db, 'orders'),
            where('source', '==', 'client'),
            // orderBy('createdAt', 'desc'),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            fetchedOrders.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return dateB - dateA;
            });
            setOrders(fetchedOrders);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching app orders:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const getStatusBadge = (status: string) => {
        const statuses: Record<string, { label: string, color: string }> = {
            'pending': { label: 'Pendiente/Chat', color: 'bg-yellow-100 text-yellow-700' },
            'pendiente_pago': { label: 'Pendiente/Chat', color: 'bg-yellow-100 text-yellow-700' },
            'verificando_pago_delivery': { label: 'Verificando Pago Envío', color: 'bg-purple-100 text-purple-700' },
            'preparing': { label: 'Preparándose', color: 'bg-blue-100 text-blue-700' },
            'delivering': { label: 'En Camino', color: 'bg-orange-100 text-orange-700' },
            'delivered': { label: 'Entregado', color: 'bg-green-100 text-green-700' },
            'cancelled': { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
            'rejected': { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
        };
        const current = statuses[status] || { label: status, color: 'bg-slate-100 text-slate-700' };
        return <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${current.color}`}>{current.label}</span>;
    };

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 mb-2">Pedidos de la App (En Vivo)</h1>
                    <p className="text-slate-500 font-medium">Monitorea las órdenes entrantes desde la aplicación móvil.</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : orders.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[32px] border-2 border-slate-100">
                    <ShoppingBag className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-xl font-bold text-slate-400">No hay pedidos recientes</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {orders.map(order => (
                        <div key={order.id} className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 relative group hover:border-primary/30 transition-all overflow-hidden flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <div>
                                    <p className="text-sm font-black text-slate-400">#{order.id.slice(0, 8).toUpperCase()}</p>
                                    <p className="text-lg font-black text-slate-900">{order.userName || 'Cliente'}</p>
                                </div>
                                {getStatusBadge(order.status)}
                            </div>

                            <div className="space-y-3 mb-6 relative z-10 flex-1">
                                <div className="flex items-center gap-3 text-slate-600">
                                    <StoreIcon className="w-5 h-5 text-slate-400" />
                                    <span className="font-bold text-sm truncate">{order.restaurantName || 'Restaurante'}</span>
                                </div>
                                
                                {order.deliveryMethod === 'app_delivery' && (
                                    <div className="flex items-start gap-3 text-slate-600">
                                        <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
                                        <span className="text-sm">{order.deliveryAddress}</span>
                                    </div>
                                )}
                                
                                {order.phone && (
                                    <div className="flex items-center gap-3 text-slate-600">
                                        <Phone className="w-5 h-5 text-slate-400 shrink-0" />
                                        <span className="text-sm font-bold">{order.phone}</span>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 text-slate-600">
                                    <Clock className="w-5 h-5 text-slate-400" />
                                    <span className="text-sm">
                                        {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('es-VE') : 'Reciente'}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total</p>
                                    <p className="text-xl font-black text-slate-900">
                                        <DualPrice usdAmount={order.total} />
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setSelectedOrderForChat(order)}
                                        className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        Chat
                                    </button>
                                    {order.status === 'verificando_pago_delivery' && order.deliveryPaymentReceipt && (
                                        <button 
                                            onClick={() => window.open(order.deliveryPaymentReceipt, '_blank')}
                                            className="px-4 py-2 bg-purple-100 text-purple-700 font-bold rounded-xl text-sm hover:bg-purple-200 transition-colors"
                                        >
                                            Ver Recibo
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Chat Modal */}
            {selectedOrderForChat && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedOrderForChat(null)}></div>
                    <div className="relative w-full max-w-2xl bg-white rounded-[32px] overflow-hidden shadow-2xl h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="font-black text-slate-900">Chat con {selectedOrderForChat.userName}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pedido #{selectedOrderForChat.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                            <button onClick={() => setSelectedOrderForChat(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <OrderChatWindow order={selectedOrderForChat} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Inline fallback for Store icon not imported 
function StoreIcon(props: any) {
    return (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>
    )
}
