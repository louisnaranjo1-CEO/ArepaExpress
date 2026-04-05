import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingBag, Clock, ChevronRight, Package, Navigation, ArrowLeft } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import Cart from './Cart';

type TabType = 'cart' | 'active';

export default function Orders() {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = (searchParams.get('tab') as TabType) || 'cart';
    const [activeTab, setActiveTab] = useState<TabType>(initialTab);
    const { user } = useAuth();
    const [activeOrders, setActiveOrders] = useState<any[]>([]);
    const [restaurantLogos, setRestaurantLogos] = useState<Record<string, string>>({});
    const [loadingOrders, setLoadingOrders] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) return;

        // Query active orders (not completed or cancelled)
        const q = query(
            collection(db, 'orders'),
            where('userId', '==', user.uid),
            where('status', 'not-in', ['completed', 'cancelled', 'rejected']),
            orderBy('status'),
            orderBy('createdAt', 'desc'),
            limit(10)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setActiveOrders(orders);
            setLoadingOrders(false);
        }, (error) => {
            console.error("Error fetching active orders:", error);
            setLoadingOrders(false);
        });

        return () => unsubscribe();
    }, [user]);

    // Fetch restaurant logos when orders change
    useEffect(() => {
        const fetchLogos = async () => {
            const newLogos = { ...restaurantLogos };
            let changed = false;

            for (const order of activeOrders) {
                if (order.restaurantId && !newLogos[order.restaurantId]) {
                    try {
                        const rDoc = await getDoc(doc(db, 'restaurants', order.restaurantId));
                        if (rDoc.exists()) {
                            newLogos[order.restaurantId] = rDoc.data().logoUrl || '';
                            changed = true;
                        }
                    } catch (err) {
                        console.error("Error fetching restaurant logo:", err);
                    }
                }
            }

            if (changed) {
                setRestaurantLogos(newLogos);
            }
        };

        if (activeOrders.length > 0) {
            fetchLogos();
        }
    }, [activeOrders]);

    // Update URL when tab changes
    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    if (activeTab === 'cart') {
        return (
            <div className="flex flex-col h-full bg-slate-50 relative">
                {/* Custom Tab Header for Cart */}
                <div className="bg-white px-4 pt-4 pb-2 sticky top-0 z-40 border-b border-slate-100 shadow-sm">
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                        <button
                            onClick={() => handleTabChange('cart')}
                            className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'cart' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <ShoppingBag className="w-4 h-4" />
                            Nuevo Pedido
                        </button>
                        <button
                            onClick={() => handleTabChange('active')}
                            className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative ${activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Clock className="w-4 h-4" />
                            Mis Pedidos
                            {activeOrders.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-slate-900 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-100 animate-bounce">
                                    {activeOrders.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <Cart hideHeader={true} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white px-4 pt-4 pb-2 sticky top-0 z-40 border-b border-slate-100 shadow-sm">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                    <button
                        onClick={() => handleTabChange('cart')}
                        className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'cart' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <ShoppingBag className="w-4 h-4" />
                        Nuevo Pedido
                    </button>
                    <button
                        onClick={() => handleTabChange('active')}
                        className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative ${activeTab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Clock className="w-4 h-4" />
                        Mis Pedidos
                        {activeOrders.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-slate-900 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-100 animate-bounce">
                                {activeOrders.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingOrders ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Buscando tus pedidos...</p>
                    </div>
                ) : activeOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-10 text-center space-y-6">
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full"></div>
                            <Package className="w-20 h-20 text-slate-200 relative z-10" />
                        </div>
                        <div className="space-y-2 relative z-10">
                            <h3 className="text-xl font-black text-slate-900">No tienes pedidos activos</h3>
                            <p className="text-slate-500 text-sm font-medium leading-relaxed">¿Tienes hambre? Explora nuestros restaurantes y pide algo delicioso ahora mismo.</p>
                        </div>
                        <button
                            onClick={() => navigate('/')}
                            className="bg-primary text-slate-900 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/30 active:scale-95 transition-all w-full"
                        >
                            Ir a Restaurantes
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 pb-10">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Rastreo en Tiempo Real</h2>
                            <span className="text-[10px] font-bold text-slate-900 bg-primary/10 px-2 py-0.5 rounded-full">{activeOrders.length} {activeOrders.length === 1 ? 'Activo' : 'Activos'}</span>
                        </div>
                        {activeOrders.map((order) => (
                            <div
                                key={order.id}
                                onClick={() => navigate(`/track/${order.id}`)}
                                className="bg-white rounded-3xl p-5 shadow-xl shadow-slate-200/40 border border-slate-100 group active:scale-[0.98] transition-all cursor-pointer overflow-hidden relative"
                            >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                                
                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-primary/10 transition-all overflow-hidden border border-slate-100 shadow-inner">
                                            {restaurantLogos[order.restaurantId] ? (
                                                <img src={restaurantLogos[order.restaurantId]} alt="Logo" className="w-full h-full object-cover" />
                                            ) : (
                                                <ShoppingBag className="w-7 h-7" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-900 group-hover:text-slate-900 transition-colors text-lg">#{order.id.slice(-6).toUpperCase()}</p>
                                            <p className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{order.restaurantName || 'Restaurante'}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">
                                                {order.createdAt?.toDate().toLocaleDateString()} • {order.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                                        order.status === 'pending' || order.status === 'pendiente_pago' ? 'bg-amber-100 text-amber-600' :
                                        order.status === 'preparing' || order.status === 'accepted' ? 'bg-orange-100 text-orange-600 shadow-sm shadow-orange-100' :
                                        order.status === 'in_transit' || order.status === 'driver_assigned' || order.status === 'arriving' ? 'bg-emerald-100 text-emerald-600 shadow-sm shadow-emerald-100' :
                                        'bg-slate-100 text-slate-600'
                                    }`}>
                                        {order.status === 'pending' ? 'Buscando Local' :
                                         order.status === 'pendiente_pago' ? 'Pago Pendiente' :
                                         order.status === 'preparing' ? 'Preparando' :
                                         order.status === 'accepted' ? 'Confirmado' :
                                         order.status === 'driver_assigned' ? 'Piloto Asignado' :
                                         order.status === 'in_transit' ? 'En Camino' :
                                         order.status === 'arriving' ? 'Llegando' : order.status}
                                    </span>
                                </div>

                                <div className="space-y-3 mb-5 relative z-10">
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Navigation className="w-3.5 h-3.5 text-slate-400" />
                                        <p className="text-xs font-bold truncate flex-1">{order.address?.name || 'Dirección de Entrega'}</p>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <div className="flex -space-x-2">
                                            {order.items?.slice(0, 3).map((item: any, i: number) => (
                                                <div key={i} className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-black text-slate-500 overflow-hidden">
                                                    {item.quantity}x
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[10px] font-bold uppercase tracking-tighter">
                                            {order.items?.length || 0} productos • Total: {order.total?.toLocaleString('es-VE', { style: 'currency', currency: 'USD' })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 pt-4 border-t border-slate-50 relative z-10">
                                    <button className="flex-1 bg-primary text-slate-900 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 group-hover:bg-orange-600 transition-all">
                                        Ver Seguimiento
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
