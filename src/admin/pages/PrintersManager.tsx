import React, { useState, useEffect } from 'react';
import { Printer, Plus, Search, Trash2, Edit2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

interface Station {
    id: string;
    name: string;
    isActive: boolean;
    createdAt: any;
}

export default function PrintersManager() {
    const { user } = useAuth();
    const [stations, setStations] = useState<Station[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStation, setEditingStation] = useState<Station | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        isActive: true
    });

    useEffect(() => {
        if (!user) return;

        const stationsRef = collection(db, 'restaurants', user.uid, 'printers');
        const q = query(stationsRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items: Station[] = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() } as Station);
            });
            setStations(items.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleOpenModal = (station?: Station) => {
        if (station) {
            setEditingStation(station);
            setFormData({
                name: station.name,
                isActive: station.isActive
            });
        } else {
            setEditingStation(null);
            setFormData({
                name: '',
                isActive: true
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !formData.name.trim()) return;

        setSubmitting(true);
        try {
            const stationsRef = collection(db, 'restaurants', user.uid, 'printers');

            if (editingStation) {
                await updateDoc(doc(db, 'restaurants', user.uid, 'printers', editingStation.id), {
                    ...formData,
                    updatedAt: new Date()
                });
            } else {
                await addDoc(stationsRef, {
                    ...formData,
                    createdAt: new Date()
                });
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error("Error saving station:", error);
            alert("Error al guardar la estación");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!user || !window.confirm('¿Estás seguro de eliminar esta estación?')) return;

        try {
            await deleteDoc(doc(db, 'restaurants', user.uid, 'printers', id));
        } catch (error) {
            console.error("Error deleting station:", error);
            alert("Error al eliminar la estación");
        }
    };

    const filteredStations = stations.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando estaciones...</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Estaciones de Impresión</h1>
                    <p className="text-slate-500 font-medium">Gestiona los puntos de preparación (Cocina, Barra, etc.)</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-105 transition-transform active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    Nueva Estación
                </button>
            </div>

            {/* Search and Filters */}
            <div className="bg-white p-4 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar estación..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-primary/20 font-medium"
                    />
                </div>
            </div>

            {/* Stations List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredStations.map((station) => (
                    <div
                        key={station.id}
                        className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 group hover:border-primary/20 transition-all"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-primary/10 transition-colors">
                                <Printer className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleOpenModal(station)}
                                    className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                                >
                                    <Edit2 className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => handleDelete(station.id)}
                                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <h3 className="text-xl font-black text-slate-800 mb-2">{station.name}</h3>

                        <div className="flex items-center justify-between">
                            <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${station.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                                }`}>
                                {station.isActive ? 'Activa' : 'Inactiva'}
                            </span>
                        </div>
                    </div>
                ))}

                {filteredStations.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                        <Printer className="w-12 h-12 text-slate-300 mb-4" />
                        <p className="text-slate-500 font-bold text-center px-4">
                            {searchTerm ? 'No se encontraron estaciones para tu búsqueda' : 'No hay estaciones configuradas aún. ¡Crea la primera!'}
                        </p>
                    </div>
                )}
            </div>

            {/* Modal for Add/Edit */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-2xl font-black text-slate-900">
                                    {editingStation ? 'Editar Estación' : 'Nueva Estación'}
                                </h2>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="p-2 hover:bg-slate-100 rounded-2xl transition-all"
                                >
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Nombre de la Estación</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Ej: Cocina Principal, Barra de Bebidas..."
                                        className="w-full px-6 py-4 bg-slate-50 border-none rounded-[1.5rem] focus:ring-4 focus:ring-primary/10 font-bold text-lg"
                                    />
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-[1.5rem]">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        className="w-5 h-5 rounded-lg border-slate-300 text-primary focus:ring-primary/20"
                                    />
                                    <label htmlFor="isActive" className="text-sm font-bold text-slate-700">La estación está operativa</label>
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-primary text-white py-4 rounded-[1.5rem] font-black text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <Check className="w-5 h-5" />
                                    )}
                                    {editingStation ? 'Guardar Cambios' : 'Crear Estación'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
