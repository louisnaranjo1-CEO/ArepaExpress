import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { 
  X, Navigation, Store, Star, Clock, ChevronRight, MapPin, 
  Search, ShoppingBag, Plus, Minus, Compass, Loader2
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES } from '../lib/mapsConfig';
import { yangoDayMapStyles } from '../lib/weather';
import { Restaurant } from '../lib/seed';
import { calculateDistance, formatDistance } from '../lib/geo';
import { getCityCoordinates } from '../lib/venezuelaData';
import { useNavigate } from 'react-router-dom';
import { vibrate } from '../utils/haptics';

interface ExploreMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurants: Restaurant[];
  userLocation: { lat: number; lng: number } | null;
  cityName?: string;
  onSelectRestaurant?: (restaurant: Restaurant) => void;
}

interface ValidatedStore {
  restaurant: Restaurant;
  coords: { lat: number; lng: number };
  distanceText: string;
}

// Helper to reliably extract coordinates for a store
function extractStoreCoords(rest: Restaurant): { lat: number; lng: number } | null {
  // 1. Explicit coords inside location
  const cLat = Number(rest.location?.coords?.lat);
  const cLng = Number(rest.location?.coords?.lng);
  if (!isNaN(cLat) && !isNaN(cLng) && cLat !== 0 && cLng !== 0) {
    return { lat: cLat, lng: cLng };
  }

  // 2. Direct properties on root
  const latProp = Number((rest as any).latitude ?? (rest as any).lat ?? (rest as any).coords?.lat);
  const lngProp = Number((rest as any).longitude ?? (rest as any).lng ?? (rest as any).coords?.lng);
  if (!isNaN(latProp) && !isNaN(lngProp) && latProp !== 0 && lngProp !== 0) {
    return { lat: latProp, lng: lngProp };
  }

  // 3. Multi-location sucursales array
  if (Array.isArray((rest as any).locations) && (rest as any).locations.length > 0) {
    const firstLoc = (rest as any).locations[0];
    const locLat = Number(firstLoc?.coords?.lat ?? firstLoc?.latitude ?? firstLoc?.lat);
    const locLng = Number(firstLoc?.coords?.lng ?? firstLoc?.longitude ?? firstLoc?.lng);
    if (!isNaN(locLat) && !isNaN(locLng) && locLat !== 0 && locLng !== 0) {
      return { lat: locLat, lng: locLng };
    }
  }

  // 4. Fallback based on city & state with deterministic dispersion
  const city = rest.location?.city || (rest as any).city;
  const state = rest.location?.state || (rest as any).state;
  if (city || state) {
    const cityCoords = getCityCoordinates(city, state);
    if (cityCoords) {
      const str = String(rest.id || rest.name || 'store');
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
      }
      const angle = Math.abs(hash % 360) * (Math.PI / 180);
      const radiusKm = 0.15 + (Math.abs(hash % 9) * 0.05); // ~150m to 600m offset
      const dLat = (radiusKm / 111) * Math.sin(angle);
      const dLng = (radiusKm / (111 * Math.cos((cityCoords.lat * Math.PI) / 180))) * Math.cos(angle);
      return {
        lat: cityCoords.lat + dLat,
        lng: cityCoords.lng + dLng
      };
    }
  }

  return null;
}

// Generate store marker SVG Data URI
function getStorePinSvgUri(category: string = '', isSelected: boolean = false): string {
  const pinColor = isSelected ? '#F59E0B' : '#E11D48';
  const strokeColor = '#FFFFFF';
  const size = isSelected ? 48 : 40;

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 8}" viewBox="0 0 40 48">
    <ellipse cx="20" cy="45" rx="8" ry="3" fill="rgba(0,0,0,0.35)"/>
    <path d="M20 0 C9 0 0 9 0 20 C0 35 20 48 20 48 C20 48 40 35 40 20 C40 9 31 0 20 0 Z" fill="${pinColor}" stroke="${strokeColor}" stroke-width="2.5"/>
    <circle cx="20" cy="18" r="12" fill="#FFFFFF"/>
    <path d="M14 15 L26 15 L25 24 L15 24 Z" fill="${pinColor}"/>
    <circle cx="20" cy="14" r="3" fill="${pinColor}"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const ExploreMapModal: React.FC<ExploreMapModalProps> = ({
  isOpen,
  onClose,
  restaurants,
  userLocation,
  cityName,
  onSelectRestaurant,
}) => {
  const navigate = useNavigate();
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Format valid stores with coordinates
  const validatedStores = useMemo<ValidatedStore[]>(() => {
    return restaurants
      .map(r => {
        const coords = extractStoreCoords(r);
        if (!coords) return null;

        let distanceText = r.distance || '';
        if (userLocation) {
          const d = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            coords.lat,
            coords.lng
          );
          distanceText = formatDistance(d);
        }

        return {
          restaurant: r,
          coords,
          distanceText: distanceText || 'Cercano'
        };
      })
      .filter((item): item is ValidatedStore => item !== null);
  }, [restaurants, userLocation]);

  // Filtered stores based on search query
  const filteredStores = useMemo(() => {
    if (!searchQuery.trim()) return validatedStores;
    const q = searchQuery.toLowerCase().trim();
    return validatedStores.filter(item => {
      const name = (item.restaurant.name || '').toLowerCase();
      const cat = (item.restaurant.category || '').toLowerCase();
      const addr = (item.restaurant.location?.address || '').toLowerCase();
      return name.includes(q) || cat.includes(q) || addr.includes(q);
    });
  }, [validatedStores, searchQuery]);

  // Determine starting center
  const initialCenter = useMemo<{ lat: number; lng: number }>(() => {
    if (userLocation) {
      return userLocation;
    }
    if (cityName) {
      const cityCoords = getCityCoordinates(cityName);
      if (cityCoords) return cityCoords;
    }
    if (validatedStores.length > 0) {
      return validatedStores[0].coords;
    }
    return { lat: 8.9326, lng: -67.4264 }; // Calabozo default
  }, [userLocation, cityName, validatedStores]);

  // Fit bounds when map or filtered stores change
  const handleFitAllStores = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.google || filteredStores.length === 0) return;

    if (filteredStores.length === 1) {
      map.panTo(filteredStores[0].coords);
      map.setZoom(16);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    filteredStores.forEach(s => bounds.extend(s.coords));
    if (userLocation) bounds.extend(userLocation);
    map.fitBounds(bounds, {
      top: 100,
      bottom: 220,
      left: 60,
      right: 60
    });
  }, [filteredStores, userLocation]);

  const handleCenterUser = () => {
    const map = mapInstanceRef.current;
    if (map && userLocation) {
      vibrate(20);
      map.panTo(userLocation);
      map.setZoom(16);
    }
  };

  const handleZoom = (delta: number) => {
    const map = mapInstanceRef.current;
    if (map) {
      vibrate(10);
      const currentZoom = map.getZoom() || 15;
      map.setZoom(currentZoom + delta);
    }
  };

  const handleOpenStoreProfile = (restaurant: Restaurant) => {
    vibrate(30);
    if (onSelectRestaurant) {
      onSelectRestaurant(restaurant);
    } else {
      navigate(`/restaurant/${restaurant.id}`);
      onClose();
    }
  };

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapInstanceRef.current = map;
    // Fit bounds after slight delay
    setTimeout(() => {
      handleFitAllStores();
    }, 200);
  }, [handleFitAllStores]);

  const onMapUnmount = useCallback(() => {
    mapInstanceRef.current = null;
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden select-none animate-in fade-in duration-200">
      {/* Top Header Floating Overlay */}
      <div className="absolute top-0 inset-x-0 z-40 p-3 pt-safe flex items-center gap-2 bg-gradient-to-b from-slate-950/90 via-slate-950/70 to-transparent pointer-events-none">
        {/* Back / Close Button */}
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl flex items-center justify-center text-slate-800 hover:text-slate-950 active:scale-95 transition-all pointer-events-auto border border-white/20"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Search Bar Input */}
        <div className="flex-1 relative flex items-center bg-white/95 backdrop-blur-md rounded-2xl px-3 py-2 shadow-xl border border-white/20 pointer-events-auto">
          <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Buscar comercios, hamburguesas, farmacias..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-none outline-none font-bold text-xs text-slate-800 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 active:scale-90"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Map Container - Exclusive Official Google Maps Canvas */}
      <div className="relative w-full h-full flex-1">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={initialCenter}
            zoom={userLocation ? 15 : 14}
            onLoad={onMapLoad}
            onUnmount={onMapUnmount}
            onClick={() => setSelectedRestaurant(null)}
            options={{
              disableDefaultUI: true,
              zoomControl: false,
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: false,
              styles: yangoDayMapStyles
            }}
          >
            {/* User GPS Location Marker */}
            {userLocation && (
              <Marker
                position={userLocation}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor: '#3B82F6',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 3,
                  scale: 8
                }}
                zIndex={200}
                title="Tu ubicación"
              />
            )}

            {/* Validated Stores Markers */}
            {filteredStores.map(store => {
              const isSelected = selectedRestaurant?.id === store.restaurant.id;
              return (
                <Marker
                  key={store.restaurant.id}
                  position={store.coords}
                  icon={{
                    url: getStorePinSvgUri(store.restaurant.category, isSelected),
                    anchor: window.google ? new window.google.maps.Point(20, 48) : undefined,
                    scaledSize: window.google ? new window.google.maps.Size(isSelected ? 48 : 40, isSelected ? 56 : 48) : undefined
                  }}
                  zIndex={isSelected ? 150 : 50}
                  onClick={() => {
                    vibrate(20);
                    setSelectedRestaurant(store.restaurant);
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.panTo(store.coords);
                    }
                  }}
                />
              );
            })}
          </GoogleMap>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            <p className="text-xs font-bold text-slate-400">Iniciando Google Maps...</p>
          </div>
        )}
      </div>

      {/* Floating Action Buttons (Right Side) */}
      <div className="absolute right-3 bottom-32 z-40 flex flex-col gap-2 pointer-events-auto">
        {/* Center on User Location */}
        {userLocation && (
          <button
            onClick={handleCenterUser}
            className="w-11 h-11 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-blue-600 hover:bg-blue-50 active:scale-95 transition-all border border-slate-100"
            title="Mi ubicación GPS"
          >
            <Navigation className="w-5 h-5 fill-blue-600" />
          </button>
        )}

        {/* Fit all stores */}
        {filteredStores.length > 0 && (
          <button
            onClick={handleFitAllStores}
            className="w-11 h-11 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all border border-slate-100"
            title="Ver todos los comercios"
          >
            <Compass className="w-5 h-5" />
          </button>
        )}

        {/* Zoom In & Out */}
        <div className="flex flex-col bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          <button
            onClick={() => handleZoom(1)}
            className="w-11 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all border-b border-slate-100"
            title="Acercar mapa"
          >
            <Plus className="w-4 h-4 font-bold" />
          </button>
          <button
            onClick={() => handleZoom(-1)}
            className="w-11 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
            title="Alejar mapa"
          >
            <Minus className="w-4 h-4 font-bold" />
          </button>
        </div>
      </div>

      {/* Selected Restaurant Bottom Card for Direct Purchase Navigation */}
      {selectedRestaurant && (
        <div 
          onClick={() => handleOpenStoreProfile(selectedRestaurant)}
          className="absolute bottom-3 left-3 right-3 z-40 bg-white rounded-3xl p-4 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom-6 duration-200 cursor-pointer hover:shadow-primary/20 transition-all pointer-events-auto"
        >
          {/* Close Card Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              vibrate(15);
              setSelectedRestaurant(null);
            }}
            className="absolute top-3 right-3 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            title="Cerrar detalle"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Store Info Row */}
          <div className="flex items-center gap-3.5">
            {/* Store Logo Thumbnail */}
            <div className="relative w-16 h-16 rounded-2xl bg-slate-50 overflow-hidden shrink-0 border border-slate-200 shadow-sm flex items-center justify-center">
              {(selectedRestaurant.logoUrl || (selectedRestaurant as any).logo_url || (selectedRestaurant as any).logo || selectedRestaurant.image) ? (
                <img
                  src={selectedRestaurant.logoUrl || (selectedRestaurant as any).logo_url || (selectedRestaurant as any).logo || selectedRestaurant.image}
                  alt={selectedRestaurant.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store className="w-8 h-8 text-slate-300" />
              )}
              {(selectedRestaurant.isVerified || (selectedRestaurant as any).is_verified) && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-[9px] font-black border border-white">
                  ✓
                </div>
              )}
            </div>

            {/* Store Metadata */}
            <div className="flex-1 min-w-0 pr-5">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-black text-slate-900 truncate leading-tight">
                  {selectedRestaurant.name}
                </h4>
              </div>

              <p className="text-xs text-slate-500 font-bold truncate mt-0.5">
                {selectedRestaurant.category || 'Comercio Registrado'}
              </p>

              <div className="flex items-center gap-2 mt-1.5 text-xs font-bold text-slate-600 flex-wrap">
                <span className="flex items-center gap-1 text-amber-500 font-black">
                  <Star className="w-3.5 h-3.5 fill-amber-500" />
                  {selectedRestaurant.rating || 5.0}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 text-primary font-black">
                  <MapPin className="w-3.5 h-3.5" />
                  {(() => {
                    const found = validatedStores.find(s => s.restaurant.id === selectedRestaurant.id);
                    return found?.distanceText || selectedRestaurant.distance || 'Cercano';
                  })()}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 text-slate-500 font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {selectedRestaurant.deliveryTime || '20-35 min'}
                </span>
              </div>
            </div>
          </div>

          {/* Address & Direct CTA Action */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 truncate flex-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                {selectedRestaurant.location?.address || (selectedRestaurant as any).address || selectedRestaurant.location?.city || 'Ubicación céntrica'}
              </span>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenStoreProfile(selectedRestaurant);
              }}
              className="bg-primary hover:bg-primary-hover text-slate-900 font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 shadow-md shadow-primary/25 shrink-0 transition-all hover:scale-105 active:scale-95"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Ver Tienda y Comprar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExploreMapModal;
