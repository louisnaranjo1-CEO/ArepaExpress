import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Maximize2, Minimize2, Compass, Layers, Navigation, Loader2 } from 'lucide-react';
import {
    getMapboxToken,
    MAPBOX_STYLE_DAY,
    DEFAULT_MAP_CENTER_LNG_LAT,
    getMapboxRoute,
    createOriginPinElement,
    createDestinationPinElement,
    createDriverPinElement
} from '../lib/mapboxConfig';

export interface Coords {
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
    interactive?: boolean;
    cameraFocus?: 'user' | 'driver' | 'fit';
    onRouteCalculated?: (info: { distance: string; duration: string; distanceKm: number; durationMin: number }) => void;
    onMapClick?: (coords: Coords) => void;
}

export const isValidCoord = (c: any): c is Coords =>
    Boolean(c && typeof c.lat === 'number' && typeof c.lng === 'number' && !isNaN(c.lat) && !isNaN(c.lng));

function calculateBearing(start: Coords, end: Coords): number {
    if (!isValidCoord(start) || !isValidCoord(end)) return 0;
    const startLat = (start.lat * Math.PI) / 180;
    const startLng = (start.lng * Math.PI) / 180;
    const endLat = (end.lat * Math.PI) / 180;
    const endLng = (end.lng * Math.PI) / 180;

    const dLng = endLng - startLng;
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(dLng);
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
    interactive = true,
    cameraFocus,
    onRouteCalculated,
    onMapClick
}: LiveTripMapProps) {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [bearing, setBearing] = useState<number>(0);
    const prevDriverLocRef = useRef<Coords | null>(null);

    // Markers references
    const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);

    const isMoto = vehicleType === 'moto' || vehicleType === 'mototaxi' || vehicleType === 'mandado' || vehicleType === 'muchacho_mandado';

    // Center calculation
    const center = useMemo(() => {
        if (isValidCoord(driverLocation)) return driverLocation;
        if (isValidCoord(origin)) return origin;
        if (isValidCoord(destination)) return destination;
        return { lat: DEFAULT_MAP_CENTER_LNG_LAT[1], lng: DEFAULT_MAP_CENTER_LNG_LAT[0] };
    }, [driverLocation, origin, destination]);

    // Initialize Mapbox map
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        mapboxgl.accessToken = getMapboxToken();

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: MAPBOX_STYLE_DAY,
            center: [center.lng, center.lat],
            zoom: 15,
            attributionControl: false,
            interactive
        });

        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

        map.on('load', () => {
            setIsLoaded(true);
            map.resize();
        });

        if (onMapClick) {
            map.on('click', (e) => {
                onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            });
        }

        mapRef.current = map;

        // ResizeObserver to automatically resize map whenever container dimensions change
        const resizeObserver = new ResizeObserver(() => {
            if (mapRef.current) {
                mapRef.current.resize();
            }
        });
        resizeObserver.observe(mapContainerRef.current);

        return () => {
            resizeObserver.disconnect();
            if (originMarkerRef.current) { originMarkerRef.current.remove(); originMarkerRef.current = null; }
            if (destMarkerRef.current) { destMarkerRef.current.remove(); destMarkerRef.current = null; }
            if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null; }
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Update bearing angle when driver location changes
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

    // Synchronize Markers
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isLoaded) return;

        // 1. Origin Marker (A)
        if (isValidCoord(origin)) {
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

        // 2. Destination Marker (B)
        if (isValidCoord(destination)) {
            if (!destMarkerRef.current) {
                const el = createDestinationPinElement();
                destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([destination.lng, destination.lat])
                    .addTo(map);
            } else {
                destMarkerRef.current.setLngLat([destination.lng, destination.lat]);
            }
        } else if (destMarkerRef.current) {
            destMarkerRef.current.remove();
            destMarkerRef.current = null;
        }

        // 3. Driver Marker
        if (isValidCoord(driverLocation)) {
            if (!driverMarkerRef.current) {
                const el = createDriverPinElement(isMoto ? 'moto' : 'car');
                driverMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center', rotation: bearing })
                    .setLngLat([driverLocation.lng, driverLocation.lat])
                    .addTo(map);
            } else {
                driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
                driverMarkerRef.current.setRotation(bearing);
            }
        } else if (driverMarkerRef.current) {
            driverMarkerRef.current.remove();
            driverMarkerRef.current = null;
        }
    }, [isLoaded, origin, destination, driverLocation, bearing, isMoto]);

    // Fetch and Draw Mapbox Route Polyline
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isLoaded) return;

        const startPt = isValidCoord(origin) ? origin : (isValidCoord(driverLocation) ? driverLocation : null);
        const endPt = isValidCoord(destination) ? destination : null;

        if (!startPt || !endPt) {
            // Limpiar capa si no hay ruta completa
            if (map.getLayer('route-line')) map.removeLayer('route-line');
            if (map.getLayer('route-casing')) map.removeLayer('route-casing');
            if (map.getSource('route')) map.removeSource('route');
            return;
        }

        let isCancelled = false;

        getMapboxRoute(startPt, endPt).then((routeResult) => {
            if (isCancelled || !routeResult || !mapRef.current) return;

            const geojsonData: GeoJSON.Feature<GeoJSON.LineString> = {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: routeResult.coordinates
                }
            };

            if (!map.getSource('route')) {
                map.addSource('route', {
                    type: 'geojson',
                    data: geojsonData
                });

                map.addLayer({
                    id: 'route-casing',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#FFFFFF',
                        'line-width': 8,
                        'line-opacity': 0.85
                    }
                });

                map.addLayer({
                    id: 'route-line',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#FF5D00', // Brand Primary Orange
                        'line-width': 5.5,
                        'line-opacity': 0.95
                    }
                });
            } else {
                (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geojsonData);
            }

            // Notificar información de ruta calculada
            if (onRouteCalculated) {
                const durationMin = (routeResult as any).durationMinutes ?? (routeResult as any).durationMin ?? 1;
                onRouteCalculated({
                    distance: `${routeResult.distanceKm} km`,
                    duration: `~${durationMin} min`,
                    distanceKm: routeResult.distanceKm,
                    durationMin: durationMin
                });
            }

            // Encajar vista suavemente si no hay foco explícito
            if (!cameraFocus || cameraFocus === 'fit') {
                map.fitBounds(routeResult.bounds, {
                    padding: { top: 70, bottom: 80, left: 50, right: 50 },
                    duration: 900
                });
            }
        });

        return () => {
            isCancelled = true;
        };
    }, [isLoaded, origin, destination, driverLocation, onRouteCalculated, cameraFocus]);

    // Manejar enfoque de cámara dinámico
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isLoaded || !cameraFocus) return;

        if (cameraFocus === 'user' && isValidCoord(origin)) {
            map.flyTo({
                center: [origin.lng, origin.lat],
                zoom: 16.5,
                duration: 700
            });
        } else if (cameraFocus === 'driver' && isValidCoord(driverLocation)) {
            map.flyTo({
                center: [driverLocation.lng, driverLocation.lat],
                zoom: 16.5,
                duration: 700
            });
        } else if (cameraFocus === 'fit') {
            const bounds = new mapboxgl.LngLatBounds();
            let count = 0;
            if (isValidCoord(origin)) { bounds.extend([origin.lng, origin.lat]); count++; }
            if (isValidCoord(destination)) { bounds.extend([destination.lng, destination.lat]); count++; }
            if (isValidCoord(driverLocation)) { bounds.extend([driverLocation.lng, driverLocation.lat]); count++; }
            if (count > 1) {
                map.fitBounds(bounds, {
                    padding: { top: 80, bottom: 120, left: 50, right: 50 },
                    duration: 800
                });
            } else if (isValidCoord(origin)) {
                map.flyTo({ center: [origin.lng, origin.lat], zoom: 16, duration: 700 });
            }
        }
    }, [cameraFocus, isLoaded, origin, destination, driverLocation]);

    const handleCenterDriver = () => {
        const target = isValidCoord(driverLocation) ? driverLocation : (isValidCoord(origin) ? origin : null);
        if (mapRef.current && target) {
            mapRef.current.flyTo({
                center: [target.lng, target.lat],
                zoom: 16.5,
                duration: 800
            });
        }
    };

    const handleZoomIn = () => {
        if (mapRef.current) mapRef.current.zoomIn();
    };

    const handleZoomOut = () => {
        if (mapRef.current) mapRef.current.zoomOut();
    };

    return (
        <div className="relative w-full h-full overflow-hidden bg-slate-100 select-none transform-gpu will-change-transform">
            {/* Mapbox Canvas Container */}
            <div ref={mapContainerRef} className="w-full h-full transform-gpu" />

            {!isLoaded && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm text-white gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                    <p className="text-xs font-black uppercase tracking-wider text-amber-400">Cargando Mapbox...</p>
                </div>
            )}

            {/* Floating Map Controls */}
            {showControls && isLoaded && (
                <div className="absolute right-4 bottom-6 z-30 flex flex-col gap-2 pointer-events-auto">
                    {/* Recenter button */}
                    <button
                        type="button"
                        onClick={handleCenterDriver}
                        title="Centrar conductor"
                        className="w-10 h-10 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-700 hover:text-primary active:scale-90 transition-all border border-slate-200"
                    >
                        <Navigation className="w-5 h-5 fill-primary text-primary" />
                    </button>

                    {/* Zoom In */}
                    <button
                        type="button"
                        onClick={handleZoomIn}
                        title="Acercar"
                        className="w-10 h-10 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-800 font-bold text-lg hover:text-primary active:scale-90 transition-all border border-slate-200"
                    >
                        +
                    </button>

                    {/* Zoom Out */}
                    <button
                        type="button"
                        onClick={handleZoomOut}
                        title="Alejar"
                        className="w-10 h-10 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-800 font-bold text-lg hover:text-primary active:scale-90 transition-all border border-slate-200"
                    >
                        -
                    </button>

                    {/* Expand/Collapse */}
                    {onToggleExpand && (
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            title={isExpanded ? "Reducir mapa" : "Expandir mapa"}
                            className="w-10 h-10 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-700 hover:text-primary active:scale-90 transition-all border border-slate-200"
                        >
                            {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
