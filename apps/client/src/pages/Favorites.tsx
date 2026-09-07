import { Heart, ShoppingBag, ArrowRight, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Restaurant } from '../lib/seed';
import { requestNotificationPermission } from '../lib/notifications';
import toast from 'react-hot-toast';

export default function Favorites() {
    const { user, userData } = useAuth();
    const [favorites, setFavorites] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [activatingNotifications, setActivatingNotifications] = useState(false);

    useEffect(() => {
        const fetchFavorites = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            try {
                const { data: prof, error } = await supabase
                    .from('profiles')
                    .select('favorites')
                    .eq('id', user.id)
                    .maybeSingle();

                if (error) throw error;

                const favoriteIds: string[] = Array.isArray(prof?.favorites) ? prof.favorites : [];

                if (favoriteIds.length > 0) {
                    const { data: rests, error: restsErr } = await supabase
                        .from('comercios')
                        .select('*')
                        .in('id', favoriteIds);

                    if (restsErr) throw restsErr;

                    const mapped: Restaurant[] = (rests || []).map((r: any) => ({
                        id: r.id,
                        name: r.name,
                        category: r.category,
                        businessType: r.business_type || r.businessType,
                        rating: r.rating || 5.0,
                        reviews: r.reviews || 0,
                        deliveryTime: r.delivery_time || r.deliveryTime || '30 min',
                        distance: r.distance || '1.0 km',
                        image: r.image || r.logo_url || r.logoUrl,
                        logoUrl: r.logo_url || r.logoUrl
                    }));

                    setFavorites(mapped);
                } else {
                    setFavorites([]);
                }
            } catch (error) {
                console.error("Error fetching favorites:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFavorites();
    }, [user]);

    const handleActivateNotifications = async () => {
        if (!user) {
            toast.error("Debes iniciar sesión para activar las notificaciones.");
            return;
        }

        setActivatingNotifications(true);
        try {
            const res = await requestNotificationPermission(user.id);
            if (res.success) {
                toast.success("¡Notificaciones activadas con éxito! 🎉");
            } else {
                toast.error(res.error || "No pudimos activar las notificaciones.");
            }
        } catch (error) {
            console.error("Error activating notifications:", error);
            toast.error("Ocurrió un error al activar las notificaciones.");
        } finally {
            setActivatingNotifications(false);
        }
    };

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
                        <Link to="/profile" className="bg-primary text-slate-900 px-8 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.05] active:scale-[0.95] transition-all">
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
                                <div className="relative w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-inner bg-slate-50 flex items-center justify-center">
                                    <img 
                                        src={res.logoUrl || res.image} 
                                        alt={res.name} 
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                                    />
                                    <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                        <Heart className="w-3 h-3 text-red-500 fill-red-500" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 py-1">
                                    <h3 className="font-black text-slate-900 group-hover:text-slate-900 transition-colors truncate">{res.name}</h3>
                                    <p className="text-xs text-slate-500 truncate">{res.category}</p>
                                    <div className="flex items-center gap-1 mt-1">
                                        <div className="flex items-center text-slate-900 text-xs font-bold gap-1">
                                            <Star className="w-3 h-3 fill-primary" />
                                            <span>{res.rating}</span>
                                        </div>
                                    </div>
                                    <button className="mt-3 flex w-full justify-center items-center gap-1 text-xs font-black text-slate-900 bg-primary/10 px-4 py-2 rounded-xl group-hover:bg-primary group-hover:text-slate-900 transition-all">
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
                        <Link to="/search" className="bg-primary text-slate-900 px-8 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.05] active:scale-[0.95] transition-all">
                            EXPLORAR AHORA
                        </Link>
                    </div>
                )}
            </div>

            {!(userData as any)?.fcm_tokens?.length && (
                <div className="px-6 mt-8 mb-4 max-w-sm mx-auto">
                    <div className="bg-gradient-to-r from-orange-400 to-primary rounded-[32px] p-8 text-white shadow-xl hover:-translate-y-1 transition-transform cursor-pointer">
                        <h3 className="text-xl font-black leading-tight mb-2">¿Quieres ver más <br />restaurantes?</h3>
                        <p className="text-white/80 text-sm font-medium mb-6">Activa las notificaciones para estar al tanto de todo.</p>
                        <button
                            onClick={handleActivateNotifications}
                            disabled={activatingNotifications}
                            className="bg-white text-slate-900 font-black px-6 py-3 rounded-xl shadow-lg hover:scale-[1.02] transition-transform active:scale-[0.98] uppercase text-xs tracking-widest w-full flex items-center justify-center gap-2 disabled:opacity-70"
                        >
                            {activatingNotifications ? (
                                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                'ACTIVAR AHORA'
                            )}
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
