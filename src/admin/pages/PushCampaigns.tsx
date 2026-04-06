import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { Megaphone, Plus, ImageIcon, Upload, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
                const docSnap = await getDoc(doc(db, 'system_settings', 'marketing'));
                if (docSnap.exists()) {
                    setPrices({
                        pushPriceCity: docSnap.data().pushPriceCity ?? 5,
                        pushPriceState: docSnap.data().pushPriceState ?? 10,
                        pushPriceNational: docSnap.data().pushPriceNational ?? 20,
                    });
                }
            } catch (err) {
                console.error(err);
            }
        };
        loadSettings();

        // Cargar nombre del rest
        const loadRest = async () => {
             const rDoc = await getDoc(doc(db, 'restaurants', restaurantId));
             if (rDoc.exists()) setRestaurantData(rDoc.data());
        };
        loadRest();

        // Escuchar campañas mías
        const q = query(collection(db, 'push_campaigns'), where('restaurantId', '==', restaurantId));
        const unsubscribe = onSnapshot(q, snap => {
            const arr: any[] = [];
            snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
            arr.sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            setCampaigns(arr);
        });

        return () => unsubscribe();
    }, [restaurantId]);

    const getCurrentPrice = () => {
        if (locationLevel === 'city') return prices.pushPriceCity;
        if (locationLevel === 'state') return prices.pushPriceState;
        return prices.pushPriceNational;
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

        setIsSubmitting(true);
        try {
            console.log("Iniciando subida de campaña push...");
            let bannerUrl = '';
            if (bannerImage) {
                const bannerRef = ref(storage, `push_campaigns/${restaurantId}_${Date.now()}_banner`);
                const snap = await uploadBytes(bannerRef, bannerImage);
                bannerUrl = await getDownloadURL(snap.ref);
            }

            let pImage = '';
            if (paymentImage) {
                const payRef = ref(storage, `push_campaigns/${restaurantId}_${Date.now()}_payment`);
                const snap = await uploadBytes(payRef, paymentImage);
                pImage = await getDownloadURL(snap.ref);
            }

            const city = restaurantData?.address?.city || 'Desconocida';
            const state = restaurantData?.address?.state || 'Desconocido';

            // Combinar fecha y hora para el scheduledAt
            const scheduledDatetime = new Date(`${scheduledDate}T${scheduledTime}`);

            const campaignData = {
                restaurantId,
                restaurantName: restaurantData?.name || 'Restaurante',
                restaurantLogo: restaurantData?.logoUrl || '',
                title,
                subtitle,
                location: locationLevel,
                city: locationLevel === 'city' ? city : null,
                state: (locationLevel === 'state' || locationLevel === 'city') ? state : null,
                minAge,
                maxAge,
                sex,
                imageUrl: bannerUrl,
                paymentRef,
                paymentImage: pImage,
                price: getCurrentPrice(),
                status: 'verifying_payment',
                clicks: 0,
                createdAt: serverTimestamp(),
                scheduledAt: scheduledDatetime
            };

            console.log("Guardando en Firestore:", campaignData);
            await addDoc(collection(db, 'push_campaigns'), campaignData);

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
                                        <option value="city">Solo mi Ciudad (${prices.pushPriceCity})</option>
                                        <option value="state">Cualquiera en mi Estado (${prices.pushPriceState})</option>
                                        <option value="national">Alcance Nacional (${prices.pushPriceNational})</option>
                                    </select>
                                </div>
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
                            {isSubmitting ? 'Enviando Solicitud...' : 'Publicar Alerta Push Global'}
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
                           {camp.status === 'active' && <span className="bg-green-100 text-green-800 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block">Campaña Envida Mágicamente</span>}
                           {camp.status === 'rejected_payment' && <span className="bg-red-100 text-red-800 py-1.5 px-3 rounded-xl text-xs font-black text-center w-full block">Pago Rechazado</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
