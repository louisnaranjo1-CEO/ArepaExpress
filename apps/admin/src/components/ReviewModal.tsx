import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, UploadCloud, Image as ImageIcon, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface ReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    restaurantId: string;
    orderId: string;
    onReviewSubmitted: () => void;
}

export default function ReviewModal({ isOpen, onClose, restaurantId, orderId, onReviewSubmitted }: ReviewModalProps) {
    const { user, userData } = useAuth();
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [photos, setPhotos] = useState<File[]>([]);
    const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const MAX_PHOTOS = 3;
    const MAX_FILE_SIZE_MB = 2;

    if (!isOpen) return null;

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
            setError("Por favor, selecciona una calificación (estrellas).");
            return;
        }

        if (comment.trim().length < 5) {
            setError("Por favor, escribe un comentario un poco más largo.");
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

            // Save review in Supabase
            const reviewData = {
                user_id: user.id || user.uid,
                user_name: userData?.displayName || user.displayName || 'Usuario',
                user_avatar: user.photoURL || '',
                rating,
                comment,
                photos: photoURLs,
                created_at: new Date().toISOString(),
                is_hidden: false,
                order_id: orderId,
                restaurant_id: restaurantId
            };

            const { error: insertErr } = await supabase.from('reviews').insert([reviewData]);
            if (insertErr) throw insertErr;

            // Update order to mark as reviewed and completed if delivered
            const { data: orderSnap } = await supabase
                .from('orders')
                .select('status')
                .eq('id', orderId)
                .maybeSingle();

            const updateData: any = {
                has_reviewed: true,
                hasReviewed: true
            };
            
            if (orderSnap && orderSnap.status === 'delivered') {
                updateData.status = 'completed';
            }
            
            await supabase.from('orders').update(updateData).eq('id', orderId);

            toast.success("¡Reseña enviada con éxito!");
            onReviewSubmitted();
        } catch (err: any) {
            console.error("Error submitting review:", err);
            toast.error(`Error al publicar la reseña: ${err.message || 'Inténtalo de nuevo'}`);
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
                    className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden my-auto"
                >
                    <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 leading-none">Tu Experiencia</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Valora tu pedido</p>
                        </div>
                        <button onClick={onClose} disabled={isSubmitting} className="p-2 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {error && (
                            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold animate-in shake-in duration-300 border border-red-100">
                                {error}
                            </div>
                        )}

                        {/* Rating Stars */}
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calificación</span>
                            <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        onMouseEnter={() => setHoverRating(star)}
                                        onMouseLeave={() => setHoverRating(0)}
                                        onClick={() => setRating(star)}
                                        className="p-1.5 transition-transform hover:scale-110 active:scale-95"
                                    >
                                        <Star
                                            className={`w-8 h-8 transition-colors ${
                                                star <= (hoverRating || rating)
                                                    ? 'fill-amber-400 text-amber-400'
                                                    : 'text-slate-200'
                                            }`}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Comment Input */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Comentario
                            </label>
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Cuéntanos más sobre la calidad de la comida, el empaque..."
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary p-4 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm min-h-[100px] resize-none"
                            />
                        </div>

                        {/* Photo Previews */}
                        {photoPreviews.length > 0 && (
                            <div className="flex gap-3 overflow-x-auto pb-2">
                                {photoPreviews.map((preview, i) => (
                                    <div key={i} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 shrink-0 group">
                                        <img src={preview} alt="Upload preview" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removePhoto(i)}
                                            className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Photo Input Button */}
                        {photos.length < MAX_PHOTOS && (
                            <div>
                                <label className="flex items-center justify-center gap-2 p-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-primary transition-all text-xs font-bold text-slate-500">
                                    <UploadCloud className="w-4 h-4" />
                                    <span>Agregar Fotos ({photos.length}/{MAX_PHOTOS})</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handlePhotoChange}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting || rating === 0}
                            className="w-full py-4 bg-primary text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                'Enviar Reseña'
                            )}
                        </button>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
