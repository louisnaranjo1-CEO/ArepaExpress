import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { Maximize2, Minimize2, Compass, Layers, Loader2 } from 'lucide-react';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES } from '../lib/mapsConfig';
import { yangoDayMapStyles } from '../lib/weather';

interface Coords {
    lat: number;
    lng: number;
}

export interface LiveTripMapProps {
    origin?: Coords | null;
    destination?: Coords | null;
    driverLocation?: Coords | null;
    vehicleType?: 'moto' | 'mototaxi' | 'carro' | 'taxi' | 'confort' | string;
    driverName?: string;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    showControls?: boolean;
}

export const isValidCoord = (c: any): c is Coords =>
    Boolean(c && typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng));

// Compute bearing angle between two coordinates (0 - 360 degrees)
function calculateBearing(start: Coords, end: Coords): number {
    if (!isValidCoord(start) || !isValidCoord(end)) return 0;
    const startLat = (start.lat * Math.PI) / 180;
    const startLng = (start.lng * Math.PI) / 180;
    const endLat = (end.lat * Math.PI) / 180;
    const endLng = (end.lng * Math.PI) / 180;

    const dLng = endLng - startLng;
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
}

// 3D Vehicle Marker SVG Generator with Top-Down View and Headlight Cones
function getVehicleSvgDataUri(vType: string = 'carro', bearing: number = 0): string {
    const isMoto = vType === 'moto' || vType === 'mototaxi' || vType === 'mandado' || vType === 'muchacho_mandado';
    const isConfort = vType === 'confort' || vType === 'ejecutivo';

    if (isMoto) {
        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 100 100">
            <g transform="rotate(${bearing} 50 50)">
                <ellipse cx="50" cy="55" rx="30" ry="12" fill="rgba(0,0,0,0.35)"/>
                <polygon points="50,15 25,-15 75,-15" fill="rgba(254,240,138,0.7)"/>
                <rect x="46" y="70" width="8" height="18" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="3"/>
                <rect x="46" y="14" width="8" height="18" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="3"/>
                <path d="M43 32 L57 32 L54 68 L46 68 Z" fill="#059669" stroke="#10b981" stroke-width="2"/>
                <rect x="44" y="44" width="12" height="18" rx="4" fill="#047857"/>
                <ellipse cx="50" cy="46" rx="7" ry="10" fill="#f59e0b"/>
                <line x1="28" y1="28" x2="72" y2="28" stroke="#f1f5f9" stroke-width="5" stroke-linecap="round"/>
                <circle cx="28" cy="28" r="4" fill="#0f172a"/>
                <circle cx="72" cy="28" r="4" fill="#0f172a"/>
                <circle cx="50" cy="42" r="8" fill="#ffffff" stroke="#0f172a" stroke-width="2"/>
                <path d="M44 38 Q50 34 56 38" stroke="#0ea5e9" stroke-width="3" fill="none" stroke-linecap="round"/>
            </g>
        </svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    const primaryColor = isConfort ? '#9333ea' : '#eab308';
    const strokeColor = isConfort ? '#c084fc' : '#ca8a04';
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 100 130">
        <g transform="rotate(${bearing} 50 65)">
            <polygon points="35,20 10,-20 50,-20" fill="rgba(254,240,138,0.65)"/>
            <polygon points="65,20 50,-20 90,-20" fill="rgba(254,240,138,0.65)"/>
            <rect x="18" y="24" width="64" height="92" rx="20" fill="rgba(0,0,0,0.4)"/>
            <rect x="20" y="20" width="60" height="90" rx="18" fill="${primaryColor}" stroke="${strokeColor}" stroke-width="2.5"/>
            <path d="M28 40 L72 40 L67 85 L33 85 Z" fill="#1e293b"/>
            <path d="M29 42 L71 42 L65 56 L35 56 Z" fill="#38bdf8" opacity="0.85"/>
            <path d="M34 76 L66 76 L63 84 L37 84 Z" fill="#38bdf8" opacity="0.75"/>
            <ellipse cx="17" cy="44" rx="4" ry="6" fill="${strokeColor}"/>
            <ellipse cx="83" cy="44" rx="4" ry="6" fill="${strokeColor}"/>
            <circle cx="32" cy="22" r="4.5" fill="#fef08a" stroke="#ffffff" stroke-width="1.5"/>
            <circle cx="68" cy="22" r="4.5" fill="#fef08a" stroke="#ffffff" stroke-width="1.5"/>
            <rect x="28" y="106" width="10" height="3" rx="1.5" fill="#ef4444"/>
            <rect x="62" y="106" width="10" height="3" rx="1.5" fill="#ef4444"/>
            <rect x="36" y="58" width="28" height="10" rx="3" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
            <text x="50" y="66" font-size="7" font-weight="900" fill="#0f172a" text-anchor="middle" font-family="sans-serif">TAXI</text>
        </g>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// 3D Pin Icon Generator for Origin (A) and Destination (B)
function getPinSvgDataUri(type: 'origin' | 'destination'): string {
    const isOrigin = type === 'origin';
    const color = isOrigin ? '#10b981' : '#f59e0b';
    const label = isOrigin ? 'A' : 'B';

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
        <ellipse cx="17" cy="41" rx="8" ry="3" fill="rgba(0,0,0,0.3)"/>
        <path d="M17 0 C7.6 0 0 7.6 0 17 C0 29.7 17 42 17 42 C17 42 34 29.7 34 17 C34 7.6 26.4 0 17 0 Z" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>
        <text x="17" y="22" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" font-family="sans-serif">${label}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function LiveTripMap({
    origin,
    destination,
    driverLocation,
    vehicleType = 'carro',
    driverName = 'Conductor',
    isExpanded = false,
    onToggleExpand,
    showControls = true,
}: LiveTripMapProps) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES
    });

    const mapRef = useRef<google.maps.Map | null>(null);
    const prevDriverLocRef = useRef<Coords | null>(null);
    const [bearing, setBearing] = useState<number>(0);
    const [mapTypeId, setMapTypeId] = useState<google.maps.MapTypeId | 'roadmap' | 'satellite'>('roadmap');

    const isMoto = vehicleType === 'moto' || vehicleType === 'mototaxi' || vehicleType === 'mandado' || vehicleType === 'muchacho_mandado';

    // Update bearing angle when driver moves
    useEffect(() => {
        if (!isValidCoord(driverLocation)) return;

        if (prevDriverLocRef.current && isValidCoord(prevDriverLocRef.current)) {
            const calculated = calculateBearing(prevDriverLocRef.current, driverLocation);
            if (calculated !== 0) {
                setBearing(calculated);
            }
        } else if (isValidCoord(destination)) {
            const calculated = calculateBearing(driverLocation, destination);
            setBearing(calculated);
        }

        prevDriverLocRef.current = driverLocation;
    }, [driverLocation, destination]);

    // Compute route coordinates for Polyline
    const polylinePath = useMemo(() => {
        const path: Coords[] = [];
        if (isValidCoord(origin)) path.push(origin);
        if (isValidCoord(driverLocation)) path.push(driverLocation);
        if (isValidCoord(destination)) path.push(destination);
        return path;
    }, [origin, driverLocation, destination]);

    // Center point
    const center = useMemo(() => {
        if (isValidCoord(driverLocation)) return driverLocation;
        if (isValidCoord(origin)) return origin;
        if (isValidCoord(destination)) return destination;
        return { lat: 8.9326, lng: -67.4264 };
    }, [driverLocation, origin, destination]);

    // Fit bounds on mount or when coords change
    useEffect(() => {
        if (!mapRef.current || !window.google) return;
        const validCoords = [driverLocation, origin, destination].filter(isValidCoord);
        if (validCoords.length > 1) {
            const bounds = new window.google.maps.LatLngBounds();
            validCoords.forEach(c => bounds.extend(c!));
            mapRef.current.fitBounds(bounds, {
                top: 70,
                bottom: 70,
                left: 50,
                right: 50
            });
        }
    }, [driverLocation, origin, destination]);

    const handleCenterDriver = () => {
        const target = isValidCoord(driverLocation) ? driverLocation : (isValidCoord(origin) ? origin : null);
        if (mapRef.current && target) {
            mapRef.current.panTo(target);
            mapRef.current.setZoom(17);
        }
    };

    const handleToggleMapStyle = () => {
        setMapTypeId(prev => prev === 'roadmap' ? 'satellite' : 'roadmap');
    };

    const onMapLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
    }, []);

    const onMapUnmount = useCallback(() => {
        mapRef.current = null;
    }, []);

    return (
        <div className="relative w-full h-full overflow-hidden bg-slate-900 select-none">
            {/* Exclusive Official Google Maps Canvas */}
            {isLoaded ? (
                <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={center}
                    zoom={16}
                    onLoad={onMapLoad}
                    onUnmount={onMapUnmount}
                    mapTypeId={mapTypeId}
                    options={{
                        disableDefaultUI: true,
                        zoomControl: false,
                        streetViewControl: false,
                        mapTypeControl: false,
                        fullscreenControl: false,
                        styles: mapTypeId === 'roadmap' ? yangoDayMapStyles : undefined
                    }}
                >
                    {/* Origin Marker (A) */}
                    {isValidCoord(origin) && (
                        <Marker
                            position={origin}
                            icon={{
                                url: getPinSvgDataUri('origin'),
                                anchor: window.google ? new window.google.maps.Point(17, 44) : undefined,
                                scaledSize: window.google ? new window.google.maps.Size(34, 44) : undefined
                            }}
                            title="Punto de partida"
                        />
                    )}

                    {/* Destination Marker (B) */}
                    {isValidCoord(destination) && (
                        <Marker
                            position={destination}
                            icon={{
                                url: getPinSvgDataUri('destination'),
                                anchor: window.google ? new window.google.maps.Point(17, 44) : undefined,
                                scaledSize: window.google ? new window.google.maps.Size(34, 44) : undefined
                            }}
                            title="Destino"
                        />
                    )}

                    {/* 3D Top-Down Animated Driver Vehicle */}
                    {isValidCoord(driverLocation) && (
                        <Marker
                            position={driverLocation}
                            icon={{
                                url: getVehicleSvgDataUri(vehicleType, bearing),
                                anchor: window.google ? new window.google.maps.Point(34, 34) : undefined,
                                scaledSize: window.google ? new window.google.maps.Size(68, 68) : undefined
                            }}
                            zIndex={100}
                            title={driverName}
                        />
                    )}

                    {/* Polyline Route */}
                    {polylinePath.length > 1 && (
                        <Polyline
                            path={polylinePath}
                            options={{
                                strokeColor: '#F59E0B',
                                strokeOpacity: 0.95,
                                strokeWeight: 5,
                                geodesic: true
                            }}
                        />
                    )}
                </GoogleMap>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                    <p className="text-xs font-bold text-slate-400">Iniciando Google Maps...</p>
                </div>
            )}

            {/* Top Interactive Pull Handle (Tap to Toggle Half / Full Screen) */}
            {onToggleExpand && (
                <div 
                    onClick={onToggleExpand}
                    className="absolute top-2 left-1/2 -translate-x-1/2 z-20 cursor-pointer group flex flex-col items-center py-2 px-6 active:scale-95 transition-transform"
                    title={isExpanded ? 'Ver mitad de pantalla' : 'Expandir mapa a pantalla completa'}
                >
                    <div className="w-12 h-1.5 bg-slate-800/80 hover:bg-amber-400 group-hover:w-16 rounded-full shadow-lg border border-white/20 transition-all duration-300"></div>
                </div>
            )}

            {/* Floating Map Controls */}
            {showControls && (
                <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 pointer-events-auto">
                    {/* Toggle Fullscreen / Split button */}
                    {onToggleExpand && (
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className="w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl text-slate-800 hover:text-amber-500 border border-slate-200/80 flex items-center justify-center active:scale-90 transition-all"
                            title={isExpanded ? 'Reducir mapa' : 'Pantalla completa'}
                        >
                            {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                        </button>
                    )}

                    {/* Toggle Map Style (Roadmap / Satellite) */}
                    <button
                        type="button"
                        onClick={handleToggleMapStyle}
                        className="w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl text-slate-800 hover:text-blue-500 border border-slate-200/80 flex items-center justify-center active:scale-90 transition-all"
                        title={mapTypeId === 'roadmap' ? 'Cambiar a Satélite Google' : 'Cambiar a Mapa Callejero Google'}
                    >
                        <Layers className="w-5 h-5 text-blue-600" />
                    </button>

                    {/* Re-center Driver button */}
                    <button
                        type="button"
                        onClick={handleCenterDriver}
                        className="w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl text-slate-800 hover:text-emerald-500 border border-slate-200/80 flex items-center justify-center active:scale-90 transition-all"
                        title="Centrar en vehículo"
                    >
                        <Compass className="w-5 h-5 text-emerald-600" />
                    </button>
                </div>
            )}

            {/* Live 3D Tracking Badge */}
            <div className="absolute bottom-4 left-4 z-20 pointer-events-none flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg text-white">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                    {isMoto ? 'Moto 3D Google Maps' : 'Vehículo 3D Google Maps'}
                </span>
            </div>
        </div>
    );
}
