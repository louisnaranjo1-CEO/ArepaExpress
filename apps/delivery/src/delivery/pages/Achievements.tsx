import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Trophy, Star, Target, CheckCircle2, Navigation, ArrowLeft, MessageSquare, ThumbsUp, Sparkles, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Achievement {
    id: string;
    title: string;
    description: string;
    targetType: 'trips' | 'stars' | 'time';
    targetValue: number;
    rewardValue: number;
    rewardType: 'points' | 'cash';
    isActive: boolean;
}

interface DriverReview {
    id: string;
    rating: number;
    comment?: string;
    tags?: string[];
    serviceCategory: string;
    clientName: string;
    createdAt: Date;
}

export default function Achievements() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'achievements' | 'reviews'>('achievements');
    const [stats, setStats] = useState({
        totalTrips: 0,
        totalStars: 0
    });
    const [reviews, setReviews] = useState<DriverReview[]>([]);
    const [ratingStats, setRatingStats] = useState({
        average: 5.0,
        totalReviews: 0,
        fiveStars: 0,
        fourStars: 0,
        threeStars: 0,
        twoStars: 0,
        oneStar: 0
    });

    useEffect(() => {
        if (!user) return;

        const fetchAchievements = async () => {
            try {
                const { data } = await supabase
                    .from('achievements')
                    .select('*')
                    .eq('is_active', true);

                if (data) {
                    setAchievements(data.map((d: any) => ({
                        id: d.id,
                        title: d.title,
                        description: d.description,
                        targetType: d.target_type || d.targetType || 'trips',
                        targetValue: d.target_value ?? d.targetValue ?? 0,
                        rewardValue: d.reward_value ?? d.rewardValue ?? 0,
                        rewardType: d.reward_type || d.rewardType || 'cash',
                        isActive: d.is_active ?? d.isActive ?? true
                    })));
                }
            } catch (err) {
                console.error("Error fetching achievements:", err);
            }
        };

        // Calculate driver stats & real-time reviews
        const calculateStats = async () => {
            try {
                // Delivery orders
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('delivery_driver_id', user.uid)
                    .eq('status', 'completed');

                // Transport requests
                const { data: transportData } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .eq('driver_id', user.uid)
                    .eq('status', 'completed');

                const totalTripsCount = (ordersData || []).length + (transportData || []).length;
                
                const allReviewsList: DriverReview[] = [];
                let count5 = 0, count4 = 0, count3 = 0, count2 = 0, count1 = 0;
                let sumRating = 0;

                (ordersData || []).forEach((o: any) => {
                    const r = Number(o.rating);
                    if (r > 0) {
                        sumRating += r;
                        if (r === 5) count5++;
                        else if (r === 4) count4++;
                        else if (r === 3) count3++;
                        else if (r === 2) count2++;
                        else if (r === 1) count1++;

                        allReviewsList.push({
                            id: o.id,
                            rating: r,
                            comment: o.review_comment || o.reviewComment || o.notes,
                            tags: o.review_tags || o.ratingTags || [],
                            serviceCategory: 'delivery',
                            clientName: o.user_name || o.userName || o.customer_name || 'Cliente Tienda/Comida',
                            createdAt: new Date(o.rated_at || o.completed_at || o.created_at || Date.now())
                        });
                    }
                });

                (transportData || []).forEach((t: any) => {
                    const r = Number(t.rating);
                    if (r > 0) {
                        sumRating += r;
                        if (r === 5) count5++;
                        else if (r === 4) count4++;
                        else if (r === 3) count3++;
                        else if (r === 2) count2++;
                        else if (r === 1) count1++;

                        allReviewsList.push({
                            id: t.id,
                            rating: r,
                            comment: t.rating_comment || t.ratingComment || t.comment,
                            tags: t.rating_tags || t.ratingTags || [],
                            serviceCategory: t.service_category || t.vehicle_type || 'taxi',
                            clientName: t.passenger_name || t.passengerName || t.user_name || 'Pasajero',
                            createdAt: new Date(t.rated_at || t.completed_at || t.created_at || Date.now())
                        });
                    }
                });

                allReviewsList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

                const totalReviewsCount = allReviewsList.length;
                const avg = totalReviewsCount > 0 ? Number((sumRating / totalReviewsCount).toFixed(1)) : 5.0;

                setStats({
                    totalTrips: totalTripsCount,
                    totalStars: count5
                });

                setRatingStats({
                    average: avg,
                    totalReviews: totalReviewsCount,
                    fiveStars: count5,
                    fourStars: count4,
                    threeStars: count3,
                    twoStars: count2,
                    oneStar: count1
                });

                setReviews(allReviewsList);
            } catch (error) {
                console.error("Error calculating stats and reviews:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAchievements();
        calculateStats();

        const channel = supabase
            .channel('driver_achievements_and_ratings')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements' }, () => {
                fetchAchievements();
            })
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'transport_requests',
                filter: `driver_id=eq.${user.uid}` 
            }, () => {
                calculateStats();
            })
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'orders',
                filter: `delivery_driver_id=eq.${user.uid}` 
            }, () => {
                calculateStats();
            })
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'drivers',
                filter: `id=eq.${user.uid}` 
            }, () => {
                calculateStats();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    const getProgress = (achievement: Achievement) => {
        let current = 0;
        if (achievement.targetType === 'trips') current = stats.totalTrips;
        if (achievement.targetType === 'stars') current = stats.totalStars;
        if (achievement.targetType === 'time') current = stats.totalTrips; 
        
        return {
            current,
            percentage: Math.min(100, Math.round((current / (achievement.targetValue || 1)) * 100)),
            isCompleted: current >= achievement.targetValue
        };
    };

    const getServiceBadge = (category: string) => {
        switch (category) {
            case 'mototaxi':
            case 'moto':
                return { label: 'Mototaxi', emoji: 'ðŸ›µ', color: 'bg-amber-100 text-amber-800' };
            case 'mandado':
            case 'muchacho_mandado':
                return { label: 'Muchacho e\' Mandao', emoji: 'ðŸ“¦', color: 'bg-orange-100 text-orange-800' };
            case 'encomienda':
                return { label: 'Encomienda', emoji: 'ðŸ“¬', color: 'bg-purple-100 text-purple-800' };
            case 'confort':
                return { label: 'Confort VIP', emoji: 'ðŸš˜', color: 'bg-indigo-100 text-indigo-800' };
            case 'delivery':
                return { label: 'Delivery', emoji: 'ðŸ›ï¸', color: 'bg-emerald-100 text-emerald-800' };
            case 'taxi':
            default:
                return { label: 'Taxi', emoji: 'ðŸš•', color: 'bg-yellow-100 text-yellow-800' };
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20 min-h-screen bg-slate-900">
                <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-24 min-h-screen bg-slate-950 text-slate-100">
            {/* Header */}
            <div className="bg-gradient-to-br from-amber-600 via-slate-900 to-black pt-8 pb-10 px-4 rounded-b-[40px] shadow-2xl relative overflow-hidden border-b border-amber-500/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -ml-20 -mb-20"></div>
                
                <button onClick={() => navigate(-1)} className="relative z-10 flex items-center gap-2 text-white/80 font-bold mb-6 hover:text-white transition-colors active:scale-95">
                    <ArrowLeft className="w-5 h-5" /> Volver al Radar
                </button>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <Trophy className="w-8 h-8 text-amber-400" />
                        <h2 className="text-3xl font-black text-white tracking-tight">Tus Logros y ReputaciÃ³n</h2>
                    </div>
                    <p className="text-amber-200/80 font-medium text-xs sm:text-sm">
                        Monitorea tu calificaciÃ³n oficial, las opiniones de tus clientes y desbloquea bonos.
                    </p>

                    {/* Stats Summary Cards */}
                    <div className="grid grid-cols-2 gap-3 mt-6">
                        <div 
                            onClick={() => setActiveTab('achievements')}
                            className={`rounded-2xl p-4 border transition-all cursor-pointer ${
                                activeTab === 'achievements' 
                                    ? 'bg-white/15 border-amber-400/50 shadow-lg' 
                                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }`}
                        >
                            <p className="text-[10px] font-black text-amber-200 uppercase tracking-widest mb-1">Viajes Totales</p>
                            <p className="text-2xl font-black text-white flex items-center gap-2">
                                <Navigation className="w-5 h-5 text-amber-400" /> {stats.totalTrips}
                            </p>
                        </div>
                        <div 
                            onClick={() => setActiveTab('reviews')}
                            className={`rounded-2xl p-4 border transition-all cursor-pointer ${
                                activeTab === 'reviews' 
                                    ? 'bg-white/15 border-amber-400/50 shadow-lg' 
                                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }`}
                        >
                            <p className="text-[10px] font-black text-amber-200 uppercase tracking-widest mb-1">ReputaciÃ³n Cliente</p>
                            <p className="text-2xl font-black text-white flex items-center gap-1.5">
                                <Star className="w-5 h-5 text-amber-400 fill-amber-400" /> 
                                <span>{ratingStats.average.toFixed(1)}</span>
                                <span className="text-xs text-white/60 font-bold">({ratingStats.totalReviews})</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="px-4 -mt-3 relative z-20">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1 flex gap-1 shadow-lg">
                    <button
                        type="button"
                        onClick={() => setActiveTab('achievements')}
                        className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
                            activeTab === 'achievements'
                                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Trophy className="w-4 h-4" />
                        <span>Misiones y Retos ({achievements.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('reviews')}
                        className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
                            activeTab === 'reviews'
                                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Star className="w-4 h-4" />
                        <span>ReseÃ±as de Clientes ({ratingStats.totalReviews})</span>
                    </button>
                </div>
            </div>

            {/* Tab 1: Achievements List */}
            {activeTab === 'achievements' && (
                <div className="px-4 space-y-4 relative z-20">
                    {achievements.length === 0 ? (
                        <div className="bg-slate-900 rounded-3xl p-8 text-center border border-slate-800">
                            <Target className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                            <h3 className="font-bold text-white text-base">Pronto habrÃ¡ nuevos retos</h3>
                            <p className="text-slate-400 text-xs mt-1">Sigue brindando una gran atenciÃ³n, pronto publicaremos nuevas metas.</p>
                        </div>
                    ) : (
                        achievements.map((achievement) => {
                            const progress = getProgress(achievement);
                            return (
                                <div key={achievement.id} className={`bg-slate-900 rounded-[28px] p-5 border ${progress.isCompleted ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800'}`}>
                                    <div className="flex gap-4 items-start">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${progress.isCompleted ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                            {progress.isCompleted ? <CheckCircle2 className="w-7 h-7" /> : <Trophy className="w-7 h-7" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <h3 className={`font-black text-base leading-tight ${progress.isCompleted ? 'text-emerald-400' : 'text-white'}`}>
                                                    {achievement.title}
                                                </h3>
                                            </div>
                                            <p className="text-xs text-slate-400 font-medium mb-3 leading-snug">
                                                {achievement.description}
                                            </p>

                                            {/* Progress Bar */}
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between items-center text-[10px] font-black tracking-widest uppercase">
                                                    <span className={progress.isCompleted ? 'text-emerald-400' : 'text-slate-400'}>
                                                        {progress.isCompleted ? 'Â¡Completado!' : 'Progreso'}
                                                    </span>
                                                    <span className="text-slate-300">{progress.current} / {achievement.targetValue}</span>
                                                </div>
                                                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-1000 ${progress.isCompleted ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                                        style={{ width: `${progress.percentage}%` }}
                                                    ></div>
                                                </div>
                                            </div>

                                            {/* Reward Badge */}
                                            <div className="mt-3 flex items-center gap-2">
                                                <span className={`text-[10px] uppercase font-black px-3 py-1 rounded-full border ${progress.isCompleted ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400/40' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                                                    Recompensa: {achievement.rewardValue} {achievement.rewardType === 'points' ? 'Puntos' : '$'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Tab 2: Customer Reviews & Reputation */}
            {activeTab === 'reviews' && (
                <div className="px-4 space-y-4 relative z-20">
                    {/* Overall Score Card */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 rounded-[28px] p-5 border border-slate-800 shadow-xl space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                                    Puntaje General
                                </span>
                                <div className="flex items-baseline gap-2 mt-0.5">
                                    <span className="text-4xl font-black text-white">{ratingStats.average.toFixed(1)}</span>
                                    <span className="text-slate-400 text-xs font-bold">/ 5.0</span>
                                </div>
                                <div className="flex items-center gap-1 text-amber-400 mt-1">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <Star
                                            key={s}
                                            className={`w-4 h-4 ${
                                                s <= Math.round(ratingStats.average)
                                                    ? 'fill-amber-400 text-amber-400'
                                                    : 'text-slate-600'
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="p-3 bg-amber-400/10 border border-amber-400/30 rounded-2xl">
                                    <p className="text-lg font-black text-amber-400">{ratingStats.totalReviews}</p>
                                    <p className="text-[9px] uppercase font-bold text-slate-400">Opiniones</p>
                                </div>
                            </div>
                        </div>

                        {/* Breakdown Bars */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
                            {[
                                { star: 5, count: ratingStats.fiveStars },
                                { star: 4, count: ratingStats.fourStars },
                                { star: 3, count: ratingStats.threeStars },
                                { star: 2, count: ratingStats.twoStars },
                                { star: 1, count: ratingStats.oneStar },
                            ].map((row) => {
                                const pct = ratingStats.totalReviews > 0 ? (row.count / ratingStats.totalReviews) * 100 : 0;
                                return (
                                    <div key={row.star} className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-slate-400 w-6 flex items-center gap-0.5">
                                            {row.star}<Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                        </span>
                                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-400 w-6 text-right">{row.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Reviews List */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-black text-slate-300 px-1 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-amber-400" />
                            Comentarios Recientes de Pasajeros y Clientes
                        </h3>

                        {reviews.length === 0 ? (
                            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-2">
                                <Sparkles className="w-10 h-10 text-amber-400 mx-auto opacity-70" />
                                <h4 className="font-bold text-white text-sm">AÃºn no hay reseÃ±as registradas</h4>
                                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                                    Cada vez que completes un viaje o mandado con buena atenciÃ³n, los clientes calificarÃ¡n su experiencia y aparecerÃ¡ aquÃ­.
                                </p>
                            </div>
                        ) : (
                            reviews.map((rev) => {
                                const srv = getServiceBadge(rev.serviceCategory);
                                return (
                                    <div
                                        key={rev.id}
                                        className="bg-slate-900 border border-slate-800/90 rounded-2xl p-4 space-y-2.5 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                                                    <User className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="font-black text-white text-xs leading-none">
                                                        {rev.clientName}
                                                    </p>
                                                    <span className="text-[10px] text-slate-500 mt-0.5 block font-medium">
                                                        {rev.createdAt.toLocaleDateString()} â€¢ {rev.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${srv.color} inline-flex items-center gap-1`}>
                                                    <span>{srv.emoji}</span>
                                                    <span>{srv.label}</span>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Stars */}
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                                <Star
                                                    key={s}
                                                    className={`w-3.5 h-3.5 ${
                                                        s <= rev.rating
                                                            ? 'fill-amber-400 text-amber-400'
                                                            : 'text-slate-700'
                                                    }`}
                                                />
                                            ))}
                                            <span className="text-xs font-black text-amber-300 ml-1">
                                                {rev.rating}.0
                                            </span>
                                        </div>

                                        {/* Tags */}
                                        {rev.tags && rev.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-1">
                                                {rev.tags.map((tag, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-amber-200 border border-slate-700"
                                                    >
                                                        {tag.replace(/_/g, ' ')}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Written Comment */}
                                        {rev.comment ? (
                                            <p className="text-xs text-slate-300 font-medium italic bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 leading-relaxed">
                                                "{rev.comment}"
                                            </p>
                                        ) : (
                                            <p className="text-[11px] text-slate-500 italic">
                                                CalificaciÃ³n sin comentario escrito.
                                            </p>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
