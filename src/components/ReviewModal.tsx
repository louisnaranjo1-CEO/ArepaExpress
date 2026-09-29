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

    // Fetch order details if not provided to identify driver and delivery method
    useEffect(() => {
        if (!isOpen || !orderId) return;
        if (!orderInfo) {
            supabase
                .from('orders')
                .select('*')
                .eq('id', orderId)
                .maybeSingle()
                .then(({ data }) => {
                    if (data) setLiveOrder(data);
                });
        } else {
            setLiveOrder(orderInfo);
        }
    }, [isOpen, orderId, orderInfo]);

    if (!isOpen) return null;

    const hasDriver = Boolean(
        liveOrder?.delivery_method !== 'pickup' &&
        liveOrder?.deliveryMethod !== 'pickup' &&
        (liveOrder?.driver_id || liveOrder?.delivery_driver_id || liveOrder?.driver_name || liveOrder?.driverName)
    );

    const driverName = liveOrder?.driver_name || liveOrder?.driverName || 'Repartidor';

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

        if (!user) {
            setError("Debes iniciar sesión para dejar una reseña.");
            return;
        }

        if (rating === 0) {
            setError("Por favor, califica al comercio con al menos 1 estrella.");
            return;
        }

        if (hasDriver && driverRating === 0) {
            setError(`Por favor, califica también el servicio del conductor (${driverName}) con al menos 1 estrella.`);
            return;
        }

        if (comment.trim().length < 4) {
            setError("Por favor, escribe un breve comentario sobre tu experiencia.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Upload photos if any
            const photoURLs: string[] = [];
            for (let i = 0; i < photos.length; i++) {
                const file = photos[i];
                const ext = file.name.split('.').pop() || 'jpg';
                const filePath = `reviews/${restaurantId}/${orderId}_${Date.now()}_${i}.${ext}`;
                const { error: upErr } = await supabase.storage
                    .from('store_assets')
                    .upload(filePath, file, { upsert: true });

                if (upErr) throw upErr;

                const { data: pubData } = supabase.storage
                    .from('store_assets')
                    .getPublicUrl(filePath);

                photoURLs.push(pubData.publicUrl);
            }

            const authorName = isAnonymous ? 'Cliente Anónimo' : (userData?.displayName || 'Usuario');
            const authorAvatar = isAnonymous ? '' : (userData?.photoURL || '');

            // 1. Save store review in Supabase
            const storeReviewData = {
                user_id: user.id,
                user_name: authorName,
                user_avatar: authorAvatar,
                is_anonymous: isAnonymous,
                rating,
                comment: comment.trim(),
                photos: photoURLs,
                created_at: new Date().toISOString(),
                is_hidden: false,
                order_id: orderId,
                restaurant_id: restaurantId
            };

            const { error: insertStoreErr } = await supabase.from('reviews').insert([storeReviewData]);
            if (insertStoreErr) throw insertStoreErr;

            // 2. If driver was rated, save driver review
            const driverIdVal = liveOrder?.driver_id || liveOrder?.delivery_driver_id;
            if (hasDriver && driverIdVal && driverRating > 0) {
                try {
                    await supabase.from('reviews').insert([{
                        user_id: user.id,
                        user_name: authorName,
                        user_avatar: authorAvatar,
                        is_anonymous: isAnonymous,
                        driver_id: driverIdVal,
                        rating: driverRating,
                        comment: driverComment.trim() || `Calificación al conductor (${driverRating}★)`,
                        order_id: orderId,
                        created_at: new Date().toISOString()
                    }]);
                } catch (drvErr) {
                    console.warn("Could not insert driver review record:", drvErr);
                }
            }

            // 3. Update order: mark as reviewed and completed
            await supabase.from('orders').update({
                has_reviewed: true,
                hasReviewed: true,
                status: 'completed',
                completed_at: new Date().toISOString(),
                delivered_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            // Also mark linked transport_request as completed
            try {
                await supabase.from('transport_requests').update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('order_id', orderId);
            } catch (trErr) {
                console.warn("Could not update transport_request status:", trErr);
            }

            // Clear local active IDs so bottom nav and trackers know the cycle is finished
            localStorage.removeItem('active_order_id');
            localStorage.removeItem('active_transport_req_id');

            // 4. Otorgar puntos de fidelización por compra al usuario
            if (user?.id && !liveOrder?.points_credited && !liveOrder?.pointsCredited) {
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

            // 5. Notify business about the review
            try {
                await supabase.from('notifications').insert({
                    restaurant_id: restaurantId,
                    user_id: user.id,
                    type: 'new_review',
                    title: `¡Nueva reseña (${rating}★)!`,
                    message: `${authorName} ha valorado tu negocio con ${rating} estrellas: "${comment.slice(0, 80)}${comment.length > 80 ? '...' : ''}"`,
                    body: `${authorName} ha valorado tu negocio con ${rating} estrellas: "${comment.slice(0, 80)}${comment.length > 80 ? '...' : ''}"`,
                    read: false,
                    created_at: new Date().toISOString()
                });
            } catch (notifErr) {
                console.warn("Could not insert review notification:", notifErr);
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

                        {/* SECTION 1: Calificación del Comercio */}
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

                        {/* SECTION 2: Calificación del Conductor (if delivery) */}
                        {hasDriver && (
                            <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-xl bg-indigo-500 text-white flex items-center justify-center">
                                            <Bike className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-slate-900 text-xs">Calificación del Conductor</h4>
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
                                    placeholder="Comentario sobre la puntualidad o trato del repartidor..."
                                    className="w-full bg-white border border-indigo-200 focus:border-indigo-400 p-2.5 rounded-xl outline-none font-bold text-slate-700 text-xs"
                                />
                            </div>
                        )}

                        {/* Photos Upload */}
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
                                disabled={isSubmitting || rating === 0}
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
