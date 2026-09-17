import React, { useEffect, useState } from 'react';
import { DollarSign, Activity, Calendar, ArrowUpRight, Star, ExternalLink, PackageCheck, AlertCircle, Ticket, Gift, Sparkles, Clock, Copy, Check, UploadCloud, X, ShieldAlert, CheckCircle2, Sliders, Info, Shield } from 'lucide-react';
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
    rating?: number;
    comment?: string;
    distance?: string;
    duration?: number;
    commissionAmount?: number;
}

interface DriverCommissionPayment {
    id: string;
    amount_usd: number;
    amount_bs: number;
    bcv_rate: number;
    reference_number: string;
    receipt_url?: string;
    status: 'pending' | 'approved' | 'rejected';
    admin_notes?: string;
    created_at: string;
}

interface DriverRaffle {
    id: string;
    title: string;
    description: string;
    pointsCost: number;
    bannerUrl?: string;
    status: 'active' | 'finished';
}

interface DriverFares {
    pricing_type: 'flat' | 'distance' | 'mixed';
    base_fare: number;
    per_km_fare: number;
    base_km: number;
}

export default function Earnings() {
    const { user, profile } = useAuth();
    const [earnings, setEarnings] = useState<EarningsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'rides' | 'commissions' | 'fares'>('rides');
    const navigate = useNavigate();

    const [activeRaffles, setActiveRaffles] = useState<DriverRaffle[]>([]);
    const [driverPoints, setDriverPoints] = useState<number>(0);
    const [processingRaffle, setProcessingRaffle] = useState<string | null>(null);
    const { bcvRate } = useCurrency();

    // Driver Commission info
    const [driverRow, setDriverRow] = useState<any>(null);
    const [commissionDebt, setCommissionDebt] = useState<number>(0);
    const [commissionStatus, setCommissionStatus] = useState<string>('active');
    const [nextDeadline, setNextDeadline] = useState<string | null>(null);
    const [payoutFrequency, setPayoutFrequency] = useState<string>('weekly_friday');

    // Commission Settings from app_settings
    const [adminSettings, setAdminSettings] = useState<any>(null);
    const [commissionPayments, setCommissionPayments] = useState<DriverCommissionPayment[]>([]);

    // Payment Modal State
    const [showPayModal, setShowPayModal] = useState(false);
    const [payType, setPayType] = useState<'total' | 'partial'>('total');
    const [payAmountUsd, setPayAmountUsd] = useState<number>(0);
    const [refNumber, setRefNumber] = useState<string>('');
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [proofPreview, setProofPreview] = useState<string | null>(null);
    const [submittingPay, setSubmittingPay] = useState<boolean>(false);
    const [copiedPm, setCopiedPm] = useState<boolean>(false);

    // Driver Fares State
    const [fares, setFares] = useState<DriverFares>({
        pricing_type: 'distance',
        base_fare: 1.5,
        per_km_fare: 0.8,
        base_km: 2.0
    });
    const [savingFares, setSavingFares] = useState(false);

    const [stats, setStats] = useState({
        today: 0,
        todayCount: 0,
        week: 0,
        totalTrips: 0
    });

    const fetchDriverData = async () => {
        if (!user) return;
        try {
            const { data: dData } = await supabase
                .from('drivers')
                .select('*')
                .eq('id', user.uid)
                .maybeSingle();

            if (dData) {
                setDriverRow(dData);
                setCommissionDebt(Number(dData.commission_debt || 0));
                setCommissionStatus(dData.commission_status || 'active');
                setNextDeadline(dData.next_commission_deadline || null);
                setPayoutFrequency(dData.payout_frequency || 'weekly_friday');
                if (dData.driver_fares) {
                    setFares({
                        pricing_type: dData.driver_fares.pricing_type || 'distance',
                        base_fare: Number(dData.driver_fares.base_fare || 1.5),
                        per_km_fare: Number(dData.driver_fares.per_km_fare || 0.8),
                        base_km: Number(dData.driver_fares.base_km || 2.0)
                    });
                }
            }

            // Fetch app settings for commission and Pago Movil Un 2x3
            const { data: sData } = await supabase
                .from('app_settings')
                .select('*')
                .eq('id', 'commission_settings')
                .maybeSingle();

            if (sData) {
                const sObj = sData.data || sData.value || sData;
                setAdminSettings(sObj);
            }

            // Fetch commission payment audits
            const { data: payments } = await supabase
                .from('driver_commission_payments')
                .select('*')
                .eq('driver_id', user.uid)
                .order('created_at', { ascending: false });

            if (payments) {
                setCommissionPayments(payments);
            }
        } catch (e) {
            console.error("Error loading driver commission data:", e);
        }
    };

    useEffect(() => {
        if (!user) return;

        const fetchEarnings = async () => {
            try {
                // Delivery Orders
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
                        isPaid: true,
                        rating: data.rating,
                        comment: data.comment,
                        distance: ((data.id.length % 5) + 1.5).toFixed(1),
                        duration: data.total_service_duration || data.totalServiceDuration
                    };
                });

                // Transport Requests
                const { data: transportData } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .eq('driver_id', user.uid)
                    .eq('status', 'completed');

                const transportItems: EarningsItem[] = (transportData || []).map((data: any) => {
                    const cDate = data.created_at ? new Date(data.created_at) : new Date();
                    return {
                        id: data.id,
                        amount: parseFloat(String(data.price || data.driver_payout || 0)) || 0,
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
                        isPaid: true,
                        rating: data.rating,
                        comment: data.rating_comment || data.ratingComment,
                        distance: data.distance ? (parseFloat(String(data.distance)) / 1000).toFixed(1) : undefined,
                        duration: data.arrival_duration || data.arrivalDuration,
                        commissionAmount: data.commission_amount ? Number(data.commission_amount) : undefined
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
        fetchDriverData();
        fetchRafflesAndUser();

        const channel = supabase
            .channel(`earnings_page_${user.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `delivery_driver_id=eq.${user.uid}` }, () => {
                fetchEarnings();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: `driver_id=eq.${user.uid}` }, () => {
                fetchEarnings();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${user.uid}` }, () => {
                fetchDriverData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_commission_payments', filter: `driver_id=eq.${user.uid}` }, () => {
                fetchDriverData();
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

        setStats({
            today: todayItems.reduce((sum, o) => sum + o.amount, 0),
            todayCount: todayItems.length,
            week: weekItems.reduce((sum, o) => sum + o.amount, 0),
            totalTrips: earnings.length
        });
    }, [earnings]);

    const formatDuration = (seconds?: number) => {
        if (!seconds && seconds !== 0) return null;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    const handleExchangePoints = async (raffle: DriverRaffle) => {
        if (!user || processingRaffle) return;
        if (driverPoints < raffle.pointsCost) {
            toast.error(`No posees suficientes puntos. Necesitas ${raffle.pointsCost}.`);
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
            toast.success(`¡Ticket adquirido! Tu número es ${ticketStr}`);
        } catch (error) {
            console.error('Error canjeando puntos:', error);
            toast.error('Hubo un error procesando el canje.');
        } finally {
            setProcessingRaffle(null);
        }
    };

    // Copy Un 2x3 Pago Móvil data
    const handleCopyUn2x3PagoMovil = () => {
        const pm = adminSettings?.pago_movil || {
            bank: 'Banco de Venezuela (0102)',
            phone: '04121234567',
            id_number: 'J-12345678-9',
            account_name: 'Un 2x3 Inversiones C.A.'
        };

        const currentRate = bcvRate || 1;
        const amountToPayUsd = payType === 'total' ? commissionDebt : payAmountUsd;
        const bsAmount = (amountToPayUsd * currentRate).toFixed(2);

        const text = `*PAGO MÓVIL OFICIAL UN 2X3*\n\n` +
            `*Banco:* ${pm.bank}\n` +
            `*Teléfono:* ${pm.phone}\n` +
            `*Cédula/RIF:* ${pm.id_number}\n` +
            `*Beneficiario:* ${pm.account_name}\n` +
            `*Monto a transferir:* ${bsAmount} Bs (Tasa BCV: ${currentRate.toFixed(2)} Bs/$)\n` +
            `*Equivalente:* $${amountToPayUsd.toFixed(2)} USD`;

        navigator.clipboard.writeText(text).then(() => {
            setCopiedPm(true);
            toast.success('Datos oficiales de Un 2x3 copiados al portapapeles');
            setTimeout(() => setCopiedPm(false), 2500);
        }).catch(() => {
            toast.error('Error al copiar');
        });
    };

    // Open Pay Modal
    const handleOpenPayModal = () => {
        if (commissionDebt <= 0) {
            toast.error('No posees comisiones adeudadas.');
            return;
        }
        setPayType('total');
        setPayAmountUsd(commissionDebt);
        setRefNumber('');
        setProofFile(null);
        setProofPreview(null);
        setShowPayModal(true);
    };

    const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProofFile(file);
            setProofPreview(URL.createObjectURL(file));
        }
    };

    // Submit Commission Payment Proof
    const handleSubmitPaymentProof = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        const effectiveUsd = payType === 'total' ? commissionDebt : payAmountUsd;
        if (effectiveUsd <= 0) {
            toast.error('Ingresa un monto válido a pagar.');
            return;
        }
        if (!refNumber.trim()) {
            toast.error('Ingresa el número de referencia del Pago Móvil.');
            return;
        }

        setSubmittingPay(true);
        const tId = toast.loading('Subiendo comprobante y registrando pago...');
        try {
            let receiptUrl = '';
            if (proofFile) {
                const ext = proofFile.name.split('.').pop() || 'jpg';
                const filePath = `commission_receipts/${user.uid}_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, proofFile, { upsert: true });
                if (!upErr) {
                    const { data: urlData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                    receiptUrl = urlData.publicUrl;
                }
            }

            const currentRate = bcvRate || 1;
            const amountBs = parseFloat((effectiveUsd * currentRate).toFixed(2));

            const { error: insErr } = await supabase.from('driver_commission_payments').insert({
                driver_id: user.uid,
                amount_usd: effectiveUsd,
                amount_bs: amountBs,
                bcv_rate: currentRate,
                payment_method: 'pago_movil',
                reference_number: refNumber.trim(),
                receipt_url: receiptUrl,
                status: 'pending'
            });

            if (insErr) throw insErr;

            toast.success('¡Comprobante enviado! La administración revisará tu pago.', { id: tId });
            setShowPayModal(false);
            fetchDriverData();
        } catch (err: any) {
            console.error('Error submitting commission payment:', err);
            toast.error('Error al registrar comprobante: ' + (err.message || 'Verifica tu conexión'), { id: tId });
        } finally {
            setSubmittingPay(false);
        }
    };

    // Save Driver Rates
    const handleSaveFares = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (fares.base_fare < 1.0) {
            toast.error('La tarifa base mínima permitida es de $1.00 USD.');
            return;
        }

        setSavingFares(true);
        const tId = toast.loading('Guardando tarifas...');
        try {
            const { error } = await supabase
                .from('drivers')
                .update({
                    driver_fares: fares,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.uid);

            if (error) throw error;

            toast.success('¡Tus tarifas han sido actualizadas!', { id: tId });
            fetchDriverData();
        } catch (err: any) {
            console.error('Error saving fares:', err);
            toast.error('No se pudo guardar la tarifa: ' + (err.message || 'Error desconocido'), { id: tId });
        } finally {
            setSavingFares(false);
        }
    };
    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const pmSource = adminSettings?.pago_movil || adminSettings?.pagoMovil;
    const officialPm = {
        bank: pmSource?.bank || 'Banesco (0134)',
        phone: pmSource?.phone || '04141234567',
        id_number: pmSource?.id_number || pmSource?.idf || 'J-50123456-7',
        account_name: pmSource?.account_name || pmSource?.name || 'Un 2x3 Inversiones C.A.'
    };

    return (
        <div className="space-y-6 animate-fade-in pb-28">
            {/* Header */}
            <div className="px-4">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Mis Ganancias y Tarifas</h2>
                <p className="text-slate-500 font-medium text-xs mt-0.5">Control de ingresos, comisiones Un 2x3 y precios de tus servicios</p>
            </div>

            {/* Top Cards Stats */}
            <div className="grid grid-cols-2 gap-3 px-4">
                <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Hoy</span>
                        <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center">
                            <Activity className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <div>
                        <span className="text-2xl font-black text-slate-800">${stats.today.toFixed(2)}</span>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">{stats.todayCount} carreras/servicios</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider">Semana</span>
                        <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Calendar className="w-3.5 h-3.5" />
                        </div>
                    </div>
                    <div>
                        <span className="text-2xl font-black text-slate-800">${stats.week.toFixed(2)}</span>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">Últimos 7 días</p>
                    </div>
                </div>
            </div>

            {/* COMISIÓN ADEUDADA CARD (Replaces Saldo Pendiente por Liquidar & Cobrar Ganancias) */}
            <div className="px-4">
                <div className={`rounded-[28px] p-5 text-white shadow-xl relative overflow-hidden ${
                    commissionStatus === 'suspended'
                        ? 'bg-gradient-to-br from-red-950 via-red-900 to-slate-900 shadow-red-950/20'
                        : commissionDebt > 10
                        ? 'bg-gradient-to-br from-amber-950 via-slate-900 to-slate-900 shadow-amber-950/20'
                        : 'bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 shadow-slate-950/20'
                }`}>
                    <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    
                    <div className="relative z-10 space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-amber-400" />
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                                        Comisión Adeudada a Un 2x3
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-2 mt-1.5">
                                    <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                                        ${commissionDebt.toFixed(2)}
                                    </span>
                                    <span className="text-xs font-bold text-slate-400">USD</span>
                                    {bcvRate && (
                                        <span className="text-xs font-semibold text-amber-400 ml-1">
                                            ≈ {((commissionDebt) * bcvRate).toFixed(2)} Bs
                                        </span>
                                    )}
                                </div>
                            </div>

                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                commissionStatus === 'suspended'
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                    : commissionDebt > 0
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}>
                                {commissionStatus === 'suspended' ? 'Suspendido por Deuda' : commissionDebt > 0 ? 'Liquidación Pendiente' : 'Al Día'}
                            </span>
                        </div>

                        {/* Deadline & Warning */}
                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/10 flex items-start gap-2.5">
                            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-[11px] text-slate-200 leading-snug">
                                <span className="font-bold block text-white">
                                    Corte: {payoutFrequency === 'biweekly' ? 'Quincenal' : payoutFrequency === 'weekly_monday' ? 'Lunes Semanal' : 'Viernes Semanal'}
                                </span>
                                {nextDeadline ? (
                                    <span>Límite de pago: <strong className="text-amber-300">{new Date(nextDeadline).toLocaleDateString()}</strong> (máx. 15 días continuos de tolerancia).</span>
                                ) : (
                                    <span>Liquida tus comisiones acumuladas oportunamente para mantener tu cuenta activa y disponible en el radar.</span>
                                )}
                            </div>
                        </div>

                        {/* Action Button */}
                        <div className="flex items-center gap-2 pt-1">
                            <button
                                onClick={handleOpenPayModal}
                                disabled={commissionDebt <= 0}
                                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-40 disabled:pointer-events-none active:scale-98 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
                            >
                                <CreditCard className="w-4 h-4" />
                                Pagar Comisiones (Pago Móvil)
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="px-4">
                <div className="flex bg-slate-200/70 p-1 rounded-2xl">
                    <button
                        onClick={() => setActiveTab('rides')}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                            activeTab === 'rides'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Mis Viajes ({earnings.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('commissions')}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                            activeTab === 'commissions'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Auditoría Pagos ({commissionPayments.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('fares')}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                            activeTab === 'fares'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Mis Tarifas
                    </button>
                </div>
            </div>

            {/* TAB CONTENT: RIDES */}
            {activeTab === 'rides' && (
                <div className="px-4 space-y-3">
                    {earnings.length === 0 ? (
                        <div className="bg-white rounded-3xl p-8 text-center border border-slate-100">
                            <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                            <p className="font-bold text-slate-700 text-sm">Sin carreras registradas aún</p>
                            <p className="text-xs text-slate-400 mt-1">
                                Activa tu disponibilidad en el radar para comenzar a recibir solicitudes.
                            </p>
                        </div>
                    ) : (
                        earnings.map((item) => (
                            <div key={`${item.type}-${item.id}`} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                                        item.type === 'delivery' ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-500'
                                    }`}>
                                        <ArrowUpRight className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-slate-800 text-sm capitalize">{item.type === 'delivery' ? 'Delivery' : 'Carrera'}</span>
                                            {item.commissionAmount !== undefined && item.commissionAmount > 0 && (
                                                <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">
                                                    Comisión: ${item.commissionAmount.toFixed(2)}
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
                                    <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-600 mt-0.5">
                                        Cobrado al cliente
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* TAB CONTENT: COMMISSION PAYMENTS AUDIT */}
            {activeTab === 'commissions' && (
                <div className="px-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                            Tus Comprobantes Enviados
                        </span>
                        <button
                            onClick={handleOpenPayModal}
                            disabled={commissionDebt <= 0}
                            className="text-xs font-bold text-amber-600 hover:text-amber-700 disabled:opacity-40"
                        >
                            + Reportar nuevo pago
                        </button>
                    </div>

                    {commissionPayments.length === 0 ? (
                        <div className="bg-white rounded-3xl p-8 text-center border border-slate-100">
                            <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                            <p className="font-bold text-slate-700 text-sm">No has reportado pagos de comisiones</p>
                            <p className="text-xs text-slate-400 mt-1">
                                Cada vez que hagas un Pago Móvil a Un 2x3, regístralo aquí para que sea auditado y descontado de tu balance.
                            </p>
                        </div>
                    ) : (
                        commissionPayments.map((p) => (
                            <div key={p.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-slate-800 text-sm">
                                                ${Number(p.amount_usd).toFixed(2)} USD
                                            </span>
                                            <span className="text-xs text-slate-400 font-bold">
                                                ({Number(p.amount_bs).toFixed(2)} Bs)
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            Ref: <strong className="text-slate-700">{p.reference_number}</strong> • Tasa: {Number(p.bcv_rate).toFixed(2)} Bs
                                        </p>
                                    </div>

                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                        p.status === 'approved'
                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                            : p.status === 'rejected'
                                            ? 'bg-red-50 text-red-600 border border-red-200'
                                            : 'bg-amber-50 text-amber-600 border border-amber-200'
                                    }`}>
                                        {p.status === 'approved' ? 'Aprobado' : p.status === 'rejected' ? 'Rechazado' : 'En Revisión'}
                                    </span>
                                </div>

                                {p.receipt_url && (
                                    <div className="pt-1">
                                        <a
                                            href={p.receipt_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:text-amber-700 underline"
                                        >
                                            Ver Comprobante Adjunto <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                )}

                                {p.admin_notes && (
                                    <p className="text-[11px] bg-slate-50 p-2 rounded-xl text-slate-600 border border-slate-100">
                                        <strong>Nota admin:</strong> {p.admin_notes}
                                    </p>
                                )}

                                <p className="text-[10px] text-slate-400 font-medium">
                                    Enviado el {new Date(p.created_at).toLocaleString()}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* TAB CONTENT: MIS TARIFAS */}
            {activeTab === 'fares' && (
                <div className="px-4">
                    <form onSubmit={handleSaveFares} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <Sliders className="w-4 h-4 text-amber-500" />
                                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">
                                    Configuración de Tarifas del Piloto
                                </h3>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                Elige con total libertad cómo deseas cobrar tus viajes. Un 2x3 nunca impondrá un precio por km. Solo retendrá la comisión fija por categoría.
                            </p>
                        </div>

                        {/* Scheme selector */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">Modalidad de Cobro</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFares(prev => ({ ...prev, pricing_type: 'flat' }))}
                                    className={`p-3 rounded-2xl border text-center transition-all ${
                                        fares.pricing_type === 'flat'
                                            ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20 font-black'
                                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 font-bold'
                                    }`}
                                >
                                    <span className="text-xs block">Tarifa Fija</span>
                                    <span className="text-[9px] opacity-80 block mt-0.5">Precio fijo</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setFares(prev => ({ ...prev, pricing_type: 'distance' }))}
                                    className={`p-3 rounded-2xl border text-center transition-all ${
                                        fares.pricing_type === 'distance'
                                            ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20 font-black'
                                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 font-bold'
                                    }`}
                                >
                                    <span className="text-xs block">Por Kilómetro</span>
                                    <span className="text-[9px] opacity-80 block mt-0.5">Base + $/km</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setFares(prev => ({ ...prev, pricing_type: 'mixed' }))}
                                    className={`p-3 rounded-2xl border text-center transition-all ${
                                        fares.pricing_type === 'mixed'
                                            ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20 font-black'
                                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 font-bold'
                                    }`}
                                >
                                    <span className="text-xs block">Mixta</span>
                                    <span className="text-[9px] opacity-80 block mt-0.5">Base X km + extra</span>
                                </button>
                            </div>
                        </div>

                        {/* Fields depending on scheme */}
                        <div className="space-y-3 pt-1">
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    {fares.pricing_type === 'flat' ? 'Tarifa Fija del Servicio ($ USD)' : 'Tarifa Base / Mínima ($ USD)'}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">$</span>
                                    <input
                                        type="number"
                                        step="0.10"
                                        min="1.00"
                                        value={fares.base_fare}
                                        onChange={(e) => setFares(prev => ({ ...prev, base_fare: parseFloat(e.target.value) || 0 }))}
                                        className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-bold focus:outline-none focus:border-amber-500"
                                        placeholder="1.50"
                                        required
                                    />
                                </div>
                                <span className="text-[10px] text-slate-400 mt-1 block">
                                    * Tarifa mínima obligatoria por normativa de la plataforma: $1.00 USD.
                                </span>
                            </div>

                            {fares.pricing_type !== 'flat' && (
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Precio por Kilómetro ($ USD / km)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">$</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0.10"
                                            value={fares.per_km_fare}
                                            onChange={(e) => setFares(prev => ({ ...prev, per_km_fare: parseFloat(e.target.value) || 0 }))}
                                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-bold focus:outline-none focus:border-amber-500"
                                            placeholder="0.80"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {fares.pricing_type === 'mixed' && (
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Distancia base incluida (km)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="1.0"
                                        value={fares.base_km}
                                        onChange={(e) => setFares(prev => ({ ...prev, base_km: parseFloat(e.target.value) || 0 }))}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-bold focus:outline-none focus:border-amber-500"
                                        placeholder="2.0"
                                        required
                                    />
                                    <span className="text-[10px] text-slate-400 mt-1 block">
                                        La tarifa base cubrirá los primeros {fares.base_km || 0} km. Cada km adicional se cobrará a ${fares.per_km_fare}/km.
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Save Button */}
                        <button
                            type="submit"
                            disabled={savingFares || fares.base_fare < 1.0}
                            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 active:scale-98 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all shadow-md flex items-center justify-center gap-2"
                        >
                            {savingFares ? 'Guardando...' : 'Guardar Mis Tarifas'}
                        </button>
                    </form>
                </div>
            )}

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

            {/* MODAL: PAGAR COMISIONES UN 2X3 */}
            {showPayModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-[32px] w-full max-w-lg p-6 space-y-5 shadow-2xl relative animate-fade-in my-8">
                        <button
                            onClick={() => setShowPayModal(false)}
                            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div>
                            <div className="flex items-center gap-2 text-amber-500">
                                <Shield className="w-5 h-5" />
                                <span className="text-xs font-black uppercase tracking-wider">Liquidación de Comisiones</span>
                            </div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight mt-1">
                                Pagar a Un 2x3 Inversiones
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Realiza tu Pago Móvil a los datos oficiales y adjunta el comprobante para su aprobación.
                            </p>
                        </div>

                        {/* Datos Oficiales de Pago Móvil con 1-tap copy */}
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Datos Oficiales Pago Móvil</span>
                                <button
                                    onClick={handleCopyUn2x3PagoMovil}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                                >
                                    {copiedPm ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copiedPm ? '¡Copiado!' : 'Copiar Datos'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <span className="text-slate-400 block text-[10px] font-bold">Banco:</span>
                                    <strong className="text-slate-800">{officialPm.bank}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] font-bold">Teléfono:</span>
                                    <strong className="text-slate-800 font-mono">{officialPm.phone}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] font-bold">Cédula / RIF:</span>
                                    <strong className="text-slate-800 font-mono">{officialPm.id_number}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] font-bold">Titular:</span>
                                    <strong className="text-slate-800">{officialPm.account_name}</strong>
                                </div>
                            </div>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmitPaymentProof} className="space-y-4">
                            {/* Type selector: Total vs Partial */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700">Monto a Liquidar</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPayType('total');
                                            setPayAmountUsd(commissionDebt);
                                        }}
                                        className={`py-2.5 px-3 rounded-2xl border text-xs transition-all ${
                                            payType === 'total'
                                                ? 'bg-amber-500 text-white border-amber-500 font-black shadow-sm'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 font-bold'
                                        }`}
                                    >
                                        Pagar Total (${commissionDebt.toFixed(2)})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPayType('partial')}
                                        className={`py-2.5 px-3 rounded-2xl border text-xs transition-all ${
                                            payType === 'partial'
                                                ? 'bg-amber-500 text-white border-amber-500 font-black shadow-sm'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 font-bold'
                                        }`}
                                    >
                                        Abono Parcial
                                    </button>
                                </div>
                            </div>

                            {/* Monto input if partial */}
                            {payType === 'partial' && (
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">Monto Parcial ($ USD)</label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.50"
                                            max={commissionDebt}
                                            value={payAmountUsd}
                                            onChange={(e) => setPayAmountUsd(parseFloat(e.target.value) || 0)}
                                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-bold focus:outline-none focus:border-amber-500"
                                            placeholder="5.00"
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Tasa BCV info banner */}
                            <div className="p-3 bg-amber-50 border border-amber-200/60 rounded-2xl flex items-center justify-between text-xs">
                                <div>
                                    <span className="text-amber-800 font-bold block">
                                        Total a transferir en Bolívares:
                                    </span>
                                    <span className="text-[10px] text-amber-600">
                                        Tasa oficial BCV: {bcvRate ? `${bcvRate.toFixed(2)} Bs/$` : 'Consultando...'}
                                    </span>
                                </div>
                                <span className="text-base font-black text-amber-900 font-mono">
                                    {((payType === 'total' ? commissionDebt : payAmountUsd) * (bcvRate || 1)).toFixed(2)} Bs
                                </span>
                            </div>

                            {/* Referencia bancaria */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Número de Referencia (Pago Móvil)
                                </label>
                                <input
                                    type="text"
                                    value={refNumber}
                                    onChange={(e) => setRefNumber(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-mono font-bold focus:outline-none focus:border-amber-500"
                                    placeholder="Ej: 00123456"
                                    required
                                />
                            </div>

                            {/* Adjuntar comprobante */}
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    Comprobante o Captura de Pantalla
                                </label>
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center hover:border-amber-400 transition-colors">
                                    {proofPreview ? (
                                        <div className="relative inline-block">
                                            <img src={proofPreview} alt="Preview" className="h-28 rounded-xl object-cover shadow-sm" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setProofFile(null);
                                                    setProofPreview(null);
                                                }}
                                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs shadow-md"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="cursor-pointer flex flex-col items-center">
                                            <UploadCloud className="w-8 h-8 text-slate-400 mb-1" />
                                            <span className="text-xs font-bold text-slate-700">Subir Captura</span>
                                            <span className="text-[10px] text-slate-400">JPG, PNG hasta 5MB</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleProofFileChange}
                                                className="hidden"
                                            />
                                        </label>
                                    )}
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={submittingPay || !refNumber.trim()}
                                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 active:scale-98 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                {submittingPay ? 'Enviando Comprobante...' : 'Enviar Reporte de Pago'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
