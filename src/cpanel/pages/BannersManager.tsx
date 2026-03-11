import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { Trash2, Plus, Image as ImageIcon, Clock, ExternalLink, Timer, Upload, AlertCircle, Pencil, Save } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

export interface Prize {
    id: string;
    title: string;
    imageUrl: string;
}

export interface GlobalLoyaltyBanner {
    isActive: boolean;
    title: string;
    explanation: string;
    prizes: Prize[];
    bannerImageUrl?: string;
    homeBannerId?: string;
}
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import { Globe, Map as MapIcon, MapPin as PinIcon } from 'lucide-react';

export default function BannersManager() {
    const [banners, setBanners] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [newBanner, setNewBanner] = useState({
        imageUrl: '',
        title: '',
        linkUrl: '',
        duration: 5,
        type: 'top_banner' as 'top_banner' | 'welcome_popup',
        visibilityScope: 'national' as 'national' | 'state' | 'city',
        targetState: '',
        targetCity: ''
    });
    // Existing banner states
    const [editingId, setEditingId] = useState<string | null>(null);

    // Global Royalty Banner states
    const [globalBanner, setGlobalBanner] = useState<GlobalLoyaltyBanner>({
        isActive: false,
        title: '',
        explanation: '',
        prizes: [],
        bannerImageUrl: ''
    });
    const [savingBanner, setSavingBanner] = useState(false);
    const [addingPrize, setAddingPrize] = useState(false);
    const [uploadingBannerImage, setUploadingBannerImage] = useState(false);
    const [newPrize, setNewPrize] = useState({ title: '', image: null as File | null });

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

    const fetchGlobalBanner = async () => {
        try {
            const docRef = doc(db, 'cpanel_settings', 'fidelization_banner');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setGlobalBanner(docSnap.data() as GlobalLoyaltyBanner);
            }
        } catch (error) {
            console.error("Error fetching global banner", error);
        }
    };

    useEffect(() => {
        fetchBanners();
        fetchGlobalBanner();
    }, []);

    const handleSaveGlobalBanner = async () => {
        if (savingBanner) return;
        setSavingBanner(true);
        console.log("Iniciando guardado de banner de fidelización...");
        try {
            const currentBanner = { ...globalBanner };
            const prizes = (currentBanner.prizes || []).map(p => ({
                id: p.id || Math.random().toString(36).substring(2),
                title: String(p.title || ''),
                imageUrl: String(p.imageUrl || '')
            }));

            let bannerData = {
                isActive: Boolean(currentBanner.isActive),
                title: String(currentBanner.title || ''),
                explanation: String(currentBanner.explanation || ''),
                prizes: prizes,
                bannerImageUrl: String(currentBanner.bannerImageUrl || ''),
                homeBannerId: currentBanner.homeBannerId || null
            };

            await setDoc(doc(db, 'cpanel_settings', 'fidelization_banner'), bannerData);

            const hbData = {
                imageUrl: bannerData.bannerImageUrl,
                title: bannerData.title,
                linkUrl: '/rewards?openBanner=true',
                duration: 5,
                type: 'top_banner',
                visibilityScope: 'national',
                isActive: bannerData.isActive,
                updatedAt: serverTimestamp()
            };

            if (bannerData.homeBannerId) {
                try {
                    await updateDoc(doc(db, 'banners', bannerData.homeBannerId), hbData);
                } catch (e: any) {
                    if (e.code === 'not-found' && bannerData.bannerImageUrl) {
                        const dr = await addDoc(collection(db, 'banners'), { ...hbData, createdAt: serverTimestamp() });
                        bannerData.homeBannerId = dr.id;
                        await setDoc(doc(db, 'cpanel_settings', 'fidelization_banner'), bannerData);
                    }
                }
            } else if (bannerData.bannerImageUrl) {
                const dr = await addDoc(collection(db, 'banners'), { ...hbData, createdAt: serverTimestamp() });
                bannerData.homeBannerId = dr.id;
                await setDoc(doc(db, 'cpanel_settings', 'fidelization_banner'), bannerData);
            }

            setGlobalBanner(bannerData);
            toast.success("¡Configuración guardada correctamente!");
        } catch (error: any) {
            console.error("Save Error:", error);
            toast.error("Error al guardar: " + (error.message || "Error de red"));
        } finally {
            setSavingBanner(false);
        }
    };

    const handleBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingBannerImage(true);
        const loadingToast = toast.loading("Subiendo imagen principal...");
        try {
            const imageRef = ref(storage, `loyalty_prizes/main_banner_${Date.now()}_${file.name}`);
            await uploadBytes(imageRef, file);
            const imageUrl = await getDownloadURL(imageRef);

            setGlobalBanner(prev => ({ ...prev, bannerImageUrl: imageUrl }));
            toast.success("Imagen subida correctamente", { id: loadingToast });
        } catch (error) {
            console.error(error);
            toast.error("Error subiendo la imagen", { id: loadingToast });
        } finally {
            setUploadingBannerImage(false);
        }
    };

    const handleAddPrize = async () => {
        if (!newPrize.title || !newPrize.image) {
            toast.error("Coloca el título y selecciona una imagen");
            return;
        }
        setAddingPrize(true);
        try {
            const imageRef = ref(storage, `loyalty_prizes/${Date.now()}_${newPrize.image.name}`);
            await uploadBytes(imageRef, newPrize.image);
            const imageUrl = await getDownloadURL(imageRef);

            setGlobalBanner(prev => ({
                ...prev,
                prizes: [...(prev.prizes || []), {
                    id: Date.now().toString(),
                    title: newPrize.title,
                    imageUrl
                }]
            }));

            setNewPrize({ title: '', image: null });
            toast.success("Premio añadido a la lista. Recuerda guardar.");
        } catch (error) {
            toast.error("Error subiendo la imagen del premio");
        } finally {
            setAddingPrize(false);
        }
    };

    const handleRemovePrize = (id: string) => {
        setGlobalBanner(prev => ({
            ...prev,
            prizes: (prev.prizes || []).filter(p => p.id !== id)
        }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSaveBanner = async (e: React.FormEvent) => {
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

            const bannerData = {
                ...newBanner,
                imageUrl: finalImageUrl,
                updatedAt: serverTimestamp(),
                isActive: true
            };

            if (editingId) {
                await updateDoc(doc(db, 'banners', editingId), bannerData);
            } else {
                await addDoc(collection(db, 'banners'), {
                    ...bannerData,
                    createdAt: serverTimestamp(),
                });
            }

            setIsAdding(false);
            setEditingId(null);
            setNewBanner({
                imageUrl: '',
                title: '',
                linkUrl: '',
                duration: 5,
                type: 'top_banner',
                visibilityScope: 'national',
                targetState: '',
                targetCity: ''
            });
            setSelectedFile(null);
            setImagePreview(null);
            fetchBanners();
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

    const handleEdit = (banner: any) => {
        setEditingId(banner.id);
        setNewBanner({
            imageUrl: banner.imageUrl || '',
            title: banner.title || '',
            linkUrl: banner.linkUrl || '',
            duration: banner.duration || 5,
            type: banner.type || 'top_banner',
            visibilityScope: banner.visibilityScope || 'national',
            targetState: banner.targetState || '',
            targetCity: banner.targetCity || ''
        });
        setImagePreview(banner.imageUrl || null);
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
                    onClick={() => {
                        if (isAdding) {
                            setIsAdding(false);
                            setEditingId(null);
                            setNewBanner({
                                imageUrl: '',
                                title: '',
                                linkUrl: '',
                                duration: 5,
                                type: 'top_banner',
                                visibilityScope: 'national',
                                targetState: '',
                                targetCity: ''
                            });
                            setImagePreview(null);
                        } else {
                            setIsAdding(true);
                        }
                    }}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl transition-all font-black shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                    {isAdding ? 'Cancelar' : (
                        <>
                            <Plus className="w-5 h-5 text-indigo-200" />
                            Nuevo Banner
                        </>
                    )}
                </button>
            </div>

            {/* Global Loyalty Banner Configuration */}
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-8">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                    <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Banner Público App (Pantalla Fidelización)</h3>
                        <p className="text-xs text-slate-500 font-medium">Configura el banner y la pantalla de premios para tus clientes. (Al guardar, se creará un banner arriba en el inicio como acceso directo)</p>
                    </div>
                </div>
                <div className="p-6 space-y-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado del anuncio</label>
                                <div className="mt-1">
                                    <button
                                        onClick={() => setGlobalBanner(p => ({ ...p, isActive: !p.isActive }))}
                                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${globalBanner.isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}
                                    >
                                        {globalBanner.isActive ? 'Activo' : 'Inactivo'}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título del Banner</label>
                                <input
                                    type="text"
                                    value={globalBanner.title}
                                    onChange={(e) => setGlobalBanner(p => ({ ...p, title: e.target.value }))}
                                    placeholder="Ej: Gana grandes premios utilizando la aplicación"
                                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 text-sm mt-1 focus:border-primary focus:bg-white transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Imagen del Banner Principal (Para el inicio)</label>
                                <div className="mt-1 flex items-center gap-4">
                                    <label className="flex-1 cursor-pointer">
                                        <div className={`w-full h-14 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 transition-all ${uploadingBannerImage ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:bg-primary/5 text-slate-400 hover:text-primary'}`}>
                                            {uploadingBannerImage ? (
                                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <Upload className="w-5 h-5" />
                                            )}
                                            <span className="font-bold text-sm">
                                                {globalBanner.bannerImageUrl ? 'Cambiar Imagen' : 'Subir Imagen JPG/PNG'}
                                            </span>
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleBannerImageUpload}
                                            disabled={uploadingBannerImage}
                                        />
                                    </label>
                                    {globalBanner.bannerImageUrl && (
                                        <div className="w-20 h-14 rounded-xl overflow-hidden shadow-sm border border-slate-200">
                                            <img src={globalBanner.bannerImageUrl} alt="Banner" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Esta imagen saldrá en el carrusel de inicio.</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Explicación Completa</label>
                                <textarea
                                    value={globalBanner.explanation}
                                    onChange={(e) => setGlobalBanner(p => ({ ...p, explanation: e.target.value }))}
                                    placeholder="Explicación del premio y cómo ganar puntos..."
                                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none font-medium text-slate-700 text-sm mt-1 focus:border-primary focus:bg-white transition-all min-h-[100px]"
                                />
                            </div>
                        </div>

                        {/* Prizes section */}
                        <div className="flex-1 space-y-4 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                            <h4 className="font-black text-slate-700 text-sm mb-4">Premios Visibles</h4>

                            <div className="space-y-3">
                                {globalBanner.prizes?.map((prize) => (
                                    <div key={prize.id} className="bg-white p-3 rounded-2xl flex items-center gap-3 shadow-sm border border-slate-100">
                                        <img src={prize.imageUrl} alt="Premio" className="w-12 h-12 object-cover rounded-xl" />
                                        <div className="flex-1 font-bold text-slate-700 text-sm">{prize.title}</div>
                                        <button onClick={() => handleRemovePrize(prize.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}

                                {/* Add new prize inline */}
                                <div className="bg-white p-4 rounded-2xl border-2 border-dashed border-slate-200 mt-4 space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Ej: Televisor 55 o 100$"
                                        value={newPrize.title}
                                        onChange={e => setNewPrize(p => ({ ...p, title: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl text-sm outline-none"
                                    />
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={e => setNewPrize(p => ({ ...p, image: e.target.files?.[0] || null }))}
                                        className="text-xs text-slate-500 w-full"
                                    />
                                    <button
                                        onClick={handleAddPrize}
                                        disabled={addingPrize}
                                        className="w-full bg-indigo-50 text-indigo-600 font-bold py-2 rounded-xl text-xs hover:bg-indigo-100 transition-colors flex justify-center items-center gap-2"
                                    >
                                        {addingPrize ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : <Plus className="w-4 h-4" />}
                                        Añadir Premio
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSaveGlobalBanner}
                        disabled={savingBanner}
                        className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-lg hover:scale-[1.01] active:scale-95 transition-all flex justify-center items-center gap-2 group disabled:opacity-50"
                    >
                        {savingBanner ? (
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Guardando Cambios...</span>
                            </div>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                <span>Guardar Configuración Pública</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Banners List Header */}
            <div className="flex items-center gap-4 bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 mt-8 mb-4">
                <ImageIcon className="w-8 h-8 text-indigo-600" />
                <div>
                    <h2 className="text-xl font-black text-slate-800">Otros Banners con Links</h2>
                    <p className="text-sm font-medium text-slate-500">Banners que redirigen a externos o secciones de la aplicación.</p>
                </div>
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.form
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        onSubmit={handleSaveBanner}
                        className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 space-y-6 relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
                        <h2 className="font-black text-slate-900 text-xl flex items-center gap-2">
                            {editingId ? 'Editar Banner' : 'Agregar Nuevo Banner'}
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="space-y-4">
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Tipo de Publicidad</label>
                                <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                                    <button
                                        type="button"
                                        onClick={() => setNewBanner({ ...newBanner, type: 'top_banner' })}
                                        className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all ${newBanner.type === 'top_banner' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        Banner Superior
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewBanner({ ...newBanner, type: 'welcome_popup' })}
                                        className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all ${newBanner.type === 'welcome_popup' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        Ventana Emergente
                                    </button>
                                </div>
                            </div>
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
                                    {newBanner.type === 'top_banner'
                                        ? 'Este banner se verá en la parte superior de la App.'
                                        : 'Esta ventana aparecerá al abrir la App (Ej: Promociones).'}
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

                        <div className="md:col-span-2 lg:col-span-3 h-px bg-slate-100 my-2"></div>

                        <div className="md:col-span-2 lg:col-span-3 space-y-4">
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Alcance de Visibilidad</label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setNewBanner({ ...newBanner, visibilityScope: 'national', targetState: '', targetCity: '' })}
                                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${newBanner.visibilityScope === 'national' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                                >
                                    <Globe className="w-5 h-5 shrink-0" />
                                    <div className="text-left">
                                        <p className="font-bold text-sm">Nacional</p>
                                        <p className="text-[10px] opacity-70">Visible en todo el país</p>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNewBanner({ ...newBanner, visibilityScope: 'state', targetCity: '' })}
                                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${newBanner.visibilityScope === 'state' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                                >
                                    <MapIcon className="w-5 h-5 shrink-0" />
                                    <div className="text-left">
                                        <p className="font-bold text-sm">Por Estado</p>
                                        <p className="text-[10px] opacity-70">Visible solo en un estado</p>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNewBanner({ ...newBanner, visibilityScope: 'city' })}
                                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${newBanner.visibilityScope === 'city' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                                >
                                    <PinIcon className="w-5 h-5 shrink-0" />
                                    <div className="text-left">
                                        <p className="font-bold text-sm">Por Ciudad</p>
                                        <p className="text-[10px] opacity-70">Visible en una ciudad específica</p>
                                    </div>
                                </button>
                            </div>

                            {newBanner.visibilityScope !== 'national' && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Estado Objetivo</label>
                                        <select
                                            required
                                            value={newBanner.targetState}
                                            onChange={e => {
                                                const newState = e.target.value;
                                                setNewBanner({ ...newBanner, targetState: newState, targetCity: VENEZUELA_DATA[newState]?.[0] || '' });
                                            }}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700"
                                        >
                                            <option value="">Selecciona un estado...</option>
                                            {VENEZUELA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>

                                    {newBanner.visibilityScope === 'city' && (
                                        <div className="space-y-2">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Ciudad Objetiva</label>
                                            <select
                                                required
                                                value={newBanner.targetCity}
                                                onChange={e => setNewBanner({ ...newBanner, targetCity: e.target.value })}
                                                disabled={!newBanner.targetState}
                                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 disabled:opacity-50"
                                            >
                                                <option value="">Selecciona una ciudad...</option>
                                                {newBanner.targetState && VENEZUELA_DATA[newBanner.targetState]?.map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>

                        <div className="flex justify-end gap-4 pt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAdding(false);
                                    setEditingId(null);
                                    setNewBanner({
                                        imageUrl: '',
                                        title: '',
                                        linkUrl: '',
                                        duration: 5,
                                        visibilityScope: 'national',
                                        targetState: '',
                                        targetCity: ''
                                    });
                                    setImagePreview(null);
                                }}
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
                                    {banner.type === 'welcome_popup' ? (
                                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                                    ) : (
                                        <Timer className="w-3.5 h-3.5 text-indigo-600" />
                                    )}
                                    <span className="text-xs font-black text-slate-900">
                                        {banner.type === 'welcome_popup' ? 'Welcome Popup' : `${banner.duration}s`}
                                    </span>
                                </div>
                                <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-1.5 border border-indigo-500">
                                    {banner.visibilityScope === 'national' || !banner.visibilityScope ? (
                                        <Globe className="w-3.5 h-3.5" />
                                    ) : banner.visibilityScope === 'state' ? (
                                        <MapIcon className="w-3.5 h-3.5" />
                                    ) : (
                                        <PinIcon className="w-3.5 h-3.5" />
                                    )}
                                    <span className="text-[10px] font-black uppercase tracking-wider">
                                        {banner.visibilityScope === 'national' || !banner.visibilityScope ? 'Nacional' :
                                            banner.visibilityScope === 'state' ? banner.targetState :
                                                banner.targetCity}
                                    </span>
                                </div>
                            </div>

                            <div className="absolute top-4 right-4 flex gap-2">
                                <button
                                    onClick={() => handleEdit(banner)}
                                    className="bg-white/90 backdrop-blur-md text-indigo-600 p-2.5 rounded-xl shadow-sm hover:bg-indigo-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Pencil className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => handleDelete(banner.id)}
                                    className="bg-white/90 backdrop-blur-md text-red-600 p-2.5 rounded-xl shadow-sm hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
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
