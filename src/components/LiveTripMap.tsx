import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, Minimize2, Navigation, Compass, Layers } from 'lucide-react';

interface Coords {
    lat: number;
    lng: number;
}

interface LiveTripMapProps {
    origin?: Coords | null;
    destination?: Coords | null;
    driverLocation?: Coords | null;
    vehicleType?: 'moto' | 'mototaxi' | 'carro' | 'taxi' | 'confort' | string;
    driverName?: string;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    showControls?: boolean;
}

// Compute bearing angle between two coordinates (0 - 360 degrees)
function calculateBearing(start: Coords, end: Coords): number {
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
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const driverMarkerRef = useRef<L.Marker | null>(null);
    const originMarkerRef = useRef<L.Marker | null>(null);
    const destMarkerRef = useRef<L.Marker | null>(null);
    const routeLineRef = useRef<L.Polyline | null>(null);
    const prevDriverLocRef = useRef<Coords | null>(null);
    const [bearing, setBearing] = useState<number>(0);

    const isMoto = vehicleType === 'moto' || vehicleType === 'mototaxi' || vehicleType === 'mandado' || vehicleType === 'muchacho_mandado';

    // 3D Vehicle Icon Generator
    const create3DVehicleIcon = (angle: number) => {
        if (isMoto) {
            // Isometric 3D Motorcycle with pulsing neon glow and perspective tilt
            return L.divIcon({
                className: 'vehicle-3d-marker',
                html: `
                    <div style="position: relative; width: 64px; height: 64px; transform: translate(-50%, -50%); pointer-events: none;">
                        <style>
                            @keyframes motoPulse {
                                0% { transform: scale(0.9); opacity: 0.8; }
                                50% { transform: scale(1.15); opacity: 0.3; }
                                100% { transform: scale(0.9); opacity: 0.8; }
                            }
                            @keyframes engineVibe {
                                0% { transform: translate(-50%, -50%) rotate(${angle}deg) scale(1); }
                                50% { transform: translate(-50%, -50%) rotate(${angle}deg) scale(1.03); }
                                100% { transform: translate(-50%, -50%) rotate(${angle}deg) scale(1); }
                            }
                        </style>
                        <!-- Ground Pulse Ring -->
                        <div style="position: absolute; left: 50%; top: 50%; width: 48px; height: 48px; margin-left: -24px; margin-top: -24px; border-radius: 50%; background: radial-gradient(circle, rgba(16,185,129,0.4) 0%, rgba(16,185,129,0) 70%); animation: motoPulse 1.8s infinite ease-in-out;"></div>
                        <!-- 3D Motorcycle Body -->
                        <div style="position: absolute; left: 50%; top: 50%; width: 42px; height: 42px; transform: translate(-50%, -50%) rotate(${angle}deg); transition: transform 0.4s ease-out; filter: drop-shadow(0 8px 12px rgba(0,0,0,0.5));">
                            <svg width="42" height="42" viewBox="0 0 100 100" fill="none">
                                <!-- Shadow -->
                                <ellipse cx="50" cy="55" rx="30" ry="12" fill="rgba(0,0,0,0.35)" />
                                <!-- Rear wheel -->
                                <ellipse cx="50" cy="80" rx="9" ry="15" fill="#0f172a" stroke="#f59e0b" stroke-width="4" />
                                <!-- Front wheel -->
                                <ellipse cx="50" cy="22" rx="9" ry="15" fill="#0f172a" stroke="#f59e0b" stroke-width="4" />
                                <!-- Frame Body (3D Top View) -->
                                <path d="M43 32 L57 32 L54 68 L46 68 Z" fill="#059669" stroke="#10b981" stroke-width="2" />
                                <rect x="44" y="44" width="12" height="18" rx="4" fill="#047857" />
                                <!-- Fuel Tank & Seat -->
                                <ellipse cx="50" cy="46" rx="7" ry="10" fill="#f59e0b" />
                                <ellipse cx="50" cy="60" rx="6" ry="8" fill="#1e293b" />
                                <!-- Handlebars -->
                                <line x1="30" y1="28" x2="70" y2="28" stroke="#f1f5f9" stroke-width="5" stroke-linecap="round" />
                                <circle cx="30" cy="28" r="4" fill="#0f172a" />
                                <circle cx="70" cy="28" r="4" fill="#0f172a" />
                                <!-- Headlight Cone Beam -->
                                <path d="M45 16 L30 0 L70 0 L55 16 Z" fill="url(#motoBeam)" opacity="0.75" />
                                <defs>
                                    <linearGradient id="motoBeam" x1="0" y1="1" x2="0" y2="0">
                                        <stop offset="0%" stop-color="#34d399" stop-opacity="0.8"/>
                                        <stop offset="100%" stop-color="#34d399" stop-opacity="0"/>
                                    </linearGradient>
                                </defs>
                                <!-- Driver Helmet -->
                                <circle cx="50" cy="42" r="8" fill="#ffffff" stroke="#0f172a" stroke-width="2" />
                                <path d="M44 38 Q50 34 56 38" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round" />
                            </svg>
                        </div>
                    </div>
                `,
                iconSize: [64, 64],
                iconAnchor: [32, 32]
            });
        } else {
            // Isometric 3D Car / Confort Sedan with Headlight Cones & Realistic Shadow
            return L.divIcon({
                className: 'vehicle-3d-marker',
                html: `
                    <div style="position: relative; width: 72px; height: 72px; transform: translate(-50%, -50%); pointer-events: none;">
                        <style>
                            @keyframes carGlow {
                                0% { opacity: 0.6; }
                                50% { opacity: 0.9; }
                                100% { opacity: 0.6; }
                            }
                        </style>
                        <!-- 3D Car Model -->
                        <div style="position: absolute; left: 50%; top: 50%; width: 48px; height: 64px; transform: translate(-50%, -50%) rotate(${angle}deg); transition: transform 0.4s ease-out; filter: drop-shadow(0 10px 16px rgba(0,0,0,0.55));">
                            <svg width="48" height="64" viewBox="0 0 100 130" fill="none">
                                <!-- Headlight Beams (Front projection) -->
                                <path d="M30 20 L10 -15 L45 -15 L38 20 Z" fill="url(#carHeadlightLeft)" opacity="0.65" style="animation: carGlow 2s infinite ease-in-out;" />
                                <path d="M62 20 L55 -15 L90 -15 L70 20 Z" fill="url(#carHeadlightRight)" opacity="0.65" style="animation: carGlow 2s infinite ease-in-out;" />
                                <defs>
                                    <linearGradient id="carHeadlightLeft" x1="0" y1="1" x2="0" y2="0">
                                        <stop offset="0%" stop-color="#fef08a" stop-opacity="0.9"/>
                                        <stop offset="100%" stop-color="#fef08a" stop-opacity="0"/>
                                    </linearGradient>
                                    <linearGradient id="carHeadlightRight" x1="0" y1="1" x2="0" y2="0">
                                        <stop offset="0%" stop-color="#fef08a" stop-opacity="0.9"/>
                                        <stop offset="100%" stop-color="#fef08a" stop-opacity="0"/>
                                    </linearGradient>
                                </defs>
                                <!-- Ground Shadow -->
                                <rect x="18" y="24" width="64" height="92" rx="20" fill="rgba(0,0,0,0.4)" filter="blur(3px)" />
                                <!-- Car Chassis -->
                                <rect x="20" y="20" width="60" height="90" rx="18" fill="#eab308" stroke="#ca8a04" stroke-width="2.5" />
                                <!-- Roof / Cabin -->
                                <path d="M28 40 L72 40 L67 85 L33 85 Z" fill="#1e293b" />
                                <!-- Windshield -->
                                <path d="M29 42 L71 42 L65 56 L35 56 Z" fill="#38bdf8" opacity="0.85" />
                                <!-- Rear Window -->
                                <path d="M34 76 L66 76 L63 84 L37 84 Z" fill="#38bdf8" opacity="0.75" />
                                <!-- Side Mirrors -->
                                <ellipse cx="17" cy="44" rx="4" ry="6" fill="#ca8a04" />
                                <ellipse cx="83" cy="44" rx="4" ry="6" fill="#ca8a04" />
                                <!-- Headlights (Yellow/White LEDs) -->
                                <circle cx="32" cy="22" r="4.5" fill="#fef08a" stroke="#ffffff" stroke-width="1.5" />
                                <circle cx="68" cy="22" r="4.5" fill="#fef08a" stroke="#ffffff" stroke-width="1.5" />
                                <!-- Taillights (Red LEDs) -->
                                <rect x="28" y="106" width="10" height="3" rx="1.5" fill="#ef4444" />
                                <rect x="62" y="106" width="10" height="3" rx="1.5" fill="#ef4444" />
                                <!-- Taxi Checkerboard Roof Sign -->
                                <rect x="36" y="58" width="28" height="10" rx="3" fill="#ffffff" stroke="#0f172a" stroke-width="1.5" />
                                <text x="50" y="66" font-size="7" font-weight="900" fill="#0f172a" text-anchor="middle" font-family="sans-serif">TAXI</text>
                            </svg>
                        </div>
                    </div>
                `,
                iconSize: [72, 72],
                iconAnchor: [36, 36]
            });
        }
    };

    // 3D Point Pin Generator
    const create3DPinIcon = (type: 'origin' | 'destination') => {
        const isOrigin = type === 'origin';
        const color = isOrigin ? '#10b981' : '#f59e0b';
        const label = isOrigin ? 'A' : 'B';

        return L.divIcon({
            className: 'pin-3d-marker',
            html: `
                <div style="position: relative; transform: translate(-50%, -100%);">
                    <div style="background: ${color}; width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 16px rgba(0,0,0,0.3); border: 3px solid #ffffff;">
                        <span style="transform: rotate(45deg); font-weight: 900; font-size: 13px; color: #ffffff; font-family: sans-serif;">${label}</span>
                    </div>
                    <div style="width: 14px; height: 5px; background: rgba(0,0,0,0.3); border-radius: 50%; margin: 2px auto 0 auto; filter: blur(1px);"></div>
                </div>
            `,
            iconSize: [34, 44],
            iconAnchor: [17, 44]
        });
    };

    // Initialize Leaflet Map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }

        const initialCenter: [number, number] = driverLocation
            ? [driverLocation.lat, driverLocation.lng]
            : origin
            ? [origin.lat, origin.lng]
            : [8.9326, -67.4264]; // Venezuela fallback center

        const map = L.map(mapContainerRef.current, {
            center: initialCenter,
            zoom: 15,
            zoomControl: false,
            attributionControl: false,
        });

        // 100% Free CartoDB Voyager Tile Layer (Modern, fast, clean vector style)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
        }).addTo(map);

        mapRef.current = map;

        // Smooth resize handler
        setTimeout(() => {
            map.invalidateSize();
        }, 200);

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Resize map when expanded state changes
    useEffect(() => {
        if (!mapRef.current) return;
        const timer = setTimeout(() => {
            mapRef.current?.invalidateSize();
        }, 300);
        return () => clearTimeout(timer);
    }, [isExpanded]);

    // Update Markers & Polyline Route
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // 1. Origin Marker
        if (origin) {
            if (!originMarkerRef.current) {
                originMarkerRef.current = L.marker([origin.lat, origin.lng], {
                    icon: create3DPinIcon('origin'),
                    zIndexOffset: 100
                }).addTo(map);
            } else {
                originMarkerRef.current.setLatLng([origin.lat, origin.lng]);
            }
        }

        // 2. Destination Marker
        if (destination) {
            if (!destMarkerRef.current) {
                destMarkerRef.current = L.marker([destination.lat, destination.lng], {
                    icon: create3DPinIcon('destination'),
                    zIndexOffset: 100
                }).addTo(map);
            } else {
                destMarkerRef.current.setLatLng([destination.lat, destination.lng]);
            }
        }

        // 3. Driver Location & Bearing Calculation
        const currentDriverLoc = driverLocation || origin;
        if (currentDriverLoc) {
            let currentBearing = bearing;
            if (prevDriverLocRef.current) {
                const dist = Math.hypot(
                    currentDriverLoc.lat - prevDriverLocRef.current.lat,
                    currentDriverLoc.lng - prevDriverLocRef.current.lng
                );
                if (dist > 0.00005) {
                    currentBearing = calculateBearing(prevDriverLocRef.current, currentDriverLoc);
                    setBearing(currentBearing);
                }
            } else if (destination) {
                currentBearing = calculateBearing(currentDriverLoc, destination);
                setBearing(currentBearing);
            }

            prevDriverLocRef.current = currentDriverLoc;

            const icon = create3DVehicleIcon(currentBearing);
            if (!driverMarkerRef.current) {
                driverMarkerRef.current = L.marker([currentDriverLoc.lat, currentDriverLoc.lng], {
                    icon,
                    zIndexOffset: 500
                }).addTo(map);
            } else {
                driverMarkerRef.current.setLatLng([currentDriverLoc.lat, currentDriverLoc.lng]);
                driverMarkerRef.current.setIcon(icon);
            }
        }

        // 4. Trajectory Polyline
        const waypoints: [number, number][] = [];
        if (driverLocation) waypoints.push([driverLocation.lat, driverLocation.lng]);
        else if (origin) waypoints.push([origin.lat, origin.lng]);
        if (destination) waypoints.push([destination.lat, destination.lng]);

        if (waypoints.length >= 2) {
            if (!routeLineRef.current) {
                routeLineRef.current = L.polyline(waypoints, {
                    color: '#0284c7',
                    weight: 5,
                    opacity: 0.8,
                    dashArray: '8, 8',
                    lineCap: 'round',
                    lineJoin: 'round',
                }).addTo(map);
            } else {
                routeLineRef.current.setLatLngs(waypoints);
            }
        }

        // Auto-fit bounds if we have both points
        if (waypoints.length >= 2) {
            const bounds = L.latLngBounds(waypoints);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        } else if (currentDriverLoc) {
            map.panTo([currentDriverLoc.lat, currentDriverLoc.lng]);
        }
    }, [origin, destination, driverLocation, vehicleType]);

    const handleCenterDriver = () => {
        const map = mapRef.current;
        const target = driverLocation || origin;
        if (map && target) {
            map.flyTo([target.lat, target.lng], 16, { duration: 1 });
        }
    };

    return (
        <div className="relative w-full h-full overflow-hidden bg-slate-900 select-none">
            {/* Leaflet Map Div */}
            <div ref={mapContainerRef} className="w-full h-full z-0" />

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
                    {isMoto ? 'Moto 3D en vivo' : 'Vehículo 3D en vivo'}
                </span>
            </div>
        </div>
    );
}
