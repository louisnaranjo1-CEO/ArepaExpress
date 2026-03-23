import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Save,
    Check,
    Loader2,
    Image as ImageIcon,
    MapPin,
    Plus,
    Trash2,
    Phone,
    Clock,
    Bike,
    ChevronDown,
    Camera,
    Store,
    Truck,
    Map as MapIcon,
    Upload,
    Share2,
    ExternalLink,
    Globe,
    Zap
} from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { doc, getDoc, updateDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import AddressPicker from '../../components/AddressPicker';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';

interface Location {
    address: string;
    city: string;
    state: string;
    coords?: { lat: number; lng: number };
    type: 'principal' | 'sucursal';
    reference?: string;
}

interface DeliveryRate {
    minKm: number;
    maxKm: number;
    price: number;
}

interface WorkingHour {
    day: string;
    open: string;
    close: string;
    closed: boolean;
}

interface SocialLink {
    id: string; // The ID of the global icon
    name: string; // The name of the social network
    url: string; // The user's profile URL
    imageUrl: string; // The icon image URL
}

const DEFAULT_WORKING_HOURS: WorkingHour[] = [
    { day: 'Lunes', open: '08:00', close: '22:00', closed: false },
    { day: 'Martes', open: '08:00', close: '22:00', closed: false },
    { day: 'Miércoles', open: '08:00', close: '22:00', closed: false },
    { day: 'Jueves', open: '08:00', close: '22:00', closed: false },
    { day: 'Viernes', open: '08:00', close: '22:00', closed: false },
    { day: 'Sábado', open: '08:00', close: '22:00', closed: false },
    { day: 'Domingo', open: '08:00', close: '22:00', closed: false },
];

export default function RestaurantProfile() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Form states
    const [name, setName] = useState('');
    const [rif, setRif] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [ownDelivery, setOwnDelivery] = useState(false);
    const [deliveryTime, setDeliveryTime] = useState('30-45 min');
    const [logoUrl, setLogoUrl] = useState('');
    const [coverUrl, setCoverUrl] = useState('');
    const [location, setLocation] = useState<Location | null>(null);
    const [deliveryRates, setDeliveryRates] = useState<DeliveryRate[]>([]);
    const [workingHours, setWorkingHours] = useState<WorkingHour[]>(DEFAULT_WORKING_HOURS);
    const [followerCount, setFollowerCount] = useState(0);
    const [followers, setFollowers] = useState<any[]>([]);

    // UI states for image uploads
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [showPicker, setShowPicker] = useState<number | null>(null);

    // Social Media states
    const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
    const [globalIcons, setGlobalIcons] = useState<any[]>([]);
    const [isSocialAdding, setIsSocialAdding] = useState(false);

    // Categories
    const [categoryId, setCategoryId] = useState('');
    const [subCategoryId, setSubCategoryId] = useState('');
    const [globalCategories, setGlobalCategories] = useState<any[]>([]);
    const [hasCashea, setHasCashea] = useState(false);
    const [casheaIcon, setCasheaIcon] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchRestaurant = async () => {
            try {
                const docRef = doc(db, 'restaurants', user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setName(data.name || '');
                    setRif(data.rif || '');
                    setWhatsapp(data.whatsapp || '');
                    setOwnDelivery(data.ownDelivery || false);
                    setDeliveryTime(data.deliveryTime || '30-45 min');
                    setLogoUrl(data.logoUrl || '');
                    setCoverUrl(data.coverUrl || '');
                    setLocation(data.location || (data.locations && data.locations.length > 0 ? data.locations[0] : null));
                    setDeliveryRates(data.deliveryRates || []);
                    setWorkingHours(data.workingHours || DEFAULT_WORKING_HOURS);
                    setFollowerCount(data.followerCount || 0);
                    setSocialLinks(data.socialLinks || []);
                    setCategoryId(data.categoryId || '');
                    setSubCategoryId(data.subCategoryId || '');
                    setHasCashea(data.hasCashea || false);

                    // Fetch followers list
                    const followersRef = collection(db, 'restaurants', user.uid, 'followers');
                    const followersQuery = query(followersRef, orderBy('followedAt', 'desc'));
                    const followersSnap = await getDocs(followersQuery);
                    const followersList = followersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setFollowers(followersList);
                }
            } catch (error) {
                console.error("Error fetching restaurant:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRestaurant();

        // Fetch Global Icons
        const fetchGlobalIcons = async () => {
            try {
                const iconsSnap = await getDocs(collection(db, 'global_icons'));
                const icons = iconsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
                setGlobalIcons(icons);

                const cashea = icons.find(icon => icon.name?.toLowerCase() === 'cashea');
                if (cashea) {
                    setCasheaIcon(cashea.url || cashea.imageUrl);
                } else {
                    setCasheaIcon("https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20cashea.png?alt=media&token=5b266100-3323-41bb-a5a4-23957ce678a1");
                }
            } catch (err) {
                console.error("Error fetching global icons:", err);
            }
        };
        fetchGlobalIcons();

        // Fetch Global Categories
        const fetchGlobalCategories = async () => {
            const catSnap = await getDocs(collection(db, 'global_categories'));
            setGlobalCategories(catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        };
        fetchGlobalCategories();
    }, [user]);

    const handleSave = async () => {
        if (!user) return;
        setIsSaving(true);
        try {
            let currentLogoUrl = logoUrl;
            let currentCoverUrl = coverUrl;

            // Handle Logo Upload
            if (logoFile) {
                setUploadingLogo(true);
                const logoStorageRef = ref(storage, `restaurants/${user.uid}/logo_${Date.now()}`);
                const snapshot = await uploadBytes(logoStorageRef, logoFile);
                currentLogoUrl = await getDownloadURL(snapshot.ref);
                setLogoUrl(currentLogoUrl);
                setLogoFile(null);
                setLogoPreviewUrl(null);
                setUploadingLogo(false);
            }

            // Handle Cover Upload
            if (coverFile) {
                setUploadingCover(true);
                const coverStorageRef = ref(storage, `restaurants/${user.uid}/cover_${Date.now()}`);
                const snapshot = await uploadBytes(coverStorageRef, coverFile);
                currentCoverUrl = await getDownloadURL(snapshot.ref);
                setCoverUrl(currentCoverUrl);
                setCoverFile(null);
                setCoverPreviewUrl(null);
                setUploadingCover(false);
            }

            const docRef = doc(db, 'restaurants', user.uid);
            await updateDoc(docRef, {
                name,
                rif,
                whatsapp,
                ownDelivery,
                deliveryTime,
                logoUrl: currentLogoUrl,
                coverUrl: currentCoverUrl,
                location,
                deliveryRates,
                workingHours,
                socialLinks,
                categoryId,
                subCategoryId,
                hasCashea,
                updatedAt: new Date()
            });

            console.log("Restaurant profile updated successfully");
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error) {
            console.error("Error updating restaurant:", error);
            alert("Error al guardar los cambios. Por favor, verifica tu conexión o los permisos de almacenamiento.");
        } finally {
            setIsSaving(false);
            setUploadingLogo(false);
            setUploadingCover(false);
        }
    };

    const addDeliveryRate = () => {
        setDeliveryRates([...deliveryRates, { minKm: 0, maxKm: 5, price: 1.0 }]);
    };

    const removeDeliveryRate = (index: number) => {
        setDeliveryRates(deliveryRates.filter((_, i) => i !== index));
    };

    const updateDeliveryRate = (index: number, field: keyof DeliveryRate, value: number) => {
        const newRates = [...deliveryRates];
        newRates[index] = { ...newRates[index], [field]: value };
        setDeliveryRates(newRates);
    };

    const updateWorkingHours = (index: number, field: keyof WorkingHour, value: any) => {
        const newHours = [...workingHours];
        newHours[index] = { ...newHours[index], [field]: value };
        setWorkingHours(newHours);
    };

    const applyBulkHours = (startIdx: number, endIdx: number) => {
        const reference = workingHours[0]; // Use Monday as reference or first item
        const newHours = [...workingHours];
        for (let i = startIdx; i <= endIdx; i++) {
            newHours[i] = { ...newHours[i], open: reference.open, close: reference.close, closed: reference.closed };
        }
        setWorkingHours(newHours);
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            setLogoPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            setCoverPreviewUrl(URL.createObjectURL(file));
        }
    };

    const addSocialLink = (icon: any) => {
        if (socialLinks.find(s => s.id === icon.id)) {
            alert("Esta red social ya ha sido agregada.");
            return;
        }
        setSocialLinks([...socialLinks, { id: icon.id, name: icon.name, imageUrl: icon.imageUrl, url: '' }]);
        setIsSocialAdding(false);
    };

    const removeSocialLink = (id: string) => {
        setSocialLinks(socialLinks.filter(s => s.id !== id));
    };

    const updateSocialUrl = (id: string, url: string) => {
        setSocialLinks(socialLinks.map(s => s.id === id ? { ...s, url } : s));
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando configuración...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Configuración del Negocio</h1>
                    <p className="text-slate-500 font-medium">Gestiona la información pública de tu restaurante.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving || uploadingLogo || uploadingCover}
                    className={`px-6 py-3 rounded-2xl font-black shadow-lg flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 ${saved ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-primary text-white shadow-primary/20'
                        }`}
                >
                    {(isSaving || uploadingLogo || uploadingCover) ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                    <span>{(isSaving || uploadingLogo || uploadingCover) ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar Cambios'}</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left Column: Logo & Main Info */}
                <div className="md:col-span-2 space-y-6">
                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <Store className="w-6 h-6 text-primary" />
                            Información Principal
                        </h2>

                        <div className="space-y-6">
                            {/* Brand Assets */}
                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-6">
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <ImageIcon className="w-5 h-5 text-primary" />
                                    Imagen de Marca
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Logo Upload */}
                                    <div className="space-y-3">
                                        <label className="text-sm font-black text-slate-400 uppercase ml-2">Logo del Negocio</label>
                                        <div className="flex items-center gap-4">
                                            <div className="relative w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                                                {(logoPreviewUrl || logoUrl) ? (
                                                    <img
                                                        src={logoPreviewUrl || logoUrl}
                                                        alt="Logo"
                                                        className="w-full h-full object-contain p-2"
                                                    />
                                                ) : (
                                                    <div className="text-slate-300">
                                                        <ImageIcon className="w-8 h-8" />
                                                    </div>
                                                )}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleLogoChange}
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    disabled={uploadingLogo}
                                                />
                                                {uploadingLogo && (
                                                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10 pointer-events-none">
                                                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                    <Camera className="w-6 h-6 text-white" />
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 italic flex-1">Formato cuadrado. PNG transparente recomendado.</p>
                                        </div>
                                    </div>

                                    {/* Cover Upload */}
                                    <div className="space-y-3">
                                        <label className="text-sm font-black text-slate-400 uppercase ml-2">Foto de Portada</label>
                                        <div className="flex flex-col gap-3">
                                            <div className="relative w-full h-24 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                                                {(coverPreviewUrl || coverUrl) ? (
                                                    <img
                                                        src={coverPreviewUrl || coverUrl}
                                                        alt="Portada"
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="text-slate-300">
                                                        <ImageIcon className="w-8 h-8" />
                                                    </div>
                                                )}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleCoverChange}
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    disabled={uploadingCover}
                                                />
                                                {uploadingCover && (
                                                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10 pointer-events-none">
                                                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                    <Camera className="w-6 h-6 text-white" />
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 italic">Banner superior. Recomendado 1200x400px.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-500 ml-2">Nombre del Negocio</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                        placeholder="Ej: 2X3"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-500 ml-2">RIF</label>
                                    <input
                                        type="text"
                                        value={rif}
                                        onChange={(e) => setRif(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                        placeholder="Ej: J-12345678-9"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-500 ml-2">WhatsApp de Pedidos</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="text"
                                        value={whatsapp}
                                        onChange={(e) => setWhatsapp(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                        placeholder="Ej: +58 412 1234567"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-500 ml-2">Sector Público (Categoría Principal)</label>
                                    <select
                                        value={categoryId}
                                        onChange={(e) => {
                                            setCategoryId(e.target.value);
                                            setSubCategoryId('');
                                        }}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700 appearance-none"
                                    >
                                        <option value="">Selecciona un Sector</option>
                                        {globalCategories.filter(c => !c.parentId && c.isActive !== false).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-500 ml-2">Especialidad (Subcategoría)</label>
                                    <select
                                        value={subCategoryId}
                                        onChange={(e) => setSubCategoryId(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700 appearance-none"
                                        disabled={!categoryId}
                                    >
                                        <option value="">Selecciona una Especialidad</option>
                                        {globalCategories.filter(c => c.parentId === categoryId && c.isActive !== false).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <MapPin className="w-6 h-6 text-primary" />
                            Ubicación de la Sede
                        </h2>

                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-6 group relative">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Estado</label>
                                    <select
                                        value={location?.state || ''}
                                        onChange={(e) => {
                                            const newState = e.target.value;
                                            const newCity = (VENEZUELA_DATA[newState] && VENEZUELA_DATA[newState].length > 0) ? VENEZUELA_DATA[newState][0] : '';
                                            setLocation({
                                                ...(location || { address: '', type: 'principal' }),
                                                state: newState,
                                                city: newCity
                                            });
                                        }}
                                        className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                    >
                                        <option value="">Selecciona un Estado</option>
                                        {VENEZUELA_STATES.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ciudad</label>
                                    <select
                                        value={location?.city || ''}
                                        onChange={(e) => setLocation({
                                            ...(location || { address: '', state: '', type: 'principal' }),
                                            city: e.target.value
                                        })}
                                        className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                        disabled={!location?.state}
                                    >
                                        <option value="">Selecciona una Ciudad</option>
                                        {location?.state && VENEZUELA_DATA[location.state]?.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1 relative">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ubicación GPS</label>
                                <button
                                    onClick={() => setShowPicker(0)}
                                    className={`w-full p-4 rounded-xl border font-bold text-sm flex items-center gap-2 justify-center transition-all ${location?.coords ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 bg-white text-slate-500 hover:border-primary hover:text-primary'}`}
                                >
                                    <MapIcon className="w-4 h-4" />
                                    {location?.coords ? 'Ubicación Marcada (Haz clic para reubicar)' : 'Marcar Ubicación en el Mapa'}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dirección Detallada</label>
                                    <input
                                        type="text"
                                        value={location?.address || ''}
                                        onChange={(e) => setLocation({
                                            ...(location || { city: '', state: '', type: 'principal' }),
                                            address: e.target.value
                                        })}
                                        className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                        placeholder="Ej: Av. Principal de El Rosal, Edif. Centro"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Referencia (Opcional)</label>
                                    <input
                                        type="text"
                                        value={location?.reference || ''}
                                        onChange={(e) => setLocation({
                                            ...(location || { address: '', city: '', state: '', type: 'principal' }),
                                            reference: e.target.value
                                        })}
                                        className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                        placeholder="Ej: Frente a la plaza, diagonal al banco"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right Column: Settings */}
                <div className="space-y-6">
                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <Truck className="w-6 h-6 text-primary" />
                            Logística
                        </h2>

                        <div
                            className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl cursor-pointer group"
                            onClick={() => setOwnDelivery(!ownDelivery)}
                        >
                            <span className="font-bold text-slate-700">Servicio de Delivery Propio</span>
                            <div className={`w-12 h-6 rounded-full relative transition-colors ${ownDelivery ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${ownDelivery ? 'left-7' : 'left-1'}`}></div>
                            </div>
                        </div>

                        {ownDelivery && (
                            <div className="space-y-4 pt-2">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider">Tarifas por Distancia</h3>
                                    <button
                                        onClick={addDeliveryRate}
                                        className="text-primary text-xs font-bold flex items-center gap-1 hover:underline"
                                    >
                                        <Plus className="w-3 h-3" />
                                        Añadir Rango
                                    </button>
                                </div>

                                {deliveryRates.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl">No hay tarifas configuradas. Se aplicará tarifa fija.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {deliveryRates.map((rate, idx) => (
                                            <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                                <div className="flex-1 flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={rate.minKm}
                                                        onChange={(e) => updateDeliveryRate(idx, 'minKm', parseFloat(e.target.value))}
                                                        className="w-16 bg-slate-50 p-2 rounded-lg text-xs font-bold text-center outline-none focus:border-primary border border-transparent"
                                                    />
                                                    <span className="text-slate-400 text-[10px] font-bold">A</span>
                                                    <input
                                                        type="number"
                                                        value={rate.maxKm}
                                                        onChange={(e) => updateDeliveryRate(idx, 'maxKm', parseFloat(e.target.value))}
                                                        className="w-16 bg-slate-50 p-2 rounded-lg text-xs font-bold text-center outline-none focus:border-primary border border-transparent"
                                                    />
                                                    <span className="text-slate-400 text-[10px] font-bold uppercase">KM</span>
                                                </div>
                                                <div className={`flex items-center gap-1 px-3 py-2 rounded-lg border transition-all ${rate.price === 0 ? 'bg-emerald-50 border-emerald-100 ring-2 ring-emerald-500/20' : 'bg-green-50 border-green-100'}`}>
                                                    <span className={`${rate.price === 0 ? 'text-emerald-600' : 'text-green-600'} text-[10px] font-black`}>$</span>
                                                    <input
                                                        type="number"
                                                        value={rate.price}
                                                        onChange={(e) => updateDeliveryRate(idx, 'price', parseFloat(e.target.value))}
                                                        className={`w-16 bg-transparent text-xs font-black outline-none ${rate.price === 0 ? 'text-emerald-700' : 'text-green-700'}`}
                                                    />
                                                    {rate.price === 0 && (
                                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter ml-1">GRATIS</span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => removeDeliveryRate(idx)}
                                                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-500 ml-2">Tiempo Prep. Promedio</label>
                            <div className="relative">
                                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <select
                                    value={deliveryTime}
                                    onChange={(e) => setDeliveryTime(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700 appearance-none"
                                >
                                    <option value="15-30 min">15-30 min</option>
                                    <option value="30-45 min">30-45 min</option>
                                    <option value="45-60 min">45-60 min</option>
                                    <option value="60+ min">Más de 1 hora</option>
                                </select>
                            </div>
                        </div>

                        <div
                            className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer group transition-all border-2 ${hasCashea ? 'bg-yellow-50 border-yellow-200 shadow-lg shadow-yellow-100/50' : 'bg-slate-50 border-transparent hover:border-slate-100'}`}
                            onClick={() => setHasCashea(!hasCashea)}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${hasCashea ? 'bg-yellow-400 shadow-lg shadow-yellow-400/30 ring-4 ring-yellow-500/10' : 'bg-white shadow-sm border border-slate-100'}`}>
                                    <img
                                        src={casheaIcon || "https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20cashea.png?alt=media&token=5b266100-3323-41bb-a5a4-23957ce678a1"}
                                        className={`w-8 h-8 object-contain transition-all ${hasCashea ? 'scale-110' : ''}`}
                                        alt="Cashea"
                                    />
                                </div>
                                <div>
                                    <p className={`font-black tracking-tight leading-none mb-1 ${hasCashea ? 'text-yellow-900' : 'text-slate-700'}`}>Servicio Cashea</p>
                                    <p className={`text-[10px] font-bold ${hasCashea ? 'text-yellow-600' : 'text-slate-400'}`}>
                                        {hasCashea ? 'Insignia habilitada en el perfil' : 'Habilitar distintivo de pago por cuotas'}
                                    </p>
                                </div>
                            </div>
                            <div className={`w-12 h-6 rounded-full relative transition-colors ${hasCashea ? 'bg-yellow-400' : 'bg-slate-200'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${hasCashea ? 'left-7' : 'left-1'}`}></div>
                            </div>
                        </div>
                    </section>

                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <div className="flex justify-between items-center bg-slate-50/50 p-4 rounded-3xl mb-2">
                            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <Clock className="w-6 h-6 text-primary" />
                                Horario de Trabajo
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => applyBulkHours(0, 4)}
                                    className="px-3 py-1.5 bg-slate-100 text-[10px] font-black text-slate-500 rounded-xl hover:bg-slate-200 transition-colors shadow-sm"
                                    title="Aplica el horario de Lunes a los demás días hábiles"
                                >
                                    Lun-Vie
                                </button>
                                <button
                                    onClick={() => applyBulkHours(0, 6)}
                                    className="px-3 py-1.5 bg-primary/10 text-[10px] font-black text-primary rounded-xl hover:bg-primary/20 transition-colors shadow-sm"
                                    title="Aplica el horario de Lunes a toda la semana"
                                >
                                    Toda la Semana
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {workingHours.map((wh, idx) => (
                                <div
                                    key={wh.day}
                                    className={`flex items-center justify-between gap-3 p-3 rounded-3xl border-2 transition-all ${wh.closed
                                        ? 'bg-red-50/30 border-red-100/50'
                                        : 'bg-slate-50 border-transparent hover:border-slate-100'
                                        }`}
                                >
                                    <div className="w-20">
                                        <span className={`text-xs font-black uppercase tracking-wider ${wh.closed ? 'text-red-400' : 'text-slate-800'}`}>
                                            {wh.day}
                                        </span>
                                    </div>

                                    {!wh.closed ? (
                                        <div className="flex-1 flex items-center justify-center gap-2">
                                            <div className="relative group">
                                                <input
                                                    type="time"
                                                    value={wh.open}
                                                    onChange={(e) => updateWorkingHours(idx, 'open', e.target.value)}
                                                    className="bg-white border-2 border-slate-100 rounded-xl px-2 py-1.5 text-xs font-black text-slate-700 outline-none focus:border-primary transition-all"
                                                />
                                            </div>
                                            <div className="w-2 h-[2px] bg-slate-200 rounded-full" />
                                            <div className="relative group">
                                                <input
                                                    type="time"
                                                    value={wh.close}
                                                    onChange={(e) => updateWorkingHours(idx, 'close', e.target.value)}
                                                    className="bg-white border-2 border-slate-100 rounded-xl px-2 py-1.5 text-xs font-black text-slate-700 outline-none focus:border-primary transition-all"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 text-center">
                                            <span className="text-[10px] font-black text-red-500 bg-red-100/50 px-3 py-1 rounded-full uppercase tracking-widest">
                                                Cerrado
                                            </span>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => updateWorkingHours(idx, 'closed', !wh.closed)}
                                        className={`w-20 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all shadow-sm ${wh.closed
                                            ? 'bg-slate-900 text-white hover:bg-slate-800'
                                            : 'bg-white text-slate-400 hover:text-red-500 border border-slate-100'
                                            }`}
                                    >
                                        {wh.closed ? 'Abrir' : 'Cerrar'}
                                    </button>
                                </div>
                            ))}
                            <p className="text-[10px] text-slate-400 text-center font-bold italic mt-4">
                                * Tip: Configura el Lunes y presiona "Toda la Semana" para ahorrar tiempo.
                            </p>
                        </div>
                    </section>

                    {/* Social Media Section */}
                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <Share2 className="w-6 h-6 text-primary" />
                                Redes Sociales
                            </h2>
                            <button
                                onClick={() => setIsSocialAdding(!isSocialAdding)}
                                className="flex items-center gap-1.5 text-primary text-xs font-bold hover:underline"
                            >
                                <Plus className="w-4 h-4" />
                                Añadir Red
                            </button>
                        </div>

                        <AnimatePresence>
                            {isSocialAdding && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                        {globalIcons.map(icon => (
                                            <button
                                                key={icon.id}
                                                onClick={() => addSocialLink(icon)}
                                                className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl hover:border-primary border-2 border-transparent transition-all group"
                                            >
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center p-2 group-hover:scale-110 transition-transform">
                                                    <img src={icon.imageUrl} alt={icon.name} className="w-full h-full object-contain" />
                                                </div>
                                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter truncate w-full">{icon.name}</span>
                                            </button>
                                        ))}
                                        {globalIcons.length === 0 && (
                                            <p className="col-span-full text-center text-xs text-slate-400 p-4">No hay redes sociales configuradas por el administrador.</p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="space-y-4">
                            {socialLinks.length === 0 ? (
                                <div className="text-center py-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                    <Globe className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                                    <p className="text-slate-400 text-sm font-medium">Conecta tus redes para ganar confianza.</p>
                                </div>
                            ) : (
                                socialLinks.map(social => (
                                    <div key={social.id} className="flex items-center gap-4 bg-slate-50 p-4 rounded-[28px] border border-slate-100 group">
                                        <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center p-2.5 shrink-0">
                                            <img src={social.imageUrl} alt={social.name} className="w-full h-full object-contain" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{social.name}</span>
                                                <button
                                                    onClick={() => removeSocialLink(social.id)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input
                                                    type="url"
                                                    value={social.url}
                                                    onChange={(e) => updateSocialUrl(social.id, e.target.value)}
                                                    placeholder={`URL de tu perfil de ${social.name}`}
                                                    className="w-full bg-white border border-slate-200 p-2 pl-9 rounded-xl outline-none focus:border-primary font-medium text-slate-600 text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* Address Picker Modal */}
            {showPicker !== null && (
                <AddressPicker
                    onClose={() => setShowPicker(null)}
                    initialData={location?.coords ? { ...location.coords!, reference: location.reference || '' } : undefined}
                    onSave={(data) => {
                        setLocation({
                            ...(location || { address: '', city: 'Caracas', state: 'Distrito Capital', type: 'principal' }),
                            coords: { lat: data.lat, lng: data.lng },
                            reference: data.reference || location?.reference || ''
                        });
                        setShowPicker(null);
                    }}
                />
            )}
        </div>
    );
}
