import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DeliveryDriver } from '../lib/delivery-service';
import toast from 'react-hot-toast';
import { Navigation, Clock, CheckCircle2, Phone, ArrowLeft, Car, ShieldCheck, MessageCircle, Star, XCircle, MapPin, Package, Copy, AlertTriangle, Wind, Music, Wifi, BatteryCharging, AlertCircle, X, ShoppingBag, Shield, CreditCard, Sparkles } from 'lucide-react';
import LiveTripMap from '../components/LiveTripMap';

import RideChat from '../components/RideChat';
import InAppCall from '../components/InAppCall';
import { playChatChime, playCallAlertChime, playTripStatusChime } from '../utils/audioChimes';
import { sendAppNotification } from '../services/nativeNotificationService';
import { UN2X3_LOGO } from '../lib/env';
import { isNightTime, getWeatherByCoordinates, WeatherInfo } from '../lib/weather';
import RainOverlay from '../components/RainOverlay';
import { useCurrency } from '../context/CurrencyContext';
import { useBranding } from '../context/BrandingContext';

export default function TransportTracker() {
    const { requestId } = useParams();
    const navigate = useNavigate();
    const { bcvRate } = useCurrency();
    const { branding } = useBranding();
    const [request, setRequest] = useState<any>(null);
    const [driver, setDriver] = useState<DeliveryDriver | null>(null);
    const [loading, setLoading] = useState(true);
    const location = useLocation();
    const [showChat, setShowChat] = useState(new URLSearchParams(location.search).get('chat') === 'true');
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [comment, setComment] = useState('');
    const [submittingRating, setSubmittingRating] = useState(false);
    const [hasRated, setHasRated] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    // Map expansion
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    // In-app call
    const [showCall, setShowCall] = useState(false);
    const [showIncomingCall, setShowIncomingCall] = useState(false);
    const [incomingOffer, setIncomingOffer] = useState<any>(null);
    // Cancellation modal
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancellingTrip, setCancellingTrip] = useState(false);
    // Lost items
    const [showLostItem, setShowLostItem] = useState(false);
    const [lostItemDesc, setLostItemDesc] = useState('');
    const [lostItemPhoto, setLostItemPhoto] = useState<File | null>(null);
    const [lostItemPhotoPreview, setLostItemPhotoPreview] = useState<string | null>(null);
    const [submittingLost, setSubmittingLost] = useState(false);
    const [lostItemSent, setLostItemSent] = useState(false);
    const [showVehicleModal, setShowVehicleModal] = useState(false);

    // Modal de Selección de Método de Pago (Transporte Rápido y viajes activos)
    const [showPaymentPickerModal, setShowPaymentPickerModal] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'pago_movil' | 'cash_ves' | 'cash_usd'>('cash_usd');
    const [updatingPaymentMethod, setUpdatingPaymentMethod] = useState(false);
    const hasAutoOpenedPaymentModal = useRef(false);
    
    // Notification sound
    const notificationSoundUrl = useRef<string | null>(null);
    const prevStatus = useRef<string | null>(null);
    const lastChatIdSeen = useRef<string | null>(null);

    // Weather & Night Theme State
    const [isNight, setIsNight] = useState<boolean>(isNightTime());
    const [weather, setWeather] = useState<WeatherInfo | null>(null);

    useEffect(() => {
        const updateNight = () => setIsNight(isNightTime());
        const interval = setInterval(updateNight, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (request?.origin?.lat && request?.origin?.lng) {
            getWeatherByCoordinates(request.origin.lat, request.origin.lng)
                .then(w => setWeather(w))
                .catch(console.error);
        }
    }, [request?.origin]);

    // Map states
    const [routeInfo, setRouteInfo] = useState<{ distance: string, duration: string } | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [mandadoBids, setMandadoBids] = useState<any[]>([]);
    const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);
    const [showTipsModal, setShowTipsModal] = useState(false);
    const [cameraMode, setCameraMode] = useState<'user' | 'driver' | 'fit'>('fit');

    // Robust memoized coordinates for user pickup origin, destination, and driver
    const originCoords = React.useMemo(() => {
        if (!request?.origin) return null;
        const lat = Number(request.origin.lat ?? request.origin.latitude ?? request.origin.coords?.lat);
        const lng = Number(request.origin.lng ?? request.origin.longitude ?? request.origin.coords?.lng);
        return (!isNaN(lat) && !isNaN(lng) && lat !== 0) ? { lat, lng } : null;
    }, [request?.origin]);

    const destCoords = React.useMemo(() => {
        if (!request?.destination) return null;
        const lat = Number(request.destination.lat ?? request.destination.latitude ?? request.destination.coords?.lat);
        const lng = Number(request.destination.lng ?? request.destination.longitude ?? request.destination.coords?.lng);
        return (!isNaN(lat) && !isNaN(lng) && lat !== 0) ? { lat, lng } : null;
    }, [request?.destination]);

    const driverCoords = React.useMemo(() => {
        const loc = driver?.currentLocation || (driver as any)?.current_location;
        if (!loc) return null;
        const lat = Number(loc.latitude ?? (loc as any).lat ?? loc.coords?.lat);
        const lng = Number(loc.longitude ?? (loc as any).lng ?? loc.coords?.lng);
        return (!isNaN(lat) && !isNaN(lng) && lat !== 0) ? { lat, lng } : null;
    }, [driver?.currentLocation, (driver as any)?.current_location]);

    const handleRecenterUser = () => {
        setCameraMode('user');
    };

    const handleFocusDriver = () => {
        setCameraMode('driver');
    };

    const handleFitBoth = () => {
        setCameraMode('fit');
    };

    // Fetch and subscribe to bids if muchacho_mandado and searching
    useEffect(() => {
        if (!requestId || request?.service_category !== 'muchacho_mandado' || request?.status !== 'searching') return;

        const fetchBids = async () => {
            const { data } = await supabase
                .from('transport_bids')
                .select('*')
                .or(`transport_request_id.eq.${requestId},request_id.eq.${requestId}`)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            if (data) setMandadoBids(data);
        };

        fetchBids();

        const channel = supabase.channel(`tracker_bids_${requestId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'transport_bids'
            }, (payload: any) => {
                const b = payload.new || payload.old;
                if (!b || b.transport_request_id === requestId || b.request_id === requestId) {
                    fetchBids();
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [requestId, request?.service_category, request?.status]);

    const handleAcceptMandadoBid = async (bid: any) => {
        if (!requestId) return;
        setAcceptingBidId(bid.id);
        try {
            // Obtener datos completos del chofer (Pago Móvil y documentos)
            const { data: driverData } = await supabase
                .from('drivers')
                .select('*')
                .eq('id', bid.driver_id)
                .maybeSingle();

            const realPhoto = bid.driver_photo || driverData?.documents?.selfieUrl || null;
            const paymentMobile = driverData?.payment_mobile || bid.driver_payment_info || null;

            // 1. Accept bid
            await supabase.from('transport_bids').update({ status: 'accepted' }).eq('id', bid.id);
            // 2. Reject others
            await supabase.from('transport_bids').update({ status: 'rejected' })
                .or(`transport_request_id.eq.${requestId},request_id.eq.${requestId}`)
                .neq('id', bid.id);
            // 3. Assign driver
            const { error: updErr } = await supabase.from('transport_requests').update({
                status: 'accepted',
                driver_id: bid.driver_id,
                driver_name: bid.driver_name || driverData?.full_name || 'Conductor',
                driver_phone: bid.driver_phone || driverData?.phone || '',
                driver_photo: realPhoto,
                driver_assigned_at: new Date().toISOString(),
                driver_payment_info: paymentMobile,
                driver_vehicle_details: {
                    type: bid.vehicle_type || driverData?.vehicle_type,
                    brand: bid.vehicle_brand || driverData?.vehicle_brand,
                    model: bid.vehicle_model || driverData?.vehicle_model,
                    year: bid.vehicle_year || driverData?.vehicle_year,
                    color: bid.vehicle_color || driverData?.vehicle_color,
                    plate: bid.vehicle_plate || driverData?.vehicle_plate,
                    has_ac: bid.has_ac ?? driverData?.has_ac ?? false,
                    has_thermal_bag: bid.has_thermal_bag ?? driverData?.has_thermal_bag ?? false
                },
                price: Number(bid.amount),
                total: Number(bid.amount),
                commission_amount: 0.70
            }).eq('id', requestId);

            if (updErr) {
                console.error("Error al actualizar transport_requests:", updErr);
                throw updErr;
            }

            // Sincronizar inmediatamente el estado local del viaje
            setRequest((prev: any) => ({
                ...prev,
                status: 'accepted',
                driver_id: bid.driver_id,
                driver_name: bid.driver_name || driverData?.full_name,
                driver_phone: bid.driver_phone || driverData?.phone,
                driver_photo: realPhoto,
                driver_payment_info: paymentMobile,
                price: Number(bid.amount),
                total: Number(bid.amount)
            }));

            toast.success(`¡Oferta de ${bid.driver_name} aceptada!`);
        } catch (err: any) {
            console.error('Error accepting bid in tracker:', err);
            toast.error(err?.message || 'Error al aceptar la oferta.');
        } finally {
            setAcceptingBidId(null);
        }
    };


    useEffect(() => {
        if (!requestId) return;

        supabase.from('transport_requests').select('*').eq('id', requestId).maybeSingle().then(({ data }) => {
            if (data) setRequest(data);
            setLoading(false);
        });

        const channel = supabase.channel(`tr_req_${requestId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'transport_requests',
                filter: `id=eq.${requestId}`
            }, (payload) => {
                if (payload.new) setRequest(payload.new);
            })
            .subscribe();

        // Polling de respaldo cada 3 segundos para garantizar sincronización inmediata de tarifa y estado
        const pollInterval = setInterval(async () => {
            const { data } = await supabase
                .from('transport_requests')
                .select('*')
                .eq('id', requestId)
                .maybeSingle();
            if (data) {
                setRequest((prev: any) => {
                    if (prev && Number(prev.price) !== Number(data.price) && Number(data.price) > 0) {
                        toast.success(`Tarifa acordada actualizada a $${Number(data.price).toFixed(2)} USD`, { icon: '💵' });
                    }
                    return data;
                });
            }
        }, 3000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [requestId]);

    // Auto-abrir modal de métodos de pago cuando el conductor acepte solicitud de Transporte Rápido
    useEffect(() => {
        if (!request) return;
        const isQuick = Boolean(request?.notes?.includes('Transporte Rápido'));
        const isAccepted = ['accepted', 'arriving', 'in_progress'].includes(request?.status);

        if (isQuick && isAccepted && !hasAutoOpenedPaymentModal.current && !request.payment_method) {
            hasAutoOpenedPaymentModal.current = true;
            setSelectedPaymentMethod(
                request.payment_method === 'cash_ves' 
                    ? 'cash_ves' 
                    : request.payment_method === 'pago_movil' 
                    ? 'pago_movil' 
                    : 'cash_usd'
            );
            setShowPaymentPickerModal(true);
        }
    }, [request?.status, request?.notes, request?.payment_method]);

    const handleSavePaymentMethod = async (method: 'pago_movil' | 'cash_ves' | 'cash_usd') => {
        if (!requestId) return;
        setUpdatingPaymentMethod(true);
        try {
            const currency = method === 'cash_ves' ? 'BS' : 'USD';
            const { error } = await supabase.from('transport_requests').update({
                payment_method: method,
                cash_currency: currency,
                updated_at: new Date().toISOString()
            }).eq('id', requestId);

            if (error) throw error;

            setRequest((prev: any) => ({
                ...prev,
                payment_method: method,
                cash_currency: currency
            }));

            toast.success(
                method === 'pago_movil' 
                    ? 'Método de pago: Pago Móvil Conductor confirmado' 
                    : method === 'cash_ves' 
                    ? 'Método de pago: Bs. Efectivo confirmado' 
                    : 'Método de pago: Divisa ($ USD) confirmado'
            );
            setShowPaymentPickerModal(false);
        } catch (err: any) {
            console.error('Error al actualizar método de pago:', err);
            toast.error('No se pudo guardar el método de pago: ' + (err?.message || 'Error de conexión'));
        } finally {
            setUpdatingPaymentMethod(false);
        }
    };

    // Escuchar los cambios del conductor en tiempo real (usando la tabla física 'drivers' y 'driver_locations')
    useEffect(() => {
        const driverId = request?.driverId || request?.driver_id;
        if (!driverId) return;

        const mapDriverData = (data: any): DeliveryDriver => {
            return {
                id: data.id,
                fullName: data.full_name || data.fullName || 'Conductor',
                phone: data.phone || '',
                vehicleType: data.vehicle_type || data.vehicleType || 'carro',
                vehiclePlate: data.vehicle_plate || data.vehiclePlate || '',
                vehicleColor: data.vehicle_color || data.vehicleColor || '',
                hasAc: data.has_ac ?? data.hasAc ?? false,
                rating: data.rating ? Number(data.rating) : 5.0,
                totalTrips: data.total_trips || data.totalTrips || 0,
                currentLocation: data.current_location || data.currentLocation || null,
                documents: data.documents || {},
                ...data
            } as DeliveryDriver;
        };

        // 1. Cargar datos iniciales desde la tabla física 'drivers' y sincronizar nombre con el perfil registrado
        supabase.from('drivers').select('*').eq('id', driverId).maybeSingle().then(async ({ data }) => {
            let driverInfo = data;
            if (!driverInfo) {
                const { data: fallbackData } = await supabase.from('delivery_drivers').select('*').eq('id', driverId).maybeSingle();
                driverInfo = fallbackData;
            }
            if (driverInfo) {
                try {
                    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', driverId).maybeSingle();
                    if (prof?.full_name && prof.full_name.trim()) {
                        driverInfo.full_name = prof.full_name;
                        driverInfo.fullName = prof.full_name;
                    }
                } catch (pe) {
                    console.warn("Could not fetch profile full_name for driver:", pe);
                }
                setDriver(mapDriverData(driverInfo));
            }
        });

        // 2. Suscripción en tiempo real a 'drivers' (las vistas en Postgres no disparan eventos CDC)
        const dChannel = supabase.channel(`tr_driver_${driverId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'drivers',
                filter: `id=eq.${driverId}`
            }, async (payload) => {
                if (payload.new) {
                    let updatedDriver = { ...payload.new };
                    try {
                        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', driverId).maybeSingle();
                        if (prof?.full_name && prof.full_name.trim()) {
                            updatedDriver.full_name = prof.full_name;
                            updatedDriver.fullName = prof.full_name;
                        }
                    } catch (e) {}
                    setDriver(prev => ({
                        ...(prev || {}),
                        ...mapDriverData(updatedDriver)
                    }));
                }
            })
            .subscribe();

        // 3. Suscripción a coordenadas en tiempo real en 'driver_locations'
        const locChannel = supabase.channel(`tr_driver_loc_${driverId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'driver_locations',
                filter: `driver_id=eq.${driverId}`
            }, (payload) => {
                if (payload.new) {
                    const loc: any = payload.new;
                    setDriver((prev: any) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            currentLocation: {
                                latitude: loc.latitude,
                                longitude: loc.longitude
                            }
                        };
                    });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(dChannel);
            supabase.removeChannel(locChannel);
        };
    }, [request?.driverId, request?.driver_id]);

    // Fetch notification sound
    useEffect(() => {
        const { data } = supabase.storage.from('store_assets').getPublicUrl('Digital_Cascade_01.mp3');
        notificationSoundUrl.current = data?.publicUrl || '/sounds/notification.mp3';
    }, []);

    // Real-time user location tracking (Blue Dot)
    useEffect(() => {
        let watchId: number;
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    setUserLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    });
                },
                (err) => console.warn("Error watching user location:", err),
                { enableHighAccuracy: true }
            );
        }
        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
        };
    }, []);

    // Monitor status changes for notification sound
    useEffect(() => {
        if (!request?.status) return;

        const notifyStatuses = ['accepted', 'arriving', 'in_progress', 'completed'];
        
        // Si el estado cambia a uno de los estados de notificación y es un cambio real
        if (notifyStatuses.includes(request.status) && prevStatus.current && prevStatus.current !== request.status) {
            // Obtener info del estado para la alerta
            const info = getStatusInfo();
            
            // Disparar Notificación Nativa completa: Sonido de cliente, vibración háptica, barra de notificaciones del dispositivo y modal emergente
            sendAppNotification({
                title: info.title || 'Actualización de Viaje',
                body: info.subtitle || 'El estado de tu viaje ha cambiado.',
                soundType: 'client'
            });
        }
        
        prevStatus.current = request.status;
    }, [request?.status]);

    // Chat notifications for passenger
    useEffect(() => {
        if (!requestId || showChat) {
            if (showChat) setUnreadCount(0);
            return;
        }

        const chatPath = `transport_requests/${requestId}`;

        // Cargar mensajes sin leer iniciales
        const fetchInitialUnread = async () => {
            try {
                const reqUserId = request?.userId || request?.user_id;
                const lastReadTime = sessionStorage.getItem(`last_chat_read_${requestId}`);
                let query = supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .or(`chat_path.eq.${chatPath},order_id.eq.${requestId}`);

                if (reqUserId) {
                    query = query.neq('sender_id', reqUserId);
                }
                if (lastReadTime) {
                    query = query.gt('created_at', lastReadTime);
                }
                const { count } = await query;
                if (count && count > 0) {
                    setUnreadCount(count);
                }
            } catch (err) {
                console.warn('Error fetching initial unread messages:', err);
            }
        };

        fetchInitialUnread();

        const channel = supabase.channel(`passenger_chat_notif_${requestId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                if (payload.new) {
                    const data: any = payload.new;
                    const isForThisChat = data.order_id === requestId || data.orderId === requestId || data.chat_path === chatPath;
                    const reqUserId = request?.userId || request?.user_id;
                    const senderId = data.sender_id || data.senderId;

                    if (isForThisChat && senderId && senderId !== reqUserId) {
                        playChatChime();

                        toast((t) => (
                            <div className="flex flex-col gap-1 p-1">
                                <p className="font-black text-slate-900 text-sm flex items-center gap-2">
                                    <MessageCircle className="w-4 h-4 text-orange-500" />
                                    Nuevo Mensaje del Conductor
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

                        setUnreadCount(prev => prev + 1);
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [requestId, showChat, request?.userId, request?.user_id]);

    // Escuchar llamadas entrantes del conductor en la app
    useEffect(() => {
        if (!requestId) return;
        const myId = request?.userId || request?.user_id;
        const channel = supabase.channel(`call_${requestId}`, {
            config: { broadcast: { self: false } }
        });

        channel
            .on('broadcast', { event: 'signal' }, ({ payload }) => {
                if (payload?.type === 'offer' && (!myId || payload.from !== myId)) {
                    setIncomingOffer(payload.offer);
                    setShowIncomingCall(true);
                    playCallAlertChime();
                } else if (payload?.type === 'status' && payload.status === 'ended') {
                    setShowIncomingCall(false);
                    setIncomingOffer(null);
                }
            })
            .on('broadcast', { event: 'fare_updated' }, ({ payload }) => {
                if (payload?.fare || payload?.price) {
                    const newPrice = Number(payload.fare || payload.price);
                    setRequest((prev: any) => prev ? ({
                        ...prev,
                        price: newPrice,
                        total: newPrice,
                        fare: newPrice,
                        status: 'in_progress'
                    }) : prev);
                    toast.success(`¡Tarifa acordada actualizada a $${newPrice.toFixed(2)} USD!`, { icon: '💵' });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [requestId, request?.userId, request?.user_id]);

    useEffect(() => {
        if (request && ['cancelled'].includes(request.status)) {
            setShowChat(false);
        }
    }, [request?.status]);

    // Rating tags by star range
    const POSITIVE_TAGS = [
        { id: 'buena_musica', label: '🎵 Buena música' },
        { id: 'vehiculo_limpio', label: '✨ Vehículo limpio' },
        { id: 'buena_conversacion', label: '💬 Buena conversación' },
        { id: 'llego_rapido', label: '⚡ Llegó rápido' },
        { id: 'manejo_seguro', label: '🛡️ Manejo seguro' },
        { id: 'puntual', label: '⏱️ Muy puntual' },
    ];
    const NEGATIVE_TAGS = [
        { id: 'sin_musica', label: '🔇 Sin música' },
        { id: 'vehiculo_sucio', label: '🤢 Vehículo sucio' },
        { id: 'poco_amable', label: '😶 Poco amable' },
        { id: 'llego_tarde', label: '🐢 Llegó tarde' },
        { id: 'manejo_brusco', label: '😰 Manejo brusco' },
        { id: 'no_puntual', label: '⏰ Impuntual' },
    ];

    const toggleTag = (id: string) => {
        setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
    };

    const handleRateTrip = async () => {
        if (!requestId || rating === 0) return;
        setSubmittingRating(true);
        try {
            await supabase.from('transport_requests').update({
                rating,
                ratingTags: selectedTags,
                rating_tags: selectedTags,
                ratingComment: comment,
                rating_comment: comment,
                ratedAt: new Date().toISOString(),
                rated_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', requestId);

            // Dynamically recalculate driver's overall rating
            const driverId = request?.driverId || (request as any)?.driver_id;
            if (driverId) {
                const [ordersRes, trRes] = await Promise.all([
                    supabase.from('orders').select('rating').eq('delivery_driver_id', driverId).not('rating', 'is', null),
                    supabase.from('transport_requests').select('rating').eq('driver_id', driverId).not('rating', 'is', null)
                ]);
                const allRatings = [
                    ...(ordersRes.data || []).map((o: any) => Number(o.rating)),
                    ...(trRes.data || []).map((t: any) => Number(t.rating)),
                    rating
                ].filter(r => !isNaN(r) && r > 0);

                if (allRatings.length > 0) {
                    const avg = Number((allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1));
                    await supabase.from('drivers').update({
                        rating: avg,
                        updated_at: new Date().toISOString()
                    }).eq('id', driverId);
                }
            }

            setHasRated(true);
            toast.success("¡Gracias por tu calificación!");
        } catch (error) {
            console.error("Error rating trip:", error);
            toast.error("Error al enviar calificación");
        } finally {
            setSubmittingRating(false);
        }
    };

    const handleLostItem = async () => {
        if (!requestId || !request || !lostItemDesc.trim()) return;
        setSubmittingLost(true);
        try {
            let uploadedPhotoUrl: string | null = null;
            if (lostItemPhoto) {
                const ext = lostItemPhoto.name.split('.').pop() || 'jpg';
                const filePath = `lost_items/${requestId}_${Date.now()}.${ext}`;
                const { error: uploadErr } = await supabase.storage
                    .from('store_assets')
                    .upload(filePath, lostItemPhoto, { cacheControl: '3600', upsert: true });

                if (!uploadErr) {
                    const { data } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                    uploadedPhotoUrl = data?.publicUrl || null;
                }
            }

            await supabase.from('lost_items').insert({
                id: crypto.randomUUID(),
                request_id: requestId,
                requestId: requestId,
                user_id: request.userId || request.user_id,
                userId: request.userId || request.user_id,
                driver_id: request.driverId || request.driver_id,
                driverId: request.driverId || request.driver_id,
                description: lostItemDesc.trim(),
                image_url: uploadedPhotoUrl,
                contact_phone: request.user_phone || request.userPhone || null,
                status: 'pending',
                created_at: new Date().toISOString(),
                createdAt: new Date().toISOString()
            });

            // Notificar al conductor y soporte en el canal de chat tripartito
            await supabase.from('messages').insert({
                chat_path: `transport_requests/${requestId}`,
                order_id: requestId,
                text: `🎒 [OBJETO EXTRAVIADO]: ${lostItemDesc.trim()}`,
                image_url: uploadedPhotoUrl,
                action: 'lost_item',
                sender_id: request.userId || request.user_id,
                sender_name: request.passenger_name || 'Pasajero',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });

            setLostItemSent(true);
            setShowLostItem(false);
            setLostItemPhoto(null);
            setLostItemPhotoPreview(null);
            toast.success('Reporte enviado al conductor y soporte central.');
        } catch (err) {
            console.error(err);
            toast.error('Error al enviar reporte.');
        } finally {
            setSubmittingLost(false);
        }
    };

    const handleCopy = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success(`${label} copiado`);
    };

    const handleConfirmCancelTrip = async () => {
        if (!requestId || !request) return;
        setCancellingTrip(true);
        try {
            const isArriving = request.status === 'arriving';
            const isQuickTransport = Boolean(
                request.notes?.includes('Transporte Rápido') || 
                (request as any).is_quick_transport || 
                request.destination?.address?.includes('convenir')
            );
            const numPrice = parseFloat(request.price || request.total || 0);
            const numComm = parseFloat(request.commission_amount || 0);

            // Audio 6: Si es Transporte Rápido y el conductor llegó pero el usuario cancela porque no acordaron tarifa,
            // no se le cobra ninguna penalidad ($0) y se cierra automáticamente el servicio sin deudas.
            if (isArriving && !isQuickTransport) {
                const penaltyPrice = Math.round((numPrice * 0.5) * 100) / 100;
                const penaltyCommission = Math.round((numComm * 0.5) * 100) / 100;
                await supabase.from('transport_requests').update({
                    status: 'cancelled',
                    cancellation_penalty_applied: true,
                    price: penaltyPrice,
                    total: penaltyPrice,
                    commission_amount: penaltyCommission,
                    cancellation_reason: 'Cancelado por cliente con chofer en sitio (penalidad 50%)',
                    cancelled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', requestId);
                toast.error("Viaje cancelado con penalidad del 50% por cancelación con conductor en punto de partida.");
            } else if (isQuickTransport) {
                await supabase.from('transport_requests').update({
                    status: 'cancelled',
                    cancellation_penalty_applied: false,
                    price: 0,
                    total: 0,
                    fare: 0,
                    commission_amount: 0,
                    cancellation_reason: 'Cancelado en punto de recogida (Transporte Rápido - Tarifa no acordada)',
                    cancelled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', requestId);
                toast.success("Solicitud de Transporte Rápido cancelada sin penalidad.");
            } else {
                await supabase.from('transport_requests').update({
                    status: 'cancelled',
                    cancellation_reason: 'Cancelado por el cliente',
                    cancelled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', requestId);
                toast.success("Viaje cancelado.");
            }

            // Notificar inmediatamente al canal del viaje para que la app del conductor se libere en tiempo real
            try {
                const cancelChan = supabase.channel(`call_${requestId}`);
                cancelChan.send({
                    type: 'broadcast',
                    event: 'trip_cancelled',
                    payload: { requestId, reason: isQuickTransport ? 'quick_transport_cancelled' : 'client_cancelled' }
                });
            } catch (broadcastErr) {
                console.warn("Could not broadcast cancellation:", broadcastErr);
            }

            // If mandado, remove bids
            if (request.service_category === 'muchacho_mandado') {
                await supabase.from('transport_bids').delete().or(`transport_request_id.eq.${requestId},request_id.eq.${requestId}`);
            }

            localStorage.removeItem('active_transport_req_id');
            setShowCancelModal(false);
            navigate('/');
        } catch (err) {
            console.error(err);
            toast.error("Error al cancelar viaje");
        } finally {
            setCancellingTrip(false);
        }
    };

    const handleCancelReservation = async () => {
        if (!requestId || !request) return;
        setCancellingTrip(true);
        try {
            await supabase.from('transport_requests').update({
                status: 'cancelled',
                cancellation_reason: 'Reserva cancelada por el cliente',
                cancelled_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', requestId);

            if (request.service_category === 'muchacho_mandado') {
                await supabase.from('transport_bids').delete().or(`transport_request_id.eq.${requestId},request_id.eq.${requestId}`);
            }
            localStorage.removeItem('active_transport_req_id');
            toast.success("Reserva cancelada con éxito");
            navigate('/');
        } catch (e) {
            console.error("Error al cancelar reserva:", e);
            toast.error("Error al cancelar la reserva");
        } finally {
            setCancellingTrip(false);
        }
    };





    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[100dvh] bg-slate-50">
                <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!request) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 text-center bg-slate-50">
                <Car className="w-16 h-16 text-slate-300 mb-4" />
                <h2 className="text-xl font-black text-slate-900 mb-2">Viaje no encontrado</h2>
                <button onClick={() => navigate('/taxi')} className="text-orange-500 font-bold">Volver</button>
            </div>
        );
    }

    const driverName = driver?.fullName || (driver as any)?.full_name || request?.driver_name || 'Tu conductor';

    const isPackageDelivery = Boolean(
        request?.type === 'package_delivery' ||
        request?.service_category === 'delivery_envios' ||
        request?.mandado_details?.receiver_name ||
        request?.receiver_name ||
        request?.recipient_name
    );

    const receiverName = request?.mandado_details?.receiver_name || request?.receiver_name || request?.recipient_name;
    const receiverPhone = request?.mandado_details?.receiver_phone || request?.receiver_phone || request?.recipient_phone;
    const senderName = request?.mandado_details?.sender_name || request?.sender_name || request?.user_name;
    const senderPhone = request?.mandado_details?.sender_phone || request?.sender_phone || request?.user_phone;
    const packageDesc = request?.package_description || request?.mandado_details?.package_description || request?.mandado_details?.package_notes || request?.notes;

    const getStatusInfo = () => {
        const hasDriver = Boolean(driver || request?.driver_id || request?.assigned_driver_id || request?.driverId);

        switch (request.status) {
            case 'driver_busy':
                return {
                    title: "Conductor Ocupado",
                    subtitle: request.rejection_reason || "El conductor seleccionado se encuentra ocupado. Por favor, selecciona otro disponible.",
                    color: "text-rose-600",
                    bg: "bg-rose-50",
                    icon: AlertCircle
                };
            case 'verifying_payment':
                return { title: "Verificando Pago", subtitle: "Validando tu comprobante...", color: "text-amber-500", bg: "bg-amber-50", icon: ShieldCheck };
            case 'searching':
                if (request.service_category === 'muchacho_mandado') {
                    return {
                        title: mandadoBids.length > 0 ? `${mandadoBids.length} ${mandadoBids.length === 1 ? 'Oferta de Piloto' : 'Ofertas de Pilotos'}` : "Buscando Pilotos",
                        subtitle: mandadoBids.length > 0 ? "Pilotos disponibles enviaron sus cotizaciones" : "Buscando pilotos disponibles en la zona...",
                        color: "text-amber-600",
                        bg: "bg-amber-50",
                        icon: ShoppingBag
                    };
                }
                if (isPackageDelivery) {
                    if (hasDriver) {
                        return {
                            title: "Repartidor Seleccionado",
                            subtitle: `${driverName} está revisando tu encomienda`,
                            color: "text-amber-600",
                            bg: "bg-amber-50",
                            icon: Package
                        };
                    }
                    return { 
                        title: "Buscando repartidor...", 
                        subtitle: "Conectando con pilotos de encomienda cercanos en el radar...", 
                        color: "text-blue-600", 
                        bg: "bg-blue-50", 
                        icon: Package 
                    };
                }
                if (hasDriver) {
                    return {
                        title: "Conductor Seleccionado",
                        subtitle: `${driverName} está revisando tu solicitud para iniciar el viaje`,
                        color: "text-amber-600",
                        bg: "bg-amber-50",
                        icon: Clock
                    };
                }
                return { title: "Buscando tu transporte...", subtitle: "Conectando con conductores cercanos en el radar...", color: "text-orange-600", bg: "bg-orange-50", icon: Clock };
            case 'accepted':
                return { 
                    title: isPackageDelivery ? "Repartidor en Camino" : "Conductor en Camino", 
                    subtitle: `${driverName} va en camino hacia ${isPackageDelivery ? 'el punto de recogida' : 'tu ubicación'}`, 
                    color: "text-blue-600", 
                    bg: "bg-blue-50", 
                    icon: isPackageDelivery ? Package : Car 
                };
            case 'arriving':
                return { 
                    title: isPackageDelivery ? "¡Repartidor en el punto!" : "¡El transporte está afuera!", 
                    subtitle: `${driverName} ha llegado y te está esperando afuera`, 
                    color: "text-amber-600", 
                    bg: "bg-amber-100", 
                    icon: MapPin 
                };
            case 'in_progress':
                return { 
                    title: isPackageDelivery ? "Encomienda en Traslado" : "Viaje en Curso", 
                    subtitle: isPackageDelivery ? "El paquete va en camino hacia el destinatario" : "Te diriges a tu destino con monitoreo en vivo", 
                    color: "text-emerald-600", 
                    bg: "bg-emerald-50", 
                    icon: Navigation 
                };
            case 'completed':
                return { 
                    title: isPackageDelivery ? "Encomienda Entregada" : "Viaje Completado", 
                    subtitle: isPackageDelivery ? "El paquete ha sido entregado con éxito al destinatario" : "Has llegado a tu destino con éxito", 
                    color: "text-slate-900", 
                    bg: "bg-slate-100", 
                    icon: CheckCircle2 
                };
            case 'cancelled':
                return { title: isPackageDelivery ? "Envío Cancelado" : "Viaje Cancelado", subtitle: request.cancellation_reason || "Esta solicitud fue cancelada", color: "text-red-500", bg: "bg-red-50", icon: XCircle };
            default:
                return { title: "Procesando", subtitle: "Por favor espera", color: "text-slate-500", bg: "bg-slate-50", icon: Clock };
        }
    };

    const statusInfo = getStatusInfo();
    const StatusIcon = statusInfo.icon;

    return (
        <div className="relative h-[100dvh] bg-slate-100 overflow-hidden flex flex-col">

            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 z-20 p-4 pointer-events-none">
                <button
                    onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')}
                    className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform text-slate-700 pointer-events-auto"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
            </div>

            {/* Map/Logo Area */}
            <div className="flex-1 relative z-0 flex items-center justify-center bg-slate-50">
                {['completed', 'cancelled'].includes(request.status) ? (
                    <div className="flex flex-col items-center justify-center gap-4 animate-fade-in px-6 w-full h-full pb-20">
                        <div className="w-32 h-32 bg-white rounded-3xl shadow-xl shadow-primary/20 p-5 flex items-center justify-center">
                            <img
                                src={branding.app_client_logo || UN2X3_LOGO}
                                onError={(e: any) => { e.currentTarget.src = '/logo.png'; }}
                                alt={`${branding.app_client_name || 'Un 2x3'} Logo`}
                                className="w-full h-full object-contain animate-bounce-subtle"
                            />
                        </div>
                        <div className="text-center bg-white/60 backdrop-blur-md p-4 rounded-xl shadow-sm border border-white/50">
                            <h3 className="text-lg font-black text-slate-900 mb-1">
                                {request.status === 'completed' ? '¡Llegamos a tu destino!' : 'Viaje Cancelado'}
                            </h3>
                            <p className="text-slate-500 font-bold max-w-[250px] text-xs">
                                {request.status === 'completed' ? 'Gracias por usar el servicio de taxi express.' : 'Esta solicitud ya no está activa.'}
                            </p>
                        </div>
                    </div>
                ) : !showChat ? (
                    <div className="w-full h-full relative">
                        {/* Interactive Map (Mapbox GL LiveTripMap) */}
                        <div className="absolute inset-0 z-0" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                            <LiveTripMap
                                origin={originCoords}
                                destination={destCoords}
                                driverLocation={driverCoords || (userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null)}
                                vehicleType={request.vehicle_type || 'carro'}
                                driverName={driverName}
                                showControls={false}
                                cameraFocus={cameraMode}
                                onRouteCalculated={(info) => setRouteInfo({ 
                                    distance: info.distance, 
                                    duration: (!info.duration || info.duration.includes('undefined')) ? '~5 min' : info.duration 
                                })}
                            />
                        </div>

                        {/* Overlay to ensure back button is visible on the map */}
                        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/25 to-transparent z-10 pointer-events-none"></div>

                        {/* Floating ETA Banner if driver is approaching or outside */}
                        {['accepted', 'arriving'].includes(request.status) && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-[90%]">
                                <div className="bg-slate-950/90 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full shadow-xl border border-amber-400/40 flex items-center gap-2 text-xs font-black animate-in fade-in slide-in-from-top-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                                    {request.status === 'arriving' ? (
                                        <span className="text-amber-400">¡Conductor afuera en el punto!</span>
                                    ) : (
                                        <span className="truncate">
                                            Conductor en camino {routeInfo ? `• ~${routeInfo.duration} (${routeInfo.distance})` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Floating Camera Controls: Center on user / driver / fit */}
                        <div className="absolute top-4 right-4 z-20 flex flex-col gap-1.5 pointer-events-auto">
                            {originCoords && (
                                <button
                                    type="button"
                                    onClick={handleRecenterUser}
                                    title="Centrar en mi ubicación de partida"
                                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-all active:scale-95 border ${
                                        cameraMode === 'user'
                                            ? 'bg-emerald-600 text-white border-emerald-500 ring-2 ring-emerald-300'
                                            : 'bg-white/95 text-slate-800 border-slate-200 hover:bg-white'
                                    }`}
                                >
                                    <MapPin className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
                                    <span>Mi Posición</span>
                                </button>
                            )}

                            {driverCoords && (
                                <button
                                    type="button"
                                    onClick={handleFocusDriver}
                                    title="Enfocar vehículo del conductor"
                                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-all active:scale-95 border ${
                                        cameraMode === 'driver'
                                            ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-300'
                                            : 'bg-white/95 text-slate-800 border-slate-200 hover:bg-white'
                                    }`}
                                >
                                    <Car className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                    <span>Chofer</span>
                                </button>
                            )}

                            {driverCoords && originCoords && (
                                <button
                                    type="button"
                                    onClick={handleFitBoth}
                                    title="Ver recorrido completo"
                                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-all active:scale-95 border ${
                                        cameraMode === 'fit'
                                            ? 'bg-blue-600 text-white border-blue-500 ring-2 ring-blue-300'
                                            : 'bg-white/95 text-slate-800 border-slate-200 hover:bg-white'
                                    }`}
                                >
                                    <Navigation className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Ver Ambos</span>
                                </button>
                            )}
                        </div>

                    </div>
                ) : null}
            </div>

            {/* Modal de Chat Integrado, estilo Bottom Sheet para que el mapa quede visible */}
            {showChat && (
                <div className="fixed inset-0 z-[100] bg-slate-900/40 flex flex-col justify-end animate-fade-in pointer-events-auto">
                    <div className="h-[75vh] w-full bg-white rounded-t-3xl overflow-hidden shadow-[0_-10px_40px_rgba(0,0,0,0.2)] animate-slide-up">
                        <RideChat 
                            requestId={requestId!} 
                            onClose={() => setShowChat(false)} 
                            onStartCall={() => { setShowChat(false); setShowCall(true); }}
                            driverPhone={driver?.phone}
                            serviceCategory={request?.service_category}
                            requestStatus={request?.status}
                            completedAt={request?.completed_at || (request as any)?.updated_at}
                        />
                    </div>
                </div>
            )}

            {/* Bottom Sheet con Manija de Arrastre / Despliegue */}
            <div className={`relative z-30 bg-white rounded-t-[28px] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] transition-all duration-300 ease-in-out ${
                isMapExpanded ? 'max-h-[140px] overflow-hidden pb-2' : 'max-h-[70vh] overflow-y-auto pb-6'
            } pt-2 px-4 sm:px-6`}>
                {/* Manija Interactiva: Tocar alterna entre pantalla completa y vista normal */}
                <button
                    type="button"
                    onClick={() => setIsMapExpanded(prev => !prev)}
                    className="w-full flex flex-col items-center justify-center py-1 cursor-pointer group focus:outline-none"
                    title={isMapExpanded ? "Deslizar para ver detalles del viaje" : "Deslizar para mapa en pantalla completa"}
                >
                    <div className="w-12 h-1.5 bg-slate-300 group-hover:bg-amber-500 rounded-full transition-colors mb-1"></div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 group-hover:text-amber-600 transition-colors">
                        {isMapExpanded ? "▲ Mostrar información del viaje" : "▼ Ampliar mapa en pantalla completa"}
                    </span>
                </button>

                {/* Status Header */}
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-11 h-11 ${statusInfo.bg} ${statusInfo.color} rounded-2xl flex items-center justify-center shrink-0 shadow-sm border border-slate-200/60`}>
                            <StatusIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight truncate">{statusInfo.title}</h2>
                                {request.scheduled && (
                                    <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider animate-pulse border border-purple-200">
                                        RESERVA
                                    </span>
                                )}
                            </div>
                            <p className="font-bold text-slate-500 text-xs mt-0.5 leading-snug truncate">
                                {request.scheduled && request.status === 'searching' 
                                    ? `Programado para: ${(request.scheduledAt ? (typeof request.scheduledAt.toDate === 'function' ? request.scheduledAt.toDate() : new Date(request.scheduledAt)) : null)?.toLocaleString('es-VE', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Fecha pendiente'}`
                                    : statusInfo.subtitle}
                            </p>
                        </div>
                    </div>

                    {/* Botón de Consejos y Seguridad */}
                    <button
                        type="button"
                        onClick={() => setShowTipsModal(true)}
                        className="px-3 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 active:scale-95 text-slate-950 font-black text-[11px] rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0"
                        title="Consejos de seguridad y uso del servicio"
                    >
                        <ShieldCheck className="w-4 h-4 text-slate-950" />
                        <span>Consejos</span>
                    </button>
                </div>

                {/* Conductor Ocupado: Mensaje y Reasignación Directa */}
                {request.status === 'driver_busy' && (
                    <div className="mb-4 bg-gradient-to-b from-amber-50 to-orange-50 border-2 border-amber-300 rounded-[2rem] p-5 shadow-lg space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 leading-tight">
                                    Conductor Ocupado
                                </h3>
                                <p className="text-xs font-bold text-slate-700 mt-1 leading-relaxed">
                                    {request.rejection_reason || "El conductor seleccionado se encuentra ocupado llevando a otra persona en este momento. Por favor, selecciona otro disponible."}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                localStorage.removeItem('active_transport_req_id');
                                navigate('/taxi', { 
                                    state: { 
                                        origin: request.origin, 
                                        destination: request.destination,
                                        category: request.service_category || 'taxi_driver'
                                    } 
                                });
                            }}
                            className="w-full py-4 bg-slate-950 hover:bg-slate-900 active:scale-95 text-amber-400 font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-slate-950/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Car className="w-4 h-4" />
                            <span>Seleccionar otro conductor disponible</span>
                        </button>
                    </div>
                )}

                {/* Ficha de Encomienda / Paquete (Cliente) */}
                {isPackageDelivery && (
                    <div className="mb-4 bg-gradient-to-br from-blue-50/90 to-indigo-50/70 border-2 border-blue-200/90 rounded-2xl p-3.5 shadow-sm space-y-3">
                        <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                                    <Package className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="text-xs font-black text-blue-950 block leading-tight">
                                        Ficha de Encomienda / Paquete
                                    </span>
                                    <span className="text-[10px] font-bold text-blue-600">
                                        {request.status === 'completed' ? 'Entrega finalizada' : 'Seguimiento de envío activo'}
                                    </span>
                                </div>
                            </div>
                            <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-100/90 px-2.5 py-0.5 rounded-full border border-blue-200">
                                Encomienda
                            </span>
                        </div>

                        {/* Destinatario y Remitente */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {/* Destinatario */}
                            <div className="bg-white/95 p-2.5 rounded-xl border border-blue-100 shadow-2xs space-y-1">
                                <span className="text-[9px] font-black uppercase text-blue-900 tracking-wider flex items-center gap-1">
                                    👤 Destinatario (Quién Recibe)
                                </span>
                                <p className="font-black text-slate-900 text-xs truncate">
                                    {receiverName || 'Destinatario'}
                                </p>
                                {receiverPhone ? (
                                    <a
                                        href={`tel:${receiverPhone}`}
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline font-mono"
                                    >
                                        <Phone className="w-3 h-3" /> {receiverPhone}
                                    </a>
                                ) : (
                                    <p className="text-[10px] text-slate-400 italic">Sin teléfono registrado</p>
                                )}
                            </div>

                            {/* Remitente */}
                            <div className="bg-white/95 p-2.5 rounded-xl border border-blue-100 shadow-2xs space-y-1">
                                <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1">
                                    📦 Remitente (Quién Envía)
                                </span>
                                <p className="font-black text-slate-800 text-xs truncate">
                                    {senderName || 'Remitente'}
                                </p>
                                {senderPhone ? (
                                    <span className="text-[11px] font-bold text-slate-600 font-mono block">
                                        {senderPhone}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        {/* Detalle o Notas del Paquete */}
                        {packageDesc && (
                            <div className="bg-white/95 p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                                <span className="text-[9px] font-black uppercase text-blue-900 tracking-wider block mb-0.5">
                                    📦 Detalle del Paquete:
                                </span>
                                <p className="text-xs font-bold text-slate-800 leading-snug">
                                    {packageDesc}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Muchacho e' Mandao: Encargo details (Visible across all trip statuses) */}
                {request.service_category === 'muchacho_mandado' && (
                    <div className="mb-4 bg-slate-900 text-white rounded-2xl p-3.5 border border-slate-800 shadow-sm space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">Tu Mandado Solicitado</span>
                        <p className="text-xs font-bold text-slate-200 mt-1 leading-snug">
                            {request.mandado_details?.description || request.notes || 'Sin descripción'}
                        </p>
                        {request.mandado_details?.storeName && (
                            <p className="text-[11px] text-slate-400 mt-1">🏪 {request.mandado_details.storeName}</p>
                        )}
                        {request.mandado_details?.storeAddresses && (
                            <p className="text-[10px] text-slate-400">📍 {request.mandado_details.storeAddresses}</p>
                        )}
                        <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-amber-300 font-semibold flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 shrink-0" />
                            Cero intermediación: Paga directo al comercio por Pago Móvil.
                        </div>
                    </div>
                )}

                {/* Muchacho e' Mandao: Live Driver Bids in Tracker (Only while searching) */}
                {request.service_category === 'muchacho_mandado' && request.status === 'searching' && (
                    <div className="mb-4 space-y-3">

                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Ofertas de Pilotos ({mandadoBids.length})
                            </span>
                            <span className="text-[10px] font-bold text-slate-500">Elige la mejor propuesta</span>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {mandadoBids.length === 0 ? (
                                <div className="p-5 text-center bg-slate-50 rounded-2xl border border-slate-200">
                                    <Clock className="w-6 h-6 text-amber-500 mx-auto mb-2 animate-pulse" />
                                    <h4 className="text-xs font-black text-slate-800">Buscando pilotos disponibles...</h4>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Los conductores están revisando tu mandado y enviando sus cotizaciones.
                                    </p>
                                </div>
                            ) : (
                                mandadoBids.map((bid) => (
                                    <div
                                        key={bid.id}
                                        className="bg-white border-2 border-amber-400/60 hover:border-amber-400 rounded-2xl p-3.5 shadow-sm flex items-center justify-between gap-3 transition-all"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative shrink-0">
                                                <img
                                                    src={bid.driver_photo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'}
                                                    alt={bid.driver_name}
                                                    className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-slate-100 shadow-sm"
                                                    onError={(e: any) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'; }}
                                                />
                                                <div className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm">
                                                    ★ {Number(bid.driver_rating || 5.0).toFixed(1)}
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-slate-900 truncate">{bid.driver_name}</p>
                                                <p className="text-[11px] font-bold text-slate-800 truncate">
                                                    {bid.vehicle_brand ? `${bid.vehicle_brand} ` : ''}{bid.vehicle_model || bid.vehicle_type || 'Vehículo'}
                                                    {bid.vehicle_year ? ` (${bid.vehicle_year})` : ''}
                                                </p>
                                                <p className="text-[10px] text-slate-500 font-semibold truncate">
                                                    {bid.vehicle_color ? `${bid.vehicle_color} • ` : ''}{bid.vehicle_plate ? `Placa: ${bid.vehicle_plate}` : ''}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-1 mt-1">
                                                    {bid.has_ac && (
                                                        <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black bg-cyan-50 text-cyan-700 border border-cyan-200">
                                                            ❄️ Con A/A
                                                        </span>
                                                    )}
                                                    {bid.vehicle_type === 'moto' && (
                                                        bid.has_thermal_bag ? (
                                                            <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                🎒 Bolso Térmico
                                                            </span>
                                                        ) : (
                                                            <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                                                Sin bolso térmico
                                                            </span>
                                                        )
                                                    )}
                                                    <span className="text-[9px] font-black text-emerald-600 ml-0.5">
                                                        ⏱️ Llega en ~{bid.estimated_eta_minutes ?? bid.eta_minutes ?? 10} min
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end shrink-0 gap-1.5">
                                            <div className="text-right">
                                                <div className="text-base font-black text-slate-900 leading-tight">
                                                    ${Number(bid.offered_price ?? bid.amount ?? 0).toFixed(2)}
                                                </div>
                                                {bcvRate > 0 && (
                                                    <div className="text-[9px] font-bold text-slate-500">
                                                        {(Number(bid.offered_price ?? bid.amount ?? 0) * bcvRate).toFixed(0)} Bs
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                disabled={acceptingBidId === bid.id}
                                                onClick={() => handleAcceptMandadoBid(bid)}
                                                className="px-3.5 py-2 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-[10px] uppercase tracking-wider rounded-xl shadow-sm active:scale-95 transition-all disabled:opacity-50"
                                            >
                                                {acceptingBidId === bid.id ? 'Aceptando...' : 'Aceptar'}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Cancelar Reserva Botón */}
                {request.scheduled && ['searching', 'accepted'].includes(request.status) && (
                    <div className="mb-4 p-2.5 bg-red-50 border border-red-100 rounded-xl flex flex-col items-center">
                        <p className="text-[10px] text-red-600 font-bold text-center mb-2 leading-tight">
                            Puedes cancelar la reserva sin penalización antes del inicio del viaje.
                        </p>
                        <button
                            onClick={handleCancelReservation}
                            className="w-full bg-white text-red-500 font-black py-2.5 text-xs rounded-lg border border-red-200 shadow-sm active:scale-95 transition-all flex justify-center items-center gap-2"
                        >
                            <XCircle className="w-4 h-4" /> CANCELAR RESERVA
                        </button>
                    </div>
                )}

                {/* Guest Banner */}
                {request.userId?.startsWith('guest_') && (
                    <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-3 rounded-xl shadow-md mb-4 w-full flex items-center justify-between">
                        <div>
                            <h3 className="text-white font-black text-sm relative z-10">🎁 ¡Viajes gratis!</h3>
                            <p className="text-white/90 text-[10px] font-bold leading-tight max-w-[160px] relative z-10">
                                Regístrate y acumula puntos.
                            </p>
                        </div>
                        <button onClick={() => navigate('/profile?action=register')} className="bg-white text-orange-600 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm active:scale-95 relative z-10">
                            Registrarme
                        </button>
                    </div>
                )}

                {/* ── ESTADO DEL PAGO & CONCILIACIÓN CON EL CONDUCTOR (Audio 2) ── */}
                {request.status === 'completed' && (() => {
                    const isPaymentConfirmed = request.payment_status === 'confirmed' || request.payment_status === 'paid';
                    const amountUsd = parseFloat(request.price || request.total || 0).toFixed(2);
                    const amountBs = (parseFloat(request.price || request.total || 0) * (bcvRate || 1)).toFixed(2);

                    if (!isPaymentConfirmed) {
                        return (
                            <div className="bg-gradient-to-br from-amber-500/10 via-amber-50 to-orange-50 border-2 border-amber-400 rounded-3xl p-4.5 mb-4 shadow-md space-y-3 animate-in fade-in">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-sm font-black">
                                        <AlertTriangle className="w-5 h-5 text-slate-950" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-black text-amber-950 leading-tight">
                                                Pago Pendiente de Confirmación
                                            </h3>
                                            <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-mono shadow-xs">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping" />
                                                En espera
                                            </span>
                                        </div>
                                        <p className="text-xs text-amber-900/90 font-medium mt-1 leading-relaxed">
                                            El conductor aún debe confirmar la recepción del pago en su aplicación. Por favor, asegúrate de entregarle el efectivo o realizar el Pago Móvil.
                                        </p>
                                    </div>
                                </div>

                                {/* Montos Exactos */}
                                <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-3 border border-amber-200/80 flex items-center justify-between shadow-xs">
                                    <div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Monto Total</span>
                                        <span className="text-lg font-black text-slate-900">${amountUsd} USD</span>
                                    </div>
                                    {bcvRate > 0 && (
                                        <div className="text-right">
                                            <span className="text-[10px] font-bold text-slate-400 block">En Bolívares (BCV)</span>
                                            <span className="text-sm font-black text-emerald-600">{amountBs} Bs</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 text-[11px] font-bold text-amber-900 bg-amber-100/80 p-2.5 rounded-xl border border-amber-200/60">
                                    <Clock className="w-4 h-4 shrink-0 text-amber-700 animate-spin" />
                                    <span>Esperando confirmación del conductor en su app...</span>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-400 rounded-3xl p-4.5 mb-4 shadow-md space-y-3 animate-in fade-in">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm font-black">
                                    <CheckCircle2 className="w-6 h-6 text-white" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-black text-emerald-950 leading-tight">
                                        ¡Pago Confirmado por el Conductor!
                                    </h3>
                                    <p className="text-xs text-emerald-800 font-medium mt-0.5">
                                        El conductor ha validado la recepción de tu pago. El ciclo del viaje ha concluido satisfactoriamente.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    localStorage.removeItem('active_transport_req_id');
                                    navigate('/');
                                }}
                                className="w-full py-3 bg-slate-900 hover:bg-slate-800 active:scale-95 text-yellow-400 font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                <span>Finalizar y Salir</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })()}

                {/* ── RATING SECTION ── */}
                {request.status === 'completed' && !request.rating && !hasRated && (
                    <div className="bg-gradient-to-b from-indigo-50 to-white border border-indigo-100 rounded-2xl p-4 mb-4 shadow-sm">
                        <h3 className="text-center font-black text-slate-800 text-base mb-0.5">¿Cómo fue tu viaje?</h3>
                        <p className="text-center text-[10px] font-bold text-slate-400 mb-3">Tu opinión ayuda a mejorar el servicio</p>

                        {/* Stars */}
                        <div className="flex justify-center gap-2 mb-4">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onMouseEnter={() => setHoverRating(star)}
                                    onMouseLeave={() => setHoverRating(0)}
                                    onClick={() => setRating(star)}
                                    className="transition-all transform active:scale-90"
                                >
                                    <Star
                                        className={`w-9 h-9 ${(hoverRating || rating) >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} transition-colors drop-shadow`}
                                        strokeWidth={1.5}
                                    />
                                </button>
                            ))}
                        </div>

                        {/* Experience tags — appear after selecting stars */}
                        {rating > 0 && (
                            <div className="mb-3">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                                    {rating >= 4 ? '¿Qué fue lo mejor?' : '¿Qué falló?'}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {(rating >= 4 ? POSITIVE_TAGS : NEGATIVE_TAGS).map(tag => (
                                        <button
                                            key={tag.id}
                                            onClick={() => toggleTag(tag.id)}
                                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 ${
                                                selectedTags.includes(tag.id)
                                                    ? 'bg-primary border-primary text-slate-900 shadow-sm'
                                                    : 'bg-white border-slate-200 text-slate-600'
                                            }`}
                                        >
                                            {tag.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Comentario adicional (opcional)..."
                            className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 min-h-[52px] mb-3 outline-none transition-all placeholder:text-slate-400 resize-none"
                        />

                        <button
                            onClick={handleRateTrip}
                            disabled={rating === 0 || submittingRating}
                            className="w-full bg-primary text-slate-900 font-black py-2.5 rounded-xl shadow-md shadow-primary/20 flex justify-center items-center gap-2 active:scale-95 transition-all text-sm disabled:opacity-50"
                        >
                            {submittingRating
                                ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                : 'Enviar Calificación'}
                        </button>
                    </div>
                )}

                {hasRated && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 mb-3 flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold text-emerald-900 text-sm">¡Gracias por tu calificación!</span>
                    </div>
                )}

                {/* ── OBJETOS PERDIDOS ── */}
                {request.status === 'completed' && !lostItemSent && (
                    <button
                        onClick={() => setShowLostItem(s => !s)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 mb-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 text-amber-700 text-xs font-bold active:scale-95 transition-all"
                    >
                        <Package className="w-4 h-4" />
                        ¿Olvidaste algo en el vehículo?
                    </button>
                )}
                {lostItemSent && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3 space-y-3">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0" />
                            <span className="text-xs font-bold text-amber-900 leading-tight">
                                Reporte registrado con éxito. El conductor y soporte central han sido notificados.
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowChat(true)}
                                className="flex-1 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                            >
                                <MessageCircle className="w-4 h-4" />
                                Abrir Chat de Soporte
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowCall(true)}
                                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                                title="Llamar al Conductor"
                            >
                                <Phone className="w-4 h-4" />
                                Llamar
                            </button>
                        </div>
                    </div>
                )}
                {showLostItem && !lostItemSent && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3 animate-fade-in space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                                📦 Reportar objeto olvidado
                            </h4>
                            <button
                                type="button"
                                onClick={() => setShowLostItem(false)}
                                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                            >
                                Cancelar
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                            Describe el objeto olvidado y adjunta una foto si la tienes. Notificaremos al conductor y al equipo de soporte de inmediato.
                        </p>
                        <textarea
                            value={lostItemDesc}
                            onChange={e => setLostItemDesc(e.target.value)}
                            placeholder="Ej: Mochila negra con documentos, teléfono, llaves..."
                            className="w-full bg-white border border-amber-200 rounded-xl p-3 text-xs outline-none min-h-[60px] resize-none focus:ring-2 focus:ring-amber-200 placeholder:text-slate-400"
                        />
                        {/* Adjuntar Foto */}
                        <div>
                            <input
                                type="file"
                                id="lost-photo-input"
                                accept="image/*"
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        setLostItemPhoto(file);
                                        setLostItemPhotoPreview(URL.createObjectURL(file));
                                    }
                                }}
                            />
                            {lostItemPhotoPreview ? (
                                <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-amber-300">
                                    <img src={lostItemPhotoPreview} alt="Foto del objeto" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLostItemPhoto(null);
                                            setLostItemPhotoPreview(null);
                                        }}
                                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <label
                                    htmlFor="lost-photo-input"
                                    className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-white border border-dashed border-amber-300 rounded-xl text-xs font-bold text-amber-800 hover:bg-amber-100/50 transition-colors"
                                >
                                    📷 Adjuntar foto del objeto (Opcional)
                                </label>
                            )}
                        </div>
                        <button
                            onClick={handleLostItem}
                            disabled={!lostItemDesc.trim() || submittingLost}
                            className="w-full bg-amber-400 hover:bg-amber-500 text-slate-900 font-black py-2.5 rounded-xl text-sm flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
                        >
                            {submittingLost
                                ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                : 'Enviar Reporte Inmediato'}
                        </button>
                    </div>
                )}

                {/* Route Info summary if available */}
                {routeInfo && (
                    <div className="flex gap-2 mb-4 pt-3 border-t border-slate-100">
                        <div className="flex-1 bg-slate-50 p-2 rounded-xl text-center">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Distancia</p>
                            <p className="font-black text-sm text-slate-800">{routeInfo.distance}</p>
                        </div>
                        <div className="flex-1 bg-slate-50 p-2 rounded-xl text-center">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Tiempo Estimado</p>
                            <p className="font-black text-sm text-slate-800">
                                {routeInfo.duration && !routeInfo.duration.includes('undefined') ? routeInfo.duration : '~5 min'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Driver Info (If Assigned) */}
                {driver && (
                    <div className="bg-white rounded-2xl p-3.5 border border-slate-200 mb-3.5 shadow-sm space-y-2.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <img
                                        src={driver.documents?.selfieUrl || (driver.documents as any)?.selfie_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'}
                                        alt="Driver"
                                        className="w-12 h-12 rounded-2xl object-cover bg-slate-100 shadow-sm border border-slate-100"
                                        onError={(e: any) => { e.target.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'; }}
                                    />
                                    <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border border-white flex items-center gap-0.5">
                                        ★ {driver.rating ? Number(driver.rating).toFixed(1) : '5.0'}
                                    </div>
                                </div>
                                <div>
                                    <p className="font-black text-slate-900 text-sm leading-tight">
                                        {driver.fullName || (driver as any).full_name || 'Conductor Asignado'}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-500">
                                        C.I: {(driver as any).cedula || (driver as any).user_cedula || 'Verificada'} • {(driver as any).total_trips || driver.totalTrips || 0} viajes
                                    </p>
                                    <p className="text-[11px] font-black text-slate-900 capitalize mt-0.5">
                                        {(driver as any).vehicle_model || driver.vehicleType || 'Vehículo'} • {(driver as any).vehicle_plate || driver.vehiclePlate || 'Sin placa'}
                                        {((driver as any).vehicle_color || driver.vehicleColor) ? ` (${(driver as any).vehicle_color || driver.vehicleColor})` : ''}
                                    </p>
                                </div>
                            </div>

                            {/* In-app chat & call — Strictly 0 WhatsApp links */}
                            <div className="flex gap-2">
                                {['searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress', 'completed'].includes(request.status) && (
                                    <button
                                        onClick={() => {
                                            setShowChat(true);
                                            setUnreadCount(0);
                                            sessionStorage.setItem(`last_chat_read_${requestId}`, new Date().toISOString());
                                        }}
                                        className="w-10 h-10 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center active:scale-95 transition-transform relative shadow-sm"
                                        title="Chat con conductor"
                                    >
                                        <MessageCircle className="w-5 h-5 text-orange-600" />
                                        {unreadCount > 0 && (
                                            <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 bg-red-600 text-white text-[10px] font-black rounded-full border-2 border-white flex items-center justify-center shadow-md animate-bounce">
                                                {unreadCount}
                                            </span>
                                        )}
                                    </button>
                                )}
                                {['accepted', 'arriving', 'in_progress'].includes(request.status) && (
                                    <button
                                        onClick={() => setShowCall(true)}
                                        className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center active:scale-95 transition-transform shadow-sm"
                                        title="Llamada en la app"
                                    >
                                        <Phone className="w-4 h-4 fill-current" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Vehicle Photo (Visual para identificar vehículo) */}
                        {(() => {
                            const vehiclePhotoUrl = (driver as any)?.vehicle_image_url 
                                || (driver as any)?.vehicleImageUrl 
                                || (driver as any)?.vehicle_photo_url 
                                || (driver as any)?.vehiclePhotoUrl 
                                || driver?.documents?.vehicleUrl 
                                || (driver?.documents as any)?.vehicle_url 
                                || (driver?.documents as any)?.vehicle_photo_url;
                            if (!vehiclePhotoUrl) return null;
                            return (
                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-2.5">
                                        <img
                                            src={vehiclePhotoUrl}
                                            alt="Vehículo asignado"
                                            onClick={() => setShowVehicleModal(true)}
                                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-sm cursor-pointer active:scale-95 transition-transform"
                                        />
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                                                🚗 Foto del Vehículo
                                            </p>
                                            <p className="text-xs font-bold text-slate-800 capitalize">
                                                {(driver as any).vehicle_brand ? `${(driver as any).vehicle_brand} ` : ''}
                                                {(driver as any).vehicle_model || driver.vehicleType || 'Vehículo'}
                                                {((driver as any).vehicle_color || driver.vehicleColor) ? ` • ${(driver as any).vehicle_color || driver.vehicleColor}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowVehicleModal(true)}
                                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold rounded-lg shadow-sm transition-colors"
                                    >
                                        Ver Foto
                                    </button>
                                </div>
                            );
                        })()}

                        {/* Comfort Feature Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                            {((driver as any).comfort_features?.ac || (driver as any).comfortFeatures?.ac || (driver as any).comfort_features?.hasAc || (driver as any).comfortFeatures?.hasAc || driver.hasAc) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-100">
                                    <Wind className="w-2.5 h-2.5" /> Aire A/A
                                </span>
                            )}
                            {((driver as any).comfort_features?.music || (driver as any).comfortFeatures?.music || (driver as any).comfort_features?.hasMusic || (driver as any).comfortFeatures?.hasMusic) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-100">
                                    <Music className="w-2.5 h-2.5" /> Buena Música
                                </span>
                            )}
                            {((driver as any).comfort_features?.wifi || (driver as any).comfortFeatures?.wifi || (driver as any).comfort_features?.hasWifi || (driver as any).comfortFeatures?.hasWifi) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                    <Wifi className="w-2.5 h-2.5" /> Wi-Fi
                                </span>
                            )}
                            {((driver as any).comfort_features?.charger || (driver as any).comfortFeatures?.charger) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                    <BatteryCharging className="w-2.5 h-2.5" /> Cargador
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Driver Pago Móvil Details: ONLY visible after driver is assigned and status is active (never in 'searching' or while evaluating offers) */}
                {driver && ['accepted', 'arriving', 'in_progress', 'completed'].includes(request.status) && (request.payment_method === 'pago_movil' || request.paymentMethod === 'pagoMovil') && (
                    <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-3 mb-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-purple-900 flex items-center gap-1.5">
                                📲 Pago Móvil al Conductor
                            </span>
                            <span className="text-[10px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded-md border border-purple-200">
                                Directo al Chofer
                            </span>
                        </div>

                        {(() => {
                            const pm = request.driver_payment_info || (driver as any)?.payment_mobile || (driver as any)?.payment_info || (driver as any)?.paymentInfo || {};
                            const bank = pm.bank || 'Banco por coordinar';
                            const phone = pm.phone || driver?.phone || 'Teléfono por coordinar';
                            const idf = pm.idf || pm.cedula || (driver as any)?.cedula || 'Cédula por coordinar';
                            const amountBs = (parseFloat(request.price || request.total || 0) * (bcvRate || 1)).toFixed(2);

                            return (
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-purple-100">
                                        <span className="text-[11px] text-slate-500 font-bold">Monto exacto: <b className="text-slate-900">{amountBs} Bs</b></span>
                                        <button
                                            onClick={() => handleCopy(amountBs, 'Monto')}
                                            className="text-[11px] font-black text-purple-600 flex items-center gap-1 hover:underline"
                                        >
                                            <Copy className="w-3 h-3" /> Copiar
                                        </button>
                                    </div>
                                    <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-purple-100">
                                        <span className="text-[11px] text-slate-500 font-bold">Banco: <b className="text-slate-900">{bank}</b></span>
                                        <button
                                            onClick={() => handleCopy(bank, 'Banco')}
                                            className="text-[11px] font-black text-purple-600 flex items-center gap-1 hover:underline"
                                        >
                                            <Copy className="w-3 h-3" /> Copiar
                                        </button>
                                    </div>
                                    <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-purple-100">
                                        <span className="text-[11px] text-slate-500 font-bold">Teléfono: <b className="text-slate-900">{phone}</b></span>
                                        <button
                                            onClick={() => handleCopy(phone, 'Teléfono')}
                                            className="text-[11px] font-black text-purple-600 flex items-center gap-1 hover:underline"
                                        >
                                            <Copy className="w-3 h-3" /> Copiar
                                        </button>
                                    </div>
                                    <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-purple-100">
                                        <span className="text-[11px] text-slate-500 font-bold">Cédula: <b className="text-slate-900">{idf}</b></span>
                                        <button
                                            onClick={() => handleCopy(idf, 'Cédula')}
                                            className="text-[11px] font-black text-purple-600 flex items-center gap-1 hover:underline"
                                        >
                                            <Copy className="w-3 h-3" /> Copiar
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => handleCopy(`Banco: ${bank}\nTeléfono: ${phone}\nCédula: ${idf}\nMonto: ${amountBs} Bs`, 'Todos los datos de Pago Móvil')}
                                        className="w-full py-1.5 bg-purple-600 text-white font-black text-[11px] rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-1.5 shadow-sm"
                                    >
                                        <Copy className="w-3.5 h-3.5" /> Copiar todos los datos de Pago Móvil
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Incoming In-App Call Modal */}
                {showIncomingCall && driver && request && (
                    <InAppCall
                        requestId={requestId!}
                        myId={request.userId || request.user_id}
                        remoteId={request.driverId || request.driver_id}
                        remoteDisplayName={(driver.fullName || (driver as any).full_name || 'Conductor').split(' ')[0]}
                        remotePhotoUrl={driver.documents?.selfieUrl || (driver.documents as any)?.selfie_url}
                        role="receiver"
                        initialOffer={incomingOffer}
                        onClose={() => {
                            setShowIncomingCall(false);
                            setIncomingOffer(null);
                        }}
                    />
                )}

                {/* Outgoing In-App Call Modal */}
                {showCall && driver && request && (
                    <InAppCall
                        requestId={requestId!}
                        myId={request.userId || request.user_id}
                        remoteId={request.driverId || request.driver_id}
                        remoteDisplayName={(driver.fullName || (driver as any).full_name || 'Conductor').split(' ')[0]}
                        remotePhotoUrl={driver.documents?.selfieUrl || (driver.documents as any)?.selfie_url}
                        role="caller"
                        onClose={() => setShowCall(false)}
                    />
                )}

                {/* Botón en Pantalla para Seleccionar / Cambiar Método de Pago */}
                {['accepted', 'arriving', 'in_progress'].includes(request.status) && (
                    <div className="mb-3.5">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedPaymentMethod(
                                    request.payment_method === 'cash_ves' 
                                        ? 'cash_ves' 
                                        : request.payment_method === 'pago_movil' 
                                        ? 'pago_movil' 
                                        : 'cash_usd'
                                );
                                setShowPaymentPickerModal(true);
                            }}
                            className="w-full flex items-center justify-between p-3.5 bg-gradient-to-r from-amber-500/10 via-amber-400/15 to-yellow-500/10 border-2 border-amber-400/70 hover:border-amber-400 rounded-2xl shadow-sm transition-all active:scale-98"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-lg shadow-sm shrink-0">
                                    💳
                                </div>
                                <div className="text-left truncate">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 block leading-tight">
                                        Método de Pago
                                    </span>
                                    <span className="text-xs font-black text-slate-900 truncate block">
                                        {request.payment_method === 'pago_movil' 
                                            ? '📱 Pago Móvil' 
                                            : request.payment_method === 'cash_ves' 
                                            ? '🇻🇪 Bs. Efectivo' 
                                            : '💵 Divisa (USD Efectivo)'}
                                    </span>
                                </div>
                            </div>
                            <span className="text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 px-3.5 py-1.5 rounded-xl shadow-sm shrink-0 ml-2">
                                Elegir / Cambiar
                            </span>
                        </button>
                    </div>
                )}

                {/* Payment Summary */}
                <div 
                    onClick={() => {
                        if (['accepted', 'arriving', 'in_progress'].includes(request.status)) {
                            setSelectedPaymentMethod(
                                request.payment_method === 'cash_ves' 
                                    ? 'cash_ves' 
                                    : request.payment_method === 'pago_movil' 
                                    ? 'pago_movil' 
                                    : 'cash_usd'
                            );
                            setShowPaymentPickerModal(true);
                        }
                    }}
                    className={`bg-slate-50 rounded-2xl p-3 flex justify-between items-center border border-slate-100 ${['accepted', 'arriving', 'in_progress'].includes(request.status) ? 'cursor-pointer hover:bg-slate-100/80 transition-colors' : ''}`}
                >
                    <div>
                        <div className="flex items-center gap-1.5">
                            <p className="text-[10px] font-bold text-slate-500">Total del Viaje</p>
                            {Boolean(request?.notes?.includes('Transporte Rápido') || (request as any)?.is_quick_transport) && (
                                ['searching', 'accepted', 'arriving'].includes(request.status) ? (
                                    <span className="text-[8px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-md">
                                        Base Inicial
                                    </span>
                                ) : (
                                    <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded-md">
                                        Tarifa Acordada
                                    </span>
                                )
                            )}
                        </div>
                        <p className="font-black text-base text-slate-900 leading-tight">${parseFloat(request.price || request.total || 0).toFixed(2)}</p>
                        {bcvRate > 0 && (
                            <p className="text-[10px] font-bold text-slate-500">
                                {(parseFloat(request.price || request.total || 0) * bcvRate).toFixed(2)} Bs (BCV)
                            </p>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500">Forma de pago</p>
                        <p className="font-bold text-xs text-slate-800">
                            {request.payment_method === 'cash_usd'
                                ? 'Efectivo Divisas ($)'
                                : request.payment_method === 'cash_ves'
                                ? 'Efectivo Bolívares (Bs)'
                                : 'Pago Móvil al Conductor'}
                        </p>
                    </div>
                </div>

                {/* Banner Informativo de Transporte Rápido mientras el conductor llega */}
                {Boolean(request?.notes?.includes('Transporte Rápido') || (request as any)?.is_quick_transport) && ['searching', 'accepted', 'arriving'].includes(request.status) && (
                    <div className="mt-2.5 p-3 bg-amber-50/90 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-xs text-amber-950 leading-relaxed shadow-xs">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <span className="block text-[10px] uppercase tracking-wide text-amber-900 font-black">Transporte Rápido</span>
                            <p className="text-[11px] font-medium text-amber-950 mt-0.5">
                                La tarifa mostrada es una <strong>base de salida</strong>. Al llegar tu conductor a recogerte, acordarán el monto final en persona o se calculará en el mapa según tu destino.
                            </p>
                        </div>
                    </div>
                )}

                {/* Cancel Trip Button */}
                {['searching', 'accepted', 'arriving'].includes(request.status) && (
                    <button
                        onClick={() => setShowCancelModal(true)}
                        className="w-full mt-3 py-2.5 bg-red-50 text-red-600 font-black text-xs rounded-xl border border-red-200/80 hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                        <XCircle className="w-4 h-4" /> Cancelar Viaje
                    </button>
                )}

                {/* Cancellation Modal with 50% penalty warning if arriving, or 0% penalty for quick transport */}
                {showCancelModal && (() => {
                    const isQuick = Boolean(
                        request.notes?.includes('Transporte Rápido') || 
                        (request as any).is_quick_transport || 
                        request.destination?.address?.includes('convenir')
                    );
                    const isArriving = request.status === 'arriving';

                    return (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                            <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3.5">
                                <div className="flex items-center gap-2.5 text-red-600">
                                    <AlertTriangle className="w-6 h-6 shrink-0" />
                                    <h3 className="text-base font-black text-slate-900">¿Cancelar viaje?</h3>
                                </div>

                                {isArriving && !isQuick ? (
                                    <div className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-1.5 text-xs text-red-900">
                                        <p className="font-black text-red-700">⚠️ Conductor ya en el sitio</p>
                                        <p className="text-[11px] text-red-800 leading-snug">
                                            El conductor ya ha llegado al punto de recogida. Si confirmas la cancelación, se aplicará una penalidad del <b>50% (${(parseFloat(request.price || request.total || 0) * 0.5).toFixed(2)})</b> para compensar el gasto de traslado del conductor.
                                        </p>
                                    </div>
                                ) : isQuick ? (
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-1.5 text-xs text-amber-950">
                                        <p className="font-black text-amber-800 flex items-center gap-1">
                                            ⚡ Transporte Rápido (Sin penalidad)
                                        </p>
                                        <p className="text-[11px] text-amber-900 leading-snug">
                                            Puedes cancelar sin costo adicional ($0.00). Al tratarse de un Transporte Rápido donde no se acordó la tarifa final, no se cobrará penalidad alguna.
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-600 font-medium">
                                        ¿Estás seguro de que deseas cancelar este servicio? Se liberará la búsqueda o asignación.
                                    </p>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={() => setShowCancelModal(false)}
                                        disabled={cancellingTrip}
                                        className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-black text-xs rounded-xl hover:bg-slate-200 active:scale-95 transition-all"
                                    >
                                        Volver
                                    </button>
                                    <button
                                        onClick={handleConfirmCancelTrip}
                                        disabled={cancellingTrip}
                                        className="flex-1 py-2.5 bg-red-600 text-white font-black text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-red-600/30"
                                    >
                                        {cancellingTrip ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : isArriving && !isQuick ? (
                                            'Confirmar (-50%)'
                                        ) : isQuick ? (
                                            'Confirmar ($0)'
                                        ) : (
                                            'Confirmar'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Vehicle Photo Modal */}
                {showVehicleModal && (() => {
                    const vehiclePhotoUrl = (driver as any)?.vehicle_image_url 
                        || (driver as any)?.vehicleImageUrl 
                        || (driver as any)?.vehicle_photo_url 
                        || (driver as any)?.vehiclePhotoUrl 
                        || driver?.documents?.vehicleUrl 
                        || (driver?.documents as any)?.vehicle_url 
                        || (driver?.documents as any)?.vehicle_photo_url;
                    if (!vehiclePhotoUrl) return null;
                    return (
                        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                            <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-100">
                                <div className="relative h-64 bg-slate-900 flex items-center justify-center">
                                    <img
                                        src={vehiclePhotoUrl}
                                        alt="Vehículo asignado"
                                        className="w-full h-full object-contain"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowVehicleModal(false)}
                                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm active:scale-95 transition-transform"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-black text-sm text-slate-900 capitalize">
                                                {(driver as any)?.vehicle_brand ? `${(driver as any).vehicle_brand} ` : ''}
                                                {(driver as any)?.vehicle_model || driver?.vehicleType || 'Vehículo'}
                                            </p>
                                            <p className="text-xs text-slate-500 font-medium">
                                                Color: {(driver as any)?.vehicle_color || driver?.vehicleColor || 'No especificado'}
                                            </p>
                                        </div>
                                        {((driver as any)?.vehicle_plate || driver?.vehiclePlate) && (
                                            <div className="px-3 py-1 bg-slate-900 text-yellow-400 font-mono font-black text-xs rounded-xl border border-yellow-400/30">
                                                {((driver as any)?.vehicle_plate || driver?.vehiclePlate).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100">
                                        Conductor: {driver?.fullName || (driver as any)?.full_name || 'Asignado'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Modal: Selección de Método de Pago (Pago Móvil, Bs. Efectivo, Divisa) */}
                {showPaymentPickerModal && (
                    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-t-[32px] sm:rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl relative animate-in slide-in-from-bottom duration-200">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                                        💳
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black text-slate-900 leading-tight">Método de Pago</h3>
                                        <p className="text-[10px] text-slate-500 font-bold">Selecciona cómo deseas pagar tu viaje</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowPaymentPickerModal(false)}
                                    className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Total Banner */}
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-600">Total a pagar:</span>
                                <div className="text-right">
                                    <span className="text-base font-black text-slate-900 leading-none">
                                        ${parseFloat(request.price || request.total || 0).toFixed(2)} USD
                                    </span>
                                    {bcvRate > 0 && (
                                        <span className="text-xs font-bold text-slate-500 block">
                                            ≈ {(parseFloat(request.price || request.total || 0) * bcvRate).toFixed(2)} Bs (BCV)
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* 3 Payment Options */}
                            <div className="space-y-2.5">
                                {/* 1. Pago Móvil */}
                                <button
                                    type="button"
                                    onClick={() => setSelectedPaymentMethod('pago_movil')}
                                    className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${
                                        selectedPaymentMethod === 'pago_movil'
                                            ? 'border-purple-500 bg-purple-50/70 shadow-sm'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xl shrink-0">
                                            📱
                                        </div>
                                        <div>
                                            <p className="font-black text-xs text-slate-900">Pago Móvil</p>
                                            <p className="text-[10px] text-slate-500 font-medium">Transferencia bancaria móvil en Bs</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {bcvRate > 0 && (
                                            <span className="text-xs font-black text-purple-700 block">
                                                {(parseFloat(request.price || request.total || 0) * bcvRate).toFixed(2)} Bs
                                            </span>
                                        )}
                                        <span className={`w-4 h-4 rounded-full border-2 inline-flex items-center justify-center mt-0.5 ${
                                            selectedPaymentMethod === 'pago_movil' ? 'border-purple-600 bg-purple-600' : 'border-slate-300'
                                        }`}>
                                            {selectedPaymentMethod === 'pago_movil' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </span>
                                    </div>
                                </button>

                                {/* 2. Bs. Efectivo */}
                                <button
                                    type="button"
                                    onClick={() => setSelectedPaymentMethod('cash_ves')}
                                    className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${
                                        selectedPaymentMethod === 'cash_ves'
                                            ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xl shrink-0">
                                            🇻🇪
                                        </div>
                                        <div>
                                            <p className="font-black text-xs text-slate-900">Bs. Efectivo</p>
                                            <p className="text-[10px] text-slate-500 font-medium">Billetes en bolívares en mano</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {bcvRate > 0 && (
                                            <span className="text-xs font-black text-emerald-700 block">
                                                {(parseFloat(request.price || request.total || 0) * bcvRate).toFixed(2)} Bs
                                            </span>
                                        )}
                                        <span className={`w-4 h-4 rounded-full border-2 inline-flex items-center justify-center mt-0.5 ${
                                            selectedPaymentMethod === 'cash_ves' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                                        }`}>
                                            {selectedPaymentMethod === 'cash_ves' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </span>
                                    </div>
                                </button>

                                {/* 3. Divisa Efectivo (USD) */}
                                <button
                                    type="button"
                                    onClick={() => setSelectedPaymentMethod('cash_usd')}
                                    className={`w-full p-3.5 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${
                                        selectedPaymentMethod === 'cash_usd'
                                            ? 'border-amber-500 bg-amber-50/70 shadow-sm'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xl shrink-0">
                                            💵
                                        </div>
                                        <div>
                                            <p className="font-black text-xs text-slate-900">Divisa ($ USD)</p>
                                            <p className="text-[10px] text-slate-500 font-medium">Dólares en efectivo en mano</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-black text-amber-700 block">
                                            ${parseFloat(request.price || request.total || 0).toFixed(2)} USD
                                        </span>
                                        <span className={`w-4 h-4 rounded-full border-2 inline-flex items-center justify-center mt-0.5 ${
                                            selectedPaymentMethod === 'cash_usd' ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                                        }`}>
                                            {selectedPaymentMethod === 'cash_usd' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </span>
                                    </div>
                                </button>
                            </div>

                            {/* Confirm button */}
                            <div className="pt-2">
                                <button
                                    type="button"
                                    disabled={updatingPaymentMethod}
                                    onClick={() => handleSavePaymentMethod(selectedPaymentMethod)}
                                    className="w-full py-3.5 bg-slate-950 hover:bg-slate-900 active:scale-98 text-amber-400 font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    {updatingPaymentMethod ? 'Guardando...' : 'Confirmar Método de Pago'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal de Consejos de Seguridad y Confianza */}
                {showTipsModal && (
                    <div className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in pointer-events-auto">
                        <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-100 p-5 space-y-4 animate-scale-in">
                            {/* Header */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-md">
                                        🛡️
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black text-slate-900 leading-tight">Consejos y Confianza</h3>
                                        <p className="text-xs font-bold text-slate-500 mt-0.5">Cómo funciona tu viaje en Un 2x3</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowTipsModal(false)}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-black transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* List of Tips */}
                            <div className="space-y-3 text-xs">
                                <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200/80 flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 font-black text-xs shadow-xs">
                                        1
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs">Conductores Verificados</h4>
                                        <p className="text-slate-600 font-medium text-[11px] mt-0.5 leading-relaxed">
                                            Cada chofer cuenta con cédula de identidad, foto real, vehículo inspeccionado y placa verificada. Viajas con total tranquilidad.
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3 bg-blue-50/70 rounded-2xl border border-blue-200/80 flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-xs">
                                        2
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs">Rastreo en Vivo por Google Maps</h4>
                                        <p className="text-slate-600 font-medium text-[11px] mt-0.5 leading-relaxed">
                                            El mapa te muestra en tiempo real cómo avanza tu transporte hacia tu dirección. Puedes pulsar "Mi Posición" para ver su llegada desde tu lugar de espera.
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-xs">
                                        3
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs">Aviso de Llegada</h4>
                                        <p className="text-slate-600 font-medium text-[11px] mt-0.5 leading-relaxed">
                                            Cuando el conductor esté afuera, la pantalla te indicará: <strong>¡El transporte está afuera!</strong>. Sal al punto indicado para abordar sin demoras.
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-200/80 flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-xl bg-purple-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-xs">
                                        4
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs">Pago Directo y Transparente</h4>
                                        <p className="text-slate-600 font-medium text-[11px] mt-0.5 leading-relaxed">
                                            Pagas directamente al conductor en Efectivo ($ USD o Bs a tasa oficial) o por Pago Móvil. Sin comisiones extra ni sorpresas.
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-start gap-3">
                                    <div className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-xs">
                                        5
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs">Comunicación Segura</h4>
                                        <p className="text-slate-600 font-medium text-[11px] mt-0.5 leading-relaxed">
                                            Puedes chatear o realizar llamadas de voz dentro de la aplicación con tu chofer manteniendo tu privacidad.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Close Button */}
                            <button
                                type="button"
                                onClick={() => setShowTipsModal(false)}
                                className="w-full py-3.5 bg-slate-950 hover:bg-slate-900 active:scale-95 text-amber-400 font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl transition-all"
                            >
                                Entendido, ¡confío en el servicio!
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
