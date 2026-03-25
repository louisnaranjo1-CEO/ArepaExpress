import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, MessageSquare, Loader2, User } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';

interface Review {
    id: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: any;
    userPhoto?: string;
}

interface ReviewsModalProps {
    isOpen: boolean;
    onClose: () => void;
    restaurantId: string;
}

export default function ReviewsModal({ isOpen, onClose, restaurantId }: ReviewsModalProps) {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && restaurantId) {
            fetchReviews();
        }
    }, [isOpen, restaurantId]);

    const fetchReviews = async () => {
        setLoading(true);
        try {
            const reviewsRef = collection(db, 'restaurants', restaurantId, 'reviews');
            const q = query(reviewsRef, where('isHidden', '==', false), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
            setReviews(data);
        } catch (error) {
            console.error("Error fetching reviews:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                />
                
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                                <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 leading-tight">Reseñas de Clientes</h3>
                                <p className="text-xs font-bold text-slate-400">{reviews.length} opiniones registradas</p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            className="w-10 h-10 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full flex items-center justify-center transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                                <p className="mt-4 font-bold text-slate-400">Cargando experiencias...</p>
                            </div>
                        ) : reviews.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
                                <MessageSquare className="w-16 h-16 text-slate-200 mb-4" />
                                <p className="font-bold text-slate-400">Aún no hay reseñas para este negocio.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {reviews.map((review) => (
                                    <div key={review.id} className="bg-slate-50 p-5 rounded-3xl border border-slate-100 flex gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-white overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                            {review.userPhoto ? (
                                                <img src={review.userPhoto} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-6 h-6 text-slate-300" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className="font-black text-slate-900 text-sm truncate">{review.userName || 'Usuario Anónimo'}</h4>
                                                <div className="flex items-center gap-0.5">
                                                    {[...Array(5)].map((_, i) => (
                                                        <Star 
                                                            key={i} 
                                                            className={`w-3 h-3 ${i < review.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} 
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-600 font-medium leading-relaxed italic">
                                                "{review.comment}"
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-wider">
                                                {review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString() : 'Reciente'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center shrink-0">
                        <button 
                            onClick={onClose}
                            className="px-8 py-3 bg-white border border-slate-200 text-slate-600 font-black rounded-2xl hover:bg-slate-100 transition-all text-sm uppercase tracking-widest shadow-sm"
                        >
                            Cerrar
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
