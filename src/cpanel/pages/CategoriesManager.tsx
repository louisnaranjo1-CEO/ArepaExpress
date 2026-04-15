import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
    Trash2, Plus, Tag, Edit3, Save, X, Search, RefreshCw,
    Star, Camera, Loader2, ChevronRight, ChevronDown, Layers, Grid,
    FolderPlus, FileEdit, Zap
} from 'lucide-react';
import { GLOBAL_CATEGORIES, CATEGORY_SECTORS } from '../../lib/constants';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';

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
    parentId?: string | null;
}

export default function CategoriesManager() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});

    // Modal Control
    const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [isFeatured, setIsFeatured] = useState(false);
    const [isActive, setIsActive] = useState(true);
    const [parentId, setParentId] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', icon: '', imageUrl: '' });

    const fetchCategories = async () => {
        try {
            const q = query(collection(db, 'global_categories'), orderBy('name', 'asc'));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Category[];

            setCategories(data);

            // Expand all by default if search is active or first load
            if (data.length > 0) {
                const initialExpanded: Record<string, boolean> = {};
                data.filter(c => !c.parentId).forEach(s => {
                    initialExpanded[s.id] = true;
                });
                setExpandedSectors(initialExpanded);
            }
        } catch (error) {
            console.error("Error fetching categories: ", error);
            toast.error("Error al cargar categorías");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const toggleSector = (id: string) => {
        setExpandedSectors(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleOpenModal = (mode: 'create' | 'edit', category?: Category, forcedParentId: string | null = null) => {
        setModalMode(mode);
        if (mode === 'edit' && category) {
            setSelectedCategory(category);
            setFormData({
                name: category.name,
                description: category.description || '',
                icon: category.icon || '',
                imageUrl: category.imageUrl || ''
            });
            setIsFeatured(!!category.isFeatured);
            setIsActive(category.isActive !== false);
            setParentId(category.parentId || null);
            setPhotoPreview(category.imageUrl || null);
        } else {
            setSelectedCategory(null);
            setFormData({ name: '', description: '', icon: '', imageUrl: '' });
            setIsFeatured(false);
            setIsActive(true);
            setParentId(forcedParentId);
            setPhotoPreview(null);
        }
        setPhotoFile(null);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setPhotoPreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const uploadPhoto = async (file: File) => {
        const fileRef = ref(storage, `categories/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        return await getDownloadURL(snapshot.ref);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || isSaving) return;

        setIsSaving(true);
        const loadingToast = toast.loading(modalMode === 'create' ? "Creando..." : "Actualizando...");

        try {
            let finalImageUrl = formData.imageUrl;
            if (photoFile) {
                finalImageUrl = await uploadPhoto(photoFile);
            }

            const payload = {
                name: formData.name.trim(),
                description: formData.description.trim(),
                icon: formData.icon.trim(),
                imageUrl: finalImageUrl,
                isFeatured,
                isActive,
                parentId: parentId || null,
                updatedAt: serverTimestamp(),
            };

            if (modalMode === 'create') {
                await addDoc(collection(db, 'global_categories'), {
                    ...payload,
                    clickCount: 0,
                    createdAt: serverTimestamp(),
                });
                toast.success("Categoría creada exitosamente");
            } else if (selectedCategory) {
                await updateDoc(doc(db, 'global_categories', selectedCategory.id), payload);
                toast.success("Categoría actualizada exitosamente");
            }

            setModalMode(null);
            fetchCategories();
        } catch (error) {
            console.error("Error saving category:", error);
            toast.error("Error al guardar cambios");
        } finally {
            setIsSaving(false);
            toast.dismiss(loadingToast);
        }
    };

    const handleDelete = async (category: Category) => {
        const isParent = !category.parentId;
        const hasChildren = categories.some(c => c.parentId === category.id);

        let confirmMsg = `¿Seguro que deseas eliminar "${category.name}"?`;
        if (isParent && hasChildren) {
            confirmMsg = `⚠️ ATENCIÓN: Esta es una Categoría Principal (Sector) y tiene subcategorías. Si la eliminas, sus subcategorías quedarán huérfanas. ¿Deseas continuar?`;
        }

        if (!window.confirm(confirmMsg)) return;

        const loadingToast = toast.loading("Eliminando...");
        try {
            await deleteDoc(doc(db, 'global_categories', category.id));
            toast.success("Eliminado correctamente");
            fetchCategories();
        } catch (error) {
            console.error("Error deleting:", error);
            toast.error("Error al eliminar");
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    const syncDefaults = async () => {
        if (!window.confirm("¿Deseas sincronizar las categorías predeterminadas del sistema? Esto no borrará las existentes.")) return;

        const loadingToast = toast.loading("Sincronizando...");
        try {
            const batch = writeBatch(db);
            const parentIdsMap: Record<string, string> = {};

            // 1. Principal Categories
            for (const parentName of GLOBAL_CATEGORIES) {
                const existing = categories.find(c => c.name.toLowerCase() === parentName.toLowerCase() && !c.parentId);
                if (!existing) {
                    const newRef = doc(collection(db, 'global_categories'));
                    batch.set(newRef, {
                        name: parentName,
                        description: `Categoría Principal - ${parentName}`,
                        isActive: true,
                        isFeatured: false,
                        parentId: null,
                        createdAt: serverTimestamp()
                    });
                    parentIdsMap[parentName] = newRef.id;
                } else {
                    parentIdsMap[parentName] = existing.id;
                }
            }

            // 2. Subcategories
            for (const [parentName, subList] of Object.entries(CATEGORY_SECTORS)) {
                const pId = parentIdsMap[parentName];
                if (!pId) continue;

                for (const subName of subList) {
                    const exists = categories.find(c => c.name.toLowerCase() === subName.toLowerCase() && c.parentId === pId);
                    if (!exists) {
                        const subRef = doc(collection(db, 'global_categories'));
                        batch.set(subRef, {
                            name: subName,
                            parentId: pId,
                            isActive: true,
                            isFeatured: false,
                            createdAt: serverTimestamp()
                        });
                    }
                }
            }

            await batch.commit();
            toast.success("Sincronización completa");
            fetchCategories();
        } catch (error) {
            console.error("Sync error:", error);
            toast.error("Error al sincronizar");
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    const filteredCategories = categories.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const mainSectors = filteredCategories.filter(c => !c.parentId);

    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando Estructura...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-32 max-w-7xl mx-auto px-4 animate-fade-in">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm overflow-hidden relative group">
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-50/50 rounded-full blur-3xl group-hover:bg-indigo-100/50 transition-colors"></div>
                <div className="relative z-10">
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <Grid className="w-8 h-8 text-primary" />
                        Jerarquía de Categorías
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">Administra los sectores y sus categorías para estructurar los negocios.</p>
                </div>
                <div className="flex items-center gap-3 relative z-10">
                    <button onClick={syncDefaults} className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 px-6 py-3 rounded-2xl transition-all font-black border border-slate-200">
                        <RefreshCw className="w-5 h-5 text-primary" />
                        Sincronizar
                    </button>
                    <button onClick={() => handleOpenModal('create')} className="flex items-center justify-center gap-2 bg-primary hover:bg-primary text-slate-900 px-6 py-3 rounded-2xl transition-all font-black shadow-lg hover:shadow-indigo-200 active:scale-95">
                        <Plus className="w-5 h-5" />
                        Nuevo Sector
                    </button>
                </div>
            </div>

            {/* Search bar */}
            <div className="relative max-w-xl mx-auto">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por nombre (ej: Pizza, Restaurante...)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-14 pr-4 py-4 bg-white border border-slate-200 rounded-3xl outline-none focus:border-primary focus:ring-4 focus:ring-indigo-50 transition-all font-bold text-slate-700 shadow-lg shadow-slate-100"
                />
            </div>

            {/* Categorías Table/Tree */}
            <div className="space-y-6">
                {mainSectors.map(sector => (
                    <div key={sector.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden transition-all hover:border-indigo-100 hover:shadow-md">
                        {/* Sector Header */}
                        <div className="flex items-center justify-between p-6 bg-slate-50/50">
                            <div className="flex items-center gap-5">
                                <button
                                    onClick={() => toggleSector(sector.id)}
                                    className="p-1.5 hover:bg-white rounded-xl transition-all text-slate-400 hover:text-primary"
                                >
                                    {expandedSectors[sector.id] ? <ChevronDown className="w-6 h-6" /> : <ChevronRight className="w-6 h-6" />}
                                </button>
                                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-slate-100 overflow-hidden">
                                    {sector.imageUrl ? <img src={sector.imageUrl} className="w-full h-full object-cover" /> : <span className="text-3xl">{sector.icon || '📁'}</span>}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-black text-slate-800 tracking-tight">{sector.name}</h2>
                                        <span className="text-[10px] font-black bg-indigo-100 text-primary px-2 py-0.5 rounded-full uppercase tracking-widest">Sector Principal</span>
                                    </div>
                                    <p className="text-xs font-bold text-slate-400 mt-0.5 line-clamp-1">{sector.description || 'Sin descripción'}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleOpenModal('create', undefined, sector.id)}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-primary rounded-xl transition-all font-black text-xs"
                                >
                                    <Plus className="w-4 h-4" />
                                    Agregar Subcategoría
                                </button>
                                <div className="w-px h-8 bg-slate-200 mx-2"></div>
                                <button onClick={() => handleOpenModal('edit', sector)} className="p-3 text-slate-400 hover:text-primary hover:bg-white rounded-xl transition-all"><Edit3 className="w-5 h-5" /></button>
                                <button onClick={() => handleDelete(sector)} className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                            </div>
                        </div>

                        {/* Subcategories (Expanded) */}
                        <AnimatePresence>
                            {expandedSectors[sector.id] && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="p-6 pt-0 border-t border-slate-50">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                                            {categories.filter(sub => sub.parentId === sector.id).map(sub => (
                                                <div key={sub.id} className="group p-4 bg-slate-50/50 hover:bg-white rounded-2xl border border-transparent hover:border-slate-100 hover:shadow-lg transition-all flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-lg shadow-sm border border-slate-50 overflow-hidden">
                                                            {sub.imageUrl ? <img src={sub.imageUrl} className="w-full h-full object-cover" /> : sub.icon || '🏷️'}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-black text-slate-800 text-sm">{sub.name}</h4>
                                                            <div className="flex items-center gap-2">
                                                                {sub.isFeatured && <span className="text-[8px] font-black text-amber-500 uppercase flex items-center gap-0.5"><Star className="w-2 h-2 fill-current" /> Destacada</span>}
                                                                <span className="text-[8px] font-black text-slate-300 uppercase">ID: {sub.id.slice(0, 5)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleOpenModal('edit', sub)} className="p-2 text-slate-400 hover:text-primary"><Edit3 className="w-4 h-4" /></button>
                                                        <button onClick={() => handleDelete(sub)} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Empty state for sector */}
                                            {categories.filter(sub => sub.parentId === sector.id).length === 0 && (
                                                <div className="col-span-full py-10 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-2xl">
                                                    <Layers className="w-10 h-10 mb-2 opacity-20" />
                                                    <p className="font-black text-xs uppercase tracking-widest">Sin subcategorías registradas</p>
                                                    <button
                                                        onClick={() => handleOpenModal('create', undefined, sector.id)}
                                                        className="mt-4 text-[10px] font-black text-primary hover:underline"
                                                    >
                                                        Haz clic aquí para crear la primera
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>

            {/* Modal de Creación/Edición */}
            <AnimatePresence>
                {modalMode && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setModalMode(null)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl relative z-10 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-8">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                                            {modalMode === 'create' ? <FolderPlus className="w-6 h-6 text-primary" /> : <FileEdit className="w-6 h-6 text-primary" />}
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-black text-slate-900 leading-tight">
                                                {modalMode === 'create' ? 'Nueva Categoría' : 'Editar Categoría'}
                                            </h2>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                                {parentId ? 'Nivel 2: Subcategoría' : 'Nivel 1: Sector Principal'}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => setModalMode(null)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <form onSubmit={handleSave} className="space-y-6">
                                    {/* Upload Area */}
                                    <div className="flex flex-col items-center gap-4 mb-4">
                                        <div
                                            onClick={() => document.getElementById('cat-photo')?.click()}
                                            className="w-32 h-32 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group cursor-pointer hover:border-primary transition-all"
                                        >
                                            {photoPreview ? (
                                                <img src={photoPreview} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                    <Camera className="w-8 h-8 text-slate-300 group-hover:text-primary" />
                                                    <span className="text-[10px] font-black text-slate-400 uppercase">Imagen</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                                <Zap className="w-6 h-6" />
                                            </div>
                                        </div>
                                        <input type="file" id="cat-photo" hidden accept="image/*" onChange={handleFileChange} />
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Nombre Comercial</label>
                                            <input
                                                type="text" required value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white px-6 py-4 rounded-2xl outline-none transition-all font-black text-slate-700"
                                                placeholder="Ej: Hamburguesas"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Icono (Emoji)</label>
                                                <input
                                                    type="text" value={formData.icon}
                                                    onChange={e => setFormData({ ...formData, icon: e.target.value })}
                                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white px-6 py-3 rounded-2xl outline-none transition-all font-black text-center text-xl"
                                                    placeholder="📁"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Padre (Sector)</label>
                                                <select
                                                    value={parentId || ''}
                                                    onChange={e => setParentId(e.target.value || null)}
                                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white px-4 py-3 rounded-2xl outline-none transition-all font-bold text-slate-600 text-sm"
                                                >
                                                    <option value="">Ninguno (Sector)</option>
                                                    {categories.filter(c => !c.parentId && c.id !== selectedCategory?.id).map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Descripción (Breve)</label>
                                            <textarea
                                                value={formData.description}
                                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white px-6 py-3 rounded-2xl outline-none transition-all font-bold text-slate-600 h-24 resize-none"
                                                placeholder="Comida rápida, electrónica, etc..."
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl ${isFeatured ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400'}`}>
                                                    <Star className={`w-5 h-5 ${isFeatured ? 'fill-current' : ''}`} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-700 leading-none">Destacar</p>
                                                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Aparecer al inicio</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsFeatured(!isFeatured)}
                                                className={`w-12 h-6 rounded-full transition-all relative ${isFeatured ? 'bg-amber-500 shadow-lg shadow-amber-200' : 'bg-slate-300'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isFeatured ? 'left-7' : 'left-1'}`}></div>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        <button
                                            type="button" onClick={() => setModalMode(null)}
                                            className="flex-1 px-6 py-4 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-2xl transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit" disabled={isSaving}
                                            className="flex-[2] bg-primary hover:bg-primary text-slate-900 px-8 py-4 rounded-2xl font-black shadow-xl hover:shadow-indigo-200 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:scale-100"
                                        >
                                            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                            {modalMode === 'create' ? 'Crear Ahora' : 'Confirmar Cambios'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
