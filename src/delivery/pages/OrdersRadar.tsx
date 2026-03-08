import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { MapPin, Navigation, Package, Clock, ShieldCheck, Car, Bike, Compass as CompassIcon } from 'lucide-react';
import { updateDriverLocation } from '../../lib/delivery-service';
import { motion, AnimatePresence } from 'framer-motion';

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

    const [processingAction, setProcessingAction] = useState<string | null>(null);

    // --- ACCIONES DE COMIDA ---
    const handleAcceptOrder = async (orderId: string) => {
        if (!user || activeOrder || activeTransport || processingAction) return;
        setProcessingAction(orderId);
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
        } finally {
            setProcessingAction(null);
        }
    };

    const handleMarkInTransit = async () => {
        if (!activeOrder || processingAction) return;
        setProcessingAction('in_transit');
        try {
            await updateDoc(doc(db, 'orders', activeOrder.id), { status: 'in_transit' });
        } finally {
            setProcessingAction(null);
        }
    };

    const handleMarkDelivered = async () => {
        if (!activeOrder || processingAction) return;
        setProcessingAction('delivered');
        try {
            await updateDoc(doc(db, 'orders', activeOrder.id), {
                status: 'delivered',
                deliveredAt: serverTimestamp()
            });
            setActiveOrder(null);
        } finally {
            setProcessingAction(null);
        }
    };

    // --- ACCIONES DE TRANSPORTE (TAXI) ---
    const handleAcceptTransport = async (reqId: string) => {
        if (!user || activeOrder || activeTransport || processingAction) return;
        setProcessingAction(reqId);
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
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportArriving = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('arriving');
        try {
            await updateDoc(doc(db, 'transport_requests', activeTransport.id), { status: 'arriving' });
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportStart = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('start');
        try {
            await updateDoc(doc(db, 'transport_requests', activeTransport.id), { status: 'in_progress' });
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportComplete = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('complete');
        try {
            await updateDoc(doc(db, 'transport_requests', activeTransport.id), {
                status: 'completed',
                completedAt: serverTimestamp()
            });
            setActiveTransport(null);
        } finally {
            setProcessingAction(null);
        }
    };


    if (loading) {
        return <div className="p-10 flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-slate-400 font-bold animate-pulse">Sincronizando Radar...</p>
        </div>;
    }

    // --- VISTA DE TRANSPORTE ACTIVO ---
    if (activeTransport) {
        return (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                <div className="bg-primary/5 border border-primary/10 p-5 rounded-[2.5rem] mb-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                        <Navigation className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                        <div className="text-primary font-black text-sm uppercase tracking-wider">Viaje en Curso</div>
                        <p className="text-slate-500 text-[10px] font-bold">Lleva al pasajero de forma segura.</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16"></div>

                    <div className="relative">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Estado Actual</span>
                        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            {activeTransport.status === 'accepted' && 'En camino a recoger'}
                            {activeTransport.status === 'arriving' && 'Esperando al pasajero'}
                            {activeTransport.status === 'in_progress' && 'En viaje al destino'}
                        </h2>
                    </div>

                    <div className="space-y-4 relative">
                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 shadow-inner">
                                {activeTransport.vehicleType === 'moto' ? <Bike className="w-6" /> : <Car className="w-6" />}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recoger en:</h3>
                                <p className="font-bold text-slate-700 leading-tight mt-0.5">{activeTransport.origin?.address}</p>
                            </div>
                        </div>

                        <div className="w-px h-8 bg-dashed bg-slate-200 ml-6"></div>

                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-inner">
                                <MapPin className="w-6" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Destino final:</h3>
                                <p className="font-bold text-slate-700 leading-tight mt-0.5">{activeTransport.destination?.address}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 grid gap-3">
                        {activeTransport.status === 'accepted' && (
                            <button
                                onClick={handleTransportArriving}
                                disabled={processingAction !== null}
                                className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2 h-16 disabled:opacity-70"
                            >
                                {processingAction === 'arriving' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Llegué al punto'}
                            </button>
                        )}
                        {activeTransport.status === 'arriving' && (
                            <button
                                onClick={handleTransportStart}
                                disabled={processingAction !== null}
                                className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2 h-16 disabled:opacity-70"
                            >
                                {processingAction === 'start' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Iniciar Viaje'}
                            </button>
                        )}
                        {activeTransport.status === 'in_progress' && (
                            <button
                                onClick={handleTransportComplete}
                                disabled={processingAction !== null}
                                className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 h-16 disabled:opacity-70"
                            >
                                {processingAction === 'complete' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Finalizar Viaje'}
                            </button>
                        )}
                        <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeTransport.status === 'in_progress' ? activeTransport.destination?.address : activeTransport.origin?.address)}`}
                            target="_blank"
                            className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-all"
                        >
                            <Navigation className="w-5 h-5" /> Abrir GPS
                        </a>
                    </div>
                </div>
            </motion.div>
        );
    }

    // --- VISTA DE PEDIDO ACTIVO ---
    if (activeOrder) {
        return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[2.5rem] flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                        <Package className="w-6 h-6 animate-bounce" />
                    </div>
                    <div>
                        <div className="text-emerald-700 font-black text-sm uppercase tracking-wider">Reparto Activo</div>
                        <p className="text-emerald-600/80 text-[10px] font-bold">Entrega la comida lo antes posible.</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6">
                    <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Ruta de Entrega</span>
                        <h2 className="text-2xl font-black text-slate-900 border-b border-slate-50 pb-4">
                            {activeOrder.status === 'driver_assigned' ? 'Recolectar Pedido' : 'Entregar al Cliente'}
                        </h2>
                    </div>

                    <div className="space-y-4">
                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100">
                                <Package className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Restaurante</h3>
                                <p className="font-bold text-slate-800 text-lg leading-tight mt-0.5">{activeOrder.restaurantName}</p>
                            </div>
                        </div>

                        <div className="w-px h-8 bg-slate-100 ml-6"></div>

                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100">
                                <MapPin className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Cliente</h3>
                                <p className="font-bold text-slate-800 leading-tight mt-0.5">{activeOrder.shippingAddress?.address || 'Dirección de entrega...'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 grid gap-3">
                        {activeOrder.status === 'driver_assigned' ? (
                            <button
                                onClick={handleMarkInTransit}
                                disabled={processingAction !== null}
                                className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-70"
                            >
                                {processingAction === 'in_transit' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Ya tengo el Pedido'}
                            </button>
                        ) : (
                            <button
                                onClick={handleMarkDelivered}
                                disabled={processingAction !== null}
                                className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-500/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-70"
                            >
                                {processingAction === 'delivered' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Marcar como Entregado'}
                            </button>
                        )}
                        <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeOrder.shippingAddress?.address)}`}
                            target="_blank"
                            className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-all"
                        >
                            <Navigation className="w-5 h-5" /> Abrir GPS
                        </a>
                    </div>
                </div>
            </motion.div>
        );
    }

    const hasNoIncoming = availableOrders.length === 0 && availableTransport.length === 0;

    return (
        <div className="space-y-6 pb-10">
            <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Radar Real-Time</h2>
                <div className="flex gap-1">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-emerald-500/40 rounded-full animate-pulse delay-75"></div>
                    <div className="w-2 h-2 bg-emerald-500/10 rounded-full animate-pulse delay-150"></div>
                </div>
            </div>

            {hasNoIncoming ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center p-12 bg-white rounded-[3rem] border border-slate-100 text-center shadow-xl shadow-slate-200/20"
                >
                    <div className="relative mb-8">
                        <div className="w-32 h-32 bg-primary/5 rounded-full flex items-center justify-center border-4 border-white shadow-inner">
                            <Compass className="w-14 h-14 text-primary/30" />
                        </div>
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-10"></div>
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-10 delay-300"></div>
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">Escaneando Zona...</h3>
                    <p className="text-slate-400 font-bold text-sm max-w-[200px] mx-auto">Pronto aparecerán solicitudes cerca de ti.</p>
                </motion.div>
            ) : (
                <div className="space-y-5">
                    {/* Lista de Viajes (Taxi) */}
                    <AnimatePresence mode="popLayout">
                        {availableTransport.map(req => (
                            <motion.div
                                key={req.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-[2.5rem] p-6 shadow-xl shadow-slate-200/50 border-2 border-primary/10 relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>

                                <div className="flex justify-between items-center mb-6 relative">
                                    <div className="flex items-center gap-2 px-3 py-1 bg-primary text-white rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg shadow-primary/20">
                                        {req.vehicleType === 'moto' ? <Bike className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />}
                                        SOLICITUD TAXI
                                    </div>
                                    <div className="text-2xl font-black text-emerald-600">${(req.price || 0).toFixed(2)}</div>
                                </div>

                                <div className="space-y-4 mb-8 relative">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 shadow-inner">
                                            <Navigation className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Recoger:</p>
                                            <p className="font-bold text-slate-700 leading-tight mt-0.5">{req.origin?.address}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-inner">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Destino (Cliente: {req.userName}):</p>
                                            <p className="font-bold text-slate-700 leading-tight mt-0.5 line-clamp-2">{req.destination?.address}</p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleAcceptTransport(req.id)}
                                    disabled={processingAction !== null}
                                    className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-70 group-hover:shadow-primary/40"
                                >
                                    {processingAction === req.id ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'ACEPTAR VIAJE'}
                                </button>
                            </motion.div>
                        ))}

                        {/* Lista de Entregas (Comida) */}
                        {availableOrders.map(order => (
                            <motion.div
                                key={order.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-[2.5rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 group relative overflow-hidden"
                            >
                                <div className="absolute bottom-0 right-0 w-24 h-24 bg-slate-50 rounded-full -mr-12 -mb-12"></div>

                                <div className="flex justify-between items-center mb-6 relative">
                                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-wider">
                                        <Package className="w-3.5 h-3.5" />
                                        REPARTO COMIDA
                                    </div>
                                    <div className="text-2xl font-black text-indigo-600">${(order.total || 0).toFixed(2)}</div>
                                </div>

                                <div className="space-y-4 mb-8 relative">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100">
                                            <Package className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Restaurante:</p>
                                            <p className="font-bold text-slate-800 leading-tight mt-0.5">{order.restaurantName}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-inner">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Entrega:</p>
                                            <p className="font-bold text-slate-700 leading-tight mt-0.5 line-clamp-2">{order.shippingAddress?.address}</p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleAcceptOrder(order.id)}
                                    disabled={processingAction !== null}
                                    className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-600/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-70 group-hover:bg-indigo-700"
                                >
                                    {processingAction === order.id ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'TOMAR REPARTO'}
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
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
