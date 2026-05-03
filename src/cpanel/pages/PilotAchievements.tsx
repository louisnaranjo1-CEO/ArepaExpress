import React, { useState, useEffect } from 'react';
import { Trophy, Plus, Save, X, Edit, Trash2, Target, CheckCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

interface Achievement {
    id: string;
    title: string;
    description: string;
    targetType: 'trips' | 'stars' | 'time';
    targetValue: number;
    rewardValue: number;
    rewardType: 'points' | 'cash';
    isActive: boolean;
    createdAt?: any;
}

export default function PilotAchievements() {
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    
    const [formData, setFormData] = useState<Partial<Achievement>>({
        title: '',
        description: '',
        targetType: 'trips',
        targetValue: 10,
        rewardValue: 100,
        rewardType: 'points',
        isActive: true
    });

    useEffect(() => {
        const q = query(collection(db, 'achievements'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Achievement[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Achievement));
            setAchievements(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (formData.id) {
                await updateDoc(doc(db, 'achievements', formData.id), {
                    ...formData,
                    updatedAt: serverTimestamp()
                });
            } else {
                const newRef = doc(collection(db, 'achievements'));
                await setDoc(newRef, {
                    ...formData,
                    id: newRef.id,
                    createdAt: serverTimestamp()
                });
            }
            resetForm();
        } catch (error) {
            console.error("Error saving achievement:", error);
            alert("Error al guardar el logro.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar este logro?")) return;
        setLoading(true);
        try {
            await deleteDoc(doc(db, 'achievements', id));
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Error al eliminar.");
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            title: '',
            description: '',
            targetType: 'trips',
            targetValue: 10,
            rewardValue: 100,
            rewardType: 'points',
            isActive: true
        });
        setIsEditing(false);
    };

    const editAchievement = (achievement: Achievement) => {
        setFormData(achievement);
        setIsEditing(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <Trophy className="w-8 h-8 text-yellow-500" />
                        Logros de Pilotos
                    </h2>
                    <p className="text-slate-500 font-medium">Gestiona las metas y recompensas para motivar a los pilotos.</p>
                </div>
                {!isEditing && (
                    <button 
                        onClick={() => setIsEditing(true)}
                        className="bg-primary text-slate-900 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-yellow-400 transition-colors shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-5 h-5" />
                        Nuevo Logro
                    </button>
                )}
            </div>

            {isEditing && (
                <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            {formData.id ? <Edit className="w-6 h-6 text-indigo-500" /> : <Target className="w-6 h-6 text-emerald-500" />}
                            {formData.id ? 'Editar Logro' : 'Crear Nuevo Logro'}
                        </h3>
                        <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 p-2 rounded-full">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-bold text-slate-700">Título del Logro</label>
                                <input 
                                    type="text" 
                                    required 
                                    value={formData.title} 
                                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium"
                                    placeholder="Ej: Novato del Volante"
                                />
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-sm font-bold text-slate-700">Estado</label>
                                <select 
                                    value={formData.isActive ? 'true' : 'false'} 
                                    onChange={(e) => setFormData({...formData, isActive: e.target.value === 'true'})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium"
                                >
                                    <option value="true">Activo</option>
                                    <option value="false">Inactivo</option>
                                </select>
                            </div>

                            <div className="space-y-1 md:col-span-2">
                                <label className="text-sm font-bold text-slate-700">Descripción</label>
                                <textarea 
                                    required 
                                    value={formData.description} 
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium min-h-[100px]"
                                    placeholder="Ej: Completa tus primeros 10 viajes para desbloquear este logro."
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-bold text-slate-700">Tipo de Meta</label>
                                <select 
                                    value={formData.targetType} 
                                    onChange={(e) => setFormData({...formData, targetType: e.target.value as any})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium"
                                >
                                    <option value="trips">Cantidad de Viajes/Entregas</option>
                                    <option value="stars">Cantidad de Reseñas 5 Estrellas</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-bold text-slate-700">Valor de la Meta</label>
                                <input 
                                    type="number" 
                                    required 
                                    min="1"
                                    value={formData.targetValue} 
                                    onChange={(e) => setFormData({...formData, targetValue: parseInt(e.target.value)})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-bold text-slate-700">Tipo de Recompensa</label>
                                <select 
                                    value={formData.rewardType} 
                                    onChange={(e) => setFormData({...formData, rewardType: e.target.value as any})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium"
                                >
                                    <option value="points">Puntos</option>
                                    <option value="cash">Dinero ($)</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-bold text-slate-700">Valor de Recompensa</label>
                                <input 
                                    type="number" 
                                    required 
                                    min="1"
                                    value={formData.rewardValue} 
                                    onChange={(e) => setFormData({...formData, rewardValue: parseInt(e.target.value)})}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white transition-all font-medium"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button 
                                type="button" 
                                onClick={resetForm}
                                className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit"
                                disabled={loading}
                                className="px-8 py-3 rounded-xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg flex items-center gap-2"
                            >
                                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Save className="w-5 h-5" />}
                                Guardar Logro
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* List of achievements */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {achievements.map((achievement) => (
                    <div key={achievement.id} className={`bg-white rounded-[24px] p-6 shadow-sm border relative ${achievement.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60 grayscale'}`}>
                        {!achievement.isActive && (
                            <div className="absolute top-4 right-4 bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
                                Inactivo
                            </div>
                        )}
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100 shadow-inner">
                            <Trophy className={`w-6 h-6 ${achievement.isActive ? 'text-yellow-500' : 'text-slate-400'}`} />
                        </div>
                        <h3 className="font-bold text-slate-800 text-lg leading-tight mb-2">{achievement.title}</h3>
                        <p className="text-slate-500 text-sm font-medium mb-4 line-clamp-2">{achievement.description}</p>
                        
                        <div className="bg-slate-50 rounded-xl p-3 space-y-2 mb-4 border border-slate-100">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-medium">Meta:</span>
                                <span className="font-bold text-slate-700 flex items-center gap-1">
                                    {achievement.targetValue} {achievement.targetType === 'trips' ? 'Viajes' : 'Reseñas 5⭐'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-medium">Premio:</span>
                                <span className="font-bold text-emerald-600 flex items-center gap-1">
                                    <CheckCircle className="w-4 h-4" />
                                    {achievement.rewardValue} {achievement.rewardType === 'points' ? 'pts' : '$'}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            <button 
                                onClick={() => editAchievement(achievement)}
                                className="flex-1 flex items-center justify-center gap-2 py-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors font-semibold text-sm"
                            >
                                <Edit className="w-4 h-4" /> Editar
                            </button>
                            <button 
                                onClick={() => handleDelete(achievement.id)}
                                className="flex-1 flex items-center justify-center gap-2 py-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors font-semibold text-sm"
                            >
                                <Trash2 className="w-4 h-4" /> Eliminar
                            </button>
                        </div>
                    </div>
                ))}
                
                {achievements.length === 0 && !loading && (
                    <div className="col-span-full py-12 text-center bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-200">
                        <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-slate-500 font-bold">No hay logros configurados</h3>
                        <p className="text-slate-400 text-sm">Crea tu primer logro para motivar a los pilotos.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
