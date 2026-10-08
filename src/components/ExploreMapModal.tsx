import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { 
  X, Navigation, Store, Star, Clock, ChevronRight, MapPin, 
  Search, ShoppingBag, Plus, Minus, Compass
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

export const ExploreMapModal: React.FC<ExploreMapModalProps> = ({
  isOpen,
  onClose,
  restaurants,
  userLocation,
  cityName,
  onSelectRestaurant,
}) => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapReady, setMapReady] = useState(false);

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

  // Initialize Leaflet Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.invalidateSize();
      return;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: userLocation ? 15 : 14,
        zoomControl: false,
        attributionControl: false
      });

      // High-performance OpenStreetMap tiles (100% free, fast in Venezuela, no API key required)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Create Layer Group for Store Markers
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;

      map.on('click', () => {
        setSelectedRestaurant(null);
      });

      mapInstanceRef.current = map;
      setMapReady(true);

      // Invalidate size shortly after modal open animation completes
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 200);

      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 500);
    } catch (err) {
      console.error('Error initializing Leaflet map in ExploreMapModal:', err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersLayerRef.current = null;
      userMarkerRef.current = null;
      setMapReady(false);
    };
  }, [isOpen]);

  // Center / Bounds fitting on initial load or filtered change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    if (filteredStores.length > 1) {
      const bounds = L.latLngBounds(filteredStores.map(s => [s.coords.lat, s.coords.lng]));
      if (userLocation) {
        bounds.extend([userLocation.lat, userLocation.lng]);
      }
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else if (filteredStores.length === 1) {
      map.panTo([filteredStores[0].coords.lat, filteredStores[0].coords.lng]);
      map.setZoom(15);
    }
  }, [mapReady, filteredStores.length]);

  // User GPS Location Pin Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    const userIcon = L.divIcon({
      className: 'user-gps-pin',
      html: `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -50%); pointer-events: none;">
          <div style="position: absolute; inset: -4px; border-radius: 50%; background: rgba(59, 130, 246, 0.35); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 22px; height: 22px; border-radius: 50%; background: #2563eb; border: 3.5px solid #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.35);"></div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: userIcon,
        zIndexOffset: 50
      }).addTo(map);
    }
  }, [mapReady, userLocation]);

  // Open store profile and start purchase flow
  const handleOpenStoreProfile = useCallback((rest: Restaurant) => {
    if (!rest.id) return;
    vibrate(35);
    onClose();
    navigate(`/restaurant/${rest.id}`);
  }, [navigate, onClose]);

  // Render and update Store Logo Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer || !mapReady) return;

    markersLayer.clearLayers();

    filteredStores.forEach(({ restaurant, coords }) => {
      const restId = restaurant.id || '';
      const isSelected = selectedRestaurant?.id === restId;

      const logo = restaurant.logoUrl || (restaurant as any).logo_url || (restaurant as any).logo || restaurant.image || '';
      const name = restaurant.name || 'Comercio';
      const address = restaurant.location?.address || (restaurant as any).address || (restaurant.location?.city ? `${restaurant.location.city}` : '');
      const isVerified = restaurant.isVerified || (restaurant as any).is_verified;

      const storeIcon = L.divIcon({
        className: 'custom-store-pin-wrapper',
        html: `
          <div style="
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            transform: translate(-50%, -100%);
            cursor: pointer;
            user-select: none;
            transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
            filter: drop-shadow(0 8px 16px rgba(0,0,0,0.28));
          ">
            <!-- Logo Circle Pin Head -->
            <div style="
              position: relative;
              width: 48px;
              height: 48px;
              border-radius: 50%;
              background: #ffffff;
              border: 3.5px solid ${isSelected ? '#facc15' : '#ffffff'};
              box-shadow: ${isSelected ? '0 0 0 4px rgba(250, 204, 21, 0.4), 0 8px 20px rgba(0,0,0,0.3)' : '0 4px 14px rgba(0,0,0,0.22)'};
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
              transition: all 0.2s ease;
            ">
              ${
                logo
                  ? `<img src="${logo}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" onerror="this.onerror=null; this.style.display='none'; this.parentNode.innerHTML='<span style=\\'font-size:20px\\'>🏪</span>';" />`
                  : `<span style="font-size: 20px;">🏪</span>`
              }
              ${
                isVerified
                  ? `<div style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; background: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: 900; border: 1.5px solid white;">✓</div>`
                  : ''
              }
            </div>

            <!-- Pointer Tip -->
            <div style="
              width: 0;
              height: 0;
              border-left: 7px solid transparent;
              border-right: 7px solid transparent;
              border-top: 9px solid ${isSelected ? '#facc15' : '#ffffff'};
              margin-top: -1px;
              transition: border-top-color 0.2s ease;
            "></div>

            <!-- Store Name & Address label badge directly underneath -->
            <div style="
              margin-top: 3px;
              background: rgba(255, 255, 255, 0.96);
              backdrop-filter: blur(8px);
              -webkit-backdrop-filter: blur(8px);
              padding: 3px 8px;
              border-radius: 9999px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.16);
              border: 1px solid rgba(0,0,0,0.06);
              display: flex;
              flex-direction: column;
              align-items: center;
              max-width: 140px;
              text-align: center;
              pointer-events: auto;
            ">
              <span style="
                font-weight: 900;
                font-size: 11px;
                color: #0f172a;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 125px;
                line-height: 1.2;
              ">${name}</span>
              ${
                address
                  ? `<span style="
                      font-size: 9px;
                      font-weight: 600;
                      color: #64748b;
                      white-space: nowrap;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      max-width: 125px;
                      line-height: 1;
                      margin-top: 1px;
                    ">${address}</span>`
                  : ''
              }
            </div>
          </div>
        `,
        iconSize: [48, 60],
        iconAnchor: [24, 60]
      });

      const marker = L.marker([coords.lat, coords.lng], {
        icon: storeIcon,
        zIndexOffset: isSelected ? 9999 : 100
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        vibrate(25);

        if (selectedRestaurant?.id === restId) {
          handleOpenStoreProfile(restaurant);
          return;
        }

        setSelectedRestaurant(restaurant);
        if (onSelectRestaurant) onSelectRestaurant(restaurant);
        map.panTo([coords.lat, coords.lng]);
      });

      markersLayer.addLayer(marker);
    });
  }, [mapReady, filteredStores, selectedRestaurant, handleOpenStoreProfile, onSelectRestaurant]);

  // Center user GPS
  const handleCenterUser = () => {
    vibrate(20);
    const map = mapInstanceRef.current;
    if (userLocation && map) {
      map.flyTo([userLocation.lat, userLocation.lng], 16);
    }
  };

  // Fit all visible businesses
  const handleFitAllStores = () => {
    vibrate(20);
    const map = mapInstanceRef.current;
    if (!map || filteredStores.length === 0) return;

    if (filteredStores.length === 1) {
      map.panTo([filteredStores[0].coords.lat, filteredStores[0].coords.lng]);
      map.setZoom(16);
      return;
    }

    const bounds = L.latLngBounds(filteredStores.map(s => [s.coords.lat, s.coords.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  };

  const handleZoom = (delta: number) => {
    vibrate(15);
    const map = mapInstanceRef.current;
    if (!map) return;
    if (delta > 0) {
      map.zoomIn();
    } else {
      map.zoomOut();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 animate-in fade-in duration-200">
      {/* Top Floating Navigation Bar */}
      <div className="absolute top-3 left-3 right-3 z-40 flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center justify-between gap-2">
          {/* Brand & Stats Header */}
          <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl border border-white/50 pointer-events-auto flex items-center gap-2 max-w-[calc(100%-54px)]">
            <div className="w-7 h-7 rounded-xl bg-primary flex items-center justify-center text-slate-900 font-black shadow-sm shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-slate-900 text-xs truncate">
                  {cityName ? `Comercios en ${cityName}` : 'Explorar Comercios en Mapa'}
                </span>
                <span className="bg-primary/20 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                  {filteredStores.length} {filteredStores.length === 1 ? 'tienda' : 'tiendas'}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-semibold truncate">
                Toca cualquier logo para iniciar tu compra
              </span>
            </div>
          </div>

          {/* Close Modal Button */}
          <button
            onClick={() => {
              vibrate(20);
              onClose();
            }}
            className="w-11 h-11 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-slate-700 hover:text-slate-900 hover:scale-105 active:scale-95 transition-all pointer-events-auto border border-white/50 shrink-0"
            title="Cerrar mapa"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Search In Map */}
        <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-lg border border-white/50 pointer-events-auto flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={cityName ? `Buscar tienda en ${cityName}...` : 'Buscar tienda por nombre o categoría...'}
            className="w-full bg-transparent text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none"
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

      {/* Map Container */}
      <div className="relative w-full h-full flex-1">
        <div
          ref={mapContainerRef}
          className="w-full h-full absolute inset-0 z-0"
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
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
