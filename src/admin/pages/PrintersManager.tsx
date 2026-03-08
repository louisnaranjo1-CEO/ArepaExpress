import React, { useState, useEffect } from 'react';
import { Printer, Plus, Search, Trash2, Edit2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { requestUsbDevice } from '../../lib/usb-printer';

// @ts-nocheck
// WebUSB Types (basic polyfill for TS)
declare global {
    interface Navigator {
        usb?: {
            requestDevice(options: { filters: any[] }): Promise<any>;
            getDevices(): Promise<any[]>;
        };
    }
}

interface Station {
    id: string;
    name: string;
    categories: string[];
    isActive: boolean;
    createdAt: any;
    vendorId?: number;
    productId?: number;
    printerName?: string;
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
        categories: [] as string[],
        isActive: true,
        vendorId: undefined as number | undefined,
        productId: undefined as number | undefined,
        printerName: ''
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
                categories: station.categories || [],
                isActive: station.isActive,
                vendorId: station.vendorId,
                productId: station.productId,
                printerName: station.printerName || ''
            });
        } else {
            setEditingStation(null);
            setFormData({
                name: '',
                categories: [],
                isActive: true,
                vendorId: undefined,
                productId: undefined,
                printerName: ''
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
                            <span className={`px - 4 py - 1.5 rounded - full text - xs font - black uppercase tracking - widest ${station.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                                } `}>
                                {station.isActive ? 'Activa' : 'Inactiva'}
                            </span>
                        </div>

                        {station.printerName && (
                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-xs font-bold text-slate-500 truncate" title={station.printerName}>
                                    USB: {station.printerName}
                                </span>
                            </div>
                        )}
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

                                <div className="space-y-3">
                                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Categorías Asignadas</label>
                                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-4 rounded-[1.5rem] max-h-[200px] overflow-y-auto hide-scrollbar border-2 border-transparent focus-within:border-primary/10 transition-all">
                                        {['Arepas', 'Burgers', 'Sushi', 'Pizzas', 'Bebidas', 'Postres', 'Desayunos', 'Almuerzos', 'Cenas', 'Snacks', 'Jugos Naturales', 'Promociones', 'Combos'].map(cat => (
                                            <button
                                                key={cat}
                                                type="button"
                                                onClick={() => {
                                                    const exists = formData.categories.includes(cat);
                                                    setFormData({
                                                        ...formData,
                                                        categories: exists
                                                            ? formData.categories.filter(c => c !== cat)
                                                            : [...formData.categories, cat]
                                                    });
                                                }}
                                                className={`flex items - center gap - 2 px - 3 py - 2 rounded - xl text - xs font - bold transition - all ${formData.categories.includes(cat)
                                                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                                        : 'bg-white text-slate-500 border border-slate-100'
                                                    } `}
                                            >
                                                {cat}
                                                {formData.categories.includes(cat) && <Check className="w-3 h-3" />}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-medium px-2 italic">
                                        * Los productos de estas categorías se enviarán automáticamente a esta estación.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Conexión Física (Opcional)</label>
                                    <div className="bg-slate-50 p-4 rounded-[1.5rem] border-2 border-slate-100 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Printer className="w-5 h-5 text-slate-400" />
                                                <span className="font-bold text-slate-700">Impresora USB</span>
                                            </div>
                                            {formData.vendorId ? (
                                                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-xl flex items-center gap-1">
                                                    <Check className="w-3 h-3" /> Vinculada
                                                </span>
                                            ) : (
                                                <span className="px-3 py-1 bg-slate-200 text-slate-500 text-xs font-black rounded-xl">
                                                    No Vinculada
                                                </span>
                                            )}
                                        </div>

                                        {formData.printerName && (
                                            <p className="text-sm font-medium text-slate-600 truncate bg-white p-2 rounded-xl border border-slate-100">
                                                {formData.printerName}
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const device = await requestUsbDevice();
                                                if (device) {
                                                    setFormData({
                                                        ...formData,
                                                        vendorId: device.vendorId,
                                                        productId: device.productId,
                                                        printerName: device.name
                                                    });
                                                }
                                            }}
                                            className="w-full mt-2 bg-white border-2 border-primary/20 text-primary hover:bg-primary hover:text-white transition-colors py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                                        >
                                            <AlertCircle className="w-4 h-4" />
                                            {formData.vendorId ? 'Cambiar Impresora USB' : 'Vincular Impresora USB'}
                                        </button>
                                        <p className="text-[10px] text-slate-400 text-center uppercase tracking-wider font-bold">
                                            Requiere navegador compatible (Chrome/Edge)
                                        </p>
                                    </div>
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
