import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  X, Navigation, Store, Star, Clock, ChevronRight, MapPin, 
  Search, ShoppingBag, Plus, Minus, Loader2
} from 'lucide-react';
import { 
  getMapboxToken, 
  MAPBOX_STYLE_DAY, 
  DEFAULT_MAP_CENTER, 
  createUserLocationPinElement 
} from '../lib/mapboxConfig';
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
  const cLat = Number(rest.location?.coords?.lat);
  const cLng = Number(rest.location?.coords?.lng);
  if (!isNaN(cLat) && !isNaN(cLng) && cLat !== 0 && cLng !== 0) {
    return { lat: cLat, lng: cLng };
  }

  const latProp = Number((rest as any).latitude ?? (rest as any).lat ?? (rest as any).coords?.lat);
  const lngProp = Number((rest as any).longitude ?? (rest as any).lng ?? (rest as any).coords?.lng);
  if (!isNaN(latProp) && !isNaN(lngProp) && latProp !== 0 && lngProp !== 0) {
    return { lat: latProp, lng: lngProp };
  }

  if (Array.isArray((rest as any).locations) && (rest as any).locations.length > 0) {
    const firstLoc = (rest as any).locations[0];
    const locLat = Number(firstLoc?.coords?.lat ?? firstLoc?.latitude ?? firstLoc?.lat);
    const locLng = Number(firstLoc?.coords?.lng ?? firstLoc?.longitude ?? firstLoc?.lng);
    if (!isNaN(locLat) && !isNaN(locLng) && locLat !== 0 && locLng !== 0) {
      return { lat: locLat, lng: locLng };
    }
  }

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
      const radiusKm = 0.15 + (Math.abs(hash % 9) * 0.05);
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

export const ExploreMapModal: React.FC<ExploreMapModalProps> = ({
  isOpen,
  onClose,
  restaurants,
  userLocation,
  cityName,
  onSelectRestaurant,
}) => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const storeMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

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
    if (userLocation) return userLocation;
    if (cityName) {
      const cityCoords = getCityCoordinates(cityName);
      if (cityCoords) return cityCoords;
    }
    if (validatedStores.length > 0) return validatedStores[0].coords;
    return DEFAULT_MAP_CENTER;
  }, [userLocation, cityName, validatedStores]);

  // Initialize Mapbox map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = getMapboxToken();

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAPBOX_STYLE_DAY,
      center: [initialCenter.lng, initialCenter.lat],
      zoom: 14.5,
      attributionControl: false
    });

    map.on('load', () => {
      setIsLoaded(true);
      map.resize();
    });

    map.on('click', () => {
      setSelectedRestaurant(null);
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
  }, [isOpen]);

  // Sync Markers on Mapbox
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    // Clean existing store markers
    storeMarkersRef.current.forEach(m => m.remove());
    storeMarkersRef.current = [];

    // User location marker
    if (userLocation) {
      if (!userMarkerRef.current) {
        const el = createUserLocationPinElement();
        userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    // Add Store markers
    filteredStores.forEach(store => {
      const isSelected = selectedRestaurant?.id === store.restaurant.id;
      const el = document.createElement('div');
      el.className = 'mapbox-store-pin';
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; transition: transform 0.2s ease;">
          <div style="width: ${isSelected ? '46px' : '38px'}; height: ${isSelected ? '46px' : '38px'}; border-radius: 50%; background: ${isSelected ? '#F59E0B' : '#E11D48'}; border: 3px solid #FFFFFF; box-shadow: 0 4px 14px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="${isSelected ? '22' : '18'}" height="${isSelected ? '22' : '18'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${isSelected ? '#F59E0B' : '#E11D48'}; margin-top: -1px;"></div>
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        vibrate(20);
        setSelectedRestaurant(store.restaurant);
        map.flyTo({
          center: [store.coords.lng, store.coords.lat],
          zoom: 16,
          duration: 700
        });
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([store.coords.lng, store.coords.lat])
        .addTo(map);

      storeMarkersRef.current.push(marker);
    });
  }, [isLoaded, filteredStores, selectedRestaurant, userLocation]);

  // Fit all stores bounds
  const handleFitAllStores = useCallback(() => {
    const map = mapRef.current;
    if (!map || filteredStores.length === 0) return;

    if (filteredStores.length === 1) {
      map.flyTo({
        center: [filteredStores[0].coords.lng, filteredStores[0].coords.lat],
        zoom: 16
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    filteredStores.forEach(s => bounds.extend([s.coords.lng, s.coords.lat]));
    if (userLocation) bounds.extend([userLocation.lng, userLocation.lat]);

    map.fitBounds(bounds, {
      padding: { top: 100, bottom: 220, left: 60, right: 60 },
      duration: 800
    });
  }, [filteredStores, userLocation]);

  const handleCenterUser = () => {
    const map = mapRef.current;
    if (map && userLocation) {
      vibrate(20);
      map.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 16.5,
        duration: 800
      });
    }
  };

  const handleZoom = (delta: number) => {
    const map = mapRef.current;
    if (map) {
      vibrate(10);
      if (delta > 0) map.zoomIn();
      else map.zoomOut();
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

      {/* Mapbox Canvas Container */}
      <div className="relative w-full h-full flex-1 bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full" />

        {!isLoaded && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm text-white gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            <p className="text-xs font-bold text-slate-300">Cargando mapa Mapbox...</p>
          </div>
        )}
      </div>

      {/* Floating Action Buttons (Right Side) */}
      <div className="absolute right-3 bottom-32 z-40 flex flex-col gap-2 pointer-events-auto">
        {userLocation && (
          <button
            onClick={handleCenterUser}
            className="w-11 h-11 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-blue-600 hover:bg-blue-50 active:scale-95 transition-all border border-slate-100"
            title="Mi ubicación GPS"
          >
            <Navigation className="w-5 h-5 fill-blue-600" />
          </button>
        )}

        {filteredStores.length > 0 && (
          <button
            onClick={handleFitAllStores}
            className="w-11 h-11 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all border border-slate-100"
            title="Ver todos los comercios"
          >
            <Store className="w-5 h-5" />
          </button>
        )}

        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100">
          <button
            onClick={() => handleZoom(1)}
            className="w-11 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-90 transition-all border-b border-slate-100"
            title="Acercar"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom(-1)}
            className="w-11 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-90 transition-all"
            title="Alejar"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Floating Card for Selected Store */}
      {selectedRestaurant && (
        <div className="absolute bottom-5 inset-x-3 z-40 pointer-events-auto animate-in slide-in-from-bottom duration-300">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-4 shadow-2xl border border-white/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={selectedRestaurant.image}
                alt={selectedRestaurant.name}
                className="w-14 h-14 rounded-2xl object-cover shadow-md shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-black text-sm text-slate-800 truncate">
                    {selectedRestaurant.name}
                  </h4>
                  <span className="flex items-center text-[10px] font-black text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
                    <Star className="w-3 h-3 fill-amber-400 stroke-none mr-0.5" />
                    {selectedRestaurant.rating}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-bold truncate">
                  {selectedRestaurant.category} • {selectedRestaurant.location?.address || 'Ubicación céntrica'}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] font-bold text-slate-400">
                  <span className="flex items-center">
                    <Clock className="w-3 h-3 mr-1 text-slate-400" />
                    {selectedRestaurant.deliveryTime}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleOpenStoreProfile(selectedRestaurant)}
              className="bg-primary hover:bg-yellow-400 text-slate-950 px-4 py-3 rounded-2xl font-black text-xs shadow-lg shadow-primary/20 flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
            >
              <span>Ver Menú</span>
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExploreMapModal;
