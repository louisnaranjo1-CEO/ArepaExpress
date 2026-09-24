import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Image as ImageIcon, Clock, ExternalLink, Timer, Upload, AlertCircle, Pencil, Save, Shield, FileText, Check, Layout, Info, Store, Navigation } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
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
    visibilityScope?: 'national' | 'state' | 'city';
    targetState?: string;
    targetCity?: string;
}
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import { Globe, Map as MapIcon, MapPin as PinIcon } from 'lucide-react';

const DEFAULT_DISCLAIMER =
    "Grupo Un 2x3 VE, C.A. (RIF J-cambiar Rif-0) no está autorizado por la Superintendencia de Instituciones del Sector Bancario (SUDEBAN) para intermediar o fungir como pasarela de pagos entre clientes y comercios. Grupo Un 2x3 es un portal que ofrece a los clientes acceder a compras a plazo en comercios afiliados pero son estos últimos quienes otorgan dicho beneficio. Los clientes abonarán o depositarán los pagos o cuotas directamente en las cuentas bancarias de los comercios.";

export default function BannersManager() {
    const [banners, setBanners] = useState<any[]>([]);
    const [restaurants, setRestaurants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [newBanner, setNewBanner] = useState({
        imageUrl: '',
        title: '',
        subtitle: '',
        linkUrl: '',
        duration: 5,
        type: 'top_banner' as 'top_banner' | 'welcome_popup' | 'card_banner',
        bgColor: '#FEF9C3',
        visibilityScope: 'national' as 'national' | 'state' | 'city',
        targetState: '',
        targetCity: '',
        actionType: 'info_modal' as 'info_modal' | 'restaurant' | 'internal_section' | 'external_url',
        restaurantId: ''
    });

    // SUDEBAN Legal Disclaimer State
    const [disclaimerText, setDisclaimerText] = useState(DEFAULT_DISCLAIMER);
    const [isDisclaimerActive, setIsDisclaimerActive] = useState(true);
    const [savingDisclaimer, setSavingDisclaimer] = useState(false);

    // Existing banner states
    const [editingId, setEditingId] = useState<string | null>(null);

    // Global Royalty Banner states
    const [globalBanner, setGlobalBanner] = useState<GlobalLoyaltyBanner>({
        isActive: true, // Default to true for new ones
        title: '',
        explanation: '',
        prizes: [],
        bannerImageUrl: '',
        visibilityScope: 'national',
        targetState: '',
        targetCity: ''
    });
    const [editingFidelizationId, setEditingFidelizationId] = useState<string | null>(null);
    const [savingBanner, setSavingBanner] = useState(false);
    const [addingPrize, setAddingPrize] = useState(false);
    const [uploadingBannerImage, setUploadingBannerImage] = useState(false);
    const [newPrize, setNewPrize] = useState({ title: '', image: null as File | null });

    const fetchBanners = async () => {
        try {
            const [bannersRes, restRes] = await Promise.all([
                supabase.from('banners').select('*').order('created_at', { ascending: false }),
                supabase.from('comercios').select('id, name').order('name')
            ]);

            if (bannersRes.error) throw bannersRes.error;
            if (restRes.data) setRestaurants(restRes.data);

            const mapped = (bannersRes.data || []).map(b => ({
                ...b,
                imageUrl: b.image_url || b.imageUrl,
                linkUrl: b.link_url || b.linkUrl,
                targetScreen: b.target_screen || b.targetScreen,
                isActive: b.is_active !== undefined ? b.is_active : b.isActive,
                visibilityScope: b.visibility_scope || b.visibilityScope,
                targetState: b.target_state || b.targetState,
                targetCity: b.target_city || b.targetCity,
                actionType: b.action_type || b.actionType || (
                    b.restaurant_id ? 'restaurant' :
                    (b.link_url || b.linkUrl)?.startsWith('/') ? 'internal_section' :
                    (b.link_url || b.linkUrl)?.startsWith('http') ? 'external_url' :
                    'info_modal'
                ),
                restaurantId: b.restaurant_id || b.restaurantId || ''
            }));
            setBanners(mapped);

            // Fetch SUDEBAN Disclaimer config
            try {
                const { data: discData } = await supabase
                    .from('system_configs')
                    .select('*')
                    .eq('id', 'home_disclaimer')
                    .maybeSingle();
                if (discData) {
                    const text = discData.text || discData.data?.text;
                    const active = discData.is_active !== undefined ? discData.is_active : discData.data?.is_active;
                    if (text) setDisclaimerText(text);
                    if (active !== undefined) setIsDisclaimerActive(active);
                }
            } catch (e) {
                console.warn("Could not fetch home disclaimer:", e);
            }
        } catch (error) {
            console.error("Error fetching banners: ", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveDisclaimer = async () => {
        setSavingDisclaimer(true);
        try {
            const { error } = await supabase
                .from('system_configs')
                .upsert({
                    id: 'home_disclaimer',
                    text: disclaimerText,
                    is_active: isDisclaimerActive,
                    data: {
                        text: disclaimerText,
                        is_active: isDisclaimerActive
                    },
                    updated_at: new Date().toISOString()
                });
            if (error) throw error;
            toast.success("Aviso legal SUDEBAN guardado con éxito");
        } catch (err: any) {
            console.error(err);
            toast.error("Error al guardar aviso legal: " + (err.message || "Error de red"));
        } finally {
            setSavingDisclaimer(false);
        }
    };

    useEffect(() => {
        fetchBanners();
    }, []);

    const handleSaveGlobalBanner = async () => {
        if (savingBanner) return;
        if (!globalBanner.title || !globalBanner.bannerImageUrl) {
            toast.error("El título y la imagen son obligatorios");
            return;
        }

        setSavingBanner(true);
        console.log("Iniciando guardado de banner de fidelización...");
        try {
            const currentBanner = { ...globalBanner };
            const prizes = (currentBanner.prizes || []).map(p => ({
                id: p.id || Math.random().toString(36).substring(2),
                title: String(p.title || ''),
                imageUrl: String(p.imageUrl || '')
            }));

            const bannerData = {
                type: 'fidelization',
                is_active: Boolean(currentBanner.isActive),
                title: String(currentBanner.title || ''),
                explanation: String(currentBanner.explanation || ''),
                prizes: prizes,
                image_url: String(currentBanner.bannerImageUrl || ''),
                visibility_scope: currentBanner.visibilityScope || 'national',
                target_state: currentBanner.targetState || '',
                target_city: currentBanner.targetCity || '',
                link_url: '',
                duration: 5,
                updated_at: new Date().toISOString()
            };

            if (editingFidelizationId) {
                const { error } = await supabase.from('banners').update(bannerData).eq('id', editingFidelizationId);
                if (error) throw error;
                toast.success("Banner de fidelización actualizado");
            } else {
                const { error } = await supabase.from('banners').insert([{ ...bannerData, created_at: new Date().toISOString() }]);
                if (error) throw error;
                toast.success("Banner de fidelización guardado correctamente");
            }

            setGlobalBanner({
                isActive: true,
                title: '',
                explanation: '',
                prizes: [],
                bannerImageUrl: '',
                visibilityScope: 'national',
                targetState: '',
                targetCity: ''
            });
            setEditingFidelizationId(null);
            fetchBanners();
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
            const filePath = `loyalty_prizes/main_banner_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
            const imageUrl = pubData.publicUrl;

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
            const filePath = `loyalty_prizes/${Date.now()}_${newPrize.image.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, newPrize.image, { upsert: true });
            if (upErr) throw upErr;
            const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
            const imageUrl = pubData.publicUrl;

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
            toast.error("Por favor selecciona una imagen");
            return;
        }

        setUploading(true);
        try {
            let finalImageUrl = newBanner.imageUrl;

            if (selectedFile) {
                const filePath = `banners/${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, selectedFile, { upsert: true });
                if (upErr) throw upErr;
                const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                finalImageUrl = pubData.publicUrl;
            }

            let resolvedLinkUrl = newBanner.linkUrl;
            if (newBanner.actionType === 'restaurant') {
                resolvedLinkUrl = newBanner.restaurantId ? `/restaurant/${newBanner.restaurantId}` : '';
            } else if (newBanner.actionType === 'info_modal') {
                resolvedLinkUrl = '';
            }

            const bannerData = {
                title: newBanner.title,
                explanation: newBanner.subtitle || '',
                target_screen: newBanner.bgColor || '#FEF9C3',
                image_url: finalImageUrl,
                link_url: resolvedLinkUrl,
                duration: newBanner.duration,
                type: newBanner.type,
                action_type: newBanner.actionType,
                restaurant_id: (newBanner.actionType === 'restaurant' && newBanner.restaurantId) ? newBanner.restaurantId : null,
                visibility_scope: newBanner.visibilityScope,
                target_state: newBanner.targetState,
                target_city: newBanner.targetCity,
                updated_at: new Date().toISOString(),
                is_active: true
            };

            if (editingId) {
                const { error } = await supabase.from('banners').update(bannerData).eq('id', editingId);
                if (error) throw error;
                toast.success("Banner actualizado con éxito");
            } else {
                const { error } = await supabase.from('banners').insert([{
                    ...bannerData,
                    created_at: new Date().toISOString(),
                }]);
                if (error) throw error;
                toast.success("Banner creado con éxito");
            }

            setIsAdding(false);
            setEditingId(null);
            setNewBanner({
                imageUrl: '',
                title: '',
                subtitle: '',
                linkUrl: '',
                duration: 5,
                type: 'top_banner',
                bgColor: '#FEF9C3',
                visibilityScope: 'national',
                targetState: '',
                targetCity: '',
                actionType: 'info_modal',
                restaurantId: ''
            });
            setSelectedFile(null);
            setImagePreview(null);
            fetchBanners();
        } catch (error: any) {
            console.error("Error saving banner: ", error);
            toast.error("Error al guardar el banner: " + (error.message || ''));
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar este banner?")) return;
        try {
            const { error } = await supabase.from('banners').delete().eq('id', id);
            if (error) throw error;
            setBanners(prev => prev.filter(b => b.id !== id));
            toast.success("Banner eliminado");
        } catch (error) {
            console.error("Error deleting banner: ", error);
            toast.error("No se pudo eliminar el banner");
        }
    };

    const toggleActive = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase.from('banners').update({ is_active: !currentStatus }).eq('id', id);
            if (error) throw error;
            setBanners(prev => prev.map(b => b.id === id ? { ...b, isActive: !currentStatus } : b));
            toast.success(!currentStatus ? "Banner activado" : "Banner desactivado");
        } catch (error) {
            console.error("Error updating status: ", error);
        }
    };

    const handleEdit = (banner: any) => {
        if (banner.type === 'fidelization') {
            setEditingFidelizationId(banner.id);
            setGlobalBanner({
                isActive: banner.isActive !== false,
                title: banner.title || '',
                explanation: banner.explanation || '',
                prizes: banner.prizes || [],
                bannerImageUrl: banner.imageUrl || banner.image_url || '',
                visibilityScope: banner.visibilityScope || banner.visibility_scope || 'national',
                targetState: banner.targetState || banner.target_state || '',
                targetCity: banner.targetCity || banner.target_city || ''
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
            toast.success("Editando banner en sección superior");
        } else {
            setEditingId(banner.id);
            const actType = banner.actionType || banner.action_type || (
                (banner.restaurantId || banner.restaurant_id) ? 'restaurant' :
                (banner.linkUrl || banner.link_url)?.startsWith('/') ? 'internal_section' :
                (banner.linkUrl || banner.link_url)?.startsWith('http') ? 'external_url' :
                'info_modal'
            );
            setNewBanner({
                imageUrl: banner.imageUrl || banner.image_url || '',
                title: banner.title || '',
                subtitle: banner.explanation || banner.subtitle || '',
                linkUrl: banner.linkUrl || banner.link_url || '',
                duration: banner.duration || 5,
                type: banner.type || 'top_banner',
                bgColor: banner.target_screen || banner.targetScreen || '#FEF9C3',
                visibilityScope: banner.visibilityScope || banner.visibility_scope || 'national',
                targetState: banner.targetState || banner.target_state || '',
                targetCity: banner.targetCity || banner.target_city || '',
                actionType: actType,
                restaurantId: banner.restaurantId || banner.restaurant_id || ''
            });
            setImagePreview(banner.imageUrl || banner.image_url || null);
            setIsAdding(true);
            setTimeout(() => {
                const el = document.getElementById('banner-form-container');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
            }, 100);
            toast.success("Editando banner seleccionado");
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
                    className="flex items-center justify-center gap-2 bg-primary hover:bg-primary text-slate-900 px-6 py-3 rounded-2xl transition-all font-black shadow-lg shadow-primary/20 active:scale-95"
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
                        <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm flex items-center gap-2">
                            {editingFidelizationId ? 'Editando Banner de Fidelización' : 'Banner de Fidelización'}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">Crea banners especiales con catálogo de premios. Puedes lanzar varios y se verán como acceso directo en Inicio.</p>
                    </div>
                    {editingFidelizationId && (
                        <button
                            onClick={() => {
                                setEditingFidelizationId(null);
                                setGlobalBanner({
                                    isActive: true,
                                    title: '',
                                    explanation: '',
                                    prizes: [],
                                    bannerImageUrl: '',
                                    visibilityScope: 'national',
                                    targetState: '',
                                    targetCity: ''
                                });
                            }}
                            className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-200"
                        >
                            Cancelar Edición
                        </button>
                    )}
                </div>
                <div className="p-6 space-y-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado del anuncio</label>
                                    <div className="mt-1">
                                        <button
                                            onClick={() => setGlobalBanner(p => ({ ...p, isActive: !p.isActive }))}
                                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${globalBanner.isActive ? 'bg-green-100 text-green-600 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}
                                        >
                                            {globalBanner.isActive ? 'Activo' : 'Inactivo'}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alcance Geográfico</label>
                                    <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mt-1 w-fit">
                                        <button onClick={() => setGlobalBanner({ ...globalBanner, visibilityScope: 'national' })} className={`py-1.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center gap-1 ${globalBanner.visibilityScope === 'national' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>
                                            <Globe className="w-3 h-3" /> Nacional
                                        </button>
                                        <button onClick={() => setGlobalBanner({ ...globalBanner, visibilityScope: 'state' })} className={`py-1.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center gap-1 ${globalBanner.visibilityScope === 'state' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>
                                            <MapIcon className="w-3 h-3" /> Estado
                                        </button>
                                        <button onClick={() => setGlobalBanner({ ...globalBanner, visibilityScope: 'city' })} className={`py-1.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center gap-1 ${globalBanner.visibilityScope === 'city' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>
                                            <PinIcon className="w-3 h-3" /> Ciudad
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {(globalBanner.visibilityScope === 'state' || globalBanner.visibilityScope === 'city') && (
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado Destino</label>
                                        <select
                                            value={globalBanner.targetState}
                                            onChange={e => setGlobalBanner({ ...globalBanner, targetState: e.target.value, targetCity: '' })}
                                            className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 text-sm mt-1 focus:border-primary focus:bg-white"
                                        >
                                            <option value="">Selecciona un Estado</option>
                                            {VENEZUELA_STATES.map(estado => (
                                                <option key={estado} value={estado}>{estado}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {globalBanner.visibilityScope === 'city' && (
                                        <div className="flex-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ciudad Destino</label>
                                            <select
                                                value={globalBanner.targetCity}
                                                onChange={e => setGlobalBanner({ ...globalBanner, targetCity: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 text-sm mt-1 focus:border-primary focus:bg-white"
                                            >
                                                <option value="">Selecciona una Ciudad</option>
                                                {globalBanner.targetState && VENEZUELA_DATA[globalBanner.targetState]?.map(city => (
                                                    <option key={city} value={city}>{city}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}
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
                                        <div className={`w-full h-14 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 transition-all ${uploadingBannerImage ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:bg-primary/5 text-slate-400 hover:text-slate-900'}`}>
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
                                        className="w-full bg-indigo-50 text-primary font-bold py-2 rounded-xl text-xs hover:bg-indigo-100 transition-colors flex justify-center items-center gap-2"
                                    >
                                        {addingPrize ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div> : <Plus className="w-4 h-4" />}
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
                                <span>{editingFidelizationId ? 'Guardar Cambios' : 'Guardar'}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* SUDEBAN Legal Disclaimer Configuration */}
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-8">
                <div className="p-6 border-b border-slate-50 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 shadow-sm shrink-0">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm flex items-center gap-2">
                                Aviso Legal SUDEBAN (Pie de Banner en Inicio)
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">
                                Texto legal obligatorio mostrado en la pantalla de inicio debajo de las tarjetas/banners. Modifica tu RIF o condiciones.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">Mostrar en App:</span>
                        <button
                            type="button"
                            onClick={() => setIsDisclaimerActive(!isDisclaimerActive)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all ${
                                isDisclaimerActive
                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}
                        >
                            {isDisclaimerActive ? 'Activo' : 'Oculto'}
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                            Contenido del Mensaje Legal
                        </label>
                        <textarea
                            rows={4}
                            value={disclaimerText}
                            onChange={(e) => setDisclaimerText(e.target.value)}
                            placeholder="Escribe el texto legal..."
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-medium text-xs sm:text-sm text-slate-700 outline-none focus:border-amber-400 focus:bg-white transition-all resize-none mt-1.5"
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setDisclaimerText(DEFAULT_DISCLAIMER)}
                            className="text-xs font-bold text-slate-400 hover:text-slate-600 underline"
                        >
                            Restaurar texto predeterminado
                        </button>

                        <button
                            type="button"
                            disabled={savingDisclaimer}
                            onClick={handleSaveDisclaimer}
                            className="bg-slate-900 hover:bg-black text-white text-xs font-black px-6 py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                        >
                            {savingDisclaimer ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <Save className="w-4 h-4 text-amber-400" />
                            )}
                            Guardar Aviso Legal
                        </button>
                    </div>
                </div>
            </div>

            {/* Banners List Header */}
            <div className="flex items-center gap-4 bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 mt-8 mb-4">
                <ImageIcon className="w-8 h-8 text-primary" />
                <div>
                    <h2 className="text-xl font-black text-slate-800">Otros Banners con Links</h2>
                    <p className="text-sm font-medium text-slate-500">Banners que redirigen a externos o secciones de la aplicación.</p>
                </div>
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.form
                        id="banner-form-container"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        onSubmit={handleSaveBanner}
                        className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 space-y-6 relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
                        <h2 className="font-black text-slate-900 text-xl flex items-center gap-2">
                            {editingId ? 'Editar Banner' : 'Agregar Nuevo Banner'}
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="space-y-4">
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Tipo de Publicidad</label>
                                <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-2xl">
                                    <button
                                        type="button"
                                        onClick={() => setNewBanner({ ...newBanner, type: 'top_banner' })}
                                        className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all ${newBanner.type === 'top_banner' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
                                    >
                                        Banner Superior
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewBanner({ ...newBanner, type: 'welcome_popup' })}
                                        className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all ${newBanner.type === 'welcome_popup' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
                                    >
                                        Ventana Emergente
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewBanner({ ...newBanner, type: 'card_banner' })}
                                        className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all ${newBanner.type === 'card_banner' ? 'bg-white text-amber-600 shadow-sm font-black' : 'text-slate-500'}`}
                                    >
                                        Tarjeta Inicio (Img 2)
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">
                                    {newBanner.type === 'card_banner' ? 'Título Principal (ej: Creemos en tu negocio.)' : 'Título / Nombre Interno'}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newBanner.title}
                                    onChange={e => setNewBanner({ ...newBanner, title: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.25rem] px-5 py-3.5 focus:border-primary focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700"
                                    placeholder={newBanner.type === 'card_banner' ? "Creemos en tu negocio." : "Ej: Promo San Valentín"}
                                />
                            </div>

                            {newBanner.type === 'card_banner' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">
                                            Subtítulo (ej: Regístrate como aliado en Un 2x3)
                                        </label>
                                        <input
                                            type="text"
                                            value={newBanner.subtitle}
                                            onChange={e => setNewBanner({ ...newBanner, subtitle: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.25rem] px-5 py-3.5 focus:border-primary focus:bg-white outline-none transition-all font-bold text-slate-700"
                                            placeholder="Regístrate como aliado en Un 2x3."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">
                                            Color de Fondo de la Tarjeta
                                        </label>
                                        <div className="flex items-center gap-2">
                                            {[
                                                { label: 'Amarillo Cashea', color: '#FEF9C3' },
                                                { label: 'Blanco', color: '#FFFFFF' },
                                                { label: 'Gris suave', color: '#F8FAFC' },
                                                { label: 'Azul suave', color: '#EFF6FF' },
                                                { label: 'Verde suave', color: '#ECFDF5' },
                                            ].map(c => (
                                                <button
                                                    key={c.color}
                                                    type="button"
                                                    title={c.label}
                                                    onClick={() => setNewBanner({ ...newBanner, bgColor: c.color })}
                                                    style={{ backgroundColor: c.color }}
                                                    className={`w-8 h-8 rounded-xl border-2 transition-transform ${
                                                        newBanner.bgColor === c.color ? 'border-amber-500 scale-110 shadow-md' : 'border-slate-200'
                                                    }`}
                                                />
                                            ))}
                                            <input
                                                type="text"
                                                value={newBanner.bgColor}
                                                onChange={e => setNewBanner({ ...newBanner, bgColor: e.target.value })}
                                                className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-700 outline-none text-center"
                                                placeholder="#FEF9C3"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="space-y-2 md:col-span-2">
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1 flex items-center gap-2">
                                    <ImageIcon className="w-3 h-3" /> Imagen del Banner (1000 x 450 px recomendados)
                                </label>
                                <div className="flex items-center gap-4">
                                    <label className="flex-1 group cursor-pointer">
                                        <div className="w-full h-14 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[1.25rem] flex items-center justify-center gap-2 group-hover:border-primary group-hover:bg-indigo-50 transition-all text-slate-400 group-hover:text-primary">
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
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.25rem] px-5 py-3.5 focus:border-primary focus:bg-white focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700"
                                />
                            </div>

                            {/* Configuración de Acción al Presionar */}
                            <div className="md:col-span-2 lg:col-span-3 space-y-4 bg-slate-50/80 p-6 rounded-3xl border border-slate-200">
                                <div>
                                    <label className="block text-xs font-black text-slate-800 uppercase tracking-widest mb-1">
                                        Acción al presionar este banner en la App
                                    </label>
                                    <p className="text-xs text-slate-500 font-medium">
                                        Elige qué ocurre cuando el usuario hace clic o toca el anuncio en su dispositivo:
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setNewBanner({ ...newBanner, actionType: 'info_modal' })}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                                            newBanner.actionType === 'info_modal'
                                                ? 'border-primary bg-amber-50/80 shadow-md ring-2 ring-primary/20'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-center gap-1.5 text-amber-600 mb-1">
                                                <Info className="w-4 h-4" />
                                                <span className="font-black text-xs uppercase tracking-wider">1. Informativo</span>
                                            </div>
                                            <p className="font-black text-slate-900 text-sm">Abrir Ventana</p>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-2 font-medium leading-tight">
                                            Muestra ventana modal con imagen, título y la explicación completa.
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setNewBanner({ ...newBanner, actionType: 'restaurant' })}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                                            newBanner.actionType === 'restaurant'
                                                ? 'border-primary bg-amber-50/80 shadow-md ring-2 ring-primary/20'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-center gap-1.5 text-indigo-600 mb-1">
                                                <Store className="w-4 h-4" />
                                                <span className="font-black text-xs uppercase tracking-wider">2. Comercio</span>
                                            </div>
                                            <p className="font-black text-slate-900 text-sm">Ir a Negocio Aliado</p>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-2 font-medium leading-tight">
                                            Redirige directo al perfil, catálogo y menú de un restaurante o tienda.
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setNewBanner({ ...newBanner, actionType: 'internal_section' })}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                                            newBanner.actionType === 'internal_section'
                                                ? 'border-primary bg-amber-50/80 shadow-md ring-2 ring-primary/20'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                                                <Navigation className="w-4 h-4" />
                                                <span className="font-black text-xs uppercase tracking-wider">3. Sección</span>
                                            </div>
                                            <p className="font-black text-slate-900 text-sm">Sección de la App</p>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-2 font-medium leading-tight">
                                            Abre Taxi, Muchacho e' Mandado, Recompensas, Mis Pedidos o Perfil.
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setNewBanner({ ...newBanner, actionType: 'external_url' })}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between ${
                                            newBanner.actionType === 'external_url'
                                                ? 'border-primary bg-amber-50/80 shadow-md ring-2 ring-primary/20'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-center gap-1.5 text-blue-600 mb-1">
                                                <ExternalLink className="w-4 h-4" />
                                                <span className="font-black text-xs uppercase tracking-wider">4. Externo</span>
                                            </div>
                                            <p className="font-black text-slate-900 text-sm">Enlace Web</p>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-2 font-medium leading-tight">
                                            Abre una dirección web o red social externa en el navegador del usuario.
                                        </p>
                                    </button>
                                </div>

                                {newBanner.actionType === 'info_modal' && (
                                    <div className="space-y-2 pt-2 bg-white p-4 rounded-2xl border border-slate-200">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-widest">
                                            Explicación Completa del Banner (Texto que verá el cliente al abrir la ventana)
                                        </label>
                                        <textarea
                                            rows={4}
                                            value={newBanner.subtitle}
                                            onChange={e => setNewBanner({ ...newBanner, subtitle: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-medium text-xs sm:text-sm text-slate-700 outline-none focus:border-amber-400 focus:bg-white transition-all resize-none"
                                            placeholder="Detalla aquí la promoción, bases del concurso, horarios o instrucciones completas..."
                                        />
                                    </div>
                                )}

                                {newBanner.actionType === 'restaurant' && (
                                    <div className="space-y-2 pt-2 bg-white p-4 rounded-2xl border border-slate-200">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-widest">
                                            Seleccionar Negocio o Comercio Aliado
                                        </label>
                                        <select
                                            value={newBanner.restaurantId}
                                            onChange={e => setNewBanner({ ...newBanner, restaurantId: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-amber-400 focus:bg-white transition-all text-sm"
                                        >
                                            <option value="">-- Elige un Comercio Registrado --</option>
                                            {restaurants.map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {newBanner.actionType === 'internal_section' && (
                                    <div className="space-y-2 pt-2 bg-white p-4 rounded-2xl border border-slate-200">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-widest">
                                            Sección Interna de Un 2x3
                                        </label>
                                        <select
                                            value={newBanner.linkUrl}
                                            onChange={e => setNewBanner({ ...newBanner, linkUrl: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-amber-400 focus:bg-white transition-all text-sm"
                                        >
                                            <option value="">-- Selecciona a dónde dirigir al cliente --</option>
                                            <option value="/taxi">🚕 Pedir Taxi / Mototaxi</option>
                                            <option value="/mandao">📦 Muchacho e' Mandado y Encomiendas</option>
                                            <option value="/rewards">🎁 Centro de Fidelización y DeliPuntos</option>
                                            <option value="/orders">📋 Mis Pedidos</option>
                                            <option value="/profile">👤 Mi Perfil y Cuenta</option>
                                        </select>
                                    </div>
                                )}

                                {newBanner.actionType === 'external_url' && (
                                    <div className="space-y-2 pt-2 bg-white p-4 rounded-2xl border border-slate-200">
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-widest">
                                            URL o Enlace Web Externo
                                        </label>
                                        <input
                                            type="url"
                                            value={newBanner.linkUrl}
                                            onChange={e => setNewBanner({ ...newBanner, linkUrl: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-3.5 focus:border-amber-400 focus:bg-white outline-none transition-all font-bold text-slate-700 text-sm"
                                            placeholder="https://instagram.com/..."
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="md:col-span-2 lg:col-span-3 h-px bg-slate-100 my-2"></div>

                        <div className="md:col-span-2 lg:col-span-3 space-y-4">
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Alcance de Visibilidad</label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setNewBanner({ ...newBanner, visibilityScope: 'national', targetState: '', targetCity: '' })}
                                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${newBanner.visibilityScope === 'national' ? 'border-primary bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
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
                                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${newBanner.visibilityScope === 'state' ? 'border-primary bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
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
                                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${newBanner.visibilityScope === 'city' ? 'border-primary bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
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
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-primary outline-none transition-all font-bold text-slate-700"
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
                                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-primary outline-none transition-all font-bold text-slate-700 disabled:opacity-50"
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
                                className={`${uploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover:bg-primary'} text-slate-900 px-10 py-3 rounded-2xl font-black shadow-lg shadow-primary/30 transition-all active:scale-95 flex items-center gap-2`}
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
                                    ) : banner.type === 'card_banner' ? (
                                        <Layout className="w-3.5 h-3.5 text-amber-500" />
                                    ) : (
                                        <Timer className="w-3.5 h-3.5 text-primary" />
                                    )}
                                    <span className="text-xs font-black text-slate-900">
                                        {banner.type === 'welcome_popup' ? 'Welcome Popup' : banner.type === 'card_banner' ? 'Tarjeta Inicio' : `${banner.duration}s`}
                                    </span>
                                </div>
                                <div className="bg-primary text-slate-900 px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-1.5 border border-primary">
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
                                    className="bg-white/95 backdrop-blur-md text-slate-900 p-2.5 rounded-xl shadow-md hover:bg-primary transition-all"
                                    title="Modificar Banner"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(banner.id)}
                                    className="bg-white/95 backdrop-blur-md text-red-600 p-2.5 rounded-xl shadow-md hover:bg-red-600 hover:text-white transition-all"
                                    title="Eliminar Banner"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="p-6 space-y-4">
                            <div>
                                <h3 className="font-black text-slate-900 text-xl leading-tight mb-1">{banner.title}</h3>
                                
                                {/* Action badge */}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {banner.actionType === 'info_modal' ? (
                                        <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                                            <Info className="w-3.5 h-3.5 text-amber-500" />
                                            Abre Ventana Informativa
                                        </span>
                                    ) : banner.actionType === 'restaurant' ? (
                                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                                            <Store className="w-3.5 h-3.5 text-indigo-500" />
                                            Redirige a Comercio Aliado
                                        </span>
                                    ) : banner.actionType === 'internal_section' ? (
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                                            <Navigation className="w-3.5 h-3.5 text-emerald-500" />
                                            Sección: {banner.linkUrl}
                                        </span>
                                    ) : banner.linkUrl ? (
                                        <a
                                            href={banner.linkUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 truncate max-w-full hover:underline"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                            <span className="truncate">{banner.linkUrl}</span>
                                        </a>
                                    ) : (
                                        <span className="bg-slate-50 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold">
                                            Sin enlace externo
                                        </span>
                                    )}
                                </div>

                                {banner.explanation && (
                                    <p className="text-xs text-slate-500 mt-2 line-clamp-2 font-medium">
                                        {banner.explanation}
                                    </p>
                                )}
                            </div>

                            {/* Action Bar */}
                            <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleEdit(banner)}
                                        className="bg-primary hover:bg-amber-400 text-slate-900 px-4 py-2 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all active:scale-95"
                                    >
                                        <Pencil className="w-3.5 h-3.5" /> Modificar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(banner.id)}
                                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-3 py-2 rounded-xl text-xs font-bold border border-rose-200 flex items-center gap-1 transition-all"
                                        title="Eliminar banner"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <button
                                    onClick={() => toggleActive(banner.id, banner.isActive)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${banner.isActive
                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                                        }`}
                                >
                                    {banner.isActive ? 'Activo' : 'Inactivo'}
                                </button>
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
                                className="bg-primary text-slate-900 px-8 py-3 rounded-2xl font-black hover:bg-primary transition-all"
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
