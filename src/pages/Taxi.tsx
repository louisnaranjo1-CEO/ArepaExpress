import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Car, Bike, MapPin, Navigation, ArrowRight, CheckCircle2, X, Heart, History, Star, Wallet, Upload } from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';
import toast from 'react-hot-toast';

interface Location {
    lat: number;
    lng: number;
    address: string;
}

const mapContainerStyle = {
    width: '100%',
    height: '100vh',
    position: 'absolute' as 'absolute',
    top: 0,
    left: 0,
    zIndex: 0
};

const defaultCenter = {
    lat: 10.4806, // Caracas, Venezuela
    lng: -66.9036
};

// Custom map theme to hide default POIs
const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    clickableIcons: true,
    styles: [
        {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "on" }]
        },
        {
            featureType: "business",
            elementType: "labels",
            stylers: [{ visibility: "on" }]
        },
        {
            featureType: "transit",
            elementType: "labels",
            stylers: [{ visibility: "on" }]
        },
        {
            featureType: "road",
            elementType: "labels",
            stylers: [{ visibility: "on" }]
        }
    ]
};

export default function Taxi() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();

    // Map instances and services
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: "AIzaSyCb1c-p1R6AZGetk8YzKiLuxjaxjmPqJX8"
    });

    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
    const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
    const [step, setStep] = useState<'origin' | 'destination' | 'vehicle' | 'payment' | 'searching'>('origin');

    const [origin, setOrigin] = useState<Location | null>(null);
    const [destination, setDestination] = useState<Location | null>(null);
    const [currentCenter, setCurrentCenter] = useState(defaultCenter);
    const [isDragging, setIsDragging] = useState(false);

    const [routeInfo, setRouteInfo] = useState<{ distance: number, duration: string } | null>(null);

    const [vehicleType, setVehicleType] = useState<'moto' | 'carro' | 'ejecutivo' | null>(null);
    const [adminRates, setAdminRates] = useState<any>(null);
    const [paymentMethods, setPaymentMethods] = useState<any>(null);
    const [isMapInteractionEnabled, setIsMapInteractionEnabled] = useState(true);
    const [serviceHours, setServiceHours] = useState<any>(null);

    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
    const [paymentProof, setPaymentProof] = useState<File | null>(null);
    const [paymentRef, setPaymentRef] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);

    const geocoderRef = useRef<google.maps.Geocoder | null>(null);
    const mapCenterRef = useRef(defaultCenter);

    // 1. Fetch Admin Rates and Settings
    useEffect(() => {
        const fetchConfigs = async () => {
            try {
                const docSnap = await getDoc(doc(db, 'delivery_settings', 'settings'));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.transportRates) setAdminRates(data.transportRates);
                    setServiceHours({
                        day: data.dayShift,
                        night: data.nightShift
                    });
                }

                const financeSnap = await getDoc(doc(db, 'system_configs', 'finances'));
                if (financeSnap.exists()) {
                    setPaymentMethods(financeSnap.data().paymentMethods);
                } else {
                    // Fallback to basic payment methods if config is missing
                    setPaymentMethods({
                        cash: { active: true, logoUrl: '' },
                        pagoMovil: { active: false, bank: '', phone: '', idf: '', logoUrl: '' }
                    });
                }
            } catch (error) {
                console.error("Error fetching configs:", error);
                // Ensure the app doesn't hang if there's a network error
                setPaymentMethods({
                    cash: { active: true, logoUrl: '' }
                });
            }
        };
        fetchConfigs();
    }, []);

    // 2. Map Callbacks
    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map);
        geocoderRef.current = new google.maps.Geocoder();
        setDirectionsService(new google.maps.DirectionsService());

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setCurrentCenter(newPos);
                mapCenterRef.current = newPos;
                map.panTo(newPos);
                updateAddressFromCenter(newPos, 'origin');
            }, (error) => {
                console.error("Geolocation error:", error);
            });
        }
    }, []);

    const onUnmount = useCallback(function callback(map: google.maps.Map) {
        setMap(null);
    }, []);

    // 3. Reverse Geocoding Helper
    const updateAddressFromCenter = async (pos: { lat: number, lng: number }, type: 'origin' | 'destination') => {
        if (!geocoderRef.current) return;

        try {
            const response = await geocoderRef.current.geocode({ location: pos });
            if (response.results[0]) {
                const address = response.results[0].formatted_address;
                const loc = { lat: pos.lat, lng: pos.lng, address };

                if (type === 'origin') setOrigin(loc);
                else setDestination(loc);
            }
        } catch (error) {
            console.error("Geocoding failed:", error);
            const loc = { lat: pos.lat, lng: pos.lng, address: "Ubicación seleccionada" };
            if (type === 'origin') setOrigin(loc);
            else setDestination(loc);
        }
    };

    // 4. Map Event Listeners
    const handleMapDragStart = () => {
        setIsDragging(true);
    };

    const handleMapDragEnd = () => {
        setIsDragging(false);
        if (map && (step === 'origin' || step === 'destination')) {
            const center = map.getCenter();
            if (center) {
                const newPos = { lat: center.lat(), lng: center.lng() };
                mapCenterRef.current = newPos;
                updateAddressFromCenter(newPos, step);
            }
        }
    };

    // 5. Route Calculation
    useEffect(() => {
        let isMounted = true;
        if (step === 'vehicle' && origin && destination && directionsService && !directionsResponse) {
            setIsCalculatingRoute(true);

            const request: google.maps.DirectionsRequest = {
                origin: { lat: origin.lat, lng: origin.lng },
                destination: { lat: destination.lat, lng: destination.lng },
                travelMode: google.maps.TravelMode.DRIVING
            };

            directionsService.route(request, (result, status) => {
                if (!isMounted) return;

                setIsCalculatingRoute(false);

                if (status === google.maps.DirectionsStatus.OK && result) {
                    setDirectionsResponse(result);
                    const leg = result.routes[0]?.legs[0];
                    if (leg && leg.distance) {
                        const distanceKm = Number((leg.distance.value / 1000).toFixed(1));
                        setRouteInfo({
                            distance: distanceKm,
                            duration: leg.duration?.text || ''
                        });
                        setIsMapInteractionEnabled(false);
                    } else {
                        // Edge case: Route OK but no legs/distance parsed
                        handleRouteFallback("Distancia no disponible en la ruta.");
                    }
                } else {
                    console.warn("Route calculation failed:", status);
                    handleRouteFallback("No se pudo calcular la ruta exacta.");
                }
            });

            const handleRouteFallback = (message: string) => {
                // Fallback to Haversine distance
                const R = 6371; // Radius of the earth in km
                const dLat = (destination.lat - origin.lat) * (Math.PI / 180);
                const dLon = (destination.lng - origin.lng) * (Math.PI / 180);
                const a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(origin.lat * (Math.PI / 180)) * Math.cos(destination.lat * (Math.PI / 180)) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const straightDistance = R * c;

                // Add 30% to approximate driving distance in a city
                const estimatedDrivingDistance = Number((straightDistance * 1.3).toFixed(1));

                // Estimate duration (approx 30 km/h avg city speed)
                const estMinutes = Math.max(1, Math.round(estimatedDrivingDistance / 0.5));
                const durationText = estMinutes > 60
                    ? `${Math.floor(estMinutes / 60)} h ${estMinutes % 60} min`
                    : `${estMinutes} min`;

                // Generate a fake route info so the user can continue
                toast.success(`Usando ruta estimada.${message} `, { icon: '🗺️' });
                setRouteInfo({
                    distance: estimatedDrivingDistance,
                    duration: durationText
                });
                setDirectionsResponse(null); // Clear any old polyline
                setIsMapInteractionEnabled(false);
            };
        }
        return () => { isMounted = false; };
    }, [step, origin, destination, directionsService, directionsResponse]);

    // 6. Navigation Helpers
    const confirmOrigin = () => {
        if (!origin) return;
        setStep('destination');
    };

    const confirmDestination = () => {
        if (!destination || isDragging) return;
        setStep('vehicle');
    };

    const goBack = () => {
        if (step === 'searching') return;

        if (step === 'payment') {
            setStep('vehicle');
            return;
        }

        setDirectionsResponse(null);
        setRouteInfo(null);
        setIsMapInteractionEnabled(true);

        if (step === 'vehicle') {
            setStep('destination');
        } else if (step === 'destination') {
            setStep('origin');
        }
    };

    const calculatePrice = (type: 'moto' | 'carro' | 'ejecutivo', forDriver: boolean = false) => {
        if (!adminRates || !routeInfo) return "0.00";
        const rates = adminRates[type];
        if (!Array.isArray(rates) || rates.length === 0) return "0.00";

        const distance = routeInfo.distance;

        // Find matching range
        const matchingRange = rates.find(r => {
            const fromKm = parseFloat(String(r.from || '0'));
            const toKm = parseFloat(String(r.to || '0'));
            return distance >= fromKm && (toKm === 0 || distance <= toKm);
        });

        if (matchingRange) {
            const priceValue = forDriver
                ? (matchingRange.driverPrice || matchingRange.price)
                : (matchingRange.clientPrice || matchingRange.price);
            return parseFloat(String(priceValue || '0')).toFixed(2);
        }

        // Fallback to highest range if distance exceeds
        const sortedRates = [...rates].sort((a, b) => {
            const fromA = parseFloat(String(a.from || '0'));
            const fromB = parseFloat(String(b.from || '0'));
            return fromB - fromA;
        });

        const lastRange = sortedRates[0];
        if (lastRange) {
            const priceValue = forDriver
                ? (lastRange.driverPrice || lastRange.price)
                : (lastRange.clientPrice || lastRange.price);
            return parseFloat(String(priceValue || '0')).toFixed(2);
        }

        return "0.00";
    };

    const handleContinueToPayment = () => {
        if (!vehicleType || !routeInfo) return;
        setStep('payment');
    };

    const handleRequestTaxi = async () => {
        if (!user || !origin || !destination || !vehicleType || !routeInfo || !selectedPaymentMethod) return;

        const clientTotal = calculatePrice(vehicleType);
        const driverPayout = calculatePrice(vehicleType, true);

        // Wallet validation
        if (selectedPaymentMethod === 'wallet') {
            const currentBalance = userData?.walletBalance || 0;
            if (currentBalance < parseFloat(clientTotal as string)) {
                toast.error("Saldo insuficiente en tu Billetera 2X3. Por favor recarga o selecciona otro método.");
                return;
            }
        } else if (selectedPaymentMethod !== 'cash' && !paymentProof && !paymentRef) {
            toast.error("Debes adjuntar un comprobante o número de referencia");
            return;
        }

        setIsUploading(true);
        try {
            let proofUrl = '';

            if (selectedPaymentMethod === 'wallet') {
                // Wallet has no proof to upload
            } else if (paymentProof && selectedPaymentMethod !== 'cash') {
                const storageRef = ref(storage, `taxi_proofs/${user.uid}/${Date.now()}_${paymentProof.name}`);
                const snapshot = await uploadBytes(storageRef, paymentProof);
                proofUrl = await getDownloadURL(snapshot.ref);
            } else if (selectedPaymentMethod !== 'cash' && !paymentRef) {
                // Double check validation before proceeding
                toast.error("Debes adjuntar un comprobante o número de referencia");
                setIsUploading(false);
                return;
            }

            // For wallet, status is searching immediately.
            const initialStatus = selectedPaymentMethod === 'wallet' ? 'searching' : 'verifying_payment';

            setStep('searching');

            const orderData = {
                type: 'transport',
                userId: user.uid,
                userName: userData?.displayName || user.email,
                userPhone: userData?.phone || '',
                origin,
                destination,
                vehicleType,
                route: routeInfo,
                total: parseFloat(clientTotal as string),
                price: parseFloat(clientTotal as string),
                driverPayout: parseFloat(driverPayout as string),
                status: initialStatus,
                paymentMethod: selectedPaymentMethod,
                paymentRef: paymentRef,
                paymentProofUrl: proofUrl,
                createdAt: serverTimestamp(),
            };

            const requestRef = await addDoc(collection(db, 'transport_requests'), orderData);

            if (selectedPaymentMethod === 'wallet') {
                // Deduct from wallet
                const newBalance = (userData?.walletBalance || 0) - parseFloat(clientTotal as string);
                await updateDoc(doc(db, 'users', user.uid), {
                    walletBalance: newBalance
                });
            }

            if (initialStatus === 'searching') {
                const driversSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['delivery', 'driver'])));
                const batch = writeBatch(db);
                driversSnap.docs.forEach(driverDoc => {
                    const notifRef = doc(collection(db, 'notifications'));
                    batch.set(notifRef, {
                        userId: driverDoc.id,
                        title: '¡Nuevo Servicio de Taxi Disponible!',
                        body: 'Hay una nueva solicitud de transporte esperándote.',
                        read: false,
                        createdAt: serverTimestamp()
                    });
                });
                await batch.commit();
            }

            // Listen for admin verification
            setTimeout(() => {
                navigate(`/taxi/track/${requestRef.id}`);
            }, 1000);

        } catch (error) {
            console.error("Error creating transport request:", error);
            toast.error("No se pudo procesar la solicitud.");
            setStep('payment');
        } finally {
            setIsUploading(false);
        }
    };

    if (!isLoaded) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 min-h-[100dvh]">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (step === 'searching') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in bg-white h-[100dvh]">
                <div className="relative mb-8">
                    <div className="w-32 h-32 bg-yellow-500/10 rounded-full flex items-center justify-center z-10 relative">
                        <CheckCircle2 className="w-12 h-12 text-yellow-500" />
                    </div>
                    <div className="absolute inset-0 bg-yellow-500 rounded-full animate-ping opacity-20"></div>
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">Verificando Pago...</h2>
                <p className="text-slate-500 font-medium px-6">Por favor espera mientras confirmamos tu comprobante. En breve se te asignará un conductor.</p>
            </div>
        );
    }

    return (
        <div className="relative h-[100dvh] bg-slate-100 overflow-hidden flex flex-col">
            {/* 1. Google Map Background */}
            <div className="absolute inset-0 z-0 h-full w-full">
                <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={currentCenter}
                    zoom={15}
                    onLoad={onLoad}
                    onUnmount={onUnmount}
                    options={{
                        ...mapOptions,
                        gestureHandling: isMapInteractionEnabled ? 'greedy' : 'none'
                    }}
                    onDragStart={handleMapDragStart}
                    onDragEnd={handleMapDragEnd}
                >
                    {directionsResponse && (
                        <DirectionsRenderer
                            directions={directionsResponse}
                            options={{
                                suppressMarkers: false,
                                polylineOptions: {
                                    strokeColor: '#FF5D00', // Brand Primary Orange
                                    strokeWeight: 5,
                                    strokeOpacity: 0.9
                                }
                            }}
                        />
                    )}

                    {/* Fixed center marker for selection */}
                    {(step === 'origin' || step === 'destination') && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-10 pointer-events-none drop-shadow-xl">
                            {step === 'origin' ? (
                                <div className={`transition-transform duration-200 ${isDragging ? '-translate-y-4' : ''}`}>
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="#000000" />
                                        <circle cx="12" cy="9" r="3" fill="white" />
                                    </svg>
                                </div>
                            ) : (
                                <div className={`transition-transform duration-200 ${isDragging ? '-translate-y-4' : ''}`}>
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="#4f46e5" />
                                        <circle cx="12" cy="9" r="3" fill="white" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    )}
                </GoogleMap>

                {/* Brand Header Overlay */}
                <div className="absolute top-0 left-0 right-0 z-10 p-4 pt-6 bg-gradient-to-b from-black/20 to-transparent pointer-events-none">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg border border-white/20 pointer-events-auto bg-white p-1">
                            <img src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20oficial.png?alt=media" alt="2X3 Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-white/20 pointer-events-auto flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-[10px] font-black uppercase text-slate-900 tracking-wider">Taxi 2X3 • En línea</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Back Button Overlay */}
            {step !== 'origin' && (
                <button
                    onClick={goBack}
                    className="absolute top-6 left-6 z-20 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-95 text-slate-700"
                >
                    <X className="w-6 h-6" />
                </button>
            )}

            {/* Locate Me Button Overlay */}
            {(step === 'origin' || step === 'destination') && (
                <button
                    onClick={() => {
                        if (navigator.geolocation && map) {
                            navigator.geolocation.getCurrentPosition((pos) => {
                                const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                                map.panTo(newPos);
                                updateAddressFromCenter(newPos, step);
                            });
                        }
                    }}
                    className="absolute bottom-40 right-6 z-20 w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center active:scale-95 text-orange-500"
                >
                    <Navigation className="w-5 h-5 fill-orange-500/20" />
                </button>
            )}

            {/* 2. Bottom Sheet UI */}
            <div className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transition-all duration-300">

                {/* Drag handle decoration */}
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-4 mb-2"></div>

                <div className="p-6 pt-2 max-h-[50vh] overflow-y-auto">

                    {/* STEP 1: ORIGIN */}
                    {step === 'origin' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4">
                            <h2 className="text-xl font-black text-slate-900 mb-1">¿Dónde estás?</h2>
                            <p className="text-sm font-medium text-slate-500 mb-6">Mueve el mapa para ajustar tu partida</p>

                            <div
                                onClick={() => setIsMapInteractionEnabled(true)}
                                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all mb-6 cursor-pointer ${isMapInteractionEnabled ? 'bg-white border-black ring-2 ring-black/5' : 'bg-slate-50 border-slate-100'}`}
                            >
                                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isMapInteractionEnabled ? 'bg-black animate-pulse' : 'bg-slate-400'}`} />
                                <div className="flex-1">
                                    <p className="text-[10px] font-black uppercase text-slate-400 mb-0.5">Punto de Partida</p>
                                    <p className="font-bold text-slate-800 truncate">
                                        {isDragging ? 'Ubicando...' : origin?.address || 'Cargando ubicación...'}
                                    </p>
                                </div>
                                {!isMapInteractionEnabled && (
                                    <span className="text-[10px] font-black bg-black text-white px-2 py-1 rounded-md uppercase">Tocar para mover</span>
                                )}
                            </div>

                            <button
                                onClick={confirmOrigin}
                                disabled={isDragging || !origin || !isMapInteractionEnabled}
                                className="w-full bg-black text-white py-4 rounded-xl font-black shadow-lg shadow-black/20 flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50 mb-6"
                            >
                                Confirmar Partida
                            </button>

                            {userData?.addresses && userData.addresses.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase text-slate-400">Tus lugares guardados</h4>
                                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                        {userData.addresses.map((addr: any) => (
                                            <button
                                                key={addr.id}
                                                onClick={() => {
                                                    const loc = { lat: addr.lat, lng: addr.lng, address: addr.address };
                                                    setOrigin(loc);
                                                    setCurrentCenter({ lat: addr.lat, lng: addr.lng });
                                                    if (map) map.panTo({ lat: addr.lat, lng: addr.lng });
                                                    setIsMapInteractionEnabled(true);
                                                }}
                                                className="flex-shrink-0 flex items-center gap-2 bg-slate-50 hover:bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-100 transition-colors"
                                            >
                                                <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                                                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">{addr.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 2: DESTINATION */}
                    {step === 'destination' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4">
                            <h2 className="text-xl font-black text-slate-900 mb-1">¿A dónde vas?</h2>
                            <p className="text-sm font-medium text-slate-500 mb-6">Mueve el mapa para seleccionar tu destino</p>

                            <div className="space-y-2 mb-6 relative">
                                {/* Connecting line */}
                                <div className="absolute left-[19px] top-[24px] bottom-[24px] w-0.5 bg-slate-200 z-0"></div>

                                <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-slate-100 relative z-10">
                                    <div className="w-3 h-3 bg-black rounded-full flex-shrink-0" />
                                    <p className="font-bold text-slate-500 truncate text-sm">{origin?.address}</p>
                                </div>
                                <div className="flex items-center gap-4 bg-orange-50 p-4 rounded-2xl border border-orange-100 relative z-10">
                                    <div className="w-3 h-3 bg-orange-500 rounded-full flex-shrink-0" />
                                    <p className="font-bold text-indigo-900 truncate">
                                        {isDragging ? 'Ubicando...' : destination?.address || 'Seleccionando destino...'}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={confirmDestination}
                                disabled={isDragging || !destination}
                                className="w-full bg-orange-500 text-white py-4 rounded-xl font-black shadow-lg shadow-indigo-600/30 flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50 mb-6"
                            >
                                Confirmar Destino
                            </button>

                            {userData?.addresses && userData.addresses.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase text-slate-400">Sugerencias</h4>
                                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                        {userData.addresses.map((addr: any) => (
                                            <button
                                                key={addr.id}
                                                onClick={() => {
                                                    const loc = { lat: addr.lat, lng: addr.lng, address: addr.address };
                                                    setDestination(loc);
                                                    setCurrentCenter({ lat: addr.lat, lng: addr.lng });
                                                    if (map) map.panTo({ lat: addr.lat, lng: addr.lng });
                                                }}
                                                className="flex-shrink-0 flex items-center gap-2 bg-slate-50 hover:bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-100 transition-colors"
                                            >
                                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">{addr.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3: VEHICLE & ROUTE */}
                    {step === 'vehicle' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-black text-slate-900">Elige un vehículo</h2>
                                {routeInfo && (
                                    <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">
                                        {routeInfo.distance} km • {routeInfo.duration}
                                    </span>
                                )}
                            </div>

                            {!adminRates || isCalculatingRoute ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-5">
                                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                    <div className="text-center">
                                        <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Calculando la mejor ruta...</p>
                                        <p className="text-[10px] font-bold text-slate-400 mt-1">Buscando conductor cerca de ti</p>
                                    </div>
                                    {isCalculatingRoute && (
                                        <button
                                            onClick={() => {
                                                setIsCalculatingRoute(false);
                                                setStep('destination');
                                                setIsMapInteractionEnabled(true);
                                            }}
                                            className="mt-4 text-xs font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-4 py-2 rounded-full"
                                        >
                                            Cancelar y Reintentar
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3 mb-6">
                                    {/* Moto Option */}
                                    <button
                                        onClick={() => setVehicleType('moto')}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 text-left ${vehicleType === 'moto' ? 'border-primary bg-primary/5' : 'border-slate-100 bg-white'}`}
                                    >
                                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary flex-shrink-0">
                                            <Bike className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-black text-slate-800">Mototaxi</h3>
                                                <span className="font-black text-lg text-slate-900">${calculatePrice('moto')}</span>
                                            </div>
                                            <p className="text-xs font-bold text-slate-400 mt-0.5">1 pasajero • Rápido y económico</p>
                                        </div>
                                    </button>

                                    {/* Taxi Option */}
                                    <button
                                        onClick={() => setVehicleType('carro')}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 text-left ${vehicleType === 'carro'
                                            ? 'border-primary bg-primary text-secondary shadow-lg shadow-primary/20 scale-[1.02]'
                                            : 'border-slate-100 bg-white hover:border-primary/30'}`}
                                    >
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${vehicleType === 'carro' ? 'bg-white/90 text-secondary shadow-sm' : 'bg-orange-100 text-orange-600'}`}>
                                            <Car className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <h3 className={`font-black ${vehicleType === 'carro' ? 'text-secondary' : 'text-slate-800'}`}>Taxi</h3>
                                                <span className={`font-black text-lg ${vehicleType === 'carro' ? 'text-secondary' : 'text-slate-900'}`}>${calculatePrice('carro')}</span>
                                            </div>
                                            <p className={`text-xs font-bold mt-0.5 ${vehicleType === 'carro' ? 'text-secondary/70' : 'text-slate-400'}`}>Hasta 4 pasajeros • Viaje cómodo</p>
                                        </div>
                                    </button>

                                    {/* Ejecutivo Option */}
                                    <button
                                        onClick={() => setVehicleType('ejecutivo')}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 text-left ${vehicleType === 'ejecutivo' ? 'border-slate-900 bg-slate-50' : 'border-slate-100 bg-white'}`}
                                    >
                                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-800 flex-shrink-0">
                                            <Car className="w-6 h-6" />
                                            {/* Could use a star or different icon for VIP */}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-black text-slate-800">Taxi Ejecutivo</h3>
                                                <span className="font-black text-lg text-slate-900">${calculatePrice('ejecutivo')}</span>
                                            </div>
                                            <p className="text-xs font-bold text-slate-400 mt-0.5">Vehículos premium c/A/C</p>
                                        </div>
                                    </button>
                                </div>
                            )}

                            <button
                                disabled={!vehicleType || !routeInfo}
                                onClick={handleContinueToPayment}
                                className="w-full bg-slate-900 text-white py-4 rounded-xl font-black shadow-xl shadow-slate-900/30 flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50 mb-4"
                            >
                                Continuar al Pago <ArrowRight className="w-5 h-5" />
                            </button>

                            {/* Service Hours Section */}
                            {serviceHours && (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2">Horarios de Servicio</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase">Diurno</p>
                                            <p className="text-xs font-black text-slate-700">{serviceHours.day?.start} - {serviceHours.day?.end}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase">Nocturno</p>
                                            <p className="text-xs font-black text-slate-700">{serviceHours.night?.start} - {serviceHours.night?.end}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 4: PAYMENT */}
                    {step === 'payment' && (
                        <div className="animate-in fade-in slide-in-from-right-4">
                            <h2 className="text-xl font-black text-slate-900 mb-1">Método de Pago</h2>
                            <p className="text-sm font-medium text-slate-500 mb-6">Total a pagar: <span className="font-bold text-slate-800">${calculatePrice(vehicleType!)}</span></p>

                            {!paymentMethods ? (
                                <div className="flex justify-center p-4"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>
                            ) : (
                                <div className="space-y-4 mb-6">
                                    {/* Billetera 2X3 */}
                                    <div className={`border-2 rounded-2xl overflow-hidden transition-all ${selectedPaymentMethod === 'wallet' ? 'border-primary bg-primary/5' : 'border-slate-100'}`}>
                                        <button
                                            onClick={() => setSelectedPaymentMethod('wallet')}
                                            className="w-full p-4 flex items-center justify-between bg-transparent"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPaymentMethod === 'wallet' ? 'border-primary' : 'border-slate-300'}`}>
                                                    {selectedPaymentMethod === 'wallet' && <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>}
                                                </div>
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="font-bold text-slate-700 flex items-center gap-2">
                                                        <Wallet className="w-4 h-4 text-primary" />
                                                        Mi Billetera 2X3
                                                    </span>
                                                    <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                                                        Saldo: ${(userData?.walletBalance || 0).toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                        {selectedPaymentMethod === 'wallet' && (userData?.walletBalance || 0) < parseFloat(calculatePrice(vehicleType!) as string) && (
                                            <div className="p-3 bg-rose-50 border-t border-rose-100 text-xs font-bold text-rose-600 text-center">
                                                Saldo insuficiente. Por favor selecciona otro método o recarga tu billetera desde tu perfil.
                                            </div>
                                        )}
                                        {selectedPaymentMethod === 'wallet' && (userData?.walletBalance || 0) >= parseFloat(calculatePrice(vehicleType!) as string) && (
                                            <div className="p-3 bg-emerald-50 border-t border-emerald-100 text-xs font-bold text-emerald-700 text-center">
                                                Se descontarán ${calculatePrice(vehicleType!)} de tu billetera y el conductor será asignado de inmediato.
                                            </div>
                                        )}
                                    </div>

                                    {paymentMethods.pagoMovil?.active && (
                                        <div className={`border-2 rounded-2xl overflow-hidden transition-all ${selectedPaymentMethod === 'pagoMovil' ? 'border-primary' : 'border-slate-100'}`}>
                                            <button
                                                onClick={() => setSelectedPaymentMethod('pagoMovil')}
                                                className="w-full p-4 flex items-center gap-3 text-left bg-white"
                                            >
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPaymentMethod === 'pagoMovil' ? 'border-primary' : 'border-slate-300'}`}>
                                                    {selectedPaymentMethod === 'pagoMovil' && <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>}
                                                </div>
                                                <span className="font-bold text-slate-700">Pago Móvil (Bs)</span>
                                            </button>

                                            {selectedPaymentMethod === 'pagoMovil' && (
                                                <div className="p-4 bg-slate-50 border-t items-center border-slate-100 text-sm space-y-2 pointer-events-auto">
                                                    <p><span className="font-bold text-slate-700">Banco:</span> {paymentMethods.pagoMovil.bank}</p>
                                                    <p><span className="font-bold text-slate-700">Teléfono:</span> {paymentMethods.pagoMovil.phone}</p>
                                                    <p><span className="font-bold text-slate-700">Cédula:</span> {paymentMethods.pagoMovil.idf}</p>

                                                    <div className="mt-4 pt-4 border-t border-slate-200">
                                                        <label className="block text-xs font-bold text-slate-500 mb-2">Comprobante o Referencia</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Nro. de Referencia o teléfono emisor"
                                                            value={paymentRef}
                                                            onChange={e => setPaymentRef(e.target.value)}
                                                            className="w-full bg-white border border-slate-200 p-4 rounded-2xl mb-3 focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all font-bold text-slate-700"
                                                        />
                                                        <div className="relative">
                                                            <input
                                                                type="file"
                                                                id="pagoMovilProof"
                                                                accept="image/*"
                                                                onChange={e => e.target.files && setPaymentProof(e.target.files[0])}
                                                                className="hidden"
                                                            />
                                                            <label
                                                                htmlFor="pagoMovilProof"
                                                                className={`w-full flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${paymentProof ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-primary hover:bg-primary/5 hover:text-primary'}`}
                                                            >
                                                                <Upload className={`w-5 h-5 ${paymentProof ? 'text-emerald-500' : ''}`} />
                                                                <span className="text-xs font-black uppercase tracking-widest text-center">
                                                                    {paymentProof ? `Listo: ${paymentProof.name.substring(0, 20)}...` : 'Subir Capture de Pantalla'}
                                                                </span>
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {paymentMethods.zelle?.active && (
                                        <div className={`border-2 rounded-2xl overflow-hidden transition-all ${selectedPaymentMethod === 'zelle' ? 'border-primary' : 'border-slate-100'}`}>
                                            <button
                                                onClick={() => setSelectedPaymentMethod('zelle')}
                                                className="w-full p-4 flex items-center gap-3 text-left bg-white"
                                            >
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPaymentMethod === 'zelle' ? 'border-primary' : 'border-slate-300'}`}>
                                                    {selectedPaymentMethod === 'zelle' && <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>}
                                                </div>
                                                <span className="font-bold text-slate-700">Zelle ($)</span>
                                            </button>

                                            {selectedPaymentMethod === 'zelle' && (
                                                <div className="p-4 bg-slate-50 border-t border-slate-100 text-sm space-y-2 pointer-events-auto">
                                                    <p><span className="font-bold text-slate-700">Correo:</span> {paymentMethods.zelle.email}</p>
                                                    <p><span className="font-bold text-slate-700">Nombre:</span> {paymentMethods.zelle.name}</p>

                                                    <div className="mt-4 pt-4 border-t border-slate-200">
                                                        <label className="block text-xs font-bold text-slate-500 mb-2">Comprobante o Referencia</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Nro. de Confirmación"
                                                            value={paymentRef}
                                                            onChange={e => setPaymentRef(e.target.value)}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl mb-2 focus:border-primary outline-none transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {paymentMethods.cash?.active && (
                                        <div className={`border-2 rounded-2xl overflow-hidden transition-all ${selectedPaymentMethod === 'cash' ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100'}`}>
                                            <button
                                                onClick={() => setSelectedPaymentMethod('cash')}
                                                className="w-full p-4 flex items-center gap-3 text-left bg-transparent"
                                            >
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPaymentMethod === 'cash' ? 'border-emerald-500' : 'border-slate-300'}`}>
                                                    {selectedPaymentMethod === 'cash' && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>}
                                                </div>
                                                <span className="font-bold text-slate-700">Pago en Efectivo (Al chofer)</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <button
                                disabled={isUploading || !selectedPaymentMethod}
                                onClick={handleRequestTaxi}
                                className="w-full bg-slate-900 text-white py-4 rounded-xl font-black shadow-xl shadow-slate-900/30 flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isUploading ? 'Procesando pago...' : 'Pagar y Solicitar Vechículo'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
