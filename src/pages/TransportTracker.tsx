import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, onSnapshot, getDoc, updateDoc, serverTimestamp, query, collection, orderBy, limit, increment, addDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { DeliveryDriver } from '../lib/delivery-service';
import toast from 'react-hot-toast';
import { Navigation, Clock, CheckCircle2, Phone, ArrowLeft, Car, ShieldCheck, MessageCircle, Star, XCircle, MapPin } from 'lucide-react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';
import RideChat from '../components/RideChat';

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
    const [request, setRequest] = useState<any>(null);
    const [driver, setDriver] = useState<DeliveryDriver | null>(null);
    const [loading, setLoading] = useState(true);
    const location = useLocation();
    const [showChat, setShowChat] = useState(new URLSearchParams(location.search).get('chat') === 'true');
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [submittingRating, setSubmittingRating] = useState(false);
    const [hasRated, setHasRated] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    
    // Notification sound
    const notificationSoundUrl = useRef<string | null>(null);
    const prevStatus = useRef<string | null>(null);
    const lastChatIdSeen = useRef<string | null>(null);

    // Map states
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: "AIzaSyCb1c-p1R6AZGetk8YzKiLuxjaxjmPqJX8"
    });
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
    const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);
    const [routeInfo, setRouteInfo] = useState<{ distance: string, duration: string } | null>(null);


    useEffect(() => {
        if (!requestId) return;

        const unsubscribe = onSnapshot(doc(db, 'transport_requests', requestId), async (snapshot) => {
            if (snapshot.exists()) {
                const requestData = snapshot.data();
                setRequest(requestData);

                // If a driver was assigned, fetch their profile
                if (requestData.driverId && (!driver || driver.id !== requestData.driverId)) {
                    const dDoc = await getDoc(doc(db, 'delivery_drivers', requestData.driverId));
                    if (dDoc.exists()) {
                        setDriver({ id: dDoc.id, ...dDoc.data() } as DeliveryDriver);
                    }
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [requestId]);

    // Fetch notification sound
    useEffect(() => {
        const fetchSound = async () => {
            try {
                const soundRef = ref(storage, 'Digital_Cascade_01.mp3');
                const url = await getDownloadURL(soundRef);
                notificationSoundUrl.current = url;
            } catch (err) {
                console.error("No se pudo cargar el sonido de notificación:", err);
            }
        };
        fetchSound();
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

        const q = query(
            collection(db, `transport_requests/${requestId}/messages`),
            orderBy('createdAt', 'desc'),
            limit(1)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const latestMsg = snapshot.docs[0];
                const data = latestMsg.data();
                
                // Si es un mensaje nuevo y es del conductor
                if (lastChatIdSeen.current !== null && 
                    lastChatIdSeen.current !== latestMsg.id && 
                    data.senderId !== request?.userId) {
                    
                    const now = Date.now();
                    const msgTime = data.createdAt?.toMillis() || now;
                    if (now - msgTime < 30000) {
                        // Play sound
                        if (notificationSoundUrl.current) {
                            const audio = new Audio(notificationSoundUrl.current);
                            audio.play().catch(e => console.error("Error playing chat audio:", e));
                        }

                        // Alerta Visual (Toast)
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
                lastChatIdSeen.current = latestMsg.id;
            } else {
                lastChatIdSeen.current = "";
            }
        });

        return () => unsub();
    }, [requestId, showChat, request?.userId]);

    useEffect(() => {
        if (request && ['completed', 'cancelled'].includes(request.status)) {
            setShowChat(false);
        }
    }, [request?.status]);

    const handleRateTrip = async () => {
        if (!requestId || rating === 0) return;
        setSubmittingRating(true);
        try {
            await updateDoc(doc(db, 'transport_requests', requestId), {
                rating,
                ratingComment: comment,
                ratedAt: serverTimestamp()
            });
            setHasRated(true);
            toast.success("¡Gracias por tu calificación!");
        } catch (error) {
            console.error("Error rating trip:", error);
            toast.error("Error al enviar calificación");
        } finally {
            setSubmittingRating(false);
        }
    };

    const handleCancelReservation = async () => {
        if (!requestId || !request) return;
        if (!confirm("¿Seguro que deseas cancelar esta reserva? El dinero será devuelto a tu billetera virtual.")) return;
        try {
            await updateDoc(doc(db, 'transport_requests', requestId), {
                status: 'cancelled',
                cancelledAt: serverTimestamp()
            });

            if (request.price && request.price > 0 && !request.userId.startsWith('guest_')) {
                const userRef = doc(db, 'users', request.userId);
                await updateDoc(userRef, {
                    walletBalance: increment(request.price)
                });

                await addDoc(collection(db, 'wallet_recharges'), {
                    userId: request.userId,
                    amount: request.price,
                    status: 'approved',
                    paymentMethod: 'Reembolso',
                    reference: 'Cancelación Reserva ' + requestId.slice(0, 6),
                    createdAt: serverTimestamp(),
                });
            }

            toast.success("Reserva cancelada. Fondos reembolsados a tu billetera.");
            navigate('/taxi');
        } catch (error) {
            console.error("Error cancelling reservation:", error);
            toast.error("Error al cancelar la reserva");
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
                    if (status === google.maps.DirectionsStatus.OK && result) {

                        if (!directionsRenderer) {
                            const renderer = new google.maps.DirectionsRenderer({
                                map,
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
                            setRouteInfo({
                                distance: leg.distance?.text || '',
                                duration: leg.duration?.text || ''
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
                                src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&v=1.1"
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
                        <GoogleMap
                            mapContainerStyle={mapContainerStyle}
                            center={request.origin || { lat: 10.4806, lng: -66.9036 }}
                            zoom={14}
                            onLoad={onLoad}
                            onUnmount={onUnmount}
                            options={mapOptions}
                        />
                    </div>
                ) : null}
            </div>

            {/* Modal de Chat Integrado, fixed a pantalla completa */}
            {showChat && (
                <div className="fixed inset-0 z-[100] bg-white flex flex-col">
                    <RideChat requestId={requestId!} onClose={() => setShowChat(false)} />
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
                                ? `Programado para: ${request.scheduledAt && typeof request.scheduledAt.toDate === 'function' ? request.scheduledAt.toDate().toLocaleString('es-VE', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Fecha pendiente'}`
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

                {/* Rating Section if Completed */}
                {request.status === 'completed' && !request.rating && !hasRated && (
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mb-4">
                        <h3 className="text-center font-black text-slate-800 text-base mb-1">¿Qué tal estuvo tu viaje?</h3>
                        <p className="text-center text-[10px] font-bold text-slate-500 mb-3">Tu opinión ayuda a mejorar el servicio</p>

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
                                        className={`w-8 h-8 ${(hoverRating || rating) >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} transition-colors`}
                                        strokeWidth={1.5}
                                    />
                                </button>
                            ))}
                        </div>

                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Déjanos un comentario (opcional)..."
                            className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100 min-h-[60px] mb-3 outline-none transition-all placeholder:text-slate-400"
                        />

                        <button
                            onClick={handleRateTrip}
                            disabled={rating === 0 || submittingRating}
                            className="w-full bg-primary text-slate-900 font-bold py-2.5 rounded-xl shadow-md shadow-primary/20 flex justify-center items-center gap-2 active:scale-95 transition-all text-sm disabled:opacity-50"
                        >
                            {submittingRating ? <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div> : 'Enviar Calificación'}
                        </button>
                    </div>
                )}

                {hasRated && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 mb-4 flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold text-emerald-900 text-sm">Mensaje enviado. ¡Gracias!</span>
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
                    <div className="bg-white rounded-xl p-3 border border-slate-200 mb-4 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <img src={driver.documents.selfieUrl} alt="Driver" className="w-10 h-10 rounded-full object-cover bg-slate-100" />
                                <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-white">
                                    ★ 4.9
                                </div>
                            </div>
                            <div>
                                <p className="font-black text-slate-900 text-sm leading-tight">{driver.fullName.split(' ')[0]}</p>
                                <p className="text-[10px] font-bold text-slate-500 capitalize">{driver.vehicleType} • {driver.vehiclePlate}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {['searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress'].includes(request.status) && (
                                <button onClick={() => setShowChat(true)} className="w-10 h-10 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center active:scale-95 transition-transform relative">
                                    <MessageCircle className="w-4 h-4" />
                                    {unreadCount > 0 && (
                                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full border border-white flex items-center justify-center animate-bounce">
                                            {unreadCount}
                                        </div>
                                    )}
                                </button>
                            )}
                            <a href={`tel:${driver.phone}`} className="w-10 h-10 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center active:scale-95 transition-transform">
                                <Phone className="w-4 h-4 fill-current" />
                            </a>
                        </div>
                    </div>
                )}

                {/* Payment Summary */}
                <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center border border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500">Total a pagar</p>
                        <p className="font-black text-base text-slate-900">${parseFloat(request.price).toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500">Método de pago</p>
                        <p className="font-bold text-xs text-slate-700 capitalize">
                            {request.paymentMethod === 'pagoMovil' ? 'Pago Móvil' : request.paymentMethod}
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
