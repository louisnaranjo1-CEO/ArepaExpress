import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { CreditCard, CheckCircle2, AlertCircle, Clock, Layout, Globe, Map as MapIcon, MapPin as PinIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Subscriptions() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [subConfig, setSubConfig] = useState<any>(null);
    const [businessSub, setBusinessSub] = useState<any>(null);
    const [restaurantData, setRestaurantData] = useState<any>(null);
    const [bannerStats, setBannerStats] = useState({
        used: 0,
        total: 0,
        remaining: 0
    });

    useEffect(() => {
        if (!user) return;

        // Fetch Global Subscription Config
        const fetchConfig = async () => {
            const docRef = doc(db, 'system_configs', 'subscriptions');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setSubConfig(docSnap.data());
            }
        };

        // Listen to Restaurant's Subscription
        const unsubSub = onSnapshot(doc(db, 'restaurants', user.uid), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setRestaurantData(data);
                setBusinessSub(data.subscription || null);
            }
            setLoading(false);
        });

        fetchConfig();
        return () => unsubSub();
    }, [user]);

    // Calculate Banner Stats based on current month
    useEffect(() => {
        if (!user || !businessSub) return;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const q = query(
            collection(db, 'banner_updates'),
            where('restaurantId', '==', user.uid),
            where('timestamp', '>=', startOfMonth)
        );

        const unsubStats = onSnapshot(q, (snapshot) => {
            const count = snapshot.size;
            const limit = businessSub.bannerLimit || 3;
            setBannerStats({
                used: count,
                total: limit,
                remaining: Math.max(0, limit - count)
            });
        });

        return () => unsubStats();
    }, [user, businessSub]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const currentPlan = businessSub ? subConfig?.plans?.[businessSub.planId] : null;
    const now = new Date();
    const allyEnd = restaurantData?.subscriptionEnd ? new Date(restaurantData.subscriptionEnd) : null;
    const isAllySubscribed = allyEnd && allyEnd > now;
    const allyPrice = subConfig?.allyPrice || 4.99;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700">
            <header>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Suscripción y Publicidad</h1>
                <p className="text-slate-500 font-medium">Gestiona tu estatus y visibilidad en la plataforma.</p>
            </header>

            {/* Suscripción de Aliado */}
            <div className={`p-8 rounded-[2.5rem] border-2 shadow-xl relative overflow-hidden transition-all ${isAllySubscribed ? 'bg-emerald-50 border-emerald-100 shadow-emerald-200/40' : 'bg-amber-50 border-amber-200 shadow-amber-200/40'}`}>
                <div className="flex items-start gap-4 text-left">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${isAllySubscribed ? 'bg-emerald-500 text-white shadow-emerald-500/30' : 'bg-amber-500 text-white shadow-amber-500/30'}`}>
                        {isAllySubscribed ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h2 className={`text-2xl font-black ${isAllySubscribed ? 'text-emerald-900' : 'text-amber-900'}`}>Suscripción de Aliado</h2>
                            <span className={`px-3 py-1 text-xs font-black uppercase tracking-widest rounded-full ${isAllySubscribed ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                                {isAllySubscribed ? 'Activa' : 'Inactiva o Vencida'}
                            </span>
                        </div>
                        <p className={`text-sm font-medium ${isAllySubscribed ? 'text-emerald-800/80' : 'text-amber-800/80'} mb-4 leading-relaxed`}>
                            {isAllySubscribed
                                ? `Tu cuenta está activa en la plataforma hasta el ${format(allyEnd, "dd 'de' MMMM, yyyy", { locale: es })}. ¡Sigue recibiendo pedidos sin interrupciones!`
                                : `Tu sitio actualmente se encuentra inactivo. Debes pagar $${allyPrice} al mes al número de cuenta que aparece en el pago móvil en tu panel para que tu cuenta sea activada por nuestro equipo.`}
                        </p>
                        
                        {!isAllySubscribed && (
                            <div className="bg-white/60 p-4 rounded-xl border border-amber-200/50 mt-4">
                                <p className="text-sm font-bold text-amber-900">
                                    Costo: <span className="text-xl">$4.99 al mes</span>.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                {/* Current Plan Status */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 p-8 shadow-xl shadow-slate-200/40 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8">
                            <CreditCard className="w-12 h-12 text-slate-100" />
                        </div>

                        <div className="relative">
                            <div className="flex items-center gap-3 mb-6">
                                <div className={`w-3 h-3 rounded-full animate-pulse ${businessSub ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Estado de Suscripción</span>
                            </div>

                            {businessSub ? (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-4xl font-black text-slate-900 mb-2">
                                            {currentPlan?.name || 'Plan Activo'}
                                        </h2>
                                        <div className="flex items-center gap-2 text-primary">
                                            <CheckCircle2 className="w-5 h-5" />
                                            <span className="font-bold">Tu negocio es visible {currentPlan?.scope === 'national' ? 'en todo el país' : currentPlan?.scope === 'state' ? 'en tu estado' : 'en tu ciudad'}.</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-4">
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Próxima Renovación</p>
                                            <p className="font-bold text-slate-700">
                                                {businessSub.expiryDate ? format(businessSub.expiryDate.toDate(), "dd 'de' MMMM, yyyy", { locale: es }) : 'N/A'}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Costo Mensual</p>
                                            <p className="font-black text-slate-900 text-xl">${currentPlan?.price || 0}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 py-4">
                                    <div className="p-6 bg-amber-50 rounded-3xl border-2 border-amber-100 flex items-start gap-4">
                                        <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-1" />
                                        <div>
                                            <h3 className="font-black text-amber-900">Sin suscripción activa</h3>
                                            <p className="text-sm text-amber-800/80 mt-1">
                                                Tu negocio no aparecerá en los banners destacados. Suscríbete a un plan para aumentar tus ventas.
                                            </p>
                                        </div>
                                    </div>
                                    <button className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                                        Ver Planes Disponibles
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Banner Usage / Limits */}
                    <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 p-8 shadow-xl shadow-slate-200/40">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-primary">
                                    <Layout className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-xl">Uso de Banners</h3>
                                    <p className="text-sm text-slate-500 font-medium">Actualizaciones disponibles este mes</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-3xl font-black text-slate-900">{bannerStats.remaining}</span>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Disponibles</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-1000 ${bannerStats.remaining === 0 ? 'bg-red-500' : 'bg-primary'}`}
                                    style={{ width: `${(bannerStats.used / bannerStats.total) * 100}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-slate-400">
                                <span>{bannerStats.used} Usados</span>
                                <span>{bannerStats.total} Total Permitidos</span>
                            </div>
                        </div>

                        <div className="mt-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-4">
                            <Clock className="w-5 h-5 text-slate-400" />
                            <p className="text-xs font-bold text-slate-600">
                                El límite se reinicia el primer día de cada mes automáticamente.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Plans List */}
                <div className="space-y-6">
                    <h3 className="text-xl font-black text-slate-900 px-2">Planes Disponibles (Banners)</h3>
                    {subConfig?.plans && Object.values(subConfig.plans).map((plan: any) => (
                        <div
                            key={plan.id}
                            className={`p-6 bg-white rounded-[2rem] border-2 transition-all group hover:scale-[1.02] ${currentPlan?.id === plan.id
                                    ? 'border-primary shadow-lg shadow-primary/10 ring-4 ring-primary/5'
                                    : 'border-slate-100 hover:border-slate-200 shadow-sm'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 bg-slate-50 rounded-xl text-slate-600 group-hover:bg-primary/10 group-hover:text-slate-900 transition-colors">
                                    {plan.scope === 'national' ? <Globe className="w-5 h-5" /> : plan.scope === 'state' ? <MapIcon className="w-5 h-5" /> : <PinIcon className="w-5 h-5" />}
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-black text-slate-900">${plan.price}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">/ Mes</p>
                                </div>
                            </div>

                            <h4 className="font-black text-slate-900 text-lg mb-2">{plan.name}</h4>
                            <p className="text-xs text-slate-500 font-medium mb-6 leading-relaxed">
                                {plan.scope === 'national'
                                    ? 'Aparece en los banners principales para todos los usuarios del país.'
                                    : plan.scope === 'state'
                                        ? 'Aparece para usuarios ubicados en tu estado.'
                                        : 'Aparece para usuarios en tu ciudad específica.'}
                            </p>

                            <div className="space-y-3 mb-8">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span>{plan.updateLimit} Cambios de banner</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span>Soporte prioritario</span>
                                </div>
                            </div>

                            <button
                                disabled={currentPlan?.id === plan.id || (plan.availability && plan.availability !== 'available')}
                                className={`w-full py-3.5 rounded-xl font-black transition-all ${currentPlan?.id === plan.id
                                        ? 'bg-emerald-50 text-emerald-600 cursor-default'
                                        : (plan.availability && plan.availability !== 'available')
                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                            : 'bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-900/10'
                                    }`}
                            >
                                {currentPlan?.id === plan.id ? 'Plan Actual'
                                    : (plan.availability === 'not_available') ? 'No disponible'
                                    : (plan.availability === 'full') ? 'Cupos llenos'
                                    : (plan.availability === 'soon') ? 'Muy pronto'
                                    : 'Seleccionar Plan'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
