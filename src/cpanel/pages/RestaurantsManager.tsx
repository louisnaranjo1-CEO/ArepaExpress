import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Store, CheckCircle, XCircle, ChevronRight, X, Phone, MapPin, Tag, Box, Star, Users, ShoppingBag, Database } from 'lucide-react';
import { Restaurant, seedDatabase, clearMockDatabase } from '../../lib/seed';
import { useNavigate } from 'react-router-dom';

interface RestaurantDetail extends Restaurant {
    followersCount?: number;
    productsCount?: number;
    totalOrders?: number;
    status?: 'active' | 'busy' | 'unavailable';
}

export default function RestaurantsManager() {
    const navigate = useNavigate();
    const [restaurants, setRestaurants] = useState<RestaurantDetail[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMocking, setIsMocking] = useState(false);

    const hasMockData = restaurants.some(r => r.isMock);

    const fetchRestaurants = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'restaurants'));
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as RestaurantDetail[];
            setRestaurants(data);
        } catch (error) {
            console.error("Error fetching restaurants: ", error);
        } finally {
            setLoading(false);
            setIsMocking(false);
        }
    };

    useEffect(() => {
        fetchRestaurants();
    }, []);

    const toggleStatus = async (id: string, currentStatus: boolean | undefined, e: React.MouseEvent) => {
        e.stopPropagation(); // Don't trigger row click
        try {
            const newStatus = currentStatus === undefined ? false : !currentStatus;
            await updateDoc(doc(db, 'restaurants', id), {
                isActive: newStatus
            });
            setRestaurants(prev => prev.map(r => r.id === id ? { ...r, isActive: newStatus } : r));
        } catch (error) {
            console.error("Error updating restaurant status:", error);
        }
    };

    const handleRowClick = (restaurant: RestaurantDetail) => {
        navigate(`/restaurants/${restaurant.id}`);
    };

    if (loading && restaurants.length === 0) {
        return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-1/4"></div><div className="h-64 bg-slate-200 rounded"></div></div>;
    }

    const handleMockToggle = async () => {
        setIsMocking(true);
        if (hasMockData) {
            await clearMockDatabase();
        } else {
            await seedDatabase();
        }
        await fetchRestaurants();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-black text-slate-900 leading-tight">Gestión de Restaurantes</h1>
                    <p className="text-slate-500 font-medium">Activa o desactiva restaurantes en la plataforma.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-24">
                {restaurants.map((restaurant) => {
                    const isActive = restaurant.isActive !== false;
                    const logo = (restaurant as any).logoUrl || restaurant.image;
                    
                    const subEnd = (restaurant as any).subscriptionEnd ? new Date((restaurant as any).subscriptionEnd) : null;
                    const hasActiveSub = subEnd && subEnd > new Date();

                    return (
                        <div
                            key={restaurant.id}
                            onClick={() => handleRowClick(restaurant)}
                            className="bg-white rounded-[32px] p-5 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/40 hover:-translate-y-1 transition-all cursor-pointer flex flex-col gap-4 relative overflow-hidden group"
                        >
                            {/* Card Header: Logo, Name, ID, Category */}
                            <div className="flex items-start gap-4">
                                <div className="w-16 h-16 rounded-[20px] bg-slate-100 overflow-hidden border border-slate-100 shrink-0">
                                    {logo ? (
                                        <img src={logo} alt={restaurant.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-100">
                                            <Store className="w-8 h-8 text-slate-300" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 pr-6">
                                    <div className="font-bold text-lg text-slate-900 truncate">
                                        {restaurant.name}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">
                                        {restaurant.id.slice(0, 8)}...
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap gap-2">
                                        <span className="text-[10px] font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 uppercase tracking-wider">
                                            {restaurant.category}
                                        </span>
                                        {restaurant.isMock && (
                                            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] uppercase tracking-wider rounded-lg font-black">
                                                MOCK
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 absolute top-5 right-5 transition-colors" />
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-slate-50 w-full"></div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-slate-400 mb-1.5">Estado</p>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                                        !isActive ? 'bg-slate-100 text-slate-700' :
                                        restaurant.status === 'busy' ? 'bg-amber-100 text-amber-700' :
                                        restaurant.status === 'unavailable' ? 'bg-red-100 text-red-700' :
                                        'bg-emerald-100 text-emerald-700'
                                    }`}>
                                        {!isActive ? <XCircle className="w-3 h-3" /> :
                                        restaurant.status === 'busy' ? <Store className="w-3 h-3" /> :
                                        restaurant.status === 'unavailable' ? <XCircle className="w-3 h-3" /> :
                                        <CheckCircle className="w-3 h-3" />}
                                        {!isActive ? 'Suspendido' :
                                        restaurant.status === 'busy' ? 'Ocupado' :
                                        restaurant.status === 'unavailable' ? 'No Disponible' : 'Activo'}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-slate-400 mb-1.5">Suscripción</p>
                                    {hasActiveSub ? (
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 self-start px-2 py-0.5 rounded-lg">Activa</span>
                                            <span className="text-[9px] font-bold text-slate-400 mt-1">Vence: {subEnd?.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                        </div>
                                    ) : (
                                        <span className="text-[11px] font-black text-slate-400 bg-slate-50 self-start px-2 py-0.5 rounded-lg border border-slate-100">Inactiva</span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="mt-1 pt-3 border-t border-slate-50 flex justify-end">
                                <button
                                    onClick={(e) => toggleStatus(restaurant.id, restaurant.isActive, e)}
                                    className={`w-full sm:w-auto px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
                                        isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                    }`}
                                >
                                    {isActive ? 'Suspender Restaurante' : 'Activar Restaurante'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
