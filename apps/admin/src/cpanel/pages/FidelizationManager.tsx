import React, { useState, useEffect } from 'react';
import { Gift, Plus, Trash2, Edit2, Share2, Users, Target, Save, X, Upload, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';

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

interface GlobalPrize {
    id: string;
    title: string;
    description: string;
    pointsRequired: number;
    imageUrl: string;
    isActive: boolean;
    createdAt: any;
}

export default function FidelizationManager() {
    const [contests, setContests] = useState<ReferralContest[]>([]);
    const [prizes, setPrizes] = useState<GlobalPrize[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showAddPrizeModal, setShowAddPrizeModal] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [pointsPerReferral, setPointsPerReferral] = useState<number>(200);
    const [savingPoints, setSavingPoints] = useState(false);

    const [newContest, setNewContest] = useState<Partial<ReferralContest>>({
        title: '',
        description: '',
        type: 'referral_count',
        targetCount: 10,
        prize: '',
        isActive: true
    });

    const [newPrize, setNewPrize] = useState<Partial<GlobalPrize>>({
        title: '',
        description: '',
        pointsRequired: 1000,
        imageUrl: '',
        isActive: true
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [contestsRes, prizesRes, configRes] = await Promise.all([
                supabase.from('referral_contests').select('*').order('created_at', { ascending: false }),
                supabase.from('global_prizes').select('*').order('created_at', { ascending: false }),
                supabase.from('app_settings').select('*').eq('id', 'fidelization').maybeSingle()
            ]);

            if (configRes.data?.data?.pointsPerReferral !== undefined) {
                setPointsPerReferral(configRes.data.data.pointsPerReferral);
            }

            setContests((contestsRes.data || []).map(c => ({
                id: c.id,
                title: c.title,
                description: c.description,
                type: c.type,
                targetCount: c.target_count || c.targetCount,
                prize: c.prize,
                isActive: c.is_active !== undefined ? c.is_active : c.isActive,
                createdAt: c.created_at
            })));

            setPrizes((prizesRes.data || []).map(p => ({
                id: p.id,
                title: p.title,
                description: p.description,
                pointsRequired: p.points_required || p.pointsRequired,
                imageUrl: p.image_url || p.imageUrl,
                isActive: p.is_active !== undefined ? p.is_active : p.isActive,
                createdAt: p.created_at
            })));
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Error al cargar datos");
        } finally {
            setLoading(false);
        }
    };

    const handleSavePoints = async () => {
        setSavingPoints(true);
        try {
            const { error } = await supabase.from('app_settings').upsert({
                id: 'fidelization',
                data: { pointsPerReferral },
                updated_at: new Date().toISOString()
            });
            if (error) throw error;
            toast.success("Puntos de referido actualizados");
        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar puntos");
        } finally {
            setSavingPoints(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingImage(true);
        try {
            const filePath = `global_prizes/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
            setNewPrize({ ...newPrize, imageUrl: pubData.publicUrl });
            toast.success('Imagen subida correctamente');
        } catch (error) {
            console.error('Error uploading image', error);
            toast.error('Error al subir imagen');
        } finally {
            setUploadingImage(false);
        }
    };

    const handleAddContest = async () => {
        if (!newContest.title || !newContest.prize) {
            toast.error("Completa los campos obligatorios");
            return;
        }

        try {
            const { error } = await supabase.from('referral_contests').insert([{
                title: newContest.title,
                description: newContest.description,
                type: newContest.type,
                target_count: newContest.targetCount,
                prize: newContest.prize,
                is_active: newContest.isActive !== false,
                created_at: new Date().toISOString()
            }]);
            if (error) throw error;
            toast.success("Concurso creado");
            setShowAddModal(false);
            fetchData();
        } catch (error) {
            console.error("Error creating contest:", error);
            toast.error("Error al crear");
        }
    };

    const handleAddPrize = async () => {
        if (!newPrize.title || !newPrize.pointsRequired || !newPrize.imageUrl) {
            toast.error("El título, los puntos y la imagen son obligatorios");
            return;
        }

        try {
            const { error } = await supabase.from('global_prizes').insert([{
                title: newPrize.title,
                description: newPrize.description,
                points_required: newPrize.pointsRequired,
                image_url: newPrize.imageUrl,
                is_active: newPrize.isActive !== false,
                created_at: new Date().toISOString()
            }]);
            if (error) throw error;
            toast.success("Premio global creado");
            setShowAddPrizeModal(false);
            setNewPrize({
                title: '',
                description: '',
                pointsRequired: 1000,
                imageUrl: '',
                isActive: true
            });
            fetchData();
        } catch (error) {
            console.error("Error creating prize:", error);
            toast.error("Error al crear premio");
        }
    };

    const handleDeleteContest = async (id: string) => {
        if (!window.confirm("¿Seguro que quieres eliminar este concurso?")) return;
        try {
            const { error } = await supabase.from('referral_contests').delete().eq('id', id);
            if (error) throw error;
            toast.success("Eliminado");
            fetchData();
        } catch (error) {
            toast.error("Error al eliminar");
        }
    };

    const handleDeletePrize = async (id: string) => {
        if (!window.confirm("¿Seguro que quieres eliminar este premio?")) return;
        try {
            const { error } = await supabase.from('global_prizes').delete().eq('id', id);
            if (error) throw error;
            toast.success("Premio eliminado");
            fetchData();
        } catch (error) {
            toast.error("Error al eliminar premio");
        }
    };

    const toggleContestStatus = async (contest: ReferralContest) => {
        try {
            const { error } = await supabase.from('referral_contests').update({
                is_active: !contest.isActive
            }).eq('id', contest.id);
            if (error) throw error;
            fetchData();
        } catch (error) {
            toast.error("Error al actualizar");
        }
    };

    const togglePrizeStatus = async (prize: GlobalPrize) => {
        try {
            const { error } = await supabase.from('global_prizes').update({
                is_active: !prize.isActive
            }).eq('id', prize.id);
            if (error) throw error;
            fetchData();
        } catch (error) {
            toast.error("Error al actualizar");
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto pb-24">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                        <Gift className="w-8 h-8 text-slate-900" />
                        Gestión de Fidelización
                    </h1>
                    <p className="text-slate-500 font-medium">Configura DeliPuntos Globales y concursos de referidos</p>
                </div>
            </div>

            {/* Quick Stats/Info */}
            <div className="bg-white rounded-[2.5rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h3 className="text-slate-900 font-black text-lg">Puntos por Nuevo Referido</h3>
                    <p className="text-sm text-slate-500">¿Cuántos puntos recibe el usuario que comparte su código?</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <input 
                        type="number" 
                        value={pointsPerReferral}
                        onChange={(e) => setPointsPerReferral(parseInt(e.target.value) || 0)}
                        className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-black text-slate-900 w-32 outline-none focus:border-primary transition-all text-center"
                    />
                    <button 
                        onClick={handleSavePoints}
                        disabled={savingPoints}
                        className="bg-primary text-slate-900 px-6 py-3 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {savingPoints ? "Guardando..." : "Guardar"}
                    </button>
                </div>
            </div>

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
                        <Gift className="w-6 h-6" />
                    </div>
                    <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest">Premios Globales</h3>
                    <p className="text-2xl font-black text-slate-800">{prizes.filter(p => p.isActive).length}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Activos para canjear</p>
                </div>
                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4">
                        <Users className="w-6 h-6" />
                    </div>
                    <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest">Concursos Activos</h3>
                    <p className="text-2xl font-black text-slate-800">{contests.filter(c => c.isActive).length}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Sistemas de Referidos</p>
                </div>
            </div>

            {/* PREMIOS GLOBALES */}
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-8">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm flex items-center gap-2">
                        <Gift className="w-5 h-5 text-slate-900" />
                        Premios Globales (DeliPuntos)
                    </h3>
                    <button
                        onClick={() => setShowAddPrizeModal(true)}
                        className="bg-primary text-slate-900 px-4 py-2 rounded-xl text-sm font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Nuevo Premio
                    </button>
                </div>

                {loading ? (
                    <div className="p-12 flex justify-center">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : prizes.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="text-slate-400 font-bold">No hay premios globales configurados</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {prizes.map((prize) => (
                            <div key={prize.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-slate-100">
                                        {prize.imageUrl ? (
                                            <img src={prize.imageUrl} alt={prize.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                                                <ImageIcon className="w-8 h-8" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-800 text-lg">{prize.title}</h4>
                                        <p className="text-xs text-slate-500 font-medium mb-2 line-clamp-1">{prize.description}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase flex items-center gap-1">
                                                <Target className="w-3 h-3" /> {prize.pointsRequired} Puntos
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => togglePrizeStatus(prize)}
                                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${prize.isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}
                                    >
                                        {prize.isActive ? 'Activo' : 'Inactivo'}
                                    </button>
                                    <button onClick={() => handleDeletePrize(prize.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* CONCURSOS DE REFERIDOS */}
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-500" />
                        Concursos de Referidos
                    </h3>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="bg-primary text-slate-900 px-4 py-2 rounded-xl text-sm font-black shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Nuevo Concurso
                    </button>
                </div>

                {loading ? (
                    <div className="p-12 flex justify-center">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : contests.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="text-slate-400 font-bold">No hay concursos de referidos configurados</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {contests.map((contest) => (
                            <div key={contest.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-start gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${contest.type === 'referral_count' ? 'bg-blue-50 text-blue-500' : 'bg-purple-50 text-primary'}`}>
                                        {contest.type === 'referral_count' ? <Users className="w-6 h-6" /> : <Share2 className="w-6 h-6" />}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-800">{contest.title}</h4>
                                        <p className="text-xs text-slate-500 font-medium mb-2">{contest.description}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-black text-slate-500 uppercase">{contest.type === 'referral_count' ? 'Por cantidad' : 'Por compartir'}</span>
                                            <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase">Premio: {contest.prize}</span>
                                            <span className="text-[10px] bg-indigo-100 text-primary px-2 py-0.5 rounded-full font-black uppercase">Meta: {contest.targetCount}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleContestStatus(contest)}
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

            {/* Modal para añadir premio global */}
            {showAddPrizeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white z-10">
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                <Gift className="w-6 h-6 text-slate-900" />
                                Nuevo Premio Global
                            </h3>
                            <button onClick={() => setShowAddPrizeModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-8 space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título del Premio</label>
                                    <input
                                        type="text"
                                        value={newPrize.title}
                                        onChange={(e) => setNewPrize({ ...newPrize, title: e.target.value })}
                                        placeholder="Ej: Sorteo Moto Bera 2024"
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descripción</label>
                                    <textarea
                                        value={newPrize.description}
                                        onChange={(e) => setNewPrize({ ...newPrize, description: e.target.value })}
                                        placeholder="Detalles de cómo ganar..."
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm min-h-[100px]"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Puntos Requeridos (DeliPuntos)</label>
                                    <input
                                        type="number"
                                        value={newPrize.pointsRequired}
                                        onChange={(e) => setNewPrize({ ...newPrize, pointsRequired: parseInt(e.target.value) })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Imagen del Premio</label>
                                    <div className="relative group rounded-3xl overflow-hidden border-2 border-dashed border-slate-200 aspect-video bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-center">
                                        {newPrize.imageUrl ? (
                                            <>
                                                <img src={newPrize.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <span className="text-white font-bold flex items-center gap-2">
                                                        <Edit2 className="w-5 h-5" /> Cambiar
                                                    </span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center p-6">
                                                <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 text-slate-900">
                                                    {uploadingImage ? (
                                                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                                    ) : (
                                                        <Upload className="w-8 h-8" />
                                                    )}
                                                </div>
                                                <p className="text-sm font-bold text-slate-600">Sube una imagen</p>
                                                <p className="text-xs text-slate-400 mt-1">PNG, JPG hasta 5MB</p>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            onChange={handleImageUpload}
                                            disabled={uploadingImage}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleAddPrize}
                                disabled={uploadingImage}
                                className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                            >
                                <Save className="w-5 h-5" /> Guardar Premio Global
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para añadir concurso referidos */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white z-10">
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                <Users className="w-6 h-6 text-blue-500" /> Nuevo Concurso
                            </h3>
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
                                        placeholder="Ej: iPhones 13 para referidores"
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all font-mono text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descripción</label>
                                    <textarea
                                        value={newContest.description}
                                        onChange={(e) => setNewContest({ ...newContest, description: e.target.value })}
                                        placeholder="Reglas del concurso..."
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm min-h-[100px]"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                                        <select
                                            value={newContest.type}
                                            onChange={(e) => setNewContest({ ...newContest, type: e.target.value as any })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
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
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
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
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleAddContest}
                                className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
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
