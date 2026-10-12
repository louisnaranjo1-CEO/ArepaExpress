import { Search as SearchIcon, SlidersHorizontal, MapPin, Star, Clock, Store, Zap, X, LayoutGrid, Grid2X2, List, ChevronRight } from 'lucide-react';
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

    const [viewMode, setViewMode] = useState<'grid-large' | 'grid-small' | 'list'>(() => {
        try {
            return (localStorage.getItem('un2x3_store_view_mode') as any) || 'grid-large';
        } catch {
            return 'grid-large';
        }
    });

    const handleSelectViewMode = (mode: 'grid-large' | 'grid-small' | 'list') => {
        vibrate(25);
        setViewMode(mode);
        try {
            localStorage.setItem('un2x3_store_view_mode', mode);
        } catch {}
    };

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

                let fetchedResults = fetched.filter(r => 
                    r.isActive && r.isVisible
                );

                if (manualCity) {
                    const normalizeLoc = (str?: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : '';
                    const mCity = normalizeLoc(manualCity);
                    fetchedResults = fetchedResults.filter(rest => {
                        const c = normalizeLoc(rest.location?.city || (rest as any).city);
                        if (c && (c === mCity || c.includes(mCity) || mCity.includes(c))) return true;
                        if (Array.isArray((rest as any).locations)) {
                            return (rest as any).locations.some((loc: any) => {
                                const locCity = normalizeLoc(loc.city);
                                return locCity && (locCity === mCity || locCity.includes(mCity) || mCity.includes(locCity));
                            });
                        }
                        return false;
                    });
                }

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
                    setCasheaIcon("https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/OIP%20(4).webp");
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
        <div className="w-full h-full overflow-y-auto overflow-x-hidden pb-32 overscroll-contain bg-slate-50 animate-in fade-in duration-500">
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
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-black text-slate-800">
                                {query || selectedCategory || filters.sector ? 'Locales encontrados' : 'Explorar locales'}
                            </h2>
                            {filteredRestaurants.length > 0 && (
                                <span className="text-slate-900 text-xs font-black bg-primary/10 px-2.5 py-0.5 rounded-full">
                                    {filteredRestaurants.length}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Selector de Modos de Visualización (Audio / Requerimiento: Grande, Pequeña 6 en pantalla, Lista) */}
                            <div className="bg-slate-200/80 p-1 rounded-2xl flex items-center gap-1 border border-slate-300/60 shadow-inner">
                                <button
                                    type="button"
                                    onClick={() => handleSelectViewMode('grid-large')}
                                    className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${viewMode === 'grid-large' ? 'bg-white text-slate-950 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'}`}
                                    title="Cuadrículas Grandes"
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSelectViewMode('grid-small')}
                                    className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${viewMode === 'grid-small' ? 'bg-white text-slate-950 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'}`}
                                    title="Cuadrículas Pequeñas (6 en pantalla)"
                                >
                                    <Grid2X2 className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSelectViewMode('list')}
                                    className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${viewMode === 'list' ? 'bg-white text-slate-950 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800'}`}
                                    title="Modo Lista (Compacto con logo pequeño)"
                                >
                                    <List className="w-4 h-4" />
                                </button>
                            </div>

                            {filters.sector && (
                                <button
                                    onClick={() => setFilters(prev => ({ ...prev, sector: null, category: null }))}
                                    className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-100"
                                >
                                    Limpiar Sector
                                </button>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className={viewMode === 'grid-small' ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3" : viewMode === 'list' ? "space-y-2" : "space-y-6"}>
                            {Array(6).fill(0).map((_, i) => (
                                <div key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 animate-pulse flex items-center gap-3">
                                    <div className="w-12 h-12 bg-slate-200 rounded-xl shrink-0"></div>
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredRestaurants.length > 0 ? (
                        <>
                            {/* MODO 1: Cuadrícula Grande (Full-width hero cards) */}
                            {viewMode === 'grid-large' && (
                                <div className="space-y-6">
                                    {filteredRestaurants.map((res) => {
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
                                                                src={casheaIcon || "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/OIP%20(4).webp"}
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
                                                    <div className="space-y-0.5 min-w-0 flex-1">
                                                        <h3 className="text-lg font-black text-slate-900 group-hover:text-primary transition-colors leading-tight truncate">{res.name}</h3>
                                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter flex-wrap">
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
                                    })}
                                </div>
                            )}

                            {/* MODO 2: Cuadrícula Pequeña (Compact 2/3 columnas donde quepan 6 negocios en pantalla) */}
                            {viewMode === 'grid-small' && (
                                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                                    {filteredRestaurants.map((res) => {
                                        const coverImg = (res as any).coverUrl || (res as any).cover_url || '';
                                        const logoImg = (res as any).logoUrl || (res as any).logo_url || res.image || '';

                                        const distStr = (() => {
                                            const latStr = localStorage.getItem('userLat');
                                            const lngStr = localStorage.getItem('userLng');
                                            if (latStr && lngStr && res.location?.coords) {
                                                const d = calculateDistance(parseFloat(latStr), parseFloat(lngStr), res.location.coords.lat, res.location.coords.lng);
                                                return formatDistance(d);
                                            }
                                            return res.distance && res.distance !== 'Distancia desconocida' ? res.distance : 'Cerca';
                                        })();

                                        return (
                                            <Link 
                                                to={`/restaurant/${res.id}`} 
                                                key={res.id} 
                                                onClick={() => vibrate(25)}
                                                className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md border border-slate-100 flex flex-col active:scale-95 transition-all cursor-pointer"
                                            >
                                                <div className="relative h-24 bg-slate-900 overflow-hidden">
                                                    {coverImg ? (
                                                        <img src={coverImg} alt={res.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                    ) : (
                                                        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-indigo-950 flex items-center justify-center p-2 text-white/40">
                                                            <Store className="w-8 h-8" />
                                                        </div>
                                                    )}
                                                    {/* Rating badge */}
                                                    <div className="absolute top-1.5 left-1.5 bg-white/95 backdrop-blur px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-xs">
                                                        <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                                                        <span className="text-[10px] font-black text-slate-800">{res.rating}</span>
                                                    </div>

                                                    {(res as any).hasCashea && (
                                                        <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-yellow-400 rounded-lg p-0.5 shadow-sm flex items-center justify-center">
                                                            <img
                                                                src={casheaIcon || "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/OIP%20(4).webp"}
                                                                alt="Cashea"
                                                                className="w-full h-full object-contain"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Mini Logo superpuesto */}
                                                    <div className="absolute -bottom-2.5 left-2 w-7 h-7 rounded-lg border-2 border-white shadow-sm overflow-hidden bg-white shrink-0">
                                                        {logoImg ? (
                                                            <img src={logoImg} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Store className="w-4 h-4 text-slate-400 p-0.5" />
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="p-2 pt-3.5 space-y-0.5 flex-1 flex flex-col justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-black text-slate-900 truncate leading-snug group-hover:text-primary transition-colors">
                                                            {res.name}
                                                        </h4>
                                                        <p className="text-[9px] font-bold text-slate-400 truncate mt-0.5">
                                                            <span>{res.category}</span> • <span className="text-blue-500">{distStr}</span>
                                                        </p>
                                                    </div>
                                                    <div className="pt-1 flex items-center justify-between text-[9px] font-bold text-slate-500 border-t border-slate-50">
                                                        <span className="flex items-center gap-0.5">
                                                            <Clock className="w-2.5 h-2.5" /> {res.deliveryTime}
                                                        </span>
                                                        <span className="text-slate-400 font-medium">({res.reviews}+)</span>
                                                    </div>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}

                            {/* MODO 3: Modo Lista (Solamente el logo pequeño y el nombre, ubicación y calificación) */}
                            {viewMode === 'list' && (
                                <div className="divide-y divide-slate-100 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                                    {filteredRestaurants.map((res) => {
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
                                            <Link 
                                                to={`/restaurant/${res.id}`} 
                                                key={res.id} 
                                                onClick={() => vibrate(20)}
                                                className="flex items-center gap-3 p-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer group"
                                            >
                                                {/* Logo Pequeño del Negocio */}
                                                <div className="w-12 h-12 rounded-2xl border border-slate-100 shadow-xs overflow-hidden shrink-0 bg-slate-50 flex items-center justify-center">
                                                    {logoImg ? (
                                                        <img src={logoImg} alt={res.name} className="w-full h-full object-cover rounded-2xl" />
                                                    ) : (
                                                        <Store className="w-6 h-6 text-slate-300" />
                                                    )}
                                                </div>

                                                {/* Nombre del Negocio y Ubicación */}
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-black text-slate-900 group-hover:text-primary transition-colors truncate">
                                                        {res.name}
                                                    </h4>
                                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 mt-0.5 truncate">
                                                        <span>{res.category}</span>
                                                        <span>•</span>
                                                        <span className="text-blue-600 flex items-center gap-0.5">
                                                            <MapPin className="w-3 h-3 text-blue-500" />
                                                            {distStr}
                                                        </span>
                                                        <span>•</span>
                                                        <span className="text-slate-500 flex items-center gap-0.5">
                                                            <Clock className="w-3 h-3" />
                                                            {res.deliveryTime}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Calificación & Chevron */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <div className="flex items-center gap-1 bg-amber-50 text-amber-800 px-2.5 py-1 rounded-xl text-xs font-black border border-amber-200/50">
                                                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                                        <span>{res.rating}</span>
                                                    </div>
                                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-12 text-slate-500 font-medium">
                            No se encontraron resultados.
                        </div>
                    )}
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
