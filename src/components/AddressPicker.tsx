import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api';
import { X, MapPin, Navigation, Check, Search, Loader2 } from 'lucide-react';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES } from '../lib/mapsConfig';
import { yangoDayMapStyles } from '../lib/weather';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

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
    styles: yangoDayMapStyles
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

    const [position, setPosition] = useState(initialData ? { lat: initialData.lat, lng: initialData.lng } : defaultCenter);
    const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
    const [reference, setReference] = useState(initialData?.reference || '');
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    const onLoad = useCallback(function callback(mapInstance: google.maps.Map) {
        setMap(mapInstance);
    }, []);

    const onUnmount = useCallback(function callback() {
        setMap(null);
    }, []);

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
                coords = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
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
                coords = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
            } catch (webErr) {
                console.warn("Web GPS fallback in AddressPicker:", webErr);
            }
        }

        if (coords) {
            setPosition(coords);
            setUserLocation(coords);
            if (map) {
                map.panTo(coords);
                map.setZoom(17);
            }

            // Google Maps Geocoder reverse lookup
            if (window.google?.maps?.Geocoder) {
                const geocoder = new window.google.maps.Geocoder();
                geocoder.geocode({ location: coords }, (results, status) => {
                    if (status === 'OK' && results && results[0]?.formatted_address) {
                        setReference(results[0].formatted_address);
                    }
                });
            }
        }
        setIsLocating(false);
    }, [map]);

    // Initial load GPS detection
    useEffect(() => {
        if (!initialData) {
            handleCurrentLocation();
        }
    }, [initialData, handleCurrentLocation]);

    const executeSearch = async () => {
        const queryToSearch = searchQuery.trim();
        if (!queryToSearch) return;

        if (map && window.google?.maps?.places?.PlacesService) {
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
        } else if (map && window.google?.maps?.Geocoder) {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ address: `${queryToSearch}, Venezuela` }, (results, status) => {
                if (status === 'OK' && results && results[0]?.geometry?.location) {
                    const loc = results[0].geometry.location;
                    const newPos = { lat: loc.lat(), lng: loc.lng() };
                    setPosition(newPos);
                    map.panTo(newPos);
                    map.setZoom(17);
                    if (results[0].formatted_address && !reference) {
                        setReference(results[0].formatted_address);
                    }
                }
            });
        }
    };

    const onClick = useCallback((e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
            const newPos = {
                lat: e.latLng.lat(),
                lng: e.latLng.lng()
            };
            setPosition(newPos);
            // Reverse geocode clicked point with Google Maps Geocoder
            if (window.google?.maps?.Geocoder) {
                const geocoder = new window.google.maps.Geocoder();
                geocoder.geocode({ location: newPos }, (results, status) => {
                    if (status === 'OK' && results && results[0]?.formatted_address) {
                        setReference(results[0].formatted_address);
                    }
                });
            }
        }
    }, []);

    const handleSave = () => {
        if (!position) return;
        const refText = reference.trim();
        onSave({
            name: refText || 'Ubicación GPS confirmada',
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
                                {subtitle || "Toca en el mapa oficial de Google para fijar el punto"}
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

                {/* Google Places Autocomplete Bar */}
                <div className="p-3 bg-white border-b border-slate-100">
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
                                    placeholder="Buscar dirección..."
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

                {/* Map Container - Exclusive Official Google Maps */}
                <div className="relative w-full h-[360px] bg-slate-900">
                    {isLoaded ? (
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
                                        const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                                        setPosition(newPos);
                                        if (window.google?.maps?.Geocoder) {
                                            const geocoder = new window.google.maps.Geocoder();
                                            geocoder.geocode({ location: newPos }, (results, status) => {
                                                if (status === 'OK' && results && results[0]?.formatted_address) {
                                                    setReference(results[0].formatted_address);
                                                }
                                            });
                                        }
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
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                            <p className="text-xs font-bold text-slate-400">Iniciando Google Maps...</p>
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
                        <span>{isLocating ? "Obteniendo GPS..." : "Ubicación en tiempo real"}</span>
                    </button>
                </div>

                {/* Reference Input */}
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
