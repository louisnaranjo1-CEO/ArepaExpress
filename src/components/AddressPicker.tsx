import React, { useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { X, MapPin, Navigation, Check } from 'lucide-react';

const containerStyle = {
    width: '100%',
    height: '400px'
};

const defaultCenter = {
    lat: 10.4806, // Caracas, Venezuela
    lng: -66.9036
};

interface AddressPickerProps {
    onClose: () => void;
    onSave: (data: { lat: number; lng: number; reference: string }) => void;
    initialData?: { lat: number; lng: number; reference: string };
}

export default function AddressPicker({ onClose, onSave, initialData }: AddressPickerProps) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: "AIzaSyDDEpf7x5W24gRAI3HJ0PjZBzXBZcwV8gA"
    });

    const [position, setPosition] = useState(initialData ? { lat: initialData.lat, lng: initialData.lng } : defaultCenter);
    const [reference, setReference] = useState(initialData?.reference || '');
    const [map, setMap] = useState<google.maps.Map | null>(null);

    const onLoad = useCallback(function callback(map: google.maps.Map) {
        setMap(map);
    }, []);

    const onUnmount = useCallback(function callback(map: google.maps.Map) {
        setMap(null);
    }, []);

    const onClick = (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
            setPosition({
                lat: e.latLng.lat(),
                lng: e.latLng.lng()
            });
        }
    };

    const handleSave = () => {
        onSave({
            ...position,
            reference
        });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-500">
                {/* Header */}
                <div className="p-6 pb-2 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-primary" />
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
                            options={{
                                disableDefaultUI: true,
                                zoomControl: true,
                                styles: [
                                    {
                                        "featureType": "poi",
                                        "elementType": "labels",
                                        "stylers": [{ "visibility": "off" }]
                                    }
                                ]
                            }}
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
                        </GoogleMap>
                    ) : (
                        <div style={containerStyle} className="bg-slate-100 flex flex-col items-center justify-center gap-2">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando Mapa...</span>
                        </div>
                    )}

                    {/* Quick locate button */}
                    <button
                        onClick={() => {
                            if (navigator.geolocation) {
                                navigator.geolocation.getCurrentPosition((pos) => {
                                    const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                                    setPosition(newPos);
                                    if (map) map.panTo(newPos);
                                });
                            }
                        }}
                        className="absolute bottom-6 right-6 w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-primary border border-slate-100 active:scale-95 transition-all"
                    >
                        <Navigation className="w-5 h-5 fill-primary/20" />
                    </button>
                </div>

                {/* Reference Input */}
                <div className="p-6 space-y-4">
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
                        className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <Check className="w-5 h-5" />
                        Guardar Dirección
                    </button>
                </div>
            </div>
        </div>
    );
}
