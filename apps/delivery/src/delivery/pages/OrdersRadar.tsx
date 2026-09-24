import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Car, Bike, MapPin, Navigation, Phone, CheckCircle2, MessageSquare, Send, User as UserIcon, Star, MessageCircle, Clock, AlertTriangle, ArrowLeft, Package, Sparkles, DollarSign, ShieldAlert, ExternalLink, Volume2, X, Receipt, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import RideChat from '../../components/RideChat';
import OrderChatWindow from '../../components/chat/OrderChatWindow';
import ServiceTimer from '../components/ServiceTimer';
import AudioNotePlayer from '../../components/AudioNotePlayer';
import { getCachedAudioUrl, NOTIFICATION_SOUND_URL } from '../../hooks/useGlobalAudioAlerts';
import { updateDriverLocation } from '../../lib/delivery-service';
import { calculateDistance } from '../../lib/geo';
import InAppCall from '../../components/InAppCall';
import LiveTripMap from '../../components/LiveTripMap';
import { playChatChime, playCallAlertChime } from '../../utils/audioChimes';
import { supabase } from '../../lib/supabase';
import { driversApi } from '../../lib/api';
import { vibrate } from '../../utils/haptics';

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
    const prevActiveTransportId = React.useRef<string | null>(null);
    // Incoming in-app call state
    const [showIncomingCall, setShowIncomingCall] = useState(false);
    const [incomingOffer, setIncomingOffer] = useState<any>(null);
    // Outgoing in-app call state
    const [showOutgoingCall, setShowOutgoingCall] = useState(false);
    // Live Map & GPS state
    const [isDriverMapExpanded, setIsDriverMapExpanded] = useState(false);
    const [driverGps, setDriverGps] = useState<{ lat: number; lng: number } | null>(null);
    // Yango Dispatch countdown popup
    const [incomingDispatch, setIncomingDispatch] = useState<any>(null);
    const [countdownSeconds, setCountdownSeconds] = useState(20);
    const [previewProofUrl, setPreviewProofUrl] = useState<string | null>(null);
    
    // Consejos y Anuncios Dinámicos del Radar
    const [radarTips, setRadarTips] = useState<string[]>([
        "💡 Mantén la app abierta en primer plano con volumen alto para recibir y escuchar alertas al instante.",
        "🛵 Conduce seguro: Usa siempre tu casco abrochado, chaleco reflectivo y respeta las leyes de tránsito.",
        "⭐ Un saludo cordial y verificar el paquete aseguran excelentes propinas y una calificación de 5 estrellas.",
        "📍 Sitúate cerca de zonas comerciales y gastronómicas para captar pedidos mucho más rápido.",
        "🔋 Mantén tu teléfono con cargador y conexión de datos estable para no perder ningún viaje."
    ]);
    const [currentTipIndex, setCurrentTipIndex] = useState(0);

    useEffect(() => {
        const fetchTips = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('*')
                    .eq('id', 'delivery_settings')
                    .maybeSingle();
                const settingsData = data?.data || data?.value || data;
                if (settingsData?.driverRadarTips && Array.isArray(settingsData.driverRadarTips) && settingsData.driverRadarTips.length > 0) {
                    setRadarTips(settingsData.driverRadarTips);
                }
            } catch (err) {
                console.error("Error fetching driver radar tips:", err);
            }
        };
        fetchTips();
    }, []);

    useEffect(() => {
        if (radarTips.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentTipIndex((prev) => (prev + 1) % radarTips.length);
        }, 6500);
        return () => clearInterval(interval);
    }, [radarTips.length]);
    
    // Tabs de navegación del centro de mando con persistencia en localStorage y Supabase
    const [activeTab, setActiveTab] = useState<'all' | 'taxis' | 'deliveries' | 'mandados' | 'pending_payments'>(() => {
        try {
            const saved = localStorage.getItem('driver_active_radar_tab');
            if (saved && ['all', 'taxis', 'deliveries', 'mandados', 'pending_payments'].includes(saved)) {
                return saved as any;
            }
        } catch (_) {}
        return 'all';
    });

    const [pendingPayments, setPendingPayments] = useState<any[]>([]);

    const handleSelectTab = (newTab: 'all' | 'taxis' | 'deliveries' | 'mandados' | 'pending_payments') => {
        vibrate(20);
        setActiveTab(newTab);
        try {
            localStorage.setItem('driver_active_radar_tab', newTab);
            const driverId = user?.id || (user as any)?.uid;
            if (driverId) {
                supabase.from('drivers').update({
                    comfort_features: {
                        ...(driverProfile?.comfort_features || {}),
                        last_active_tab: newTab
                    }
                }).eq('id', driverId).then(() => {});
            }
        } catch (_) {}
    };

    // Estado en espera de Muchacho e' Mandao postulados
    const [myPendingBids, setMyPendingBids] = useState<any[]>([]);

    // Muchacho e' Mandado Bids State
    const [mandadoBids, setMandadoBids] = useState<{ [reqId: string]: { amount: string; eta: string; submitted: boolean } }>({});

    // Solicitudes omitidas por este conductor (sesión local, no afecta base de datos ni a otros conductores)
    const [dismissedRequestIds, setDismissedRequestIds] = useState<string[]>(() => {
        try {
            const stored = sessionStorage.getItem('driver_dismissed_requests');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    const handleDismissRequest = async (requestId: string) => {
        vibrate(30);
        setDismissedRequestIds(prev => {
            if (prev.includes(requestId)) return prev;
            const updated = [...prev, requestId];
            try {
                sessionStorage.setItem('driver_dismissed_requests', JSON.stringify(updated));
            } catch (e) {
                console.warn('Error saving dismissed requests:', e);
            }
            return updated;
        });
        if (incomingDispatch?.id === requestId) {
            setIncomingDispatch(null);
        }

        // Si la solicitud era asignada directamente a este chofer, actualizar estado a driver_busy para notificar al cliente de inmediato
        try {
            const targetReq = availableTransport.find(r => r.id === requestId) || (incomingDispatch?.id === requestId ? incomingDispatch : null);
            if (targetReq && (targetReq.assigned_driver_id === user?.uid || targetReq.driver_id === user?.uid)) {
                await supabase.from('transport_requests').update({
                    status: 'driver_busy',
                    rejection_reason: 'El conductor seleccionado se encuentra ocupado llevando a otra persona en este momento.'
                }).eq('id', requestId);
            } else {
                const { data: dbReq } = await supabase.from('transport_requests').select('assigned_driver_id, driver_id, status').eq('id', requestId).maybeSingle();
                if (dbReq && (dbReq.assigned_driver_id === user?.uid || dbReq.driver_id === user?.uid) && dbReq.status === 'searching') {
                    await supabase.from('transport_requests').update({
                        status: 'driver_busy',
                        rejection_reason: 'El conductor seleccionado se encuentra ocupado llevando a otra persona en este momento.'
                    }).eq('id', requestId);
                }
            }
        } catch (e) {
            console.error("Error setting driver_busy on request dismissal:", e);
        }

        toast('Solicitud omitida de tu radar', { icon: '👁️‍🗨️', duration: 2500 });
    };

    const handleRestoreDismissed = () => {
        vibrate(30);
        setDismissedRequestIds([]);
        try {
            sessionStorage.removeItem('driver_dismissed_requests');
        } catch (e) {
            console.warn(e);
        }
        toast.success('Solicitudes omitidas restauradas', { icon: '🔄' });
    };
    
    // Helper to get the current active item for calling
    const currentActiveItem = activeTransport || activeOrder;

    // Límite de servicios simultáneos: Máximo 1 en curso + 1 en cola (2 en total)
    const activeServicesCount = (activeTransport ? 1 : 0) + (activeOrder ? 1 : 0) + myReservations.length;
    const hasReachedServiceLimit = activeServicesCount >= 2;

    // Suspension check: debt >= $15, suspended status, or deadline expired
    const isSuspended = Boolean(
        driverProfile?.commission_status === 'suspended' || 
        Number(driverProfile?.commission_debt || 0) >= 15 || 
        (driverProfile?.next_commission_deadline && new Date(driverProfile.next_commission_deadline).getTime() < Date.now())
    );

    // Driver fares check: Driver must configure rates (>= $0.50) before being enabled/visible to receive trips
    const hasFaresConfigured = Boolean(
        driverProfile?.driver_fares && 
        (Number(driverProfile?.driver_fares?.base_fare_day) >= 0.50 || Number(driverProfile?.driver_fares?.base_fare) >= 0.50)
    );

    // Comisiones sincronizadas en tiempo real desde app_settings (Superadmin)
    const [liveCommissions, setLiveCommissions] = useState<{
        taxi: number;
        mandao: number;
        confort: number;
        delivery: number;
        mototaxi: number;
        extra_km_commission_pct: number;
    }>({
        taxi: 0.80,
        mandao: 0.25,
        confort: 1.00,
        delivery: 0.25,
        mototaxi: 0.25,
        extra_km_commission_pct: 30
    });

    useEffect(() => {
        const fetchCommissions = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('*')
                    .eq('id', 'commission_settings')
                    .maybeSingle();
                const cVal = data?.data || data?.value || data;
                if (cVal?.commissions) {
                    setLiveCommissions({
                        taxi: Number(cVal.commissions.taxi ?? 0.80),
                        mandao: Number(cVal.commissions.mandao ?? 0.25),
                        confort: Number(cVal.commissions.confort ?? 1.00),
                        delivery: Number(cVal.commissions.delivery ?? 0.25),
                        mototaxi: Number(cVal.commissions.mototaxi ?? 0.25),
                        extra_km_commission_pct: Number(cVal.extra_km_commission_pct ?? 30)
                    });
                }
            } catch (err) {
                console.error("Error fetching live commissions:", err);
            }
        };

        fetchCommissions();

        const channel = supabase.channel('radar_commission_settings')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'app_settings',
                filter: 'id=eq.commission_settings'
            }, () => {
                fetchCommissions();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const getCommissionForCategory = (categoryOrType: string) => {
        const cat = (categoryOrType || '').toLowerCase();
        if (cat.includes('confort') || cat.includes('ejecutivo')) return liveCommissions.confort;
        if (cat.includes('mandao') || cat.includes('mandado')) return liveCommissions.mandao;
        if (cat.includes('delivery') || cat.includes('envio') || cat.includes('paquete') || cat.includes('food') || cat.includes('comida')) return liveCommissions.delivery;
        if (cat.includes('moto')) return liveCommissions.mototaxi;
        return liveCommissions.taxi;
    };

    // Escuchar postulaciones pendientes del conductor en tiempo real
    useEffect(() => {
        if (!user) return;
        let channel: any;

        const fetchPendingBids = async () => {
            const { data } = await supabase
                .from('transport_bids')
                .select('*, transport_requests(*)')
                .eq('driver_id', user.uid)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            if (data) {
                setMyPendingBids(data);
            }
        };

        fetchPendingBids();

        channel = supabase.channel(`driver_pending_bids_${user.uid}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'transport_bids',
                filter: `driver_id=eq.${user.uid}`
            }, (payload: any) => {
                fetchPendingBids();
                if (payload.eventType === 'UPDATE' && payload.new?.status === 'accepted') {
                    if (notificationSoundUrl.current) {
                        const audio = new Audio(notificationSoundUrl.current);
                        audio.play().catch(() => {});
                    }
                    toast.success('🎉 ¡El cliente seleccionó tu oferta de mandado! Servicio asignado.', {
                        duration: 6000,
                        icon: '🛍️'
                    });
                }
            })
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [user]);

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

    const fetchActiveTransport = React.useCallback(async () => {
        if (!user) return;
        const driverId = user.id || (user as any).uid;
        const { data } = await supabase
            .from('transport_requests')
            .select('*')
            .eq('driver_id', driverId)
            .in('status', ['accepted', 'arriving', 'in_progress', 'completed'])
            .order('created_at', { ascending: false });
        
        if (data && data.length > 0) {
            // Ongoing trips: accepted, arriving or in_progress (actively driving/waiting)
            const mainActive = data.find((req: any) => 
                !req.scheduled && (req.status === 'accepted' || req.status === 'arriving' || req.status === 'in_progress')
            );

            if (mainActive) {
                if (prevActiveTransportId.current !== mainActive.id) {
                    prevActiveTransportId.current = mainActive.id;
                    vibrate([200, 100, 200, 100, 300]);
                    try {
                        const snd = new Audio(NOTIFICATION_SOUND_URL);
                        snd.play().catch(() => {});
                    } catch(e) {}
                    toast.success("¡El cliente aceptó tu oferta! Viaje en curso.", { icon: '🎉', duration: 5000 });
                }
                setActiveTransport(mainActive);
            } else {
                prevActiveTransportId.current = null;
                setActiveTransport(null);
            }

            // Completed trips awaiting payment conciliation
            const pendingPay = data.filter((req: any) => 
                req.status === 'completed' && req.payment_status !== 'confirmed' && req.payment_status !== 'paid'
            );
            setPendingPayments(pendingPay);
            
            const pendingReservations = data.filter((req: any) => req.scheduled && req.status === 'accepted');
            setMyReservations(pendingReservations);
        } else {
            prevActiveTransportId.current = null;
            setActiveTransport(null);
            setPendingPayments([]);
            setMyReservations([]);
        }
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
                .eq('delivery_driver_id', user.uid)
                .in('status', ['en_camino', 'in_transit'])
                .limit(1);
            if (data && data.length > 0) {
                setActiveOrder(data[0]);
            } else {
                setActiveOrder(null);
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
                const drvLoc = driverProfile?.current_location;
                const reqs = data.filter((req: any) => {
                    // Si el viaje fue solicitado directamente a otro conductor específico, no mostrarlo ni sonar para mí
                    if (req.assigned_driver_id && req.assigned_driver_id !== user?.uid) {
                        return false;
                    }

                    const reqType = req.type || req.service_category || 'transport';
                    const isMandado = reqType === 'muchacho_mandado' || req.service_category === 'muchacho_mandado';

                    // Geolocation proximity filter: if driver has known GPS and request has coordinates,
                    // restrict to drivers within 35km radius (same city/metropolitan zone)
                    if (drvLoc?.lat && drvLoc?.lng && (req.origin?.lat || req.destination?.lat)) {
                        const targetLat = req.origin?.lat || req.destination?.lat;
                        const targetLng = req.origin?.lng || req.destination?.lng;
                        const distM = calculateDistance(drvLoc.lat, drvLoc.lng, targetLat, targetLng);
                        if (distM > 35000) {
                            return false;
                        }
                    }

                    if (isMandado) return true;
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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, fetchAvailableTransport)
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [driverProfile, user]);

    // 3.1 Listen for incoming in-app calls when driver has an active transport
    useEffect(() => {
        if (!activeTransport?.id || !user) return;
        const channel = supabase.channel(`call_${activeTransport.id}`, {
            config: { broadcast: { self: false } }
        });

        channel
            .on('broadcast', { event: 'signal' }, ({ payload }) => {
                if (payload?.type === 'offer' && payload.from !== user.uid) {
                    setIncomingOffer(payload.offer);
                    setShowIncomingCall(true);
                    playCallAlertChime();
                } else if (payload?.type === 'status' && payload.status === 'ended') {
                    setShowIncomingCall(false);
                    setIncomingOffer(null);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeTransport?.id, user]);


    // 3.1 Alerta sonora y vibración cuando llega un nuevo viaje o pedido
    const lastAvailableCount = React.useRef(0);
    useEffect(() => {
        const currentCount = availableOrders.length + availableTransport.length;
        
        if (currentCount > lastAvailableCount.current) {
            // Sonido audible
            if (notificationSoundUrl.current) {
                const audio = new Audio(notificationSoundUrl.current);
                audio.play().catch(e => console.error("Error playing notification sound:", e));
            } else {
                const audio = new Audio(NOTIFICATION_SOUND_URL);
                audio.play().catch(e => console.error("Error playing fallback notification sound:", e));
            }

            // Vibración física en dispositivo
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([250, 100, 250, 100, 250]);
            }
            vibrate(100);
            
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

            // Activar modal de despacho estilo YANGO si no estamos en viaje activo, ni suspendidos y con tarifas configuradas
            // NOTA: Los mandados NO usan despacho automático directo de 20s porque requieren cotización/puja libre en el radar
            if (!activeOrder && !activeTransport && !isSuspended && hasFaresConfigured) {
                const newestTransport = availableTransport.find((t: any) => {
                    const reqType = t.type || t.service_category || 'transport';
                    const isMandado = reqType === 'muchacho_mandado' || t.service_category === 'muchacho_mandado' || t.service_category === 'mandado';
                    return !isMandado;
                });
                const newest = newestTransport || availableOrders[0];
                if (newest) {
                    setIncomingDispatch(newest);
                }
            }
        }
        
        lastAvailableCount.current = currentCount;
    }, [availableOrders, availableTransport, activeOrder, activeTransport, isSuspended, hasFaresConfigured]);

    // 3.2 Temporizador de cuenta regresiva de 20s para el despacho YANGO
    useEffect(() => {
        if (!incomingDispatch) return;
        const currentDispatchId = incomingDispatch.id;
        setCountdownSeconds(20);
        const timer = setInterval(() => {
            setCountdownSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleDismissRequest(currentDispatchId);
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
                .eq('driver_id', user.uid)
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
                        setDriverGps({ lat: latitude, lng: longitude });
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
                .from('messages')
                .select('*')
                .or(`chat_path.eq.transport_requests/${activeTransport.id},order_id.eq.${activeTransport.id}`)
                .order('created_at', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                const latestMsg = data[0];
                const msgSenderId = latestMsg.sender_id || latestMsg.senderId;
                const msgSenderRole = latestMsg.sender_role || latestMsg.senderRole;
                
                // Si es un mensaje nuevo y no es mío
                const isMine = msgSenderRole === 'delivery' || msgSenderRole === 'driver' || msgSenderId === user.uid;
                if (!isMine && 
                    lastChatIdSeen.current !== null && 
                    lastChatIdSeen.current !== latestMsg.id) {
                    
                    const now = Date.now();
                    const msgTime = new Date(latestMsg.created_at).getTime();
                    if (now - msgTime < 45000) {
                        // Play crisp native web audio chime
                        playChatChime();

                        // Alerta Visual (Toast)
                        toast((t) => (
                            <div className="flex flex-col gap-1 p-1">
                                <p className="font-black text-slate-900 text-sm flex items-center gap-2">
                                    <MessageCircle className="w-4 h-4 text-emerald-500" />
                                    Nuevo Mensaje del Cliente
                                </p>
                                <p className="text-slate-500 text-xs font-bold leading-tight line-clamp-2">
                                    {latestMsg.text || latestMsg.message || "Ha enviado un archivo o nota de voz"}
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

        channel = supabase.channel(`messages_radar_${activeTransport.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `order_id=eq.${activeTransport.id}` }, fetchLatestMessage)
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

            // Liberar disponibilidad del chofer de inmediato para nuevas carreras
            try {
                await supabase.from('drivers').update({
                    availability: 'available'
                }).eq('id', user!.uid);
            } catch (availErr) {
                console.warn("Error updating driver availability:", availErr);
            }

            // Inmediatamente limpiar el transporte activo para liberar la pantalla de navegación
            setActiveTransport(null);
            fetchActiveTransport();
            toast.success(`¡Viaje finalizado con éxito! Quedas disponible para nuevas carreras.`, { icon: '🚀', duration: 4000 });
        } finally {
            setProcessingAction(null);
        }
    };

    const handleConfirmPayment = async (targetReq?: any) => {
        const item = targetReq || activeTransport;
        if (!item || processingAction) return;
        setProcessingAction(`confirm_${item.id}`);
        try {
            const { error } = await supabase.rpc('confirm_service_payment_and_award_points', {
                p_transport_id: item.id,
                p_confirmed_by: user!.uid
            });
            if (error) {
                console.warn("RPC confirm_service_payment_and_award_points error, fallback to direct update:", error);
                await supabase.from('transport_requests').update({
                    payment_status: 'confirmed',
                    payment_confirmed_at: new Date().toISOString()
                }).eq('id', item.id);
            }
            toast.success("¡Pago confirmado y conciliado con éxito! Puntos acreditados. 🎉", { duration: 5000 });
            if (activeTransport?.id === item.id) {
                setActiveTransport(null);
            }
            fetchActiveTransport();
        } catch (err: any) {
            console.error("Error confirmando pago:", err);
            toast.error("Error al conciliar el pago: " + (err.message || 'Intente nuevamente'));
        } finally {
            setProcessingAction(null);
        }
    };

    const handleDisputePayment = async (targetReq?: any) => {
        const item = targetReq || activeTransport;
        if (!item || processingAction) return;
        if (!confirm("¿Deseas reportar un problema con este pago a soporte? La cuenta del cliente será notificada.")) return;
        setProcessingAction(`dispute_${item.id}`);
        try {
            const { error } = await supabase
                .from('transport_requests')
                .update({
                    payment_status: 'disputed',
                    disputed_at: new Date().toISOString()
                })
                .eq('id', item.id);
            if (error) throw error;
            toast.error("Servicio marcado en disputa. Nuestro equipo de soporte intervendrá.");
            if (activeTransport?.id === item.id) {
                setActiveTransport((prev: any) => prev ? { ...prev, payment_status: 'disputed' } : null);
            }
            fetchActiveTransport();
        } catch (err: any) {
            console.error("Error marcando en disputa:", err);
            toast.error("No se pudo registrar la disputa");
        } finally {
            setProcessingAction(null);
        }
    };

    // Puja / Oferta para Muchacho e' Mandado
    const handleSendMandadoBid = async (reqId: string, customAmount?: number, customEta?: number) => {
        if (!user || processingAction) return;
        if (isSuspended) {
            toast.error("Tu cuenta está suspendida por comisiones pendientes ($15+ o plazo vencido). Ve a Ganancias para liquidar.");
            return;
        }
        if (hasReachedServiceLimit) {
            toast.error("Has alcanzado tu límite de servicios simultáneos (1 en curso + 1 en cola). Concluye tu viaje actual.");
            return;
        }
        const bidInfo = mandadoBids[reqId];
        const amount = customAmount !== undefined ? customAmount : Number(bidInfo?.amount || 0);
        const eta = customEta !== undefined ? customEta : Number(bidInfo?.eta || 15);

        if (isNaN(amount) || amount < 0.50) {
            toast.error("La tarifa mínima de puja es de $0.50 USD");
            return;
        }

        setProcessingAction(`bid_${reqId}`);
        try {
            const bidId = crypto.randomUUID();
            const driverDocs = driverProfile?.documents || {};
            const realSelfie = driverDocs?.selfieUrl || driverDocs?.selfie_url || driverProfile?.photoURL || driverProfile?.avatar_url || driverProfile?.photo_url || null;

            const insertPayload = {
                id: bidId,
                transport_request_id: reqId,
                request_id: reqId,
                driver_id: user.uid,
                driver_name: driverProfile?.full_name || driverProfile?.fullName || driverProfile?.displayName || driverProfile?.name || 'Conductor',
                driver_photo: realSelfie,
                driver_phone: driverProfile?.phone || null,
                vehicle_type: driverProfile?.vehicle_type || driverProfile?.vehicleType || 'moto',
                vehicle_brand: driverProfile?.vehicle_brand || driverProfile?.vehicleBrand || '',
                vehicle_model: driverProfile?.vehicle_model || driverProfile?.vehicleModel || driverProfile?.model || '',
                vehicle_year: driverProfile?.vehicle_year || driverProfile?.vehicleYear || '',
                vehicle_color: driverProfile?.vehicle_color || driverProfile?.vehicleColor || '',
                vehicle_plate: (driverProfile?.vehicle_plate || driverProfile?.plate || '').toUpperCase(),
                has_ac: Boolean(driverProfile?.has_ac ?? driverProfile?.hasAc ?? false),
                has_thermal_bag: Boolean(driverProfile?.has_thermal_bag ?? driverProfile?.hasThermalBag ?? false),
                driver_rating: driverProfile?.rating ? Number(driverProfile.rating) : 5.0,
                driver_payment_info: driverProfile?.payment_mobile || driverProfile?.paymentMobile || null,
                amount: amount,
                offered_price: amount,
                eta_minutes: eta,
                estimated_eta_minutes: eta,
                status: 'pending'
            };

            const { error } = await supabase.from('transport_bids').insert(insertPayload);

            if (error) {
                console.error("Error al insertar oferta en transport_bids:", error);
                throw error;
            }

            setMandadoBids(prev => ({
                ...prev,
                [reqId]: { amount: String(amount), eta: String(eta), submitted: true }
            }));
            toast.success(`¡Puja de $${amount.toFixed(2)} USD enviada al cliente! En espera de respuesta...`);
        } catch (err: any) {
            console.error("Error enviando puja de mandado:", err);
            toast.error(err?.message || "No se pudo enviar la oferta. Revisa tu conexión.");
        } finally {
            setProcessingAction(null);
        }
    };

    // Cancelar postulación de mandado
    const handleCancelBid = async (bidId: string) => {
        try {
            const { error } = await supabase.from('transport_bids').delete().eq('id', bidId);
            if (error) throw error;
            setMyPendingBids(prev => prev.filter(b => b.id !== bidId));
            toast.success("Postulación cancelada");
        } catch (e) {
            console.error("Error al cancelar la postulación:", e);
            toast.error("No se pudo cancelar la postulación");
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
                    remoteId={activeTransport.userId || activeTransport.user_id}
                    remoteDisplayName={activeTransport.userName || activeTransport.passenger_name || 'Pasajero'}
                    role="receiver"
                    initialOffer={incomingOffer}
                    onClose={() => {
                        setShowIncomingCall(false);
                        setIncomingOffer(null);
                    }}
                />
            )}
            {/* Outgoing in-app call from driver */}
            {showOutgoingCall && currentActiveItem && (
                <InAppCall
                    requestId={currentActiveItem.id}
                    myId={user!.uid}
                    remoteId={currentActiveItem.userId || currentActiveItem.user_id}
                    remoteDisplayName={currentActiveItem.userName || currentActiveItem.passenger_name || 'Pasajero'}
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
                            {activeTransport.status === 'completed' && 'En espera de confirmación de pago'}
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

                    {/* Live Trip Map with 3D animated vehicle and full/half screen slider */}
                    <div className="space-y-2 pt-2">
                        <div className={`w-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner transition-all duration-300 ${
                            isDriverMapExpanded ? 'h-[70vh]' : 'h-64'
                        }`}>
                            <LiveTripMap
                                origin={activeTransport.origin}
                                destination={activeTransport.destination}
                                driverLocation={driverGps}
                                vehicleType={driverProfile?.vehicleType || activeTransport.service_category || 'moto'}
                                driverName={driverProfile?.name || 'Mi Vehículo'}
                                isExpanded={isDriverMapExpanded}
                                onToggleExpand={() => setIsDriverMapExpanded(prev => !prev)}
                                showControls={true}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsDriverMapExpanded(prev => !prev)}
                            className="w-full py-2 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 active:scale-98"
                        >
                            {isDriverMapExpanded ? "▼ Reducir mapa a la mitad" : "▲ Desplegar mapa en pantalla completa"}
                        </button>
                    </div>

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

                        {activeTransport.type === 'package_delivery' && (() => {
                            const sName = activeTransport.mandado_details?.sender_name || activeTransport.sender_name || activeTransport.user_name || activeTransport.userName || 'Remitente';
                            const sPhone = activeTransport.mandado_details?.sender_phone || activeTransport.sender_phone || activeTransport.user_phone || activeTransport.userPhone;
                            const rName = activeTransport.mandado_details?.receiver_name || activeTransport.receiver_name || (activeTransport as any).recipient_name || 'Destinatario';
                            const rPhone = activeTransport.mandado_details?.receiver_phone || activeTransport.receiver_phone || (activeTransport as any).recipient_phone;
                            const pkgDesc = activeTransport.mandado_details?.package_notes || activeTransport.package_description || activeTransport.packageDescription;

                            return (
                                <div className="bg-amber-50/80 border border-amber-200 rounded-3xl p-4 space-y-3 shadow-xs">
                                    <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-amber-900 border-b border-amber-200/60 pb-2">
                                        <div className="flex items-center gap-2">
                                            <Package className="w-4 h-4 text-amber-600" />
                                            <span>Ficha de Encomienda / Paquete</span>
                                        </div>
                                    </div>

                                    {/* Destinatario Info (Quién Recibe - Obligatorio para Entrega) */}
                                    <div className="p-3 bg-emerald-50 rounded-2xl border-2 border-emerald-300 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">Destinatario (Quién Recibe):</span>
                                                <span className="font-black text-slate-900 text-sm block mt-0.5">{rName}</span>
                                                {rPhone ? (
                                                    <span className="text-xs text-emerald-700 font-mono font-black block mt-0.5">{rPhone}</span>
                                                ) : (
                                                    <span className="text-[11px] text-slate-400 italic block mt-0.5">Sin teléfono registrado</span>
                                                )}
                                            </div>
                                            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                                                <UserIcon className="w-5 h-5" />
                                            </div>
                                        </div>

                                        {rPhone && (
                                            <div className="flex gap-2 pt-1">
                                                <a
                                                    href={`tel:${rPhone}`}
                                                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                                                >
                                                    <Phone className="w-3.5 h-3.5" /> Llamar al Destinatario
                                                </a>
                                                <a
                                                    href={`https://wa.me/${rPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${rName}, soy tu conductor de Un 2x3 con tu entrega de encomienda.`)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-3 py-2.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-black text-xs rounded-xl flex items-center justify-center gap-1 active:scale-95 transition-all"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                                </a>
                                            </div>
                                        )}
                                    </div>

                                    {/* Remitente Info */}
                                    <div className="p-3 bg-white rounded-2xl border border-amber-100 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Remite (Entrega el paquete):</span>
                                            <span className="font-bold text-slate-800 text-xs">{sName}</span>
                                            {sPhone && <span className="text-[11px] text-slate-500 font-mono block mt-0.5">{sPhone}</span>}
                                        </div>
                                        {sPhone && (
                                            <a
                                                href={`tel:${sPhone}`}
                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1 active:scale-95 transition-all"
                                            >
                                                <Phone className="w-3.5 h-3.5" /> Llamar Remitente
                                            </a>
                                        )}
                                    </div>

                                    {/* Contenido / Descripción del Paquete */}
                                    {pkgDesc && (
                                        <div className="p-3 bg-white rounded-2xl border border-amber-100 text-xs">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Contenido del Paquete:</span>
                                            <p className="font-bold text-slate-800 mt-1 leading-relaxed">{pkgDesc}</p>
                                        </div>
                                    )}

                                    {activeTransport.b2b_merchant && (
                                        <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900">
                                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">Nota Comercial / B2B:</span>
                                            <p className="font-medium mt-0.5">{activeTransport.b2b_merchant}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

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

                        {/* Panel de Conciliación de Pago cuando status === 'completed' */}
                        {activeTransport.status === 'completed' && (
                            <div className="bg-amber-50/80 border-2 border-amber-300 rounded-3xl p-5 space-y-4 shadow-sm animate-in fade-in duration-300">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                        <DollarSign className="w-4 h-4 text-amber-600" />
                                        Conciliación y Cobro
                                    </span>
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                        activeTransport.payment_status === 'disputed'
                                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                            : activeTransport.payment_status === 'payment_reported'
                                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                                    }`}>
                                        {activeTransport.payment_status === 'disputed'
                                            ? 'En Disputa'
                                            : activeTransport.payment_status === 'payment_reported'
                                            ? 'Comprobante Enviado'
                                            : 'Esperando Pago'}
                                    </span>
                                </div>

                                {/* 48-Hour Guarantee Notice */}
                                <div className="bg-white/90 border border-amber-200/80 rounded-2xl p-3 flex items-start gap-2.5 shadow-sm text-xs text-amber-950 leading-relaxed">
                                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                    <p>
                                        <strong>Garantía Un 2x3:</strong> Si el usuario no realiza el pago en un lapso de 48 horas, Grupo Un 2x3 asumirá el pago correspondiente del servicio y aplicará las sanciones y penalizaciones a la cuenta del usuario.
                                    </p>
                                </div>

                                {/* Monto del viaje */}
                                <div className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tarifa Acordada</span>
                                        <span className="text-2xl font-black text-slate-900">${Number(activeTransport.fare || activeTransport.price || 0).toFixed(2)} USD</span>
                                    </div>
                                    {bcvRate && (
                                        <div className="text-right">
                                            <span className="text-[10px] font-bold text-slate-400 block">Tasa BCV</span>
                                            <span className="text-sm font-black text-slate-700">{(Number(activeTransport.fare || activeTransport.price || 0) * bcvRate).toFixed(2)} Bs</span>
                                        </div>
                                    )}
                                </div>

                                {/* Comprobante de pago si existe */}
                                {activeTransport.payment_proof_url ? (
                                    <div className="bg-white rounded-2xl p-4 border border-slate-100 space-y-3">
                                        <span className="text-xs font-black text-slate-800 block">Comprobante de Pago Móvil / Transferencia:</span>
                                        <div 
                                            className="relative group cursor-pointer overflow-hidden rounded-xl border border-slate-200 max-h-48 flex justify-center bg-slate-950" 
                                            onClick={() => setPreviewProofUrl(activeTransport.payment_proof_url)}
                                        >
                                            <img 
                                                src={activeTransport.payment_proof_url} 
                                                alt="Comprobante" 
                                                className="max-h-48 object-contain hover:scale-105 transition-transform" 
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                                                Toca para ver en grande
                                            </div>
                                        </div>
                                        {activeTransport.payment_ref && (
                                            <div className="p-2.5 bg-slate-50 rounded-xl text-xs font-mono font-bold text-slate-700 border border-slate-200">
                                                Referencia: <span className="text-slate-950 font-black">{activeTransport.payment_ref}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="bg-amber-100/60 rounded-2xl p-3.5 text-center text-xs text-amber-900 font-medium">
                                        El pasajero aún no ha adjuntado captura digital. Si ya recibiste el pago en efectivo o transferencia directa, confirma a continuación.
                                    </div>
                                )}

                                {/* Botones de Acción de Pago */}
                                <div className="space-y-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleConfirmPayment}
                                        disabled={processingAction !== null}
                                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        {processingAction === 'confirm_payment' ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-5 h-5" />
                                                <span>Confirmar y Conciliar Pago Recibido</span>
                                            </>
                                        )}
                                    </button>

                                    {activeTransport.payment_status !== 'disputed' && (
                                        <button
                                            type="button"
                                            onClick={handleDisputePayment}
                                            disabled={processingAction !== null}
                                            className="w-full py-2.5 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                            <span>No reconozco el pago / Marcar en disputa</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTransport.status !== 'completed' && (
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
                        )}
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
                            serviceCategory={activeTransport.service_category}
                            clientPhone={activeTransport.passenger_phone || (activeTransport as any).user_phone}
                            requestStatus={activeTransport.status}
                            completedAt={activeTransport.completed_at || (activeTransport as any).updated_at}
                            isDriver={true}
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

    // Solicitudes activas visibles para este conductor (filtrando las omitidas localmente)
    const visibleTransport = availableTransport.filter(r => !dismissedRequestIds.includes(r.id));
    const visibleOrders = availableOrders.filter(o => !dismissedRequestIds.includes(o.id));

    // Listas organizadas por categorías de servicios
    const taxisList = visibleTransport.filter(r => 
        r.service_category !== 'mandado' && 
        r.service_category !== 'muchacho_mandado' && 
        r.type !== 'muchacho_mandado' && 
        r.type !== 'food_delivery' && 
        r.type !== 'package_delivery'
    );

    const deliveriesList = [
        ...visibleOrders,
        ...visibleTransport.filter(r => r.type === 'package_delivery' || r.type === 'food_delivery')
    ];

    const mandadosList = visibleTransport.filter(r => 
        r.service_category === 'mandado' || 
        r.service_category === 'muchacho_mandado' || 
        r.type === 'muchacho_mandado'
    );

    const allCount = taxisList.length + deliveriesList.length + mandadosList.length + myReservations.length;

    const isFilteredListEmpty = (
        (activeTab === 'all' && allCount === 0) ||
        (activeTab === 'taxis' && taxisList.length === 0) ||
        (activeTab === 'deliveries' && deliveriesList.length === 0) ||
        (activeTab === 'mandados' && mandadosList.length === 0)
    );

    return (
        <div className="space-y-5 pb-10">
            {/* Cabecera del Centro de Mando: Estado en Línea & Capacidad */}
            <div className="bg-slate-950 text-white p-4 sm:p-5 rounded-[2.5rem] border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className={`w-3.5 h-3.5 rounded-full ${hasFaresConfigured ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                        {hasFaresConfigured && (
                            <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-black text-sm tracking-tight text-white">
                                {hasFaresConfigured ? 'En línea y disponible' : 'Tarifas pendientes'}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700 uppercase">
                                {(driverProfile?.vehicle_type || driverProfile?.vehicleType || 'moto').toUpperCase()}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">
                            {hasFaresConfigured ? 'Transmitiendo GPS en tiempo real' : 'Configura tus tarifas para recibir viajes'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <div className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 ${
                        hasReachedServiceLimit 
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
                            : activeServicesCount === 1 
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    }`}>
                        <Clock className="w-3.5 h-3.5" />
                        <span>Capacidad: {activeServicesCount}/2 ({activeServicesCount === 0 ? 'Libre' : activeServicesCount === 1 ? '1 en curso' : 'Lleno'})</span>
                    </div>
                </div>
            </div>

            {/* Aviso de Límite Máximo Alcanzado (1 en curso + 1 en cola) */}
            {hasReachedServiceLimit && (
                <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl flex items-center gap-3 text-amber-950 animate-in fade-in">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                        <p className="text-xs font-black uppercase tracking-wide">Capacidad máxima alcanzada (2/2)</p>
                        <p className="text-[11px] text-amber-800 font-medium">
                            Tienes 1 servicio en curso + 1 en cola. No puedes aceptar más solicitudes hasta concluir el actual.
                        </p>
                    </div>
                </div>
            )}

            {/* Banner Obligatorio: Configuración de Tarifas */}
            {!hasFaresConfigured && (
                <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white p-5 rounded-[2.5rem] shadow-xl shadow-red-500/20 border-2 border-red-400/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 animate-pulse">
                            <AlertTriangle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h4 className="font-black text-base leading-tight flex items-center gap-2">
                                Configura tus tarifas para empezar a recibir viajes
                            </h4>
                            <p className="text-xs text-red-100 font-medium mt-0.5">
                                Para quedar habilitado y visible a los clientes, debes configurar tus tarifas (mínimo $0.50 USD).
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/earnings?tab=fares')}
                        className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-red-50 text-red-700 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all shrink-0 flex items-center justify-center gap-2"
                    >
                        <span>Configurar Tarifas</span>
                    </button>
                </div>
            )}

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
                        onClick={() => navigate('/earnings')}
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
                                    incomingDispatch.price ||
                                    incomingDispatch.total ||
                                    incomingDispatch.deliveryFee ||
                                    incomingDispatch.driverPayout ||
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
                                        const id = incomingDispatch.id;
                                        setIncomingDispatch(null);
                                        const isOrder = Boolean(incomingDispatch.restaurantName || incomingDispatch.shippingAddress);
                                        if (isOrder) {
                                            handleAcceptOrder(id);
                                        } else {
                                            handleAcceptTransport(id);
                                        }
                                    }}
                                    disabled={hasReachedServiceLimit}
                                    className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-amber-400/20 active:scale-95 transition-all text-base uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Sparkles className="w-5 h-5" />
                                    {Boolean(incomingDispatch.restaurantName || incomingDispatch.shippingAddress) ? 'Aceptar Reparto' : 'Aceptar Viaje'}
                                </button>
                                <button
                                    onClick={() => {
                                        const id = incomingDispatch.id;
                                        handleDismissRequest(id);
                                    }}
                                    className="w-full py-2.5 text-slate-400 hover:text-slate-200 font-bold text-xs uppercase tracking-wider text-center active:scale-95 transition-all"
                                >
                                    Rechazar / Omitir
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Pestañas de Servicios Organizados (Rediseño del Centro de Mando) */}
            <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl overflow-x-auto scrollbar-none border border-slate-200">
                <button
                    onClick={() => handleSelectTab('all')}
                    className={`flex-1 min-w-[85px] py-2 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'all' ? 'bg-slate-950 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <span>Todos</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'all' ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-200 text-slate-700'}`}>
                        {allCount}
                    </span>
                </button>

                <button
                    onClick={() => handleSelectTab('taxis')}
                    className={`flex-1 min-w-[85px] py-2 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'taxis' ? 'bg-slate-950 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <Car className="w-3.5 h-3.5" />
                    <span>Taxis</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'taxis' ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-200 text-slate-700'}`}>
                        {taxisList.length}
                    </span>
                </button>

                <button
                    onClick={() => handleSelectTab('deliveries')}
                    className={`flex-1 min-w-[95px] py-2 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'deliveries' ? 'bg-slate-950 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <Bike className="w-3.5 h-3.5" />
                    <span>Deliveries</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'deliveries' ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-200 text-slate-700'}`}>
                        {deliveriesList.length}
                    </span>
                </button>

                <button
                    onClick={() => handleSelectTab('mandados')}
                    className={`flex-1 min-w-[105px] py-2 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'mandados' ? 'bg-slate-950 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <Package className="w-3.5 h-3.5" />
                    <span>Mandao</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'mandados' ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-200 text-slate-700'}`}>
                        {mandadosList.length}
                    </span>
                </button>

                <button
                    onClick={() => handleSelectTab('pending_payments')}
                    className={`flex-1 min-w-[140px] py-2 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === 'pending_payments' ? 'bg-slate-950 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Reporte de Pago</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        activeTab === 'pending_payments' 
                            ? 'bg-emerald-500 text-white font-black' 
                            : pendingPayments.length > 0 ? 'bg-amber-400 text-slate-950 font-black animate-pulse' : 'bg-slate-200 text-slate-700'
                    }`}>
                        {pendingPayments.length}
                    </span>
                </button>
            </div>

            {/* Aviso de solicitudes omitidas con opción de restaurar */}
            {dismissedRequestIds.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-300 shadow-sm animate-in fade-in">
                    <span className="font-medium text-[11px]">
                        Has omitido <strong>{dismissedRequestIds.length}</strong> {dismissedRequestIds.length === 1 ? 'solicitud' : 'solicitudes'} en esta sesión.
                    </span>
                    <button
                        type="button"
                        onClick={handleRestoreDismissed}
                        className="text-amber-400 hover:text-amber-300 font-black uppercase text-[10px] tracking-wider underline active:scale-95 transition-all"
                    >
                        Restaurar
                    </button>
                </div>
            )}

            {/* Tarjetas de Mandados Postulados / En Espera de Respuesta */}
            {myPendingBids.length > 0 && (activeTab === 'all' || activeTab === 'mandados') && (
                <div className="space-y-3">
                    <h3 className="text-[11px] font-black uppercase text-amber-800 tracking-wider flex items-center gap-1.5 px-1">
                        <Clock className="w-3.5 h-3.5 text-amber-600" /> Mandados Postulados / En Espera de Respuesta
                    </h3>
                    <div className="space-y-2.5">
                        {myPendingBids.map((bid) => (
                            <motion.div
                                key={bid.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-gradient-to-br from-amber-50 to-yellow-50/70 border-2 border-amber-300 rounded-3xl p-4 shadow-md space-y-3"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-sm">
                                            <Package className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">Mandado Postulado</span>
                                            <span className="text-xs font-black text-slate-900">{bid.transport_requests?.user_name || 'Cliente'}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-base font-black text-emerald-700">${Number(bid.amount).toFixed(2)} USD</span>
                                        <span className="text-[10px] text-slate-500 font-bold block">ETA: {bid.eta_minutes || 15} min</span>
                                    </div>
                                </div>

                                <div className="bg-white/90 border border-amber-200 p-3 rounded-2xl flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                                        <span className="font-bold text-amber-950 truncate">
                                            En espera de respuesta del cliente...
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleCancelBid(bid.id)}
                                        className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-black text-[10px] rounded-xl uppercase transition-colors shrink-0"
                                    >
                                        Retirar oferta
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

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

            {activeTab === 'pending_payments' ? (
                <div className="space-y-4">
                    {/* Header Banner de Garantía Arepa Express */}
                    <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 rounded-3xl p-4 sm:p-5 border border-emerald-500/30 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <ShieldCheck className="w-24 h-24 text-emerald-400" />
                        </div>
                        <div className="flex items-start gap-3.5 z-10 relative">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                                        Garantía Arepa Express
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        Protección 48h
                                    </span>
                                </div>
                                <p className="text-xs text-slate-300 font-medium leading-relaxed">
                                    Tus ganancias están respaldadas. Cuentas con un plazo de protección de <strong>48 horas</strong> para cualquier reclamo, comprobante dudoso o pago no acreditado.
                                </p>
                            </div>
                        </div>
                    </div>

                    {pendingPayments.length === 0 ? (
                        /* Estado vacío elegante */
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-slate-950 rounded-[2.5rem] p-8 sm:p-10 text-center shadow-2xl border border-slate-800 relative overflow-hidden flex flex-col items-center"
                        >
                            <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                            </div>
                            <h3 className="text-lg font-black text-white tracking-tight">
                                ¡Al día! No tienes pagos pendientes por conciliar
                            </h3>
                            <p className="text-slate-400 font-medium text-xs max-w-sm mt-1.5 leading-relaxed">
                                Todas tus carreras anteriores han sido verificadas y cobradas satisfactoriamente. Estás listo para seguir rodando.
                            </p>
                            <button
                                onClick={() => handleSelectTab('all')}
                                className="mt-6 px-6 py-3 bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-amber-400/20 active:scale-95 transition-all flex items-center gap-2"
                            >
                                <Navigation className="w-4 h-4" />
                                Ver solicitudes activas
                            </button>
                        </motion.div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
                                    Pagos por conciliar ({pendingPayments.length})
                                </span>
                                <span className="text-[11px] text-amber-700 font-bold">
                                    Revisa el capture antes de confirmar
                                </span>
                            </div>

                            {pendingPayments.map((item) => {
                                const hasProof = Boolean(item.payment_proof_url);
                                const isDisputed = item.payment_status === 'disputed';
                                const priceNum = Number(item.price || 0);
                                const priceBs = (priceNum * (bcvRate || 1)).toFixed(2);
                                const refNumber = item.payment_reference || item.reference_number || item.payment_ref;
                                const isProcessingThis = processingAction === `confirm_${item.id}` || processingAction === `dispute_${item.id}`;

                                return (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`rounded-3xl border-2 p-5 shadow-lg space-y-4 transition-all ${
                                            isDisputed 
                                                ? 'bg-rose-50/70 border-rose-300' 
                                                : hasProof 
                                                    ? 'bg-gradient-to-br from-emerald-50/70 via-white to-white border-emerald-300' 
                                                    : 'bg-gradient-to-br from-amber-50/70 via-white to-white border-amber-300'
                                        }`}
                                    >
                                        {/* Header de la tarjeta */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
                                                    item.service_type === 'mandao' 
                                                        ? 'bg-amber-400 text-slate-950' 
                                                        : item.service_type === 'delivery' 
                                                            ? 'bg-emerald-500 text-white' 
                                                            : 'bg-slate-950 text-white'
                                                }`}>
                                                    {item.service_type === 'mandao' ? <Package className="w-5 h-5" /> : item.service_type === 'delivery' ? <Bike className="w-5 h-5" /> : <Car className="w-5 h-5" />}
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                                                        {item.service_type === 'mandao' ? "Muchacho e' Mandao" : item.service_type === 'delivery' ? 'Delivery' : 'Carrera de Taxi'}
                                                    </span>
                                                    <span className="text-sm font-black text-slate-900">
                                                        {item.user_name || item.userName || 'Cliente'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-black text-emerald-700 block leading-tight">
                                                    ${priceNum.toFixed(2)} USD
                                                </span>
                                                <span className="text-xs font-bold text-slate-500 block">
                                                    Bs {priceBs}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Origen y Destino */}
                                        <div className="bg-slate-50/80 border border-slate-100 p-3 rounded-2xl space-y-1.5 text-xs">
                                            <div className="flex items-start gap-2">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                                                <span className="text-slate-600 line-clamp-1">
                                                    <strong>Desde:</strong> {item.pickup_address || item.origin?.address || 'Origen'}
                                                </span>
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                                                <span className="text-slate-600 line-clamp-1">
                                                    <strong>Hasta:</strong> {item.dropoff_address || item.destination?.address || 'Destino'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Estado del comprobante / pago */}
                                        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                    Estado de Pago Móvil
                                                </span>
                                                {isDisputed ? (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" /> En Disputa
                                                    </span>
                                                ) : hasProof ? (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Comprobante enviado
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                                        <Clock className="w-3 h-3 text-amber-600 animate-spin" /> Pendiente por transferir
                                                    </span>
                                                )}
                                            </div>

                                            {refNumber && (
                                                <div className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                                                    <span className="text-slate-500 font-bold">Referencia:</span>
                                                    <span className="font-mono font-black text-slate-900 tracking-wider">
                                                        {refNumber}
                                                    </span>
                                                </div>
                                            )}

                                            {hasProof ? (
                                                <div className="flex items-center gap-3 pt-1">
                                                    <div 
                                                        onClick={() => setPreviewProofUrl(item.payment_proof_url)}
                                                        className="w-16 h-16 rounded-xl overflow-hidden border-2 border-emerald-400 shadow-sm cursor-pointer hover:opacity-90 relative shrink-0 group"
                                                    >
                                                        <img 
                                                            src={item.payment_proof_url} 
                                                            alt="Capture de Pago" 
                                                            className="w-full h-full object-cover group-hover:scale-110 transition-all duration-300"
                                                        />
                                                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <ExternalLink className="w-4 h-4 text-white" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewProofUrl(item.payment_proof_url)}
                                                            className="text-xs font-black text-emerald-700 hover:text-emerald-800 underline flex items-center gap-1"
                                                        >
                                                            <span>Toca para ampliar capture</span>
                                                            <ExternalLink className="w-3 h-3" />
                                                        </button>
                                                        <p className="text-[11px] text-slate-500 font-medium">
                                                            Verifica los últimos dígitos de la referencia en tu banco.
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-amber-800/90 font-medium italic">
                                                    El cliente aún no ha subido el capture. Puedes contactarlo vía llamada o WhatsApp.
                                                </p>
                                            )}
                                        </div>

                                        {/* Acciones del Conductor */}
                                        <div className="space-y-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => handleConfirmPayment(item)}
                                                disabled={isProcessingThis}
                                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
                                            >
                                                {processingAction === `confirm_${item.id}` ? (
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <>
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        <span>Confirmar y Conciliar Pago Recibido</span>
                                                    </>
                                                )}
                                            </button>

                                            <div className="flex items-center gap-2">
                                                {(item.user_phone || item.userPhone) && (
                                                    <a
                                                        href={`https://wa.me/${(item.user_phone || item.userPhone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${item.user_name || ''}, te saluda tu chofer de Arepa Express sobre el viaje realizado por $${priceNum.toFixed(2)} USD.`)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                                                    >
                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                        <span>WhatsApp</span>
                                                    </a>
                                                )}
                                                {(item.user_phone || item.userPhone) && (
                                                    <a
                                                        href={`tel:${item.user_phone || item.userPhone}`}
                                                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                                                    >
                                                        <Phone className="w-3.5 h-3.5" />
                                                        <span>Llamar</span>
                                                    </a>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDisputePayment(item)}
                                                    disabled={isProcessingThis || isDisputed}
                                                    className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-50"
                                                >
                                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                                    <span>Reportar Problema</span>
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : isFilteredListEmpty ? (
                <div className="space-y-4">
                    {/* Tarjeta de Control Limpia y Minimalista */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-slate-950 rounded-[2.5rem] p-8 sm:p-10 text-center shadow-2xl border border-slate-800 relative overflow-hidden flex flex-col items-center"
                    >
                        {/* Background subtle grid pattern */}
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#34d399_1px,transparent_1px)] [background-size:16px_16px]"></div>

                        {/* Top HUD Status */}
                        <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/30 px-4 py-1.5 rounded-full mb-6 z-10">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                            <span className="text-[11px] font-black uppercase tracking-widest text-emerald-300">
                                {hasFaresConfigured ? 'Radar Activo • Escaneo 5 km' : 'Tarifas Pendientes'}
                            </span>
                        </div>

                        {/* Modern Minimalist Icon Graphic */}
                        <div className="relative w-28 h-28 rounded-3xl bg-slate-900 border border-slate-800 shadow-inner flex items-center justify-center my-2 z-10">
                            <div className="absolute inset-0 rounded-3xl bg-emerald-500/5 animate-pulse"></div>
                            {activeTab === 'mandados' ? (
                                <Package className="w-12 h-12 text-amber-400" />
                            ) : activeTab === 'deliveries' ? (
                                <Bike className="w-12 h-12 text-emerald-400" />
                            ) : activeTab === 'taxis' ? (
                                <Car className="w-12 h-12 text-emerald-400" />
                            ) : (
                                <Navigation className="w-12 h-12 text-emerald-400" />
                            )}
                        </div>

                        <div className="mt-4 z-10 space-y-1.5 max-w-sm">
                            <h3 className="text-lg font-black text-white tracking-tight flex items-center justify-center gap-2">
                                {hasFaresConfigured ? (
                                    <>
                                        <span>
                                            {activeTab === 'mandados'
                                                ? 'Buscando Mandados'
                                                : activeTab === 'deliveries'
                                                ? 'Buscando Deliveries'
                                                : activeTab === 'taxis'
                                                ? 'Buscando Viajes Taxi'
                                                : 'Buscando Clientes'}
                                        </span>
                                        <span className="flex h-2 w-2 relative">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-rose-400">Configuración Requerida</span>
                                )}
                            </h3>
                            <p className="text-slate-400 font-medium text-xs leading-relaxed">
                                {hasFaresConfigured
                                    ? "Tu señal GPS está activa. Cuando haya una solicitud en tu área, sonará una alerta en tu pantalla."
                                    : "Configura tus tarifas arriba para activar la visibilidad en el radar y empezar a recibir solicitudes."}
                            </p>
                        </div>
                    </motion.div>

                    {/* Banner de Consejos / Anuncios para Pilotos */}
                    <div className="bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-white border border-amber-500/25 rounded-3xl p-4 sm:p-5 relative overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                                    Consejo para Pilotos
                                </span>
                            </div>
                            {/* Pagination Dots */}
                            <div className="flex items-center gap-1.5">
                                {radarTips.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentTipIndex(idx)}
                                        className={`h-1.5 rounded-full transition-all ${
                                            idx === currentTipIndex ? 'w-5 bg-amber-500' : 'w-1.5 bg-amber-300/40'
                                        }`}
                                        aria-label={`Ver consejo ${idx + 1}`}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="min-h-[46px] flex items-center">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentTipIndex}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="w-full"
                                >
                                    <p className="text-xs font-bold text-slate-800 leading-relaxed">
                                        {radarTips[currentTipIndex]}
                                    </p>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Mis Reservas (Visible en "Todos" y "Taxis") */}
                    {(activeTab === 'all' || activeTab === 'taxis') && myReservations.length > 0 && (
                        <div className="mb-6">
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

                    {/* Lista de Muchacho e' Mandao (Visible en "Todos" y "Mandao") */}
                    {(activeTab === 'all' || activeTab === 'mandados') && (
                        <AnimatePresence mode="popLayout">
                            {mandadosList.map(req => {
                                const bidData = mandadoBids[req.id] || { amount: '', eta: '15', submitted: false };
                                const bidAmountNum = parseFloat(bidData.amount) || 0;
                                const commMandado = getCommissionForCategory('mandao');
                                const netMandado = Math.max(0, bidAmountNum - commMandado);

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
                                            <div className="flex items-center gap-2">
                                                <div className="text-xs font-black uppercase px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full border border-amber-200">
                                                    Puja Abierta
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDismissRequest(req.id)}
                                                    title="Omitir mandado"
                                                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-all active:scale-95"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
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
                                            {(req.mandado_details?.audioUrl || req.audio_url) && (
                                                <div className="mt-2">
                                                    <AudioNotePlayer src={req.mandado_details?.audioUrl || req.audio_url} />
                                                </div>
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

                                        {/* Indicador de traslado de persona o diligencia */}
                                        <div className="p-3.5 rounded-2xl border text-xs font-bold mb-3 bg-slate-50 border-slate-200 space-y-2">
                                            {req.mandado_details?.transportPassenger ? (
                                                <>
                                                    <div className="text-amber-600 flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                                                        <span>⚠️ Este mandado incluye el traslado de una persona</span>
                                                    </div>
                                                    <div className="p-3 bg-amber-100/90 border border-amber-300 rounded-xl space-y-1">
                                                        <div className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
                                                            📍 Ruta de traslado de la persona:
                                                        </div>
                                                        <p className="text-xs font-black text-amber-950 leading-relaxed">
                                                            {req.mandado_details?.passengerRouteDescription || req.mandado_details?.passenger_route_description || 'Ruta no especificada'}
                                                        </p>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-emerald-700 flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                                    <span>🛍️ Solo diligencias / compras (sin traslado de personas)</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Foto o factura de referencia si existe */}
                                        {(req.mandado_details?.referenceUrl || req.reference_url) && (
                                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-3 space-y-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Foto o factura de referencia:</span>
                                                <a
                                                    href={req.mandado_details?.referenceUrl || req.reference_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block rounded-xl overflow-hidden border border-slate-300 max-h-48 group relative shadow-sm"
                                                >
                                                    <img
                                                        src={req.mandado_details?.referenceUrl || req.reference_url}
                                                        alt="Referencia mandado"
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="text-xs font-black text-white bg-slate-900/80 px-3 py-1 rounded-lg">Ver foto completa</span>
                                                    </div>
                                                </a>
                                            </div>
                                        )}

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
                                                <button
                                                    type="button"
                                                    onClick={() => handleDismissRequest(req.id)}
                                                    className="w-full mt-3 py-2 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-200 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                    <span>Omitir mandado de pantalla</span>
                                                </button>
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
                                                                min="0.50"
                                                                step="0.25"
                                                                placeholder="Min 0.50"
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
                                                            Tiempo llegada
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
                                                {bidAmountNum >= 0.50 && (
                                                    <div className="text-[11px] bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                                                        <span className="text-slate-500">Comisión Un 2x3: <strong className="text-rose-500">-${commMandado.toFixed(2)}</strong></span>
                                                        <span className="font-black text-emerald-600">Neto: ${netMandado.toFixed(2)} USD</span>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => handleSendMandadoBid(req.id)}
                                                    disabled={processingAction === `bid_${req.id}` || !bidData.amount || Number(bidData.amount) < 0.50 || hasReachedServiceLimit}
                                                    className="w-full bg-slate-900 hover:bg-slate-800 active:scale-98 text-amber-400 font-black py-3.5 rounded-xl shadow-lg shadow-slate-900/10 text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                                                >
                                                    {processingAction === `bid_${req.id}` ? (
                                                        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                                                    ) : hasReachedServiceLimit ? (
                                                        'Límite Alcanzado (2/2)'
                                                    ) : (
                                                        <>
                                                            <Send className="w-4 h-4" />
                                                            Enviar Oferta / Puja
                                                        </>
                                                    )}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleDismissRequest(req.id)}
                                                    className="w-full mt-2 py-3 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-200 hover:border-rose-300 active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                    <span>Omitir / Rechazar mandado</span>
                                                </button>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    )}

                    {/* Lista de Viajes Taxi (Visible en "Todos" y "Taxis") */}
                    {(activeTab === 'all' || activeTab === 'taxis') && (
                        <AnimatePresence mode="popLayout">
                            {taxisList.map(req => {
                                const isDirectlyAssigned = req.assigned_driver_id === user?.uid;

                                return (
                                    <motion.div
                                        key={req.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className={`bg-white rounded-[2.5rem] p-6 shadow-xl relative overflow-hidden group ${
                                            isDirectlyAssigned 
                                                ? 'border-2 border-amber-400 ring-2 ring-amber-400/20 shadow-amber-500/10' 
                                                : 'border-2 border-primary/10 shadow-slate-200/50'
                                        }`}
                                    >
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>

                                        {/* Direct Driver Assignment Highlight */}
                                        {isDirectlyAssigned && (
                                            <div className="bg-amber-400/20 border border-amber-400 text-amber-950 px-3.5 py-2 rounded-2xl text-xs font-black flex items-center gap-2 mb-4 animate-pulse">
                                                <Star className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                                                <span>⭐ VIAJE ASIGNADO DIRECTAMENTE A TI POR EL CLIENTE</span>
                                            </div>
                                        )}

                                        <div className="flex justify-between items-center mb-6 relative">
                                            <div className="flex items-center gap-2 px-3 py-1 bg-primary text-slate-900 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg shadow-primary/20">
                                                {req.vehicleType === 'moto' ? <Bike className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />}
                                                {req.scheduled ? 'VIAJE PROGRAMADO' : (req.vehicleType === 'moto' ? 'SOLICITUD MOTOTAXI' : 'SOLICITUD TAXI')}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-2xl font-black text-emerald-600">${(req.price || 0).toFixed(2)}</div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDismissRequest(req.id)}
                                                    title="Omitir viaje"
                                                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-all active:scale-95 ml-1"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
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
                                                </div>
                                            </div>

                                            {/* Datos del Destinatario (Para Envíos / Paquetería) */}
                                            {((req.serviceType === 'package' || req.packageType) || req.receiver_name || req.mandado_details?.receiver_name) && (
                                                <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 space-y-2 mt-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                                            <Package className="w-3.5 h-3.5 text-amber-600" />
                                                            Datos del Destinatario (Entrega)
                                                        </span>
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                                                            Paquetería
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-slate-900">
                                                            {req.mandado_details?.receiver_name || req.receiver_name || req.recipient_name || 'Nombre no especificado'}
                                                        </p>
                                                        {(req.mandado_details?.receiver_phone || req.receiver_phone || req.recipient_phone) && (
                                                            <p className="text-xs text-slate-600 font-bold mt-0.5">
                                                                Tel: {req.mandado_details?.receiver_phone || req.receiver_phone || req.recipient_phone}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {req.mandado_details?.package_description && (
                                                        <p className="text-[11px] text-amber-950 font-medium italic bg-white/80 p-2 rounded-xl border border-amber-100">
                                                            "{req.mandado_details?.package_description}"
                                                        </p>
                                                    )}
                                                </div>
                                            )}
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
                                                disabled={processingAction !== null || hasReachedServiceLimit}
                                                className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-primary/40"
                                            >
                                                {processingAction === req.id ? (
                                                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                ) : hasReachedServiceLimit ? (
                                                    'LÍMITE ALCANZADO (2/2)'
                                                ) : (
                                                    'ACEPTAR VIAJE'
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDismissRequest(req.id)}
                                                className="w-full py-3 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-bold text-xs uppercase tracking-wider rounded-2xl border border-slate-200 hover:border-rose-200 active:scale-98 transition-all flex items-center justify-center gap-1.5"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                                <span>Omitir / Rechazar viaje</span>
                                            </button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    )}

                    {/* Lista de Deliveries: Envíos y Comida (Visible en "Todos" y "Deliveries") */}
                    {(activeTab === 'all' || activeTab === 'deliveries') && (
                        <AnimatePresence mode="popLayout">
                            {/* Envíos de Paquete */}
                            {visibleTransport.filter(r => r.type === 'package_delivery' || r.type === 'food_delivery').map(req => {
                                const isDirectlyAssigned = req.assigned_driver_id === user?.uid;

                                return (
                                    <motion.div
                                        key={req.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className={`bg-white rounded-[2.5rem] p-6 shadow-xl relative overflow-hidden group ${
                                            isDirectlyAssigned 
                                                ? 'border-2 border-amber-400 ring-2 ring-amber-400/20 shadow-amber-500/10' 
                                                : 'border-2 border-primary/10 shadow-slate-200/50'
                                        }`}
                                    >
                                        {isDirectlyAssigned && (
                                            <div className="bg-amber-400/20 border border-amber-400 text-amber-950 px-3.5 py-2 rounded-2xl text-xs font-black flex items-center gap-2 mb-4 animate-pulse">
                                                <Star className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                                                <span>⭐ ENVÍO ASIGNADO DIRECTAMENTE A TI POR EL CLIENTE</span>
                                            </div>
                                        )}

                                        <div className="flex justify-between items-center mb-6 relative">
                                            <div className="flex items-center gap-2 px-3 py-1 bg-amber-400 text-slate-900 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg shadow-amber-400/20">
                                                <Package className="w-3.5 h-3.5" />
                                                ENVÍO DE PAQUETE
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-2xl font-black text-emerald-600">${(req.price || 0).toFixed(2)}</div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDismissRequest(req.id)}
                                                    title="Omitir envío"
                                                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-all active:scale-95 ml-1"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-4 mb-8 relative">
                                            <div className="flex items-start gap-4">
                                                <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 shadow-inner">
                                                    <Navigation className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Recoger Paquete:</p>
                                                    <p className="font-bold text-slate-700 leading-tight mt-0.5">{req.origin?.address}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-4">
                                                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-inner">
                                                    <MapPin className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Destinatario:</p>
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
                                                    {req.packageDescription && (
                                                        <div className="mt-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
                                                            <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Descripción del paquete:</p>
                                                            <p className="font-bold text-slate-800 text-xs mt-0.5">{req.packageDescription}</p>
                                                        </div>
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
                                                disabled={processingAction !== null || hasReachedServiceLimit}
                                                className="w-full bg-amber-400 text-slate-950 font-black py-4 rounded-2xl shadow-lg shadow-amber-400/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {processingAction === req.id ? (
                                                    <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                                                ) : hasReachedServiceLimit ? (
                                                    'LÍMITE ALCANZADO (2/2)'
                                                ) : (
                                                    'ACEPTAR ENVÍO'
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDismissRequest(req.id)}
                                                className="w-full py-3 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-bold text-xs uppercase tracking-wider rounded-2xl border border-slate-200 hover:border-rose-200 active:scale-98 transition-all flex items-center justify-center gap-1.5"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                                <span>Omitir / Rechazar envío</span>
                                            </button>
                                        </div>
                                    </motion.div>
                                );
                            })}

                            {/* Repartos de Comida de Tiendas */}
                            {visibleOrders.map(order => (
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
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col items-end">
                                                <div className="text-2xl font-black text-emerald-600">${(order.driverPayout || order.deliveryFee || 0).toFixed(2)}</div>
                                                <div className="text-[10px] font-black text-primary uppercase mt-0.5 tracking-wider">Ganancia</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDismissRequest(order.id)}
                                                title="Omitir pedido"
                                                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-all active:scale-95 ml-1"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4 mb-8 relative">
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100">
                                                <Bike className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Tienda / Local:</p>
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
                                            disabled={processingAction !== null || hasReachedServiceLimit}
                                            className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex items-center justify-center h-16 disabled:opacity-50 disabled:cursor-not-allowed group-hover:bg-primary"
                                        >
                                            {processingAction === order.id ? (
                                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            ) : hasReachedServiceLimit ? (
                                                'LÍMITE ALCANZADO (2/2)'
                                            ) : (
                                                'TOMAR REPARTO'
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDismissRequest(order.id)}
                                            className="w-full py-3 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-bold text-xs uppercase tracking-wider rounded-2xl border border-slate-200 hover:border-rose-200 active:scale-98 transition-all flex items-center justify-center gap-1.5"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                            <span>Omitir / Rechazar reparto</span>
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            )}

            {/* Modal de Vista Previa del Comprobante */}
            {previewProofUrl && (
                <div 
                    className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200" 
                    onClick={() => setPreviewProofUrl(null)}
                >
                    <button
                        type="button"
                        onClick={() => setPreviewProofUrl(null)}
                        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
                        title="Cerrar vista previa"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    <img 
                        src={previewProofUrl} 
                        alt="Comprobante de pago" 
                        className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" 
                    />
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
