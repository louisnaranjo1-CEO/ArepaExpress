import { Search as SearchIcon, SlidersHorizontal, MapPin, Star, Clock } from 'lucide-react';
import { useState } from 'react';

const CATEGORIES = [
    { id: 'arepas', name: 'Arepas', emoji: '🫓', color: 'bg-orange-100 text-orange-600' },
    { id: 'burgers', name: 'Burgers', emoji: '🍔', color: 'bg-red-100 text-red-600' },
    { id: 'sushi', name: 'Sushi', emoji: '🍣', color: 'bg-pink-100 text-pink-600' },
    { id: 'pizza', name: 'Pizza', emoji: '🍕', color: 'bg-yellow-100 text-yellow-600' },
    { id: 'chinesse', name: 'Chino', emoji: '🍜', color: 'bg-blue-100 text-blue-600' },
    { id: 'desserts', name: 'Postres', emoji: '🍰', color: 'bg-purple-100 text-purple-600' },
];

const SEARCH_RESULTS = [
    {
        id: 1,
        name: "Arepa Factory El Rosal",
        category: "Comida Venezolana",
        rating: 4.8,
        reviews: 120,
        time: "20-30 min",
        distance: "1.2 km",
        image: "https://images.unsplash.com/photo-1541544741938-0af808871cc0?q=80&w=2692&auto=format&fit=crop"
    },
    {
        id: 2,
        name: "Burger Shack Altamira",
        category: "Hamburgesas",
        rating: 4.5,
        reviews: 85,
        time: "15-25 min",
        distance: "0.8 km",
        image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?q=80&w=2672&auto=format&fit=crop"
    }
];

export default function Search() {
    const [query, setQuery] = useState('');

    return (
        <div className="pb-24 animate-in fade-in duration-500">
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
                            className="w-full bg-slate-100 border-none rounded-2xl py-4 pl-12 pr-4 font-medium focus:ring-2 focus:ring-primary focus:bg-white transition-all shadow-inner"
                        />
                    </div>
                    <button className="bg-primary/10 p-4 rounded-2xl text-primary hover:bg-primary/20 hover:scale-105 active:scale-95 transition-all shadow-sm">
                        <SlidersHorizontal className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="px-6 py-6 space-y-8">
                {/* Categories Grid */}
                <section className="space-y-4">
                    <h2 className="text-xl font-black text-slate-800">Categorías Populares</h2>
                    <div className="grid grid-cols-3 gap-3">
                        {CATEGORIES.map((cat) => (
                            <button key={cat.id} className={`${cat.color} p-4 rounded-3xl flex flex-col items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-sm border border-black/5`}>
                                <span className="text-3xl">{cat.emoji}</span>
                                <span className="text-xs font-bold uppercase tracking-wider">{cat.name}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Results */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black text-slate-800">Cerca de ti</h2>
                        <button className="text-primary text-sm font-bold">Ver todos</button>
                    </div>
                    <div className="space-y-6">
                        {SEARCH_RESULTS.map((res) => (
                            <div key={res.id} className="group relative bg-white rounded-[32px] overflow-hidden shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer">
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
                                            <span>{res.time}</span>
                                        </div>
                                        <span>•</span>
                                        <div className="flex items-center gap-1 text-blue-500">
                                            <MapPin className="w-3 h-3" />
                                            <span>{res.distance}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
