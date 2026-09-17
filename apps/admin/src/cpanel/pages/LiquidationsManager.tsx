import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Search, CheckCircle, RefreshCw, AlertCircle, TrendingUp, History, User, Copy, Shield, ShieldAlert, ShieldCheck, Check, X, Eye, ExternalLink, Clock, AlertTriangle, CreditCard, ChevronRight, FileText, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import DualPrice from '../../components/DualPrice';
import { useCurrency } from '../../context/CurrencyContext';

export default function LiquidationsManager() {
    const { bcvRate } = useCurrency();
    const [activeTab, setActiveTab] = useState<'restaurants' | 'drivers' | 'commissions' | 'history'>('commissions');
    
    // Data states
    const [restaurants, setRestaurants] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [payoutsHistory, setPayoutsHistory] = useState<any[]>([]);
    const [commissionPayments, setCommissionPayments] = useState<any[]>([]);
    const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
    const [selectedProofImg, setSelectedProofImg] = useState<string | null>(null);
    const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchCommissionPayments = async () => {
        try {
            const { data, error } = await supabase
                .from('driver_commission_payments')
                .select('*')
                .order('created_at', { ascending: false });
            if (!error && data) {
                setCommissionPayments(data);
            }
        } catch (err) {
            console.error("Error fetching commission payments:", err);
        }
    };

    const fetchRestaurants = async () => {
        const { data } = await supabase.from('comercios').select('*').order('name');
        if (data) {
            setRestaurants(data.map(r => ({
                ...r,
                deuda_delivery_acumulada: r.deuda_delivery_acumulada || 0,
                deuda_comisiones_acumulada: r.deuda_comisiones_acumulada || 0
            })));
        }
    };

    const fetchDriversAndEarnings = async () => {
        try {
            const { data: driversData } = await supabase.from('drivers').select('*');
            const { data: ordersData } = await supabase.from('orders').select('*').eq('status', 'completed');
            const { data: transportData } = await supabase.from('transport_requests').select('*').eq('status', 'completed');

            const processedDrivers = (driversData || []).map((driver: any) => {
                const driverOrders = (ordersData || []).filter((o: any) => 
                    (o.delivery_driver_id === driver.id || o.deliveryDriverId === driver.id) && 
                    !o.delivery_paid && !o.deliveryPaid
                );
                const driverTransports = (transportData || []).filter((t: any) => 
                    (t.driver_id === driver.id || t.driverId === driver.id) && 
                    !t.driver_paid && !t.driverPaid
                );

                const deliverySum = driverOrders.reduce((sum: number, o: any) => sum + (o.delivery_fee || o.deliveryFee || 0), 0);
                const transportSum = driverTransports.reduce((sum: number, t: any) => sum + parseFloat(t.driver_payout || t.driverPayout || t.price || 0), 0);

                return {
                    ...driver,
                    fullName: driver.full_name || driver.fullName,
                    commissionDebt: Number(driver.commission_debt || 0),
                    commissionStatus: driver.commission_status || 'current',
                    payoutFrequency: driver.payout_frequency || 'weekly_friday',
                    nextCommissionDeadline: driver.next_commission_deadline || null,
                    unpaidOrders: driverOrders,
                    unpaidTransports: driverTransports,
                    totalUnpaid: deliverySum + transportSum,
                    hasRequested: driverOrders.some((o: any) => o.paymentRequested || o.payment_requested) || driverTransports.some((t: any) => t.paymentRequested || t.payment_requested)
                };
            });

            setDrivers(processedDrivers.sort((a: any, b: any) => b.totalUnpaid - a.totalUnpaid));
            setLoading(false);
        } catch (err) {
            console.error("Error fetching drivers:", err);
            setLoading(false);
        }
    };

    const fetchPayoutsHistory = async () => {
        const { data } = await supabase.from('payouts_history').select('*').order('paid_at', { ascending: false });
        if (data) {
            setPayoutsHistory(data.map(p => ({
                ...p,
                targetId: p.target_id || p.targetId,
                targetName: p.target_name || p.targetName,
                targetType: p.target_type || p.targetType,
                amountPaid: p.amount_paid !== undefined ? p.amount_paid : p.amountPaid,
                paidAt: p.paid_at || p.paidAt
            })));
        }
    };

    useEffect(() => {
        fetchRestaurants();
        fetchDriversAndEarnings();
        fetchCommissionPayments();
        fetchPayoutsHistory();

        const channel = supabase.channel('liquidations_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comercios' }, () => fetchRestaurants())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchDriversAndEarnings())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, () => fetchDriversAndEarnings())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => fetchDriversAndEarnings())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_commission_payments' }, () => fetchCommissionPayments())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts_history' }, () => fetchPayoutsHistory())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleClearDeliveryDebt = async (restaurantId: string, currentDebt: number, restaurantName: string) => {
        const bsAmount = currentDebt * bcvRate;
        if (!window.confirm(`¿Confirmas que el restaurante ${restaurantName} ha pagado su deuda de $${currentDebt.toFixed(2)} (${bsAmount.toFixed(2)} Bs) por concepto de delivery/repartos?`)) return;
        
        try {
            await supabase.from('comercios').update({
                deuda_delivery_acumulada: 0
            }).eq('id', restaurantId);

            await supabase.from('payouts_history').insert([{
                target_id: restaurantId,
                target_name: restaurantName,
                target_type: 'restaurant',
                amount_paid: currentDebt,
                paid_at: new Date().toISOString(),
                type: 'debt_cleared',
                description: 'Deuda por repartos cobrados en local saldada.'
            }]);

            toast.success("Deuda de repartos saldada correctamente");
        } catch (error) {
            console.error("Error clearing delivery debt:", error);
            toast.error("Error al saldar la deuda");
        }
    };

    const handleClearCommissionDebt = async (restaurantId: string, currentDebt: number, restaurantName: string) => {
        const bsAmount = currentDebt * bcvRate;
        if (!window.confirm(`¿Confirmas que la tienda ${restaurantName} ha pagado su comisión de ventas WhatsApp de $${currentDebt.toFixed(2)} (${bsAmount.toFixed(2)} Bs)?`)) return;

        try {
            await supabase.from('comercios').update({
                deuda_comisiones_acumulada: 0
            }).eq('id', restaurantId);

            await supabase.from('payouts_history').insert([{
                target_id: restaurantId,
                target_name: restaurantName,
                target_type: 'restaurant',
                amount_paid: currentDebt,
                paid_at: new Date().toISOString(),
                type: 'commission_cleared',
                description: 'Comisiones de ventas por WhatsApp saldadas.'
            }]);

            toast.success("Comisiones de WhatsApp saldadas correctamente");
            setRestaurants(prev => prev.map(r => r.id === restaurantId ? { ...r, deuda_comisiones_acumulada: 0 } : r));
        } catch (error) {
            console.error("Error clearing commission debt:", error);
            toast.error("Error al saldar la comisión");
        }
    };

    const handlePayDriver = async (driver: any) => {
        const bsAmount = driver.totalUnpaid * bcvRate;
        if (!window.confirm(`¿Confirmas el pago de $${driver.totalUnpaid.toFixed(2)} (${bsAmount.toFixed(2)} Bs) al piloto ${driver.fullName}?`)) return;

        try {
            for (const o of driver.unpaidOrders) {
                await supabase.from('orders').update({ delivery_paid: true, deliveryPaid: true }).eq('id', o.id);
            }

            for (const t of driver.unpaidTransports) {
                await supabase.from('transport_requests').update({ driver_paid: true, driverPaid: true }).eq('id', t.id);
            }

            await supabase.from('payouts_history').insert([{
                target_id: driver.id,
                target_name: driver.fullName,
                target_type: 'driver',
                amount_paid: driver.totalUnpaid,
                paid_at: new Date().toISOString(),
                type: 'driver_payout',
                description: `Liquidación de ${driver.unpaidOrders.length} envíos y ${driver.unpaidTransports.length} viajes.`
            }]);

            toast.success(`Pago procesado a ${driver.fullName}`);
        } catch (error) {
            console.error("Error processing driver payout:", error);
            toast.error("Error al procesar el pago");
        }
    };

    const copyPaymentInfo = (driver: any) => {
        if (!driver.paymentMobile) {
            toast.error("El piloto no tiene datos de pago configurados");
            return;
        }
        const bsAmount = (driver.totalUnpaid * bcvRate).toFixed(2);
        const text = `Pago Móvil Arepa Express\nBanco: ${driver.paymentMobile.bank}\nCédula: ${driver.paymentMobile.cedula}\nTeléfono: ${driver.paymentMobile.phone}\nMonto: ${bsAmount} Bs`;
        
        navigator.clipboard.writeText(text).then(() => {
            toast.success("Información copiada al portapapeles");
        }).catch(err => {
            console.error('Error copying text: ', err);
            toast.error("Error al copiar información");
        });
    };

    const handleApproveCommissionPayment = async (payment: any) => {
        const driverObj = drivers.find(d => d.id === payment.driver_id);
        const driverName = payment.driver_name || driverObj?.fullName || 'Piloto';
        const amountUsd = Number(payment.amount_usd || 0);

        if (!window.confirm(`¿Confirmas la APROBACIÓN del Pago Móvil de $${amountUsd.toFixed(2)} (${payment.amount_bs || (amountUsd * bcvRate).toFixed(2)} Bs) de ${driverName}?\nReferencia: ${payment.reference_number}`)) return;

        setProcessingPaymentId(payment.id);
        const tId = toast.loading("Aprobando pago y actualizando saldo...");
        try {
            // 1. Update payment status
            const { error: pErr } = await supabase
                .from('driver_commission_payments')
                .update({
                    status: 'approved',
                    approved_at: new Date().toISOString()
                })
                .eq('id', payment.id);
            if (pErr) throw pErr;

            // 2. Decrement driver's commission debt
            const { data: dRow } = await supabase
                .from('drivers')
                .select('commission_debt, commission_status')
                .eq('id', payment.driver_id)
                .maybeSingle();

            const currentDebt = Number(dRow?.commission_debt || 0);
            const newDebt = Math.max(0, currentDebt - amountUsd);
            const newStatus = newDebt < 15 ? 'current' : (dRow?.commission_status || 'current');

            const { error: dErr } = await supabase
                .from('drivers')
                .update({
                    commission_debt: newDebt,
                    commission_status: newStatus
                })
                .eq('id', payment.driver_id);
            if (dErr) throw dErr;

            // 3. Log into payouts history
            await supabase.from('payouts_history').insert([{
                target_id: payment.driver_id,
                target_name: driverName,
                target_type: 'driver',
                amount_paid: amountUsd,
                paid_at: new Date().toISOString(),
                type: 'commission_received',
                description: `Comisión Un 2x3 recibida por Pago Móvil (Ref: ${payment.reference_number}). Monto: $${amountUsd.toFixed(2)} (${payment.amount_bs || (amountUsd * bcvRate).toFixed(2)} Bs). Deuda restante: $${newDebt.toFixed(2)}.`
            }]);

            toast.success(`¡Pago de $${amountUsd.toFixed(2)} aprobado! Deuda restante: $${newDebt.toFixed(2)}`, { id: tId });
            fetchCommissionPayments();
            fetchDriversAndEarnings();
        } catch (error: any) {
            console.error("Error approving commission payment:", error);
            toast.error("Error al aprobar pago: " + (error.message || 'Error desconocido'), { id: tId });
        } finally {
            setProcessingPaymentId(null);
        }
    };

    const handleRejectCommissionPayment = async (payment: any) => {
        const driverObj = drivers.find(d => d.id === payment.driver_id);
        const driverName = payment.driver_name || driverObj?.fullName || 'Piloto';
        const reason = window.prompt(`Indica el motivo de rechazo del pago de ${driverName} (Ref: ${payment.reference_number}):`, 'Comprobante no coincide con la cuenta bancaria o referencia no localizada');
        if (!reason) return;

        setProcessingPaymentId(payment.id);
        const tId = toast.loading("Registrando rechazo...");
        try {
            const { error } = await supabase
                .from('driver_commission_payments')
                .update({
                    status: 'rejected',
                    admin_notes: reason,
                    rejected_at: new Date().toISOString()
                })
                .eq('id', payment.id);
            if (error) throw error;

            toast.success("Comprobante rechazado correctamente", { id: tId });
            fetchCommissionPayments();
        } catch (error: any) {
            console.error("Error rejecting payment:", error);
            toast.error("Error al rechazar pago", { id: tId });
        } finally {
            setProcessingPaymentId(null);
        }
    };

    const handleAdjustDriverDebt = async (driver: any) => {
        const currentDebt = Number(driver.commissionDebt || driver.commission_debt || 0);
        const inputVal = window.prompt(`Ajustar saldo adeudado de ${driver.fullName}.\nSaldo actual: $${currentDebt.toFixed(2)}\nIngresa el nuevo monto de deuda en USD (escribe 0 para condonar):`, "0");
        if (inputVal === null) return;
        const newDebt = parseFloat(inputVal);
        if (isNaN(newDebt) || newDebt < 0) {
            toast.error("Monto inválido");
            return;
        }

        const tId = toast.loading("Actualizando saldo...");
        try {
            const newStatus = newDebt < 15 ? 'current' : 'suspended';
            await supabase
                .from('drivers')
                .update({
                    commission_debt: newDebt,
                    commission_status: newStatus
                })
                .eq('id', driver.id);

            await supabase.from('payouts_history').insert([{
                target_id: driver.id,
                target_name: driver.fullName,
                target_type: 'driver',
                amount_paid: Math.abs(currentDebt - newDebt),
                paid_at: new Date().toISOString(),
                type: 'debt_adjusted',
                description: `Ajuste manual de comisiones adeudadas: de $${currentDebt.toFixed(2)} a $${newDebt.toFixed(2)} USD.`
            }]);

            toast.success(`Saldo de ${driver.fullName} ajustado a $${newDebt.toFixed(2)}`, { id: tId });
            fetchDriversAndEarnings();
        } catch (err: any) {
            console.error("Error adjusting driver debt:", err);
            toast.error("Error al ajustar saldo", { id: tId });
        }
    };

    const totalDriversDebt = drivers.reduce((sum, d) => sum + (Number(d.commissionDebt || 0)), 0);
    const pendingCommissionPayments = commissionPayments.filter(p => p.status === 'pending');
    const suspendedDrivers = drivers.filter(d => (d.commissionStatus === 'suspended' || d.commission_status === 'suspended') || (Number(d.commissionDebt || 0) >= 15));
    const driversWithDebt = drivers.filter(d => (Number(d.commissionDebt || 0)) > 0);

    const filteredCommissionPayments = commissionPayments.filter(p => {
        if (paymentStatusFilter !== 'all' && p.status !== paymentStatusFilter) return false;
        if (!searchTerm) return true;
        const driverObj = drivers.find(d => d.id === p.driver_id);
        const driverName = p.driver_name || driverObj?.fullName || '';
        return driverName.toLowerCase().includes(searchTerm.toLowerCase()) || (p.reference_number || '').toLowerCase().includes(searchTerm.toLowerCase());
    });

    const filteredDriversDebt = drivers.filter(d => 
        (d.commissionDebt > 0 || d.commissionStatus === 'suspended') &&
        d.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredRestaurants = restaurants.filter(r => 
        ((r.deuda_delivery_acumulada || 0) > 0 || (r.deuda_comisiones_acumulada || 0) > 0) &&
        r.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredDrivers = drivers.filter(d => 
        d.totalUnpaid > 0 && 
        d.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                        <DollarSign className="w-8 h-8 text-primary" />
                        Módulo de Liquidaciones
                    </h1>
                    <p className="text-slate-500 font-medium">Gestiona comisiones y deudas de tiendas, así como pagos a pilotos.</p>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-2">
                <button
                    onClick={() => setActiveTab('restaurants')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${
                        activeTab === 'restaurants' ? 'bg-primary text-slate-900 shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <TrendingUp className="w-5 h-5" />
                    Deudas y Comisiones Tiendas
                </button>
                <button
                    onClick={() => setActiveTab('commissions')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${
                        activeTab === 'commissions' ? 'bg-primary text-slate-900 shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <Shield className="w-5 h-5 text-amber-600" />
                    Comisiones Conductores Un 2x3
                    {pendingCommissionPayments.length > 0 && (
                        <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-black rounded-full animate-pulse">
                            {pendingCommissionPayments.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('drivers')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${
                        activeTab === 'drivers' ? 'bg-primary text-slate-900 shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <CheckCircle className="w-5 h-5" />
                    Liquidación Pilotos
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${
                        activeTab === 'history' ? 'bg-primary text-slate-900 shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <History className="w-5 h-5" />
                    Historial Registros
                </button>
            </div>

            {/* Search Bar */}
            {activeTab !== 'history' && (
                <div className="relative">
                    <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder={`Buscar ${activeTab === 'restaurants' ? 'tienda / comercio' : activeTab === 'commissions' ? 'conductor o referencia...' : 'piloto'}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-primary/50"
                    />
                </div>
            )}

            {/* Content Tabs */}
            {activeTab === 'restaurants' && (
                <div className="space-y-4">
                    {filteredRestaurants.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                            <h3 className="font-bold text-slate-900">Sin deudas ni comisiones pendientes</h3>
                            <p className="text-slate-500 text-sm">Todas las tiendas están al día.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredRestaurants.map(rest => {
                                const deliveryDebt = rest.deuda_delivery_acumulada || 0;
                                const commissionDebt = rest.deuda_comisiones_acumulada || 0;
                                const totalDebt = deliveryDebt + commissionDebt;

                                return (
                                    <div key={rest.id} className="bg-white rounded-3xl border border-red-100 p-6 shadow-sm relative overflow-hidden flex flex-col justify-between">
                                        <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-lg">{rest.name}</h3>
                                            <p className="text-sm font-medium text-slate-500 mb-4">{rest.address || 'Sin dirección'}</p>
                                            
                                            {/* Total Debt */}
                                            <div className="p-4 bg-red-50 text-red-900 rounded-2xl mb-4">
                                                <p className="text-[10px] uppercase font-black tracking-wider opacity-75">Deuda Total Acumulada</p>
                                                <DualPrice usdAmount={totalDebt} usdClassName="text-3xl font-black text-red-900" showDivider={false} className="flex flex-col" />
                                            </div>

                                            {/* Breakdown */}
                                            <div className="space-y-2 mb-5">
                                                {commissionDebt > 0 && (
                                                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-amber-800">Comisión Ventas WhatsApp</p>
                                                            <DualPrice usdAmount={commissionDebt} usdClassName="text-sm font-bold text-amber-900" showDivider={false} />
                                                        </div>
                                                        <button
                                                            onClick={() => handleClearCommissionDebt(rest.id, commissionDebt, rest.name)}
                                                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors"
                                                        >
                                                            Saldar
                                                        </button>
                                                    </div>
                                                )}

                                                {deliveryDebt > 0 && (
                                                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase text-slate-500">Repartos Locales</p>
                                                            <DualPrice usdAmount={deliveryDebt} usdClassName="text-sm font-bold text-slate-800" showDivider={false} />
                                                        </div>
                                                        <button
                                                            onClick={() => handleClearDeliveryDebt(rest.id, deliveryDebt, rest.name)}
                                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors"
                                                        >
                                                            Saldar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB: COMISIONES CONDUCTORES UN 2X3 */}
            {activeTab === 'commissions' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3">
                    {/* 1. Métricas Globales de Deuda y Comisiones */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between text-slate-400 mb-2">
                                <span className="text-xs font-black uppercase tracking-wider">Deuda Total Conductores</span>
                                <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                            </div>
                            <div>
                                <DualPrice usdAmount={totalDriversDebt} usdClassName="text-2xl font-black text-slate-900" showDivider={false} />
                                <p className="text-[10px] text-slate-400 font-bold mt-1">Acumulado en toda la plataforma</p>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between text-slate-400 mb-2">
                                <span className="text-xs font-black uppercase tracking-wider">Por Auditar (Pago Móvil)</span>
                                <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <Clock className="w-5 h-5" />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-black text-slate-900">{pendingCommissionPayments.length}</span>
                                    <span className="text-xs font-bold text-slate-400">comprobantes</span>
                                </div>
                                <p className="text-[10px] text-blue-600 font-bold mt-1">Pendientes de revisión admin</p>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between text-slate-400 mb-2">
                                <span className="text-xs font-black uppercase tracking-wider">Suspendidos / Bloqueados</span>
                                <div className="w-9 h-9 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                                    <ShieldAlert className="w-5 h-5" />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-black text-red-600">{suspendedDrivers.length}</span>
                                    <span className="text-xs font-bold text-slate-400">conductores</span>
                                </div>
                                <p className="text-[10px] text-red-500 font-bold mt-1">Deuda ≥ $15 o límite vencido</p>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between text-slate-400 mb-2">
                                <span className="text-xs font-black uppercase tracking-wider">Normativa de Tolerancia</span>
                                <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                            </div>
                            <div>
                                <span className="text-sm font-black text-slate-900 block">15 Días Continuos</span>
                                <p className="text-[10px] text-slate-400 font-bold mt-1">Tope máximo $15 USD de crédito</p>
                            </div>
                        </div>
                    </div>

                    {/* 2. Bandeja de Auditoría de Comprobantes de Pago */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-amber-500" />
                                    Bandeja de Auditoría de Comprobantes de Pago Móvil
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">Revisa las transferencias reportadas por los pilotos y aprueba el abono a su cuenta.</p>
                            </div>

                            {/* Filter Status Pills */}
                            <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
                                {(
                                    [
                                        { key: 'pending', label: `Pendientes (${pendingCommissionPayments.length})` },
                                        { key: 'approved', label: 'Aprobados' },
                                        { key: 'rejected', label: 'Rechazados' },
                                        { key: 'all', label: 'Todos' }
                                    ] as const
                                ).map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => setPaymentStatusFilter(f.key)}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                                            paymentStatusFilter === f.key
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {filteredCommissionPayments.length === 0 ? (
                            <div className="text-center py-12">
                                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                                <h4 className="font-bold text-slate-800 text-sm">Sin comprobantes en esta categoría</h4>
                                <p className="text-xs text-slate-400">No hay registros con el filtro seleccionado.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredCommissionPayments.map(payment => {
                                    const driverObj = drivers.find(d => d.id === payment.driver_id);
                                    const driverName = payment.driver_name || driverObj?.fullName || 'Piloto';
                                    const driverPhone = driverObj?.phone || payment.driver_phone || 'N/A';
                                    const isProcessing = processingPaymentId === payment.id;

                                    return (
                                        <div
                                            key={payment.id}
                                            className={`rounded-2xl border p-5 transition-all space-y-4 ${
                                                payment.status === 'pending'
                                                    ? 'bg-amber-50/40 border-amber-200/80 shadow-sm'
                                                    : payment.status === 'approved'
                                                    ? 'bg-emerald-50/30 border-emerald-200/60'
                                                    : 'bg-red-50/30 border-red-200/60'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-slate-800 text-sm shadow-xs">
                                                        <User className="w-5 h-5 text-slate-600" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-slate-900 text-sm">{driverName}</h4>
                                                        <p className="text-[11px] text-slate-500 font-medium">Tlf: {driverPhone}</p>
                                                    </div>
                                                </div>

                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                    payment.status === 'pending'
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                        : payment.status === 'approved'
                                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                        : 'bg-red-100 text-red-800 border border-red-200'
                                                }`}>
                                                    {payment.status === 'pending' ? 'Pendiente' : payment.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                                                </span>
                                            </div>

                                            {/* Data details */}
                                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 grid grid-cols-2 gap-3 text-xs">
                                                <div>
                                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Monto Liquidado</span>
                                                    <span className="font-black text-slate-900 text-base">${Number(payment.amount_usd || 0).toFixed(2)} USD</span>
                                                    <span className="text-[11px] font-bold text-amber-600 block">
                                                        ≈ {payment.amount_bs ? `${payment.amount_bs} Bs` : ''}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Referencia Pago Móvil</span>
                                                    <span className="font-mono font-black text-slate-800 text-sm">{payment.reference_number || 'N/A'}</span>
                                                    <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                                                        {new Date(payment.created_at).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>

                                            {payment.admin_notes && (
                                                <div className="bg-red-50 p-2.5 rounded-xl border border-red-100 text-xs text-red-700">
                                                    <span className="font-bold block text-[10px] uppercase">Nota administrativa de rechazo:</span>
                                                    {payment.admin_notes}
                                                </div>
                                            )}

                                            {/* Proof Image Preview */}
                                            <div className="flex items-center justify-between pt-1">
                                                {payment.receipt_url ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedProofImg(payment.receipt_url)}
                                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
                                                    >
                                                        <ImageIcon className="w-4 h-4" />
                                                        Ver Comprobante Adjunto
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Sin captura adjunta</span>
                                                )}

                                                {/* Action Buttons for Pending Payments */}
                                                {payment.status === 'pending' && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            disabled={isProcessing}
                                                            onClick={() => handleRejectCommissionPayment(payment)}
                                                            className="px-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-xl text-xs transition-colors"
                                                        >
                                                            Rechazar
                                                        </button>
                                                        <button
                                                            disabled={isProcessing}
                                                            onClick={() => handleApproveCommissionPayment(payment)}
                                                            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                            Aprobar Pago
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 3. Tabla de Monitoreo de Deuda y Estado de Conductores */}
                    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-6">
                        <div>
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-primary" />
                                Monitoreo de Conductores y Límites de Comisión
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">
                                Lista de conductores con deuda acumulada, plazos de liquidación y control de suspensión.
                            </p>
                        </div>

                        {filteredDriversDebt.length === 0 ? (
                            <div className="text-center py-12">
                                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                                <h4 className="font-bold text-slate-800 text-sm">Todos los conductores están al día</h4>
                                <p className="text-xs text-slate-400">No hay pilotos con deuda acumulada ni suspensiones activas.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[700px]">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                            <th className="p-3.5 font-bold border-b border-slate-200">Conductor</th>
                                            <th className="p-3.5 font-bold border-b border-slate-200">Frecuencia</th>
                                            <th className="p-3.5 font-bold border-b border-slate-200">Límite Tolerancia</th>
                                            <th className="p-3.5 font-bold border-b border-slate-200">Deuda Comisión</th>
                                            <th className="p-3.5 font-bold border-b border-slate-200">Estatus</th>
                                            <th className="p-3.5 font-bold border-b border-slate-200 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDriversDebt.map(driver => {
                                            const debt = Number(driver.commissionDebt || 0);
                                            const isSuspended = driver.commissionStatus === 'suspended' || debt >= 15;

                                            return (
                                                <tr key={driver.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                                    <td className="p-3.5">
                                                        <p className="font-bold text-slate-900 text-sm">{driver.fullName}</p>
                                                        <p className="text-xs text-slate-500 font-mono">Tlf: {driver.phone || 'N/A'} • CI: {driver.cedula || 'N/A'}</p>
                                                    </td>
                                                    <td className="p-3.5 text-xs font-medium text-slate-600">
                                                        <span className="capitalize">
                                                            {driver.payoutFrequency === 'biweekly' ? 'Quincenal' : driver.payoutFrequency === 'weekly_monday' ? 'Lunes Semanal' : 'Viernes Semanal'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3.5 text-xs">
                                                        {driver.nextCommissionDeadline ? (
                                                            <div>
                                                                <span className="font-bold text-slate-700 block">
                                                                    {new Date(driver.nextCommissionDeadline).toLocaleDateString()}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-medium">15 días continuos</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 italic">Pendiente de inicio</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3.5">
                                                        <span className={`text-base font-black ${debt >= 15 ? 'text-red-600' : debt > 10 ? 'text-amber-600' : 'text-slate-900'}`}>
                                                            ${debt.toFixed(2)} USD
                                                        </span>
                                                        {bcvRate > 0 && (
                                                            <p className="text-[10px] text-slate-400 font-bold">
                                                                ≈ {(debt * bcvRate).toFixed(2)} Bs
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td className="p-3.5">
                                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                            isSuspended
                                                                ? 'bg-red-100 text-red-800 border border-red-200'
                                                                : debt > 10
                                                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                        }`}>
                                                            {isSuspended ? 'Suspendido' : debt > 10 ? 'En Riesgo' : 'Al Día'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3.5 text-right">
                                                        <button
                                                            onClick={() => handleAdjustDriverDebt(driver)}
                                                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                                                        >
                                                            Ajustar Saldo
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'drivers' && (
                <div className="space-y-4">
                    {filteredDrivers.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                            <h3 className="font-bold text-slate-900">Sin pagos pendientes</h3>
                            <p className="text-slate-500 text-sm">Todos los pilotos han sido liquidados.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {filteredDrivers.map(driver => (
                                <div key={driver.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                                    <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                                                <User className="w-6 h-6 text-primary" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-slate-900">{driver.fullName}</h3>
                                                    {driver.hasRequested && (
                                                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-black rounded-full animate-pulse">
                                                            PAGO SOLICITADO
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm font-medium text-slate-500">{driver.phone || 'Sin teléfono'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase font-bold text-slate-400">Total a Liquidar</p>
                                            <DualPrice usdAmount={driver.totalUnpaid} usdClassName="text-2xl font-black text-slate-900" showDivider={false} className="flex flex-col items-end" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <p className="text-[10px] uppercase font-bold text-slate-400">Envíos (Delivery)</p>
                                            <p className="text-lg font-bold text-slate-800">{driver.unpaidOrders.length}</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <p className="text-[10px] uppercase font-bold text-slate-400">Viajes (Transporte)</p>
                                            <p className="text-lg font-bold text-slate-800">{driver.unpaidTransports.length}</p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-blue-50 text-blue-900 rounded-2xl border border-blue-100 mb-6">
                                        <div className="flex justify-between items-center mb-2">
                                            <p className="text-xs uppercase font-bold tracking-wider">Datos Bancarios (Pago Móvil)</p>
                                            {driver.paymentMobile?.phone && (
                                                <button 
                                                    onClick={() => copyPaymentInfo(driver)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-blue-700 border border-blue-200 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-blue-50 active:scale-95 transition-all"
                                                >
                                                    <Copy className="w-3 h-3" /> Copiar Datos
                                                </button>
                                            )}
                                        </div>
                                        {driver.paymentMobile?.phone ? (
                                            <div className="text-sm font-medium space-y-1">
                                                <p><span className="font-bold">Banco:</span> {driver.paymentMobile.bank}</p>
                                                <p><span className="font-bold">Cédula:</span> {driver.paymentMobile.cedula}</p>
                                                <p><span className="font-bold">Teléfono:</span> {driver.paymentMobile.phone}</p>
                                            </div>
                                        ) : (
                                            <p className="text-sm italic opacity-75">No ha registrado datos de Pago Móvil.</p>
                                        )}
                                    </div>

                                    <button 
                                        onClick={() => handlePayDriver(driver)}
                                        className="w-full py-3 bg-primary text-slate-900 rounded-xl font-bold hover:brightness-105 transition-all shadow-md"
                                    >
                                        Marcar como Pagado
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    {payoutsHistory.length === 0 ? (
                        <div className="text-center py-12">
                            <History className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium">No hay registros de liquidaciones aún.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[600px]">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold border-b border-slate-200">Fecha</th>
                                        <th className="p-4 font-bold border-b border-slate-200">Receptor / Local</th>
                                        <th className="p-4 font-bold border-b border-slate-200">Concepto</th>
                                        <th className="p-4 font-bold border-b border-slate-200 text-right">Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payoutsHistory.map((record) => (
                                        <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                            <td className="p-4 text-sm font-medium text-slate-600">
                                                {new Date(record.paidAt).toLocaleString()}
                                            </td>
                                            <td className="p-4">
                                                <div>
                                                    <p className="font-bold text-slate-800">{record.targetName}</p>
                                                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${record.targetType === 'driver' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                        {record.targetType === 'driver' ? 'Piloto' : 'Restaurante'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-xs font-medium text-slate-500 leading-tight">
                                                {record.description}
                                            </td>
                                            <td className="p-4 text-right">
                                                <DualPrice usdAmount={record.amountPaid} usdClassName="font-black text-slate-900" showDivider={false} className="flex flex-col items-end" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Modal Comprobante */}
            {selectedProofImg && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h4 className="font-black text-slate-900 text-base">Comprobante de Pago Móvil</h4>
                            <div className="flex items-center gap-2">
                                <a
                                    href={selectedProofImg}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                                    title="Abrir en pestaña nueva"
                                >
                                    <ExternalLink className="w-5 h-5" />
                                </a>
                                <button
                                    onClick={() => setSelectedProofImg(null)}
                                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-50 rounded-2xl p-2">
                            <img
                                src={selectedProofImg}
                                alt="Comprobante"
                                className="max-h-[65vh] w-auto object-contain rounded-xl shadow-sm"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400?text=Error+Cargando+Imagen';
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
