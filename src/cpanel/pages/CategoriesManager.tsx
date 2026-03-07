import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Trash2, Plus, Tag, Edit3, Save, X, Search, RefreshCw, Image as ImageIcon, Star, Settings, Zap, Camera, Loader2 } from 'lucide-react';
import { GLOBAL_CATEGORIES } from '../../lib/constants';
import { motion, AnimatePresence } from 'framer-motion';

interface Category {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    imageUrl?: string;
    isActive: boolean;
    isFeatured?: boolean;
    clickCount?: number;
    order?: number;
}

export default function CategoriesManager() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Form states
    const [formData, setFormData] = useState({ name: '', description: '', icon: '', imageUrl: '', isFeatured: false });
    const [editData, setEditData] = useState({ name: '', description: '', icon: '', imageUrl: '', isFeatured: false });
    const [categoryMode, setCategoryMode] = useState<'manual' | 'algorithm'>('manual');
    const [settingsLoading, setSettingsLoading] = useState(false);

    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    const fetchCategories = async () => {
        try {
            const q = query(collection(db, 'global_categories'), orderBy('name', 'asc'));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Category[];

            if (data.length === 0) {
                await syncDefaults(true);
            } else {
                setCategories(data);
            }

            const settingsSnap = await getDocs(collection(db, 'settings'));
            const globalSettings = settingsSnap.docs.find(d => d.id === 'global');
            if (globalSettings) {
                setCategoryMode(globalSettings.data().categoryMode || 'manual');
            }
        } catch (error) {
            console.error("Error fetching categories: ", error);
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
        const fileRef = ref(storage, `categories/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        return await getDownloadURL(fileRef);
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || isSaving) return;

        setIsSaving(true);
        try {
            let imageUrl = formData.imageUrl;
            if (photoFile) {
                imageUrl = await uploadPhoto(photoFile);
            }

            await addDoc(collection(db, 'global_categories'), {
                name: formData.name.trim(),
                description: formData.description.trim(),
                icon: formData.icon.trim(),
                imageUrl: imageUrl.trim(),
                isFeatured: formData.isFeatured,
                clickCount: 0,
                isActive: true,
                createdAt: new Date(),
            });
            setIsAdding(false);
            setPhotoFile(null);
            setPhotoPreview(null);
            setFormData({ name: '', description: '', icon: '', imageUrl: '', isFeatured: false });
            fetchCategories();
        } catch (error) {
            console.error("Error adding category: ", error);
            alert("Error al añadir categoría");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editData.name.trim() || isSaving) return;

        setIsSaving(true);
        try {
            let imageUrl = editData.imageUrl;
            if (photoFile) {
                imageUrl = await uploadPhoto(photoFile);
            }

            await updateDoc(doc(db, 'global_categories', id), {
                name: editData.name.trim(),
                description: editData.description.trim(),
                icon: editData.icon.trim(),
                imageUrl: imageUrl.trim(),
                isFeatured: editData.isFeatured,
                updatedAt: new Date(),
            });
            setEditingId(null);
            setPhotoFile(null);
            setPhotoPreview(null);
            fetchCategories();
        } catch (error) {
            console.error("Error updating category: ", error);
            alert("Error al actualizar categoría");
        } finally {
            setIsSaving(false);
        }
    };

    const updateGlobalMode = async (mode: 'manual' | 'algorithm') => {
        setSettingsLoading(true);
        try {
            await updateDoc(doc(db, 'settings', 'global'), {
                categoryMode: mode,
                updatedAt: new Date()
            });
            setCategoryMode(mode);
        } catch (error: any) {
            if (error.code === 'not-found') {
                const { setDoc } = await import('firebase/firestore');
                await setDoc(doc(db, 'settings', 'global'), {
                    categoryMode: mode,
                    updatedAt: new Date()
                });
                setCategoryMode(mode);
            } else {
                console.error("Error updating settings:", error);
            }
        } finally {
            setSettingsLoading(false);
        }
    };

    const syncDefaults = async (isAuto = false) => {
        if (!isAuto && !window.confirm("¿Deseas importar las categorías por defecto?")) return;

        try {
            const batch = writeBatch(db);
            const iconsMap: Record<string, string> = {
                'Arepas': '🫓',
                'Hamburguesas': '🍔',
                'Sushi': '🍣',
                'Pizza': '🍕',
                'Bebidas': '🥤',
                'Postres': '🍰',
                'Almuerzos': '🍱',
                'Cachapas': '🌽',
                'Carne Asada': '🥩',
                'Cenas': '🍽️',
                'Cerveza': '🍺',
                'Desayunos': '🍳',
                'Empanadas': '🥟',
                'Ensaladas': '🥗',
                'Gaseosas': '🥤',
                'Jugos': '🍹',
                'Marisquería': '🦐',
                'Parrillas': '🍖',
                'Pollo': '🍗',
                'Pollo a la Broaster': '🍗',
                'Pollo Asado': '🍗',
                'Perros Calientes': '🌭',
                'Promociones': '🏷️',
                'Chino': '🥡',
                'Comida Venezolana': '🇻🇪'
            };

            for (const catName of GLOBAL_CATEGORIES) {
                const alreadyExists = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                if (!alreadyExists) {
                    const newDocRef = doc(collection(db, 'global_categories'));
                    batch.set(newDocRef, {
                        name: catName,
                        description: `Categoría de ${catName}`,
                        icon: iconsMap[catName] || '🏷️',
                        isActive: true,
                        createdAt: new Date(),
                    });
                }
            }
            await batch.commit();

            const q = query(collection(db, 'global_categories'), orderBy('name', 'asc'));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Category[];
            setCategories(data);

            if (!isAuto) alert("Categorías sincronizadas exitosamente");
        } catch (error) {
            console.error("Error syncing categories:", error);
            if (!isAuto) alert("Error al sincronizar categorías");
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar esta categoría? Esto podría afectar a los restaurantes que la usan.")) return;
        try {
            await deleteDoc(doc(db, 'global_categories', id));
            setCategories(prev => prev.filter(c => c.id !== id));
        } catch (error) {
            console.error("Error deleting category: ", error);
            alert("Error al eliminar categoría");
        }
    };

    const startEditing = (category: Category) => {
        setEditingId(category.id);
        setEditData({
            name: category.name,
            description: category.description || '',
            icon: category.icon || '',
            imageUrl: category.imageUrl || '',
            isFeatured: !!category.isFeatured
        });
        setPhotoPreview(category.imageUrl || null);
        setPhotoFile(null);
    };

    const handleSyncDefaults = async () => {
        setLoading(true);
        await syncDefaults();
        setLoading(false);
    };

    const filteredCategories = categories.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20 max-w-7xl mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Categorías Globales</h1>
                    <p className="text-slate-500 font-medium">Administra las etiquetas que definen los tipos de negocio en la plataforma.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSyncDefaults}
                        className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-3 rounded-2xl transition-all font-black"
                    >
                        <RefreshCw className="w-5 h-5 text-indigo-600" />
                        Sincronizar Defaults
                    </button>
                    <button
                        onClick={() => {
                            setIsAdding(!isAdding);
                            setPhotoPreview(null);
                            setPhotoFile(null);
                        }}
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl transition-all font-black shadow-lg shadow-indigo-200 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Nueva Categoría
                    </button>
                </div>
            </div>

            {/* Global Settings */}
            <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <Settings className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="font-black text-slate-900 text-xl tracking-tight">Configuración del Algoritmo</h2>
                        <p className="text-slate-500 text-sm font-medium">Controla cómo se muestran las categorías en la aplicación principal.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => updateGlobalMode('manual')}
                        disabled={settingsLoading}
                        className={`flex items-center gap-4 p-6 rounded-[24px] border-2 transition-all ${categoryMode === 'manual' ? 'border-primary bg-primary/5' : 'border-slate-50 hover:border-slate-200'}`}
                    >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${categoryMode === 'manual' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <Tag className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                            <span className={`block font-black uppercase tracking-widest text-[10px] ${categoryMode === 'manual' ? 'text-primary' : 'text-slate-400'}`}>Modo Manual</span>
                            <span className="block text-slate-900 font-bold">Selección Editorial</span>
                            <span className="block text-slate-400 text-xs mt-1">Solo se muestran las marcadas como "Destacadas".</span>
                        </div>
                    </button>

                    <button
                        onClick={() => updateGlobalMode('algorithm')}
                        disabled={settingsLoading}
                        className={`flex items-center gap-4 p-6 rounded-[24px] border-2 transition-all ${categoryMode === 'algorithm' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-50 hover:border-slate-200'}`}
                    >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${categoryMode === 'algorithm' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <Zap className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                            <span className={`block font-black uppercase tracking-widest text-[10px] ${categoryMode === 'algorithm' ? 'text-indigo-600' : 'text-slate-400'}`}>Modo Algoritmo</span>
                            <span className="block text-slate-900 font-bold">Por Popularidad</span>
                            <span className="block text-slate-400 text-xs mt-1">Se ordenan automáticamente según las búsquedas.</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar categorías..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 transition-all font-bold text-slate-700 shadow-sm"
                />
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.form
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        onSubmit={handleAdd}
                        className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-xl space-y-6"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                <Plus className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h2 className="font-black text-slate-900 text-xl tracking-tight">Agregar Nueva Categoría</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2 flex flex-col items-center gap-4">
                                <div
                                    className="w-32 h-32 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group cursor-pointer"
                                    onClick={() => document.getElementById('cat-photo-add')?.click()}
                                >
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <Camera className="w-8 h-8 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                                            <span className="text-[10px] font-black text-slate-300 uppercase">Subir Foto</span>
                                        </div>
                                    )}
                                </div>
                                <input type="file" id="cat-photo-add" hidden accept="image/*" onChange={handleFileChange} />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nombre</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white px-5 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="Ej: Hamburguesas"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Icono/Emoji</label>
                                <input
                                    type="text"
                                    value={formData.icon}
                                    onChange={e => setFormData({ ...formData, icon: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white px-5 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="🍔"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">URL (o usa el botón de arriba)</label>
                                <input
                                    type="text"
                                    value={formData.imageUrl}
                                    onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white px-5 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="https://"
                                />
                            </div>
                            <div className="flex items-center gap-3 pt-6 ml-1">
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, isFeatured: !formData.isFeatured })}
                                    className={`w-12 h-6 rounded-full transition-all relative ${formData.isFeatured ? 'bg-primary' : 'bg-slate-200'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.isFeatured ? 'left-7' : 'left-1'}`}></div>
                                </button>
                                <span className="text-sm font-black text-slate-700 uppercase tracking-widest">Destacar</span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-3 text-slate-500 font-black">Cancelar</button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black shadow-lg flex items-center gap-2"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Guardar Categoría
                            </button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCategories.map((category) => (
                    <motion.div
                        layout
                        key={category.id}
                        className={`bg-white rounded-[32px] p-6 border transition-all ${editingId === category.id ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-100 hover:shadow-xl'}`}
                    >
                        {editingId === category.id ? (
                            <div className="space-y-4">
                                <div className="flex flex-col items-center gap-3">
                                    <div
                                        className="w-20 h-20 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group cursor-pointer"
                                        onClick={() => document.getElementById(`cat-photo-edit-${category.id}`)?.click()}
                                    >
                                        {photoPreview ? (
                                            <img src={photoPreview} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <Camera className="w-6 h-6 text-slate-300" />
                                        )}
                                    </div>
                                    <input type="file" id={`cat-photo-edit-${category.id}`} hidden accept="image/*" onChange={handleFileChange} />
                                </div>
                                <input
                                    type="text"
                                    value={editData.name}
                                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                                    className="w-full bg-slate-50 p-3 rounded-xl font-bold"
                                    placeholder="Nombre"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleUpdate(category.id)}
                                        disabled={isSaving}
                                        className="flex-1 bg-indigo-600 text-white p-3 rounded-xl font-black text-xs flex items-center justify-center gap-2"
                                    >
                                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Guardar
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="bg-slate-100 p-3 rounded-xl font-black text-xs uppercase text-slate-600"><X className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl overflow-hidden relative border border-slate-100 shadow-sm">
                                        {category.imageUrl ? (
                                            <img src={category.imageUrl} className="w-full h-full object-cover" alt="" />
                                        ) : category.icon ? (
                                            category.icon
                                        ) : (
                                            <Tag className="w-6 h-6 text-slate-300" />
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => startEditing(category)} className="p-2 text-slate-400 hover:text-indigo-600"><Edit3 className="w-5 h-5" /></button>
                                        <button onClick={() => handleDelete(category.id)} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 className="w-5 h-5" /></button>
                                    </div>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 mb-1">{category.name}</h3>
                                {category.description && <p className="text-slate-500 text-sm font-medium mb-4">{category.description}</p>}
                                <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                                    {category.isFeatured ? (
                                        <span className="text-[10px] font-black text-amber-500 bg-amber-50 px-2 rounded-full uppercase flex items-center gap-1"><Star className="w-3 h-3 fill-current" /> Destacado</span>
                                    ) : (
                                        <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 rounded-full uppercase">Activo</span>
                                    )}
                                    <span className="text-[10px] font-bold text-slate-300">ID: {category.id.slice(0, 6)}</span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
