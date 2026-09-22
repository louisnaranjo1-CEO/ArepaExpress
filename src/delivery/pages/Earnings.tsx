import React, { useEffect, useState } from 'react';
import { DollarSign, Activity, Calendar, ArrowUpRight, Star, ExternalLink, PackageCheck, AlertCircle, Ticket, Gift, Sparkles, Clock, Copy, Check, UploadCloud, X, ShieldAlert, CheckCircle2, Sliders, Info, Shield, CreditCard, Sun, Moon, Navigation, Percent, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { toast } from 'react-hot-toast';
import DriverFareSimulatorModal from '../components/DriverFareSimulatorModal';

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
    // Horario Diurno (Día)
    base_fare_day: number;
    base_distance_day: number; // 1 to 6 km
    extra_km_price_day: number;

    // Horario Nocturno (Noche)
    base_fare_night: number;
    base_distance_night: number; // 1 to 6 km
    extra_km_price_night: number;

    // Opcional: Confort
    comfort_base_fare_day?: number;
    comfort_base_distance_day?: number;
    comfort_extra_km_price_day?: number;
    comfort_base_fare_night?: number;
    comfort_base_distance_night?: number;
    comfort_extra_km_price_night?: number;

    // Retrocompatibilidad
    base_fare?: number;
    per_km_fare?: number;
    base_km?: number;
    comfort_base_fare?: number;
    comfort_per_km_fare?: number;
    pricing_type?: 'flat' | 'distance' | 'mixed';
}

export default function Earnings() {
    const { user, profile } = useAuth();
    const [searchParams] = useSearchParams();
    const [earnings, setEarnings] = useState<EarningsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const initialTab = (searchParams.get('tab') as 'rides' | 'commissions' | 'fares') || 'rides';
    const [activeTab, setActiveTab] = useState<'rides' | 'commissions' | 'fares'>(initialTab);
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
        base_fare_day: 1.5,
        base_distance_day: 2,
        extra_km_price_day: 0.20,
        base_fare_night: 2.0,
        base_distance_night: 2,
        extra_km_price_night: 0.30,
        comfort_base_fare_day: 2.5,
        comfort_base_distance_day: 2,
        comfort_extra_km_price_day: 1.0,
        comfort_base_fare_night: 3.2,
        comfort_base_distance_night: 2,
        comfort_extra_km_price_night: 1.3,
        pricing_type: 'mixed',
        base_fare: 1.5,
        per_km_fare: 0.20,
        base_km: 2.0
    });
    const [savingFares, setSavingFares] = useState(false);
    const [activeFareShiftTab, setActiveFareShiftTab] = useState<'day' | 'night'>('day');
    const [showSimulatorModal, setShowSimulatorModal] = useState(false);

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
                    const df = dData.driver_fares;
                    const dayBase = Number(df.base_fare_day !== undefined ? df.base_fare_day : (df.base_fare || 1.50));
                    const dayDist = Math.min(6, Math.max(1, Number(df.base_distance_day !== undefined ? df.base_distance_day : (df.base_km || 2))));
                    const dayExtra = Number(df.extra_km_price_day !== undefined ? df.extra_km_price_day : (df.per_km_fare || 0.20));

                    const nightBase = Number(df.base_fare_night !== undefined ? df.base_fare_night : parseFloat((dayBase * 1.25).toFixed(2)));
                    const nightDist = Math.min(6, Math.max(1, Number(df.base_distance_night !== undefined ? df.base_distance_night : dayDist)));
                    const nightExtra = Number(df.extra_km_price_night !== undefined ? df.extra_km_price_night : parseFloat((dayExtra * 1.35).toFixed(2)));

                    setFares({
                        base_fare_day: dayBase,
                        base_distance_day: dayDist,
                        extra_km_price_day: dayExtra,
                        base_fare_night: nightBase,
                        base_distance_night: nightDist,
                        extra_km_price_night: nightExtra,
                        comfort_base_fare_day: Number(df.comfort_base_fare_day !== undefined ? df.comfort_base_fare_day : (df.comfort_base_fare || 2.50)),
                        comfort_base_distance_day: Math.min(6, Math.max(1, Number(df.comfort_base_distance_day !== undefined ? df.comfort_base_distance_day : dayDist))),
                        comfort_extra_km_price_day: Number(df.comfort_extra_km_price_day !== undefined ? df.comfort_extra_km_price_day : (df.comfort_per_km_fare || 1.00)),
                        comfort_base_fare_night: Number(df.comfort_base_fare_night !== undefined ? df.comfort_base_fare_night : parseFloat((Number(df.comfort_base_fare || 2.50) * 1.25).toFixed(2))),
                        comfort_base_distance_night: Math.min(6, Math.max(1, Number(df.comfort_base_distance_night !== undefined ? df.comfort_base_distance_night : dayDist))),
                        comfort_extra_km_price_night: Number(df.comfort_extra_km_price_night !== undefined ? df.comfort_extra_km_price_night : parseFloat((Number(df.comfort_per_km_fare || 1.00) * 1.3).toFixed(2))),
                        pricing_type: 'mixed',
                        base_fare: dayBase,
                        per_km_fare: dayExtra,
                        base_km: dayDist,
                        comfort_base_fare: Number(df.comfort_base_fare || 2.50),
                        comfort_per_km_fare: Number(df.comfort_per_km_fare || 1.00)
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

        if (fares.base_fare_day < 0.50 || fares.base_fare_night < 0.50) {
            toast.error('La tarifa base mínima permitida es de $0.50 USD para ambos horarios (diurno y nocturno).');
            return;
        }

        setSavingFares(true);
        const tId = toast.loading('Guardando tarifas...');
        try {
            const payloadToSave: DriverFares = {
                ...fares,
                base_distance_day: Math.min(6, Math.max(1, Math.round(fares.base_distance_day))),
                base_distance_night: Math.min(6, Math.max(1, Math.round(fares.base_distance_night))),
                base_fare: fares.base_fare_day,
                base_km: fares.base_distance_day,
                per_km_fare: fares.extra_km_price_day,
                pricing_type: 'mixed',
                comfort_base_fare: fares.comfort_base_fare_day,
                comfort_per_km_fare: fares.comfort_extra_km_price_day
            };

            const { error } = await supabase
                .from('drivers')
                .update({
                    driver_fares: payloadToSave,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.uid);

            if (error) throw error;

            toast.success('¡Tus tarifas han sido actualizadas exitosamente!', { id: tId });
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

            {/* Tarjeta Destacada de Ganancias de HOY (Grande en Verde con Monto en USD y Bs) */}
            <div className="px-4">
                <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-green-600 text-white p-5 rounded-[28px] shadow-xl shadow-emerald-600/25 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-44 h-44 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
                    <div className="relative z-10 flex flex-col justify-between space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
                                    <Activity className="w-4 h-4" />
                                </div>
                                <span className="text-xs font-black uppercase tracking-wider text-emerald-100">
                                    Ganancias de Hoy
                                </span>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full text-white">
                                {stats.todayCount} {stats.todayCount === 1 ? 'servicio' : 'servicios'}
                            </span>
                        </div>

                        <div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black tracking-tight text-white">
                                    ${stats.today.toFixed(2)}
                                </span>
                                <span className="text-xs font-black uppercase text-emerald-100">USD</span>
                            </div>
                            {bcvRate > 0 && (
                                <p className="text-sm font-black text-emerald-100 mt-1 flex items-center gap-1.5">
                                    <span>≈ {((stats.today) * bcvRate).toFixed(2)} Bs</span>
                                    <span className="text-[10px] font-semibold text-white/80">(Tasa oficial BCV)</span>
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tarjeta de la Semana (Se mantiene tal cual) */}
            <div className="px-4">
                <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider">Semana</span>
                            <span className="text-[10px] text-slate-400 font-medium">• Últimos 7 días</span>
                        </div>
                        <span className="text-2xl font-black text-slate-800">${stats.week.toFixed(2)}</span>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Calendar className="w-5 h-5" />
                    </div>
                </div>
            </div>

            {/* COMISIÓN ADEUDADA CARD (Más pequeña y compacta con el botón "Pagar comisiones para mantenerte activo") */}
            <div className="px-4">
                <div className="bg-white border border-slate-200/90 rounded-[24px] p-4 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-amber-600" />
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                                Comisión Adeudada
                            </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            commissionStatus === 'suspended'
                                ? 'bg-red-100 text-red-700'
                                : commissionDebt > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                        }`}>
                            {commissionStatus === 'suspended' ? 'Suspendido' : commissionDebt > 0 ? 'Pendiente' : 'Al Día'}
                        </span>
                    </div>

                    <div className="flex items-baseline justify-between mb-3">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-black text-slate-900">${commissionDebt.toFixed(2)}</span>
                            <span className="text-[11px] font-bold text-slate-400">USD</span>
                            {bcvRate > 0 && (
                                <span className="text-[11px] font-bold text-amber-700 ml-1">
                                    ≈ {((commissionDebt) * bcvRate).toFixed(2)} Bs
                                </span>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleOpenPayModal}
                        disabled={commissionDebt <= 0}
                        className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-40 disabled:pointer-events-none active:scale-98 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2"
                    >
                        <CreditCard className="w-4 h-4" />
                        Pagar comisiones para mantenerte activo
                    </button>
                    <p className="text-[10px] text-slate-400 text-center font-medium mt-1.5">
                        Pago diario al finalizar jornada o los viernes. Evita suspensión por mora.
                    </p>
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
                <div className="px-4 space-y-4">
                    {/* Contextual Advice based on vehicle */}
                    {driverRow?.vehicle_type === 'moto' ? (
                        <div className="p-4 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-300 rounded-3xl space-y-1.5">
                            <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                                <span className="text-base">💡</span>
                                <span>Consejos para Piloto Mototaxi & Repartidor</span>
                            </div>
                            <ul className="text-[11px] text-slate-600 space-y-1 font-medium list-disc list-inside">
                                <li><strong>Casco obligatorio</strong>: Lleva siempre un segundo casco limpio para tu pasajero en servicios de movilidad.</li>
                                <li><strong>Bolso Térmico</strong>: Los restaurantes asignan pedidos preferentemente a pilotos con bolso térmico registrado (🎒 Bolso Térmico). Actívalo en tu Perfil.</li>
                                <li><strong>Clima y lluvia</strong>: En días lluviosos aumenta la precaución y mantén distancia de frenado.</li>
                            </ul>
                        </div>
                    ) : (
                        <div className="p-4 bg-gradient-to-r from-sky-500/10 to-blue-500/10 border border-sky-300 rounded-3xl space-y-1.5">
                            <div className="flex items-center gap-2 text-sky-900 font-black text-xs">
                                <span className="text-base">💡</span>
                                <span>Consejos para Conductor de Automóvil / Taxi</span>
                            </div>
                            <ul className="text-[11px] text-slate-600 space-y-1 font-medium list-disc list-inside">
                                <li><strong>Taxi Confort</strong>: Si tu auto es año 2009 o superior y cuenta con Aire Acondicionado activo, calificas automáticamente para cobrar tarifas de categoría Confort.</li>
                                <li><strong>Climatización</strong>: Mantén encendido el A/A especialmente en horas pico de calor para garantizar calificaciones de 5 estrellas.</li>
                                <li><strong>Higiene y confort</strong>: Una unidad limpia por dentro y por fuera incrementa las propinas y la preferencia de los usuarios.</li>
                            </ul>
                        </div>
                    )}

                    <form onSubmit={handleSaveFares} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-5">
                        {/* Header & Simulator CTA */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sliders className="w-5 h-5 text-amber-500" />
                                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">
                                        Tarifa Base + Km Excedente
                                    </h3>
                                </div>
                                <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                    Cobertura 1 a 6 km
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed font-medium">
                                Define cuántos kilómetros incluye tu tarifa base de arranque (entre 1 y 6 km) y cuánto cobrarás por cada kilómetro adicional que sobrepase esa distancia.
                            </p>

                            {/* Botón Destacado: Simulador de Rutas y Ganancias */}
                            <button
                                type="button"
                                onClick={() => setShowSimulatorModal(true)}
                                className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-98 transition-all"
                            >
                                <Navigation className="w-4 h-4" />
                                <span>🗺️ Simulador / Probar Tarifas en Mapa Real</span>
                            </button>
                        </div>

                        {/* Shift Switcher (Diurno vs Nocturno) */}
                        <div className="space-y-1.5 pt-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 block">Horario de Configuración</label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                                <button
                                    type="button"
                                    onClick={() => setActiveFareShiftTab('day')}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                                        activeFareShiftTab === 'day'
                                            ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                    }`}
                                >
                                    <Sun className="w-4 h-4" />
                                    <span>☀️ Turno Diurno</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveFareShiftTab('night')}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                                        activeFareShiftTab === 'night'
                                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                    }`}
                                >
                                    <Moon className="w-4 h-4" />
                                    <span>🌙 Turno Nocturno</span>
                                </button>
                            </div>
                        </div>

                        {/* ========================================================= */}
                        {/* CONFIGURACIÓN HORARIO DIURNO */}
                        {/* ========================================================= */}
                        {activeFareShiftTab === 'day' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="p-3 bg-amber-500/10 border border-amber-300 rounded-2xl flex items-center justify-between text-xs">
                                    <span className="font-black text-amber-900 flex items-center gap-1.5">
                                        <Sun className="w-4 h-4 text-amber-600" />
                                        Configurando Tarifas Diurnas (06:00 – 20:00)
                                    </span>
                                    <span className="text-[10px] font-bold text-amber-700 bg-white/70 px-2 py-0.5 rounded-full">
                                        Día
                                    </span>
                                </div>

                                {/* Tarifa Base Diurna */}
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Tarifa Base Diurna ($ USD)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">$</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0.50"
                                            value={fares.base_fare_day}
                                            onChange={(e) => setFares(prev => ({ ...prev, base_fare_day: parseFloat(e.target.value) || 0 }))}
                                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-bold focus:outline-none focus:border-amber-500"
                                            placeholder="1.50"
                                            required
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 block">
                                        * Tarifa mínima obligatoria por normativa de la plataforma: $0.50 USD.
                                    </span>
                                </div>

                                {/* Distancia Base Incluida Diurna (1 a 6 km) */}
                                <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-slate-700">
                                            Distancia Base Incluida Diurna
                                        </label>
                                        <span className="text-xs font-black text-amber-600 bg-amber-100/60 px-2.5 py-0.5 rounded-full">
                                            {fares.base_distance_day} km
                                        </span>
                                    </div>

                                    {/* Selector de Píldoras Táctiles 1 a 6 km */}
                                    <div className="grid grid-cols-6 gap-1.5">
                                        {[1, 2, 3, 4, 5, 6].map((km) => (
                                            <button
                                                key={km}
                                                type="button"
                                                onClick={() => setFares(prev => ({ ...prev, base_distance_day: km }))}
                                                className={`py-2 rounded-xl text-xs font-black transition-all ${
                                                    fares.base_distance_day === km
                                                        ? 'bg-amber-500 text-white shadow-sm scale-102'
                                                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                                }`}
                                            >
                                                {km} km
                                            </button>
                                        ))}
                                    </div>

                                    {/* Slider de 1 a 6 */}
                                    <input
                                        type="range"
                                        min="1"
                                        max="6"
                                        step="1"
                                        value={fares.base_distance_day}
                                        onChange={(e) => setFares(prev => ({ ...prev, base_distance_day: parseInt(e.target.value) || 1 }))}
                                        className="w-full accent-amber-500 cursor-pointer"
                                    />

                                    <p className="text-[11px] text-slate-500 font-medium">
                                        Tu tarifa base cubrirá hasta <strong>{fares.base_distance_day} km</strong>. En viajes de {fares.base_distance_day} km o menos, el cliente solo paga la tarifa base (${Number(fares.base_fare_day || 0).toFixed(2)}).
                                    </p>
                                </div>

                                {/* Precio por Km Excedente Diurno */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-bold text-slate-700">
                                            Precio por Km Excedente Diurno ($ USD / km)
                                        </label>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.05"
                                            value={fares.extra_km_price_day}
                                            onChange={(e) => setFares(prev => ({ ...prev, extra_km_price_day: parseFloat(e.target.value) || 0 }))}
                                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-bold focus:outline-none focus:border-amber-500"
                                            placeholder="0.20"
                                            required
                                        />
                                    </div>

                                    {/* Píldora de Recomendación Dinámica Diurna */}
                                    <div className="mt-2 p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900 font-medium">
                                        <span className="flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                            <span>Rango sugerido por la plataforma:</span>
                                        </span>
                                        <span className="font-black text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-lg font-mono">
                                            ${Number((adminSettings?.driver_rate_recommendations?.day_km_min ?? 0.13)).toFixed(2)} – ${Number((adminSettings?.driver_rate_recommendations?.day_km_max ?? 0.22)).toFixed(2)} / km
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ========================================================= */}
                        {/* CONFIGURACIÓN HORARIO NOCTURNO */}
                        {/* ========================================================= */}
                        {activeFareShiftTab === 'night' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between text-xs">
                                    <span className="font-black text-indigo-900 flex items-center gap-1.5">
                                        <Moon className="w-4 h-4 text-indigo-600" />
                                        Configurando Tarifas Nocturnas (20:00 – 06:00)
                                    </span>
                                    <span className="text-[10px] font-bold text-indigo-700 bg-white/70 px-2 py-0.5 rounded-full">
                                        Noche
                                    </span>
                                </div>

                                {/* Tarifa Base Nocturna */}
                                <div>
                                    <label className="text-xs font-bold text-slate-700 block mb-1">
                                        Tarifa Base Nocturna ($ USD)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">$</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0.50"
                                            value={fares.base_fare_night}
                                            onChange={(e) => setFares(prev => ({ ...prev, base_fare_night: parseFloat(e.target.value) || 0 }))}
                                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-bold focus:outline-none focus:border-indigo-500"
                                            placeholder="2.00"
                                            required
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 block">
                                        * Tarifa de arranque nocturna para compensar traslados en horas de la noche.
                                    </span>
                                </div>

                                {/* Distancia Base Incluida Nocturna (1 a 6 km) */}
                                <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-slate-700">
                                            Distancia Base Incluida Nocturna
                                        </label>
                                        <span className="text-xs font-black text-indigo-600 bg-indigo-100/60 px-2.5 py-0.5 rounded-full">
                                            {fares.base_distance_night} km
                                        </span>
                                    </div>

                                    {/* Selector de Píldoras Táctiles 1 a 6 km */}
                                    <div className="grid grid-cols-6 gap-1.5">
                                        {[1, 2, 3, 4, 5, 6].map((km) => (
                                            <button
                                                key={km}
                                                type="button"
                                                onClick={() => setFares(prev => ({ ...prev, base_distance_night: km }))}
                                                className={`py-2 rounded-xl text-xs font-black transition-all ${
                                                    fares.base_distance_night === km
                                                        ? 'bg-indigo-600 text-white shadow-sm scale-102'
                                                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                                }`}
                                            >
                                                {km} km
                                            </button>
                                        ))}
                                    </div>

                                    {/* Slider de 1 a 6 */}
                                    <input
                                        type="range"
                                        min="1"
                                        max="6"
                                        step="1"
                                        value={fares.base_distance_night}
                                        onChange={(e) => setFares(prev => ({ ...prev, base_distance_night: parseInt(e.target.value) || 1 }))}
                                        className="w-full accent-indigo-600 cursor-pointer"
                                    />

                                    <p className="text-[11px] text-slate-500 font-medium">
                                        Tu tarifa nocturna cubrirá hasta <strong>{fares.base_distance_night} km</strong>. En viajes de {fares.base_distance_night} km o menos, el cliente paga la tarifa base (${Number(fares.base_fare_night || 0).toFixed(2)}).
                                    </p>
                                </div>

                                {/* Precio por Km Excedente Nocturno */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-bold text-slate-700">
                                            Precio por Km Excedente Nocturno ($ USD / km)
                                        </label>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.05"
                                            value={fares.extra_km_price_night}
                                            onChange={(e) => setFares(prev => ({ ...prev, extra_km_price_night: parseFloat(e.target.value) || 0 }))}
                                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-bold focus:outline-none focus:border-indigo-500"
                                            placeholder="0.30"
                                            required
                                        />
                                    </div>

                                    {/* Píldora de Recomendación Dinámica Nocturna */}
                                    <div className="mt-2 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between text-xs text-indigo-900 font-medium">
                                        <span className="flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                            <span>Rango sugerido por la plataforma:</span>
                                        </span>
                                        <span className="font-black text-indigo-800 bg-indigo-200/60 px-2 py-0.5 rounded-lg font-mono">
                                            ${Number((adminSettings?.driver_rate_recommendations?.night_km_min ?? 0.23)).toFixed(2)} – ${Number((adminSettings?.driver_rate_recommendations?.night_km_max ?? 0.45)).toFixed(2)} / km
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Dual Fare Setup for Confort */}
                        {(driverRow?.is_comfort_eligible || (driverRow?.vehicle_type !== 'moto' && driverRow?.has_ac && Number(driverRow?.vehicle_year) >= 2009)) && (
                            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-amber-600" />
                                        <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">
                                            Tarifas Taxi Confort (Climatizado 2009+)
                                        </h4>
                                    </div>
                                    <span className="text-[9px] font-black bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                                        Vehículo Calificado
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-600">
                                    Tarifa preferencial para clientes que solicitan categoría Confort.
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                                            Tarifa Base Confort ($)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.10"
                                            min="0.50"
                                            value={fares.comfort_base_fare_day || fares.comfort_base_fare || 2.50}
                                            onChange={e => setFares(prev => ({ ...prev, comfort_base_fare_day: parseFloat(e.target.value) || 0, comfort_base_fare: parseFloat(e.target.value) || 0 }))}
                                            className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                                            placeholder="2.50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                                            Km Excedente Confort ($/km)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0.10"
                                            value={fares.comfort_extra_km_price_day || fares.comfort_per_km_fare || 1.00}
                                            onChange={e => setFares(prev => ({ ...prev, comfort_extra_km_price_day: parseFloat(e.target.value) || 0, comfort_per_km_fare: parseFloat(e.target.value) || 0 }))}
                                            className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                                            placeholder="1.00"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Transparency Banner on Commission */}
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-2.5 text-xs text-slate-600">
                            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] leading-relaxed">
                                <strong>Comisión de Plataforma:</strong> Retiene la comisión base fija de tu categoría más el <strong>{adminSettings?.extra_km_commission_pct ?? 30}%</strong> sobre los kilómetros excedentes cobrados. El resto es 100% ganancia neta en tu bolsillo.
                            </p>
                        </div>

                        {/* Save Button */}
                        <button
                            type="submit"
                            disabled={savingFares || fares.base_fare_day < 0.50 || fares.base_fare_night < 0.50}
                            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 active:scale-98 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all shadow-md flex items-center justify-center gap-2"
                        >
                            {savingFares ? 'Guardando...' : 'Guardar Mis Tarifas'}
                        </button>
                    </form>
                </div>
            )}

            {/* Modal Simulador Interactivo de Tarifas */}
            {showSimulatorModal && (
                <DriverFareSimulatorModal
                    isOpen={showSimulatorModal}
                    onClose={() => setShowSimulatorModal(false)}
                    driverFares={fares}
                    vehicleType={driverRow?.vehicle_type || 'moto'}
                    isComfortEligible={Boolean(driverRow?.is_comfort_eligible || (driverRow?.vehicle_type !== 'moto' && driverRow?.has_ac && Number(driverRow?.vehicle_year) >= 2009))}
                    adminSettings={adminSettings}
                    bcvRate={bcvRate}
                />
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

                        {/* Indicación de Opciones de Pago y Advertencia de Suspensión */}
                        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2">
                            <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wider">
                                <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>Opciones de Pago de Comisiones</span>
                            </div>
                            <p className="text-xs text-slate-800 font-medium leading-relaxed">
                                Puedes pagar a diario tus comisiones al finalizar tu jornada laboral, o pagarlas únicamente los días <b>viernes</b>.
                            </p>
                            <div className="flex items-start gap-1.5 pt-2 border-t border-amber-200 text-red-600">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <p className="text-xs font-black leading-tight">
                                    De no pagar las comisiones tu cuenta quedará suspendida por mora.
                                </p>
                            </div>
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
