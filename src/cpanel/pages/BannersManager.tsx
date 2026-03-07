import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Trash2, Plus, Image as ImageIcon, Clock, ExternalLink, Timer, Upload, AlertCircle } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';

export default function BannersManager() {
    const [banners, setBanners] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [newBanner, setNewBanner] = useState({ imageUrl: '', title: '', linkUrl: '', duration: 5 });

    const fetchBanners = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'banners'));
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setBanners(data);
        } catch (error) {
            console.error("Error fetching banners: ", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBanners();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleAddBanner = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile && !newBanner.imageUrl) {
            alert("Por favor selecciona una imagen");
            return;
        }

        setUploading(true);
        try {
            let finalImageUrl = newBanner.imageUrl;

            if (selectedFile) {
                const storageRef = ref(storage, `banners/${Date.now()}_${selectedFile.name}`);
                const snapshot = await uploadBytes(storageRef, selectedFile);
                finalImageUrl = await getDownloadURL(snapshot.ref);
            }

            await addDoc(collection(db, 'banners'), {
                ...newBanner,
                imageUrl: finalImageUrl,
                createdAt: serverTimestamp(),
                isActive: true
            });
            setIsAdding(false);
            setNewBanner({ imageUrl: '', title: '', linkUrl: '', duration: 5 });
            setSelectedFile(null);
            setImagePreview(null);
            fetchBanners();
        } catch (error) {
            console.error("Error adding banner: ", error);
            alert("Error al subir la imagen");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar este banner?")) return;
        try {
            await deleteDoc(doc(db, 'banners', id));
            setBanners(prev => prev.filter(b => b.id !== id));
        } catch (error) {
            console.error("Error deleting banner: ", error);
        }
    };

    const toggleActive = async (id: string, currentStatus: boolean) => {
        try {
            await updateDoc(doc(db, 'banners', id), { isActive: !currentStatus });
            setBanners(prev => prev.map(b => b.id === id ? { ...b, isActive: !currentStatus } : b));
        } catch (error) {
            console.error("Error updating status: ", error);
        }
    };

    if (loading) {
        return (
            <div className="animate-pulse space-y-6">
                <div className="h-24 bg-slate-100 rounded-3xl w-full"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => <div key={i} className="h-64 bg-slate-100 rounded-3xl"></div>)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gestión de Banners</h1>
                    <p className="text-slate-500 font-medium">Administra los anuncios publicitarios de la aplicación cliente.</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl transition-all font-black shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                    <Plus className="w-5 h-5 text-indigo-200" />
                    Nuevo Banner
                </button>
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.form
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        onSubmit={handleAddBanner}
                        className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 space-y-6 relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
                        <h2 className="font-black text-slate-900 text-xl flex items-center gap-2">
                            Agregar Nuevo Banner
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Título / Nombre Interno</label>
                                <input
                                    type="text"
                                    required
                                    value={newBanner.title}
                                    onChange={e => setNewBanner({ ...newBanner, title: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.25rem] px-5 py-3.5 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700"
                                    placeholder="Ej: Promo San Valentín"
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1 flex items-center gap-2">
                                    <ImageIcon className="w-3 h-3" /> Imagen del Banner (1000 x 450 px recomendados)
                                </label>
                                <div className="flex items-center gap-4">
                                    <label className="flex-1 group cursor-pointer">
                                        <div className="w-full h-14 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[1.25rem] flex items-center justify-center gap-2 group-hover:border-indigo-400 group-hover:bg-indigo-50 transition-all text-slate-400 group-hover:text-indigo-600">
                                            <Upload className="w-5 h-5" />
                                            <span className="font-bold text-sm">
                                                {selectedFile ? selectedFile.name : 'Seleccionar archivo JPG/PNG'}
                                            </span>
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                        />
                                    </label>
                                    {imagePreview && (
                                        <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-slate-100 shadow-sm">
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>
                                <p className="text-[10px] text-slate-400 flex items-center gap-1.5 pl-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Este banner se verá en la parte superior de la App.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1 flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> Duración (segundos)
                                </label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    max="60"
                                    value={newBanner.duration}
                                    onChange={e => setNewBanner({ ...newBanner, duration: parseInt(e.target.value) })}
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.25rem] px-5 py-3.5 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700"
                                />
                            </div>
                            <div className="md:col-span-2 lg:col-span-3 space-y-2">
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Enlace de destino (opcional)</label>
                                <input
                                    type="url"
                                    value={newBanner.linkUrl}
                                    onChange={e => setNewBanner({ ...newBanner, linkUrl: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.25rem] px-5 py-3.5 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700"
                                    placeholder="https://instagram.com/..."
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-4 pt-4">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="px-6 py-3 text-slate-500 hover:text-slate-900 font-black transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={uploading}
                                className={`${uploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} text-white px-10 py-3 rounded-2xl font-black shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-2`}
                            >
                                {uploading ? 'Subiendo...' : 'Guardar Banner'}
                            </button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Banners Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {banners.map((banner) => (
                    <motion.div
                        layout
                        key={banner.id}
                        className={`bg-white rounded-[2.5rem] overflow-hidden border-2 transition-all duration-300 relative group ${banner.isActive ? 'border-slate-100 shadow-xl shadow-slate-200/40' : 'border-slate-100 opacity-60 grayscale'
                            }`}
                    >
                        {/* Preview Area */}
                        <div className="aspect-[2/1] bg-slate-100 relative overflow-hidden group">
                            {banner.imageUrl ? (
                                <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                    <ImageIcon className="w-12 h-12" />
                                </div>
                            )}

                            {/* Badges on preview */}
                            <div className="absolute top-4 left-4 flex gap-2">
                                <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-1.5 border border-white">
                                    <Timer className="w-3.5 h-3.5 text-indigo-600" />
                                    <span className="text-xs font-black text-slate-900">{banner.duration}s</span>
                                </div>
                            </div>

                            <button
                                onClick={() => handleDelete(banner.id)}
                                className="absolute top-4 right-4 bg-white/90 backdrop-blur-md text-red-600 p-2.5 rounded-xl shadow-sm hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="p-6 space-y-4">
                            <div>
                                <h3 className="font-black text-slate-900 text-xl leading-tight mb-1">{banner.title}</h3>
                                <div className="flex items-center gap-2">
                                    {banner.linkUrl ? (
                                        <a
                                            href={banner.linkUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-indigo-600 font-bold text-xs hover:underline flex items-center gap-1 truncate"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                            {banner.linkUrl}
                                        </a>
                                    ) : (
                                        <p className="text-slate-400 font-bold text-xs">Sin enlace externo</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    onClick={() => toggleActive(banner.id, banner.isActive)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${banner.isActive
                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                                        }`}
                                >
                                    {banner.isActive ? 'Activo' : 'Inactivo'}
                                </button>
                                <div className="flex items-center gap-2 text-slate-400">
                                    <Clock className="w-4 h-4" />
                                    <span className="text-[10px] font-bold">Auto-rotativo</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}

                {banners.length === 0 && !isAdding && (
                    <div className="col-span-full py-24 text-center bg-white rounded-[3rem] border-4 border-dashed border-slate-100">
                        <div className="max-w-xs mx-auto space-y-4">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                                <ImageIcon className="w-10 h-10 text-slate-200" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900">No hay banners</h3>
                                <p className="text-slate-500 font-medium">Crea tu primer anuncio publicitario para la pantalla principal.</p>
                            </div>
                            <button
                                onClick={() => setIsAdding(true)}
                                className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-indigo-700 transition-all"
                            >
                                Empezar ahora
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
