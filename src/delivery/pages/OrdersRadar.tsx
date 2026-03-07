import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { MapPin, Navigation, Package, Clock, ShieldCheck } from 'lucide-react';
import { updateDriverLocation } from '../../lib/delivery-service';

export default function OrdersRadar() {
    const { user, profile } = useAuth();
    const [availableOrders, setAvailableOrders] = useState<any[]>([]);
    const [activeOrder, setActiveOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // 1. Escuchar órdenes disponibles o mi orden activa
    useEffect(() => {
        if (!user) return;

        // Escuchar orden activa del conductor
        const activeQ = query(
            collection(db, 'orders'),
            where('deliveryDriverId', '==', user.uid),
            where('status', 'in', ['driver_assigned', 'in_transit'])
        );

        const unsubActive = onSnapshot(activeQ, (snapshot) => {
            if (!snapshot.empty) {
                // Hay una orden activa (asumimos 1 a la vez por ahora)
                const docSnap = snapshot.docs[0];
                setActiveOrder({ id: docSnap.id, ...docSnap.data() });
            } else {
                setActiveOrder(null);
            }
        });

        // Escuchar órdenes buscando conductor
        const availableQ = query(
            collection(db, 'orders'),
            where('deliveryMethod', '==', 'app_delivery'),
            where('status', '==', 'finding_driver')
        );

        const unsubAvailable = onSnapshot(availableQ, (snapshot) => {
            const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAvailableOrders(orders);
            setLoading(false);
        });

        return () => {
            unsubActive();
            unsubAvailable();
        };
    }, [user]);

    // 2. Geolocalización constante si hay una orden activa
    useEffect(() => {
        if (!user || !activeOrder) return;

        console.log("Activando rastreo de ubicación para la orden:", activeOrder.id);

        const locInterval = setInterval(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        // Actualizamos en el perfil del conductor (y se podría replicar en la orden si se requiere)
                        updateDriverLocation(user.uid, latitude, longitude);
                    },
                    (err) => console.error("Error obteniendo ubicación:", err),
                    { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
                );
            }
        }, 60000); // Cada 60 Segundos

        return () => clearInterval(locInterval);
    }, [user, activeOrder]);

    const handleAcceptOrder = async (orderId: string) => {
        if (!user || activeOrder) return;

        try {
            // Se asume que el backend/firestore rules manejará la concurrencia, 
            // pero hacemos una actualización directa por ahora.
            const orderRef = doc(db, 'orders', orderId);
            const orderSnap = await getDoc(orderRef);

            if (orderSnap.exists() && orderSnap.data().status === 'finding_driver') {
                await updateDoc(orderRef, {
                    status: 'driver_assigned',
                    deliveryDriverId: user.uid,
                    driverAssignedAt: serverTimestamp()
                });
            } else {
                alert("Este pedido ya fue tomado por otro piloto.");
            }
        } catch (error) {
            console.error("Error al aceptar orden:", error);
            alert("Hubo un problema al aceptar la orden.");
        }
    };

    const handleMarkInTransit = async () => {
        if (!activeOrder) return;
        await updateDoc(doc(db, 'orders', activeOrder.id), {
            status: 'in_transit'
        });
    };

    const handleMarkDelivered = async () => {
        if (!activeOrder) return;
        // Aquí se sumaría la ganancia en history o finance logs, 
        // pero por ahora solo cerramos la orden.
        await updateDoc(doc(db, 'orders', activeOrder.id), {
            status: 'delivered',
            deliveredAt: serverTimestamp()
        });
        setActiveOrder(null);
    };

    if (loading) {
        return <div className="p-4 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;
    }

    if (activeOrder) {
        return (
            <div className="space-y-4 animate-fade-in">
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-3xl mb-4">
                    <div className="flex items-center gap-2 text-emerald-700 font-bold mb-1">
                        <Navigation className="w-5 h-5" />
                        Viaje en Curso
                    </div>
                    <p className="text-emerald-600/80 text-xs font-medium">Revisa las indicaciones y conduce con cuidado.</p>
                </div>

                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-6">
                    <div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">Estado Actual</span>
                        <h2 className="text-2xl font-black text-slate-900 border-b border-slate-100 pb-4">
                            {activeOrder.status === 'driver_assigned' ? 'Ir al Restaurante' : 'En Camino al Cliente'}
                        </h2>
                    </div>

                    <div className="space-y-4">
                        <div className="flex gap-4">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
                                <Package className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Restaurante</h3>
                                <p className="text-sm font-medium text-slate-500">{activeOrder.restaurantName}</p>
                            </div>
                        </div>

                        <div className="w-0.5 h-6 bg-slate-100 ml-5"></div>

                        <div className="flex gap-4">
                            <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center shrink-0">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Entrega</h3>
                                <p className="text-sm font-medium text-slate-500">{activeOrder.shippingAddress?.address || 'Dirección de entrega...'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 grid gap-3">
                        {activeOrder.status === 'driver_assigned' ? (
                            <button
                                onClick={handleMarkInTransit}
                                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl active:scale-95 transition-transform"
                            >
                                Ya tengo el Pedido
                            </button>
                        ) : (
                            <button
                                onClick={handleMarkDelivered}
                                className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform"
                            >
                                Marcar como Entregado
                            </button>
                        )}
                        <a
                            href={`https://maps.google.com/?q=${activeOrder.shippingAddress?.address}`}
                            target="_blank"
                            className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-transform"
                        >
                            <Navigation className="w-5 h-5" /> Ver en GPS
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight px-2">Radar de Pedidos</h2>

            {availableOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 bg-white rounded-[32px] border border-slate-100 text-center shadow-sm">
                    <div className="relative mb-6">
                        <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center">
                            <Compass className="w-10 h-10 text-indigo-300" />
                        </div>
                        {/* Radar ping animation */}
                        <div className="absolute inset-0 bg-indigo-400 rounded-full animate-ping opacity-20"></div>
                    </div>
                    <h3 className="text-lg font-black text-slate-800 mb-2">Buscando envíos...</h3>
                    <p className="text-slate-500 font-medium text-sm">Mantén la app abierta para recibir notificaciones de nuevos pedidos en tu zona.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {availableOrders.map(order => (
                        <div key={order.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                                    <span className="bg-slate-100 px-2 py-1 rounded-md">ID: {order.id.slice(0, 6)}</span>
                                </div>
                                <span className="font-black text-indigo-600 text-lg">${(order.total || 0).toFixed(2)}</span>
                            </div>

                            <div className="space-y-3 mb-6">
                                <div className="flex items-start gap-3">
                                    <Package className="w-5 h-5 text-slate-400 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase">Recolectar en:</p>
                                        <p className="font-bold text-slate-800">{order.restaurantName}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <MapPin className="w-5 h-5 text-indigo-500 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase">Entregar en:</p>
                                        <p className="font-bold text-slate-800 line-clamp-2">{order.shippingAddress?.address}</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleAcceptOrder(order.id)}
                                className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-transform"
                            >
                                Aceptar Viaje
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Re-using local icon component so I don't import Compass wrongly above
function Compass(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
    )
}
