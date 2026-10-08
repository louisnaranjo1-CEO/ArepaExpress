import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api';
import { X, MapPin, Navigation, Check, Search, Loader2 } from 'lucide-react';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, useGoogleMapsResilience, getGoogleMapsLastError } from '../lib/mapsConfig';
import { googleMapsDarkStyles } from '../lib/weather';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const containerStyle = {
    width: '100%',
    height: '380px'
};

const defaultCenter = {
    lat: 8.9326, // Calabozo, Guárico, Venezuela
    lng: -67.4264
};

const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    clickableIcons: true,
    styles: googleMapsDarkStyles
};

interface AddressPickerProps {
    onClose: () => void;
    onSave: (data: { name: string; lat: number; lng: number; reference: string }) => void;
    initialData?: { name?: string; lat: number; lng: number; reference: string };
    title?: string;
    subtitle?: string;
}

export default function AddressPicker({ onClose, onSave, initialData, title, subtitle }: AddressPickerProps) {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES
    });

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const hasMapError = useGoogleMapsResilience(mapContainerRef, loadError);

    const [position, setPosition] = useState(initialData ? { lat: initialData.lat, lng: initialData.lng } : defaultCenter);

    const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
    const [reference, setReference] = useState(initialData?.reference || '');
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    const leafletMapRef = useRef<L.Map | null>(null);
    const leafletMarkerRef = useRef<L.Marker | null>(null);
    const leafletDivRef = useRef<HTMLDivElement | null>(null);

    // Leaflet fallback engine
    useEffect(() => {
        if (!hasMapError && isLoaded) return;
        if (!leafletDivRef.current) return;

        if (leafletMapRef.current) {
            leafletMapRef.current.invalidateSize();
            return;
        }

        const mapInstance = L.map(leafletDivRef.current, {
            center: [position.lat, position.lng],
            zoom: 16,
            zoomControl: false,
            attributionControl: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            subdomains: ['a', 'b', 'c'],
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstance);

        const marker = L.marker([position.lat, position.lng], {
            draggable: true
        }).addTo(mapInstance);

        marker.on('dragend', () => {
            const pos = marker.getLatLng();
            setPosition({ lat: pos.lat, lng: pos.lng });
        });

        mapInstance.on('click', (e: L.LeafletMouseEvent) => {
            marker.setLatLng(e.latlng);
            setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
        });

        leafletMapRef.current = mapInstance;
        leafletMarkerRef.current = marker;

        setTimeout(() => mapInstance.invalidateSize(), 250);

        return () => {
            mapInstance.remove();
            leafletMapRef.current = null;
            leafletMarkerRef.current = null;
        };
    }, [hasMapError, isLoaded]);

    useEffect(() => {
        if (leafletMarkerRef.current && position) {
            leafletMarkerRef.current.setLatLng([position.lat, position.lng]);
        }
    }, [position]);

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map);
    }, []);

    const onUnmount = useCallback(function callback() {
        setMap(null);
    }, []);

    const handleCurrentLocation = useCallback(async () => {
        setIsLocating(true);
        let coords: { lat: number; lng: number } | null = null;

        if (Capacitor.isNativePlatform()) {
            try {
                const perm = await Geolocation.requestPermissions();
                if (perm.location === 'granted') {
                    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
                    coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                }
            } catch (e) {
                console.warn("Native geolocation error in AddressPicker:", e);
            }
        }

        if (!coords && navigator.geolocation) {
            try {
                coords = await new Promise<{ lat: number; lng: number } | null>((res) => {
                    navigator.geolocation.getCurrentPosition(
                        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
                        () => res(null),
                        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
                    );
                });
            } catch (e) {
                console.warn("Web geolocation error in AddressPicker:", e);
            }
        }

        if (coords) {
            setPosition(coords);
            setUserLocation(coords);
            if (map) {
                map.panTo(coords);
                map.setZoom(17);
            }
            if (leafletMapRef.current) {
                leafletMapRef.current.setView([coords.lat, coords.lng], 17);
            }
        }
        setIsLocating(false);
    }, [map]);

    useEffect(() => {
        if (!initialData) {
            handleCurrentLocation();
        }
    }, [handleCurrentLocation, initialData]);

    const executeSearch = async (customQuery?: string) => {
        const queryToSearch = customQuery || searchQuery;
        if (!queryToSearch || !queryToSearch.trim()) return;

        if (map && window.google?.maps?.places) {
            const service = new window.google.maps.places.PlacesService(map);
            service.findPlaceFromQuery(
                {
                    query: queryToSearch,
                    fields: ['name', 'geometry', 'formatted_address']
                },
                (results, status) => {
                    if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results[0]?.geometry?.location) {
                        const place = results[0];
                        const newPos = {
                            lat: place.geometry.location.lat(),
                            lng: place.geometry.location.lng()
                        };
                        setPosition(newPos);
                        map.panTo(newPos);
                        map.setZoom(17);
                        if (place.formatted_address && !reference) {
                            setReference(place.formatted_address);
                        }
                    }
                }
            );
        } else {
            // Free OpenStreetMap Nominatim Search Fallback
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryToSearch + ', Calabozo, Venezuela')}&limit=1`);
                const data = await res.json();
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lng = parseFloat(data[0].lon);
                    const newPos = { lat, lng };
                    setPosition(newPos);
                    if (leafletMapRef.current) {
                        leafletMapRef.current.setView([lat, lng], 17);
                    }
                    if (!reference) {
                        setReference(data[0].display_name.split(',')[0]);
                    }
                }
            } catch (e) {
                console.warn("Nominatim search error in AddressPicker:", e);
            }
        }
    };

    const onClick = useCallback((e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
            setPosition({
                lat: e.latLng.lat(),
                lng: e.latLng.lng()
            });
        }
    }, []);

    const handleSave = () => {
        if (!position) return;
        const refText = reference.trim();
        onSave({
            name: refText || 'Ubicación GPS detectada',
            lat: position.lat,
            lng: position.lng,
            reference: refText
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300 font-sans">
            <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-300 max-h-[95vh]">
                {/* Header */}
                <div className="p-5 pb-3 flex items-center justify-between border-b border-slate-100">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-primary" />
                            {title || 'Toca el mapa para marcar'}
                        </h2>
                        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                            {subtitle || 'Mueve el marcador o busca un lugar'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Places Search Bar */}
                <div className="px-5 pt-3 pb-2 bg-white">
                    <div className="relative flex items-center">
                        {isLoaded && window.google?.maps?.places ? (
                            <Autocomplete
                                onLoad={(autocomplete) => { autocompleteRef.current = autocomplete; }}
                                onPlaceChanged={() => {
                                    if (autocompleteRef.current) {
                                        const place = autocompleteRef.current.getPlace();
                                        if (place.geometry?.location) {
                                            const newPos = {
                                                lat: place.geometry.location.lat(),
                                                lng: place.geometry.location.lng()
                                            };
                                            setPosition(newPos);
                                            if (map) {
                                                map.panTo(newPos);
                                                map.setZoom(17);
                                            }
                                            if (leafletMapRef.current) {
                                                leafletMapRef.current.setView([newPos.lat, newPos.lng], 17);
                                            }
                                            if (place.formatted_address && !reference) {
                                                setReference(place.formatted_address);
                                            }
                                        }
                                    }
                                }}
                                className="w-full"
                            >
                                <div className="relative flex items-center w-full">
                                    <input
                                        type="text"
                                        placeholder="Buscar negocio, restaurante, local o calle..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                executeSearch();
                                            }
                                        }}
                                        className="w-full bg-slate-100/80 border border-slate-200 focus:border-primary focus:bg-white p-3 pl-11 pr-10 rounded-2xl outline-none font-bold text-xs text-slate-800 transition-all shadow-inner"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => executeSearch()}
                                        className="absolute left-3 text-slate-500 hover:text-slate-900 cursor-pointer"
                                    >
                                        <Search className="w-4 h-4" />
                                    </button>
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </Autocomplete>
                        ) : (
                            <div className="relative flex items-center w-full">
                                <input
                                    type="text"
                                    placeholder="Buscar calle o zona en Calabozo..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            executeSearch();
                                        }
                                    }}
                                    className="w-full bg-slate-100/80 border border-slate-200 focus:border-primary focus:bg-white p-3 pl-11 pr-10 rounded-2xl outline-none font-bold text-xs text-slate-800 transition-all shadow-inner"
                                />
                                <button
                                    type="button"
                                    onClick={() => executeSearch()}
                                    className="absolute left-3 text-slate-500 hover:text-slate-900 cursor-pointer"
                                >
                                    <Search className="w-4 h-4" />
                                </button>
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Map Container */}
                <div className="relative w-full h-[360px] bg-slate-100" ref={mapContainerRef}>
                    {!hasMapError && isLoaded ? (
                        <GoogleMap
                            mapContainerStyle={containerStyle}
                            center={position}
                            zoom={16}
                            onLoad={onLoad}
                            onUnmount={onUnmount}
                            onClick={onClick}
                            options={mapOptions}
                        >
                            <Marker
                                position={position}
                                draggable={true}
                                onDragEnd={(e) => {
                                    if (e.latLng) {
                                        setPosition({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                                    }
                                }}
                            />

                            {userLocation && (
                                <Marker
                                    position={userLocation}
                                    icon={{
                                        path: google.maps.SymbolPath.CIRCLE,
                                        fillColor: '#4285F4',
                                        fillOpacity: 1,
                                        strokeColor: 'white',
                                        strokeWeight: 2,
                                        scale: 7
                                    }}
                                    zIndex={1}
                                />
                            )}
                        </GoogleMap>
                    ) : (
                        <div 
                            ref={leafletDivRef} 
                            style={containerStyle} 
                            className="w-full h-full"
                        />
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
                        <span>{isLocating ? "Obteniendo GPS..." : "Ubicación en tiempo real"}</span>
                    </button>
                </div>

                {/* Solo Punto de Referencia (Nombre eliminado) */}
                <div className="p-5 space-y-3.5 overflow-y-auto">
                    <div>
                        <label className="text-xs font-black text-slate-700 uppercase tracking-widest ml-1">
                            Punto de Referencia
                        </label>
                        <input
                            type="text"
                            placeholder="Ej: Casa amarilla con rejas blancas, timbre negro, Apto 4B..."
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
