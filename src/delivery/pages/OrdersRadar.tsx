import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDoc, orderBy, limit, increment, runTransaction } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Car, Bike, Package, MapPin, Navigation, Phone, CheckCircle2, MessageSquare, Compass, Send, User as UserIcon, Star, MessageCircle, Clock, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import RideChat from '../../components/RideChat';
import ServiceTimer from '../components/ServiceTimer';
import { getCachedAudioUrl, NOTIFICATION_SOUND_URL } from '../../hooks/useGlobalAudioAlerts';
import { updateDriverLocation } from '../../lib/delivery-service';
import { calculateDistance } from '../../lib/geo';

export default function OrdersRadar() {
    const { user } = useAuth();
    const [driverProfile, setDriverProfile] = useState<any>(null);
    const [availableOrders, setAvailableOrders] = useState<any[]>([]);
    const [availableTransport, setAvailableTransport] = useState<any[]>([]);
    const [activeOrder, setActiveOrder] = useState<any>(null);
    const [activeTransport, setActiveTransport] = useState<any>(null);
    const [myReservations, setMyReservations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [latestFeedback, setLatestFeedback] = useState<any>(null);
    const [showChat, setShowChat] = useState(false);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const lastChatIdSeen = React.useRef<string | null>(null);
    const notificationSoundUrl = React.useRef<string | null>(null);

    // 1. Fetch Driver Profile for vehicleType
    useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(
            doc(db, 'delivery_drivers', user.uid),
            (docSnap) => {
                if (docSnap.exists()) {
                    setDriverProfile(docSnap.data());
                }
            },
            (err) => console.error("Error fetching radar profile:", err)
        );
        return () => unsub();
    }, [user]);

    // 2. Escuchar órdenes de delivery y transporte activo
    useEffect(() => {
        if (!user) return;

        // Escuchar orden activa del conductor
        const activeQ = query(
            collection(db, 'orders'),
            where('deliveryDriverId', '==', user.uid),
            where('status', 'in', ['en_camino', 'in_transit'])
        );
        const unsubActive = onSnapshot(activeQ, (snapshot) => {
            if (!snapshot.empty) {
                setActiveOrder({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setActiveOrder(null);
            }
        });

        // Escuchar transport activo y reservas programadas
        const activeTransportQ = query(
            collection(db, 'transport_requests'),
            where('driverId', '==', user.uid),
            where('status', 'in', ['accepted', 'arriving', 'in_progress'])
        );
        const unsubActiveTransport = onSnapshot(activeTransportQ, (snapshot) => {
            if (!snapshot.empty) {
                const allReqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
                
                // Mostrar en pantalla completa ("Viaje en Curso") si NO es programado (viaje normal), 
                // O si es programado pero el transportista ya indicó que va en camino ('arriving') o en progreso ('in_progress').
                const mainActive = allReqs.find((req: any) => !req.scheduled || req.status === 'arriving' || req.status === 'in_progress');
                setActiveTransport(mainActive || null);
                
                // Las reservas que solo han sido aceptadas van a una lista especial para que el transportista pueda iniciarlas luego
                const pendingReservations = allReqs.filter((req: any) => req.scheduled && req.status === 'accepted');
                setMyReservations(pendingReservations);
            } else {
                setActiveTransport(null);
                setMyReservations([]);
            }
        });

        // Escuchar órdenes de comida disponibles
        const availableQ = query(
            collection(db, 'orders'),
            where('status', '==', 'buscando_piloto'),
            where('eligibleDrivers', 'array-contains', user.uid)
        );
        const unsubAvailable = onSnapshot(availableQ, (snapshot) => {
            const orders = snapshot.docs.map(doc => {
                const data = doc.data();
                return { id: doc.id, ...data } as any;
            });
            setAvailableOrders(orders);
        });

        return () => {
            unsubActive();
            unsubActiveTransport();
            unsubAvailable();
        };
    }, [user, driverProfile]);

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

    // 5. Escuchar último feedback (calificación)
    useEffect(() => {
        if (!user) return;

        const feedbackQ = query(
            collection(db, 'transport_requests'),
            where('driverId', '==', user.uid),
            where('status', '==', 'completed'),
            orderBy('ratedAt', 'desc'),
            limit(1)
        );

        const unsub = onSnapshot(feedbackQ, (snapshot) => {
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                if (data.rating) {
                    setLatestFeedback({ id: snapshot.docs[0].id, ...data });
                }
            }
        });

        return () => unsub();
    }, [user]);

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

    // 5. Cargar sonido de notificación y escuchar chat
    useEffect(() => {
        const fetchSound = async () => {
            try {
                const url = await getCachedAudioUrl(NOTIFICATION_SOUND_URL, 'delivery-sound');
                notificationSoundUrl.current = url;
            } catch (err) {
                console.error("No se pudo cargar el sonido de notificación:", err);
            }
        };
        fetchSound();
    }, []);

    useEffect(() => {
        if (!activeTransport || !user) {
            setUnreadChatCount(0);
            return;
        }

        const q = query(
            collection(db, `transport_requests/${activeTransport.id}/messages`),
            orderBy('createdAt', 'desc'),
            limit(1)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const latestMsg = snapshot.docs[0];
                const data = latestMsg.data();
                
                // Si es un mensaje nuevo y no es mío
                if (lastChatIdSeen.current !== null && 
                    lastChatIdSeen.current !== latestMsg.id && 
                    data.senderId !== user.uid) {
                    
                    // Solo sonar si es un mensaje de hace menos de 30 segundos (evitar sonar por viejos al reconectar)
                    const now = Date.now();
                    const msgTime = data.createdAt?.toMillis() || now;
                    if (now - msgTime < 30000) {
                        // Play sound
                        if (notificationSoundUrl.current) {
                            const audio = new Audio(notificationSoundUrl.current);
                            audio.play().catch(e => console.error("Error playing audio:", e));
                        }

                        // Alerta Visual (Toast)
                        toast((t) => (
                            <div className="flex flex-col gap-1 p-1">
                                <p className="font-black text-slate-900 text-sm flex items-center gap-2">
                                    <MessageCircle className="w-4 h-4 text-emerald-500" />
                                    Nuevo Mensaje
                                </p>
                                <p className="text-slate-500 text-xs font-bold leading-tight line-clamp-2">
                                    {data.text || "Ha enviado un archivo o ubicación"}
                                </p>
                            </div>
                        ), {
                            position: 'top-center',
                            duration: 4000,
                            style: {
                                borderRadius: '1.25rem',
                                padding: '12px 16px',
                                border: '1px solid rgba(0,0,0,0.05)',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                            }
                        });

                        // Update count if chat is closed
                        if (!showChat) {
                            setUnreadChatCount(prev => prev + 1);
                        }
                    }
                }
                lastChatIdSeen.current = latestMsg.id;
            } else {
                lastChatIdSeen.current = ""; // No hay mensajes
            }
        });

        return () => unsub();
    }, [activeTransport, user, showChat]);

    useEffect(() => {
        if (showChat) {
            setUnreadChatCount(0);
        }
    }, [showChat]);

    const [processingAction, setProcessingAction] = useState<string | null>(null);

    // --- ACCIONES DE COMIDA ---
    const handleAcceptOrder = async (orderId: string) => {
        if (!user || activeOrder || activeTransport || processingAction) return;
        setProcessingAction(orderId);
        try {
            const orderRef = doc(db, 'orders', orderId);
            await runTransaction(db, async (transaction) => {
                const orderDoc = await transaction.get(orderRef);
                if (!orderDoc.exists()) {
                    throw new Error("El pedido no existe.");
                }

                const data = orderDoc.data();
                if (data.status === 'buscando_piloto' && !data.deliveryDriverId) {
                    transaction.update(orderRef, {
                        status: 'en_camino',
                        deliveryDriverId: user.uid,
                        driverAssignedAt: serverTimestamp()
                    });
                } else {
                    throw new Error("ALREADY_TAKEN");
                }
            });
        } catch (error: any) {
            console.error("Error al aceptar orden:", error);
            if (error.message === "ALREADY_TAKEN") {
                toast.error("El pedido ya fue tomado por otro repartidor.");
            } else {
                toast.error("Hubo un problema al aceptar el viaje.");
            }
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
            // Calculate total service duration in seconds
            let durationSeconds = 0;
            if (activeOrder.driverAssignedAt) {
                const start = activeOrder.driverAssignedAt.toDate().getTime();
                durationSeconds = Math.floor((Date.now() - start) / 1000);
            }

            await updateDoc(doc(db, 'orders', activeOrder.id), {
                status: 'delivered',
                deliveredAt: serverTimestamp(),
                totalServiceDuration: durationSeconds
            });

            if (activeOrder.restaurantId && activeOrder.deliveryFee) {
                try {
                    const restRef = doc(db, 'restaurants', activeOrder.restaurantId);
                    await updateDoc(restRef, {
                        deuda_delivery_acumulada: increment(activeOrder.deliveryFee)
                    });
                } catch (err) {
                    console.error("Error sumando deuda al restaurante:", err);
                }
            }
            if (activeOrder.userId && activeOrder.deliveryFee) {
                try {
                    const pointsToAdd = activeOrder.deliveryFee * 2;
                    const userRef = doc(db, 'users', activeOrder.userId);
                    await updateDoc(userRef, {
                        points: increment(pointsToAdd)
                    });
                } catch (err) {
                    console.error("Error sumando puntos globales al usuario:", err);
                }
            }

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
            // Calculate arrival duration in seconds
            let durationSeconds = 0;
            if (activeTransport.driverAssignedAt) {
                const start = activeTransport.driverAssignedAt.toDate().getTime();
                durationSeconds = Math.floor((Date.now() - start) / 1000);
            }

            await updateDoc(doc(db, 'transport_requests', activeTransport.id), { 
                status: 'arriving', 
                driverArrivedAt: serverTimestamp(),
                arrivalDuration: durationSeconds
            });
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

            // Si el viaje tiene usuario asociado y costo, sumar puntos al usuario (2.5 puntos por cada $)
            if (activeTransport.userId && activeTransport.price) {
                try {
                    const pointsToAdd = activeTransport.price * 2.5;
                    const userRef = doc(db, 'users', activeTransport.userId);
                    await updateDoc(userRef, {
                        points: increment(pointsToAdd)
                    });
                } catch (pointsError) {
                    console.error("Error al sumar puntos de viaje:", pointsError);
                }
            }

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
            <>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                <div className="bg-primary/5 border border-primary/10 p-5 rounded-[2.5rem] mb-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-slate-900">
                        <Navigation className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                        <div className="text-slate-900 font-black text-sm uppercase tracking-wider">Viaje en Curso</div>
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

                    {activeTransport.status === 'accepted' && activeTransport.driverAssignedAt && (
                        <div className="pt-2">
                            <ServiceTimer 
                                startTime={activeTransport.driverAssignedAt} 
                                mode="countdown" 
                            />
                        </div>
                    )}

                    <div className="space-y-4 relative">
                        {/* Passenger Details */}
                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center shrink-0 border border-blue-100 shadow-inner">
                                <UserIcon className="w-6" />
                            </div>
                            <div className="flex-1 flex justify-between items-center gap-2">
                                <div>
                                    <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest">Pasajero:</h3>
                                    <p className="font-bold text-slate-700 leading-tight mt-0.5">{activeTransport.userName || 'Usuario'}</p>
                                    {(activeTransport.userCedula || activeTransport.userPhone) && (
                                        <div className="text-xs text-slate-500 font-medium mt-0.5 space-y-0.5 pb-2">
                                            {activeTransport.userCedula && <p>C.I: {activeTransport.userCedula}</p>}
                                            {activeTransport.userPhone && <p>Telf: {activeTransport.userPhone}</p>}
                                        </div>
                                    )}
                                </div>
                                {activeTransport.userPhone && (
                                    <a
                                        href={`tel:${activeTransport.userPhone}`}
                                        className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm active:scale-95 transition-all hover:bg-emerald-100"
                                    >
                                        <Phone className="w-5 h-5 fill-emerald-600/20" />
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="w-px h-8 bg-dashed bg-slate-200 ml-6"></div>

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
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-inner">
                                <MapPin className="w-6" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest">Destino final:</h3>
                                <p className="font-bold text-slate-700 leading-tight mt-0.5">{activeTransport.destination?.address}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 grid gap-3">
                        {activeTransport.status === 'accepted' && (
                            <button
                                onClick={handleTransportArriving}
                                disabled={processingAction !== null}
                                className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2 h-16 disabled:opacity-70"
                            >
                                {processingAction === 'arriving' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Llegué al punto'}
                            </button>
                        )}
                        {activeTransport.status === 'arriving' && (
                            <button
                                onClick={handleTransportStart}
                                disabled={processingAction !== null}
                                className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2 h-16 disabled:opacity-70"
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
                            href={
                                activeTransport.status === 'in_progress'
                                    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeTransport.destination?.address || '')}`
                                    : `https://www.google.com/maps/dir/?api=1&waypoints=${encodeURIComponent(activeTransport.origin?.address || '')}&destination=${encodeURIComponent(activeTransport.destination?.address || '')}`
                            }
                            target="_blank"
                            className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-all"
                        >
                            <Navigation className="w-5 h-5" /> Abrir GPS
                        </a>
                        <button
                            onClick={() => setShowChat(true)}
                            className="w-full mt-2 bg-emerald-50 text-emerald-700 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-all relative overflow-hidden"
                        >
                            <MessageSquare className="w-5 h-5" /> 
                            Ver Chat
                            {unreadChatCount > 0 && (
                                <motion.div 
                                    initial={{ scale: 0 }} 
                                    animate={{ scale: 1 }} 
                                    className="absolute top-3 right-4 bg-primary text-slate-900 text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-emerald-50 shadow-sm"
                                >
                                    {unreadChatCount}
                                </motion.div>
                            )}
                            {unreadChatCount > 0 && (
                                <div className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none"></div>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* Modal de Chat Integrado */}
            <AnimatePresence>
                {showChat && activeTransport && (
                    <motion.div
                        initial={{ opacity: 0, y: 100 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 100 }}
                        className="fixed inset-0 z-50 bg-slate-50 flex flex-col"
                    >
                        <RideChat
                            requestId={activeTransport.id}
                            onClose={() => setShowChat(false)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </>);
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
                            {activeOrder.status === 'en_camino' ? 'Recolectar Pedido' : 'Entregar al Cliente'}
                        </h2>
                    </div>

                    {activeOrder.driverAssignedAt && (
                        <div className="pt-2">
                            <ServiceTimer 
                                startTime={activeOrder.driverAssignedAt} 
                                mode="stopwatch" 
                            />
                        </div>
                    )}

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

                        {/* Detalles del Cliente */}
                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center shrink-0 border border-blue-100 shadow-inner">
                                <UserIcon className="w-6" />
                            </div>
                            <div className="flex-1 flex justify-between items-center gap-2">
                                <div>
                                    <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest">Cliente:</h3>
                                    <p className="font-bold text-slate-700 leading-tight mt-0.5">{activeOrder.userName || 'Cliente Invitado'}</p>
                                    {(activeOrder.userCedula || activeOrder.userPhone) && (
                                        <div className="text-xs text-slate-500 font-medium mt-0.5 space-y-0.5 pb-2">
                                            {activeOrder.userCedula && <p>C.I: {activeOrder.userCedula}</p>}
                                            {activeOrder.userPhone && <p>Telf: {activeOrder.userPhone}</p>}
                                        </div>
                                    )}
                                </div>
                                {activeOrder.userPhone && (
                                    <a
                                        href={`tel:${activeOrder.userPhone}`}
                                        className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm active:scale-95 transition-all hover:bg-emerald-100"
                                    >
                                        <Phone className="w-5 h-5 fill-emerald-600/20" />
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="w-px h-8 bg-slate-100 ml-6"></div>

                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100">
                                <MapPin className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest">Dirección de Entrega</h3>
                                <p className="font-bold text-slate-800 leading-tight mt-0.5">{activeOrder.shippingAddress?.address || activeOrder.deliveryAddress || 'Dirección de entrega...'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 grid gap-3">
                        {activeOrder.status === 'en_camino' ? (
                            <button
                                onClick={handleMarkInTransit}
                                disabled={processingAction !== null}
                                className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-70"
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

                        {activeOrder.userPhone && (
                            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 mt-2">
                                <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3 flex items-center justify-between">
                                    Notificar al Cliente por WhatsApp
                                    <Send className="w-3 h-3" />
                                </h4>
                                <div className="grid grid-cols-1 gap-2">
                                    <a
                                        href={`https://wa.me/${activeOrder.userPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${activeOrder.userName || ''}, soy tu piloto de Un 2x3. Tu orden está casi lista en el restaurante, en breve salgo.`)}`}
                                        target="_blank"
                                        className="w-full bg-white text-emerald-700 font-bold py-3 rounded-xl border border-emerald-200 text-xs flex justify-center items-center hover:bg-emerald-100 transition-all text-center"
                                    >
                                        "Casi Listo"
                                    </a>
                                    <a
                                        href={`https://wa.me/${activeOrder.userPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${activeOrder.userName || ''}, ya tengo tu pedido en mis manos. Voy en camino a tu dirección.`)}`}
                                        target="_blank"
                                        className="w-full bg-white text-emerald-700 font-bold py-3 rounded-xl border border-emerald-200 text-xs flex justify-center items-center hover:bg-emerald-100 transition-all text-center"
                                    >
                                        "¡En camino!"
                                    </a>
                                </div>
                            </div>
                        )}
                        
                        {activeOrder.restaurantPhone && activeOrder.status === 'en_camino' && (
                             <a
                                href={`https://wa.me/${activeOrder.restaurantPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, soy el piloto de Un 2x3. Estoy afuera para retirar el pedido de ${activeOrder.userName || 'Cliente'}.`)}`}
                                target="_blank"
                                className="w-full bg-green-50 text-green-700 font-bold py-3 rounded-xl border border-green-200 text-xs flex justify-center items-center hover:bg-green-100 mt-2 transition-all"
                             >
                                Avisar llegada al Restaurante
                             </a>
                        )}
                    </div>
                </div>
            </motion.div>
        );
    }

    const hasNoIncoming = availableOrders.length === 0 && availableTransport.length === 0 && myReservations.length === 0;

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

            {/* Recent Feedback for Driver */}
            <AnimatePresence>
                {latestFeedback && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-amber-50 border-2 border-amber-200 p-6 rounded-[2.5rem] shadow-lg shadow-amber-200/20 mb-6 relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Star className="w-20 h-20 fill-amber-500" />
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="flex">
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <Star key={s} className={`w-4 h-4 ${latestFeedback.rating >= s ? 'fill-amber-400 text-amber-400' : 'text-amber-200'}`} />
                                ))}
                            </div>
                            <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Feedback Reciente</span>
                        </div>
                        <p className="text-amber-900 font-black text-lg leading-tight mb-2">¡Buen trabajo, {driverProfile?.name || 'Piloto'}!</p>
                        {latestFeedback.ratingComment && (
                            <p className="text-amber-800 text-sm font-medium italic">"{latestFeedback.ratingComment}"</p>
                        )}
                        <p className="text-[10px] font-bold text-amber-600/60 mt-4 uppercase tracking-tighter">Viaje ID: {latestFeedback.id.slice(0, 8)}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {hasNoIncoming ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center p-12 bg-white rounded-[3rem] border border-slate-100 text-center shadow-xl shadow-slate-200/20"
                >
                    <div className="relative mb-8">
                        <div className="w-32 h-32 bg-primary/5 rounded-full flex items-center justify-center border-4 border-white shadow-inner">
                            <Compass className="w-14 h-14 text-slate-900/30" />
                        </div>
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-10"></div>
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-10 delay-300"></div>
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">Escaneando Zona...</h3>
                    <p className="text-slate-400 font-bold text-sm max-w-[200px] mx-auto">Pronto aparecerán solicitudes cerca de ti.</p>
                </motion.div>
            ) : (
                <div className="space-y-5">
                    {/* Mis Reservas */}
                    {myReservations.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-[12px] font-black uppercase text-emerald-600 tracking-widest pl-2 mb-3">Mis Próximas Reservas</h3>
                            <div className="space-y-4">
                                {myReservations.map(req => (
                                    <motion.div
                                        key={req.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="bg-emerald-50 rounded-[2.5rem] p-6 shadow-md border border-emerald-100 relative group"
                                    >
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="flex items-center gap-2 px-3 py-1 bg-primary text-slate-900 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                <Clock className="w-3.5 h-3.5" /> RESERVA ACEPTADA
                                            </div>
                                            <div className="text-xl font-black text-emerald-600">${(req.price || 0).toFixed(2)}</div>
                                        </div>

                                        <div className="text-sm font-black text-emerald-900 mb-4 bg-white/60 p-3 rounded-2xl">
                                            {req.scheduledAt && typeof req.scheduledAt.toDate === 'function' ? (
                                                <>Para: {req.scheduledAt.toDate().toLocaleString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</>
                                            ) : 'Fecha Pendiente'}
                                        </div>

                                        <button
                                            onClick={() => setActiveTransport(req)}
                                            className="w-full bg-white text-emerald-700 font-black py-3 rounded-xl shadow-sm border border-emerald-200 active:scale-95 transition-all text-sm"
                                        >
                                            VER O INICIAR AHORA
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

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
                                    <div className="flex items-center gap-2 px-3 py-1 bg-primary text-slate-900 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg shadow-primary/20">
                                        {req.vehicleType === 'moto' ? <Bike className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />}
                                        {req.scheduled ? 'VIAJE PROGRAMADO' : 'SOLICITUD TAXI'}
                                    </div>
                                    <div className="text-2xl font-black text-emerald-600">${(req.price || 0).toFixed(2)}</div>
                                </div>

                                {req.scheduled && (
                                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 p-3 rounded-2xl border border-emerald-100 mb-4 animate-in fade-in slide-in-from-top-1">
                                        <Clock className="w-4 h-4" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-wider leading-none">Para el día:</span>
                                            <span className="text-sm font-black">
                                                {req.scheduledAt && typeof req.scheduledAt.toDate === 'function'
                                                    ? req.scheduledAt.toDate().toLocaleString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                                                    : 'Fecha pendiente'}
                                            </span>
                                        </div>
                                    </div>
                                )}

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
                                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-inner">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Cliente:</p>
                                            <p className="font-bold text-slate-900 leading-tight flex flex-col gap-0.5">
                                                <span>{req.userName}</span>
                                                {(req.userCedula || req.userPhone) && (
                                                    <span className="text-xs text-slate-500 font-medium">
                                                        {req.userCedula && `C.I: ${req.userCedula}`}
                                                        {req.userCedula && req.userPhone && ' • '}
                                                        {req.userPhone && `Telf: ${req.userPhone}`}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Destino:</p>
                                            <p className="font-bold text-slate-700 leading-tight mt-0.5 line-clamp-2">{req.destination?.address}</p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleAcceptTransport(req.id)}
                                    disabled={processingAction !== null}
                                    className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-70 group-hover:shadow-primary/40"
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
                                    <div className="text-sm font-black text-primary">RECOLECTAR PEDIDO</div>
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
                                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-inner">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Entrega:</p>
                                            <p className="font-bold text-slate-700 leading-tight mt-0.5 line-clamp-2">{order.shippingAddress?.address}</p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleAcceptOrder(order.id)}
                                    disabled={processingAction !== null}
                                    className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-70 group-hover:bg-primary"
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
