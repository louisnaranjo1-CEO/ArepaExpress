import React, { useEffect, useState } from 'react';
import { DollarSign, Activity, Calendar, ArrowUpRight, Star, ExternalLink, PackageCheck, AlertCircle, Ticket, Gift, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDocs, updateDoc, increment, addDoc, serverTimestamp } from 'firebase/firestore';

interface EarningsItem {
    id: string;
    amount: number;
    type: 'delivery' | 'transport';
    status: string;
    createdAt: any;
    originName: string;
    destinationName: string;
    isPaid?: boolean;
    rating?: number;
    comment?: string;
    distance?: string;
    duration?: number;
}

interface DriverRaffle {
    id: string;
    title: string;
    description: string;
    pointsCost: number;
    bannerUrl?: string;
    status: 'active' | 'finished';
}

export default function Earnings() {
    const { user, profile } = useAuth();
    const [earnings, setEarnings] = useState<EarningsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

    const [activeRaffles, setActiveRaffles] = useState<DriverRaffle[]>([]);
    const [driverPoints, setDriverPoints] = useState<number>(0);
    const [processingRaffle, setProcessingRaffle] = useState<string | null>(null);

    const [stats, setStats] = useState({
        today: 0,
        todayCount: 0,
        week: 0,
        available: 0
    });

    useEffect(() => {
        if (!user) return;

        // Query for Delivery Orders
        const qOrders = query(
            collection(db, 'orders'),
            where('deliveryDriverId', '==', user.uid),
            where('status', '==', 'completed')
        );

        // Query for Transport Requests
        const qTransport = query(
            collection(db, 'transport_requests'),
            where('driverId', '==', user.uid),
            where('status', '==', 'completed')
        );

        let unsubOrders = () => { };
        let unsubTransport = () => { };

        const fetchAll = () => {
            unsubOrders = onSnapshot(qOrders, (snapshot) => {
                const deliveryItems: EarningsItem[] = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        amount: data.deliveryFee || 0,
                        type: 'delivery',
                        status: data.status,
                        createdAt: data.createdAt,
                        originName: 'Restaurante Aliado',
                        destinationName: data.address?.name || 'Cliente',
                        isPaid: data.deliveryPaid,
                        rating: data.rating,
                        comment: data.comment,
                        distance: ((doc.id.length % 5) + 1.5).toFixed(1),
                        duration: data.totalServiceDuration
                    };
                });

                updateCombinedEarnings(deliveryItems, 'delivery');
            });

            unsubTransport = onSnapshot(qTransport, (snapshot) => {
                const transportItems: EarningsItem[] = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        amount: parseFloat(data.driverPayout || data.price || 0),
                        type: 'transport',
                        status: data.status,
                        createdAt: data.createdAt,
                        originName: data.origin?.address || 'Origen',
                        destinationName: data.destination?.address || 'Destino',
                        isPaid: data.driverPaid,
                        rating: data.rating,
                        comment: data.ratingComment,
                        distance: data.distance ? (parseFloat(data.distance) / 1000).toFixed(1) : undefined,
                        duration: data.arrivalDuration
                    };
                });

                updateCombinedEarnings(transportItems, 'transport');
            });
        };

        const updateCombinedEarnings = (items: EarningsItem[], type: 'delivery' | 'transport') => {
            setEarnings(prev => {
                const otherItems = prev.filter(i => i.type !== type);
                const combined = [...otherItems, ...items].sort((a, b) => {
                    const dateA = a.createdAt?.seconds || 0;
                    const dateB = b.createdAt?.seconds || 0;
                    return dateB - dateA;
                });
                return combined;
            });
            setLoading(false);
        };

        fetchAll();

        const unsubRaffles = onSnapshot(query(collection(db, 'driver_raffles'), where('status', '==', 'active')), (snapshot) => {
            const active = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DriverRaffle));
            setActiveRaffles(active);
        });

        const unsubUser = onSnapshot(doc(db, 'users', user.uid), (docInfo) => {
            if (docInfo.exists()) {
                setDriverPoints(docInfo.data().points || 0);
            }
        });

        return () => {
            unsubOrders();
            unsubTransport();
            unsubRaffles();
            unsubUser();
        };
    }, [user]);

    useEffect(() => {
        if (!earnings.length) return;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        const d = new Date(now);
        const day = d.getDay();
        const diff = d.getDate() - day; // 0 for Sunday
        const startOfWeek = new Date(d.setDate(diff)).setHours(0, 0, 0, 0);

        const todayItems = earnings.filter(o => (o.createdAt?.seconds * 1000) >= startOfToday);
        const weekItems = earnings.filter(o => (o.createdAt?.seconds * 1000) >= startOfWeek);
        const pendingItems = earnings.filter(o => !o.isPaid);

        setStats({
            today: todayItems.reduce((sum, o) => sum + o.amount, 0),
            todayCount: todayItems.length,
            week: weekItems.reduce((sum, o) => sum + o.amount, 0),
            available: pendingItems.reduce((sum, o) => sum + o.amount, 0)
        });
    }, [earnings]);

    const historyItems = earnings.filter(o => o.isPaid);
    const displayItems = activeTab === 'pending' ? earnings.filter(o => !o.isPaid) : historyItems;

    const formatDuration = (seconds?: number) => {
        if (!seconds && seconds !== 0) return null;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    const handleExchangePoints = async (raffle: DriverRaffle) => {
        if (!user || processingRaffle) return;
        if (driverPoints < raffle.pointsCost) {
            alert(`No posees suficientes puntos. Necesitas ${raffle.pointsCost}.`);
            return;
        }

        const confirmTrade = window.confirm(`Deseas cambiar ${raffle.pointsCost} pts por un ticket de "${raffle.title}"?`);
        if (!confirmTrade) return;

        setProcessingRaffle(raffle.id);
        try {
            const ticketRef = collection(db, 'driver_raffle_tickets');
            const qTickets = query(ticketRef, where('raffleId', '==', raffle.id));
            const snapshot = await getDocs(qTickets);
            const nextTicketNumber = snapshot.size + 1;
            const ticketStr = `Ticket #${String(nextTicketNumber).padStart(3, '0')}`;

            await addDoc(ticketRef, {
                raffleId: raffle.id,
                raffleTitle: raffle.title,
                driverId: user.uid,
                driverName: profile?.name || 'Piloto',
                ticketNumber: ticketStr,
                pointsCost: raffle.pointsCost,
                createdAt: serverTimestamp()
            });

            await updateDoc(doc(db, 'users', user.uid), {
                points: increment(-raffle.pointsCost)
            });
            
            alert(`¡Ticket adquirido! Tu número es ${ticketStr}`);
        } catch (error) {
            console.error('Error cangando puntos:', error);
            alert('Oh no, hubo un error procesando el canje.');
        } finally {
            setProcessingRaffle(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-24">
            <div className="px-4">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Mis Ganancias</h2>
                <p className="text-slate-500 font-medium mt-1">Supervisa tus ingresos por delivery y transporte</p>
            </div>

            {/* Banners Promocionales de Rifas */}
            {activeRaffles.map(raffle => (
                <div key={raffle.id} className="mx-4 bg-gradient-to-br from-indigo-900 to-violet-900 rounded-[32px] p-1 shadow-xl shadow-indigo-900/30">
                    <div className="bg-gradient-to-bl from-indigo-700 to-violet-800 rounded-[28px] overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl -mr-16 -mt-16 rounded-full pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 blur-2xl -ml-12 -mb-12 rounded-full pointer-events-none"></div>
                        
                        {raffle.bannerUrl && (
                            <img src={raffle.bannerUrl} alt={raffle.title} className="w-full h-32 object-cover opacity-80" />
                        )}

                        <div className="p-5 relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <Gift className="w-5 h-5 text-yellow-300 animate-pulse" />
                                <span className="text-yellow-300 text-[10px] uppercase font-black tracking-widest bg-yellow-300/10 px-2 py-0.5 rounded-full border border-yellow-300/20">Sorteo Especial Activo</span>
                            </div>
                            <h3 className="text-2xl font-black text-white leading-tight">{raffle.title}</h3>
                            <p className="text-indigo-200 text-xs font-medium mt-1">{raffle.description}</p>
                            
                            <div className="flex items-center justify-between mt-4 bg-black/20 rounded-2xl p-3 border border-indigo-500/30">
                                <div>
                                    <p className="text-indigo-200 text-[10px] uppercase font-black tracking-widest mb-0.5">Tus Puntos</p>
                                    <p className="text-white font-black text-xl flex items-center gap-1">
                                        <Sparkles className="w-4 h-4 text-emerald-400" />
                                        {driverPoints}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-indigo-200 text-[10px] uppercase font-black tracking-widest mb-0.5">Costo por Ticket</p>
                                    <p className="text-yellow-300 font-black text-lg">{raffle.pointsCost} pts</p>
                                </div>
                            </div>

                            <button 
                                onClick={() => handleExchangePoints(raffle)}
                                disabled={processingRaffle === raffle.id}
                                className="w-full mt-4 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-900 font-black py-3 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100"
                            >
                                {processingRaffle === raffle.id ? (
                                    <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <Ticket className="w-5 h-5" />
                                        CANJEAR TICKET AHORA
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            ))}

            {/* Main Stats Grid */}
            <div className="px-4 grid grid-cols-2 gap-4">
                <div className="bg-primary rounded-[32px] p-5 text-black shadow-lg shadow-primary/20 relative overflow-hidden col-span-2">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
                    <p className="text-black font-black uppercase tracking-widest text-[10px] opacity-80">Disponible para Cobro</p>
                    <h3 className="text-4xl font-black mb-1">${stats.available.toFixed(2)}</h3>
                    <div className="flex items-center gap-1.5 text-black/70 text-[10px] font-bold">
                        <PackageCheck className="w-3 h-3" /> {earnings.filter(o => !o.isPaid).length} servicios pendientes
                    </div>
                </div>

                <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm">
                    <p className="text-slate-400 font-black uppercase tracking-widest text-[9px] mb-1">Hoy</p>
                    <h4 className="text-xl font-black text-slate-900">${stats.today.toFixed(2)}</h4>
                    <p className="text-[10px] font-bold text-slate-500">{stats.todayCount} entregas</p>
                </div>

                <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-sm">
                    <p className="text-slate-400 font-black uppercase tracking-widest text-[9px] mb-1">Esta Semana</p>
                    <h4 className="text-xl font-black text-slate-900">${stats.week.toFixed(2)}</h4>
                    <p className="text-[10px] font-bold text-slate-500">Acumulado</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="px-4 flex gap-2">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`flex-1 py-3 px-4 rounded-2xl font-bold text-sm transition-all ${activeTab === 'pending' ? 'bg-primary text-slate-900 shadow-md shadow-indigo-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                >
                    Pendientes
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-3 px-4 rounded-2xl font-bold text-sm transition-all ${activeTab === 'history' ? 'bg-slate-800 text-white shadow-md shadow-slate-300' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                >
                    Historial Pagado
                </button>
            </div>

            {/* Transactions List */}
            <div className="space-y-4 px-4">
                {displayItems.length === 0 ? (
                    <div className="text-center py-10 bg-slate-100 rounded-3xl border-2 border-dashed border-slate-200">
                        <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <h3 className="font-bold text-slate-700">No hay movimientos</h3>
                        <p className="text-sm text-slate-500 mt-1">Aún no tienes ingresos en esta sección.</p>
                    </div>
                ) : (
                    displayItems.map((item) => (
                        <div key={item.id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4 relative overflow-hidden">
                            {/* Header */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {item.createdAt?.seconds
                                            ? new Date(item.createdAt.seconds * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                            : 'Fecha reciente'}
                                    </p>
                                    <h3 className="font-black text-slate-900 leading-tight">
                                        {item.type === 'delivery' ? 'Delivery Completado' : 'Transporte Taxi Completado'}
                                    </h3>
                                </div>
                                <div className="text-right">
                                    <span className="font-black text-primary text-xl">+${item.amount.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Details Route */}
                            <div className="bg-slate-50 rounded-2xl p-3 text-sm">
                                <div className="flex items-start gap-3 relative pb-4">
                                    <div className="absolute top-2.5 left-2 w-0.5 h-full bg-slate-200 -z-0"></div>
                                    <div className="w-4 h-4 rounded-full bg-slate-800 border-2 border-white relative z-10 shrink-0 mt-1"></div>
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-700 text-xs uppercase tracking-tighter opacity-60">Origen</p>
                                        <p className="font-bold text-slate-700">{item.originName}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 relative">
                                    <div className="w-4 h-4 rounded-full bg-primary border-2 border-white relative z-10 shrink-0 mt-1"></div>
                                    <div className="flex-1">
                                        <p className="font-bold text-primary text-xs uppercase tracking-tighter opacity-60">Destino</p>
                                        <p className="font-bold text-slate-700">{item.destinationName}</p>
                                    </div>
                                    {item.distance && (
                                        <div className="text-right shrink-0">
                                            <span className="bg-white border border-slate-200 text-slate-600 text-[10px] font-black px-2 py-1 rounded-lg">
                                                {item.distance} km
                                            </span>
                                        </div>
                                    )}
                                </div>
                                
                                {item.duration !== undefined && (
                                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-white/50 border border-slate-100 rounded-xl">
                                        <Clock className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                            {item.type === 'delivery' ? 'Tiempo Total: ' : 'Tiempo de LLegada: '}
                                            <span className="text-slate-700 font-black">{formatDuration(item.duration)}</span>
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Rating / Review from Client */}
                            {item.rating ? (
                                <div className="bg-orange-50/50 rounded-2xl p-3 border border-orange-100 flex items-start gap-3">
                                    <div className="flex items-center gap-0.5 text-orange-500 shrink-0 mt-0.5">
                                        <Star className="w-4 h-4 fill-current" />
                                        <span className="font-black text-sm ml-1">{item.rating}</span>
                                    </div>
                                    <div>
                                        {item.comment ? (
                                            <p className="text-xs text-slate-700 italic font-medium">"{item.comment}"</p>
                                        ) : (
                                            <p className="text-xs text-slate-500 font-medium">El cliente dejó una calificación sin comentarios.</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                                    <AlertCircle className="w-3 h-3" />
                                    {item.type === 'delivery' ? 'Sin calificación del pedido aún.' : 'Sin calificación del viaje aún.'}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
