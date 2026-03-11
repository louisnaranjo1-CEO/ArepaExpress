import React, { useState, useEffect } from 'react';
import { Gift, Plus, Trash2, Edit2, Share2, Users, Target, Save, X } from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import toast from 'react-hot-toast';

interface ReferralContest {
    id: string;
    title: string;
    description: string;
    type: 'referral_count' | 'restaurant_share';
    targetCount: number;
    prize: string;
    isActive: boolean;
    createdAt: any;
}

export interface Prize {
    id: string;
    title: string;
    imageUrl: string;
}

export interface GlobalLoyaltyBanner {
    isActive: boolean;
    title: string;
    explanation: string;
    prizes: Prize[];
}

export default function FidelizationManager() {
    const [contests, setContests] = useState<ReferralContest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newContest, setNewContest] = useState<Partial<ReferralContest>>({
        title: '',
        description: '',
        type: 'referral_count',
        targetCount: 10,
        prize: '',
        isActive: true
    });

    const [globalBanner, setGlobalBanner] = useState<GlobalLoyaltyBanner>({
        isActive: false,
        title: '',
        explanation: '',
        prizes: []
    });
    const [savingBanner, setSavingBanner] = useState(false);
    const [addingPrize, setAddingPrize] = useState(false);
    const [newPrize, setNewPrize] = useState({ title: '', image: null as File | null });

    useEffect(() => {
        fetchContests();
        fetchGlobalBanner();
    }, []);

    const fetchGlobalBanner = async () => {
        try {
            const docRef = doc(db, 'cpanel_settings', 'fidelization_banner');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setGlobalBanner(docSnap.data() as GlobalLoyaltyBanner);
            }
        } catch (error) {
            console.error("Error fetching global banner", error);
        }
    };

    const handleSaveGlobalBanner = async () => {
        setSavingBanner(true);
        try {
            await setDoc(doc(db, 'cpanel_settings', 'fidelization_banner'), globalBanner);
            toast.success("Configuración de banner guardada");
        } catch (error) {
            console.error(error);
            toast.error("Error guardando banner");
        } finally {
            setSavingBanner(false);
        }
    };

    const handleAddPrize = async () => {
        if (!newPrize.title || !newPrize.image) {
            toast.error("Coloca el título y selecciona una imagen");
            return;
        }
        setAddingPrize(true);
        try {
            const imageRef = ref(storage, `loyalty_prizes/${Date.now()}_${newPrize.image.name}`);
            await uploadBytes(imageRef, newPrize.image);
            const imageUrl = await getDownloadURL(imageRef);

            setGlobalBanner(prev => ({
                ...prev,
                prizes: [...(prev.prizes || []), {
                    id: Date.now().toString(),
                    title: newPrize.title,
                    imageUrl
                }]
            }));

            setNewPrize({ title: '', image: null });
            toast.success("Premio añadido a la lista. Recuerda guardar.");
        } catch (error) {
            toast.error("Error subiendo la imagen del premio");
        } finally {
            setAddingPrize(false);
        }
    };

    const handleRemovePrize = (id: string) => {
        setGlobalBanner(prev => ({
            ...prev,
            prizes: (prev.prizes || []).filter(p => p.id !== id)
        }));
    };

    const fetchContests = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'referral_contests'));
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReferralContest));
            setContests(data);
        } catch (error) {
            console.error("Error fetching contests:", error);
            toast.error("Error al cargar concursos");
        } finally {
            setLoading(false);
        }
    };

    const handleAddContest = async () => {
        if (!newContest.title || !newContest.prize) {
            toast.error("Completa los campos obligatorios");
            return;
        }

        try {
            await addDoc(collection(db, 'referral_contests'), {
                ...newContest,
                createdAt: serverTimestamp()
            });
            toast.success("Concurso creado");
            setShowAddModal(false);
            fetchContests();
        } catch (error) {
            console.error("Error creating contest:", error);
            toast.error("Error al crear");
        }
    };

    const handleDeleteContest = async (id: string) => {
        if (!window.confirm("¿Seguro que quieres eliminar este concurso?")) return;
        try {
            await deleteDoc(doc(db, 'referral_contests', id));
            toast.success("Eliminado");
            fetchContests();
        } catch (error) {
            toast.error("Error al eliminar");
        }
    };

    const toggleStatus = async (contest: ReferralContest) => {
        try {
            await updateDoc(doc(db, 'referral_contests', contest.id), {
                isActive: !contest.isActive
            });
            fetchContests();
        } catch (error) {
            toast.error("Error al actualizar");
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto pb-24">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                        <Gift className="w-8 h-8 text-primary" />
                        Gestión de Fidelización
                    </h1>
                    <p className="text-slate-500 font-medium">Configura sistemas de puntos y concursos de referidos</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-primary text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" /> Nuevo Concurso
                </button>
            </div>

            {/* Quick Stats/Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-4">
                        <Target className="w-6 h-6" />
                    </div>
                    <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest">Ratio de Puntos</h3>
                    <p className="text-2xl font-black text-slate-800">2.5 pts / $1.00</p>
                    <p className="text-[10px] text-slate-400 mt-1">Configuración Estándar</p>
                </div>
                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mb-4">
                        <Users className="w-6 h-6" />
                    </div>
                    <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest">Concursos Activos</h3>
                    <p className="text-2xl font-black text-slate-800">{contests.filter(c => c.isActive).length}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Sistemas de Referidos</p>
                </div>
                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-4">
                        <Share2 className="w-6 h-6" />
                    </div>
                    <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest">Total Referidos</h3>
                    <p className="text-2xl font-black text-slate-800">--</p>
                    <p className="text-[10px] text-slate-400 mt-1">Métrica Global</p>
                </div>
            </div>

            {/* Global Loyalty Banner Configuration */}
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-8">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                    <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Banner Público App (Pantalla Fidelización)</h3>
                        <p className="text-xs text-slate-500 font-medium">Configura el banner y la pantalla de premios para tus clientes</p>
                    </div>
                </div>
                <div className="p-6 space-y-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado del anuncio</label>
                                <div className="mt-1">
                                    <button
                                        onClick={() => setGlobalBanner(p => ({ ...p, isActive: !p.isActive }))}
                                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${globalBanner.isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}
                                    >
                                        {globalBanner.isActive ? 'Activo' : 'Inactivo'}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título del Banner</label>
                                <input
                                    type="text"
                                    value={globalBanner.title}
                                    onChange={(e) => setGlobalBanner(p => ({ ...p, title: e.target.value }))}
                                    placeholder="Ej: Gana grandes premios utilizando la aplicación"
                                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 text-sm mt-1 focus:border-primary focus:bg-white transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Explicación Completa</label>
                                <textarea
                                    value={globalBanner.explanation}
                                    onChange={(e) => setGlobalBanner(p => ({ ...p, explanation: e.target.value }))}
                                    placeholder="Explicación del premio y cómo ganar puntos..."
                                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none font-medium text-slate-700 text-sm mt-1 focus:border-primary focus:bg-white transition-all min-h-[100px]"
                                />
                            </div>
                        </div>

                        {/* Prizes section */}
                        <div className="flex-1 space-y-4 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                            <h4 className="font-black text-slate-700 text-sm mb-4">Premios Visibles</h4>

                            <div className="space-y-3">
                                {globalBanner.prizes?.map((prize) => (
                                    <div key={prize.id} className="bg-white p-3 rounded-2xl flex items-center gap-3 shadow-sm border border-slate-100">
                                        <img src={prize.imageUrl} alt="Premio" className="w-12 h-12 object-cover rounded-xl" />
                                        <div className="flex-1 font-bold text-slate-700 text-sm">{prize.title}</div>
                                        <button onClick={() => handleRemovePrize(prize.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}

                                {/* Add new prize inline */}
                                <div className="bg-white p-4 rounded-2xl border-2 border-dashed border-slate-200 mt-4 space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Ej: Televisor 55 o 100$"
                                        value={newPrize.title}
                                        onChange={e => setNewPrize(p => ({ ...p, title: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl text-sm outline-none"
                                    />
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={e => setNewPrize(p => ({ ...p, image: e.target.files?.[0] || null }))}
                                        className="text-xs text-slate-500 w-full"
                                    />
                                    <button
                                        onClick={handleAddPrize}
                                        disabled={addingPrize}
                                        className="w-full bg-indigo-50 text-indigo-600 font-bold py-2 rounded-xl text-xs hover:bg-indigo-100 transition-colors flex justify-center items-center gap-2"
                                    >
                                        {addingPrize ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : <Plus className="w-4 h-4" />}
                                        Añadir Premio
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleSaveGlobalBanner}
                        disabled={savingBanner}
                        className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-lg hover:scale-[1.01] active:scale-95 transition-all flex justify-center items-center gap-2"
                    >
                        {savingBanner ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-5 h-5" />}
                        Guardar Configuración Pública
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50">
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Concursos de Referidos</h3>
                </div>

                {loading ? (
                    <div className="p-12 flex justify-center">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : contests.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="text-slate-400 font-bold">No hay concursos configurados</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {contests.map((contest) => (
                            <div key={contest.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-start gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${contest.type === 'referral_count' ? 'bg-blue-50 text-blue-500' : 'bg-purple-50 text-purple-500'}`}>
                                        {contest.type === 'referral_count' ? <Users className="w-6 h-6" /> : <Share2 className="w-6 h-6" />}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-800">{contest.title}</h4>
                                        <p className="text-xs text-slate-500 font-medium mb-2">{contest.description}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-black text-slate-500 uppercase">{contest.type === 'referral_count' ? 'Por cantidad' : 'Por compartir'}</span>
                                            <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase">Premio: {contest.prize}</span>
                                            <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-black uppercase">Meta: {contest.targetCount}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleStatus(contest)}
                                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${contest.isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}
                                    >
                                        {contest.isActive ? 'Activo' : 'Inactivo'}
                                    </button>
                                    <button onClick={() => handleDeleteContest(contest.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal para añadir concurso */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Nuevo Concurso</h3>
                            <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-8 space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título del Concurso</label>
                                    <input
                                        type="text"
                                        value={newContest.title}
                                        onChange={(e) => setNewContest({ ...newContest, title: e.target.value })}
                                        placeholder="Ej: iPhones 13 para los mejores referidores"
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all font-mono text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descripción</label>
                                    <textarea
                                        value={newContest.description}
                                        onChange={(e) => setNewContest({ ...newContest, description: e.target.value })}
                                        placeholder="Reglas del concurso..."
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm min-h-[100px]"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                                        <select
                                            value={newContest.type}
                                            onChange={(e) => setNewContest({ ...newContest, type: e.target.value as any })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                        >
                                            <option value="referral_count">Cantidad de Referidos</option>
                                            <option value="restaurant_share">Compartir Restaurante</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Meta (Target)</label>
                                        <input
                                            type="number"
                                            value={newContest.targetCount}
                                            onChange={(e) => setNewContest({ ...newContest, targetCount: parseInt(e.target.value) })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Premio</label>
                                    <input
                                        type="text"
                                        value={newContest.prize}
                                        onChange={(e) => setNewContest({ ...newContest, prize: e.target.value })}
                                        placeholder="Ej: iPhone 13 Pro Max"
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleAddContest}
                                className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
                            >
                                <Save className="w-5 h-5" /> Guardar Concurso
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
