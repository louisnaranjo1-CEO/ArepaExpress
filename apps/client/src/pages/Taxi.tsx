import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
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
    DollarSign,
    Star,
    Radio,
    Zap,
    User as UserIcon,
    Building2,
    Link as LinkIcon
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
import SpeedFleetAnimation from '../components/SpeedFleetAnimation';
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
import MandadoRequestModal, { MandadoSubmitData } from '../components/MandadoRequestModal';

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
    photoUrl?: string | null;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    vehiclePlate?: string;
    vehicleColor?: string;
    hasAc?: boolean;
    hasThermalBag?: boolean;
    isComfortEligible?: boolean;
    vehiclePhotoUrl?: string | null;
    rating?: number;
    totalTrips?: number;
    driverFares?: {
        base_fare?: number;
        per_km_fare?: number;
        pricing_type?: 'flat' | 'per_km';
        base_km?: number;
        comfort_base_fare?: number;
        comfort_per_km_fare?: number;
    } | null;
    calculatedPrice?: number;
    availability?: string;
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

const safeUUID = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// 3D Stylized Vehicle Markers (Isometric Perspective with shadows and lighting)
const svg3DMotoIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg width="48" height="48" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="55" rx="36" ry="18" fill="rgba(16,185,129,0.3)"/>
    <ellipse cx="50" cy="55" rx="26" ry="12" fill="rgba(0,0,0,0.35)"/>
    <ellipse cx="50" cy="80" rx="9" ry="15" fill="#0f172a" stroke="#f59e0b" stroke-width="4"/>
    <ellipse cx="50" cy="22" rx="9" ry="15" fill="#0f172a" stroke="#f59e0b" stroke-width="4"/>
    <path d="M43 32 L57 32 L54 68 L46 68 Z" fill="#059669" stroke="#10b981" stroke-width="2"/>
    <rect x="44" y="44" width="12" height="18" rx="4" fill="#047857"/>
    <ellipse cx="50" cy="46" rx="7" ry="10" fill="#f59e0b"/>
    <ellipse cx="50" cy="60" rx="6" ry="8" fill="#1e293b"/>
    <line x1="30" y1="28" x2="70" y2="28" stroke="#f1f5f9" stroke-width="6" stroke-linecap="round"/>
    <circle cx="30" cy="28" r="4" fill="#0f172a"/>
    <circle cx="70" cy="28" r="4" fill="#0f172a"/>
    <circle cx="50" cy="42" r="9" fill="#ffffff" stroke="#0f172a" stroke-width="2.5"/>
    <path d="M44 38 Q50 34 56 38" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round"/>
</svg>
`)}`;

const svg3DTaxiIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg width="48" height="48" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="60" rx="40" ry="20" fill="rgba(0,0,0,0.35)"/>
    <rect x="28" y="20" width="44" height="60" rx="14" fill="#facc15" stroke="#ca8a04" stroke-width="2"/>
    <path d="M34 32 L66 32 L62 44 L38 44 Z" fill="#0284c7" fill-opacity="0.85" stroke="#38bdf8" stroke-width="1.5"/>
    <path d="M38 60 L62 60 L65 70 L35 70 Z" fill="#0284c7" fill-opacity="0.85" stroke="#38bdf8" stroke-width="1.5"/>
    <rect x="36" y="44" width="28" height="16" rx="3" fill="#eab308"/>
    <rect x="42" y="49" width="16" height="6" rx="2" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
    <text x="50" y="54" font-size="5" font-weight="900" text-anchor="middle" fill="#0f172a" font-family="sans-serif">TAXI</text>
    <circle cx="33" cy="22" r="3" fill="#fef08a"/>
    <circle cx="67" cy="22" r="3" fill="#fef08a"/>
    <rect x="30" y="78" width="8" height="3" rx="1" fill="#ef4444"/>
    <rect x="62" y="78" width="8" height="3" rx="1" fill="#ef4444"/>
</svg>
`)}`;

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
    const [isMandadoModalOpen, setIsMandadoModalOpen] = useState(false);
    const [activeService, setActiveService] = useState<any>(null);
    const [isSubmittingMandado, setIsSubmittingMandado] = useState(false);
    const [packageDescription, setPackageDescription] = useState('');
    const [driverNotes, setDriverNotes] = useState('');
    const [showNotesModal, setShowNotesModal] = useState(false);
    // Transporte Rápido (1 Toque)
    const [isQuickTransportModalOpen, setIsQuickTransportModalOpen] = useState(false);
    const [isRequestingQuickTransport, setIsRequestingQuickTransport] = useState(false);

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

    // Payment Selection (Transparent: Default to Pago Móvil al Conductor)
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cash_usd' | 'cash_ves' | 'pago_movil'>('pago_movil');
    const [paymentProof, setPaymentProof] = useState<File | null>(null);
    const [paymentRef, setPaymentRef] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    // Package Delivery 3-Step Guided Flow State
    const [packageStep, setPackageStep] = useState<1 | 2 | 3>(1);
    const [senderName, setSenderName] = useState('');
    const [senderPhone, setSenderPhone] = useState('');
    const [receiverName, setReceiverName] = useState('');
    const [receiverPhone, setReceiverPhone] = useState('');
    const [packageNotes, setPackageNotes] = useState('');
    const [gmapsInputUrl, setGmapsInputUrl] = useState('');
    const [gmapsTarget, setGmapsTarget] = useState<'origin' | 'destination'>('destination');
    const [isParsingGmaps, setIsParsingGmaps] = useState(false);
    const [driverSearchQuery, setDriverSearchQuery] = useState('');

    // Reservation Scheduling
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledDateTime, setScheduledDateTime] = useState('');

    // Guest Modal
    const [showGuestModal, setShowGuestModal] = useState(false);
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestCedulaType, setGuestCedulaType] = useState<'V' | 'E' | 'J'>('V');
    const [guestCedula, setGuestCedula] = useState('');

    // Places Search
    const [searchQuery, setSearchQuery] = useState('');
    const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
    const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

    // Nearby Drivers
    const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
    const [activeDriversCount, setActiveDriversCount] = useState({ moto: 1, carro: 1, ejecutivo: 1 });
    const [selectedDriver, setSelectedDriver] = useState<NearbyDriver | null>(null);
    const [showDriverSelectionModal, setShowDriverSelectionModal] = useState(false);

    // Dynamic commissions synced from Superadmin
    const [liveCommissions, setLiveCommissions] = useState<{
        taxi: number;
        mandao: number;
        confort: number;
        delivery: number;
        mototaxi: number;
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
                console.error("Error fetching live commissions in Taxi:", err);
            }
        };

        fetchCommissions();
    }, []);

    // Driver Public Reviews Modal State
    const [viewingDriverReviews, setViewingDriverReviews] = useState<NearbyDriver | null>(null);
    const [driverReviewsList, setDriverReviewsList] = useState<any[]>([]);
    const [loadingDriverReviews, setLoadingDriverReviews] = useState(false);

    useEffect(() => {
        if (!viewingDriverReviews) return;
        const fetchReviews = async () => {
            setLoadingDriverReviews(true);
            try {
                const [transRes, orderRes] = await Promise.all([
                    supabase
                        .from('transport_requests')
                        .select('id, rating, rating_comment, rating_tags, created_at, user_name')
                        .eq('driver_id', viewingDriverReviews.id)
                        .not('rating', 'is', null)
                        .order('created_at', { ascending: false })
                        .limit(20),
                    supabase
                        .from('orders')
                        .select('id, rating, review_comment, review_tags, created_at, user_name')
                        .eq('delivery_driver_id', viewingDriverReviews.id)
                        .not('rating', 'is', null)
                        .order('created_at', { ascending: false })
                        .limit(20)
                ]);

                const transReviews = (transRes.data || []).map((t: any) => ({
                    id: t.id,
                    rating: Number(t.rating) || 5,
                    rating_comment: t.rating_comment,
                    rating_tags: t.rating_tags,
                    created_at: t.created_at,
                    user_name: t.user_name || 'Cliente Verificado'
                }));

                const orderReviews = (orderRes.data || []).map((o: any) => ({
                    id: o.id,
                    rating: Number(o.rating) || 5,
                    rating_comment: o.review_comment,
                    rating_tags: o.review_tags,
                    created_at: o.created_at,
                    user_name: o.user_name || 'Cliente Delivery'
                }));

                const merged = [...transReviews, ...orderReviews].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );

                setDriverReviewsList(merged);
            } catch (err) {
                console.error("Error fetching driver reviews:", err);
            } finally {
                setLoadingDriverReviews(false);
            }
        };
        fetchReviews();
    }, [viewingDriverReviews]);

    // Bottom Sheet Collapse / Expand State & Drag Handling
    const [isSheetMinimized, setIsSheetMinimized] = useState(false);
    const touchStartYRef = useRef<number | null>(null);

    const [showDemoAlert, setShowDemoAlert] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // Weather & Night Theme State
    const [weather, setWeather] = useState<WeatherInfo | null>(null);
    const [isNight, setIsNight] = useState<boolean>(isNightTime());
    const [testRain, setTestRain] = useState<boolean>(false);

    // Business Sender Recognition
    const isBusinessSender = Boolean(
        userData?.role === 'restaurant' ||
        userData?.role === 'comercio' ||
        userData?.role === 'admin' ||
        (userData as any)?.is_business ||
        (userData as any)?.business_name
    );

    useEffect(() => {
        if (userData || user) {
            if (!senderName) {
                setSenderName(userData?.displayName || userData?.fullName || userData?.full_name || user?.displayName || '');
            }
            if (!senderPhone && userData?.phone) {
                setSenderPhone(userData.phone.replace(/^\+58/, ''));
            }
        }
    }, [userData, user]);

    // Google Maps Link / Coordinates Auto-Resolver for Package Step 2
    const handleResolveGoogleMapsUrl = async () => {
        if (!gmapsInputUrl.trim()) {
            toast.error("Pega un enlace de Google Maps o coordenadas");
            return;
        }
        setIsParsingGmaps(true);
        try {
            const clean = gmapsInputUrl.trim();
            let parsedCoords: { lat: number; lng: number } | null = null;
            let addressLabel = '';

            // Pattern 1: @lat,lng
            const atMatch = clean.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
            if (atMatch) {
                parsedCoords = { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
            }

            // Pattern 2: q=lat,lng or ll=lat,lng or destination=lat,lng
            if (!parsedCoords) {
                const qMatch = clean.match(/[?&](?:q|ll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
                if (qMatch) {
                    parsedCoords = { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
                }
            }

            // Pattern 3: direct "lat, lng" e.g. "10.4806, -66.9036"
            if (!parsedCoords) {
                const directMatch = clean.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
                if (directMatch) {
                    parsedCoords = { lat: parseFloat(directMatch[1]), lng: parseFloat(directMatch[2]) };
                }
            }

            // Pattern 4: Google Maps Protobuf !3d / !4d
            if (!parsedCoords) {
                const protoMatch = clean.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                if (protoMatch) {
                    parsedCoords = { lat: parseFloat(protoMatch[1]), lng: parseFloat(protoMatch[2]) };
                }
            }

            // Pattern 5: Short URL resolver (maps.app.goo.gl, goo.gl/maps, etc.)
            if (!parsedCoords && (clean.includes('goo.gl') || clean.includes('maps') || clean.startsWith('http'))) {
                try {
                    // Try Supabase Edge Function resolver first (works across all browsers and apps without CORS)
                    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('resolve-map-url', {
                        body: { url: clean }
                    });
                    if (!edgeErr && edgeData?.lat && edgeData?.lng) {
                        parsedCoords = { lat: Number(edgeData.lat), lng: Number(edgeData.lng) };
                    }
                } catch (edgeErr) {
                    console.warn("Edge function url resolution warning:", edgeErr);
                }

                // If still not parsed, try Capacitor native HTTP if on device
                if (!parsedCoords && (window as any).Capacitor?.Plugins?.CapacitorHttp) {
                    try {
                        const capRes = await (window as any).Capacitor.Plugins.CapacitorHttp.get({ url: clean });
                        const finalUrl = capRes?.url || '';
                        const mAt = finalUrl.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ||
                                    finalUrl.match(/[?&](?:q|ll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
                        if (mAt) {
                            parsedCoords = { lat: parseFloat(mAt[1]), lng: parseFloat(mAt[2]) };
                        }
                    } catch (capErr) {
                        console.warn("CapacitorHttp fallback error:", capErr);
                    }
                }
            }

            // Geocode using Google Maps Geocoder if coords found to get real address name, OR geocode address directly
            if (window.google?.maps?.Geocoder) {
                const geocoder = new window.google.maps.Geocoder();
                if (parsedCoords) {
                    try {
                        const rev = await geocoder.geocode({ location: parsedCoords });
                        if (rev.results && rev.results[0]) {
                            addressLabel = rev.results[0].formatted_address;
                        }
                    } catch (geoErr) {
                        console.warn("Reverse geocode warning:", geoErr);
                    }
                } else if (!clean.startsWith('http')) {
                    const fwd = await geocoder.geocode({ address: clean });
                    if (fwd.results && fwd.results[0]) {
                        const loc = fwd.results[0].geometry.location;
                        parsedCoords = { lat: loc.lat(), lng: loc.lng() };
                        addressLabel = fwd.results[0].formatted_address;
                    }
                }
            }

            if (!parsedCoords) {
                toast.error("No se pudieron extraer las coordenadas del enlace. Verifica el link o escribe la dirección.");
                return;
            }

            const targetLoc: Location = {
                lat: parsedCoords.lat,
                lng: parsedCoords.lng,
                address: addressLabel || `${parsedCoords.lat.toFixed(5)}, ${parsedCoords.lng.toFixed(5)}`
            };

            if (gmapsTarget === 'origin') {
                setOrigin(targetLoc);
                toast.success("Punto de retiro (Origen) actualizado con éxito", { icon: '📍' });
            } else {
                setDestination(targetLoc);
                toast.success("Punto de entrega (Destino) actualizado con éxito", { icon: '🎯' });
            }
            setGmapsInputUrl('');
        } catch (err: any) {
            console.error("Error resolving Google Maps URL:", err);
            toast.error("Error al procesar el enlace. Intenta escribiendo el nombre del sitio.");
        } finally {
            setIsParsingGmaps(false);
        }
    };

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
        const uid = user?.id || user?.uid;
        const activeLocalId = localStorage.getItem('active_transport_req_id');

        const isValidUUID = (str: string | null | undefined): boolean => {
            if (!str) return false;
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
        };

        const checkActive = async () => {
            try {
                let query = supabase
                    .from('transport_requests')
                    .select('*')
                    .in('status', ['searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress'])
                    .order('created_at', { ascending: false })
                    .limit(5);

                const validUid = isValidUUID(uid) ? uid : null;
                const validLocalId = isValidUUID(activeLocalId) ? activeLocalId : null;

                if (validUid && validLocalId && validUid !== validLocalId) {
                    query = query.or(`user_id.eq.${validUid},id.eq.${validLocalId}`);
                } else if (validUid) {
                    query = query.eq('user_id', validUid);
                } else if (validLocalId) {
                    query = query.eq('id', validLocalId);
                } else {
                    setActiveService(null);
                    return;
                }

                const { data: reqs } = await query;

                if (reqs && reqs.length > 0) {
                    const activeReq = reqs[0];
                    setActiveService(activeReq);
                    if (['accepted', 'arriving', 'in_progress'].includes(activeReq.status)) {
                        navigate(`/taxi/track/${activeReq.id}`);
                    }
                } else {
                    setActiveService(null);
                }
            } catch (e) {
                console.error("Active taxi check error:", e);
            }
        };

        checkActive();

        const channel = supabase.channel('taxi_page_active_sub')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, () => {
                checkActive();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, navigate]);

    // 0.3 Realtime Driver Bids for Muchacho e' Mandao
    useEffect(() => {
        if (!activeMandadoReqId) return;

        const fetchBids = async () => {
            const { data } = await supabase
                .from('transport_bids')
                .select('*')
                .eq('transport_request_id', activeMandadoReqId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            if (data) setMandadoBids(data);
        };

        fetchBids();

        const channel = supabase.channel(`taxi_page_bids_${activeMandadoReqId}`)
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
            const { data: driversData, error: dErr } = await supabase
                .from('drivers')
                .select('id, full_name, vehicle_type, vehicle_brand, vehicle_model, vehicle_year, vehicle_color, vehicle_plate, current_location, availability, is_online, driver_fares, rating, total_trips, is_comfort_eligible, has_ac, has_thermal_bag, documents, vehicle_image_url')
                .eq('is_online', true);

            if (dErr) {
                console.error("fetchNearbyDrivers Supabase error:", dErr);
            }

            const validDrivers: NearbyDriver[] = [];
            const counts = { moto: 0, carro: 0, ejecutivo: 0 };

            (driversData || []).forEach((d: any) => {
                const loc = d.current_location;
                if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number' && !isNaN(loc.lat) && !isNaN(loc.lng)) {
                    const distMeters = calculateDistance(pickupCoords.lat, pickupCoords.lng, loc.lat, loc.lng);
                    const distKm = Number((distMeters / 1000).toFixed(1));
                    if (distKm <= 35) {
                        const rawType = (d.vehicle_type || 'carro').toLowerCase();
                        const vType = rawType.includes('moto') ? 'moto' : 'carro';
                        const isComfort = Boolean(d.is_comfort_eligible) || (vType === 'carro' && Boolean(d.has_ac) && Number(d.vehicle_year) >= 2009);
                        const eta = Math.max(2, Math.ceil(distKm * 3));
                        const photo = d.documents?.selfieUrl || d.photo_url || null;
                        const vehiclePhoto = d.vehicle_image_url || d.documents?.vehicleUrl || null;
                        const brand = d.vehicle_brand || '';
                        const model = d.vehicle_model || (vType === 'moto' ? 'Motocicleta' : 'Automóvil');
                        const fullVehicleModel = [brand, model].filter(Boolean).join(' ');

                        validDrivers.push({
                            id: d.id,
                            fullName: d.full_name || 'Conductor',
                            vehicleType: vType,
                            lat: loc.lat,
                            lng: loc.lng,
                            distanceKm: distKm,
                            etaMinutes: eta,
                            photoUrl: photo,
                            vehicleBrand: brand,
                            vehicleModel: fullVehicleModel,
                            vehicleYear: d.vehicle_year || '',
                            vehiclePlate: d.vehicle_plate || 'S/P',
                            vehicleColor: d.vehicle_color || '',
                            hasAc: Boolean(d.has_ac),
                            hasThermalBag: Boolean(d.has_thermal_bag),
                            isComfortEligible: isComfort,
                            vehiclePhotoUrl: vehiclePhoto,
                            rating: d.rating ? Number(d.rating) : 5.0,
                            totalTrips: d.total_trips || 0,
                            driverFares: d.driver_fares || null,
                            availability: d.availability || 'active'
                        });
                        counts[vType]++;
                        if (isComfort) {
                            counts.ejecutivo++;
                        }
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
                minZoom: 12,
                maxZoom: 19,
                restriction: {
                    latLngBounds: {
                        north: 9.3500,
                        south: 8.6000,
                        east: -67.0500,
                        west: -67.8500
                    },
                    strictBounds: false
                },
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

        // Nearby Drivers Markers with Stylized 3D Isometric Design
        driverMarkersRef.current.forEach(m => m.setMap(null));
        driverMarkersRef.current = nearbyDrivers.map(d => {
            const isMoto = d.vehicleType === 'moto';
            return new window.google.maps.Marker({
                position: { lat: d.lat, lng: d.lng },
                map,
                title: `${d.fullName} (${d.vehicleType === 'moto' ? 'Moto' : 'Taxi'}) - ${d.etaMinutes} min`,
                icon: {
                    url: isMoto ? svg3DMotoIcon : svg3DTaxiIcon,
                    scaledSize: new window.google.maps.Size(46, 46),
                    anchor: new window.google.maps.Point(23, 23)
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

    // 7. Autocomplete Search Handler strictly restricted to the active city (Calabozo)
    const handleSearchChange = async (val: string) => {
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

        // Strict boundary: ~15km radius box around user location in Calabozo / active city
        const latDelta = 0.14;
        const lngDelta = 0.14;
        const cityBounds = new window.google.maps.LatLngBounds(
            new window.google.maps.LatLng(center.lat - latDelta, center.lng - lngDelta),
            new window.google.maps.LatLng(center.lat + latDelta, center.lng + lngDelta)
        );

        // Fetch local businesses matching the query from Supabase to prioritize them
        let localComerciosPredictions: any[] = [];
        try {
            const { data: stores } = await supabase
                .from('comercios')
                .select('id, name, address, lat, lng')
                .ilike('name', `%${val.trim()}%`)
                .limit(4);
            if (stores && stores.length > 0) {
                localComerciosPredictions = stores.map((store: any) => ({
                    description: `${store.name} - ${store.address || 'Calabozo'}`,
                    place_id: `comercio_${store.id}`,
                    structured_formatting: {
                        main_text: `🏪 ${store.name}`,
                        secondary_text: store.address || 'Comercio Local Registrado'
                    },
                    is_local_store: true,
                    store_coords: store.lat && store.lng ? { lat: Number(store.lat), lng: Number(store.lng) } : null
                }));
            }
        } catch (_) {}

        autocompleteServiceRef.current.getPlacePredictions(
            {
                input: val,
                componentRestrictions: { country: 've' },
                locationRestriction: cityBounds, // STRICT: No results outside the city allowed!
                origin: new window.google.maps.LatLng(center.lat, center.lng)
            },
            (results, status) => {
                setIsSearchingPlaces(false);
                const googleResults = (status === window.google.maps.places.PlacesServiceStatus.OK && results) ? results : [];
                setPredictions([...localComerciosPredictions, ...googleResults]);
            }
        );
    };

    // 8. Select Autocomplete Prediction
    const handleSelectPrediction = (p: any) => {
        vibrate(30);
        setSearchQuery(p.structured_formatting?.main_text || p.description);
        setPredictions([]);

        // Direct select for verified local businesses
        if (p.is_local_store && p.store_coords) {
            const destLoc = {
                lat: p.store_coords.lat,
                lng: p.store_coords.lng,
                address: p.description
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
            return;
        }

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

    // Helper to calculate specific driver trip price based on their configured driver_fares
    const calculateDriverTripPrice = useCallback((driver: NearbyDriver, tripDistanceKm?: number, isComfortCategory = false): number => {
        const dist = tripDistanceKm !== undefined ? tripDistanceKm : (routeInfo ? routeInfo.distance : 1);
        const fares = driver.driverFares;
        const isComfort = isComfortCategory || Boolean(driver.isComfortEligible) || (driver.hasAc && Number(driver.vehicleYear) >= 2009);
        const isNight = isNightTime();

        if (fares) {
            let base: number;
            let baseKm: number;
            let perKm: number;

            if (isComfort && (Number(fares.comfort_base_fare_day) >= 0.50 || Number(fares.comfort_base_fare) >= 0.50)) {
                if (isNight) {
                    base = Number(fares.comfort_base_fare_night ?? fares.comfort_base_fare ?? 3.0);
                    baseKm = Math.min(6, Math.max(1, Number(fares.comfort_base_distance_night ?? fares.base_distance_night ?? fares.base_km ?? 2)));
                    perKm = Number(fares.comfort_extra_km_price_night ?? fares.comfort_per_km_fare ?? 1.2);
                } else {
                    base = Number(fares.comfort_base_fare_day ?? fares.comfort_base_fare ?? 2.5);
                    baseKm = Math.min(6, Math.max(1, Number(fares.comfort_base_distance_day ?? fares.base_distance_day ?? fares.base_km ?? 2)));
                    perKm = Number(fares.comfort_extra_km_price_day ?? fares.comfort_per_km_fare ?? 1.0);
                }
            } else {
                if (isNight) {
                    base = Number(fares.base_fare_night ?? (Number(fares.base_fare_day ?? fares.base_fare ?? 1.5) * 1.25));
                    baseKm = Math.min(6, Math.max(1, Number(fares.base_distance_night ?? fares.base_distance_day ?? fares.base_km ?? 2)));
                    perKm = Number(fares.extra_km_price_night ?? (Number(fares.extra_km_price_day ?? fares.per_km_fare ?? 0.20) * 1.35));
                } else {
                    base = Number(fares.base_fare_day ?? fares.base_fare ?? 1.5);
                    baseKm = Math.min(6, Math.max(1, Number(fares.base_distance_day ?? fares.base_km ?? 2)));
                    perKm = Number(fares.extra_km_price_day ?? fares.per_km_fare ?? 0.20);
                }
            }

            if (base >= 0.50) {
                const extraKm = Math.max(0, dist - baseKm);
                const total = base + (extraKm * perKm);
                return Math.max(0.50, Number(total.toFixed(2)));
            }
        }

        return parseFloat(calculatePrice(isComfort ? 'ejecutivo' : driver.vehicleType));
    }, [routeInfo, adminRates, activeDriversCount, weather, testRain]);

    // Dynamic price calculation: Refleja tarifa mínima del chofer más económico disponible o 'Ocupados'
    const getCategoryPriceRange = useCallback((cat: 'moto' | 'carro' | 'ejecutivo') => {
        const tripDist = routeInfo ? routeInfo.distance : 1;
        const matchingDrivers = nearbyDrivers.filter(d => {
            const isAvailable = (d as any).availability === 'active' || (d as any).availability === undefined;
            if (!isAvailable) return false;
            if (cat === 'moto') return d.vehicleType === 'moto';
            if (cat === 'ejecutivo') return d.vehicleType === 'carro' && (d.isComfortEligible || (d.hasAc && Number(d.vehicleYear) >= 2009));
            return d.vehicleType === 'carro';
        });

        if (matchingDrivers.length === 0) {
            return {
                text: 'Ocupados',
                isBusy: true,
                hasRange: false,
                min: 0,
                max: 0,
                driversCount: 0
            };
        }
        const prices = matchingDrivers.map(d => calculateDriverTripPrice(d, tripDist, cat === 'ejecutivo'));
        const minPrice = Math.min(...prices);
        return {
            text: `$${minPrice.toFixed(2)}`,
            isBusy: false,
            hasRange: false,
            min: minPrice,
            max: minPrice,
            driversCount: matchingDrivers.length
        };
    }, [nearbyDrivers, routeInfo, calculateDriverTripPrice]);

    // Aceptar puja de conductor para Muchacho e' Mandado
    const handleAcceptMandadoBid = async (bid: any) => {
        try {
            const reqId = bid.transport_request_id || bid.request_id;
            const finalPrice = Number(bid.amount || bid.offered_price || 0);

            // Obtener datos del conductor de la tabla drivers
            const { data: driverData } = await supabase
                .from('drivers')
                .select('*')
                .eq('id', bid.driver_id)
                .maybeSingle();

            const realPhoto = bid.driver_photo || driverData?.documents?.selfieUrl || null;
            const paymentMobile = driverData?.payment_mobile || bid.driver_payment_info || null;

            // 1. Aceptar puja seleccionada
            await supabase.from('transport_bids').update({ status: 'accepted' }).eq('id', bid.id);
            // 2. Rechazar otras pujas de esta solicitud
            await supabase.from('transport_bids').update({ status: 'rejected' })
                .eq('transport_request_id', reqId)
                .neq('id', bid.id);
            // 3. Asignar conductor al viaje
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
                price: finalPrice,
                total: finalPrice,
                commission_amount: 0.70
            }).eq('id', reqId);

            if (updErr) {
                console.error("Error al actualizar transport_requests:", updErr);
                throw updErr;
            }

            toast.success(`¡Oferta de ${bid.driver_name} aceptada!`);
            navigate(`/taxi/track/${reqId}`);
        } catch (err: any) {
            console.error("Error accepting bid:", err);
            toast.error(err?.message || "Error al aceptar la oferta.");
        }
    };

    // Publicar solicitud de Muchacho e' Mandado desde el modal en pasos
    const handleSubmitMandadoRequest = async (data: MandadoSubmitData) => {
        setIsSubmittingMandado(true);
        try {
            const validUserId = user?.id || user?.uid || null;
            let audioUrl = '';
            let referenceUrl = '';

            // 1. Subir audio si existe a Supabase Storage (con timeout preventivo de 3s)
            if (data.audioBlob) {
                try {
                    const audioPath = `mandados/audios/${validUserId || 'guest'}_${Date.now()}.webm`;
                    const uploadPromise = supabase.storage.from('store_assets').upload(audioPath, data.audioBlob, {
                        contentType: 'audio/webm',
                        upsert: true
                    });
                    const timeoutPromise = new Promise<any>((res) => setTimeout(() => res({ error: 'timeout' }), 3000));
                    const res = await Promise.race([uploadPromise, timeoutPromise]);
                    if (!res?.error) {
                        const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(audioPath);
                        audioUrl = publicUrl;
                    }
                } catch (e) {
                    console.warn("Storage audio upload skipped on error/timeout:", e);
                }
            }

            // 2. Subir imagen de referencia si existe (con timeout preventivo de 3s)
            if (data.referenceFile) {
                try {
                    const ext = data.referenceFile.name.split('.').pop() || 'jpg';
                    const refPath = `mandados/references/${validUserId || 'guest'}_${Date.now()}.${ext}`;
                    const uploadPromise = supabase.storage.from('store_assets').upload(refPath, data.referenceFile, {
                        contentType: data.referenceFile.type || 'image/jpeg',
                        upsert: true
                    });
                    const timeoutPromise = new Promise<any>((res) => setTimeout(() => res({ error: 'timeout' }), 3000));
                    const res = await Promise.race([uploadPromise, timeoutPromise]);
                    if (!res?.error) {
                        const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(refPath);
                        referenceUrl = publicUrl;
                    }
                } catch (e) {
                    console.warn("Storage reference upload skipped on error/timeout:", e);
                }
            }

            // 3. Crear solicitud con estado searching
            const isValidUUID = (str: string | null | undefined): boolean => {
                if (!str) return false;
                return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
            };

            const effectiveCoords = userLocation || getInitialMapCoordinates(userData?.addresses);
            const newReqId = safeUUID();
            const orderData: any = {
                id: newReqId,
                user_id: isValidUUID(validUserId) ? validUserId : null,
                user_name: userData?.displayName || user?.displayName || user?.email || guestName || 'Usuario Invitado',
                user_phone: userData?.phone || guestPhone || 'Sin número',
                user_cedula: userData?.cedula || (guestCedula ? `${guestCedulaType}-${guestCedula}` : 'N/A'),
                origin: { 
                    lat: effectiveCoords.lat, 
                    lng: effectiveCoords.lng, 
                    address: data.storeName 
                        ? `Comercio: ${data.storeName}${data.storeAddresses ? ` (${data.storeAddresses})` : ''}` 
                        : (data.hasExactStores ? 'Lugares de compra definidos' : 'Sugerencia de lugares por piloto')
                },
                destination: {
                    lat: data.destinationCoords?.lat || effectiveCoords.lat,
                    lng: data.destinationCoords?.lng || effectiveCoords.lng,
                    address: data.destinationAddress || 'Mi ubicación actual (GPS)'
                },
                service_category: 'muchacho_mandado',
                type: 'muchacho_mandado',
                vehicle_type: 'moto',
                total: 1.00,
                price: 1.00,
                commission_amount: liveCommissions.mandao,
                status: 'searching',
                payment_method: 'pago_movil',
                mandado_details: {
                    description: data.description,
                    storeName: data.storeName,
                    hasExactStores: data.hasExactStores,
                    storeAddresses: data.storeAddresses,
                    transportPassenger: data.transportPassenger,
                    passengerRouteDescription: data.passengerRouteDescription,
                    deliveryOption: data.deliveryOption,
                    audioUrl: audioUrl || null,
                    referenceUrl: referenceUrl || null
                },
                notes: data.description,
                audio_url: audioUrl || null,
                reference_url: referenceUrl || null,
                created_at: new Date().toISOString()
            };

            const { error: insErr } = await supabase.from('transport_requests').insert(orderData);
            if (insErr) {
                console.error("Supabase insert error:", insErr);
                throw insErr;
            }

            setMandadoDescription(data.description);
            setMandadoStoreName(data.storeName || (data.hasExactStores ? 'Comercios definidos' : 'Lugares a sugerir'));
            setActiveMandadoReqId(newReqId);
            localStorage.setItem('active_transport_req_id', newReqId);
            setSelectedCategory('muchacho_mandado');
            setIsMandadoModalOpen(false);
            setStep('searching');
            toast.success("¡Mandado publicado! Escaneando ofertas de pilotos en tiempo real...", { icon: '🛍️', duration: 4000 });
        } catch (error: any) {
            console.error("Error creating mandado request:", error);
            toast.error(error?.message || "No se pudo publicar el mandado. Revisa tu conexión.");
        } finally {
            setIsSubmittingMandado(false);
        }
    };

    // 10. Request Ride Handler (Strict snake_case, UUID safety & 5-category logic)
    const handleRequestTaxi = async () => {
        // Prevent request if user has an active disputed payment
        const rawUid = user?.id || (user as any)?.uid;
        if (rawUid) {
            try {
                const { data: disputedRides } = await supabase
                    .from('transport_requests')
                    .select('id, payment_status, price')
                    .eq('user_id', rawUid)
                    .eq('payment_status', 'disputed')
                    .limit(1);

                if (disputedRides && disputedRides.length > 0) {
                    toast.error("⚠️ Tu cuenta tiene un viaje anterior con pago en disputa. Resuelve el pago pendiente antes de solicitar otro servicio.", { duration: 6000 });
                    navigate(`/taxi/track/${disputedRides[0].id}`);
                    return;
                }
            } catch (err) {
                console.warn("Dispute check warning:", err);
            }
        }

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

        // Determine price, vehicle type and commission dynamically from liveCommissions
        let clientTotal = '1.00';
        let commAmount = liveCommissions.taxi;
        let vType: 'moto' | 'carro' | 'ejecutivo' = 'carro';

        if (selectedCategory === 'mototaxi') {
            vType = 'moto';
            commAmount = liveCommissions.mototaxi;
            clientTotal = calculatePrice('moto');
        } else if (selectedCategory === 'taxi_driver') {
            vType = 'carro';
            commAmount = liveCommissions.taxi;
            clientTotal = calculatePrice('carro');
        } else if (selectedCategory === 'carro_confort') {
            vType = 'ejecutivo';
            commAmount = liveCommissions.confort;
            clientTotal = calculatePrice('ejecutivo');
        } else if (selectedCategory === 'delivery_envios') {
            vType = vehicleType;
            commAmount = vehicleType === 'moto' ? liveCommissions.delivery : (vehicleType === 'ejecutivo' ? liveCommissions.confort : liveCommissions.taxi);
            clientTotal = calculatePrice(vehicleType);
        } else if (selectedCategory === 'muchacho_mandado') {
            vType = 'moto';
            commAmount = liveCommissions.mandao;
            clientTotal = '1.00'; // Base minimum, final price is defined by accepted driver bid
        }

        const numTotal = parseFloat(clientTotal);
        const finalTripPrice = selectedDriver ? calculateDriverTripPrice(selectedDriver) : numTotal;

        // Calculate commission accurately: Base + (Extra km amount * % Extra Commission)
        let finalCommAmount = commAmount;
        if (selectedDriver) {
            const df = selectedDriver.driverFares;
            const dist = routeInfo ? routeInfo.distance : 1;
            const isNight = isNightTime();
            const isComfort = selectedCategory === 'carro_confort' || Boolean(selectedDriver.isComfortEligible);

            let baseKm = 2;
            let perKm = 0.20;
            if (df) {
                if (isComfort && (df.comfort_base_fare_day || df.comfort_base_fare)) {
                    baseKm = Math.min(6, Math.max(1, Number((isNight ? df.comfort_base_distance_night : df.comfort_base_distance_day) ?? df.base_km ?? 2)));
                    perKm = Number((isNight ? df.comfort_extra_km_price_night : df.comfort_extra_km_price_day) ?? df.comfort_per_km_fare ?? 1.0);
                } else {
                    baseKm = Math.min(6, Math.max(1, Number((isNight ? df.base_distance_night : df.base_distance_day) ?? df.base_km ?? 2)));
                    perKm = Number((isNight ? df.extra_km_price_night : df.extra_km_price_day) ?? df.per_km_fare ?? 0.20);
                }
            }
            const extraKm = Math.max(0, dist - baseKm);
            const extraAmount = extraKm * perKm;
            const extraPct = liveCommissions.extra_km_commission_pct ?? 30;
            const extraComm = extraAmount * (extraPct / 100);
            finalCommAmount = parseFloat((commAmount + extraComm).toFixed(2));
        }

        const driverPayoutVal = Math.max(0, parseFloat((finalTripPrice - finalCommAmount).toFixed(2)));

        try {
            setIsUploading(true);
            vibrate(50);

            // Valid user_id: MUST be null if guest, because Postgres user_id is a UUID!
            const validUserId = user?.id || user?.uid || null;
            const newReqId = safeUUID();

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
                user_phone: userData?.phone || (guestPhone ? `+58${guestPhone}` : 'Sin número'),
                user_cedula: userData?.cedula || (guestCedula ? `${guestCedulaType}-${guestCedula}` : 'N/A'),
                origin,
                destination,
                route: routeInfo,
                total: finalTripPrice,
                price: finalTripPrice,
                driver_id: selectedDriver ? selectedDriver.id : null,
                assigned_driver_id: selectedDriver ? selectedDriver.id : null,
                service_category: selectedCategory,
                vehicle_type: vType,
                driver_payout: driverPayoutVal,
                commission_amount: finalCommAmount,
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
                orderData.package_description = packageNotes || packageDescription || 'Envío de encomienda';
                const sName = senderName || orderData.user_name;
                const sPhone = senderPhone ? (senderPhone.startsWith('+58') ? senderPhone : `+58${senderPhone}`) : orderData.user_phone;
                const rName = receiverName || 'Destinatario por coordinar';
                const rPhone = receiverPhone ? (receiverPhone.startsWith('+58') ? receiverPhone : `+58${receiverPhone}`) : '';

                orderData.sender_name = sName;
                orderData.sender_phone = sPhone;
                orderData.receiver_name = rName;
                orderData.receiver_phone = rPhone;

                orderData.mandado_details = {
                    sender_name: sName,
                    sender_phone: sPhone,
                    receiver_name: rName,
                    receiver_phone: rPhone,
                    is_business: isBusinessSender,
                    package_notes: packageNotes || packageDescription || '',
                    google_maps_link: gmapsInputUrl || null,
                    vehicle_category: vehicleType === 'moto' ? 'Moto Envíos' : vehicleType === 'ejecutivo' ? 'Confort A/A' : 'Auto Económico',
                    vehicle_type: vType
                };
                if (selectedDriver) {
                    orderData.preferred_driver_id = selectedDriver.id;
                    orderData.preferred_driver_assigned_at = new Date().toISOString();
                }
            } else {
                orderData.type = 'transport';
            }

            const { error: insErr } = await supabase.from('transport_requests').insert(orderData);
            if (insErr) {
                console.error("Supabase transport_requests insert error:", insErr);
                throw insErr;
            }

            localStorage.setItem('active_transport_req_id', newReqId);
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

    // Función: Transporte Rápido (Solicitud en un toque) - 3 Categorías
    const handleQuickTransport = async (vehicle: 'moto' | 'carro' | 'confort') => {
        if (isRequestingQuickTransport) return;
        setIsRequestingQuickTransport(true);
        vibrate(40);

        try {
            // 1. Detección automática de ubicación GPS instantánea
            let coords: { lat: number; lng: number } | null = userLocation || (origin ? { lat: origin.lat, lng: origin.lng } : null);

            if (!coords && Capacitor.isNativePlatform()) {
                try {
                    const pos = await Geolocation.getCurrentPosition({
                        enableHighAccuracy: true,
                        timeout: 3000,
                        maximumAge: 15000
                    });
                    if (pos?.coords?.latitude && pos?.coords?.longitude) {
                        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    }
                } catch (e) {
                    console.warn("Capacitor quick GPS failed, falling back:", e);
                }
            }

            if (!coords && typeof navigator !== 'undefined' && navigator.geolocation) {
                coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        () => resolve(null),
                        { enableHighAccuracy: false, timeout: 2500, maximumAge: 30000 }
                    );
                });
            }

            if (!coords) {
                const initialMapCenter = getInitialMapCoordinates(userData?.addresses);
                coords = initialMapCenter || defaultCenter || { lat: 8.9326, lng: -67.4264 };
            }

            const isValidUUID = (str: string | null | undefined): boolean => {
                if (!str) return false;
                return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
            };

            const rawUserId = user?.id || user?.uid || null;
            const validUserId = isValidUUID(rawUserId) ? rawUserId : null;
            const newReqId = safeUUID();

            let basePrice = 0.50;
            let commAmount = liveCommissions.mototaxi || 0.25;
            let vType: 'moto' | 'carro' | 'ejecutivo' = 'moto';
            let serviceCat = 'mototaxi';
            let categoryLabel = 'Mototaxi';

            if (vehicle === 'carro') {
                basePrice = 1.50;
                commAmount = liveCommissions.taxi || 0.80;
                vType = 'carro';
                serviceCat = 'taxi_driver';
                categoryLabel = 'Carro Económico';
            } else if (vehicle === 'confort') {
                basePrice = 2.50;
                commAmount = liveCommissions.confort || 1.00;
                vType = 'ejecutivo';
                serviceCat = 'carro_confort';
                categoryLabel = 'Carro Confort';
            }

            const driverPayoutVal = Math.max(0, basePrice - commAmount);

            // 2. Alerta abierta (Radar masivo inmediato a todas las unidades de la zona)
            const orderData: any = {
                id: newReqId,
                user_id: validUserId,
                user_name: userData?.displayName || user?.displayName || user?.email || guestName || 'Cliente Express',
                user_phone: userData?.phone || (user as any)?.phoneNumber || (guestPhone ? `+58${guestPhone}` : 'Sin número'),
                user_cedula: userData?.cedula || (guestCedula ? `${guestCedulaType}-${guestCedula}` : 'N/A'),
                origin: {
                    lat: coords.lat,
                    lng: coords.lng,
                    address: origin?.address || 'Ubicación actual GPS (1 toque)'
                },
                destination: {
                    lat: coords.lat,
                    lng: coords.lng,
                    address: 'Destino a convenir con el conductor'
                },
                route: {
                    distance: 1,
                    duration: 'Inmediato'
                },
                total: basePrice,
                price: basePrice,
                driver_id: null,
                assigned_driver_id: null, // Radar abierto para todas las unidades cercanas
                service_category: serviceCat,
                vehicle_type: vType,
                type: 'transport',
                driver_payout: driverPayoutVal,
                commission_amount: commAmount,
                commission_debited: false,
                status: 'searching',
                payment_method: 'pago_movil',
                payment_status: 'pending',
                cash_currency: 'VES',
                payment_ref: '',
                payment_proof_url: null,
                scheduled: false,
                scheduled_at: null,
                notes: `⚡ Transporte Rápido: ${categoryLabel} (A partir de $${basePrice.toFixed(2)})`,
                created_at: new Date().toISOString()
            };

            const { error: insErr } = await supabase.from('transport_requests').insert(orderData);
            if (insErr) {
                console.error("Error creating quick transport request:", insErr);
                throw insErr;
            }

            localStorage.setItem('active_transport_req_id', newReqId);
            setIsQuickTransportModalOpen(false);
            toast.success(
                `¡Buscando ${categoryLabel} en el radar cercano!`,
                { icon: '⚡', duration: 4000 }
            );

            navigate(`/taxi/track/${newReqId}`);
        } catch (err: any) {
            console.error("Error en Transporte Rápido:", err);
            toast.error(err?.message || "No se pudo iniciar el Transporte Rápido. Revisa tu GPS o conexión.");
        } finally {
            setIsRequestingQuickTransport(false);
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
                                localStorage.removeItem('active_transport_req_id');
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
                                                    onError={(e: any) => {
                                                        e.currentTarget.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80';
                                                    }}
                                                />
                                                <div className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 text-[9px] font-black px-1 rounded-md">
                                                    ★ {Number(bid.driver_rating || 5.0).toFixed(1)}
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-white truncate">{bid.driver_name || 'Conductor asignado'}</p>
                                                <div className="text-[11px] text-slate-300 font-bold flex items-center flex-wrap gap-1.5 mt-0.5">
                                                    <span className="capitalize text-amber-400">
                                                        {bid.vehicle_brand || bid.vehicle_type || 'Vehículo'} {bid.vehicle_model || ''}
                                                    </span>
                                                    {bid.vehicle_year && <span className="text-slate-400 text-[10px]">({bid.vehicle_year})</span>}
                                                    {bid.vehicle_color && <span className="text-slate-400 text-[10px]">Color {bid.vehicle_color}</span>}
                                                    {bid.vehicle_plate && (
                                                        <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-300 border border-slate-700">
                                                            {bid.vehicle_plate}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    {bid.has_ac && (
                                                        <span className="bg-cyan-500/20 text-cyan-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-cyan-500/30">
                                                            ❄️ A/A
                                                        </span>
                                                    )}
                                                    {bid.has_thermal_bag && (
                                                        <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-emerald-500/30">
                                                            🎒 Bolso Térmico
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-black text-emerald-400">
                                                        Llega en ~{bid.eta_minutes || 15} min
                                                    </span>
                                                </div>
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
                                localStorage.removeItem('active_transport_req_id');
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
                        onClick={async () => {
                            const activeId = localStorage.getItem('active_transport_req_id');
                            if (activeId) {
                                await supabase.from('transport_requests').update({ status: 'cancelled' }).eq('id', activeId);
                                localStorage.removeItem('active_transport_req_id');
                            }
                            setStep('vehicle');
                        }}
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
                <div className="absolute inset-0 z-40 bg-slate-950/65 backdrop-blur-[10px] flex flex-col justify-between pt-1.5 px-3.5 pb-20 sm:pb-24 overflow-hidden animate-in fade-in duration-200 select-none">
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

                    {/* Active Service Notification / Quick Return Card */}
                    {activeService && (
                        <div className="relative z-10 w-full max-w-md mx-auto mt-2 p-3 bg-gradient-to-r from-amber-500 to-yellow-400 rounded-2xl shadow-xl border border-yellow-200 text-slate-950 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-slate-950 text-amber-400 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                                    <Radio className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
                                        <p className="text-xs font-black uppercase tracking-wider">
                                            {activeService.status === 'searching' ? 'Solicitud Activa' : '¡Viaje en Progreso!'}
                                        </p>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-900 truncate">
                                        {activeService.destination_name || activeService.package_description || 'Servicio de Movilidad'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {activeService.status === 'searching' && (
                                    <button
                                        type="button"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            await supabase.from('transport_requests').update({ status: 'cancelled' }).eq('id', activeService.id);
                                            await supabase.from('transport_bids').delete().eq('transport_request_id', activeService.id);
                                            localStorage.removeItem('active_transport_req_id');
                                            setActiveService(null);
                                            toast.success('Solicitud cancelada');
                                        }}
                                        className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] uppercase rounded-xl shadow-sm transition-all"
                                    >
                                        Cancelar
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (activeService.status === 'searching' && (activeService.service_category === 'muchacho_mandado' || activeService.type === 'muchacho_mandado')) {
                                            setActiveMandadoReqId(activeService.id);
                                            setMandadoDescription(activeService.package_description || '');
                                            setStep('searching');
                                        } else {
                                            navigate(`/taxi/track/${activeService.id}`);
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-amber-400 font-black text-[10px] uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center gap-1"
                                >
                                    <span>Ver Viaje</span>
                                    <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Main Options Cards - Minimalist, Compact & Vibrant Yellow with Black Letters */}
                    <div className="relative z-10 w-full max-w-md mx-auto my-auto py-0.5 space-y-2 flex-1 flex flex-col justify-center">
                        <div className="text-center mb-0.5">
                            <h3 className="text-base sm:text-lg font-black text-white tracking-tight leading-tight">
                                ¿Qué necesitas hoy?
                            </h3>
                            <p className="text-[10.5px] text-slate-300 font-medium">
                                Selecciona una opción para comenzar tu solicitud personalizada
                            </p>
                        </div>

                        {/* Opción 1: Taxi / Mototaxi */}
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
                            className="w-full bg-primary hover:bg-[#f5f500] border-2 border-yellow-300/80 p-2.5 sm:p-3 rounded-2xl sm:rounded-[1.75rem] text-left shadow-lg shadow-yellow-500/15 active:scale-[0.98] transition-all group flex items-center gap-3 relative overflow-hidden"
                        >
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-950 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                                <Car className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-none">
                                        Taxi / Mototaxi
                                    </h4>
                                    <span className="text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-primary tracking-wider shrink-0">
                                        Pasajeros
                                    </span>
                                </div>
                                <p className="text-[10px] sm:text-[11px] text-slate-950/90 font-bold line-clamp-1 leading-tight">
                                    Mototaxi, Taxi Standard y Carro Confort
                                </p>
                                <div className="flex items-center gap-1.5 mt-1 text-[8.5px] sm:text-[9px] text-slate-950 font-black">
                                    <span className="flex items-center gap-0.5">
                                        <Bike className="w-2.5 h-2.5 text-slate-950" /> Moto
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-0.5">
                                        <Car className="w-2.5 h-2.5 text-slate-950" /> Taxi
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-0.5">
                                        <Sparkles className="w-2.5 h-2.5 text-slate-950" /> Confort
                                    </span>
                                </div>
                            </div>
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/10 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-primary transition-all shrink-0">
                                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
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
                            className="w-full bg-primary hover:bg-[#f5f500] border-2 border-yellow-300/80 p-2.5 sm:p-3 rounded-2xl sm:rounded-[1.75rem] text-left shadow-lg shadow-yellow-500/15 active:scale-[0.98] transition-all group flex items-center gap-3 relative overflow-hidden"
                        >
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-950 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                                <Package className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-none">
                                        Envío de Paquete
                                    </h4>
                                    <span className="text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-primary tracking-wider shrink-0">
                                        Delivery Express
                                    </span>
                                </div>
                                <p className="text-[10px] sm:text-[11px] text-slate-950/90 font-bold line-clamp-1 leading-tight">
                                    Encomiendas, documentos, llaves o paquetes
                                </p>
                                <div className="flex items-center gap-1.5 mt-1 text-[8.5px] sm:text-[9px] text-slate-950 font-black">
                                    <span>📦 Directo</span>
                                    <span>•</span>
                                    <span>⚡ Sin escalas</span>
                                    <span>•</span>
                                    <span>🔒 Conductor verificado</span>
                                </div>
                            </div>
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/10 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-primary transition-all shrink-0">
                                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </button>

                        {/* Opción 3: Muchacho e' Mandao */}
                        <button
                            type="button"
                            onClick={() => {
                                vibrate(30);
                                setIsMandadoModalOpen(true);
                            }}
                            className="w-full bg-primary hover:bg-[#f5f500] border-2 border-yellow-300/80 p-2.5 sm:p-3 rounded-2xl sm:rounded-[1.75rem] text-left shadow-lg shadow-yellow-500/15 active:scale-[0.98] transition-all group flex items-center gap-3 relative overflow-hidden"
                        >
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-950 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                                <ShoppingBag className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-none">
                                        Muchacho e' Mandao
                                    </h4>
                                    <span className="text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-primary tracking-wider shrink-0">
                                        Personal Shopper
                                    </span>
                                </div>
                                <p className="text-[10px] sm:text-[11px] text-slate-950/90 font-bold line-clamp-1 leading-tight">
                                    Compras, trámites y diligencias a medida
                                </p>
                                <div className="flex items-center gap-1.5 mt-1 text-[8.5px] sm:text-[9px] text-slate-950 font-black">
                                    <span>🏛️ Diligencias</span>
                                    <span>•</span>
                                    <span>🎤 Nota de voz</span>
                                    <span>•</span>
                                    <span>💰 Subasta</span>
                                </div>
                            </div>
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/10 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-primary transition-all shrink-0">
                                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </button>

                        {/* Opción Destacada: Transporte Rápido (Solicitud en un toque) */}
                        <button
                            type="button"
                            onClick={() => {
                                vibrate(40);
                                setIsQuickTransportModalOpen(true);
                            }}
                            className="w-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-950 border-2 border-white/80 p-2.5 sm:p-3 rounded-2xl sm:rounded-[1.75rem] text-left shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all group flex items-center gap-3 relative overflow-hidden"
                        >
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-950 text-yellow-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md relative">
                                <Zap className="w-5 h-5 sm:w-5.5 sm:h-5.5 animate-pulse text-yellow-400 fill-yellow-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-none flex items-center gap-1.5">
                                        Transporte Rápido
                                    </h4>
                                    <span className="text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-yellow-400 tracking-wider shrink-0 flex items-center gap-1 shadow-sm">
                                        ⚡ 1 TOQUE
                                    </span>
                                </div>
                                <p className="text-[10px] sm:text-[11px] text-slate-950/90 font-bold line-clamp-1 leading-tight">
                                    Pide en segundos sin cotizaciones ni demoras
                                </p>
                                <div className="flex items-center gap-1.5 mt-1 text-[8.5px] sm:text-[9px] text-slate-950 font-black">
                                    <span>📍 GPS instantáneo</span>
                                    <span>•</span>
                                    <span>⚡ Radar masivo</span>
                                    <span>•</span>
                                    <span>🚀 En 1 toque</span>
                                </div>
                            </div>
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/15 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-yellow-400 transition-all shrink-0">
                                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </button>
                    </div>

                    {/* Bottom Fleet Speed Animation (Taxi, Camioneta, Camión Flete, Mototaxi, Moto Delivery) */}
                    <div className="relative z-10 w-full max-w-md mx-auto flex justify-center -mt-1 mb-0 overflow-visible shrink-0">
                        <SpeedFleetAnimation />
                    </div>

                    {/* Bottom Transparency Guarantee Footer */}
                    <div className="relative z-10 w-full max-w-md mx-auto pt-1 pb-0.5 text-center border-t border-white/10 shrink-0">
                        <p className="text-[10px] text-slate-300 font-bold flex items-center justify-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-emerald-400" />
                            Tarifas transparentes
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
                                if (mainMode === 'package') {
                                    if (packageStep === 3) {
                                        setPackageStep(2);
                                    } else if (packageStep === 2) {
                                        setPackageStep(1);
                                    } else {
                                        setStep('categories');
                                    }
                                } else if (step === 'destination') {
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
                                    <span>Taxi / Mototaxi</span>
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
                            {/* --- ENCOMIENDA: PASO 1 (DATOS DE CONTACTO & NEGOCIO) --- */}
                            {mainMode === 'package' && packageStep === 1 ? (
                                <div className="space-y-3 animate-in fade-in">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <div className="flex items-center gap-1.5">
                                            <Package className="w-4 h-4 text-emerald-600" />
                                            <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                                                Paso 1 de 3: Datos de Contacto
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3].map((s) => (
                                                <div
                                                    key={s}
                                                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${
                                                        packageStep === s
                                                            ? 'bg-emerald-600 text-white shadow-xs'
                                                            : 'bg-slate-100 text-slate-400'
                                                    }`}
                                                >
                                                    {s}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Banner Inteligente B2B para Negocios */}
                                    {isBusinessSender && (
                                        <div className="bg-gradient-to-r from-amber-500/15 via-yellow-500/20 to-amber-500/15 border border-amber-500/30 rounded-2xl p-2.5 flex items-center gap-2.5 text-amber-950 shadow-xs">
                                            <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-xs">
                                                <Building2 className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-black uppercase tracking-wider text-amber-950">
                                                        Facturación / Comanda para Negocio
                                                    </span>
                                                    <span className="text-[8.5px] font-black uppercase px-1.5 py-0.2 rounded-full bg-slate-950 text-amber-400 shrink-0">
                                                        B2B
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-amber-900 font-bold leading-tight mt-0.5">
                                                    Este envío se despacha con formato de comanda comercial para control de entregas.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Quien Envía */}
                                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 space-y-1.5">
                                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1">
                                            📤 Quien Envía (Remitente)
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                value={senderName}
                                                onChange={(e) => setSenderName(e.target.value)}
                                                placeholder="Nombre o Empresa"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500"
                                            />
                                            <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-emerald-500">
                                                <span className="px-2.5 py-2 bg-slate-100 text-slate-600 font-black text-xs border-r border-slate-200 shrink-0">
                                                    +58
                                                </span>
                                                <input
                                                    type="tel"
                                                    value={senderPhone}
                                                    onChange={(e) => setSenderPhone(e.target.value.replace(/[^0-9]/g, ''))}
                                                    placeholder="4121234567"
                                                    className="w-full px-2.5 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none bg-transparent"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quien Recibe */}
                                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 space-y-1.5">
                                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1">
                                            📥 Quien Recibe (Destinatario)
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                value={receiverName}
                                                onChange={(e) => setReceiverName(e.target.value)}
                                                placeholder="Nombre de la persona que recibe"
                                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500"
                                            />
                                            <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-emerald-500">
                                                <span className="px-2.5 py-2 bg-slate-100 text-slate-600 font-black text-xs border-r border-slate-200 shrink-0">
                                                    +58
                                                </span>
                                                <input
                                                    type="tel"
                                                    value={receiverPhone}
                                                    onChange={(e) => setReceiverPhone(e.target.value.replace(/[^0-9]/g, ''))}
                                                    placeholder="4141234567"
                                                    className="w-full px-2.5 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none bg-transparent"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Descripción / Notas */}
                                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 space-y-1">
                                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                                            📦 ¿Qué encomienda envías?
                                        </span>
                                        <textarea
                                            value={packageNotes}
                                            onChange={(e) => setPackageNotes(e.target.value)}
                                            placeholder="Ej: Sobre con documentos, llaves, caja mediana con repuestos..."
                                            className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 resize-none min-h-[44px]"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!senderName.trim()) {
                                                toast.error("Indica quién envía la encomienda");
                                                return;
                                            }
                                            if (!receiverName.trim()) {
                                                toast.error("Indica quién recibe la encomienda");
                                                return;
                                            }
                                            vibrate(30);
                                            setPackageStep(2);
                                        }}
                                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-600/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <span>Continuar a Ubicaciones</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {mainMode === 'package' && (
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                            <div className="flex items-center gap-1.5">
                                                <Package className="w-4 h-4 text-emerald-600" />
                                                <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                                                    Paso 2 de 3: Ubicaciones (Origen y Destino)
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {[1, 2, 3].map((s) => (
                                                    <div
                                                        key={s}
                                                        onClick={() => {
                                                            if (s === 1) setPackageStep(1);
                                                            if (s === 3 && origin && destination) { setPackageStep(3); setStep('vehicle'); }
                                                        }}
                                                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black cursor-pointer ${
                                                            packageStep === s
                                                                ? 'bg-emerald-600 text-white shadow-xs'
                                                                : packageStep > s
                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                : 'bg-slate-100 text-slate-400'
                                                        }`}
                                                    >
                                                        {packageStep > s ? '✓' : s}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
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

                            {/* Google Maps Link / Coordenadas Resolver para Encomienda */}
                            {mainMode === 'package' && (
                                <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-2.5 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase text-blue-900 tracking-wider flex items-center gap-1.5">
                                            <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                                            Pegar Enlace de Google Maps / Coordenadas
                                        </span>
                                        <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-blue-200">
                                            <button
                                                type="button"
                                                onClick={() => setGmapsTarget('origin')}
                                                className={`px-2 py-0.5 text-[9px] font-black rounded transition-all ${
                                                    gmapsTarget === 'origin' ? 'bg-blue-600 text-white' : 'text-slate-600'
                                                }`}
                                            >
                                                Origen
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setGmapsTarget('destination')}
                                                className={`px-2 py-0.5 text-[9px] font-black rounded transition-all ${
                                                    gmapsTarget === 'destination' ? 'bg-blue-600 text-white' : 'text-slate-600'
                                                }`}
                                            >
                                                Destino
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <input
                                            type="text"
                                            value={gmapsInputUrl}
                                            onChange={(e) => setGmapsInputUrl(e.target.value)}
                                            placeholder="https://maps.app.goo.gl/... o 10.48, -66.90"
                                            className="flex-1 bg-white border border-blue-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400"
                                        />
                                        <button
                                            type="button"
                                            disabled={isParsingGmaps || !gmapsInputUrl.trim()}
                                            onClick={handleResolveGoogleMapsUrl}
                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs rounded-xl active:scale-95 transition-all flex items-center gap-1 shrink-0"
                                        >
                                            {isParsingGmaps ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Cargar'}
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-blue-800 font-medium">
                                        📍 Pega el link compartido de WhatsApp o Google Maps para autocompletar la ruta.
                                    </p>
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
                            {mainMode === 'package' ? (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPackageStep(1)}
                                        className="py-3 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-2xl transition-colors"
                                    >
                                        Volver
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!origin || !destination}
                                        onClick={() => {
                                            vibrate(30);
                                            setPackageStep(3);
                                            setStep('vehicle');
                                        }}
                                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-600/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <span>Continuar a Vehículo y Chofer</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
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
                                            : 'Ver tarifas de viaje'}
                                    </span>
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            )}
                                </>
                            )}
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

                            {/* Selected Driver Banner */}
                            {selectedDriver && (
                                <div className="bg-amber-400 border-2 border-amber-500 rounded-2xl p-2.5 px-3.5 flex items-center justify-between text-slate-950 shadow-md">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <Star className="w-4 h-4 text-slate-950 fill-slate-950 shrink-0" />
                                        <div className="truncate">
                                            <p className="text-[10px] font-black uppercase tracking-wider leading-none">
                                                Conductor Seleccionado
                                            </p>
                                            <p className="text-xs font-black text-slate-950 truncate mt-0.5">
                                                {selectedDriver.fullName} • ${calculateDriverTripPrice(selectedDriver).toFixed(2)} USD
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setShowDriverSelectionModal(true)}
                                            className="text-[10px] font-black underline uppercase px-2 py-1"
                                        >
                                            Cambiar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDriver(null)}
                                            className="w-6 h-6 rounded-full bg-slate-950/10 hover:bg-slate-950/20 text-slate-950 flex items-center justify-center text-xs font-black"
                                            title="Quitar selección"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Service Categories Carousel Filtered by mainMode */}
                            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none snap-x">
                                {mainMode === 'taxi' && (() => {
                                    const motoRange = getCategoryPriceRange('moto');
                                    const carroRange = getCategoryPriceRange('carro');
                                    const ejecutivoRange = getCategoryPriceRange('ejecutivo');

                                    return (
                                        <>
                                            {/* 1. Mototaxi */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('mototaxi');
                                                    setVehicleType('moto');
                                                }}
                                                className={`flex-none w-[115px] snap-start flex flex-col items-center py-2.5 px-2 rounded-2xl border-2 transition-all text-center ${
                                                    selectedCategory === 'mototaxi'
                                                        ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/20 scale-[1.02]'
                                                        : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                                }`}
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 shadow-xs">
                                                    <Bike className="w-4 h-4 text-amber-500" />
                                                </div>
                                                <span className="text-[11px] font-black text-slate-900 truncate max-w-full">Mototaxi</span>
                                                <span className={`text-[9px] font-bold ${motoRange.isBusy ? 'text-rose-600 font-black' : 'text-emerald-600'}`}>
                                                    {motoRange.isBusy ? 'No disponible' : '2-3 min'}
                                                </span>
                                                <span className="text-xs font-black text-slate-900 mt-0.5 leading-tight">
                                                    {motoRange.isBusy ? (
                                                        <span className="text-rose-600 font-black">Ocupados</span>
                                                    ) : selectedDriver && selectedDriver.vehicleType === 'moto' ? (
                                                        `$${calculateDriverTripPrice(selectedDriver).toFixed(2)}`
                                                    ) : (
                                                        motoRange.text
                                                    )}
                                                </span>
                                                {!motoRange.isBusy && bcvRate > 0 && (
                                                    <span className="text-[8px] font-bold text-slate-500 truncate max-w-full px-0.5">
                                                        {((selectedDriver && selectedDriver.vehicleType === 'moto' ? calculateDriverTripPrice(selectedDriver) : motoRange.min) * bcvRate).toFixed(0)} Bs
                                                    </span>
                                                )}
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        vibrate(30);
                                                        setSelectedCategory('mototaxi');
                                                        setVehicleType('moto');
                                                        setShowDriverSelectionModal(true);
                                                    }}
                                                    className="mt-1 text-[8.5px] font-black text-amber-700 hover:text-amber-900 underline block cursor-pointer"
                                                >
                                                    Elegir piloto
                                                </span>
                                            </button>

                                            {/* 2. Taxi Económico */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('taxi_driver');
                                                    setVehicleType('carro');
                                                }}
                                                className={`flex-none w-[115px] snap-start flex flex-col items-center py-2.5 px-2 rounded-2xl border-2 transition-all text-center ${
                                                    selectedCategory === 'taxi_driver'
                                                        ? 'border-primary bg-primary text-slate-950 shadow-md shadow-primary/30 ring-2 ring-primary/30 scale-[1.03]'
                                                        : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                                }`}
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 shadow-xs">
                                                    <Car className="w-4 h-4 text-slate-900" />
                                                </div>
                                                <span className="text-[11px] font-black truncate max-w-full">Taxi Económico</span>
                                                <span className={`text-[9px] font-bold ${carroRange.isBusy ? (selectedCategory === 'taxi_driver' ? 'text-slate-950 font-black' : 'text-rose-600 font-black') : (selectedCategory === 'taxi_driver' ? 'text-slate-900' : 'text-emerald-600')}`}>
                                                    {carroRange.isBusy ? 'No disponible' : '3-5 min'}
                                                </span>
                                                <span className="text-xs font-black mt-0.5 leading-tight">
                                                    {carroRange.isBusy ? (
                                                        <span className={selectedCategory === 'taxi_driver' ? 'text-slate-950 font-black' : 'text-rose-600 font-black'}>Ocupados</span>
                                                    ) : selectedDriver && selectedDriver.vehicleType === 'carro' ? (
                                                        `$${calculateDriverTripPrice(selectedDriver).toFixed(2)}`
                                                    ) : (
                                                        carroRange.text
                                                    )}
                                                </span>
                                                {!carroRange.isBusy && bcvRate > 0 && (
                                                    <span className={`text-[8px] font-bold truncate max-w-full px-0.5 ${selectedCategory === 'taxi_driver' ? 'text-slate-800' : 'text-slate-500'}`}>
                                                        {((selectedDriver && selectedDriver.vehicleType === 'carro' ? calculateDriverTripPrice(selectedDriver) : carroRange.min) * bcvRate).toFixed(0)} Bs
                                                    </span>
                                                )}
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        vibrate(30);
                                                        setSelectedCategory('taxi_driver');
                                                        setVehicleType('carro');
                                                        setShowDriverSelectionModal(true);
                                                    }}
                                                    className={`mt-1 text-[8.5px] font-black underline block cursor-pointer ${selectedCategory === 'taxi_driver' ? 'text-slate-950 hover:text-black' : 'text-amber-700 hover:text-amber-900'}`}
                                                >
                                                    Elegir conductor
                                                </span>
                                            </button>

                                            {/* 3. Carro Confort */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('carro_confort');
                                                    setVehicleType('ejecutivo');
                                                }}
                                                className={`flex-none w-[115px] snap-start flex flex-col items-center py-2.5 px-2 rounded-2xl border-2 transition-all text-center ${
                                                    selectedCategory === 'carro_confort'
                                                        ? 'border-slate-900 bg-slate-900 text-white shadow-md ring-2 ring-slate-900/20 scale-[1.02]'
                                                        : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                                }`}
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 shadow-xs">
                                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                                </div>
                                                <span className={`text-[11px] font-black truncate max-w-full ${selectedCategory === 'carro_confort' ? 'text-white' : 'text-slate-900'}`}>Confort A/A</span>
                                                <span className={`text-[9px] font-bold ${ejecutivoRange.isBusy ? 'text-rose-400 font-black' : 'text-amber-400'}`}>
                                                    {ejecutivoRange.isBusy ? 'No disponible' : 'Premium'}
                                                </span>
                                                <span className={`text-xs font-black mt-0.5 leading-tight ${selectedCategory === 'carro_confort' ? 'text-white' : 'text-slate-900'}`}>
                                                    {ejecutivoRange.isBusy ? (
                                                        <span className={selectedCategory === 'carro_confort' ? 'text-amber-300 font-black' : 'text-rose-600 font-black'}>Ocupados</span>
                                                    ) : selectedDriver && selectedDriver.vehicleType === 'ejecutivo' ? (
                                                        `$${calculateDriverTripPrice(selectedDriver).toFixed(2)}`
                                                    ) : (
                                                        ejecutivoRange.text
                                                    )}
                                                </span>
                                                {!ejecutivoRange.isBusy && bcvRate > 0 && (
                                                    <span className={`text-[8px] font-bold truncate max-w-full px-0.5 ${selectedCategory === 'carro_confort' ? 'text-slate-300' : 'text-slate-500'}`}>
                                                        {((selectedDriver && selectedDriver.vehicleType === 'ejecutivo' ? calculateDriverTripPrice(selectedDriver) : ejecutivoRange.min) * bcvRate).toFixed(0)} Bs
                                                    </span>
                                                )}
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        vibrate(30);
                                                        setSelectedCategory('carro_confort');
                                                        setVehicleType('ejecutivo');
                                                        setShowDriverSelectionModal(true);
                                                    }}
                                                    className={`mt-1 text-[8.5px] font-black underline block cursor-pointer ${selectedCategory === 'carro_confort' ? 'text-amber-400 hover:text-amber-300' : 'text-amber-700 hover:text-amber-900'}`}
                                                >
                                                    Elegir chofer
                                                </span>
                                            </button>
                                        </>
                                    );
                                })()}

                                {mainMode === 'package' && (() => {
                                    const motoPackageRange = getCategoryPriceRange('moto');
                                    const carroPackageRange = getCategoryPriceRange('carro');
                                    const confortPackageRange = getCategoryPriceRange('ejecutivo');

                                    return (
                                        <>
                                            {/* 1. Moto Envíos */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('delivery_envios');
                                                    setVehicleType('moto');
                                                }}
                                                className={`flex-none w-[115px] snap-start flex flex-col items-center py-2.5 px-2 rounded-2xl border-2 transition-all text-center ${
                                                    vehicleType === 'moto'
                                                        ? 'border-emerald-600 bg-emerald-50/80 shadow-md ring-2 ring-emerald-500/20 scale-[1.02]'
                                                        : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                                }`}
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 shadow-xs">
                                                    <Bike className="w-4 h-4 text-emerald-600" />
                                                </div>
                                                <span className="text-[11px] font-black text-slate-900 truncate max-w-full">Moto Envíos</span>
                                                <span className={`text-[9px] font-bold ${motoPackageRange.isBusy ? 'text-rose-600 font-black' : 'text-emerald-600'}`}>
                                                    {motoPackageRange.isBusy ? 'No disponible' : 'Sobres / Docs'}
                                                </span>
                                                <span className="text-xs font-black text-slate-900 mt-0.5 leading-tight">
                                                    {motoPackageRange.isBusy ? (
                                                        <span className="text-rose-600 font-black">Ocupados</span>
                                                    ) : selectedDriver && selectedDriver.vehicleType === 'moto' ? (
                                                        `$${calculateDriverTripPrice(selectedDriver).toFixed(2)}`
                                                    ) : (
                                                        motoPackageRange.text
                                                    )}
                                                </span>
                                            </button>

                                            {/* 2. Taxi Económico */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('delivery_envios');
                                                    setVehicleType('carro');
                                                }}
                                                className={`flex-none w-[115px] snap-start flex flex-col items-center py-2.5 px-2 rounded-2xl border-2 transition-all text-center ${
                                                    vehicleType === 'carro'
                                                        ? 'border-emerald-600 bg-emerald-50/80 shadow-md ring-2 ring-emerald-500/20 scale-[1.02]'
                                                        : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                                }`}
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 shadow-xs">
                                                    <Car className="w-4 h-4 text-amber-500" />
                                                </div>
                                                <span className="text-[11px] font-black text-slate-900 truncate max-w-full">Taxi Económico</span>
                                                <span className={`text-[9px] font-bold ${carroPackageRange.isBusy ? 'text-rose-600 font-black' : 'text-slate-500'}`}>
                                                    {carroPackageRange.isBusy ? 'No disponible' : 'Cajas / Bultos'}
                                                </span>
                                                <span className="text-xs font-black text-slate-900 mt-0.5 leading-tight">
                                                    {carroPackageRange.isBusy ? (
                                                        <span className="text-rose-600 font-black">Ocupados</span>
                                                    ) : selectedDriver && selectedDriver.vehicleType === 'carro' ? (
                                                        `$${calculateDriverTripPrice(selectedDriver).toFixed(2)}`
                                                    ) : (
                                                        carroPackageRange.text
                                                    )}
                                                </span>
                                            </button>

                                            {/* 3. Confort A/A */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('delivery_envios');
                                                    setVehicleType('ejecutivo');
                                                }}
                                                className={`flex-none w-[115px] snap-start flex flex-col items-center py-2.5 px-2 rounded-2xl border-2 transition-all text-center ${
                                                    vehicleType === 'ejecutivo'
                                                        ? 'border-slate-900 bg-slate-900 text-white shadow-md ring-2 ring-slate-900/20 scale-[1.02]'
                                                        : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                                }`}
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 shadow-xs">
                                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                                </div>
                                                <span className={`text-[11px] font-black truncate max-w-full ${vehicleType === 'ejecutivo' ? 'text-white' : 'text-slate-900'}`}>Confort A/A</span>
                                                <span className={`text-[9px] font-bold ${confortPackageRange.isBusy ? 'text-rose-400 font-black' : 'text-amber-400'}`}>
                                                    {confortPackageRange.isBusy ? 'No disponible' : 'Refrigerado / Frágil'}
                                                </span>
                                                <span className={`text-xs font-black mt-0.5 leading-tight ${vehicleType === 'ejecutivo' ? 'text-white' : 'text-slate-900'}`}>
                                                    {confortPackageRange.isBusy ? (
                                                        <span className={vehicleType === 'ejecutivo' ? 'text-amber-300 font-black' : 'text-rose-600 font-black'}>Ocupados</span>
                                                    ) : selectedDriver && selectedDriver.vehicleType === 'ejecutivo' ? (
                                                        `$${calculateDriverTripPrice(selectedDriver).toFixed(2)}`
                                                    ) : (
                                                        confortPackageRange.text
                                                    )}
                                                </span>
                                            </button>
                                        </>
                                    );
                                })()}

                                {mainMode === 'mandado' && (
                                    <div className="w-full bg-amber-50/90 border-2 border-amber-400 rounded-2xl p-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center font-black shadow-sm shrink-0">
                                                <ShoppingBag className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-xs font-black text-slate-900">Muchacho e' Mandao</h4>
                                                    <span className="text-[9px] font-black uppercase px-2 py-0.2 rounded-full bg-amber-200 text-amber-800">Personal shopper</span>
                                                </div>
                                                <p className="text-[10px] text-slate-600 font-medium">Asistencia personal para tus diligencias, compras y movilizaciones</p>
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
                                <div className="space-y-2.5 animate-in fade-in">
                                    {/* Barra de búsqueda manual por nombre del conductor/chofer */}
                                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1">
                                                🔍 Buscar Chofer de Confianza
                                            </span>
                                            {selectedDriver && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedDriver(null)}
                                                    className="text-[9.5px] font-bold text-rose-600 hover:underline"
                                                >
                                                    Quitar selección
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <input
                                                type="text"
                                                value={driverSearchQuery}
                                                onChange={(e) => setDriverSearchQuery(e.target.value)}
                                                placeholder="Escribe el nombre del chofer..."
                                                className="w-full text-xs font-bold text-slate-800 placeholder-slate-400 outline-none bg-transparent"
                                            />
                                            {driverSearchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDriverSearchQuery('')}
                                                    className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0 text-[10px]"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>

                                        {/* Coincidencias de choferes en línea */}
                                        {driverSearchQuery.trim() && (
                                            <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1">
                                                {(() => {
                                                    const matches = nearbyDrivers.filter(d =>
                                                        d.fullName?.toLowerCase().includes(driverSearchQuery.toLowerCase())
                                                    );
                                                    if (matches.length === 0) {
                                                        return <p className="text-[10px] text-slate-400 font-bold text-center py-1.5">No hay choferes en línea con ese nombre</p>;
                                                    }
                                                    return matches.map(d => (
                                                        <div
                                                            key={d.id}
                                                            onClick={() => {
                                                                vibrate(30);
                                                                setSelectedDriver(d);
                                                                if (d.vehicleType === 'moto') {
                                                                    setVehicleType('moto');
                                                                } else if (d.vehicleType === 'ejecutivo') {
                                                                    setVehicleType('ejecutivo');
                                                                } else {
                                                                    setVehicleType('carro');
                                                                }
                                                                setDriverSearchQuery('');
                                                            }}
                                                            className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                                                selectedDriver?.id === d.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-7 h-7 rounded-lg bg-slate-900 text-yellow-400 flex items-center justify-center font-black text-xs shrink-0">
                                                                    {d.fullName?.charAt(0) || 'C'}
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-black text-slate-900">{d.fullName}</p>
                                                                    <p className="text-[9.5px] text-slate-500 font-bold capitalize">
                                                                        {d.vehicleType === 'moto' ? 'Moto' : d.vehicleType === 'ejecutivo' ? 'Confort A/A' : 'Auto'} • ★ {d.rating || '5.0'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <span className="text-xs font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-lg shadow-xs">
                                                                ${calculateDriverTripPrice(d).toFixed(2)}
                                                            </span>
                                                        </div>
                                                    ));
                                                })()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Comanda de Entrega Detallada */}
                                    <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-2.5 space-y-1.5">
                                        <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1">
                                            <span className="text-[10px] font-black uppercase text-emerald-950 tracking-wider flex items-center gap-1.5">
                                                📋 Comanda de Entrega
                                            </span>
                                            {isBusinessSender && (
                                                <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded-full bg-slate-950 text-amber-400">
                                                    B2B Oficial
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10.5px] font-bold text-slate-800 space-y-0.5">
                                            <p><span className="text-slate-500 font-medium">De:</span> {senderName || 'Remitente'} {senderPhone ? `(+58 ${senderPhone})` : ''}</p>
                                            <p><span className="text-slate-500 font-medium">Para:</span> {receiverName || 'Destinatario'} {receiverPhone ? `(+58 ${receiverPhone})` : ''}</p>
                                            {packageNotes && <p><span className="text-slate-500 font-medium">Contenido:</span> {packageNotes}</p>}
                                            <p><span className="text-slate-500 font-medium">Chofer:</span> {selectedDriver ? `${selectedDriver.fullName} (Asignado)` : 'Radar Masivo Abierto (El más cercano)'}</p>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPackageStep(2);
                                            setStep('destination');
                                        }}
                                        className="w-full py-2 text-center text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
                                    >
                                        ← Modificar origen o destino
                                    </button>
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
                                className="w-full py-4 bg-[#FFB800] hover:bg-[#f5b000] text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <span>
                                    {mainMode === 'mandado' ? 'Solicitar Mandado • Iniciar Subasta' : 'EMPECEMOS'}
                                </span>
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
                                {/* Direct Driver Pago Móvil (Predeterminado) */}
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
                                        </div>
                                    )}
                                </div>

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
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-black text-slate-900">Datos del Pasajero</h3>
                                <p className="text-[11px] text-slate-500 font-medium">Requeridos para tu viaje seguro</p>
                            </div>
                            <button
                                onClick={() => setShowGuestModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Nombre completo</label>
                                <input
                                    type="text"
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                    placeholder="Ej: Juan Pérez"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Cédula de Identidad</label>
                                <div className="space-y-1.5">
                                    <div className="flex gap-1.5">
                                        {(['V', 'E', 'J'] as const).map(type => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setGuestCedulaType(type)}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
                                                    guestCedulaType === type
                                                        ? 'bg-slate-900 text-white shadow-xs'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                            >
                                                {type}-
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        type="text"
                                        value={guestCedula}
                                        onChange={(e) => setGuestCedula(e.target.value.replace(/\D/g, ''))}
                                        placeholder="12345678"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-primary"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Teléfono (WhatsApp)</label>
                                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:border-primary">
                                    <span className="px-3 py-2.5 bg-slate-100 border-r border-slate-200 text-xs font-black text-slate-700 select-none">
                                        🇻🇪 +58
                                    </span>
                                    <input
                                        type="tel"
                                        value={guestPhone}
                                        onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, ''))}
                                        placeholder="4121234567"
                                        className="w-full bg-transparent px-3 py-2.5 text-xs font-bold outline-none"
                                    />
                                </div>
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

                            <button
                                type="button"
                                onClick={() => {
                                    setShowGuestModal(false);
                                    navigate('/profile');
                                }}
                                className="w-full py-2.5 border border-primary/30 bg-primary/10 hover:bg-primary/20 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                            >
                                <span>¿Deseas registrarte o guardar tus datos?</span>
                                <span className="text-primary font-black underline">Ir al Perfil</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <MandadoRequestModal
                isOpen={isMandadoModalOpen}
                onClose={() => setIsMandadoModalOpen(false)}
                userLocation={userLocation}
                defaultAddress={origin?.address || (userData?.addresses?.[0]?.address) || ''}
                onSubmit={handleSubmitMandadoRequest}
                isSubmitting={isSubmittingMandado}
            />

            {/* Modal: Transporte Rápido (Solicitud en un toque) */}
            <AnimatePresence>
                {isQuickTransportModalOpen && (
                    <div className="fixed inset-0 z-[125] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 shadow-2xl relative animate-in slide-in-from-bottom-5 flex flex-col">
                            {/* Header */}
                            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
                                        <Zap className="w-6 h-6 fill-slate-950" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-950 tracking-tight leading-tight">
                                            Transporte Rápido
                                        </h3>
                                        <p className="text-xs text-slate-500 font-bold">
                                            Solicitud en 1 toque directo al radar
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => !isRequestingQuickTransport && setIsQuickTransportModalOpen(false)}
                                    disabled={isRequestingQuickTransport}
                                    className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors disabled:opacity-50"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Info Banner */}
                            <div className="mt-4 mb-5 bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
                                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-[11px] font-medium leading-relaxed">
                                        Toma tu ubicación GPS actual de forma instantánea y hace sonar el radar de los conductores más cercanos. <strong>Sin escribir direcciones previas.</strong>
                                    </p>
                                    <p className="text-[10px] font-bold text-amber-800 leading-tight">
                                        * Las tarifas mostradas son <strong>referenciales de arranque</strong>. El monto final del servicio se define directamente con el conductor al llegar al punto de recogida.
                                    </p>
                                </div>
                            </div>

                            {/* Loading state overlay if processing */}
                            {isRequestingQuickTransport ? (
                                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-amber-400/20 border-4 border-amber-400 border-t-transparent animate-spin flex items-center justify-center">
                                        <Zap className="w-7 h-7 text-amber-500 fill-amber-500 animate-pulse" />
                                    </div>
                                    <div>
                                        <h4 className="text-base font-black text-slate-900">
                                            Activando radar en tiempo real...
                                        </h4>
                                        <p className="text-xs text-slate-500 font-medium mt-1">
                                            Detectando GPS y conectando con unidades cercanas
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                /* Three Vehicle Cards */
                                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-2">
                                    {/* Opción 1: Moto */}
                                    <button
                                        type="button"
                                        onClick={() => handleQuickTransport('moto')}
                                        className="flex flex-col items-center justify-between p-3 bg-gradient-to-b from-amber-50/50 to-white hover:to-amber-50 border-2 border-slate-200 hover:border-amber-400 rounded-3xl active:scale-95 transition-all text-center group shadow-sm hover:shadow-md cursor-pointer"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-amber-400/20 text-slate-950 flex items-center justify-center group-hover:scale-110 group-hover:bg-amber-400 transition-all mb-2 shadow-inner">
                                            <Bike className="w-6 h-6 text-slate-950" />
                                        </div>
                                        <span className="text-xs sm:text-sm font-black text-slate-950 tracking-tight">
                                            Moto
                                        </span>
                                        <div className="mt-1 px-1.5 py-0.5 rounded-full bg-amber-100/80 border border-amber-200">
                                            <p className="text-[10px] sm:text-xs font-black text-amber-950">
                                                Desde $0.50
                                            </p>
                                        </div>
                                        {bcvRate ? (
                                            <span className="text-[9px] text-slate-500 font-bold mt-0.5">
                                                ~Bs. {(0.50 * bcvRate).toFixed(0)}
                                            </span>
                                        ) : null}
                                        <span className="mt-2 text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
                                            ⚡ Ágil
                                        </span>
                                    </button>

                                    {/* Opción 2: Carro Económico */}
                                    <button
                                        type="button"
                                        onClick={() => handleQuickTransport('carro')}
                                        className="flex flex-col items-center justify-between p-3 bg-gradient-to-b from-blue-50/40 to-white hover:to-blue-50 border-2 border-slate-200 hover:border-blue-500 rounded-3xl active:scale-95 transition-all text-center group shadow-sm hover:shadow-md cursor-pointer"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-slate-950 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all mb-2 shadow-inner">
                                            <Car className="w-6 h-6 text-slate-950 group-hover:text-white transition-colors" />
                                        </div>
                                        <span className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-tight">
                                            Carro Económico
                                        </span>
                                        <div className="mt-1 px-1.5 py-0.5 rounded-full bg-blue-100/80 border border-blue-200">
                                            <p className="text-[10px] sm:text-xs font-black text-blue-950">
                                                Desde $1.50
                                            </p>
                                        </div>
                                        {bcvRate ? (
                                            <span className="text-[9px] text-slate-500 font-bold mt-0.5">
                                                ~Bs. {(1.50 * bcvRate).toFixed(0)}
                                            </span>
                                        ) : null}
                                        <span className="mt-2 text-[9px] font-black uppercase text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md">
                                            🚗 Diario
                                        </span>
                                    </button>

                                    {/* Opción 3: Carro Confort */}
                                    <button
                                        type="button"
                                        onClick={() => handleQuickTransport('confort')}
                                        className="flex flex-col items-center justify-between p-3 bg-gradient-to-b from-purple-50/40 to-white hover:to-purple-50 border-2 border-slate-200 hover:border-purple-500 rounded-3xl active:scale-95 transition-all text-center group shadow-sm hover:shadow-md cursor-pointer"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-purple-500/15 text-slate-950 flex items-center justify-center group-hover:scale-110 group-hover:bg-purple-600 group-hover:text-white transition-all mb-2 shadow-inner">
                                            <Sparkles className="w-6 h-6 text-purple-700 group-hover:text-white transition-colors" />
                                        </div>
                                        <span className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-tight">
                                            Carro Confort
                                        </span>
                                        <div className="mt-1 px-1.5 py-0.5 rounded-full bg-purple-100/80 border border-purple-200">
                                            <p className="text-[10px] sm:text-xs font-black text-purple-950">
                                                Desde $2.50
                                            </p>
                                        </div>
                                        {bcvRate ? (
                                            <span className="text-[9px] text-slate-500 font-bold mt-0.5">
                                                ~Bs. {(2.50 * bcvRate).toFixed(0)}
                                            </span>
                                        ) : null}
                                        <span className="mt-2 text-[9px] font-black uppercase text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md">
                                            ⭐ VIP / A/C
                                        </span>
                                    </button>
                                </div>
                            )}

                            {/* Footer helper note */}
                            <div className="mt-3 text-center space-y-1">
                                <p className="text-[10px] text-slate-500 font-bold flex items-center justify-center gap-1">
                                    <MapPin className="w-3 h-3 text-slate-400" />
                                    El chofer acude directamente a tus coordenadas GPS
                                </p>
                                <p className="text-[9px] text-slate-400 font-medium">
                                    Al llegar la unidad, se fija el monto acordado en persona o calculado por mapa.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            <DemoAlertModal isOpen={showDemoAlert} onClose={() => setShowDemoAlert(false)} />

            {/* Modal de Selección Directa de Conductor */}
            <AnimatePresence>
                {showDriverSelectionModal && (
                    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <div className="bg-white w-full sm:max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 shadow-2xl max-h-[85vh] flex flex-col relative animate-in slide-in-from-bottom-5">
                            {/* Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                                        <Car className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black text-slate-950 tracking-tight">
                                            Elegir Conductor
                                        </h3>
                                        <p className="text-[11px] text-slate-500 font-bold">
                                            {selectedCategory === 'mototaxi' ? 'Mototaxis' : selectedCategory === 'carro_confort' ? 'Carros Confort' : 'Taxis'} disponibles en tu zona
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowDriverSelectionModal(false)}
                                    className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Informative notice */}
                            <div className="my-3 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 flex items-start gap-2">
                                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] font-medium leading-snug">
                                    Al elegir un conductor, la solicitud le timbrará directamente a él con su tarifa asignada. Si no eliges uno, se transmitirá en abierto a todos los pilotos cercanos.
                                </p>
                            </div>

                            {/* Drivers List */}
                            <div className="overflow-y-auto space-y-3 py-1 flex-1 pr-1">
                                {(() => {
                                    const isComfortCategory = selectedCategory === 'carro_confort';
                                    const catDrivers = nearbyDrivers.filter(d => {
                                        if (selectedCategory === 'mototaxi') {
                                            return d.vehicleType === 'moto';
                                        }
                                        if (isComfortCategory) {
                                            return d.vehicleType === 'carro' && (d.isComfortEligible || (d.hasAc && Number(d.vehicleYear) >= 2009));
                                        }
                                        if (selectedCategory === 'taxi_driver') {
                                            return d.vehicleType === 'carro';
                                        }
                                        if (selectedCategory === 'delivery_envios') {
                                            return vehicleType === 'moto' ? d.vehicleType === 'moto' : d.vehicleType === 'carro';
                                        }
                                        return true;
                                    });
                                    const tripDist = routeInfo ? routeInfo.distance : 1;

                                    if (catDrivers.length === 0) {
                                        return (
                                            <div className="text-center py-10 px-4">
                                                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                                                    <Car className="w-7 h-7" />
                                                </div>
                                                <h4 className="font-black text-sm text-slate-800">Sin conductores específicos en línea</h4>
                                                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                                                    No hay conductores con tarifas personalizadas activas en esta categoría en este momento. Tu solicitud se enviará a todos los conductores disponibles por radar.
                                                </p>
                                            </div>
                                        );
                                    }

                                    return catDrivers.map(d => {
                                        const price = calculateDriverTripPrice(d, tripDist, isComfortCategory);
                                        const isChosen = selectedDriver?.id === d.id;

                                        return (
                                            <div
                                                key={d.id}
                                                className={`p-4 rounded-2xl border-2 transition-all flex flex-col gap-3 ${
                                                    isChosen 
                                                        ? 'border-amber-400 bg-amber-50/50 shadow-md ring-2 ring-amber-400/20' 
                                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="relative shrink-0">
                                                            {d.photoUrl ? (
                                                                <img
                                                                    src={d.photoUrl}
                                                                    alt={d.fullName}
                                                                    className="w-12 h-12 rounded-2xl object-cover border border-slate-200"
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white font-black text-sm flex items-center justify-center">
                                                                    {d.fullName.slice(0, 2).toUpperCase()}
                                                                </div>
                                                            )}
                                                            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <h4 className="font-black text-sm text-slate-900 truncate flex items-center gap-1.5">
                                                                <span>{d.fullName}</span>
                                                            </h4>
                                                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold mt-0.5">
                                                                <span className="flex items-center gap-0.5 text-amber-500">
                                                                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                                                                    <span>{Number(d.rating || 5.0).toFixed(1)}</span>
                                                                </span>
                                                                <span>•</span>
                                                                <span>{d.totalTrips || 0} viajes</span>
                                                                <span>•</span>
                                                                <span className="text-emerald-600">~{d.etaMinutes} min</span>
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 font-semibold truncate mt-0.5">
                                                                {d.vehicleModel} {d.vehicleColor ? `• ${d.vehicleColor}` : ''} • Placa: {d.vehiclePlate}
                                                            </p>
                                                            {/* Badges */}
                                                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                                {d.hasAc && (
                                                                    <span className="text-[9px] font-bold bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded border border-cyan-200">
                                                                        ❄️ A/A
                                                                    </span>
                                                                )}
                                                                {(d.isComfortEligible || (d.hasAc && Number(d.vehicleYear) >= 2009)) && (
                                                                    <span className="text-[9px] font-black bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">
                                                                        ✨ Confort
                                                                    </span>
                                                                )}
                                                                {d.hasThermalBag && (
                                                                    <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                                                                        🎒 Bolso
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="text-right shrink-0">
                                                        <span className="text-base font-black text-slate-900 block leading-tight">
                                                            ${price.toFixed(2)}
                                                        </span>
                                                        {bcvRate > 0 && (
                                                            <span className="text-[10px] font-bold text-slate-500 block">
                                                                {(price * bcvRate).toFixed(0)} Bs
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setViewingDriverReviews(d);
                                                            }}
                                                            className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                                                        >
                                                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                                                            <span>Reseñas</span>
                                                        </button>
                                                        {isChosen ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl flex items-center gap-1">
                                                                    <Check className="w-3.5 h-3.5" /> Seleccionado
                                                                </span>
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedDriver(null);
                                                                        setShowDriverSelectionModal(false);
                                                                    }}
                                                                    className="text-xs font-bold text-slate-500 hover:text-rose-600 px-2 py-1"
                                                                >
                                                                    Quitar selección
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedDriver(d);
                                                                    setShowDriverSelectionModal(false);
                                                                    toast.success(`Conductor ${d.fullName} seleccionado ($${price.toFixed(2)} USD)`);
                                                                }}
                                                                className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-amber-400 rounded-xl font-black text-xs uppercase tracking-wider transition-transform active:scale-95 shadow-sm"
                                                            >
                                                                Elegir Conductor
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>

                                {/* Option to clear selection */}
                                {selectedDriver && (
                                    <div className="pt-3 border-t border-slate-100">
                                        <button
                                            onClick={() => {
                                                setSelectedDriver(null);
                                                setShowDriverSelectionModal(false);
                                            }}
                                            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl uppercase tracking-wider"
                                        >
                                            Transmitir a todos los conductores (Sin selección directa)
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Modal de Reseñas Públicas del Conductor */}
                <AnimatePresence>
                    {viewingDriverReviews && (
                        <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
                            <div className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 shadow-2xl max-h-[80vh] flex flex-col relative animate-in slide-in-from-bottom-5">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            {viewingDriverReviews.photoUrl ? (
                                                <img 
                                                    src={viewingDriverReviews.photoUrl} 
                                                    alt={viewingDriverReviews.fullName} 
                                                    className="w-11 h-11 rounded-2xl object-cover border border-slate-200" 
                                                />
                                            ) : (
                                                <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-sm">
                                                    {viewingDriverReviews.fullName.slice(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-black text-slate-900 text-sm">{viewingDriverReviews.fullName}</h3>
                                            <div className="flex items-center gap-1.5 text-xs text-amber-500 font-bold">
                                                <Star className="w-3.5 h-3.5 fill-amber-400" />
                                                <span>{Number(viewingDriverReviews.rating || 5.0).toFixed(1)}</span>
                                                <span className="text-slate-400 font-medium">• {viewingDriverReviews.totalTrips || 0} viajes</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setViewingDriverReviews(null)}
                                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="overflow-y-auto py-3 space-y-2.5 flex-1 pr-1">
                                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Opiniones de Clientes</h4>
                                    {loadingDriverReviews ? (
                                        <div className="text-center py-8">
                                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                            <p className="text-xs text-slate-400 font-medium">Cargando reseñas...</p>
                                        </div>
                                    ) : driverReviewsList.length === 0 ? (
                                        <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                                            <div className="flex justify-center gap-1 text-amber-400">
                                                <Star className="w-5 h-5 fill-amber-400" />
                                                <Star className="w-5 h-5 fill-amber-400" />
                                                <Star className="w-5 h-5 fill-amber-400" />
                                                <Star className="w-5 h-5 fill-amber-400" />
                                                <Star className="w-5 h-5 fill-amber-400" />
                                            </div>
                                            <p className="text-xs font-black text-slate-800">Conductor 5★ Verificado</p>
                                            <p className="text-[11px] text-slate-500 font-medium">
                                                Perfil activo y verificado por Deliexpress sin reportes negativos.
                                            </p>
                                        </div>
                                    ) : (
                                        driverReviewsList.map((rev) => (
                                            <div key={rev.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-slate-900">{rev.user_name || 'Cliente Verificado'}</span>
                                                    <div className="flex items-center gap-0.5 text-amber-500 text-xs font-black">
                                                        {Array.from({ length: rev.rating || 5 }).map((_, i) => (
                                                            <Star key={i} className="w-3 h-3 fill-amber-400" />
                                                        ))}
                                                    </div>
                                                </div>
                                                {rev.rating_comment ? (
                                                    <p className="text-xs text-slate-600 font-medium leading-relaxed italic">
                                                        "{rev.rating_comment}"
                                                    </p>
                                                ) : (
                                                    <p className="text-[11px] text-slate-500 font-medium">
                                                        Viaje completado exitosamente • Calificación {rev.rating || 5}★
                                                    </p>
                                                )}
                                                {rev.rating_tags && Array.isArray(rev.rating_tags) && rev.rating_tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 pt-1">
                                                        {rev.rating_tags.map((tag: string, idx: number) => (
                                                            <span key={idx} className="text-[9px] font-bold bg-amber-100/70 text-amber-900 px-2 py-0.5 rounded-md">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>

                                <button
                                    onClick={() => setViewingDriverReviews(null)}
                                    className="w-full mt-2 py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl active:scale-95"
                                >
                                    Cerrar Reseñas
                                </button>
                            </div>
                        </div>
                    )}
                </AnimatePresence>
        </div>
    );
}
