import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
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
    User as UserIcon
} from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
    getMapboxToken,
    MAPBOX_STYLE_DAY,
    DEFAULT_MAP_CENTER_LNG_LAT,
    getMapboxRoute,
    searchMapboxPlaces,
    reverseGeocodeMapbox,
    createOriginPinElement,
    createDestinationPinElement,
    createDriverPinElement
} from '../lib/mapboxConfig';
import { UN2X3_LOGO } from '../lib/env';
import toast from 'react-hot-toast';
import { compressImage } from '../utils/mediaCompressor';
import { calculateDistance } from '../lib/geo';
import { vibrate } from '../utils/haptics';
import { isDemoMode } from '../lib/env';
import DemoAlertModal from '../components/DemoAlertModal';
import { useCurrency } from '../context/CurrencyContext';
import { calculateDynamicFare, FareCalculationResult } from '../lib/pricing';
import SpeedFleetAnimation from '../components/SpeedFleetAnimation';
import {
    getWeatherByCoordinates,
    isNightTime,
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
    isBusy?: boolean;
    isOnline?: boolean;
    isActiveVehicle?: boolean;
    registeredVehicles?: any[];
}

export interface PlacePrediction {
    place_id: string;
    description: string;
    structured_formatting: {
        main_text: string;
        secondary_text: string;
    };
    center: [number, number]; // [lng, lat]
}

// Helper to get initial map render center from the user's known address or cache
const getInitialMapCoordinates = (userAddresses?: any[]): { lat: number; lng: number } => {
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
    return { lat: DEFAULT_MAP_CENTER_LNG_LAT[1], lng: DEFAULT_MAP_CENTER_LNG_LAT[0] };
};

// Safe route duration formatter: never produces ~undefined min or ~NaN min
const formatDuration = (distanceKm?: number, durationStr?: string): string => {
    if (durationStr && typeof durationStr === 'string' && !durationStr.includes('undefined') && !durationStr.includes('NaN')) {
        return durationStr;
    }
    const dist = distanceKm && !isNaN(distanceKm) ? distanceKm : 1;
    const fallbackMins = Math.max(3, Math.round((dist / 28) * 60));
    return `~${fallbackMins} min`;
};

const defaultCenter: { lat: number; lng: number } = { lat: DEFAULT_MAP_CENTER_LNG_LAT[1], lng: DEFAULT_MAP_CENTER_LNG_LAT[0] };

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

export default function Taxi() {
    const { user, userData } = useAuth();
    const { branding } = useBranding();
    const { bcvRate } = useCurrency();
    const navigate = useNavigate();

    // 1. Mapbox Map instance and markers
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const driverMarkersRef = useRef<mapboxgl.Marker[]>([]);
    const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);

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
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [recipientPhoneDigits, setRecipientPhoneDigits] = useState('');
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
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    useEffect(() => {
        userLocationRef.current = userLocation;
    }, [userLocation]);
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
    const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
    const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

    // Nearby Drivers & Price Chip Selection (Autonomous Dispatch - No Manual Driver Selection)
    const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
    const [activeDriversCount, setActiveDriversCount] = useState({ moto: 0, carro: 0, ejecutivo: 0 });
    const [selectedPriceChip, setSelectedPriceChip] = useState<number | null>(null);
    const [requestedTripPrice, setRequestedTripPrice] = useState<number | null>(null);

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
                    styles: yangoDayMapStyles
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
                    .in('status', ['searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress', 'completed'])
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
                    // Find a genuinely active trip or a completed trip where payment is NOT yet confirmed
                    const trulyActiveReq = reqs.find((r: any) => {
                        const isDismissed = localStorage.getItem(`dismissed_trip_${r.id}`) === 'true';
                        if (isDismissed) return false;

                        const isPaymentConfirmed = r.payment_status === 'confirmed' || r.payment_status === 'paid' || r.driver_paid === true;
                        if (r.status === 'completed') {
                            return !isPaymentConfirmed;
                        }
                        return ['searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress'].includes(r.status);
                    });

                    if (trulyActiveReq) {
                        const isPendingCompletion = trulyActiveReq.status === 'completed';
                        if (isPendingCompletion || ['accepted', 'arriving', 'in_progress'].includes(trulyActiveReq.status)) {
                            setActiveService(trulyActiveReq);
                            navigate(`/taxi/track/${trulyActiveReq.id}`);
                            return;
                        } else {
                            setActiveService(trulyActiveReq);
                        }
                    } else {
                        // All trips are completed & confirmed or dismissed. Clear stale active_transport_req_id
                        if (activeLocalId) {
                            const stale = reqs.find((r: any) => r.id === activeLocalId);
                            if (stale && (stale.status === 'completed' || stale.status === 'cancelled')) {
                                localStorage.removeItem('active_transport_req_id');
                            }
                        }
                        setActiveService(null);
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

        window.addEventListener('transport_cycle_closed', checkActive);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('transport_cycle_closed', checkActive);
        };
    }, [user, navigate]);

    // 0.3 Realtime Driver Bids for Muchacho e' Mandao
    useEffect(() => {
        if (!activeMandadoReqId) return;

        const fetchBids = async () => {
            const { data } = await supabase
                .from('transport_bids')
                .select('*')
                .or(`transport_request_id.eq.${activeMandadoReqId},request_id.eq.${activeMandadoReqId}`)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            if (data) setMandadoBids(data);
        };

        fetchBids();

        const channel = supabase.channel(`taxi_page_bids_${activeMandadoReqId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'transport_bids'
            }, (payload: any) => {
                const b = payload.new || payload.old;
                if (!b || b.transport_request_id === activeMandadoReqId || b.request_id === activeMandadoReqId) {
                    fetchBids();
                }
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
                        pago_movil: { active: true }
                    });
                }
            } catch (err) {
                console.error("Configs fetch error:", err);
            }
        };
        fetchConfigs();
    }, []);

    // 2. Fetch Nearby Drivers
    const fetchNearbyDrivers = useCallback(async (pickupCoords?: { lat: number; lng: number }) => {
        try {
            const currentCoords = pickupCoords || userLocationRef.current || originRef.current || { lat: 8.9242, lng: -67.4292 };
            const { data: driversData, error: dErr } = await supabase
                .from('drivers')
                .select('id, full_name, vehicle_type, vehicle_brand, vehicle_model, vehicle_year, vehicle_color, vehicle_plate, current_location, availability, is_online, driver_fares, rating, total_trips, is_comfort_eligible, has_ac, has_thermal_bag, documents, vehicle_image_url, registered_vehicles, active_vehicle_id, city, status');

            if (dErr) {
                console.error("fetchNearbyDrivers Supabase error:", dErr);
            }

            const validDrivers: NearbyDriver[] = [];
            const counts = { moto: 0, carro: 0, ejecutivo: 0 };

            (driversData || []).forEach((d: any) => {
                const loc = d.current_location;
                let lat = currentCoords.lat;
                let lng = currentCoords.lng;
                let distKm = 3.0;
                let hasValidLoc = false;

                if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number' && !isNaN(loc.lat) && !isNaN(loc.lng)) {
                    const distMeters = calculateDistance(currentCoords.lat, currentCoords.lng, loc.lat, loc.lng);
                    distKm = Number((distMeters / 1000).toFixed(1));
                    lat = loc.lat;
                    lng = loc.lng;
                    hasValidLoc = true;
                }

                if (distKm <= 35 || !hasValidLoc) {
                    const isOnline = d.is_online === true || d.is_online === 'true' || d.is_online === 1;
                    const isDriverAvailable = isOnline && 
                        (d.availability === 'active' || d.availability === 'available' || d.status === 'available' || !d.availability) &&
                        d.status !== 'suspended' && d.status !== 'inactive' && d.status !== 'rejected';

                    const rawType = (d.vehicle_type || 'carro').toLowerCase();
                    const activeVType: 'moto' | 'carro' = rawType.includes('moto') ? 'moto' : 'carro';
                    const isActiveComfort = activeVType === 'carro' && Number(d.vehicle_year) >= 2016;
                    const eta = Math.max(2, Math.ceil(distKm * 3));
                    const photo = d.documents?.selfieUrl || d.photo_url || null;
                    const vehiclePhoto = d.vehicle_image_url || d.documents?.vehicleUrl || null;
                    const brand = d.vehicle_brand || '';
                    const model = d.vehicle_model || (activeVType === 'moto' ? 'Motocicleta' : 'Automóvil');
                    const fullVehicleModel = [brand, model].filter(Boolean).join(' ');

                    // 1. Vehículo Principal / Activo del conductor
                    validDrivers.push({
                        id: d.id,
                        fullName: d.full_name || 'Conductor',
                        vehicleType: activeVType,
                        lat: lat,
                        lng: lng,
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
                        isComfortEligible: isActiveComfort,
                        vehiclePhotoUrl: vehiclePhoto,
                        rating: d.rating ? Number(d.rating) : 5.0,
                        totalTrips: d.total_trips || 0,
                        driverFares: d.driver_fares || null,
                        availability: isDriverAvailable ? 'active' : 'busy',
                        isBusy: !isDriverAvailable,
                        isOnline: isOnline,
                        isActiveVehicle: true,
                        registeredVehicles: d.registered_vehicles || []
                    });

                    // Solo los vehículos activos de conductores online y disponibles suman unidades al radar
                    if (isDriverAvailable) {
                        counts[activeVType]++;
                        if (isActiveComfort) {
                            counts.ejecutivo++;
                        }
                    }

                    // 2. Un conductor solo puede tener 1 vehículo activo a la vez:
                    // Sus otros vehículos registrados aparecen en la plataforma en estatus "Ocupado"
                    const regVehicles: any[] = Array.isArray(d.registered_vehicles) ? d.registered_vehicles : [];
                    regVehicles.forEach((veh: any, idx: number) => {
                        const isThisActive = (d.active_vehicle_id && String(veh.id) === String(d.active_vehicle_id)) ||
                            (!d.active_vehicle_id && (veh.plate === d.vehicle_plate || veh.is_active));
                        if (!isThisActive) {
                            const rawVehType = (veh.type || 'carro').toLowerCase();
                            const vType: 'moto' | 'carro' = rawVehType.includes('moto') ? 'moto' : 'carro';
                            const isComfort = (vType === 'carro' && Number(veh.year) >= 2016);
                            const vBrand = veh.brand || '';
                            const vModel = veh.model || (vType === 'moto' ? 'Motocicleta' : 'Automóvil');
                            const fullVModel = [vBrand, vModel].filter(Boolean).join(' ');

                            validDrivers.push({
                                id: `${d.id}_veh_${veh.id || idx}`,
                                fullName: d.full_name || 'Conductor',
                                vehicleType: vType,
                                lat: lat,
                                lng: lng,
                                distanceKm: distKm,
                                etaMinutes: eta,
                                photoUrl: photo,
                                vehicleBrand: vBrand,
                                vehicleModel: fullVModel,
                                vehicleYear: veh.year || '',
                                vehiclePlate: veh.plate || 'S/P',
                                vehicleColor: veh.color || '',
                                hasAc: Boolean(veh.has_ac),
                                hasThermalBag: Boolean(veh.has_thermal_bag),
                                isComfortEligible: isComfort,
                                vehiclePhotoUrl: veh.photo_url || vehiclePhoto,
                                rating: d.rating ? Number(d.rating) : 5.0,
                                totalTrips: d.total_trips || 0,
                                driverFares: d.driver_fares || null,
                                availability: 'busy',
                                isBusy: true,
                                isOnline: isOnline,
                                isActiveVehicle: false
                            });
                        }
                    });
                }
            });

            // Solo conductores reales registrados y conectados en la base de datos Supabase
            setNearbyDrivers(validDrivers);
            setActiveDriversCount(counts);
        } catch (err) {
            console.error("fetchNearbyDrivers error:", err);
        }
    }, []);

    // 2.1 Realtime listener & automatic sync for Drivers in Supabase
    useEffect(() => {
        const driversChannel = supabase
            .channel('taxi_drivers_realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'drivers'
            }, () => {
                fetchNearbyDrivers();
            })
            .subscribe();

        // Carga inmediata en montaje y sondeo periódico cada 12 segundos
        fetchNearbyDrivers();
        const pollInterval = setInterval(() => {
            fetchNearbyDrivers();
        }, 12000);

        return () => {
            supabase.removeChannel(driversChannel);
            clearInterval(pollInterval);
        };
    }, [fetchNearbyDrivers]);

    // 3. Initialize Mapbox GL natively
    useEffect(() => {
        if (!mapDivRef.current || mapInstanceRef.current) return;

        try {
            mapboxgl.accessToken = getMapboxToken();
            const initialMapCenter = getInitialMapCoordinates(userData?.addresses);

            const map = new mapboxgl.Map({
                container: mapDivRef.current,
                style: MAPBOX_STYLE_DAY,
                center: [initialMapCenter.lng, initialMapCenter.lat],
                zoom: 16,
                minZoom: 10,
                maxZoom: 20,
                attributionControl: false
            });

            map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

            map.on('load', () => {
                setIsMapLoaded(true);
                map.resize();
            });

            // Map Click to Pick Origin or Destination
            map.on('click', async (e) => {
                vibrate(30);
                const clickPos = { lat: e.lngLat.lat, lng: e.lngLat.lng };
                let addr = `${clickPos.lat.toFixed(5)}, ${clickPos.lng.toFixed(5)}`;

                try {
                    const rev = await reverseGeocodeMapbox(clickPos);
                    if (rev) addr = rev;
                } catch (gErr) {}

                if (!originRef.current) {
                    const newOrigin = {
                        lat: clickPos.lat,
                        lng: clickPos.lng,
                        address: addr
                    };
                    setOrigin(newOrigin);
                    originRef.current = newOrigin;
                    setUserLocation(clickPos);
                    userLocationRef.current = clickPos;
                    fetchNearbyDrivers(clickPos);
                    toast.success('Punto de partida fijado con éxito');
                } else {
                    const newDest = {
                        lat: clickPos.lat,
                        lng: clickPos.lng,
                        address: addr
                    };
                    setDestination(newDest);
                    setSearchQuery(addr);
                    setStep('vehicle');
                }
            });

            if (userLocationRef.current) {
                map.flyTo({
                    center: [userLocationRef.current.lng, userLocationRef.current.lat],
                    zoom: 17,
                    duration: 600
                });
            }

            mapInstanceRef.current = map;

            // Auto resize observer for WebView and container sizing
            const resizeObserver = new ResizeObserver(() => {
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.resize();
                }
            });
            resizeObserver.observe(mapDivRef.current);

            return () => {
                resizeObserver.disconnect();
                if (userMarkerRef.current) userMarkerRef.current.remove();
                if (originMarkerRef.current) originMarkerRef.current.remove();
                if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
                driverMarkersRef.current.forEach(m => m.remove());
                driverMarkersRef.current = [];
                map.remove();
                mapInstanceRef.current = null;
            };
        } catch (e) {
            console.error("Error initializing Mapbox Map:", e);
        }
    }, []);

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

            // A) Try High Accuracy (GPS satellite) first with 6s timeout
            try {
                const pos = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 6000,
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
                        timeout: 5000,
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
        if (!coords && typeof navigator !== 'undefined' && navigator.geolocation) {
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

        // If NO EXACT LOCATION is available, notify user
        if (!coords) {
            toast('No pudimos fijar tu GPS automáticamente. Toca el mapa para indicar tu punto de partida', { icon: '📍', duration: 4000 });
            return;
        }

        setUserLocation(coords);
        userLocationRef.current = coords;
        fetchWeather(coords.lat, coords.lng);

        // CRITICAL FIX: SET ORIGIN IMMEDIATELY SO THE AMBER "ACTIVAR GPS" BANNER VANISHES INSTANTLY!
        const baseOriginAddr = knownAddress || `Mi ubicación GPS (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        const immediateOrigin: Location = {
            lat: coords.lat,
            lng: coords.lng,
            address: baseOriginAddr
        };
        setOrigin(immediateOrigin);
        originRef.current = immediateOrigin;
        localStorage.setItem('un2x3_exact_user_location', JSON.stringify(immediateOrigin));

        // Pan map
        if (mapInstanceRef.current && panTo) {
            mapInstanceRef.current.flyTo({
                center: [coords.lng, coords.lat],
                zoom: 17,
                duration: 600
            });
        }

        fetchNearbyDrivers(coords);

        // Reverse geocode asynchronously with Mapbox Geocoder to refine street address
        (async () => {
            try {
                if (coords) {
                    const rev = await reverseGeocodeMapbox(coords);
                    if (rev) {
                        const refined: Location = {
                            lat: coords.lat,
                            lng: coords.lng,
                            address: rev
                        };
                        setOrigin(refined);
                        originRef.current = refined;
                        localStorage.setItem('un2x3_exact_user_location', JSON.stringify(refined));
                    }
                }
            } catch (gErr) {
                console.warn('[Taxi] Mapbox Reverse Geocoder error:', gErr);
            }
        })();
    }, [fetchNearbyDrivers, fetchWeather]);

    // Always trigger GPS location immediately on mount
    useEffect(() => {
        locateUser(true);
    }, []);

    // Handle user tap on GPS button / Activar GPS
    const handleRequestGps = useCallback(async () => {
        vibrate(30);
        setIsLocating(true);
        if (Capacitor.isNativePlatform()) {
            try {
                const isHardwareOn = await isLocationHardwareEnabled();
                if (!isHardwareOn) {
                    toast('Abriendo ajustes de ubicación...', { icon: '⚙️' });
                    await openNativeLocationSettings();
                    setIsLocating(false);
                    return;
                }
            } catch (e) {}
            try {
                await promptEnableLocation();
            } catch (e) {}
        }
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

    // 5. Manage Markers on Map Updates (Mapbox GL)
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !isMapLoaded) return;

        // User GPS dot
        if (userLocation) {
            if (!userMarkerRef.current) {
                const el = document.createElement('div');
                el.className = 'w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg animate-pulse';
                userMarkerRef.current = new mapboxgl.Marker({ element: el })
                    .setLngLat([userLocation.lng, userLocation.lat])
                    .addTo(map);
            } else {
                userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
            }
        }

        // Origin Marker (Green Pin)
        if (origin) {
            if (!originMarkerRef.current) {
                const el = createOriginPinElement();
                originMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([origin.lng, origin.lat])
                    .addTo(map);
            } else {
                originMarkerRef.current.setLngLat([origin.lng, origin.lat]);
            }
        } else if (originMarkerRef.current) {
            originMarkerRef.current.remove();
            originMarkerRef.current = null;
        }

        // Destination Marker (Red Pin)
        if (destination) {
            if (!destinationMarkerRef.current) {
                const el = createDestinationPinElement();
                destinationMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([destination.lng, destination.lat])
                    .addTo(map);
            } else {
                destinationMarkerRef.current.setLngLat([destination.lng, destination.lat]);
            }
        } else if (destinationMarkerRef.current) {
            destinationMarkerRef.current.remove();
            destinationMarkerRef.current = null;
        }

        // Nearby Drivers Markers
        driverMarkersRef.current.forEach(m => m.remove());
        driverMarkersRef.current = nearbyDrivers
            .filter(d => !d.isBusy)
            .map(d => {
                const el = createDriverPinElement(d.vehicleType === 'moto' ? 'moto' : 'car');
                return new mapboxgl.Marker({ element: el, anchor: 'center' })
                    .setLngLat([d.lng, d.lat])
                    .addTo(map);
            });
    }, [userLocation, origin, destination, nearbyDrivers, isMapLoaded]);

    // 6. Calculate Route & Fit Bounds (Mapbox Directions API & GeoJSON Line)
    useEffect(() => {
        if (!origin || !destination) return;

        // Immediate straight-line and driving baseline so pricing is NEVER blocked
        const distMeters = calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng);
        const distKm = Number((distMeters / 1000).toFixed(1));
        const estimatedDuration = `~${Math.max(3, Math.round((distKm / 28) * 60))} min`;
        const roadEstimateKm = Math.max(0.8, Number((distKm * 1.2).toFixed(1)));

        setRouteInfo({
            distance: roadEstimateKm,
            duration: estimatedDuration
        });

        const map = mapInstanceRef.current;
        if (!map || !isMapLoaded) return;

        setIsCalculatingRoute(true);
        let isCancelled = false;

        getMapboxRoute(origin, destination).then((routeResult) => {
            setIsCalculatingRoute(false);
            if (isCancelled || !mapInstanceRef.current) return;

            if (routeResult) {
                const durationMinutes = routeResult.durationMin ?? routeResult.durationMinutes ?? Math.max(3, Math.round((routeResult.distanceKm / 28) * 60));
                setRouteInfo({
                    distance: routeResult.distanceKm,
                    duration: `~${durationMinutes} min`
                });

                const geojsonData: GeoJSON.Feature<GeoJSON.LineString> = {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: routeResult.coordinates
                    }
                };

                if (!map.getSource('taxi-route')) {
                    map.addSource('taxi-route', {
                        type: 'geojson',
                        data: geojsonData
                    });

                    map.addLayer({
                        id: 'taxi-route-casing',
                        type: 'line',
                        source: 'taxi-route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.85 }
                    });

                    map.addLayer({
                        id: 'taxi-route-line',
                        type: 'line',
                        source: 'taxi-route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': '#FF5D00', 'line-width': 5.5, 'line-opacity': 0.95 }
                    });
                } else {
                    (map.getSource('taxi-route') as mapboxgl.GeoJSONSource).setData(geojsonData);
                }

                // Fit bounds to show route nicely on screen
                map.fitBounds(routeResult.bounds, {
                    padding: { top: 80, bottom: 280, left: 35, right: 35 },
                    duration: 900
                });
            } else {
                const fallbackCoords: [number, number][] = [
                    [origin.lng, origin.lat],
                    [destination.lng, destination.lat]
                ];
                const fallbackGeoJson: GeoJSON.Feature<GeoJSON.LineString> = {
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: fallbackCoords }
                };

                if (!map.getSource('taxi-route')) {
                    map.addSource('taxi-route', { type: 'geojson', data: fallbackGeoJson });
                    map.addLayer({
                        id: 'taxi-route-line',
                        type: 'line',
                        source: 'taxi-route',
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: { 'line-color': '#FF5D00', 'line-width': 5 }
                    });
                } else {
                    (map.getSource('taxi-route') as mapboxgl.GeoJSONSource).setData(fallbackGeoJson);
                }

                const bounds = new mapboxgl.LngLatBounds();
                bounds.extend([origin.lng, origin.lat]);
                bounds.extend([destination.lng, destination.lat]);
                map.fitBounds(bounds, {
                    padding: { top: 80, bottom: 280, left: 35, right: 35 },
                    duration: 900
                });
            }
        });

        return () => {
            isCancelled = true;
        };
    }, [origin, destination, isMapLoaded]);

    // 7. Autocomplete Search Handler (Mapbox Geocoding Places API)
    const handleSearchChange = async (val: string) => {
        setSearchQuery(val);
        if (!val.trim() || val.length < 2) {
            setPredictions([]);
            return;
        }

        setIsSearchingPlaces(true);
        try {
            const center = origin || userLocation || defaultCenter;
            const places = await searchMapboxPlaces(val, center);
            const mapped: PlacePrediction[] = places.map((p) => {
                const parts = p.place_name.split(',');
                const main = p.name || (p as any).text || parts[0] || p.place_name;
                const secondary = parts.slice(1).join(',').trim() || '';
                return {
                    place_id: p.id,
                    description: p.place_name,
                    structured_formatting: {
                        main_text: main,
                        secondary_text: secondary
                    },
                    center: (p as any).center || [p.lng, p.lat]
                };
            });
            setPredictions(mapped);
        } catch (err) {
            console.error('Error searching places:', err);
            setPredictions([]);
        } finally {
            setIsSearchingPlaces(false);
        }
    };

    // 8. Select Autocomplete Prediction
    const handleSelectPrediction = (p: PlacePrediction) => {
        vibrate(30);
        setSearchQuery(p.structured_formatting?.main_text || p.description);
        setPredictions([]);

        const destLoc: Location = {
            lat: p.center[1], // latitude
            lng: p.center[0], // longitude
            address: p.structured_formatting?.main_text || p.description
        };
        setDestination(destLoc);

        if (!originRef.current) {
            const fallbackCoords = userLocationRef.current || defaultCenter;
            const autoOrigin: Location = {
                lat: fallbackCoords.lat,
                lng: fallbackCoords.lng,
                address: 'Mi ubicación actual'
            };
            setOrigin(autoOrigin);
            originRef.current = autoOrigin;
        }

        setStep('vehicle');
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
        const isMoto = driver.vehicleType === 'moto';
        const isComfort = isComfortCategory || (driver.vehicleType === 'carro' && (Boolean(driver.isComfortEligible) || Number(driver.vehicleYear) >= 2016));
        const isNight = isNightTime();

        // Safe baseline rates per segment (minimum per-km floor so prices don't stay at flat $1.50 for long distances):
        const minPerKm = isMoto ? 0.40 : isComfort ? 0.85 : 0.65;
        const defaultBase = isMoto ? 1.80 : isComfort ? 3.60 : 2.80;

        if (fares) {
            let base: number;
            let baseKm: number;
            let perKm: number;
            const isFlatModel = fares.model === 'flat' || fares.pricing_model === 'flat';

            if (isComfort && (Number(fares.comfort_base_fare_day) >= 0.50 || Number(fares.comfort_base_fare) >= 0.50)) {
                if (isNight) {
                    base = Number(fares.comfort_base_fare_night ?? fares.comfort_base_fare ?? 3.60);
                    baseKm = Math.min(6, Math.max(1, Number(fares.comfort_base_distance_night ?? fares.base_distance_night ?? fares.base_km ?? 2)));
                    perKm = Number(fares.comfort_extra_km_price_night ?? fares.comfort_per_km_fare ?? 0.95);
                } else {
                    base = Number(fares.comfort_base_fare_day ?? fares.comfort_base_fare ?? 3.20);
                    baseKm = Math.min(6, Math.max(1, Number(fares.comfort_base_distance_day ?? fares.base_distance_day ?? fares.base_km ?? 2)));
                    perKm = Number(fares.comfort_extra_km_price_day ?? fares.comfort_per_km_fare ?? 0.85);
                }
            } else {
                if (isNight) {
                    base = Number(fares.base_fare_night ?? (Number(fares.base_fare_day ?? fares.base_fare ?? defaultBase) * 1.25));
                    baseKm = Math.min(6, Math.max(1, Number(fares.base_distance_night ?? fares.base_distance_day ?? fares.base_km ?? 2)));
                    perKm = Number(fares.extra_km_price_night ?? (Number(fares.extra_km_price_day ?? fares.per_km_fare ?? minPerKm) * 1.25));
                } else {
                    base = Number(fares.base_fare_day ?? fares.base_fare ?? defaultBase);
                    baseKm = Math.min(6, Math.max(1, Number(fares.base_distance_day ?? fares.base_km ?? 2)));
                    perKm = Number(fares.extra_km_price_day ?? fares.per_km_fare ?? minPerKm);
                }
            }

            // Regla: Si el viaje supera los 2.0 km y el modelo es flat o la tarifa por km es insuficiente,
            // aplicar el cálculo progresivo por distancia real (base para primeros 2km + km adicional * tarifa por km)
            if (dist > 2.0) {
                if (isFlatModel || perKm < minPerKm) {
                    perKm = Math.max(perKm, minPerKm);
                }
                if (base < (isMoto ? 1.50 : 2.50)) {
                    base = isMoto ? 1.50 : 2.50;
                }
            }

            if (base >= 0.50) {
                const extraKm = Math.max(0, dist - baseKm);
                const total = base + (extraKm * perKm);
                return Math.max(0.50, Number(total.toFixed(2)));
            }
        }

        return parseFloat(calculatePrice(isComfort ? 'ejecutivo' : driver.vehicleType));
    }, [routeInfo, adminRates, activeDriversCount, weather, testRain, calculatePrice]);

    // Dynamic price calculation per segment using the closest active driver or platform rates
    const getSegmentPricing = useCallback((cat: 'mototaxi' | 'taxi_driver' | 'carro_confort' | 'moto_envios' | 'auto_envios') => {
        const isMoto = cat === 'mototaxi' || cat === 'moto_envios';
        const isComfort = cat === 'carro_confort';
        const tripDist = routeInfo ? routeInfo.distance : 1;

        // Si es Carro Confort, calculamos una tarifa proporcional y razonable (25% a 35% superior a Taxi Económico)
        if (isComfort) {
            const standardPricing = getSegmentPricing('taxi_driver');
            const matchingComfortDrivers = nearbyDrivers.filter(d => {
                if (d.isBusy || !d.isOnline) return false;
                const isAvail = (d as any).availability === 'active' || (d as any).availability === 'available' || (d as any).availability === undefined;
                if (!isAvail) return false;
                return d.vehicleType === 'carro' && (Boolean(d.isComfortEligible) || Number(d.vehicleYear) >= 2016);
            });
            matchingComfortDrivers.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));

            if (matchingComfortDrivers.length > 0) {
                const closestDriver = matchingComfortDrivers[0];
                const rawComfortPrice = calculateDriverTripPrice(closestDriver, tripDist, true);
                const minProportional = Number((standardPricing.effectivePrice * 1.20).toFixed(2));
                const maxProportional = Number((standardPricing.effectivePrice * 1.35).toFixed(2));
                const clampedPrice = Math.max(minProportional, Math.min(maxProportional, rawComfortPrice));

                return {
                    effectivePrice: clampedPrice,
                    uniquePrices: [clampedPrice],
                    closestDriver,
                    driversCount: matchingComfortDrivers.length,
                    hasDrivers: true
                };
            }

            // Fallback proporcional: exactamente 30% superior a Taxi Económico
            const fallbackComfortPrice = Number((standardPricing.effectivePrice * 1.30).toFixed(2));
            return {
                effectivePrice: fallbackComfortPrice,
                uniquePrices: [fallbackComfortPrice],
                closestDriver: null,
                driversCount: 0,
                hasDrivers: false
            };
        }

        const matchingDrivers = nearbyDrivers.filter(d => {
            if (d.isBusy || !d.isOnline) return false;
            const isAvail = (d as any).availability === 'active' || (d as any).availability === 'available' || (d as any).availability === undefined;
            if (!isAvail) return false;
            if (isMoto) return d.vehicleType === 'moto';
            return d.vehicleType === 'carro';
        });

        matchingDrivers.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));

        const fallbackRateCat = isMoto ? 'moto' : 'carro';
        const platformFallbackPrice = parseFloat(calculatePrice(fallbackRateCat)) || (isMoto ? 1.8 : 2.8);

        if (matchingDrivers.length === 0) {
            return {
                effectivePrice: platformFallbackPrice,
                uniquePrices: [platformFallbackPrice],
                closestDriver: null,
                driversCount: 0,
                hasDrivers: false
            };
        }

        const driverPrices = matchingDrivers
            .map(d => calculateDriverTripPrice(d, tripDist, false))
            .filter(p => !isNaN(p) && p > 0);

        const uniquePrices = Array.from(new Set(driverPrices)).sort((a, b) => a - b);
        const closestDriver = matchingDrivers[0];
        const closestPrice = calculateDriverTripPrice(closestDriver, tripDist, false);

        return {
            effectivePrice: closestPrice,
            uniquePrices,
            closestDriver,
            driversCount: matchingDrivers.length,
            hasDrivers: true
        };
    }, [nearbyDrivers, routeInfo, calculateDriverTripPrice, calculatePrice]);

    // Active pricing based on current user selection
    const currentActiveSegmentKey: 'mototaxi' | 'taxi_driver' | 'carro_confort' | 'moto_envios' | 'auto_envios' =
        mainMode === 'package'
            ? (vehicleType === 'moto' ? 'moto_envios' : 'auto_envios')
            : (selectedCategory === 'mototaxi' ? 'mototaxi' : selectedCategory === 'carro_confort' ? 'carro_confort' : 'taxi_driver');

    const activePricing = getSegmentPricing(currentActiveSegmentKey);
    const finalSelectedPrice = (selectedPriceChip !== null && activePricing.uniquePrices.includes(selectedPriceChip))
        ? selectedPriceChip
        : activePricing.effectivePrice;

    // Precio más bajo disponible en la plataforma (informativo para barra minimizada)
    const getLowestPlatformPrice = useCallback(() => {
        const motoPricing = getSegmentPricing('mototaxi');
        return motoPricing.effectivePrice.toFixed(2);
    }, [getSegmentPricing]);

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
                .or(`transport_request_id.eq.${reqId},request_id.eq.${reqId}`)
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
                    const compressedRef = await compressImage(data.referenceFile);
                    const ext = (compressedRef instanceof File ? compressedRef.name : data.referenceFile.name).split('.').pop() || 'jpg';
                    const refPath = `mandados/references/${validUserId || 'guest'}_${Date.now()}.${ext}`;
                    const uploadPromise = supabase.storage.from('store_assets').upload(refPath, compressedRef, {
                        contentType: (compressedRef instanceof File ? compressedRef.type : data.referenceFile.type) || 'image/jpeg',
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
                    lat: data.storeCoords?.lat || effectiveCoords.lat, 
                    lng: data.storeCoords?.lng || effectiveCoords.lng, 
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
                type: 'transport',
                vehicle_type: 'moto',
                total: 1.00,
                price: 1.00,
                fare: 1.00,
                driver_payout: Math.max(0, 1.00 - liveCommissions.mandao),
                commission_amount: liveCommissions.mandao,
                status: 'searching',
                payment_method: 'pago_movil',
                mandado_details: {
                    description: data.description,
                    storeName: data.storeName,
                    hasExactStores: data.hasExactStores,
                    storeAddresses: data.storeAddresses,
                    storeCoords: data.storeCoords,
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

        if (selectedCategory === 'delivery_envios' || mainMode === 'package') {
            if (!recipientName.trim()) {
                toast.error("Por favor ingresa el nombre de quién recibe (Destinatario)");
                return;
            }
            const rawDigits = (recipientPhoneDigits || recipientPhone).replace(/\D/g, '');
            if (!rawDigits || (rawDigits.startsWith('58') ? rawDigits.slice(2).length < 10 : rawDigits.length < 10)) {
                toast.error("Por favor ingresa un número de teléfono válido de 10 dígitos (Ej: 412 123 4567)");
                return;
            }
            if (!packageDescription.trim()) {
                toast.error("Por favor describe qué contiene o qué paquete vas a enviar");
                return;
            }
        }

        // Determine price, vehicle type and commission dynamically from liveCommissions
        const tripPriceToSave = finalSelectedPrice;
        setRequestedTripPrice(tripPriceToSave);
        try {
            localStorage.setItem('active_transport_price', String(tripPriceToSave));
        } catch (_) {}

        let commAmount = liveCommissions.taxi;
        let vType: 'moto' | 'carro' | 'ejecutivo' = 'carro';

        if (selectedCategory === 'mototaxi') {
            vType = 'moto';
            commAmount = liveCommissions.mototaxi;
        } else if (selectedCategory === 'taxi_driver') {
            vType = 'carro';
            commAmount = liveCommissions.taxi;
        } else if (selectedCategory === 'carro_confort') {
            vType = 'ejecutivo';
            commAmount = liveCommissions.confort;
        } else if (selectedCategory === 'delivery_envios') {
            vType = vehicleType === 'carro' ? 'carro' : 'moto';
            commAmount = liveCommissions.delivery;
        } else if (selectedCategory === 'muchacho_mandado') {
            vType = 'moto';
            commAmount = liveCommissions.mandao;
        }

        const driverPayoutVal = Math.max(0, parseFloat((tripPriceToSave - commAmount).toFixed(2)));

        try {
            setIsUploading(true);
            vibrate(50);

            // Valid user_id: MUST be null if guest, because Postgres user_id is a UUID!
            const validUserId = user?.id || user?.uid || null;
            const newReqId = safeUUID();

            let proofUrl = '';
            if (paymentProof && selectedPaymentMethod === 'pago_movil') {
                const compressedProof = await compressImage(paymentProof);
                const ext = (compressedProof instanceof File ? compressedProof.name : paymentProof.name).split('.').pop() || 'jpg';
                const path = `taxi_proofs/${validUserId || 'guest'}/${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(path, compressedProof, { upsert: true });
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
                total: tripPriceToSave,
                price: tripPriceToSave,
                fare: tripPriceToSave,
                driver_id: null,
                assigned_driver_id: null,
                driver_name: null,
                driver_phone: null,
                driver_photo: null,
                service_category: selectedCategory === 'delivery_envios' || mainMode === 'package' ? 'delivery_envios' : selectedCategory,
                vehicle_type: vType,
                type: 'transport',
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
                orderData.type = 'transport';
                orderData.service_category = 'muchacho_mandado';
                orderData.mandado_details = {
                    description: mandadoDescription,
                    storeName: mandadoStoreName || 'Comercio Local'
                };
            } else if (selectedCategory === 'delivery_envios' || mainMode === 'package') {
                orderData.type = 'transport';
                orderData.service_category = 'delivery_envios';
                orderData.package_description = packageDescription.trim();
                orderData.receiver_name = recipientName.trim();
                orderData.recipient_name = recipientName.trim();
                orderData.receiver_phone = recipientPhone.trim();
                orderData.recipient_phone = recipientPhone.trim();
                orderData.sender_name = orderData.user_name;
                orderData.sender_phone = orderData.user_phone;
                orderData.mandado_details = {
                    sender_name: orderData.user_name,
                    sender_phone: orderData.user_phone,
                    receiver_name: recipientName.trim(),
                    receiver_phone: recipientPhone.trim(),
                    recipient_name: recipientName.trim(),
                    recipient_phone: recipientPhone.trim(),
                    package_notes: packageDescription.trim(),
                    package_description: packageDescription.trim()
                };
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
            const errMsg = error?.message || error?.error_description || "No se pudo procesar la solicitud. Verifica los datos e intenta nuevamente.";
            toast.error(errMsg);
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
                fare: basePrice,
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
                                                        Llega en ~{bid.estimated_eta_minutes ?? bid.eta_minutes ?? 10} min
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end shrink-0 gap-1.5">
                                            <div className="text-right">
                                                <div className="text-xl font-black text-amber-400 leading-none">
                                                    ${Number(bid.offered_price ?? bid.amount ?? 0).toFixed(2)}
                                                </div>
                                                {bcvRate > 0 && (
                                                    <div className="text-[10px] font-bold text-slate-400">
                                                        {(Number(bid.offered_price ?? bid.amount ?? 0) * bcvRate).toFixed(0)} Bs
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
                        Conectando con los conductores más cercanos a tu ubicación en {branding.app_client_name || 'Un 2x3'} Taxi.
                    </p>

                    {routeInfo && (
                        <div className="mt-4 inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-xs font-bold">
                            <span>{routeInfo.distance} km</span>
                            <span>•</span>
                            <span>${(requestedTripPrice ?? finalSelectedPrice).toFixed(2)}</span>
                            {bcvRate > 0 && (
                                <>
                                    <span>•</span>
                                    <span className="text-primary">{((requestedTripPrice ?? finalSelectedPrice) * bcvRate).toFixed(2)} Bs</span>
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
            {/* 1. Full Screen Interactive Map (Official Google Maps Instance) */}
            <div
                ref={mapDivRef}
                className="absolute inset-0 z-0"
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            {/* Live Weather Rain Animation Canvas Overlay */}
            <RainOverlay
                isActive={Boolean(weather?.isRaining || testRain)}
                intensity={weather?.precipitationMm && weather.precipitationMm > 1 ? 'heavy' : 'moderate'}
            />

            {!isMapLoaded && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-100/90 backdrop-blur-sm">
                    <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-600">Iniciando Mapbox...</p>
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

                    {/* Main Options Cards - Grid 2x2 Recuadros Cuadrados Grandes */}
                    <div className="relative z-10 w-full max-w-md mx-auto my-auto py-1 flex-1 flex flex-col justify-center">
                        <div className="text-center mb-2.5">
                            <h3 className="text-base sm:text-lg font-black text-white tracking-tight leading-tight">
                                ¿Qué necesitas hoy?
                            </h3>
                            <p className="text-[10px] sm:text-[11px] text-slate-300 font-medium">
                                Selecciona una opción para comenzar tu solicitud personalizada
                            </p>
                        </div>

                        {/* Grid de 2 Columnas de Recuadros Cuadrados Grandes */}
                        <div className="grid grid-cols-2 gap-3 sm:gap-3.5 w-full">
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
                                className="w-full bg-primary hover:bg-[#f5f500] border-2 border-yellow-300/80 p-3 sm:p-3.5 rounded-3xl text-left shadow-lg shadow-yellow-500/15 active:scale-[0.98] transition-all group flex flex-col justify-between min-h-[165px] sm:min-h-[180px] aspect-square relative overflow-hidden transform-gpu"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-slate-950 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                                        <Car className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] sm:text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-primary tracking-wider shrink-0">
                                            Pasajeros
                                        </span>
                                        <div className="w-6 h-6 rounded-full bg-slate-950/10 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-primary transition-all shrink-0">
                                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-2">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-tight">
                                        Taxi / Mototaxi
                                    </h4>
                                    <p className="text-[9.5px] sm:text-[10px] text-slate-950/90 font-bold line-clamp-2 leading-snug mt-0.5">
                                        Mototaxi, Taxi Eco y Carro Confort con A/A
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1 mt-1.5 text-[8px] text-slate-950 font-black">
                                        <span className="bg-slate-950/10 px-1.5 py-0.5 rounded-md">Moto</span>
                                        <span className="bg-slate-950/10 px-1.5 py-0.5 rounded-md">Taxi</span>
                                        <span className="bg-slate-950/10 px-1.5 py-0.5 rounded-md">Confort</span>
                                    </div>
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
                                className="w-full bg-primary hover:bg-[#f5f500] border-2 border-yellow-300/80 p-3 sm:p-3.5 rounded-3xl text-left shadow-lg shadow-yellow-500/15 active:scale-[0.98] transition-all group flex flex-col justify-between min-h-[165px] sm:min-h-[180px] aspect-square relative overflow-hidden transform-gpu"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-slate-950 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                                        <Package className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] sm:text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-primary tracking-wider shrink-0">
                                            Express
                                        </span>
                                        <div className="w-6 h-6 rounded-full bg-slate-950/10 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-primary transition-all shrink-0">
                                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-2">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-tight">
                                        Envío de Paquete
                                    </h4>
                                    <p className="text-[9.5px] sm:text-[10px] text-slate-950/90 font-bold line-clamp-2 leading-snug mt-0.5">
                                        Encomiendas, documentos, llaves o paquetes
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1 mt-1.5 text-[8px] text-slate-950 font-black">
                                        <span className="bg-slate-950/10 px-1.5 py-0.5 rounded-md">Directo</span>
                                        <span className="bg-slate-950/10 px-1.5 py-0.5 rounded-md">Sin escalas</span>
                                    </div>
                                </div>
                            </button>

                            {/* Opción 3: PERSONAL SHOPPER (Anteriormente Muchacho e' Mandao) */}
                            <button
                                type="button"
                                onClick={() => {
                                    vibrate(30);
                                    setIsMandadoModalOpen(true);
                                }}
                                className="w-full bg-primary hover:bg-[#f5f500] border-2 border-yellow-300/80 p-3 sm:p-3.5 rounded-3xl text-left shadow-lg shadow-yellow-500/15 active:scale-[0.98] transition-all group flex flex-col justify-between min-h-[165px] sm:min-h-[180px] aspect-square relative overflow-hidden transform-gpu"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-slate-950 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md">
                                        <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] sm:text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-primary tracking-wider shrink-0">
                                            Diligencias
                                        </span>
                                        <div className="w-6 h-6 rounded-full bg-slate-950/10 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-primary transition-all shrink-0">
                                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-2">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-tight">
                                        PERSONAL SHOPPER
                                    </h4>
                                    <p className="text-[9.5px] sm:text-[10px] text-slate-950/90 font-bold line-clamp-2 leading-snug mt-0.5">
                                        Compras, pagos y diligencias a tu medida
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1 mt-1.5 text-[8px] text-slate-950 font-black">
                                        <span className="bg-slate-950/10 px-1.5 py-0.5 rounded-md">Compras</span>
                                        <span className="bg-slate-950/10 px-1.5 py-0.5 rounded-md">Trámites</span>
                                    </div>
                                </div>
                            </button>

                            {/* Opción 4: Transporte Rápido */}
                            <button
                                type="button"
                                onClick={() => {
                                    vibrate(40);
                                    setIsQuickTransportModalOpen(true);
                                }}
                                className="w-full bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-950 border-2 border-white/80 p-3 sm:p-3.5 rounded-3xl text-left shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all group flex flex-col justify-between min-h-[165px] sm:min-h-[180px] aspect-square relative overflow-hidden transform-gpu"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-slate-950 text-yellow-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-md relative">
                                        <Zap className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse text-yellow-400 fill-yellow-400" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] sm:text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-950 text-yellow-400 tracking-wider shrink-0 shadow-sm flex items-center gap-0.5">
                                            ⚡ 1 Toque
                                        </span>
                                        <div className="w-6 h-6 rounded-full bg-slate-950/15 text-slate-950 flex items-center justify-center group-hover:bg-slate-950 group-hover:text-yellow-400 transition-all shrink-0">
                                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-2">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-tight">
                                        Transporte Rápido
                                    </h4>
                                    <p className="text-[9.5px] sm:text-[10px] text-slate-950/90 font-bold line-clamp-2 leading-snug mt-0.5">
                                        Pide en segundos con radar masivo sin esperas
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1 mt-1.5 text-[8px] text-slate-950 font-black">
                                        <span className="bg-slate-950/15 px-1.5 py-0.5 rounded-md">GPS Inmediato</span>
                                        <span className="bg-slate-950/15 px-1.5 py-0.5 rounded-md">Radar 2x3</span>
                                    </div>
                                </div>
                            </button>
                        </div>
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
                                                : 'Transpórtate en un 2x3'}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-500 truncate">
                                            {routeInfo ? `${routeInfo.distance} km • ${formatDuration(routeInfo.distance, routeInfo.duration)}` : 'Calculando ruta...'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-sm font-black text-slate-950">
                                        {mainMode === 'mandado' ? 'Subasta' : `$${getLowestPlatformPrice()}`}
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
                                        disabled={isLocating}
                                        className="px-2.5 py-1 bg-amber-500 text-slate-950 rounded-lg font-black text-[11px] shadow-sm active:scale-95 transition-transform flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        {isLocating && <Loader2 className="w-3 h-3 animate-spin" />}
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
                                                    const dest = {
                                                        lat: addr.lat,
                                                        lng: addr.lng,
                                                        address: addr.address || addr.name
                                                    };
                                                    setDestination(dest);
                                                    setSearchQuery(dest.address);
                                                    if (!originRef.current) {
                                                        const fallbackCoords = userLocationRef.current || defaultCenter;
                                                        const autoOrigin: Location = {
                                                            lat: fallbackCoords.lat,
                                                            lng: fallbackCoords.lng,
                                                            address: 'Mi ubicación actual'
                                                        };
                                                        setOrigin(autoOrigin);
                                                        originRef.current = autoOrigin;
                                                    }
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
                                disabled={!destination}
                                onClick={() => {
                                    vibrate(30);
                                    if (!originRef.current) {
                                        const fallbackCoords = userLocationRef.current || defaultCenter;
                                        const autoOrigin: Location = {
                                            lat: fallbackCoords.lat,
                                            lng: fallbackCoords.lng,
                                            address: 'Mi ubicación actual'
                                        };
                                        setOrigin(autoOrigin);
                                        originRef.current = autoOrigin;
                                    }
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
                                        {routeInfo ? `${routeInfo.distance} km • ${formatDuration(routeInfo.distance, routeInfo.duration)}` : 'Calculando ruta...'}
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
                                {mainMode === 'taxi' && (() => {
                                    const motoPricing = getSegmentPricing('mototaxi');
                                    const carroPricing = getSegmentPricing('taxi_driver');
                                    const ejecutivoPricing = getSegmentPricing('carro_confort');

                                    const motoPrice = selectedCategory === 'mototaxi' && selectedPriceChip !== null && motoPricing.uniquePrices.includes(selectedPriceChip)
                                        ? selectedPriceChip
                                        : motoPricing.effectivePrice;
                                    const carroPrice = selectedCategory === 'taxi_driver' && selectedPriceChip !== null && carroPricing.uniquePrices.includes(selectedPriceChip)
                                        ? selectedPriceChip
                                        : carroPricing.effectivePrice;
                                    const ejecutivoPrice = selectedCategory === 'carro_confort' && selectedPriceChip !== null && ejecutivoPricing.uniquePrices.includes(selectedPriceChip)
                                        ? selectedPriceChip
                                        : ejecutivoPricing.effectivePrice;

                                    return (
                                        <>
                                            {/* 1. Mototaxi */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('mototaxi');
                                                    setVehicleType('moto');
                                                    setSelectedPriceChip(null);
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
                                                <span className="text-[9px] text-emerald-600 font-bold">2-3 min</span>
                                                <span className="text-xs font-black text-slate-900 mt-0.5 leading-tight">
                                                    ${motoPrice.toFixed(2)}
                                                </span>
                                                {bcvRate > 0 && (
                                                    <span className="text-[8px] font-bold text-slate-500 truncate max-w-full px-0.5">
                                                        {(motoPrice * bcvRate).toFixed(0)} Bs
                                                    </span>
                                                )}
                                            </button>

                                            {/* 2. Taxi Económico */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('taxi_driver');
                                                    setVehicleType('carro');
                                                    setSelectedPriceChip(null);
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
                                                <span className={`text-[9px] font-bold ${selectedCategory === 'taxi_driver' ? 'text-slate-900' : 'text-emerald-600'}`}>3-5 min</span>
                                                <span className="text-xs font-black mt-0.5 leading-tight">
                                                    ${carroPrice.toFixed(2)}
                                                </span>
                                                {bcvRate > 0 && (
                                                    <span className={`text-[8px] font-bold truncate max-w-full px-0.5 ${selectedCategory === 'taxi_driver' ? 'text-slate-800' : 'text-slate-500'}`}>
                                                        {(carroPrice * bcvRate).toFixed(0)} Bs
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
                                                    setSelectedPriceChip(null);
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
                                                <span className={`text-[11px] font-black truncate max-w-full ${selectedCategory === 'carro_confort' ? 'text-white' : 'text-slate-900'}`}>Carro Confort</span>
                                                <span className="text-[9px] text-amber-400 font-bold">≥ 2016</span>
                                                <span className={`text-xs font-black mt-0.5 leading-tight ${selectedCategory === 'carro_confort' ? 'text-white' : 'text-slate-900'}`}>
                                                    ${ejecutivoPrice.toFixed(2)}
                                                </span>
                                                {bcvRate > 0 && (
                                                    <span className={`text-[8px] font-bold truncate max-w-full px-0.5 ${selectedCategory === 'carro_confort' ? 'text-slate-300' : 'text-slate-500'}`}>
                                                        {(ejecutivoPrice * bcvRate).toFixed(0)} Bs
                                                    </span>
                                                )}
                                            </button>
                                        </>
                                    );
                                })()}

                                {mainMode === 'package' && (() => {
                                    const motoEnviosPricing = getSegmentPricing('moto_envios');
                                    const autoEnviosPricing = getSegmentPricing('auto_envios');

                                    const motoPrice = vehicleType === 'moto' && selectedPriceChip !== null && motoEnviosPricing.uniquePrices.includes(selectedPriceChip)
                                        ? selectedPriceChip
                                        : motoEnviosPricing.effectivePrice;
                                    const autoPrice = vehicleType === 'carro' && selectedPriceChip !== null && autoEnviosPricing.uniquePrices.includes(selectedPriceChip)
                                        ? selectedPriceChip
                                        : autoEnviosPricing.effectivePrice;

                                    return (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('delivery_envios');
                                                    setVehicleType('moto');
                                                    setSelectedPriceChip(null);
                                                }}
                                                className={`flex-1 min-w-[145px] flex items-center gap-3 py-3 px-3.5 rounded-2xl border-2 transition-all text-left ${
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
                                                    <p className="text-xs font-black text-blue-700 mt-0.5 leading-tight">
                                                        ${motoPrice.toFixed(2)}
                                                    </p>
                                                    {bcvRate > 0 && (
                                                        <p className="text-[9px] font-bold text-slate-500 truncate">
                                                            {(motoPrice * bcvRate).toFixed(0)} Bs
                                                        </p>
                                                    )}
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(30);
                                                    setSelectedCategory('delivery_envios');
                                                    setVehicleType('carro');
                                                    setSelectedPriceChip(null);
                                                }}
                                                className={`flex-1 min-w-[145px] flex items-center gap-3 py-3 px-3.5 rounded-2xl border-2 transition-all text-left ${
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
                                                    <p className="text-xs font-black text-blue-700 mt-0.5 leading-tight">
                                                        ${autoPrice.toFixed(2)}
                                                    </p>
                                                    {bcvRate > 0 && (
                                                        <p className="text-[9px] font-bold text-slate-500 truncate">
                                                            {(autoPrice * bcvRate).toFixed(0)} Bs
                                                        </p>
                                                    )}
                                                </div>
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

                            {/* Price Chips when multiple rates are available in the selected category */}
                            {mainMode !== 'mandado' && activePricing.uniquePrices.length > 1 && (
                                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 space-y-2 animate-in fade-in">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                                            Opciones de tarifa en tu zona ({activePricing.uniquePrices.length}):
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-bold">
                                            Selecciona el monto a ofertar
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {activePricing.uniquePrices.map((price) => {
                                            const isSelected = finalSelectedPrice === price;
                                            return (
                                                <button
                                                    key={price}
                                                    type="button"
                                                    onClick={() => {
                                                        vibrate(20);
                                                        setSelectedPriceChip(price);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 ${
                                                        isSelected
                                                            ? 'bg-amber-400 text-slate-950 shadow-md ring-2 ring-amber-400/40 scale-105'
                                                            : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                                                    }`}
                                                >
                                                    <span>${price.toFixed(2)}</span>
                                                    {bcvRate > 0 && (
                                                        <span className={`text-[9px] font-bold ${isSelected ? 'text-slate-800' : 'text-slate-400'}`}>
                                                            ({(price * bcvRate).toFixed(0)} Bs)
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

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
                                <div className="space-y-3 bg-blue-50/90 border-2 border-blue-200 rounded-2xl p-3.5 animate-in fade-in shadow-xs">
                                    <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                                        <div className="flex items-center gap-2 text-xs text-blue-950 font-black">
                                            <Package className="w-4 h-4 text-blue-600 shrink-0" />
                                            <span>Ficha de Encomienda / Paquete</span>
                                        </div>
                                        <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                            Obligatorio
                                        </span>
                                    </div>

                                    {/* Destinatario */}
                                    <div className="space-y-1.5">
                                        <span className="text-[10px] font-black uppercase text-blue-900 tracking-wider block">
                                            👤 Destinatario (Quién Recibe el Paquete):
                                        </span>
                                        <div className="space-y-1.5">
                                            <input
                                                type="text"
                                                placeholder="Nombre completo de quien recibe *"
                                                value={recipientName}
                                                onChange={(e) => setRecipientName(e.target.value)}
                                                className="w-full bg-white border border-blue-200 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-400 placeholder:text-slate-400"
                                            />
                                            {/* Locked +58 country code input */}
                                            <div className="flex items-center w-full bg-white border border-blue-200 rounded-xl overflow-hidden focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                                                <div className="flex items-center gap-1.5 bg-blue-100/70 border-r border-blue-200 px-3 py-2.5 text-xs font-black text-blue-950 shrink-0 select-none">
                                                    <span>🇻🇪</span>
                                                    <span className="font-mono text-blue-900 font-black">+58</span>
                                                </div>
                                                <input
                                                    type="tel"
                                                    placeholder="412 1234567 (10 dígitos) *"
                                                    value={recipientPhoneDigits}
                                                    onChange={(e) => {
                                                        let digits = e.target.value.replace(/\D/g, '');
                                                        if (digits.startsWith('58')) digits = digits.slice(2);
                                                        if (digits.startsWith('0')) digits = digits.slice(1);
                                                        digits = digits.slice(0, 10);
                                                        setRecipientPhoneDigits(digits);
                                                        setRecipientPhone(digits ? `+58${digits}` : '');
                                                    }}
                                                    maxLength={11}
                                                    className="w-full bg-transparent px-3 py-2.5 text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400 font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Detalle del paquete */}
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black uppercase text-blue-900 tracking-wider block">
                                            📦 ¿Qué paquete o artículo envías? *
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Ej: Comida preparada, documentos, llaves, paquete..."
                                            value={packageDescription}
                                            onChange={(e) => setPackageDescription(e.target.value)}
                                            className="w-full bg-white border border-blue-200 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-400 placeholder:text-slate-400"
                                        />
                                    </div>
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
                            {mainMode === 'package' ? (
                                <div className="space-y-1.5">
                                    <button
                                        onClick={handleRequestTaxi}
                                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-600/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Package className="w-4 h-4" />
                                        <span>Enviar encomienda</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                    <p className="text-[10px] text-center text-slate-500 font-medium">
                                        📦 Ideal para emprendedores, paquetes, documentos, regalos y más
                                    </p>
                                </div>
                            ) : (
                                <button
                                    onClick={handleRequestTaxi}
                                    className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-black font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-yellow-400/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <span>
                                        {mainMode === 'mandado'
                                            ? 'Solicitar Mandado • Iniciar Subasta'
                                            : 'Pedir Taxi'}
                                    </span>
                                    <ArrowRight className="w-4 h-4 text-black" />
                                </button>
                            )}
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
                                (() => {
                                    const isMotoAvail = (activeDriversCount?.moto || 0) > 0;
                                    const isCarroAvail = (activeDriversCount?.carro || 0) > 0;
                                    const isConfortAvail = (activeDriversCount?.ejecutivo || 0) > 0;

                                    return (
                                        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-2">
                                            {/* Opción 1: Moto */}
                                            <button
                                                type="button"
                                                disabled={!isMotoAvail}
                                                onClick={() => isMotoAvail && handleQuickTransport('moto')}
                                                className={`flex flex-col items-center justify-between p-3 border-2 rounded-3xl transition-all text-center group shadow-sm ${
                                                    isMotoAvail
                                                        ? 'bg-gradient-to-b from-amber-50/50 to-white hover:to-amber-50 border-slate-200 hover:border-amber-400 active:scale-95 hover:shadow-md cursor-pointer'
                                                        : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                                                }`}
                                            >
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 shadow-inner transition-all ${
                                                    isMotoAvail
                                                        ? 'bg-amber-400/20 text-slate-950 group-hover:scale-110 group-hover:bg-amber-400'
                                                        : 'bg-slate-200 text-slate-400'
                                                }`}>
                                                    <Bike className="w-6 h-6 text-slate-950" />
                                                </div>
                                                <span className="text-xs sm:text-sm font-black text-slate-950 tracking-tight">
                                                    Moto
                                                </span>
                                                <div className={`mt-1 px-1.5 py-0.5 rounded-full border ${
                                                    isMotoAvail ? 'bg-amber-100/80 border-amber-200' : 'bg-slate-200 border-slate-300'
                                                }`}>
                                                    <p className={`text-[10px] sm:text-xs font-black ${isMotoAvail ? 'text-amber-950' : 'text-slate-500'}`}>
                                                        {isMotoAvail ? 'Desde $0.50' : 'Ocupado'}
                                                    </p>
                                                </div>
                                                {bcvRate && isMotoAvail ? (
                                                    <span className="text-[9px] text-slate-500 font-bold mt-0.5">
                                                        ~Bs. {(0.50 * bcvRate).toFixed(0)}
                                                    </span>
                                                ) : null}
                                                <span className={`mt-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                                                    isMotoAvail ? 'text-amber-700 bg-amber-50' : 'text-slate-500 bg-slate-200'
                                                }`}>
                                                    {isMotoAvail ? '⚡ Ágil' : 'Ocupado'}
                                                </span>
                                            </button>

                                            {/* Opción 2: Carro Económico */}
                                            <button
                                                type="button"
                                                disabled={!isCarroAvail}
                                                onClick={() => isCarroAvail && handleQuickTransport('carro')}
                                                className={`flex flex-col items-center justify-between p-3 border-2 rounded-3xl transition-all text-center group shadow-sm ${
                                                    isCarroAvail
                                                        ? 'bg-gradient-to-b from-blue-50/40 to-white hover:to-blue-50 border-slate-200 hover:border-blue-500 active:scale-95 hover:shadow-md cursor-pointer'
                                                        : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                                                }`}
                                            >
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 shadow-inner transition-all ${
                                                    isCarroAvail
                                                        ? 'bg-blue-500/15 text-slate-950 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white'
                                                        : 'bg-slate-200 text-slate-400'
                                                }`}>
                                                    <Car className="w-6 h-6 text-slate-950" />
                                                </div>
                                                <span className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-tight">
                                                    Carro Económico
                                                </span>
                                                <div className={`mt-1 px-1.5 py-0.5 rounded-full border ${
                                                    isCarroAvail ? 'bg-blue-100/80 border-blue-200' : 'bg-slate-200 border-slate-300'
                                                }`}>
                                                    <p className={`text-[10px] sm:text-xs font-black ${isCarroAvail ? 'text-blue-950' : 'text-slate-500'}`}>
                                                        {isCarroAvail ? 'Desde $1.50' : 'Ocupado'}
                                                    </p>
                                                </div>
                                                {bcvRate && isCarroAvail ? (
                                                    <span className="text-[9px] text-slate-500 font-bold mt-0.5">
                                                        ~Bs. {(1.50 * bcvRate).toFixed(0)}
                                                    </span>
                                                ) : null}
                                                <span className={`mt-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                                                    isCarroAvail ? 'text-blue-700 bg-blue-50' : 'text-slate-500 bg-slate-200'
                                                }`}>
                                                    {isCarroAvail ? '🚗 Diario' : 'Ocupado'}
                                                </span>
                                            </button>

                                            {/* Opción 3: Carro Confort */}
                                            <button
                                                type="button"
                                                disabled={!isConfortAvail}
                                                onClick={() => isConfortAvail && handleQuickTransport('confort')}
                                                className={`flex flex-col items-center justify-between p-3 border-2 rounded-3xl transition-all text-center group shadow-sm ${
                                                    isConfortAvail
                                                        ? 'bg-gradient-to-b from-purple-50/40 to-white hover:to-purple-50 border-slate-200 hover:border-purple-500 active:scale-95 hover:shadow-md cursor-pointer'
                                                        : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                                                }`}
                                            >
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 shadow-inner transition-all ${
                                                    isConfortAvail
                                                        ? 'bg-purple-500/15 text-slate-950 group-hover:scale-110 group-hover:bg-purple-600 group-hover:text-white'
                                                        : 'bg-slate-200 text-slate-400'
                                                }`}>
                                                    <Sparkles className="w-6 h-6 text-purple-700" />
                                                </div>
                                                <span className="text-xs sm:text-sm font-black text-slate-950 tracking-tight leading-tight">
                                                    Carro Confort
                                                </span>
                                                <div className={`mt-1 px-1.5 py-0.5 rounded-full border ${
                                                    isConfortAvail ? 'bg-purple-100/80 border-purple-200' : 'bg-slate-200 border-slate-300'
                                                }`}>
                                                    <p className={`text-[10px] sm:text-xs font-black ${isConfortAvail ? 'text-purple-950' : 'text-slate-500'}`}>
                                                        {isConfortAvail ? 'Desde $2.50' : 'Ocupado'}
                                                    </p>
                                                </div>
                                                {bcvRate && isConfortAvail ? (
                                                    <span className="text-[9px] text-slate-500 font-bold mt-0.5">
                                                        ~Bs. {(2.50 * bcvRate).toFixed(0)}
                                                    </span>
                                                ) : null}
                                                <span className={`mt-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                                                    isConfortAvail ? 'text-purple-700 bg-purple-50' : 'text-slate-500 bg-slate-200'
                                                }`}>
                                                    {isConfortAvail ? '⭐ VIP / A/C' : 'Ocupado'}
                                                </span>
                                            </button>
                                        </div>
                                    );
                                })()
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

        </div>
    );
}
