import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api';
import { X, MapPin, Navigation, Check, Search, Loader2 } from 'lucide-react';

const containerStyle = {
    width: '100%',
    height: '400px'
};

const defaultCenter = {
    lat: 10.4806, // Caracas, Venezuela
    lng: -66.9036
};

// Custom map theme
const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    clickableIcons: true,
};

interface AddressPickerProps {
    onClose: () => void;
    onSave: (data: { name: string; lat: number; lng: number; reference: string }) => void;
    initialData?: { name: string; lat: number; lng: number; reference: string };
}

export default function AddressPicker({ onClose, onSave, initialData }: AddressPickerProps) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: "AIzaSyAT2_wZfYTBGDR7gEpLXRzG-BUQ9Cbu0aQ",
        libraries: ['places', 'geometry'] as any
    });

    const [position, setPosition] = useState(initialData ? { lat: initialData.lat, lng: initialData.lng } : defaultCenter);
    const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
    const [reference, setReference] = useState(initialData?.reference || '');
    const [name, setName] = useState(initialData?.name || '');
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map);
    }, []);

    const onUnmount = useCallback(function callback(map: google.maps.Map) {
        setMap(null);
    }, []);

    const handleCurrentLocation = useCallback(() => {
        if (!navigator.geolocation) {
            alert("Tu dispositivo o navegador no soporta geolocalización.");
            return;
        }
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setPosition(newPos);
                setUserLocation(newPos);
                if (map) {
                    map.panTo(newPos);
                    map.setZoom(17);
                }
                setIsLocating(false);
            },
            (err) => {
                console.warn("Error al obtener ubicación en tiempo real:", err);
                setIsLocating(false);
                if (err.code === 1) {
                    alert("Por favor concede permiso de ubicación en tu navegador o dispositivo para ubicar tu negocio de forma precisa.");
                } else {
                    alert("No se pudo obtener la señal GPS con precisión. Intenta nuevamente o busca en el mapa.");
                }
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }, [map]);

    useEffect(() => {
        if (!initialData) {
            handleCurrentLocation();
        }

        // Real-time location tracking (Blue Dot)
        let watchId: number;
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    setUserLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    });
                },
                (err) => console.warn("Error watching location:", err),
                { enableHighAccuracy: true, maximumAge: 1000 }
            );
        }

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
        };
    }, [handleCurrentLocation, initialData]);

    const handlePlaceChanged = () => {
        if (autocompleteRef.current !== null) {
            const place = autocompleteRef.current.getPlace();
            if (place.geometry && place.geometry.location) {
                const newPos = {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng()
                };
                setPosition(newPos);
                if (map) {
                    map.panTo(newPos);
                    map.setZoom(17);
                }
                if (place.name) {
                    setName(place.name);
                }
                if (place.formatted_address) {
                    setReference(prev => prev ? prev : place.formatted_address || '');
                }
            }
        }
    };

    const onClick = (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
            setPosition({
                lat: e.latLng.lat(),
                lng: e.latLng.lng()
            });
        }
    };

    const handleSave = () => {
        if (!position || !name.trim()) return;
        onSave({
            name: name,
            lat: position.lat,
            lng: position.lng,
            reference
        });
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-500">
                {/* Header */}
                <div className="p-6 pb-2 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-slate-900" />
                            Tu Ubicación
                        </h2>
                        <p className="text-xs text-slate-500 font-bold mt-1 uppercase tracking-widest">Toca el mapa para marcar</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search Bar / Buscador de Negocio o Lugar */}
                {isLoaded && (
                    <div className="px-6 py-2">
                        <div className="relative">
                            <Autocomplete
                                onLoad={(auto) => { autocompleteRef.current = auto; }}
                                onPlaceChanged={handlePlaceChanged}
                            >
                                <div className="relative flex items-center">
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Buscar negocio, restaurante, local o dirección..."
                                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-primary focus:bg-white pl-11 pr-4 py-3 rounded-2xl outline-none font-bold text-slate-800 text-sm shadow-xs transition-all placeholder:text-slate-400"
                                    />
                                    <Search className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-3 text-slate-400 hover:text-slate-600 p-1"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </Autocomplete>
                        </div>
                    </div>
                )}

                {/* Map Container */}
                <div className="relative">
                    {isLoaded ? (
                        <GoogleMap
                            mapContainerStyle={containerStyle}
                            center={position}
                            zoom={15}
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

                            {/* Real-time User Location (Blue Dot) */}
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
                        <div style={containerStyle} className="bg-slate-100 flex flex-col items-center justify-center gap-2">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Mapa...</span>
                        </div>
                    )}

                    {/* Real-time locate button */}
                    <button
                        type="button"
                        onClick={handleCurrentLocation}
                        disabled={isLocating}
                        className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center gap-2 text-slate-900 border border-slate-200 active:scale-95 transition-all p-3.5 group cursor-pointer disabled:opacity-70"
                        title="Obtener ubicación en tiempo real con alta precisión"
                    >
                        {isLocating ? (
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        ) : (
                            <Navigation className="w-5 h-5 fill-primary text-primary group-hover:scale-110 transition-transform" />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest pr-1">
                            {isLocating ? "Obteniendo GPS..." : "Ubicación en tiempo real"}
                        </span>
                    </button>
                </div>

                {/* Reference Input */}
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nombre del Local / Ubicación</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Ej: 911 Grill, Sede Principal, Sucursal..."
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Punto de Referencia</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Ej: Edificio azul, Apto 4B..."
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={!position}
                        className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <Check className="w-5 h-5" />
                        Guardar Dirección
                    </button>
                </div>
            </div>
        </div>
    );
}
