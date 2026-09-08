import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Car, Bike, MapPin, Navigation, ArrowRight, ArrowLeft, CheckCircle2, X, Heart, History, Star, Wallet, Upload, Copy, Check, Calendar, Clock as ClockIcon, Package, Search, Loader2 } from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { UN2X3_LOGO } from '../lib/env';
import toast from 'react-hot-toast';
import { calculateDistance } from '../lib/geo';
import { vibrate } from '../utils/haptics';
import { isDemoMode } from '../lib/env';
import DemoAlertModal from '../components/DemoAlertModal';
import LocationRequiredModal from '../components/LocationRequiredModal';
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

const mapContainerStyle = {
    width: '100%',
    height: '100%',
    position: 'relative' as 'relative'
};

const defaultCenter = {
    lat: 10.4806, // Caracas, Venezuela
    lng: -66.9036
};

// Custom map theme to hide default POIs
const mapOptions: any = {
    disableDefaultUI: true,
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    clickableIcons: false
};

export default function Taxi() {
    const { user, userData } = useAuth();
    const { bcvRate } = useCurrency();
    const navigate = useNavigate();

    useEffect(() => {
        console.log('Taxi component mounted');
    }, []);

    // Map instances and services with user's verified Google Maps API Key and Places
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES
    });

    // States for components (Delivery UI)
    const [activeTab, setActiveTab] = useState<'map' | 'chat'>('map');
    const [rideStatus, setRideStatus] = useState<string>('idle'); // idle -> searching -> assigned -> arrived -> in_transit -> completed
    const [watchId, setWatchId] = useState<number | null>(null);

    useEffect(() => {
        console.log('Google Maps isLoaded:', isLoaded);
    }, [isLoaded]);

    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
    const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
    const [step, setStep] = useState<'service_type' | 'package_details' | 'origin' | 'destination' | 'vehicle' | 'payment' | 'searching'>('service_type');
    const [serviceCategory, setServiceCategory] = useState<'transport' | 'package'>('transport');
    const [packageDescription, setPackageDescription] = useState('');

    const [origin, setOrigin] = useState<Location | null>(null);
    const [destination, setDestination] = useState<Location | null>(null);
    const [currentCenter, setCurrentCenter] = useState(defaultCenter);
    const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
    const [isDragging, setIsDragging] = useState(false);


    const [routeInfo, setRouteInfo] = useState<{ distance: number, duration: string } | null>(null);

    const [vehicleType, setVehicleType] = useState<'moto' | 'carro' | 'ejecutivo' | null>(null);
    const [adminRates, setAdminRates] = useState<any>(null);
    const [paymentMethods, setPaymentMethods] = useState<any>(null);
    const [serviceHours, setServiceHours] = useState<any>(null);

    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
    const [paymentProof, setPaymentProof] = useState<File | null>(null);
    const [paymentRef, setPaymentRef] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
    const [routeCalculationAttempted, setRouteCalculationAttempted] = useState(false);
    
    // Reservation State
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledDateTime, setScheduledDateTime] = useState('');

    const [showGuestModal, setShowGuestModal] = useState(false);
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestCedula, setGuestCedula] = useState('');

    const [showDemoAlert, setShowDemoAlert] = useState(false);
    const [showTaxiNotice, setShowTaxiNotice] = useState(false);
    const [showLocationModal, setShowLocationModal] = useState(false);

    // Check location permission on mount
    useEffect(() => {
        if (userData && !userData.locationPermissionsAllowed) {
            setShowLocationModal(true);
        }
    }, [userData]);
    const [activeDrivers, setActiveDrivers] = useState<{ moto: number, carro: number, ejecutivo: number }>({ moto: 1, carro: 1, ejecutivo: 1 });
    
    // Nearby Drivers State (economizing API calls - only fetched when user chooses destination/pickup)
    const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
    const [isFetchingDrivers, setIsFetchingDrivers] = useState(false);

    // Google Places Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
    const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
    const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);

    const isFollowingUser = useRef(false);
    const [isFollowingUserState, setIsFollowingUserState] = useState(false);
    const watchIdRef = useRef<number | null>(null);
    const geocoderRef = useRef<google.maps.Geocoder | null>(null);
    const mapCenterRef = useRef(defaultCenter);

    // On-demand nearby drivers fetch (economizing API calls and database hits)
    const fetchNearbyDrivers = useCallback(async (pickupCoords: { lat: number; lng: number }) => {
        setIsFetchingDrivers(true);
        try {
            // First check main 'drivers' table
            let { data: driversData } = await supabase
                .from('drivers')
                .select('id, full_name, vehicle_type, current_location, availability, is_online')
                .eq('is_online', true);

            // Fallback to 'delivery_drivers' if drivers table is empty
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
                if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                    const distMeters = calculateDistance(pickupCoords.lat, pickupCoords.lng, loc.lat, loc.lng);
                    const distKm = Number((distMeters / 1000).toFixed(1));
                    if (distKm <= 20) {
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

            // If in demo mode or no live drivers nearby in testing area, provide realistic mock drivers
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
                        etaMinutes: 4
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
                setActiveDrivers({ moto: 1, carro: 1, ejecutivo: 1 });
            } else {
                setNearbyDrivers(validDrivers);
                setActiveDrivers(counts);
            }
        } catch (err) {
            console.error("fetchNearbyDrivers error:", err);
        } finally {
            setIsFetchingDrivers(false);
        }
    }, []);

    // Fetch initial location and nearby drivers on mount
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setUserLocation(newPos);
                    setCurrentCenter(newPos);
                    fetchNearbyDrivers(newPos);
                },
                (err) => {
                    console.error("Initial location fetch error:", err);
                    fetchNearbyDrivers(defaultCenter);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            fetchNearbyDrivers(defaultCenter);
        }
    }, [fetchNearbyDrivers]);

    // Autocomplete input handler
    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        if (!val.trim() || val.length < 2) {
            setPredictions([]);
            return;
        }

        if (!window.google?.maps?.places) return;

        if (!autocompleteServiceRef.current) {
            autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
        }

        setIsSearchingPlaces(true);
        const center = userLocation || currentCenter;

        autocompleteServiceRef.current.getPlacePredictions(
            {
                input: val,
                componentRestrictions: { country: 've' },
                locationBias: new window.google.maps.LatLng(center.lat, center.lng),
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

    // Autocomplete select handler
    const handleSelectPrediction = (prediction: google.maps.places.AutocompletePrediction) => {
        vibrate(30);
        setSearchQuery(prediction.structured_formatting?.main_text || prediction.description);
        setPredictions([]);

        if (!geocoderRef.current && window.google?.maps?.Geocoder) {
            geocoderRef.current = new window.google.maps.Geocoder();
        }

        if (geocoderRef.current) {
            geocoderRef.current.geocode({ placeId: prediction.place_id }, (results, status) => {
                if (status === 'OK' && results && results[0]) {
                    const geom = results[0].geometry.location;
                    const destLoc = {
                        lat: geom.lat(),
                        lng: geom.lng(),
                        address: prediction.structured_formatting?.main_text || results[0].formatted_address
                    };
                    setDestination(destLoc);

                    const pickup = origin || userLocation || currentCenter;
                    const originLoc = {
                        lat: pickup.lat,
                        lng: pickup.lng,
                        address: origin?.address || 'Tu ubicación actual'
                    };
                    setOrigin(originLoc);

                    if (map) {
                        const bounds = new window.google.maps.LatLngBounds();
                        bounds.extend({ lat: originLoc.lat, lng: originLoc.lng });
                        bounds.extend({ lat: destLoc.lat, lng: destLoc.lng });
                        map.fitBounds(bounds, { top: 80, bottom: 260, left: 40, right: 40 });
                    }

                    // On-demand fetch of nearby drivers only when destination is picked
                    fetchNearbyDrivers(originLoc);

                    setStep('vehicle');
                } else {
                    toast.error("No se pudo obtener la ubicación de ese lugar.");
                }
            });
        }
    };

    const [activeReservations, setActiveReservations] = useState<any[]>([]);

    // 0. Check for active transport request
    useEffect(() => {
        if (!user) return;
        const uid = user.id || user.uid;

        const checkActive = async () => {
            const { data: reqs } = await supabase
                .from('transport_requests')
                .select('*')
                .or(`user_id.eq.${uid},userId.eq.${uid}`)
                .in('status', ['searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress']);

            if (reqs && reqs.length > 0) {
                const mainActive = reqs.find((r: any) => !r.scheduled || ['arriving', 'in_progress'].includes(r.status));
                if (mainActive) {
                    navigate(`/taxi/track/${mainActive.id}`);
                }
                const pendingSchedules = reqs.filter((r: any) => r.scheduled && ['searching', 'verifying_payment', 'accepted'].includes(r.status));
                setActiveReservations(pendingSchedules);
            } else {
                setActiveReservations([]);
            }
        };

        checkActive();

        const channel = supabase
            .channel(`taxi_active_${uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, () => {
                checkActive();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, navigate]);

    // 1. Fetch Admin Rates and Settings
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
                } else {
                    setAdminRates({});
                    setServiceHours({
                        day: { start: "08:00", end: "20:00" },
                        night: { start: "20:01", end: "07:59" }
                    });
                }

                const { data: financeSnap } = await supabase
                    .from('system_configs')
                    .select('*')
                    .eq('id', 'finances')
                    .maybeSingle();
                if (financeSnap) {
                    setPaymentMethods(financeSnap.data?.paymentMethods || financeSnap.paymentMethods);
                } else {
                    setPaymentMethods({
                        cash: { active: true, logoUrl: '' },
                        pagoMovil: { active: false, bank: '', phone: '', idf: '', logoUrl: '' }
                    });
                }
            } catch (error) {
                console.error("Error fetching configs:", error);

                // Set fallback values on error to unblock UI
                setAdminRates({});
                setServiceHours({
                    day: { start: "08:00", end: "20:00" },
                    night: { start: "20:01", end: "07:59" }
                });
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
            setIsFollowingUser(true);
            const id = navigator.geolocation.watchPosition(
                (pos) => {
                    const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setUserLocation(newPos);
                    setCurrentCenter(newPos);
                    mapCenterRef.current = newPos;
                    map.panTo(newPos);
                    updateAddressFromCenter(newPos, 'origin');
                },
                (error) => {
                    console.error("WatchPosition error:", error);
                    setIsFollowingUser(false);
                },
                { enableHighAccuracy: true }
            );
            watchIdRef.current = id;
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
        if (isFollowingUser) {
            setIsFollowingUser(false);
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        }
    };

    const handleMapClick = (e: google.maps.MapMouseEvent) => {
        if (!e.latLng || step === 'payment' || step === 'searching') return;
        
        setIsFollowingUser(false);
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }

        const dest = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        mapCenterRef.current = dest;
        updateAddressFromCenter(dest, 'destination');
        
        const pickup = origin || userLocation || currentCenter;
        if (!origin && currentCenter) {
            updateAddressFromCenter(currentCenter, 'origin');
        }

        // Economize queries: on-demand fetch of nearby drivers when user selects destination
        fetchNearbyDrivers(pickup);
        
        vibrate(50);
        setStep('vehicle');
    };

    const toggleFollowUser = () => {
        if (!navigator.geolocation) {
            toast.error("Tu navegador no soporta geolocalización");
            return;
        }

        if (isFollowingUser) {
            setIsFollowingUser(false);
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        } else {
            setIsFollowingUser(true);
            const id = navigator.geolocation.watchPosition(
                (pos) => {
                    const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setCurrentCenter(newPos);
                    mapCenterRef.current = newPos;
                    if (map) {
                        map.panTo(newPos);
                        updateAddressFromCenter(newPos, 'origin');
                    }
                },
                (error) => {
                    console.error("WatchPosition error:", error);
                    setIsFollowingUser(false);
                    toast.error("No se pudo obtener tu ubicación en tiempo real");
                },
                { enableHighAccuracy: true }
            );
            watchIdRef.current = id;
        }
    };

    // Cleanup watcher on unmount
    useEffect(() => {
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    // 5. Reset Route on location change
    useEffect(() => {
        if (routeCalculationAttempted || routeInfo || directionsResponse) {
            console.log("Resetting route calculation because location changed");
            setRouteCalculationAttempted(false);
            setRouteInfo(null);
            setDirectionsResponse(null);
            setIsCalculatingRoute(false);
        }
    }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

    // 6. Route Calculation
    useEffect(() => {
        let isMounted = true;

        const calculateRoute = async () => {
            if (step !== 'vehicle' || !origin || !destination || !directionsService || routeCalculationAttempted) {
                return;
            }

            console.log("Starting route calculation...");
            setIsCalculatingRoute(true);

            if (!window.google) {
                console.error("Google Maps API not available.");
                return;
            }

            const request: google.maps.DirectionsRequest = {
                origin: { lat: origin.lat, lng: origin.lng },
                destination: { lat: destination.lat, lng: destination.lng },
                travelMode: google.maps.TravelMode.DRIVING,
            };

            const applyFallbackRoute = () => {
                const distanceMeters = calculateDistance(origin!.lat, origin!.lng, destination!.lat, destination!.lng);
                const distanceKm = Number((distanceMeters / 1000).toFixed(1));
                const estimatedMinutes = Math.max(3, Math.ceil(distanceKm * 4));

                setRouteInfo({
                    distance: distanceKm,
                    duration: `Aprox. ${estimatedMinutes} min`
                });
                setDirectionsResponse(null);
            };

            const timeoutId = setTimeout(() => {
                if (isMounted) {
                    setIsCalculatingRoute(false);
                    setRouteCalculationAttempted(true);
                    console.warn("Route calculation timed out. Using fallback.");
                    applyFallbackRoute();
                }
            }, 8000);

            if (!window.google || !window.google.maps) {
                clearTimeout(timeoutId);
                setIsCalculatingRoute(false);
                setRouteCalculationAttempted(true);
                applyFallbackRoute();
                return;
            }

            directionsService.route(request, (result, status) => {
                clearTimeout(timeoutId);
                if (!isMounted) return;

                console.log("Route calculation completed with status:", status);
                setIsCalculatingRoute(false);
                setRouteCalculationAttempted(true);

                if (window.google && window.google.maps && status === window.google.maps.DirectionsStatus.OK && result) {
                    setDirectionsResponse(result);
                    const leg = result.routes[0]?.legs[0];
                    if (leg && leg.distance) {
                        const distanceKm = Number((leg.distance.value / 1000).toFixed(1));
                        setRouteInfo({
                            distance: distanceKm,
                            duration: leg.duration?.text || ''
                        });
                        return;
                    }
                }

                console.warn(`Route calculation failed with status: ${status}. Using fallback.`);
                applyFallbackRoute();
                if (status === 'ZERO_RESULTS') {
                    toast("Ruta vial no encontrada, estimando distancia en línea recta", { icon: '📏' });
                } else {
                    toast.error(`Aviso: Servicio GPS limitado. Usando distancia en línea recta.`);
                }
            });
        };

        calculateRoute();

        return () => {
            isMounted = false;
        };
    }, [step, origin?.lat, origin?.lng, destination?.lat, destination?.lng, directionsService, routeCalculationAttempted]);

    // 6. Viewport Auto-Adjustment
    useEffect(() => {
        if (!map || step !== 'vehicle' || !window.google || !window.google.maps) return;

        const bounds = new window.google.maps.LatLngBounds();
        let hasPoints = false;

        if (directionsResponse) {
            // Frame the calculated route
            const route = directionsResponse.routes[0];
            route.overview_path.forEach(point => bounds.extend(point));
            hasPoints = true;
        } else if (origin && destination) {
            // Frame markers in fallback mode
            bounds.extend({ lat: origin.lat, lng: origin.lng });
            bounds.extend({ lat: destination.lat, lng: destination.lng });
            hasPoints = true;
        }

        if (hasPoints) {
            // Adjust viewport with padding-bottom to clear the vehicle selection bottom sheet
            // Adjust viewport with padding
            map.fitBounds(bounds, {
                bottom: 80,
                top: 40,
                left: 40,
                right: 40
            });
        }
    }, [map, directionsResponse, step, origin, destination]);

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
        setRouteCalculationAttempted(false);

        if (step === 'vehicle') {
            setStep('origin');
        } else if (step === 'origin') {
            if (serviceCategory === 'package') {
                setStep('package_details');
            } else {
                setStep('service_type');
            }
        } else if (step === 'package_details') {
            setStep('service_type');
        }
    };

    const calculatePrice = (type: 'moto' | 'carro' | 'ejecutivo', forDriver: boolean = false) => {
        const distance = routeInfo ? routeInfo.distance : 1;

        if (adminRates && adminRates[type] && Array.isArray(adminRates[type]) && adminRates[type].length > 0) {
            const rates = adminRates[type];

            // Find matching range
            const matchingRange = rates.find((r: any) => {
                const fromKm = parseFloat(String(r.from || '0'));
                const toKm = parseFloat(String(r.to || '0'));
                return distance >= fromKm && (toKm === 0 || distance <= toKm);
            });

            if (matchingRange) {
                const priceValue = forDriver
                    ? (matchingRange.driverPrice || matchingRange.price)
                    : (matchingRange.clientPrice || matchingRange.price);
                const p = parseFloat(String(priceValue || '0'));
                if (p > 0) return p.toFixed(2);
            }

            // Fallback to highest range if distance exceeds
            const sortedRates = [...rates].sort((a: any, b: any) => {
                const fromA = parseFloat(String(a.from || '0'));
                const fromB = parseFloat(String(b.from || '0'));
                return fromB - fromA;
            });

            const lastRange = sortedRates[0];
            if (lastRange) {
                const priceValue = forDriver
                    ? (lastRange.driverPrice || lastRange.price)
                    : (lastRange.clientPrice || lastRange.price);
                const p = parseFloat(String(priceValue || '0'));
                if (p > 0) return p.toFixed(2);
            }
        }

        // Dynamic fallback rates based on distance if admin rates not configured
        const basePrice = type === 'moto' ? 1.5 : type === 'ejecutivo' ? 4.0 : 2.5;
        const perKm = type === 'moto' ? 0.6 : type === 'ejecutivo' ? 1.4 : 0.9;
        const calculated = Math.max(basePrice, basePrice + (distance * perKm));
        return calculated.toFixed(2);
    };

    const handleContinueToPayment = () => {
        if (isDemoMode()) {
            setShowDemoAlert(true);
            return;
        }
        if (!vehicleType || !routeInfo) return;
        setStep('payment');
    };

    const handleRequestTaxi = async () => {
        if (!user) {
            if (!guestName || !guestPhone || !guestCedula) {
                setShowGuestModal(true);
                return;
            }
        }

        if (!origin || !destination) {
            toast.error("Debes seleccionar un origen y un destino.");
            return;
        }
        if (!vehicleType) {
            toast.error("Debes seleccionar un tipo de vehículo.");
            return;
        }
        if (!routeInfo) {
            toast.error("Calculando ruta... Por favor espera un momento.");
            return;
        }
        if (!selectedPaymentMethod) {
            toast.error("Debes seleccionar un método de pago.");
            return;
        }

        const clientTotal = calculatePrice(vehicleType);
        const driverPayout = clientTotal;

        // Wallet validation
        if (selectedPaymentMethod === 'wallet') {
            const currentBalance = userData?.walletBalance || 0;
            if (currentBalance < parseFloat(clientTotal as string)) {
                toast.error("Saldo insuficiente en tu Billetera Deliexpress. Por favor recarga o selecciona otro método.");
                return;
            }
        } else if (selectedPaymentMethod !== 'cash' && selectedPaymentMethod !== 'wallet' && !paymentProof && !paymentRef) {
            toast.error("Debes adjuntar un comprobante o número de referencia");
            return;
        }

        try {
            setIsUploading(true);
            let proofUrl = '';
            const uid = user?.id || user?.uid || 'guest_' + Date.now();

            if (selectedPaymentMethod === 'wallet') {
                // Wallet has no proof to upload
            } else if (paymentProof && selectedPaymentMethod !== 'cash') {
                const ext = paymentProof.name.split('.').pop() || 'jpg';
                const path = `taxi_proofs/${uid}/${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(path, paymentProof, { upsert: true });
                if (!upErr) {
                    const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(path);
                    proofUrl = publicUrl;
                }
            } else if (selectedPaymentMethod !== 'cash' && !paymentRef) {
                // Double check validation before proceeding
                toast.error("Debes adjuntar un comprobante o número de referencia");
                setIsUploading(false);
                return;
            }

            // For wallet and cash, status is searching immediately.
            const initialStatus = (selectedPaymentMethod === 'wallet' || selectedPaymentMethod === 'cash') ? 'searching' : 'verifying_payment';

            setStep('searching');

            const newReqId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `taxi_${Date.now()}`;

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
                total: parseFloat(clientTotal as string),
                price: parseFloat(clientTotal as string),
                driverPayout: parseFloat(driverPayout as string),
                driver_payout: parseFloat(driverPayout as string),
                driverId: null, // Ensuring it's explicit
                driver_id: null,
                driverPaid: false, // For earnings tracking
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
                createdAt: new Date().toISOString(),
                created_at: new Date().toISOString(),
            };

            const { error: insErr } = await supabase.from('transport_requests').insert(orderData);
            if (insErr) throw insErr;

            if (selectedPaymentMethod === 'wallet' && user) {
                // Deduct from wallet
                const newBalance = (userData?.walletBalance || 0) - parseFloat(clientTotal as string);
                await supabase.from('profiles').update({
                    walletBalance: newBalance,
                    wallet_balance: newBalance,
                    updated_at: new Date().toISOString()
                }).eq('id', user.id || user.uid);
            }

            navigate(`/taxi/track/${newReqId}`);

        } catch (error) {
            console.error("Error creating transport request:", error);
            toast.error("No se pudo procesar la solicitud. Revisa tu conexión o intenta de nuevo.");
            setStep('payment');
        } finally {
            setIsUploading(false);
        }
    };

    const [copiedField, setCopiedField] = useState<string | null>(null);

    const handleCopy = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        toast.success("Copiado al portapapeles");
        setTimeout(() => setCopiedField(null), 2000);
    };

    const CopyButton = ({ text, id }: { text: string, id: string }) => (
        <button 
            onClick={() => handleCopy(text, id)}
            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-900 active:scale-95"
            title="Copiar"
        >
            {copiedField === id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );

    if (loadError) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 min-h-[100dvh] p-6 text-center">
                <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-4 shadow-lg shadow-rose-500/10">
                    <MapPin className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">No se pudo cargar Google Maps</h3>
                <p className="text-xs text-slate-500 max-w-sm mb-6 font-medium">
                    Google está actualizando la configuración de la clave de API. Puede tardar entre 1 y 5 minutos en propagarse en los servidores de Google.
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-primary text-slate-950 font-black rounded-2xl shadow-lg shadow-primary/20 active:scale-95 text-xs uppercase tracking-wider"
                    >
                        Reintentar ahora
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

    if (!isLoaded) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 min-h-[100dvh]">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Google Maps...</p>
            </div>
        );
    }

    if (step === 'searching') {
        const initialStatus = (selectedPaymentMethod === 'wallet' || selectedPaymentMethod === 'cash') ? 'searching' : 'verifying_payment';

        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in bg-white h-[100dvh]">
                <div className="relative mb-8">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
                        <div className="relative z-10 animate-scale-in cursor-pointer active:scale-95 transition-transform" onClick={() => window.location.href = 'https://deliexpress.app'}>
                            <img
                                src={UN2X3_LOGO}
                                alt="Deliexpress Logo"
                                className="w-56 h-auto object-contain filter drop-shadow-2xl"
                            />
                        </div>
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                    {initialStatus === 'searching' ? 'Buscando Conductor...' : 'Verificando Pago...'}
                </h2>
                <p className="text-slate-500 font-medium px-6 leading-relaxed">
                    {initialStatus === 'searching'
                        ? 'Estamos conectándote con el conductor más cercano a tu ubicación.'
                        : 'Por favor espera mientras confirmamos tu comprobante. En breve se te asignará un conductor.'}
                </p>

                <div className="mt-12 flex flex-col items-center gap-4">
                    <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce"></div>
                    </div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Taxi Deliexpress</span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-[100dvh] bg-slate-100 overflow-hidden">
            {/* 1. Google Map Area - Fixed Full Background */}
            <div className="absolute inset-0 w-full h-[100dvh] z-0">
                <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={currentCenter}
                    zoom={15}
                    onLoad={onLoad}
                    onUnmount={onUnmount}
                    options={{
                        ...mapOptions,
                        gestureHandling: 'greedy',
                        padding: { bottom: 0, top: 0, left: 0, right: 0 }
                    }}
                    onDragStart={handleMapDragStart}
                    onClick={handleMapClick}
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

                    {/* Real-time User Location (Blue Dot) */}
                    {userLocation && window.google && window.google.maps && (
                        <Marker
                            position={userLocation}
                            icon={{
                                path: window.google.maps.SymbolPath.CIRCLE,
                                fillColor: '#4285F4',
                                fillOpacity: 1,
                                strokeColor: 'white',
                                strokeWeight: 2,
                                scale: 7
                            }}
                            zIndex={100}
                        />
                    )}

                    {/* Origin Marker (Green Pin) when not handled by directions */}
                    {origin && !directionsResponse && window.google && window.google.maps && (
                        <Marker
                            position={{ lat: origin.lat, lng: origin.lng }}
                            title="Punto de partida"
                            icon={{
                                url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
                            }}
                        />
                    )}

                    {/* Destination Marker (Red Pin) when not handled by directions */}
                    {destination && !directionsResponse && window.google && window.google.maps && (
                        <Marker
                            position={{ lat: destination.lat, lng: destination.lng }}
                            title="Destino"
                            icon={{
                                url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
                            }}
                        />
                    )}

                    {/* Nearby Drivers */}
                    {nearbyDrivers.map((driver) => (
                        <Marker
                            key={driver.id}
                            position={{ lat: driver.lat, lng: driver.lng }}
                            title={`${driver.fullName} (${driver.vehicleType === 'moto' ? 'Moto' : driver.vehicleType === 'ejecutivo' ? 'Ejecutivo' : 'Taxi'}) - ${driver.distanceKm} km`}
                            icon={{
                                url: driver.vehicleType === 'moto'
                                    ? 'https://maps.google.com/mapfiles/ms/icons/motorcycling.png'
                                    : 'https://maps.google.com/mapfiles/ms/icons/cabs.png'
                            }}
                        />
                    ))}
                </GoogleMap>

                {/* Floating Search Bar / Header */}
                <div className="absolute top-4 left-4 right-4 z-20 flex flex-col max-w-lg mx-auto">
                    <div className="relative flex items-center bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 px-3.5 py-2.5 gap-2.5 transition-all focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
                        {step !== 'origin' && step !== 'service_type' ? (
                            <button
                                type="button"
                                onClick={goBack}
                                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 transition-colors flex-shrink-0 active:scale-95"
                                title="Volver"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => navigate('/home')}
                                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 transition-colors flex-shrink-0 active:scale-95"
                                title="Inicio"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        )}

                        <div className="flex-1 flex items-center gap-2 min-w-0">
                            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="¿A dónde quieres ir? (Buscar dirección o local)"
                                className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-800 placeholder-slate-400 outline-none truncate"
                            />
                        </div>

                        {isSearchingPlaces && (
                            <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                        )}

                        {searchQuery && !isSearchingPlaces && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchQuery('');
                                    setPredictions([]);
                                }}
                                className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-slate-200 transition-colors flex-shrink-0"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                if (userLocation && map) {
                                    map.panTo(userLocation);
                                    map.setZoom(16);
                                }
                            }}
                            className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors flex-shrink-0 active:scale-95"
                            title="Mi ubicación"
                        >
                            <Navigation className="w-4 h-4 fill-primary" />
                        </button>
                    </div>

                    {/* Google Places Predictions Dropdown */}
                    {predictions.length > 0 && (
                        <div className="mt-2 bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto z-30">
                            {predictions.map((p) => (
                                <button
                                    key={p.place_id}
                                    type="button"
                                    onClick={() => handleSelectPrediction(p)}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3 transition-colors active:bg-slate-100"
                                >
                                    <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-800 truncate">
                                            {p.structured_formatting?.main_text || p.description}
                                        </p>
                                        <p className="text-xs text-slate-400 truncate">
                                            {p.structured_formatting?.secondary_text || p.description}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

             {/* 2. Docked Bottom Panel - 35% height */}
            <div className="absolute inset-x-0 bottom-0 z-30 pointer-events-none flex flex-col justify-end items-center">
                <div className={`w-full pointer-events-auto bg-white/95 backdrop-blur-xl rounded-t-[32px] rounded-b-none shadow-[0_-10px_40px_rgba(0,0,0,0.15)] border-t border-white/50 p-6 overflow-y-auto scrollbar-hide pb-6 transition-all duration-500 ease-in-out break-words ${destination ? 'max-h-[50dvh] h-[50dvh]' : 'max-h-[35dvh] h-[35dvh]'}`}>
                    {/* Progress Indicator */}
                    <div className="w-12 h-1.5 bg-slate-200/60 rounded-full mx-auto mb-5 drop-shadow-sm"></div>

                    {step === 'service_type' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col h-full">
                            <h2 className="text-xl font-black text-slate-900 mb-4 text-center">¿Qué necesitas hoy?</h2>
                            <div className="grid gap-4">
                                <button
                                    onClick={() => { setServiceCategory('transport'); setStep('origin'); }}
                                    className="p-6 bg-white border-2 border-slate-100 rounded-3xl flex items-center gap-4 hover:border-primary hover:bg-primary/5 transition-all shadow-sm active:scale-95"
                                >
                                    <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                                        <Car className="w-8 h-8" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-black text-lg text-slate-800">Transporte</h3>
                                        <p className="text-sm font-bold text-slate-400 leading-tight">Viaja cómodo y seguro a tu destino</p>
                                    </div>
                                </button>
                                
                                <button
                                    onClick={() => { setServiceCategory('package'); setStep('package_details'); }}
                                    className="p-6 bg-white border-2 border-slate-100 rounded-3xl flex items-center gap-4 hover:border-primary hover:bg-primary/5 transition-all shadow-sm active:scale-95"
                                >
                                    <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
                                        <Package className="w-8 h-8" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-black text-lg text-slate-800">Enviar Paquete</h3>
                                        <p className="text-sm font-bold text-slate-400 leading-tight">Envíos rápidos a cualquier lugar</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'package_details' && (
                        <div className="animate-in fade-in slide-in-from-right-4 flex flex-col h-full">
                            <h2 className="text-xl font-black text-slate-900 mb-1">Detalles del Paquete</h2>
                            <p className="text-sm font-medium text-slate-500 mb-4">¿Qué vamos a enviar?</p>
                            
                            <textarea
                                value={packageDescription}
                                onChange={(e) => setPackageDescription(e.target.value)}
                                placeholder="Ej: Llaves, Documentos, Comida..."
                                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl mb-4 focus:border-primary outline-none transition-all font-bold text-slate-700 min-h-[100px] resize-none"
                            />
                            
                            <button
                                disabled={!packageDescription.trim()}
                                onClick={() => setStep('origin')}
                                className="w-full bg-[#ffff00] text-black py-4 rounded-2xl font-black text-lg shadow-[0_6px_0_#ca8a04] active:shadow-[0_0px_0_#ca8a04] active:translate-y-[6px] transition-all disabled:opacity-50 disabled:translate-y-[6px] disabled:shadow-none uppercase tracking-wide flex justify-center items-center gap-2 border-2 border-slate-900"
                            >
                                Continuar
                            </button>
                        </div>
                    )}

                    {/* MAIN VIEW: ORIGIN & MAP TAP */}
                    {step === 'origin' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col h-full">
                            <h2 className="text-xl font-black text-slate-900 mb-1">
                                {serviceCategory === 'package' ? '¿A dónde va el paquete?' : '¿A dónde vamos hoy?'}
                            </h2>
                            <p className="text-sm font-medium text-slate-500 mb-4">
                                {serviceCategory === 'package' ? 'Toca en el mapa el destino de entrega del paquete.' : 'Toca en el mapa tu destino final para trazar la ruta.'}
                            </p>

                            <div
                                className="flex items-center gap-4 p-4 rounded-3xl border transition-all mb-4 cursor-pointer bg-white/70 backdrop-blur-sm border-white/50 shadow-sm"
                            >
                                <div className="w-3 h-3 rounded-full flex-shrink-0 bg-black animate-pulse shadow-[0_0_8px_rgba(0,0,0,0.5)]" />
                                <div className="flex-1 overflow-hidden">
                                    <p className="text-[10px] font-black uppercase text-slate-500 mb-0.5">Ubicación actual</p>
                                    <p className="font-bold text-slate-800 leading-tight truncate">
                                        {origin?.address || 'Detectando ubicación...'}
                                    </p>
                                </div>
                            </div>

                            {userData?.addresses && userData.addresses.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase text-slate-400">Tus lugares guardados</h4>
                                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                        {userData.addresses.map((addr: any) => (
                                            <button
                                                key={addr.id}
                                                onClick={() => {
                                                    const dest = { lat: addr.lat, lng: addr.lng, address: addr.address };
                                                    setDestination(dest);
                                                    setStep('vehicle');
                                                }}
                                                className="flex-shrink-0 flex items-center gap-2 bg-white/60 backdrop-blur-sm hover:bg-white/80 px-4 py-2.5 rounded-xl border border-white/50 shadow-sm transition-colors"
                                            >
                                                <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                                                <span className="text-xs font-bold text-slate-700 whitespace-nowrap drop-shadow-sm">{addr.name}</span>
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
                            {/* RESERVE OPTION OVERLAY */}
                            {serviceCategory === 'transport' && (
                            <div className="mb-4">
                                <div className="bg-slate-50 p-1.5 rounded-2xl flex gap-2 mb-4 border border-slate-100">
                                    <button 
                                        onClick={() => setIsScheduled(false)}
                                        className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${!isScheduled ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400'}`}
                                    >
                                        Viajar ahora
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setIsScheduled(true);
                                            if (!scheduledDateTime) {
                                                const now = new Date();
                                                now.setHours(now.getHours() + 1);
                                                setScheduledDateTime(now.toISOString().slice(0, 16));
                                            }
                                        }}
                                        className={`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${isScheduled ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400'}`}
                                    >
                                        Reservar
                                    </button>
                                </div>

                                {isScheduled && (
                                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-4 animate-in zoom-in-95">
                                        <label className="block text-[10px] font-black uppercase text-slate-900 mb-2 tracking-widest">Fecha y Hora de Reserva</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-900 pointer-events-none" />
                                            <input 
                                                type="datetime-local" 
                                                value={scheduledDateTime}
                                                min={new Date().toISOString().slice(0, 16)}
                                                onChange={(e) => setScheduledDateTime(e.target.value)}
                                                className="w-full bg-white border border-primary/20 pl-12 pr-4 py-4 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                                            />
                                        </div>
                                        <p className="text-[10px] font-medium text-slate-500 mt-2 flex items-center gap-1.5">
                                            <ClockIcon className="w-3 h-3" />
                                            Dinos cuándo necesitas el vehículo y un conductor te buscará.
                                        </p>
                                    </div>
                                )}
                            </div>
                            )}

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
                                                setRouteCalculationAttempted(false);
                                                setStep('destination');
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
                                        disabled={activeDrivers.moto === 0}
                                        onClick={() => setVehicleType('moto')}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 text-left ${activeDrivers.moto === 0 ? 'opacity-50 grayscale cursor-not-allowed border-slate-100' : vehicleType === 'moto' ? 'border-primary bg-primary/5 shadow-md shadow-primary/10' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                                    >
                                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-slate-900 flex-shrink-0">
                                            <Bike className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-black text-slate-800">Mototaxi</h3>
                                                <div className="text-right">
                                                    <span className="font-black text-lg text-slate-900">${calculatePrice('moto')}</span>
                                                    {bcvRate > 0 && (
                                                        <span className="text-[11px] font-bold text-slate-500 block">
                                                            {(parseFloat(calculatePrice('moto')) * bcvRate).toFixed(2)} Bs
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {activeDrivers.moto > 0 ? (
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs font-bold text-slate-400">1 pasajero • Rápido</span>
                                                    <span className="text-slate-300">•</span>
                                                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                        {activeDrivers.moto} {activeDrivers.moto === 1 ? 'disponible' : 'disponibles'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <p className="text-xs font-black text-rose-500 mt-0.5">No disponible temporalmente</p>
                                            )}
                                        </div>
                                    </button>

                                    {/* Taxi Option */}
                                    <button
                                        disabled={activeDrivers.carro === 0}
                                        onClick={() => {
                                            setVehicleType('carro');
                                            setShowTaxiNotice(true);
                                        }}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 text-left ${activeDrivers.carro === 0 ? 'opacity-50 grayscale cursor-not-allowed border-slate-100' : vehicleType === 'carro'
                                            ? 'border-primary bg-primary text-secondary shadow-lg shadow-primary/20 scale-[1.01]'
                                            : 'border-slate-100 bg-white hover:border-primary/30'}`}
                                    >
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${vehicleType === 'carro' ? 'bg-white/90 text-secondary shadow-sm' : 'bg-orange-100 text-orange-600'}`}>
                                            <Car className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <h3 className={`font-black text-lg ${vehicleType === 'carro' ? 'text-secondary' : 'text-slate-800'}`}>Taxi</h3>
                                                <div className="text-right">
                                                    <span className={`font-black text-xl ${vehicleType === 'carro' ? 'text-secondary' : 'text-slate-900'}`}>${calculatePrice('carro')}</span>
                                                    {bcvRate > 0 && (
                                                        <span className={`text-[11px] font-bold block ${vehicleType === 'carro' ? 'text-secondary/80' : 'text-slate-500'}`}>
                                                            {(parseFloat(calculatePrice('carro')) * bcvRate).toFixed(2)} Bs
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {activeDrivers.carro > 0 ? (
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`text-xs font-bold ${vehicleType === 'carro' ? 'text-secondary/80' : 'text-slate-400'}`}>Hasta 4 pasajeros</span>
                                                    <span className={vehicleType === 'carro' ? 'text-secondary/40' : 'text-slate-300'}>•</span>
                                                    <span className={`text-xs font-bold flex items-center gap-1 ${vehicleType === 'carro' ? 'text-secondary font-black' : 'text-emerald-600'}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${vehicleType === 'carro' ? 'bg-secondary' : 'bg-emerald-500'}`}></span>
                                                        {activeDrivers.carro} {activeDrivers.carro === 1 ? 'disponible' : 'disponibles'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <p className="text-xs font-black text-rose-500 mt-0.5">No disponible temporalmente</p>
                                            )}
                                        </div>
                                    </button>

                                    {/* Ejecutivo Option */}
                                    <button
                                        disabled={activeDrivers.ejecutivo === 0}
                                        onClick={() => setVehicleType('ejecutivo')}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 text-left ${activeDrivers.ejecutivo === 0 ? 'opacity-50 grayscale cursor-not-allowed border-slate-100' : vehicleType === 'ejecutivo' ? 'border-slate-900 bg-slate-50 shadow-md' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                                    >
                                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-800 flex-shrink-0">
                                            <Car className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-black text-slate-800">Taxi Ejecutivo</h3>
                                                <div className="text-right">
                                                    <span className="font-black text-lg text-slate-900">${calculatePrice('ejecutivo')}</span>
                                                    {bcvRate > 0 && (
                                                        <span className="text-[11px] font-bold text-slate-500 block">
                                                            {(parseFloat(calculatePrice('ejecutivo')) * bcvRate).toFixed(2)} Bs
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {activeDrivers.ejecutivo > 0 ? (
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs font-bold text-slate-400">Premium c/A/C</span>
                                                    <span className="text-slate-300">•</span>
                                                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                        {activeDrivers.ejecutivo} {activeDrivers.ejecutivo === 1 ? 'disponible' : 'disponibles'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <p className="text-xs font-black text-rose-500 mt-0.5">No disponible temporalmente</p>
                                            )}
                                        </div>
                                    </button>
                                </div>
                            )}

                            <button
                                disabled={!vehicleType || !routeInfo}
                                onClick={handleContinueToPayment}
                                className="w-full bg-[#ffff00] text-black py-4 mt-2 rounded-2xl font-black text-lg shadow-[0_6px_0_#ca8a04] active:shadow-[0_0px_0_#ca8a04] active:translate-y-[6px] transition-all disabled:opacity-50 disabled:translate-y-[6px] disabled:shadow-none uppercase tracking-wide flex justify-center items-center gap-2 mb-4 border-2 border-slate-900"
                            >
                                Continuar con el Pago <ArrowRight className="w-5 h-5" />
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
                            <p className="text-sm font-medium text-slate-500 mb-6">
                                Total a pagar: <span className="font-bold text-slate-800">${calculatePrice(vehicleType!)}</span>
                                {bcvRate > 0 && (
                                    <span className="ml-1 text-slate-400 font-bold">
                                        ({(parseFloat(calculatePrice(vehicleType!) as string) * bcvRate).toFixed(2)} Bs)
                                    </span>
                                )}
                            </p>

                            {!paymentMethods ? (
                                <div className="flex justify-center p-4"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>
                            ) : (
                                <div className="space-y-4 mb-6">
                                    {/* Billetera Deliexpress */}
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
                                                        <Wallet className="w-4 h-4 text-slate-900" />
                                                        Mi Billetera Deliexpress
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
                                                <div className="p-4 bg-slate-50 border-t items-center border-slate-100 text-sm space-y-3 pointer-events-auto">
                                                    {bcvRate > 0 && (
                                                        <div className="flex items-center justify-between bg-primary/10 p-3 rounded-xl border border-primary/20">
                                                            <p className="text-slate-900 font-black">
                                                                <span className="opacity-60 font-bold">Monto:</span> {(parseFloat(calculatePrice(vehicleType!) as string) * bcvRate).toFixed(2)} Bs
                                                            </p>
                                                            <CopyButton text={(parseFloat(calculatePrice(vehicleType!) as string) * bcvRate).toFixed(2)} id="pm-amount" />
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100">
                                                        <p><span className="font-bold text-slate-700">Banco:</span> {paymentMethods.pagoMovil.bank}</p>
                                                        <CopyButton text={paymentMethods.pagoMovil.bank} id="pm-bank" />
                                                    </div>
                                                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100">
                                                        <p><span className="font-bold text-slate-700">Teléfono:</span> {paymentMethods.pagoMovil.phone}</p>
                                                        <CopyButton text={paymentMethods.pagoMovil.phone} id="pm-phone" />
                                                    </div>
                                                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100">
                                                        <p><span className="font-bold text-slate-700">Cédula:</span> {paymentMethods.pagoMovil.idf}</p>
                                                        <CopyButton text={paymentMethods.pagoMovil.idf} id="pm-id" />
                                                    </div>

                                                    <div className="mt-2">
                                                        <button
                                                            onClick={() => {
                                                                const textToCopy = `Banco: ${paymentMethods.pagoMovil.bank}\nTeléfono: ${paymentMethods.pagoMovil.phone}\nCédula/RIF: ${paymentMethods.pagoMovil.idf}\nMonto: ${(parseFloat(calculatePrice(vehicleType!) as string) * bcvRate).toFixed(2)} Bs`;
                                                                navigator.clipboard.writeText(textToCopy);
                                                                toast.success('Datos copiados');
                                                            }}
                                                            className="w-full bg-blue-50 text-blue-600 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all border border-blue-100 hover:bg-blue-100"
                                                        >
                                                            <Copy className="w-4 h-4" /> Copiar monto y datos (Pago Móvil)
                                                        </button>
                                                    </div>

                                                    <div className="mt-4 pt-4 border-t border-slate-200">
                                                        <label className="block text-xs font-bold text-slate-500 mb-2">Comprobante o Referencia</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Nro. de Referencia o teléfono emisor"
                                                            value={paymentRef}
                                                            onChange={e => setPaymentRef(e.target.value.replace(/\D/g, ''))}
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
                                                                className={`w-full flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${paymentProof ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-primary hover:bg-primary/5 hover:text-slate-900'}`}
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
                                                <div className="p-4 bg-slate-50 border-t border-slate-100 text-sm space-y-3 pointer-events-auto">
                                                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100">
                                                        <p><span className="font-bold text-slate-700">Correo:</span> {paymentMethods.zelle.email}</p>
                                                        <CopyButton text={paymentMethods.zelle.email} id="zelle-email" />
                                                    </div>
                                                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100">
                                                        <p><span className="font-bold text-slate-700">Nombre:</span> {paymentMethods.zelle.name}</p>
                                                        <CopyButton text={paymentMethods.zelle.name} id="zelle-name" />
                                                    </div>

                                                    <div className="mt-4 pt-4 border-t border-slate-200">
                                                        <label className="block text-xs font-bold text-slate-500 mb-2">Comprobante o Referencia</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Nro. de Confirmación"
                                                            value={paymentRef}
                                                            onChange={e => setPaymentRef(e.target.value.replace(/\D/g, ''))}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl mb-2 focus:border-primary outline-none transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </div>
                            )}

                            <button
                                disabled={isUploading || !selectedPaymentMethod}
                                onClick={handleRequestTaxi}
                                className="w-full bg-[#ffff00] text-black py-4 mt-2 rounded-2xl font-black text-lg shadow-[0_6px_0_#ca8a04] active:shadow-[0_0px_0_#ca8a04] active:translate-y-[6px] transition-all disabled:opacity-50 disabled:translate-y-[6px] disabled:shadow-none uppercase tracking-wide flex justify-center items-center gap-2 border-2 border-slate-900"
                            >
                                {isUploading ? 'PROCESANDO...' : 'PAGAR E IR'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {showGuestModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowGuestModal(false)}></div>
                    <div className="relative w-full max-w-sm mx-4 bg-white rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
                        <h3 className="text-xl font-black text-slate-900 mb-2 text-center">Datos del Pasajero</h3>
                        <p className="text-sm text-slate-500 mb-6 text-center">Requerimos estos datos para que el conductor pueda identificarte</p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Nombre y Apellido</label>
                                <input
                                    type="text"
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                    placeholder="Ej. Juan Pérez"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Cédula</label>
                                <input
                                    type="text"
                                    value={guestCedula}
                                    onChange={(e) => setGuestCedula(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Ej. 12345678"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Teléfono (WhatsApp)</label>
                                <input
                                    type="tel"
                                    value={guestPhone}
                                    onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Ej. 04141234567"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                            <button
                                onClick={() => {
                                    if (!guestName || !guestCedula || !guestPhone) {
                                        alert("Por favor completa todos los campos para que te busquen");
                                        return;
                                    }
                                    setShowGuestModal(false);
                                    handleRequestTaxi();
                                }}
                                className="w-full bg-[#ffff00] text-black py-4 rounded-2xl font-black text-lg shadow-[0_6px_0_#ca8a04] active:shadow-[0_0px_0_#ca8a04] active:translate-y-[6px] transition-all uppercase tracking-wide flex justify-center items-center gap-2 border-2 border-slate-900"
                            >
                                Continuar con el Viaje
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <DemoAlertModal isOpen={showDemoAlert} onClose={() => setShowDemoAlert(false)} />

            {/* Taxi Notice Modal */}
            <AnimatePresence>
                {showTaxiNotice && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-[32px] overflow-hidden shadow-2xl w-full max-w-sm"
                        >
                            <div className="bg-white p-8 flex flex-col items-center">
                                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-black/5">
                                    <Car className="w-10 h-10 text-slate-900" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900 text-center leading-tight">
                                    Muévete con Deliexpress
                                </h3>
                            </div>
                            <div className="p-8">
                                <p className="text-slate-600 font-bold text-center leading-relaxed">
                                    "Ahora podrás transportarte en un 2x3 dentro de la misma aplicación. Puedes seleccionar un viaje ahora o una reservación para llegar a tiempo y tener tu viaje anticipado"
                                </p>
                                <div className="mt-8">
                                    <button
                                        onClick={() => {
                                            vibrate(30);
                                            setShowTaxiNotice(false);
                                        }}
                                        className="w-full bg-[#ffff00] text-black py-4 rounded-2xl font-black text-lg shadow-[0_6px_0_#ca8a04] active:shadow-[0_0px_0_#ca8a04] active:translate-y-[6px] transition-all uppercase tracking-wide flex justify-center items-center gap-2 border-2 border-slate-900"
                                    >
                                        <span>Entendido</span>
                                        <ArrowRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            <LocationRequiredModal 
                isOpen={showLocationModal} 
                onClose={() => setShowLocationModal(false)} 
            />
        </div>
    );
}
