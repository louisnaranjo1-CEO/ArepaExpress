import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
    Car,
    Bike,
    MapPin,
    Navigation,
    ArrowRight,
    ArrowLeft,
    Check,
    Calendar,
    Clock as ClockIcon,
    Package,
    Search,
    Loader2,
    Wallet,
    Upload,
    Copy,
    Sparkles,
    Shield,
    X,
    ChevronDown,
    SlidersHorizontal,
    FileText
} from 'lucide-react';
import { useJsApiLoader } from '@react-google-maps/api';
import { UN2X3_LOGO } from '../lib/env';
import toast from 'react-hot-toast';
import { calculateDistance } from '../lib/geo';
import { vibrate } from '../utils/haptics';
import { isDemoMode } from '../lib/env';
import DemoAlertModal from '../components/DemoAlertModal';
import { useCurrency } from '../context/CurrencyContext';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES } from '../lib/mapsConfig';

interface Location {
    lat: number;
    lng: number;
    address: string;
}

interface NearbyDriver {
    id: string;
    fullName: string;
    vehicleType: 'moto' | 'carro' | 'ejecutivo';
    lat: number;
    lng: number;
    distanceKm: number;
    etaMinutes: number;
}

const defaultCenter = {
    lat: 10.4806, // Caracas, Venezuela
    lng: -66.9036
};

// Yango-style clean map styling
const yangoMapStyles: google.maps.MapTypeStyle[] = [
    {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
    },
    {
        featureType: 'transit',
        elementType: 'labels.icon',
        stylers: [{ visibility: 'off' }]
    },
    {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [{ lightness: 15 }]
    },
    {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#cde2f5' }]
    }
];

export default function Taxi() {
    const { user, userData } = useAuth();
    const { bcvRate } = useCurrency();
    const navigate = useNavigate();

    // 1. Google Maps JS API Loader
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES
    });

    // Native Map DOM reference
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
    const geocoderRef = useRef<google.maps.Geocoder | null>(null);
    const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
    const userMarkerRef = useRef<google.maps.Marker | null>(null);
    const originMarkerRef = useRef<google.maps.Marker | null>(null);
    const destinationMarkerRef = useRef<google.maps.Marker | null>(null);
    const driverMarkersRef = useRef<google.maps.Marker[]>([]);

    // State Machine
    const [step, setStep] = useState<'destination' | 'vehicle' | 'payment' | 'searching'>('destination');
    const [serviceCategory, setServiceCategory] = useState<'transport' | 'package'>('transport');
    const [packageDescription, setPackageDescription] = useState('');
    const [driverNotes, setDriverNotes] = useState('');
    const [showNotesModal, setShowNotesModal] = useState(false);

    // Locations
    const [origin, setOrigin] = useState<Location | null>(null);
    const [destination, setDestination] = useState<Location | null>(null);
    const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
    const [isLocating, setIsLocating] = useState(false);

    // Route Info
    const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: string } | null>(null);
    const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);

    // Vehicles & Rates
    const [vehicleType, setVehicleType] = useState<'moto' | 'carro' | 'ejecutivo'>('carro');
    const [adminRates, setAdminRates] = useState<any>(null);
    const [paymentMethods, setPaymentMethods] = useState<any>(null);
    const [serviceHours, setServiceHours] = useState<any>(null);

    // Payment Selection
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('cash');
    const [paymentProof, setPaymentProof] = useState<File | null>(null);
    const [paymentRef, setPaymentRef] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    // Reservation Scheduling
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledDateTime, setScheduledDateTime] = useState('');

    // Guest Modal
    const [showGuestModal, setShowGuestModal] = useState(false);
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestCedula, setGuestCedula] = useState('');

    // Places Search
    const [searchQuery, setSearchQuery] = useState('');
    const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
    const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

    // Nearby Drivers
    const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
    const [activeDriversCount, setActiveDriversCount] = useState({ moto: 1, carro: 1, ejecutivo: 1 });

    const [showDemoAlert, setShowDemoAlert] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // 0. Active Reservation / Request Check
    useEffect(() => {
        if (!user) return;
        const uid = user.id || user.uid;

        const checkActive = async () => {
            try {
                const { data: reqs } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .or(`user_id.eq.${uid},userId.eq.${uid}`)
                    .in('status', ['searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress'])
                    .order('created_at', { ascending: false });

                if (reqs && reqs.length > 0) {
                    const mainActive = reqs.find((r: any) => !r.scheduled || ['arriving', 'in_progress'].includes(r.status));
                    if (mainActive) {
                        navigate(`/taxi/track/${mainActive.id}`);
                    }
                }
            } catch (e) {
                console.error("Active taxi check error:", e);
            }
        };

        checkActive();
    }, [user, navigate]);

    // 1. Fetch Admin Rates and Configs
    useEffect(() => {
        const fetchConfigs = async () => {
            try {
                const { data: docSnap } = await supabase
                    .from('app_settings')
                    .select('*')
                    .eq('id', 'delivery_settings')
                    .maybeSingle();

                if (docSnap) {
                    const data = docSnap.value || docSnap;
                    setAdminRates(data.transportRates || {});
                    setServiceHours({
                        day: data.dayShift || { start: "08:00", end: "20:00" },
                        night: data.nightShift || { start: "20:01", end: "07:59" }
                    });
                }

                const { data: financeSnap } = await supabase
                    .from('system_configs')
                    .select('*')
                    .eq('id', 'finances')
                    .maybeSingle();

                if (financeSnap) {
                    const methods = financeSnap.data?.paymentMethods || financeSnap.paymentMethods;
                    setPaymentMethods(methods || {
                        cash: { active: true },
                        wallet: { active: true }
                    });
                }
            } catch (err) {
                console.error("Configs fetch error:", err);
            }
        };
        fetchConfigs();
    }, []);

    // 2. Fetch Nearby Drivers
    const fetchNearbyDrivers = useCallback(async (pickupCoords: { lat: number; lng: number }) => {
        try {
            let { data: driversData } = await supabase
                .from('drivers')
                .select('id, full_name, vehicle_type, current_location, availability, is_online')
                .eq('is_online', true);

            if (!driversData || driversData.length === 0) {
                const { data: fallbackDrivers } = await supabase
                    .from('delivery_drivers')
                    .select('id, vehicle_type, vehicleType, availability, is_online, current_location')
                    .eq('is_online', true);
                driversData = fallbackDrivers;
            }

            const validDrivers: NearbyDriver[] = [];
            const counts = { moto: 0, carro: 0, ejecutivo: 0 };

            (driversData || []).forEach((d: any) => {
                const loc = d.current_location;
                if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number' && !isNaN(loc.lat) && !isNaN(loc.lng)) {
                    const distMeters = calculateDistance(pickupCoords.lat, pickupCoords.lng, loc.lat, loc.lng);
                    const distKm = Number((distMeters / 1000).toFixed(1));
                    if (distKm <= 25) {
                        const rawType = (d.vehicle_type || d.vehicleType || 'carro').toLowerCase();
                        const vType = rawType.includes('moto') ? 'moto' : rawType.includes('eje') ? 'ejecutivo' : 'carro';
                        const eta = Math.max(2, Math.ceil(distKm * 3));
                        validDrivers.push({
                            id: d.id,
                            fullName: d.full_name || 'Conductor',
                            vehicleType: vType,
                            lat: loc.lat,
                            lng: loc.lng,
                            distanceKm: distKm,
                            etaMinutes: eta
                        });
                        counts[vType]++;
                    }
                }
            });

            if (validDrivers.length === 0 || isDemoMode()) {
                const simulated: NearbyDriver[] = [
                    {
                        id: 'mock-moto-1',
                        fullName: 'Carlos (Moto)',
                        vehicleType: 'moto',
                        lat: pickupCoords.lat + 0.0035,
                        lng: pickupCoords.lng + 0.0028,
                        distanceKm: 0.5,
                        etaMinutes: 2
                    },
                    {
                        id: 'mock-carro-1',
                        fullName: 'José (Taxi)',
                        vehicleType: 'carro',
                        lat: pickupCoords.lat - 0.0042,
                        lng: pickupCoords.lng + 0.0051,
                        distanceKm: 1.1,
                        etaMinutes: 3
                    },
                    {
                        id: 'mock-ejecutivo-1',
                        fullName: 'Manuel (Ejecutivo)',
                        vehicleType: 'ejecutivo',
                        lat: pickupCoords.lat + 0.0065,
                        lng: pickupCoords.lng - 0.0045,
                        distanceKm: 1.6,
                        etaMinutes: 5
                    }
                ];
                setNearbyDrivers(simulated);
                setActiveDriversCount({ moto: 1, carro: 1, ejecutivo: 1 });
            } else {
                setNearbyDrivers(validDrivers);
                setActiveDriversCount({
                    moto: Math.max(1, counts.moto),
                    carro: Math.max(1, counts.carro),
                    ejecutivo: Math.max(1, counts.ejecutivo)
                });
            }
        } catch (err) {
            console.error("fetchNearbyDrivers error:", err);
        }
    }, []);

    // 3. Initialize Google Maps DOM natively (Crash-Proof for React 19)
    useEffect(() => {
        if (!isLoaded || !mapDivRef.current || mapInstanceRef.current) return;
        if (!window.google?.maps) return;

        try {
            const map = new window.google.maps.Map(mapDivRef.current, {
                center: defaultCenter,
                zoom: 15,
                disableDefaultUI: true,
                zoomControl: false,
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
                clickableIcons: false,
                gestureHandling: 'greedy',
                styles: yangoMapStyles
            });

            mapInstanceRef.current = map;
            geocoderRef.current = new window.google.maps.Geocoder();
            autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();

            const renderer = new window.google.maps.DirectionsRenderer({
                map,
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: '#FF5D00',
                    strokeWeight: 5,
                    strokeOpacity: 0.95
                }
            });
            directionsRendererRef.current = renderer;

            // Map Click to Pick Destination
            map.addListener('click', (e: google.maps.MapMouseEvent) => {
                if (!e.latLng) return;
                vibrate(30);
                const clickPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };

                // Reverse geocode clicked location
                if (geocoderRef.current) {
                    geocoderRef.current.geocode({ location: clickPos }, (res, status) => {
                        const addr = (status === 'OK' && res && res[0])
                            ? res[0].formatted_address
                            : 'Punto seleccionado en el mapa';

                        setDestination({
                            lat: clickPos.lat,
                            lng: clickPos.lng,
                            address: addr
                        });
                        setSearchQuery(addr);
                        setStep('vehicle');
                    });
                }
            });

            // Initial GPS acquisition
            locateUser(false);
        } catch (e) {
            console.error("Error initializing Google Map:", e);
        }
    }, [isLoaded]);

    // 4. Locate User Helper
    const locateUser = useCallback((panTo = true) => {
        if (!navigator.geolocation) return;
        setIsLocating(true);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setIsLocating(false);
                const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLocation(coords);

                // Set origin if not set
                if (geocoderRef.current) {
                    geocoderRef.current.geocode({ location: coords }, (res, status) => {
                        const addr = (status === 'OK' && res && res[0])
                            ? res[0].formatted_address
                            : 'Mi ubicación actual';

                        setOrigin({
                            lat: coords.lat,
                            lng: coords.lng,
                            address: addr
                        });
                    });
                } else {
                    setOrigin({
                        lat: coords.lat,
                        lng: coords.lng,
                        address: 'Mi ubicación actual'
                    });
                }

                if (mapInstanceRef.current && panTo) {
                    mapInstanceRef.current.panTo(coords);
                    mapInstanceRef.current.setZoom(16);
                }

                fetchNearbyDrivers(coords);
            },
            (err) => {
                setIsLocating(false);
                console.warn("GPS lookup denied/failed:", err);
                // Fallback to default center
                setOrigin({
                    lat: defaultCenter.lat,
                    lng: defaultCenter.lng,
                    address: 'Caracas, Venezuela'
                });
                fetchNearbyDrivers(defaultCenter);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    }, [fetchNearbyDrivers]);

    // 5. Manage Markers on Map Updates
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !window.google?.maps) return;

        // User GPS dot
        if (userLocation) {
            if (!userMarkerRef.current) {
                userMarkerRef.current = new window.google.maps.Marker({
                    position: userLocation,
                    map,
                    title: 'Tu ubicación',
                    icon: {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 7,
                        fillColor: '#2563EB',
                        fillOpacity: 1,
                        strokeColor: '#FFFFFF',
                        strokeWeight: 2.5
                    },
                    zIndex: 99
                });
            } else {
                userMarkerRef.current.setPosition(userLocation);
            }
        }

        // Origin Marker (Green Pin)
        if (origin) {
            if (!originMarkerRef.current) {
                originMarkerRef.current = new window.google.maps.Marker({
                    position: { lat: origin.lat, lng: origin.lng },
                    map,
                    title: 'Punto de partida',
                    icon: {
                        url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
                    },
                    zIndex: 90
                });
            } else {
                originMarkerRef.current.setPosition({ lat: origin.lat, lng: origin.lng });
            }
        }

        // Destination Marker (Red Pin)
        if (destination) {
            if (!destinationMarkerRef.current) {
                destinationMarkerRef.current = new window.google.maps.Marker({
                    position: { lat: destination.lat, lng: destination.lng },
                    map,
                    title: 'Destino',
                    icon: {
                        url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
                    },
                    zIndex: 95
                });
            } else {
                destinationMarkerRef.current.setPosition({ lat: destination.lat, lng: destination.lng });
            }
        }

        // Nearby Drivers Markers
        driverMarkersRef.current.forEach(m => m.setMap(null));
        driverMarkersRef.current = nearbyDrivers.map(d => {
            return new window.google.maps.Marker({
                position: { lat: d.lat, lng: d.lng },
                map,
                title: `${d.fullName} (${d.vehicleType}) - ${d.etaMinutes} min`,
                icon: {
                    url: d.vehicleType === 'moto'
                        ? 'https://maps.google.com/mapfiles/ms/icons/motorcycling.png'
                        : 'https://maps.google.com/mapfiles/ms/icons/cabs.png'
                }
            });
        });
    }, [userLocation, origin, destination, nearbyDrivers]);

    // 6. Calculate Route & Fit Bounds
    useEffect(() => {
        if (!origin || !destination || !window.google?.maps || !mapInstanceRef.current) return;

        setIsCalculatingRoute(true);
        const directionsService = new window.google.maps.DirectionsService();

        directionsService.route(
            {
                origin: { lat: origin.lat, lng: origin.lng },
                destination: { lat: destination.lat, lng: destination.lng },
                travelMode: window.google.maps.TravelMode.DRIVING
            },
            (res, status) => {
                setIsCalculatingRoute(false);
                if (status === window.google.maps.DirectionsStatus.OK && res) {
                    if (directionsRendererRef.current) {
                        directionsRendererRef.current.setDirections(res);
                    }
                    const leg = res.routes[0]?.legs[0];
                    if (leg && leg.distance) {
                        const distKm = Number((leg.distance.value / 1000).toFixed(1));
                        setRouteInfo({
                            distance: distKm,
                            duration: leg.duration?.text || `${Math.ceil(distKm * 3)} min`
                        });
                    }

                    // Fit bounds to show route nicely
                    const bounds = new window.google.maps.LatLngBounds();
                    bounds.extend({ lat: origin.lat, lng: origin.lng });
                    bounds.extend({ lat: destination.lat, lng: destination.lng });
                    mapInstanceRef.current?.fitBounds(bounds, {
                        top: 100,
                        bottom: 300,
                        left: 40,
                        right: 40
                    });
                } else {
                    // Fallback to straight line distance
                    const distMeters = calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng);
                    const distKm = Number((distMeters / 1000).toFixed(1));
                    setRouteInfo({
                        distance: Math.max(1, distKm),
                        duration: `~${Math.max(3, Math.ceil(distKm * 3.5))} min`
                    });

                    const bounds = new window.google.maps.LatLngBounds();
                    bounds.extend({ lat: origin.lat, lng: origin.lng });
                    bounds.extend({ lat: destination.lat, lng: destination.lng });
                    mapInstanceRef.current?.fitBounds(bounds, { top: 90, bottom: 280, left: 40, right: 40 });
                }
            }
        );
    }, [origin, destination]);

    // 7. Autocomplete Search Handler
    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        if (!val.trim() || val.length < 2) {
            setPredictions([]);
            return;
        }

        if (!autocompleteServiceRef.current && window.google?.maps?.places) {
            autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
        }

        if (!autocompleteServiceRef.current) return;

        setIsSearchingPlaces(true);
        const center = origin || userLocation || defaultCenter;

        autocompleteServiceRef.current.getPlacePredictions(
            {
                input: val,
                componentRestrictions: { country: 've' },
                locationBias: new window.google.maps.LatLng(center.lat, center.lng)
            },
            (results, status) => {
                setIsSearchingPlaces(false);
                if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
                    setPredictions(results);
                } else {
                    setPredictions([]);
                }
            }
        );
    };

    // 8. Select Autocomplete Prediction
    const handleSelectPrediction = (p: google.maps.places.AutocompletePrediction) => {
        vibrate(30);
        setSearchQuery(p.structured_formatting?.main_text || p.description);
        setPredictions([]);

        if (!geocoderRef.current && window.google?.maps?.Geocoder) {
            geocoderRef.current = new window.google.maps.Geocoder();
        }

        if (geocoderRef.current) {
            geocoderRef.current.geocode({ placeId: p.place_id }, (results, status) => {
                if (status === 'OK' && results && results[0]) {
                    const loc = results[0].geometry.location;
                    const destLoc = {
                        lat: loc.lat(),
                        lng: loc.lng(),
                        address: p.structured_formatting?.main_text || results[0].formatted_address
                    };
                    setDestination(destLoc);

                    if (!origin && userLocation) {
                        setOrigin({
                            lat: userLocation.lat,
                            lng: userLocation.lng,
                            address: 'Mi ubicación actual'
                        });
                    }

                    setStep('vehicle');
                } else {
                    toast.error("No se pudo obtener la ubicación exacta.");
                }
            });
        }
    };

    // 9. Pricing Calculation
    const calculatePrice = (type: 'moto' | 'carro' | 'ejecutivo'): string => {
        const distance = routeInfo ? routeInfo.distance : 1;

        if (adminRates && adminRates[type] && Array.isArray(adminRates[type]) && adminRates[type].length > 0) {
            const rates = adminRates[type];
            const matchingRange = rates.find((r: any) => {
                const fromKm = parseFloat(String(r.from || '0'));
                const toKm = parseFloat(String(r.to || '0'));
                return distance >= fromKm && (toKm === 0 || distance <= toKm);
            });

            if (matchingRange) {
                const p = parseFloat(String(matchingRange.clientPrice || matchingRange.price || '0'));
                if (p > 0) return p.toFixed(2);
            }

            const sorted = [...rates].sort((a: any, b: any) => parseFloat(String(b.from || '0')) - parseFloat(String(a.from || '0')));
            const lastRange = sorted[0];
            if (lastRange) {
                const p = parseFloat(String(lastRange.clientPrice || lastRange.price || '0'));
                if (p > 0) return p.toFixed(2);
            }
        }

        // Default rates: Moto: $1.50 base + $0.6/km; Taxi: $2.50 base + $0.9/km; Ejecutivo: $4.00 base + $1.4/km
        const base = type === 'moto' ? 1.5 : type === 'ejecutivo' ? 4.0 : 2.5;
        const perKm = type === 'moto' ? 0.6 : type === 'ejecutivo' ? 1.4 : 0.9;
        const calculated = Math.max(base, base + (distance * perKm));
        return calculated.toFixed(2);
    };

    // 10. Request Ride Handler
    const handleRequestTaxi = async () => {
        if (!user && (!guestName || !guestPhone || !guestCedula)) {
            setShowGuestModal(true);
            return;
        }

        if (!origin || !destination) {
            toast.error("Selecciona un origen y destino para viajar");
            return;
        }

        const clientTotal = calculatePrice(vehicleType);
        const currentBalance = userData?.walletBalance || 0;

        if (selectedPaymentMethod === 'wallet' && currentBalance < parseFloat(clientTotal)) {
            toast.error("Saldo insuficiente en tu Billetera Deliexpress. Elige otro método.");
            return;
        }

        if (selectedPaymentMethod !== 'cash' && selectedPaymentMethod !== 'wallet' && !paymentProof && !paymentRef) {
            toast.error("Adjunta el comprobante o número de referencia");
            return;
        }

        try {
            setIsUploading(true);
            setStep('searching');
            vibrate(50);

            const uid = user?.id || user?.uid || `guest_${Date.now()}`;
            let proofUrl = '';

            if (paymentProof && selectedPaymentMethod !== 'cash' && selectedPaymentMethod !== 'wallet') {
                const ext = paymentProof.name.split('.').pop() || 'jpg';
                const path = `taxi_proofs/${uid}/${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(path, paymentProof, { upsert: true });
                if (!upErr) {
                    const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(path);
                    proofUrl = publicUrl;
                }
            }

            const newReqId = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : `taxi_${Date.now()}`;

            const initialStatus = (selectedPaymentMethod === 'wallet' || selectedPaymentMethod === 'cash')
                ? 'searching'
                : 'verifying_payment';

            const orderData = {
                id: newReqId,
                type: serviceCategory === 'package' ? 'package_delivery' : 'transport',
                packageDescription: serviceCategory === 'package' ? packageDescription : null,
                package_description: serviceCategory === 'package' ? packageDescription : null,
                userId: uid,
                user_id: uid,
                userName: userData?.displayName || user?.displayName || user?.email || guestName || 'Usuario Invitado',
                user_name: userData?.displayName || user?.displayName || user?.email || guestName || 'Usuario Invitado',
                userPhone: userData?.phone || guestPhone || 'Sin número',
                user_phone: userData?.phone || guestPhone || 'Sin número',
                userCedula: userData?.cedula || guestCedula || 'N/A',
                user_cedula: userData?.cedula || guestCedula || 'N/A',
                origin,
                destination,
                vehicleType,
                vehicle_type: vehicleType,
                route: routeInfo,
                total: parseFloat(clientTotal),
                price: parseFloat(clientTotal),
                driverPayout: parseFloat(clientTotal),
                driver_payout: parseFloat(clientTotal),
                driverId: null,
                driver_id: null,
                driverPaid: false,
                driver_paid: false,
                status: initialStatus,
                paymentMethod: selectedPaymentMethod,
                payment_method: selectedPaymentMethod,
                paymentRef: paymentRef || '',
                payment_ref: paymentRef || '',
                paymentProofUrl: proofUrl,
                payment_proof_url: proofUrl,
                scheduled: isScheduled,
                scheduledAt: isScheduled && scheduledDateTime ? new Date(scheduledDateTime).toISOString() : null,
                scheduled_at: isScheduled && scheduledDateTime ? new Date(scheduledDateTime).toISOString() : null,
                notes: driverNotes || '',
                createdAt: new Date().toISOString(),
                created_at: new Date().toISOString(),
            };

            const { error: insErr } = await supabase.from('transport_requests').insert(orderData);
            if (insErr) throw insErr;

            if (selectedPaymentMethod === 'wallet' && user) {
                const newBalance = currentBalance - parseFloat(clientTotal);
                await supabase.from('profiles').update({
                    walletBalance: newBalance,
                    wallet_balance: newBalance,
                    updated_at: new Date().toISOString()
                }).eq('id', uid);
            }

            // Smooth redirect to tracker
            setTimeout(() => {
                navigate(`/taxi/track/${newReqId}`);
            }, 1200);

        } catch (error) {
            console.error("Error creating transport request:", error);
            toast.error("No se pudo procesar la solicitud. Revisa tu conexión.");
            setStep('payment');
        } finally {
            setIsUploading(false);
        }
    };

    const handleCopy = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        toast.success("Copiado al portapapeles");
        setTimeout(() => setCopiedField(null), 2000);
    };

    // Google Maps Load Error Screen
    if (loadError) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 min-h-full p-6 text-center">
                <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-4 shadow-lg shadow-rose-500/10">
                    <MapPin className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">No se pudo cargar Google Maps</h3>
                <p className="text-xs text-slate-500 max-w-sm mb-6 font-medium">
                    Google está propagando la configuración de la clave de API. Puede tardar un momento.
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-primary text-slate-950 font-black rounded-2xl shadow-lg shadow-primary/20 active:scale-95 text-xs uppercase tracking-wider"
                    >
                        Reintentar
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-3 bg-slate-200 text-slate-700 font-bold rounded-2xl active:scale-95 text-xs uppercase tracking-wider"
                    >
                        Ir al Inicio
                    </button>
                </div>
            </div>
        );
    }

    // Searching Screen (Radar Animation style YANGO)
    if (step === 'searching') {
        return (
            <div className="relative w-full h-full bg-slate-950 text-white flex flex-col items-center justify-between p-8 overflow-hidden select-none">
                {/* Background Radar Waves */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-64 border border-primary/20 rounded-full animate-ping [animation-duration:3s]"></div>
                    <div className="w-96 h-96 border border-primary/10 rounded-full animate-ping [animation-duration:4s]"></div>
                    <div className="w-[500px] h-[500px] border border-primary/5 rounded-full animate-ping [animation-duration:5s]"></div>
                </div>

                {/* Top Header */}
                <div className="relative z-10 w-full flex items-center justify-between pt-4">
                    <button
                        onClick={() => setStep('vehicle')}
                        className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-transform"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2 bg-primary/20 border border-primary/30 px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-primary">Conectando</span>
                    </div>
                </div>

                {/* Center Pulse Visual */}
                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="relative mb-6">
                        <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-primary to-amber-300 p-1 flex items-center justify-center shadow-2xl shadow-primary/30">
                            <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center">
                                {vehicleType === 'moto' ? (
                                    <Bike className="w-12 h-12 text-primary animate-bounce" />
                                ) : (
                                    <Car className="w-12 h-12 text-primary animate-bounce" />
                                )}
                            </div>
                        </div>
                    </div>

                    <h2 className="text-2xl font-black tracking-tight mb-2">Buscando conductor...</h2>
                    <p className="text-sm text-slate-400 max-w-xs font-medium leading-relaxed">
                        Conectando con los conductores más cercanos a tu ubicación en Deliexpress Taxi.
                    </p>

                    {routeInfo && (
                        <div className="mt-4 inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-xs font-bold">
                            <span>{routeInfo.distance} km</span>
                            <span>•</span>
                            <span>${calculatePrice(vehicleType)}</span>
                            {bcvRate > 0 && (
                                <>
                                    <span>•</span>
                                    <span className="text-primary">{(parseFloat(calculatePrice(vehicleType)) * bcvRate).toFixed(2)} Bs</span>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Bottom Cancel Option */}
                <div className="relative z-10 w-full max-w-xs pb-4">
                    <button
                        onClick={() => setStep('vehicle')}
                        className="w-full py-3.5 bg-white/10 hover:bg-white/15 text-slate-300 font-bold rounded-2xl text-xs uppercase tracking-wider active:scale-95 transition-all"
                    >
                        Cancelar búsqueda
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-slate-100 overflow-hidden select-none">
            {/* 1. Full Screen Interactive Google Map */}
            <div ref={mapDivRef} className="absolute inset-0 w-full h-full z-0" />

            {!isLoaded && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-100/90 backdrop-blur-sm">
                    <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-600">Iniciando Google Maps...</p>
                </div>
            )}

            {/* 2. Top Floating Controls (Yango Style) */}
            <div className="absolute top-3 inset-x-3 z-30 flex flex-col gap-2 max-w-md mx-auto pointer-events-auto">
                {/* Search Bar & Actions */}
                <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-2">
                    <button
                        onClick={() => {
                            if (step !== 'destination') {
                                setStep('destination');
                            } else {
                                navigate('/');
                            }
                        }}
                        className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-95 transition-all flex-shrink-0"
                        title="Volver"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    <div className="flex-1 flex items-center gap-2 min-w-0 px-1">
                        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="¿A dónde vas? (Buscar dirección o lugar)"
                            className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-800 placeholder-slate-400 outline-none truncate"
                        />
                        {isSearchingPlaces && (
                            <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                        )}
                        {searchQuery && !isSearchingPlaces && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setPredictions([]);
                                }}
                                className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-300"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => locateUser(true)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 active:scale-95 ${
                            isLocating ? 'bg-primary text-slate-950 animate-spin' : 'bg-primary/10 text-primary hover:bg-primary/20'
                        }`}
                        title="Mi ubicación actual"
                    >
                        <Navigation className="w-5 h-5 fill-current" />
                    </button>
                </div>

                {/* Service Mode Chips (Taxi vs Envío) */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setServiceCategory('transport')}
                        className={`px-4 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 ${
                            serviceCategory === 'transport'
                                ? 'bg-slate-900 text-white'
                                : 'bg-white/90 text-slate-700 hover:bg-white'
                        }`}
                    >
                        <Car className="w-3.5 h-3.5 text-primary" />
                        Taxi / Viajes
                    </button>

                    <button
                        onClick={() => setServiceCategory('package')}
                        className={`px-4 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 ${
                            serviceCategory === 'package'
                                ? 'bg-slate-900 text-white'
                                : 'bg-white/90 text-slate-700 hover:bg-white'
                        }`}
                    >
                        <Package className="w-3.5 h-3.5 text-emerald-500" />
                        Envío Express
                    </button>
                </div>

                {/* Google Places Autocomplete Predictions Dropdown */}
                {predictions.length > 0 && (
                    <div className="bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-100 divide-y divide-slate-100 max-h-64 overflow-y-auto z-40">
                        {predictions.map((p) => (
                            <button
                                key={p.place_id}
                                type="button"
                                onClick={() => handleSelectPrediction(p)}
                                className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3 transition-colors active:bg-slate-100"
                            >
                                <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs sm:text-sm font-black text-slate-800 truncate">
                                        {p.structured_formatting?.main_text || p.description}
                                    </p>
                                    <p className="text-[11px] text-slate-400 truncate">
                                        {p.structured_formatting?.secondary_text || p.description}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 3. Docked Bottom Sheet (Yango Signature UX) */}
            <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end pointer-events-none">
                <div className="pointer-events-auto bg-white/98 backdrop-blur-2xl rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,0,0,0.18)] border-t border-white/60 p-5 max-w-md mx-auto w-full transition-all duration-300 ease-in-out">
                    {/* Pull Bar */}
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

                    {/* STEP 1: DESTINATION & SAVED PLACES */}
                    {step === 'destination' && (
                        <div className="space-y-4 animate-in fade-in">
                            {/* Route Indicator Pills */}
                            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/70 space-y-2.5">
                                <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9px] font-black uppercase text-slate-400">Punto de partida</p>
                                        <p className="text-xs font-bold text-slate-800 truncate">
                                            {origin?.address || 'Detectando ubicación actual...'}
                                        </p>
                                    </div>
                                </div>
                                <div className="border-t border-slate-200/60 ml-5" />
                                <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9px] font-black uppercase text-slate-400">Destino</p>
                                        <p className="text-xs font-bold text-slate-800 truncate">
                                            {destination?.address || 'Toca en el mapa o busca arriba'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Package Note If in package mode */}
                            {serviceCategory === 'package' && (
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                        Descripción del paquete
                                    </label>
                                    <input
                                        type="text"
                                        value={packageDescription}
                                        onChange={(e) => setPackageDescription(e.target.value)}
                                        placeholder="Ej: Documentos, llaves, bolsa..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-primary"
                                    />
                                </div>
                            )}

                            {/* Saved Places Quick Access */}
                            {userData?.addresses && userData.addresses.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Lugares frecuentes</p>
                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                        {userData.addresses.map((addr: any) => (
                                            <button
                                                key={addr.id}
                                                onClick={() => {
                                                    vibrate(30);
                                                    setDestination({
                                                        lat: addr.lat,
                                                        lng: addr.lng,
                                                        address: addr.address || addr.name
                                                    });
                                                    setStep('vehicle');
                                                }}
                                                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 flex-shrink-0 transition-colors"
                                            >
                                                <MapPin className="w-3.5 h-3.5 text-primary" />
                                                <span>{addr.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Continue Button */}
                            <button
                                disabled={!destination}
                                onClick={() => {
                                    vibrate(30);
                                    setStep('vehicle');
                                }}
                                className="w-full py-4 bg-primary text-slate-950 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all"
                            >
                                <span>Ver tarifas de viaje</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* STEP 2: VEHICLE SELECTION (YANGO TIER CARDS) */}
                    {step === 'vehicle' && (
                        <div className="space-y-4 animate-in fade-in">
                            {/* Route Summary Badge & Schedule Toggle */}
                            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-slate-900">
                                        {routeInfo ? `${routeInfo.distance} km • ${routeInfo.duration}` : 'Calculando ruta...'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setIsScheduled(!isScheduled)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                        isScheduled ? 'bg-primary text-slate-950' : 'bg-slate-100 text-slate-600'
                                    }`}
                                >
                                    {isScheduled ? 'Reservado' : 'Reservar'}
                                </button>
                            </div>

                            {/* Scheduled Date Picker */}
                            {isScheduled && (
                                <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-3">
                                    <Calendar className="w-4 h-4 text-slate-900 flex-shrink-0" />
                                    <input
                                        type="datetime-local"
                                        value={scheduledDateTime}
                                        min={new Date().toISOString().slice(0, 16)}
                                        onChange={(e) => setScheduledDateTime(e.target.value)}
                                        className="bg-transparent text-xs font-bold text-slate-900 outline-none w-full"
                                    />
                                </div>
                            )}

                            {/* Yango Vehicle Tiers Carousel / List */}
                            <div className="grid grid-cols-3 gap-2.5">
                                {/* Moto */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        vibrate(30);
                                        setVehicleType('moto');
                                    }}
                                    className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all text-center ${
                                        vehicleType === 'moto'
                                            ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/20 scale-[1.02]'
                                            : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                    }`}
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-1.5 shadow-sm">
                                        <Bike className="w-6 h-6 text-slate-900" />
                                    </div>
                                    <span className="text-xs font-black text-slate-900">Moto</span>
                                    <span className="text-[10px] text-emerald-600 font-black mt-0.5">2 min</span>
                                    <span className="text-xs font-black text-slate-900 mt-1">
                                        ${calculatePrice('moto')}
                                    </span>
                                    {bcvRate > 0 && (
                                        <span className="text-[9px] font-bold text-slate-500">
                                            {(parseFloat(calculatePrice('moto')) * bcvRate).toFixed(1)} Bs
                                        </span>
                                    )}
                                </button>

                                {/* Taxi Estándar */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        vibrate(30);
                                        setVehicleType('carro');
                                    }}
                                    className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all text-center ${
                                        vehicleType === 'carro'
                                            ? 'border-primary bg-primary text-slate-950 shadow-lg shadow-primary/30 ring-2 ring-primary/30 scale-[1.04]'
                                            : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                    }`}
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-1.5 shadow-sm">
                                        <Car className="w-6 h-6 text-slate-900" />
                                    </div>
                                    <span className="text-xs font-black">Taxi</span>
                                    <span className={`text-[10px] font-black mt-0.5 ${vehicleType === 'carro' ? 'text-slate-900' : 'text-emerald-600'}`}>3 min</span>
                                    <span className="text-xs font-black mt-1">
                                        ${calculatePrice('carro')}
                                    </span>
                                    {bcvRate > 0 && (
                                        <span className={`text-[9px] font-bold ${vehicleType === 'carro' ? 'text-slate-800' : 'text-slate-500'}`}>
                                            {(parseFloat(calculatePrice('carro')) * bcvRate).toFixed(1)} Bs
                                        </span>
                                    )}
                                </button>

                                {/* Ejecutivo */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        vibrate(30);
                                        setVehicleType('ejecutivo');
                                    }}
                                    className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all text-center ${
                                        vehicleType === 'ejecutivo'
                                            ? 'border-slate-900 bg-slate-900 text-white shadow-md ring-2 ring-slate-900/20 scale-[1.02]'
                                            : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                    }`}
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-1.5 shadow-sm">
                                        <Car className="w-6 h-6 text-amber-500" />
                                    </div>
                                    <span className={`text-xs font-black ${vehicleType === 'ejecutivo' ? 'text-white' : 'text-slate-900'}`}>Confort</span>
                                    <span className="text-[10px] text-amber-400 font-black mt-0.5">5 min</span>
                                    <span className={`text-xs font-black mt-1 ${vehicleType === 'ejecutivo' ? 'text-white' : 'text-slate-900'}`}>
                                        ${calculatePrice('ejecutivo')}
                                    </span>
                                    {bcvRate > 0 && (
                                        <span className={`text-[9px] font-bold ${vehicleType === 'ejecutivo' ? 'text-slate-300' : 'text-slate-500'}`}>
                                            {(parseFloat(calculatePrice('ejecutivo')) * bcvRate).toFixed(1)} Bs
                                        </span>
                                    )}
                                </button>
                            </div>

                            {/* Payment Quick Pill & Note Row */}
                            <div className="flex items-center justify-between gap-2 pt-1">
                                <button
                                    onClick={() => {
                                        vibrate(30);
                                        setStep('payment');
                                    }}
                                    className="flex-1 flex items-center justify-between bg-slate-100 hover:bg-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <Wallet className="w-4 h-4 text-primary" />
                                        <span>
                                            {selectedPaymentMethod === 'wallet' ? 'Billetera' : selectedPaymentMethod === 'pagoMovil' ? 'Pago Móvil' : selectedPaymentMethod === 'zelle' ? 'Zelle' : 'Efectivo'}
                                        </span>
                                    </div>
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                </button>

                                <button
                                    onClick={() => setShowNotesModal(true)}
                                    className={`p-2.5 rounded-xl border transition-all flex items-center justify-center ${
                                        driverNotes ? 'bg-primary/20 border-primary text-slate-900' : 'bg-slate-100 border-transparent text-slate-600'
                                    }`}
                                    title="Notas para el conductor"
                                >
                                    <FileText className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Big Prominent Yango CTA Button */}
                            <button
                                onClick={handleRequestTaxi}
                                className="w-full py-4 bg-[#FFB800] text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <span>Pedir {vehicleType === 'moto' ? 'Moto Express' : vehicleType === 'ejecutivo' ? 'Ejecutivo Comfort' : 'Taxi Deliexpress'} • ${calculatePrice(vehicleType)}</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* STEP 3: PAYMENT METHOD DETAILS */}
                    {step === 'payment' && (
                        <div className="space-y-4 animate-in fade-in">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-black text-slate-900">Selecciona Método de Pago</h3>
                                <button
                                    onClick={() => setStep('vehicle')}
                                    className="text-xs font-bold text-primary hover:underline"
                                >
                                    Listo
                                </button>
                            </div>

                            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                                {/* Cash */}
                                <button
                                    type="button"
                                    onClick={() => setSelectedPaymentMethod('cash')}
                                    className={`w-full p-3.5 rounded-2xl border-2 flex items-center justify-between text-left transition-all ${
                                        selectedPaymentMethod === 'cash' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-100'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                            💵
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-slate-800">Efectivo ($ o Bs)</p>
                                            <p className="text-[10px] text-slate-400">Paga al abordar o finalizar</p>
                                        </div>
                                    </div>
                                    {selectedPaymentMethod === 'cash' && <Check className="w-4 h-4 text-primary" />}
                                </button>

                                {/* Wallet */}
                                <button
                                    type="button"
                                    onClick={() => setSelectedPaymentMethod('wallet')}
                                    className={`w-full p-3.5 rounded-2xl border-2 flex items-center justify-between text-left transition-all ${
                                        selectedPaymentMethod === 'wallet' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-100'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
                                            <Wallet className="w-5 h-5 text-slate-900" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-slate-800">Billetera Deliexpress</p>
                                            <p className="text-[10px] text-slate-500 font-bold">
                                                Saldo: ${(userData?.walletBalance || 0).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                    {selectedPaymentMethod === 'wallet' && <Check className="w-4 h-4 text-primary" />}
                                </button>

                                {/* Pago Móvil */}
                                {paymentMethods?.pagoMovil?.active && (
                                    <div className={`rounded-2xl border-2 p-3 transition-all ${
                                        selectedPaymentMethod === 'pagoMovil' ? 'border-primary bg-primary/5' : 'border-slate-100'
                                    }`}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedPaymentMethod('pagoMovil')}
                                            className="w-full flex items-center justify-between text-left"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xs">
                                                    PM
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-slate-800">Pago Móvil (Bs)</p>
                                                    <p className="text-[10px] text-slate-500">Tasa Oficial BCV</p>
                                                </div>
                                            </div>
                                            {selectedPaymentMethod === 'pagoMovil' && <Check className="w-4 h-4 text-primary" />}
                                        </button>

                                        {selectedPaymentMethod === 'pagoMovil' && (
                                            <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2 text-xs">
                                                <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                                                    <span>Monto: <b>{(parseFloat(calculatePrice(vehicleType)) * (bcvRate || 1)).toFixed(2)} Bs</b></span>
                                                    <button onClick={() => handleCopy((parseFloat(calculatePrice(vehicleType)) * (bcvRate || 1)).toFixed(2), 'monto')} className="text-primary font-bold">Copiar</button>
                                                </div>
                                                <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                                                    <span>Banco: <b>{paymentMethods.pagoMovil.bank}</b></span>
                                                    <button onClick={() => handleCopy(paymentMethods.pagoMovil.bank, 'banco')} className="text-primary font-bold">Copiar</button>
                                                </div>
                                                <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                                                    <span>Teléfono: <b>{paymentMethods.pagoMovil.phone}</b></span>
                                                    <button onClick={() => handleCopy(paymentMethods.pagoMovil.phone, 'tel')} className="text-primary font-bold">Copiar</button>
                                                </div>
                                                <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                                                    <span>Cédula: <b>{paymentMethods.pagoMovil.idf}</b></span>
                                                    <button onClick={() => handleCopy(paymentMethods.pagoMovil.idf, 'ced')} className="text-primary font-bold">Copiar</button>
                                                </div>

                                                <input
                                                    type="text"
                                                    placeholder="Referencia o teléfono emisor"
                                                    value={paymentRef}
                                                    onChange={(e) => setPaymentRef(e.target.value.replace(/\D/g, ''))}
                                                    className="w-full bg-white border border-slate-200 p-2.5 rounded-xl font-bold text-xs"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setStep('vehicle')}
                                className="w-full py-3.5 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-2xl active:scale-95 transition-all"
                            >
                                Confirmar método y volver
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Notas para el Conductor */}
            {showNotesModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-black text-slate-900">Indicaciones para el conductor</h3>
                            <button onClick={() => setShowNotesModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                            Indica puntos de referencia, color de portón o si viajas con equipaje especial.
                        </p>
                        <textarea
                            value={driverNotes}
                            onChange={(e) => setDriverNotes(e.target.value)}
                            placeholder="Ej: Portón blanco frente a la panadería..."
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-primary resize-none h-24"
                        />
                        <button
                            onClick={() => setShowNotesModal(false)}
                            className="w-full py-3 bg-primary text-slate-950 font-black text-xs uppercase rounded-xl active:scale-95"
                        >
                            Guardar nota
                        </button>
                    </div>
                </div>
            )}

            {/* Guest Modal */}
            {showGuestModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
                        <h3 className="text-lg font-black text-slate-900 text-center">Datos del Pasajero</h3>
                        <p className="text-xs text-slate-500 text-center">
                            Requerimos tus datos para que el conductor pueda identificarte y contactarte.
                        </p>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Nombre completo</label>
                                <input
                                    type="text"
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                    placeholder="Ej: Juan Pérez"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Cédula</label>
                                <input
                                    type="text"
                                    value={guestCedula}
                                    onChange={(e) => setGuestCedula(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Ej: 12345678"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Teléfono (WhatsApp)</label>
                                <input
                                    type="tel"
                                    value={guestPhone}
                                    onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Ej: 04141234567"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold"
                                />
                            </div>
                            <button
                                onClick={() => {
                                    if (!guestName || !guestCedula || !guestPhone) {
                                        toast.error("Completa todos los campos");
                                        return;
                                    }
                                    setShowGuestModal(false);
                                    handleRequestTaxi();
                                }}
                                className="w-full py-3.5 bg-primary text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl active:scale-95 shadow-lg shadow-primary/20"
                            >
                                Continuar con el viaje
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DemoAlertModal isOpen={showDemoAlert} onClose={() => setShowDemoAlert(false)} />
        </div>
    );
}
