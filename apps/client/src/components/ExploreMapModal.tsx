import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  X, Navigation, Store, Star, Clock, ChevronRight, MapPin, 
  Search, Plus, Minus, Loader2
} from 'lucide-react';
import { 
  getMapboxToken, 
  MAPBOX_STYLE_DAY, 
  DEFAULT_MAP_CENTER, 
  createUserLocationPinElement,
  searchMapboxPlaces,
  MapboxPlace
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
  
  // Search recommendations state
  const [placeSuggestions, setPlaceSuggestions] = useState<MapboxPlace[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  const storeMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const searchedPlaceMarkerRef = useRef<mapboxgl.Marker | null>(null);

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

  // Matching stores based on search query
  const matchingStores = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return validatedStores.filter(item => {
      const name = (item.restaurant.name || '').toLowerCase();
      const cat = (item.restaurant.category || '').toLowerCase();
      const addr = (item.restaurant.location?.address || '').toLowerCase();
      return name.includes(q) || cat.includes(q) || addr.includes(q);
    }).slice(0, 5);
  }, [validatedStores, searchQuery]);

  // Filtered stores on the map
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

  // Query Mapbox Geocoding for places recommendations in the city
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setPlaceSuggestions([]);
      setIsSearchingPlaces(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsSearchingPlaces(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const proximity = userLocation || initialCenter;
        const results = await searchMapboxPlaces(searchQuery, proximity, 've');
        setPlaceSuggestions(results.slice(0, 5));
      } catch (err) {
        console.error('Error fetching search places:', err);
        setPlaceSuggestions([]);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 280);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, userLocation, initialCenter]);

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
      setIsDropdownOpen(false);
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

    // Add Store markers with business logo / image
    filteredStores.forEach(store => {
      const isSelected = selectedRestaurant?.id === store.restaurant.id;
      const el = document.createElement('div');
      el.className = 'mapbox-store-pin';
      el.style.cursor = 'pointer';

      const logoSrc = store.restaurant.logoUrl || (store.restaurant as any).logo || store.restaurant.image || '';
      const storeName = store.restaurant.name || 'Comercio';
      const initial = storeName.charAt(0).toUpperCase();

      const size = isSelected ? 48 : 40;
      const borderColor = isSelected ? '#F59E0B' : '#FFFFFF';
      const pinColor = isSelected ? '#F59E0B' : '#E11D48';

      el.innerHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); transform: scale(${isSelected ? '1.18' : '1'}); z-index: ${isSelected ? 50 : 10};">
          <div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: #FFFFFF; border: 3px solid ${borderColor}; box-shadow: 0 4px 14px rgba(0,0,0,0.35); overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative;">
            ${logoSrc ? `
              <img 
                src="${logoSrc}" 
                alt="${storeName}" 
                style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" 
                onerror="this.onerror=null; this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"
              />
              <div style="display: none; width: 100%; height: 100%; background: ${pinColor}; color: white; font-weight: 800; font-size: 14px; align-items: center; justify-content: center;">
                ${initial}
              </div>
            ` : `
              <div style="width: 100%; height: 100%; background: ${pinColor}; color: white; font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center;">
                ${initial}
              </div>
            `}
          </div>
          <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 7px solid ${borderColor}; margin-top: -1px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.25));"></div>
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        vibrate(20);
        setSelectedRestaurant(store.restaurant);
        setIsDropdownOpen(false);
        map.flyTo({
          center: [store.coords.lng, store.coords.lat],
          zoom: 16.5,
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
      padding: { top: 100, bottom: 240, left: 60, right: 60 },
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

  // Select a store from recommendations dropdown
  const handleSelectStoreRecommendation = (store: ValidatedStore) => {
    vibrate(25);
    setIsDropdownOpen(false);
    setSelectedRestaurant(store.restaurant);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [store.coords.lng, store.coords.lat],
        zoom: 16.5,
        duration: 800
      });
    }
  };

  // Select a place from Mapbox recommendations
  const handleSelectPlaceRecommendation = (place: MapboxPlace) => {
    vibrate(25);
    setIsDropdownOpen(false);
    setSelectedRestaurant(null);

    const map = mapRef.current;
    if (map) {
      // Remove previous searched place marker
      if (searchedPlaceMarkerRef.current) {
        searchedPlaceMarkerRef.current.remove();
        searchedPlaceMarkerRef.current = null;
      }

      // Create search pin
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; animation: bounce 0.6s ease infinite alternate;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: #2563EB; border: 3px solid #FFFFFF; box-shadow: 0 4px 14px rgba(37,99,235,0.5); display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
          <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid #2563EB; margin-top: -1px;"></div>
        </div>
      `;

      searchedPlaceMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([place.lng, place.lat])
        .addTo(map);

      map.flyTo({
        center: [place.lng, place.lat],
        zoom: 16.5,
        duration: 800
      });
    }
  };

  if (!isOpen) return null;

  const hasSuggestions = matchingStores.length > 0 || placeSuggestions.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden select-none animate-in fade-in duration-200">
      {/* Top Header Floating Overlay */}
      <div className="absolute top-0 inset-x-0 z-40 p-3 pt-safe flex flex-col bg-gradient-to-b from-slate-950/90 via-slate-950/70 to-transparent pointer-events-none">
        <div className="flex items-center gap-2">
          {/* Back / Close Button */}
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl flex items-center justify-center text-slate-800 hover:text-slate-950 active:scale-95 transition-all pointer-events-auto border border-white/20 shrink-0"
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
              onFocus={() => setIsDropdownOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              className="w-full bg-transparent border-none outline-none font-bold text-xs text-slate-800 placeholder:text-slate-400"
            />
            {isSearchingPlaces && (
              <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin mr-1 shrink-0" />
            )}
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setPlaceSuggestions([]);
                  setIsDropdownOpen(false);
                }}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 active:scale-90"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Search Recommendations Dropdown */}
        {isDropdownOpen && searchQuery.trim().length > 0 && (
          <div className="mt-2 w-full max-h-72 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-100 overflow-y-auto pointer-events-auto divide-y divide-slate-100 animate-in fade-in duration-150">
            {/* Matching Stores Section */}
            {matchingStores.length > 0 && (
              <div className="p-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1 flex items-center gap-1">
                  <Store className="w-3 h-3 text-amber-500" />
                  Comercios en tu zona
                </p>
                {matchingStores.map((store) => {
                  const logo = store.restaurant.logoUrl || (store.restaurant as any).logo || store.restaurant.image;
                  return (
                    <button
                      key={store.restaurant.id}
                      onClick={() => handleSelectStoreRecommendation(store)}
                      className="w-full p-2 rounded-xl flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 text-left transition-colors"
                    >
                      <img
                        src={logo || '/placeholder-store.png'}
                        alt={store.restaurant.name}
                        className="w-9 h-9 rounded-xl object-cover border border-slate-100 shadow-sm shrink-0"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h5 className="text-xs font-black text-slate-800 truncate">
                            {store.restaurant.name}
                          </h5>
                          {store.restaurant.rating && (
                            <span className="text-[10px] font-black text-amber-500 bg-amber-50 px-1 py-0.2 rounded-full shrink-0 flex items-center">
                              <Star className="w-2.5 h-2.5 fill-amber-400 stroke-none mr-0.5" />
                              {store.restaurant.rating}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium truncate">
                          {store.restaurant.category} • {store.distanceText}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Matching Places from Mapbox Geocoding */}
            {placeSuggestions.length > 0 && (
              <div className="p-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-blue-500" />
                  Lugares y Direcciones
                </p>
                {placeSuggestions.map((place) => (
                  <button
                    key={place.id}
                    onClick={() => handleSelectPlaceRecommendation(place)}
                    className="w-full p-2 rounded-xl flex items-center gap-2.5 hover:bg-slate-50 active:bg-slate-100 text-left transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-xs font-bold text-slate-800 truncate">
                        {place.name}
                      </h5>
                      <p className="text-[10px] text-slate-400 font-medium truncate">
                        {place.place_name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!hasSuggestions && !isSearchingPlaces && (
              <div className="p-4 text-center">
                <p className="text-xs font-bold text-slate-500">
                  No se encontraron resultados para "{searchQuery}"
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Prueba buscando por nombre del local, comida o calle
                </p>
              </div>
            )}
          </div>
        )}
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
      <div 
        className={`absolute right-3 ${selectedRestaurant ? 'bottom-56 sm:bottom-60' : 'bottom-28 sm:bottom-32'} z-40 flex flex-col gap-2 pointer-events-auto transition-all duration-300`}
      >
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
        <div className="absolute bottom-24 sm:bottom-28 inset-x-3 max-w-lg mx-auto z-40 pointer-events-auto animate-in slide-in-from-bottom duration-300">
          <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl p-4 shadow-2xl border border-white/60 flex items-center justify-between gap-3">
            {/* Close Selected Store Button */}
            <button
              onClick={() => setSelectedRestaurant(null)}
              className="absolute -top-3 -right-2 w-7 h-7 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-md hover:bg-slate-900 active:scale-90 transition-all z-10"
              title="Cerrar ficha"
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>

            <div className="flex items-center gap-3 min-w-0">
              <img
                src={selectedRestaurant.logoUrl || (selectedRestaurant as any).logo || selectedRestaurant.image}
                alt={selectedRestaurant.name}
                className="w-14 h-14 rounded-2xl object-cover shadow-md shrink-0 border border-slate-100"
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
