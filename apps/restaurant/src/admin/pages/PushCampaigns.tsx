import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Megaphone, Plus, ImageIcon, Upload, X, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';

export default function PushCampaigns({ restaurantId }: { restaurantId: string }) {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    
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
    const [paymentRef, setPaymentRef] = useState('');
    const [paymentImage, setPaymentImage] = useState<File | null>(null);
    const [paymentImagePreview, setPaymentImagePreview] = useState<string>('');
    
    // Scheduled time
    const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
    const [scheduledTime, setScheduledTime] = useState('12:00');
    
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
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
        const fetchCampaigns = async () => {
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
                    createdAt: d.created_at ? new Date(d.created_at) : new Date(),
                    scheduledAt: d.scheduled_at ? new Date(d.scheduled_at) : new Date()
                })));
            }
        };
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
    }, [restaurantId]);

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
        if (!title || !subtitle || !paymentRef) {
            toast.error("Faltan datos obligatorios");
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

        setIsSubmitting(true);
        try {
            console.log("Iniciando subida de campaña push...");
            let bannerUrl = '';
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
                scheduled_at: scheduledDatetime.toISOString()
            };

            console.log("Guardando en Supabase:", campaignData);
            const { error: insertErr } = await supabase.from('push_campaigns').insert(campaignData);
            if (insertErr) throw insertErr;

            toast.success("Campaña subida. Esperando verificación.");
            setIsCreating(false);
            
            // Clean up
            setTitle(''); setSubtitle(''); setBannerImage(null); setBannerImagePreview('');
            setPaymentImage(null); setPaymentImagePreview(''); setPaymentRef('');
        } catch (error) {
            console.error("Error al publicar la campaña:", error);
            toast.error("Error al publicar la campaña. Verifica tu conexión.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-4 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <Megaphone className="w-8 h-8 text-primary" />
                        Campañas de Notificaciones Pop-Ups
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Invierte en publicidad directa. Envía tu oferta/promoción que sonará en el teléfono de los usuarios de VenCome.
                    </p>
                </div>
                {!isCreating && (
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="bg-primary text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 mt-4 md:mt-0"
                    >
                        <Plus className="w-5 h-5" />
                        Crear Nueva Campaña
                    </button>
                )}
            </div>

            {isCreating ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-4xl">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                        <h2 className="text-xl font-black">Asistente de Nueva Campaña</h2>
                        <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6"/></button>
                    </div>

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
                                <div className="border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-4 relative overflow-hidden bg-slate-50">
                                    {bannerImagePreview ? (
                                        <>
                                            <img src={bannerImagePreview} alt="Preview" className="w-full h-full object-cover absolute inset-0 opacity-40" />
                                            <button type="button" onClick={() => {setBannerImage(null); setBannerImagePreview('');}} className="z-10 bg-white/80 p-2 rounded-full absolute top-2 right-2 hover:bg-red-100"><X className="w-4 h-4 text-red-600"/></button>
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

                        {/* Segmentación */}
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 mb-4 bg-slate-50 p-2 rounded-lg">2. Audiencia y Segmentación</h3>
                            
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
                                    <span className="w-6 h-6 bg-primary/20 text-primary rounded-full flex items-center justify-center text-xs">3</span>
                                    Programación de la Alerta
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Fecha de Lanzamiento</label>
                                        <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Hora de Lanzamiento</label>
                                        <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 mt-2 italic">* La validación del pago puede tardar de 5 minutos a 24 horas. Programe con antelación.</p>
                            </div>
                        </div>

                        {/* Presupuesto y Pago */}
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 mb-4 bg-slate-50 p-2 rounded-lg">4. Confirmación de Inversión</h3>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {campaigns.length === 0 && <p className="col-span-full text-slate-500 p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center">No tienes campañas creadas.</p>}
                    
                    {campaigns.map(camp => (
                        <div key={camp.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                           {camp.imageUrl ? (
                               <img src={camp.imageUrl} alt="Banner" className="w-full h-40 object-cover rounded-xl mb-4" />
                           ) : (
                               <div className="w-full h-40 bg-slate-100 flex items-center justify-center rounded-xl mb-4"><ImageIcon className="text-slate-300 w-10 h-10"/></div>
                           )}
                           <h3 className="font-bold text-slate-900 text-lg mb-1 line-clamp-1">{camp.title}</h3>
                           <p className="text-slate-500 text-sm mb-4 line-clamp-2 min-h-10">{camp.subtitle}</p>

                           <div className="flex justify-between items-center bg-slate-50 p-2 px-3 rounded-lg text-sm font-bold text-slate-700 mb-4 mt-auto">
                               <span>Clics recibidos</span>
                               <span className="bg-white px-2 rounded-md border border-slate-200">{camp.clicks || 0}</span>
                           </div>
                           
                           {/* State badge */}
                           {camp.status === 'verifying_payment' && <span className="bg-yellow-100 text-yellow-800 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block">Verificando Pago ($ {camp.price})</span>}
                           {camp.status === 'active' && <span className="bg-green-100 text-green-800 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block">Campaña Enviada / Activa</span>}
                           {camp.status === 'inactive' && <span className="bg-slate-100 text-slate-500 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block">Campaña Pausada / Desactivada</span>}
                           {camp.status === 'rejected_payment' && <span className="bg-red-100 text-red-800 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block">Pago Rechazado</span>}
 
                           {(camp.status === 'active' || camp.status === 'inactive') && (
                               <button 
                                   type="button"
                                   onClick={async () => {
                                       const newS = camp.status === 'active' ? 'inactive' : 'active';
                                       if (!confirm(`¿Estás seguro de ${newS === 'active' ? 'VOLVER A ACTIVAR' : 'PAUSAR'} esta campaña?`)) return;
                                        try {
                                            const { error: updErr } = await supabase
                                                .from('push_campaigns')
                                                .update({ status: newS })
                                                .eq('id', camp.id);
                                            if (updErr) throw updErr;
                                            toast.success("Estado cambiado correctamente");
                                        } catch(e){ toast.error("Error al pausar/activar"); }
                                   }}
                                   className={`w-full mt-3 py-2 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${camp.status === 'active' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-primary text-black hover:bg-primary/90 shadow-lg shadow-primary/20'}`}
                               >
                                   {camp.status === 'active' ? 'Pausar Publicidad' : 'Reactivar Publicidad'}
                               </button>
                           )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
