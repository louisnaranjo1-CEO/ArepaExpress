import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Megaphone, Plus, ImageIcon, Upload, X, MapPin, Flame, ShoppingBag, Sparkles, Tag, Check, AlertCircle, Store, Clock, Calendar, RefreshCw, History, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import { useBranding } from '../../context/BrandingContext';

export default function PushCampaigns({ restaurantId }: { restaurantId: string }) {
    const { branding } = useBranding();
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [campaignsView, setCampaignsView] = useState<'active' | 'history'>('active');
    
    // Config de marketing global
    const [prices, setPrices] = useState({ pushPriceCity: 5, pushPriceState: 10, pushPriceNational: 20 });
    const [restaurantData, setRestaurantData] = useState<any>(null);

    // Formulario de Nueva Campaña
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [locationLevel, setLocationLevel] = useState<'city' | 'state' | 'national'>('city');
    const [selectedStates, setSelectedStates] = useState<string[]>([]);
    const [selectedCities, setSelectedCities] = useState<string[]>([]);
    
    // UI Helpers for adding
    const [tempState, setTempState] = useState('');
    const [tempCity, setTempCity] = useState('');

    const [minAge, setMinAge] = useState(18);
    const [maxAge, setMaxAge] = useState(60);
    const [sex, setSex] = useState<'all' | 'male' | 'female'>('all');
    const [bannerImage, setBannerImage] = useState<File | null>(null);
    const [bannerImagePreview, setBannerImagePreview] = useState<string>('');
    const [reusedCampaignBannerUrl, setReusedCampaignBannerUrl] = useState<string>('');
    const [isReusing, setIsReusing] = useState(false);
    const [paymentRef, setPaymentRef] = useState('');
    const [paymentImage, setPaymentImage] = useState<File | null>(null);
    const [paymentImagePreview, setPaymentImagePreview] = useState<string>('');
    
    // Destino y Producto en Promoción
    const [destinationType, setDestinationType] = useState<'promo_product' | 'general_profile'>('promo_product');
    const [restaurantProducts, setRestaurantProducts] = useState<any[]>([]);
    const [productMode, setProductMode] = useState<'catalog' | 'new' | 'none'>('catalog');
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const [promoPrice, setPromoPrice] = useState<string>('');
    const [newProdName, setNewProdName] = useState('');
    const [newProdOriginalPrice, setNewProdOriginalPrice] = useState('');
    const [newProdCategory, setNewProdCategory] = useState('Promociones');
    const [newProdDescription, setNewProdDescription] = useState('');

    // Helper fecha mañana
    const getTomorrowDateStr = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    };

    // Scheduled time (por defecto mañana a las 12:00)
    const [scheduledDate, setScheduledDate] = useState(getTomorrowDateStr());
    const [scheduledTime, setScheduledTime] = useState('12:00');
    
    // Modal de reprogramación
    const [selectedCampForReschedule, setSelectedCampForReschedule] = useState<any | null>(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleTime, setRescheduleTime] = useState('');
    const [isRescheduling, setIsRescheduling] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        // Cargar productos del comercio
        const loadProducts = async () => {
            if (!restaurantId) return;
            try {
                const { data } = await supabase
                    .from('products')
                    .select('*')
                    .eq('restaurant_id', restaurantId)
                    .eq('is_active', true)
                    .order('name');
                if (data) {
                    setRestaurantProducts(data);
                }
            } catch (err) {
                console.error("Error loading products:", err);
            }
        };
        loadProducts();

        // Cargar las tarifas
        const loadSettings = async () => {
            try {
                const { data } = await supabase
                    .from('system_settings')
                    .select('*')
                    .eq('id', 'marketing')
                    .maybeSingle();

                if (data) {
                    const marketing = data.data || data;
                    setPrices({
                        pushPriceCity: marketing.pushPriceCity ?? 5,
                        pushPriceState: marketing.pushPriceState ?? 10,
                        pushPriceNational: marketing.pushPriceNational ?? 20,
                    });
                }
            } catch (err) {
                console.error("Error loading marketing settings:", err);
            }
        };
        loadSettings();

        // Cargar nombre del rest
        const loadRest = async () => {
            const { data } = await supabase
                .from('comercios')
                .select('*')
                .eq('id', restaurantId)
                .maybeSingle();

            if (data) {
                setRestaurantData(data);
                // Default to restaurant location
                if (data.location?.state || data.address?.state) {
                    const st = data.location?.state || data.address?.state;
                    setTempState(st);
                    addState(st);

                    if (data.location?.city || data.address?.city) {
                        const ct = data.location?.city || data.address?.city;
                        setTempCity(ct);
                        addCity(`${st}: ${ct}`);
                    }
                }
            }
        };
        loadRest();

        // Escuchar campañas mías
        fetchCampaigns();

        const channel = supabase.channel(`push-campaigns:${restaurantId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'push_campaigns',
                filter: `restaurant_id=eq.${restaurantId}`
            }, () => {
                fetchCampaigns();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [restaurantId, fetchCampaigns]);

    const fetchCampaigns = useCallback(async () => {
        if (!restaurantId) return;
        const { data } = await supabase
            .from('push_campaigns')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: false });

        if (data) {
            setCampaigns(data.map(d => ({
                id: d.id,
                ...d,
                restaurantId: d.restaurant_id,
                restaurantName: d.restaurant_name,
                imageUrl: d.banner_url,
                paymentImage: d.payment_image_url,
                paymentRef: d.payment_ref,
                cities: d.selected_cities || [],
                states: d.selected_states || [],
                promoProductId: d.promo_product_id,
                promoPrice: d.promo_price,
                promoProductSnapshot: d.promo_product_snapshot,
                createdAt: d.created_at ? new Date(d.created_at) : new Date(),
                scheduledAt: d.scheduled_at ? new Date(d.scheduled_at) : new Date(),
                executedAt: d.executed_at ? new Date(d.executed_at) : undefined,
                expiredAt: d.expired_at ? new Date(d.expired_at) : undefined,
                was_auto_rescheduled: d.was_auto_rescheduled,
                was_rescheduled: d.was_rescheduled
            })));
        }
    }, [restaurantId]);

    const handleOpenRescheduleModal = (camp: any) => {
        setSelectedCampForReschedule(camp);
        let initDate = getTomorrowDateStr();
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
                was_rescheduled: true
            }).eq('id', selectedCampForReschedule.id);

            if (error) throw error;

            const formatted = newDateTime.toLocaleString('es-VE');

            // Notificación al Super Admin
            await supabase.from('notifications').insert({
                title: '🕒 Campaña Push Reprogramada por el Negocio',
                body: `El negocio "${restaurantData?.name || 'Comercio'}" modificó la hora de su campaña "${selectedCampForReschedule.title}" para el ${formatted}.`,
                read: false,
                type: 'admin_marketing',
                created_at: new Date().toISOString()
            });

            toast.success(`Campaña reprogramada para el ${formatted}`);
            setSelectedCampForReschedule(null);
            fetchCampaigns();
        } catch (e: any) {
            toast.error("Error al reprogramar: " + (e.message || ""));
        } finally {
            setIsRescheduling(false);
        }
    };

    const handleReuseCampaign = (camp: any) => {
        setIsCreating(true);
        setIsReusing(true);
        setTitle(camp.title || '');
        setSubtitle(camp.subtitle || '');

        const existingBanner = camp.imageUrl || camp.banner_url || '';
        setReusedCampaignBannerUrl(existingBanner);
        setBannerImagePreview(existingBanner);
        setBannerImage(null);

        setLocationLevel(camp.location_level || 'city');
        setSelectedStates(camp.selected_states || camp.states || []);
        setSelectedCities(camp.selected_cities || camp.cities || []);
        setMinAge(camp.min_age ?? 18);
        setMaxAge(camp.max_age ?? 60);
        setSex(camp.sex || 'all');

        if (camp.promo_product_id || camp.promoProductId) {
            setDestinationType('promo_product');
            setProductMode('catalog');
            setSelectedProductId(camp.promo_product_id || camp.promoProductId);
            setPromoPrice(camp.promo_price || camp.promoPrice ? String(camp.promo_price || camp.promoPrice) : '');
        } else {
            setDestinationType('general_profile');
            setSelectedProductId('');
            setPromoPrice('');
        }

        // STRICTLY RESET PAYMENT - Nuevo pago obligatorio
        setPaymentRef('');
        setPaymentImage(null);
        setPaymentImagePreview('');

        // Fecha de mañana y hora original o 12:00
        setScheduledDate(getTomorrowDateStr());
        let defaultHour = '12:00';
        if (camp.scheduledAt || camp.scheduled_at) {
            try {
                const d = new Date(camp.scheduledAt || camp.scheduled_at);
                if (!isNaN(d.getTime())) {
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    defaultHour = `${hh}:${mm}`;
                }
            } catch(e) {}
        }
        setScheduledTime(defaultHour);

        toast('Aviso precargado. Por favor define la nueva fecha/hora y anexa el nuevo comprobante de pago.', {
            icon: '🔄',
            duration: 5000
        });
    };

    const getCurrentPrice = () => {
        if (locationLevel === 'city') return selectedCities.length * prices.pushPriceCity;
        if (locationLevel === 'state') return selectedStates.length * prices.pushPriceState;
        return prices.pushPriceNational;
    };

    const addState = (st: string) => {
        if (!st || selectedStates.includes(st)) return;
        setSelectedStates([...selectedStates, st]);
        setTempState('');
    };

    const removeState = (st: string) => {
        setSelectedStates(selectedStates.filter(s => s !== st));
    };

    const addCity = (ct: string) => {
        if (!ct || selectedCities.includes(ct)) return;
        setSelectedCities([...selectedCities, ct]);
        setTempCity('');
    };

    const removeCity = (ct: string) => {
        setSelectedCities(selectedCities.filter(c => c !== ct));
    };

    const handleBannerImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setBannerImage(file);
            setBannerImagePreview(URL.createObjectURL(file));
        }
    };

    const handlePaymentImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPaymentImage(file);
            setPaymentImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !subtitle.trim()) {
            toast.error("El título y subtítulo de la campaña son obligatorios.");
            return;
        }

        if (!paymentRef.trim()) {
            toast.error("Debes ingresar la referencia o últimos dígitos del nuevo pago.");
            return;
        }

        if (!paymentImage) {
            toast.error("Debes adjuntar el comprobante o captura de pantalla del nuevo pago.");
            return;
        }

        if (!bannerImage && !reusedCampaignBannerUrl) {
            toast.error("Debes añadir una imagen banner para la notificación emergente.");
            return;
        }

        if (locationLevel === 'city' && selectedCities.length === 0) {
            toast.error("Debes añadir al menos una ciudad");
            return;
        }
        if (locationLevel === 'state' && selectedStates.length === 0) {
            toast.error("Debes añadir al menos un estado");
            return;
        }

        // Combinar fecha y hora para el scheduledAt
        const scheduledDatetime = new Date(`${scheduledDate}T${scheduledTime}`);
        if (isNaN(scheduledDatetime.getTime()) || scheduledDatetime.getTime() <= Date.now()) {
            toast.error("La fecha y hora de lanzamiento debe ser en el futuro.");
            return;
        }

        setIsSubmitting(true);
        try {
            console.log("Iniciando subida de campaña push...");
            let bannerUrl = reusedCampaignBannerUrl || '';
            if (bannerImage) {
                const bannerExt = bannerImage.name.split('.').pop() || 'jpg';
                const bannerPath = `push_campaigns/${restaurantId}_${Date.now()}_banner.${bannerExt}`;
                const { error: bErr } = await supabase.storage
                    .from('store_assets')
                    .upload(bannerPath, bannerImage);
                if (bErr) throw bErr;
                const { data: { publicUrl } } = supabase.storage
                    .from('store_assets')
                    .getPublicUrl(bannerPath);
                bannerUrl = publicUrl;
            }

            let pImage = '';
            if (paymentImage) {
                const payExt = paymentImage.name.split('.').pop() || 'jpg';
                const payPath = `push_campaigns/${restaurantId}_${Date.now()}_payment.${payExt}`;
                const { error: pErr } = await supabase.storage
                    .from('store_assets')
                    .upload(payPath, paymentImage);
                if (pErr) throw pErr;
                const { data: { publicUrl } } = supabase.storage
                    .from('store_assets')
                    .getPublicUrl(payPath);
                pImage = publicUrl;
            }

            const finalCities = locationLevel === 'city' ? selectedCities : [];
            const finalStates = (locationLevel === 'state' || locationLevel === 'city') ? selectedStates : [];

            // Combinar fecha y hora para el scheduledAt
            const scheduledDatetime = new Date(`${scheduledDate}T${scheduledTime}`);

            // Manejar producto en promoción según destino seleccionado
            let promoProdId: string | null = null;
            let finalPromoPrice: number | null = null;
            let promoSnapshot: any = null;

            if (destinationType === 'promo_product') {
                finalPromoPrice = promoPrice ? parseFloat(promoPrice) : null;
                if (productMode === 'catalog' && selectedProductId) {
                    const existing = restaurantProducts.find(p => p.id === selectedProductId);
                    if (existing) {
                        promoProdId = existing.id;
                        if (finalPromoPrice !== null && finalPromoPrice > 0) {
                            await supabase
                                .from('products')
                                .update({ promo_price: finalPromoPrice })
                                .eq('id', existing.id);
                        }
                        promoSnapshot = {
                            id: existing.id,
                            name: existing.name,
                            price: Number(existing.price) || 0,
                            promo_price: finalPromoPrice,
                            image_url: existing.image_url || existing.image || (existing.images && existing.images[0]) || ''
                        };
                    }
                } else if (productMode === 'new' && newProdName.trim()) {
                    const origPrice = parseFloat(newProdOriginalPrice) || (finalPromoPrice || 0);
                    const newProductData = {
                        restaurant_id: restaurantId,
                        name: newProdName.trim(),
                        price: origPrice,
                        promo_price: finalPromoPrice || origPrice,
                        category_name: newProdCategory || 'Promociones',
                        description: newProdDescription.trim(),
                        is_active: true,
                        is_available: true,
                        image_url: bannerUrl || restaurantData?.logo_url || '',
                        images: bannerUrl ? [bannerUrl] : (restaurantData?.logo_url ? [restaurantData.logo_url] : []),
                        created_at: new Date().toISOString()
                    };

                    const { data: createdProd, error: prodErr } = await supabase
                        .from('products')
                        .insert(newProductData)
                        .select('*')
                        .single();

                    if (prodErr) throw prodErr;
                    promoProdId = createdProd.id;
                    promoSnapshot = {
                        id: createdProd.id,
                        name: createdProd.name,
                        price: Number(createdProd.price) || 0,
                        promo_price: createdProd.promo_price,
                        image_url: createdProd.image_url
                    };
                }
            }

            const campaignData = {
                restaurant_id: restaurantId,
                restaurant_name: restaurantData?.name || 'Restaurante',
                title,
                subtitle,
                location_level: locationLevel,
                selected_cities: finalCities,
                selected_states: finalStates,
                min_age: minAge,
                max_age: maxAge,
                sex,
                banner_url: bannerUrl,
                payment_ref: paymentRef,
                payment_image_url: pImage,
                price: getCurrentPrice(),
                status: 'verifying_payment',
                scheduled_at: scheduledDatetime.toISOString(),
                promo_product_id: promoProdId,
                promo_price: finalPromoPrice,
                promo_product_snapshot: promoSnapshot,
                created_at: new Date().toISOString()
            };

            console.log("Guardando en Supabase:", campaignData);
            const { error: insertErr } = await supabase.from('push_campaigns').insert(campaignData);
            if (insertErr) throw insertErr;

            toast.success("¡Solicitud enviada con éxito! Esperando verificación del pago por el Administrador.");
            setIsCreating(false);
            setIsReusing(false);
            setReusedCampaignBannerUrl('');
            
            // Clean up
            setTitle(''); setSubtitle(''); setBannerImage(null); setBannerImagePreview('');
            setPaymentImage(null); setPaymentImagePreview(''); setPaymentRef('');
            setSelectedProductId(''); setPromoPrice(''); setNewProdName('');
            setNewProdOriginalPrice(''); setNewProdDescription(''); setProductMode('catalog');
            fetchCampaigns();
        } catch (error) {
            console.error("Error al publicar la campaña:", error);
            toast.error("Error al publicar la campaña. Verifica tu conexión.");
        } finally {
            setIsSubmitting(false);
        }
    };

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
        <div className="p-4 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <Megaphone className="w-8 h-8 text-primary" />
                        Campañas de Notificaciones Pop-Ups
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Invierte en publicidad directa. Envía tu oferta/promoción que sonará en el teléfono de los usuarios de Un 2x3.
                    </p>
                </div>
                {!isCreating && (
                    <button 
                        onClick={() => {
                            setIsReusing(false);
                            setReusedCampaignBannerUrl('');
                            setTitle(''); setSubtitle(''); setBannerImage(null); setBannerImagePreview('');
                            setPaymentImage(null); setPaymentImagePreview(''); setPaymentRef('');
                            setSelectedProductId(''); setPromoPrice(''); setNewProdName('');
                            setScheduledDate(getTomorrowDateStr());
                            setScheduledTime('12:00');
                            setIsCreating(true);
                        }}
                        className="bg-primary text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 mt-4 md:mt-0 shadow-md shadow-primary/20 active:scale-95 transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        Crear Nueva Campaña
                    </button>
                )}
            </div>

            {isCreating ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-4xl space-y-6">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                        <div>
                            <h2 className="text-xl font-black text-slate-900">
                                {isReusing ? 'Reutilizar Aviso (Nuevo Pago Requerido)' : 'Asistente de Nueva Campaña'}
                            </h2>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                {isReusing 
                                    ? 'Se han precargado los datos de tu aviso anterior. Programa la nueva hora y anexa tu nuevo comprobante.' 
                                    : 'Configura el contenido, segmentación y programación de tu notificación emergente.'}
                            </p>
                        </div>
                        <button 
                            onClick={() => {
                                setIsCreating(false);
                                setIsReusing(false);
                                setReusedCampaignBannerUrl('');
                            }} 
                            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                            <X className="w-6 h-6"/>
                        </button>
                    </div>

                    {isReusing && (
                        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3">
                            <RefreshCw className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-black text-amber-900 text-sm">
                                    Aviso Precargado desde el Historial
                                </h4>
                                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                                    Hemos conservado el título, subtítulo, imagen de banner, producto y segmentación de audiencia. Para volver a activarlo, <strong>selecciona la nueva fecha y hora futura</strong> y <strong>adjunta el nuevo comprobante de pago móvil</strong>.
                                </p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Diseño de la Notificación */}
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 mb-4 bg-slate-50 p-2 rounded-lg">1. Diseño del Pop-Up (Lo que verá el usuario)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Título de la Alerta (Corto)</label>
                                    <input type="text" value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Ej: ¡2x1 en Pizzas Familiares!" maxLength={40} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                                    <label className="block text-sm font-bold text-slate-700 mt-4 mb-2">Subtítulo (Detalle)</label>
                                    <textarea value={subtitle} onChange={e=>setSubtitle(e.target.value)} required placeholder="Lleva la 2da Pizza a mitad de precio por tiempo limitado..." maxLength={100} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 h-24 resize-none" />
                                </div>
                                <div className="border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-4 relative overflow-hidden bg-slate-50 min-h-48">
                                    {bannerImagePreview ? (
                                        <>
                                            <img src={bannerImagePreview} alt="Preview" className="w-full h-full object-cover absolute inset-0 opacity-50" />
                                            <div className="z-10 bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm border border-slate-200">
                                                <span className="text-xs font-black text-slate-800">
                                                    {bannerImage ? "✓ Nueva Imagen Adjunta" : "✓ Imagen de Campaña Reutilizada"}
                                                </span>
                                                <button 
                                                    type="button" 
                                                    onClick={() => {
                                                        setBannerImage(null); 
                                                        setBannerImagePreview('');
                                                        setReusedCampaignBannerUrl('');
                                                    }} 
                                                    className="p-1 rounded-full hover:bg-red-100 text-red-600 transition-colors"
                                                >
                                                    <X className="w-4 h-4"/>
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center">
                                            <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                            <p className="text-sm text-slate-500 font-bold">Añadir Imagen Banner</p>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" onChange={handleBannerImageChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                                </div>
                            </div>
                        </div>

                        {/* 🎯 Destino al Tocar el Banner y Producto en Promoción */}
                        <div className="border border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-white to-amber-50/30 rounded-2xl p-6 shadow-sm space-y-6">
                            <div className="flex items-center justify-between pb-3 border-b border-amber-100">
                                <div className="flex items-center gap-2">
                                    <span className="p-2 bg-amber-500 text-white rounded-xl shadow-sm">
                                        <Flame className="w-5 h-5" />
                                    </span>
                                    <div>
                                        <h3 className="font-black text-lg text-slate-800">2. 🎯 Producto o Promoción Destacada (Redirección al Tocar el Banner)</h3>
                                        <p className="text-xs text-slate-500">
                                            Define a dónde será redirigido el cliente de Un 2x3 cuando presione la notificación emergente.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Selector de Destino Principal */}
                            <div className="space-y-2">
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                                    Destino al presionar el Pop-Up:
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setDestinationType('promo_product')}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                                            destinationType === 'promo_product'
                                                ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                                                : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Flame className={`w-5 h-5 shrink-0 mt-0.5 ${destinationType === 'promo_product' ? 'text-white' : 'text-amber-500'}`} />
                                        <div>
                                            <p className="font-black text-xs sm:text-sm leading-tight">
                                                Ir a un Producto en Promoción de mi Catálogo (Se mostrará de #1)
                                            </p>
                                            <p className={`text-[11px] mt-1 font-medium ${destinationType === 'promo_product' ? 'text-amber-100' : 'text-slate-500'}`}>
                                                Aparece de #1 en el menú con la insignia 🔥 PROMOCIÓN DESTACADA.
                                            </p>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setDestinationType('general_profile')}
                                        className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                                            destinationType === 'general_profile'
                                                ? 'bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20'
                                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Store className={`w-5 h-5 shrink-0 mt-0.5 ${destinationType === 'general_profile' ? 'text-white' : 'text-slate-600'}`} />
                                        <div>
                                            <p className="font-black text-xs sm:text-sm leading-tight">
                                                Ir al Perfil General de mi Negocio
                                            </p>
                                            <p className={`text-[11px] mt-1 font-medium ${destinationType === 'general_profile' ? 'text-slate-300' : 'text-slate-500'}`}>
                                                Abre la vista principal de tu local y tu menú habitual sin destacar un producto específico.
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {destinationType === 'promo_product' ? (
                                <div className="space-y-5 pt-2 border-t border-amber-100">
                                    {/* Selector de modo de producto */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setProductMode('catalog')}
                                            className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${productMode === 'catalog' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                        >
                                            <ShoppingBag className="w-4 h-4" />
                                            Elegir de mi Catálogo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setProductMode('new')}
                                            className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${productMode === 'new' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                        >
                                            <Plus className="w-4 h-4" />
                                            + Crear Nuevo Producto en Promoción
                                        </button>
                                    </div>

                                    {productMode === 'catalog' && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Selecciona el Producto</label>
                                                <select
                                                    value={selectedProductId}
                                                    onChange={(e) => {
                                                        const pid = e.target.value;
                                                        setSelectedProductId(pid);
                                                        const found = restaurantProducts.find(p => p.id === pid);
                                                        if (found) {
                                                            if (found.promo_price || found.promoPrice) {
                                                                setPromoPrice((found.promo_price || found.promoPrice).toString());
                                                            } else if (found.price) {
                                                                const disc = (found.price * 0.8).toFixed(2);
                                                                setPromoPrice(disc);
                                                            }
                                                        }
                                                    }}
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 text-sm focus:ring-2 focus:ring-amber-400"
                                                >
                                                    <option value="">-- Elige un producto de tu menú ({restaurantProducts.length} disponibles) --</option>
                                                    {restaurantProducts.map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name} (Precio regular: ${Number(p.price || 0).toFixed(2)})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {selectedProductId && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-5 rounded-xl border border-amber-200 shadow-xs">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="text-xs font-bold text-slate-500">Precio Regular:</span>
                                                            {(() => {
                                                                const sel = restaurantProducts.find(p => p.id === selectedProductId);
                                                                const orig = Number(sel?.price || 0);
                                                                return (
                                                                    <span className="line-through font-black text-slate-400 text-sm">
                                                                        ~~${orig.toFixed(2)} USD~~
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>
                                                        <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                                                            Precio de Promoción en Oferta ($ USD) *
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={promoPrice}
                                                                onChange={(e) => setPromoPrice(e.target.value)}
                                                                placeholder="Ej: 4.50"
                                                                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-amber-700 text-sm focus:bg-white focus:border-amber-400 outline-none"
                                                            />
                                                        </div>
                                                    </div>

                                                    {(() => {
                                                        const sel = restaurantProducts.find(p => p.id === selectedProductId);
                                                        const orig = Number(sel?.price || 0);
                                                        const promo = parseFloat(promoPrice) || 0;
                                                        const pct = orig > 0 && promo > 0 && promo < orig ? Math.round(((orig - promo) / orig) * 100) : 0;
                                                        return (
                                                            <div className="flex items-center gap-3">
                                                                <div className="p-4 bg-amber-50 rounded-xl flex-1 border border-amber-100">
                                                                    <p className="text-[11px] font-bold text-slate-500">Descuento aplicado:</p>
                                                                    <p className="text-sm font-black text-amber-700 mt-0.5">
                                                                        {pct > 0 ? `🔥 ${pct}% de ahorro para el cliente` : 'Precio especial configurado'}
                                                                    </p>
                                                                    <p className="text-[10px] text-slate-400 mt-1">
                                                                        Se mostrará como: <span className="line-through">~~${orig.toFixed(2)}~~</span> <strong className="text-slate-900">${promo.toFixed(2)} USD</strong>
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {productMode === 'new' && (
                                        <div className="space-y-4 bg-white p-5 rounded-xl border border-amber-200 shadow-xs">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                                                        Nombre del Producto Nuevo *
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={newProdName}
                                                        onChange={(e) => setNewProdName(e.target.value)}
                                                        placeholder="Ej: Hamburguesa Titán Doble Carne"
                                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:bg-white focus:border-amber-400 outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                                                        Categoría
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={newProdCategory}
                                                        onChange={(e) => setNewProdCategory(e.target.value)}
                                                        placeholder="Promociones, Combos, etc."
                                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:bg-white focus:border-amber-400 outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                                                        Precio Regular ($ USD) *
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={newProdOriginalPrice}
                                                            onChange={(e) => setNewProdOriginalPrice(e.target.value)}
                                                            placeholder="Ej: 8.00"
                                                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-sm focus:bg-white focus:border-amber-400 outline-none"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                                                            Precio de Promoción ($ USD) *
                                                        </label>
                                                        {newProdOriginalPrice && (
                                                            <span className="line-through text-xs font-bold text-slate-400">
                                                                ~~${parseFloat(newProdOriginalPrice || '0').toFixed(2)}~~
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={promoPrice}
                                                            onChange={(e) => setPromoPrice(e.target.value)}
                                                            placeholder="Ej: 5.50"
                                                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-amber-700 text-sm focus:bg-white focus:border-amber-400 outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                                                    Descripción Breve
                                                </label>
                                                <textarea
                                                    value={newProdDescription}
                                                    onChange={(e) => setNewProdDescription(e.target.value)}
                                                    placeholder="Incluye papas y refresco grande..."
                                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 h-16 resize-none focus:bg-white focus:border-amber-400 outline-none"
                                                />
                                            </div>
                                            <p className="text-[11px] text-slate-400 italic">
                                                * Se agregará automáticamente a tu catálogo activo usando el banner de la campaña como imagen.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                                    <p className="font-bold text-slate-800">🏪 Redirección al perfil general:</p>
                                    <p>Cuando los usuarios toquen este Pop-Up, serán redirigidos a la página principal de tu negocio donde podrán ver tu catálogo completo.</p>
                                </div>
                            )}
                        </div>

                        {/* Segmentación */}
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 mb-4 bg-slate-50 p-2 rounded-lg">3. Audiencia y Segmentación</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Alcance Geográfico</label>
                                    <select value={locationLevel} onChange={(e: any) => setLocationLevel(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700">
                                        <option value="city">Ciudad Específica (${prices.pushPriceCity})</option>
                                        <option value="state">Cualquiera en un Estado (${prices.pushPriceState})</option>
                                        <option value="national">Alcance Nacional (${prices.pushPriceNational})</option>
                                    </select>
                                </div>

                                {locationLevel === 'state' && (
                                    <div className="col-span-full space-y-4">
                                        <div className="flex gap-4 items-end">
                                            <div className="flex-1">
                                                <label className="block text-sm font-bold text-slate-700 mb-2">Añadir Estado</label>
                                                <select 
                                                    value={tempState} 
                                                    onChange={(e) => setTempState(e.target.value)}
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700"
                                                >
                                                    <option value="">Buscar Estado...</option>
                                                    {VENEZUELA_STATES.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => addState(tempState)}
                                                className="bg-slate-900 text-white rounded-xl px-6 py-3 font-bold h-[50px] hover:bg-slate-800"
                                            >
                                                Agregar
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedStates.length === 0 && <p className="text-xs text-slate-400 italic">No has seleccionado estados.</p>}
                                            {selectedStates.map(st => (
                                                <span key={st} className="bg-primary/20 text-slate-900 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 border border-primary/30">
                                                    {st}
                                                    <button type="button" onClick={() => removeState(st)}><X className="w-3 h-3 hover:text-red-500"/></button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {locationLevel === 'city' && (
                                    <div className="col-span-full space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="block text-sm font-bold text-slate-700 mb-1">Estado</label>
                                                <select 
                                                    value={tempState} 
                                                    onChange={(e) => {
                                                        setTempState(e.target.value);
                                                        setTempCity('');
                                                    }}
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 text-sm"
                                                >
                                                    <option value="">Seleccionar Estado...</option>
                                                    {VENEZUELA_STATES.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-sm font-bold text-slate-700 mb-1">Ciudad</label>
                                                <div className="flex gap-2">
                                                    <select 
                                                        value={tempCity} 
                                                        onChange={(e) => setTempCity(e.target.value)}
                                                        className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 text-sm"
                                                        disabled={!tempState}
                                                    >
                                                        <option value="">Seleccionar Ciudad...</option>
                                                        {tempState && VENEZUELA_DATA[tempState]?.map(c => (
                                                            <option key={c} value={c}>{c}</option>
                                                        ))}
                                                    </select>
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            if (!selectedStates.includes(tempState)) {
                                                                setSelectedStates([...selectedStates, tempState]);
                                                            }
                                                            addCity(`${tempState}: ${tempCity}`);
                                                        }}
                                                        disabled={!tempCity}
                                                        className="bg-slate-900 text-white rounded-xl px-4 py-3 font-bold hover:bg-slate-800 disabled:opacity-50"
                                                    >
                                                        Añadir
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedCities.length === 0 && <p className="text-xs text-slate-400 italic">No has seleccionado ciudades.</p>}
                                            {selectedCities.map(ct => {
                                                const [st, city] = ct.split(': ');
                                                return (
                                                    <span key={ct} className="bg-primary/20 text-slate-900 px-3 py-1.5 rounded-lg text-sm font-bold flex flex-col border border-primary/30 relative pr-8 group">
                                                        <span className="text-[10px] text-slate-500 uppercase leading-none">{st}</span>
                                                        <span className="leading-tight">{city}</span>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => removeCity(ct)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                                                        >
                                                            <X className="w-4 h-4"/>
                                                        </button>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Género</label>
                                    <select value={sex} onChange={(e: any) => setSex(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                                        <option value="all">Todos los géneros</option>
                                        <option value="male">Solo Hombres</option>
                                        <option value="female">Solo Mujeres</option>
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Edad Min</label>
                                        <input type="number" min="15" value={minAge} onChange={(e:any)=>setMinAge(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Edad Max</label>
                                        <input type="number" max="80" value={maxAge} onChange={(e:any)=>setMaxAge(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 border-t border-slate-100 pt-6">
                                <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <span className="w-6 h-6 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs">4</span>
                                    Programación de la Alerta
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Fecha de Lanzamiento</label>
                                        <input 
                                            type="date" 
                                            min={new Date().toISOString().split('T')[0]} 
                                            value={scheduledDate} 
                                            onChange={e => setScheduledDate(e.target.value)} 
                                            required 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Hora de Lanzamiento</label>
                                        <input 
                                            type="time" 
                                            value={scheduledTime} 
                                            onChange={e => setScheduledTime(e.target.value)} 
                                            required 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800" 
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 mt-2 italic">* La validación del pago puede tardar de 5 minutos a 24 horas. Programe con antelación.</p>
                            </div>
                        </div>

                        {/* Presupuesto y Pago */}
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 mb-4 bg-slate-50 p-2 rounded-lg">5. Confirmación de Inversión</h3>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="flex-1 mb-6 md:mb-0">
                                    <p className="text-2xl font-black text-slate-800 mb-2">Total a Cancelar: <span className="text-green-600">${getCurrentPrice()}</span></p>
                                    <p className="text-xs text-slate-500 max-w-sm">
                                        Realiza el pago al CPanel mediante Pago Móvil (Mismo que tus membresías). Luego anexa el soporte aquí abajo. Solo se enviará esta campaña One-time una vez sea aprobada por Finanzas.
                                    </p>
                                </div>
                                <div className="flex-1 space-y-3 w-full">
                                    <input type="text" placeholder="Últimos 6 dígitos Banco / Referencia de Pago" value={paymentRef} onChange={e=>setPaymentRef(e.target.value)} required className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-mono text-sm" />
                                    <div className="border border-slate-200 bg-white rounded-xl flex flex-col items-center justify-center p-3 relative h-20 overflow-hidden cursor-pointer">
                                        {paymentImagePreview ? (
                                             <div className="flex items-center gap-3">
                                                 <img src={paymentImagePreview} alt="Screenshot" className="w-full h-full object-cover absolute inset-0 opacity-30" />
                                                 <span className="z-10 font-bold text-slate-800 text-sm">✓ Recibo Adjuntado</span>
                                             </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                                                <Upload className="w-5 h-5"/> Adjuntar Screenshot del Pago
                                            </div>
                                        )}
                                        <input type="file" accept="image/*" onChange={handlePaymentImageChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-primary text-slate-900 w-full rounded-2xl py-4 font-black flex items-center justify-center gap-2 active:scale-95 transition-transform"
                        >
                            {isSubmitting ? 'Enviando Solicitud...' : 'Enviar solicitud de alerta push'}
                        </button>
                    </form>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Selector de Pestañas: Activas vs Historial */}
                    <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
                        <button
                            type="button"
                            onClick={() => setCampaignsView('active')}
                            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
                                campaignsView === 'active' 
                                    ? 'bg-white text-slate-900 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Megaphone className="w-4 h-4 text-primary" />
                            Campañas Activas & Programadas
                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                                campaignsView === 'active' 
                                    ? 'bg-primary text-slate-950 font-black' 
                                    : 'bg-slate-200 text-slate-700 font-bold'
                            }`}>
                                {activeCampaigns.length}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setCampaignsView('history')}
                            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
                                campaignsView === 'history' 
                                    ? 'bg-white text-slate-900 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <History className="w-4 h-4 text-slate-600" />
                            Historial de Marketing Push (Caducadas / Ejecutadas)
                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                                campaignsView === 'history' 
                                    ? 'bg-slate-900 text-white font-black' 
                                    : 'bg-slate-200 text-slate-700 font-bold'
                            }`}>
                                {historyCampaigns.length}
                            </span>
                        </button>
                    </div>

                    {displayedCampaigns.length === 0 ? (
                        <div className="p-12 border-2 border-dashed border-slate-200 rounded-3xl text-center bg-white space-y-2">
                            <Megaphone className="w-12 h-12 text-slate-300 mx-auto" />
                            <p className="font-bold text-slate-700 text-base">
                                {campaignsView === 'active' 
                                    ? 'No tienes campañas activas ni programadas actualmente.' 
                                    : 'No tienes campañas en el historial aún.'}
                            </p>
                            <p className="text-xs text-slate-400 max-w-md mx-auto">
                                {campaignsView === 'active'
                                    ? 'Crea una nueva campaña para hacer sonar ofertas y avisos directamente en los celulares de tus clientes.'
                                    : 'Las campañas que ya fueron emitidas o cuyos comprobantes vencieron aparecerán aquí para que puedas reutilizarlas con un solo clic.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {displayedCampaigns.map(camp => {
                                const schedDate = camp.scheduledAt ? new Date(camp.scheduledAt) : null;
                                const isSchedValid = schedDate && !isNaN(schedDate.getTime());
                                const formattedDate = isSchedValid ? schedDate.toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha';
                                
                                const isExecuted = !!camp.executedAt || !!camp.executed_at || camp.status === 'completed';
                                const isExpired = !!camp.expiredAt || !!camp.expired_at || camp.status === 'expired';
                                const canReschedule = !isExecuted && !isExpired && camp.status !== 'rejected_payment' && camp.status !== 'rejected';

                                return (
                                    <div key={camp.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:border-slate-300 transition-all">
                                        <div>
                                            {camp.imageUrl ? (
                                                <img src={camp.imageUrl} alt="Banner" className="w-full h-40 object-cover rounded-xl mb-4" />
                                            ) : (
                                                <div className="w-full h-40 bg-slate-100 flex items-center justify-center rounded-xl mb-4">
                                                    <ImageIcon className="text-slate-300 w-10 h-10" />
                                                </div>
                                            )}

                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <h3 className="font-black text-slate-900 text-base line-clamp-1 flex-1">
                                                    {camp.title}
                                                </h3>
                                                <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                                                    ${camp.price || 0} USD
                                                </span>
                                            </div>
                                            <p className="text-slate-500 text-xs mb-3 line-clamp-2 min-h-8">
                                                {camp.subtitle}
                                            </p>

                                            {camp.promoProductSnapshot && (
                                                <div className="mb-3 p-2.5 bg-amber-50 rounded-xl border border-amber-200/80 flex items-center gap-2.5">
                                                    <Flame className="w-4 h-4 text-amber-600 shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-black text-slate-800 truncate">
                                                            {camp.promoProductSnapshot.name}
                                                        </p>
                                                        <p className="text-[11px] font-bold text-amber-700">
                                                            🔥 Oferta: ${camp.promoPrice || camp.promoProductSnapshot.promo_price}
                                                            {camp.promoProductSnapshot.price > (camp.promoPrice || camp.promoProductSnapshot.promo_price) && (
                                                                <span className="text-slate-400 line-through ml-1 font-normal text-[10px]">
                                                                    ${camp.promoProductSnapshot.price}
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Info de Programación */}
                                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-3 space-y-1.5 text-xs">
                                                <div className="flex items-center justify-between text-slate-600">
                                                    <span className="flex items-center gap-1.5 font-bold">
                                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                        {isExecuted ? 'Enviada el:' : 'Programada:'}
                                                    </span>
                                                    <span className="font-mono font-bold text-slate-800 text-[11px]">
                                                        {formattedDate}
                                                    </span>
                                                </div>

                                                {camp.was_auto_rescheduled && (
                                                    <div className="bg-amber-100/70 border border-amber-200 rounded-lg px-2 py-1 flex items-center gap-1.5 text-[10px] text-amber-900 font-bold">
                                                        <Calendar className="w-3 h-3 text-amber-700 shrink-0" />
                                                        <span>Reprogramada automáticamente (+24h) por Super Admin</span>
                                                    </div>
                                                )}

                                                {camp.was_rescheduled && !camp.was_auto_rescheduled && (
                                                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 flex items-center gap-1.5 text-[10px] text-blue-900 font-bold">
                                                        <Clock className="w-3 h-3 text-blue-700 shrink-0" />
                                                        <span>Horario modificado previamente</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex justify-between items-center bg-slate-50 p-2 px-3 rounded-lg text-xs font-bold text-slate-700 mb-3">
                                                <span>Clics recibidos</span>
                                                <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-mono">
                                                    {camp.clicks || 0}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100 space-y-2">
                                            {/* Status Badge */}
                                            {camp.status === 'verifying_payment' && (
                                                <span className="bg-amber-100 text-amber-900 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block border border-amber-200">
                                                    ⏳ Verificando Pago Móvil (${camp.price || 0})
                                                </span>
                                            )}
                                            {(camp.status === 'active' || camp.status === 'approved' || camp.status === 'scheduled') && !isExecuted && (
                                                <span className="bg-emerald-100 text-emerald-900 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block border border-emerald-200">
                                                    ✅ Campaña Aprobada / Programada
                                                </span>
                                            )}
                                            {camp.status === 'inactive' && (
                                                <span className="bg-slate-100 text-slate-600 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block">
                                                    ⏸️ Campaña Pausada
                                                </span>
                                            )}
                                            {isExecuted && (
                                                <span className="bg-slate-900 text-emerald-400 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full flex items-center justify-center gap-1.5">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                    Aviso Enviado & Caducado
                                                </span>
                                            )}
                                            {isExpired && !isExecuted && (
                                                <span className="bg-slate-200 text-slate-700 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block">
                                                    ⌛ Aviso Caducado
                                                </span>
                                            )}
                                            {(camp.status === 'rejected_payment' || camp.status === 'rejected') && (
                                                <span className="bg-red-100 text-red-800 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block border border-red-200">
                                                    ❌ Pago No Aprobado
                                                </span>
                                            )}

                                            {/* Botón Cambiar Hora / Reprogramar (Activas antes de enviarse) */}
                                            {campaignsView === 'active' && canReschedule && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenRescheduleModal(camp)}
                                                    className="w-full py-2.5 px-3 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center gap-2 transition-all active:scale-98 border border-slate-200"
                                                >
                                                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                                                    🕒 Cambiar Hora / Reprogramar
                                                </button>
                                            )}

                                            {/* Botón Volver a Usar este Aviso (Nuevo Pago) (Historial) */}
                                            {campaignsView === 'history' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleReuseCampaign(camp)}
                                                    className="w-full py-2.5 px-3 rounded-xl font-black text-xs bg-primary text-slate-950 hover:bg-primary/90 shadow-md shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-98"
                                                >
                                                    <RefreshCw className="w-3.5 h-3.5" />
                                                    🔄 Volver a Usar este Aviso (Nuevo Pago)
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Modal para Reprogramar Hora */}
            {selectedCampForReschedule && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                            <div className="flex items-center gap-2">
                                <span className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                                    <Clock className="w-5 h-5" />
                                </span>
                                <div>
                                    <h3 className="font-black text-slate-900 text-base">Reprogramar Lanzamiento</h3>
                                    <p className="text-xs text-slate-400 font-medium">Modifica la fecha y hora de emisión del Pop-Up</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedCampForReschedule(null)}
                                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200/70 text-xs text-amber-900 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <p>
                                    Puedes cambiar la hora antes de que la notificación sea enviada a los usuarios. La nueva fecha y hora debe ser estrictamente en el futuro.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1.5">
                                    Nueva Fecha de Envío
                                </label>
                                <input 
                                    type="date" 
                                    value={rescheduleDate}
                                    min={new Date().toISOString().split('T')[0]}
                                    onChange={e => setRescheduleDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1.5">
                                    Nueva Hora de Envío
                                </label>
                                <input 
                                    type="time" 
                                    value={rescheduleTime}
                                    onChange={e => setRescheduleTime(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedCampForReschedule(null)}
                                    className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={isRescheduling}
                                    onClick={handleConfirmReschedule}
                                    className="flex-1 py-3 rounded-xl bg-slate-900 text-primary font-black text-xs hover:bg-slate-800 shadow-md shadow-slate-900/10 flex items-center justify-center gap-2"
                                >
                                    {isRescheduling ? 'Guardando...' : 'Confirmar Nueva Hora'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
