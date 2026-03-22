import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, onSnapshot, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
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
                {request.status === 'completed' ? (
                    <div className="flex flex-col items-center justify-center gap-6 animate-fade-in px-8">
                        <div className="w-48 h-48 bg-white rounded-[40px] shadow-2xl shadow-primary/20 p-8 flex items-center justify-center border-4 border-primary/10">
                            <img
                                src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20oficial.png?alt=media&token=2dd047ea-6c45-4347-8869-1a1edf4253f4"
                                alt="2X3 Logo"
                                className="w-full h-full object-contain animate-bounce-subtle"
                            />
                        </div>
                        <div className="text-center">
                            <h3 className="text-2xl font-black text-slate-900 mb-2">¡Servicio Finalizado!</h3>
                            <p className="text-slate-500 font-bold max-w-[250px]">Gracias por confiar en el transporte express de 2X3</p>
                        </div>
                    </div>
                ) : !showChat ? (
                    <GoogleMap
                        mapContainerStyle={mapContainerStyle}
                        center={request.origin || { lat: 10.4806, lng: -66.9036 }}
                        zoom={14}
                        onLoad={onLoad}
                        onUnmount={onUnmount}
                        options={mapOptions}
                    />
                ) : (
                    <div className="absolute inset-0 z-40 bg-white">
                        <RideChat requestId={requestId!} onClose={() => setShowChat(false)} />
                    </div>
                )}
            </div>

            {/* Bottom Sheet */}
            <div className="relative z-30 bg-white rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] pt-2 pb-6 px-6">
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-3"></div>

                {/* Status Header */}
                <div className="flex items-center gap-4 mb-6">
                    <div className={`w-14 h-14 ${statusInfo.bg} ${statusInfo.color} rounded-2xl flex items-center justify-center shrink-0`}>
                        <StatusIcon className="w-7 h-7" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900">{statusInfo.title}</h2>
                        <p className="font-bold text-slate-500 ">{statusInfo.subtitle}</p>
                    </div>
                </div>

                {/* Guest Banner */}
                {request.userId?.startsWith('guest_') && (
                    <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-5 rounded-2xl shadow-lg mb-6 w-full relative overflow-hidden">
                        <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/20 rounded-full blur-xl animate-pulse"></div>
                        <h3 className="text-white font-black text-xl mb-2 relative z-10">🎁 ¡Gana viajes gratis!</h3>
                        <p className="text-white/90 text-xs font-medium mb-3 relative z-10">
                            Regístrate en 2X3 y obtén increíbles premios, descuentos y acumula puntos en todos los viajes.
                        </p>
                        <button onClick={() => navigate('/profile')} className="inline-block bg-white text-orange-600 text-sm font-bold px-5 py-2 rounded-xl shadow-md hover:scale-105 active:scale-95 transition-transform relative z-10">
                            Registrarme ahora
                        </button>
                    </div>
                )}

                {/* Rating Section if Completed */}
                {request.status === 'completed' && !request.rating && !hasRated && (
                    <div className="bg-indigo-50/50 border-2 border-indigo-100 rounded-3xl p-6 mb-6 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="text-center font-black text-slate-800 text-lg mb-2">¿Qué tal estuvo tu viaje?</h3>
                        <p className="text-center text-xs font-bold text-slate-500 mb-6">Tu opinión nos ayuda a mejorar el servicio</p>

                        <div className="flex justify-center gap-3 mb-8">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onMouseEnter={() => setHoverRating(star)}
                                    onMouseLeave={() => setHoverRating(0)}
                                    onClick={() => setRating(star)}
                                    className="transition-all transform active:scale-90"
                                >
                                    <Star
                                        className={`w-10 h-10 ${(hoverRating || rating) >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} transition-colors animate-in zoom-in-75`}
                                        strokeWidth={1.5}
                                    />
                                </button>
                            ))}
                        </div>

                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Déjanos un comentario (opcional)..."
                            className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-100 min-h-[100px] mb-6 outline-none transition-all placeholder:text-slate-400"
                        />

                        <button
                            onClick={handleRateTrip}
                            disabled={rating === 0 || submittingRating}
                            className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-600/30 flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {submittingRating ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Enviar Calificación'}
                        </button>
                    </div>
                )}

                {hasRated && (
                    <div className="bg-emerald-50 border-2 border-emerald-100 rounded-3xl p-6 mb-6 text-center animate-in zoom-in-95">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                            <CheckCircle2 className="w-7 h-7" />
                        </div>
                        <h3 className="font-black text-emerald-900 mb-1">¡Gracias por tu mensaje!</h3>
                        <p className="text-sm font-bold text-emerald-700/70">Tu calificación ha sido enviada con éxito.</p>
                    </div>
                )}

                {/* Route Info summary if available */}
                {routeInfo && (
                    <div className="flex gap-4 mb-6 pt-6 border-t border-slate-100">
                        <div className="flex-1 bg-slate-50 p-3 rounded-2xl text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Distancia</p>
                            <p className="font-black text-slate-800">{routeInfo.distance}</p>
                        </div>
                        <div className="flex-1 bg-slate-50 p-3 rounded-2xl text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Tiempo Estimado</p>
                            <p className="font-black text-slate-800">{routeInfo.duration}</p>
                        </div>
                    </div>
                )}

                {/* Driver Info (If Assigned) */}
                {driver && (
                    <div className="bg-white rounded-2xl p-4 border-2 border-slate-100 mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <img src={driver.documents.selfieUrl} alt="Driver" className="w-14 h-14 rounded-full object-cover bg-slate-100" />
                                <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-white">
                                    ★ 4.9
                                </div>
                            </div>
                            <div>
                                <p className="font-black text-slate-900 leading-tight">{driver.fullName.split(' ')[0]}</p>
                                <p className="text-xs font-bold text-slate-500 capitalize">{driver.vehicleType} • {driver.vehiclePlate}</p>
                                <p className="text-[11px] font-bold text-slate-400 mt-0.5">{driver.vehicleColor}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowChat(true)} className="w-12 h-12 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center active:scale-95 transition-transform">
                                <MessageCircle className="w-5 h-5" />
                            </button>
                            <a href={`tel:${driver.phone}`} className="w-12 h-12 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center active:scale-95 transition-transform">
                                <Phone className="w-5 h-5 fill-current" />
                            </a>
                        </div>
                    </div>
                )}

                {/* Payment Summary */}
                <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center">
                    <div>
                        <p className="text-xs font-bold text-slate-500 mb-1">Total del Viaje</p>
                        <p className="font-black text-lg text-slate-900">${parseFloat(request.price).toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-slate-500 mb-1">Método</p>
                        <p className="font-bold text-slate-700 capitalize">
                            {request.paymentMethod === 'pagoMovil' ? 'Pago Móvil' : request.paymentMethod}
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
