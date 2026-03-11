import React, { useState, useEffect } from 'react';
import { Gift, Sparkles, Award, TrendingUp, Search, User as UserIcon, Loader2, ChevronRight, Star, ShoppingBag, Plus, Filter, X, CheckCircle2, MessageSquare, Bell, Users } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, doc, getDoc, where, orderBy, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
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
    gender?: string;
    age?: number;
}

interface Product {
    id: string;
    name: string;
    category: string;
}

interface ContestWinner {
    userId: string;
    name: string;
    phone?: string;
}

interface Contest {
    id: string;
    title: string;
    prize: string;
    winnersCount: number;
    filters: {
        productId: string;
        minAge: string;
        maxAge: string;
        gender: string;
        minPurchase: string;
    };
    winners: ContestWinner[];
    createdAt: any;
    whatsappMessage: string;
}

export default function Fidelization() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'ranking' | 'contests'>('ranking');

    // Ranking State
    const [loyalClients, setLoyalClients] = useState<LoyalClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [pointRatio, setPointRatio] = useState(2.5);
    const [stats, setStats] = useState({
        totalPointsAwarded: 0,
        avgPointsPerClient: 0,
        activeCampaigns: 0
    });

    // Contests State
    const [contests, setContests] = useState<Contest[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [isContestModalOpen, setIsContestModalOpen] = useState(false);
    const [runningContest, setRunningContest] = useState(false);

    // Form State
    const [contestForm, setContestForm] = useState({
        title: '',
        prize: '',
        winnersCount: '1',
        filters: {
            productId: 'all',
            minAge: '',
            maxAge: '',
            gender: 'all',
            minPurchase: '0'
        },
        whatsappMessage: '¡Hola! 🎉 Has sido seleccionado como ganador de nuestro sorteo. ¡Felicidades! 🎁'
    });

    // Active Results State
    const [recentWinners, setRecentWinners] = useState<ContestWinner[] | null>(null);

    useEffect(() => {
        if (!user) return;
        fetchFidelizationData();
    }, [user]);

    const fetchFidelizationData = async () => {
        try {
            setLoading(true);

            // 1. Fetch Ranking Data
            const ordersRef = collection(db, 'orders');
            const qOrders = query(ordersRef, where('restaurantId', '==', user!.uid), orderBy('createdAt', 'desc'));
            const ordersSnap = await getDocs(qOrders);

            const clientMap = new Map<string, { lastOrder: any, count: number }>();
            let totalRestaurantOrdersValue = 0;

            ordersSnap.docs.forEach(orderDoc => {
                const data = orderDoc.data();
                const userId = data.userId;
                if (!userId) return;

                totalRestaurantOrdersValue += (data.total || 0);

                if (!clientMap.has(userId)) {
                    clientMap.set(userId, { lastOrder: data.createdAt, count: 1 });
                } else {
                    const existing = clientMap.get(userId)!;
                    clientMap.set(userId, { ...existing, count: existing.count + 1 });
                }
            });

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
                        lastOrderDate: stats.lastOrder,
                        gender: userData.gender,
                        age: userData.age
                    });
                }
            }

            const sortedByPoints = [...fullClientList].sort((a, b) => b.points - a.points);
            setLoyalClients(sortedByPoints);
            setStats(s => ({
                ...s,
                totalPointsAwarded: Math.round(totalRestaurantOrdersValue * pointRatio),
                avgPointsPerClient: fullClientList.length > 0 ? Math.round(totalPointsAccumulated / fullClientList.length) : 0
            }));

            // 2. Fetch Restaurant's Products
            const productsRef = collection(db, 'restaurants', user!.uid, 'products');
            const productsSnap = await getDocs(productsRef);
            const prods: Product[] = [];
            productsSnap.forEach(doc => {
                prods.push({ id: doc.id, name: doc.data().name, category: doc.data().category });
            });
            setProducts(prods);

            // 3. Fetch Past Contests
            const contestsRef = collection(db, 'restaurants', user!.uid, 'restaurant_contests');
            const qContests = query(contestsRef, orderBy('createdAt', 'desc'));
            const contestsSnap = await getDocs(qContests);
            const fetchedContests: Contest[] = [];
            contestsSnap.forEach(doc => {
                fetchedContests.push({ id: doc.id, ...doc.data() } as Contest);
            });
            setContests(fetchedContests);

        } catch (error) {
            console.error("Error fetching fidelization data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateContest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setRunningContest(true);
        setRecentWinners(null);

        try {
            // STEP 1: Find eligible orders based on filters
            const minPurchase = parseFloat(contestForm.filters.minPurchase) || 0;

            const ordersRef = collection(db, 'orders');
            const qOrders = query(ordersRef, where('restaurantId', '==', user.uid));
            const ordersSnap = await getDocs(qOrders);

            let eligibleUserIds = new Set<string>();

            ordersSnap.docs.forEach(docSnap => {
                const data = docSnap.data();
                const userId = data.userId;
                if (!userId) return;

                // Validate minimum purchase
                if (data.total < minPurchase) return;

                // Validate product if specific product selected
                if (contestForm.filters.productId !== 'all') {
                    const items = data.items || [];
                    const hasProduct = items.some((item: any) => item.id === contestForm.filters.productId);
                    if (!hasProduct) return;
                }

                eligibleUserIds.add(userId);
            });

            // STEP 2: Filter by User Demographics (Age, Gender)
            let finalEligibleCandidates: { id: string, name: string, phone: string }[] = [];

            const minAge = parseInt(contestForm.filters.minAge);
            const maxAge = parseInt(contestForm.filters.maxAge);
            const targetGender = contestForm.filters.gender;

            for (const userId of Array.from(eligibleUserIds)) {
                // To avoid multiple DB calls, we can reuse loyalClients if the user has ordered before
                let knownClient = loyalClients.find(c => c.id === userId);

                let checkAge = knownClient?.age;
                let checkGender = knownClient?.gender;

                // If not in loyalClients (unlikely if they just ordered, but possible), or missing demographic, we fetch
                if (!knownClient || checkAge === undefined || checkGender === undefined) {
                    const uSnap = await getDoc(doc(db, 'users', userId));
                    if (uSnap.exists()) {
                        const uData = uSnap.data();
                        checkAge = uData.age;
                        checkGender = uData.gender;

                        if (!knownClient) {
                            knownClient = {
                                id: userId,
                                name: uData.displayName || uData.name || 'Usuario',
                                phone: uData.phone || '',
                                points: 0, totalOrdersAtRestaurant: 1, lastOrderDate: null
                            };
                        } else {
                            knownClient.phone = knownClient.phone || uData.phone;
                        }
                    }
                }

                // Apply Age Filter
                if (!isNaN(minAge) && (!checkAge || checkAge < minAge)) continue;
                if (!isNaN(maxAge) && (!checkAge || checkAge > maxAge)) continue;

                // Apply Gender Filter
                if (targetGender !== 'all' && checkGender !== targetGender) continue;

                if (knownClient) {
                    finalEligibleCandidates.push({
                        id: knownClient.id,
                        name: knownClient.name,
                        phone: knownClient.phone || ''
                    });
                }
            }

            if (finalEligibleCandidates.length === 0) {
                alert("Ningún cliente cumple con todos los filtros establecidos. Intenta ampliar tu búsqueda.");
                setRunningContest(false);
                return;
            }

            // STEP 3: Select Random Winners
            const winnersCount = parseInt(contestForm.winnersCount) || 1;
            const shuffled = finalEligibleCandidates.sort(() => 0.5 - Math.random());
            const selectedWinners = shuffled.slice(0, winnersCount).map(c => ({
                userId: c.id,
                name: c.name,
                phone: c.phone
            }));

            // STEP 4: Save Contest to Database
            const resSnap = await getDoc(doc(db, 'restaurants', user.uid));
            const restaurantName = resSnap.data()?.name || 'El Restaurante';

            const contestData = {
                title: contestForm.title,
                prize: contestForm.prize,
                winnersCount: winnersCount,
                filters: contestForm.filters,
                winners: selectedWinners,
                whatsappMessage: contestForm.whatsappMessage,
                createdAt: serverTimestamp()
            };

            const contestsRef = collection(db, 'restaurants', user.uid, 'restaurant_contests');
            const newContestRef = await addDoc(contestsRef, contestData);

            // STEP 5: Send In-App Notifications
            for (const winner of selectedWinners) {
                await addDoc(collection(db, 'notifications'), {
                    userId: winner.userId,
                    restaurantId: user.uid,
                    title: `¡Ganaste en ${restaurantName}! 🎉`,
                    body: `Has sido seleccionado como ganador del sorteo "${contestForm.title}". El premio es: ${contestForm.prize}. ¡Felicidades!`,
                    read: false,
                    createdAt: serverTimestamp()
                });
            }

            // Update local state
            setRecentWinners(selectedWinners);
            setContests([{ id: newContestRef.id, ...contestData, createdAt: new Date() } as Contest, ...contests]);

            // Success
            setIsContestModalOpen(false);

        } catch (error) {
            console.error("Error executing contest:", error);
            alert("Ocurrió un error al realizar el sorteo.");
        } finally {
            setRunningContest(false);
        }
    };

    const getWhatsAppUrl = (phone: string, message: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
        return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    };

    const filteredClients = loyalClients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-slate-500 font-bold italic">Cargando datos de clientes...</p>
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
                            <Sparkles className="w-4 h-4" /> Lealtad y Premios
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black leading-tight italic">
                            Haz que tus clientes <span className="text-primary italic">vuelvan siempre.</span>
                        </h1>
                        <p className="text-slate-400 font-medium">
                            Premiar a tu comunidad aumenta las ventas. Ganan <span className="text-white font-bold">{pointRatio} puntos por cada $1</span> o prémialos directamente.
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => setActiveTab('ranking')}
                            className={`px-6 py-4 rounded-[2rem] font-black transition-all shadow-xl flex items-center gap-2 ${activeTab === 'ranking' ? 'bg-primary text-white shadow-primary/20 scale-105' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                        >
                            <UserIcon className="w-5 h-5" /> Ranking
                        </button>
                        <button
                            onClick={() => setActiveTab('contests')}
                            className={`px-6 py-4 rounded-[2rem] font-black transition-all shadow-xl flex items-center gap-2 ${activeTab === 'contests' ? 'bg-indigo-500 text-white shadow-indigo-500/20 scale-105' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                        >
                            <Gift className="w-5 h-5" /> Sorteos
                        </button>
                    </div>
                </div>
            </div>

            {/* Quick Metrics (Only show on Ranking tab for cleanliness) */}
            {activeTab === 'ranking' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4">
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-5">
                        <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shrink-0">
                            <Award className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Puntos Otorgados</h3>
                            <p className="text-2xl font-black text-slate-800">~{stats.totalPointsAwarded.toLocaleString()}</p>
                            <p className="text-[10px] text-emerald-500 font-bold">Incentivando compras</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-5">
                        <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shrink-0">
                            <TrendingUp className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Promedio Pts/Cliente</h3>
                            <p className="text-2xl font-black text-slate-800">{stats.avgPointsPerClient.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-400 font-bold italic">Lealtad media del local</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-5">
                        <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
                            <Gift className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Sorteos Realizados</h3>
                            <p className="text-2xl font-black text-slate-800">{contests.length}</p>
                            <p className="text-[10px] text-slate-400 font-bold italic">Propios del negocio</p>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: RANKING */}
            {activeTab === 'ranking' && (
                <div className="bg-white rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                    <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 mb-1">Ranking de Clientes</h2>
                            <p className="text-sm font-medium text-slate-400 italic">Los clientes más frecuentes y con más puntos.</p>
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
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">Pos.</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">Cliente</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic text-center">Pedidos Aquí</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic text-center">Puntos Totales</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic text-center">Nivel</th>
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
            )}

            {/* TAB: CONTESTS */}
            {activeTab === 'contests' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800">Sorteos de tu Local</h2>
                            <p className="text-slate-500 font-medium text-sm">Premia aleatoriamente a clientes que cumplan tus requisitos.</p>
                        </div>
                        <button
                            onClick={() => setIsContestModalOpen(true)}
                            className="bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-indigo-600/30 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            <Gift className="w-5 h-5" /> Iniciar Sorteo
                        </button>
                    </div>

                    {/* Show recent winners immediately after a contest runs */}
                    {recentWinners && (
                        <div className="bg-emerald-50 rounded-[3rem] p-8 md:p-12 border-2 border-emerald-100 animate-in zoom-in-95 duration-500">
                            <div className="text-center mb-8">
                                <span className="bg-emerald-100 text-emerald-600 font-black px-4 py-2 rounded-full uppercase tracking-widest text-xs inline-block mb-4">¡Sorteo Finalizado Exitosamente!</span>
                                <h3 className="text-4xl font-black text-slate-800 italic">Tenemos {recentWinners.length === 1 ? 'Un Ganador' : 'Ganadores'}</h3>
                                <p className="text-emerald-700 font-medium mt-2">Los ganadores han recibido una notificación en su aplicación.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                                {recentWinners.map((w, idx) => (
                                    <div key={idx} className="bg-white p-6 rounded-[2rem] shadow-xl shadow-emerald-900/5 flex flex-col items-center text-center relative overflow-hidden">
                                        <div className="absolute top-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-teal-400"></div>
                                        <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center font-black text-2xl mb-4 shadow-inner">
                                            {w.name.charAt(0).toUpperCase()}
                                        </div>
                                        <h4 className="font-black text-slate-800 text-lg mb-1">{w.name}</h4>
                                        <p className="text-sm font-bold text-slate-400 italic mb-4">{w.phone || 'Sin número registrado'}</p>

                                        <a
                                            href={w.phone ? getWhatsAppUrl(w.phone, contestForm.whatsappMessage) : '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => !w.phone && e.preventDefault()}
                                            className={`w-full py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-transform active:scale-95 ${w.phone ? 'bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                        >
                                            <MessageSquare className="w-5 h-5" /> Enviar Mensaje
                                        </a>
                                    </div>
                                ))}
                            </div>
                            <div className="text-center">
                                <button onClick={() => setRecentWinners(null)} className="text-slate-500 font-black hover:text-slate-800 transition-colors">Volver al historial</button>
                            </div>
                        </div>
                    )}

                    {/* History */}
                    {!recentWinners && (
                        <div className="grid grid-cols-1 gap-4">
                            {contests.length === 0 ? (
                                <div className="p-12 text-center bg-white border border-slate-100 rounded-[3rem]">
                                    <Gift className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                    <p className="text-slate-400 font-bold italic">No has realizado sorteos recientemente.</p>
                                </div>
                            ) : (
                                contests.map(c => (
                                    <div key={c.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-xl hover:shadow-slate-200/50 transition-all">
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shrink-0">
                                                <Award className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-slate-800">{c.title}</h4>
                                                <p className="text-sm font-bold text-slate-500 mb-2">Premio: <span className="text-indigo-600">{c.prize}</span></p>
                                                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
                                                    <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">Filtros:</span>
                                                    {c.filters.productId !== 'all' && <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-lg">Por Producto</span>}
                                                    {parseFloat(c.filters.minPurchase) > 0 && <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg">Min ${c.filters.minPurchase}</span>}
                                                    {c.filters.gender !== 'all' && <span className="bg-purple-50 text-purple-600 px-2 py-1 rounded-lg">Sexo: {c.filters.gender}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 p-4 rounded-2xl min-w-[200px]">
                                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-200 pb-2">Ganadores</h5>
                                            <div className="space-y-2">
                                                {c.winners.map((w, i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                        <span className="text-sm font-black text-slate-700 truncate">{w.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* CREATION MODAL */}
            {isContestModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !runningContest && setIsContestModalOpen(false)}></div>
                    <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
                            <div>
                                <h2 className="text-2xl font-black text-indigo-900">Crear Sorteo</h2>
                                <p className="text-indigo-600/70 text-sm font-bold">Selecciona aleatoriamente entre los clientes que cumplen los filtros.</p>
                            </div>
                            <button onClick={() => !runningContest && setIsContestModalOpen(false)} className="p-2 text-indigo-400 hover:bg-white rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateContest} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Título del Sorteo</label>
                                    <input
                                        type="text" required
                                        placeholder="Ej: Sorteo de San Valentín"
                                        value={contestForm.title} onChange={e => setContestForm({ ...contestForm, title: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 p-4 rounded-2xl outline-none font-bold text-slate-700"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Premio a entregar</label>
                                    <input
                                        type="text" required
                                        placeholder="Ej: 1 Pizza Familiar"
                                        value={contestForm.prize} onChange={e => setContestForm({ ...contestForm, prize: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 p-4 rounded-2xl outline-none font-bold text-slate-700"
                                    />
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
                                    <Filter className="w-4 h-4 text-indigo-500" /> Filtros de Participación
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Producto Específico (Opcional)</label>
                                        <select
                                            value={contestForm.filters.productId} onChange={e => setContestForm({ ...contestForm, filters: { ...contestForm.filters, productId: e.target.value } })}
                                            className="w-full bg-white border border-slate-200 focus:border-indigo-500 p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
                                        >
                                            <option value="all">Participan compras de cualquier producto</option>
                                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Sexo del Cliente</label>
                                        <select
                                            value={contestForm.filters.gender} onChange={e => setContestForm({ ...contestForm, filters: { ...contestForm.filters, gender: e.target.value } })}
                                            className="w-full bg-white border border-slate-200 focus:border-indigo-500 p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
                                        >
                                            <option value="all">Todos</option>
                                            <option value="M">Masculino</option>
                                            <option value="F">Femenino</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Venta Mínima Acumulada ($)</label>
                                        <input
                                            type="number" step="0.01" min="0" placeholder="0"
                                            value={contestForm.filters.minPurchase} onChange={e => setContestForm({ ...contestForm, filters: { ...contestForm.filters, minPurchase: e.target.value } })}
                                            className="w-full bg-white border border-slate-200 focus:border-indigo-500 p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="space-y-1 flex-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Edad Min.</label>
                                            <input
                                                type="number" min="0" placeholder="0"
                                                value={contestForm.filters.minAge} onChange={e => setContestForm({ ...contestForm, filters: { ...contestForm.filters, minAge: e.target.value } })}
                                                className="w-full bg-white border border-slate-200 focus:border-indigo-500 p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1 flex-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Edad Max.</label>
                                            <input
                                                type="number" min="0" placeholder="100"
                                                value={contestForm.filters.maxAge} onChange={e => setContestForm({ ...contestForm, filters: { ...contestForm.filters, maxAge: e.target.value } })}
                                                className="w-full bg-white border border-slate-200 focus:border-indigo-500 p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-3 italic font-bold text-center">Nota: Los filtros de edad y sexo dependerán de si el usuario ha completado esos datos en su perfil.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                        <Users className="w-3 h-3" /> Cantidad de Ganadores
                                    </label>
                                    <select
                                        value={contestForm.winnersCount} onChange={e => setContestForm({ ...contestForm, winnersCount: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 p-4 rounded-2xl outline-none font-black text-indigo-700 text-lg"
                                    >
                                        {[1, 2, 3, 4, 5, 10].map(n => <option key={n} value={n}>{n} {n === 1 ? 'Ganador' : 'Ganadores'}</option>)}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                        <MessageSquare className="w-3 h-3" /> Mensaje para WhatsApp
                                    </label>
                                    <textarea
                                        rows={3} required
                                        value={contestForm.whatsappMessage} onChange={e => setContestForm({ ...contestForm, whatsappMessage: e.target.value })}
                                        className="w-full bg-green-50/50 border-2 border-green-100 focus:border-green-500 p-3 rounded-2xl outline-none font-bold text-slate-700 text-sm resize-none"
                                    />
                                    <p className="text-[10px] font-bold text-green-600 ml-2 flex items-center gap-1"><Bell className="w-3 h-3" /> Automáticamente se enviará una notificación In-App.</p>
                                </div>
                            </div>

                            <button
                                type="submit" disabled={runningContest}
                                className="w-full relative overflow-hidden bg-indigo-600 text-white p-5 rounded-2xl font-black shadow-xl shadow-indigo-600/30 group disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <span className="relative z-10 flex items-center gap-2">
                                    {runningContest ? (
                                        <><Loader2 className="w-6 h-6 animate-spin" /> Buscando Ganadores...</>
                                    ) : (
                                        <><Gift className="w-6 h-6 animate-bounce" /> Realizar Sorteo Aleatorio Ahora</>
                                    )}
                                </span>
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
