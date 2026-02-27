import { MapPin, ChevronDown, Bell, Search, SlidersHorizontal, Utensils, Star, Heart, Clock, Sandwich, Soup } from 'lucide-react';
import arepaImg from '../assets/categories/arepa.png';
import burgerImg from '../assets/categories/burger.png';
import sushiImg from '../assets/categories/sushi.png';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Restaurant } from '../lib/seed';
import { useAuth } from '../context/AuthContext';
import { calculateDistance, formatDistance } from '../lib/geo';
import CitySelectorModal from '../components/CitySelectorModal';

export default function Home() {
  const { userData } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [manualState, setManualState] = useState<string>(() => localStorage.getItem('userState') || '');
  const [manualCity, setManualCity] = useState<string>(() => localStorage.getItem('userCity') || '');
  const [locationName, setLocationName] = useState(() => {
    return localStorage.getItem('userCity') ? `${localStorage.getItem('userCity')}` : 'Buscando...';
  });
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);


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
              if (city && state) setLocationName(`${city}`);
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
    const fetchRestaurants = async () => {
      try {
        const q = query(collection(db, 'restaurants'), where('featured', '==', true));
        const querySnapshot = await getDocs(q);
        const fetchedRestaurants = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Restaurant[];

        // Update distance strings and compute sorting weights
        const processed = fetchedRestaurants.map(rest => {
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
          if (manualCity && rest.location?.city === manualCity) {
            cityMatchScore = -10000; // Prioritize manual city match over anything else
          }

          return {
            ...rest,
            distance: dist !== 999 ? formatDistance(dist) : 'Distancia desconocida',
            _rawDistance: dist,
            _sortScore: cityMatchScore + dist // Combine city score and real distance 
          };
        });

        // Sort by computed score (city match first, then distance)
        const sorted = processed.sort((a, b) => (a._sortScore as number) - (b._sortScore as number));
        setRestaurants(sorted);

      } catch (error) {
        console.error("Error fetching restaurants: ", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchBanners = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'banners'));
        const fetchedBanners = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBanners(fetchedBanners.filter((b: any) => b.isActive));
      } catch (error) {
        console.error("Error fetching banners: ", error);
      }
    };

    fetchBanners();
    fetchRestaurants();
  }, [userLocation, manualCity]);

  const handleCitySelect = (state: string, city: string) => {
    localStorage.setItem('userState', state);
    localStorage.setItem('userCity', city);
    setManualState(state);
    setManualCity(city);
    setLocationName(`${city}`);
    // Clear GPS coordinates so distance doesn't mess up sorting if user is physically far away
    setUserLocation(null);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md px-5 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
              <MapPin className="w-6 h-6" />
            </div>
            <div onClick={() => setIsCityModalOpen(true)} className="cursor-pointer group overflow-hidden">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Ubicación actual</p>
              <div className="flex items-center gap-1 group">
                <h2 className="text-slate-900 text-base font-black leading-tight group-hover:text-primary transition-colors truncate max-w-[150px]">{locationName}</h2>
                <ChevronDown className="w-3.5 h-3.5 text-primary font-bold transition-transform group-hover:translate-y-0.5 shrink-0" />
              </div>
            </div>
          </div>
          <Link to="/notifications" className="relative p-2 text-slate-900 hover:bg-slate-100 rounded-full transition-colors shrink-0">
            <Bell className="w-6 h-6" />
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-accent border-2 border-white"></span>
          </Link>
        </div>

        {/* Search Bar */}
        <div className="relative group block">
          <Link to="/search" className="block">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Search className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
            </div>
            <div className="flex w-full p-4 pl-12 pr-12 text-sm text-slate-500 border border-slate-200 rounded-xl bg-slate-50 shadow-sm cursor-text hover:border-primary/30 transition-colors">
              Buscar arepas, sushi, hamburguesas...
            </div>
          </Link>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <Link to="/search" state={{ openFilters: true }} className="p-2 text-slate-400 hover:text-primary transition-colors rounded-full hover:bg-slate-100">
              <SlidersHorizontal className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      <CitySelectorModal
        isOpen={isCityModalOpen}
        onClose={() => setIsCityModalOpen(false)}
        onSelect={handleCitySelect}
        initialState={manualState}
        initialCity={manualCity}
      />

      {/* Promotional Banners */}
      {banners.length > 0 && (
        <section className="mt-4 px-5">
          <div className="flex gap-4 overflow-x-auto hide-scrollbar snap-x snap-mandatory">
            {banners.map((banner) => (
              <a
                key={banner.id}
                href={banner.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-none w-[85vw] max-w-[400px] aspect-[21/9] rounded-2xl overflow-hidden snap-center relative"
              >
                <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Categories */}
      <section className="mt-4 pl-5">
        <h2 className="text-slate-900 text-lg font-bold mb-4 flex items-center gap-2">
          ¿Qué se te antoja? <span className="text-xl">😋</span>
        </h2>
        <div className="flex gap-4 overflow-x-auto hide-scrollbar pr-5 pb-2">
          {/* Category 1 */}
          <Link to="/search" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-orange-50 border-2 border-orange-100 p-2 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
              <img src={arepaImg} alt="Arepas" className="w-full h-full object-contain" />
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider group-hover:text-primary transition-colors">Arepas</span>
          </Link>
          {/* Category 2 */}
          <Link to="/search" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-red-50 border-2 border-red-100 p-2 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
              <img src={burgerImg} alt="Burgers" className="w-full h-full object-contain" />
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider group-hover:text-primary transition-colors">Burgers</span>
          </Link>
          {/* Category 3 */}
          <Link to="/search" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-pink-50 border-2 border-pink-100 p-2 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
              <img src={sushiImg} alt="Sushi" className="w-full h-full object-contain" />
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider group-hover:text-primary transition-colors">Sushi</span>
          </Link>
          {/* Category 4 */}
          <Link to="/search" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-slate-50 border-2 border-slate-100 p-1 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-slate-400">
                <Utensils className="w-6 h-6" />
              </div>
            </div>
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider group-hover:text-primary transition-colors">Ver todo</span>
          </Link>
        </div>
      </section>

      {/* Main Content: Restaurants */}
      <main className="flex-1 px-5 pt-6 pb-24">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-slate-900 text-xl font-bold">Destacados</h2>
          <Link to="/search" className="text-primary text-sm font-semibold hover:underline">Ver todos</Link>
        </div>

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
            restaurants.map((restaurant) => (
              <Link key={restaurant.id} to={`/restaurant/${restaurant.id}`} className="group relative flex flex-col gap-3">
                <div className="relative w-full aspect-[16/10] overflow-hidden rounded-xl shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
                  <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                    <Star className="w-4 h-4 text-highlight fill-highlight" />
                    <span className="text-xs font-bold text-slate-900">{restaurant.rating}</span>
                    <span className="text-[10px] text-slate-500">({restaurant.reviews}+)</span>
                  </div>
                  <div className="absolute top-3 right-3 z-20 bg-white p-1.5 rounded-full shadow-sm cursor-pointer hover:scale-110 transition-transform">
                    <Heart className={`w-5 h-5 transition-colors ${false ? 'text-accent fill-accent' : 'text-slate-400 hover:text-accent hover:fill-accent'}`} />
                  </div>
                  <div
                    className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500 ease-out"
                    style={{ backgroundImage: `url('${restaurant.image}?q=80&w=800&auto=format&fit=crop')` }}
                  ></div>
                  <div className="absolute bottom-3 left-3 z-20 flex gap-2">
                    {restaurant.featured && (
                      <span className="bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-lg">Destacado</span>
                    )}
                    <span className="bg-white/90 backdrop-blur-md text-slate-900 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {restaurant.deliveryTime}
                    </span>
                  </div>
                </div>
                <div className="px-1">
                  <h3 className="text-lg font-bold text-slate-900 leading-tight mb-1">{restaurant.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    {restaurant.category.includes('Arepa') || restaurant.category.includes('Venezolana') ? (
                      <Sandwich className="w-4 h-4 text-primary" />
                    ) : restaurant.category.includes('Sushi') ? (
                      <Soup className="w-4 h-4 text-primary" />
                    ) : (
                      <Utensils className="w-4 h-4 text-primary" />
                    )}
                    <span>{restaurant.category}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span>$$</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span>{restaurant.distance}</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="text-center py-12 text-slate-500">
              No hay restaurantes disponibles en este momento.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

