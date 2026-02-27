import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Store, CheckCircle, XCircle } from 'lucide-react';
import { Restaurant } from '../../lib/seed';

export default function RestaurantsManager() {
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRestaurants = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'restaurants'));
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Restaurant[];
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

    const toggleStatus = async (id: string, currentStatus: boolean | undefined) => {
        try {
            const newStatus = currentStatus === undefined ? false : !currentStatus;
            await updateDoc(doc(db, 'restaurants', id), {
                isActive: newStatus
            });
            // Update local state
            setRestaurants(prev => prev.map(r => r.id === id ? { ...r, isActive: newStatus } : r));
        } catch (error) {
            console.error("Error updating restaurant status:", error);
        }
    };

    if (loading) {
        return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-1/4"></div><div className="h-64 bg-slate-200 rounded"></div></div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">Gestión de Restaurantes</h1>
            <p className="text-slate-500">Activa o desactiva restaurantes en la plataforma.</p>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4">Restaurante</th>
                                <th className="px-6 py-4">Categoría</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                                <th className="px-6 py-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {restaurants.map((restaurant) => {
                                const isActive = restaurant.isActive !== false; // Default to true if undefined
                                return (
                                    <tr key={restaurant.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                                                    <img src={restaurant.image} alt={restaurant.name} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="font-bold text-slate-900">{restaurant.name}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">{restaurant.category}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                {isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                                {isActive ? 'Activo' : 'Suspendido'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => toggleStatus(restaurant.id, restaurant.isActive)}
                                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                            >
                                                {isActive ? 'Suspender' : 'Activar'}
                                            </button>
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
