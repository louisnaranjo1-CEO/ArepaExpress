import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Car, Bike, MapPin, Navigation, Phone, CheckCircle2, MessageSquare, Send, User as UserIcon, Star, MessageCircle, Clock, AlertTriangle, ArrowLeft, Package, Sparkles, DollarSign, ShieldAlert, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import RideChat from '../../components/RideChat';
import OrderChatWindow from '../../components/chat/OrderChatWindow';
import ServiceTimer from '../components/ServiceTimer';
import { getCachedAudioUrl, NOTIFICATION_SOUND_URL } from '../../hooks/useGlobalAudioAlerts';
import { updateDriverLocation } from '../../lib/delivery-service';
import { calculateDistance } from '../../lib/geo';
import InAppCall from '../../components/InAppCall';
import { supabase } from '../../lib/supabase';
import { driversApi } from '../../lib/api';

export default function OrdersRadar() {
    const { user } = useAuth();
    const { bcvRate } = useCurrency();
    const navigate = useNavigate();
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
    // Incoming in-app call state
    const [showIncomingCall, setShowIncomingCall] = useState(false);
    // Outgoing in-app call state
    const [showOutgoingCall, setShowOutgoingCall] = useState(false);
    // Yango Dispatch countdown popup
    const [incomingDispatch, setIncomingDispatch] = useState<any>(null);
    const [countdownSeconds, setCountdownSeconds] = useState(20);
    
    // Muchacho e' Mandado Bids State
    const [mandadoBids, setMandadoBids] = useState<{ [reqId: string]: { amount: string; eta: string; submitted: boolean } }>({});
    
    // Helper to get the current active item for calling
    const currentActiveItem = activeTransport || activeOrder;

    // Suspension check: debt >= $15, suspended status, or deadline expired
    const isSuspended = Boolean(
        driverProfile?.commission_status === 'suspended' || 
        Number(driverProfile?.commission_debt || 0) >= 15 || 
        (driverProfile?.next_commission_deadline && new Date(driverProfile.next_commission_deadline).getTime() < Date.now())
    );

    const getCommissionForCategory = (categoryOrType: string) => {
        const cat = (categoryOrType || '').toLowerCase();
        if (cat.includes('confort') || cat.includes('ejecutivo')) return 1.20;
        if (cat.includes('mandado')) return 0.70;
        if (cat.includes('delivery') || cat.includes('envio') || cat.includes('paquete')) return 0.50;
        if (cat.includes('moto')) return 0.50;
        return 0.80; // Taxi Driver
    };

    // 1. Fetch Driver Profile for vehicleType
    useEffect(() => {
        if (!user) return;

        const fetchProfile = async () => {
            try {
                const profile = await driversApi.getDriver(user.uid);
                setDriverProfile(profile);
            } catch (err) {
                console.error("Error fetching radar profile:", err);
            }
        };

        fetchProfile();

        const channel = supabase.channel('radar_profile_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'drivers',
                    filter: `id=eq.${user.uid}`
                },
                (payload) => {
                    setDriverProfile(payload.new);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    // 2. Escuchar órdenes de delivery y transporte activo (Supabase)
    useEffect(() => {
        if (!user) return;

        let activeOrderChannel: any;
        let activeTransportChannel: any;
        let availableOrdersChannel: any;

        const fetchActiveOrder = async () => {
            const { data } = await supabase
                .from('orders')
                .select('*')
                .or(`delivery_driver_id.eq.${user.uid},deliveryDriverId.eq.${user.uid}`)
                .in('status', ['en_camino', 'in_transit'])
                .limit(1);
            if (data && data.length > 0) {
                setActiveOrder(data[0]);
            } else {
                setActiveOrder(null);
            }
        };

        const fetchActiveTransport = async () => {
            const { data } = await supabase
                .from('transport_requests')
                .select('*')
                .or(`driver_id.eq.${user.uid},driverId.eq.${user.uid}`)
                .in('status', ['accepted', 'arriving', 'in_progress']);
            
            if (data && data.length > 0) {
                const mainActive = data.find((req: any) => !req.scheduled || req.status === 'arriving' || req.status === 'in_progress');
                setActiveTransport(mainActive || null);
                
                const pendingReservations = data.filter((req: any) => req.scheduled && req.status === 'accepted');
                setMyReservations(pendingReservations);
            } else {
                setActiveTransport(null);
                setMyReservations([]);
            }
        };

        const fetchAvailableOrders = async () => {
            const { data } = await supabase
                .from('orders')
                .select('*')
                .eq('status', 'buscando_piloto');
            
            if (data) {
                const available = data.filter((order: any) => {
                    const eligible = order.eligible_drivers || order.eligibleDrivers;
                    if (!eligible || !Array.isArray(eligible) || eligible.length === 0) return true;
                    return eligible.includes(user.uid);
                });
                setAvailableOrders(available);
            } else {
                setAvailableOrders([]);
            }
        };

        fetchActiveOrder();
        fetchActiveTransport();
        fetchAvailableOrders();

        activeOrderChannel = supabase.channel('active_order_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchActiveOrder)
            .subscribe();

        activeTransportChannel = supabase.channel('active_transport_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, fetchActiveTransport)
            .subscribe();

        availableOrdersChannel = supabase.channel('available_orders_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `status=eq.buscando_piloto` }, fetchAvailableOrders)
            .subscribe();

        return () => {
            if (activeOrderChannel) supabase.removeChannel(activeOrderChannel);
            if (activeTransportChannel) supabase.removeChannel(activeTransportChannel);
            if (availableOrdersChannel) supabase.removeChannel(availableOrdersChannel);
        };
    }, [user, driverProfile]);

    // 3. Escuchar viajes disponibles filtrados por vehicleType
    useEffect(() => {
        let channel: any;

        const fetchAvailableTransport = async () => {
            const { data } = await supabase
                .from('transport_requests')
                .select('*')
                .eq('status', 'searching');
            
            if (data) {
                const drvVehicle = (driverProfile?.vehicle_type || driverProfile?.vehicleType || 'moto').toLowerCase();
                const reqs = data.filter((req: any) => {
                    const reqType = req.type || 'transport';
                    if (reqType === 'food_delivery' || reqType === 'package_delivery') return true;
                    const reqVehicle = (req.vehicle_type || req.vehicleType || 'moto').toLowerCase();
                    if (reqVehicle === drvVehicle) return true;
                    if (drvVehicle === 'carro' && reqVehicle === 'moto') return true;
                    if (drvVehicle === 'carro_ejecutivo' || drvVehicle === 'ejecutivo') return true;
                    return false;
                });
                setAvailableTransport(reqs);
            }
            setLoading(false);
        };

        fetchAvailableTransport();

        channel = supabase.channel('available_transport_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: `status=eq.searching` }, fetchAvailableTransport)
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [driverProfile]);

    // 3.1 Listen for incoming in-app calls when driver has an active transport
    useEffect(() => {
        if (!activeTransport?.id || !user) return;
        const channel = supabase.channel(`call_${activeTransport.id}`, {
            config: { broadcast: { self: false } }
        });

        channel
            .on('broadcast', { event: 'signal' }, ({ payload }) => {
                if (payload?.type === 'offer' && payload.from !== user.uid) {
                    setShowIncomingCall(true);
                } else if (payload?.type === 'status' && payload.status === 'ended') {
                    setShowIncomingCall(false);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeTransport?.id, user]);


    // 3.1 Alerta sonora y modal de despacho cuando llega un nuevo viaje o pedido
    const lastAvailableCount = React.useRef(0);
    useEffect(() => {
        const currentCount = availableOrders.length + availableTransport.length;
        
        if (currentCount > lastAvailableCount.current) {
            // Solo sonar si no hay órdenes activas
            if (notificationSoundUrl.current) {
                const audio = new Audio(notificationSoundUrl.current);
                audio.play().catch(e => console.error("Error playing notification sound:", e));
            }
            
            toast.success('¡Nueva solicitud disponible en el radar!', {
                icon: '🚀',
                duration: 5000,
                style: {
                    borderRadius: '1.25rem',
                    background: '#fefce8',
                    color: '#854d0e',
                    border: '1px solid #fef08a'
                }
            });

            // Activar modal de despacho estilo YANGO si no estamos en viaje activo ni suspendidos
            if (!activeOrder && !activeTransport && !isSuspended) {
                const newest = availableTransport[0] || availableOrders[0];
                if (newest) {
                    setIncomingDispatch(newest);
                }
            }
        }
        
        lastAvailableCount.current = currentCount;
    }, [availableOrders, availableTransport, activeOrder, activeTransport, isSuspended]);

    // 3.2 Temporizador de cuenta regresiva de 20s para el despacho YANGO
    useEffect(() => {
        if (!incomingDispatch) return;
        setCountdownSeconds(20);
        const timer = setInterval(() => {
            setCountdownSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setIncomingDispatch(null);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [incomingDispatch]);

    // 5. Escuchar último feedback (calificación)
    useEffect(() => {
        if (!user) return;

        let channel: any;

        const fetchFeedback = async () => {
            const { data } = await supabase
                .from('transport_requests')
                .select('*')
                .or(`driver_id.eq.${user.uid},driverId.eq.${user.uid}`)
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (data && data.length > 0 && data[0].rating) {
                setLatestFeedback(data[0]);
            }
        };

        fetchFeedback();

        channel = supabase.channel('feedback_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, fetchFeedback)
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [user]);

    // 4. Geolocalización constante si el conductor está en línea o en viaje activo
    useEffect(() => {
        if (!user) return;
        const isOnline = driverProfile?.is_online ?? driverProfile?.isOnline ?? true;
        if (!isOnline && !activeOrder && !activeTransport) return;

        const reportLocation = () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude, heading, speed } = position.coords;
                        updateDriverLocation(user.uid, latitude, longitude, heading || undefined, speed || undefined);
                    },
                    (err) => console.warn("Aviso obteniendo ubicación GPS del piloto:", err.message),
                    { enableHighAccuracy: true, maximumAge: 10000, timeout: 8000 }
                );
            }
        };

        // Reportar de inmediato al conectar
        reportLocation();

        // Actualizar cada 30 segundos mientras esté conectado
        const locInterval = setInterval(reportLocation, 30000);

        return () => clearInterval(locInterval);
    }, [user, driverProfile?.is_online, driverProfile?.isOnline, activeOrder, activeTransport]);

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

        let channel: any;

        const fetchLatestMessage = async () => {
            const { data, error } = await supabase
                .from('order_messages')
                .select('*')
                .eq('order_id', activeTransport.id)
                .order('created_at', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                const latestMsg = data[0];
                
                // Si es un mensaje nuevo y no es mío
                if (lastChatIdSeen.current !== null && 
                    lastChatIdSeen.current !== latestMsg.id && 
                    latestMsg.user_id !== user.uid) {
                    
                    const now = Date.now();
                    const msgTime = new Date(latestMsg.created_at).getTime();
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
                                    {latestMsg.message || "Ha enviado un archivo o ubicación"}
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
        };

        fetchLatestMessage();

        channel = supabase.channel('order_messages_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_messages', filter: `order_id=eq.${activeTransport.id}` }, fetchLatestMessage)
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [activeTransport, user, showChat]);

    useEffect(() => {
        if (showChat) {
            setUnreadChatCount(0);
        }
    }, [showChat]);

    const [processingAction, setProcessingAction] = useState<string | null>(null);

    // --- ACCIONES DE COMIDA (Supabase) ---
    const handleAcceptOrder = async (orderId: string) => {
        if (!user || activeOrder || activeTransport || processingAction) return;
        if (isSuspended) {
            toast.error("Tu cuenta está suspendida por comisiones pendientes ($15+ o plazo vencido). Ve a Ganancias para liquidar.");
            return;
        }
        setProcessingAction(orderId);
        try {
            const { data, error } = await supabase
                .from('orders')
                .update({ 
                    status: 'en_camino', 
                    delivery_driver_id: user.uid, 
                    driver_assigned_at: new Date().toISOString() 
                })
                .eq('id', orderId)
                .eq('status', 'buscando_piloto')
                .is('delivery_driver_id', null)
                .select();
                
            if (error || !data || data.length === 0) {
                throw new Error("ALREADY_TAKEN");
            }
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
            await supabase.from('orders').update({ status: 'in_transit' }).eq('id', activeOrder.id);
        } finally {
            setProcessingAction(null);
        }
    };

    const handleMarkDelivered = async () => {
        if (!activeOrder || processingAction) return;
        setProcessingAction('delivered');
        try {
            let durationSeconds = 0;
            const assignedTime = activeOrder.driver_assigned_at || activeOrder.driverAssignedAt;
            if (assignedTime) {
                const start = new Date(assignedTime).getTime();
                durationSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
            }

            await supabase.from('orders').update({
                status: 'delivered',
                delivered_at: new Date().toISOString(),
                total_service_duration: durationSeconds
            }).eq('id', activeOrder.id);

            // Increment driver total_trips
            try {
                const cur = Number(driverProfile?.total_trips || 0) + 1;
                await supabase.from('drivers').update({ total_trips: cur }).eq('id', user!.uid);
            } catch (e) {}

            if (activeOrder.restaurantId && activeOrder.deliveryFee) {
                const { error: debtErr } = await supabase.rpc('increment_restaurant_debt', {
                  p_restaurant_id: activeOrder.restaurantId,
                  p_amount: activeOrder.deliveryFee
                });
                if(debtErr) console.error("Error updating debt", debtErr);
            }

            if (activeOrder.userId && activeOrder.userId !== 'pos_customer' && !activeOrder.pointsCredited) {
                const pointsToAdd = (activeOrder.total || 0) * 2.5;
                const { error: ptsErr } = await supabase.rpc('increment_user_and_restaurant_points', {
                    p_user_id: activeOrder.userId,
                    p_restaurant_id: activeOrder.restaurantId,
                    p_points: pointsToAdd
                });
                if(ptsErr) console.error("Error updating user points", ptsErr);
                else await supabase.from('orders').update({ points_credited: true }).eq('id', activeOrder.id);
            } else if (activeOrder.userId && activeOrder.deliveryFee) {
                 const pointsToAdd = activeOrder.deliveryFee * 2;
                 await supabase.rpc('increment_user_points', {
                     p_user_id: activeOrder.userId,
                     p_points: pointsToAdd
                 });
            }

            setActiveOrder(null);
        } finally {
            setProcessingAction(null);
        }
    };

    // --- ACCIONES DE TRANSPORTE (TAXI) (Supabase) ---
    const handleAcceptTransport = async (reqId: string) => {
        if (!user || activeOrder || activeTransport || processingAction) return;
        if (isSuspended) {
            toast.error("Tu cuenta está suspendida por comisiones pendientes ($15+ o plazo vencido). Ve a Ganancias para liquidar.");
            return;
        }
        setProcessingAction(reqId);
        try {
            const { data, error } = await supabase
                .from('transport_requests')
                .update({ 
                    status: 'accepted', 
                    driver_id: user.uid, 
                    driver_assigned_at: new Date().toISOString() 
                })
                .eq('id', reqId)
                .eq('status', 'searching')
                .select();
                
            if (error || !data || data.length === 0) {
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
            let durationSeconds = 0;
            const assignedTime = activeTransport.driver_assigned_at || activeTransport.driverAssignedAt;
            if (assignedTime) {
                const start = new Date(assignedTime).getTime();
                durationSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
            }

            await supabase.from('transport_requests').update({ 
                status: 'arriving', 
                driver_arrived_at: new Date().toISOString(),
                arrival_duration: durationSeconds
            }).eq('id', activeTransport.id);
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportStart = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('start');
        try {
            await supabase.from('transport_requests').update({ status: 'in_progress' }).eq('id', activeTransport.id);
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportComplete = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('complete');
        try {
            // Flat commission debiting
            const cat = activeTransport.service_category || activeTransport.vehicle_type || 'mototaxi';
            let comm = Number(activeTransport.commission_amount || 0);
            if (!comm) {
                comm = getCommissionForCategory(cat);
            }

            await supabase.from('transport_requests').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                commission_amount: comm,
                commission_debited: true
            }).eq('id', activeTransport.id);

            // Increment driver total_trips & debit commission_debt
            try {
                const cur = Number(driverProfile?.total_trips || 0) + 1;
                const curDebt = Number(driverProfile?.commission_debt || 0);
                const newDebt = parseFloat((curDebt + comm).toFixed(2));
                await supabase.from('drivers').update({
                    total_trips: cur,
                    commission_debt: newDebt
                }).eq('id', user!.uid);
            } catch (e) {
                console.error("Error updating driver commission debt:", e);
            }

            if (activeTransport.type === 'food_delivery' && activeTransport.id) {
                try {
                    await supabase.from('orders').update({
                        status: 'delivered',
                        delivered_at: new Date().toISOString()
                    }).eq('id', activeTransport.id);
                } catch (orderError) {
                    console.error("Error al actualizar estado de orden:", orderError);
                }
            }

            // Puntos
            if (activeTransport.userId && activeTransport.price) {
                const pointsToAdd = activeTransport.price * 2.5;
                if (activeTransport.type === 'food_delivery' && activeTransport.restaurantId) {
                    await supabase.rpc('increment_user_and_restaurant_points', {
                        p_user_id: activeTransport.userId,
                        p_restaurant_id: activeTransport.restaurantId,
                        p_points: pointsToAdd
                    });
                } else {
                    await supabase.rpc('increment_user_points', {
                        p_user_id: activeTransport.userId,
                        p_points: pointsToAdd
                    });
                }
            }

            setActiveTransport(null);
            toast.success(`Viaje completado. Comisión Un 2x3 debitada: $${comm.toFixed(2)} USD.`);
        } finally {
            setProcessingAction(null);
        }
    };

    // Puja / Oferta para Muchacho e' Mandado
    const handleSendMandadoBid = async (reqId: string) => {
        if (!user || processingAction) return;
        if (isSuspended) {
            toast.error("Tu cuenta está suspendida por comisiones pendientes ($15+ o plazo vencido). Ve a Ganancias para liquidar.");
            return;
        }
        const bidInfo = mandadoBids[reqId];
        const amount = Number(bidInfo?.amount || 0);
        const eta = Number(bidInfo?.eta || 15);

        if (isNaN(amount) || amount < 1.00) {
            toast.error("La tarifa mínima de puja es de $1.00 USD");
            return;
        }

        setProcessingAction(`bid_${reqId}`);
        try {
            const bidId = crypto.randomUUID();
            const { error } = await supabase.from('transport_bids').insert({
                id: bidId,
                transport_request_id: reqId,
                driver_id: user.uid,
                driver_name: driverProfile?.displayName || driverProfile?.name || 'Conductor',
                driver_photo: driverProfile?.photoURL || driverProfile?.avatar_url || null,
                driver_phone: driverProfile?.phone || null,
                vehicle_type: driverProfile?.vehicle_type || driverProfile?.vehicleType || 'moto',
                vehicle_plate: driverProfile?.vehicle_plate || driverProfile?.plate || '',
                vehicle_model: driverProfile?.vehicle_model || driverProfile?.model || '',
                driver_rating: driverProfile?.rating || 5.0,
                amount: amount,
                eta_minutes: eta,
                status: 'pending'
            });

            if (error) throw error;

            setMandadoBids(prev => ({
                ...prev,
                [reqId]: { ...prev[reqId], submitted: true }
            }));
            toast.success(`¡Puja de $${amount.toFixed(2)} USD enviada al cliente!`);
        } catch (err: any) {
            console.error("Error enviando puja de mandado:", err);
            toast.error("No se pudo enviar la oferta. Revisa tu conexión.");
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
            {/* Incoming in-app call from user */}
            {showIncomingCall && activeTransport && (
                <InAppCall
                    requestId={activeTransport.id}
                    myId={user!.uid}
                    remoteId={activeTransport.userId}
                    remoteDisplayName={activeTransport.userName || 'Pasajero'}
                    role="receiver"
                    onClose={() => setShowIncomingCall(false)}
                />
            )}
            {/* Outgoing in-app call from driver */}
            {showOutgoingCall && currentActiveItem && (
                <InAppCall
                    requestId={currentActiveItem.id}
                    myId={user!.uid}
                    remoteId={currentActiveItem.userId}
                    remoteDisplayName={currentActiveItem.userName || 'Pasajero'}
                    role="caller"
                    onClose={() => setShowOutgoingCall(false)}
                />
            )}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
                <div className="bg-primary/5 border border-primary/10 p-5 rounded-[2.5rem] mb-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-slate-900">
                        {activeTransport.type === 'package_delivery' ? <Package className="w-6 h-6 animate-pulse" /> : <Navigation className="w-6 h-6 animate-pulse" />}
                    </div>
                    <div>
                        <div className="text-slate-900 font-black text-sm uppercase tracking-wider">
                            {activeTransport.type === 'package_delivery' ? 'Entrega de Paquete' : 'Viaje en Curso'}
                        </div>
                        <p className="text-slate-500 text-[10px] font-bold">
                            {activeTransport.type === 'package_delivery' ? 'Lleva el paquete a su destino de forma segura.' : 'Lleva al pasajero de forma segura.'}
                        </p>
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

                    {(activeTransport.status === 'accepted' || activeTransport.status === 'arriving') && (activeTransport.driver_assigned_at || activeTransport.driverAssignedAt) && (
                        <div className="pt-2">
                            <ServiceTimer 
                                startTime={activeTransport.driver_assigned_at || activeTransport.driverAssignedAt} 
                                mode={activeTransport.status === 'accepted' ? 'countdown' : 'stopwatch'} 
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
                                    <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest">
                                        {activeTransport.type === 'food_delivery' ? 'Pedido a nombre de:' : (activeTransport.type === 'package_delivery' ? 'Remitente:' : 'Pasajero:')}
                                    </h3>
                                    <p className="font-bold text-slate-700 leading-tight mt-0.5">{activeTransport.user_name || activeTransport.userName || 'Pasajero'}</p>
                                    {(activeTransport.user_cedula || activeTransport.userCedula) && (
                                        <div className="text-xs text-slate-500 font-medium mt-0.5 space-y-0.5 pb-2">
                                            <p>C.I: {activeTransport.user_cedula || activeTransport.userCedula}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {(activeTransport.user_phone || activeTransport.userPhone) && (
                                        <a
                                            href={`tel:${activeTransport.user_phone || activeTransport.userPhone}`}
                                            className="w-10 h-10 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
                                            title="Llamada Normal"
                                        >
                                            <Phone className="w-4 h-4" />
                                        </a>
                                    )}
                                    <button
                                        onClick={() => setShowOutgoingCall(true)}
                                        className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100 shadow-sm active:scale-95 transition-all hover:bg-emerald-100"
                                        title="Llamar Pasajero por App"
                                    >
                                        <Phone className="w-4 h-4 fill-emerald-600/20" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="w-px h-8 bg-dashed bg-slate-200 ml-6"></div>

                        {activeTransport.type === 'package_delivery' && (activeTransport.package_description || activeTransport.packageDescription) && (
                            <>
                                <div className="flex gap-4">
                                    <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center shrink-0 border border-yellow-100 shadow-inner">
                                        <Package className="w-6" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xs font-black text-yellow-600 uppercase tracking-widest">Contenido del Paquete:</h3>
                                        <p className="font-bold text-slate-700 leading-tight mt-0.5">{activeTransport.package_description || activeTransport.packageDescription}</p>
                                    </div>
                                </div>
                                <div className="w-px h-8 bg-dashed bg-slate-200 ml-6"></div>
                            </>
                        )}

                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 shadow-inner">
                                {(activeTransport.vehicle_type || activeTransport.vehicleType) === 'moto' ? <Bike className="w-6" /> : <Car className="w-6" />}
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
                        className="fixed inset-0 z-[100] bg-white flex flex-col"
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

    if (activeOrder) {
        return (
            <>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[2.5rem] flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                            <Bike className="w-6 h-6 animate-bounce" />
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

                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-2xl flex gap-3 shadow-inner">
                            <AlertTriangle className="w-8 h-8 text-yellow-500 shrink-0" />
                            <div className="text-sm text-yellow-800 font-medium">
                                <span className="font-bold block mb-0.5">Bolso Especial Requerido</span>
                                Este es un pedido de mercancía. ¡Es importante que cuentes con tu bolso especial para guardar el pedido del cliente!
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100">
                                    <Bike className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recoger en:</h3>
                                    <p className="font-bold text-slate-800 text-lg leading-tight mt-0.5">{activeOrder.restaurantName}</p>
                                    
                                    {activeOrder.restaurantPhone && (
                                        <div className="flex gap-2 mt-3">
                                            <a href={`tel:${activeOrder.restaurantPhone}`} className="flex-1 py-2 bg-slate-100 rounded-xl text-slate-700 font-bold text-xs flex justify-center items-center gap-1 active:scale-95 transition-all">
                                                <Phone className="w-3.5 h-3.5" /> Llamar
                                            </a>
                                            <a href={`https://wa.me/${activeOrder.restaurantPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, soy el piloto de Un 2x3. Estoy en camino a buscar el pedido de ${activeOrder.userName || 'Cliente'}.`)}`} target="_blank" className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs flex justify-center items-center gap-1 active:scale-95 transition-all border border-emerald-100">
                                                <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                                            </a>
                                        </div>
                                    )}

                                    {activeOrder.items && activeOrder.items.length > 0 && (
                                        <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100 shadow-inner">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">Resumen del Pedido</h4>
                                            <ul className="space-y-1.5">
                                                {activeOrder.items.map((item: any, i: number) => (
                                                    <li key={i} className="text-xs font-bold text-slate-700 flex items-start gap-1">
                                                        <span className="text-emerald-600 shrink-0">{item.quantity}x</span> {item.name}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
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
                                        <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest">Pedido a nombre de:</h3>
                                        <p className="font-bold text-slate-700 leading-tight mt-0.5">{activeOrder.userName || 'Cliente Invitado'}</p>
                                        {(activeOrder.userCedula) && (
                                            <div className="text-xs text-slate-500 font-medium mt-0.5 space-y-0.5 pb-2">
                                                {activeOrder.userCedula && <p>C.I: {activeOrder.userCedula}</p>}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setShowOutgoingCall(true)}
                                        className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm active:scale-95 transition-all hover:bg-emerald-100"
                                        title="Llamar Pasajero"
                                    >
                                        <Phone className="w-5 h-5 fill-emerald-600/20" />
                                    </button>
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

                            <button
                                onClick={() => setShowChat(true)}
                                className="w-full mt-2 bg-emerald-50 text-emerald-700 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-all relative overflow-hidden"
                            >
                                <MessageSquare className="w-5 h-5" /> 
                                Ver Chat con Cliente
                                {unreadChatCount > 0 && (
                                    <motion.div 
                                        initial={{ scale: 0 }} 
                                        animate={{ scale: 1 }} 
                                        className="absolute top-3 right-4 bg-primary text-slate-900 text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-emerald-50 shadow-sm"
                                    >
                                        {unreadChatCount}
                                    </motion.div>
                                )}
                            </button>


                            
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

                {/* Modal de Chat Integrado para Comida */}
                <AnimatePresence>
                    {showChat && (
                        <motion.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            className="fixed inset-0 z-[100] bg-white flex flex-col"
                        >
                            <div className="flex-1 flex flex-col pt-4">
                                <div className="px-4 pb-4 flex items-center justify-between">
                                    <button 
                                        onClick={() => setShowChat(false)}
                                        className="w-10 h-10 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-500 active:scale-90 transition-all"
                                    >
                                        <ArrowLeft className="w-6 h-6" />
                                    </button>
                                    <div className="text-center">
                                        <h3 className="font-black text-slate-900 leading-none">Chat de Entrega</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">Orden #{activeOrder.id.slice(-5).toUpperCase()}</p>
                                    </div>
                                    <div className="w-10 h-10"></div>
                                </div>
                                <div className="flex-1">
                                    <OrderChatWindow
                                        orderId={activeOrder.id}
                                        currentUserRole="delivery"
                                        currentUserId={user?.uid || ''}
                                        currentUserName={driverProfile?.displayName || 'Repartidor'}
                                        restaurantId={activeOrder.restaurantId}
                                        orderInfo={activeOrder}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </>
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

            {/* Banner de Suspensión por Deuda de Comisiones */}
            {isSuspended && (
                <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-5 rounded-[2.5rem] shadow-xl shadow-red-500/20 border border-red-400/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h4 className="font-black text-base leading-tight">Radar Bloqueado por Saldo Pendiente</h4>
                            <p className="text-xs text-red-100 font-medium mt-0.5">
                                Deuda de comisiones: <strong className="text-white">${Number(driverProfile?.commission_debt || 0).toFixed(2)} USD</strong>
                                {driverProfile?.next_commission_deadline && (
                                    <span> • Vencimiento: {new Date(driverProfile.next_commission_deadline).toLocaleDateString()}</span>
                                )}
                            </p>
                            <p className="text-[11px] text-red-200 mt-0.5">
                                Límite máximo: $15.00 USD o 15 días continuos sin liquidar.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/delivery/earnings')}
                        className="w-full sm:w-auto px-5 py-3 bg-white text-red-700 font-black rounded-xl text-xs uppercase tracking-wider shadow-md hover:bg-red-50 active:scale-95 transition-all shrink-0"
                    >
                        Pagar Comisiones Ahora
                    </button>
                </div>
            )}

            {/* Modal de Despacho Automático estilo Yango Pro */}
            <AnimatePresence>
                {incomingDispatch && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 50, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.9, y: 50, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                            className="bg-slate-950 text-white w-full max-w-md rounded-[2.5rem] p-6 shadow-2xl border border-slate-800 relative overflow-hidden flex flex-col gap-4"
                        >
                            {/* Barra de progreso de tiempo 20s */}
                            <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-800 overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-1000 ease-linear"
                                    style={{ width: `${(countdownSeconds / 20) * 100}%` }}
                                />
                            </div>

                            {/* Encabezado con tipo de viaje y temporizador */}
                            <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center gap-2 px-3 py-1 bg-amber-400/10 border border-amber-400/30 text-amber-400 rounded-full text-[11px] font-black uppercase tracking-wider">
                                    {incomingDispatch.restaurantName ? (
                                        <><Bike className="w-3.5 h-3.5" /> Reparto de Comida</>
                                    ) : (incomingDispatch.service_category === 'mandado' || incomingDispatch.type === 'muchacho_mandado') ? (
                                        <><Package className="w-3.5 h-3.5" /> Muchacho e' Mandado</>
                                    ) : incomingDispatch.type === 'package_delivery' ? (
                                        <><Package className="w-3.5 h-3.5" /> Envío de Paquete</>
                                    ) : (incomingDispatch.vehicleType === 'moto' || incomingDispatch.vehicle_type === 'moto') ? (
                                        <><Bike className="w-3.5 h-3.5" /> Taxi Moto</>
                                    ) : (
                                        <><Car className="w-3.5 h-3.5" /> Taxi Confort</>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 px-3 py-1 bg-slate-800 rounded-full text-xs font-black text-amber-400 border border-slate-700">
                                    <Clock className="w-3.5 h-3.5 animate-spin" />
                                    <span>{countdownSeconds}s</span>
                                </div>
                            </div>

                            {/* Ganancia Bruta, Comisión Un 2x3 y Neto */}
                            {(() => {
                                const gross = Number(
                                    incomingDispatch.driverPayout ||
                                    incomingDispatch.deliveryFee ||
                                    incomingDispatch.price ||
                                    0
                                );
                                const catKey = incomingDispatch.service_category || incomingDispatch.serviceCategory || incomingDispatch.vehicle_type || incomingDispatch.vehicleType || (incomingDispatch.restaurantName ? 'delivery' : 'mototaxi');
                                const platformComm = Number(incomingDispatch.commission_amount || getCommissionForCategory(catKey));
                                const net = Math.max(0, gross - platformComm);
                                const originGps = incomingDispatch.restaurantName || incomingDispatch.origin?.address || incomingDispatch.originAddress || '';
                                const destGps = incomingDispatch.shippingAddress?.address || incomingDispatch.destination?.address || incomingDispatch.destinationAddress || '';
                                const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originGps)}&destination=${encodeURIComponent(destGps)}`;

                                return (
                                    <div className="space-y-3">
                                        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 rounded-3xl p-5 border border-amber-500/20 shadow-inner">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-400/90">Ganancia Bruta</span>
                                                    <div className="text-4xl font-black text-amber-400">
                                                        ${gross.toFixed(2)}
                                                    </div>
                                                </div>
                                                {bcvRate > 0 && (
                                                    <div className="text-right">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tasa BCV</span>
                                                        <div className="text-sm font-black text-slate-200">
                                                            Bs. {(gross * bcvRate).toFixed(2)}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                                                <span className="text-slate-400 font-medium flex items-center gap-1">
                                                    Tarifa Un 2x3: <strong className="text-rose-400 font-bold">-${platformComm.toFixed(2)}</strong>
                                                </span>
                                                <span className="text-emerald-400 font-black bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl">
                                                    Neto libre: ${net.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Chip informativo de fecha límite de corte */}
                                        {driverProfile?.next_commission_deadline && (
                                            <div className="flex items-center justify-between text-[11px] bg-slate-900/90 px-3.5 py-2 rounded-2xl border border-slate-800 text-slate-400">
                                                <span className="flex items-center gap-1.5 font-bold">
                                                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                                                    Corte de comisiones:
                                                </span>
                                                <span className="font-black text-amber-400">
                                                    {Math.max(0, Math.ceil((new Date(driverProfile.next_commission_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} días restantes (Deuda: ${Number(driverProfile.commission_debt || 0).toFixed(2)})
                                                </span>
                                            </div>
                                        )}

                                        {/* Ruta: Origen y Destino */}
                                        <div className="space-y-3 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                                            <div className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-black text-xs border border-emerald-500/30">
                                                    A
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                                        {incomingDispatch.restaurantName ? 'Restaurante / Origen' : 'Punto de Recogida'}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-200 truncate">
                                                        {originGps || 'Ubicación de partida'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="ml-3 border-l-2 border-dashed border-slate-700 h-3"></div>

                                            <div className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 font-black text-xs border border-amber-500/30">
                                                    B
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Destino</p>
                                                    <p className="text-xs font-bold text-slate-200 truncate">
                                                        {destGps || 'Ubicación de destino'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Botón de Navegación 1-Tap Google Maps */}
                                        <a
                                            href={mapsUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="w-full bg-slate-900 hover:bg-slate-800 active:scale-98 text-slate-300 font-bold py-3 px-4 rounded-2xl border border-slate-700/80 flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all"
                                        >
                                            <Navigation className="w-4 h-4 text-emerald-400" />
                                            Abrir GPS en Google Maps
                                            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                                        </a>
                                    </div>
                                );
                            })()}

                            {/* Botones de Acción */}
                            <div className="pt-2 flex flex-col gap-2">
                                <button
                                    onClick={() => {
                                        const isOrder = Boolean(incomingDispatch.restaurantName || incomingDispatch.shippingAddress);
                                        const id = incomingDispatch.id;
                                        setIncomingDispatch(null);
                                        if (isOrder) {
                                            handleAcceptOrder(id);
                                        } else {
                                            handleAcceptTransport(id);
                                        }
                                    }}
                                    className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-amber-400/20 active:scale-95 transition-all text-base uppercase tracking-wider flex items-center justify-center gap-2"
                                >
                                    <Sparkles className="w-5 h-5" />
                                    {incomingDispatch.restaurantName ? 'Aceptar Reparto' : 'Aceptar Viaje'}
                                </button>
                                <button
                                    onClick={() => setIncomingDispatch(null)}
                                    className="w-full py-2.5 text-slate-400 hover:text-slate-200 font-bold text-xs uppercase tracking-wider text-center active:scale-95 transition-all"
                                >
                                    Rechazar / Omitir
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                                            ) : req.scheduledAt ? (
                                                <>Para: {new Date(req.scheduledAt).toLocaleString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</>
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
                        {availableTransport.map(req => {
                            const isMandado = req.service_category === 'mandado' || req.service_category === 'muchacho_mandado' || req.type === 'muchacho_mandado';
                            const bidData = mandadoBids[req.id] || { amount: '', eta: '15', submitted: false };
                            const bidAmountNum = parseFloat(bidData.amount) || 0;
                            const commMandado = 0.70;
                            const netMandado = Math.max(0, bidAmountNum - commMandado);

                            if (isMandado) {
                                return (
                                    <motion.div
                                        key={req.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="bg-gradient-to-b from-amber-50/80 via-white to-white rounded-[2.5rem] p-6 shadow-xl shadow-amber-500/10 border-2 border-amber-300 relative overflow-hidden"
                                    >
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-400 text-slate-950 rounded-full text-[10px] font-black uppercase tracking-wider shadow-md shadow-amber-400/20">
                                                <Package className="w-3.5 h-3.5" />
                                                Muchacho e' Mandado
                                            </div>
                                            <div className="text-xs font-black uppercase px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full border border-amber-200">
                                                Puja Abierta
                                            </div>
                                        </div>

                                        {/* Advertencia Cero Intermediación */}
                                        <div className="bg-amber-100/70 border border-amber-300 rounded-2xl p-3.5 mb-4 text-xs font-bold text-amber-950 flex items-start gap-2.5">
                                            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-black">CERO INTERMEDIACIÓN:</span> No financias compras de mercancía. El cliente le transfiere directo al comercio mediante Pago Móvil. Tú sólo cobras tu tarifa de mandado.
                                            </div>
                                        </div>

                                        {/* Detalle del Encargo / Diligencia */}
                                        <div className="bg-white border border-slate-200 p-4 rounded-2xl mb-4 space-y-2">
                                            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Detalle del Mandado / Encargo:</div>
                                            <p className="text-sm font-bold text-slate-800 leading-snug">
                                                {req.mandado_details?.description || req.packageDescription || req.notes || 'Encargo personalizado solicitado por el cliente.'}
                                            </p>
                                            {req.mandado_details?.storeName && (
                                                <p className="text-xs text-slate-600 font-medium">
                                                    🏪 Comercio/Lugar: <span className="font-bold text-slate-800">{req.mandado_details.storeName}</span>
                                                </p>
                                            )}
                                        </div>

                                        {/* Direcciones */}
                                        <div className="space-y-3 mb-5">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center shrink-0 text-xs font-black">
                                                    1
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Retiro / Compra:</p>
                                                    <p className="text-xs font-bold text-slate-800 truncate">{req.origin?.address || 'Punto de partida'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shrink-0 text-xs font-black">
                                                    2
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Entrega al Cliente:</p>
                                                    <p className="text-xs font-bold text-slate-800 truncate">{req.destination?.address || 'Destino final'}</p>
                                                    <p className="text-[11px] text-slate-500 font-medium">{req.userName} {req.userCedula ? `(C.I: ${req.userCedula})` : ''}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Formulario de Puja */}
                                        {bidData.submitted ? (
                                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                                                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                                                <p className="text-xs font-black text-emerald-900 uppercase tracking-wider">¡Oferta enviada al cliente!</p>
                                                <p className="text-sm font-bold text-emerald-700 mt-0.5">
                                                    Tu puja: ${Number(bidData.amount).toFixed(2)} USD • ETA: {bidData.eta} min
                                                </p>
                                                <p className="text-[11px] text-emerald-600/80 mt-1">
                                                    El cliente está revisando las propuestas en su radar.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                                                            Tu Tarifa ($ USD)
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-2.5 text-slate-400 font-black text-sm">$</span>
                                                            <input
                                                                type="number"
                                                                min="1.00"
                                                                step="0.25"
                                                                placeholder="Min 1.00"
                                                                value={bidData.amount}
                                                                onChange={(e) => setMandadoBids(prev => ({
                                                                    ...prev,
                                                                    [req.id]: { ...bidData, amount: e.target.value }
                                                                }))}
                                                                className="w-full pl-7 pr-3 py-2 bg-white rounded-xl border border-slate-300 text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                                                            Tiempo de llegada
                                                        </label>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                min="5"
                                                                step="5"
                                                                placeholder="15"
                                                                value={bidData.eta}
                                                                onChange={(e) => setMandadoBids(prev => ({
                                                                    ...prev,
                                                                    [req.id]: { ...bidData, eta: e.target.value }
                                                                }))}
                                                                className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                            />
                                                            <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-xs">min</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Desglose de comisión */}
                                                {bidAmountNum >= 1.00 && (
                                                    <div className="text-[11px] bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                                                        <span className="text-slate-500">Comisión fija Un 2x3: <strong className="text-rose-500">-$0.70</strong></span>
                                                        <span className="font-black text-emerald-600">Neto para ti: ${netMandado.toFixed(2)} USD</span>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => handleSendMandadoBid(req.id)}
                                                    disabled={processingAction === `bid_${req.id}` || !bidData.amount || Number(bidData.amount) < 1}
                                                    className="w-full bg-slate-900 hover:bg-slate-800 active:scale-98 text-amber-400 font-black py-3.5 rounded-xl shadow-lg shadow-slate-900/10 text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                                                >
                                                    {processingAction === `bid_${req.id}` ? (
                                                        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                                                    ) : (
                                                        <>
                                                            <Send className="w-4 h-4" />
                                                            Enviar Oferta / Puja al Cliente
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            }

                            return (
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
                                            {req.type === 'food_delivery' ? <Bike className="w-3.5 h-3.5" /> : (req.type === 'package_delivery' ? <Package className="w-3.5 h-3.5" /> : (req.vehicleType === 'moto' ? <Bike className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />))}
                                            {req.scheduled ? 'VIAJE PROGRAMADO' : (req.type === 'food_delivery' ? 'REPARTO COMIDA' : (req.type === 'package_delivery' ? 'SOLICITUD ENVIO PAQUETE' : 'SOLICITUD TAXI'))}
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
                                                        : req.scheduledAt
                                                            ? new Date(req.scheduledAt).toLocaleString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
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
                                                    {req.userCedula && (
                                                        <span className="text-xs text-slate-500 font-medium">
                                                            C.I: {req.userCedula}
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Destino:</p>
                                                <p className="font-bold text-slate-700 leading-tight mt-0.5 line-clamp-2">{req.destination?.address}</p>
                                                {req.type === 'package_delivery' && req.packageDescription && (
                                                    <>
                                                        <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest mt-2">Paquete:</p>
                                                        <p className="font-bold text-slate-700 leading-tight mt-0.5 line-clamp-2">{req.packageDescription}</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-2 grid gap-3">
                                        <a
                                            href={`https://www.google.com/maps/dir/?api=1&waypoints=${encodeURIComponent(req.origin?.address || '')}&destination=${encodeURIComponent(req.destination?.address || '')}`}
                                            target="_blank"
                                            className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-all"
                                        >
                                            <Navigation className="w-5 h-5" /> Ver GPS
                                        </a>
                                        <button
                                            onClick={() => handleAcceptTransport(req.id)}
                                            disabled={processingAction !== null}
                                            className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-70 group-hover:shadow-primary/40"
                                        >
                                            {processingAction === req.id ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'ACEPTAR VIAJE'}
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}

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
                                        <Bike className="w-3.5 h-3.5" />
                                        REPARTO COMIDA
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="text-2xl font-black text-emerald-600">${(order.driverPayout || order.deliveryFee || 0).toFixed(2)}</div>
                                        <div className="text-[10px] font-black text-primary uppercase mt-0.5 tracking-wider">Ganancia</div>
                                    </div>
                                </div>

                                <div className="space-y-4 mb-8 relative">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100">
                                            <Bike className="w-5 h-5" />
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

                                <div className="pt-2 grid gap-3">
                                    <a
                                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.shippingAddress?.address || '')}`}
                                        target="_blank"
                                        className="w-full bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-all"
                                    >
                                        <Navigation className="w-5 h-5" /> Ver GPS
                                    </a>
                                    <button
                                        onClick={() => handleAcceptOrder(order.id)}
                                        disabled={processingAction !== null}
                                        className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-70 group-hover:bg-primary"
                                    >
                                        {processingAction === order.id ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'TOMAR REPARTO'}
                                    </button>
                                </div>
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
