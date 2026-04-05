import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, UploadCloud, Image as ImageIcon, Trash2 } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

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
                return; // Stop processing if one fails
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

        // Reset input so the same file could be selected again if removed
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
                const storageRef = ref(storage, `reviews/${restaurantId}/${orderId}_${Date.now()}_${i}`);
                const snapshot = await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(snapshot.ref);
                photoURLs.push(downloadURL);
            }

            // Save review
            const reviewData = {
                userId: user.uid,
                userName: userData?.displayName || user.displayName || 'Usuario',
                userPhoto: user.photoURL || '',
                rating,
                comment,
                photos: photoURLs,
                createdAt: serverTimestamp(),
                isHidden: false,
                orderId
            };

            const reviewsRef = collection(db, 'restaurants', restaurantId, 'reviews');
            await addDoc(reviewsRef, reviewData);

            // Update order to mark as reviewed
            const orderRef = doc(db, 'orders', orderId);
            await updateDoc(orderRef, { hasReviewed: true });

            onReviewSubmitted();
        } catch (err: any) {
            console.error("Error submitting review:", err);
            setError("Hubo un error al enviar tu reseña. Por favor, intenta de nuevo.");
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
                                        className="p-1 transition-transform hover:scale-110 active:scale-90"
                                    >
                                        <Star
                                            className={`w-10 h-10 transition-colors ${(hoverRating || rating) >= star
                                                ? 'fill-orange-400 text-orange-400'
                                                : 'fill-slate-100 text-slate-200'
                                                }`}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Comment */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Tu Reseña</label>
                            <textarea
                                required
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Comparte detalles de tu experiencia, ¿Qué te gustó más?"
                                className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none resize-none"
                            ></textarea>
                        </div>

                        {/* Photos Upload */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between ml-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Fotos (Opcional - Máx {MAX_PHOTOS})
                                </label>
                                <span className="text-[10px] font-bold text-slate-400">{photos.length}/{MAX_PHOTOS}</span>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                {photoPreviews.map((preview, index) => (
                                    <div key={index} className="relative w-24 h-24 rounded-2xl border-2 border-slate-100 overflow-hidden group">
                                        <img src={preview} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button
                                                type="button"
                                                onClick={() => removePhoto(index)}
                                                className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {photos.length < MAX_PHOTOS && (
                                    <div className="relative w-24 h-24 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer group">
                                        <UploadCloud className="w-6 h-6 text-slate-400 mb-1 group-hover:text-slate-900 transition-colors" />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-900 transition-colors">Subir</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={handlePhotoChange}
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                        />
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium ml-2">Máximo 2MB por foto.</p>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Enviando...
                                </>
                            ) : (
                                "Publicar Reseña"
                            )}
                        </button>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
