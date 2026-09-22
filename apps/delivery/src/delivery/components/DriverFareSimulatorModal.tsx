import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Navigation, Sun, Moon, Sparkles, DollarSign, ShieldCheck, MapPin, RotateCcw } from 'lucide-react';

interface Coords {
    lat: number;
    lng: number;
}

export interface DriverFares {
    base_fare_day: number;
    base_distance_day: number;
    extra_km_price_day: number;
    base_fare_night: number;
    base_distance_night: number;
    extra_km_price_night: number;
    comfort_base_fare_day?: number;
    comfort_base_distance_day?: number;
    comfort_extra_km_price_day?: number;
    comfort_base_fare_night?: number;
    comfort_base_distance_night?: number;
    comfort_extra_km_price_night?: number;
    base_fare?: number;
    base_km?: number;
    per_km_fare?: number;
    comfort_base_fare?: number;
    comfort_per_km_fare?: number;
    pricing_type?: 'flat' | 'distance' | 'mixed';
}

interface DriverFareSimulatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    driverFares: DriverFares;
    vehicleType?: string;
    isComfortEligible?: boolean;
    adminSettings?: any;
    bcvRate?: number;
}

// Haversine distance with 1.3x urban road curvature factor
function calculateUrbanDistanceKm(c1: Coords, c2: Coords): number {
    const R = 6371; // Earth radius km
    const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
    const dLng = ((c2.lng - c1.lng) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((c1.lat * Math.PI) / 180) *
            Math.cos((c2.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightKm = R * c;
    return parseFloat((straightKm * 1.28).toFixed(1));
}

export default function DriverFareSimulatorModal({
    isOpen,
    onClose,
    driverFares,
    vehicleType = 'moto',
    isComfortEligible = false,
    adminSettings,
    bcvRate = 0
}: DriverFareSimulatorModalProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const originMarkerRef = useRef<L.Marker | null>(null);
    const destMarkerRef = useRef<L.Marker | null>(null);
    const polylineRef = useRef<L.Polyline | null>(null);

    const [shift, setShift] = useState<'day' | 'night'>('day');
    const [useComfort, setUseComfort] = useState(false);
    const [simulatedKm, setSimulatedKm] = useState<number>(5.0);

    // Initial default coordinates in Caracas / Venezuela
    const [originCoords, setOriginCoords] = useState<Coords>({ lat: 10.4900, lng: -66.8850 });
    const [destCoords, setDestCoords] = useState<Coords>({ lat: 10.4850, lng: -66.8350 });

    // Initialize or update distance when markers move
    useEffect(() => {
        const d = calculateUrbanDistanceKm(originCoords, destCoords);
        if (d > 0.2) {
            setSimulatedKm(d);
        }
    }, [originCoords, destCoords]);

    // Setup Leaflet map when modal opens
    useEffect(() => {
        if (!isOpen) return;

        let map: L.Map | null = null;
        const timer = setTimeout(() => {
            if (!mapContainerRef.current) return;

            // Free CartoDB Voyager tiles (clean, fast, free, no Google billing)
            map = L.map(mapContainerRef.current, {
                center: [originCoords.lat, originCoords.lng],
                zoom: 13,
                zoomControl: true,
                attributionControl: false
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd'
            }).addTo(map);

            mapRef.current = map;

            // Custom Origin Icon (Green Pin)
            const originIcon = L.divIcon({
                className: 'sim-origin-marker',
                html: `
                    <div style="background: #10B981; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; box-shadow: 0 4px 12px rgba(16,185,129,0.5); border: 3px solid white;">
                        A
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            // Custom Destination Icon (Red Pin)
            const destIcon = L.divIcon({
                className: 'sim-dest-marker',
                html: `
                    <div style="background: #EF4444; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; box-shadow: 0 4px 12px rgba(239,68,68,0.5); border: 3px solid white;">
                        B
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            // Origin Marker (Draggable)
            const oMarker = L.marker([originCoords.lat, originCoords.lng], {
                icon: originIcon,
                draggable: true
            }).addTo(map);

            oMarker.on('dragend', (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                setOriginCoords({ lat: ll.lat, lng: ll.lng });
            });
            originMarkerRef.current = oMarker;

            // Destination Marker (Draggable)
            const dMarker = L.marker([destCoords.lat, destCoords.lng], {
                icon: destIcon,
                draggable: true
            }).addTo(map);

            dMarker.on('dragend', (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                setDestCoords({ lat: ll.lat, lng: ll.lng });
            });
            destMarkerRef.current = dMarker;

            // Route Polyline
            const line = L.polyline(
                [[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]],
                { color: '#3B82F6', weight: 4, opacity: 0.85, dashArray: '6, 8' }
            ).addTo(map);
            polylineRef.current = line;

            // Map Click sets destination or moves points
            map.on('click', (e) => {
                const newDest = { lat: e.latlng.lat, lng: e.latlng.lng };
                setDestCoords(newDest);
                if (destMarkerRef.current) {
                    destMarkerRef.current.setLatLng(e.latlng);
                }
            });

            // Invalidate size once rendered
            setTimeout(() => {
                map?.invalidateSize();
            }, 250);
        }, 150);

        return () => {
            clearTimeout(timer);
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [isOpen]);

    // Update polyline on coordinates change
    useEffect(() => {
        if (!polylineRef.current) return;
        polylineRef.current.setLatLngs([
            [originCoords.lat, originCoords.lng],
            [destCoords.lat, destCoords.lng]
        ]);
    }, [originCoords, destCoords]);

    // Calculate Fares and Commissions based on active settings
    const calculation = useMemo(() => {
        const isNight = shift === 'night';
        const isComfortActive = useComfort && isComfortEligible;

        // Base Fare, Base Distance, Extra Km Price according to shift & comfort
        let baseFare: number;
        let baseDistance: number;
        let extraKmPrice: number;

        if (isComfortActive) {
            if (isNight) {
                baseFare = Number(driverFares.comfort_base_fare_night ?? driverFares.comfort_base_fare ?? 3.0);
                baseDistance = Number(driverFares.comfort_base_distance_night ?? driverFares.base_distance_night ?? driverFares.base_km ?? 2.0);
                extraKmPrice = Number(driverFares.comfort_extra_km_price_night ?? driverFares.comfort_extra_km_price_day ?? 1.2);
            } else {
                baseFare = Number(driverFares.comfort_base_fare_day ?? driverFares.comfort_base_fare ?? 2.5);
                baseDistance = Number(driverFares.comfort_base_distance_day ?? driverFares.base_distance_day ?? driverFares.base_km ?? 2.0);
                extraKmPrice = Number(driverFares.comfort_extra_km_price_day ?? 1.0);
            }
        } else {
            if (isNight) {
                baseFare = Number(driverFares.base_fare_night ?? driverFares.base_fare ?? 1.8);
                baseDistance = Number(driverFares.base_distance_night ?? driverFares.base_km ?? 2.0);
                extraKmPrice = Number(driverFares.extra_km_price_night ?? driverFares.per_km_fare ?? 0.30);
            } else {
                baseFare = Number(driverFares.base_fare_day ?? driverFares.base_fare ?? 1.5);
                baseDistance = Number(driverFares.base_distance_day ?? driverFares.base_km ?? 2.0);
                extraKmPrice = Number(driverFares.extra_km_price_day ?? driverFares.per_km_fare ?? 0.20);
            }
        }

        // Clamp base distance strictly to 1 - 6 km
        baseDistance = Math.min(6, Math.max(1, baseDistance));

        // Excess Distance calculation
        const totalDistance = Math.max(0.5, simulatedKm);
        const extraKm = Math.max(0, parseFloat((totalDistance - baseDistance).toFixed(2)));
        const extraKmAmount = parseFloat((extraKm * extraKmPrice).toFixed(2));
        const clientPrice = parseFloat((baseFare + extraKmAmount).toFixed(2));

        // Platform Commission Calculation
        const comms = adminSettings?.commissions || {};
        let fixedBaseComm = 0.25;
        const vCat = (vehicleType || '').toLowerCase();
        if (isComfortActive || vCat.includes('confort') || vCat.includes('ejecutivo')) {
            fixedBaseComm = Number(comms.confort ?? 1.00);
        } else if (vCat.includes('moto')) {
            fixedBaseComm = Number(comms.mototaxi ?? 0.25);
        } else {
            fixedBaseComm = Number(comms.taxi ?? 0.80);
        }

        const extraKmPct = Number(adminSettings?.extra_km_commission_pct ?? 30);
        const extraKmCommission = parseFloat((extraKmAmount * (extraKmPct / 100)).toFixed(2));
        const totalCommission = parseFloat((fixedBaseComm + extraKmCommission).toFixed(2));
        const driverNet = Math.max(0, parseFloat((clientPrice - totalCommission).toFixed(2)));

        const driverPct = clientPrice > 0 ? Math.round((driverNet / clientPrice) * 100) : 100;
        const platformPct = 100 - driverPct;

        return {
            baseFare,
            baseDistance,
            extraKmPrice,
            totalDistance,
            extraKm,
            extraKmAmount,
            clientPrice,
            fixedBaseComm,
            extraKmPct,
            extraKmCommission,
            totalCommission,
            driverNet,
            driverPct,
            platformPct
        };
    }, [shift, useComfort, simulatedKm, driverFares, vehicleType, isComfortEligible, adminSettings]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-100">
                {/* Modal Header */}
                <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
                            <Navigation className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                                Simulador de Ganancias y Rutas
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    Mapa Gratuito
                                </span>
                            </h3>
                            <p className="text-[11px] text-slate-400 font-medium">
                                Prueba tu tarifa y visualiza exactamente lo que cobrará el cliente y lo que te queda en el bolsillo
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-300 flex items-center justify-center transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Controls Bar: Shift Selector & Comfort */}
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    {/* Shift Selector */}
                    <div className="flex items-center gap-1.5 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setShift('day')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                shift === 'day'
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Sun className="w-3.5 h-3.5" />
                            <span>☀️ Diurno</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setShift('night')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                shift === 'night'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Moon className="w-3.5 h-3.5" />
                            <span>🌙 Nocturno</span>
                        </button>
                    </div>

                    {/* Comfort Switch if Eligible */}
                    {isComfortEligible && (
                        <button
                            type="button"
                            onClick={() => setUseComfort(!useComfort)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-black border transition-all ${
                                useComfort
                                    ? 'bg-amber-50 border-amber-400 text-amber-900'
                                    : 'bg-white border-slate-200 text-slate-600'
                            }`}
                        >
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            <span>{useComfort ? 'Taxi Confort Activo' : 'Probar Modo Confort'}</span>
                        </button>
                    )}

                    {/* Quick Distance Input */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">Distancia:</span>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                step="0.5"
                                min="0.5"
                                max="50"
                                value={simulatedKm}
                                onChange={(e) => setSimulatedKm(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                                className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900 text-center outline-none focus:ring-2 focus:ring-amber-500"
                            />
                            <span className="text-xs font-bold text-slate-600">km</span>
                        </div>
                    </div>
                </div>

                {/* Modal Body: Map + Preset distances + Calculation Result */}
                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                    {/* Interactive Leaflet Map */}
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-inner h-52 sm:h-60 bg-slate-100">
                        <div ref={mapContainerRef} className="w-full h-full" />
                        
                        {/* Map hint badge */}
                        <div className="absolute top-2.5 left-2.5 z-[1000] bg-slate-900/85 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shadow flex items-center gap-1.5 pointer-events-none">
                            <MapPin className="w-3 h-3 text-amber-400" />
                            <span>Arrastra los puntos <strong>A</strong> y <strong>B</strong> o haz clic en el mapa</span>
                        </div>

                        {/* Reset button */}
                        <button
                            type="button"
                            onClick={() => {
                                setOriginCoords({ lat: 10.4900, lng: -66.8850 });
                                setDestCoords({ lat: 10.4850, lng: -66.8350 });
                                if (mapRef.current) {
                                    mapRef.current.setView([10.4875, -66.8600], 13);
                                }
                            }}
                            className="absolute bottom-2.5 right-2.5 z-[1000] bg-white/90 hover:bg-white text-slate-700 text-[10px] font-black px-2.5 py-1.5 rounded-xl shadow border border-slate-200 flex items-center gap-1 transition-all"
                        >
                            <RotateCcw className="w-3 h-3" />
                            <span>Centrar</span>
                        </button>
                    </div>

                    {/* Quick Distance Presets Pills */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        <span className="text-[11px] font-black uppercase text-slate-400 shrink-0">Pruebas rápidas:</span>
                        {[2, 3, 5, 8, 12, 18, 25].map((km) => (
                            <button
                                key={km}
                                type="button"
                                onClick={() => setSimulatedKm(km)}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                    Math.round(simulatedKm) === km
                                        ? 'bg-slate-900 text-white font-black shadow-sm'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                            >
                                {km} km
                            </button>
                        ))}
                    </div>

                    {/* Live Calculation Hero Result */}
                    <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-green-600 text-white p-5 rounded-3xl shadow-xl shadow-emerald-600/25 relative overflow-hidden space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-emerald-100 flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4 text-emerald-200" />
                                Tu Ganancia Neta Limpia (En tu Bolsillo)
                            </span>
                            <span className="text-[10px] font-black bg-white/20 text-white px-2.5 py-0.5 rounded-full backdrop-blur-md">
                                {calculation.driverPct}% del viaje
                            </span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                            <div className="text-3xl sm:text-4xl font-black tracking-tight text-white font-mono">
                                ${calculation.driverNet.toFixed(2)} USD
                            </div>
                            {bcvRate > 0 && (
                                <div className="text-base sm:text-lg font-black text-emerald-100 font-mono">
                                    ≈ {(calculation.driverNet * bcvRate).toFixed(2)} Bs
                                </div>
                            )}
                        </div>

                        {/* Visual distribution bar */}
                        <div className="space-y-1 pt-1">
                            <div className="w-full h-2.5 bg-black/20 rounded-full overflow-hidden flex">
                                <div
                                    style={{ width: `${calculation.driverPct}%` }}
                                    className="bg-white rounded-full transition-all duration-300"
                                    title={`Chofer: ${calculation.driverPct}%`}
                                />
                                <div
                                    style={{ width: `${calculation.platformPct}%` }}
                                    className="bg-amber-300 transition-all duration-300"
                                    title={`Plataforma: ${calculation.platformPct}%`}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-emerald-100 font-bold">
                                <span>Tú recibes el {calculation.driverPct}%</span>
                                <span>Retención Un 2x3: {calculation.platformPct}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Breakdown Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {/* Tarifa al Cliente */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-black text-slate-800 uppercase tracking-wider text-[11px]">
                                    Tarifa Cobrada al Cliente
                                </span>
                                <span className="text-sm font-black text-slate-900 font-mono">
                                    ${calculation.clientPrice.toFixed(2)}
                                </span>
                            </div>
                            <div className="space-y-1 text-slate-600 text-[11px] pt-1 border-t border-slate-200/60">
                                <div className="flex justify-between">
                                    <span>Tarifa Base (primeros {calculation.baseDistance} km):</span>
                                    <span className="font-bold text-slate-800">${calculation.baseFare.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Km Excedentes ({calculation.extraKm} km a ${calculation.extraKmPrice}/km):</span>
                                    <span className="font-bold text-slate-800">+${calculation.extraKmAmount.toFixed(2)}</span>
                                </div>
                                {bcvRate > 0 && (
                                    <div className="flex justify-between text-[10px] text-slate-400 font-medium pt-0.5">
                                        <span>Total en Bolívares (BCV):</span>
                                        <span className="font-bold font-mono">{(calculation.clientPrice * bcvRate).toFixed(2)} Bs</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Comisión Un 2x3 */}
                        <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-black text-amber-900 uppercase tracking-wider text-[11px]">
                                    Comisión Plataforma Un 2x3
                                </span>
                                <span className="text-sm font-black text-amber-900 font-mono">
                                    -${calculation.totalCommission.toFixed(2)}
                                </span>
                            </div>
                            <div className="space-y-1 text-amber-900/80 text-[11px] pt-1 border-t border-amber-200/60">
                                <div className="flex justify-between">
                                    <span>Comisión Base Fija:</span>
                                    <span className="font-bold">${calculation.fixedBaseComm.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Comisión Excedente ({calculation.extraKmPct}% de ${calculation.extraKmAmount.toFixed(2)}):</span>
                                    <span className="font-bold">+${calculation.extraKmCommission.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-amber-800/70 font-medium pt-0.5">
                                    <span>Se debita de tu saldo al completar viaje</span>
                                    <span className="font-bold font-mono">{bcvRate > 0 ? `≈ ${(calculation.totalCommission * bcvRate).toFixed(2)} Bs` : ''}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Explanatory Info Card */}
                    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-2.5 text-xs text-blue-900">
                        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed">
                            <strong>Transparencia total:</strong> El cliente siempre paga exactamente la tarifa base si el recorrido no supera tus <strong>{calculation.baseDistance} km</strong> incluidos. Si supera esa distancia, solo se cobra por los kilómetros adicionales.
                        </p>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200/80 flex justify-end shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md"
                    >
                        Entendido, Cerrar Simulador
                    </button>
                </div>
            </div>
        </div>
    );
}
