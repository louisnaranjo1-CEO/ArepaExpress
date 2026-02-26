import { Search as SearchIcon, SlidersHorizontal, MapPin, Star, Clock } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Restaurant } from '../lib/seed';
import { Link } from 'react-router-dom';

const CATEGORIES = [
    { id: 'arepas', name: 'Comida Venezolana', emoji: '🫓', color: 'bg-orange-100 text-orange-600', shortName: 'Arepas' },
    { id: 'burgers', name: 'Hamburguesas', emoji: '🍔', color: 'bg-red-100 text-red-600', shortName: 'Burgers' },
    { id: 'sushi', name: 'Sushi', emoji: '🍣', color: 'bg-pink-100 text-pink-600', shortName: 'Sushi' },
    { id: 'pizza', name: 'Pizza', emoji: '🍕', color: 'bg-yellow-100 text-yellow-600', shortName: 'Pizza' },
    { id: 'chinesse', name: 'Chino', emoji: '🍜', color: 'bg-blue-100 text-blue-600', shortName: 'Chino' },
    { id: 'desserts', name: 'Postres', emoji: '🍰', color: 'bg-purple-100 text-purple-600', shortName: 'Postres' },
];

export default function Search() {
    const [query, setQuery] = useState('');
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    useEffect(() => {
        const fetchRestaurants = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, 'restaurants'));
                const fetched = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Restaurant[];
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
            const matchesQuery = query === '' ||
                res.name.toLowerCase().includes(query.toLowerCase()) ||
                res.category.toLowerCase().includes(query.toLowerCase());
            const matchesCategory = !selectedCategory || res.category === selectedCategory;
            return matchesQuery && matchesCategory;
        });
    }, [restaurants, query, selectedCategory]);

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
                                    <span className="text-3xl">{cat.emoji}</span>
                                    <span className="text-xs font-bold uppercase tracking-wider">{cat.shortName}</span>
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
                            filteredRestaurants.map((res) => (
                                <Link to={`/restaurant/${res.id}`} key={res.id} className="block group relative bg-white rounded-[32px] overflow-hidden shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer">
                                    <div className="relative h-48 overflow-hidden">
                                        <img src={res.image} alt={res.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-1 shadow-sm border border-white/50">
                                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                            <span className="text-xs font-black text-slate-800">{res.rating}</span>
                                            <span className="text-[10px] text-slate-400 font-bold">({res.reviews}+)</span>
                                        </div>
                                    </div>
                                    <div className="p-6 space-y-1">
                                        <h3 className="text-lg font-black text-slate-900 group-hover:text-primary transition-colors">{res.name}</h3>
                                        <div className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-tighter">
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
                                </Link>
                            ))
                        ) : (
                            <div className="bg-white border text-center border-slate-100 p-8 rounded-3xl flex flex-col items-center justify-center space-y-3 shadow-sm">
                                <div className="text-4xl">🔍</div>
                                <h3 className="text-lg font-black text-slate-800">No encontramos resultados</h3>
                                <p className="text-slate-500 text-sm">Intenta buscar con otros términos o elige otra categoría.</p>
                                <button
                                    onClick={() => { setQuery(''); setSelectedCategory(null); }}
                                    className="mt-4 bg-primary/10 text-primary px-6 py-2 rounded-xl font-bold hover:bg-primary/20 transition-colors"
                                >
                                    Ver todos los restaurantes
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
