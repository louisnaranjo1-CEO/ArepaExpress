import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { Trash2, Plus, Image as ImageIcon, Clock, ExternalLink, Timer, Upload, AlertCircle, Pencil, Loader2, CheckCircle2 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

export default function Banners() {
    const { user } = useAuth();
    const [banners, setBanners] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [businessData, setBusinessData] = useState<any>(null);

    const [newBanner, setNewBanner] = useState({
        imageUrl: '',
        title: '',
        linkUrl: '',
        duration: 5,
    });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [bannerStats, setBannerStats] = useState({
        used: 0,
        total: 3,
        remaining: 3
    });

    useEffect(() => {
        if (!user) return;

        // Fetch Business Data (Subscription)
        const unsubBus = onSnapshot(doc(db, 'restaurants', user.uid),
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setBusinessData(data);
                    const limit = data.subscription?.bannerLimit || 3;
                    setBannerStats(prev => ({ ...prev, total: limit }));
                }
            },
            (error) => {
                console.error("Error fetching restaurant profile:", error);
                setLoading(false);
            }
        );

        // Fetch Banners for this Restaurant
        const q = query(
            collection(db, 'banners'),
            where('restaurantId', '==', user.uid)
        );

        const unsubBanners = onSnapshot(q,
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setBanners(data);
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching banners:", error);
                setLoading(false);
            }
        );

        // Calculate Usage this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const qStats = query(
            collection(db, 'banner_updates'),
            where('restaurantId', '==', user.uid),
            where('timestamp', '>=', startOfMonth)
        );

        const unsubStats = onSnapshot(qStats,
            (snapshot) => {
                const count = snapshot.size;
                setBannerStats(prev => ({
                    ...prev,
                    used: count,
                    remaining: Math.max(0, prev.total - count)
                }));
            },
            (error) => {
                console.error("Error fetching stats:", error);
                // Not strictly necessary to stop loading here as others should cover it,
                // but good for completeness
            }
        );

        return () => {
            unsubBus();
            unsubBanners();
            unsubStats();
        };
    }, [user]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSaveBanner = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !businessData) return;

        // Check if user has subscription
        if (!businessData.subscription) {
            alert("Necesitas una suscripción activa para gestionar banners.");
            return;
        }

        // Check limits if adding new OR editing image
        if (bannerStats.remaining <= 0 && (!editingId || selectedFile)) {
            alert("Has alcanzado el límite de actualizaciones de banner para este mes.");
            return;
        }

        if (!selectedFile && !newBanner.imageUrl) {
            alert("Por favor selecciona una imagen");
            return;
        }

        setUploading(true);
        try {
            let finalImageUrl = newBanner.imageUrl;

            if (selectedFile) {
                const storageRef = ref(storage, `banners/${user.uid}/${Date.now()}_${selectedFile.name}`);
                const snapshot = await uploadBytes(storageRef, selectedFile);
                finalImageUrl = await getDownloadURL(snapshot.ref);
            }

            const bannerData = {
                ...newBanner,
                imageUrl: finalImageUrl,
                restaurantId: user.uid,
                restaurantName: businessData.name || '',
                updatedAt: serverTimestamp(),
                isActive: false,
                status: 'pending_approval',
                // Inherit visibility from subscription
                visibilityScope: businessData.subscription.scope || 'city',
                targetState: businessData.location?.state || '',
                targetCity: businessData.location?.city || ''
            };

            if (editingId) {
                await updateDoc(doc(db, 'banners', editingId), bannerData);
                // Record update if image changed
                if (selectedFile) {
                    await addDoc(collection(db, 'banner_updates'), {
                        restaurantId: user.uid,
                        bannerId: editingId,
                        timestamp: serverTimestamp(),
                        type: 'update'
                    });
                }
            } else {
                const docRef = await addDoc(collection(db, 'banners'), {
                    ...bannerData,
                    createdAt: serverTimestamp(),
                });
                // Record update (creation counts as one)
                await addDoc(collection(db, 'banner_updates'), {
                    restaurantId: user.uid,
                    bannerId: docRef.id,
                    timestamp: serverTimestamp(),
                    type: 'create'
                });
            }

            setIsAdding(false);
            setEditingId(null);
            setNewBanner({
                imageUrl: '',
                title: '',
                linkUrl: '',
                duration: 5,
            });
            setSelectedFile(null);
            setImagePreview(null);
        } catch (error) {
            console.error("Error saving banner: ", error);
            alert("Error al guardar el banner");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar este banner?")) return;
        try {
            await deleteDoc(doc(db, 'banners', id));
        } catch (error) {
            console.error("Error deleting banner: ", error);
        }
    };

    const handleEdit = (banner: any) => {
        setEditingId(banner.id);
        setNewBanner({
            imageUrl: banner.imageUrl || '',
            title: banner.title || '',
            linkUrl: banner.linkUrl || '',
            duration: banner.duration || 5,
        });
        setImagePreview(banner.imageUrl || null);
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Publicidad y Banners</h1>
                    <p className="text-slate-500 font-medium font-bold">Gestiona tus anuncios en la pantalla principal.</p>
                </div>

                <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border-2 border-slate-100 shadow-sm">
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Límite Mensual</p>
                        <p className="font-black text-slate-900">
                            <span className={bannerStats.remaining === 0 ? 'text-red-500' : 'text-indigo-600'}>
                                {bannerStats.used}
                            </span>
                            <span className="text-slate-300 mx-1">/</span>
                            {bannerStats.total}
                        </p>
                    </div>
                    <div className="w-px h-8 bg-slate-100" />
                    <button
                        onClick={() => {
                            if (bannerStats.remaining <= 0 && !isAdding) {
                                alert("Has alcanzado tu límite mensual de actualizaciones.");
                                return;
                            }
                            setIsAdding(!isAdding);
                            if (!isAdding) {
                                setEditingId(null);
                                setNewBanner({ imageUrl: '', title: '', linkUrl: '', duration: 5 });
                                setImagePreview(null);
                            }
                        }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black transition-all active:scale-95 ${isAdding
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700'
                            }`}
                    >
                        {isAdding ? 'Cancelar' : <><Plus className="w-5 h-5" /> Nuevo Banner</>}
                    </button>
                </div>
            </div>

            {/* Alert if no subscription */}
            {!businessData?.subscription && (
                <div className="bg-amber-50 border-2 border-amber-100 p-6 rounded-[2rem] flex items-start gap-4">
                    <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-1" />
                    <div>
                        <h3 className="font-black text-amber-900">Suscripción Requerida</h3>
                        <p className="text-sm text-amber-800/80 font-medium mt-1">
                            Para publicar anuncios en la plataforma necesitas adquirir un plan de suscripción.
                            Ve a la sección de <span className="font-bold underline">Suscripción</span> para ver los planes.
                        </p>
                    </div>
                </div>
            )}

            <AnimatePresence mode="wait">
                {isAdding && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleSaveBanner}
                        className="bg-white p-8 rounded-[2.5rem] border-2 border-indigo-100 shadow-xl shadow-indigo-100/20 space-y-6 relative overflow-hidden"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Título del Anuncio</label>
                                    <input
                                        type="text"
                                        required
                                        value={newBanner.title}
                                        onChange={e => setNewBanner({ ...newBanner, title: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                        placeholder="Ej: Promo Especial de Almuerzos"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Enlace (Instagram, Web, etc.)</label>
                                    <div className="relative">
                                        <ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <input
                                            type="url"
                                            value={newBanner.linkUrl}
                                            onChange={e => setNewBanner({ ...newBanner, linkUrl: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                            placeholder="https://wa.me/..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Duración en Pantalla (Segundos)</label>
                                    <div className="relative">
                                        <Timer className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <input
                                            type="number"
                                            min="3"
                                            max="15"
                                            value={newBanner.duration}
                                            onChange={e => setNewBanner({ ...newBanner, duration: parseInt(e.target.value) })}
                                            className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Imagen del Banner (Recomendado 1000x450)</label>
                                <label className="block group cursor-pointer">
                                    <div className={`relative aspect-[2/1] bg-slate-50 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center gap-3 transition-all ${imagePreview ? 'border-indigo-200' : 'border-slate-100 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                                        {imagePreview ? (
                                            <>
                                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-[1.25rem]" />
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-[1.25rem]">
                                                    <Upload className="w-10 h-10 text-white" />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-300 group-hover:text-indigo-500 group-hover:scale-110 transition-all">
                                                    <Upload className="w-8 h-8" />
                                                </div>
                                                <div className="text-center">
                                                    <p className="font-black text-slate-600">Haz clic para subir</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">PNG o JPG</p>
                                                </div>
                                            </>
                                        )}
                                        <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-6 border-t border-slate-100">
                            <div className="flex items-center gap-3 text-amber-600 bg-amber-50 px-4 py-2 rounded-xl border border-amber-100">
                                <AlertCircle className="w-4 h-4" />
                                <p className="text-[10px] font-black uppercase tracking-wider">
                                    {selectedFile ? 'Esta acción consumirá 1 crédito de actualización' : 'Guardando cambios sin cambiar imagen'}
                                </p>
                            </div>
                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setIsAdding(false)}
                                    className="px-8 py-3 font-black text-slate-500 hover:text-slate-900 transition-colors"
                                >
                                    Descartar
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploading}
                                    className="px-10 py-3 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 invisible" />}
                                    {uploading ? 'Solicitando...' : 'Solicitar Banner'}
                                </button>
                            </div>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Banners List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {banners.map((banner) => (
                    <div key={banner.id} className="bg-white rounded-[2.5rem] border-2 border-slate-100 overflow-hidden group hover:border-indigo-200 transition-all shadow-xl shadow-slate-200/20">
                        <div className="aspect-[2/1] relative overflow-hidden">
                            <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                            <div className="absolute top-4 left-4 flex gap-2">
                                <div className="bg-white/95 backdrop-blur px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-slate-100 shadow-sm">
                                    <Timer className="w-3.5 h-3.5 text-indigo-600" />
                                    <span className="text-xs font-black text-slate-900">{banner.duration}s</span>
                                </div>
                            </div>
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-4">
                                <button
                                    onClick={() => handleEdit(banner)}
                                    className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 hover:scale-110 transition-transform shadow-lg"
                                >
                                    <Pencil className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => handleDelete(banner.id)}
                                    className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-red-600 hover:scale-110 transition-transform shadow-lg"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-6">
                            <h3 className="font-black text-slate-900 mb-1">{banner.title}</h3>
                            <div className="flex flex-col gap-1 mt-2">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <CheckCircle2 className={`w-3 h-3 ${banner.status === 'pending_approval' ? 'text-amber-500' : 'text-emerald-500'}`} />
                                    <span className={banner.status === 'pending_approval' ? 'text-amber-600' : 'text-emerald-600'}>
                                        {banner.status === 'pending_approval' ? 'Pendiente de Aprobación' : 'Aprobado'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    <span>Visible en {banner.visibilityScope === 'national' ? 'Todo el País' : banner.targetState}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {banners.length === 0 && !loading && !isAdding && (
                <div className="py-20 text-center space-y-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                        <ImageIcon className="w-10 h-10 text-slate-200" />
                    </div>
                    <p className="text-slate-400 font-bold">No tienes banners publicados actualmente.</p>
                </div>
            )}
        </div>
    );
}

const Save = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);
