import React, { useState, useEffect } from 'react';
import { 
    Palette, 
    UploadCloud, 
    Save, 
    CheckCircle2, 
    Image as ImageIcon, 
    Sparkles, 
    RefreshCw, 
    Globe, 
    Layers, 
    ShieldCheck, 
    Smartphone, 
    Store, 
    Car, 
    LayoutDashboard,
    Zap
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export interface BrandingData {
    app_client_logo: string;
    app_client_name: string;
    app_driver_logo: string;
    app_restaurant_logo: string;
    app_admin_logo: string;
    app_favicon?: string | null;
    splash_screen_logo?: string | null;
    driver_footer_text?: string | null;
    client_footer_text?: string | null;
}

const DEFAULT_BRANDING: BrandingData = {
    app_client_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_client_logo_1788875672174.png',
    app_client_name: 'Un 2x3',
    app_driver_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_driver_logo_1788875821044.jpg',
    app_restaurant_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_restaurant_logo_1788875678044.jpg',
    app_admin_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_admin_logo_1788875678335.jpg',
    splash_screen_logo: null,
    app_favicon: null,
    driver_footer_text: 'Conductores v2.0',
    client_footer_text: 'Hecho con ❤️ en Venezuela'
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
                    app_favicon: data.app_favicon || null,
                    splash_screen_logo: data.splash_screen_logo || null,
                    driver_footer_text: data.driver_footer_text || DEFAULT_BRANDING.driver_footer_text,
                    client_footer_text: data.client_footer_text || DEFAULT_BRANDING.client_footer_text
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

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
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

            const finalBranding: BrandingData = {
                ...branding,
                ...updatedUrls,
                app_client_name: (branding.app_client_name || 'Un 2x3').trim()
            };

            const nowIso = new Date().toISOString();

            // 1. Actualizar public.app_branding (registro id = 'current')
            const { error: dbError } = await supabase
                .from('app_branding')
                .upsert({
                    id: 'current',
                    ...finalBranding,
                    updated_at: nowIso
                });

            if (dbError) throw dbError;

            // 2. Sincronizar en public.system_settings (key = 'branding')
            const { error: settingsError } = await supabase
                .from('system_settings')
                .upsert({
                    key: 'branding',
                    value: {
                        id: 'current',
                        ...finalBranding,
                        updated_at: nowIso
                    },
                    updated_at: nowIso
                });

            if (settingsError) {
                console.warn("Advertencia al sincronizar system_settings:", settingsError);
            }

            setBranding(finalBranding);
            setFilesToUpload({});

            // 3. Cache local para respuesta inmediata
            try {
                localStorage.setItem('un2x3_app_branding_cache', JSON.stringify(finalBranding));
            } catch (e) {}

            toast.success(
                `¡Identidad Global actualizada con éxito! El nuevo nombre maestro "${finalBranding.app_client_name}" y sus logos se han sincronizado en tiempo real en todas las aplicaciones (Client, Restaurant, Delivery, Admin, Cashier, Waiter).`,
                { duration: 6000 }
            );
        } catch (err: any) {
            console.error("Error guardando diseño:", err);
            toast.error(err.message || "Ocurrió un error al guardar la identidad global.");
        } finally {
            setSaving(false);
        }
    };

    const logoCards = [
        {
            key: 'app_client_logo',
            title: 'Logo Principal (App Clientes)',
            desc: 'Aparece en la cabecera, inicio, checkout y perfil de la aplicación móvil y web de Clientes.',
            badge: 'Clientes',
            icon: Smartphone,
            accent: 'from-amber-500/20 to-orange-500/20 text-amber-600'
        },
        {
            key: 'app_restaurant_logo',
            title: 'Logo de Negocios (Restaurantes)',
            desc: 'Aparece en el panel de comercios, login de restaurantes y comandas de cocina.',
            badge: 'Comercios',
            icon: Store,
            accent: 'from-blue-500/20 to-cyan-500/20 text-blue-600'
        },
        {
            key: 'app_driver_logo',
            title: 'Logo de Conductores (Drivers & Repartidores)',
            desc: 'Aparece en el login de choferes, radar de pedidos y perfil del transportista.',
            badge: 'Conductores',
            icon: Car,
            accent: 'from-emerald-500/20 to-teal-500/20 text-emerald-600'
        },
        {
            key: 'app_admin_logo',
            title: 'Logo del Super Panel (Administración)',
            desc: 'Aparece en el acceso maestro y barra lateral de navegación del Super Administrador.',
            badge: 'Super Admin',
            icon: LayoutDashboard,
            accent: 'from-purple-500/20 to-indigo-500/20 text-purple-600'
        },
        {
            key: 'splash_screen_logo',
            title: 'Logo de Splash Screen (Pantalla de Carga)',
            desc: 'Aparece en el splash de arranque y animación de bienvenida de todas las aplicaciones.',
            badge: 'Splash Screen',
            icon: Zap,
            accent: 'from-yellow-500/20 to-amber-500/20 text-yellow-600'
        }
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Cargando Gestor de Identidad...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-300 pb-16">
            {/* Header Superior */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 md:p-8 rounded-[32px] shadow-sm">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 bg-primary/10 text-slate-900 rounded-2xl">
                            <Palette className="w-6 h-6 text-slate-900" />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                            Branding Global y Marca
                        </h1>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">
                        Control maestro de la identidad de la plataforma. Los cambios se propagan de inmediato a todas las aplicaciones.
                    </p>
                </div>

                <button
                    onClick={() => handleSave()}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 px-7 py-4 bg-primary text-slate-950 font-black rounded-2xl hover:bg-yellow-400 transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
                >
                    {saving ? (
                        <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            <span>Guardar Todo con 1 Clic</span>
                        </>
                    )}
                </button>
            </div>

            {/* TARJETA PRINCIPAL DESTACADA: IDENTIDAD GLOBAL DE LA PLATAFORMA (CAMBIO DE NOMBRE MAESTRO) */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-2 border-primary/40 p-6 md:p-8 rounded-[36px] shadow-2xl text-white">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-primary text-slate-950 rounded-2xl shadow-lg shadow-primary/30">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <div>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/20 text-primary border border-primary/30 rounded-full text-[10px] font-black uppercase tracking-wider mb-1">
                                    <Globe className="w-3 h-3" /> Control Maestro en Tiempo Real
                                </span>
                                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                                    Identidad Global de la Plataforma (Cambio de Nombre Maestro)
                                </h2>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                Sincronización Reactiva Supabase
                            </span>
                        </div>
                    </div>

                    <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
                        Este nombre maestro reemplaza automáticamente la marca en todas las 6 aplicaciones del ecosistema 
                        (<strong className="text-white">Cliente, Restaurante, Delivery, SuperAdmin, Caja y Mesero</strong>), 
                        así como en títulos de documentos (<code className="text-primary font-mono text-xs">document.title</code>), 
                        login, cabeceras, radares y notificaciones sin necesidad de modificar el código ni redesplegar.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2 items-end">
                        <div className="md:col-span-8">
                            <label className="text-xs font-black text-primary uppercase tracking-wider block mb-2">
                                Nombre Global de la Plataforma (app_client_name)
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={branding.app_client_name}
                                    onChange={(e) => setBranding({ ...branding, app_client_name: e.target.value })}
                                    className="w-full bg-white/10 border-2 border-white/20 focus:border-primary focus:bg-white/15 px-5 py-4 rounded-2xl outline-none font-black text-lg md:text-xl text-white placeholder-slate-500 transition-all shadow-inner"
                                    placeholder="Ej: Un 2x3"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-white/10">
                                    Actual: {branding.app_client_name || 'Un 2x3'}
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-2 font-medium">
                                Valor por defecto oficial: <code className="text-white font-bold bg-white/10 px-1.5 py-0.5 rounded">Un 2x3</code>. Si cambias este valor, se reflejará al instante en todas las apps conectadas.
                            </p>
                        </div>

                        <div className="md:col-span-4 flex gap-3">
                            <button
                                onClick={() => handleSave()}
                                disabled={saving}
                                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary text-slate-950 font-black rounded-2xl hover:bg-yellow-400 transition-all shadow-xl shadow-primary/30 active:scale-95 disabled:opacity-50"
                            >
                                {saving ? (
                                    <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Save className="w-5 h-5" />
                                        <span>Guardar Identidad Global</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN DE LOGOS OFICIALES */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-primary" />
                            Logos Oficiales del Ecosistema
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                            Gestiona las 5 imágenes oficiales de la marca que alimentan todas las aplicaciones.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {logoCards.map((card) => {
                        const currentImg = previews[card.key] || (branding as any)[card.key];
                        const hasPendingUpload = !!filesToUpload[card.key];
                        const CardIcon = card.icon;

                        return (
                            <div
                                key={card.key}
                                className="bg-white border border-slate-200/80 rounded-[32px] p-6 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-all group"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-2 rounded-xl bg-gradient-to-br ${card.accent}`}>
                                                <CardIcon className="w-4 h-4" />
                                            </div>
                                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-wider rounded-xl">
                                                {card.badge}
                                            </span>
                                        </div>
                                        {hasPendingUpload && (
                                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold text-[10px] uppercase tracking-wider rounded-xl animate-pulse">
                                                Por Guardar
                                            </span>
                                        )}
                                    </div>

                                    <h4 className="text-base font-black text-slate-900 mb-1 leading-snug">
                                        {card.title}
                                    </h4>
                                    <p className="text-xs text-slate-500 font-medium mb-4 min-h-[36px]">
                                        {card.desc}
                                    </p>

                                    {/* Preview Box */}
                                    <div className="w-full h-40 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center p-4 mb-4 relative overflow-hidden group-hover:border-primary/50 transition-colors">
                                        {currentImg ? (
                                            <img
                                                src={currentImg}
                                                alt={card.title}
                                                className="max-h-28 max-w-full object-contain filter drop-shadow-md"
                                            />
                                        ) : (
                                            <div className="text-center text-slate-400">
                                                <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
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
                                        className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-800 border-2 border-slate-200/80 hover:border-slate-300 font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-sm"
                                    >
                                        <UploadCloud className="w-4 h-4 text-primary" />
                                        <span>{hasPendingUpload ? "Cambiar Selección" : "Subir Logo"}</span>
                                    </label>
                                    <p className="text-[10px] text-slate-400 text-center font-medium mt-1.5">
                                        Recomendado: PNG o WebP transparente
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SECCIÓN DE TEXTOS COMPLEMENTARIOS DE PIE DE PÁGINA */}
            <div className="bg-white border border-slate-200/80 p-6 md:p-8 rounded-[32px] shadow-sm space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" /> Textos Complementarios de Pie de Página
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-1">
                            Texto Pie de Página Conductor (App Driver)
                        </label>
                        <input
                            type="text"
                            value={branding.driver_footer_text || ''}
                            onChange={(e) => setBranding({ ...branding, driver_footer_text: e.target.value })}
                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-800 text-sm transition-all"
                            placeholder="Ej: Conductores v2.0"
                        />
                        <p className="text-[11px] text-slate-400 mt-1 ml-1">
                            Aparece debajo del botón de Cerrar Sesión en el perfil del conductor.
                        </p>
                    </div>

                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-1">
                            Texto Pie de Página Cliente (App Cliente)
                        </label>
                        <input
                            type="text"
                            value={branding.client_footer_text || ''}
                            onChange={(e) => setBranding({ ...branding, client_footer_text: e.target.value })}
                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-800 text-sm transition-all"
                            placeholder="Ej: Hecho con ❤️ en Venezuela"
                        />
                        <p className="text-[11px] text-slate-400 mt-1 ml-1">
                            Aparece debajo del logo final en el perfil del cliente.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
