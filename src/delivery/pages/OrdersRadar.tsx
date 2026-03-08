import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { MapPin, Navigation, Package, Clock, ShieldCheck, Car, Bike } from 'lucide-react';
import { updateDriverLocation } from '../../lib/delivery-service';

export default function OrdersRadar() {
    const { user } = useAuth();
    const [driverProfile, setDriverProfile] = useState<any>(null);
    const [availableOrders, setAvailableOrders] = useState<any[]>([]);
    const [availableTransport, setAvailableTransport] = useState<any[]>([]);
    const [activeOrder, setActiveOrder] = useState<any>(null);
    const [activeTransport, setActiveTransport] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // 1. Fetch Driver Profile for vehicleType
    useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(doc(db, 'delivery_drivers', user.uid), (docSnap) => {
            if (docSnap.exists()) {
                setDriverProfile(docSnap.data());
            }
        });
        return () => unsub();
    }, [user]);

    // 2. Escuchar órdenes de delivery y transporte activo
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
                setActiveOrder({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setActiveOrder(null);
            }
        });

        // Escuchar transport activo
        const activeTransportQ = query(
            collection(db, 'transport_requests'),
            where('driverId', '==', user.uid),
            where('status', 'in', ['accepted', 'arriving', 'in_progress'])
        );
        const unsubActiveTransport = onSnapshot(activeTransportQ, (snapshot) => {
            if (!snapshot.empty) {
                setActiveTransport({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setActiveTransport(null);
            }
        });

        // Escuchar órdenes de comida disponibles
        const availableQ = query(
            collection(db, 'orders'),
            where('deliveryMethod', '==', 'app_delivery'),
            where('status', '==', 'finding_driver')
        );
        const unsubAvailable = onSnapshot(availableQ, (snapshot) => {
            const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAvailableOrders(orders);
        });

        return () => {
            unsubActive();
            unsubActiveTransport();
            unsubAvailable();
        };
    }, [user]);

    // 3. Escuchar viajes disponibles filtrados por vehicleType
    useEffect(() => {
        if (!driverProfile?.vehicleType) {
            setAvailableTransport([]);
            setLoading(false);
            return;
        }

        const transportQ = query(
            collection(db, 'transport_requests'),
            where('status', '==', 'searching'),
            where('vehicleType', '==', driverProfile.vehicleType)
        );

        const unsub = onSnapshot(transportQ, (snapshot) => {
            const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAvailableTransport(reqs);
            setLoading(false);
        });

        return () => unsub();
    }, [driverProfile]);

    // 4. Geolocalización constante si hay una orden activa o viaje activo
    useEffect(() => {
        if (!user || (!activeOrder && !activeTransport)) return;

        const locInterval = setInterval(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        updateDriverLocation(user.uid, latitude, longitude);
                    },
                    (err) => console.error("Error obteniendo ubicación:", err),
                    { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
                );
            }
        }, 60000); // Cada 60 Segundos

        return () => clearInterval(locInterval);
    }, [user, activeOrder, activeTransport]);

    // --- ACCIONES DE COMIDA ---
    const handleAcceptOrder = async (orderId: string) => {
        if (!user || activeOrder || activeTransport) return;
        try {
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
        await updateDoc(doc(db, 'orders', activeOrder.id), { status: 'in_transit' });
    };

    const handleMarkDelivered = async () => {
        if (!activeOrder) return;
        await updateDoc(doc(db, 'orders', activeOrder.id), {
            status: 'delivered',
            deliveredAt: serverTimestamp()
        });
        setActiveOrder(null);
    };

    // --- ACCIONES DE TRANSPORTE (TAXI) ---
    const handleAcceptTransport = async (reqId: string) => {
        if (!user || activeOrder || activeTransport) return;
        try {
            const reqRef = doc(db, 'transport_requests', reqId);
            const reqSnap = await getDoc(reqRef);
            if (reqSnap.exists() && reqSnap.data().status === 'searching') {
                await updateDoc(reqRef, {
                    status: 'accepted',
                    driverId: user.uid,
                    driverAssignedAt: serverTimestamp()
                });
            } else {
                alert("Este viaje ya fue tomado por otro conductor.");
            }
        } catch (error) {
            console.error("Error al aceptar viaje:", error);
            alert("Hubo un problema al aceptar el viaje.");
        }
    };

    const handleTransportArriving = async () => {
        if (!activeTransport) return;
        await updateDoc(doc(db, 'transport_requests', activeTransport.id), { status: 'arriving' });
    };

    const handleTransportStart = async () => {
        if (!activeTransport) return;
        await updateDoc(doc(db, 'transport_requests', activeTransport.id), { status: 'in_progress' });
    };

    const handleTransportComplete = async () => {
        if (!activeTransport) return;
        await updateDoc(doc(db, 'transport_requests', activeTransport.id), {
            status: 'completed',
            completedAt: serverTimestamp()
        });
        setActiveTransport(null);
    };


    if (loading) {
        return <div className="p-4 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;
    }

    // --- VISTA DE TRANSPORTE ACTIVO ---
    if (activeTransport) {
        return (
            <div className="space-y-4 animate-fade-in">
                <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-3xl mb-4">
                    <div className="flex items-center gap-2 text-indigo-700 font-bold mb-1">
                        <Navigation className="w-5 h-5" />
                        Viaje de Pasajero
                    </div>
                    <p className="text-indigo-600/80 text-xs font-medium">Recoge al cliente y llévalo a su destino.</p>
                </div>

                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-6">
                    <div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">Estado Actual</span>
                        <h2 className="text-2xl font-black text-slate-900 border-b border-slate-100 pb-4">
                            {activeTransport.status === 'accepted' && 'En camino a recoger'}
                            {activeTransport.status === 'arriving' && 'Esperando al pasajero'}
                            {activeTransport.status === 'in_progress' && 'En viaje al destino'}
                        </h2>
                    </div>

                    <div className="space-y-4">
                        <div className="flex gap-4">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
                                {activeTransport.vehicleType === 'moto' ? <Bike className="w-5 h-5" /> : <Car className="w-5 h-5" />}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Origen</h3>
                                <p className="text-sm font-medium text-slate-500">{activeTransport.origin?.address}</p>
                            </div>
                        </div>

                        <div className="w-0.5 h-6 bg-slate-100 ml-5"></div>

                        <div className="flex gap-4">
                            <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center shrink-0">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Destino</h3>
                                <p className="text-sm font-medium text-slate-500">{activeTransport.destination?.address}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 grid gap-3">
                        {activeTransport.status === 'accepted' && (
                            <button
                                onClick={handleTransportArriving}
                                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl active:scale-95 transition-transform"
                            >
                                Llegué al punto de recogida
                            </button>
                        )}
                        {activeTransport.status === 'arriving' && (
                            <button
                                onClick={handleTransportStart}
                                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl active:scale-95 transition-transform"
                            >
                                Iniciar Viaje
                            </button>
                        )}
                        {activeTransport.status === 'in_progress' && (
                            <button
                                onClick={handleTransportComplete}
                                className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform"
                            >
                                Finalizar Viaje
                            </button>
                        )}
                        <a
                            href={`https://maps.google.com/?q=${activeTransport.status === 'in_progress' ? activeTransport.destination?.address : activeTransport.origin?.address}`}
                            target="_blank"
                            className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-transform"
                        >
                            <Navigation className="w-5 h-5" /> Abrir GPS
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // --- VISTA DE PEDIDO ACTIVO ---
    if (activeOrder) {
        return (
            <div className="space-y-4 animate-fade-in">
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-3xl mb-4">
                    <div className="flex items-center gap-2 text-emerald-700 font-bold mb-1">
                        <Navigation className="w-5 h-5" />
                        Reparto en Curso
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

    const hasNoIncoming = availableOrders.length === 0 && availableTransport.length === 0;

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight px-2">Radar de Conductor</h2>

            {hasNoIncoming ? (
                <div className="flex flex-col items-center justify-center p-10 bg-white rounded-[32px] border border-slate-100 text-center shadow-sm">
                    <div className="relative mb-6">
                        <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center">
                            <Compass className="w-10 h-10 text-indigo-300" />
                        </div>
                        {/* Radar ping animation */}
                        <div className="absolute inset-0 bg-indigo-400 rounded-full animate-ping opacity-20"></div>
                    </div>
                    <h3 className="text-lg font-black text-slate-800 mb-2">Buscando viajes...</h3>
                    <p className="text-slate-500 font-medium text-sm">Mantén la app abierta para recibir notificaciones de nuevos pedidos o pasajeros en tu zona.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Lista de Viajes (Taxi) */}
                    {availableTransport.map(req => (
                        <div key={req.id} className="bg-white rounded-[24px] p-5 shadow-sm border-2 border-primary/20">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-2 text-xs font-black uppercase tracking-wider text-primary">
                                    <span className="bg-primary/10 px-2 py-1 rounded-md flex items-center gap-1">
                                        {req.vehicleType === 'moto' ? <Bike className="w-3" /> : <Car className="w-3" />} Pasajero
                                    </span>
                                </div>
                                <span className="font-black text-emerald-600 text-lg">${(req.price || 0).toFixed(2)}</span>
                            </div>

                            <div className="space-y-3 mb-6">
                                <div className="flex items-start gap-3">
                                    <Navigation className="w-5 h-5 text-indigo-500 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase">Buscar en:</p>
                                        <p className="font-bold text-slate-800 line-clamp-2">{req.origin?.address}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <MapPin className="w-5 h-5 text-emerald-500 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase">Llevar a: (Cliente: {req.userName})</p>
                                        <p className="font-bold text-slate-800 line-clamp-2">{req.destination?.address}</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleAcceptTransport(req.id)}
                                className="w-full bg-primary text-white font-black py-4 rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                            >
                                Aceptar Viaje
                            </button>
                        </div>
                    ))}

                    {/* Lista de Entregas (Comida) */}
                    {availableOrders.map(order => (
                        <div key={order.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                                    <span className="bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1">
                                        <Package className="w-3" /> Reparto
                                    </span>
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
                                Aceptar Reparto
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
