import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Trash2, Plus, Edit3, Save, X, ImageIcon, Camera, Loader2, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GlobalIcon {
    id: string;
    name: string;
    imageUrl: string;
    createdAt: any;
}

export default function IconsManager() {
    const [icons, setIcons] = useState<GlobalIcon[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form states
    const [formData, setFormData] = useState({ name: '' });
    const [editData, setEditData] = useState({ name: '' });
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    const fetchIcons = async () => {
        try {
            const q = query(collection(db, 'global_icons'), orderBy('name', 'asc'));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as GlobalIcon[];
            setIcons(data);
        } catch (error) {
            console.error("Error fetching icons: ", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchIcons();
    }, []);

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
        const fileRef = ref(storage, `global_icons/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        return await getDownloadURL(fileRef);
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || !photoFile || isSaving) {
            if (!photoFile) alert("Debes seleccionar una imagen para el icono");
            return;
        }

        setIsSaving(true);
        try {
            const imageUrl = await uploadPhoto(photoFile);

            await addDoc(collection(db, 'global_icons'), {
                name: formData.name.trim(),
                imageUrl: imageUrl,
                createdAt: new Date(),
            });
            setIsAdding(false);
            setPhotoFile(null);
            setPhotoPreview(null);
            setFormData({ name: '' });
            fetchIcons();
        } catch (error) {
            console.error("Error adding icon: ", error);
            alert("Error al añadir icono");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editData.name.trim() || isSaving) return;

        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'global_icons', id), {
                name: editData.name.trim(),
                updatedAt: new Date(),
            });
            setEditingId(null);
            fetchIcons();
        } catch (error) {
            console.error("Error updating icon: ", error);
            alert("Error al actualizar icono");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar este icono? Los restaurantes que lo usen dejarán de mostrarlo correctamente.")) return;
        try {
            await deleteDoc(doc(db, 'global_icons', id));
            setIcons(prev => prev.filter(i => i.id !== id));
        } catch (error) {
            console.error("Error deleting icon: ", error);
            alert("Error al eliminar icono");
        }
    };

    const startEditing = (icon: GlobalIcon) => {
        setEditingId(icon.id);
        setEditData({ name: icon.name });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20 max-w-5xl mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Gestor de Iconos</h1>
                    <p className="text-slate-500 font-medium">Administra los iconos de redes sociales disponibles para los locales.</p>
                </div>
                <button
                    onClick={() => { setIsAdding(!isAdding); setPhotoPreview(null); setPhotoFile(null); }}
                    className="flex items-center justify-center gap-2 bg-primary hover:bg-primary text-slate-900 px-6 py-3 rounded-2xl transition-all font-black shadow-lg"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Icono
                </button>
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.form
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        onSubmit={handleAdd}
                        className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl space-y-6"
                    >
                        <div className="flex items-center gap-3">
                            <Share2 className="w-5 h-5 text-primary" />
                            <h2 className="font-black text-slate-900 text-xl tracking-tight">Agregar Nuevo Icono Social</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col items-center gap-4">
                                <div
                                    className="w-24 h-24 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group cursor-pointer"
                                    onClick={() => document.getElementById('icon-photo-add')?.click()}
                                >
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Preview" className="w-full h-full object-contain p-2" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <Camera className="w-8 h-8 text-slate-300 group-hover:text-primary transition-colors" />
                                            <span className="text-[10px] font-black text-slate-300 uppercase">Subir Logo</span>
                                        </div>
                                    )}
                                </div>
                                <input type="file" id="icon-photo-add" hidden accept="image/*" onChange={handleFileChange} />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">Nombre (Red Social)</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="Ej: Instagram, TikTok, Facebook..."
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-3 text-slate-500 font-black">Cancelar</button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="bg-primary text-slate-900 px-8 py-3 rounded-2xl font-black shadow-lg flex items-center gap-2"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Guardar Icono
                            </button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {icons.map(icon => (
                    <motion.div
                        layout
                        key={icon.id}
                        className="bg-white p-6 rounded-[32px] border border-slate-100 hover:shadow-xl transition-all group relative flex flex-col items-center text-center gap-4"
                    >
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center p-3 border border-slate-50 overflow-hidden">
                            <img src={icon.imageUrl} alt={icon.name} className="w-full h-full object-contain" />
                        </div>

                        {editingId === icon.id ? (
                            <div className="space-y-3 w-full">
                                <input
                                    type="text"
                                    value={editData.name}
                                    onChange={e => setEditData({ name: e.target.value })}
                                    className="w-full bg-slate-50 p-2 rounded-xl font-bold text-center text-sm"
                                />
                                <div className="flex gap-1">
                                    <button onClick={() => handleUpdate(icon.id)} className="flex-1 bg-primary text-slate-900 p-2 rounded-lg"><Save className="w-4 h-4 mx-auto" /></button>
                                    <button onClick={() => setEditingId(null)} className="p-2 bg-slate-100 rounded-lg text-slate-400"><X className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h3 className="text-lg font-black text-slate-900 leading-tight">{icon.name}</h3>
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => startEditing(icon)} className="p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-primary transition-colors"><Edit3 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(icon.id)} className="p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-rose-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </>
                        )}
                    </motion.div>
                ))}
            </div>

            {icons.length === 0 && !loading && !isAdding && (
                <div className="text-center py-20 bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200">
                    <ImageIcon className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold">No hay iconos configurados aún.</p>
                    <button onClick={() => setIsAdding(true)} className="text-primary font-black mt-2 hover:underline underline-offset-4">Haz clic para agregar el primero</button>
                </div>
            )}
        </div>
    );
}
