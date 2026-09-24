import React, { useState, useEffect } from 'react';
import { 
    Gift, Plus, Trash2, Edit2, Share2, Users, Target, Save, X, Upload, 
    AlertCircle, Image as ImageIcon, Globe, Map as MapIcon, MapPin, Award, RefreshCw 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import { toast } from 'react-hot-toast';

interface ReferralContest {
    id: string;
    title: string;
    description: string;
    type: 'referral_count' | 'restaurant_share';
    targetCount: number;
    prize: string;
    prizeImageUrl?: string;
    scope?: 'national' | 'regional' | 'local';
    targetState?: string;
    targetCity?: string;
    locationName?: string;
    pointsCost?: number;
    isActive: boolean;
    createdAt: any;
}

export default function FidelizationManager() {
    const [contests, setContests] = useState<ReferralContest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [uploadingContestImage, setUploadingContestImage] = useState(false);
    const [pointsPerReferral, setPointsPerReferral] = useState<number>(200);
    const [pointsPerDollar, setPointsPerDollar] = useState<number>(2.5);
    const [pointsEnabled, setPointsEnabled] = useState<boolean>(true);
    const [savingPoints, setSavingPoints] = useState(false);

    const [newContest, setNewContest] = useState<{
        title: string;
        description: string;
        type: 'referral_count' | 'restaurant_share';
        targetCount: number;
        prize: string;
        prizeImageUrl: string;
        scope: 'national' | 'regional' | 'local';
        targetState: string;
        targetCity: string;
        locationName: string;
        pointsCost: number;
        isActive: boolean;
    }>({
        title: '',
        description: '',
        type: 'referral_count',
        targetCount: 10,
        prize: '',
        prizeImageUrl: '',
        scope: 'national',
        targetState: '',
        targetCity: '',
        locationName: 'Nacional',
        pointsCost: 0,
        isActive: true
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [contestsRes, configRes] = await Promise.all([
                supabase.from('referral_contests').select('*').order('created_at', { ascending: false }),
                supabase.from('app_settings').select('*').eq('id', 'fidelization').maybeSingle()
            ]);

            if (configRes.data?.data) {
                const cfg = configRes.data.data;
                if (cfg.pointsPerReferral !== undefined) setPointsPerReferral(Number(cfg.pointsPerReferral));
                if (cfg.pointsPerDollar !== undefined) setPointsPerDollar(Number(cfg.pointsPerDollar));
                if (cfg.pointsEnabled !== undefined) setPointsEnabled(Boolean(cfg.pointsEnabled));
            }

            setContests((contestsRes.data || []).map(c => ({
                id: c.id,
                title: c.title,
                description: c.description,
                type: c.type,
                targetCount: c.target_count || c.targetCount,
                prize: c.prize,
                prizeImageUrl: c.prize_image_url || c.prizeImageUrl || '',
                scope: c.scope || 'national',
                targetState: c.target_state || c.targetState || '',
                targetCity: c.target_city || c.targetCity || '',
                locationName: c.location_name || c.locationName || '',
                pointsCost: c.points_cost !== undefined ? Number(c.points_cost) : (c.pointsCost || 0),
                isActive: c.is_active !== undefined ? c.is_active : c.isActive,
                createdAt: c.created_at
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
                data: { 
                    pointsPerReferral: Number(pointsPerReferral),
                    pointsPerDollar: Number(pointsPerDollar),
                    pointsEnabled: Boolean(pointsEnabled)
                },
                updated_at: new Date().toISOString()
            });
            if (error) throw error;
            toast.success("Configuración de fidelización guardada con éxito");
        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar configuración de fidelización");
        } finally {
            setSavingPoints(false);
        }
    };

    const handleContestImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingContestImage(true);
        try {
            const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const filePath = `contests/${Date.now()}_${cleanName}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
            setNewContest(prev => ({ ...prev, prizeImageUrl: pubData.publicUrl }));
            toast.success('Imagen del premio subida con éxito');
        } catch (error) {
            console.error('Error uploading contest image', error);
            toast.error('Error al subir imagen');
        } finally {
            setUploadingContestImage(false);
        }
    };

    const handleAddContest = async () => {
        if (!newContest.title || !newContest.prize) {
            toast.error("El título y el premio son obligatorios");
            return;
        }

        if (newContest.scope === 'regional' && !newContest.targetState) {
            toast.error("Selecciona el estado para el concurso estatal");
            return;
        }

        if (newContest.scope === 'local' && (!newContest.targetState || !newContest.targetCity)) {
            toast.error("Selecciona el estado y la ciudad para el concurso local");
            return;
        }

        try {
            const computedLocation = newContest.scope === 'national'
                ? 'Nacional'
                : newContest.scope === 'regional'
                ? newContest.targetState
                : (newContest.targetCity ? `${newContest.targetCity}, ${newContest.targetState}` : newContest.targetState);

            const { error } = await supabase.from('referral_contests').insert([{
                title: newContest.title,
                description: newContest.description,
                type: newContest.type,
                target_count: newContest.targetCount,
                prize: newContest.prize,
                prize_image_url: newContest.prizeImageUrl || null,
                scope: newContest.scope || 'national',
                location_name: computedLocation || newContest.locationName || 'Nacional',
                target_state: newContest.targetState || null,
                target_city: newContest.targetCity || null,
                points_cost: Number(newContest.pointsCost) || 0,
                is_active: newContest.isActive !== false,
                created_at: new Date().toISOString()
            }]);
            if (error) throw error;
            toast.success("Concurso creado exitosamente");
            setShowAddModal(false);
            setNewContest({
                title: '',
                description: '',
                type: 'referral_count',
                targetCount: 10,
                prize: '',
                prizeImageUrl: '',
                scope: 'national',
                targetState: '',
                targetCity: '',
                locationName: 'Nacional',
                pointsCost: 0,
                isActive: true
            });
            fetchData();
        } catch (error) {
            console.error("Error creating contest:", error);
            toast.error("Error al crear el concurso");
        }
    };

    const handleDeleteContest = async (id: string) => {
        if (!window.confirm("¿Seguro que quieres eliminar este concurso?")) return;
        try {
            const { error } = await supabase.from('referral_contests').delete().eq('id', id);
            if (error) throw error;
            toast.success("Concurso eliminado");
            fetchData();
        } catch (error) {
            toast.error("Error al eliminar");
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

    return (
        <div className="p-8 max-w-6xl mx-auto pb-24">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                        <Gift className="w-8 h-8 text-slate-900" />
                        Gestión de Fidelización
                    </h1>
                    <p className="text-slate-500 font-medium">Configura DeliPuntos y concursos de referidos</p>
                </div>
            </div>

            {/* Quick Stats/Info */}
            <div className="bg-white rounded-[2.5rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 mb-8 flex flex-col lg:flex-row items-center justify-between gap-6">
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                        <h3 className="text-slate-900 font-black text-lg">Sistema de Fidelización y DeliPuntos</h3>
                        <button
                            type="button"
                            onClick={() => setPointsEnabled(!pointsEnabled)}
                            className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider transition-all ${
                                pointsEnabled ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'
                            }`}
                        >
                            {pointsEnabled ? '● ACTIVADO' : '○ INACTIVO'}
                        </button>
                    </div>
                    <p className="text-sm text-slate-500 font-medium">
                        Los usuarios ganan puntos automáticamente al usar cualquier servicio de transporte (Taxi, Mototaxi, Mandados) y por comprar dentro de la aplicación.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Puntos por Dólar ($1 USD)</span>
                        <input 
                            type="number"
                            step="0.1"
                            min="0"
                            value={pointsPerDollar}
                            onChange={(e) => setPointsPerDollar(parseFloat(e.target.value) || 0)}
                            className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-2.5 font-black text-slate-900 w-32 outline-none focus:border-amber-400 focus:bg-white transition-all text-center mt-1"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Puntos por Referido</span>
                        <input 
                            type="number" 
                            value={pointsPerReferral}
                            onChange={(e) => setPointsPerReferral(parseInt(e.target.value) || 0)}
                            className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-2.5 font-black text-slate-900 w-32 outline-none focus:border-amber-400 focus:bg-white transition-all text-center mt-1"
                        />
                    </div>
                    <button 
                        onClick={handleSavePoints}
                        disabled={savingPoints}
                        className="self-end bg-primary hover:bg-amber-400 text-slate-900 px-6 py-3 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {savingPoints ? "Guardando..." : "Guardar Cambios"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-4">
                        <Target className="w-6 h-6" />
                    </div>
                    <div className="flex items-center justify-between">
                        <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest">Ratio de Puntos</h3>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${pointsEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {pointsEnabled ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>
                    <p className="text-2xl font-black text-slate-800 mt-1">{pointsPerDollar} pts / $1.00</p>
                    <p className="text-[10px] text-slate-400 mt-1">Ganas {pointsPerDollar} puntos por cada dólar en compras y carreras</p>
                </div>
                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4">
                        <Users className="w-6 h-6" />
                    </div>
                    <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest">Concursos de Referidos</h3>
                    <p className="text-2xl font-black text-slate-800">{contests.filter(c => c.isActive).length}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Concursos activos y participaciones</p>
                </div>
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
                        className="bg-primary text-slate-900 px-4 py-2 rounded-xl text-sm font-black shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
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
                                    {contest.prizeImageUrl ? (
                                        <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-slate-200 bg-slate-100">
                                            <img src={contest.prizeImageUrl} alt={contest.prize} className="w-full h-full object-cover" />
                                        </div>
                                    ) : (
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${contest.type === 'referral_count' ? 'bg-blue-50 text-blue-500' : 'bg-purple-50 text-primary'}`}>
                                            {contest.type === 'referral_count' ? <Users className="w-6 h-6" /> : <Share2 className="w-6 h-6" />}
                                        </div>
                                    )}
                                    <div>
                                        <h4 className="font-black text-slate-800 text-base">{contest.title}</h4>
                                        <p className="text-xs text-slate-500 font-medium mb-2">{contest.description}</p>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] bg-slate-100 px-2.5 py-0.5 rounded-full font-black text-slate-600 uppercase flex items-center gap-1">
                                                {contest.scope === 'regional' ? (
                                                    <><MapIcon className="w-3 h-3 text-amber-500" /> {contest.locationName || 'Estatal'}</>
                                                ) : contest.scope === 'local' ? (
                                                    <><MapPin className="w-3 h-3 text-emerald-500" /> {contest.locationName || 'Local'}</>
                                                ) : (
                                                    <><Globe className="w-3 h-3 text-blue-500" /> Nacional</>
                                                )}
                                            </span>
                                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-black text-slate-500 uppercase">
                                                {contest.type === 'referral_count' ? 'Por cantidad' : 'Por compartir'}
                                            </span>
                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full font-black uppercase">
                                                Premio: {contest.prize}
                                            </span>
                                            {contest.pointsCost ? (
                                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-black uppercase flex items-center gap-1">
                                                    <Award className="w-3 h-3" /> {contest.pointsCost} Pts
                                                </span>
                                            ) : null}
                                            <span className="text-[10px] bg-indigo-100 text-primary px-2 py-0.5 rounded-full font-black uppercase">
                                                Meta: {contest.targetCount}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleContestStatus(contest)}
                                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${contest.isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}
                                    >
                                        {contest.isActive ? 'Activo' : 'Inactivo'}
                                    </button>
                                    <button onClick={() => handleDeleteContest(contest.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all cursor-pointer">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal para añadir concurso referidos */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
                        <div className="p-8 border-b border-slate-50 flex items-center justify-between sticky top-0 bg-white z-10">
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                <Users className="w-6 h-6 text-blue-500" /> Nuevo Concurso
                            </h3>
                            <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer">
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
                                        placeholder="Ej: iPhone 13 para mayores referidores"
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descripción</label>
                                    <textarea
                                        value={newContest.description}
                                        onChange={(e) => setNewContest({ ...newContest, description: e.target.value })}
                                        placeholder="Reglas del concurso..."
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm min-h-[90px]"
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
                                            onChange={(e) => setNewContest({ ...newContest, targetCount: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                {/* Territorial Scope & Dynamic Location */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alcance Territorial</label>
                                        <select
                                            value={newContest.scope}
                                            onChange={(e) => {
                                                const sc = e.target.value as 'national' | 'regional' | 'local';
                                                setNewContest({
                                                    ...newContest,
                                                    scope: sc,
                                                    targetState: '',
                                                    targetCity: '',
                                                    locationName: sc === 'national' ? 'Nacional' : ''
                                                });
                                            }}
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                        >
                                            <option value="national">Nacional (Todo el país)</option>
                                            <option value="regional">Estatal (Un Estado)</option>
                                            <option value="local">Local (Estado y Ciudad)</option>
                                        </select>
                                    </div>

                                    {newContest.scope === 'national' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ubicación</label>
                                            <div className="w-full bg-slate-100 border-2 border-slate-200/80 px-4 py-3 rounded-2xl font-bold text-sm text-slate-600 flex items-center gap-2">
                                                <Globe className="w-4 h-4 text-blue-500 shrink-0" />
                                                <span>Nacional (Toda Venezuela)</span>
                                            </div>
                                        </div>
                                    )}

                                    {newContest.scope === 'regional' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleccionar Estado</label>
                                            <select
                                                value={newContest.targetState}
                                                onChange={(e) => {
                                                    const st = e.target.value;
                                                    setNewContest({ ...newContest, targetState: st, targetCity: '', locationName: st });
                                                }}
                                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                            >
                                                <option value="">-- Elige un Estado --</option>
                                                {VENEZUELA_STATES.map((st) => (
                                                    <option key={st} value={st}>{st}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {newContest.scope === 'local' && (
                                        <>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">1. Seleccionar Estado</label>
                                                <select
                                                    value={newContest.targetState}
                                                    onChange={(e) => {
                                                        const st = e.target.value;
                                                        setNewContest({
                                                            ...newContest,
                                                            targetState: st,
                                                            targetCity: '',
                                                            locationName: st
                                                        });
                                                    }}
                                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                                >
                                                    <option value="">-- Elige un Estado --</option>
                                                    {VENEZUELA_STATES.map((st) => (
                                                        <option key={st} value={st}>{st}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-1 md:col-span-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">2. Seleccionar Ciudad</label>
                                                <select
                                                    value={newContest.targetCity}
                                                    disabled={!newContest.targetState}
                                                    onChange={(e) => {
                                                        const ct = e.target.value;
                                                        setNewContest({
                                                            ...newContest,
                                                            targetCity: ct,
                                                            locationName: ct ? `${ct}, ${newContest.targetState}` : newContest.targetState
                                                        });
                                                    }}
                                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800 disabled:opacity-50"
                                                >
                                                    <option value="">{newContest.targetState ? '-- Elige una Ciudad --' : 'Primero selecciona un estado arriba'}</option>
                                                    {(newContest.targetState && VENEZUELA_DATA[newContest.targetState] || []).map((ct) => (
                                                        <option key={ct} value={ct}>{ct}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Points Cost */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                        <Award className="w-3.5 h-3.5" /> Costo en Puntos por Ticket / Requisito
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={newContest.pointsCost || ''}
                                        onChange={(e) => setNewContest({ ...newContest, pointsCost: Number(e.target.value) })}
                                        placeholder="Ej: 50 (Opcional, 0 si solo es por referidos)"
                                        className="w-full bg-emerald-50 text-emerald-900 border-2 border-emerald-100 focus:border-emerald-500 px-4 py-3 rounded-2xl outline-none font-bold text-sm placeholder:text-emerald-300"
                                    />
                                </div>

                                {/* Prize and Prize Image */}
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

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Imagen del Premio</label>
                                    <div className="flex items-center gap-2">
                                        {newContest.prizeImageUrl ? (
                                            <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-slate-300 shrink-0 group">
                                                <img src={newContest.prizeImageUrl} alt="Preview" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => setNewContest({ ...newContest, prizeImageUrl: '' })}
                                                    className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Eliminar imagen"
                                                >
                                                    <X className="w-5 h-5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="flex items-center gap-2 px-4 py-3 bg-white border border-dashed border-slate-300 hover:border-blue-500 rounded-2xl text-slate-600 font-bold text-xs cursor-pointer shrink-0 transition-colors">
                                                {uploadingContestImage ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                                                ) : (
                                                    <Upload className="w-4 h-4 text-blue-500" />
                                                )}
                                                <span>{uploadingContestImage ? "Subiendo..." : "Subir Foto"}</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    disabled={uploadingContestImage}
                                                    onChange={handleContestImageUpload}
                                                />
                                            </label>
                                        )}
                                        <input
                                            type="text"
                                            placeholder="O pega URL de la imagen del premio..."
                                            value={newContest.prizeImageUrl || ''}
                                            onChange={(e) => setNewContest({ ...newContest, prizeImageUrl: e.target.value })}
                                            className="flex-1 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 px-4 py-3 rounded-2xl outline-none font-medium text-xs text-slate-600"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleAddContest}
                                className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
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
