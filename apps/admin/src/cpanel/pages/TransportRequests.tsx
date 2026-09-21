import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Car, Bike, Clock, CheckCircle2, XCircle, Search, Calendar, DollarSign, MapPin, User, ShieldCheck, Upload, Image as ImageIcon, MessageSquare, Star, Phone, MessageCircle, ShoppingBag, Store, Navigation, Map, SlidersHorizontal, Volume2, X } from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import RideChat from '../../components/RideChat';
import DualPrice from '../../components/DualPrice';
import { useCurrency } from '../../context/CurrencyContext';

const formatDuration = (seconds: number) => {
    if (!seconds && seconds !== 0) return '--';
    const absSeconds = Math.abs(seconds);
    const m = Math.floor(absSeconds / 60);
    const s = absSeconds % 60;
    return `${seconds < 0 ? '-' : ''}${m}m ${s}s`;
};

const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: true,
    clickableIcons: false,
};

export default function TransportRequests() {
    const { bcvRate } = useCurrency();
    const [requests, setRequests] = useState<any[]>([]);
    
    const validRequests = Array.isArray(requests) ? requests : [];

    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, verifying_payment, finding_driver, in_progress, completed, cancelled
    const [searchTerm, setSearchTerm] = useState('');
    const [view, setView] = useState<'viajes' | 'contabilidad' | 'comprobantes'>('viajes');
    const [selectedChatRequest, setSelectedChatRequest] = useState<string | null>(null);

    const [showPayoutModal, setShowPayoutModal] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<any>(null);
    const [payoutReceipt, setPayoutReceipt] = useState<File | null>(null);
    const [payoutLoading, setPayoutLoading] = useState(false);

    // Map States
    const [showMapModal, setShowMapModal] = useState(false);
    const [selectedMapRequest, setSelectedMapRequest] = useState<any>(null);

    // Mandado Audit States
    const [selectedMandadoAudit, setSelectedMandadoAudit] = useState<any | null>(null);
    const [mandadoBidsList, setMandadoBidsList] = useState<any[]>([]);
    const [loadingBids, setLoadingBids] = useState(false);

    const handleOpenMandadoAudit = async (req: any) => {
        setSelectedMandadoAudit(req);
        setLoadingBids(true);
        setMandadoBidsList([]);
        try {
            const { data, error } = await supabase
                .from('transport_bids')
                .select('*')
                .eq('transport_request_id', req.id)
                .order('created_at', { ascending: false });
            if (!error && data) {
                setMandadoBidsList(data);
            }
        } catch (e) {
            console.error("Error fetching mandado bids:", e);
        } finally {
            setLoadingBids(false);
        }
    };

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: "AIzaSyAT2_wZfYTBGDR7gEpLXRzG-BUQ9Cbu0aQ",
        libraries: ['places', 'geometry'] as any
    });

    const lastRequestTimestamp = useRef<number>(Date.now());

    const fetchRequests = async () => {
        try {
            const { data, error } = await supabase
                .from('transport_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                const mapped = data.map(d => ({
                    ...d,
                    id: d.id,
                    createdAt: d.created_at,
                    orderId: d.order_id || d.orderId,
                    driverId: d.driver_id || d.driverId,
                    driverName: d.driver_name || d.driverName,
                    driverPayout: d.driver_payout || d.driverPayout,
                    driverPaid: d.driver_paid !== undefined ? d.driver_paid : d.driverPaid,
                    paymentProof: d.payment_proof || d.paymentProof,
                    paymentProofUrl: d.payment_proof_url || d.paymentProofUrl,
                    assignedDriverId: d.assigned_driver_id || d.assignedDriverId
                }));
                setRequests(mapped);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();

        const channel = supabase.channel('transport_requests_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, (payload) => {
                fetchRequests();
                if (payload.eventType === 'INSERT') {
                    const newReq = payload.new;
                    if (newReq?.status === 'verifying_payment' || newReq?.status === 'searching') {
                        try {
                            const audio = new Audio('/Digital_Cascade_01.mp3');
                            audio.play().catch(e => console.error("Error playing audio:", e));
                        } catch (e) {}
                        toast.success(`¡Nuevo ${newReq.service_type || 'servicio'} solicitado!`, {
                            duration: 5000,
                            icon: '🔔'
                        });
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleVerifyPayment = async (req: any, isApproved: boolean) => {
        const id = req.id;
        try {
            await supabase.from('transport_requests').update({
                status: isApproved ? 'searching' : 'cancelled',
                updated_at: new Date().toISOString()
            }).eq('id', id);

            // If it's linked to an order, update the order as well
            if (req.orderId) {
                await supabase.from('orders').update({
                    status: isApproved ? 'buscando_piloto' : 'pendiente_pago_delivery',
                    delivery_payment_status: isApproved ? 'approved' : 'rejected'
                }).eq('id', req.orderId);
            }

            if (isApproved) {
                const { data: drivers } = await supabase.from('profiles').select('id').in('role', ['delivery', 'driver']);
                if (drivers && drivers.length > 0) {
                    const notifs = drivers.map(driverDoc => ({
                        user_id: driverDoc.id,
                        title: '¡Nuevo Servicio de Taxi Disponible!',
                        body: 'Un administrador ha verificado el pago. ¡Hay una solicitud esperándote!',
                        read: false,
                        created_at: new Date().toISOString()
                    }));
                    await supabase.from('notifications').insert(notifs);
                }
            }

            toast.success(isApproved ? 'Pago verificado. Buscando conductor...' : 'Solicitud cancelada');
            fetchRequests();
        } catch (error) {
            console.error("Error updating status:", error);
            toast.error("Hubo un error al actualizar la solicitud");
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("¿Estás seguro de que deseas eliminar este registro histórico?")) {
            try {
                const { error } = await supabase.from('transport_requests').delete().eq('id', id);
                if (error) throw error;
                toast.success('Registro eliminado');
                fetchRequests();
            } catch (error) {
                console.error("Error deleting record:", error);
                toast.error("Error al eliminar el registro");
            }
        }
    };

    const handleDeleteProof = async (req: any) => {
        if (!window.confirm("¿Segur@ que deseas eliminar este comprobante para liberar espacio? La imagen se borrará del servidor.")) return;
        
        try {
            const proofUrl = req.paymentProofUrl || req.paymentProof;
            if (proofUrl) {
                const path = proofUrl.split('/store_assets/')[1] || proofUrl.split('/documents/')[1] || proofUrl;
                try {
                    await supabase.storage.from('store_assets').remove([path]);
                    await supabase.storage.from('documents').remove([path]);
                } catch (e) {
                    console.error("Warning: Error deleting physical file", e);
                }
            }
            
            // Remove the reference from the document
            await supabase.from('transport_requests').update({
                payment_proof: null,
                payment_proof_url: null
            }).eq('id', req.id);

            toast.success("Comprobante eliminado");
            fetchRequests();
        } catch (error) {
            console.error("Error deleting proof:", error);
            toast.error("Error al actualizar la solicitud");
        }
    };

    const filteredRequests = validRequests.filter(req => {
        if (!req) return false;
        if (filter !== 'all') {
            if (filter === 'muchacho_mandado') {
                const isMandado = req.service_category === 'muchacho_mandado' || req.type === 'muchacho_mandado' || !!req.mandado_details;
                if (!isMandado) return false;
            } else if (filter === 'in_progress') {
                if (!['accepted', 'arriving', 'in_progress'].includes(req.status)) return false;
            } else {
                if (req.status !== filter) return false;
            }
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (
                req.userPhone?.toLowerCase().includes(term) ||
                req.id?.toLowerCase().includes(term) ||
                req.userName?.toLowerCase().includes(term)
            );
        }
        return true;
    });

    const getDriverStats = () => {
        const stats: Record<string, {
            driverId: string;
            driverName: string;
            driverPhone: string;
            weeklyDebt: number;
            lifetimeEarnings: number;
            unpaidTrips: any[];
            totalTripsCount: number;
            adminProfit: number;
        }> = {};

        validRequests.filter(r => r && r.status === 'completed').forEach(req => {
            const { driverId, driverName, driverPhone, driverPayout, clientTotal, driverPaid } = req;
            const payout = parseFloat(driverPayout || req.price || 0);
            const total = parseFloat(clientTotal || req.price || 0);
            const profit = total - payout;

            if (driverId) {
                if (!stats[driverId]) {
                    stats[driverId] = {
                        driverId,
                        driverName: driverName || 'Desconocido',
                        driverPhone: driverPhone || '',
                        weeklyDebt: 0,
                        lifetimeEarnings: 0,
                        unpaidTrips: [],
                        totalTripsCount: 0,
                        adminProfit: 0
                    };
                }

                stats[driverId].totalTripsCount += 1;
                stats[driverId].adminProfit += profit;

                if (driverPaid) {
                    stats[driverId].lifetimeEarnings += payout;
                } else {
                    stats[driverId].weeklyDebt += payout;
                    stats[driverId].unpaidTrips.push(req);
                }
            }
        });

        return Object.values(stats);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'verifying_payment': return <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-black animate-pulse">PAGO POR VERIFICAR</span>;
            case 'searching': return <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold">Buscando Conductor</span>;
            case 'accepted': return <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">Conductor Asignado</span>;
            case 'in_progress': return <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold">En Viaje</span>;
            case 'completed': return <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-full text-xs font-bold">Completado</span>;
            case 'cancelled': return <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">Cancelado</span>;
            default: return <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-full text-xs font-bold uppercase">{status}</span>;
        }
    };

    const handleProcessPayout = async () => {
        if (!selectedDriver || selectedDriver.unpaidTrips.length === 0) return;
        if (!payoutReceipt) {
            toast.error("Debes adjuntar el comprobante de pago");
            return;
        }

        setPayoutLoading(true);
        try {
            // Upload receipt
            const ext = payoutReceipt.name.split('.').pop() || 'jpg';
            const filePath = `payout_receipts/${selectedDriver.driverId}_${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage
                .from('store_assets')
                .upload(filePath, payoutReceipt, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl: receiptUrl } } = supabase.storage
                .from('store_assets')
                .getPublicUrl(filePath);

            // Update all unpaid trips
            const tripIds = selectedDriver.unpaidTrips.map((trip: any) => trip.id);
            if (tripIds.length > 0) {
                const { error: updateError } = await supabase
                    .from('transport_requests')
                    .update({
                        driver_paid: true,
                        driverPaid: true,
                        payout_receipt_url: receiptUrl,
                        payoutReceiptUrl: receiptUrl,
                        payout_date: new Date().toISOString(),
                        payoutDate: new Date().toISOString()
                    })
                    .in('id', tripIds);

                if (updateError) throw updateError;
            }

            // Notify driver
            const bsAmount = selectedDriver.weeklyDebt * bcvRate;
            await supabase.from('notifications').insert([{
                user_id: selectedDriver.driverId,
                userId: selectedDriver.driverId,
                title: '¡Pago Recibido!',
                body: `Se ha procesado tu pago de $${selectedDriver.weeklyDebt.toFixed(2)} (${bsAmount.toFixed(2)} Bs). Revisa el comprobante en tu historial.`,
                read: false,
                created_at: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                payout_receipt_url: receiptUrl,
                payoutReceiptUrl: receiptUrl
            }]);

            toast.success(`Pago procesado con éxito para ${selectedDriver.driverName}`);
            setShowPayoutModal(false);
            setSelectedDriver(null);
            setPayoutReceipt(null);
            fetchRequests();
        } catch (error) {
            console.error("Error processing payout:", error);
            toast.error("Hubo un error al procesar el pago");
        } finally {
            setPayoutLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] w-full py-20">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-slate-500 font-black animate-pulse uppercase tracking-widest text-xs">Cargando Solicitudes...</p>
            </div>
        );
    }


    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Gestión y Contabilidad Taxis</h1>
                    <p className="text-slate-500 font-medium mt-1">Supervisa viajes y administra pagos a choferes.</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                        onClick={() => setView('viajes')}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${view === 'viajes' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Viajes
                    </button>
                    <button
                        onClick={() => setView('contabilidad')}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${view === 'contabilidad' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Contabilidad
                    </button>
                    <button
                        onClick={() => setView('comprobantes')}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${view === 'comprobantes' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Comprobantes
                    </button>
                </div>
            </div>

            {view === 'viajes' ? (
                <>
                    {/* Filters */}
                    <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                        <div className="relative w-full md:w-96">
                            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por ID, nombre o teléfono..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-50 border-none pl-12 pr-4 py-3 rounded-2xl focus:ring-2 focus:ring-primary font-medium"
                            />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
                            {['all', 'verifying_payment', 'searching', 'in_progress', 'completed', 'muchacho_mandado'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-4 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${filter === f ? 'bg-primary text-slate-900 shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                >
                                    {f === 'all' ? 'Todos' :
                                        f === 'verifying_payment' ? 'Por Verificar' :
                                            f === 'searching' ? 'Buscando' :
                                                f === 'in_progress' ? 'En Curso' : 
                                                    f === 'muchacho_mandado' ? "🛍️ Muchacho e' Mandao" : 'Completados'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* List */}
                    <div className="space-y-4">
                        {filteredRequests.length === 0 ? (
                            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
                                <Car className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-slate-900">No hay viajes</h3>
                                <p className="text-slate-500 mt-2">No se encontraron solicitudes con los filtros actuales.</p>
                            </div>
                        ) : (
                            filteredRequests.map((req) => {
                                const isMandado = req.service_category === 'muchacho_mandado' || req.type === 'muchacho_mandado' || !!req.mandado_details;
                                return (
                                <div key={req.id} className="bg-white rounded-3xl p-5 md:p-6 border border-slate-200 shadow-sm transition-all hover:shadow-md">
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start mb-4">
                                        {/* Col 1: Trip & Passenger Info */}
                                        <div className="lg:col-span-4 space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                                                    isMandado
                                                        ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                                                        : req.type === 'food_delivery' 
                                                            ? 'bg-orange-100 text-orange-600'
                                                            : req.vehicleType === 'moto' 
                                                                ? 'bg-primary/20 text-slate-900' 
                                                                : 'bg-slate-100 text-slate-700'
                                                }`}>
                                                    {isMandado ? (
                                                        <ShoppingBag className="w-6 h-6" />
                                                    ) : req.type === 'food_delivery' ? (
                                                        <ShoppingBag className="w-6 h-6" />
                                                    ) : req.vehicleType === 'moto' ? (
                                                        <Bike className="w-6 h-6" />
                                                    ) : (
                                                        <Car className="w-6 h-6" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                                        <span className="font-black text-slate-900 text-base uppercase">
                                                            ID: {req.id.slice(0, 6)}
                                                        </span>
                                                        {getStatusBadge(req.status)}
                                                        {isMandado && (
                                                            <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full text-[10px] font-black shadow-sm">
                                                                🛍️ Muchacho e' Mandao
                                                            </span>
                                                        )}
                                                        {req.scheduled && (
                                                            <span className="bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1">
                                                                <Clock className="w-3 h-3" /> RESERVA
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        {req.scheduled ? (
                                                            <span className="text-primary font-black">
                                                                Para: {(() => {
                                                                    const d = req.scheduledAt?.toDate ? req.scheduledAt.toDate() : (req.scheduledAt ? new Date(req.scheduledAt) : null);
                                                                    return d && !isNaN(d.getTime()) ? d.toLocaleString('es-VE') : 'Fecha pendiente';
                                                                })()}
                                                            </span>
                                                        ) : (
                                                            (() => {
                                                                const d = req.createdAt?.toDate ? req.createdAt.toDate() : (req.createdAt ? new Date(req.createdAt) : null);
                                                                return d && !isNaN(d.getTime()) ? d.toLocaleString('es-VE') : 'Fecha desconocida';
                                                            })()
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Client & Driver Details */}
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 text-xs">
                                                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cliente</span>
                                                        <span className="font-black text-slate-800 truncate block">{req.userName}</span>
                                                    </div>
                                                    {req.userCedula && (
                                                        <span className="text-[10px] font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">
                                                            C.I: {req.userCedula}
                                                        </span>
                                                    )}
                                                    {req.userPhone && (
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <a href={`tel:${req.userPhone}`} className="w-6 h-6 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-primary transition-colors" title="Llamar">
                                                                <Phone className="w-3 h-3" />
                                                            </a>
                                                            <a href={`https://wa.me/${req.userPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-6 h-6 bg-white rounded-lg border border-emerald-200 flex items-center justify-center text-emerald-500 hover:bg-emerald-50 transition-colors" title="WhatsApp">
                                                                <MessageCircle className="w-3 h-3" />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>

                                                {req.driverId ? (
                                                    <div className="flex items-center gap-2 bg-primary/5 px-3 py-2 rounded-xl border border-primary/20 text-xs">
                                                        {req.vehicleType === 'moto' ? <Bike className="w-4 h-4 text-primary shrink-0" /> : <Car className="w-4 h-4 text-primary shrink-0" />}
                                                        <div className="flex-1 min-w-0">
                                                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Piloto Asignado</span>
                                                            <span className="font-black text-slate-800 truncate block">{req.driverName || 'Desconocido'}</span>
                                                        </div>
                                                        {req.driverPhone && (
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <a href={`tel:${req.driverPhone}`} className="w-6 h-6 bg-white rounded-lg border border-primary/20 flex items-center justify-center text-slate-600 hover:text-primary transition-colors" title="Llamar Piloto">
                                                                    <Phone className="w-3 h-3" />
                                                                </a>
                                                                <a href={`https://wa.me/${req.driverPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-6 h-6 bg-white rounded-lg border border-emerald-200 flex items-center justify-center text-emerald-500 hover:bg-emerald-50 transition-colors" title="WhatsApp Piloto">
                                                                    <MessageCircle className="w-3 h-3" />
                                                                </a>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-[11px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl border border-dashed border-slate-200 text-center">
                                                        Sin chofer asignado aún
                                                    </div>
                                                )}

                                                {req.assignedDriverId && (
                                                    <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 text-amber-900 text-xs font-bold">
                                                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
                                                        <span className="truncate">Selección directa: {req.assignedDriverId.slice(0, 8)}...</span>
                                                    </div>
                                                )}

                                                {((req.driverAssignedAt && req.driverArrivedAt) || req.arrivalDuration !== undefined) && (
                                                    <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 text-xs font-bold">
                                                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                                                        <span>Llegó en: {req.arrivalDuration !== undefined ? (
                                                            formatDuration(req.arrivalDuration)
                                                        ) : (() => {
                                                            const arr = req.driverArrivedAt?.toDate ? req.driverArrivedAt.toDate().getTime() : (req.driverArrivedAt ? new Date(req.driverArrivedAt).getTime() : 0);
                                                            const ass = req.driverAssignedAt?.toDate ? req.driverAssignedAt.toDate().getTime() : (req.driverAssignedAt ? new Date(req.driverAssignedAt).getTime() : 0);
                                                            return (arr && ass) ? `${Math.max(1, Math.round((arr - ass) / 60000))} min` : '--';
                                                        })()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Col 2: Route Points & Mandado Details */}
                                        <div className="lg:col-span-5 space-y-3">
                                            {isMandado && (
                                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
                                                            🛍️ Detalle del Encargo:
                                                        </span>
                                                        {req.mandado_details?.storeName && (
                                                            <span className="text-xs font-black text-slate-800 bg-white px-2 py-0.5 rounded-lg border border-amber-200">
                                                                🏪 {req.mandado_details.storeName}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-800 bg-white p-2.5 rounded-xl border border-amber-200/60 leading-relaxed">
                                                        {req.mandado_details?.description || req.packageDescription || req.notes || 'Encargo personalizado solicitado por el cliente.'}
                                                    </p>
                                                    {(req.mandado_details?.audioUrl || req.audio_url) && (
                                                        <div className="bg-white border border-amber-200 p-2 rounded-xl">
                                                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-900 tracking-wider mb-1">
                                                                <Volume2 className="w-3 h-3 text-amber-600" />
                                                                Nota de Voz:
                                                            </div>
                                                            <audio 
                                                                controls 
                                                                src={req.mandado_details?.audioUrl || req.audio_url} 
                                                                className="w-full h-7 accent-amber-500 rounded"
                                                                preload="metadata"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="space-y-2">
                                                <div className="flex gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-100 relative overflow-hidden">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-400"></div>
                                                    {req.type === 'food_delivery' ? (
                                                        <Store className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                                    ) : (
                                                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">
                                                            {req.type === 'food_delivery' ? 'Punto A: Comercio' : 'Origen'}
                                                        </p>
                                                        <p className="font-bold text-slate-700 text-xs line-clamp-2">{req.origin?.address}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2.5 bg-primary/10 p-3 rounded-2xl border border-primary/20 relative overflow-hidden">
                                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
                                                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-bold text-slate-600 uppercase leading-none mb-1">
                                                            {req.type === 'food_delivery' ? 'Punto B: Cliente' : 'Destino'}
                                                        </p>
                                                        <p className="font-bold text-slate-900 text-xs line-clamp-2">{req.destination?.address}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Col 3: Financial Info & Actions */}
                                        <div className="lg:col-span-3 bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex flex-col justify-between space-y-4">
                                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                                                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Tarifa</p>
                                                    <DualPrice usdAmount={parseFloat(req.clientTotal || req.price || 0)} usdClassName="text-xl font-black text-emerald-600" showDivider={false} className="flex flex-col" />
                                                </div>
                                                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none mb-1.5">Comisión de la aplicación</p>
                                                    <DualPrice usdAmount={parseFloat(req.commission_amount !== undefined ? req.commission_amount : 0.70)} usdClassName="text-lg font-black text-amber-600" showDivider={false} className="flex flex-col" />
                                                </div>
                                            </div>

                                            <div className="space-y-2 pt-2 border-t border-slate-200/60">
                                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200">
                                                    <span className="flex items-center gap-1">
                                                        <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Método:
                                                    </span>
                                                    <span className="font-black text-slate-900">{req.paymentMethod === 'pagoMovil' ? 'Pago Móvil' : req.paymentMethod === 'cash' ? 'Efectivo' : req.paymentMethod}</span>
                                                </div>

                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {isMandado && (
                                                        <button
                                                            onClick={() => handleOpenMandadoAudit(req)}
                                                            className="flex-1 bg-amber-400 hover:bg-amber-500 text-slate-950 px-2.5 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-colors shadow-sm"
                                                        >
                                                            <SlidersHorizontal className="w-3.5 h-3.5" /> Subasta
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setSelectedChatRequest(req.id)}
                                                        className="flex-1 bg-white hover:bg-primary/20 text-slate-900 px-2.5 py-2 rounded-xl text-xs font-bold border border-slate-200 flex items-center justify-center gap-1 transition-colors shadow-sm"
                                                    >
                                                        <MessageSquare className="w-3.5 h-3.5 text-primary" /> Chat
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedMapRequest(req);
                                                            setShowMapModal(true);
                                                        }}
                                                        className="flex-1 bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors shadow-sm"
                                                    >
                                                        <Navigation className="w-3.5 h-3.5" /> GPS
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Payment Verification Action Area */}
                                    {req.status === 'verifying_payment' && req.paymentMethod !== 'cash' && (
                                        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 w-full">
                                                <div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center shrink-0 text-amber-700">
                                                    <ShieldCheck className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-amber-900">Verificación de Pago Requerida</p>
                                                    <p className="text-sm text-amber-700 font-medium">Ref: <span className="font-black">{req.paymentRef || 'No adjunta'}</span></p>
                                                    {(req.paymentProofUrl || req.paymentProof) && (
                                                        <a
                                                            href={req.paymentProofUrl || req.paymentProof}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="block mt-3 rounded-xl overflow-hidden border border-amber-200 hover:border-amber-400 transition-colors bg-white/50"
                                                        >
                                                            <img 
                                                                src={req.paymentProofUrl || req.paymentProof} 
                                                                alt="Comprobante de Pago" 
                                                                className="max-h-48 w-auto object-contain mx-auto"
                                                                onError={(e) => {
                                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                                }}
                                                            />
                                                            <div className="text-center py-1 bg-amber-100/50 text-amber-800 text-xs font-bold uppercase tracking-wider">
                                                                Ver Imágen Completa
                                                            </div>
                                                        </a>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex gap-2 w-full md:w-auto">
                                                <button
                                                    onClick={() => handleVerifyPayment(req, false)}
                                                    className="flex-1 md:flex-none px-4 py-2 bg-white text-red-600 font-bold rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
                                                >
                                                    Rechazar
                                                </button>
                                                <button
                                                    onClick={() => handleVerifyPayment(req, true)}
                                                    className="flex-1 md:flex-none px-6 py-2 bg-primary text-slate-900 font-black rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                                                >
                                                    Aprobar Pago
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Cash Payment Verification Action Area */}
                                    {req.status === 'verifying_payment' && req.paymentMethod === 'cash' && (
                                        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 w-full">
                                                <div className="w-10 h-10 bg-emerald-200 rounded-full flex items-center justify-center shrink-0 text-emerald-700">
                                                    <DollarSign className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-emerald-900">Pago en Efectivo (Al chofer)</p>
                                                    <p className="text-sm text-emerald-700 font-medium">Se debe cobrar al finalizar el viaje.</p>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 w-full md:w-auto">
                                                <button
                                                    onClick={() => handleVerifyPayment(req, false)}
                                                    className="flex-1 md:flex-none px-4 py-2 bg-white text-red-600 font-bold rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
                                                >
                                                    Rechazar
                                                </button>
                                                <button
                                                    onClick={() => handleVerifyPayment(req, true)}
                                                    className="flex-1 md:flex-none px-6 py-2 bg-primary text-slate-900 font-black rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                                                >
                                                    Aprobar Vehículo
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Rating Display for Admin */}
                                    {req.status === 'completed' && req.rating && (
                                        <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 animate-in fade-in">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="flex">
                                                    {[1, 2, 3, 4, 5].map((s) => (
                                                        <Star key={s} className={`w-4 h-4 ${req.rating >= s ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                                                    ))}
                                                </div>
                                                <span className="text-xs font-black text-amber-700">CALIFICACIÓN DEL CLIENTE</span>
                                            </div>
                                            {req.ratingComment && (
                                                <p className="text-sm font-medium text-slate-600 italic">"{req.ratingComment}"</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Footer Actions (Delete old records) */}
                                    {(req.status === 'completed' || req.status === 'cancelled') && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                            <button
                                                onClick={() => handleDelete(req.id)}
                                                className="text-xs font-bold text-red-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                            >
                                                Eliminar Registro
                                            </button>
                                        </div>
                                    )}
                                </div>
                                );
                            })
                        )}
                    </div>
                </>
            ) : view === 'contabilidad' ? (
                <div className="space-y-4">
                    {getDriverStats().length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 flex flex-col items-center">
                            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-4">
                                <DollarSign className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">No hay datos de contabilidad</h3>
                            <p className="text-slate-500 mt-2">Aún no hay viajes completados por choferes.</p>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {getDriverStats().map((stat) => (
                                <div key={stat.driverId} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-slate-900 shrink-0">
                                            <User className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-slate-900 text-lg leading-tight">{stat.driverName}</h3>
                                            <p className="text-xs font-bold text-slate-500 mt-0.5">{stat.driverPhone || 'Sin teléfono'}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100">
                                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Deuda</p>
                                            <DualPrice usdAmount={stat.weeklyDebt} usdClassName="text-lg font-black text-rose-700" showDivider={false} className="flex flex-col" />
                                        </div>
                                        <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
                                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Pagado</p>
                                            <DualPrice usdAmount={stat.lifetimeEarnings} usdClassName="text-lg font-black text-emerald-700" showDivider={false} className="flex flex-col" />
                                        </div>
                                    </div>

                                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-6">
                                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Comisión de la aplicación</p>
                                        <DualPrice usdAmount={stat.adminProfit} usdClassName="text-2xl font-black text-amber-700" showDivider={false} className="flex flex-col" />
                                        <p className="text-[10px] font-bold text-amber-600 mt-1 uppercase tracking-tighter">Total de {stat.totalTripsCount} viajes</p>
                                    </div>

                                    <button
                                        disabled={stat.weeklyDebt === 0}
                                        onClick={() => {
                                            setSelectedDriver(stat);
                                            setShowPayoutModal(true);
                                        }}
                                        className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl shadow-slate-900/20 disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-auto"
                                    >
                                        <DollarSign className="w-5 h-5" />
                                        <span>Liquidar Deuda</span>
                                        <DualPrice usdAmount={stat.weeklyDebt} usdClassName="font-black" showDivider={false} className="flex gap-1 items-baseline ml-1" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <h2 className="text-xl font-black text-slate-900 mb-2">Galería de Comprobantes Históricos</h2>
                        <p className="text-slate-500 text-sm">Aquí puedes revisar todas las capturas de pantalla de los pagos móviles enviados por clientes y eliminarlas para ahorrar espacio en el servidor.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {requests.filter(req => req.paymentProofUrl || req.paymentProof).length === 0 ? (
                            <div className="col-span-full bg-slate-50 rounded-3xl p-12 text-center border border-slate-200">
                                <ImageIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-slate-900">No hay comprobantes</h3>
                                <p className="text-slate-500 mt-2">Actualmente no existen capturas adjuntas en la base de datos de viajes.</p>
                            </div>
                        ) : (
                            requests.filter(req => req.paymentProofUrl || req.paymentProof).map(req => (
                                <div key={`proof-${req.id}`} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-indigo-300 transition-colors group">
                                    <a href={req.paymentProofUrl || req.paymentProof} target="_blank" rel="noopener noreferrer" className="relative aspect-[3/4] bg-slate-100 block overflow-hidden">
                                        <img 
                                            src={req.paymentProofUrl || req.paymentProof} 
                                            alt={`Ref ${req.paymentRef}`} 
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            loading="lazy"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <p className="text-white text-xs font-bold truncate">Ref: {req.paymentRef || 'N/A'}</p>
                                        </div>
                                    </a>
                                    <div className="p-3 bg-white flex flex-col gap-2">
                                        <div>
                                            <div className="text-xs font-black text-slate-800 truncate mb-0.5">{req.userName}</div>
                                            <div className="text-[10px] text-slate-500 font-medium">
                                                {(() => {
                                                    const d = req.createdAt?.toDate ? req.createdAt.toDate() : (req.createdAt ? new Date(req.createdAt) : null);
                                                    return d && !isNaN(d.getTime()) ? d.toLocaleDateString() : '';
                                                })()}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteProof(req)}
                                            className="w-full py-1.5 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                                        >
                                            <XCircle className="w-3.5 h-3.5" /> Eliminar
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* GPS Map Modal */}
            <AnimatePresence>
                {showMapModal && selectedMapRequest && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100]"
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
                        >
                            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-black flex items-center gap-2">
                                        <Map className="w-6 h-6 text-primary" />
                                        Rastreo de Viaje
                                    </h3>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
                                        ID: {selectedMapRequest.id} • Cliente: {selectedMapRequest.userName}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setShowMapModal(false)}
                                    className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                                >
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex-1 relative bg-slate-100 min-h-[400px]">
                                {isLoaded ? (
                                    <GoogleMap
                                        mapContainerStyle={{ width: '100%', height: '100%' }}
                                        center={selectedMapRequest.origin?.coords || { lat: 10.4806, lng: -66.9036 }}
                                        zoom={14}
                                        options={mapOptions}
                                    >
                                        {/* Origin Marker */}
                                        {selectedMapRequest.origin?.coords && (
                                            <Marker 
                                                position={selectedMapRequest.origin.coords}
                                                label={{
                                                    text: "A",
                                                    className: "font-black text-white"
                                                }}
                                                title="Punto de Origen"
                                            />
                                        )}
                                        {/* Destination Marker */}
                                        {selectedMapRequest.destination?.coords && (
                                            <Marker 
                                                position={selectedMapRequest.destination.coords}
                                                label={{
                                                    text: "B",
                                                    className: "font-black text-white"
                                                }}
                                                title="Destino"
                                            />
                                        )}
                                    </GoogleMap>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 bg-slate-50 border-t border-slate-200 grid md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Origen (Punto A)</p>
                                    <p className="text-sm font-bold text-slate-700">{selectedMapRequest.origin?.address}</p>
                                </div>
                                <div className="space-y-1 border-l border-slate-200 pl-4">
                                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">Destino (Punto B)</p>
                                    <p className="text-sm font-bold text-slate-900">{selectedMapRequest.destination?.address}</p>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Payout Modal */}
            {showPayoutModal && selectedDriver && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] z-50 overflow-y-auto">
                    <div className="bg-white rounded-3xl w-full max-w-md my-auto relative shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="bg-slate-900 p-6 text-center relative">
                            <button
                                onClick={() => {
                                    setShowPayoutModal(false);
                                    setSelectedDriver(null);
                                    setPayoutReceipt(null);
                                }}
                                className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
                            >
                                <XCircle className="w-8 h-8" />
                            </button>
                            <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-slate-800 shadow-xl">
                                <DollarSign className="w-10 h-10 text-white" />
                            </div>
                            <h2 className="text-2xl font-black text-white">Liquidar Deuda</h2>
                            <p className="text-slate-400 font-medium mt-1">Sube el comprobante de pago</p>
                        </div>

                        <div className="p-6">
                            {/* Driver Summary */}
                            <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100 text-center">
                                <p className="text-sm font-bold text-slate-500 mb-1">Chofer: <span className="text-slate-900">{selectedDriver.driverName}</span></p>
                                <DualPrice usdAmount={selectedDriver.weeklyDebt} usdClassName="text-3xl font-black text-emerald-600" showDivider={true} className="flex flex-col items-center" />
                                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{selectedDriver.unpaidTrips.length} Viajes pendientes</p>
                            </div>

                            {/* File Upload */}
                            <div className="mb-8">
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Comprobante de Transferencia/Pago
                                </label>
                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100/50 transition-colors">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        {payoutReceipt ? (
                                            <div className="flex flex-col items-center text-emerald-600">
                                                <CheckCircle2 className="w-8 h-8 mb-2" />
                                                <p className="text-sm font-bold">{payoutReceipt.name}</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-3">
                                                    <Upload className="w-6 h-6 text-slate-900" />
                                                </div>
                                                <p className="mb-1 text-sm text-slate-500 font-medium">Click para subir foto</p>
                                                <p className="text-xs text-slate-400 font-bold">PNG, JPG o JPEG</p>
                                            </>
                                        )}
                                    </div>
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) => setPayoutReceipt(e.target.files?.[0] || null)}
                                    />
                                </label>
                            </div>

                            <button
                                onClick={handleProcessPayout}
                                disabled={payoutLoading || !payoutReceipt}
                                className="flex items-center justify-center w-full bg-primary text-slate-900 font-black py-4 rounded-xl hover:bg-primary transition-colors shadow-xl shadow-primary/20 disabled:opacity-50"
                            >
                                {payoutLoading ? (
                                    <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        Confirmar Pago
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Chat Modal for Admin */}
            {selectedChatRequest && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] z-50">
                    <div className="bg-white rounded-[2rem] w-full max-w-lg h-[80vh] relative shadow-2xl overflow-hidden flex flex-col">
                        <RideChat
                            requestId={selectedChatRequest}
                            onClose={() => setSelectedChatRequest(null)}
                            readOnly={true}
                        />
                    </div>
                </div>
            )}

            {/* Mandado Auction Audit Modal */}
            {selectedMandadoAudit && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[90]">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] shadow-2xl overflow-hidden flex flex-col border border-slate-200">
                        {/* Header */}
                        <div className="p-5 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-slate-950 text-amber-400 flex items-center justify-center shadow">
                                    <ShoppingBag className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-black text-lg leading-tight">Auditoría: Muchacho e' Mandao</h3>
                                    <p className="text-xs font-bold text-slate-900/80">
                                        ID: {selectedMandadoAudit.id.slice(0, 8)} • Cliente: {selectedMandadoAudit.userName || 'Usuario'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedMandadoAudit(null)}
                                className="w-8 h-8 rounded-full bg-slate-950/20 hover:bg-slate-950/30 flex items-center justify-center text-slate-950 font-black transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div className="p-5 overflow-y-auto space-y-5 flex-1">
                            {/* Encargo Detalle */}
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">
                                    Instrucciones del Cliente:
                                </div>
                                <p className="text-sm font-bold text-slate-800 leading-relaxed">
                                    {selectedMandadoAudit.mandado_details?.description || selectedMandadoAudit.packageDescription || selectedMandadoAudit.notes || 'Sin descripción'}
                                </p>
                                {selectedMandadoAudit.mandado_details?.storeName && (
                                    <p className="text-xs font-bold text-slate-600 mt-2">
                                        🏪 Comercio/Lugar: <span className="text-slate-900 font-black">{selectedMandadoAudit.mandado_details.storeName}</span>
                                    </p>
                                )}
                                {(selectedMandadoAudit.mandado_details?.audioUrl || selectedMandadoAudit.audio_url) && (
                                    <div className="mt-3 pt-3 border-t border-slate-200">
                                        <span className="text-[10px] font-black uppercase text-slate-500 block mb-1.5 flex items-center gap-1.5">
                                            <Volume2 className="w-3.5 h-3.5 text-amber-600" /> Nota de Voz del Cliente:
                                        </span>
                                        <audio 
                                            controls 
                                            src={selectedMandadoAudit.mandado_details?.audioUrl || selectedMandadoAudit.audio_url} 
                                            className="w-full h-8 accent-amber-500"
                                            preload="metadata"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Resumen del Servicio */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="bg-slate-100/70 p-3 rounded-xl border border-slate-200">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Estado</span>
                                    <span className="text-xs font-bold text-slate-800">{getStatusBadge(selectedMandadoAudit.status)}</span>
                                </div>
                                <div className="bg-slate-100/70 p-3 rounded-xl border border-slate-200">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Piloto Asignado</span>
                                    <span className="text-xs font-bold text-slate-800">{selectedMandadoAudit.driverName || 'Sin asignar'}</span>
                                </div>
                                <div className="bg-slate-100/70 p-3 rounded-xl border border-slate-200 col-span-2 sm:col-span-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Tarifa Final Acordada</span>
                                    <span className="text-sm font-black text-emerald-600">${Number(selectedMandadoAudit.total || selectedMandadoAudit.price || 0).toFixed(2)} USD</span>
                                </div>
                            </div>

                            {/* Subasta / Postulaciones de Pilotos */}
                            <div>
                                <div className="flex items-center justify-between mb-2.5">
                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                        <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                                        Ofertas y Cotizaciones de Pilotos ({mandadoBidsList.length})
                                    </h4>
                                </div>

                                {loadingBids ? (
                                    <div className="py-8 text-center text-slate-400 font-bold text-xs animate-pulse">
                                        Cargando ofertas de la subasta...
                                    </div>
                                ) : mandadoBidsList.length === 0 ? (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center text-xs font-bold text-slate-400">
                                        Ningún conductor ha enviado ofertas para esta solicitud aún.
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {mandadoBidsList.map((bid) => {
                                            const isAccepted = bid.status === 'accepted';
                                            return (
                                                <div 
                                                    key={bid.id} 
                                                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                                                        isAccepted 
                                                            ? 'bg-emerald-50/80 border-emerald-300' 
                                                            : bid.status === 'rejected'
                                                                ? 'bg-slate-50 border-slate-200 opacity-60'
                                                                : 'bg-white border-slate-200 shadow-sm'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-black text-slate-700 overflow-hidden shrink-0">
                                                            {bid.driver_photo ? (
                                                                <img src={bid.driver_photo} alt={bid.driver_name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <User className="w-5 h-5 text-slate-400" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <p className="text-xs font-black text-slate-900 truncate">{bid.driver_name || 'Conductor'}</p>
                                                                {bid.driver_rating && (
                                                                    <span className="text-[10px] font-bold text-amber-600 flex items-center">
                                                                        ★ {Number(bid.driver_rating).toFixed(1)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-slate-500 font-medium">
                                                                {bid.vehicle_type} {bid.vehicle_plate ? `• ${bid.vehicle_plate}` : ''} • Llegada: ~{bid.eta_minutes || 15} min
                                                            </p>
                                                            {bid.driver_phone && (
                                                                <p className="text-[10px] text-slate-400 font-medium">{bid.driver_phone}</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="text-right shrink-0">
                                                        <div className="text-sm font-black text-slate-900">
                                                            ${Number(bid.amount).toFixed(2)} USD
                                                        </div>
                                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                                                            isAccepted 
                                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                                                : bid.status === 'rejected'
                                                                    ? 'bg-red-100 text-red-800'
                                                                    : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {isAccepted ? 'Aceptada por Cliente' : bid.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer with action to open chat */}
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center gap-3">
                            <button
                                onClick={() => {
                                    setSelectedChatRequest(selectedMandadoAudit.id);
                                    setSelectedMandadoAudit(null);
                                }}
                                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow"
                            >
                                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                Auditar Chat y Comprobantes
                            </button>
                            <button
                                onClick={() => setSelectedMandadoAudit(null)}
                                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
