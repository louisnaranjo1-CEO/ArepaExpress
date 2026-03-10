import React, { useState, useEffect } from 'react';
import { Ticket, Plus, Trash2, MapPin, Calendar, Save, X, Globe, Map as MapIcon, Home, Gift } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface Raffle {
    id: string;
    title: string;
    description: string;
    prize: string;
    scope: 'national' | 'regional' | 'local';
    locationName?: string; // e.g., "Aragua" or "Maracay"
    drawDate: string;
    isActive: boolean;
    createdAt: any;
}

export default function RafflesManager() {
    const [raffles, setRaffles] = useState<Raffle[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newRaffle, setNewRaffle] = useState<Partial<Raffle>>({
        title: '',
        description: '',
        prize: '',
        scope: 'national',
        locationName: '',
        drawDate: '',
        isActive: true
    });

    useEffect(() => {
        fetchRaffles();
    }, []);

    const fetchRaffles = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'raffles'));
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Raffle));
            setRaffles(data);
        } catch (error) {
            console.error("Error fetching raffles:", error);
            toast.error("Error al cargar sorteos");
        } finally {
            setLoading(false);
        }
    };

    const handleAddRaffle = async () => {
        if (!newRaffle.title || !newRaffle.prize || !newRaffle.drawDate) {
            toast.error("Completa los campos obligatorios");
            return;
        }

        try {
            await addDoc(collection(db, 'raffles'), {
                ...newRaffle,
                createdAt: serverTimestamp()
            });
            toast.success("Sorteo creado");
            setShowAddModal(false);
            fetchRaffles();
            setNewRaffle({
                title: '',
                description: '',
                prize: '',
                scope: 'national',
                locationName: '',
                drawDate: '',
                isActive: true
            });
        } catch (error) {
            toast.error("Error al crear");
        }
    };

    const handleDeleteRaffle = async (id: string) => {
        if (!window.confirm("¿Eliminar este sorteo?")) return;
        try {
            await deleteDoc(doc(db, 'raffles', id));
            toast.success("Eliminado");
            fetchRaffles();
        } catch (error) {
            toast.error("Error al eliminar");
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto pb-24">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                        <Ticket className="w-8 h-8 text-primary" />
                        Sorteos y Rifas
                    </h1>
                    <p className="text-slate-500 font-medium">Gestiona sorteos nacionales, regionales y locales</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-primary text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" /> Nuevo Sorteo
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full flex justify-center py-12">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : raffles.length === 0 ? (
                    <div className="col-span-full p-12 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
                        <Ticket className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-400 font-bold">No hay sorteos programados</p>
                    </div>
                ) : (
                    raffles.map((raffle) => (
                        <div key={raffle.id} className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden group">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${raffle.scope === 'national' ? 'bg-blue-50 text-blue-500' :
                                            raffle.scope === 'regional' ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-500'
                                        }`}>
                                        {raffle.scope === 'national' ? <Globe className="w-6 h-6" /> :
                                            raffle.scope === 'regional' ? <MapIcon className="w-6 h-6" /> : <Home className="w-6 h-6" />}
                                    </div>
                                    <button onClick={() => handleDeleteRaffle(raffle.id)} className="p-2 text-slate-300 hover:text-red-500 rounded-xl transition-all">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                                <h3 className="text-xl font-black text-slate-800 mb-1">{raffle.title}</h3>
                                <p className="text-xs text-slate-500 font-medium mb-4 line-clamp-2">{raffle.description}</p>

                                <div className="space-y-3">
                                    <div className="bg-slate-50 p-3 rounded-2xl flex items-center gap-3">
                                        <Gift className="w-5 h-5 text-amber-500" />
                                        <div>
                                            <p className="text-[10px] text-slate-400 font-black uppercase leading-none mb-1">Premio</p>
                                            <p className="text-sm font-black text-slate-700">{raffle.prize}</p>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-2xl flex items-center gap-3">
                                        <Calendar className="w-5 h-5 text-indigo-500" />
                                        <div>
                                            <p className="text-[10px] text-slate-400 font-black uppercase leading-none mb-1">Fecha del Sorteo</p>
                                            <p className="text-sm font-black text-slate-700">{raffle.drawDate}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {raffle.scope === 'national' ? 'Nacional' : `${raffle.scope === 'regional' ? 'Regional' : 'Local'}: ${raffle.locationName}`}
                                </span>
                                <div className={`w-2 h-2 rounded-full ${raffle.isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal para añadir sorteo */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                            <h3 className="text-xl font-black text-slate-800">Nuevo Sorteo</h3>
                            <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-8 space-y-4">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Título</label>
                                    <input
                                        type="text"
                                        value={newRaffle.title}
                                        onChange={(e) => setNewRaffle({ ...newRaffle, title: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Alcance</label>
                                        <select
                                            value={newRaffle.scope}
                                            onChange={(e) => setNewRaffle({ ...newRaffle, scope: e.target.value as any })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold"
                                        >
                                            <option value="national">Nacional</option>
                                            <option value="regional">Regional (Estado)</option>
                                            <option value="local">Local (Municipio)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ubicación (Opcional)</label>
                                        <input
                                            type="text"
                                            value={newRaffle.locationName}
                                            onChange={(e) => setNewRaffle({ ...newRaffle, locationName: e.target.value })}
                                            placeholder="Ej: Aragua"
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Premio</label>
                                    <input
                                        type="text"
                                        value={newRaffle.prize}
                                        onChange={(e) => setNewRaffle({ ...newRaffle, prize: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Fecha del Sorteo</label>
                                    <input
                                        type="date"
                                        value={newRaffle.drawDate}
                                        onChange={(e) => setNewRaffle({ ...newRaffle, drawDate: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleAddRaffle}
                                className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
                            >
                                <Save className="w-5 h-5" /> Guardar Sorteo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
