import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Navigation, Check } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

interface AddressPickerProps {
    onClose: () => void;
    onSave: (data: { name: string; lat: number; lng: number; reference: string }) => void;
    initialData?: { name?: string; lat: number; lng: number; reference: string };
    title?: string;
    subtitle?: string;
}

const defaultCenter = {
    lat: 8.9326, // Calabozo, Guárico, Venezuela
    lng: -67.4264
};

// Marcador SVG personalizado para Leaflet
const createCustomPin = () => {
    return L.divIcon({
        className: 'custom-map-pin',
        html: `
            <div style="position: relative; transform: translate(-50%, -100%); cursor: pointer;">
                <div style="background-color: #FACC15; color: #0F172A; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 3px solid #ffffff;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                        <circle cx="12" cy="10" r="3"/>
                    </svg>
                </div>
                <div style="width: 4px; height: 10px; background-color: #0F172A; margin: -2px auto 0 auto; border-radius: 2px;"></div>
                <div style="width: 14px; height: 6px; background-color: rgba(0,0,0,0.25); border-radius: 50%; margin: 0 auto; filter: blur(1px);"></div>
            </div>
        `,
        iconSize: [44, 54],
        iconAnchor: [22, 54]
    });
};

export default function AddressPicker({ onClose, onSave, initialData, title, subtitle }: AddressPickerProps) {
    const [position, setPosition] = useState(initialData ? { lat: initialData.lat, lng: initialData.lng } : defaultCenter);
    const [reference, setReference] = useState(initialData?.reference || '');
    const [locating, setLocating] = useState(false);

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);

    // Inicializar Leaflet con OpenStreetMap 100% gratuito
    useEffect(() => {
        if (!mapContainerRef.current) return;

        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }

        const map = L.map(mapContainerRef.current, {
            center: [position.lat, position.lng],
            zoom: 16,
            zoomControl: false
        });

        // OpenStreetMap gratuito sin API Key ni cobros
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        const marker = L.marker([position.lat, position.lng], {
            icon: createCustomPin(),
            draggable: true
        }).addTo(map);

        marker.on('dragend', () => {
            const latlng = marker.getLatLng();
            setPosition({ lat: latlng.lat, lng: latlng.lng });
        });

        map.on('click', (e: L.LeafletMouseEvent) => {
            marker.setLatLng(e.latlng);
            setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;

        const resizeTimeout = setTimeout(() => {
            map.invalidateSize();
        }, 250);

        if (!initialData) {
            handleGpsCenter();
        }

        return () => {
            clearTimeout(resizeTimeout);
            map.remove();
            mapInstanceRef.current = null;
        };
    }, []);

    const handleGpsCenter = async () => {
        setLocating(true);
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
            if (markerRef.current) markerRef.current.setLatLng([coords.lat, coords.lng]);
            if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([coords.lat, coords.lng], 16);
                mapInstanceRef.current.invalidateSize();
            }
        }
        setLocating(false);
    };

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
                            {subtitle || 'Mueve el pin a tu punto exacto de entrega'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Map Container - OpenStreetMap gratis */}
                <div className="relative w-full h-[360px] bg-slate-100">
                    <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 1 }} />

                    {/* GPS Button */}
                    <button
                        type="button"
                        onClick={handleGpsCenter}
                        disabled={locating}
                        className="absolute bottom-4 right-4 bg-white hover:bg-slate-50 rounded-2xl shadow-xl flex items-center gap-2 text-slate-900 border border-slate-200/80 active:scale-95 transition-all px-3.5 py-2.5 z-[500] font-black text-xs"
                    >
                        <Navigation className={`w-4 h-4 text-primary fill-primary/30 ${locating ? 'animate-spin' : ''}`} />
                        <span>{locating ? "Localizando..." : "Ubicación en tiempo real"}</span>
                    </button>
                </div>

                {/* Reference Only - Sin campo de Nombre */}
                <div className="p-5 space-y-3.5 overflow-y-auto">
                    <div>
                        <label className="text-xs font-black text-slate-700 uppercase tracking-widest ml-1">
                            Punto de Referencia
                        </label>
                        <input
                            type="text"
                            placeholder="Ej: Edificio azul, Apto 4B, frente a la plaza..."
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
