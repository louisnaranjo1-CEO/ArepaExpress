import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Key, CheckCircle2, XCircle, Shield, Phone, Mail, User, Camera, Loader2, Save, X } from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { collection, addDoc, getDocs, deleteDoc, doc, query, updateDoc, where, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface Waiter {
    id: string;
    restaurantId: string;
    name: string;
    email: string;
    password?: string;
    phone: string;
    photoUrl?: string;
    role: 'waiter' | 'captain';
    isActive: boolean;
    createdAt: any;
}

export default function WaitersManager() {
    const { user } = useAuth();
    const restaurantId = user?.uid;
    const [waiters, setWaiters] = useState<Waiter[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', role: 'waiter' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState({ name: '', email: '', phone: '', password: '', role: 'waiter', photoUrl: '' });

    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!restaurantId) return;
        fetchWaiters();
    }, [restaurantId]);

    const fetchWaiters = async () => {
        if (!restaurantId) return;
        setLoading(true);
        try {
            const waitersRef = collection(db, 'restaurants', restaurantId, 'waiters');
            const q = query(waitersRef);
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Waiter[];
            setWaiters(data);

            // Auto-sync missing indexes (background)
            if (data.length > 0) {
                Promise.all(data.map(async (w) => {
                    const idxRef = doc(db, 'waiter_index', w.email.toLowerCase());
                    const idxSnap = await getDoc(idxRef);
                    if (!idxSnap.exists()) {
                        await setDoc(idxRef, {
                            restaurantId: restaurantId,
                            waiterId: w.id,
                            email: w.email.toLowerCase()
                        });
                    }
                })).catch(console.error);
            }
        } catch (error) {
            console.error("Error fetching waiters:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const uploadPhoto = async (file: File) => {
        const fileRef = ref(storage, `waiters/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        return await getDownloadURL(fileRef);
    };

    const handleAddWaiter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!restaurantId || isSaving) return;

        setIsSaving(true);
        try {
            let photoUrl = '';
            if (photoFile) {
                photoUrl = await uploadPhoto(photoFile);
            }

            const waiterData = {
                ...formData,
                photoUrl,
                restaurantId,
                isActive: true,
                createdAt: new Date()
            };

            const docRef = await addDoc(collection(db, 'restaurants', restaurantId, 'waiters'), waiterData);

            // Add to index for global lookup
            await setDoc(doc(db, 'waiter_index', formData.email.toLowerCase()), {
                restaurantId,
                waiterId: docRef.id,
                email: formData.email.toLowerCase()
            });

            setIsAdding(false);
            setFormData({ name: '', email: '', phone: '', password: '', role: 'waiter' });
            setPhotoFile(null);
            setPhotoPreview(null);
            fetchWaiters();
        } catch (error) {
            console.error("Error adding waiter: ", error);
            alert("Error al añadir mesero");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateWaiter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!restaurantId || !editingId || isSaving) return;
        setIsSaving(true);
        try {
            let photoUrl = editData.photoUrl;
            if (photoFile) {
                photoUrl = await uploadPhoto(photoFile);
            }

            // Get old data to check if email changed
            const oldWaiter = waiters.find(w => w.id === editingId);

            await updateDoc(doc(db, 'restaurants', restaurantId, 'waiters', editingId), {
                ...editData,
                photoUrl,
                updatedAt: new Date()
            });

            // Update index
            if (oldWaiter && oldWaiter.email.toLowerCase() !== editData.email.toLowerCase()) {
                await deleteDoc(doc(db, 'waiter_index', oldWaiter.email.toLowerCase()));
            }

            await setDoc(doc(db, 'waiter_index', editData.email.toLowerCase()), {
                restaurantId,
                waiterId: editingId,
                email: editData.email.toLowerCase()
            });

            setEditingId(null);
            setPhotoFile(null);
            setPhotoPreview(null);
            fetchWaiters();
        } catch (error) {
            console.error("Error updating waiter: ", error);
            alert("Error al actualizar mesero");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteWaiter = async (waiterId: string) => {
        if (!restaurantId || !confirm('¿Estás seguro de eliminar a este mesero?')) return;
        try {
            const waiter = waiters.find(w => w.id === waiterId);
            if (waiter) {
                await deleteDoc(doc(db, 'waiter_index', waiter.email.toLowerCase()));
            }
            await deleteDoc(doc(db, 'restaurants', restaurantId, 'waiters', waiterId));
            fetchWaiters();
        } catch (error) {
            console.error("Error deleting waiter:", error);
            alert("Error al eliminar mesero");
        }
    };

    const startEditing = (waiter: Waiter) => {
        setEditingId(waiter.id);
        setEditData({
            name: waiter.name,
            email: waiter.email,
            phone: waiter.phone,
            password: waiter.password || '',
            role: waiter.role,
            photoUrl: waiter.photoUrl || ''
        });
        setPhotoPreview(waiter.photoUrl || null);
        setPhotoFile(null);
        setShowPassword(false);
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
                    onClick={() => {
                        setIsAdding(true);
                        setPhotoPreview(null);
                        setPhotoFile(null);
                    }}
                    className="bg-primary text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-primary/20 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Mesero
                </button>
            </div>

            {/* Add Waiter Modal */}
            {isAdding && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200 h-fit max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-black text-slate-900">Agregar Mesero</h2>
                            <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-6 h-6 text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleAddWaiter} className="space-y-4">
                            {/* Photo Upload */}
                            <div className="flex flex-col items-center gap-4">
                                <div
                                    className="w-24 h-24 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group cursor-pointer"
                                    onClick={() => document.getElementById('photo-upload-add')?.click()}
                                >
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <Camera className="w-8 h-8 text-slate-300 group-hover:text-primary transition-colors" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-white text-[10px] font-bold uppercase">Subir Foto</span>
                                    </div>
                                </div>
                                <input
                                    type="file"
                                    id="photo-upload-add"
                                    hidden
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 ml-2">Nombre Completo</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                        placeholder="Ej: Juan Pérez"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 ml-2">Email / Usuario</label>
                                    <input
                                        type="email"
                                        required
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                        placeholder="ejemplo@email.com"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 ml-2">Teléfono</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                        placeholder="Ej: +502 1234 5678"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 ml-2">Contraseña</label>
                                    <input
                                        type="password"
                                        required
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                        placeholder="PIN de acceso"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 ml-2">Rol</label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value as 'waiter' | 'captain' })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    >
                                        <option value="waiter">Mesero</option>
                                        <option value="captain">Capitán / Supervisor</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Guardar Mesero
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Waiter Modal */}
            {editingId && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200 h-fit max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-black text-slate-900">Editar Mesero</h2>
                            <button onClick={() => setEditingId(null)} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-6 h-6 text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateWaiter} className="space-y-4">
                            {/* Photo Upload */}
                            <div className="flex flex-col items-center gap-4">
                                <div
                                    className="w-24 h-24 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group cursor-pointer"
                                    onClick={() => document.getElementById('photo-upload-edit')?.click()}
                                >
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <Camera className="w-8 h-8 text-slate-300 group-hover:text-primary transition-colors" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-white text-[10px] font-bold uppercase">Cambiar Foto</span>
                                    </div>
                                </div>
                                <input
                                    type="file"
                                    id="photo-upload-edit"
                                    hidden
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-bold text-slate-500 ml-2">Nombre Completo</label>
                                    <input
                                        type="text"
                                        required
                                        value={editData.name}
                                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-bold text-slate-500 ml-2">Email / Usuario</label>
                                    <input
                                        type="email"
                                        required
                                        value={editData.email}
                                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-bold text-slate-500 ml-2">Teléfono</label>
                                    <input
                                        type="tel"
                                        value={editData.phone}
                                        onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-bold text-slate-500 ml-2">Contraseña</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={editData.password}
                                            onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl pr-14 outline-none transition-all font-bold text-slate-700"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-primary"
                                        >
                                            {showPassword ? "Ocultar" : "Ver"}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-bold text-slate-500 ml-2">Rol</label>
                                    <select
                                        value={editData.role}
                                        onChange={(e) => setEditData({ ...editData, role: e.target.value as 'waiter' | 'captain' })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    >
                                        <option value="waiter">Mesero</option>
                                        <option value="captain">Capitán / Supervisor</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Guardar Cambios
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Waiters Table/Grid */}
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="text-left px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Personal</th>
                                <th className="text-left px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Contacto</th>
                                <th className="text-left px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Rol</th>
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
                                            {waiter.photoUrl ? (
                                                <img src={waiter.photoUrl} alt={waiter.name} className="w-10 h-10 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <User className="w-6 h-6" />
                                                </div>
                                            )}
                                            <span className="font-bold text-slate-700">{waiter.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-slate-500 font-medium text-sm">{waiter.email}</span>
                                            <span className="text-[10px] text-slate-400 font-bold">{waiter.phone || 'Sin teléfono'}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-4">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${waiter.role === 'captain' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {waiter.role === 'captain' ? 'Capitán' : 'Mesero'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-4">
                                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                            Activo
                                        </span>
                                    </td>
                                    <td className="px-8 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => startEditing(waiter)}
                                                className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                                            >
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
