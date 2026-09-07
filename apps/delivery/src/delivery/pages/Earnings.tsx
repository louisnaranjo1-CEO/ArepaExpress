import React, { useEffect, useState } from 'react';
import { DollarSign, Activity, Calendar, ArrowUpRight, Star, ExternalLink, PackageCheck, AlertCircle, Ticket, Gift, Sparkles, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { toast } from 'react-hot-toast';

interface EarningsItem {
    id: string;
    amount: number;
    type: 'delivery' | 'transport';
    status: string;
    createdAt: any;
    originName: string;
    destinationName: string;
    isPaid?: boolean;
    paymentRequested?: boolean;
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
    const navigate = useNavigate();

    const [activeRaffles, setActiveRaffles] = useState<DriverRaffle[]>([]);
    const [driverPoints, setDriverPoints] = useState<number>(0);
    const [processingRaffle, setProcessingRaffle] = useState<string | null>(null);
    const [requestingPayment, setRequestingPayment] = useState(false);
    const { bcvRate } = useCurrency();

    const [stats, setStats] = useState({
        today: 0,
        todayCount: 0,
        week: 0,
        available: 0
    });

    useEffect(() => {
        if (!user) return;

        const fetchEarnings = async () => {
            try {
                // Query for Delivery Orders
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('delivery_driver_id', user.uid)
                    .eq('status', 'completed');

                const deliveryItems: EarningsItem[] = (ordersData || []).map((data: any) => {
                    const cDate = data.created_at ? new Date(data.created_at) : new Date();
                    return {
                        id: data.id,
                        amount: Number(data.delivery_fee || data.deliveryFee || 0) || 0,
                        type: 'delivery',
                        status: data.status,
                        createdAt: {
                            seconds: Math.floor(cDate.getTime() / 1000),
                            toDate: () => cDate,
                            toMillis: () => cDate.getTime(),
                            toISOString: () => cDate.toISOString()
                        },
                        originName: 'Restaurante Aliado',
                        destinationName: data.delivery_address || data.address?.name || 'Cliente',
                        isPaid: data.delivery_paid ?? data.deliveryPaid,
                        paymentRequested: data.payment_requested ?? data.paymentRequested,
                        rating: data.rating,
                        comment: data.comment,
                        distance: ((data.id.length % 5) + 1.5).toFixed(1),
                        duration: data.total_service_duration || data.totalServiceDuration
                    };
                });

                // Query for Transport Requests
                const { data: transportData } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .eq('driver_id', user.uid)
                    .eq('status', 'completed');

                const transportItems: EarningsItem[] = (transportData || []).map((data: any) => {
                    const cDate = data.created_at ? new Date(data.created_at) : new Date();
                    return {
                        id: data.id,
                        amount: parseFloat(String(data.driver_payout || data.driverPayout || data.price || 0)) || 0,
                        type: 'transport',
                        status: data.status,
                        createdAt: {
                            seconds: Math.floor(cDate.getTime() / 1000),
                            toDate: () => cDate,
                            toMillis: () => cDate.getTime(),
                            toISOString: () => cDate.toISOString()
                        },
                        originName: data.origin_address || data.origin?.address || 'Origen',
                        destinationName: data.destination_address || data.destination?.address || 'Destino',
                        isPaid: data.driver_paid ?? data.driverPaid,
                        paymentRequested: data.payment_requested ?? data.paymentRequested,
                        rating: data.rating,
                        comment: data.rating_comment || data.ratingComment,
                        distance: data.distance ? (parseFloat(String(data.distance)) / 1000).toFixed(1) : undefined,
                        duration: data.arrival_duration || data.arrivalDuration
                    };
                });

                const combined = [...deliveryItems, ...transportItems].sort((a, b) => {
                    const dateA = a.createdAt?.seconds || 0;
                    const dateB = b.createdAt?.seconds || 0;
                    return dateB - dateA;
                });

                setEarnings(combined);
            } catch (err) {
                console.error("Error fetching driver earnings:", err);
            } finally {
                setLoading(false);
            }
        };

        const fetchRafflesAndUser = async () => {
            try {
                const { data: raffles } = await supabase
                    .from('driver_raffles')
                    .select('*')
                    .eq('status', 'active');

                if (raffles) {
                    setActiveRaffles(raffles.map((d: any) => ({
                        id: d.id,
                        title: d.title,
                        description: d.description,
                        pointsCost: Number(d.points_cost ?? d.pointsCost) || 0,
                        bannerUrl: d.banner_url || d.bannerUrl,
                        status: d.status
                    })));
                }

                const { data: profileDoc } = await supabase
                    .from('profiles')
                    .select('points')
                    .eq('id', user.uid)
                    .maybeSingle();

                if (profileDoc) {
                    setDriverPoints(Number(profileDoc.points) || 0);
                }
            } catch (e) {
                console.error(e);
            }
        };

        fetchEarnings();
        fetchRafflesAndUser();

        const channel = supabase
            .channel(`earnings_${user.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `delivery_driver_id=eq.${user.uid}` }, () => {
                fetchEarnings();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: `driver_id=eq.${user.uid}` }, () => {
                fetchEarnings();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    useEffect(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        const todayItems = earnings.filter(o => {
            const time = o.createdAt?.toMillis ? o.createdAt.toMillis() : (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0);
            return time >= startOfToday;
        });

        const weekItems = earnings.filter(o => {
            const time = o.createdAt?.toMillis ? o.createdAt.toMillis() : (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0);
            return time >= oneWeekAgo;
        });

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
            const { count } = await supabase
                .from('driver_raffle_tickets')
                .select('*', { count: 'exact', head: true })
                .eq('raffle_id', raffle.id);

            const nextTicketNumber = (count || 0) + 1;
            const ticketStr = `Ticket #${String(nextTicketNumber).padStart(3, '0')}`;

            await supabase.from('driver_raffle_tickets').insert({
                raffle_id: raffle.id,
                raffle_title: raffle.title,
                driver_id: user.uid,
                driver_name: profile?.name || 'Piloto',
                ticket_number: ticketStr,
                points_cost: raffle.pointsCost,
                created_at: new Date().toISOString()
            });

            const newPoints = Math.max(0, driverPoints - raffle.pointsCost);
            await supabase.from('profiles').update({
                points: newPoints
            }).eq('id', user.uid);

            setDriverPoints(newPoints);
            alert(`¡Ticket adquirido! Tu número es ${ticketStr}`);
        } catch (error) {
            console.error('Error canjeando puntos:', error);
            alert('Oh no, hubo un error procesando el canje.');
        } finally {
            setProcessingRaffle(null);
        }
    };

    const handleCopyPaymentData = () => {
        if (!profile?.paymentMobile) return;
        
        const currentBcvRate = bcvRate || 1;
        const totalAmount = earnings.filter(o => !o.isPaid && o.paymentRequested).reduce((sum, item) => sum + item.amount, 0);
        const bsAmount = totalAmount * currentBcvRate;

        const text = `*DATOS PARA PAGO MOVIL - AREPA EXPRESS*\n\n` +
            `*Monto:* ${totalAmount.toFixed(2)}$ (${bsAmount.toFixed(2)} Bs)\n` +
            `*Banco:* ${profile.paymentMobile.bank}\n` +
            `*Teléfono:* ${profile.paymentMobile.phone}\n` +
            `*Cédula:* ${profile.paymentMobile.cedula}\n` +
            `*Nombre:* ${profile.fullName || profile.name || 'Piloto'}`;

        navigator.clipboard.writeText(text).then(() => {
            toast.success('Datos copiados al portapapeles');
        }).catch(() => {
            toast.error('Error al copiar los datos');
        });
    };

    const handleRequestPayment = async () => {
        if (!user || !profile) {
            toast.error('Error de sesión. Intenta de nuevo.');
            return;
        }

        // Validate if they have payment mobile configured
        if (!profile.paymentMobile || !profile.paymentMobile.bank || !profile.paymentMobile.cedula || !profile.paymentMobile.phone) {
            toast.error('Por favor configura tu Pago Móvil primero.');
            navigate('/delivery/profile');
            return;
        }

        const pendingItems = earnings.filter(o => !o.isPaid && !o.paymentRequested);
        if (pendingItems.length === 0) {
            toast.error('No tienes saldo disponible para cobro.');
            return;
        }

        setRequestingPayment(true);
        const loadingToast = toast.loading('Procesando solicitud...');
        
        try {
            const totalAmount = pendingItems.reduce((sum, item) => sum + item.amount, 0);
            const currentBcvRate = bcvRate || 1;
            const bsAmount = totalAmount * currentBcvRate;
            
            const deliveryIds = pendingItems.filter(i => i.type === 'delivery').map(i => i.id);
            const transportIds = pendingItems.filter(i => i.type === 'transport').map(i => i.id);

            if (deliveryIds.length > 0) {
                await supabase
                    .from('orders')
                    .update({ payment_requested: true, updated_at: new Date().toISOString() })
                    .in('id', deliveryIds);
            }

            if (transportIds.length > 0) {
                await supabase
                    .from('transport_requests')
                    .update({ payment_requested: true, updated_at: new Date().toISOString() })
                    .in('id', transportIds);
            }

            // Create notification
            await supabase.from('notifications').insert({
                title: '¡Nueva Solicitud de Pago!',
                body: `El piloto ${profile.fullName || profile.name || 'Sin nombre'} ha solicitado el pago de $${totalAmount.toFixed(2)} (${bsAmount.toFixed(2)} Bs).`,
                type: 'payout_request',
                driver_id: user.uid,
                amount_usd: totalAmount,
                amount_bs: bsAmount,
                bank_info: profile.paymentMobile,
                read: false,
                created_at: new Date().toISOString()
            });

            toast.success('Solicitud enviada exitosamente', { id: loadingToast });
            setEarnings(prev => prev.map(item => {
                if (!item.isPaid && !item.paymentRequested) {
                    return { ...item, paymentRequested: true };
                }
                return item;
            }));
        } catch (error) {
            console.error('Error requesting payment:', error);
            toast.error('Ocurrió un error. Revisa tu conexión.', { id: loadingToast });
        } finally {
            setRequestingPayment(false);
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

            {/* Cards Stats */}
            <div className="grid grid-cols-2 gap-4 px-4">
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">Hoy</span>
                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center">
                            <Activity className="w-4 h-4" />
                        </div>
                    </div>
                    <div>
                        <span className="text-2xl font-black text-slate-800">${stats.today.toFixed(2)}</span>
                        <p className="text-[11px] text-slate-400 font-bold mt-0.5">{stats.todayCount} servicios</p>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">Semana</span>
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-slate-900 flex items-center justify-center">
                            <Calendar className="w-4 h-4" />
                        </div>
                    </div>
                    <div>
                        <span className="text-2xl font-black text-slate-800">${stats.week.toFixed(2)}</span>
                        <p className="text-[11px] text-slate-400 font-bold mt-0.5">Últimos 7 días</p>
                    </div>
                </div>
            </div>

            {/* Saldo Disponible & Cobro */}
            <div className="px-4">
                <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-[32px] p-6 text-white shadow-xl shadow-indigo-950/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <span className="text-xs font-bold uppercase tracking-widest text-indigo-300">Saldo Pendiente por Liquidar</span>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-4xl font-black tracking-tight">${stats.available.toFixed(2)}</span>
                                <span className="text-sm font-bold text-slate-400">USD</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {earnings.some(o => !o.isPaid && o.paymentRequested) && (
                                <button
                                    onClick={handleCopyPaymentData}
                                    className="px-4 py-3.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-bold rounded-2xl transition-all border border-white/10"
                                    title="Copiar datos para pago móvil"
                                >
                                    Copiar Datos
                                </button>
                            )}

                            <button
                                onClick={handleRequestPayment}
                                disabled={requestingPayment || stats.available <= 0}
                                className="flex-1 sm:flex-initial px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:opacity-50 active:scale-95 text-white text-sm font-black rounded-2xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
                            >
                                <DollarSign className="w-4 h-4" />
                                {requestingPayment ? 'Solicitando...' : 'Cobrar Ganancias'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sorteos / Premios para Pilotos */}
            {activeRaffles.length > 0 && (
                <div className="px-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-500" />
                            <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Sorteos de Pilotos</h3>
                        </div>
                        <span className="text-xs font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                            {driverPoints} Puntos
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {activeRaffles.map(raffle => (
                            <div key={raffle.id} className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                                        <Ticket className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-sm">{raffle.title}</h4>
                                        <p className="text-xs text-slate-400 line-clamp-1">{raffle.description}</p>
                                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider mt-1 block">
                                            {raffle.pointsCost} pts por ticket
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleExchangePoints(raffle)}
                                    disabled={processingRaffle === raffle.id || driverPoints < raffle.pointsCost}
                                    className="px-4 py-2 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 transition-all shrink-0"
                                >
                                    {processingRaffle === raffle.id ? 'Canjeando...' : 'Canjear'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs: Pendientes vs Historial */}
            <div className="px-4 space-y-4">
                <div className="flex bg-slate-200/60 p-1.5 rounded-2xl">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                            activeTab === 'pending'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Pendientes ({earnings.filter(o => !o.isPaid).length})
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                            activeTab === 'history'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Historial Pagado ({historyItems.length})
                    </button>
                </div>

                {/* List */}
                <div className="space-y-3">
                    {displayItems.length === 0 ? (
                        <div className="bg-white rounded-3xl p-8 text-center border border-slate-100">
                            <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                            <p className="font-bold text-slate-700">Sin registros</p>
                            <p className="text-xs text-slate-400 mt-1">
                                {activeTab === 'pending' ? 'No tienes servicios pendientes por cobrar.' : 'No tienes servicios liquidados anteriormente.'}
                            </p>
                        </div>
                    ) : (
                        displayItems.map((item) => (
                            <div key={`${item.type}-${item.id}`} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                                        item.type === 'delivery' ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-500'
                                    }`}>
                                        <ArrowUpRight className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-slate-800 text-sm capitalize">{item.type === 'delivery' ? 'Delivery' : 'Viaje'}</span>
                                            {item.paymentRequested && !item.isPaid && (
                                                <span className="text-[9px] font-black uppercase bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-md">
                                                    Cobro Solicitado
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                                            {item.destinationName}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-bold">
                                            {item.distance && <span>{item.distance} km</span>}
                                            {item.duration && <span>• {formatDuration(item.duration)}</span>}
                                            {item.rating && (
                                                <span className="flex items-center text-amber-500">
                                                    • {item.rating} <Star className="w-2.5 h-2.5 fill-amber-500 ml-0.5" />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right shrink-0">
                                    <span className="text-base font-black text-slate-800">
                                        +${item.amount.toFixed(2)}
                                    </span>
                                    <span className={`block text-[10px] font-black uppercase tracking-wider mt-0.5 ${
                                        item.isPaid ? 'text-emerald-500' : item.paymentRequested ? 'text-amber-500' : 'text-slate-400'
                                    }`}>
                                        {item.isPaid ? 'Pagado' : item.paymentRequested ? 'En Proceso' : 'Pendiente'}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
