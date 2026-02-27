import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Trash2, Plus, Image as ImageIcon } from 'lucide-react';

export default function BannersManager() {
    const [banners, setBanners] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newBanner, setNewBanner] = useState({ imageUrl: '', title: '', linkUrl: '' });

    const fetchBanners = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'banners'));
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setBanners(data);
        } catch (error) {
            console.error("Error fetching banners: ", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBanners();
    }, []);

    const handleAddBanner = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'banners'), {
                ...newBanner,
                createdAt: new Date(),
                isActive: true
            });
            setIsAdding(false);
            setNewBanner({ imageUrl: '', title: '', linkUrl: '' });
            fetchBanners();
        } catch (error) {
            console.error("Error adding banner: ", error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar este banner?")) return;
        try {
            await deleteDoc(doc(db, 'banners', id));
            setBanners(prev => prev.filter(b => b.id !== id));
        } catch (error) {
            console.error("Error deleting banner: ", error);
        }
    };

    if (loading) {
        return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-1/4"></div><div className="h-64 bg-slate-200 rounded"></div></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Gestión de Banners</h1>
                    <p className="text-slate-500">Administra los anuncios publicitarios de la aplicación cliente.</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition-colors font-bold"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Banner
                </button>
            </div>

            {isAdding && (
                <form onSubmit={handleAddBanner} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h2 className="font-bold text-slate-900 text-lg">Agregar Nuevo Banner</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Título / Nombre Interno</label>
                            <input
                                type="text"
                                required
                                value={newBanner.title}
                                onChange={e => setNewBanner({ ...newBanner, title: e.target.value })}
                                className="w-full border border-slate-300 rounded-xl px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                                placeholder="Ej: Promo San Valentín"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">URL de la Imagen</label>
                            <input
                                type="url"
                                required
                                value={newBanner.imageUrl}
                                onChange={e => setNewBanner({ ...newBanner, imageUrl: e.target.value })}
                                className="w-full border border-slate-300 rounded-xl px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                                placeholder="https://..."
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Enlace de destino (opcional)</label>
                            <input
                                type="url"
                                value={newBanner.linkUrl}
                                onChange={e => setNewBanner({ ...newBanner, linkUrl: e.target.value })}
                                className="w-full border border-slate-300 rounded-xl px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                                placeholder="https://instagram.com/..."
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 font-medium">Cancelar</button>
                        <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-500">Guardar</button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {banners.map((banner) => (
                    <div key={banner.id} className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative group">
                        <div className="aspect-[21/9] bg-slate-100 relative overflow-hidden">
                            {banner.imageUrl ? (
                                <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                    <ImageIcon className="w-8 h-8" />
                                </div>
                            )}
                        </div>
                        <div className="p-4">
                            <h3 className="font-bold text-slate-900">{banner.title}</h3>
                            {banner.linkUrl ? (
                                <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-sm hover:underline truncate block">
                                    {banner.linkUrl}
                                </a>
                            ) : (
                                <p className="text-slate-400 text-sm">Sin enlace</p>
                            )}
                        </div>

                        {/* Quick Actions overlay */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => handleDelete(banner.id)}
                                className="bg-white/90 backdrop-blur text-red-600 p-2 rounded-lg shadow-sm hover:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}

                {banners.length === 0 && !isAdding && (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                        No hay banners activos. Crea uno para empezar.
                    </div>
                )}
            </div>
        </div>
    );
}
