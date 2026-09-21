import { MapPin, ChevronDown, ChevronRight, Bell, Search, SlidersHorizontal, Utensils, Star, Heart, Clock, Store, Truck, Zap, Tag, X, Layout, Gift, ArrowUp, Map as MapIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { calculateDistance, formatDistance } from '../lib/geo';
import WelcomePopup from '../components/WelcomePopup';
import ExploreMapModal from '../components/ExploreMapModal';
import { getCityCoordinates, getNearestCity } from '../lib/venezuelaData';
import GPSLockScreen from '../components/GPSLockScreen';
import { GOOGLE_MAPS_API_KEY } from '../lib/mapsConfig';
import { recommendationsService } from '../lib/recommendations';
import { toast } from 'react-hot-toast';
import { vibrate } from '../utils/haptics';
import PointsModal from '../components/PointsModal';
import BCVCalculatorModal from '../components/BCVCalculatorModal';
import { isDemoMode, UN2X3_LOGO } from '../lib/env';
import { useCurrency } from '../context/CurrencyContext';
import { useBranding } from '../context/BrandingContext';
import DualPrice from '../components/DualPrice';
import { DEMO_RESTAURANTS } from '../lib/demoData';
import ActiveTasksWidget from '../components/ActiveTasksWidget';
import AvailableStoresRow from '../components/AvailableStoresRow';
import HomePromotionCard, { CardBannerItem } from '../components/HomePromotionCard';

interface RecommendedProduct extends Product {
  restaurantId: string;
  restaurantLogo?: string;
  restaurantHasCashea?: boolean;
  restaurantHasTwoByThree?: boolean;
}

interface Category {
  id: string;
  name: string;
  icon?: string;
  imageUrl?: string;
  isFeatured?: boolean;
  clickCount?: number;
  isActive: boolean;
  parentId?: string;
}

export default function Home() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [cardBanners, setCardBanners] = useState<CardBannerItem[]>([]);
  const [disclaimerText, setDisclaimerText] = useState<string>('');
  const [showDisclaimer, setShowDisclaimer] = useState<boolean>(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryMode, setCategoryMode] = useState<'manual' | 'algorithm'>('manual');
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const { bcvRate } = useCurrency();
  const { branding } = useBranding();
  const clientLogo = branding.app_client_logo || UN2X3_LOGO;
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  // Recommendations State
  const [isNewUser, setIsNewUser] = useState(true);
  const [recentlyViewed, setRecentlyViewed] = useState<RecommendedProduct[]>([]);
  const [interestedProducts, setInterestedProducts] = useState<RecommendedProduct[]>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<RecommendedProduct[]>([]);
  const [inspiredProducts, setInspiredProducts] = useState<RecommendedProduct[]>([]);
  const [randomProducts, setRandomProducts] = useState<RecommendedProduct[]>([]);
  const [casheaIcon, setCasheaIcon] = useState<string | null>(null);

  const [manualState, setManualState] = useState<string>(() => localStorage.getItem('userState') || '');
  const [manualCity, setManualCity] = useState<string>(() => localStorage.getItem('userCity') || '');
  const [locationName, setLocationName] = useState(() => {
    return localStorage.getItem('userCity') ? `${localStorage.getItem('userCity')}` : 'Buscando...';
  });
  // GPS Mandatory State
  const [isGpsBlocked, setIsGpsBlocked] = useState<boolean>(false);
  const [isGpsChecking, setIsGpsChecking] = useState<boolean>(true);
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string>('');

  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);

  const handleGpsSuccess = async (position: GeolocationPosition) => {
    const coords = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    setUserLocation(coords);
    localStorage.setItem('userLat', coords.lat.toString());
    localStorage.setItem('userLng', coords.lng.toString());

    // 1. Calculate nearest Venezuelan city
    const nearest = getNearestCity(coords.lat, coords.lng);
    let detectedCity = nearest.city;
    let detectedState = nearest.state;

    // 2. Reverse geocode via Google Maps API if configured
    try {
      if (GOOGLE_MAPS_API_KEY) {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        if (data.results && data.results[0]) {
          const addressComponents = data.results[0].address_components;
          const cityComp =
            addressComponents.find((c: any) => c.types.includes('locality'))?.long_name ||
            addressComponents.find((c: any) => c.types.includes('administrative_area_level_2'))?.long_name;
          const stateComp = addressComponents.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name;
          if (cityComp) {
            detectedCity = cityComp;
          }
          if (stateComp) {
            detectedState = stateComp;
          }
        }
      }
    } catch (e) {
      console.warn("Google reverse geocode fallback to nearest Venezuelan city:", e);
    }

    setManualCity(detectedCity);
    setManualState(detectedState);
    setLocationName(detectedCity);
    localStorage.setItem('userCity', detectedCity);
    localStorage.setItem('userState', detectedState);

    // Sync with Supabase profiles if logged in
    const uid = userData?.uid || userData?.id;
    if (uid) {
      supabase.from('profiles').update({
        last_city: detectedCity,
        lastCity: detectedCity,
        last_state: detectedState,
        lastState: detectedState,
        coords: coords,
        updated_at: new Date().toISOString()
      }).eq('id', uid).then(() => {}).catch(console.error);
    }

    setIsGpsBlocked(false);
    setIsGpsChecking(false);
    setGpsErrorMessage('');
  };

  const handleGpsError = (err: GeolocationPositionError) => {
    console.warn("GPS error/denied:", err);
    setIsGpsBlocked(true);
    setIsGpsChecking(false);
    let msg = 'Es obligatorio tener la ubicación GPS encendida para utilizar la aplicación.';
    if (err.code === err.PERMISSION_DENIED) {
      msg = 'Has denegado el permiso de ubicación. Por favor actívalo en los ajustes de tu navegador o dispositivo.';
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      msg = 'Tu señal de GPS está apagada o no disponible. Enciende la ubicación en los ajustes de tu teléfono.';
    } else if (err.code === err.TIMEOUT) {
      msg = 'Tiempo de espera agotado buscando tu señal de GPS. Por favor reintenta.';
    }
    setGpsErrorMessage(msg);
  };

  const requestGpsLocation = () => {
    if (!navigator.geolocation) {
      setIsGpsBlocked(true);
      setIsGpsChecking(false);
      setGpsErrorMessage('Tu dispositivo o navegador no soporta geolocalización por GPS.');
      return;
    }

    setIsGpsChecking(true);
    setGpsErrorMessage('');
    navigator.geolocation.getCurrentPosition(
      handleGpsSuccess,
      handleGpsError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    // 1. Initial attempt to obtain GPS location
    requestGpsLocation();

    // 2. Watch position continuously to react immediately if GPS is toggled
    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        handleGpsSuccess,
        handleGpsError,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    }

    // 3. Re-check when user switches back to the app window/tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestGpsLocation();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [userData]);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const { data: fetchedBanners } = await supabase
          .from('banners')
          .select('*');

        const mappedBanners = (fetchedBanners || []).map((b: any) => ({
          ...b,
          imageUrl: b.image_url || b.imageUrl || '',
          linkUrl: b.link_url || b.linkUrl || '',
          isActive: b.is_active !== undefined ? b.is_active : b.isActive,
          visibilityScope: b.visibility_scope || b.visibilityScope || 'national',
          targetState: b.target_state || b.targetState || '',
          targetCity: b.target_city || b.targetCity || '',
          orderIndex: b.order_index ?? b.orderIndex ?? 0
        }));

        const activeBanners = mappedBanners.filter((b: any) => 
          b.isActive && 
          (b.type === 'top_banner' || b.type === 'fidelization' || !b.type)
        );

        // Location filtering
        const filteredBanners = activeBanners.filter((banner: any) => {
          if (isDemoMode()) {
            return banner.visibilityScope === 'national';
          }

          const scope = banner.visibilityScope || 'national';

          if (scope === 'national') return true;

          if (scope === 'state') {
            return banner.targetState === manualState;
          }

          if (scope === 'city') {
            return banner.targetCity === manualCity;
          }

          return false;
        });
        // Shuffle the filtered banners randomly
        const shuffledBanners = [...filteredBanners].sort(() => Math.random() - 0.5);

        // Card Banners (Image 2 style)
        const activeCardBanners = mappedBanners.filter((b: any) =>
          b.isActive && b.type === 'card_banner'
        );
        const filteredCardBanners = activeCardBanners.filter((banner: any) => {
          if (isDemoMode()) return banner.visibilityScope === 'national' || !banner.visibilityScope;
          const scope = banner.visibilityScope || 'national';
          if (scope === 'national') return true;
          if (scope === 'state') return banner.targetState === manualState;
          if (scope === 'city') return banner.targetCity === manualCity;
          return false;
        });
        setCardBanners(filteredCardBanners.map((b: any) => ({
          id: b.id,
          title: b.title,
          subtitle: b.explanation || b.subtitle || '',
          imageUrl: b.imageUrl,
          linkUrl: b.linkUrl,
          bgColor: b.target_screen || b.targetScreen || '#FEF9C3',
          isActive: b.isActive
        })));

        // SUDEBAN Disclaimer config
        try {
          const { data: discConfig } = await supabase
            .from('system_configs')
            .select('*')
            .eq('id', 'home_disclaimer')
            .maybeSingle();
          if (discConfig) {
            if (discConfig.text) setDisclaimerText(discConfig.text);
            if (discConfig.is_active !== undefined) setShowDisclaimer(discConfig.is_active);
          }
        } catch (discErr) {
          console.warn("Could not fetch home disclaimer:", discErr);
        }

        setBanners(shuffledBanners);
      } catch (error) {
        console.error("Error fetching banners: ", error);
      }
    };

    const fetchData = async () => {
      try {
        // Fetch Settings
        try {
            const { data: globalSettings } = await supabase
              .from('system_configs')
              .select('*')
              .eq('id', 'global')
              .maybeSingle();
            if (globalSettings) {
               setCategoryMode(globalSettings.data?.categoryMode || globalSettings.categoryMode || 'manual');
            }
        } catch (e) {
            console.warn("Could not fetch global settings:", e);
            // Default to manual if we can't read settings due to permissions
            setCategoryMode('manual');
        }

        // Fetch Categories
        const { data: fetchedCategories } = await supabase
          .from('global_categories')
          .select('*');

        const cats = (fetchedCategories || []).map((doc: any) => ({
          id: doc.id,
          name: doc.name,
          icon: doc.icon,
          parentId: doc.parent_id ?? doc.parentId,
          isActive: doc.is_active ?? doc.isActive,
          isFeatured: doc.is_featured ?? doc.isFeatured,
          clickCount: doc.click_count ?? doc.clickCount ?? 0,
          ...doc
        })) as Category[];
        setCategories(cats.filter(c => c.isActive));

        // Fetch All Restaurants for filtering logic and profiles
        let fetchedRestaurants: Restaurant[] = [];
        
        if (isDemoMode()) {
            fetchedRestaurants = [...DEMO_RESTAURANTS];
            // Compute distances for demo restaurants if location is available
            fetchedRestaurants = fetchedRestaurants.map(rest => {
                let dist = 999;
                if (userLocation && rest.location?.coords) {
                    dist = calculateDistance(
                        userLocation.lat,
                        userLocation.lng,
                        rest.location.coords.lat,
                        rest.location.coords.lng
                    );
                }
                return {
                    ...rest,
                    distance: dist !== 999 ? formatDistance(dist) : rest.distance,
                    _rawDistance: dist,
                    _sortScore: dist
                };
            });
        } else {
            const { data: rSnap } = await supabase
              .from('comercios')
              .select('*');

            fetchedRestaurants = (rSnap || []).map((doc: any) => {
               const isVisible = (doc.is_visible === true || doc.isVisible === true);
               const isActive = (doc.is_active !== false && doc.isActive !== false);
               const isVerified = (doc.is_verified === true || doc.isVerified === true || doc.verification_status === 'verified');
               return {
                  ...doc,
                  id: doc.id,
                  name: doc.name,
                  category: doc.category,
                  whatsapp: doc.whatsapp,
                  image: doc.image_url || doc.image,
                  logoUrl: doc.logo_url || doc.logoUrl || doc.logo,
                  coverUrl: doc.cover_url || doc.coverUrl,
                  rating: doc.rating,
                  reviews: doc.reviews,
                  isActive,
                  is_active: isActive,
                  isVisible,
                  is_visible: isVisible,
                  isVerified,
                  is_verified: isVerified,
                  hasCashea: doc.has_cashea ?? doc.hasCashea,
                  hasTwoByThree: doc.has_two_by_three ?? doc.hasTwoByThree,
                  location: doc.location,
               };
            }) as Restaurant[];

            // Filter inactive and non-visible restaurants
            fetchedRestaurants = fetchedRestaurants.filter(r => 
               r.isActive && r.isVisible
            );

            // Update distance strings and compute sorting weights
            fetchedRestaurants = fetchedRestaurants.map(rest => {
              let dist = 999;
              if (userLocation && rest.location?.coords) {
                dist = calculateDistance(
                  userLocation.lat,
                  userLocation.lng,
                  rest.location.coords.lat,
                  rest.location.coords.lng
                );
              }
              let cityMatchScore = 0;
              if (manualCity && rest.location?.city?.toLowerCase().trim() === manualCity.toLowerCase().trim()) {
                cityMatchScore = -10000;
              }
              return {
                ...rest,
                distance: dist !== 999 ? formatDistance(dist) : 'Distancia desconocida',
                _rawDistance: dist,
                _sortScore: cityMatchScore + dist // Combine city score and real distance 
              };
            }).sort((a, b) => (a._sortScore as number) - (b._sortScore as number));

            // Strict location filtering (omit any business not in the city)
            if (manualCity) {
                const normalizeLoc = (str?: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';
                const mCity = normalizeLoc(manualCity);
                
                fetchedRestaurants = fetchedRestaurants.filter(rest => {
                   const c = normalizeLoc(rest.location?.city || (rest as any).city);
                   if (c && (c === mCity || c.includes(mCity) || mCity.includes(c))) {
                       return true;
                   }
                   if (Array.isArray((rest as any).locations)) {
                     return (rest as any).locations.some((loc: any) => {
                       const locCity = normalizeLoc(loc.city);
                       return locCity && (locCity === mCity || locCity.includes(mCity) || mCity.includes(locCity));
                     });
                   }

                   return false;
                });
            }
        }
        setRestaurants(fetchedRestaurants);

        // Fetch All Products for Recommendations from top restaurants in the area
        let allProducts: RecommendedProduct[] = [];
        const topRestForProducts = fetchedRestaurants.slice(0, 30); // Use filtered restaurants from this zone
        
        if (isDemoMode()) {
            allProducts = topRestForProducts.flatMap(rest => 
                (rest.products || []).map(p => ({
                    ...p,
                    restaurantId: rest.id!,
                    restaurantLogo: (rest as any).logoUrl || rest.image,
                    restaurantHasCashea: rest.hasCashea,
                    restaurantHasTwoByThree: rest.hasTwoByThree,
                }))
            );
        } else {
            const restIds = topRestForProducts.map(r => r.id);
            if (restIds.length > 0) {
                const { data: pData } = await supabase
                  .from('products')
                  .select('*')
                  .in('restaurant_id', restIds)
                  .limit(200);

                (pData || []).forEach((d: any) => {
                    const r = fetchedRestaurants.find((rest: any) => rest.id === (d.restaurant_id || d.restaurantId));
                    allProducts.push({ 
                      id: d.id, 
                      restaurantId: d.restaurant_id || d.restaurantId, 
                      restaurantLogo: r ? (r.logoUrl || r.image) : '',
                      restaurantHasCashea: r?.hasCashea,
                      restaurantHasTwoByThree: r?.hasTwoByThree,
                      name: d.name,
                      price: d.price,
                      image: d.image_url || d.image,
                      category: d.category,
                      ...d 
                    } as RecommendedProduct);
                });
            }
        }

        const history = recommendationsService.getViewedProductsHistory();
        const topCategories = recommendationsService.getTopInterestedCategories();
        const lastCategory = recommendationsService.getLastViewedCategory();

        if (history.length === 0) {
          setIsNewUser(true);
          // Sort products by their restaurant's rating and reviews
          const topProducts = [...allProducts].sort((a, b) => {
            const rA = fetchedRestaurants.find((r: any) => r.id === a.restaurantId);
            const rB = fetchedRestaurants.find((r: any) => r.id === b.restaurantId);
            const ratingDiff = (rB?.rating || 0) - (rA?.rating || 0);
            if (ratingDiff !== 0) return ratingDiff;
            return (rB?.reviews || 0) - (rA?.reviews || 0);
          });
          setRandomProducts(topProducts.slice(0, 12));
        } else {
          setIsNewUser(false);
          const recentIds = history.map(h => h.id);

          // Fallback randomProducts
          const topProducts = [...allProducts].sort((a, b) => {
            const rA = fetchedRestaurants.find((r: any) => r.id === a.restaurantId);
            const rB = fetchedRestaurants.find((r: any) => r.id === b.restaurantId);
            const ratingDiff = (rB?.rating || 0) - (rA?.rating || 0);
            if (ratingDiff !== 0) return ratingDiff;
            return (rB?.reviews || 0) - (rA?.reviews || 0);
          });
          setRandomProducts(topProducts.slice(0, 12));

          const allowedRestIds = new Set(fetchedRestaurants.map(r => r.id));
          setRecentlyViewed(
            history
              .filter(h => allowedRestIds.has(h.restaurantId))
              .map(h => allProducts.find(p => p.id === h.id))
              .filter(Boolean) as RecommendedProduct[]
          );

          setInterestedProducts(
            allProducts.filter(p => topCategories.includes(p.category) && !recentIds.includes(p.id!)).slice(0, 10)
          );

          if (userData?.favorites?.length > 0) {
            setFavoriteProducts(
              allProducts.filter(p => userData.favorites.includes(p.restaurantId)).slice(0, 10)
            );
          }

          if (lastCategory) {
            setInspiredProducts(
              allProducts.filter(p => p.category === lastCategory && !recentIds.includes(p.id!)).slice(0, 10)
            );
          }
        }

        // Use official Cashea icon from global_icons
        const { data: icons } = await supabase
          .from('global_icons')
          .select('*');
        const cashea = (icons || []).find((icon: any) => icon.name?.toLowerCase() === 'cashea');

        if (cashea) {
          setCasheaIcon(cashea.image_url || cashea.imageUrl || cashea.url);
        } else {
          setCasheaIcon("https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/OIP%20(4).webp");
        }

      } catch (error: any) {
        console.error("Error fetching home data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBanners();
    fetchData();

    // Realtime subscription on 'comercios' table: instantly updates UI when a store visibility changes or is deleted
    const comerciosChannel = supabase
      .channel('client-home-comercios-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comercios' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    // Re-fetch when user returns to the tab or app
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(comerciosChannel);
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [userLocation, manualCity, manualState]);

  // Combined effect for Banner Timer
  useEffect(() => {
    if (banners.length <= 1) return;

    const currentBanner = banners[currentBannerIndex];
    const duration = (currentBanner?.duration || 5) * 1000;

    const timer = setTimeout(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
    }, duration);

    return () => clearTimeout(timer);
  }, [currentBannerIndex, banners]);

  const displayCategories = useMemo(() => {
    // We primarily show Sectors on the home page
    const sectors = categories.filter(c => !c.parentId);
    if (categoryMode === 'manual') {
      return sectors.filter(c => c.isFeatured).slice(0, 8);
    } else {
      return [...sectors].sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0)).slice(0, 8);
    }
  }, [categories, categoryMode]);

  const handleCategoryClick = async (category: Category) => {
    try {
      supabase
        .from('global_categories')
        .update({
          click_count: (category.clickCount || 0) + 1,
          clickCount: (category.clickCount || 0) + 1
        })
        .eq('id', category.id)
        .then(() => {})
        .catch(console.error);

      // Navigate to search with sector filter if it's a sector
      if (!category.parentId) {
        navigate('/search', { state: { sector: category.id, categoryName: category.name } });
      } else {
        navigate('/search', { state: { category: category.name } });
      }
    } catch (error) {
      console.error("Error tracking click:", error);
      navigate('/search', { state: { category: category.name } });
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden bg-white">
      <WelcomePopup manualState={manualState} manualCity={manualCity} />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4 gap-2">
          {/* Logo */}
          <div
            onClick={() => window.location.reload()}
            className="flex-1 flex items-center justify-start cursor-pointer active:scale-95 transition-transform overflow-visible"
          >
            <img
              src={clientLogo}
              alt={branding.app_client_name || "Logo"}
              className="h-10 w-auto object-contain"
            />
          </div>

          {/* Right group: BCV + Points + Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* BCV */}
            <div
              onClick={() => { vibrate(20); setIsCalculatorOpen(true); }}
              className="flex flex-col items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform mr-1"
            >
              <span className="text-[9px] font-black uppercase text-secondary/60 tracking-tighter leading-none mb-0.5">Tasa BCV</span>
              <div className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full">
                <span className="text-[11px] font-black text-secondary">{(bcvRate || 0).toFixed(2)} Bs</span>
              </div>
            </div>
            {/* Points */}
            <div
              onClick={() => { vibrate(30); setIsPointsModalOpen(true); }}
              className="flex flex-col items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform mr-1"
            >
              <span className="text-[9px] font-black uppercase text-secondary/60 tracking-tighter leading-none mb-0.5">Puntos</span>
              <div className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full">
                <Star className="w-2.5 h-2.5 text-secondary fill-secondary" />
                <span className="text-[11px] font-black text-secondary">{userData?.points || 0}</span>
              </div>
            </div>

            <Link to="/favorites" className="p-2.5 text-secondary hover:bg-white/20 rounded-2xl transition-all active:scale-90">
              <Heart className="w-5.5 h-5.5" />
            </Link>
            <Link to="/notifications" className="relative p-2.5 text-secondary hover:bg-white/20 rounded-2xl transition-all active:scale-90">
              <Bell className="w-5.5 h-5.5" />
              <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-accent border-[1.5px] border-primary"></span>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative group block mb-4">
          <Link to="/search" className="block">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Search className="w-5 h-5 text-gray-400" />
            </div>
            <div className="flex w-full py-3.5 pl-12 pr-12 text-[15px] text-gray-500 rounded-full bg-white shadow-sm cursor-text">
              Buscar en un 2x3
            </div>
          </Link>
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            <Link to="/search" state={{ openFilters: true }} className="p-2 text-gray-400 hover:text-secondary transition-colors rounded-full">
              <SlidersHorizontal className="w-5 h-5" />
            </Link>
          </div>
        </div>

        {/* Location Display (Auto GPS with active pulsing green dot) & Map Explore Button */}
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex items-center gap-2 text-secondary py-1 min-w-0"
            title="Ubicación detectada automáticamente por GPS"
          >
            <div className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
            </div>
            <MapPin className="w-4 h-4 text-secondary shrink-0" />
            <span className="text-[14px] font-bold leading-none tracking-tight truncate max-w-[200px]">
              {locationName !== 'Buscando...' && locationName !== 'Ubicación Desconocida' ? locationName : 'Detectando GPS...'}
            </span>
          </div>

          <button
            onClick={() => { vibrate(20); setIsMapModalOpen(true); }}
            className="flex items-center gap-1.5 bg-black/10 hover:bg-black/20 text-secondary text-xs font-black px-3 py-1.5 rounded-full transition-all active:scale-95 shrink-0 border border-black/5"
            title="Explorar comercios en el mapa"
          >
            <MapIcon className="w-3.5 h-3.5 text-secondary" />
            <span>Ver mapa</span>
          </button>
        </div>
      </header>

      {/* Banner Section Background Fade */}
      <div className="absolute top-[170px] left-0 right-0 h-40 bg-gradient-to-b from-primary to-white z-0 pointer-events-none"></div>

      {/* Free Interactive Leaflet/OSM Map Modal */}
      <ExploreMapModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        restaurants={restaurants}
        userLocation={userLocation}
      />

      {/* App Info Modal */}
      <BCVCalculatorModal 
        isOpen={isCalculatorOpen} 
        onClose={() => setIsCalculatorOpen(false)} 
        bcvRate={bcvRate} 
      />

      <AnimatePresence>
        {isInfoModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsInfoModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl overflow-y-auto max-h-[85vh] hide-scrollbar"
            >
              <button
                onClick={() => setIsInfoModalOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors z-20"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center mb-6 pt-4 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-primary/20 rounded-full blur-2xl animate-pulse"></div>
                <div className="w-28 h-28 bg-white rounded-full p-2.5 shadow-xl shadow-primary/20 border border-primary/10 flex items-center justify-center relative z-10 animate-pulse">
                  <img
                    src={clientLogo}
                    alt={branding.app_client_name || "Logo"}
                    className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,102,0,0.5)]"
                  />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mt-5 text-center leading-tight">Tu Mundo en un Toque</h2>
              </div>

              <div className="space-y-6 text-sm">
                <p className="text-slate-600 font-medium leading-relaxed">
                  <span className="font-bold text-slate-900">un 2x3 no es solo una aplicación;</span> es el ecosistema digital más robusto de Venezuela diseñado para conectar a usuarios, comercios y trabajadores independientes en una sola interfaz.
                </p>
                <p className="text-slate-600 font-medium leading-relaxed">
                  Nuestra misión es eliminar las fricciones del día a día: adiós a las colas, adiós a la incertidumbre de precios y hola a la inmediatez.
                </p>

                <div className="pt-5 border-t border-slate-100">
                  <h3 className="text-lg font-black text-slate-900 mb-4">¿Qué nos hace únicos?</h3>

                  <div className="space-y-5">
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm">
                        <MapPin className="w-5 h-5 text-slate-900" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm mb-1">Geolocalización Inteligente</h4>
                        <p className="text-slate-500 leading-relaxed text-[13px]">Visualiza menús, productos y ofertas de los negocios más cercanos a tu ubicación actual en tiempo real.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0 border border-amber-100 shadow-sm">
                        <Zap className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm mb-1">Adiós a las Colas</h4>
                        <p className="text-slate-500 leading-relaxed text-[13px]">Compra directamente desde la app. Tu pedido llega al panel administrativo de la empresa y a su WhatsApp, garantizando que tu producto esté listo sin esperas.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-fuchsia-50 flex items-center justify-center shrink-0 border border-fuchsia-100 shadow-sm">
                        <Layout className="w-5 h-5 text-fuchsia-500" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm mb-1">Ecosistema 360°</h4>
                        <p className="text-slate-500 leading-relaxed text-[13px]">Todo lo que necesitas (comida, mercado, taxis y envíos) está en un solo lugar. <span className="italic font-bold">"Consigue lo que quieras"</span>.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm">
                        <Store className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm mb-1">Herramienta Empresarial</h4>
                        <p className="text-slate-500 leading-relaxed text-[13px]">Ofrecemos a los aliados un sistema de comandas para cocina/barra y un software administrativo para el control total de sus ventas y publicidad.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button
                  onClick={() => setIsInfoModalOpen(false)}
                  className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-lg shadow-slate-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  ¡Entendido!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Promotional Banners (FIRST directly below Header) */}
      {banners.length > 0 && (
        <section className="mt-4 px-5">
          <div className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden shadow-lg border border-slate-100 bg-slate-50">
            <motion.div
              className="flex h-full w-full"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={(e, info) => {
                const threshold = 50;
                if (info.offset.x < -threshold) {
                  // Forward
                  setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
                } else if (info.offset.x > threshold) {
                  // Backward
                  setCurrentBannerIndex((prev) => (prev - 1 + banners.length) % banners.length);
                }
              }}
              animate={{ x: `-${currentBannerIndex * 100}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
            >
              {banners.map((banner) => (
                <div key={banner.id} className="min-w-full h-full">
                  <a
                    href={banner.linkUrl || banner.link_url || '#'}
                    onClick={(e) => {
                      if (banner.type === 'fidelization') {
                        e.preventDefault();
                        navigate(`/rewards?openBannerId=${banner.id}`);
                      } else if ((banner.linkUrl || banner.link_url) && (banner.linkUrl || banner.link_url).startsWith('/')) {
                        e.preventDefault();
                        navigate(banner.linkUrl || banner.link_url);
                      }
                    }}
                    target={(banner.linkUrl || banner.link_url) && !(banner.linkUrl || banner.link_url).startsWith('/') ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="w-full h-full block"
                  >
                    <img
                      src={banner.imageUrl || banner.image_url}
                      alt={banner.title}
                      className="w-full h-full object-cover select-none pointer-events-none"
                      draggable={false}
                    />
                  </a>
                </div>
              ))}
            </motion.div>

            {/* Indicator Dots */}
            <div className="absolute bottom-3 right-3 flex gap-1.5 z-20 pointer-events-none">
              {banners.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === currentBannerIndex ? 'w-4 bg-white shadow-sm' : 'w-1.5 bg-white/40'
                    }`}
                ></div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 3. Persistent Active Tasks Widget (Active rides, deliveries, and orders - hidden if empty) */}
      <ActiveTasksWidget />

      {/* 4. Available Stores by User Zone/City (Matching Image 1) */}
      <AvailableStoresRow restaurants={restaurants} cityName={manualCity || locationName} />

      {/* Categories moved/hidden as per request */}
      {/* <section className="mt-4 pl-5">
        <h2 className="text-slate-900 text-lg font-bold mb-4 flex items-center gap-2">
          ¿Qué se te antoja? <span className="text-xl">😋</span>
        </h2>
        <div className="flex gap-4 overflow-x-auto hide-scrollbar pr-5 pb-2">
          {displayCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => handleCategoryClick(category)}
              className="flex flex-col items-center gap-2 group min-w-[72px]"
            >
              <div className="h-[72px] w-[72px] rounded-full bg-slate-50 border-2 border-slate-100 group-hover:border-primary/20 group-hover:scale-105 transition-all duration-300 flex items-center justify-center overflow-hidden">
                {category.imageUrl ? (
                  <img src={category.imageUrl} alt={category.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl">{category.icon || '🏷️'}</span>
                )}
              </div>
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider group-hover:text-slate-900 transition-colors text-center truncate w-full px-1">
                {category.name}
              </span>
            </button>
          ))}

          <Link to="/search" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-slate-50 border-2 border-slate-100 p-1 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-slate-400">
                <Utensils className="w-6 h-6" />
              </div>
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider group-hover:text-slate-900 transition-colors text-center w-full px-1">Ver todo</span>
          </Link>
        </div>
      </section> */}

      {/* Main Content: Destacados / Recommendations */}
      <main className="flex-1 px-5 pt-6 pb-24">
        {/* Unified UI for both Guests and Logged In Users */}
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h2 className="text-slate-900 text-xl font-bold">Destacados</h2>
                <Link to="/search" className="text-slate-900 text-sm font-semibold hover:underline">Ver todos</Link>
            </div>
            
            <div className="">
                {recentlyViewed.length > 0 ? (
                    <ProductGrid title="Visto recientemente" products={recentlyViewed} casheaIcon={casheaIcon} />
                ) : randomProducts.length > 0 ? (
                    <ProductGrid title="Descubre algo nuevo" products={randomProducts} casheaIcon={casheaIcon} />
                ) : (
                    <div className="text-center py-12 text-slate-500">
                        No hay productos disponibles en tu zona.
                    </div>
                )}
            </div>

            <h2 className="text-slate-900 text-lg font-bold">Comercios en tu zona</h2>
            <div className="flex flex-col gap-6">
            {loading ? (
                // Loading Skeleton
                Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-3 animate-pulse">
                    <div className="w-full aspect-[16/10] bg-slate-200 rounded-xl"></div>
                    <div className="space-y-2 px-1">
                    <div className="h-5 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                    </div>
                </div>
                ))
            ) : restaurants.length > 0 ? (
                restaurants.map((restaurant) => {
                const coverImg = (restaurant as any).coverUrl || (restaurant as any).cover_url || '';
                const logoImg = (restaurant as any).logoUrl || (restaurant as any).logo_url || restaurant.image || '';

                return (
                    <Link key={restaurant.id} to={`/restaurant/${restaurant.id}`} onClick={() => vibrate(30)} className="group relative flex flex-col gap-3">
                    <div className="relative w-full aspect-[16/10] overflow-hidden rounded-xl shadow-sm bg-slate-900">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
                        <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                        <Star className="w-4 h-4 text-highlight fill-highlight" />
                        <span className="text-xs font-bold text-slate-900">{restaurant.rating}</span>
                        <span className="text-[10px] text-slate-500">({restaurant.reviews}+)</span>
                        </div>
                        <div className="absolute top-3 right-3 z-20 bg-white p-1.5 rounded-full shadow-sm cursor-pointer hover:scale-110 transition-transform">
                        <Heart className={`w-5 h-5 transition-colors ${false ? 'text-accent fill-accent' : 'text-slate-400 hover:text-accent hover:fill-accent'}`} />
                        </div>

                        {restaurant.hasCashea && (
                        <div className="absolute top-3 right-12 z-20 w-10 h-10 bg-yellow-400 backdrop-blur rounded-xl p-1.5 shadow-xl border border-white/20 flex items-center justify-center animate-in zoom-in duration-500 hover:scale-110 transition-transform">
                            <img
                            src={casheaIcon || "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/OIP%20(4).webp"}
                            alt="Cashea"
                            className="w-full h-full object-contain"
                            />
                        </div>
                        )}

                        {(restaurant as any).activeRaffle?.isActive && (
                        <div className={`absolute top-3 z-20 w-10 h-10 bg-orange-500 backdrop-blur rounded-xl p-1.5 shadow-xl border border-white/20 flex items-center justify-center animate-bounce duration-1000 hover:scale-110 transition-transform ${restaurant.hasCashea ? 'right-[5.5rem]' : 'right-12'}`}>
                            <Gift className="w-5 h-5 text-white" />
                        </div>
                        )}

                        {coverImg ? (
                        <div
                            className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500 ease-out"
                            style={{ backgroundImage: `url('${coverImg}?q=80&w=800&auto=format&fit=crop')` }}
                        ></div>
                        ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 flex flex-col items-center justify-center text-slate-400 p-4">
                            <Store className="w-12 h-12 mb-2 text-white/30" />
                            <span className="text-[11px] font-black uppercase tracking-widest text-white/50 text-center">{restaurant.name}</span>
                        </div>
                        )}

                        <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-2">
                        {restaurant.featured && (
                            <span className="bg-primary text-slate-900 text-[10px] font-bold px-2 py-1 rounded-lg">Destacado</span>
                        )}
                        <span className="bg-white/90 backdrop-blur-md text-slate-900 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> {restaurant.deliveryTime}
                        </span>
                        {(restaurant as any).deliveryRates?.find((r: any) => r.price === 0) && (
                            <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 shadow-lg shadow-emerald-500/20">
                            <Truck className="w-3.5 h-3.5" /> Gratis
                            </span>
                        )}
                        </div>
                    </div>
                    <div className="px-1 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 bg-slate-50 flex items-center justify-center">
                        {logoImg ? (
                            <img src={logoImg} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                            <Store className="w-5 h-5 text-slate-300" />
                        )}
                        </div>
                        <div>
                        <h3 className="text-lg font-bold text-slate-900 leading-tight">{restaurant.name}</h3>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                            {restaurant.category}
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span>$$</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span>{restaurant.distance}</span>
                        </div>
                        </div>
                    </div>
                    </Link>
                );
                })

            ) : (
                <div className="text-center py-12 text-slate-500 font-medium">
                  No hay comercios disponibles en tu zona actualmente.
                </div>
            )}
            </div>

            {/* 6. Card Banner & SUDEBAN Legal Disclaimer at the very end of scroll (Matching Image 2) */}
            <div className="mt-8">
              <HomePromotionCard
                cards={cardBanners}
                disclaimerText={disclaimerText || undefined}
                showDisclaimer={showDisclaimer}
              />
            </div>
        </div>
      </main>
      <PointsModal 
        isOpen={isPointsModalOpen} 
        onClose={() => setIsPointsModalOpen(false)} 
      />

      {/* Mandatory GPS Blocking Screen */}
      {isGpsBlocked && (
        <GPSLockScreen
          isChecking={isGpsChecking}
          errorMessage={gpsErrorMessage}
          onRetry={requestGpsLocation}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Reusable Component for Product Grid
// ----------------------------------------------------------------------
function ProductGrid({ title, products, casheaIcon }: { title: string, products: RecommendedProduct[], casheaIcon: string | null }) {
  const navigate = useNavigate();

  const handleProductClick = (product: RecommendedProduct) => {
    // Record view and navigate with productId
    recommendationsService.recordProductView(product.id!, product.category, product.restaurantId);
    navigate(`/restaurant/${product.restaurantId}?productId=${product.id}`);
  };

  return (
    <div className="overflow-hidden w-full mb-6">
      {title && <h2 className="text-slate-900 text-lg font-bold mb-3">{title}</h2>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {products.map((product) => {
          const finalPrice = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price;
          const displayImg = (product.images && product.images.length > 0) ? product.images[0] : product.image;
          const discount = product.promoPrice && product.price > product.promoPrice 
             ? Math.round(((product.price - product.promoPrice) / product.price) * 100) 
             : 0;

          return (
            <div
              key={`${product.restaurantId}-${product.id}`}
              onClick={() => handleProductClick(product)}
              className="bg-white rounded-xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden cursor-pointer group hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="w-full aspect-square bg-slate-50 p-2 overflow-hidden flex items-center justify-center relative">
                <img
                  src={displayImg}
                  alt={product.name}
                  className="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-300"
                />
                
                {/* Visual Indicators */}
                <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                  {/* Restaurant Logo Circle */}
                  {product.restaurantLogo && (
                    <div className="w-6 h-6 rounded-full bg-white shadow-sm border border-slate-100 overflow-hidden flex items-center justify-center" title="Comercio">
                      <img src={product.restaurantLogo} alt="Logo" className="w-full h-full object-cover rounded-full" />
                    </div>
                  )}
                  {/* Cashea Badge */}
                  {product.restaurantHasCashea && (
                    <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-sm" title="Cashea">
                      <img src={casheaIcon || "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/OIP%20(4).webp"} alt="Cashea" className="w-4 h-4 object-contain" />
                    </div>
                  )}
                  {/* 2x3 Resuelve Badge */}
                  {product.restaurantHasTwoByThree && (
                    <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-sm text-slate-900 border border-white/50" title="2x3 Resuelve">
                      <div className="flex flex-col items-center justify-center leading-none">
                         <span className="text-[6px] font-black">2x3</span>
                         <span className="text-[4px] font-black uppercase">Resuelve</span>
                      </div>
                    </div>
                  )}
                </div>

                {discount > 0 && (
                  <div className="absolute bottom-2 left-2 bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm">
                    {discount}% OFF
                  </div>
                )}
                {(product.consultPrice || (!product.price && !product.promoPrice)) && (
                   <div className="absolute bottom-2 left-2 bg-slate-900 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm">
                     CONSULTAR
                   </div>
                )}
              </div>

              <div className="p-3 flex-1 flex flex-col">
                <h3 className="text-xs text-slate-700 font-medium line-clamp-2 leading-tight group-hover:text-slate-900 transition-colors">
                  {product.name}
                </h3>
                
                <div className="flex items-center gap-1 mt-1.5 mb-1.5 text-[10px] text-slate-500">
                   <Star className="w-3 h-3 text-blue-600 fill-blue-600" />
                   <span className="text-blue-600">5.0</span>
                </div>

                <div className="mt-auto pt-1">
                  {!product.consultPrice && product.price > 0 && (
                    <div className="flex flex-col">
                      {discount > 0 && (
                        <div className="flex items-center gap-1 opacity-50">
                          <span className="text-[10px] text-slate-400">US$</span>
                          <DualPrice 
                            usdAmount={product.price} 
                            className="text-[10px] text-slate-400 line-through"
                            showDivider={false}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 translate-y-[-2px]">
                        <DualPrice 
                          usdAmount={finalPrice} 
                          className="font-black text-slate-900 text-sm" 
                          usdClassName="text-sm font-black"
                          showDivider={true}
                        />
                        {discount > 0 && (
                           <span className="text-[10px] text-emerald-500 font-bold whitespace-nowrap">{discount}% OFF</span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Free Shipping Highlight */}
                  <div className="mt-1">
                    <span className="text-[11px] font-medium text-emerald-500 tracking-tight flex items-center gap-1">
                      Envío gratis
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

