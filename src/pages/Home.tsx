import { MapPin, ChevronDown, Bell, Search, SlidersHorizontal, Utensils, Star, Heart, Clock, Sandwich, Soup } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Restaurant } from '../lib/seed';

export default function Home() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState('Caracas, VE');

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  useEffect(() => {
    // Detect location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(coords);

          // Reverse geocoding (mock for now or use Google Maps API if available)
          try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=AIzaSyDDEpf7x5W24gRAI3HJ0PjZBzXBZcwV8gA`);
            const data = await response.json();
            if (data.results && data.results[0]) {
              const addressComponents = data.results[0].address_components;
              const city = addressComponents.find((c: any) => c.types.includes('locality'))?.long_name ||
                addressComponents.find((c: any) => c.types.includes('administrative_area_level_2'))?.long_name;
              const state = addressComponents.find((c: any) => c.types.includes('administrative_area_level_1'))?.short_name;
              if (city && state) setLocationName(`${city}, ${state}`);
            }
          } catch (error) {
            console.error("Geocoding error:", error);
          }
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  }, []);

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const q = query(collection(db, 'restaurants'), where('featured', '==', true));
        const querySnapshot = await getDocs(q);
        const fetchedRestaurants = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Restaurant[];

        // Sort by distance if user location is available
        if (userLocation) {
          const sorted = [...fetchedRestaurants].sort((a, b) => {
            const distA = a.locations?.reduce((min, loc) => {
              if (!loc.coords) return min;
              const d = calculateDistance(userLocation.lat, userLocation.lng, loc.coords.lat, loc.coords.lng);
              return Math.min(min, d);
            }, Infinity) || 999;

            const distB = b.locations?.reduce((min, loc) => {
              if (!loc.coords) return min;
              const d = calculateDistance(userLocation.lat, userLocation.lng, loc.coords.lat, loc.coords.lng);
              return Math.min(min, d);
            }, Infinity) || 999;

            return distA - distB;
          });

          // Update distance strings
          const withDistances = sorted.map(rest => {
            const minDistance = rest.locations?.reduce((min, loc) => {
              if (!loc.coords) return min;
              return Math.min(min, calculateDistance(userLocation.lat, userLocation.lng, loc.coords.lat, loc.coords.lng));
            }, Infinity);

            return {
              ...rest,
              distance: minDistance && minDistance !== Infinity
                ? minDistance < 1 ? `${(minDistance * 1000).toFixed(0)} m` : `${minDistance.toFixed(1)} km`
                : rest.distance
            };
          });

          setRestaurants(withDistances);
        } else {
          setRestaurants(fetchedRestaurants);
        }
      } catch (error) {
        console.error("Error fetching restaurants: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurants();
  }, [userLocation]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md px-5 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Ubicación actual</p>
              <div className="flex items-center gap-1 cursor-pointer group">
                <h2 className="text-slate-900 text-lg font-bold leading-tight group-hover:text-primary transition-colors">{locationName}</h2>
                <ChevronDown className="w-4 h-4 text-primary font-bold" />
              </div>
            </div>
          </div>
          <button className="relative p-2 text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
            <Bell className="w-6 h-6" />
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-accent border-2 border-white"></span>
          </button>
        </div>

        {/* Search Bar */}
        <Link to="/search" className="relative group block">
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
            <Search className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
          </div>
          <div className="flex w-full p-4 pl-12 text-sm text-slate-500 border border-slate-200 rounded-xl bg-slate-50 shadow-sm cursor-text">
            Buscar arepas, sushi, hamburguesas...
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <button className="p-2 text-slate-400 hover:text-primary transition-colors">
              <SlidersHorizontal className="w-5 h-5" />
            </button>
          </div>
        </Link>
      </header>

      {/* Categories */}
      <section className="mt-4 pl-5">
        <h2 className="text-slate-900 text-lg font-bold mb-4 flex items-center gap-2">
          ¿Qué se te antoja? <span className="text-xl">😋</span>
        </h2>
        <div className="flex gap-4 overflow-x-auto hide-scrollbar pr-5 pb-2">
          {/* Category 1 */}
          <Link to="/search" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-highlight/20 border-2 border-highlight/30 p-1 group-hover:scale-105 transition-transform duration-300 overflow-hidden relative">
              <div
                className="w-full h-full rounded-full bg-cover bg-center"
                style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=200&h=200&fit=crop')" }}
              ></div>
            </div>
            <span className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">Arepas</span>
          </Link>
          {/* Category 2 */}
          <Link to="/search" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-secondary/10 border-2 border-secondary/20 p-1 group-hover:scale-105 transition-transform duration-300 overflow-hidden relative">
              <div
                className="w-full h-full rounded-full bg-cover bg-center"
                style={{ backgroundImage: "url('https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=200&fit=crop')" }}
              ></div>
            </div>
            <span className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">Hamburguesas</span>
          </Link>
          {/* Category 3 */}
          <Link to="/search" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-blue-100 border-2 border-blue-200 p-1 group-hover:scale-105 transition-transform duration-300 overflow-hidden relative">
              <div
                className="w-full h-full rounded-full bg-cover bg-center"
                style={{ backgroundImage: "url('https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=200&h=200&fit=crop')" }}
              ></div>
            </div>
            <span className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">Sushi</span>
          </Link>
          {/* Category 4 */}
          <Link to="/search" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-slate-100 border-2 border-slate-200 p-1 group-hover:scale-105 transition-transform duration-300 overflow-hidden relative flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-slate-400">
                <Utensils className="w-6 h-6" />
              </div>
            </div>
            <span className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">Ver todo</span>
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

