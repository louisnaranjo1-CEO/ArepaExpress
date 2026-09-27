import { Heart, ShoppingBag, ArrowRight, Star, Trash2, Utensils, Store, Bell, BellRing, Settings2, X, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { supabase } from '../lib/supabase';
import { Restaurant } from '../lib/seed';
import { requestNotificationPermission } from '../lib/notifications';
import toast from 'react-hot-toast';

interface FollowPref {
    notify_promotions: boolean;
    notify_new_products: boolean;
    notify_price_drops: boolean;
}

export default function Favorites() {
    const { user, userData } = useAuth();
    const { bcvRate } = useCurrency();
    const [activeTab, setActiveTab] = useState<'restaurants' | 'products'>('restaurants');
    const [favorites, setFavorites] = useState<Restaurant[]>([]);
    const [followedMap, setFollowedMap] = useState<Record<string, FollowPref>>({});
    const [selectedPrefRest, setSelectedPrefRest] = useState<Restaurant | null>(null);
    const [savingPref, setSavingPref] = useState(false);
    const [favoriteProducts, setFavoriteProducts] = useState<any[]>(() => {
        try {
            const raw = localStorage.getItem('un2x3_favorite_products');
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });
    const [loading, setLoading] = useState(true);
    const [activatingNotifications, setActivatingNotifications] = useState(false);

    const removeFavoriteProduct = (productId: string) => {
        try {
            const updated = favoriteProducts.filter(p => (typeof p === 'string' ? p !== productId : p.id !== productId));
            setFavoriteProducts(updated);
            localStorage.setItem('un2x3_favorite_products', JSON.stringify(updated));
            toast.success('Producto eliminado de favoritos');
        } catch (e) {
            console.error(e);
        }
    };

    const toggleFavoriteRestaurant = async (restId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) return;
        try {
            const updated = favorites.filter(f => f.id !== restId);
            setFavorites(updated);
            const { data: prof } = await supabase.from('profiles').select('favorites').eq('id', user.id).maybeSingle();
            const favs = Array.isArray(prof?.favorites) ? prof.favorites.filter((f: string) => f !== restId) : [];
            await supabase.from('profiles').update({ favorites: favs, updated_at: new Date().toISOString() }).eq('id', user.id);
            toast.success('Lugar eliminado de favoritos');
        } catch (err) {
            console.error("Error removing favorite:", err);
        }
    };

    const toggleFollowRestaurant = async (res: Restaurant, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
            toast.error('Debes iniciar sesión para seguir negocios.');
            return;
        }

        const isCurrentlyFollowing = !!followedMap[res.id];
        const followerName = userData?.displayName || userData?.fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Un cliente';

        try {
            if (isCurrentlyFollowing) {
                const nextMap = { ...followedMap };
                delete nextMap[res.id];
                setFollowedMap(nextMap);

                await supabase
                    .from('restaurant_followers')
                    .delete()
                    .eq('restaurant_id', res.id)
                    .eq('user_id', user.id);

                toast('Dejaste de seguir este negocio', { icon: '👋' });
            } else {
                const defaultPrefs: FollowPref = {
                    notify_promotions: true,
                    notify_new_products: true,
                    notify_price_drops: true
                };

                setFollowedMap(prev => ({
                    ...prev,
                    [res.id]: defaultPrefs
                }));

                await supabase
                    .from('restaurant_followers')
                    .upsert({
                        restaurant_id: res.id,
                        user_id: user.id,
                        user_name: followerName,
                        notify_promotions: true,
                        notify_new_products: true,
                        notify_price_drops: true,
                        created_at: new Date().toISOString()
                    }, { onConflict: 'restaurant_id,user_id' });

                toast.success(`¡Ahora sigues a ${res.name}! Te notificaremos de promociones y nuevos productos. 🎉`);
            }
        } catch (err) {
            console.error("Error toggling follow:", err);
            toast.error("Ocurrió un error al actualizar el seguimiento.");
        }
    };

    const savePreferences = async (newPrefs: FollowPref) => {
        if (!user || !selectedPrefRest) return;
        setSavingPref(true);
        try {
            await supabase
                .from('restaurant_followers')
                .update({
                    notify_promotions: newPrefs.notify_promotions,
                    notify_new_products: newPrefs.notify_new_products,
                    notify_price_drops: newPrefs.notify_price_drops
                })
                .eq('restaurant_id', selectedPrefRest.id)
                .eq('user_id', user.id);

            setFollowedMap(prev => ({
                ...prev,
                [selectedPrefRest.id]: newPrefs
            }));

            toast.success('Preferencias de notificación guardadas');
            setSelectedPrefRest(null);
        } catch (err) {
            console.error("Error updating preferences:", err);
            toast.error("No se pudieron guardar las preferencias.");
        } finally {
            setSavingPref(false);
        }
    };

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

                    const mapped: Restaurant[] = (rests || [])
                        .filter((r: any) => {
                            const isVis = (r.is_visible === true || r.isVisible === true);
                            const isAct = (r.is_active !== false && r.isActive !== false);
                            return isVis && isAct;
                        })
                        .map((r: any) => ({
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

                // Fetch followed stores for this user
                const { data: follows, error: followErr } = await supabase
                    .from('restaurant_followers')
                    .select('restaurant_id, notify_promotions, notify_new_products, notify_price_drops')
                    .eq('user_id', user.id);

                if (!followErr && follows) {
                    const fMap: Record<string, FollowPref> = {};
                    follows.forEach((f: any) => {
                        fMap[f.restaurant_id] = {
                            notify_promotions: f.notify_promotions ?? true,
                            notify_new_products: f.notify_new_products ?? true,
                            notify_price_drops: f.notify_price_drops ?? true,
                        };
                    });
                    setFollowedMap(fMap);
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
            <div className="px-6 pt-12 pb-4 space-y-3 bg-white rounded-b-[40px] shadow-sm">
                <h1 className="text-3xl font-black text-slate-900 flex items-center gap-2">
                    Favoritos <Heart className="w-8 h-8 text-red-500 fill-red-500 animate-pulse" />
                </h1>
                <p className="text-slate-500 font-medium text-xs">Tus lugares y productos preferidos en un solo lugar.</p>
                
                {/* Tabs: Lugares & Productos */}
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button
                        type="button"
                        onClick={() => setActiveTab('restaurants')}
                        className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                            activeTab === 'restaurants'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <Store className="w-3.5 h-3.5" />
                        <span>Lugares ({favorites.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('products')}
                        className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                            activeTab === 'products'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <Utensils className="w-3.5 h-3.5" />
                        <span>Productos ({favoriteProducts.length})</span>
                    </button>
                </div>
            </div>

            <div className="px-6 py-6">
                {activeTab === 'restaurants' ? (
                    !user ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                            <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                                <Heart className="w-12 h-12 text-slate-400" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-black text-slate-800">Inicia Sesión</h2>
                                <p className="text-slate-400 text-sm max-w-[200px] leading-relaxed">Debes iniciar sesión para ver y guardar tus lugares favoritos.</p>
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
                            {favorites.map((res) => {
                                const isFollowing = !!followedMap[res.id];
                                return (
                                    <div
                                        key={res.id}
                                        className="bg-white p-4 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-primary/20 transition-all"
                                    >
                                        <div className="flex items-center gap-4">
                                            <Link to={`/restaurant/${res.id}`} className="relative w-24 h-24 rounded-2xl overflow-hidden shrink-0 shadow-inner bg-slate-50 flex items-center justify-center group">
                                                <img 
                                                    src={res.logoUrl || res.image} 
                                                    alt={res.name} 
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                                                />
                                                <button
                                                    type="button"
                                                    onClick={(e) => toggleFavoriteRestaurant(res.id, e)}
                                                    className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm hover:scale-110 transition-transform"
                                                    title="Eliminar de favoritos"
                                                >
                                                    <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                                                </button>
                                            </Link>
                                            <div className="flex-1 min-w-0 py-1">
                                                <Link to={`/restaurant/${res.id}`}>
                                                    <h3 className="font-black text-slate-900 hover:text-primary transition-colors truncate">{res.name}</h3>
                                                </Link>
                                                <p className="text-xs text-slate-500 truncate">{res.category}</p>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <div className="flex items-center text-slate-900 text-xs font-bold gap-1">
                                                        <Star className="w-3 h-3 fill-primary" />
                                                        <span>{res.rating}</span>
                                                    </div>
                                                </div>

                                                {/* Follow and Notifications Control */}
                                                <div className="flex items-center gap-2 mt-3">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => toggleFollowRestaurant(res, e)}
                                                        className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-black py-2 px-3 rounded-xl transition-all ${
                                                            isFollowing
                                                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                                                                : 'bg-primary/15 text-slate-900 hover:bg-primary/25 border border-primary/20'
                                                        }`}
                                                    >
                                                        <Bell className={`w-3.5 h-3.5 ${isFollowing ? 'fill-primary text-primary' : 'text-slate-700'}`} />
                                                        <span>{isFollowing ? 'Siguiendo' : 'Seguir'}</span>
                                                    </button>

                                                    {isFollowing && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                setSelectedPrefRest(res);
                                                            }}
                                                            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 border border-slate-200 transition-colors"
                                                            title="Preferencias de notificación"
                                                        >
                                                            <Settings2 className="w-4 h-4" />
                                                        </button>
                                                    )}

                                                    <Link
                                                        to={`/restaurant/${res.id}`}
                                                        className="flex items-center justify-center gap-1 text-xs font-black text-slate-900 bg-primary px-3 py-2 rounded-xl hover:bg-primary/90 transition-all shrink-0"
                                                    >
                                                        <span>PEDIR</span>
                                                        <ArrowRight className="w-3 h-3" />
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                            <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                                <Heart className="w-12 h-12 text-slate-300" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-black text-slate-800">¿Nada por aquí?</h2>
                                <p className="text-slate-500 text-sm max-w-[280px] leading-relaxed">
                                    Explora todas las tiendas y guarda las que mas te gusten con el corazon! siguelas para que te lleguen notificaciones de promociones
                                </p>
                            </div>
                            <Link to="/search" className="bg-primary text-slate-900 px-8 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.05] active:scale-[0.95] transition-all">
                                EXPLORAR AHORA
                            </Link>
                        </div>
                    )
                ) : (
                    /* Products Tab */
                    favoriteProducts.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {favoriteProducts.map((prod: any) => {
                                const priceVal = Number(prod.promoPrice || prod.price || 0);
                                const priceBs = bcvRate > 0 ? (priceVal * bcvRate).toFixed(2) : null;
                                return (
                                    <div key={prod.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-md flex items-center gap-4 relative">
                                        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                                            {prod.image ? (
                                                <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                                    <Utensils className="w-6 h-6" />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0 pr-6">
                                            <h4 className="text-sm font-black text-slate-900 truncate">{prod.name}</h4>
                                            {prod.restaurantName && (
                                                <p className="text-[11px] font-bold text-amber-600 truncate flex items-center gap-1 mt-0.5">
                                                    <Store className="w-3 h-3" />
                                                    {prod.restaurantName}
                                                </p>
                                            )}
                                            <div className="mt-1 flex items-baseline gap-1.5">
                                                <span className="text-sm font-black text-slate-900">${priceVal.toFixed(2)}</span>
                                                {priceBs && (
                                                    <span className="text-[10px] font-bold text-slate-400">~{priceBs} Bs</span>
                                                )}
                                            </div>

                                            {prod.restaurantId ? (
                                                <Link
                                                    to={`/restaurant/${prod.restaurantId}`}
                                                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-primary hover:underline"
                                                >
                                                    Pedir en tienda <ArrowRight className="w-3 h-3" />
                                                </Link>
                                            ) : null}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => removeFavoriteProduct(prod.id)}
                                            className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 p-1 transition-colors"
                                            title="Eliminar de favoritos"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                            <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                                <Utensils className="w-12 h-12 text-slate-300" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-black text-slate-800">Sin productos favoritos</h2>
                                <p className="text-slate-400 text-sm max-w-[240px] leading-relaxed">
                                    Toca el corazón ❤️ en los productos de cualquier tienda para verlos aquí.
                                </p>
                            </div>
                            <Link to="/search" className="bg-primary text-slate-900 px-8 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.05] active:scale-[0.95] transition-all">
                                EXPLORAR TIENDAS
                            </Link>
                        </div>
                    )
                )}
            </div>

            {/* Notification Preferences Modal */}
            {selectedPrefRest && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 space-y-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-black text-slate-900 text-lg">Alertas y Notificaciones</h3>
                                <p className="text-xs text-slate-500">{selectedPrefRest.name}</p>
                            </div>
                            <button
                                onClick={() => setSelectedPrefRest(null)}
                                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 pt-2">
                            {(() => {
                                const currentPref = followedMap[selectedPrefRest.id] || {
                                    notify_promotions: true,
                                    notify_new_products: true,
                                    notify_price_drops: true
                                };

                                return (
                                    <>
                                        <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-800">🏷️ Promociones y Descuentos</span>
                                                <span className="text-[10px] text-slate-400">Ofertas flash y cupones de este lugar</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={currentPref.notify_promotions}
                                                onChange={(e) => {
                                                    const updated = { ...currentPref, notify_promotions: e.target.checked };
                                                    setFollowedMap(prev => ({ ...prev, [selectedPrefRest.id]: updated }));
                                                }}
                                                className="w-5 h-5 rounded-lg text-primary focus:ring-primary accent-primary"
                                            />
                                        </label>

                                        <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-800">🆕 Nuevos Productos</span>
                                                <span className="text-[10px] text-slate-400">Lanzamientos y novedades en el catálogo</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={currentPref.notify_new_products}
                                                onChange={(e) => {
                                                    const updated = { ...currentPref, notify_new_products: e.target.checked };
                                                    setFollowedMap(prev => ({ ...prev, [selectedPrefRest.id]: updated }));
                                                }}
                                                className="w-5 h-5 rounded-lg text-primary focus:ring-primary accent-primary"
                                            />
                                        </label>

                                        <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-800">📉 Bajadas de Precio</span>
                                                <span className="text-[10px] text-slate-400">Rebajas en productos de tu interés</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={currentPref.notify_price_drops}
                                                onChange={(e) => {
                                                    const updated = { ...currentPref, notify_price_drops: e.target.checked };
                                                    setFollowedMap(prev => ({ ...prev, [selectedPrefRest.id]: updated }));
                                                }}
                                                className="w-5 h-5 rounded-lg text-primary focus:ring-primary accent-primary"
                                            />
                                        </label>

                                        <button
                                            type="button"
                                            disabled={savingPref}
                                            onClick={() => savePreferences(followedMap[selectedPrefRest.id] || currentPref)}
                                            className="w-full mt-4 bg-primary text-slate-900 font-black py-3 rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                        >
                                            {savingPref ? (
                                                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <>
                                                    <Check className="w-4 h-4" />
                                                    <span>Guardar Preferencias</span>
                                                </>
                                            )}
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {!(userData as any)?.fcm_tokens?.length && (
                <div className="px-6 mt-8 mb-4 max-w-sm mx-auto">
                    <div className="bg-gradient-to-r from-orange-400 to-primary rounded-[32px] p-8 text-white shadow-xl hover:-translate-y-1 transition-transform cursor-pointer">
                        <h3 className="text-xl font-black leading-tight mb-2">¿Quieres ver más <br />lugares?</h3>
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

