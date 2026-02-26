import { Heart, ShoppingBag, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const FAVORITE_RESTAURANTS = [
    {
        id: 1,
        name: "Arepa Factory El Rosal",
        image: "https://images.unsplash.com/photo-1541544741938-0af808871cc0?q=80&w=2692&auto=format&fit=crop",
        rating: 4.8
    },
    {
        id: 3,
        name: "Sushi Hana La Castellana",
        image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=2670&auto=format&fit=crop",
        rating: 4.9
    }
];

export default function Favorites() {
    const hasFavorites = FAVORITE_RESTAURANTS.length > 0;

    return (
        <div className="pb-24 animate-in fade-in duration-500">
            <div className="px-6 pt-12 pb-6 space-y-2">
                <h1 className="text-3xl font-black text-slate-900 flex items-center gap-2">
                    Favoritos <Heart className="w-8 h-8 text-red-500 fill-red-500 animate-pulse" />
                </h1>
                <p className="text-slate-500 font-medium">Tus lugares preferidos en un solo lugar.</p>
            </div>

            <div className="px-6 py-4">
                {hasFavorites ? (
                    <div className="grid grid-cols-1 gap-4">
                        {FAVORITE_RESTAURANTS.map((res) => (
                            <Link to="/restaurant" key={res.id} className="group flex items-center gap-4 bg-white p-4 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                                <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-inner">
                                    <img src={res.image} alt={res.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                </div>
                                <div className="flex-1 min-w-0 py-1">
                                    <h3 className="font-black text-slate-900 group-hover:text-primary transition-colors truncate">{res.name}</h3>
                                    <div className="flex items-center gap-1 mt-1">
                                        <div className="flex text-yellow-500">
                                            {[...Array(5)].map((_, i) => (
                                                <Heart key={i} className={`w-3 h-3 ${i < Math.floor(res.rating) ? 'fill-current' : 'text-slate-200'}`} />
                                            ))}
                                        </div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{res.rating} Puntos</span>
                                    </div>
                                    <button className="mt-3 flex items-center gap-1 text-xs font-black text-white bg-primary px-4 py-2 rounded-xl shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-all">
                                        PEDIR YA <ArrowRight className="w-3 h-3" />
                                    </button>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                        <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                            <Heart className="w-12 h-12 text-slate-300" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-black text-slate-800">¿Nada por aquí?</h2>
                            <p className="text-slate-400 text-sm max-w-[200px] leading-relaxed">Explora restaurantes y guarda los que más te gusten con el corazón.</p>
                        </div>
                        <Link to="/search" className="bg-primary text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all">
                            EXPLORAR AHORA
                        </Link>
                    </div>
                )}
            </div>

            <div className="px-6 mt-12 bg-gradient-to-r from-orange-400 to-primary rounded-[40px] p-8 text-white shadow-xl mx-6">
                <h3 className="text-xl font-black leading-tight mb-2">¿Quieres más <br />Arepa Express? 🤩</h3>
                <p className="text-white/80 text-sm font-medium mb-6">Activa las notificaciones para no perderte las mejores promos.</p>
                <button className="bg-white text-primary font-black px-6 py-3 rounded-xl shadow-lg hover:scale-105 transition-transform active:scale-95 uppercase text-xs tracking-widest">
                    ACTIVAR AHORA
                </button>
            </div>
        </div>
    );
}
