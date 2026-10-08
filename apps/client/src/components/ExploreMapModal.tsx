import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { 
  X, Navigation, Store, Star, Clock, ChevronRight, MapPin, 
  Search, ShoppingBag, Plus, Minus, Compass, CheckCircle2,
  RefreshCw, AlertCircle
} from 'lucide-react';
import { Restaurant } from '../lib/seed';
import { calculateDistance, formatDistance } from '../lib/geo';
import { getCityCoordinates } from '../lib/venezuelaData';
import { useNavigate } from 'react-router-dom';
import { useJsApiLoader } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, useGoogleMapsResilience } from '../lib/mapsConfig';
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

// Clean map styling that dims generic POIs so custom business pins with logos stand out
const cleanGoogleMapStyles: google.maps.MapTypeStyle[] = [
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }]
  },
  {
    featureType: 'poi.attraction',
    stylers: [{ visibility: 'simplified' }]
  },
  {
    featureType: 'poi.medical',
    stylers: [{ visibility: 'simplified' }]
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }]
  },
  {
    featureType: 'road',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }]
  }
];

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
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  
  // Custom Overlays refs
  const storeOverlaysRef = useRef<Array<{ overlay: google.maps.OverlayView; restId: string; element: HTMLDivElement }>>([]);
  const userOverlayRef = useRef<google.maps.OverlayView | null>(null);

  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapReady, setMapReady] = useState(false);

  // Load Google Maps API script
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  const hasMapError = useGoogleMapsResilience(mapContainerRef, loadError);

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

  // Initialize Google Map
  useEffect(() => {
    if (!isOpen || !isLoaded || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      google.maps.event.trigger(mapInstanceRef.current, 'resize');
      return;
    }

    try {
      const map = new google.maps.Map(mapContainerRef.current, {
        center: initialCenter,
        zoom: userLocation ? 14 : 13,
        disableDefaultUI: true,
        zoomControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy',
        clickableIcons: false,
        styles: cleanGoogleMapStyles,
      });

      map.addListener('click', () => {
        setSelectedRestaurant(null);
      });

      mapInstanceRef.current = map;
      setMapReady(true);
    } catch (err) {
      console.error('Error initializing Google Maps:', err);
    }

    return () => {
      // Cleanup overlays
      storeOverlaysRef.current.forEach(({ overlay }) => {
        overlay.setMap(null);
      });
      storeOverlaysRef.current = [];

      if (userOverlayRef.current) {
        userOverlayRef.current.setMap(null);
        userOverlayRef.current = null;
      }

      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, [isOpen, isLoaded, initialCenter, userLocation]);

  // Center / Bounds fitting on initial load
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // If there are stores in the local area, fit bounds gently
    if (filteredStores.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      if (userLocation) {
        bounds.extend(new google.maps.LatLng(userLocation.lat, userLocation.lng));
      }
      filteredStores.slice(0, 20).forEach(s => {
        bounds.extend(new google.maps.LatLng(s.coords.lat, s.coords.lng));
      });
      map.fitBounds(bounds, 60);
      // Avoid excessive initial zoom-in if points are very close
      const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
        const currentZoom = map.getZoom();
        if (currentZoom && currentZoom > 16) {
          map.setZoom(16);
        }
      });
      return () => {
        google.maps.event.removeListener(listener);
      };
    } else if (filteredStores.length === 1) {
      map.panTo(filteredStores[0].coords);
      map.setZoom(15);
    }
  }, [mapReady, filteredStores.length]);

  // Handle User Location Pin Overlay
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !userLocation) {
      if (userOverlayRef.current) {
        userOverlayRef.current.setMap(null);
        userOverlayRef.current = null;
      }
      return;
    }

    // Custom Overlay Class for User Location
    class UserLocationOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLngLiteral;
      private container: HTMLDivElement;

      constructor(pos: google.maps.LatLngLiteral) {
        super();
        this.position = pos;
        this.container = document.createElement('div');
        this.container.className = 'google-user-location-marker';
        this.container.style.position = 'absolute';
        this.container.style.transform = 'translate(-50%, -50%)';
        this.container.style.pointerEvents = 'none';
        this.container.style.zIndex = '50';

        this.container.innerHTML = `
          <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; inset: -4px; border-radius: 50%; background: rgba(59, 130, 246, 0.35); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="width: 20px; height: 20px; border-radius: 50%; background: #2563eb; border: 3px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.35);"></div>
          </div>
        `;
      }

      onAdd(): void {
        const panes = this.getPanes();
        if (panes) {
          panes.overlayMouseTarget.appendChild(this.container);
        }
      }

      draw(): void {
        const projection = this.getProjection();
        if (!projection) return;
        const pt = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.position.lat, this.position.lng));
        if (pt) {
          this.container.style.left = `${pt.x}px`;
          this.container.style.top = `${pt.y}px`;
        }
      }

      onRemove(): void {
        if (this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
      }

      setPosition(newPos: google.maps.LatLngLiteral) {
        this.position = newPos;
        this.draw();
      }
    }

    if (userOverlayRef.current) {
      (userOverlayRef.current as any).setPosition(userLocation);
    } else {
      const overlay = new UserLocationOverlay(userLocation);
      overlay.setMap(map);
      userOverlayRef.current = overlay;
    }
  }, [mapReady, userLocation]);

  // Handle Store Logo Markers Overlay
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // Remove existing store overlays
    storeOverlaysRef.current.forEach(({ overlay }) => {
      overlay.setMap(null);
    });
    storeOverlaysRef.current = [];

    // Custom Overlay Class for Store Pin with Logo and Address
    class StoreLogoOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLngLiteral;
      public container: HTMLDivElement;

      constructor(pos: google.maps.LatLngLiteral, element: HTMLDivElement) {
        super();
        this.position = pos;
        this.container = element;
        this.container.style.position = 'absolute';
        this.container.style.transform = 'translate(-50%, -100%)';
        this.container.style.pointerEvents = 'auto';
      }

      onAdd(): void {
        const panes = this.getPanes();
        if (panes) {
          panes.overlayMouseTarget.appendChild(this.container);
        }
      }

      draw(): void {
        const projection = this.getProjection();
        if (!projection) return;
        const pt = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.position.lat, this.position.lng));
        if (pt) {
          this.container.style.left = `${pt.x}px`;
          this.container.style.top = `${pt.y}px`;
        }
      }

      onRemove(): void {
        if (this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
      }
    }

    // Create markers for each filtered store
    filteredStores.forEach(({ restaurant, coords }) => {
      const restId = restaurant.id || '';
      const isSelected = selectedRestaurant?.id === restId;

      const container = document.createElement('div');
      container.className = `store-google-pin ${isSelected ? 'is-active' : ''}`;
      container.style.cursor = 'pointer';
      container.style.userSelect = 'none';
      container.style.zIndex = isSelected ? '9999' : '100';

      const logo = restaurant.logoUrl || (restaurant as any).logo_url || (restaurant as any).logo || restaurant.image || '';
      const name = restaurant.name || 'Comercio';
      const address = restaurant.location?.address || (restaurant as any).address || (restaurant.location?.city ? `${restaurant.location.city}` : '');
      const isVerified = restaurant.isVerified || (restaurant as any).is_verified;

      container.innerHTML = `
        <div class="pin-inner" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
          transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
          filter: drop-shadow(0 8px 16px rgba(0,0,0,0.28));
        ">
          <!-- Logo Circle Pin Head -->
          <div class="pin-avatar-head" style="
            position: relative;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: #ffffff;
            border: 3px solid ${isSelected ? '#facc15' : '#ffffff'};
            box-shadow: 0 4px 14px rgba(0,0,0,0.22);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
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

          <!-- Pointer Tip pointing to the exact address -->
          <div class="pin-pointer-tip" style="
            width: 0;
            height: 0;
            border-left: 7px solid transparent;
            border-right: 7px solid transparent;
            border-top: 9px solid ${isSelected ? '#facc15' : '#ffffff'};
            margin-top: -1px;
            transition: border-top-color 0.2s ease;
          "></div>

          <!-- Store Name & Address label badge directly underneath -->
          <div class="pin-label-pill" style="
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
            max-width: 135px;
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
              max-width: 120px;
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
                    max-width: 120px;
                    line-height: 1;
                    margin-top: 1px;
                  ">${address}</span>`
                : ''
            }
          </div>
        </div>
      `;

      // Hover feedback
      const pinInner = container.querySelector('.pin-inner') as HTMLElement;
      container.addEventListener('mouseenter', () => {
        if (pinInner && selectedRestaurant?.id !== restId) {
          pinInner.style.transform = 'scale(1.12)';
        }
      });
      container.addEventListener('mouseleave', () => {
        if (pinInner && selectedRestaurant?.id !== restId) {
          pinInner.style.transform = 'scale(1)';
        }
      });

      // Tap / Click action
      container.addEventListener('click', (e) => {
        e.stopPropagation();
        vibrate(25);

        // If clicking the currently selected restaurant, navigate straight to profile to purchase!
        if (selectedRestaurant?.id === restId) {
          handleOpenStoreProfile(restaurant);
          return;
        }

        setSelectedRestaurant(restaurant);
        if (onSelectRestaurant) onSelectRestaurant(restaurant);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo(coords);
        }
      });

      const overlay = new StoreLogoOverlay(coords, container);
      overlay.setMap(map);

      storeOverlaysRef.current.push({
        overlay,
        restId,
        element: container
      });
    });
  }, [mapReady, filteredStores, selectedRestaurant]);

  // Update visual styles of existing overlays when selectedRestaurant changes
  useEffect(() => {
    storeOverlaysRef.current.forEach(({ restId, element }) => {
      const isSelected = selectedRestaurant?.id === restId;
      element.style.zIndex = isSelected ? '9999' : '100';

      const pinInner = element.querySelector('.pin-inner') as HTMLElement;
      const avatarHead = element.querySelector('.pin-avatar-head') as HTMLElement;
      const pointerTip = element.querySelector('.pin-pointer-tip') as HTMLElement;

      if (pinInner) {
        pinInner.style.transform = isSelected ? 'scale(1.15)' : 'scale(1)';
      }
      if (avatarHead) {
        avatarHead.style.borderColor = isSelected ? '#facc15' : '#ffffff';
        avatarHead.style.boxShadow = isSelected ? '0 0 0 4px rgba(250, 204, 21, 0.4), 0 8px 20px rgba(0,0,0,0.3)' : '0 4px 14px rgba(0,0,0,0.22)';
      }
      if (pointerTip) {
        pointerTip.style.borderTopColor = isSelected ? '#facc15' : '#ffffff';
      }
    });
  }, [selectedRestaurant]);

  // Open store profile and start purchase flow
  const handleOpenStoreProfile = useCallback((rest: Restaurant) => {
    if (!rest.id) return;
    vibrate(35);
    onClose();
    navigate(`/restaurant/${rest.id}`);
  }, [navigate, onClose]);

  // Center user GPS
  const handleCenterUser = () => {
    vibrate(20);
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.panTo(userLocation);
      mapInstanceRef.current.setZoom(15);
    }
  };

  // Fit all visible businesses
  const handleFitAllStores = () => {
    vibrate(20);
    const map = mapInstanceRef.current;
    if (!map || filteredStores.length === 0) return;

    if (filteredStores.length === 1) {
      map.panTo(filteredStores[0].coords);
      map.setZoom(15);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    filteredStores.forEach(s => {
      bounds.extend(new google.maps.LatLng(s.coords.lat, s.coords.lng));
    });
    map.fitBounds(bounds, 50);
  };

  const handleZoom = (delta: number) => {
    vibrate(15);
    const map = mapInstanceRef.current;
    if (!map) return;
    const current = map.getZoom() || 14;
    map.setZoom(current + delta);
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
                  {cityName ? `Comercios en ${cityName}` : 'Explorar en Google Maps'}
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
        {/* Fallback Loading State */}
        {!isLoaded && !hasMapError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-100 gap-3">
            <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-black text-slate-700">Cargando Google Maps...</p>
          </div>
        )}

        {/* Error Fallback */}
        {hasMapError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-50 p-6 text-center gap-3">
            <AlertCircle className="w-12 h-12 text-amber-500" />
            <h3 className="text-base font-black text-slate-900">No se pudo cargar Google Maps</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              Verifica tu conexión a Internet o intenta nuevamente.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary hover:bg-primary-hover text-slate-900 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reintentar</span>
            </button>
          </div>
        )}

        <div ref={mapContainerRef} className="w-full h-full absolute inset-0" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
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
