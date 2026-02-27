import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Store, CheckCircle, XCircle, ChevronRight, X, Phone, MapPin, Tag, Box, Star, Users } from 'lucide-react';
import { Restaurant } from '../../lib/seed';

interface RestaurantDetail extends Restaurant {
    followersCount?: number;
    productsCount?: number;
    totalOrders?: number;
}

export default function RestaurantsManager() {
    const [restaurants, setRestaurants] = useState<RestaurantDetail[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantDetail | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

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

    const handleRowClick = async (restaurant: RestaurantDetail) => {
        setSelectedRestaurant(restaurant);
        setIsModalOpen(true);

        // Fetch additional data in background
        try {
            const productsSnap = await getDocs(query(collection(db, 'products'), where('restaurantId', '==', restaurant.id)));
            const ordersSnap = await getDocs(query(collection(db, 'orders'), where('restaurantId', '==', restaurant.id)));

            setSelectedRestaurant(prev => prev?.id === restaurant.id ? {
                ...prev,
                productsCount: productsSnap.size,
                totalOrders: ordersSnap.size
            } : prev);
        } catch (error) {
            console.error("Error fetching detail info:", error);
        }
    };

    if (loading) {
        return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-1/4"></div><div className="h-64 bg-slate-200 rounded"></div></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-black text-slate-900 leading-tight">Gestión de Restaurantes</h1>
                <p className="text-slate-500 font-medium">Activa o desactiva restaurantes en la plataforma.</p>
            </div>

            <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-xl shadow-slate-200/40">
                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                            <tr>
                                <th className="px-8 py-5">Restaurante</th>
                                <th className="px-8 py-5">Categoría</th>
                                <th className="px-8 py-5 text-center">Estado</th>
                                <th className="px-8 py-5 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {restaurants.map((restaurant) => {
                                const isActive = restaurant.isActive !== false;
                                // Use logoUrl first, then image
                                const logo = (restaurant as any).logoUrl || restaurant.image;

                                return (
                                    <tr
                                        key={restaurant.id}
                                        onClick={() => handleRowClick(restaurant)}
                                        className="group hover:bg-slate-50/80 transition-all cursor-pointer"
                                    >
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden border border-slate-100 shrink-0">
                                                    <img src={logo} alt={restaurant.name} className="w-full h-full object-cover" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 group-hover:text-primary transition-colors">{restaurant.name}</div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{restaurant.id.slice(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className="text-sm font-medium text-slate-600">{restaurant.category}</span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                {isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                                {isActive ? 'Activo' : 'Suspendido'}
                                            </span>
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

            {/* Detail Modal */}
            {isModalOpen && selectedRestaurant && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        {/* Header Image */}
                        <div className="h-48 bg-slate-900 relative">
                            <img
                                src={(selectedRestaurant as any).coverUrl || selectedRestaurant.image}
                                alt="Cover"
                                className="w-full h-full object-cover opacity-50"
                            />
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="absolute top-6 right-6 w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/20"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <div className="absolute -bottom-12 left-10">
                                <div className="w-24 h-24 rounded-[32px] bg-white p-1 shadow-2xl border-4 border-white">
                                    <img
                                        src={(selectedRestaurant as any).logoUrl || selectedRestaurant.image}
                                        alt="Logo"
                                        className="w-full h-full object-cover rounded-[24px]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-10 pt-16">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-900">{selectedRestaurant.name}</h2>
                                    <div className="flex items-center gap-4 mt-2">
                                        <div className="flex items-center gap-1.5 text-orange-500 font-bold text-sm bg-orange-50 px-3 py-1 rounded-full">
                                            <Star className="w-4 h-4 fill-orange-500" />
                                            <span>{selectedRestaurant.rating}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-slate-500 font-bold text-sm">
                                            <Tag className="w-4 h-4" />
                                            <span>{selectedRestaurant.category}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${selectedRestaurant.isActive !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                    {selectedRestaurant.isActive !== false ? 'Restaurante Activo' : 'Suspendido'}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-6 mt-10">
                                <div className="p-6 rounded-[32px] bg-slate-50 border border-slate-100">
                                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                                        <ShoppingBag className="w-5 h-5" />
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Pedidos</p>
                                    <h4 className="text-2xl font-black text-slate-900">{selectedRestaurant.totalOrders || 0}</h4>
                                </div>
                                <div className="p-6 rounded-[32px] bg-slate-50 border border-slate-100">
                                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
                                        <Box className="w-5 h-5" />
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Productos</p>
                                    <h4 className="text-2xl font-black text-slate-900">{selectedRestaurant.productsCount || 0}</h4>
                                </div>
                                <div className="p-6 rounded-[32px] bg-slate-50 border border-slate-100">
                                    <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mb-4">
                                        <Users className="w-5 h-5" />
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Seguidores</p>
                                    <h4 className="text-2xl font-black text-slate-900">{selectedRestaurant.followersCount || 0}</h4>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8 mt-10">
                                <div className="space-y-4">
                                    <h5 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-primary" /> Ubicación
                                    </h5>
                                    <p className="text-slate-500 font-medium leading-relaxed">
                                        Calle 2, Urb. Las Mercedes, Caracas, Venezuela.
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <h5 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <Phone className="w-4 h-4 text-primary" /> Contacto
                                    </h4>
                                    <p className="text-slate-500 font-medium">0412-7786837</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                            <button className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20">
                                EDITAR PERFIL COMPLETO
                            </button>
                            <button className="px-10 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-colors">
                                ENTRAR COMO RESTAURANTE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
