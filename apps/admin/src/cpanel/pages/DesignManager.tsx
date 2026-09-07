import React, { useState, useEffect } from 'react';
import { Palette, UploadCloud, Save, CheckCircle2, Image as ImageIcon, Sparkles, RefreshCw, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface BrandingData {
    app_client_logo: string;
    app_client_name: string;
    app_driver_logo: string;
    app_restaurant_logo: string;
    app_admin_logo: string;
    app_favicon?: string;
    splash_screen_logo?: string;
}

const DEFAULT_BRANDING: BrandingData = {
    app_client_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/logo.png',
    app_client_name: 'DeliExpress',
    app_driver_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/logo.png',
    app_restaurant_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/logo.png',
    app_admin_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/logo.png',
};

export default function DesignManager() {
    const [branding, setBranding] = useState<BrandingData>(DEFAULT_BRANDING);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Archivos seleccionados localmente para subir
    const [filesToUpload, setFilesToUpload] = useState<{ [key: string]: File }>({});
    const [previews, setPreviews] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        fetchBranding();
    }, []);

    const fetchBranding = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_branding')
                .select('*')
                .eq('id', 'current')
                .maybeSingle();

            if (error) {
                console.warn("Error obteniendo branding:", error);
            } else if (data) {
                setBranding({
                    app_client_logo: data.app_client_logo || DEFAULT_BRANDING.app_client_logo,
                    app_client_name: data.app_client_name || DEFAULT_BRANDING.app_client_name,
                    app_driver_logo: data.app_driver_logo || DEFAULT_BRANDING.app_driver_logo,
                    app_restaurant_logo: data.app_restaurant_logo || DEFAULT_BRANDING.app_restaurant_logo,
                    app_admin_logo: data.app_admin_logo || DEFAULT_BRANDING.app_admin_logo,
                    app_favicon: data.app_favicon,
                    splash_screen_logo: data.splash_screen_logo
                });
            }
        } catch (e) {
            console.error("Excepción al cargar diseño:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (key: string, file: File) => {
        setFilesToUpload(prev => ({ ...prev, [key]: file }));
        const previewUrl = URL.createObjectURL(file);
        setPreviews(prev => ({ ...prev, [key]: previewUrl }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const updatedUrls: Partial<BrandingData> = {};

            // Subir los archivos nuevos a Supabase Storage
            for (const [key, file] of Object.entries(filesToUpload)) {
                const ext = file.name.split('.').pop() || 'png';
                const path = `logos/${key}_${Date.now()}.${ext}`;

                const { error: uploadErr } = await supabase.storage
                    .from('branding')
                    .upload(path, file, { upsert: true });

                if (uploadErr) {
                    console.error(`Error subiendo ${key}:`, uploadErr);
                    throw new Error(`Error al subir imagen para ${key}`);
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('branding')
                    .getPublicUrl(path);

                (updatedUrls as any)[key] = publicUrl;
            }

            const finalBranding = {
                ...branding,
                ...updatedUrls,
                updated_at: new Date().toISOString()
            };

            const { error: dbError } = await supabase
                .from('app_branding')
                .upsert({
                    id: 'current',
                    ...finalBranding
                });

            if (dbError) throw dbError;

            setBranding(finalBranding);
            setFilesToUpload({});
            toast.success("¡Diseño y logos actualizados con éxito!");
        } catch (err: any) {
            console.error("Error guardando diseño:", err);
            toast.error(err.message || "Ocurrió un error al guardar.");
        } finally {
            setSaving(false);
        }
    };

    const logoCards = [
        {
            key: 'app_client_logo',
            title: 'Logo Principal (App Clientes)',
            desc: 'Aparece en la cabecera, inicio y splash de app.deliexpress.app',
            badge: 'Clientes'
        },
        {
            key: 'app_driver_logo',
            title: 'Logo de Drivers (Repartidores)',
            desc: 'Aparece en el inicio de sesión y panel de driver.deliexpress.app',
            badge: 'Conductores'
        },
        {
            key: 'app_restaurant_logo',
            title: 'Logo de Negocios (Restaurantes)',
            desc: 'Aparece en el panel de comercios y restaurantes negocios.deliexpress.app',
            badge: 'Comercios'
        },
        {
            key: 'app_admin_logo',
            title: 'Logo del Super Panel (Administración)',
            desc: 'Aparece en el login y barra lateral de un2x3-admin.pages.dev',
            badge: 'Super Admin'
        }
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Cargando Gestor de Diseño...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300 pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 md:p-8 rounded-[32px] shadow-sm">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 bg-primary/10 text-slate-900 rounded-2xl">
                            <Palette className="w-6 h-6 text-slate-900" />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                            Diseño y Marca Visual
                        </h1>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">
                        Personaliza los logos oficiales e identidad visual de todas las aplicaciones en tiempo real.
                    </p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-primary text-slate-950 font-black rounded-2xl hover:bg-yellow-400 transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
                >
                    {saving ? (
                        <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            <span>Guardar Cambios</span>
                        </>
                    )}
                </button>
            </div>

            {/* Brand Name Input */}
            <div className="bg-white border border-slate-200/80 p-6 md:p-8 rounded-[32px] shadow-sm">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> Nombre General de la Marca
                </h3>
                <div className="max-w-md">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 ml-1">
                        Nombre de la Plataforma
                    </label>
                    <input
                        type="text"
                        value={branding.app_client_name}
                        onChange={(e) => setBranding({ ...branding, app_client_name: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3.5 rounded-2xl outline-none font-bold text-slate-800 transition-all"
                        placeholder="Ej: DeliExpress / Encontrado en un 2x3"
                    />
                </div>
            </div>

            {/* Logo Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {logoCards.map((card) => {
                    const currentImg = previews[card.key] || (branding as any)[card.key];
                    const hasPendingUpload = !!filesToUpload[card.key];

                    return (
                        <div
                            key={card.key}
                            className="bg-white border border-slate-200/80 rounded-[32px] p-6 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-all group"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="px-3 py-1 bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-wider rounded-xl">
                                        {card.badge}
                                    </span>
                                    {hasPendingUpload && (
                                        <span className="px-3 py-1 bg-amber-100 text-amber-800 font-bold text-[10px] uppercase tracking-wider rounded-xl animate-pulse">
                                            Listo para guardar
                                        </span>
                                    )}
                                </div>

                                <h3 className="text-lg font-black text-slate-900 mb-1">
                                    {card.title}
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mb-6">
                                    {card.desc}
                                </p>

                                {/* Preview Box */}
                                <div className="w-full h-44 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center p-4 mb-4 relative overflow-hidden group-hover:border-primary/50 transition-colors">
                                    {currentImg ? (
                                        <img
                                            src={currentImg}
                                            alt={card.title}
                                            className="max-h-32 max-w-full object-contain filter drop-shadow-md"
                                        />
                                    ) : (
                                        <div className="text-center text-slate-400">
                                            <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                            <span className="text-xs font-bold">Sin logo asignado</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Upload Button */}
                            <div className="relative">
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                    id={`file-${card.key}`}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFileSelect(card.key, file);
                                    }}
                                    className="hidden"
                                />
                                <label
                                    htmlFor={`file-${card.key}`}
                                    className="w-full py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border-2 border-slate-200/80 hover:border-slate-300 font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
                                >
                                    <UploadCloud className="w-4 h-4 text-primary" />
                                    <span>{hasPendingUpload ? "Cambiar Selección" : "Subir Nuevo Logo"}</span>
                                </label>
                                <p className="text-[10px] text-slate-400 text-center font-bold mt-2">
                                    Recomendado: PNG o SVG transparente (512x512px)
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
