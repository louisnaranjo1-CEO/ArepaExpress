import { Search as SearchIcon, SlidersHorizontal, MapPin, Star, Clock, Store, Zap, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Restaurant, Product } from '../lib/seed';
import { Link, useLocation } from 'react-router-dom';
import FilterModal, { FilterState } from '../components/FilterModal';
import { vibrate } from '../utils/haptics';
import { isDemoMode } from '../lib/env';
import { DEMO_RESTAURANTS } from '../lib/demoData';
import { calculateDistance, formatDistance } from '../lib/geo';

export interface Category {
    id: string;
    name: string;
    icon?: string;
    imageUrl?: string;
    isFeatured?: boolean;
    clickCount?: number;
    isActive: boolean;
    parentId?: string;
}

export default function Search() {
    const [query, setQuery] = useState('');
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [casheaIcon, setCasheaIcon] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [manualCity] = useState<string>(() => localStorage.getItem('userCity') || '');

    const location = useLocation();
    const [isFilterOpen, setIsFilterOpen] = useState(location.state?.openFilters || false);
    const [filters, setFilters] = useState<FilterState>({
        category: null,
        sector: null,
        minPrice: '',
        maxPrice: '',
        onlyPromotions: false
    });

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const { data, error } = await supabase.from('global_categories').select('*');
                if (error) throw error;
                const fetchedCategories = (data || []).map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    icon: c.icon,
                    imageUrl: c.image_url || c.imageUrl,
                    isFeatured: c.is_featured ?? c.isFeatured,
                    isActive: c.is_active ?? c.isActive ?? true,
                    parentId: c.parent_id || c.parentId
                })) as Category[];
                setCategories(fetchedCategories.filter(c => c.isActive));
            } catch (error) {
                console.error("Error fetching categories:", error);
            }
        };

        const fetchRestaurants = async () => {
            try {
                if (isDemoMode()) {
                    setRestaurants([...DEMO_RESTAURANTS]);
                    setLoading(false);
                    return;
                }
                const { data: restsData, error: restsErr } = await supabase.from('comercios').select('*');
                if (restsErr) throw restsErr;

                const { data: prodsData } = await supabase.from('products').select('*');

                const fetched: Restaurant[] = (restsData || []).map((r: any) => {
                    const resProds = (prodsData || [])
                        .filter((p: any) => p.restaurant_id === r.id || p.comercio_id === r.id || p.comercioId === r.id)
                        .map((p: any) => ({
                            id: p.id,
                            name: p.name,
                            description: p.description,
                            price: Number(p.price || 0),
                            pointsPrice: p.points_price ?? p.pointsPrice,
                            image: p.image || p.image_url || p.imageUrl,
                            category: p.category,
                            popular: p.popular,
                            promoPrice: p.promo_price ?? p.promoPrice,
                            isAvailable: p.is_available ?? p.isAvailable ?? true
                        }));

                    const isVisible = (r.is_visible === true || r.isVisible === true);
                    const isActive = (r.is_active !== false && r.isActive !== false);
                    const isVerified = (r.is_verified === true || r.isVerified === true || r.verification_status === 'verified');

                    return {
                        ...r,
                        id: r.id,
                        name: r.name,
                        category: r.category,
                        businessType: r.business_type || r.businessType,
                        rating: r.rating || 5.0,
                        reviews: r.reviews || 0,
                        deliveryTime: r.delivery_time || r.deliveryTime || '30 min',
                        distance: r.distance || '1.0 km',
                        image: r.image || r.logo_url || r.logoUrl,
                        logoUrl: r.logo_url || r.logoUrl,
                        coverUrl: r.cover_url || r.coverUrl,
                        hasCashea: r.has_cashea ?? r.hasCashea,
                        hasTwoByThree: r.has_two_by_three ?? r.hasTwoByThree,
                        isActive,
                        is_active: isActive,
                        isVisible,
                        is_visible: isVisible,
                        isVerified,
                        is_verified: isVerified,
                        location: r.location,
                        products: resProds
                    } as Restaurant;
                });

                const fetchedResults = fetched.filter(r => 
                    r.isActive && r.isVisible
                );
                const shuffled = fetchedResults.sort(() => Math.random() - 0.5);
                setRestaurants(shuffled);
            } catch (error) {
                console.error("Error fetching restaurants:", error);
            } finally {
                setLoading(false);
            }
        };

        const fetchCasheaIcon = async () => {
            try {
                const { data: icons } = await supabase.from('global_icons').select('*');
                const cashea = (icons || []).find((icon: any) => icon.name?.toLowerCase() === 'cashea');

                if (cashea) {
                    setCasheaIcon(cashea.image_url || cashea.imageUrl || cashea.url);
                } else {
                    setCasheaIcon("https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/logo_cashea.png");
                }
            } catch (err) {
                console.error("Error fetching cashea icon:", err);
            }
        };
        fetchCasheaIcon();

        fetchCategories();
        fetchRestaurants();

        // Realtime subscription on 'comercios' table: sync store changes instantly
        const comerciosChannel = supabase
            .channel('client-search-comercios-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'comercios' },
                () => {
                    fetchRestaurants();
                }
            )
            .subscribe();

        const handleFocus = () => {
            if (document.visibilityState === 'visible') {
                fetchRestaurants();
            }
        };
        window.addEventListener('visibilitychange', handleFocus);
        window.addEventListener('focus', handleFocus);

        // Handle incoming category/sector from location state
        if (location.state?.category) {
            setSelectedCategory(location.state.category);
        }
        if (location.state?.sector) {
            setFilters(prev => ({ ...prev, sector: location.state.sector }));
        }

        return () => {
            supabase.removeChannel(comerciosChannel);
            window.removeEventListener('visibilitychange', handleFocus);
            window.removeEventListener('focus', handleFocus);
        };
    }, [location.state]);

    const matchingProducts = useMemo(() => {
        if (!query || query.length < 2) return [];
        const allProducts: (Product & { restaurantId: string, restaurantName: string })[] = [];
        const normalizeLoc = (str?: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';
        const normManualCity = normalizeLoc(manualCity);

        restaurants.forEach(res => {
            // Check if restaurant is in user's zone
            const c = normalizeLoc(res.location?.city || (res as any).city);
            const s = normalizeLoc(res.location?.state || (res as any).state);
            const a = normalizeLoc(res.location?.address || (res as any).address);
            const jsonStr = normalizeLoc(JSON.stringify(res));

            const isRestaurantInZone = !manualCity || 
                c === normManualCity || 
                c.includes(normManualCity) || 
                a.includes(normManualCity) || 
                s.includes(normManualCity) || 
                jsonStr.includes(normManualCity);

            if (isRestaurantInZone && res.products) {
                res.products.forEach(p => {
                    const matchesName = p.name.toLowerCase().includes(query.toLowerCase());
                    const matchesDesc = p.description?.toLowerCase().includes(query.toLowerCase());
                    const matchesCat = p.category?.toLowerCase().includes(query.toLowerCase());
                    
                    if (matchesName || matchesDesc || matchesCat) {
                        allProducts.push({
                            ...p,
                            restaurantId: res.id || '',
                            restaurantName: res.name
                        });
                    }
                });
            }
        });
        return allProducts;
    }, [restaurants, query]);

    const filteredRestaurants = useMemo(() => {
        return restaurants.filter(res => {
            // Search query
            const matchesResName = res.name.toLowerCase().includes(query.toLowerCase());
            const matchesResCat = res.category.toLowerCase().includes(query.toLowerCase());
            const matchesProducts = res.products?.some(p => 
                p.name.toLowerCase().includes(query.toLowerCase()) || 
                p.description?.toLowerCase().includes(query.toLowerCase())
            );

            const matchesQuery = query === '' || matchesResName || matchesResCat || matchesProducts;

            // Category filter
            const activeCategory = filters.category || selectedCategory;
            const matchesCategory = !activeCategory || res.category === activeCategory || (res as any).subCategoryId === activeCategory;

            // Sector filter
            const matchesSector = !filters.sector || (res as any).sector === filters.sector || (res as any).categoryId === filters.sector;

            // Price Range Filter
            let matchesPrice = true;
            if (filters.minPrice !== '' || filters.maxPrice !== '') {
                matchesPrice = false;
                if (res.products && res.products.length > 0) {
                    const minP = filters.minPrice !== '' ? filters.minPrice : 0;
                    const maxP = filters.maxPrice !== '' ? filters.maxPrice : Infinity;
                    matchesPrice = res.products.some((p) => {
                        const price = p.promoPrice && p.promoPrice > 0 ? p.promoPrice : p.price;
                        return price >= minP && price <= maxP;
                    });
                }
            }

            // Promotions Filter
            let matchesPromotions = true;
            if (filters.onlyPromotions) {
                matchesPromotions = false;
                if (res.products && res.products.length > 0) {
                    matchesPromotions = res.products.some((p) => p.promoPrice && p.promoPrice > 0);
                }
            }

            // City Filter
            const normalizeLoc = (str?: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';
            const normManualCity = normalizeLoc(manualCity);
            const matchesCity = isDemoMode() || !manualCity || (() => {
                const c = normalizeLoc(res.location?.city || (res as any).city);
                const s = normalizeLoc(res.location?.state || (res as any).state);
                const a = normalizeLoc(res.location?.address || (res as any).address);
                if (c === normManualCity || c.includes(normManualCity) || a.includes(normManualCity) || s.includes(normManualCity)) return true;

                const jsonStr = normalizeLoc(JSON.stringify(res));
                if (jsonStr.includes(normManualCity)) return true;

                return false;
            })();

            return matchesQuery && matchesCategory && matchesSector && matchesPrice && matchesPromotions && matchesCity;
        });
    }, [restaurants, query, selectedCategory, filters, manualCity]);

    return (
        <div className="pb-24 animate-in fade-in duration-500 min-h-screen bg-slate-50">
            <div className="sticky top-0 z-40 bg-primary px-6 pt-12 pb-6 space-y-4 shadow-sm">
                <h1 className="text-3xl font-black text-slate-900">¿Qué buscamos? 🧐</h1>
                <div className="flex gap-2">
                    <div className="relative flex-1 group">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
                        <input
                            type="text"
                            placeholder="Restaurant, plato o categoría..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full bg-slate-100 border-none rounded-2xl py-4 pl-12 pr-4 font-medium focus:ring-2 focus:ring-primary focus:bg-white transition-all shadow-inner outline-none"
                        />
                    </div>

                    <button
                        onClick={() => setIsFilterOpen(true)}
                        className={`p-4 rounded-2xl flex items-center justify-center transition-all ${(filters.category || filters.sector || filters.minPrice !== '' || filters.maxPrice !== '' || filters.onlyPromotions)
                            ? 'bg-primary text-slate-900 shadow-md shadow-primary/30'
                            : 'bg-white text-slate-500 shadow-sm border border-slate-100 hover:bg-slate-50'
                            }`}
                    >
                        <SlidersHorizontal className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="px-6 py-6 space-y-8">

                {/* Products Results */}
                {matchingProducts.length > 0 && (
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                <Zap className="w-5 h-5 text-amber-500" />
                                Productos recomendados
                            </h2>
                            <span className="text-slate-900 text-xs font-bold bg-amber-100 px-3 py-1 rounded-full">
                                {matchingProducts.length} coincidencia{matchingProducts.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar -mx-6 px-6">
                            {matchingProducts.map((product, idx) => (
                                <Link 
                                    to={`/restaurant/${product.restaurantId}`} 
                                    key={`${product.restaurantId}-${idx}`}
                                    onClick={() => vibrate(30)}
                                    className="min-w-[200px] w-[200px] bg-white rounded-3xl overflow-hidden shadow-md border border-slate-100 flex flex-col hover:scale-105 transition-transform"
                                >
                                    <div className="h-32 bg-slate-100 relative">
                                        {product.image ? (
                                            <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center opacity-30">
                                                <Store className="w-8 h-8" />
                                            </div>
                                        )}
                                        {product.promoPrice && product.promoPrice > 0 && (
                                            <div className="absolute top-2 left-2 bg-rose-500 text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase">
                                                Oferta
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 space-y-1">
                                        <h4 className="text-sm font-black text-slate-900 line-clamp-1">{product.name}</h4>
                                        <p className="text-[10px] font-bold text-slate-400 line-clamp-2 leading-tight">
                                            {product.description}
                                        </p>
                                        <div className="flex items-center justify-between pt-1">
                                            <span className="text-sm font-black text-slate-900">${product.promoPrice || product.price}</span>
                                            <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-full line-clamp-1 max-w-[80px]">
                                                {product.restaurantName}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black text-slate-800">
                            {query || selectedCategory || filters.sector ? 'Locales encontrados' : 'Explorar locales'}
                        </h2>
                        <div className="flex items-center gap-2">
                            {filteredRestaurants.length > 0 && (
                                <span className="text-slate-900 text-sm font-bold bg-primary/10 px-3 py-1 rounded-full">
                                    {filteredRestaurants.length} local{filteredRestaurants.length !== 1 ? 'es' : ''}
                                </span>
                            )}
                            {filters.sector && (
                                <button
                                    onClick={() => setFilters(prev => ({ ...prev, sector: null, category: null }))}
                                    className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-full border border-rose-100"
                                >
                                    Limpiar Sector
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        {loading ? (
                            Array(3).fill(0).map((_, i) => (
                                <div key={i} className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-slate-100 animate-pulse">
                                    <div className="h-48 bg-slate-200"></div>
                                    <div className="p-6 space-y-3">
                                        <div className="h-6 bg-slate-200 rounded-lg w-2/3"></div>
                                        <div className="h-4 bg-slate-200 rounded-lg w-1/2"></div>
                                    </div>
                                </div>
                            ))
                        ) : filteredRestaurants.length > 0 ? (
                            filteredRestaurants.map((res) => {
                                const coverImg = (res as any).coverUrl || (res as any).cover_url || '';
                                const logoImg = (res as any).logoUrl || (res as any).logo_url || res.image || '';

                                const distStr = (() => {
                                    const latStr = localStorage.getItem('userLat');
                                    const lngStr = localStorage.getItem('userLng');
                                    if (latStr && lngStr && res.location?.coords) {
                                        const d = calculateDistance(parseFloat(latStr), parseFloat(lngStr), res.location.coords.lat, res.location.coords.lng);
                                        return formatDistance(d);
                                    }
                                    return res.distance && res.distance !== 'Distancia desconocida' ? res.distance : 'Cerca de ti';
                                })();

                                return (
                                    <Link to={`/restaurant/${res.id}`} key={res.id} onClick={() => vibrate(30)} className="block group relative bg-white rounded-[32px] overflow-hidden shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer">
                                        <div className="relative h-48 overflow-hidden bg-slate-900">
                                            {coverImg ? (
                                                <img src={coverImg} alt={res.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 flex flex-col items-center justify-center text-slate-400 p-4">
                                                    <Store className="w-12 h-12 mb-2 text-white/30" />
                                                    <span className="text-xs font-black uppercase tracking-widest text-white/50">{res.name}</span>
                                                </div>
                                            )}
                                            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-1 shadow-sm border border-white/50">
                                                <Star className="w-4 h-4 text-amber-700 fill-yellow-500" />
                                                <span className="text-xs font-black text-slate-800">{res.rating}</span>
                                                <span className="text-[10px] text-slate-400 font-bold">({res.reviews}+)</span>
                                            </div>

                                            {(res as any).hasCashea && (
                                                <div className="absolute top-4 right-4 z-20 w-10 h-10 bg-yellow-400 backdrop-blur rounded-xl p-1.5 shadow-xl border border-white/20 flex items-center justify-center animate-in zoom-in duration-500 hover:scale-110 transition-transform">
                                                    <img
                                                        src={casheaIcon || "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/logo_cashea.png"}
                                                        alt="Cashea"
                                                        className="w-full h-full object-contain"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-6 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 bg-slate-50 flex items-center justify-center">
                                                {logoImg ? (
                                                    <img src={logoImg} alt="" className="w-full h-full object-cover rounded-full" />
                                                ) : (
                                                    <Store className="w-6 h-6 text-slate-300" />
                                                )}
                                            </div>
                                            <div className="space-y-0.5">
                                                <h3 className="text-lg font-black text-slate-900 group-hover:text-slate-900 transition-colors leading-tight">{res.name}</h3>
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                                    <span>{res.category}</span>
                                                    <span>•</span>
                                                    <div className="flex items-center gap-1 text-slate-900">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{res.deliveryTime}</span>
                                                    </div>
                                                    <span>•</span>
                                                    <div className="flex items-center gap-1 text-blue-500">
                                                        <MapPin className="w-3 h-3" />
                                                        <span>{distStr}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })

                        ) : (
                            <div className="text-center py-12 text-slate-500 font-medium">
                                No se encontraron resultados.
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <FilterModal
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                onApply={(newFilters) => setFilters(newFilters)}
                initialFilters={filters}
                categories={categories}
            />
        </div>
    );
}
