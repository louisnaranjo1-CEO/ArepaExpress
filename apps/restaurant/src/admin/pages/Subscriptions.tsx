import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { CreditCard, CheckCircle2, AlertCircle, Clock, Layout, Globe, Map as MapIcon, MapPin as PinIcon, Sparkles, Percent, DollarSign, Gift, Shield, Check, Lock, ChevronRight, UserCheck, Grid, Printer, Users, Bell, ShoppingBag, MessageSquare, Megaphone } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const MODULE_ITEMS = [
    { key: 'orders', label: 'Recibir Pedidos en Línea', icon: ShoppingBag },
    { key: 'cash_internal', label: 'Caja Interna y Finanzas', icon: DollarSign },
    { key: 'products', label: 'Gestión de Productos y Menú', icon: Layout },
    { key: 'notifications', label: 'Avisos y Notificaciones', icon: Bell },
    { key: 'clients', label: 'Gestión de Clientes', icon: Users },
    { key: 'loyalty', label: 'Fidelización y Puntos', icon: Gift },
    { key: 'ads_and_push', label: 'Publicidad y Campañas Push', icon: Megaphone },
    { key: 'reviews', label: 'Reseñas de Clientes', icon: MessageSquare },
    { key: 'waiters', label: 'Módulo Meseros (App)', icon: UserCheck, corporateOnly: true },
    { key: 'cashiers', label: 'Módulo Cajeras (App)', icon: Shield, corporateOnly: true },
    { key: 'tables', label: 'Control de Mesas QR', icon: Grid, corporateOnly: true },
    { key: 'printer_stations', label: 'Estaciones de Impresión Térmica', icon: Printer, corporateOnly: true },
];

export default function Subscriptions() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const rid = userData?.managedRestaurantId || user?.uid;
    const [loading, setLoading] = useState(true);
    const [restaurantData, setRestaurantData] = useState<any>(null);
    const [plansConfig, setPlansConfig] = useState<any>(null);
    const [bannerPricing, setBannerPricing] = useState<any>({
        national: { price: 30, updateLimit: 3, availability: 'available' },
        state: { price: 15, updateLimit: 3, availability: 'available' },
        city: { price: 5, updateLimit: 3, availability: 'available' }
    });
    const [bannerStats, setBannerStats] = useState({
        used: 0,
        total: 3,
        remaining: 3
    });

    useEffect(() => {
        if (!rid) return;

        const fetchData = async () => {
            try {
                const [restRes, plansRes, bannerRes] = await Promise.all([
                    supabase.from('comercios').select('*').eq('id', rid).maybeSingle(),
                    supabase.from('system_settings').select('*').eq('key', 'subscription_plans_config').maybeSingle(),
                    supabase.from('system_settings').select('*').eq('key', 'banner_plans_config').maybeSingle()
                ]);

                if (restRes.data) {
                    setRestaurantData(restRes.data);
                }

                if (plansRes.data?.value) {
                    setPlansConfig(plansRes.data.value);
                } else if (plansRes.data?.data) {
                    setPlansConfig(plansRes.data.data);
                }

                if (bannerRes.data?.value) {
                    setBannerPricing(bannerRes.data.value);
                } else {
                    const { data: appData } = await supabase.from('app_settings').select('*').eq('id', 'subscriptions').maybeSingle();
                    if (appData?.banner_pricing) {
                        setBannerPricing(appData.banner_pricing);
                    }
                }
            } catch (err) {
                console.error("Error fetching subscriptions data:", err);
            } finally {
                setLoading(false);
            }
        };

        const channel = supabase.channel(`comercios-sub-detail:${rid}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'comercios',
                filter: `id=eq.${rid}`
            }, (payload) => {
                const updated = payload.new as any;
                if (updated) setRestaurantData(updated);
            })
            .subscribe();

        fetchData();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [rid]);

    // Fetch banner usage for current month
    useEffect(() => {
        if (!rid) return;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const fetchBannerCount = async () => {
            try {
                const { count } = await supabase
                    .from('banners')
                    .select('*', { count: 'exact', head: true })
                    .eq('restaurant_id', rid)
                    .gte('created_at', startOfMonth.toISOString());

                const limit = 3;
                const used = count || 0;
                setBannerStats({
                    used,
                    total: limit,
                    remaining: Math.max(0, limit - used)
                });
            } catch (e) {
                console.warn(e);
            }
        };

        fetchBannerCount();
    }, [rid]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const billingMode = restaurantData?.billing_mode || 'subscription';
    const planId = (restaurantData?.plan_id || 'emprendedor') as 'emprendedor' | 'corporativo';
    const isGlobalFreePromo = Boolean(plansConfig?.freeTrialEnabled);
    const globalTransitionDate = plansConfig?.transitionDate ? new Date(plansConfig.transitionDate) : null;
    const defaultTransitionPlan = plansConfig?.defaultTransitionPlanId || 'emprendedor';

    const emprendedorConfig = plansConfig?.plans?.emprendedor || {
        name: 'Plan Aliado Emprendedor',
        price: 4.99,
        description: 'Ideal para negocios con delivery propio o retiro en tienda que desean recibir pedidos y gestionar su caja.',
        features: { orders: true, cash_internal: true, products: true, notifications: true, clients: true, loyalty: true }
    };

    const corporativoConfig = plansConfig?.plans?.corporativo || {
        name: 'Plan Aliado Corporativo',
        price: 14.99,
        description: 'Todo incluido: Meseros, Cajeras, Mesas QR y Estaciones de impresión térmica.',
        features: { orders: true, cash_internal: true, products: true, notifications: true, clients: true, loyalty: true, waiters: true, cashiers: true, tables: true, printer_stations: true }
    };

    const activePlanConfig = planId === 'corporativo' ? corporativoConfig : emprendedorConfig;

    const isModuleActive = (moduleKey: string) => {
        if (billingMode === 'commission' || billingMode === 'free_custom') {
            if (restaurantData?.custom_features && restaurantData.custom_features[moduleKey] !== undefined) {
                return Boolean(restaurantData.custom_features[moduleKey]);
            }
            const corporateKeys = ['waiters', 'cashiers', 'tables', 'printer_stations'];
            return !corporateKeys.includes(moduleKey);
        }

        // Suscripción
        if (planId === 'corporativo') return true;
        if (emprendedorConfig.features && emprendedorConfig.features[moduleKey] !== undefined) {
            return Boolean(emprendedorConfig.features[moduleKey]);
        }
        const corporateKeys = ['waiters', 'cashiers', 'tables', 'printer_stations'];
        return !corporateKeys.includes(moduleKey);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700">
            <header>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Suscripción y Modalidad Comercial</h1>
                <p className="text-slate-500 font-medium">Revisa las condiciones comerciales de tu cuenta y los módulos habilitados para tu negocio.</p>
            </header>

            {/* SECCIÓN 1: ESTADO COMERCIAL ACTUAL */}
            {isGlobalFreePromo ? (
                /* CASO A: LANZAMIENTO GLOBAL GRATUITO */
                <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden">
                    <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                                <Sparkles className="w-8 h-8 text-amber-300 animate-spin duration-3000" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-full shadow-sm">
                                        🎉 Período de Lanzamiento Activo
                                    </span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                                    Gratis por tiempo limitado
                                </h2>
                                <p className="text-sm text-emerald-50/90 font-medium max-w-xl leading-relaxed">
                                    Tu comercio cuenta con acceso 100% gratuito sin pagos mensuales hasta el{' '}
                                    <strong className="text-white underline font-black">
                                        {globalTransitionDate ? format(globalTransitionDate, "dd 'de' MMMM, yyyy", { locale: es }) : 'próximo aviso'}
                                    </strong>
                                    . Al finalizar esta etapa, pasarás al{' '}
                                    <strong>{defaultTransitionPlan === 'corporativo' ? corporativoConfig.name : emprendedorConfig.name}</strong> (${defaultTransitionPlan === 'corporativo' ? corporativoConfig.price : emprendedorConfig.price} USD/mes).
                                </p>
                            </div>
                        </div>

                        <div className="bg-white/15 backdrop-blur-md border border-white/20 p-5 rounded-3xl text-center shrink-0 min-w-[200px]">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Tarifa Actual</p>
                            <p className="text-4xl font-black text-white">$0.00</p>
                            <p className="text-[11px] font-bold text-emerald-100 mt-1">Cortesía de Lanzamiento</p>
                        </div>
                    </div>
                </div>
            ) : billingMode === 'commission' ? (
                /* CASO B: COMISIÓN POR VENTA */
                <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white shadow-xl shadow-amber-500/20 relative overflow-hidden">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                                <Percent className="w-8 h-8 text-white" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-white text-slate-900 font-black text-[10px] uppercase tracking-widest rounded-full shadow-sm">
                                        Modalidad Activa: Comisión por Venta
                                    </span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                                    Tarifa por Pedido Vendido
                                </h2>
                                <p className="text-sm text-amber-50/90 font-medium max-w-xl leading-relaxed">
                                    No pagas mensualidad fija. Tu negocio abona{' '}
                                    <strong className="text-white font-black underline">
                                        {restaurantData.commission_type === 'fixed'
                                            ? `$${Number(restaurantData.commission_rate || 0.50).toFixed(2)} USD fijos`
                                            : `${restaurantData.commission_rate || 10}% del total`}
                                    </strong>{' '}
                                    por cada pedido entregado con éxito a través de la plataforma.
                                </p>
                            </div>
                        </div>

                        <div className="bg-white/15 backdrop-blur-md border border-white/20 p-5 rounded-3xl text-center shrink-0 min-w-[200px]">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-100">Deuda Comisiones</p>
                            <p className="text-3xl sm:text-4xl font-black text-white">
                                ${Number(restaurantData.deuda_comisiones_acumulada || 0).toFixed(2)}
                            </p>
                            <p className="text-[11px] font-bold text-amber-100 mt-1">Acumulado a Liquidar</p>
                        </div>
                    </div>
                </div>
            ) : billingMode === 'free_custom' ? (
                /* CASO C: GRATIS / CORTESÍA ESPECIAL */
                <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 text-white shadow-xl shadow-indigo-600/20 relative overflow-hidden">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                                <Gift className="w-8 h-8 text-amber-300" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-amber-400 text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-full shadow-sm">
                                        Acuerdo Especial
                                    </span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                                    Desbloqueo Especial por Superadmin
                                </h2>
                                <p className="text-sm text-indigo-100/90 font-medium max-w-xl leading-relaxed">
                                    {restaurantData.free_until ? (
                                        <>
                                            Tu comercio disfruta de gratuidad y funciones activadas a la medida hasta el{' '}
                                            <strong className="text-white font-black underline">
                                                {format(new Date(restaurantData.free_until), "dd 'de' MMMM, yyyy", { locale: es })}
                                            </strong>
                                            . Posterior a esta fecha pasarás al <strong>{planId === 'corporativo' ? corporativoConfig.name : emprendedorConfig.name}</strong>.
                                        </>
                                    ) : (
                                        <>
                                            Tu comercio cuenta con acceso de cortesía especial indefinido con módulos desbloqueados directamente por la directiva de Un 2x3.
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white/15 backdrop-blur-md border border-white/20 p-5 rounded-3xl text-center shrink-0 min-w-[200px]">
                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Condición</p>
                            <p className="text-3xl font-black text-white">Cortesía</p>
                            <p className="text-[11px] font-bold text-indigo-200 mt-1">Sin cobro fijo mensual</p>
                        </div>
                    </div>
                </div>
            ) : (
                /* CASO D: SUSCRIPCIÓN MENSUAL ESTÁNDAR */
                <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white shadow-xl shadow-slate-950/20 relative overflow-hidden">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
                                <CreditCard className="w-8 h-8 text-primary" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-primary text-slate-950 font-black text-[10px] uppercase tracking-widest rounded-full shadow-sm">
                                        Plan Activo: {activePlanConfig.name}
                                    </span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                                    {activePlanConfig.name}
                                </h2>
                                <p className="text-sm text-slate-300 font-medium max-w-xl leading-relaxed">
                                    {activePlanConfig.description}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md border border-white/10 p-5 rounded-3xl text-center shrink-0 min-w-[200px]">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cuota Mensual</p>
                            <p className="text-3xl sm:text-4xl font-black text-white">${activePlanConfig.price}</p>
                            <p className="text-[11px] font-bold text-primary mt-1">USD / Mes</p>
                        </div>
                    </div>
                </div>
            )}

            {/* SECCIÓN 2: MÓDULOS DE LA PLATAFORMA (DESBLOQUEADOS Y BLOQUEADOS) */}
            <div className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-100 shadow-xl shadow-slate-200/40 space-y-6">
                <div>
                    <h3 className="text-xl font-black text-slate-900">Módulos Habilitados para tu Negocio</h3>
                    <p className="text-sm text-slate-500 font-medium mt-1">
                        Según tu modalidad actual ({billingMode === 'commission' ? 'Comisión por Venta' : billingMode === 'free_custom' ? 'Cortesía Especial' : activePlanConfig.name}), estos son los módulos activos en tu panel:
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {MODULE_ITEMS.map((mod) => {
                        const active = isModuleActive(mod.key);
                        const Icon = mod.icon;

                        return (
                            <div
                                key={mod.key}
                                className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                                    active
                                        ? 'bg-emerald-50/60 border-emerald-100 text-emerald-900 shadow-xs'
                                        : 'bg-slate-50 border-slate-200/60 text-slate-400 opacity-60'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'
                                    }`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black leading-tight text-slate-900">
                                            {mod.label}
                                        </p>
                                        {mod.corporateOnly && (
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 block">
                                                Plan Corporativo
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    {active ? (
                                        <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                                        </div>
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center">
                                            <Lock className="w-3 h-3" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SECCIÓN 3: PUBLICIDAD Y BANNERS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Banner Usage / Limits */}
                <div className="lg:col-span-1 bg-white rounded-[2.5rem] border-2 border-slate-100 p-8 shadow-xl shadow-slate-200/40 space-y-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-primary">
                                    <Layout className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-base">Uso de Banners</h3>
                                    <p className="text-xs text-slate-500 font-medium">Banners creados este mes</p>
                                </div>
                            </div>
                            <span className="text-2xl font-black text-slate-900">{bannerStats.used}</span>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 font-medium space-y-1">
                            <p>📌 Todos los banners publicados requieren la aprobación del Superadministrador.</p>
                            <p>⏳ Una vez aprobado, tu anuncio se mostrará en el carrusel de inicio.</p>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate('/banners')}
                        className="w-full py-3.5 px-4 bg-primary hover:bg-amber-400 text-slate-900 rounded-2xl font-black text-xs shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <Layout className="w-4 h-4" />
                        Ir a Gestión de Banners
                    </button>
                </div>

                {/* Banner Advertising Rates */}
                <div className="lg:col-span-2 space-y-4">
                    <div>
                        <h3 className="text-xl font-black text-slate-900">Tarifas y Alcance de Banners</h3>
                        <p className="text-xs text-slate-500 font-medium">Costos oficiales y disponibilidad para promocionar tu comercio en el inicio de la app:</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Nacional */}
                        <div className="bg-white rounded-3xl border-2 border-slate-100 p-5 shadow-sm space-y-4 flex flex-col justify-between">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                                        <Globe className="w-4 h-4" />
                                    </div>
                                    {bannerPricing.national?.availability === 'free' ? (
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black rounded-full uppercase tracking-wider">
                                            🎁 Gratis
                                        </span>
                                    ) : (
                                        <span className="text-xs font-black text-slate-900">
                                            ${bannerPricing.national?.price || 30}/mes
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-900 text-sm">Banner Nacional</h4>
                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                                        Visible en todo el país en todas las ciudades.
                                    </p>
                                </div>
                            </div>

                            {bannerPricing.national?.availability === 'free' ? (
                                <button
                                    onClick={() => navigate('/banners')}
                                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-colors"
                                >
                                    Postular Gratis
                                </button>
                            ) : (
                                <span className="text-[10px] font-bold text-slate-400 block text-center">
                                    {bannerPricing.national?.availability === 'available' ? 'Disponible para contratar' : 'Cupos no disponibles'}
                                </span>
                            )}
                        </div>

                        {/* Regional / Estado */}
                        <div className="bg-white rounded-3xl border-2 border-slate-100 p-5 shadow-sm space-y-4 flex flex-col justify-between">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                                        <MapIcon className="w-4 h-4" />
                                    </div>
                                    {bannerPricing.state?.availability === 'free' ? (
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black rounded-full uppercase tracking-wider">
                                            🎁 Gratis
                                        </span>
                                    ) : (
                                        <span className="text-xs font-black text-slate-900">
                                            ${bannerPricing.state?.price || 15}/mes
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-900 text-sm">Banner Regional</h4>
                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                                        Visible para los usuarios de tu estado.
                                    </p>
                                </div>
                            </div>

                            {bannerPricing.state?.availability === 'free' ? (
                                <button
                                    onClick={() => navigate('/banners')}
                                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-colors"
                                >
                                    Postular Gratis
                                </button>
                            ) : (
                                <span className="text-[10px] font-bold text-slate-400 block text-center">
                                    {bannerPricing.state?.availability === 'available' ? 'Disponible para contratar' : 'Cupos no disponibles'}
                                </span>
                            )}
                        </div>

                        {/* Local / Ciudad */}
                        <div className="bg-white rounded-3xl border-2 border-slate-100 p-5 shadow-sm space-y-4 flex flex-col justify-between">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                                        <PinIcon className="w-4 h-4" />
                                    </div>
                                    {bannerPricing.city?.availability === 'free' ? (
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black rounded-full uppercase tracking-wider">
                                            🎁 Gratis
                                        </span>
                                    ) : (
                                        <span className="text-xs font-black text-slate-900">
                                            ${bannerPricing.city?.price || 5}/mes
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-900 text-sm">Banner Local</h4>
                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                                        Visible para usuarios en tu misma ciudad.
                                    </p>
                                </div>
                            </div>

                            {bannerPricing.city?.availability === 'free' ? (
                                <button
                                    onClick={() => navigate('/banners')}
                                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-colors"
                                >
                                    Postular Gratis
                                </button>
                            ) : (
                                <span className="text-[10px] font-bold text-slate-400 block text-center">
                                    {bannerPricing.city?.availability === 'available' ? 'Disponible para contratar' : 'Cupos no disponibles'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
