import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DeliveryDriver } from '../lib/delivery-service';
import toast from 'react-hot-toast';
import { Navigation, Clock, CheckCircle2, Phone, ArrowLeft, Car, ShieldCheck, MessageCircle, Star, XCircle, MapPin, Package, Copy, AlertTriangle, Wind, Music, Wifi, BatteryCharging, AlertCircle, X } from 'lucide-react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES } from '../lib/mapsConfig';
import RideChat from '../components/RideChat';
import InAppCall from '../components/InAppCall';
import { UN2X3_LOGO } from '../lib/env';
import { isNightTime, yangoDarkMapStyles, yangoDayMapStyles, googleMapsDarkStyles, getWeatherByCoordinates, WeatherInfo } from '../lib/weather';
import RainOverlay from '../components/RainOverlay';
import { useCurrency } from '../context/CurrencyContext';

const mapContainerStyle = {
    width: '100%',
    height: '100%',
    position: 'absolute' as 'absolute',
    top: 0,
    left: 0,
    zIndex: 0
};

const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    styles: [
        {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "on" }]
        }
    ]
};

export default function TransportTracker() {
    const { requestId } = useParams();
    const navigate = useNavigate();
    const { bcvRate } = useCurrency();
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
    // In-app call
    const [showCall, setShowCall] = useState(false);
    // Cancellation modal
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancellingTrip, setCancellingTrip] = useState(false);
    // Lost items
    const [showLostItem, setShowLostItem] = useState(false);
    const [lostItemDesc, setLostItemDesc] = useState('');
    const [submittingLost, setSubmittingLost] = useState(false);
    const [lostItemSent, setLostItemSent] = useState(false);
    const [showVehicleModal, setShowVehicleModal] = useState(false);
    
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
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES
    });
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
    const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);
    const [routeInfo, setRouteInfo] = useState<{ distance: string, duration: string } | null>(null);
    const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);


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

        return () => {
            supabase.removeChannel(channel);
        };
    }, [requestId]);

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

        // 1. Cargar datos iniciales desde la tabla física 'drivers'
        supabase.from('drivers').select('*').eq('id', driverId).maybeSingle().then(async ({ data }) => {
            if (data) {
                setDriver(mapDriverData(data));
            } else {
                const { data: fallbackData } = await supabase.from('delivery_drivers').select('*').eq('id', driverId).maybeSingle();
                if (fallbackData) {
                    setDriver(mapDriverData(fallbackData));
                }
            }
        });

        // 2. Suscripción en tiempo real a 'drivers' (las vistas en Postgres no disparan eventos CDC)
        const dChannel = supabase.channel(`tr_driver_${driverId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'drivers',
                filter: `id=eq.${driverId}`
            }, (payload) => {
                if (payload.new) {
                    setDriver(prev => ({
                        ...(prev || {}),
                        ...mapDriverData(payload.new)
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
            
            // Sonar
            if (notificationSoundUrl.current) {
                const audio = new Audio(notificationSoundUrl.current);
                audio.play().catch(e => console.error("Error playing status audio:", e));
            }

            // Mostrar Alerta Visual (Pantalla)
            toast((t) => (
                <div className="flex flex-col gap-1 p-1">
                    <p className="font-black text-slate-900 text-sm flex items-center gap-2">
                        <info.icon className="w-4 h-4 text-orange-500" />
                        {info.title}
                    </p>
                    <p className="text-slate-500 text-xs font-bold leading-tight">{info.subtitle}</p>
                </div>
            ), {
                position: 'top-center',
                duration: 5000,
                style: {
                    borderRadius: '1.25rem',
                    padding: '12px 16px',
                    border: '1px solid rgba(0,0,0,0.05)',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                }
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
                        if (notificationSoundUrl.current) {
                            const audio = new Audio(notificationSoundUrl.current);
                            audio.play().catch(e => console.error("Error playing chat audio:", e));
                        }

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

    useEffect(() => {
        if (request && ['completed', 'cancelled'].includes(request.status)) {
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
            await supabase.from('lost_items').insert({
                id: crypto.randomUUID(),
                request_id: requestId,
                requestId: requestId,
                user_id: request.userId || request.user_id,
                userId: request.userId || request.user_id,
                driver_id: request.driverId || request.driver_id,
                driverId: request.driverId || request.driver_id,
                description: lostItemDesc.trim(),
                status: 'pending',
                created_at: new Date().toISOString(),
                createdAt: new Date().toISOString()
            });
            setLostItemSent(true);
            setShowLostItem(false);
            toast.success('Tu reporte fue enviado al conductor.');
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
            const numPrice = parseFloat(request.price || request.total || 0);
            const numComm = parseFloat(request.commission_amount || 0);

            if (isArriving) {
                const penaltyPrice = Math.round((numPrice * 0.5) * 100) / 100;
                const penaltyCommission = Math.round((numComm * 0.5) * 100) / 100;
                await supabase.from('transport_requests').update({
                    status: 'cancelled',
                    cancellation_penalty_applied: true,
                    price: penaltyPrice,
                    commission_amount: penaltyCommission,
                    cancellation_reason: 'Cancelado por cliente con chofer en sitio (penalidad 50%)',
                    cancelled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', requestId);
                toast.error("Viaje cancelado con penalidad del 50% por cancelación con conductor en punto de partida.");
            } else {
                await supabase.from('transport_requests').update({
                    status: 'cancelled',
                    cancellation_reason: 'Cancelado por el cliente',
                    cancelled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', requestId);
                toast.success("Viaje cancelado.");
            }

            setShowCancelModal(false);
            navigate('/taxi');
        } catch (err) {
            console.error(err);
            toast.error("Error al cancelar viaje");
        } finally {
            setCancellingTrip(false);
        }
    };

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map);
        setDirectionsService(new google.maps.DirectionsService());
    }, []);

    const onUnmount = useCallback(function callback(map: google.maps.Map) {
        setMap(null);
    }, []);

    // Calculate route when request data is available
    useEffect(() => {
        if (request && request.origin && request.destination && directionsService && map) {

            // Wait a tick to ensure map is ready
            setTimeout(() => {
                directionsService.route({
                    origin: { lat: request.origin.lat, lng: request.origin.lng },
                    destination: { lat: request.destination.lat, lng: request.destination.lng },
                    travelMode: google.maps.TravelMode.DRIVING
                }, (result, status) => {
                    if (status === 'OK' && result) {
                        if (!directionsRenderer) {
                            const renderer = new google.maps.DirectionsRenderer({
                                map: map,
                                suppressMarkers: false,
                                polylineOptions: {
                                    strokeColor: '#FF5D00', // Brand Primary Orange
                                    strokeWeight: 4
                                }
                            });
                            setDirectionsRenderer(renderer);
                            renderer.setDirections(result);
                        } else {
                            directionsRenderer.setDirections(result);
                        }

                        const leg = result.routes[0].legs[0];
                        if (leg) {
                            const baseSeconds = leg.duration?.value || 0;
                            const adjustedSeconds = Math.round(baseSeconds * 1.5);
                            const adjustedMinutes = Math.max(1, Math.round(adjustedSeconds / 60));
                            setRouteInfo({
                                distance: leg.distance?.text || '',
                                duration: `~${adjustedMinutes} min`
                            });
                        }
                    }
                });
            }, 500);
        }
    }, [request, directionsService, map]);

    if (loading || !isLoaded) {
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

    const getStatusInfo = () => {
        switch (request.status) {
            case 'verifying_payment':
                return { title: "Verificando Pago", subtitle: "Validando tu comprobante...", color: "text-amber-500", bg: "bg-amber-50", icon: ShieldCheck };
            case 'searching':
                return { title: "Buscando Conductor", subtitle: "Conectando con vehículos cercanos...", color: "text-orange-600", bg: "bg-orange-50", icon: Clock };
            case 'accepted':
                return { title: "Conductor en Camino", subtitle: "Tu transporte va hacia tu ubicación", color: "text-blue-500", bg: "bg-blue-50", icon: Car };
            case 'arriving':
                return { title: "Conductor Afuera", subtitle: "El conductor ha llegado al punto de recogida", color: "text-blue-600", bg: "bg-blue-100", icon: MapPin };
            case 'in_progress':
                return { title: "Viaje en Curso", subtitle: "Te diriges a tu destino", color: "text-emerald-500", bg: "bg-emerald-50", icon: Navigation };
            case 'completed':
                return { title: "Viaje Completado", subtitle: "Has llegado a tu destino", color: "text-slate-900", bg: "bg-slate-100", icon: CheckCircle2 };
            case 'cancelled':
                return { title: "Viaje Cancelado", subtitle: "El pago fue rechazado o el viaje cancelado", color: "text-red-500", bg: "bg-red-50", icon: XCircle };
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
                                src={UN2X3_LOGO}
                                onError={(e: any) => { e.currentTarget.src = '/logo.png'; }}
                                alt="Deliexpress Logo"
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
                        {/* Overlay to ensure back button is visible on the map */}
                        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/20 to-transparent z-10 pointer-events-none"></div>

                        {/* Rain Animation Canvas Overlay */}
                        <RainOverlay isActive={Boolean(weather?.isRaining)} />

                        <GoogleMap
                            mapContainerStyle={mapContainerStyle}
                            center={request.origin || { lat: 8.9326, lng: -67.4264 }}
                            zoom={14}
                            onLoad={onLoad}
                            onUnmount={onUnmount}
                            options={{
                                ...mapOptions,
                                styles: googleMapsDarkStyles
                            }}
                        >
                            {/* Real-time User Location (Blue Dot) */}
                            {userLocation && (
                                <Marker
                                    position={userLocation}
                                    icon={{
                                        path: google.maps.SymbolPath.CIRCLE,
                                        fillColor: '#4285F4',
                                        fillOpacity: 1,
                                        strokeColor: 'white',
                                        strokeWeight: 2,
                                        scale: 7
                                    }}
                                    zIndex={1}
                                />
                            )}

                            {/* Driver Real-time Location (Vehicle Icon) */}
                            {driver?.currentLocation && ['accepted', 'arriving', 'in_progress'].includes(request.status) && (
                                <Marker
                                    position={{ lat: driver.currentLocation.latitude, lng: driver.currentLocation.longitude }}
                                    icon={{
                                        url: driver.vehicleType === 'moto' 
                                            ? 'https://cdn-icons-png.flaticon.com/512/3721/3721619.png' 
                                            : 'https://cdn-icons-png.flaticon.com/512/1048/1048314.png',
                                        scaledSize: new google.maps.Size(40, 40),
                                        anchor: new google.maps.Point(20, 20)
                                    }}
                                    zIndex={2}
                                />
                            )}
                        </GoogleMap>
                    </div>
                ) : null}
            </div>

            {/* Modal de Chat Integrado, estilo Bottom Sheet para que el mapa quede visible */}
            {showChat && (
                <div className="fixed inset-0 z-[100] bg-slate-900/40 flex flex-col justify-end animate-fade-in pointer-events-auto">
                    <div className="h-[75vh] w-full bg-white rounded-t-3xl overflow-hidden shadow-[0_-10px_40px_rgba(0,0,0,0.2)] animate-slide-up">
                        <RideChat requestId={requestId!} onClose={() => setShowChat(false)} />
                    </div>
                </div>
            )}

            {/* Bottom Sheet */}
            <div className="relative z-30 bg-white rounded-t-[24px] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] pt-2 pb-4 px-4 sm:px-6">
                <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto my-2"></div>

                {/* Status Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 ${statusInfo.bg} ${statusInfo.color} rounded-xl flex items-center justify-center shrink-0`}>
                        <StatusIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-black text-slate-900 leading-none">{statusInfo.title}</h2>
                            {request.scheduled && (
                                <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider animate-pulse border border-purple-200">
                                    RESERVA
                                </span>
                            )}
                        </div>
                        <p className="font-bold text-slate-500 text-xs mt-0.5">
                            {request.scheduled && request.status === 'searching' 
                                ? `Programado para: ${(request.scheduledAt ? (typeof request.scheduledAt.toDate === 'function' ? request.scheduledAt.toDate() : new Date(request.scheduledAt)) : null)?.toLocaleString('es-VE', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Fecha pendiente'}`
                                : statusInfo.subtitle}
                        </p>
                    </div>
                </div>

                {/* Cancelar Reserva Botón */}
                {request.scheduled && ['searching', 'accepted'].includes(request.status) && (
                    <div className="mb-4 p-2.5 bg-red-50 border border-red-100 rounded-xl flex flex-col items-center">
                        <p className="text-[10px] text-red-600 font-bold text-center mb-2 leading-tight">
                            Puedes cancelar y el dinero será devuelto a tu billetera.
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
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-bold text-amber-800">Reporte enviado. El conductor fue notificado.</span>
                    </div>
                )}
                {showLostItem && !lostItemSent && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3 animate-fade-in">
                        <h4 className="font-black text-slate-800 text-sm mb-1">📦 Reportar objeto olvidado</h4>
                        <p className="text-[10px] text-slate-500 font-medium mb-3">Describe el objeto. Tu conductor recibirá una notificación inmediata.</p>
                        <textarea
                            value={lostItemDesc}
                            onChange={e => setLostItemDesc(e.target.value)}
                            placeholder="Ej: Mochila negra con mi laptop..."
                            className="w-full bg-white border border-amber-200 rounded-xl p-3 text-xs outline-none min-h-[60px] resize-none mb-3 focus:ring-2 focus:ring-amber-200 placeholder:text-slate-400"
                        />
                        <button
                            onClick={handleLostItem}
                            disabled={!lostItemDesc.trim() || submittingLost}
                            className="w-full bg-amber-400 text-slate-900 font-black py-2.5 rounded-xl text-sm flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {submittingLost
                                ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                : 'Enviar Reporte'}
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
                            <p className="font-black text-sm text-slate-800">{routeInfo.duration}</p>
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
                                    <p className="text-[11px] font-black text-primary capitalize mt-0.5">
                                        {(driver as any).vehicle_model || driver.vehicleType || 'Vehículo'} • {(driver as any).vehicle_plate || driver.vehiclePlate || 'Sin placa'}
                                        {((driver as any).vehicle_color || driver.vehicleColor) ? ` (${(driver as any).vehicle_color || driver.vehicleColor})` : ''}
                                    </p>
                                </div>
                            </div>

                            {/* In-app chat & call — Strictly 0 WhatsApp links */}
                            <div className="flex gap-2">
                                {['searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress'].includes(request.status) && (
                                    <button
                                        onClick={() => setShowChat(true)}
                                        className="w-10 h-10 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center active:scale-95 transition-transform relative shadow-sm"
                                        title="Chat con conductor"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        {unreadCount > 0 && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full border border-white flex items-center justify-center animate-bounce">
                                                {unreadCount}
                                            </div>
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

                {/* Driver Pago Móvil Details (If Payment Method is Pago Móvil) */}
                {(request.payment_method === 'pago_movil' || request.paymentMethod === 'pagoMovil') && (
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
                            const pm = request.driver_payment_info || (driver as any)?.payment_info || (driver as any)?.paymentInfo || {};
                            const bank = pm.bank || 'Banesco';
                            const phone = pm.phone || driver?.phone || '0414-0000000';
                            const idf = pm.idf || (driver as any)?.cedula || 'V-00000000';
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

                {/* In-App Call Modal */}
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

                {/* Payment Summary */}
                <div className="bg-slate-50 rounded-2xl p-3 flex justify-between items-center border border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500">Total del Viaje</p>
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

                {/* Cancel Trip Button */}
                {['searching', 'accepted', 'arriving'].includes(request.status) && (
                    <button
                        onClick={() => setShowCancelModal(true)}
                        className="w-full mt-3 py-2.5 bg-red-50 text-red-600 font-black text-xs rounded-xl border border-red-200/80 hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                        <XCircle className="w-4 h-4" /> Cancelar Viaje
                    </button>
                )}

                {/* Cancellation Modal with 50% penalty warning if arriving */}
                {showCancelModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3.5">
                            <div className="flex items-center gap-2.5 text-red-600">
                                <AlertTriangle className="w-6 h-6 shrink-0" />
                                <h3 className="text-base font-black text-slate-900">¿Cancelar viaje?</h3>
                            </div>

                            {request.status === 'arriving' ? (
                                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-1.5 text-xs text-red-900">
                                    <p className="font-black text-red-700">⚠️ Conductor ya en el sitio</p>
                                    <p className="text-[11px] text-red-800 leading-snug">
                                        El conductor ya ha llegado al punto de recogida. Si confirmas la cancelación, se aplicará una penalidad del <b>50% (${(parseFloat(request.price || request.total || 0) * 0.5).toFixed(2)})</b> para compensar el gasto de traslado del conductor.
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
                                    ) : request.status === 'arriving' ? (
                                        'Confirmar (-50%)'
                                    ) : (
                                        'Confirmar'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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

            </div>
        </div>
    );
}
