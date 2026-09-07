import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { Trophy, Star, Target, CheckCircle2, Navigation, ArrowLeft } from 'lucide-react';
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

export default function Achievements() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalTrips: 0,
        totalStars: 0
    });

    useEffect(() => {
        if (!user) return;

        // Fetch active achievements
        const qAchievements = query(
            collection(db, 'achievements'),
            where('isActive', '==', true)
        );

        const unsubAchievements = onSnapshot(qAchievements, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Achievement));
            setAchievements(items);
        });

        // Calculate driver stats
        const calculateStats = async () => {
            try {
                // Delivery orders
                const qOrders = query(collection(db, 'orders'), where('deliveryDriverId', '==', user.uid), where('status', '==', 'completed'));
                const ordersSnap = await getDocs(qOrders);
                let trips = ordersSnap.size;
                let fiveStarsCount = 0;
                ordersSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.rating === 5) fiveStarsCount++;
                });

                // Transport requests
                const qTransport = query(collection(db, 'transport_requests'), where('driverId', '==', user.uid), where('status', '==', 'completed'));
                const transportSnap = await getDocs(qTransport);
                trips += transportSnap.size;
                transportSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.rating === 5) fiveStarsCount++;
                });

                setStats({
                    totalTrips: trips,
                    totalStars: fiveStarsCount
                });
            } catch (error) {
                console.error("Error calculating stats:", error);
            } finally {
                setLoading(false);
            }
        };

        calculateStats();

        return () => unsubAchievements();
    }, [user]);

    const getProgress = (achievement: Achievement) => {
        let current = 0;
        if (achievement.targetType === 'trips') current = stats.totalTrips;
        if (achievement.targetType === 'stars') current = stats.totalStars;
        // time is hard to calculate historically without complex logic, will default to trips logic for now
        if (achievement.targetType === 'time') current = stats.totalTrips; 
        
        return {
            current,
            percentage: Math.min(100, Math.round((current / achievement.targetValue) * 100)),
            isCompleted: current >= achievement.targetValue
        };
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-24 min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black pt-8 pb-12 px-4 rounded-b-[40px] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl -ml-20 -mb-20"></div>
                
                <button onClick={() => navigate(-1)} className="relative z-10 flex items-center gap-2 text-white/80 font-bold mb-6 hover:text-white transition-colors">
                    <ArrowLeft className="w-5 h-5" /> Volver
                </button>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <Trophy className="w-8 h-8 text-yellow-400" />
                        <h2 className="text-3xl font-black text-white tracking-tight">Tus Logros</h2>
                    </div>
                    <p className="text-indigo-200 font-medium">Completa misiones y obtén recompensas exclusivas.</p>

                    <div className="flex gap-4 mt-8">
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex-1 border border-white/10">
                            <p className="text-xs font-black text-white/50 uppercase tracking-widest mb-1">Viajes Totales</p>
                            <p className="text-2xl font-black text-white flex items-center gap-2">
                                <Navigation className="w-5 h-5 text-primary" /> {stats.totalTrips}
                            </p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex-1 border border-white/10">
                            <p className="text-xs font-black text-white/50 uppercase tracking-widest mb-1">Reseñas 5⭐</p>
                            <p className="text-2xl font-black text-white flex items-center gap-2">
                                <Star className="w-5 h-5 text-yellow-400" /> {stats.totalStars}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Achievements List */}
            <div className="px-4 space-y-4 -mt-6 relative z-20">
                {achievements.length === 0 ? (
                    <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-100">
                        <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="font-bold text-slate-800 text-lg">Pronto habrá nuevos retos</h3>
                        <p className="text-slate-500 text-sm mt-1">Sigue trabajando excelente, pronto publicaremos nuevas metas.</p>
                    </div>
                ) : (
                    achievements.map((achievement) => {
                        const progress = getProgress(achievement);
                        return (
                            <div key={achievement.id} className={`bg-white rounded-[28px] p-5 shadow-sm border ${progress.isCompleted ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100'}`}>
                                <div className="flex gap-4 items-start">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${progress.isCompleted ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        {progress.isCompleted ? <CheckCircle2 className="w-7 h-7" /> : <Trophy className="w-7 h-7" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className={`font-black text-lg leading-tight ${progress.isCompleted ? 'text-emerald-900' : 'text-slate-800'}`}>
                                                {achievement.title}
                                            </h3>
                                        </div>
                                        <p className="text-sm text-slate-500 font-medium mb-4 leading-snug">
                                            {achievement.description}
                                        </p>

                                        {/* Progress Bar */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-[10px] font-black tracking-widest uppercase">
                                                <span className={progress.isCompleted ? 'text-emerald-600' : 'text-slate-400'}>
                                                    {progress.isCompleted ? '¡Logro Completado!' : 'Progreso'}
                                                </span>
                                                <span className="text-slate-600">{progress.current} / {achievement.targetValue}</span>
                                            </div>
                                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full transition-all duration-1000 ${progress.isCompleted ? 'bg-emerald-500' : 'bg-primary'}`}
                                                    style={{ width: `${progress.percentage}%` }}
                                                ></div>
                                            </div>
                                        </div>

                                        {/* Reward Badge */}
                                        <div className="mt-4 flex items-center gap-2">
                                            <span className={`text-[10px] uppercase font-black px-3 py-1.5 rounded-full border ${progress.isCompleted ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
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
        </div>
    );
}
