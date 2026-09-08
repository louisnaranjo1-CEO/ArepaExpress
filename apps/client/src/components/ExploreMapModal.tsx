import React, { useEffect, useRef, useState } from 'react';
import { X, Navigation, Store, Star, Clock, Truck, ChevronRight, MapPin } from 'lucide-react';
import { Restaurant } from '../lib/seed';
import { calculateDistance, formatDistance } from '../lib/geo';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface ExploreMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurants: Restaurant[];
  userLocation: { lat: number; lng: number } | null;
  onSelectRestaurant?: (restaurant: Restaurant) => void;
}

export const ExploreMapModal: React.FC<ExploreMapModalProps> = ({
  isOpen,
  onClose,
  restaurants,
  userLocation,
}) => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  const defaultCenter = userLocation || {
    lat: 10.4806, // Caracas default
    lng: -66.9036
  };

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Clean existing map instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [defaultCenter.lat, defaultCenter.lng],
      zoom: userLocation ? 14 : 12,
      zoomControl: false,
    });

    // 100% Free OpenStreetMap tile layer (no API key, completely free)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    mapInstanceRef.current = map;

    // Add User Marker if available
    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: `
          <div style="position: relative; width: 24px; height: 24px;">
            <div style="position: absolute; inset: -8px; background: rgba(59, 130, 246, 0.3); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="width: 24px; height: 24px; background: #2563eb; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 12px rgba(0,0,0,0.3);"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('<b>Tu ubicación</b>');
    }

    // Add Markers for all stores with coordinates
    markersRef.current = [];
    const validRestaurants = restaurants.filter(
      r => r.location?.coords?.lat && r.location?.coords?.lng
    );

    validRestaurants.forEach((rest) => {
      const lat = rest.location!.coords!.lat;
      const lng = rest.location!.coords!.lng;
      const logo = rest.logoUrl || (rest as any).logo_url || rest.image;

      const storeIcon = L.divIcon({
        className: 'custom-store-pin',
        html: `
          <div style="position: relative; transform: translate(-50%, -100%); cursor: pointer;">
            <div style="background: #ffffff; width: 44px; height: 44px; border-radius: 22px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(0,0,0,0.25); border: 2.5px solid #f48c25; overflow: hidden;">
              ${logo ? `<img src="${logo}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<span style="font-size: 18px; font-weight: 900; color: #f48c25;">🏪</span>`}
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #f48c25; margin: -1px auto 0 auto;"></div>
          </div>
        `,
        iconSize: [44, 52],
        iconAnchor: [22, 52]
      });

      const marker = L.marker([lat, lng], { icon: storeIcon }).addTo(map);
      marker.on('click', () => {
        setSelectedRestaurant(rest);
        map.panTo([lat, lng]);
      });
      markersRef.current.push(marker);
    });

    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timeout);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, restaurants, userLocation]);

  if (!isOpen) return null;

  const handleCenterUser = () => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([userLocation.lat, userLocation.lng], 15);
    }
  };

  const getDistanceText = (rest: Restaurant) => {
    if (userLocation && rest.location?.coords) {
      const d = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        rest.location.coords.lat,
        rest.location.coords.lng
      );
      return formatDistance(d);
    }
    return rest.distance || 'Cercano';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="absolute top-4 left-4 right-4 z-[500] flex items-center justify-between pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-xl border border-white/40 pointer-events-auto flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          <span className="font-black text-slate-900 text-sm">Explorar Comercios en Mapa</span>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
            {restaurants.filter(r => r.location?.coords).length} tiendas
          </span>
        </div>

        <button
          onClick={onClose}
          className="w-11 h-11 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-slate-700 hover:text-slate-900 hover:scale-105 active:scale-95 transition-all pointer-events-auto border border-white/40"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Center on User Button */}
      {userLocation && (
        <button
          onClick={handleCenterUser}
          className="absolute bottom-32 right-4 z-[500] w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-primary hover:bg-slate-50 active:scale-95 transition-all border border-slate-100"
          title="Mi ubicación"
        >
          <Navigation className="w-6 h-6" />
        </button>
      )}

      {/* Selected Restaurant Bottom Card */}
      {selectedRestaurant && (
        <div className="absolute bottom-4 left-4 right-4 z-[500] bg-white rounded-3xl p-4 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom-6 duration-300">
          <button
            onClick={() => setSelectedRestaurant(null)}
            className="absolute top-3 right-3 p-1 rounded-full text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-100 shadow-sm">
              {(selectedRestaurant.logoUrl || (selectedRestaurant as any).logo_url || selectedRestaurant.image) ? (
                <img
                  src={selectedRestaurant.logoUrl || (selectedRestaurant as any).logo_url || selectedRestaurant.image}
                  alt={selectedRestaurant.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Store className="w-8 h-8 text-slate-300" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pr-6">
              <h4 className="text-base font-black text-slate-900 truncate leading-tight">
                {selectedRestaurant.name}
              </h4>
              <p className="text-xs text-slate-500 font-semibold truncate mt-0.5">
                {selectedRestaurant.category}
              </p>

              <div className="flex items-center gap-3 mt-1.5 text-xs font-bold text-slate-600">
                <span className="flex items-center gap-1 text-amber-500 font-black">
                  <Star className="w-3.5 h-3.5 fill-amber-500" />
                  {selectedRestaurant.rating || 5.0}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 text-primary font-black">
                  <MapPin className="w-3.5 h-3.5" />
                  {getDistanceText(selectedRestaurant)}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 text-slate-500 font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {selectedRestaurant.deliveryTime || '30 min'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 truncate">
              {selectedRestaurant.location?.address || 'Ubicación céntrica'}
            </div>
            <button
              onClick={() => {
                onClose();
                navigate(`/restaurant/${selectedRestaurant.id}`);
              }}
              className="bg-primary hover:bg-primary-hover text-slate-900 font-black px-5 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 shadow-md shadow-primary/20 shrink-0 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Ver Menú</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExploreMapModal;
