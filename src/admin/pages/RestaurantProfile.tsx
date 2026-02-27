import React, { useState, useEffect } from 'react';
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
    Upload
} from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import AddressPicker from '../../components/AddressPicker';

interface Location {
    address: string;
    city: string;
    coords?: { lat: number; lng: number };
    type: 'principal' | 'sucursal';
    reference?: string;
}

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
    const [locations, setLocations] = useState<Location[]>([]);

    // UI states for image uploads
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [showPicker, setShowPicker] = useState<number | null>(null);

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
                    setLocations(data.locations || []);
                }
            } catch (error) {
                console.error("Error fetching restaurant:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRestaurant();
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
                locations,
                updatedAt: new Date()
            });

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error) {
            console.error("Error updating restaurant:", error);
            alert("Error al guardar los cambios");
        } finally {
            setIsSaving(false);
        }
    };

    const addLocation = () => {
        setLocations([...locations, { address: '', city: 'Caracas', type: 'sucursal' }]);
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

    const removeLocation = (index: number) => {
        setLocations(locations.filter((_, i) => i !== index));
    };

    const updateLocation = (index: number, field: keyof Location, value: any) => {
        const newLocations = [...locations];
        (newLocations[index] as any)[field] = value;
        setLocations(newLocations);
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
        <div className="max-w-4xl space-y-8 animate-in fade-in duration-700 pb-20">
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
                                                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                                                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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
                                                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                                                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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
                                        placeholder="Ej: Arepa Express"
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
                        </div>
                    </section>

                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <MapPin className="w-6 h-6 text-primary" />
                                Sucursales / Ubicaciones
                            </h2>
                            <button
                                onClick={addLocation}
                                className="text-primary font-bold flex items-center gap-1 hover:underline"
                            >
                                <Plus className="w-4 h-4" />
                                Añadir Sucursal
                            </button>
                        </div>

                        <div className="space-y-4">
                            {locations.length === 0 ? (
                                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-[30px] grayscale opacity-50">
                                    <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                    <p className="text-slate-400 font-bold">Añade al menos una ubicación para que los clientes te encuentren.</p>
                                </div>
                            ) : (
                                locations.map((loc, idx) => (
                                    <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4 group relative">
                                        <button
                                            onClick={() => removeLocation(idx)}
                                            className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tipo de Sede</label>
                                                <select
                                                    value={loc.type}
                                                    onChange={(e) => updateLocation(idx, 'type', e.target.value as any)}
                                                    className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm appearance-none"
                                                >
                                                    <option value="principal">Casa Matriz</option>
                                                    <option value="sucursal">Sucursal</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ciudad</label>
                                                <input
                                                    type="text"
                                                    value={loc.city}
                                                    onChange={(e) => updateLocation(idx, 'city', e.target.value)}
                                                    className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                    placeholder="Ej: Caracas"
                                                />
                                            </div>
                                            <div className="space-y-1 relative">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ubicación GPS</label>
                                                <button
                                                    onClick={() => setShowPicker(idx)}
                                                    className={`w-full p-3 rounded-xl border font-bold text-sm flex items-center gap-2 justify-center transition-all ${loc.coords ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 bg-white text-slate-500 hover:border-primary hover:text-primary'}`}
                                                >
                                                    <MapIcon className="w-4 h-4" />
                                                    {loc.coords ? 'Reubicar en Mapa' : 'Marcar en Mapa'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dirección Detallada</label>
                                                <input
                                                    type="text"
                                                    value={loc.address}
                                                    onChange={(e) => updateLocation(idx, 'address', e.target.value)}
                                                    className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                    placeholder="Ej: Av. Principal de El Rosal"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Referencia (Opcional)</label>
                                                <input
                                                    type="text"
                                                    value={loc.reference || ''}
                                                    onChange={(e) => updateLocation(idx, 'reference', e.target.value)}
                                                    className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                    placeholder="Ej: Frente a la plaza"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
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
                            <span className="font-bold text-slate-700">Delivery Propio</span>
                            <div className={`w-12 h-6 rounded-full relative transition-colors ${ownDelivery ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${ownDelivery ? 'left-7' : 'left-1'}`}></div>
                            </div>
                        </div>

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
                    </section>
                </div>
            </div>

            {/* Address Picker Modal */}
            {showPicker !== null && (
                <AddressPicker
                    onClose={() => setShowPicker(null)}
                    initialData={locations[showPicker]?.coords ? { ...locations[showPicker].coords!, reference: locations[showPicker].reference || '' } : undefined}
                    onSave={(data) => {
                        updateLocation(showPicker, 'coords', { lat: data.lat, lng: data.lng });
                        if (data.reference && !locations[showPicker].reference) {
                            updateLocation(showPicker, 'reference', data.reference);
                        }
                        setShowPicker(null);
                    }}
                />
            )}
        </div>
    );
}
