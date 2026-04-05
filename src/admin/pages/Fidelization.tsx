import React, { useState, useEffect } from 'react';
import { Gift, Sparkles, Award, TrendingUp, Search, User as UserIcon, Loader2, ChevronRight, Star, ShoppingBag, Plus, Filter, X, CheckCircle2, MessageSquare, Bell, Users, Trash2 } from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { collection, query, getDocs, doc, getDoc, where, orderBy, setDoc, addDoc, serverTimestamp, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import { Instagram, Music2, Youtube, Camera, Megaphone } from 'lucide-react';

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
    prizes: string[];
    winnersCount: number;
    filters: {
        productId: string;
        minAge: string;
        maxAge: string;
        gender: string;
        minPurchase: string;
    };
    winners: (ContestWinner & { prize: string })[];
    createdAt: any;
    whatsappMessage: string;
}

export default function Fidelization() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'ranking' | 'contests' | 'promotion'>('ranking');

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
        prizes: [''],
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

    // Public Raffle State
    const [publicRaffle, setPublicRaffle] = useState({
        title: '',
        description: '',
        image: '',
        videoLink: '',
        isActive: false
    });
    const [uploadingImage, setUploadingImage] = useState(false);
    const [savingPromotion, setSavingPromotion] = useState(false);

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

            // 4. Fetch Public Raffle / Promotion
            const resSnap = await getDoc(doc(db, 'restaurants', user!.uid));
            if (resSnap.exists()) {
                const resData = resSnap.data();
                if (resData.activeRaffle) {
                    setPublicRaffle(resData.activeRaffle);
                }
            }

        } catch (error) {
            console.error("Error fetching fidelization data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const count = parseInt(contestForm.winnersCount) || 1;
        setContestForm(prev => {
            const currentPrizes = [...prev.prizes];
            if (currentPrizes.length < count) {
                // Add missing prize slots
                while (currentPrizes.length < count) currentPrizes.push('');
            } else if (currentPrizes.length > count) {
                // Remove excess prize slots
                currentPrizes.length = count;
            }
            return { ...prev, prizes: currentPrizes };
        });
    }, [contestForm.winnersCount]);

    const handleDeleteContest = async (contestId: string) => {
        if (!user || !window.confirm('¿Estás seguro de que deseas eliminar este registro de sorteo?')) return;
        try {
            await deleteDoc(doc(db, 'restaurants', user.uid, 'restaurant_contests', contestId));
            setContests(contests.filter(c => c.id !== contestId));
            toast.success("Sorteo eliminado correctamente");
        } catch (error) {
            console.error("Error deleting contest:", error);
            toast.error("Error al eliminar el sorteo");
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
            const winSelection = shuffled.slice(0, winnersCount);

            const selectedWinners = winSelection.map((c, idx) => ({
                userId: c.id,
                name: c.name,
                phone: c.phone,
                prize: contestForm.prizes[idx] || contestForm.prizes[0] // fallback to first prize if something went wrong
            }));

            // STEP 4: Save Contest to Database
            const resSnap = await getDoc(doc(db, 'restaurants', user.uid));
            const restaurantName = resSnap.data()?.name || 'El Restaurante';

            const contestData = {
                title: contestForm.title,
                prizes: contestForm.prizes,
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
                    body: `Has sido seleccionado como ganador del sorteo "${contestForm.title}". Premio: ${winner.prize}. ¡Felicidades!`,
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

    const handleSavePromotion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSavingPromotion(true);
        try {
            await updateDoc(doc(db, 'restaurants', user.uid), {
                activeRaffle: publicRaffle
            });
            toast.success("Anuncio de sorteo actualizado correctamente");
        } catch (error) {
            console.error("Error saving promotion:", error);
            toast.error("Error al guardar el anuncio");
        } finally {
            setSavingPromotion(false);
        }
    };

    const handleRaffleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setUploadingImage(true);
        try {
            const storageRef = ref(storage, `restaurants/${user.uid}/raffle_${Date.now()}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setPublicRaffle(prev => ({ ...prev, image: url }));
            toast.success("Imagen subida correctamente");
        } catch (error) {
            console.error("Error uploading image:", error);
            toast.error("Error al subir la imagen");
        } finally {
            setUploadingImage(false);
        }
    };

    const filteredClients = loyalClients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
                <p className="mt-4 text-slate-500 font-bold italic">Cargando datos de clientes...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header section */}
            <div className="relative overflow-hidden bg-slate-900 rounded-[3rem] p-8 md:p-12 text-white">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -ml-10 -mb-10"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-4 max-w-xl">
                        <div className="inline-flex items-center gap-2 bg-primary/20 text-slate-900-light px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border border-primary/20 backdrop-blur-md">
                            <Sparkles className="w-4 h-4" /> Lealtad y Premios
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black leading-tight italic">
                            Haz que tus clientes <span className="text-slate-900 italic">vuelvan siempre.</span>
                        </h1>
                        <p className="text-slate-400 font-medium">
                            Premiar a tu comunidad aumenta las ventas. Ganan <span className="text-white font-bold">{pointRatio} puntos por cada $1</span> o prémialos directamente.
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => setActiveTab('ranking')}
                            className={`px-6 py-4 rounded-[2rem] font-black transition-all shadow-xl flex items-center gap-2 ${activeTab === 'ranking' ? 'bg-primary text-slate-900 shadow-primary/20 scale-105' : 'bg-white/5 text-slate-900/50 hover:bg-white/10'}`}
                        >
                            <UserIcon className="w-5 h-5" /> Ranking
                        </button>
                        <button
                            onClick={() => setActiveTab('contests')}
                            className={`px-6 py-4 rounded-[2rem] font-black transition-all shadow-xl flex items-center gap-2 ${activeTab === 'contests' ? 'bg-primary text-slate-900 shadow-primary/20 scale-105' : 'bg-white/5 text-slate-900/50 hover:bg-white/10'}`}
                        >
                            <Gift className="w-5 h-5" /> Sorteos
                        </button>
                        <button
                            onClick={() => setActiveTab('promotion')}
                            className={`px-6 py-4 rounded-[2rem] font-black transition-all shadow-xl flex items-center gap-2 ${activeTab === 'promotion' ? 'bg-orange-500 text-white shadow-orange-500/20 scale-105' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                        >
                            <Megaphone className="w-5 h-5" /> Anunciar Sorteo
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
                        <div className="w-14 h-14 bg-indigo-50 text-primary rounded-2xl flex items-center justify-center shrink-0">
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
                                                <ShoppingBag className="w-3 h-3 text-slate-900" /> {client.totalOrdersAtRestaurant}
                                            </div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <div className="text-lg font-black text-primary drop-shadow-sm">
                                                {client.points.toLocaleString()} <span className="text-[10px] opacity-40">Pts</span>
                                            </div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${client.points > 1000 ? 'bg-purple-100 text-primary' :
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
                            className="bg-primary text-slate-900 px-6 py-4 rounded-2xl font-black shadow-lg shadow-primary/30 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
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
                                            <div className="w-12 h-12 bg-indigo-50 text-primary rounded-2xl flex items-center justify-center shrink-0">
                                                <Award className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-slate-800">{c.title}</h4>
                                                <div className="flex flex-col gap-1 my-2">
                                                    {c.prizes?.map((p, pidx) => (
                                                        <p key={pidx} className="text-[11px] font-bold text-slate-500">
                                                            {c.prizes.length > 1 ? `Premio #${pidx + 1}: ` : 'Premio: '}
                                                            <span className="text-primary">{p}</span>
                                                        </p>
                                                    ))}
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
                                                    <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">Filtros:</span>
                                                    {c.filters.productId !== 'all' && <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-lg">Por Producto</span>}
                                                    {parseFloat(c.filters.minPurchase) > 0 && <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg">Min ${c.filters.minPurchase}</span>}
                                                    {c.filters.gender !== 'all' && <span className="bg-purple-50 text-primary px-2 py-1 rounded-lg">Sexo: {c.filters.gender}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2">
                                            <div className="bg-slate-50 p-4 rounded-2xl min-w-[200px]">
                                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-200 pb-2">Ganadores</h5>
                                                <div className="space-y-2">
                                                    {c.winners.map((w: any, i) => (
                                                        <div key={i} className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                                <span className="text-sm font-black text-slate-700 truncate">{w.name}</span>
                                                            </div>
                                                            {c.winners.length > 1 && <span className="text-[9px] text-slate-400 ml-6 uppercase font-black italic">Ganó: {w.prize}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteContest(c.id)}
                                                className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                                title="Eliminar registro"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* TAB: PROMOTION */}
            {activeTab === 'promotion' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-white p-8 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col gap-6">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800">Crea un Anuncio de Sorteo</h2>
                            <p className="text-slate-500 font-medium text-sm italic">Promociona tus concursos en el perfil público de tu local.</p>
                        </div>

                        <form onSubmit={handleSavePromotion} className="space-y-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3 text-orange-500" /> Título del Sorteo
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: ¡Gánate un iPhone 15 Pro!"
                                    value={publicRaffle.title}
                                    onChange={e => setPublicRaffle({ ...publicRaffle, title: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-orange-500 p-4 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                    <ShoppingBag className="w-3 h-3 text-orange-500" /> Descripción de la Rifa
                                </label>
                                <textarea
                                    rows={4}
                                    placeholder="Explica qué deben hacer tus clientes para ganar..."
                                    value={publicRaffle.description}
                                    onChange={e => setPublicRaffle({ ...publicRaffle, description: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-orange-500 p-4 rounded-2xl outline-none font-bold text-slate-700 transition-all resize-none"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                    <Instagram className="w-3 h-3 text-orange-500" /> Link de Info (Instagram/TikTok/Video)
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://instagram.com/p/..."
                                    value={publicRaffle.videoLink}
                                    onChange={e => setPublicRaffle({ ...publicRaffle, videoLink: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-orange-500 p-4 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                                />
                                <div className="flex gap-2 mt-2 ml-2">
                                    <Instagram className="w-4 h-4 text-slate-300" />
                                    <Music2 className="w-4 h-4 text-slate-300" />
                                    <Youtube className="w-4 h-4 text-slate-300" />
                                </div>
                            </div>

                            <div
                                onClick={() => setPublicRaffle({ ...publicRaffle, isActive: !publicRaffle.isActive })}
                                className="flex items-center justify-between p-6 bg-orange-50 rounded-[2rem] cursor-pointer border-2 border-orange-100 transition-all hover:bg-orange-100/50"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${publicRaffle.isActive ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-white text-slate-300 border border-slate-200'}`}>
                                        <Megaphone className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-700">Estado del Anuncio</p>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">{publicRaffle.isActive ? 'Visible al Público' : 'Oculto / Inactivo'}</p>
                                    </div>
                                </div>
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${publicRaffle.isActive ? 'bg-orange-500' : 'bg-slate-200'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${publicRaffle.isActive ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={savingPromotion}
                                className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black shadow-xl shadow-slate-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 mt-4"
                            >
                                {savingPromotion ? <Loader2 className="w-6 h-6 animate-spin text-orange-500" /> : <><CheckCircle2 className="w-6 h-6 text-orange-500" /> Guardar Configuración</>}
                            </button>
                        </form>
                    </div>

                    <div className="space-y-8">
                        {/* Image Upload Area */}
                        <div className="bg-white p-8 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100">
                            <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <Camera className="w-5 h-5 text-primary" /> Foto de la Promoción
                            </h3>

                            {publicRaffle.image ? (
                                <div className="relative group aspect-video rounded-[2rem] overflow-hidden bg-slate-100 border-2 border-slate-200">
                                    <img src={publicRaffle.image} alt="Public Raffle" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <label className="bg-white text-slate-900 px-6 py-3 rounded-2xl font-black cursor-pointer shadow-xl hover:scale-105 transition-transform flex items-center gap-2">
                                            <Camera className="w-5 h-5 text-primary" /> Cambiar Imagen
                                            <input type="file" accept="image/*" className="hidden" onChange={handleRaffleImageUpload} disabled={uploadingImage} />
                                        </label>
                                    </div>
                                    {uploadingImage && (
                                        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                                            <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <label className="aspect-video rounded-[2rem] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 hover:border-primary/20 transition-all group overflow-hidden relative">
                                    <div className="flex flex-col items-center justify-center relative z-10">
                                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <Plus className="w-8 h-8 text-slate-300 group-hover:text-primary transition-colors" />
                                        </div>
                                        <p className="text-sm font-black text-slate-400 group-hover:text-primary transition-colors">Sube una imagen llamativa</p>
                                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">Recomendado: 1280x720px</p>
                                    </div>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleRaffleImageUpload} disabled={uploadingImage} />
                                    {uploadingImage && (
                                        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-20">
                                            <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
                                        </div>
                                    )}
                                </label>
                            )}
                        </div>

                        {/* Preview Section */}
                        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-8 rounded-[3rem] shadow-2xl text-white">
                            <div className="flex items-center gap-3 mb-6">
                                <Megaphone className="w-5 h-5 text-orange-500" />
                                <h3 className="text-xl font-black italic">Vista Previa Móvil</h3>
                            </div>

                            <div className="bg-white rounded-[2rem] overflow-hidden shadow-2xl transform scale-95 origin-top border-4 border-slate-800">
                                <div className="h-4 bg-slate-800 flex items-center justify-center gap-1.5 p-1 mb-1">
                                    <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                                    <div className="w-8 h-1 rounded-full bg-slate-700"></div>
                                </div>
                                <div className="aspect-video bg-slate-100 relative overflow-hidden">
                                    {publicRaffle.image ? (
                                        <img src={publicRaffle.image} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300"><Gift className="w-12 h-12" /></div>
                                    )}
                                    <div className="absolute top-4 left-4">
                                        <span className="bg-orange-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest shadow-lg">En curso</span>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <h4 className="text-xl font-black text-slate-900 mb-2">{publicRaffle.title || 'Título del Sorteo'}</h4>
                                    <p className="text-slate-500 text-xs font-medium leading-relaxed italic line-clamp-3">
                                        {publicRaffle.description || 'Aquí aparecerá la descripción de tu sorteo para que tus clientes sepan cómo participar.'}
                                    </p>
                                    <div className="mt-6 flex items-center justify-between">
                                        <div className="flex gap-2">
                                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600"><Instagram className="w-4 h-4" /></div>
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><TrendingUp className="w-4 h-4" /></div>
                                        </div>
                                        <button disabled className="bg-orange-500 text-white text-[10px] font-black px-5 py-2.5 rounded-xl uppercase shadow-lg shadow-orange-500/20">Ver Info</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
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
                                <p className="text-primary/70 text-sm font-bold">Selecciona aleatoriamente entre los clientes que cumplen los filtros.</p>
                            </div>
                            <button onClick={() => !runningContest && setIsContestModalOpen(false)} className="p-2 text-primary hover:bg-white rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateContest} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">

                            <div className="space-y-4 bg-indigo-50/30 p-6 rounded-[2rem] border border-indigo-100">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Título del Sorteo</label>
                                    <input
                                        type="text" required
                                        placeholder="Ej: Sorteo de San Valentín"
                                        value={contestForm.title} onChange={e => setContestForm({ ...contestForm, title: e.target.value })}
                                        className="w-full bg-white border border-slate-200 focus:border-primary p-4 rounded-2xl outline-none font-bold text-slate-700 shadow-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {contestForm.prizes.map((prize, idx) => (
                                        <div key={idx} className="space-y-1 animate-in slide-in-from-left-4 duration-300">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                                                {contestForm.prizes.length > 1 ? `Premio para Ganador #${idx + 1}` : 'Premio a entregar'}
                                            </label>
                                            <input
                                                type="text" required
                                                placeholder={idx === 0 ? "Ej: 1 Pizza Familiar" : "Siguiente premio..."}
                                                value={prize}
                                                onChange={e => {
                                                    const newPrizes = [...contestForm.prizes];
                                                    newPrizes[idx] = e.target.value;
                                                    setContestForm({ ...contestForm, prizes: newPrizes });
                                                }}
                                                className="w-full bg-white border border-slate-200 focus:border-primary p-4 rounded-2xl outline-none font-bold text-primary shadow-sm"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
                                    <Filter className="w-4 h-4 text-primary" /> Filtros de Participación
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Requisito de Producto</label>
                                        <select
                                            value={contestForm.filters.productId} onChange={e => setContestForm({ ...contestForm, filters: { ...contestForm.filters, productId: e.target.value } })}
                                            className="w-full bg-white border border-slate-200 focus:border-primary p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
                                        >
                                            <option value="all">Participan compras de CUALQUIER producto</option>
                                            <option disabled>--- Solo si compraron: ---</option>
                                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Sexo del Cliente</label>
                                        <select
                                            value={contestForm.filters.gender} onChange={e => setContestForm({ ...contestForm, filters: { ...contestForm.filters, gender: e.target.value } })}
                                            className="w-full bg-white border border-slate-200 focus:border-primary p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
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
                                            className="w-full bg-white border border-slate-200 focus:border-primary p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="space-y-1 flex-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Edad Min.</label>
                                            <input
                                                type="number" min="0" placeholder="0"
                                                value={contestForm.filters.minAge} onChange={e => setContestForm({ ...contestForm, filters: { ...contestForm.filters, minAge: e.target.value } })}
                                                className="w-full bg-white border border-slate-200 focus:border-primary p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1 flex-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Edad Max.</label>
                                            <input
                                                type="number" min="0" placeholder="100"
                                                value={contestForm.filters.maxAge} onChange={e => setContestForm({ ...contestForm, filters: { ...contestForm.filters, maxAge: e.target.value } })}
                                                className="w-full bg-white border border-slate-200 focus:border-primary p-3 rounded-xl outline-none font-bold text-slate-700 text-sm"
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
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-4 rounded-2xl outline-none font-black text-indigo-700 text-lg"
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
                                className="w-full relative overflow-hidden bg-primary text-slate-900 p-5 rounded-2xl font-black shadow-xl shadow-primary/30 group disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>
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
