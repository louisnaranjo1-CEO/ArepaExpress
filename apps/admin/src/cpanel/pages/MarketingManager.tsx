import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Megaphone, Settings, CheckCircle, XCircle, Image as ImageIcon, Tag, Calendar, MapPin, Store, Clock, History, AlertCircle, X, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function MarketingManager() {
    const [activeTab, setActiveTab] = useState<'campaigns' | 'settings'>('campaigns');
    const [campaignsView, setCampaignsView] = useState<'active' | 'history'>('active');
    const [campaigns, setCampaigns] = useState<any[]>([]);
    
    // Settings state
    const [priceCity, setPriceCity] = useState(5);
    const [priceState, setPriceState] = useState(10);
    const [priceNational, setPriceNational] = useState(20);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // Reschedule modal state
    const [selectedCampForReschedule, setSelectedCampForReschedule] = useState<any | null>(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleTime, setRescheduleTime] = useState('12:00');
    const [isRescheduling, setIsRescheduling] = useState(false);

    const parseArray = (val: any): string[] => {
        if (Array.isArray(val)) return val.map(v => typeof v === 'string' ? v : (v?.name || String(v)));
        if (typeof val === 'string' && val.trim()) {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed.map(v => typeof v === 'string' ? v : (v?.name || String(v)));
                return [val];
            } catch {
                return val.includes(',') ? val.split(',').map(s => s.trim()).filter(Boolean) : [val];
            }
        }
        return [];
    };

    const fetchCampaigns = async () => {
        try {
            const { data, error } = await supabase
                .from('push_campaigns')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && Array.isArray(data)) {
                const mapped = data.map(d => {
                    let promoSnapshot: any = null;
                    if (d.promo_product_snapshot) {
                        if (typeof d.promo_product_snapshot === 'object') {
                            promoSnapshot = d.promo_product_snapshot;
                        } else if (typeof d.promo_product_snapshot === 'string') {
                            try {
                                promoSnapshot = JSON.parse(d.promo_product_snapshot);
                            } catch {
                                promoSnapshot = null;
                            }
                        }
                    }

                    return {
                        ...d,
                        restaurantId: d.restaurant_id || d.restaurantId,
                        restaurantName: d.restaurant_name || d.restaurantName || 'Negocio Aliado',
                        locationLevel: d.location_level || d.locationLevel || d.location || 'national',
                        selectedStates: parseArray(d.selected_states || d.selectedStates || d.states),
                        selectedCities: parseArray(d.selected_cities || d.selectedCities || d.cities),
                        minAge: d.min_age !== undefined ? d.min_age : d.minAge,
                        maxAge: d.max_age !== undefined ? d.maxAge : d.maxAge,
                        bannerUrl: d.banner_url || d.bannerUrl || d.image_url || d.imageUrl || '',
                        paymentRef: d.payment_ref || d.paymentRef,
                        paymentImageUrl: d.payment_image_url || d.paymentImageUrl || d.payment_image || d.paymentImage || '',
                        scheduledAt: d.scheduled_at || d.scheduledAt,
                        createdAt: d.created_at || d.createdAt,
                        activatedAt: d.activated_at || d.activatedAt,
                        executedAt: d.executed_at || d.executedAt,
                        expiredAt: d.expired_at || d.expiredAt,
                        promoProductSnapshot: promoSnapshot
                    };
                });

                mapped.sort((a, b) => {
                    if (a.status === 'verifying_payment' && b.status !== 'verifying_payment') return -1;
                    if (a.status !== 'verifying_payment' && b.status === 'verifying_payment') return 1;
                    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
                });
                setCampaigns(mapped);
            } else {
                setCampaigns([]);
            }
        } catch (err) {
            console.error("Error fetching campaigns", err);
            setCampaigns([]);
        }
    };

    useEffect(() => {
        // Load settings
        const loadSettings = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('*')
                    .eq('id', 'marketing')
                    .maybeSingle();

                if (data?.data) {
                    if (data.data.pushPriceCity !== undefined) setPriceCity(data.data.pushPriceCity);
                    if (data.data.pushPriceState !== undefined) setPriceState(data.data.pushPriceState);
                    if (data.data.pushPriceNational !== undefined) setPriceNational(data.data.pushPriceNational);
                }
            } catch (err) {
                console.error("Error loading settings", err);
            }
        };
        loadSettings();
        fetchCampaigns();

        const channel = supabase.channel('push_campaigns_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'push_campaigns' }, () => {
                fetchCampaigns();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const saveSettings = async () => {
        setIsSavingSettings(true);
        try {
            const { error } = await supabase.from('app_settings').upsert({
                id: 'marketing',
                data: {
                    pushPriceCity: priceCity,
                    pushPriceState: priceState,
                    pushPriceNational: priceNational
                },
                updated_at: new Date().toISOString()
            });
            if (error) throw error;
            toast.success("Tarifas de Marketing actualizadas correctamente");
        } catch (error) {
            toast.error("Error al guardar tarifas");
        }
        setIsSavingSettings(false);
    };

    const handleApproveCampaign = async (camp: any) => {
        if (!confirm(`¿Estás seguro de que deseas APROBAR y programar la campaña "${camp.title || 'Alerta Push'}"?`)) return;

        try {
            const originalDate = camp.scheduledAt ? new Date(camp.scheduledAt) : null;
            const now = Date.now();
            let newScheduledAt = camp.scheduledAt;
            let wasAutoRescheduled = false;
            let formattedTime = '';

            // Si la hora ya quedó en el pasado o no está definida, reprogramar automáticamente al día siguiente a la misma hora
            if (!originalDate || isNaN(originalDate.getTime()) || originalDate.getTime() <= now) {
                wasAutoRescheduled = true;
                const target = new Date();
                target.setDate(target.getDate() + 1);
                if (originalDate && !isNaN(originalDate.getTime())) {
                    target.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
                } else {
                    target.setHours(12, 0, 0, 0);
                }
                while (target.getTime() <= now) {
                    target.setDate(target.getDate() + 1);
                }
                newScheduledAt = target.toISOString();
                formattedTime = target.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
            }

            const { error } = await supabase.from('push_campaigns').update({
                status: 'active',
                activated_at: new Date().toISOString(),
                scheduled_at: newScheduledAt,
                was_auto_rescheduled: wasAutoRescheduled,
                updated_at: new Date().toISOString()
            }).eq('id', camp.id);

            if (error) throw error;

            // Notificación al negocio
            const restaurantId = camp.restaurantId || camp.restaurant_id;
            if (restaurantId) {
                if (wasAutoRescheduled) {
                    await supabase.from('notifications').insert({
                        restaurant_id: restaurantId,
                        title: '📅 Campaña Push Aprobada y Reprogramada',
                        body: `Tu campaña "${camp.title}" fue aprobada. Como la hora original ya había pasado, se reprogramó automáticamente para mañana a las ${formattedTime}.`,
                        read: false,
                        created_at: new Date().toISOString()
                    });
                } else {
                    await supabase.from('notifications').insert({
                        restaurant_id: restaurantId,
                        title: '✅ Campaña Push Aprobada',
                        body: `Tu campaña "${camp.title}" fue aprobada y se enviará automáticamente en la fecha y hora programada (${originalDate ? originalDate.toLocaleString('es-VE') : 'próximamente'}).`,
                        read: false,
                        created_at: new Date().toISOString()
                    });
                }
            }

            if (wasAutoRescheduled) {
                toast.success(`¡Campaña aprobada! Como la hora original ya había pasado, se reprogramó automáticamente para mañana a las ${formattedTime}.`, { duration: 6000 });
            } else {
                toast.success("¡Campaña validada y programada exitosamente!");
            }

            fetchCampaigns();
        } catch (error: any) {
            console.error("Error approving campaign:", error);
            toast.error("Error al aprobar campaña: " + (error.message || ""));
        }
    };

    const handleOpenRescheduleModal = (camp: any) => {
        setSelectedCampForReschedule(camp);
        let initDate = new Date().toISOString().split('T')[0];
        let initTime = '12:00';

        if (camp.scheduledAt) {
            try {
                const d = new Date(camp.scheduledAt);
                if (!isNaN(d.getTime())) {
                    initDate = d.toISOString().split('T')[0];
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    initTime = `${hh}:${mm}`;
                }
            } catch(e) {}
        }

        setRescheduleDate(initDate);
        setRescheduleTime(initTime);
    };

    const handleConfirmReschedule = async () => {
        if (!selectedCampForReschedule) return;
        const newDateTime = new Date(`${rescheduleDate}T${rescheduleTime}`);

        if (isNaN(newDateTime.getTime()) || newDateTime.getTime() <= Date.now()) {
            toast.error("La nueva hora programada debe ser en el futuro.");
            return;
        }

        setIsRescheduling(true);
        try {
            const { error } = await supabase.from('push_campaigns').update({
                scheduled_at: newDateTime.toISOString(),
                was_rescheduled: true,
                updated_at: new Date().toISOString()
            }).eq('id', selectedCampForReschedule.id);

            if (error) throw error;

            const restaurantId = selectedCampForReschedule.restaurantId || selectedCampForReschedule.restaurant_id;
            const formatted = newDateTime.toLocaleString('es-VE');

            if (restaurantId) {
                await supabase.from('notifications').insert({
                    restaurant_id: restaurantId,
                    title: '🕒 Hora de Campaña Push Modificada',
                    body: `El Super Administrador actualizó la hora de lanzamiento de tu campaña "${selectedCampForReschedule.title}" para el ${formatted}.`,
                    read: false,
                    created_at: new Date().toISOString()
                });
            }

            toast.success(`Campaña reprogramada para el ${formatted}`);
            setSelectedCampForReschedule(null);
            fetchCampaigns();
        } catch (e: any) {
            toast.error("Error al reprogramar: " + (e.message || ""));
        } finally {
            setIsRescheduling(false);
        }
    };

    const handleToggleCampaignStatus = async (campaignId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const actionText = newStatus === 'active' ? 'ACTIVAR' : 'DESACTIVAR';
        
        if (!confirm(`¿Deseas ${actionText} esta campaña individualmente ahora mismo?`)) return;
        
        try {
            const { error } = await supabase.from('push_campaigns').update({
                status: newStatus,
                ...(newStatus === 'active' ? { activated_at: new Date().toISOString() } : {})
            }).eq('id', campaignId);
            if (error) throw error;
            toast.success(`Campaña ${newStatus === 'active' ? 'activada' : 'desactivada'} correctamente`);
            fetchCampaigns();
        } catch(error) {
            toast.error("Error al cambiar estado");
        }
    };

    const handleRejectCampaign = async (campaignId: string) => {
        if (!confirm("¿Rechazar esta campaña por pago inválido?")) return;
        try {
            const { error } = await supabase.from('push_campaigns').update({
                status: 'rejected_payment',
                updated_at: new Date().toISOString()
            }).eq('id', campaignId);
            if (error) throw error;
            toast.success("Campaña rechazada");
            fetchCampaigns();
        } catch(error) {
            toast.error("Error al rechazar");
        }
    };

    // Filtros de campañas activas vs historial
    const activeCampaigns = campaigns.filter(c => 
        !c.executedAt && 
        !c.executed_at && 
        !c.expiredAt && 
        !c.expired_at && 
        c.status !== 'completed' && 
        c.status !== 'expired' && 
        c.status !== 'rejected_payment' && 
        c.status !== 'rejected'
    );

    const historyCampaigns = campaigns.filter(c => 
        !!c.executedAt || 
        !!c.executed_at || 
        !!c.expiredAt || 
        !!c.expired_at || 
        c.status === 'completed' || 
        c.status === 'expired' || 
        c.status === 'rejected_payment' || 
        c.status === 'rejected'
    );

    const displayedCampaigns = campaignsView === 'active' ? activeCampaigns : historyCampaigns;

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-3">
                        <Megaphone className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
                        Marketing & Avisos Push
                    </h1>
                    <p className="text-slate-500 font-medium text-xs sm:text-sm mt-1">
                        Audita comprobantes, reprograma avisos y supervisa la difusión masiva en tiempo real.
                    </p>
                </div>
            </div>

            {/* Selector de Pestaña Principal */}
            <div className="flex gap-2 border-b border-slate-200 pb-3">
                <button 
                    className={`px-5 py-2.5 rounded-2xl font-black text-xs sm:text-sm transition-all duration-300 ${activeTab === 'campaigns' ? 'bg-slate-900 text-primary shadow-xl shadow-slate-900/20 scale-102' : 'text-slate-500 hover:bg-slate-100'}`}
                    onClick={() => setActiveTab('campaigns')}
                >
                    Auditar Campañas ({campaigns.length})
                </button>
                <button 
                    className={`px-5 py-2.5 rounded-2xl font-black text-xs sm:text-sm transition-all duration-300 ${activeTab === 'settings' ? 'bg-slate-900 text-primary shadow-xl shadow-slate-900/20 scale-102' : 'text-slate-500 hover:bg-slate-100'}`}
                    onClick={() => setActiveTab('settings')}
                >
                    Tarifas & Configuración
                </button>
            </div>

            {activeTab === 'settings' && (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 max-w-2xl">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                        <Settings className="w-5 h-5 text-primary" />
                        Ajuste de Tarifas: Campañas Push
                    </h2>
                    
                    <div className="space-y-6">
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Precio Alcance Ciudad ($)</label>
                           <input type="number" value={priceCity} onChange={e => setPriceCity(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                           <p className="text-xs text-slate-500 mt-1">Coste al enviar notificación solo a usuarios de una ciudad específica.</p>
                        </div>
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Precio Alcance Estado/Provincia ($)</label>
                           <input type="number" value={priceState} onChange={e => setPriceState(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                           <p className="text-xs text-slate-500 mt-1">Coste al enviar a todo un estado.</p>
                        </div>
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Precio Alcance Nacional ($)</label>
                           <input type="number" value={priceNational} onChange={e => setPriceNational(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                           <p className="text-xs text-slate-500 mt-1">Costo Master para notificaciones Push en todo el país sin restricciones geográficas de la aplicación.</p>
                        </div>

                        <button 
                            className="bg-primary text-slate-900 font-bold py-3 px-8 rounded-xl w-full hover:brightness-105 active:scale-98 transition-all"
                            onClick={saveSettings}
                            disabled={isSavingSettings}
                        >
                            {isSavingSettings ? 'Guardando...' : 'Guardar Configuraciones Globales'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'campaigns' && (
                <div className="space-y-4">
                    {/* Sub-selector: Activas vs Historial */}
                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-fit">
                        <button
                            onClick={() => setCampaignsView('active')}
                            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${campaignsView === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <Megaphone className="w-4 h-4 text-primary" />
                            Campañas Activas & Programadas
                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${campaignsView === 'active' ? 'bg-primary text-slate-950' : 'bg-slate-200 text-slate-700'}`}>
                                {activeCampaigns.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setCampaignsView('history')}
                            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${campaignsView === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <History className="w-4 h-4 text-slate-600" />
                            Historial de Avisos (Caducadas / Ejecutadas)
                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${campaignsView === 'history' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                {historyCampaigns.length}
                            </span>
                        </button>
                    </div>

                    {displayedCampaigns.length === 0 && (
                        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center text-slate-400">
                            <Megaphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="font-bold text-slate-600 text-base">
                                {campaignsView === 'active' ? 'No hay campañas activas ni pendientes en este momento.' : 'No hay avisos en el historial aún.'}
                            </p>
                        </div>
                    )}
                    
                    {displayedCampaigns.map(camp => {
                        const cities = Array.isArray(camp.selectedCities) ? camp.selectedCities : [];
                        const states = Array.isArray(camp.selectedStates) ? camp.selectedStates : [];
                        const hasLocations = cities.length > 0 || states.length > 0;
                        const promo = camp.promoProductSnapshot;

                        // Safe date formatting
                        let formattedScheduledDate = '';
                        let isScheduledInPast = false;
                        if (camp.scheduledAt) {
                            try {
                                const parsed = new Date(camp.scheduledAt);
                                if (!isNaN(parsed.getTime())) {
                                    formattedScheduledDate = parsed.toLocaleString('es-VE');
                                    isScheduledInPast = parsed.getTime() <= Date.now();
                                }
                            } catch {
                                formattedScheduledDate = String(camp.scheduledAt);
                            }
                        }

                        const isExecutedOrCompleted = !!camp.executedAt || !!camp.executed_at || !!camp.expiredAt || !!camp.expired_at || camp.status === 'completed' || camp.status === 'expired';

                        return (
                            <div key={camp.id} className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 hover:border-slate-300 transition-all">
                                {/* Creatividad */}
                                <div className="md:w-1/3 bg-slate-50 rounded-2xl p-4 flex flex-col items-center justify-center text-center border border-slate-100">
                                    {(camp.bannerUrl || camp.imageUrl) ? (
                                        <img 
                                            src={camp.bannerUrl || camp.imageUrl} 
                                            alt="Push Creativo" 
                                            className="w-full h-32 object-cover rounded-xl mb-3 shadow-xs bg-slate-200" 
                                        />
                                    ) : (
                                        <div className="w-full h-32 bg-slate-200 rounded-xl mb-3 flex items-center justify-center">
                                            <ImageIcon className="w-8 h-8 text-slate-400" />
                                        </div>
                                    )}
                                    <h3 className="font-black text-slate-900 text-base leading-tight">{camp.title || 'Sin Título'}</h3>
                                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{camp.subtitle || ''}</p>

                                    {/* Producto en Promoción Vinculado */}
                                    {promo && (
                                        <div className="mt-3 w-full p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 text-left flex items-center gap-2.5">
                                            {promo.image_url ? (
                                                <img src={promo.image_url} alt={promo.name} className="w-9 h-9 rounded-lg object-cover border border-amber-200/60 shrink-0" />
                                            ) : (
                                                <div className="w-9 h-9 rounded-lg bg-amber-200/50 flex items-center justify-center shrink-0">
                                                    <Tag className="w-4 h-4 text-amber-800" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Promo Vinculada</p>
                                                <p className="text-xs font-bold text-slate-900 truncate">{promo.name || 'Producto'}</p>
                                            </div>
                                            {promo.promo_price !== undefined && promo.promo_price !== null && (
                                                <span className="text-xs font-black text-amber-900 bg-amber-200/70 px-2 py-0.5 rounded-md">
                                                    ${promo.promo_price}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="md:w-1/3 flex flex-col justify-center gap-2.5">
                                    <p className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                        <Store className="w-4 h-4 text-slate-400 shrink-0" />
                                        <span>Negocio: <span className="font-black text-slate-900">{camp.restaurantName}</span></span>
                                    </p>
                                    <p className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                                        <span>Alcance: <span className="font-normal capitalize">
                                            {camp.locationLevel || camp.location || 'Nacional'}
                                            {(camp.locationLevel === 'city' || camp.location === 'city') && ` (${cities.length} ciudades)`}
                                            {(camp.locationLevel === 'state' || camp.location === 'state') && ` (${states.length} estados)`}
                                        </span></span>
                                    </p>
                                    
                                    {hasLocations && (
                                        <div className="flex flex-wrap gap-1 mt-0.5 max-h-20 overflow-y-auto pr-1">
                                            {cities.map((c: string, idx: number) => (
                                                <span key={idx} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                                                    {c}
                                                </span>
                                            ))}
                                            {states.map((s: string, idx: number) => (
                                                <span key={idx} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <p className="font-bold text-slate-800 text-sm">Inversión: <span className="font-black text-emerald-600">${camp.price || 0}</span></p>
                                    
                                    {formattedScheduledDate && (
                                        <div className="flex flex-col gap-1.5 self-start">
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${isScheduledInPast && !isExecutedOrCompleted ? 'bg-amber-50 text-amber-900 border-amber-300' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                <Calendar className="w-3.5 h-3.5 shrink-0" />
                                                <span>Programado: <span className="font-black">{formattedScheduledDate}</span></span>
                                            </div>
                                            {isScheduledInPast && !isExecutedOrCompleted && (
                                                <span className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                                                    Hora pasada. Al aprobar se reprogramará para mañana a la misma hora.
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-slate-800 text-xs">Clics: <span className="font-black px-2 py-0.5 bg-slate-100 rounded-md">{camp.clicks || 0}</span></p>
                                        {camp.was_auto_rescheduled && (
                                            <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-md">
                                                Auto-reprogramada
                                            </span>
                                        )}
                                    </div>
                                    
                                    {/* Badges de Estado */}
                                    <div className="pt-1 flex flex-wrap gap-1.5">
                                        {camp.status === 'verifying_payment' && (
                                            <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider animate-pulse">
                                                Revisión de Pago Requerida
                                            </span>
                                        )}
                                        {camp.status === 'active' && !isExecutedOrCompleted && (
                                            <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
                                                Campaña Aprobada / Programada
                                            </span>
                                        )}
                                        {camp.status === 'inactive' && !isExecutedOrCompleted && (
                                            <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
                                                Pausada
                                            </span>
                                        )}
                                        {camp.status === 'rejected_payment' && (
                                            <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
                                                Pago Rechazado
                                            </span>
                                        )}
                                        {isExecutedOrCompleted && (
                                            <span className="bg-slate-900 text-white px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3 text-emerald-400" />
                                                Ejecutada / Caducada
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Acciones de Pago y Reprogramación */}
                                <div className="md:w-1/3 flex flex-col justify-center border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 border-slate-100">
                                    <h4 className="font-bold text-slate-700 text-sm mb-3">Auditoría & Gestión</h4>
                                    
                                    {camp.paymentRef ? (
                                        <div className="space-y-3">
                                            <div className="bg-slate-900 text-primary text-center py-2 px-4 rounded-xl font-mono text-xs font-black shadow-sm">
                                                REF: {camp.paymentRef}
                                            </div>
                                            
                                            {(camp.paymentImageUrl || camp.paymentImage) ? (
                                                <a href={camp.paymentImageUrl || camp.paymentImage} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl transition-colors">
                                                    <ImageIcon className="w-4 h-4"/> Ver Comprobante
                                                </a>
                                            ) : (
                                                <p className="text-xs text-slate-400 text-center italic">Sin comprobante adjunto</p>
                                            )}
                                            
                                            {/* Botón de Reprogramar Hora si aún no ha sido ejecutada */}
                                            {!isExecutedOrCompleted && (
                                                <button
                                                    onClick={() => handleOpenRescheduleModal(camp)}
                                                    className="w-full py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-blue-200 transition-colors"
                                                >
                                                    <Clock className="w-3.5 h-3.5" /> Cambiar Hora / Reprogramar
                                                </button>
                                            )}

                                            {camp.status === 'verifying_payment' && (
                                                <div className="flex gap-2 pt-1">
                                                    <button 
                                                        onClick={() => handleApproveCampaign(camp)} 
                                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl flex items-center justify-center gap-1.5 font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
                                                    >
                                                        <CheckCircle className="w-4 h-4" /> Aprobar
                                                    </button>
                                                    <button 
                                                        onClick={() => handleRejectCampaign(camp.id)} 
                                                        className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl flex items-center justify-center gap-1.5 font-black text-xs uppercase tracking-wider shadow-md shadow-red-600/20 active:scale-95 transition-all"
                                                    >
                                                        <XCircle className="w-4 h-4" /> Rechazar
                                                    </button>
                                                </div>
                                            )}

                                            {!isExecutedOrCompleted && (camp.status === 'active' || camp.status === 'inactive') && (
                                                <button 
                                                    onClick={() => handleToggleCampaignStatus(camp.id, camp.status)} 
                                                    className={`w-full py-2.5 rounded-xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-wider transition-all shadow-xs active:scale-95 ${camp.status === 'active' ? 'bg-slate-100 text-red-600 hover:bg-red-50 border border-red-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'}`}
                                                >
                                                    {camp.status === 'active' ? (
                                                        <>
                                                            <XCircle className="w-4 h-4" /> Pausar Alerta Pop-up
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircle className="w-4 h-4" /> Reactivar Alerta Pop-up
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-slate-400 text-xs italic">Sin detalles de pago provistos.</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal de Reprogramación de Fecha/Hora */}
            {selectedCampForReschedule && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[28px] max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
                        <button
                            onClick={() => setSelectedCampForReschedule(null)}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-lg">Reprogramar Lanzamiento</h3>
                                <p className="text-xs text-slate-500 font-medium">Modifica la fecha y hora de la alerta push.</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-4">
                            <p className="text-xs font-bold text-slate-800 truncate">📢 {selectedCampForReschedule.title}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">Comercio: {selectedCampForReschedule.restaurantName}</p>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                    Nueva Fecha de Lanzamiento
                                </label>
                                <input
                                    type="date"
                                    value={rescheduleDate}
                                    min={new Date().toISOString().split('T')[0]}
                                    onChange={(e) => setRescheduleDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                    Nueva Hora de Lanzamiento
                                </label>
                                <input
                                    type="time"
                                    value={rescheduleTime}
                                    onChange={(e) => setRescheduleTime(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm focus:ring-2 focus:ring-primary"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setSelectedCampForReschedule(null)}
                                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmReschedule}
                                disabled={isRescheduling}
                                className="flex-1 py-3 px-4 bg-primary text-slate-900 hover:brightness-105 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Check className="w-4 h-4" />
                                {isRescheduling ? 'Guardando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
