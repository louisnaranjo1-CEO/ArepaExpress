import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, UploadCloud, Trash2, Store, Bike, UserCheck, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface ReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    restaurantId: string;
    orderId: string;
    orderInfo?: any;
    onReviewSubmitted: () => void;
}

export default function ReviewModal({ 
    isOpen, 
    onClose, 
    restaurantId, 
    orderId, 
    orderInfo,
    onReviewSubmitted 
}: ReviewModalProps) {
    const { user, userData } = useAuth();
    const [liveOrder, setLiveOrder] = useState<any>(orderInfo || null);
    
    // Store review state
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [photos, setPhotos] = useState<File[]>([]);
    const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
    
    // Driver review state (if delivery)
    const [driverRating, setDriverRating] = useState(0);
    const [hoverDriverRating, setHoverDriverRating] = useState(0);
    const [driverComment, setDriverComment] = useState('');
    
    // Privacy selector: Visible Name vs Anonymous Mode
    const [isAnonymous, setIsAnonymous] = useState(false);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const MAX_PHOTOS = 3;
    const MAX_FILE_SIZE_MB = 2;

    // Fetch order/trip details and strictly verify unique review (PROHIBIDO CALIFICAR MÁS DE 1 VEZ)
    useEffect(() => {
        if (!isOpen || !orderId) return;

        // 1. Local storage & session storage check
        if (
            localStorage.getItem('reviewed_service_' + orderId) === 'true' ||
            sessionStorage.getItem('reviewed_order_' + orderId) === 'true'
        ) {
            toast("Este servicio ya fue calificado. ¡Gracias!", { icon: '⭐' });
            onClose();
            return;
        }

        // 2. Database unique review check
        const verifyUniqueReview = async () => {
            try {
                const { data } = await supabase
                    .from('reviews')
                    .select('id')
                    .or(`ride_id.eq.${orderId},order_id.eq.${orderId}`)
                    .limit(1);

                if (data && data.length > 0) {
                    localStorage.setItem('reviewed_service_' + orderId, 'true');
                    toast("Este servicio ya fue calificado. ¡Gracias!", { icon: '⭐' });
                    onClose();
                    return;
                }
            } catch (e) {
                console.warn("Review verification check:", e);
            }
        };

        verifyUniqueReview();

        if (!orderInfo) {
            supabase
                .from('orders')
                .select('*')
                .eq('id', orderId)
                .maybeSingle()
                .then(({ data }) => {
                    if (data) {
                        if (data.has_reviewed) {
                            localStorage.setItem('reviewed_service_' + orderId, 'true');
                            toast("Este servicio ya fue calificado. ¡Gracias!", { icon: '⭐' });
                            onClose();
                            return;
                        }
                        setLiveOrder(data);
                    } else {
                        // Buscar en transport_requests si no existe en orders
                        supabase
                            .from('transport_requests')
                            .select('*')
                            .eq('id', orderId)
                            .maybeSingle()
                            .then(({ data: trData }) => {
                                if (trData) {
                                    if (trData.has_reviewed || trData.rating != null) {
                                        localStorage.setItem('reviewed_service_' + orderId, 'true');
                                        toast("Este servicio ya fue calificado. ¡Gracias!", { icon: '⭐' });
                                        onClose();
                                        return;
                                    }
                                    setLiveOrder(trData);
                                }
                            });
                    }
                });
        } else {
            if (orderInfo.has_reviewed || orderInfo.rating != null) {
                localStorage.setItem('reviewed_service_' + orderId, 'true');
                toast("Este servicio ya fue calificado. ¡Gracias!", { icon: '⭐' });
                onClose();
                return;
            }
            setLiveOrder(orderInfo);
        }
    }, [isOpen, orderId, orderInfo, onClose]);

    if (!isOpen) return null;

    const hasDriver = Boolean(
        liveOrder?.delivery_method !== 'pickup' &&
        liveOrder?.deliveryMethod !== 'pickup' &&
        (liveOrder?.driver_id || liveOrder?.delivery_driver_id || liveOrder?.driver_name || liveOrder?.driverName)
    );

    const driverName = liveOrder?.driver_name || liveOrder?.driverName || 'Repartidor / Conductor';

    const isMobilityService = Boolean(
        liveOrder?.isMobility ||
        !restaurantId ||
        liveOrder?.order_type === 'transport' ||
        liveOrder?.type === 'transport' ||
        liveOrder?.service_category ||
        !liveOrder?.restaurant_id
    );

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];

        if (photos.length + files.length > MAX_PHOTOS) {
            setError(`Solo puedes subir un máximo de ${MAX_PHOTOS} fotos.`);
            return;
        }

        const validFiles: File[] = [];
        const newPreviews: string[] = [];

        for (const file of files) {
            if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                setError(`La foto "${file.name}" supera el límite de ${MAX_FILE_SIZE_MB}MB.`);
                return;
            }
            if (!file.type.startsWith('image/')) {
                setError(`El archivo "${file.name}" no es una imagen válida.`);
                return;
            }
            validFiles.push(file);
            newPreviews.push(URL.createObjectURL(file));
        }

        setError(null);
        setPhotos(prev => [...prev, ...validFiles]);
        setPhotoPreviews(prev => [...prev, ...newPreviews]);

        if (e.target) e.target.value = '';
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
        setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // 1. Bloqueo inmediato para evitar doble envío accidental o concurrente
        if (isSubmitting) return;

        if (!user) {
            setError("Debes iniciar sesión para dejar una reseña.");
            return;
        }

        if (isMobilityService) {
            if (driverRating === 0 && rating === 0) {
                setError(`Por favor, califica el servicio del conductor (${driverName}) con al menos 1 estrella.`);
                return;
            }
        } else {
            if (rating === 0) {
                setError("Por favor, califica al comercio con al menos 1 estrella.");
                return;
            }
            if (hasDriver && driverRating === 0) {
                setError(`Por favor, califica también el servicio del conductor (${driverName}) con al menos 1 estrella.`);
                return;
            }
            if (comment.trim().length < 4) {
                setError("Por favor, escribe un breve comentario sobre tu experiencia con el comercio.");
                return;
            }
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const finalRating = isMobilityService ? (driverRating || rating || 5) : (rating || 5);
            const finalDriverRating = driverRating || (isMobilityService ? finalRating : null);
            const finalComment = isMobilityService 
                ? (driverComment.trim() || comment.trim() || `Excelente servicio (${finalRating}★)`) 
                : comment.trim();

            const authorName = isAnonymous ? 'Cliente Anónimo' : (userData?.displayName || 'Usuario');
            const authorAvatar = isAnonymous ? '' : (userData?.photoURL || '');
            const driverIdVal = liveOrder?.driver_id || liveOrder?.delivery_driver_id || liveOrder?.assigned_driver_id || null;

            if (isMobilityService) {
                // 1. Upsert en public.reviews con onConflict: 'ride_id' (regla estricta de calificación única)
                const rideReviewData = {
                    user_id: user.id,
                    user_name: authorName,
                    user_avatar: authorAvatar,
                    is_anonymous: isAnonymous,
                    driver_id: driverIdVal,
                    ride_id: orderId,
                    rating: finalRating,
                    driver_rating: finalDriverRating,
                    comment: finalComment,
                    created_at: new Date().toISOString()
                };

                const { error: upsertRideErr } = await supabase
                    .from('reviews')
                    .upsert(rideReviewData, { onConflict: 'ride_id' });

                if (upsertRideErr) {
                    console.warn("Ride review upsert warning:", upsertRideErr);
                }

                // 2. Actualizar directamente public.transport_requests marcando has_reviewed y client_dismissed
                await supabase.from('transport_requests').update({
                    has_reviewed: true,
                    client_dismissed: true,
                    rating: finalRating,
                    rating_comment: finalComment,
                    rated_at: new Date().toISOString(),
                    status: 'completed',
                    driver_paid: true,
                    payment_status: 'confirmed',
                    payment_confirmed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).or(`id.eq.${orderId},order_id.eq.${orderId}`);
            } else {
                // Subir fotos si existen
                const photoURLs: string[] = [];
                if (photos.length > 0) {
                    for (let i = 0; i < photos.length; i++) {
                        const file = photos[i];
                        const ext = file.name.split('.').pop() || 'jpg';
                        const filePath = `reviews/${restaurantId || 'orders'}/${orderId}_${Date.now()}_${i}.${ext}`;
                        const { error: upErr } = await supabase.storage
                            .from('store_assets')
                            .upload(filePath, file, { upsert: true });

                        if (!upErr) {
                            const { data: pubData } = supabase.storage
                                .from('store_assets')
                                .getPublicUrl(filePath);
                            photoURLs.push(pubData.publicUrl);
                        }
                    }
                }

                // 1. Upsert en public.reviews con onConflict: 'order_id'
                const orderReviewData = {
                    user_id: user.id,
                    user_name: authorName,
                    user_avatar: authorAvatar,
                    is_anonymous: isAnonymous,
                    rating: finalRating,
                    driver_rating: finalDriverRating,
                    driver_id: driverIdVal,
                    comment: finalComment,
                    photos: photoURLs,
                    created_at: new Date().toISOString(),
                    is_hidden: false,
                    order_id: orderId,
                    restaurant_id: restaurantId || null
                };

                const { error: upsertOrderErr } = await supabase
                    .from('reviews')
                    .upsert(orderReviewData, { onConflict: 'order_id' });

                if (upsertOrderErr) {
                    console.warn("Order review upsert warning:", upsertOrderErr);
                }

                // 2. Actualizar directamente public.orders
                await supabase.from('orders').update({
                    has_reviewed: true,
                    client_dismissed: true,
                    rating: finalRating,
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    delivered_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', orderId);

                // Si existe un transport_request vinculado al delivery
                if (driverIdVal || liveOrder?.transport_request_id) {
                    await supabase.from('transport_requests').update({
                        has_reviewed: true,
                        client_dismissed: true,
                        rating: finalDriverRating || finalRating,
                        rating_comment: finalComment,
                        rated_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }).or(`id.eq.${orderId},order_id.eq.${orderId}`);
                }
            }

            // 3. Persistir localmente en storage y liberar totalmente el estado del usuario
            localStorage.setItem('reviewed_service_' + orderId, 'true');
            localStorage.setItem('dismissed_trip_' + orderId, 'true');
            sessionStorage.setItem('reviewed_order_' + orderId, 'true');
            localStorage.removeItem('active_order_id');
            localStorage.removeItem('active_transport_req_id');
            window.dispatchEvent(new CustomEvent('transport_cycle_closed', { detail: { id: orderId } }));

            // 4. Otorgar puntos de fidelización si aplica
            if (user?.id && !liveOrder?.points_credited && !liveOrder?.pointsCredited && !isMobilityService) {
                const orderTotal = Number(liveOrder?.total || liveOrder?.subtotal || 10);
                const pointsEarned = Math.round(orderTotal * 2.5);
                try {
                    const { data: prof } = await supabase.from('profiles').select('points').eq('id', user.id).maybeSingle();
                    const currentPts = prof?.points || 0;
                    await supabase.from('profiles').update({ points: currentPts + pointsEarned }).eq('id', user.id);
                    await supabase.from('orders').update({ points_credited: true }).eq('id', orderId);
                    toast.success(`✨ ¡Ganaste +${pointsEarned} puntos por tu compra!`);
                } catch (ptsErr) {
                    console.warn("Points error:", ptsErr);
                }
            }

            // 5. Notificar al comercio si aplica
            if (!isMobilityService && restaurantId) {
                try {
                    await supabase.from('notifications').insert({
                        restaurant_id: restaurantId,
                        user_id: user.id,
                        type: 'new_review',
                        title: `¡Nueva reseña (${finalRating}★)!`,
                        message: `${authorName} ha valorado tu negocio con ${finalRating} estrellas: "${finalComment.slice(0, 80)}${finalComment.length > 80 ? '...' : ''}"`,
                        body: `${authorName} ha valorado tu negocio con ${finalRating} estrellas: "${finalComment.slice(0, 80)}${finalComment.length > 80 ? '...' : ''}"`,
                        read: false,
                        created_at: new Date().toISOString()
                    });
                } catch (notifErr) {
                    console.warn("Could not insert review notification:", notifErr);
                }
            }

            toast.success("¡Gracias por tu valoración! Ciclo completado 🎉");
            onReviewSubmitted();
            onClose();
        } catch (err: any) {
            console.error("Error submitting review:", err);
            setError(`Error al publicar la reseña: ${err.message || 'Inténtalo de nuevo'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
                >
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 leading-none">Calificar Experiencia</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5">
                                Cierre de ciclo • #{orderId.slice(-6).toUpperCase()}
                            </p>
                        </div>
                        <button onClick={onClose} disabled={isSubmitting} className="p-2 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
                        {error && (
                            <div className="p-3.5 bg-red-50 text-red-600 rounded-2xl text-xs font-bold animate-in shake-in duration-300 border border-red-100">
                                {error}
                            </div>
                        )}

                        {/* SECTION 1: Calificación del Comercio (Oculto en movilidad pura) */}
                        {!isMobilityService && (
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center text-slate-900">
                                        <Store className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs">Calificación del Comercio</h4>
                                        <p className="text-[10px] text-slate-400 font-bold">
                                            {liveOrder?.restaurant_name || 'Comercio'}
                                        </p>
                                    </div>
                                </div>

                                {/* Stars */}
                                <div className="flex items-center justify-center gap-1.5 py-1">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            onMouseEnter={() => setHoverRating(star)}
                                            onMouseLeave={() => setHoverRating(0)}
                                            onClick={() => setRating(star)}
                                            className="p-1 transition-transform hover:scale-115 active:scale-95"
                                        >
                                            <Star
                                                className={`w-7 h-7 transition-colors ${
                                                    star <= (hoverRating || rating)
                                                        ? 'fill-amber-400 text-amber-400'
                                                        : 'text-slate-200'
                                                }`}
                                            />
                                        </button>
                                    ))}
                                </div>

                                {/* Store Comment Input */}
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="¿Qué tal la calidad del producto, presentación y preparación?..."
                                    className="w-full bg-white border border-slate-200 focus:border-primary p-3 rounded-xl outline-none font-bold text-slate-700 transition-all text-xs min-h-[70px] resize-none"
                                />
                            </div>
                        )}

                        {/* SECTION 2: Calificación del Conductor / Repartidor */}
                        {(hasDriver || isMobilityService) && (
                            <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center">
                                            <Bike className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-900 text-xs">
                                                {isMobilityService ? 'Calificación del Conductor' : 'Calificación del Repartidor'}
                                            </h4>
                                            <p className="text-[10px] text-slate-500 font-bold">
                                                {driverName}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full">
                                        Obligatorio
                                    </span>
                                </div>

                                <div className="flex items-center justify-center gap-1.5 py-1">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            onMouseEnter={() => setHoverDriverRating(star)}
                                            onMouseLeave={() => setHoverDriverRating(0)}
                                            onClick={() => setDriverRating(star)}
                                            className="p-1 transition-transform hover:scale-115 active:scale-95"
                                        >
                                            <Star
                                                className={`w-7 h-7 transition-colors ${
                                                    star <= (hoverDriverRating || driverRating)
                                                        ? 'fill-indigo-500 text-indigo-500'
                                                        : 'text-slate-200'
                                                }`}
                                            />
                                        </button>
                                    ))}
                                </div>

                                <input
                                    type="text"
                                    value={driverComment}
                                    onChange={(e) => setDriverComment(e.target.value)}
                                    placeholder={isMobilityService ? "Comentario sobre el trato, amabilidad y vehículo del conductor..." : "Comentario sobre la puntualidad o trato del repartidor..."}
                                    className="w-full bg-white border border-indigo-200 focus:border-indigo-400 p-2.5 rounded-xl outline-none font-bold text-slate-700 text-xs"
                                />
                            </div>
                        )}

                        {/* Photos Upload (Solo para comercios / pedidos) */}
                        {!isMobilityService && (
                            <div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                    Fotos de tu pedido ({photos.length}/{MAX_PHOTOS}):
                                </span>
                                {photoPreviews.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                                        {photoPreviews.map((preview, i) => (
                                            <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 group">
                                                <img src={preview} alt="Upload preview" className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => removePhoto(i)}
                                                    className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white hover:bg-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {photos.length < MAX_PHOTOS && (
                                    <label className="flex items-center justify-center gap-2 p-2.5 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-primary transition-all text-xs font-bold text-slate-500">
                                        <UploadCloud className="w-4 h-4 text-slate-400" />
                                        <span>Adjuntar fotos del producto</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={handlePhotoChange}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>
                        )}

                        {/* SECTION 3: Privacy Selector (Visible vs Anonymous) */}
                        <div className="space-y-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                                ¿Cómo deseas que aparezca tu reseña?
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAnonymous(false)}
                                    className={`p-3 rounded-2xl border-2 flex items-center gap-2 text-left transition-all ${
                                        !isAnonymous
                                            ? 'bg-primary/10 border-primary text-slate-900 shadow-sm'
                                            : 'bg-slate-50 border-slate-200 text-slate-600'
                                    }`}
                                >
                                    <UserCheck className="w-4 h-4 text-primary shrink-0" />
                                    <div>
                                        <p className="font-black text-xs">Nombre Visible</p>
                                        <p className="text-[9px] opacity-75 truncate">{userData?.displayName || 'Tu perfil'}</p>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setIsAnonymous(true)}
                                    className={`p-3 rounded-2xl border-2 flex items-center gap-2 text-left transition-all ${
                                        isAnonymous
                                            ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                                            : 'bg-slate-50 border-slate-200 text-slate-600'
                                    }`}
                                >
                                    <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                                    <div>
                                        <p className="font-black text-xs">Modo Anónimo</p>
                                        <p className="text-[9px] opacity-75">Oculta tus datos</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-2 border-t border-slate-100">
                            <button
                                type="submit"
                                disabled={isSubmitting || (isMobilityService ? (driverRating === 0 && rating === 0) : rating === 0)}
                                className="w-full py-4 bg-primary text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    'Publicar Valoración'
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
