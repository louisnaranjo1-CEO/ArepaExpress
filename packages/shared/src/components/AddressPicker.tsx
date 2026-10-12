import React, { useState, useCallback, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { X, MapPin, Navigation, Check, Search, Loader2 } from 'lucide-react';
import {
    getMapboxToken,
    MAPBOX_STYLE_DAY,
    DEFAULT_MAP_CENTER,
    searchMapboxPlaces,
    reverseGeocodeMapbox,
    MapboxPlace
} from '../lib/mapboxConfig';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

interface AddressPickerProps {
    onClose: () => void;
    onSave: (data: { name: string; lat: number; lng: number; reference: string }) => void;
    initialData?: { name?: string; lat: number; lng: number; reference: string };
    title?: string;
    subtitle?: string;
}

export default function AddressPicker({ onClose, onSave, initialData, title, subtitle }: AddressPickerProps) {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markerRef = useRef<mapboxgl.Marker | null>(null);
    const userGpsMarkerRef = useRef<mapboxgl.Marker | null>(null);

    const [isLoaded, setIsLoaded] = useState(false);
    const [position, setPosition] = useState<{ lat: number; lng: number }>(
        initialData ? { lat: initialData.lat, lng: initialData.lng } : DEFAULT_MAP_CENTER
    );
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [reference, setReference] = useState(initialData?.reference || '');
    const [isLocating, setIsLocating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState<MapboxPlace[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Initial Mapbox Map Load
    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        mapboxgl.accessToken = getMapboxToken();

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: MAPBOX_STYLE_DAY,
            center: [position.lng, position.lat],
            zoom: 16,
            attributionControl: false
        });

        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

        map.on('load', () => {
            setIsLoaded(true);
            map.resize();

            // Create Draggable Pin
            const markerEl = document.createElement('div');
            markerEl.innerHTML = `
                <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: grab;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: #FF5D00; border: 3px solid #FFFFFF; box-shadow: 0 4px 14px rgba(255,93,0,0.5); display: flex; align-items: center; justify-content: center; color: white;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                    </div>
                    <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #FF5D00; margin-top: -2px;"></div>
                </div>
            `;

            const marker = new mapboxgl.Marker({ element: markerEl, draggable: true, anchor: 'bottom' })
                .setLngLat([position.lng, position.lat])
                .addTo(map);

            marker.on('dragend', async () => {
                const lngLat = marker.getLngLat();
                const newPos = { lat: lngLat.lat, lng: lngLat.lng };
                setPosition(newPos);

                // Reverse geocode on drag end
                const rev = await reverseGeocodeMapbox(newPos.lat, newPos.lng);
                if (rev) {
                    setReference(prev => prev.trim() ? prev : rev.place_name);
                }
            });

            markerRef.current = marker;
        });

        // Click to place marker
        map.on('click', async (e) => {
            const newPos = { lat: e.lngLat.lat, lng: e.lngLat.lng };
            setPosition(newPos);
            if (markerRef.current) {
                markerRef.current.setLngLat([newPos.lng, newPos.lat]);
            }
            const rev = await reverseGeocodeMapbox(newPos.lat, newPos.lng);
            if (rev) {
                setReference(prev => prev.trim() ? prev : rev.place_name);
            }
        });

        mapRef.current = map;

        const resizeObserver = new ResizeObserver(() => {
            if (mapRef.current) mapRef.current.resize();
        });
        resizeObserver.observe(mapContainerRef.current);

        return () => {
            resizeObserver.disconnect();
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Get Current GPS Location
    const handleCurrentLocation = useCallback(async () => {
        setIsLocating(true);
        let coords: { lat: number; lng: number } | null = null;

        if (Capacitor.isNativePlatform()) {
            try {
                const perm = await Geolocation.checkPermissions();
                if (perm.location !== 'granted') {
                    await Geolocation.requestPermissions();
                }
                const pos = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 5000
                });
                coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            } catch (err) {
                console.warn("Native GPS fallback in AddressPicker:", err);
            }
        }

        if (!coords && navigator.geolocation) {
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 5000
                    });
                });
                coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            } catch (webErr) {
                console.warn("Web GPS fallback in AddressPicker:", webErr);
            }
        }

        if (coords) {
            setPosition(coords);
            setUserLocation(coords);

            if (mapRef.current) {
                mapRef.current.flyTo({
                    center: [coords.lng, coords.lat],
                    zoom: 16.5,
                    duration: 1000
                });
            }

            if (markerRef.current) {
                markerRef.current.setLngLat([coords.lng, coords.lat]);
            }

            // Reverse lookup
            const rev = await reverseGeocodeMapbox(coords.lat, coords.lng);
            if (rev && !reference) {
                setReference(rev.place_name);
            }
        }
        setIsLocating(false);
    }, [reference]);

    // Initial GPS detection if no initial data
    useEffect(() => {
        if (!initialData) {
            handleCurrentLocation();
        }
    }, [initialData, handleCurrentLocation]);

    // Search Autocomplete with debounce
    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            const results = await searchMapboxPlaces(searchQuery, position);
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
            setIsSearching(false);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery, position]);

    const handleSelectPlace = (place: MapboxPlace) => {
        const newPos = { lat: place.lat, lng: place.lng };
        setPosition(newPos);
        setSearchQuery(place.name);
        setShowSuggestions(false);
        if (!reference) {
            setReference(place.place_name);
        }

        if (mapRef.current) {
            mapRef.current.flyTo({
                center: [newPos.lng, newPos.lat],
                zoom: 16.5,
                duration: 900
            });
        }
        if (markerRef.current) {
            markerRef.current.setLngLat([newPos.lng, newPos.lat]);
        }
    };

    const handleSave = () => {
        if (!position) return;
        const refText = reference.trim();
        onSave({
            name: refText || 'Ubicación confirmada',
            lat: position.lat,
            lng: position.lng,
            reference: refText
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-white/20">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-amber-500/10 flex items-center justify-center text-primary">
                            <MapPin className="w-5 h-5 fill-primary text-primary" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-sm">
                                {title || "Seleccionar Ubicación"}
                            </h3>
                            <p className="text-[11px] font-bold text-slate-500">
                                {subtitle || "Mueve el pin o toca el mapa para fijar tu punto"}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Mapbox Places Search Bar */}
                <div className="p-3 bg-white border-b border-slate-100 relative">
                    <div className="relative flex items-center w-full">
                        <input
                            type="text"
                            placeholder="Buscar negocio, calle, local o referencia..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                            className="w-full bg-slate-100/90 border border-slate-200 focus:border-primary focus:bg-white p-3 pl-11 pr-10 rounded-2xl outline-none font-bold text-xs text-slate-800 transition-all shadow-inner"
                        />
                        <button
                            type="button"
                            className="absolute left-3 text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                            {isSearching ? (
                                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                            ) : (
                                <Search className="w-4 h-4" />
                            )}
                        </button>
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => { setSearchQuery(''); setShowSuggestions(false); }}
                                className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Autocomplete Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-full left-3 right-3 z-30 mt-1 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                            {suggestions.map((place) => (
                                <button
                                    key={place.id}
                                    type="button"
                                    onClick={() => handleSelectPlace(place)}
                                    className="w-full p-3 text-left hover:bg-amber-50/50 flex items-start gap-2.5 transition-colors cursor-pointer"
                                >
                                    <MapPin className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-slate-800 truncate">{place.name}</p>
                                        <p className="text-[11px] text-slate-500 font-medium truncate">{place.place_name}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Mapbox Canvas Container */}
                <div className="relative w-full h-[360px] bg-slate-100">
                    <div ref={mapContainerRef} className="w-full h-full" />

                    {!isLoaded && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm text-white gap-2">
                            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                            <p className="text-xs font-bold text-slate-300">Cargando mapa Mapbox...</p>
                        </div>
                    )}

                    {/* Real-time locate button */}
                    <button
                        type="button"
                        onClick={handleCurrentLocation}
                        disabled={isLocating}
                        className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center gap-2 text-slate-900 border border-slate-200 active:scale-95 transition-all px-3.5 py-2.5 z-10 font-black text-xs cursor-pointer disabled:opacity-70"
                    >
                        {isLocating ? (
                            <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        ) : (
                            <Navigation className="w-4 h-4 fill-primary text-primary" />
                        )}
                        <span>{isLocating ? "Obteniendo GPS..." : "Mi ubicación GPS"}</span>
                    </button>
                </div>

                {/* Reference Input */}
                <div className="p-5 space-y-3.5 overflow-y-auto">
                    <div>
                        <label className="text-xs font-black text-slate-700 uppercase tracking-widest ml-1">
                            Punto de Referencia o Dirección
                        </label>
                        <input
                            type="text"
                            placeholder="Ej: Calle 6, Casa amarilla frente a la plaza, timbre negro..."
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            className="w-full bg-slate-50 border-2 border-slate-200 focus:border-primary focus:bg-white px-4 py-3.5 rounded-2xl outline-none font-bold text-slate-800 transition-all text-sm mt-1"
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={!position}
                        className="w-full bg-primary hover:bg-yellow-400 text-slate-950 py-4 rounded-2xl font-black text-sm shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer"
                    >
                        <Check className="w-5 h-5 stroke-[2.5]" />
                        <span>Guardar Dirección</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
