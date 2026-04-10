import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, getDocs, where, serverTimestamp, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { Car, Bike, Clock, CheckCircle2, XCircle, Search, Calendar, DollarSign, MapPin, User, ShieldCheck, Upload, Image as ImageIcon, MessageSquare, Star, Phone, MessageCircle } from 'lucide-react';
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

export default function TransportRequests() {
    const { bcvRate } = useCurrency();
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, verifying_payment, finding_driver, in_progress, completed, cancelled
    const [searchTerm, setSearchTerm] = useState('');
    const [view, setView] = useState<'viajes' | 'contabilidad' | 'comprobantes'>('viajes');
    const [selectedChatRequest, setSelectedChatRequest] = useState<string | null>(null);

    const [showPayoutModal, setShowPayoutModal] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<any>(null);
    const [payoutReceipt, setPayoutReceipt] = useState<File | null>(null);
    const [payoutLoading, setPayoutLoading] = useState(false);

    // Notification sound
    const notificationSoundUrl = useRef<string | null>(null);
    const lastRequestTimestamp = useRef<number>(Date.now());

    useEffect(() => {
        const q = query(
            collection(db, 'transport_requests'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const reqsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRequests(reqsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Fetch sound and listen for new requests
    useEffect(() => {
        const fetchSound = async () => {
            try {
                const soundRef = ref(storage, 'Digital_Cascade_01.mp3');
                const url = await getDownloadURL(soundRef);
                notificationSoundUrl.current = url;
            } catch (err) {
                console.error("No se pudo cargar el sonido de notificación:", err);
            }
        };
        fetchSound();

        // Listen for new requests specifically for sound notification
        const q = query(
            collection(db, 'transport_requests'),
            where('status', 'in', ['verifying_payment', 'searching']),
            orderBy('createdAt', 'desc'),
            limit(1)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const latestDoc = snapshot.docs[0];
                const data = latestDoc.data();
                const createdAt = data.createdAt?.toMillis() || Date.now();
                
                // Si es un documento nuevo (creado después de que se cargó el panel)
                if (createdAt > lastRequestTimestamp.current) {
                    if (notificationSoundUrl.current) {
                        const audio = new Audio(notificationSoundUrl.current);
                        audio.play().catch(e => console.error("Error playing audio:", e));
                        
                        // Alerta visual de nuevo pedido
                        toast.success(`¡Nuevo ${data.serviceType || 'servicio'} solicitado!`, {
                            duration: 5000,
                            icon: '🔔'
                        });
                    }
                    lastRequestTimestamp.current = createdAt;
                }
            }
        });

        return () => unsub();
    }, []);

    const handleVerifyPayment = async (id: string, isApproved: boolean) => {
        try {
            await updateDoc(doc(db, 'transport_requests', id), {
                status: isApproved ? 'searching' : 'cancelled'
            });

            if (isApproved) {
                const driversSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['delivery', 'driver'])));
                const batch = writeBatch(db);
                driversSnap.docs.forEach(driverDoc => {
                    const notifRef = doc(collection(db, 'notifications'));
                    batch.set(notifRef, {
                        userId: driverDoc.id,
                        title: '¡Nuevo Servicio de Taxi Disponible!',
                        body: 'Un administrador ha verificado el pago. ¡Hay una solicitud esperándote!',
                        read: false,
                        createdAt: serverTimestamp()
                    });
                });
                await batch.commit();
            }

            toast.success(isApproved ? 'Pago verificado. Buscando conductor...' : 'Solicitud cancelada');
        } catch (error) {
            console.error("Error updating status:", error);
            toast.error("Hubo un error al actualizar la solicitud");
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("¿Estás seguro de que deseas eliminar este registro histórico?")) {
            try {
                await deleteDoc(doc(db, 'transport_requests', id));
                toast.success('Registro eliminado');
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
                // In v9, `ref()` can take an HTTP URL directly if it matches the storage bucket
                const fileRef = ref(storage, proofUrl);
                try {
                    // Import deleteObject on the fly or just use the global storage reference
                    const { deleteObject } = await import('firebase/storage');
                    await deleteObject(fileRef);
                } catch (e) {
                    console.error("Warning: Error deleting physical file, maybe already deleted", e);
                }
            }
            
            // Remove the reference from the document
            await updateDoc(doc(db, 'transport_requests', req.id), {
                paymentProof: null,
                paymentProofUrl: null
            });
            toast.success("Comprobante eliminado");
        } catch (error) {
            console.error("Error deleting proof:", error);
            toast.error("Error al actualizar la solicitud");
        }
    };

    const filteredRequests = requests.filter(req => {
        if (filter !== 'all') {
            if (filter === 'in_progress') {
                if (!['accepted', 'arriving', 'in_progress'].includes(req.status)) return false;
            } else {
                if (req.status !== filter) return false;
            }
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (
                req.userPhone?.toLowerCase().includes(term) ||
                req.id.toLowerCase().includes(term)
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

        requests.filter(r => r.status === 'completed').forEach(req => {
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
            case 'verifying_payment': return <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold animate-pulse">Pagado (Por Verificar)</span>;
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
            const receiptRef = ref(storage, `payout_receipts/${selectedDriver.driverId}_${Date.now()}`);
            await uploadBytes(receiptRef, payoutReceipt);
            const receiptUrl = await getDownloadURL(receiptRef);

            // Update all unpaid trips
            const batch = writeBatch(db);
            selectedDriver.unpaidTrips.forEach((trip: any) => {
                const tripRef = doc(db, 'transport_requests', trip.id);
                batch.update(tripRef, {
                    driverPaid: true,
                    payoutReceiptUrl: receiptUrl,
                    payoutDate: new Date()
                });
            });

            // Notify driver
            const notifRef = doc(collection(db, 'notifications'));
            const bsAmount = selectedDriver.weeklyDebt * bcvRate;
            batch.set(notifRef, {
                userId: selectedDriver.driverId,
                title: '¡Pago Recibido!',
                body: `Se ha procesado tu pago de $${selectedDriver.weeklyDebt.toFixed(2)} (${bsAmount.toFixed(2)} Bs). Revisa el comprobante en tu historial.`,
                read: false,
                createdAt: serverTimestamp(),
                payoutReceiptUrl: receiptUrl
            });

            await batch.commit();

            toast.success(`Pago procesado con éxito para ${selectedDriver.driverName}`);
            setShowPayoutModal(false);
            setSelectedDriver(null);
            setPayoutReceipt(null);
        } catch (error) {
            console.error("Error processing payout:", error);
            toast.error("Hubo un error al procesar el pago");
        } finally {
            setPayoutLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
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
                            {['all', 'verifying_payment', 'searching', 'in_progress', 'completed'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-4 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${filter === f ? 'bg-primary text-slate-900 shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                >
                                    {f === 'all' ? 'Todos' :
                                        f === 'verifying_payment' ? 'Por Verificar' :
                                            f === 'searching' ? 'Buscando' :
                                                f === 'in_progress' ? 'En Curso' : 'Completados'}
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
                            filteredRequests.map((req) => (
                                <div key={req.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm transition-all hover:shadow-md">

                                    <div className="flex flex-col md:flex-row justify-between gap-6 mb-6">
                                        {/* User & Type Info */}
                                        <div className="flex items-start gap-4">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${req.vehicleType === 'moto' ? 'bg-primary/20 text-slate-900' : 'bg-slate-100 text-slate-700'}`}>
                                                {req.vehicleType === 'moto' ? <Bike className="w-6 h-6" /> : <Car className="w-6 h-6" />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-black text-slate-900 text-lg uppercase">
                                                        ID: {req.id.slice(0, 6)}
                                                    </span>
                                                    {getStatusBadge(req.status)}
                                                    {req.scheduled && (
                                                        <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1">
                                                            <Clock className="w-3 h-3" /> RESERVA
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-2 mt-2">
                                                    <div className="flex items-center gap-3 text-sm font-medium text-slate-500 flex-wrap">
                                                        <span className="flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                                                            <User className="w-4 h-4 text-slate-500" />
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Cliente</span>
                                                                <span className="font-bold text-slate-800 leading-none mt-1">{req.userName}</span>
                                                            </div>
                                                            {req.userCedula && (
                                                                <span className="text-xs font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 ml-2">
                                                                    C.I: {req.userCedula}
                                                                </span>
                                                            )}
                                                            {req.userPhone && (
                                                                <div className="flex items-center gap-1 ml-2 border-l border-slate-300 pl-2">
                                                                    <a href={`tel:${req.userPhone}`} className="w-7 h-7 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary transition-colors" title="Llamar Cliente">
                                                                        <Phone className="w-3.5 h-3.5" />
                                                                    </a>
                                                                    <a href={`https://wa.me/${req.userPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-7 h-7 bg-white rounded-lg border border-emerald-200 flex items-center justify-center text-emerald-500 hover:bg-emerald-50 transition-colors" title="WhatsApp Cliente">
                                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                                    </a>
                                                                    <span className="text-xs font-bold text-slate-500 ml-1">{req.userPhone}</span>
                                                                </div>
                                                            )}
                                                        </span>
                                                    </div>

                                                    {req.driverId && (
                                                        <div className="flex items-center gap-3 text-sm font-medium text-slate-500 flex-wrap">
                                                            <span className="flex items-center gap-1 bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/20">
                                                                {req.vehicleType === 'moto' ? <Bike className="w-4 h-4 text-primary" /> : <Car className="w-4 h-4 text-primary" />}
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest leading-none">Piloto Asignado</span>
                                                                    <span className="font-bold text-slate-800 leading-none mt-1">{req.driverName || 'Desconocido'}</span>
                                                                </div>
                                                                {req.driverPhone && (
                                                                    <div className="flex items-center gap-1 ml-2 border-l border-primary/30 pl-2">
                                                                        <a href={`tel:${req.driverPhone}`} className="w-7 h-7 bg-white rounded-lg border border-primary/20 flex items-center justify-center text-slate-600 hover:text-primary hover:border-primary transition-colors" title="Llamar Piloto">
                                                                            <Phone className="w-3.5 h-3.5" />
                                                                        </a>
                                                                        <a href={`https://wa.me/${req.driverPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-7 h-7 bg-white rounded-lg border border-emerald-200 flex items-center justify-center text-emerald-500 hover:bg-emerald-50 transition-colors" title="WhatsApp Piloto">
                                                                            <MessageCircle className="w-3.5 h-3.5" />
                                                                        </a>
                                                                        <span className="text-xs font-bold text-slate-600 ml-1">{req.driverPhone}</span>
                                                                    </div>
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-3 text-sm font-medium text-slate-500 flex-wrap mt-1">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-4 h-4" /> 
                                                            {req.scheduled ? (
                                                                <span className="text-primary font-black">
                                                                    Para: {req.scheduledAt && typeof req.scheduledAt.toDate === 'function' 
                                                                        ? req.scheduledAt.toDate().toLocaleString('es-VE') 
                                                                        : 'Fecha pendiente'}
                                                                </span>
                                                            ) : (
                                                                req.createdAt && typeof req.createdAt.toDate === 'function' 
                                                                    ? req.createdAt.toDate().toLocaleString('es-VE') 
                                                                    : 'Fecha desconocida'
                                                            )}
                                                        </span>
                                                        {((req.driverAssignedAt && req.driverArrivedAt) || req.arrivalDuration !== undefined) && (
                                                            <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 font-bold ml-2">
                                                                <Clock className="w-4 h-4" /> 
                                                                Llegó en: {req.arrivalDuration !== undefined ? (
                                                                    formatDuration(req.arrivalDuration)
                                                                ) : (req.driverArrivedAt && req.driverAssignedAt && typeof req.driverArrivedAt.toDate === 'function' && typeof req.driverAssignedAt.toDate === 'function') ? (
                                                                    `${Math.max(1, Math.round((req.driverArrivedAt.toDate().getTime() - req.driverAssignedAt.toDate().getTime()) / 60000))} min`
                                                                ) : '--'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Financial Info */}
                                        <div className="bg-slate-100/50 rounded-2xl p-4 md:text-right min-w-[240px] border border-slate-100 flex flex-col justify-center">
                                            <div className="grid grid-cols-3 gap-4 md:grid-cols-1 md:gap-2">
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Costo Cliente</p>
                                                    <DualPrice usdAmount={parseFloat(req.clientTotal || req.price || 0)} usdClassName="text-xl font-black text-emerald-600" showDivider={false} className="flex flex-col" />
                                                </div>
                                                <div className="border-l md:border-l-0 md:border-t border-slate-200 pl-4 md:pl-0 md:pt-2">
                                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Pago a Taxi</p>
                                                    <DualPrice usdAmount={parseFloat(req.driverPayout || req.price || 0)} usdClassName="text-lg font-black text-slate-900" showDivider={false} className="flex flex-col" />
                                                </div>
                                                <div className="border-l md:border-l-0 md:border-t border-slate-200 pl-4 md:pl-0 md:pt-2">
                                                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none mb-1">Ganancia Admin</p>
                                                    <DualPrice usdAmount={parseFloat(req.clientTotal || req.price || 0) - parseFloat(req.driverPayout || req.price || 0)} usdClassName="text-lg font-black text-amber-600" showDivider={false} className="flex flex-col" />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 mt-3 md:justify-end text-[10px] font-bold">
                                                <button
                                                    onClick={() => setSelectedChatRequest(req.id)}
                                                    className="bg-white px-2 py-1 rounded shadow-sm text-slate-900 border border-primary flex items-center gap-1 hover:bg-primary transition-colors"
                                                >
                                                    <MessageSquare className="w-3 h-3" /> Ver Chat
                                                </button>
                                                <span className="bg-white px-2 py-1 rounded shadow-sm text-slate-600 border border-slate-200 flex items-center gap-1">
                                                    <DollarSign className="w-3 h-3 text-emerald-500" /> {req.paymentMethod === 'pagoMovil' ? 'Pago Móvil' : req.paymentMethod === 'cash' ? 'Efectivo' : req.paymentMethod}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Locations Layout */}
                                    <div className="grid md:grid-cols-2 gap-4 mb-6">
                                        <div className="flex gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 relative overflow-hidden">
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-400"></div>
                                            <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Punto de Origen</p>
                                                <p className="font-bold text-slate-700 text-sm">{req.origin?.address}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 bg-primary/10 p-4 rounded-2xl border border-primary/20 relative overflow-hidden">
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
                                            <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-600 uppercase mb-1">Destino</p>
                                                <p className="font-bold text-slate-900 text-sm">{req.destination?.address}</p>
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
                                                    onClick={() => handleVerifyPayment(req.id, false)}
                                                    className="flex-1 md:flex-none px-4 py-2 bg-white text-red-600 font-bold rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
                                                >
                                                    Rechazar
                                                </button>
                                                <button
                                                    onClick={() => handleVerifyPayment(req.id, true)}
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
                                                    onClick={() => handleVerifyPayment(req.id, false)}
                                                    className="flex-1 md:flex-none px-4 py-2 bg-white text-red-600 font-bold rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
                                                >
                                                    Rechazar
                                                </button>
                                                <button
                                                    onClick={() => handleVerifyPayment(req.id, true)}
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
                            ))
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
                                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Ganancia Admin</p>
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
                        <p className="text-slate-500 text-sm">Aquí puedes revisar todas las capturas de pantalla de los pagos móviles enviados por clientes y eliminarlas para ahorrar espacio en el servidor de Firebase.</p>
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
                                            <div className="text-[10px] text-slate-500 font-medium">{req.createdAt?.toDate().toLocaleDateString()}</div>
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
        </div>
    );
}
