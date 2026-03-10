import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, MessageSquare, EyeOff, Eye, Trash2, Clock, CheckCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

export default function ReviewsManager() {
    const { user } = useAuth();
    const [reviews, setReviews] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, avg: 0 });

    const fetchReviews = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const reviewsRef = collection(db, 'restaurants', user.uid, 'reviews');
            const q = query(reviewsRef, orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            setReviews(fetched);

            if (fetched.length > 0) {
                const total = fetched.length;
                const avg = fetched.reduce((acc, r) => acc + r.rating, 0) / total;
                setStats({ total, avg });
            }
        } catch (error) {
            console.error("Error fetching reviews:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReviews();
    }, [user]);

    const toggleVisibility = async (reviewId: string, currentHidden: boolean) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'restaurants', user.uid, 'reviews', reviewId), {
                isHidden: !currentHidden
            });
            setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, isHidden: !currentHidden } : r));
        } catch (error) {
            console.error("Error toggling visibility:", error);
            alert("Hubo un error al actualizar la reseña.");
        }
    };

    const deleteReview = async (reviewId: string) => {
        if (!user) return;
        if (!window.confirm("¿Estás seguro de que quieres eliminar esta reseña permanentemente?")) return;

        try {
            await deleteDoc(doc(db, 'restaurants', user.uid, 'reviews', reviewId));
            setReviews(prev => prev.filter(r => r.id !== reviewId));
            const newReviews = reviews.filter(r => r.id !== reviewId);
            if (newReviews.length > 0) {
                const total = newReviews.length;
                const avg = newReviews.reduce((acc, r) => acc + r.rating, 0) / total;
                setStats({ total, avg });
            } else {
                setStats({ total: 0, avg: 0 });
            }
        } catch (error) {
            console.error("Error deleting review:", error);
            alert("Hubo un error al eliminar la reseña.");
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Reseñas de Clientes</h1>
                    <p className="text-slate-500 text-sm mt-1">Gestiona lo que los clientes dicen sobre tu restaurante</p>
                </div>

                <div className="flex gap-4">
                    <div className="bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                            <Star className="w-5 h-5 text-orange-500 fill-orange-500" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none mb-1">Promedio</p>
                            <p className="font-black text-slate-900 leading-none">{stats.avg.toFixed(1)} <span className="text-xs text-slate-500 font-medium">/ 5</span></p>
                        </div>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                            <MessageSquare className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none mb-1">Total</p>
                            <p className="font-black text-slate-900 leading-none">{stats.total}</p>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="py-20 flex justify-center">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                </div>
            ) : reviews.length > 0 ? (
                <div className="grid gap-4">
                    {reviews.map((review) => (
                        <motion.div
                            key={review.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`bg-white p-5 rounded-2xl border transition-all ${review.isHidden ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100 shadow-sm hover:shadow-md'}`}
                        >
                            <div className="flex flex-col md:flex-row gap-4 mb-4">
                                <div className="flex items-start gap-4 flex-1">
                                    {review.userPhoto ? (
                                        <img src={review.userPhoto} alt={review.userName} className="w-12 h-12 rounded-full object-cover border border-slate-100" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                            <span className="font-bold text-slate-400 text-lg">{review.userName?.[0]?.toUpperCase()}</span>
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="font-bold text-slate-900 text-lg leading-none">{review.userName}</h3>
                                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" />
                                                {review.createdAt ? new Date(review.createdAt.toDate()).toLocaleDateString() : 'Fecha desconocida'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-2">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <Star
                                                    key={star}
                                                    className={`w-4 h-4 ${star <= review.rating ? 'fill-orange-400 text-orange-400' : 'fill-slate-100 text-slate-200'}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 md:border-l md:border-slate-100 md:pl-4 shrink-0">
                                    <button
                                        onClick={() => toggleVisibility(review.id, review.isHidden || false)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${review.isHidden ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        title={review.isHidden ? "Mostrar esta reseña públicamente" : "Ocultar esta reseña del público"}
                                    >
                                        {review.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        {review.isHidden ? 'Oculta (Restaurar)' : 'Pública (Ocultar)'}
                                    </button>
                                    <button
                                        onClick={() => deleteReview(review.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Eliminar reseña permanentemente"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <p className="text-slate-700 leading-relaxed font-medium bg-slate-50 p-4 rounded-xl border border-slate-100/50">"{review.comment}"</p>

                            {review.photos && review.photos.length > 0 && (
                                <div className="mt-4 flex gap-3 overflow-x-auto hide-scrollbar pb-2">
                                    {review.photos.map((photo: string, idx: number) => (
                                        <a key={idx} href={photo} target="_blank" rel="noopener noreferrer" className="shrink-0 group relative rounded-xl overflow-hidden border-2 border-slate-100 hover:border-primary transition-colors block">
                                            <img src={photo} alt="Foto de reseña" className="w-24 h-24 object-cover" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Eye className="w-6 h-6 text-white" />
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            )}

                            {review.isHidden && (
                                <div className="mt-3 flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg text-xs font-bold inline-flex border border-amber-100/50">
                                    <EyeOff className="w-3.5 h-3.5" />
                                    Esta reseña está oculta al público
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>
            ) : (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <MessageSquare className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 mb-2">Aún no hay reseñas</h3>
                    <p className="text-slate-500 max-w-sm">
                        Tus clientes aún no han dejado comentarios después de realizar sus pedidos. Puedes animarlos compartiendo el enlace de tu perfil.
                    </p>
                </div>
            )}
        </div>
    );
}
