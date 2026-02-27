import { Search as SearchIcon, SlidersHorizontal, MapPin, Star, Clock, Store } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Restaurant, Product } from '../lib/seed';
import { Link, useLocation } from 'react-router-dom';
import FilterModal, { FilterState } from '../components/FilterModal';

import arepaImg from '../assets/categories/arepa.png';
import burgerImg from '../assets/categories/burger.png';
import sushiImg from '../assets/categories/sushi.png';
import pizzaImg from '../assets/categories/pizza.png';
import chinoImg from '../assets/categories/chino.png';
import postresImg from '../assets/categories/postres.png';

export const CATEGORIES = [
    { id: 'arepas', name: 'Comida Venezolana', image: arepaImg, color: 'bg-orange-50 text-orange-600', shortName: 'Arepas' },
    { id: 'burgers', name: 'Hamburguesas', image: burgerImg, color: 'bg-red-50 text-red-600', shortName: 'Burgers' },
    { id: 'sushi', name: 'Sushi', image: sushiImg, color: 'bg-pink-50 text-pink-600', shortName: 'Sushi' },
    { id: 'pizza', name: 'Pizza', image: pizzaImg, color: 'bg-yellow-50 text-yellow-600', shortName: 'Pizza' },
    { id: 'chinesse', name: 'Chino', image: chinoImg, color: 'bg-blue-50 text-blue-600', shortName: 'Chino' },
    { id: 'desserts', name: 'Postres', image: postresImg, color: 'bg-purple-50 text-purple-600', shortName: 'Postres' },
];

export default function Search() {
    const [query, setQuery] = useState('');
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const location = useLocation();
    const [isFilterOpen, setIsFilterOpen] = useState(location.state?.openFilters || false);
    const [filters, setFilters] = useState<FilterState>({
        category: null,
        minPrice: '',
        maxPrice: '',
        onlyPromotions: false
    });

    useEffect(() => {
        const fetchRestaurants = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, 'restaurants'));
                const fetched = await Promise.all(querySnapshot.docs.map(async (docSnap) => {
                    const data = docSnap.data();

                    // Fetch products to support filtering by price/promotions
                    const productsSnapshot = await getDocs(collection(db, 'restaurants', docSnap.id, 'products'));
                    const products = productsSnapshot.docs.map(p => p.data() as Product);

                    return {
                        id: docSnap.id,
                        ...data,
                        products
                    } as Restaurant;
                }));
                setRestaurants(fetched);
            } catch (error) {
                console.error("Error fetching restaurants:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRestaurants();
    }, []);

    const filteredRestaurants = useMemo(() => {
        return restaurants.filter(res => {
            // Search query
            const matchesQuery = query === '' ||
                res.name.toLowerCase().includes(query.toLowerCase()) ||
                res.category.toLowerCase().includes(query.toLowerCase());

            // Category filter (combined from quick tags or modal)
            const activeCategory = filters.category || selectedCategory;
            const matchesCategory = !activeCategory || res.category === activeCategory;

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

            return matchesQuery && matchesCategory && matchesPrice && matchesPromotions;
        });
    }, [restaurants, query, selectedCategory, filters]);

    return (
        <div className="pb-24 animate-in fade-in duration-500 min-h-screen bg-slate-50">
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md px-6 pt-12 pb-6 space-y-4 shadow-sm">
                <h1 className="text-3xl font-black text-slate-900">¿Qué buscamos? 🧐</h1>
                <div className="flex gap-2">
                    <div className="relative flex-1 group">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Restaurant, plato o categoría..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full bg-slate-100 border-none rounded-2xl py-4 pl-12 pr-4 font-medium focus:ring-2 focus:ring-primary focus:bg-white transition-all shadow-inner outline-none"
                        />
                    </div>

                    {/* Filter Trigger Button */}
                    <button
                        onClick={() => setIsFilterOpen(true)}
                        className={`p-4 rounded-2xl flex items-center justify-center transition-all ${(filters.category || filters.minPrice !== '' || filters.maxPrice !== '' || filters.onlyPromotions)
                            ? 'bg-primary text-white shadow-md shadow-primary/30'
                            : 'bg-white text-slate-500 shadow-sm border border-slate-100 hover:bg-slate-50'
                            }`}
                    >
                        <SlidersHorizontal className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="px-6 py-6 space-y-8">
                {/* Categories Grid */}
                {query === '' && (
                    <section className="space-y-4">
                        <h2 className="text-xl font-black text-slate-800">Categorías Populares</h2>
                        <div className="grid grid-cols-3 gap-3">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                                    className={`${cat.color} ${selectedCategory === cat.name ? 'ring-4 ring-primary/30 scale-95' : 'hover:scale-105'} p-4 rounded-3xl flex flex-col items-center gap-2 active:scale-95 transition-all shadow-sm border border-black/5`}
                                >
                                    <div className="w-16 h-16 flex items-center justify-center p-1">
                                        <img src={cat.image} alt={cat.shortName} className="w-full h-full object-contain group-hover:scale-110 transition-transform" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-wider">{cat.shortName}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Results */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black text-slate-800">
                            {query || selectedCategory ? 'Resultados' : 'Explorar'}
                        </h2>
                        {filteredRestaurants.length > 0 && (
                            <span className="text-primary text-sm font-bold bg-primary/10 px-3 py-1 rounded-full">
                                {filteredRestaurants.length} local{filteredRestaurants.length !== 1 ? 'es' : ''}
                            </span>
                        )}
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
                                const coverImg = (res as any).coverUrl || res.image;
                                const logoImg = (res as any).logoUrl || res.image;

                                return (
                                    <Link to={`/restaurant/${res.id}`} key={res.id} className="block group relative bg-white rounded-[32px] overflow-hidden shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer">
                                        <div className="relative h-48 overflow-hidden bg-slate-100">
                                            {coverImg ? (
                                                <img src={coverImg} alt={res.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300">
                                                    <Store className="w-12 h-12 mb-2 opacity-50" />
                                                </div>
                                            )}
                                            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-1 shadow-sm border border-white/50">
                                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                                <span className="text-xs font-black text-slate-800">{res.rating}</span>
                                                <span className="text-[10px] text-slate-400 font-bold">({res.reviews}+)</span>
                                            </div>
                                        </div>
                                        <div className="p-6 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 bg-slate-50 flex items-center justify-center">
                                                {logoImg ? (
                                                    <img src={logoImg} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <Store className="w-6 h-6 text-slate-300" />
                                                )}
                                            </div>
                                            <div className="space-y-0.5">
                                                <h3 className="text-lg font-black text-slate-900 group-hover:text-primary transition-colors leading-tight">{res.name}</h3>
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                                    <span>{res.category}</span>
                                                    <span>•</span>
                                                    <div className="flex items-center gap-1 text-primary">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{res.deliveryTime}</span>
                                                    </div>
                                                    <span>•</span>
                                                    <div className="flex items-center gap-1 text-blue-500">
                                                        <MapPin className="w-3 h-3" />
                                                        <span>{res.distance}</span>
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
            />
        </div>
    );
}

