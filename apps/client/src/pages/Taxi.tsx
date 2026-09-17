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
    ChevronUp,
    SlidersHorizontal,
    FileText,
    ShoppingBag,
    AlertTriangle,
    DollarSign
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
import { calculateDynamicFare, FareCalculationResult } from '../lib/pricing';
import {
    getWeatherByCoordinates,
    isNightTime,
    yangoDayMapStyles,
    yangoDarkMapStyles,
    googleMapsDarkStyles,
    WeatherInfo
} from '../lib/weather';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { promptEnableLocation, isLocationHardwareEnabled, openNativeLocationSettings } from '../lib/location-helper';
import RainOverlay from '../components/RainOverlay';
import WeatherWidget from '../components/WeatherWidget';

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

// Helper to get initial map render center from the user's known address or cache
const getInitialMapCoordinates = (userAddresses?: any[]): google.maps.LatLngLiteral => {
    if (userAddresses && userAddresses.length > 0) {
        const def = userAddresses.find((a: any) => a.isDefault) || userAddresses[0];
        if (def?.lat && def?.lng) return { lat: def.lat, lng: def.lng };
    }
    try {
        const saved = localStorage.getItem('un2x3_exact_user_location');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.lat && parsed?.lng) return { lat: parsed.lat, lng: parsed.lng };
        }
    } catch (e) {}
    // Technical fallback strictly for Google Maps canvas rendering initialization
    return { lat: 8.9326, lng: -67.4264 };
};

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
    const [step, setStep] = useState<'categories' | 'destination' | 'vehicle' | 'payment' | 'searching'>('categories');
    const [mainMode, setMainMode] = useState<'taxi' | 'package' | 'mandado'>('taxi');
    const [serviceCategory, setServiceCategory] = useState<'transport' | 'package'>('transport');
    const [selectedCategory, setSelectedCategory] = useState<'mototaxi' | 'taxi_driver' | 'carro_confort' | 'delivery_envios' | 'muchacho_mandado'>('taxi_driver');
    const [mandadoDescription, setMandadoDescription] = useState('');
    const [mandadoStoreName, setMandadoStoreName] = useState('');
    const [activeMandadoReqId, setActiveMandadoReqId] = useState<string | null>(null);
    const [mandadoBids, setMandadoBids] = useState<any[]>([]);
    const [packageDescription, setPackageDescription] = useState('');
    const [driverNotes, setDriverNotes] = useState('');
    const [showNotesModal, setShowNotesModal] = useState(false);

    // Locations (Strictly real exact addresses, never artificial default points)
    const [origin, setOrigin] = useState<Location | null>(null);
    const originRef = useRef<Location | null>(null);
    useEffect(() => {
        originRef.current = origin;
    }, [origin]);
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

    // Payment Selection (Transparent: only Cash USD, Cash VES or direct Driver Pago Móvil)
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cash_usd' | 'cash_ves' | 'pago_movil'>('cash_usd');
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

    // Bottom Sheet Collapse / Expand State & Drag Handling
    const [isSheetMinimized, setIsSheetMinimized] = useState(false);
    const touchStartYRef = useRef<number | null>(null);

    const [showDemoAlert, setShowDemoAlert] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // Weather & Night Theme State
    const [weather, setWeather] = useState<WeatherInfo | null>(null);
    const [isNight, setIsNight] = useState<boolean>(isNightTime());
    const [testRain, setTestRain] = useState<boolean>(false);

    // 0.1 Dynamic Theme (Google Maps Dark Mode)
    useEffect(() => {
        const updateTheme = () => {
            const night = isNightTime();
            setIsNight(night);
            if (mapInstanceRef.current) {
                mapInstanceRef.current.setOptions({
                    styles: googleMapsDarkStyles
                });
            }
        };

        updateTheme();
        const interval = setInterval(updateTheme, 30000);
        return () => clearInterval(interval);
    }, []);

    // 0.2 Weather Fetcher (Open-Meteo)
    const fetchWeather = useCallback(async (lat: number, lng: number) => {
        try {
            const w = await getWeatherByCoordinates(lat, lng);
            setWeather(w);
        } catch (e) {
            console.error("Error fetching weather:", e);
        }
    }, []);

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
                    const data = docSnap.data || docSnap.value || docSnap;
                    setAdminRates(data);
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

            // Solo conductores reales registrados y conectados en la base de datos Supabase
            setNearbyDrivers(validDrivers);
            setActiveDriversCount(counts);
        } catch (err) {
            console.error("fetchNearbyDrivers error:", err);
        }
    }, []);

    // 3. Initialize Google Maps DOM natively (Crash-Proof for React 19)
    useEffect(() => {
        if (!isLoaded || !mapDivRef.current || mapInstanceRef.current) return;
        if (!window.google?.maps) return;

        try {
            const initialMapCenter = getInitialMapCoordinates(userData?.addresses);

            const map = new window.google.maps.Map(mapDivRef.current, {
                center: initialMapCenter,
                zoom: 16,
                disableDefaultUI: true,
                zoomControl: false,
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
                clickableIcons: false,
                gestureHandling: 'greedy',
                styles: googleMapsDarkStyles
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

            // Map Click to Pick Origin or Destination
            map.addListener('click', (e: google.maps.MapMouseEvent) => {
                if (!e.latLng) return;
                vibrate(30);
                const clickPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };

                // Reverse geocode clicked location to exact address
                if (geocoderRef.current) {
                    geocoderRef.current.geocode({ location: clickPos }, (res, status) => {
                        const addr = (status === 'OK' && res && res[0])
                            ? res[0].formatted_address
                            : `${clickPos.lat.toFixed(5)}, ${clickPos.lng.toFixed(5)}`;

                        if (!originRef.current) {
                            const newOrigin = {
                                lat: clickPos.lat,
                                lng: clickPos.lng,
                                address: addr
                            };
                            setOrigin(newOrigin);
                            setUserLocation({ lat: clickPos.lat, lng: clickPos.lng });
                            fetchNearbyDrivers(clickPos);
                            toast.success('Punto de partida fijado con éxito');
                        } else {
                            setDestination({
                                lat: clickPos.lat,
                                lng: clickPos.lng,
                                address: addr
                            });
                            setSearchQuery(addr);
                            setStep('vehicle');
                        }
                    });
                }
            });

            // Initial GPS acquisition with auto-pan directly to user's exact position
            locateUser(true);
        } catch (e) {
            console.error("Error initializing Google Map:", e);
        }
    }, [isLoaded]);

    // 4. Locate User Helper (Strictly finds the person's exact location, NEVER assigns a default point)
    const locateUser = useCallback(async (panTo = true) => {
        setIsLocating(true);
        let coords: { lat: number; lng: number } | null = null;
        let knownAddress: string | null = null;

        // 1. Mobile Native GPS (Android/iOS via Capacitor)
        if (Capacitor.isNativePlatform()) {
            try {
                const perm = await Geolocation.checkPermissions().catch(() => ({ location: 'prompt' as any }));
                if (perm.location !== 'granted') {
                    await Geolocation.requestPermissions().catch(() => ({ location: 'denied' as any }));
                }
            } catch (permErr) {
                console.warn('Capacitor permissions check error:', permErr);
            }

            // A) Try High Accuracy (GPS satellite) first with 8s timeout
            try {
                const pos = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 5000
                });
                if (pos?.coords?.latitude && pos?.coords?.longitude) {
                    coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                }
            } catch (highErr) {
                console.warn('Capacitor High-Accuracy Geolocation timed out/failed, trying balanced provider:', highErr);
            }

            // B) If satellite GPS timed out (very common indoors), try Low Accuracy (Wi-Fi + Cellular Fused Provider)
            if (!coords) {
                try {
                    const pos = await Geolocation.getCurrentPosition({
                        enableHighAccuracy: false,
                        timeout: 6000,
                        maximumAge: 60000
                    });
                    if (pos?.coords?.latitude && pos?.coords?.longitude) {
                        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    }
                } catch (lowErr) {
                    console.warn('Capacitor Low-Accuracy Geolocation error:', lowErr);
                }
            }
        }

        // 2. Web Geolocation API fallback
        if (!coords && navigator.geolocation) {
            try {
                coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        () => {
                            // Fallback to low accuracy
                            navigator.geolocation.getCurrentPosition(
                                (p2) => resolve({ lat: p2.coords.latitude, lng: p2.coords.longitude }),
                                () => resolve(null),
                                { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
                            );
                        },
                        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
                    );
                });
            } catch (err) {
                console.warn('Error in web geolocation:', err);
            }
        }

        // 3. Fallback to User's Saved Address from Profile
        if (!coords && userData?.addresses && userData.addresses.length > 0) {
            const defaultAddr = userData.addresses.find((a: any) => a.isDefault) || userData.addresses[0];
            if (defaultAddr?.lat && defaultAddr?.lng) {
                coords = { lat: defaultAddr.lat, lng: defaultAddr.lng };
                knownAddress = defaultAddr.reference ? `${defaultAddr.name} (${defaultAddr.reference})` : (defaultAddr.address || defaultAddr.name);
            }
        }

        // 4. Fallback to Cached Exact Address in LocalStorage from a prior detection
        if (!coords) {
            const savedLocal = localStorage.getItem('un2x3_exact_user_location');
            if (savedLocal) {
                try {
                    const parsed = JSON.parse(savedLocal);
                    if (parsed?.lat && parsed?.lng && parsed?.address) {
                        coords = { lat: parsed.lat, lng: parsed.lng };
                        knownAddress = parsed.address;
                    }
                } catch (e) {}
            }
        }

        setIsLocating(false);

        // If NO EXACT LOCATION is available, DO NOT set any default or fake point!
        if (!coords) {
            toast('Activa el GPS de tu dispositivo o toca el mapa para fijar tu ubicación exacta', { icon: '📍', duration: 4500 });
            return;
        }

        setUserLocation(coords);
        fetchWeather(coords.lat, coords.lng);

        if (knownAddress) {
            setOrigin({
                lat: coords.lat,
                lng: coords.lng,
                address: knownAddress
            });
        }

        // Reverse geocode location with Google Maps Geocoder to get the exact street/house address
        if (geocoderRef.current) {
            geocoderRef.current.geocode({ location: coords }, (res, status) => {
                let exactAddr = knownAddress;
                if (status === 'OK' && res && res[0]) {
                    exactAddr = res[0].formatted_address;
                } else if (!exactAddr) {
                    exactAddr = `Ubicación GPS (${coords!.lat.toFixed(5)}, ${coords!.lng.toFixed(5)})`;
                }

                const finalOrigin: Location = {
                    lat: coords!.lat,
                    lng: coords!.lng,
                    address: exactAddr!
                };

                setOrigin(finalOrigin);
                localStorage.setItem('un2x3_exact_user_location', JSON.stringify(finalOrigin));
            });
        } else if (!knownAddress) {
            const finalOrigin: Location = {
                lat: coords.lat,
                lng: coords.lng,
                address: `Ubicación GPS (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`
            };
            setOrigin(finalOrigin);
        }

        if (mapInstanceRef.current && panTo) {
            mapInstanceRef.current.panTo(coords);
            mapInstanceRef.current.setZoom(17);
        }

        fetchNearbyDrivers(coords);
    }, [fetchNearbyDrivers, fetchWeather, userData]);

    // Handle user tap on GPS button / Activar GPS
    const handleRequestGps = useCallback(async () => {
        vibrate(30);
        if (Capacitor.isNativePlatform()) {
            const isHardwareOn = await isLocationHardwareEnabled();
            if (!isHardwareOn) {
                toast('Abriendo ajustes de ubicación...', { icon: '⚙️' });
                await openNativeLocationSettings();
                return;
            }
        }
        await promptEnableLocation();
        await locateUser(true);
    }, [locateUser]);

    // Auto re-locate when user returns to the app (e.g., after activating GPS in phone settings or notification shade)
    useEffect(() => {
        let appStateSub: any = null;
        if (Capacitor.isNativePlatform()) {
            appStateSub = CapApp.addListener('appStateChange', (state) => {
                if (state.isActive) {
                    locateUser(false);
                }
            });
        }

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                locateUser(false);
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            if (appStateSub) appStateSub.then((s: any) => s.remove());
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [locateUser]);

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

    // 5.1 Real-time listener for Muchacho e' Mandado bids
    useEffect(() => {
        if (!activeMandadoReqId) return;

        const fetchBids = async () => {
            const { data } = await supabase
                .from('transport_bids')
                .select('*')
                .eq('transport_request_id', activeMandadoReqId)
                .order('created_at', { ascending: false });
            if (data) setMandadoBids(data);
        };

        fetchBids();

        const channel = supabase.channel(`mandado_bids_client_${activeMandadoReqId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'transport_bids',
                filter: `transport_request_id=eq.${activeMandadoReqId}`
            }, () => {
                fetchBids();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeMandadoReqId]);

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

    // 9. Pricing Calculation (Algoritmo Dinámico Inteligente estilo Yango)
    const getFareDetails = (type: 'moto' | 'carro' | 'ejecutivo'): FareCalculationResult => {
        const distance = routeInfo ? routeInfo.distance : 1;
        return calculateDynamicFare({
            serviceType: type,
            distanceKm: distance,
            settings: adminRates,
            availableDriversCount: activeDriversCount[type],
            forceRain: Boolean(weather?.isRaining || testRain)
        });
    };

    const calculatePrice = (type: 'moto' | 'carro' | 'ejecutivo'): string => {
        return getFareDetails(type).clientTotal.toFixed(2);
    };

    // Aceptar puja de conductor para Muchacho e' Mandado
    const handleAcceptMandadoBid = async (bid: any) => {
        try {
            // 1. Aceptar puja seleccionada
            await supabase.from('transport_bids').update({ status: 'accepted' }).eq('id', bid.id);
            // 2. Rechazar otras pujas de esta solicitud
            await supabase.from('transport_bids').update({ status: 'rejected' })
                .eq('transport_request_id', bid.transport_request_id)
                .neq('id', bid.id);
            // 3. Asignar conductor al viaje
            await supabase.from('transport_requests').update({
                status: 'accepted',
                driver_id: bid.driver_id,
                driver_name: bid.driver_name,
                driver_phone: bid.driver_phone,
                driver_assigned_at: new Date().toISOString(),
                price: Number(bid.amount),
                total: Number(bid.amount),
                commission_amount: 0.70
            }).eq('id', bid.transport_request_id);

            toast.success(`¡Oferta de ${bid.driver_name} aceptada!`);
            navigate(`/taxi/track/${bid.transport_request_id}`);
        } catch (err) {
            console.error("Error accepting bid:", err);
            toast.error("Error al aceptar la oferta.");
        }
    };

    // 10. Request Ride Handler (Strict snake_case, UUID safety & 5-category logic)
    const handleRequestTaxi = async () => {
        if (!user && (!guestName || !guestPhone || !guestCedula)) {
            setShowGuestModal(true);
            return;
        }

        if (!origin || !destination) {
            toast.error("Selecciona un origen y destino para continuar");
            return;
        }

        if (selectedCategory === 'muchacho_mandado' && !mandadoDescription.trim()) {
            toast.error("Por favor describe qué necesitas que te compren o retiren");
            return;
        }

        // Determine price, vehicle type and commission
        let clientTotal = '1.00';
        let commAmount = 0.80;
        let vType: 'moto' | 'carro' | 'ejecutivo' = 'carro';

        if (selectedCategory === 'mototaxi') {
            vType = 'moto';
            commAmount = 0.50;
            clientTotal = calculatePrice('moto');
        } else if (selectedCategory === 'taxi_driver') {
            vType = 'carro';
            commAmount = 0.80;
            clientTotal = calculatePrice('carro');
        } else if (selectedCategory === 'carro_confort') {
            vType = 'ejecutivo';
            commAmount = 1.20;
            clientTotal = calculatePrice('ejecutivo');
        } else if (selectedCategory === 'delivery_envios') {
            vType = 'moto';
            commAmount = 0.50;
            clientTotal = calculatePrice('moto');
        } else if (selectedCategory === 'muchacho_mandado') {
            vType = 'moto';
            commAmount = 0.70;
            clientTotal = '1.00'; // Base minimum, final price is defined by accepted driver bid
        }

        const numTotal = parseFloat(clientTotal);
        const driverPayoutVal = Math.max(0, numTotal - commAmount);

        try {
            setIsUploading(true);
            vibrate(50);

            // Valid user_id: MUST be null if guest, because Postgres user_id is a UUID!
            const validUserId = user?.id || user?.uid || null;
            const newReqId = crypto.randomUUID();

            let proofUrl = '';
            if (paymentProof && selectedPaymentMethod === 'pago_movil') {
                const ext = paymentProof.name.split('.').pop() || 'jpg';
                const path = `taxi_proofs/${validUserId || 'guest'}/${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(path, paymentProof, { upsert: true });
                if (!upErr) {
                    const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(path);
                    proofUrl = publicUrl;
                }
            }

            const orderData: any = {
                id: newReqId,
                user_id: validUserId,
                user_name: userData?.displayName || user?.displayName || user?.email || guestName || 'Usuario Invitado',
                user_phone: userData?.phone || guestPhone || 'Sin número',
                user_cedula: userData?.cedula || guestCedula || 'N/A',
                origin,
                destination,
                route: routeInfo,
                total: numTotal,
                price: numTotal,
                service_category: selectedCategory,
                vehicle_type: vType,
                driver_payout: driverPayoutVal,
                commission_amount: commAmount,
                commission_debited: false,
                status: 'searching',
                payment_method: selectedPaymentMethod,
                payment_status: 'pending',
                cash_currency: selectedPaymentMethod === 'cash_ves' ? 'VES' : 'USD',
                payment_ref: paymentRef || '',
                payment_proof_url: proofUrl,
                scheduled: isScheduled,
                scheduled_at: isScheduled && scheduledDateTime ? new Date(scheduledDateTime).toISOString() : null,
                notes: driverNotes || '',
                created_at: new Date().toISOString()
            };

            if (selectedCategory === 'muchacho_mandado') {
                orderData.type = 'muchacho_mandado';
                orderData.mandado_details = {
                    description: mandadoDescription,
                    storeName: mandadoStoreName || 'Comercio Local'
                };
            } else if (selectedCategory === 'delivery_envios') {
                orderData.type = 'package_delivery';
                orderData.package_description = packageDescription;
            } else {
                orderData.type = 'transport';
            }

            const { error: insErr } = await supabase.from('transport_requests').insert(orderData);
            if (insErr) {
                console.error("Supabase transport_requests insert error:", insErr);
                throw insErr;
            }

            if (selectedCategory === 'muchacho_mandado') {
                setActiveMandadoReqId(newReqId);
                setStep('searching');
                toast.success("¡Mandado publicado! Escaneando ofertas de pilotos en tiempo real...");
            } else {
                setStep('searching');
                setTimeout(() => {
                    navigate(`/taxi/track/${newReqId}`);
                }, 1200);
            }

        } catch (error: any) {
            console.error("Error creating transport request:", error);
            toast.error("No se pudo procesar la solicitud. Revisa tu conexión.");
            setStep('vehicle');
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

    // Searching Screen (Radar Animation style YANGO & Muchacho e' Mandado Bids)
    if (step === 'searching') {
        if (selectedCategory === 'muchacho_mandado') {
            return (
                <div className="relative w-full h-full bg-slate-950 text-white flex flex-col justify-between p-6 overflow-hidden select-none">
                    {/* Background Radar Waves */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                        <div className="w-64 h-64 border border-amber-400/30 rounded-full animate-ping [animation-duration:3s]"></div>
                        <div className="w-96 h-96 border border-amber-400/20 rounded-full animate-ping [animation-duration:4s]"></div>
                        <div className="w-[500px] h-[500px] border border-amber-400/10 rounded-full animate-ping [animation-duration:5s]"></div>
                    </div>

                    {/* Top Header */}
                    <div className="relative z-10 w-full flex items-center justify-between pt-2">
                        <button
                            onClick={async () => {
                                if (activeMandadoReqId) {
                                    await supabase.from('transport_requests').update({ status: 'cancelled' }).eq('id', activeMandadoReqId);
                                }
                                setStep('vehicle');
                            }}
                            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-transform"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2 bg-amber-400/20 border border-amber-400/40 px-3 py-1.5 rounded-full text-amber-400">
                            <Package className="w-4 h-4 animate-bounce" />
                            <span className="text-[11px] font-black uppercase tracking-wider">Subasta de Tarifas</span>
                        </div>
                    </div>

                    {/* Center Content: Errand summary + Live Bids list */}
                    <div className="relative z-10 flex-1 flex flex-col overflow-hidden my-4 max-w-md w-full mx-auto">
                        {/* Encargo Header Card */}
                        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 mb-3 backdrop-blur-md">
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">Tu Mandado Solicitado</span>
                            <p className="text-xs font-bold text-slate-200 mt-1 line-clamp-2">{mandadoDescription}</p>
                            {mandadoStoreName && (
                                <p className="text-[11px] text-slate-400 mt-1">🏪 {mandadoStoreName}</p>
                            )}
                            <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-[10px] text-amber-300 font-semibold flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5 shrink-0" />
                                Cero intermediación: Paga directo al comercio por Pago Móvil.
                            </div>
                        </div>

                        {/* Bids Tray Header */}
                        <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                Ofertas de Pilotos ({mandadoBids.length})
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">Elige la mejor propuesta</span>
                        </div>

                        {/* List of Incoming Driver Bids */}
                        <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-hide">
                            {mandadoBids.length === 0 ? (
                                <div className="h-48 flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 rounded-3xl border border-slate-800/60">
                                    <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center text-amber-400 mb-3 animate-pulse">
                                        <ClockIcon className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-sm font-black text-slate-200">Buscando pilotos disponibles...</h4>
                                    <p className="text-xs text-slate-400 max-w-[220px] mt-1">
                                        Los conductores están revisando tu encargo y enviando sus propuestas de tarifa y tiempo.
                                    </p>
                                </div>
                            ) : (
                                mandadoBids.map((bid) => (
                                    <div
                                        key={bid.id}
                                        className="bg-slate-900 border-2 border-amber-400/40 hover:border-amber-400 rounded-3xl p-4 shadow-xl flex items-center justify-between gap-3 transition-all animate-in fade-in slide-in-from-bottom-2"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative shrink-0">
                                                <img
                                                    src={bid.driver_photo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'}
                                                    alt="Piloto"
                                                    className="w-12 h-12 rounded-2xl object-cover border border-slate-700 bg-slate-800"
                                                />
                                                <div className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 text-[9px] font-black px-1 rounded-md">
                                                    ★ {Number(bid.driver_rating || 5.0).toFixed(1)}
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-white truncate">{bid.driver_name}</p>
                                                <p className="text-[10px] text-slate-400 font-bold capitalize truncate">
                                                    {bid.vehicle_type} {bid.vehicle_plate ? `• ${bid.vehicle_plate}` : ''}
                                                </p>
                                                <p className="text-[10px] font-black text-emerald-400 mt-0.5">
                                                    Llega en ~{bid.eta_minutes || 15} min
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end shrink-0 gap-1.5">
                                            <div className="text-right">
                                                <div className="text-xl font-black text-amber-400 leading-none">
                                                    ${Number(bid.amount).toFixed(2)}
                                                </div>
                                                {bcvRate > 0 && (
                                                    <div className="text-[10px] font-bold text-slate-400">
                                                        {(Number(bid.amount) * bcvRate).toFixed(0)} Bs
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleAcceptMandadoBid(bid)}
                                                className="px-3.5 py-2 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-md active:scale-95 transition-all"
                                            >
                                                Aceptar
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Bottom Cancel Button */}
                    <div className="relative z-10 w-full max-w-xs mx-auto pb-2">
                        <button
                            onClick={async () => {
                                if (activeMandadoReqId) {
                                    await supabase.from('transport_requests').update({ status: 'cancelled' }).eq('id', activeMandadoReqId);
                                }
                                setStep('vehicle');
                            }}
                            className="w-full py-3 bg-white/10 hover:bg-white/15 text-slate-300 font-bold rounded-2xl text-xs uppercase tracking-wider active:scale-95 transition-all"
                        >
                            Cancelar Mandado
                        </button>
                    </div>
                </div>
            );
        }

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

            {/* Live Weather Rain Animation Canvas Overlay */}
            <RainOverlay
                isActive={Boolean(weather?.isRaining || testRain)}
                intensity={weather?.precipitationMm && weather.precipitationMm > 1 ? 'heavy' : 'moderate'}
            />

            {!isLoaded && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-100/90 backdrop-blur-sm">
                    <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-600">Iniciando Google Maps...</p>
                </div>
            )}

            {/* 0. PANTALLA INICIAL DE SELECCIÓN DE SERVICIO (Un 2x3 Movilidad) */}
            {/* 0. PANTALLA INICIAL DE SELECCIÓN DE SERVICIO (Un 2x3 Movilidad) */}
            {step === 'categories' && (
                <div className="absolute inset-0 z-40 bg-slate-950/65 backdrop-blur-[10px] flex flex-col justify-between p-3.5 sm:p-5 overflow-hidden animate-in fade-in duration-200 select-none">
                    {/* GPS Map Blurred Aesthetic Overlay (Grid & Navigation Waypoints) */}
                    <div className="absolute inset-0 pointer-events-none opacity-25 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px]" />
                    <div className="absolute inset-0 pointer-events-none opacity-15 bg-[linear-gradient(to_right,#ffffff15_1px,transparent_1px),linear-gradient(to_bottom,#ffffff15_1px,transparent_1px)] bg-[size:3.5rem_3.5rem]" />

                    {/* Top Bar with Home Back and Discreet Weather on the Side */}
                    <div className="relative z-10 w-full max-w-md mx-auto flex items-center justify-between pb-2 pt-0.5 border-b border-white/10 shrink-0">
                        <button
                            onClick={() => navigate('/')}
                            className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-all shadow-sm"
                            title="Volver al inicio"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="text-center">
                            <h2 className="text-sm sm:text-base font-black text-white tracking-tight flex items-center justify-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[#FFB800] animate-pulse"></span>
                                Un 2x3 Movilidad
                            </h2>
                            <p className="text-[9px] text-slate-300 font-bold uppercase tracking-wider">
                                Elige tu servicio
                            </p>
                        </div>
                        {/* Weather pill placed discreetly to the side */}
                        <WeatherWidget
                            weather={weather}
                            isNight={isNight}
                            testRainActive={testRain}
                            onToggleTestRain={() => setTestRain(prev => !prev)}
                        />
                    </div>

                    {/* Main Options Cards - Minimalist, Compact & Vibrant Yellow with Black Letters */}
                    <div className="relative z-10 w-full max-w-md mx-auto my-auto py-1 space-y-2.5 sm:space-y-3 flex-1 flex flex-col justify-center">
                        <div className="text-center mb-0.5">
                            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight">
                                ¿Qué necesitas hoy?
                            </h3>
                            <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                                Selecciona una opción para comenzar tu solicitud personalizada
                            </p>
                        </div>

                        {/* Opción 1: Taxi / Viajes */}
                        <button
                            type="button"
                            onClick={() => {
                                vibrate(30);
                                setMainMode('taxi');
                                setServiceCategory('transport');
                                setSelectedCategory('taxi_driver');
                                setVehicleType('carro');
                                setStep('destination');
                            }}
                            className="w-full bg-[#FFB800] hover:bg-[#ffc21a] border-2 border-amber-300/80 p-3 sm:p-3.5 rounded-2xl sm:rounded-3xl text-left shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all group flex items-center gap-3"
                        >
                            <div className="w-11 h-11 rounded-2xl bg-slate-950 text-[#FFB800] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                                <Car className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <h4 className="text-sm sm:text-base font-black text-slate-950 tracking-tight leading-none">
                                        Taxi / Viajes
                                    </h4>
                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-[#FFB800] tracking-wider shrink-0">
                                        Pasajeros
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-950/90 font-bold line-clamp-1 leading-tight mt-0.5">
                                    Mototaxi, Taxi Standard y Carro Confort con A/A.
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-950 font-black">
                                    <span className="flex items-center gap-1">
                                        <Bike className="w-3 h-3 text-slate-950" /> Moto
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        <Car className="w-3 h-3 text-slate-950" /> Taxi
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-slate-950" /> Confort
                                    </span>
                                </div>
                            </div>
                            <div className="w-7 h-7 rounded-full bg-slate-950/10 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-[#FFB800] transition-all shrink-0">
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </button>

                        {/* Opción 2: Envío de Paquete */}
                        <button
                            type="button"
                            onClick={() => {
                                vibrate(30);
                                setMainMode('package');
                                setServiceCategory('package');
                                setSelectedCategory('delivery_envios');
                                setVehicleType('moto');
                                setStep('destination');
                            }}
                            className="w-full bg-[#FFB800] hover:bg-[#ffc21a] border-2 border-amber-300/80 p-3 sm:p-3.5 rounded-2xl sm:rounded-3xl text-left shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all group flex items-center gap-3"
                        >
                            <div className="w-11 h-11 rounded-2xl bg-slate-950 text-[#FFB800] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                                <Package className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <h4 className="text-sm sm:text-base font-black text-slate-950 tracking-tight leading-none">
                                        Envío de Paquete
                                    </h4>
                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-[#FFB800] tracking-wider shrink-0">
                                        Delivery Express
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-950/90 font-bold line-clamp-1 leading-tight mt-0.5">
                                    Encomiendas, documentos, llaves o compras punto a punto.
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-950 font-black">
                                    <span>📦 Directo</span>
                                    <span>•</span>
                                    <span>⚡ Sin escalas</span>
                                    <span>•</span>
                                    <span>🔒 Conductor verificado</span>
                                </div>
                            </div>
                            <div className="w-7 h-7 rounded-full bg-slate-950/10 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-[#FFB800] transition-all shrink-0">
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </button>

                        {/* Opción 3: Muchacho e' Mandao */}
                        <button
                            type="button"
                            onClick={() => {
                                vibrate(30);
                                setMainMode('mandado');
                                setServiceCategory('package');
                                setSelectedCategory('muchacho_mandado');
                                setVehicleType('moto');
                                setStep('destination');
                            }}
                            className="w-full bg-[#FFB800] hover:bg-[#ffc21a] border-2 border-amber-300/80 p-3 sm:p-3.5 rounded-2xl sm:rounded-3xl text-left shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all group flex items-center gap-3"
                        >
                            <div className="w-11 h-11 rounded-2xl bg-slate-950 text-[#FFB800] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                                <ShoppingBag className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <h4 className="text-sm sm:text-base font-black text-slate-950 tracking-tight leading-none">
                                        Muchacho e' Mandao
                                    </h4>
                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-[#FFB800] tracking-wider shrink-0">
                                        Subasta en Vivo
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-950/90 font-bold line-clamp-1 leading-tight mt-0.5">
                                    Diligencias y trámites. Paga directo al comercio por Pago Móvil.
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-950 font-black">
                                    <span>🏪 Diligencias y Farmacias</span>
                                    <span>•</span>
                                    <span>💰 Tú eliges la mejor oferta</span>
                                </div>
                            </div>
                            <div className="w-7 h-7 rounded-full bg-slate-950/10 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-[#FFB800] transition-all shrink-0">
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </button>
                    </div>

                    {/* Bottom Transparency Guarantee Footer */}
                    <div className="relative z-10 w-full max-w-md mx-auto pt-2 pb-0.5 text-center border-t border-white/10 shrink-0">
                        <p className="text-[10px] text-slate-300 font-bold flex items-center justify-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-emerald-400" />
                            Tarifas transparentes • Ni el clima ni el tráfico alteran tu precio
                        </p>
                    </div>
                </div>
            )}

            {/* 2. Top Floating Controls (Visible after choosing service) */}
            {step !== 'categories' && (
                <div className="absolute top-3 inset-x-3 z-30 flex flex-col gap-2 max-w-md mx-auto pointer-events-auto">
                    {/* Search Bar & Actions */}
                    <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-2">
                        <button
                            onClick={() => {
                                if (step === 'destination') {
                                    setStep('categories');
                                } else if (step === 'vehicle') {
                                    setStep('destination');
                                } else {
                                    setStep('categories');
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
                                placeholder={
                                    mainMode === 'mandado'
                                        ? "¿Dónde comprar o retirar? (Local / Farmacia)"
                                        : mainMode === 'package'
                                        ? "¿A dónde entregamos el paquete?"
                                        : "¿A dónde vas? (Buscar dirección o lugar)"
                                }
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
                            onClick={handleRequestGps}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 active:scale-95 ${
                                isLocating ? 'bg-primary text-slate-950 animate-spin' : 'bg-primary/10 text-primary hover:bg-primary/20'
                            }`}
                            title="Mi ubicación actual"
                        >
                            <Navigation className="w-5 h-5 fill-current" />
                        </button>
                    </div>

                    {/* Active Service Badge & Weather Widget Discreetly to the Side */}
                    <div className="flex items-center justify-between gap-2 px-0.5">
                        <button
                            type="button"
                            onClick={() => setStep('categories')}
                            className="bg-slate-900/90 hover:bg-slate-900 text-white backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-2 shadow-md active:scale-95 transition-all border border-slate-700/60"
                            title="Cambiar de servicio"
                        >
                            {mainMode === 'taxi' ? (
                                <>
                                    <Car className="w-3.5 h-3.5 text-primary" />
                                    <span>Taxi / Viajes</span>
                                </>
                            ) : mainMode === 'package' ? (
                                <>
                                    <Package className="w-3.5 h-3.5 text-blue-400" />
                                    <span>Envío de Paquete</span>
                                </>
                            ) : (
                                <>
                                    <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Muchacho e' Mandao</span>
                                </>
                            )}
                            <span className="text-[10px] text-slate-400 font-bold ml-1 pl-1.5 border-l border-slate-700">
                                Cambiar
                            </span>
                        </button>

                        <WeatherWidget
                            weather={weather}
                            isNight={isNight}
                            testRainActive={testRain}
                            onToggleTestRain={() => setTestRain(prev => !prev)}
                        />
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
            )}

            {/* 3. Docked Bottom Sheet (Yango Signature UX) */}
            {step !== 'categories' && (
                <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end pointer-events-none">
                <div className="pointer-events-auto bg-white/98 backdrop-blur-2xl rounded-t-[28px] sm:rounded-t-[32px] shadow-[0_-12px_40px_rgba(0,0,0,0.18)] border-t border-white/60 px-4 pt-2.5 pb-4 sm:p-5 max-w-md mx-auto w-full transition-all duration-300 ease-in-out">
                    {/* Pull Bar / Drag Handle Area */}
                    <div
                        onTouchStart={(e) => {
                            touchStartYRef.current = e.touches[0].clientY;
                        }}
                        onTouchMove={(e) => {
                            if (touchStartYRef.current !== null) {
                                const currentY = e.touches[0].clientY;
                                const diffY = currentY - touchStartYRef.current;
                                if (diffY > 40 && !isSheetMinimized) {
                                    setIsSheetMinimized(true);
                                    touchStartYRef.current = null;
                                } else if (diffY < -30 && isSheetMinimized) {
                                    setIsSheetMinimized(false);
                                    touchStartYRef.current = null;
                                }
                            }
                        }}
                        onTouchEnd={() => {
                            touchStartYRef.current = null;
                        }}
                        onClick={() => setIsSheetMinimized(!isSheetMinimized)}
                        className="w-full flex flex-col items-center justify-center py-2 -mt-1 cursor-pointer select-none group touch-none"
                        title={isSheetMinimized ? 'Toca o desliza hacia arriba para ver detalles' : 'Desliza hacia abajo para ver más mapa'}
                    >
                        <div className="w-12 h-1.5 bg-slate-300 group-hover:bg-slate-400 rounded-full transition-colors" />
                        {isSheetMinimized && (
                            <span className="text-[10px] font-bold text-slate-500 mt-1 flex items-center gap-1 animate-pulse">
                                <span>Toca para ver tarifas</span>
                                <ChevronUp className="w-3 h-3 text-slate-600" />
                            </span>
                        )}
                    </div>

                    {/* Minimized Peek View (shows when user pulls down or collapses sheet) */}
                    {isSheetMinimized && (
                        <div className="pt-1 pb-1 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5">
                                <div
                                    onClick={() => setIsSheetMinimized(false)}
                                    className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-slate-900 flex-shrink-0">
                                        {mainMode === 'package' ? (
                                            <Package className="w-5 h-5" />
                                        ) : mainMode === 'mandado' ? (
                                            <ShoppingBag className="w-5 h-5" />
                                        ) : vehicleType === 'moto' ? (
                                            <Bike className="w-5 h-5" />
                                        ) : (
                                            <Car className="w-5 h-5" />
                                        )}
                                    </div>
                                    <div className="truncate">
                                        <p className="text-xs font-black text-slate-900 truncate">
                                            {mainMode === 'mandado'
                                                ? "Muchacho e' Mandao"
                                                : mainMode === 'package'
                                                ? 'Envío de Paquete'
                                                : vehicleType === 'moto'
                                                ? 'Moto Express'
                                                : vehicleType === 'ejecutivo'
                                                ? 'Ejecutivo Comfort'
                                                : 'Taxi Deliexpress'}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-500 truncate">
                                            {routeInfo ? `${routeInfo.distance} km • ${routeInfo.duration}` : 'Calculando ruta...'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-sm font-black text-slate-950">
                                        {mainMode === 'mandado' ? 'Subasta' : `$${calculatePrice(vehicleType)}`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setIsSheetMinimized(false)}
                                        className="p-2 bg-primary text-slate-950 rounded-xl font-black text-xs active:scale-95 transition-transform"
                                        title="Expandir panel"
                                    >
                                        <ChevronUp className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 1: DESTINATION & SAVED PLACES */}
                    {!isSheetMinimized && step === 'destination' && (
                        <div className="space-y-3.5 animate-in fade-in">
                            {/* Route Indicator Pills */}
                            <div className="bg-slate-50 rounded-2xl p-2.5 sm:p-3 border border-slate-200/70 space-y-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9px] font-black uppercase text-slate-400">
                                            {mainMode === 'mandado'
                                                ? '¿Dónde comprar o retirar? (Punto inicial)'
                                                : mainMode === 'package'
                                                ? 'Punto de retiro del paquete'
                                                : 'Punto de partida'}
                                        </p>
                                        <p className="text-xs font-bold text-slate-800 truncate">
                                            {origin?.address || (isLocating ? 'Detectando tu ubicación exacta...' : 'Toca el GPS o selecciona en el mapa')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRequestGps}
                                        className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors flex-shrink-0"
                                        title="Actualizar mi ubicación exacta"
                                    >
                                        <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-primary' : ''}`} />
                                    </button>
                                </div>
                                <div className="border-t border-slate-200/60 ml-5" />
                                <div className="flex items-center gap-2.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9px] font-black uppercase text-slate-400">
                                            {mainMode === 'mandado'
                                                ? '¿A dónde llevar el mandado? (Destino)'
                                                : mainMode === 'package'
                                                ? 'Destino de entrega'
                                                : 'Destino del viaje'}
                                        </p>
                                        <p className="text-xs font-bold text-slate-800 truncate">
                                            {destination?.address || 'Toca en el mapa o busca arriba'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Alert if exact origin is not yet acquired */}
                            {!origin && !isLocating && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-amber-900 animate-in fade-in">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                        <span className="font-semibold text-[11px]">Fija tu ubicación exacta para iniciar</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRequestGps}
                                        className="px-2.5 py-1 bg-amber-500 text-slate-950 rounded-lg font-black text-[11px] shadow-sm active:scale-95 transition-transform"
                                    >
                                        Activar GPS
                                    </button>
                                </div>
                            )}

                            {/* Mandado Specific Inputs in Step 1 */}
                            {mainMode === 'mandado' && (
                                <div className="space-y-2.5 bg-amber-50/90 border border-amber-200 rounded-2xl p-3 animate-in fade-in">
                                    <div className="flex items-start gap-2 text-xs text-amber-900">
                                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-black text-[11px]">⚠️ Cero intermediación de compras</p>
                                            <p className="text-[10px] text-amber-800 leading-snug mt-0.5">
                                                Tú le transfieres directo al comercio por Pago Móvil. El conductor nunca financia compras; sólo cobra su tarifa de mandado.
                                            </p>
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Nombre del negocio o comercio (ej: Farmatodo, Panadería)..."
                                        value={mandadoStoreName}
                                        onChange={(e) => setMandadoStoreName(e.target.value)}
                                        className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-amber-400 placeholder:text-slate-400"
                                    />
                                    <textarea
                                        placeholder="¿Qué mandado necesitas? (Ej: 2 panes campesinos y medicina en Farmatodo ya pagada)..."
                                        value={mandadoDescription}
                                        onChange={(e) => setMandadoDescription(e.target.value)}
                                        rows={2}
                                        className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-amber-400 placeholder:text-slate-400 resize-none"
                                    />
                                </div>
                            )}

                            {/* Package Note If in package mode */}
                            {mainMode === 'package' && (
                                <div className="space-y-2 bg-blue-50/90 border border-blue-200 rounded-2xl p-3 animate-in fade-in">
                                    <div className="flex items-center gap-2 text-xs text-blue-900">
                                        <Package className="w-4 h-4 text-blue-600 shrink-0" />
                                        <span className="font-black text-[11px]">¿Qué paquete deseas enviar?</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={packageDescription}
                                        onChange={(e) => setPackageDescription(e.target.value)}
                                        placeholder="Ej: Documentos en sobre cerrado, llaves, caja mediana..."
                                        className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-400 placeholder:text-slate-400"
                                    />
                                </div>
                            )}

                            {/* Saved Places Quick Access */}
                            {userData?.addresses && userData.addresses.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5">Lugares frecuentes</p>
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
                                                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 flex-shrink-0 transition-colors"
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
                                disabled={!origin || !destination}
                                onClick={() => {
                                    vibrate(30);
                                    setStep('vehicle');
                                }}
                                className="w-full py-3.5 bg-primary text-slate-950 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all"
                            >
                                <span>
                                    {mainMode === 'mandado'
                                        ? 'Continuar a tarifa de mandado'
                                        : mainMode === 'package'
                                        ? 'Continuar a tarifa de envío'
                                        : 'Ver tarifas de viaje'}
                                </span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* STEP 2: VEHICLE SELECTION (YANGO TIER CARDS) */}
                    {!isSheetMinimized && step === 'vehicle' && (
                        <div className="space-y-3 animate-in fade-in">
                            {/* Route Summary Badge & Schedule Toggle */}
                            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-slate-900">
                                        {routeInfo ? `${routeInfo.distance} km • ${routeInfo.duration}` : 'Calculando ruta...'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setIsScheduled(!isScheduled)}
                                        className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                            isScheduled ? 'bg-primary text-slate-950' : 'bg-slate-100 text-slate-600'
                                        }`}
                                    >
                                        {isScheduled ? 'Reservado' : 'Reservar'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsSheetMinimized(true)}
                                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                                        title="Minimizar para ver más mapa"
                                    >
                                        <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Dynamic Surcharge Indicator (Yango Surge Badge) */}
                            {getFareDetails(vehicleType).surgeMultiplier > 1 && (
                                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/80 text-amber-900 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                                    <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span>
                                        {getFareDetails(vehicleType).activeFactors.isRain
                                             ? `Recargo por lluvia (+${getFareDetails(vehicleType).activeFactors.rainPercent}%)`
                                             : `Tarifa dinámica (+${Math.round((getFareDetails(vehicleType).surgeMultiplier - 1) * 100)}%)`}
                                    </span>
                                </div>
                            )}

                            {/* Scheduled Date Picker */}
                            {isScheduled && (
                                <div className="bg-primary/10 border border-primary/20 rounded-xl p-2.5 flex items-center gap-3">
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

                            {/* Service Categories Carousel Filtered by mainMode */}
                            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none snap-x">
                                {mainMode === 'taxi' && (
                                    <>
                                        {/* 1. Mototaxi */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                vibrate(30);
                                                setSelectedCategory('mototaxi');
                                                setVehicleType('moto');
                                            }}
                                            className={`flex-none w-[105px] snap-start flex flex-col items-center py-2.5 px-2 rounded-2xl border-2 transition-all text-center ${
                                                selectedCategory === 'mototaxi'
                                                    ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/20 scale-[1.02]'
                                                    : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                            }`}
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 shadow-xs">
                                                <Bike className="w-4 h-4 text-amber-500" />
                                            </div>
                                            <span className="text-[11px] font-black text-slate-900 truncate max-w-full">Mototaxi</span>
                                            <span className="text-[9px] text-emerald-600 font-bold">2-3 min</span>
                                            <span className="text-xs font-black text-slate-900 mt-0.5">
                                                ${calculatePrice('moto')}
                                            </span>
                                            {bcvRate > 0 && (
                                                <span className="text-[8px] font-bold text-slate-500 truncate max-w-full px-0.5">
                                                    {(parseFloat(calculatePrice('moto')) * bcvRate).toFixed(0)} Bs
                                                </span>
                                            )}
                                        </button>

                                        {/* 2. Taxi Driver */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                vibrate(30);
                                                setSelectedCategory('taxi_driver');
                                                setVehicleType('carro');
                                            }}
                                            className={`flex-none w-[105px] snap-start flex flex-col items-center py-2.5 px-2 rounded-2xl border-2 transition-all text-center ${
                                                selectedCategory === 'taxi_driver'
                                                    ? 'border-primary bg-primary text-slate-950 shadow-md shadow-primary/30 ring-2 ring-primary/30 scale-[1.03]'
                                                    : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                            }`}
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 shadow-xs">
                                                <Car className="w-4 h-4 text-slate-900" />
                                            </div>
                                            <span className="text-[11px] font-black truncate max-w-full">Taxi Driver</span>
                                            <span className={`text-[9px] font-bold ${selectedCategory === 'taxi_driver' ? 'text-slate-900' : 'text-emerald-600'}`}>3-5 min</span>
                                            <span className="text-xs font-black mt-0.5">
                                                ${calculatePrice('carro')}
                                            </span>
                                            {bcvRate > 0 && (
                                                <span className={`text-[8px] font-bold truncate max-w-full px-0.5 ${selectedCategory === 'taxi_driver' ? 'text-slate-800' : 'text-slate-500'}`}>
                                                    {(parseFloat(calculatePrice('carro')) * bcvRate).toFixed(0)} Bs
                                                </span>
                                            )}
                                        </button>

                                        {/* 3. Carro Confort */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                vibrate(30);
                                                setSelectedCategory('carro_confort');
                                                setVehicleType('ejecutivo');
                                            }}
                                            className={`flex-none w-[105px] snap-start flex flex-col items-center py-2.5 px-2 rounded-2xl border-2 transition-all text-center ${
                                                selectedCategory === 'carro_confort'
                                                    ? 'border-slate-900 bg-slate-900 text-white shadow-md ring-2 ring-slate-900/20 scale-[1.02]'
                                                    : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                            }`}
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 shadow-xs">
                                                <Sparkles className="w-4 h-4 text-amber-500" />
                                            </div>
                                            <span className={`text-[11px] font-black truncate max-w-full ${selectedCategory === 'carro_confort' ? 'text-white' : 'text-slate-900'}`}>Confort A/A</span>
                                            <span className="text-[9px] text-amber-400 font-bold">Premium</span>
                                            <span className={`text-xs font-black mt-0.5 ${selectedCategory === 'carro_confort' ? 'text-white' : 'text-slate-900'}`}>
                                                ${calculatePrice('ejecutivo')}
                                            </span>
                                            {bcvRate > 0 && (
                                                <span className={`text-[8px] font-bold truncate max-w-full px-0.5 ${selectedCategory === 'carro_confort' ? 'text-slate-300' : 'text-slate-500'}`}>
                                                    {(parseFloat(calculatePrice('ejecutivo')) * bcvRate).toFixed(0)} Bs
                                                </span>
                                            )}
                                        </button>
                                    </>
                                )}

                                {mainMode === 'package' && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                vibrate(30);
                                                setSelectedCategory('delivery_envios');
                                                setVehicleType('moto');
                                            }}
                                            className={`flex-1 min-w-[140px] flex items-center gap-3 py-3 px-3.5 rounded-2xl border-2 transition-all text-left ${
                                                vehicleType === 'moto'
                                                    ? 'border-blue-500 bg-blue-50/80 shadow-md ring-2 ring-blue-500/20'
                                                    : 'border-slate-100 bg-slate-50'
                                            }`}
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
                                                <Bike className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-black text-slate-900 truncate">Moto Envíos</p>
                                                <p className="text-[10px] text-slate-500 font-medium truncate">Documentos y paquetes</p>
                                                <p className="text-xs font-black text-blue-700 mt-0.5">
                                                    ${calculatePrice('moto')}
                                                    {bcvRate > 0 && (
                                                        <span className="text-[9px] font-bold text-slate-500 ml-1">
                                                            ({(parseFloat(calculatePrice('moto')) * bcvRate).toFixed(0)} Bs)
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                vibrate(30);
                                                setSelectedCategory('delivery_envios');
                                                setVehicleType('carro');
                                            }}
                                            className={`flex-1 min-w-[140px] flex items-center gap-3 py-3 px-3.5 rounded-2xl border-2 transition-all text-left ${
                                                vehicleType === 'carro'
                                                    ? 'border-blue-500 bg-blue-50/80 shadow-md ring-2 ring-blue-500/20'
                                                    : 'border-slate-100 bg-slate-50'
                                            }`}
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
                                                <Car className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-black text-slate-900 truncate">Auto Envíos</p>
                                                <p className="text-[10px] text-slate-500 font-medium truncate">Cajas o bultos medianos</p>
                                                <p className="text-xs font-black text-blue-700 mt-0.5">
                                                    ${calculatePrice('carro')}
                                                    {bcvRate > 0 && (
                                                        <span className="text-[9px] font-bold text-slate-500 ml-1">
                                                            ({(parseFloat(calculatePrice('carro')) * bcvRate).toFixed(0)} Bs)
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </button>
                                    </>
                                )}

                                {mainMode === 'mandado' && (
                                    <div className="w-full bg-amber-50/90 border-2 border-amber-400 rounded-2xl p-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center font-black shadow-sm shrink-0">
                                                <ShoppingBag className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-xs font-black text-slate-900">Muchacho e' Mandao</h4>
                                                    <span className="text-[9px] font-black uppercase px-2 py-0.2 rounded-full bg-amber-200 text-amber-800">Subasta en vivo</span>
                                                </div>
                                                <p className="text-[10px] text-slate-600 font-medium">Los pilotos cercanos compiten enviándote su mejor propuesta</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-xs font-black text-amber-700">Tú decides</span>
                                            <p className="text-[9px] font-bold text-slate-500">Desde $1</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Category Specific Inputs */}
                            {mainMode === 'mandado' && (
                                <div className="space-y-2 bg-amber-50/80 border border-amber-200 rounded-2xl p-3 animate-in fade-in">
                                    <div className="flex items-start gap-2 text-xs text-amber-900">
                                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-black text-[11px]">⚠️ Cero intermediación de compras</p>
                                            <p className="text-[10px] text-amber-800 leading-snug mt-0.5">
                                                Tú le transfieres directamente al comercio el costo de los productos por Pago Móvil. El conductor nunca financia compras; sólo cobra su tarifa de mandado mediante la subasta.
                                            </p>
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Nombre del negocio o comercio (opcional)"
                                        value={mandadoStoreName}
                                        onChange={(e) => setMandadoStoreName(e.target.value)}
                                        className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-amber-400 placeholder:text-slate-400"
                                    />
                                    <textarea
                                        placeholder="¿Qué necesitas que busquemos o compremos? (Ej: Comprar 2 panes y medicina en Farmatodo ya pagada)..."
                                        value={mandadoDescription}
                                        onChange={(e) => setMandadoDescription(e.target.value)}
                                        rows={2}
                                        className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-amber-400 placeholder:text-slate-400 resize-none"
                                    />
                                </div>
                            )}

                            {mainMode === 'package' && (
                                <div className="space-y-2 bg-blue-50/80 border border-blue-200 rounded-2xl p-3 animate-in fade-in">
                                    <div className="flex items-center gap-2 text-xs text-blue-900">
                                        <Package className="w-4 h-4 text-blue-600 shrink-0" />
                                        <span className="font-black text-[11px]">Descripción del paquete a trasladar:</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Ej: Documentos en sobre, llaves, paquete mediano..."
                                        value={packageDescription}
                                        onChange={(e) => setPackageDescription(e.target.value)}
                                        className="w-full bg-white border border-blue-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-400 placeholder:text-slate-400"
                                    />
                                </div>
                            )}

                            {/* Payment Quick Pill & Note Row */}
                            <div className="flex items-center justify-between gap-2 pt-0.5">
                                <button
                                    onClick={() => {
                                        vibrate(30);
                                        setStep('payment');
                                    }}
                                    className="flex-1 flex items-center justify-between bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-[11px]">
                                            {selectedPaymentMethod === 'cash_usd' ? 'Efectivo Divisas ($)' : selectedPaymentMethod === 'cash_ves' ? 'Efectivo Bs (BCV)' : 'Pago Móvil Conductor'}
                                        </span>
                                    </div>
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                </button>

                                <button
                                    onClick={() => setShowNotesModal(true)}
                                    className={`p-2 rounded-xl border transition-all flex items-center justify-center ${
                                        driverNotes ? 'bg-primary/20 border-primary text-slate-900' : 'bg-slate-100 border-transparent text-slate-600'
                                    }`}
                                    title="Notas para el conductor"
                                >
                                    <FileText className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Big Prominent Yango CTA Button */}
                            <button
                                onClick={handleRequestTaxi}
                                className="w-full py-3.5 bg-[#FFB800] text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <span>
                                    {mainMode === 'mandado'
                                        ? 'Solicitar Mandado • Iniciar Subasta'
                                        : mainMode === 'package'
                                        ? `Pedir Envío • $${calculatePrice(vehicleType)}`
                                        : selectedCategory === 'mototaxi'
                                        ? `Pedir Mototaxi • $${calculatePrice('moto')}`
                                        : selectedCategory === 'carro_confort'
                                        ? `Pedir Confort • $${calculatePrice('ejecutivo')}`
                                        : `Pedir Taxi • $${calculatePrice('carro')}`}
                                </span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* STEP 3: PAYMENT METHOD DETAILS (Cash USD, Cash VES, direct Driver Pago Móvil) */}
                    {!isSheetMinimized && step === 'payment' && (
                        <div className="space-y-3 animate-in fade-in">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                    Método de pago
                                </span>
                                <button
                                    onClick={() => setStep('vehicle')}
                                    className="text-xs font-bold text-primary hover:underline"
                                >
                                    Volver a vehículos
                                </button>
                            </div>

                            <div className="space-y-2">
                                {/* Cash USD */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedPaymentMethod('cash_usd');
                                        setPaymentRef('');
                                    }}
                                    className={`w-full p-3 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${
                                        selectedPaymentMethod === 'cash_usd'
                                            ? 'border-primary bg-primary/10 shadow-xs'
                                            : 'border-slate-100 bg-slate-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-600 font-black text-sm flex items-center justify-center">
                                            $
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-slate-800">Efectivo Divisas ($)</p>
                                            <p className="text-[10px] text-slate-400">Pagas en dólares en efectivo al chofer</p>
                                        </div>
                                    </div>
                                    {selectedPaymentMethod === 'cash_usd' && <Check className="w-4 h-4 text-primary" />}
                                </button>

                                {/* Cash VES */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedPaymentMethod('cash_ves');
                                        setPaymentRef('');
                                    }}
                                    className={`w-full p-3 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${
                                        selectedPaymentMethod === 'cash_ves'
                                            ? 'border-primary bg-primary/10 shadow-xs'
                                            : 'border-slate-100 bg-slate-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-600 font-black text-xs flex items-center justify-center">
                                            Bs
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-slate-800">Efectivo Bolívares (BCV)</p>
                                            <p className="text-[10px] text-slate-400">Pagas en Bs en efectivo a la tasa oficial</p>
                                        </div>
                                    </div>
                                    {selectedPaymentMethod === 'cash_ves' && <Check className="w-4 h-4 text-primary" />}
                                </button>

                                {/* Direct Driver Pago Móvil */}
                                <div
                                    className={`p-3 rounded-2xl border-2 transition-all ${
                                        selectedPaymentMethod === 'pago_movil'
                                            ? 'border-primary bg-primary/10 shadow-xs'
                                            : 'border-slate-100 bg-slate-50'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setSelectedPaymentMethod('pago_movil')}
                                        className="w-full text-left flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-600 font-black text-xs flex items-center justify-center">
                                                PM
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-slate-800">Pago Móvil al Conductor</p>
                                                <p className="text-[10px] text-slate-400">Pagas directo a la cuenta del conductor asignado</p>
                                            </div>
                                        </div>
                                        {selectedPaymentMethod === 'pago_movil' && <Check className="w-4 h-4 text-primary" />}
                                    </button>

                                    {selectedPaymentMethod === 'pago_movil' && (
                                        <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-2 text-xs animate-in fade-in">
                                            <p className="text-[11px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200/70">
                                                💡 Al confirmarse tu conductor, verás sus datos completos de Pago Móvil (Banco, Cédula, Teléfono) y el monto exacto en Bs.
                                            </p>
                                            <input
                                                type="text"
                                                placeholder="Referencia de pago (opcional)"
                                                value={paymentRef}
                                                onChange={(e) => setPaymentRef(e.target.value.replace(/\D/g, ''))}
                                                className="w-full bg-white border border-slate-200 p-2 rounded-xl font-bold text-xs outline-none focus:border-primary"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={() => setStep('vehicle')}
                                className="w-full py-3.5 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-2xl active:scale-95 transition-all shadow-md"
                            >
                                Confirmar método y volver
                            </button>
                        </div>
                    )}
                </div>
            </div>
            )}

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
