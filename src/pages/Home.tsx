import { MapPin, ChevronDown, ChevronRight, Bell, Search, SlidersHorizontal, Utensils, Star, Heart, Clock, Store, Truck, Zap, Tag, X, Layout, Gift, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, increment, collectionGroup, limit, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Restaurant, Product } from '../lib/seed';
import { useAuth } from '../context/AuthContext';
import { calculateDistance, formatDistance } from '../lib/geo';
import CitySelectorModal from '../components/CitySelectorModal';
import WelcomePopup from '../components/WelcomePopup';
import { recommendationsService } from '../lib/recommendations';
import { toast } from 'react-hot-toast';
import { vibrate } from '../utils/haptics';
import PointsModal from '../components/PointsModal';

interface RecommendedProduct extends Product {
  restaurantId: string;
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryMode, setCategoryMode] = useState<'manual' | 'algorithm'>('manual');
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

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
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);


  useEffect(() => {
    // If user has manually selected a city, we prioritize that
    if (manualCity && manualState) {
      setLocationName(`${manualCity}`);
      return; // Don't override with GPS if manual is set
    }

    // If we have a saved address, use it.
    const defaultAddress = userData?.addresses?.find((a: any) => a.isDefault) || userData?.address;
    if (defaultAddress) {
      const coords = { lat: defaultAddress.lat, lng: defaultAddress.lng };
      setUserLocation(coords);
      setLocationName(defaultAddress.reference.split(',')[0]);
      return;
    }

    // Detect location if no saved address and no manual city
    if (navigator.geolocation && !manualCity) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(coords);

          // Reverse geocoding
          try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=AIzaSyCb1c-p1R6AZGetk8YzKiLuxjaxjmPqJX8`);
            const data = await response.json();
            if (data.results && data.results[0]) {
              const addressComponents = data.results[0].address_components;
              const city = addressComponents.find((c: any) => c.types.includes('locality'))?.long_name ||
                addressComponents.find((c: any) => c.types.includes('administrative_area_level_2'))?.long_name;
              const state = addressComponents.find((c: any) => c.types.includes('administrative_area_level_1'))?.short_name;
              if (city && state) {
                setLocationName(`${city}`);
                // Sync with Firestore if logged in
                if (userData?.uid || auth.currentUser?.uid) {
                  const uid = userData?.uid || auth.currentUser?.uid;
                  try {
                    await updateDoc(doc(db, 'users', uid), {
                      lastCity: city,
                      lastState: state,
                      lastLocationUpdate: serverTimestamp()
                    });
                  } catch (e) {
                    console.error("Error syncing location:", e);
                  }
                }
              }
            }
          } catch (error) {
            console.error("Geocoding error:", error);
            setLocationName('Ubicación Desconocida');
          }
        },
        (error) => {
          console.error("Error getting location:", error);
          setLocationName('Ubicación Desconocida');
        }
      );
    } else if (!manualCity) {
      setLocationName('Ubicación Desconocida');
    }
  }, [userData, manualCity, manualState]);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'banners'));
        const fetchedBanners = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];

        const activeBanners = fetchedBanners.filter(b => b.isActive && (b.type === 'top_banner' || b.type === 'fidelization' || !b.type));

        // Location filtering
        const filteredBanners = activeBanners.filter(banner => {
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

        setBanners(shuffledBanners);
      } catch (error) {
        console.error("Error fetching banners: ", error);
      }
    };

    const fetchData = async () => {
      try {
        // Fetch Settings
        const settingsSnap = await getDocs(collection(db, 'settings'));
        const globalSettings = settingsSnap.docs.find(d => d.id === 'global');
        if (globalSettings) {
          setCategoryMode(globalSettings.data().categoryMode || 'manual');
        }

        // Fetch Categories
        const categoriesSnap = await getDocs(collection(db, 'global_categories'));
        const fetchedCategories = categoriesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Category[];
        setCategories(fetchedCategories.filter(c => c.isActive));

        // Fetch All Restaurants for filtering logic and profiles
        const rQuery = query(collection(db, 'restaurants'));
        const rSnap = await getDocs(rQuery);
        let fetchedRestaurants = rSnap.docs.map(doc => ({
           id: doc.id,
           ...doc.data()
        })) as Restaurant[];

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
               const c = normalizeLoc(rest.location?.city);
               const s = normalizeLoc(rest.location?.state);
               const a = normalizeLoc(rest.location?.address);
               return c === mCity || c.includes(mCity) || a.includes(mCity) || s.includes(mCity);
            });
        }
        setRestaurants(fetchedRestaurants);
        const cityResIds = new Set(fetchedRestaurants.map(r => r.id));

        // Fetch All Products for Recommendations from top restaurants in the area
        // Limit to top 20 restaurants to avoid massive reads, ensuring we only get products from THIS city
        let allProducts: RecommendedProduct[] = [];
        const topRestForProducts = fetchedRestaurants.slice(0, 20);
        await Promise.all(topRestForProducts.map(async (rest) => {
            const pSnap = await getDocs(query(collection(db, 'restaurants', rest.id, 'products'), limit(15)));
            pSnap.docs.forEach(d => {
                allProducts.push({ id: d.id, restaurantId: rest.id, ...d.data() } as RecommendedProduct);
            });
        }));

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

          setRecentlyViewed(
            history.map(h => allProducts.find(p => p.id === h.id)).filter(Boolean) as RecommendedProduct[]
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
        const iconsSnap = await getDocs(collection(db, 'global_icons'));
        const icons = iconsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        const cashea = icons.find(icon => icon.name?.toLowerCase() === 'cashea');

        if (cashea) {
          setCasheaIcon(cashea.url || cashea.imageUrl);
        } else {
          setCasheaIcon("https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20cashea.png?alt=media&token=5b266100-3323-41bb-a5a4-23957ce678a1");
        }

      } catch (error) {
        console.error("Error fetching home data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBanners();
    fetchData();
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
      updateDoc(doc(db, 'global_categories', category.id), {
        clickCount: increment(1)
      });

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

  const handleCitySelect = (state: string, city: string) => {
    localStorage.setItem('userState', state);
    localStorage.setItem('userCity', city);
    setManualState(state);
    setManualCity(city);
    setLocationName(`${city}`);
    // Sync with Firestore if logged in
    if (userData?.uid || auth.currentUser?.uid) {
      const uid = userData?.uid || auth.currentUser?.uid;
      updateDoc(doc(db, 'users', uid), {
        lastCity: city,
        lastState: state,
        lastLocationUpdate: serverTimestamp()
      }).catch(console.error);
    }
    // Clear GPS coordinates so distance doesn't mess up sorting if user is physically far away
    setUserLocation(null);
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
              src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media"
              alt="Deliexpress Logo"
              className="h-10 w-auto object-contain"
            />
          </div>

          {/* Right group: Points + Actions */}
          <div className="flex items-center gap-1 shrink-0">
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

        {/* Location Selector */}
        <button
          onClick={() => setIsCityModalOpen(true)}
          className="flex items-center gap-1.5 text-secondary hover:text-black transition-all active:scale-95 py-1"
        >
          <MapPin className="w-5 h-5 shrink-0" />
          <span className="text-[15px] font-normal leading-none tracking-tight truncate max-w-[200px]">
            {locationName !== 'Buscando...' && locationName !== 'Ubicación Desconocida' ? locationName : 'Ingresa tu ubicación'}
          </span>
          <ChevronRight className="w-5 h-5 transition-colors shrink-0" />
        </button>
      </header>

      {/* Banner Section Background Fade */}
      <div className="absolute top-[170px] left-0 right-0 h-40 bg-gradient-to-b from-primary to-white z-0 pointer-events-none"></div>

      <CitySelectorModal
        isOpen={isCityModalOpen}
        onClose={() => setIsCityModalOpen(false)}
        onSelect={handleCitySelect}
        initialState={manualState}
        initialCity={manualCity}
      />

      {/* App Info Modal */}
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
                    src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&token=8acf92ec-b853-4f37-bd82-a4f651bbdcd9"
                    alt="Deliexpress Logo"
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
                        <MapPin className="w-5 h-5 text-primary" />
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

      {/* Promotional Banners */}
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
                    href={banner.linkUrl || '#'}
                    onClick={(e) => {
                      if (banner.type === 'fidelization') {
                        e.preventDefault();
                        navigate(`/rewards?openBannerId=${banner.id}`);
                      } else if (banner.linkUrl && banner.linkUrl.startsWith('/')) {
                        e.preventDefault();
                        navigate(banner.linkUrl);
                      }
                    }}
                    target={banner.linkUrl && !banner.linkUrl.startsWith('/') ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="w-full h-full block"
                  >
                    <img
                      src={banner.imageUrl}
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
                    <ProductGrid title="Visto recientemente" products={recentlyViewed} />
                ) : randomProducts.length > 0 ? (
                    <ProductGrid title="Descubre algo nuevo" products={randomProducts} />
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
                const coverImg = (restaurant as any).coverUrl || restaurant.image;
                const logoImg = (restaurant as any).logoUrl || restaurant.image;

                return (
                    <Link key={restaurant.id} to={`/restaurant/${restaurant.id}`} onClick={() => vibrate(30)} className="group relative flex flex-col gap-3">
                    <div className="relative w-full aspect-[16/10] overflow-hidden rounded-xl shadow-sm bg-slate-100">
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
                            src={casheaIcon || "https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20cashea.png?alt=media&token=5b266100-3323-41bb-a5a4-23957ce678a1"}
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
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300">
                            <Store className="w-12 h-12 mb-2 opacity-50" />
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">{restaurant.name}</span>
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
                            <img src={logoImg} alt="" className="w-full h-full object-cover" />
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

            ) : !manualCity ? (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in slide-in-from-bottom-4 relative">
                <div className="absolute -top-12 2xl:-top-16 opacity-70 flex flex-col items-center animate-bounce">
                    <span className="text-slate-900 font-black uppercase text-[10px] tracking-widest mb-1 text-center bg-white px-3 py-1 rounded-full shadow-sm border border-orange-100">¡Presiona Aquí Arriba!</span>
                    <ArrowUp className="w-8 h-8 text-slate-900" strokeWidth={3} />
                </div>
                
                <div className="w-24 h-24 bg-orange-100 rounded-[2.5rem] flex items-center justify-center mb-6 shadow-md border-4 border-white rotate-3">
                    <MapPin className="w-12 h-12 text-slate-900" />
                </div>
                
                <h3 className="text-2xl font-black text-slate-800 mb-3">¡Épale! 👋</h3>
                <p className="text-slate-500 font-bold max-w-[280px] leading-relaxed">
                    Selecciona arriba tu <span className="text-slate-900 font-black">Estado y Ciudad</span> en la que vives para presentarte lugares increíbles.
                </p>
                </div>
            ) : (
                <div className="text-center py-12 text-slate-500">
                No hay restaurantes disponibles en este momento.
                </div>
            )}
            </div>
        </div>
      </main>
      <PointsModal 
        isOpen={isPointsModalOpen} 
        onClose={() => setIsPointsModalOpen(false)} 
      />
    </div>
  );
}

// ----------------------------------------------------------------------
// Reusable Component for Product Grid
// ----------------------------------------------------------------------
function ProductGrid({ title, products }: { title: string, products: RecommendedProduct[] }) {
  const navigate = useNavigate();

  const handleProductClick = (product: RecommendedProduct) => {
    // Record view and navigate
    recommendationsService.recordProductView(product.id!, product.category, product.restaurantId);
    navigate(`/restaurant/${product.restaurantId}`);
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
                {discount > 0 && (
                  <div className="absolute top-2 left-2 bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm">
                    OFERTA IMPERDIBLE
                  </div>
                )}
                {(product.consultPrice || (!product.price && !product.promoPrice)) && (
                   <div className="absolute top-2 left-2 bg-slate-900 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm">
                     CONSULTAR
                   </div>
                )}
              </div>

              <div className="p-3 flex-1 flex flex-col">
                <h3 className="text-xs text-slate-700 font-medium line-clamp-2 leading-tight group-hover:text-primary transition-colors">
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
                        <span className="text-[10px] text-slate-400 line-through">
                          US$ {product.price.toFixed(2)}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-900 text-sm">
                          US$ {finalPrice.toFixed(2)}
                        </span>
                        {discount > 0 && (
                           <span className="text-[10px] text-emerald-500 font-medium">{discount}% OFF</span>
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

