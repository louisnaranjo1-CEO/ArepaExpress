import React, { useState, useEffect } from 'react';
import { Gift, Sparkles, Users, Award, TrendingUp, Search, User as UserIcon, Loader2, ChevronRight, Star, Heart, ShoppingBag } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, doc, getDoc, where, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface LoyalClient {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    photoURL?: string;
    points: number;
    totalOrdersAtRestaurant: number;
    lastOrderDate: any;
}

export default function Fidelization() {
    const { user } = useAuth();
    const [loyalClients, setLoyalClients] = useState<LoyalClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [pointRatio, setPointRatio] = useState(2.5);
    const [stats, setStats] = useState({
        totalPointsAwarded: 0,
        avgPointsPerClient: 0,
        activeCampaigns: 0
    });

    useEffect(() => {
        if (!user) return;
        fetchFidelizationData();
    }, [user]);

    const fetchFidelizationData = async () => {
        try {
            setLoading(true);

            // 1. Fetch Point Ratio from config
            const configSnap = await getDoc(doc(db, 'system_configs', 'fidelization'));
            if (configSnap.exists()) {
                // In a real app, ratio might be here, if not we use 2.5
                // setPointRatio(configSnap.data().ratio || 2.5);
            }

            // 2. Fetch active global contests to show what's ongoing
            const contestsSnap = await getDocs(query(collection(db, 'referral_contests'), where('isActive', '==', true)));
            const activeContestsCount = contestsSnap.size;

            // 3. Identify unique clients from orders
            const ordersRef = collection(db, 'orders');
            const q = query(ordersRef, where('restaurantId', '==', user!.uid), orderBy('createdAt', 'desc'));
            const ordersSnap = await getDocs(q);

            const clientMap = new Map<string, { lastOrder: any, count: number }>();
            let totalRestaurantOrdersValue = 0;

            ordersSnap.docs.forEach(orderDoc => {
                const data = orderDoc.data();
                const userId = data.userId;
                if (!userId) return;

                totalRestaurantOrdersValue += (data.total || 0);

                if (!clientMap.has(userId)) {
                    clientMap.set(userId, {
                        lastOrder: data.createdAt,
                        count: 1
                    });
                } else {
                    const existing = clientMap.get(userId)!;
                    clientMap.set(userId, {
                        ...existing,
                        count: existing.count + 1
                    });
                }
            });

            // 4. Fetch details for top clients
            const fullClientList: LoyalClient[] = [];
            let totalPointsAccumulated = 0;

            for (const [userId, stats] of clientMap.entries()) {
                const userRef = doc(db, 'users', userId);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    const userPoints = userData.points || 0;
                    totalPointsAccumulated += userPoints;

                    fullClientList.push({
                        id: userId,
                        name: userData.displayName || userData.name || 'Cliente sin nombre',
                        email: userData.email,
                        phone: userData.phone,
                        photoURL: userData.photoURL || userData.image,
                        points: userPoints,
                        totalOrdersAtRestaurant: stats.count,
                        lastOrderDate: stats.lastOrder
                    });
                }
            }

            // Sort by points descending
            const sortedByPoints = [...fullClientList].sort((a, b) => b.points - a.points);

            setLoyalClients(sortedByPoints);
            setStats({
                totalPointsAwarded: Math.round(totalRestaurantOrdersValue * pointRatio),
                avgPointsPerClient: fullClientList.length > 0 ? Math.round(totalPointsAccumulated / fullClientList.length) : 0,
                activeCampaigns: activeContestsCount
            });

        } catch (error) {
            console.error("Error fetching fidelization data:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredClients = loyalClients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-slate-500 font-bold italic">Analizando lealtad de clientes...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header section */}
            <div className="relative overflow-hidden bg-slate-900 rounded-[3rem] p-8 md:p-12 text-white">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -ml-10 -mb-10"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-4 max-w-xl">
                        <div className="inline-flex items-center gap-2 bg-primary/20 text-primary-light px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border border-primary/20 backdrop-blur-md">
                            <Sparkles className="w-4 h-4" /> Fidelización y Recompensas
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black leading-tight italic">
                            Haz que tus clientes <span className="text-primary italic">vuelvan siempre.</span>
                        </h1>
                        <p className="text-slate-400 font-medium">
                            En Arepa Express, premiamos la fidelidad. Tus clientes ganan <span className="text-white font-bold">{pointRatio} puntos por cada $1</span> gastado en tu negocio.
                        </p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-[2.5rem] flex items-center gap-6">
                        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <Star className="w-8 h-8 text-white fill-white" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ratio Actual</p>
                            <p className="text-3xl font-black text-white">{pointRatio} <span className="text-lg opacity-50">Pts / $</span></p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-5">
                    <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shrink-0">
                        <Award className="w-7 h-7" />
                    </div>
                    <div>
                        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Puntos Otorgados</h3>
                        <p className="text-2xl font-black text-slate-800">~{stats.totalPointsAwarded.toLocaleString()}</p>
                        <p className="text-[10px] text-emerald-500 font-bold">Impulsando ventas</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shrink-0">
                        <TrendingUp className="w-7 h-7" />
                    </div>
                    <div>
                        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Promedio Pts/Cliente</h3>
                        <p className="text-2xl font-black text-slate-800">{stats.avgPointsPerClient.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400 font-bold italic">Lealtad media</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-5">
                    <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
                        <Gift className="w-7 h-7" />
                    </div>
                    <div>
                        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Campañas Activas</h3>
                        <p className="text-2xl font-black text-slate-800">{stats.activeCampaigns}</p>
                        <p className="text-[10px] text-slate-400 font-bold italic">Globales de Arepa Express</p>
                    </div>
                </div>
            </div>

            {/* Ranking of Loyal Customers */}
            <div className="bg-white rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 mb-1">Ranking de Clientes Fieles</h2>
                        <p className="text-sm font-medium text-slate-400 italic">Los clientes con más puntos acumulados en la plataforma.</p>
                    </div>

                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar en el ranking..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 p-3 pl-10 rounded-2xl outline-none focus:border-primary transition-all font-bold text-slate-700 text-sm shadow-inner"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">Posición</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">Cliente</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic text-center">Pedidos Aquí</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic text-center">Puntos Totales</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic text-center">Nivel de Lealtad</th>
                                <th className="p-6"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredClients.map((client, index) => (
                                <tr key={client.id} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="p-6">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${index === 0 ? 'bg-amber-400 text-white shadow-lg shadow-amber-400/30' :
                                                index === 1 ? 'bg-slate-300 text-white' :
                                                    index === 2 ? 'bg-orange-300 text-white' : 'bg-slate-100 text-slate-400'
                                            }`}>
                                            {index + 1}
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                                {client.photoURL ? (
                                                    <img src={client.photoURL} alt={client.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                        <UserIcon className="w-6 h-6" />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-800 truncate max-w-[150px]">{client.name}</p>
                                                <p className="text-[10px] text-slate-400 font-bold italic">{client.phone || client.email || 'Sin datos'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6 text-center">
                                        <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-xs font-black text-slate-600">
                                            <ShoppingBag className="w-3 h-3 text-primary" /> {client.totalOrdersAtRestaurant}
                                        </div>
                                    </td>
                                    <td className="p-6 text-center">
                                        <div className="text-lg font-black text-indigo-600 drop-shadow-sm">
                                            {client.points.toLocaleString()} <span className="text-[10px] opacity-40">Pts</span>
                                        </div>
                                    </td>
                                    <td className="p-6 text-center">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${client.points > 1000 ? 'bg-purple-100 text-purple-600' :
                                                client.points > 500 ? 'bg-blue-100 text-blue-600' :
                                                    'bg-slate-100 text-slate-400'
                                            }`}>
                                            {client.points > 1000 ? 'Leyenda ✨' : client.points > 500 ? 'Frecuente 💎' : 'Nuevo 🚀'}
                                        </span>
                                    </td>
                                    <td className="p-6 text-right">
                                        <button className="p-2 text-slate-300 hover:text-primary transition-colors">
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredClients.length === 0 && (
                        <div className="p-12 text-center">
                            <Star className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                            <p className="text-slate-400 font-bold italic">Aún no tienes clientes calificados para el ranking.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer / Call to Action info */}
            <div className="bg-emerald-500 rounded-[3rem] p-8 md:p-12 text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl shadow-emerald-500/20 italic">
                <div className="space-y-2 text-center md:text-left">
                    <h3 className="text-2xl md:text-3xl font-black">¿Quieres premiar más a tus clientes?</h3>
                    <p className="text-emerald-100 font-medium">Pronto podrás crear campañas personalizadas exclusivas para tu restaurante.</p>
                </div>
                <button className="bg-white text-emerald-600 px-8 py-4 rounded-2xl font-black hover:scale-105 active:scale-95 transition-all shadow-xl shadow-black/10">
                    Saber Más
                </button>
            </div>
        </div>
    );
}
