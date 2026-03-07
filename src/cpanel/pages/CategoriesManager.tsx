import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Trash2, Plus, Tag, Edit3, Save, X, Search, RefreshCw } from 'lucide-react';
import { GLOBAL_CATEGORIES } from '../../lib/constants';
import { motion, AnimatePresence } from 'framer-motion';

interface Category {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    isActive: boolean;
    order?: number;
}

export default function CategoriesManager() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Form states
    const [formData, setFormData] = useState({ name: '', description: '', icon: '' });
    const [editData, setEditData] = useState({ name: '', description: '', icon: '' });

    const fetchCategories = async () => {
        try {
            const q = query(collection(db, 'global_categories'), orderBy('name', 'asc'));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Category[];

            if (data.length === 0) {
                // If empty, sync defaults automatically the first time
                await syncDefaults(true);
            } else {
                setCategories(data);
            }
        } catch (error) {
            console.error("Error fetching categories: ", error);
        } finally {
            setLoading(false);
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
                // Check if already exists in local state (if any) or assume empty if isAuto
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

            // Re-fetch to update state
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

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        try {
            await addDoc(collection(db, 'global_categories'), {
                name: formData.name.trim(),
                description: formData.description.trim(),
                icon: formData.icon.trim(),
                isActive: true,
                createdAt: new Date(),
            });
            setIsAdding(false);
            setFormData({ name: '', description: '', icon: '' });
            fetchCategories();
        } catch (error) {
            console.error("Error adding category: ", error);
            alert("Error al añadir categoría");
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editData.name.trim()) return;

        try {
            await updateDoc(doc(db, 'global_categories', id), {
                name: editData.name.trim(),
                description: editData.description.trim(),
                icon: editData.icon.trim(),
                updatedAt: new Date(),
            });
            setEditingId(null);
            fetchCategories();
        } catch (error) {
            console.error("Error updating category: ", error);
            alert("Error al actualizar categoría");
        }
    };

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
            icon: category.icon || ''
        });
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
        <div className="space-y-8 pb-20">
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
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl transition-all font-black shadow-lg shadow-indigo-200 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Nueva Categoría
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
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nombre de la Categoría</label>
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
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Icono/Emoji (opcional)</label>
                                <input
                                    type="text"
                                    value={formData.icon}
                                    onChange={e => setFormData({ ...formData, icon: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white px-5 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="🍔"
                                />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Descripción (opcional)</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white px-5 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700 min-h-[100px]"
                                    placeholder="Breve descripción de la categoría..."
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="px-6 py-3 text-slate-500 hover:bg-slate-50 rounded-2xl font-black transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95 transition-all"
                            >
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
                        className={`bg-white rounded-[32px] p-6 border transition-all ${editingId === category.id ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-100 hover:shadow-xl hover:shadow-slate-200/50'}`}
                    >
                        {editingId === category.id ? (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre</label>
                                    <input
                                        type="text"
                                        value={editData.name}
                                        onChange={e => setEditData({ ...editData, name: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white px-4 py-2 rounded-xl outline-none transition-all font-bold"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Icono</label>
                                    <input
                                        type="text"
                                        value={editData.icon}
                                        onChange={e => setEditData({ ...editData, icon: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white px-4 py-2 rounded-xl outline-none transition-all font-bold"
                                    />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => handleUpdate(category.id)}
                                        className="flex-1 bg-indigo-600 text-white p-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                                    >
                                        <Save className="w-4 h-4" /> Guardar
                                    </button>
                                    <button
                                        onClick={() => setEditingId(null)}
                                        className="bg-slate-100 text-slate-600 p-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl">
                                        {category.icon || <Tag className="w-6 h-6 text-slate-300" />}
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => startEditing(category)}
                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(category.id)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 mb-2">{category.name}</h3>
                                {category.description ? (
                                    <p className="text-slate-500 text-sm font-medium line-clamp-2 italic mb-4">
                                        "{category.description}"
                                    </p>
                                ) : (
                                    <p className="text-slate-300 text-sm font-medium italic mb-4">Sin descripción</p>
                                )}
                                <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                                    <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-widest">Activo</span>
                                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">ID: {category.id.slice(0, 6)}</span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                ))}

                {filteredCategories.length === 0 && !isAdding && (
                    <div className="col-span-full py-20 text-center bg-white rounded-[40px] border border-slate-100 shadow-sm">
                        <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto mb-6">
                            <Tag className="w-10 h-10 text-slate-200" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900">No se encontraron categorías</h3>
                        <p className="text-slate-500 font-medium mt-2">Prueba con otro término o crea una nueva categoría.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
