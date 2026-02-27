import React, { useState, useEffect } from 'react';
import { UserCheck, Plus, Search, Trash2, Edit2, Loader2, Save, X, User } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';

interface Waiter {
    id: string;
    name: string;
    email: string;
    status: 'active' | 'inactive';
    shift: 'mañana' | 'tarde' | 'noche';
    phone?: string;
}

export default function WaitersManager() {
    const { user } = useAuth();
    const [waiters, setWaiters] = useState<Waiter[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    // New Waiter form state
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newShift, setNewShift] = useState<Waiter['shift']>('mañana');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!user) return;
        fetchWaiters();
    }, [user]);

    const fetchWaiters = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const waitersRef = collection(db, 'restaurants', user.uid, 'waiters');
            const q = query(waitersRef);
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Waiter[];
            setWaiters(data);
        } catch (error) {
            console.error("Error fetching waiters:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddWaiter = async () => {
        if (!user || !newName || !newEmail) return;
        setIsSaving(true);
        try {
            const waitersRef = collection(db, 'restaurants', user.uid, 'waiters');
            await addDoc(waitersRef, {
                name: newName,
                email: newEmail,
                shift: newShift,
                status: 'active',
                createdAt: new Date()
            });

            // Reset form and refresh list
            setNewName('');
            setNewEmail('');
            setIsAdding(false);
            fetchWaiters();
        } catch (error) {
            console.error("Error adding waiter:", error);
            alert("Error al agregar mesero");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteWaiter = async (waiterId: string) => {
        if (!user || !confirm('¿Estás seguro de eliminar a este mesero?')) return;
        try {
            await deleteDoc(doc(db, 'restaurants', user.uid, 'waiters', waiterId));
            fetchWaiters();
        } catch (error) {
            console.error("Error deleting waiter:", error);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando meseros...</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl space-y-8 animate-in fade-in duration-700">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Gestión de Meseros</h1>
                    <p className="text-slate-500 font-medium">Administra el personal de servicio de tu restaurante.</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-primary text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-primary/20 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Mesero
                </button>
            </div>

            {/* Add Waiter Modal/Form Overlay */}
            {isAdding && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-black text-slate-900">Agregar Mesero</h2>
                            <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-6 h-6 text-slate-400" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-500 ml-2">Nombre Completo</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="Ej: Juan Pérez"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-500 ml-2">Email / Usuario</label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="ejemplo@email.com"
                                />
                                <p className="text-[10px] text-slate-400 italic ml-2">* Se usará para iniciar sesión en la app de meseros.</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-500 ml-2">Turno Asignado</label>
                                <select
                                    value={newShift}
                                    onChange={(e) => setNewShift(e.target.value as Waiter['shift'])}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700 appearance-none"
                                >
                                    <option value="mañana">Mañana (08:00 - 16:00)</option>
                                    <option value="tarde">Tarde (16:00 - 00:00)</option>
                                    <option value="noche">Noche (00:00 - 08:00)</option>
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={handleAddWaiter}
                            disabled={isSaving || !newName || !newEmail}
                            className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Guardar Mesero
                        </button>
                    </div>
                </div>
            )}

            {/* Waiters Table/Grid */}
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar mesero..."
                            className="w-full bg-slate-50 border-none pl-12 pr-4 py-3 rounded-xl font-medium text-slate-600 focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="text-left px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Personal</th>
                                <th className="text-left px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Email</th>
                                <th className="text-left px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Turno</th>
                                <th className="text-left px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Estado</th>
                                <th className="text-right px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {waiters.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-12 text-center text-slate-400 italic">
                                        No hay meseros registrados aún.
                                    </td>
                                </tr>
                            ) : waiters.map((waiter) => (
                                <tr key={waiter.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-8 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                <User className="w-6 h-6" />
                                            </div>
                                            <span className="font-bold text-slate-700">{waiter.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-4 text-slate-500 font-medium text-sm">{waiter.email}</td>
                                    <td className="px-8 py-4">
                                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
                                            {waiter.shift}
                                        </span>
                                    </td>
                                    <td className="px-8 py-4">
                                        <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${waiter.status === 'active' ? 'text-emerald-500' : 'text-slate-400'}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${waiter.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                            {waiter.status === 'active' ? 'En línea' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                                                <Edit2 className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteWaiter(waiter.id)}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
