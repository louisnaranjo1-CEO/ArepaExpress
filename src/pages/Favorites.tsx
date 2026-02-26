import { Heart, ShoppingBag, ArrowRight, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Restaurant } from '../lib/seed';

export default function Favorites() {
    const { user } = useAuth();
    const [favorites, setFavorites] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFavorites = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const favoriteIds: string[] = userSnap.data().favorites || [];

                    if (favoriteIds.length > 0) {
                        // Fetch details for each favorite restaurant ID
                        const restaurantPromises = favoriteIds.map(async (id) => {
                            const resRef = doc(db, 'restaurants', id);
                            const resSnap = await getDoc(resRef);
                            if (resSnap.exists()) {
                                return { id: resSnap.id, ...resSnap.data() } as Restaurant;
                            }
                            return null;
                        });

                        const fetchedRestaurants = (await Promise.all(restaurantPromises)).filter(Boolean) as Restaurant[];
                        setFavorites(fetchedRestaurants);
                    } else {
                        setFavorites([]);
                    }
                }
            } catch (error) {
                console.error("Error fetching favorites:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFavorites();
    }, [user]);

    const hasFavorites = favorites.length > 0;

    return (
        <div className="pb-24 animate-in fade-in duration-500 min-h-screen bg-slate-50">
            <div className="px-6 pt-12 pb-6 space-y-2 bg-white rounded-b-[40px] shadow-sm">
                <h1 className="text-3xl font-black text-slate-900 flex items-center gap-2">
                    Favoritos <Heart className="w-8 h-8 text-red-500 fill-red-500 animate-pulse" />
                </h1>
                <p className="text-slate-500 font-medium">Tus lugares preferidos en un solo lugar.</p>
            </div>

            <div className="px-6 py-6">
                {!user ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                        <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                            <Heart className="w-12 h-12 text-slate-400" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-black text-slate-800">Inicia Sesión</h2>
                            <p className="text-slate-400 text-sm max-w-[200px] leading-relaxed">Debes iniciar sesión para ver y guardar tus restaurantes favoritos.</p>
                        </div>
                        <Link to="/profile" className="bg-primary text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.05] active:scale-[0.95] transition-all">
                            IR A PERFIL
                        </Link>
                    </div>
                ) : loading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : hasFavorites ? (
                    <div className="grid grid-cols-1 gap-4">
                        {favorites.map((res) => (
                            <Link to={`/restaurant/${res.id}`} key={res.id} className="group flex items-center gap-4 bg-white p-4 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                                <div className="relative w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-inner">
                                    <img src={res.image} alt={res.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                        <Heart className="w-3 h-3 text-red-500 fill-red-500" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 py-1">
                                    <h3 className="font-black text-slate-900 group-hover:text-primary transition-colors truncate">{res.name}</h3>
                                    <p className="text-xs text-slate-500 truncate">{res.category}</p>
                                    <div className="flex items-center gap-1 mt-1">
                                        <div className="flex items-center text-primary text-xs font-bold gap-1">
                                            <Star className="w-3 h-3 fill-primary" />
                                            <span>{res.rating}</span>
                                        </div>
                                    </div>
                                    <button className="mt-3 flex w-full justify-center items-center gap-1 text-xs font-black text-primary bg-primary/10 px-4 py-2 rounded-xl group-hover:bg-primary group-hover:text-white transition-all">
                                        PEDIR YA <ArrowRight className="w-3 h-3" />
                                    </button>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                        <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                            <Heart className="w-12 h-12 text-slate-300" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-black text-slate-800">¿Nada por aquí?</h2>
                            <p className="text-slate-400 text-sm max-w-[200px] leading-relaxed">Explora restaurantes y guarda los que más te gusten con el corazón.</p>
                        </div>
                        <Link to="/search" className="bg-primary text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.05] active:scale-[0.95] transition-all">
                            EXPLORAR AHORA
                        </Link>
                    </div>
                )}
            </div>

            <div className="px-6 mt-8 mb-4 max-w-sm mx-auto">
                <div className="bg-gradient-to-r from-orange-400 to-primary rounded-[32px] p-8 text-white shadow-xl hover:-translate-y-1 transition-transform cursor-pointer">
                    <h3 className="text-xl font-black leading-tight mb-2">¿Quieres más <br />Arepa Express? 🤩</h3>
                    <p className="text-white/80 text-sm font-medium mb-6">Activa las notificaciones para no perderte las mejores promos.</p>
                    <button className="bg-white text-primary font-black px-6 py-3 rounded-xl shadow-lg hover:scale-[1.02] transition-transform active:scale-[0.98] uppercase text-xs tracking-widest w-full">
                        ACTIVAR AHORA
                    </button>
                </div>
            </div>
        </div>
    );
}
