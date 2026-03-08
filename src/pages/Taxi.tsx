import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Car, Bike, MapPin, Navigation, ArrowRight, CheckCircle2, X } from 'lucide-react';
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
    styles: [
        {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
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
    const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);

    // State
    const [step, setStep] = useState<'origin' | 'destination' | 'vehicle' | 'payment' | 'searching'>('origin');

    // Form and selection state
    const [origin, setOrigin] = useState<Location | null>(null);
    const [destination, setDestination] = useState<Location | null>(null);
    const [currentCenter, setCurrentCenter] = useState(defaultCenter);
    const [isDragging, setIsDragging] = useState(false);

    const [routeInfo, setRouteInfo] = useState<{ distance: number, duration: string } | null>(null);

    const [vehicleType, setVehicleType] = useState<'moto' | 'carro' | 'ejecutivo' | null>(null);
    const [adminRates, setAdminRates] = useState<any>(null);
    const [paymentMethods, setPaymentMethods] = useState<any>(null);

    // Payment details
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
    const [paymentProof, setPaymentProof] = useState<File | null>(null);
    const [paymentRef, setPaymentRef] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    // Geocoder cache
    const geocoderRef = useRef<google.maps.Geocoder | null>(null);
    const mapCenterRef = useRef(defaultCenter); // Keep track of center without triggering re-renders constantly

    // 1. Fetch Admin Rates
    useEffect(() => {
        const fetchConfigs = async () => {
            try {
                const docSnap = await getDoc(doc(db, 'system_configs', 'finances'));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.transportRates) setAdminRates(data.transportRates);
                    if (data.paymentMethods) setPaymentMethods(data.paymentMethods);
                } else {
                    // Fail-safe defaults if not configured
                    setAdminRates({
                        moto: { basePrice: 1.0, pricePerKm: 0.5 },
                        carro: { basePrice: 2.0, pricePerKm: 1.0 },
                        ejecutivo: { basePrice: 5.0, pricePerKm: 2.5 }
                    });
                }
            } catch (error) {
                console.error("Error fetching configs:", error);
            }
        };
        fetchConfigs();
    }, []);

    // 2. Map Callbacks
    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map);
        geocoderRef.current = new google.maps.Geocoder();
        setDirectionsService(new google.maps.DirectionsService());

        // Auto-locate user on load
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setCurrentCenter(newPos);
                mapCenterRef.current = newPos;
                map.panTo(newPos);

                // Set initial origin address
                updateAddressFromCenter(newPos, 'origin');
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
        if (step === 'vehicle' && origin && destination && directionsService) {
            directionsService.route({
                origin: { lat: origin.lat, lng: origin.lng },
                destination: { lat: destination.lat, lng: destination.lng },
                travelMode: google.maps.TravelMode.DRIVING
            }, (result, status) => {
                if (status === google.maps.DirectionsStatus.OK && result) {
                    if (!directionsRenderer && map) {
                        const renderer = new google.maps.DirectionsRenderer({
                            map,
                            suppressMarkers: false,
                            polylineOptions: {
                                strokeColor: '#4f46e5', // Indigo-600
                                strokeWeight: 4
                            }
                        });
                        setDirectionsRenderer(renderer);
                        renderer.setDirections(result);
                    } else if (directionsRenderer) {
                        directionsRenderer.setDirections(result);
                    }

                    // Extract distance and duration
                    const leg = result.routes[0].legs[0];
                    if (leg && leg.distance) {
                        setRouteInfo({
                            distance: leg.distance.value / 1000, // into KM
                            duration: leg.duration?.text || ''
                        });
                    }
                } else {
                    toast.error("No se pudo calcular la ruta");
                }
            });
        }
    }, [step, origin, destination, directionsService, map]);

    // 6. Navigation Helpers
    const confirmOrigin = () => {
        if (!origin) return;
        setStep('destination');
        // Keep map center same initially for destination
    };

    const confirmDestination = () => {
        if (!destination) return;
        setStep('vehicle');
    };

    const goBack = () => {
        if (step === 'searching') return;

        if (step === 'payment') {
            setStep('vehicle');
            return;
        }

        if (directionsRenderer) {
            directionsRenderer.setMap(null);
            setDirectionsRenderer(null);
        }

        if (step === 'vehicle') setStep('destination');
        else if (step === 'destination') setStep('origin');
    };

    // 7. Calculate Price Helper
    const calculatePrice = (type: 'moto' | 'carro' | 'ejecutivo') => {
        if (!adminRates || !routeInfo) return 0;
        const rate = adminRates[type] || { basePrice: 0, pricePerKm: 0 };
        const price = rate.basePrice + (rate.pricePerKm * routeInfo.distance);
        return price.toFixed(2);
    };

    const handleContinueToPayment = () => {
        if (!vehicleType || !routeInfo) return;
        setStep('payment');
    };

    const handleRequestTaxi = async () => {
        if (!user || !origin || !destination || !vehicleType || !routeInfo || !selectedPaymentMethod) return;

        // If proof is required (not cash)
        if (selectedPaymentMethod !== 'cash' && !paymentProof && !paymentRef) {
            toast.error("Debes adjuntar un comprobante o número de referencia");
            return;
        }

        setIsUploading(true);
        try {
            const finalPrice = parseFloat(calculatePrice(vehicleType) as string);
            let proofUrl = '';

            // TODO: In a real scenario, you would upload the paymentProof to Firebase Storage here.
            // For now, if we have a file, we can fake a URL just to pass the state.
            if (paymentProof) {
                proofUrl = 'uploaded_proof.jpg';
            }

            // We move them to verifying state
            setStep('searching');

            const requestRef = await addDoc(collection(db, 'transport_requests'), {
                userId: user.uid,
                userName: userData?.displayName || user.email,
                userPhone: userData?.phone || '',
                origin,
                destination,
                vehicleType,
                distance: routeInfo.distance,
                price: finalPrice,
                status: 'verifying_payment',
                paymentMethod: selectedPaymentMethod,
                paymentRef: paymentRef,
                paymentProofUrl: proofUrl,
                createdAt: serverTimestamp(),
            });

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
                    options={mapOptions}
                    onDragStart={handleMapDragStart}
                    onDragEnd={handleMapDragEnd}
                >
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
                    className="absolute bottom-40 right-6 z-20 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-95 text-indigo-600"
                >
                    <Navigation className="w-5 h-5 fill-indigo-600/20" />
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

                            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                                <div className="w-3 h-3 bg-black rounded-full flex-shrink-0" />
                                <p className="font-bold text-slate-800 truncate flex-1">
                                    {isDragging ? 'Ubicando...' : origin?.address || 'Cargando ubicación...'}
                                </p>
                            </div>

                            <button
                                onClick={confirmOrigin}
                                disabled={isDragging || !origin}
                                className="w-full bg-black text-white py-4 rounded-xl font-black shadow-lg shadow-black/20 flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                            >
                                Confirmar Partida
                            </button>
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
                                <div className="flex items-center gap-4 bg-indigo-50 p-4 rounded-2xl border border-indigo-100 relative z-10">
                                    <div className="w-3 h-3 bg-indigo-600 rounded-full flex-shrink-0" />
                                    <p className="font-bold text-indigo-900 truncate">
                                        {isDragging ? 'Ubicando...' : destination?.address || 'Seleccionando destino...'}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={confirmDestination}
                                disabled={isDragging || !destination}
                                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg shadow-indigo-600/30 flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                            >
                                Confirmar Destino
                            </button>
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

                            {!adminRates ? (
                                <div className="flex justify-center p-4"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
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
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 text-left ${vehicleType === 'carro' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-white'}`}
                                    >
                                        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0">
                                            <Car className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-black text-slate-800">Taxi</h3>
                                                <span className="font-black text-lg text-slate-900">${calculatePrice('carro')}</span>
                                            </div>
                                            <p className="text-xs font-bold text-slate-400 mt-0.5">Hasta 4 pasajeros • Viaje cómodo</p>
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
                                className="w-full bg-slate-900 text-white py-4 rounded-xl font-black shadow-xl shadow-slate-900/30 flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                            >
                                Continuar al Pago <ArrowRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {/* STEP 4: PAYMENT */}
                    {step === 'payment' && (
                        <div className="animate-in fade-in slide-in-from-right-4">
                            <h2 className="text-xl font-black text-slate-900 mb-1">Método de Pago</h2>
                            <p className="text-sm font-medium text-slate-500 mb-6">Total a pagar: <span className="font-bold text-slate-800">${calculatePrice(vehicleType!)}</span></p>

                            {!paymentMethods ? (
                                <div className="flex justify-center p-4"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
                            ) : (
                                <div className="space-y-4 mb-6">
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
                                                            placeholder="Nro. de Referencia"
                                                            value={paymentRef}
                                                            onChange={e => setPaymentRef(e.target.value)}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl mb-2 focus:border-primary outline-none transition-all"
                                                        />
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={e => e.target.files && setPaymentProof(e.target.files[0])}
                                                            className="w-full text-xs"
                                                        />
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
