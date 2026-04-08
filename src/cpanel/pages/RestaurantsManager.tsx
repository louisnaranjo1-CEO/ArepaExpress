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

            <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-xl shadow-slate-200/40">
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                            <tr>
                                <th className="px-8 py-5">Restaurante</th>
                                <th className="px-8 py-5">Categoría</th>
                                <th className="px-8 py-5">Correo</th>
                                <th className="px-8 py-5 text-center">Estado</th>
                                <th className="px-8 py-5 text-center">Suscripción</th>
                                <th className="px-8 py-5 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {restaurants.map((restaurant) => {
                                const isActive = restaurant.isActive !== false;
                                const logo = (restaurant as any).logoUrl || restaurant.image;
                                
                                const subEnd = (restaurant as any).subscriptionEnd ? new Date((restaurant as any).subscriptionEnd) : null;
                                const hasActiveSub = subEnd && subEnd > new Date();

                                return (
                                    <tr
                                        key={restaurant.id}
                                        onClick={() => handleRowClick(restaurant)}
                                        className="group hover:bg-slate-50/80 transition-all cursor-pointer"
                                    >
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden border border-slate-100 shrink-0">
                                                    {logo ? (
                                                        <img src={logo} alt={restaurant.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-slate-100">
                                                            <Store className="w-6 h-6 text-slate-300" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 group-hover:text-slate-900 transition-colors flex items-center gap-2">
                                                        {restaurant.name}
                                                        {restaurant.isMock && (
                                                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[9px] uppercase tracking-wider rounded-full font-black">
                                                                MOCK
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{restaurant.id.slice(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className="text-sm font-medium text-slate-600">{restaurant.category}</span>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className="text-sm text-slate-500">{(restaurant as any).email || 'No disponible'}</span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${!isActive ? 'bg-slate-100 text-slate-700' :
                                                restaurant.status === 'busy' ? 'bg-amber-100 text-amber-700' :
                                                    restaurant.status === 'unavailable' ? 'bg-red-100 text-red-700' :
                                                        'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                {!isActive ? <XCircle className="w-3.5 h-3.5" /> :
                                                    restaurant.status === 'busy' ? <Store className="w-3.5 h-3.5" /> :
                                                        restaurant.status === 'unavailable' ? <XCircle className="w-3.5 h-3.5" /> :
                                                            <CheckCircle className="w-3.5 h-3.5" />}

                                                {!isActive ? 'Suspendido' :
                                                    restaurant.status === 'busy' ? 'Ocupado' :
                                                        restaurant.status === 'unavailable' ? 'No Disponible' : 'Activo'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            {hasActiveSub ? (
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase mb-1">Activo</span>
                                                    <span className="text-[9px] font-bold text-slate-400">Vence: {subEnd?.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md uppercase">Inactivo</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <button
                                                    onClick={(e) => toggleStatus(restaurant.id, restaurant.isActive, e)}
                                                    className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                                >
                                                    {isActive ? 'Suspender' : 'Activar'}
                                                </button>
                                                <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-slate-400 transition-colors" />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
