import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
    Save, Layout, CheckCircle, XCircle, Store, Sparkles, Calendar,
    DollarSign, Percent, Gift, ShoppingBag, Box, Bell, Users, Megaphone,
    Star, UserCheck, ShieldCheck, Grid, Printer, Check, Lock, Unlock, Clock, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PlanConfig {
    id: 'emprendedor' | 'corporativo';
    name: string;
    price: number;
    description: string;
    features: Record<string, boolean>;
}

interface SubscriptionPlansConfig {
    freeTrialEnabled: boolean;
    freeTrialLabel: string;
    transitionDate: string;
    defaultTransitionPlanId: 'emprendedor' | 'corporativo';
    plans: PlanConfig[];
}

const DEFAULT_CONFIG: SubscriptionPlansConfig = {
    freeTrialEnabled: true,
    freeTrialLabel: "Gratis por tiempo limitado (Lanzamiento)",
    transitionDate: "2026-12-31",
    defaultTransitionPlanId: "emprendedor",
    plans: [
        {
            id: "emprendedor",
            name: "Plan Aliado Emprendedor",
            price: 15,
            description: "Ideal para negocios en crecimiento con recepción de pedidos, catálogo, fidelización y caja integrada.",
            features: {
                orders: true,
                cash_internal: true,
                products: true,
                notifications: true,
                clients: true,
                loyalty: true,
                ads_and_push: true,
                reviews: true,
                waiters: false,
                cashiers: false,
                tables: false,
                printer_stations: false
            }
        },
        {
            id: "corporativo",
            name: "Plan Aliado Corporativo",
            price: 30,
            description: "Ecosistema completo con apps adicionales de Meseros, Cajeras, Gestión de Mesas QR y Estaciones de Impresión Térmica POS.",
            features: {
                orders: true,
                cash_internal: true,
                products: true,
                notifications: true,
                clients: true,
                loyalty: true,
                ads_and_push: true,
                reviews: true,
                waiters: true,
                cashiers: true,
                tables: true,
                printer_stations: true
            }
        }
    ]
};

const MODULE_OPTIONS = [
    { key: 'orders', label: 'Recibir Pedidos', icon: ShoppingBag, defaultEmprendedor: true },
    { key: 'cash_internal', label: 'Caja Interna', icon: DollarSign, defaultEmprendedor: true },
    { key: 'products', label: 'Productos', icon: Box, defaultEmprendedor: true },
    { key: 'notifications', label: 'Notificaciones', icon: Bell, defaultEmprendedor: true },
    { key: 'clients', label: 'Clientes', icon: Users, defaultEmprendedor: true },
    { key: 'loyalty', label: 'Fidelización', icon: Gift, defaultEmprendedor: true },
    { key: 'ads_and_push', label: 'Publicidad y Campañas Push', icon: Megaphone, defaultEmprendedor: true },
    { key: 'reviews', label: 'Reseñas', icon: Star, defaultEmprendedor: true },
    { key: 'waiters', label: 'Meseros (App)', icon: UserCheck, defaultEmprendedor: false },
    { key: 'cashiers', label: 'Cajeras (App)', icon: ShieldCheck, defaultEmprendedor: false },
    { key: 'tables', label: 'Mesas QR', icon: Grid, defaultEmprendedor: false },
    { key: 'printer_stations', label: 'Estaciones de Impresión Térmica', icon: Printer, defaultEmprendedor: false },
];

export default function FinancesManager() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [plansConfig, setPlansConfig] = useState<SubscriptionPlansConfig>(DEFAULT_CONFIG);
    const [restaurants, setRestaurants] = useState<any[]>([]);

    useEffect(() => {
        const fetchPlansConfig = async () => {
            try {
                const { data, error } = await supabase
                    .from('system_settings')
                    .select('*')
                    .eq('key', 'subscription_plans_config')
                    .maybeSingle();

                if (data?.value) {
                    setPlansConfig({
                        ...DEFAULT_CONFIG,
                        ...data.value,
                        plans: data.value.plans || DEFAULT_CONFIG.plans
                    });
                }
            } catch (error) {
                console.error("Error fetching subscription_plans_config:", error);
            } finally {
                setIsLoading(false);
            }
        };

        const fetchRestaurants = async () => {
            try {
                const { data } = await supabase
                    .from('comercios')
                    .select('*')
                    .order('name', { ascending: true });
                if (data) {
                    setRestaurants(data.map(r => ({
                        ...r,
                        subscriptionEnd: r.subscription_end || r.subscriptionEnd
                    })));
                }
            } catch (error) {
                console.error("Error fetching restaurants:", error);
            }
        };

        fetchPlansConfig();
        fetchRestaurants();

        const channel = supabase.channel('admin_finances_plans_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comercios' }, () => fetchRestaurants())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('system_settings')
                .upsert({
                    key: 'subscription_plans_config',
                    value: plansConfig,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            toast.success("Configuración global de planes guardada correctamente");
        } catch (error: any) {
            console.error("Error saving plans config:", error);
            toast.error("Error al guardar configuración: " + (error.message || 'Error de red'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdatePlan = (planId: 'emprendedor' | 'corporativo', field: string, val: any) => {
        setPlansConfig(prev => {
            const updatedPlans = prev.plans.map(p => {
                if (p.id === planId) {
                    return { ...p, [field]: val };
                }
                return p;
            });
            return { ...prev, plans: updatedPlans };
        });
    };

    const handleTogglePlanFeature = (planId: 'emprendedor' | 'corporativo', featureKey: string) => {
        setPlansConfig(prev => {
            const updatedPlans = prev.plans.map(p => {
                if (p.id === planId) {
                    const currentFeatures = p.features || {};
                    return {
                        ...p,
                        features: {
                            ...currentFeatures,
                            [featureKey]: !currentFeatures[featureKey]
                        }
                    };
                }
                return p;
            });
            return { ...prev, plans: updatedPlans };
        });
    };

    const handleRenewSubscription = async (restaurantId: string) => {
        if (!window.confirm("¿Confirmas que este local ha pagado su suscripción? Se habilitarán 30 días adicionales de servicio.")) return;

        try {
            const nextMonth = new Date();
            nextMonth.setDate(nextMonth.getDate() + 30);

            const { error } = await supabase
                .from('comercios')
                .update({
                    subscription_end: nextMonth.toISOString(),
                    subscriptionEnd: nextMonth.toISOString()
                })
                .eq('id', restaurantId);

            if (error) throw error;
            setRestaurants(prev => prev.map(r => r.id === restaurantId ? { ...r, subscriptionEnd: nextMonth.toISOString() } : r));
            toast.success("Suscripción renovada por 30 días");
        } catch (error) {
            console.error("Error renewing subscription:", error);
            toast.error("Error al renovar la suscripción");
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const emprendedorPlan = plansConfig.plans.find(p => p.id === 'emprendedor') || DEFAULT_CONFIG.plans[0];
    const corporativoPlan = plansConfig.plans.find(p => p.id === 'corporativo') || DEFAULT_CONFIG.plans[1];

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center text-slate-900 shadow-sm">
                        <Layout className="w-7 h-7 text-primary" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Finanzas y Planes de Suscripción</h1>
                            <span className="px-2.5 py-1 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase">
                                Global SaaS
                            </span>
                        </div>
                        <p className="text-sm font-medium text-slate-500 mt-1">
                            Configura los planes Emprendedor y Corporativo, el período gratuito global y las suscripciones de los locales.
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center justify-center gap-2.5 bg-primary text-slate-900 px-8 py-4 rounded-2xl font-black hover:bg-primary active:scale-95 transition-all shadow-xl shadow-primary/20 disabled:opacity-50 cursor-pointer text-sm uppercase tracking-wider shrink-0"
                >
                    <Save className="w-5 h-5" />
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </header>

            {/* SECCIÓN A: CONFIGURACIÓN GLOBAL "GRATIS POR TIEMPO LIMITADO (LANZAMIENTO)" */}
            <div className={`p-8 rounded-[36px] border-2 transition-all shadow-sm ${
                plansConfig.freeTrialEnabled
                    ? 'bg-gradient-to-br from-emerald-50/70 to-emerald-100/40 border-emerald-300'
                    : 'bg-white border-slate-200'
            }`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                            plansConfig.freeTrialEnabled ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'bg-slate-100 text-slate-400'
                        }`}>
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                                    🎉 Gratis por tiempo limitado (Lanzamiento)
                                </h2>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    plansConfig.freeTrialEnabled ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-600'
                                }`}>
                                    {plansConfig.freeTrialEnabled ? 'Activo en toda la App' : 'Desactivado'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed max-w-2xl">
                                Al activar este botón global, todos los negocios en modalidad de suscripción disfrutarán de acceso sin cobro mensual obligatorio hasta la fecha indicada. Al culminar, la plataforma comenzará el cobro del plan predeterminado.
                            </p>
                        </div>
                    </div>

                    {/* Switch Toggle */}
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={plansConfig.freeTrialEnabled}
                            onChange={(e) => setPlansConfig({ ...plansConfig, freeTrialEnabled: e.target.checked })}
                        />
                        <div className="w-14 h-8 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                    </label>
                </div>

                {/* Parámetros del Período Gratuito */}
                <div className="mt-6 pt-6 border-t border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-emerald-600" />
                            Fecha en que finalizará el período gratis (transitionDate)
                        </label>
                        <input
                            type="date"
                            value={plansConfig.transitionDate}
                            onChange={(e) => setPlansConfig({ ...plansConfig, transitionDate: e.target.value })}
                            className="w-full bg-white border-2 border-slate-200 focus:border-emerald-500 rounded-2xl p-3.5 text-sm font-bold text-slate-800 outline-none transition-all shadow-xs"
                        />
                        <p className="text-[11px] text-slate-500 font-medium">
                            Hasta las 23:59 de este día los comercios no pagarán mensualidad.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                            Plan por defecto al finalizar el período gratuito
                        </label>
                        <select
                            value={plansConfig.defaultTransitionPlanId || 'emprendedor'}
                            onChange={(e) => setPlansConfig({ ...plansConfig, defaultTransitionPlanId: e.target.value as any })}
                            className="w-full bg-white border-2 border-slate-200 focus:border-emerald-500 rounded-2xl p-3.5 text-sm font-bold text-slate-800 outline-none transition-all shadow-xs cursor-pointer"
                        >
                            <option value="emprendedor">Plan Aliado Emprendedor ($15/mes)</option>
                            <option value="corporativo">Plan Aliado Corporativo ($30/mes)</option>
                        </select>
                        <p className="text-[11px] text-slate-500 font-medium">
                            Plan que se les asignará por defecto tras la culminación del lanzamiento.
                        </p>
                    </div>
                </div>
            </div>

            {/* SECCIÓN B: CONFIGURACIÓN DE LOS 2 PLANES SAAS */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Store className="w-6 h-6 text-slate-800" />
                        Configuración de Planes para Negocios Aliados
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Edita los precios, nombres, descripciones y los módulos que cada plan desbloquea en la App de Negocios.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* 1. PLAN ALIADO EMPRENDEDOR */}
                    <div className="bg-white rounded-[36px] border-2 border-slate-200 p-8 shadow-sm space-y-6 flex flex-col justify-between">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                                        🚀
                                    </div>
                                    <div>
                                        <h3 className="font-black text-slate-900 text-lg">Plan Aliado Emprendedor</h3>
                                        <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                            Plan Esencial
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nombre del Plan</label>
                                    <input
                                        type="text"
                                        value={emprendedorPlan.name}
                                        onChange={(e) => handleUpdatePlan('emprendedor', 'name', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-primary transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Precio Mensual ($ USD)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={emprendedorPlan.price}
                                            onChange={(e) => handleUpdatePlan('emprendedor', 'price', parseFloat(e.target.value) || 0)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-8 text-sm font-black text-slate-900 outline-none focus:bg-white focus:border-primary transition-all"
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descripción de Bondades</label>
                                <textarea
                                    rows={2}
                                    value={emprendedorPlan.description}
                                    onChange={(e) => handleUpdatePlan('emprendedor', 'description', e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-primary transition-all resize-none"
                                />
                            </div>

                            {/* Checkboxes de módulos */}
                            <div className="space-y-2 pt-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                                        Módulos Incluidos en Plan Emprendedor
                                    </label>
                                    <span className="text-[10px] font-bold text-slate-400">
                                        (Por defecto bloquea Meseros, Cajeras, Mesas, Estaciones)
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50/70 p-4 rounded-2xl border border-slate-100 max-h-72 overflow-y-auto">
                                    {MODULE_OPTIONS.map((mod) => {
                                        const isChecked = Boolean(emprendedorPlan.features?.[mod.key]);
                                        const Icon = mod.icon;
                                        return (
                                            <div
                                                key={mod.key}
                                                onClick={() => handleTogglePlanFeature('emprendedor', mod.key)}
                                                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                                    isChecked
                                                        ? 'bg-white border-amber-300 shadow-2xs'
                                                        : 'bg-transparent border-slate-200/60 opacity-60'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Icon className={`w-4 h-4 shrink-0 ${isChecked ? 'text-amber-600' : 'text-slate-400'}`} />
                                                    <span className={`text-xs font-bold truncate ${isChecked ? 'text-slate-900' : 'text-slate-500'}`}>
                                                        {mod.label}
                                                    </span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => handleTogglePlanFeature('emprendedor', mod.key)}
                                                    className="w-4 h-4 rounded text-primary focus:ring-primary/20 accent-primary cursor-pointer shrink-0"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/60 flex items-center gap-2 text-xs font-bold text-amber-800">
                            <Lock className="w-4 h-4 shrink-0" />
                            <span>Muestra candados en el menú lateral para los módulos desmarcados.</span>
                        </div>
                    </div>

                    {/* 2. PLAN ALIADO CORPORATIVO */}
                    <div className="bg-white rounded-[36px] border-2 border-indigo-200 p-8 shadow-sm space-y-6 flex flex-col justify-between">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between pb-4 border-b border-indigo-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center font-black">
                                        👑
                                    </div>
                                    <div>
                                        <h3 className="font-black text-slate-900 text-lg">Plan Aliado Corporativo</h3>
                                        <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                            Plan Full Suite
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nombre del Plan</label>
                                    <input
                                        type="text"
                                        value={corporativoPlan.name}
                                        onChange={(e) => handleUpdatePlan('corporativo', 'name', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-600 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Precio Mensual ($ USD)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={corporativoPlan.price}
                                            onChange={(e) => handleUpdatePlan('corporativo', 'price', parseFloat(e.target.value) || 0)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-8 text-sm font-black text-indigo-700 outline-none focus:bg-white focus:border-indigo-600 transition-all"
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descripción de Bondades</label>
                                <textarea
                                    rows={2}
                                    value={corporativoPlan.description}
                                    onChange={(e) => handleUpdatePlan('corporativo', 'description', e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-indigo-600 transition-all resize-none"
                                />
                            </div>

                            {/* Checkboxes de módulos */}
                            <div className="space-y-2 pt-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                                        Módulos Incluidos en Plan Corporativo
                                    </label>
                                    <span className="text-[10px] font-bold text-indigo-600">
                                        (Desbloquea los 12 módulos)
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100 max-h-72 overflow-y-auto">
                                    {MODULE_OPTIONS.map((mod) => {
                                        const isChecked = Boolean(corporativoPlan.features?.[mod.key]);
                                        const Icon = mod.icon;
                                        return (
                                            <div
                                                key={mod.key}
                                                onClick={() => handleTogglePlanFeature('corporativo', mod.key)}
                                                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                                    isChecked
                                                        ? 'bg-white border-indigo-300 shadow-2xs'
                                                        : 'bg-transparent border-slate-200/60 opacity-60'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Icon className={`w-4 h-4 shrink-0 ${isChecked ? 'text-indigo-600' : 'text-slate-400'}`} />
                                                    <span className={`text-xs font-bold truncate ${isChecked ? 'text-slate-900' : 'text-slate-500'}`}>
                                                        {mod.label}
                                                    </span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => handleTogglePlanFeature('corporativo', mod.key)}
                                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600/20 accent-indigo-600 cursor-pointer shrink-0"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-200/60 flex items-center gap-2 text-xs font-bold text-indigo-800">
                            <Unlock className="w-4 h-4 shrink-0" />
                            <span>Desbloquea el ecosistema integral de hardware POS y apps operativas.</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN C: ESTADO DE SUSCRIPCIONES Y NEGOCIOS REGISTRADOS */}
            <div className="bg-white rounded-[36px] border-2 border-slate-100 p-8 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                        <Store className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-black text-slate-800 tracking-tight text-lg">Estado de Suscripciones (Locales)</h3>
                        <p className="text-sm text-slate-500">Visualiza la modalidad comercial de cada negocio y renueva o ajusta sus fechas de vencimiento.</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Restaurante / Comercio</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Modalidad Comercial</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estatus Suscripción</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Próximo Pago / Límite</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {restaurants.map((restaurant) => {
                                const now = new Date();
                                const end = restaurant.subscriptionEnd ? new Date(restaurant.subscriptionEnd) : null;
                                const hasActiveSub = end && end > now;
                                const daysRemaining = hasActiveSub ? Math.ceil((end.getTime() - now.getTime()) / (1000 * 3600 * 24)) : 0;
                                const bMode = restaurant.billing_mode || 'subscription';
                                const planId = restaurant.plan_id || 'emprendedor';

                                return (
                                    <tr key={restaurant.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                                    {restaurant.logo_url || restaurant.logoUrl || restaurant.image ? (
                                                        <img src={restaurant.logo_url || restaurant.logoUrl || restaurant.image} alt={restaurant.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-slate-100">
                                                            <Store className="w-5 h-5 text-slate-300" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-800 text-sm block">{restaurant.name}</span>
                                                    <span className="text-xs text-slate-400 font-medium">{restaurant.category || 'Varios'}</span>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                bMode === 'commission'
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : bMode === 'free_custom'
                                                    ? 'bg-indigo-100 text-indigo-800'
                                                    : 'bg-amber-100 text-amber-800'
                                            }`}>
                                                {bMode === 'commission' ? 'Comisión por Venta' : bMode === 'free_custom' ? 'Gratis / Cortesía' : `Suscripción (${planId})`}
                                            </span>
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            {plansConfig.freeTrialEnabled ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700">
                                                    <Sparkles className="w-3.5 h-3.5" /> Gratis (Lanzamiento)
                                                </span>
                                            ) : bMode === 'commission' ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-800">
                                                    <CheckCircle className="w-3.5 h-3.5" /> Al Día
                                                </span>
                                            ) : hasActiveSub ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700">
                                                    <CheckCircle className="w-3.5 h-3.5" /> Activo ({daysRemaining} días)
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-100 text-red-700">
                                                    <XCircle className="w-3.5 h-3.5" /> Inactivo / Vencido
                                                </span>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 text-center text-xs font-bold text-slate-600">
                                            {bMode === 'commission'
                                                ? 'Por cada pedido'
                                                : bMode === 'free_custom' && restaurant.free_until
                                                ? new Date(restaurant.free_until).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                                                : end
                                                ? end.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                                                : 'Sin registro'}
                                        </td>

                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleRenewSubscription(restaurant.id)}
                                                className="px-4 py-2 bg-primary hover:bg-primary text-slate-900 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-primary/20 active:scale-95 cursor-pointer"
                                            >
                                                Renovar (+30 días)
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
