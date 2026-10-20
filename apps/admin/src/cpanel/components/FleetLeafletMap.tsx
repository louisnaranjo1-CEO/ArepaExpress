import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DeliveryDriver } from '../../lib/delivery-service';
import { getMapboxToken } from '@shared/lib/mapboxConfig';

interface Props {
    drivers: DeliveryDriver[];
    center?: { lat: number; lng: number };
}

export default function FleetLeafletMap({ drivers, center = { lat: 10.18, lng: -67.98 } }: Props) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const markersLayerRef = useRef<L.LayerGroup | null>(null);

    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Initialize Map
        const map = L.map(mapContainerRef.current, {
            center: [center.lat, center.lng],
            zoom: 13,
            zoomControl: true
        });
        mapInstanceRef.current = map;

        // Mapbox Streets Tile Layer (Estándar Oficial) con fallback OpenStreetMap
        const mapboxToken = getMapboxToken();
        const tileUrl = mapboxToken
            ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

        L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://www.mapbox.com/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            tileSize: mapboxToken ? 512 : 256,
            zoomOffset: mapboxToken ? -1 : 0,
            maxZoom: 19
        }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        markersLayerRef.current = markersLayer;

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, []);

    // Update center if center prop changes
    useEffect(() => {
        if (mapInstanceRef.current && center) {
            mapInstanceRef.current.setView([center.lat, center.lng]);
        }
    }, [center.lat, center.lng]);

    // Update Markers
    useEffect(() => {
        const map = mapInstanceRef.current;
        const markersLayer = markersLayerRef.current;
        if (!map || !markersLayer) return;

        markersLayer.clearLayers();

        const latLngs: L.LatLngExpression[] = [];

        drivers.forEach(driver => {
            const coords = (driver as any).currentLocation?.coords || (driver as any).current_location || driver.homeLocation?.coords;
            if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;

            const isMoto = (driver.vehicleType || '').toLowerCase() === 'moto';
            const isOnline = Boolean(driver.isOnline);
            const statusColor = isOnline ? '#10b981' : '#94a3b8';
            const bgBadgeColor = isMoto ? '#2563eb' : '#dc2626';
            const iconEmoji = isMoto ? '🛵' : '🚗';

            // HTML Marker icon
            const customIcon = L.divIcon({
                className: 'fleet-custom-marker',
                html: `
                    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; cursor: pointer;">
                        <div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background: ${bgBadgeColor}; border: 3px solid white; box-shadow: 0 4px 14px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 18px;">
                            ${iconEmoji}
                        </div>
                        <div style="position: absolute; bottom: -2px; right: -2px; width: 14px; height: 14px; border-radius: 50%; background: ${statusColor}; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
                        ${isOnline ? `<div style="position: absolute; width: 48px; height: 48px; border-radius: 50%; border: 2px solid #10b981; opacity: 0.6; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
                    </div>
                `,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
                popupAnchor: [0, -24]
            });

            const marker = L.marker([coords.lat, coords.lng], { icon: customIcon });

            // Popup content
            const selfieUrl = driver.documents?.selfieUrl || (driver as any).photo_url || '';
            const popupHtml = `
                <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 220px; padding: 4px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        ${selfieUrl ? `<img src="${selfieUrl}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;" />` : `<div style="width: 44px; height: 44px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 20px;">${iconEmoji}</div>`}
                        <div>
                            <div style="font-weight: 900; font-size: 14px; color: #0f172a; line-height: 1.2;">${driver.fullName || 'Piloto'}</div>
                            <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 2px;">
                                ${driver.vehicleType || 'Vehículo'} • ${driver.vehiclePlate || 'S/P'}
                            </div>
                        </div>
                    </div>
                    <div style="border-top: 1px solid #f1f5f9; padding-top: 6px; font-size: 11px; color: #334155; line-height: 1.6;">
                        <div><strong>Estado:</strong> <span style="color: ${isOnline ? '#059669' : '#64748b'}; font-weight: 800;">${isOnline ? '🟢 En Línea' : '⚪ Desconectado'}</span></div>
                        ${driver.homeLocation?.city ? `<div><strong>Ciudad:</strong> ${driver.homeLocation.city}, ${driver.homeLocation.state || ''}</div>` : ''}
                        ${driver.phone ? `<div><strong>Teléfono:</strong> ${driver.phone}</div>` : ''}
                    </div>
                    <div style="margin-top: 10px;">
                        <a href="https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}" target="_blank" rel="noreferrer" style="display: block; text-align: center; background: #0f172a; color: #ffffff; padding: 7px 10px; border-radius: 10px; font-size: 11px; font-weight: 800; text-decoration: none; text-transform: uppercase;">
                            📍 Cómo llegar (GPS)
                        </a>
                    </div>
                </div>
            `;

            marker.bindPopup(popupHtml);
            markersLayer.addLayer(marker);
            latLngs.push([coords.lat, coords.lng]);
        });

        // Auto-fit bounds if there are markers
        if (latLngs.length > 0) {
            try {
                const bounds = L.latLngBounds(latLngs);
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            } catch (e) {
                // Ignore bounds error
            }
        }
    }, [drivers]);

    return (
        <div className="w-full h-full relative">
            <div ref={mapContainerRef} className="w-full h-full z-0 rounded-b-[40px]" />
            <style>{`
                @keyframes ping {
                    75%, 100% {
                        transform: scale(1.6);
                        opacity: 0;
                    }
                }
                .fleet-custom-marker {
                    background: transparent;
                    border: none;
                }
                .leaflet-popup-content-wrapper {
                    border-radius: 20px;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
                    padding: 8px;
                }
                .leaflet-popup-tip {
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
                }
            `}</style>
        </div>
    );
}
