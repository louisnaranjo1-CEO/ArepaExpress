import React, { useState, useEffect } from 'react';
import { LogOut, DollarSign, CheckCircle, Clock, X, Loader2, Store, CreditCard, User, Plus, Edit, ClipboardList, MapPin, Instagram, Youtube, Music2, ExternalLink, Star, MessageSquare } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import ProductTicker from '../components/ProductTicker';
import ReviewsModal from '../components/ReviewsModal';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

interface Order {
    id: string;
    items: any[];
    total: number;
    subtotal: number;
    status: string;
    paymentStatus?: string;
    paymentMethod?: string;
    source?: string;
    userName?: string;
    waiterName?: string;
    table?: string;
    createdAt?: any;
    deliveryFee?: number;
    notified?: boolean;
}

export default function CashierDashboard() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [cashierData, setCashierData] = useState<any>(null);
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [restaurant, setRestaurant] = useState<any | null>(null);
    const [showReviewsModal, setShowReviewsModal] = useState(false);
    const [showHoursModal, setShowHoursModal] = useState(false);

    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [closeSaleModalOpen, setCloseSaleModalOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [closeTip, setCloseTip] = useState(0);
    const [isAccepting, setIsAccepting] = useState(false);

    // Cierre de caja
    const [closeRegisterModalOpen, setCloseRegisterModalOpen] = useState(false);
    const [registerReport, setRegisterReport] = useState<any>(null);
    const [isLoadingReport, setIsLoadingReport] = useState(false);
    const [notifiedOrderIds, setNotifiedOrderIds] = useState<Set<string>>(new Set());

    // Audio object for the notification sound
    const [notificationSound] = useState(() => new Audio('https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/Digital_Cascade_01.mp3?alt=media&token=211ed9a7-2b49-469f-8869-3fc2cd38d2f5'));

    useEffect(() => {
        const storedCashier = localStorage.getItem('cashierData');
        const storedRestaurantId = localStorage.getItem('cashierRestaurantId');
        
        if (!storedCashier || !storedRestaurantId) {
            navigate('/login');
            return;
        }

        setCashierData(JSON.parse(storedCashier));
        setRestaurantId(storedRestaurantId);

        // Fetch Restaurant Data
        const fetchRestaurant = async () => {
            try {
                const docRef = doc(db, 'restaurants', storedRestaurantId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                   setRestaurant({ id: docSnap.id, ...docSnap.data() });
                }
            } catch (error) {
                console.error("Error fetching restaurant:", error);
            }
        };
        fetchRestaurant();

        const ordersRef = collection(db, 'orders');

        const q2 = query(
            ordersRef,
            where('restaurantId', '==', storedRestaurantId),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe2 = onSnapshot(q2, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            // Filter manually those that need payment and are NOT sold
            const needsPayment = data.filter(o => 
                (o.paymentStatus === 'pending' || !o.paymentStatus) && 
                o.status !== 'rejected' && o.paymentStatus !== 'sold'
            );
            setOrders(needsPayment); // Overwrites the first query but gets all matching manually
        });

        return () => {
            unsubscribe2();
        };
    }, [navigate]);

    // Real-time notification monitor
    useEffect(() => {
        const unnotifiedWaiterOrders = orders.filter(o => 
            o.source === 'waiter' && 
            o.notified === false && 
            !notifiedOrderIds.has(o.id)
        );

        if (unnotifiedWaiterOrders.length > 0) {
            unnotifiedWaiterOrders.forEach(async (order) => {
                // Play Sound
                notificationSound.play().catch(e => console.error("Error playing sound:", e));

                // Show Custom Toast Alert
                toast.custom((t) => (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ duration: 0.4, type: "spring", stiffness: 200, damping: 20 }}
                        className={`max-w-md w-full bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-[2.2rem] pointer-events-auto flex ring-1 ring-black ring-opacity-5 overflow-hidden border-2 border-primary/20 backdrop-blur-xl`}
                    >
                        <div className="flex-1 w-0 p-6">
                            <div className="flex items-start">
                                <div className="shrink-0 pt-0.5">
                                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary relative overflow-hidden group">
                                        <ClipboardList className="w-7 h-7 relative z-10" />
                                        <div className="absolute inset-0 bg-primary/20 scale-0 group-hover:scale-100 transition-transform duration-500 rounded-full" />
                                    </div>
                                </div>
                                <div className="ml-5 flex-1 text-left">
                                    <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-1">Nueva Comanda</h3>
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400">Mesero:</span>
                                            <span className="text-sm font-black text-slate-900">{order.waiterName || 'Desconocido'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400">Mesa:</span>
                                            <span className="text-sm font-black text-slate-900">{order.table || 'N/A'}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-5 flex items-center justify-between bg-slate-50/80 p-4 rounded-[1.5rem] border border-slate-100 group/item">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Orden</span>
                                            <span className="text-2xl font-black text-slate-900 leading-none mt-1 tracking-tight">
                                                <span className="text-primary text-sm font-bold mr-0.5">$</span>
                                                {(order.total || 0).toFixed(2)}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                navigate(`/pos/${order.id}`);
                                                toast.dismiss(t.id);
                                            }}
                                            className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-2xl shadow-xl shadow-primary/30 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
                                        >
                                            Atender Ahora
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex border-l border-slate-100">
                            <button
                                onClick={() => toast.dismiss(t.id)}
                                className="w-full border border-transparent rounded-none rounded-r-[2.2rem] px-5 flex items-center justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 focus:outline-none hover:bg-slate-50/50 transition-colors"
                            >
                                Ignorar
                            </button>
                        </div>
                    </motion.div>
                ), { duration: 15000, id: order.id });

                // Mark as notified in Firestore and local state
                try {
                    await updateDoc(doc(db, 'orders', order.id), { notified: true });
                    setNotifiedOrderIds(prev => new Set(prev).add(order.id));
                } catch (err) {
                    console.error("Error updating notified status:", err);
                }
            });
        }
    }, [orders, notifiedOrderIds, notificationSound, navigate, db]);

    const handleLogout = () => {
        localStorage.removeItem('cashierData');
        localStorage.removeItem('cashierRestaurantId');
        localStorage.removeItem('isCashier');
        navigate('/login');
    };

    const handleOpenRegisterReport = async () => {
        if (!restaurantId) return;
        setIsLoadingReport(true);
        setCloseRegisterModalOpen(true);
        
        try {
            // Get today's start date
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Fetch all sold orders for today
            const ordersRef = collection(db, 'orders');
            // Firestore queries usually require composite index for inequality/equality combos. 
            // So we fetch all of today's and filter 'sold' client side if no index exists, 
            // but we can query by restaurantId and order by createdAt and filter locally.
            // Since we already have the real-time query for this restaurant without where clause on time, 
            // let's do a fast one-time fetch or just use snapshot if we collected all today's but we didn't.
            // Actually, best is to do a manual fetch, order by createdAt desc, and stop iterating when < today.
            
            // Simpler: Just fetch all from restaurant where paymentStatus == 'sold' and date >= today.
            // But Date in firestore requires Timestamp. We'll fetch all or just the ones from our state if they have ALL.
            // Our state `orders` only has pending ones! We must query DB.
            const querySnapshot = await import('firebase/firestore').then(({ getDocs, where, query, collection }) => {
                return getDocs(query(
                    collection(db, 'orders'),
                    where('restaurantId', '==', restaurantId),
                    where('paymentStatus', '==', 'sold')
                ));
            });
            
            let totalGeneral = 0;
            const pmData: Record<string, number> = {};
            let propinasMeseros = 0;

            querySnapshot.forEach(doc => {
                const data = doc.data();
                const ts = data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(0);
                if (ts >= today) { // Only today's sorted out
                    const tot = (data.total || 0);
                    totalGeneral += tot;
                    
                    const method = data.paymentMethod || 'Otro';
                    pmData[method] = (pmData[method] || 0) + tot;
                    
                    if (data.source === 'waiter' && data.tip) {
                        propinasMeseros += data.tip;
                    }
                }
            });

            setRegisterReport({
                totalGeneral,
                paymentMethods: pmData,
                propinasMeseros,
                count: querySnapshot.size
            });
            
        } catch (error) {
            console.error("Error generating report:", error);
            alert("No se pudo generar el reporte.");
        } finally {
            setIsLoadingReport(false);
        }
    };

    const handleCloseSale = async () => {
        if (!selectedOrder || !paymentMethod) {
            alert("Por favor seleccione un método de pago.");
            return;
        }
        setIsAccepting(true);
        try {
            const safeSubtotal = selectedOrder.subtotal ?? selectedOrder.total ?? 0;
            const updates: any = {
                paymentMethod: paymentMethod,
                paymentStatus: 'sold',
                tip: closeTip,
                total: safeSubtotal + (selectedOrder.deliveryFee || 0) + closeTip
            };

            // If it's a waiter's order, mark as delivered if it was preparing
            if (selectedOrder.source === 'waiter') {
                updates.status = 'delivered';
            }

            await updateDoc(doc(db, 'orders', selectedOrder.id), updates);
            setCloseSaleModalOpen(false);
            setSelectedOrder(null);
            setCloseTip(0);
            setPaymentMethod('');
        } catch (error) {
            console.error("Error al cobrar:", error);
            alert("Error al intentar cobrar la orden.");
        } finally {
            setIsAccepting(false);
        }
    };

    const groupedOrders = {
        waiter: orders.filter(o => o.source === 'waiter'),
        app: orders.filter(o => o.source !== 'waiter')
    };

    const getSocialIcon = (url: string) => {
        if (url.includes('instagram.com')) return <Instagram className="w-4 h-4" />;
        if (url.includes('tiktok.com')) return <Music2 className="w-4 h-4" />;
        if (url.includes('youtube.com') || url.includes('youtu.be')) return <Youtube className="w-4 h-4" />;
        return <ExternalLink className="w-4 h-4" />;
    };

    const getSocialColor = (url: string) => {
        if (url.includes('instagram.com')) return 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600';
        if (url.includes('tiktok.com')) return 'bg-black';
        if (url.includes('youtube.com') || url.includes('youtu.be')) return 'bg-red-600';
        return 'bg-primary';
    };

    const getRestaurantStatus = () => {
        if (!restaurant || !restaurant.workingHours || restaurant.workingHours.length === 0) return { isOpen: true, text: 'Abierto' };

        const now = new Date();
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const currentDay = days[now.getDay()];
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTimeStr = `${hours}:${minutes}`;

        const todaySchedule = restaurant.workingHours.find((day: any) => day.day === currentDay);

        if (!todaySchedule || todaySchedule.closed) return { isOpen: false, text: 'Cerrado' };

        const isOpen = currentTimeStr >= todaySchedule.open && currentTimeStr <= todaySchedule.close;
        return { isOpen, text: isOpen ? 'Abierto' : 'Cerrado', todaySchedule };
    };

    const statusObj = getRestaurantStatus();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <ProductTicker restaurantId={restaurantId || ''} />
            {/* Header */}
            <header className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-200 sticky top-0 z-40">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm overflow-hidden border border-slate-100">
                        {cashierData?.photo || cashierData?.photoURL ? (
                            <img src={cashierData.photo || cashierData.photoURL} alt={cashierData.name} className="w-full h-full object-cover" />
                        ) : (
                            <Store className="w-6 h-6 text-primary" />
                        )}
                    </div>
                    <div>
                        <h1 className="font-black text-slate-900 text-lg leading-tight">Caja y Cobros</h1>
                        <p className="text-xs font-bold text-slate-500 flex items-center gap-1">
                            <User className="w-3 h-3" /> {cashierData?.name}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleOpenRegisterReport}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/20"
                    >
                        <ClipboardList className="w-4 h-4" />
                        <span className="hidden sm:inline">Cierre Caja</span>
                    </button>
                    <button
                        onClick={() => navigate('/pos')}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Nuevo Pedido</span>
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="hidden sm:inline">Salir</span>
                    </button>
                </div>
            </header>

            {/* Restaurant Info Bar */}
            <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between gap-4 overflow-x-auto hide-scrollbar shrink-0">
                <div className="flex items-center gap-6 shrink-0">
                    {/* Status & Hours */}
                    <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${statusObj.isOpen ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusObj.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></div>
                            {statusObj.text}
                        </div>
                        <button 
                            onClick={() => setShowHoursModal(true)}
                            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                        >
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold whitespace-nowrap">
                                {statusObj.todaySchedule ? `${statusObj.todaySchedule.open} - ${statusObj.todaySchedule.close}` : 'Ver Horario'}
                            </span>
                        </button>
                    </div>

                    {/* Location */}
                    {restaurant?.location?.address && (
                        <div className="flex items-center gap-2 text-slate-400 max-w-xs">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-xs font-medium truncate">{restaurant.location.address}</span>
                        </div>
                    )}

                    {/* Rating */}
                    {restaurant?.rating && (
                        <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg border border-white/5">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-xs font-black">{restaurant.rating.toFixed(1)}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4 shrink-0">
                    {/* Social Media */}
                    <div className="flex items-center gap-2">
                        {restaurant?.socialLinks?.map((link: any, i: number) => (
                            <a 
                                key={i}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`w-8 h-8 rounded-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 ${getSocialColor(link.url)}`}
                            >
                                {getSocialIcon(link.url)}
                            </a>
                        ))}
                    </div>

                    <div className="h-6 w-px bg-white/10 mx-1"></div>

                    {/* Reviews Button */}
                    <button 
                        onClick={() => setShowReviewsModal(true)}
                        className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary px-4 py-1.5 rounded-xl border border-primary/20 transition-all group"
                    >
                        <MessageSquare className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-black uppercase tracking-wider">Reseñas</span>
                    </button>
                </div>
            </div>

            <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-8">
                {/* Waiter Orders to Charge */}
                <section>
                    <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2">
                        <DollarSign className="w-6 h-6 text-emerald-500" />
                        Meseros - Cuentas Abiertas ({groupedOrders.waiter.length})
                    </h2>
                    
                    {groupedOrders.waiter.length === 0 ? (
                        <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-sm">
                            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                            <p className="text-slate-500 font-bold">No hay cuentas de meseros pendientes por cobrar.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {groupedOrders.waiter.map(order => (
                                <div key={order.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4">
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${
                                            order.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                        }`}>
                                            {order.status === 'delivered' ? 'Listo en Mesa' : 'En Consumo'}
                                        </span>
                                    </div>
                                    <div className="mb-4">
                                        <p className="text-sm font-bold text-slate-400">Orden #{order.id.slice(-5).toUpperCase()}</p>
                                        <h3 className="text-2xl font-black text-slate-900 mt-1">${(order.total || 0).toFixed(2)}</h3>
                                    </div>
                                    <div className="space-y-2 mb-6 bg-slate-50 p-3 rounded-2xl">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500 font-bold">Mesa:</span>
                                            <span className="font-black text-slate-900">{order.table || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500 font-bold">Mesero:</span>
                                            <span className="font-bold text-slate-700">{order.waiterName || 'Desconocido'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500 font-bold">Tiempo:</span>
                                            <span className="font-bold text-slate-700 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {order.createdAt ? order.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <button
                                            onClick={() => navigate(`/pos/${order.id}`)}
                                            className="flex-1 bg-slate-100 text-slate-600 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors"
                                        >
                                            <Edit className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => { setSelectedOrder(order); setCloseSaleModalOpen(true); }}
                                            className="flex-[3] bg-emerald-500 text-white py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                                        >
                                            <DollarSign className="w-5 h-5" />
                                            Cobrar Cuenta
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* App Orders to Verify */}
                <section>
                    <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2 mt-12">
                        <CreditCard className="w-6 h-6 text-indigo-500" />
                        App / Delivery - Pagos por Verificar ({groupedOrders.app.length})
                    </h2>

                    {groupedOrders.app.length === 0 ? (
                        <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-sm">
                            <CheckCircle className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
                            <p className="text-slate-500 font-bold">No hay pagos de App pendientes de verificación.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {groupedOrders.app.map(order => (
                                <div key={order.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group">
                                    <div className="mb-4">
                                        <p className="text-sm font-bold text-slate-400">Plataforma</p>
                                        <h3 className="text-2xl font-black text-slate-900 mt-1">${(order.total || 0).toFixed(2)}</h3>
                                    </div>
                                    <div className="space-y-2 mb-6 bg-slate-50 p-3 rounded-2xl">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500 font-bold">Cliente:</span>
                                            <span className="font-bold text-slate-700 truncate max-w-[120px]">{order.userName || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500 font-bold">Reportado:</span>
                                            <span className="font-black text-slate-900">{order.paymentMethod || 'No indicado'}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedOrder(order); setPaymentMethod(order.paymentMethod || 'Punto de Venta'); setCloseSaleModalOpen(true); }}
                                        className="w-full bg-indigo-50 text-indigo-700 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-100 transition-colors"
                                    >
                                        Confirmar Pago
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>

            {/* Modals Adicionales */}
            <ReviewsModal 
                isOpen={showReviewsModal} 
                onClose={() => setShowReviewsModal(false)} 
                restaurantId={restaurantId || ''} 
            />

            {/* Modal de Horarios */}
            {showHoursModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                                    <Clock className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900">Horario de Trabajo</h3>
                            </div>
                            <button onClick={() => setShowHoursModal(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="space-y-3">
                            {restaurant?.workingHours?.map((day: any, i: number) => (
                                <div key={i} className={`flex justify-between items-center p-3 rounded-2xl ${day.day === (['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()]) ? 'bg-primary/5 border border-primary/10 ring-1 ring-primary/20' : 'bg-slate-50'}`}>
                                    <span className={`font-bold ${day.day === (['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()]) ? 'text-primary' : 'text-slate-600'}`}>{day.day}</span>
                                    {day.closed ? (
                                        <span className="text-xs font-black text-red-400 uppercase tracking-widest">Cerrado</span>
                                    ) : (
                                        <span className="text-sm font-black text-slate-900">{day.open} - {day.close}</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={() => setShowHoursModal(false)}
                            className="w-full mt-8 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all uppercase tracking-[0.2em] shadow-lg shadow-slate-900/20"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de Cobro */}
            {closeSaleModalOpen && selectedOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900">Procesar Cobro</h3>
                            <button onClick={() => { setCloseSaleModalOpen(false); setSelectedOrder(null); setCloseTip(0); setPaymentMethod(''); }} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="bg-slate-50 p-4 rounded-2xl mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-bold text-slate-500">Subtotal:</span>
                                <span className="font-bold text-slate-700">${selectedOrder.subtotal.toFixed(2)}</span>
                            </div>
                            {selectedOrder.deliveryFee && selectedOrder.deliveryFee > 0 ? (
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-bold text-slate-500">Delivery:</span>
                                    <span className="font-bold text-slate-700">${selectedOrder.deliveryFee.toFixed(2)}</span>
                                </div>
                            ) : null}
                            <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-2">
                                 <span className="text-sm font-black text-slate-900">Total:</span>
                                 <span className="font-black text-xl text-primary"> ${((selectedOrder.subtotal || 0) + (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
                            </div>
                        </div>

                        {selectedOrder.source === 'waiter' && (
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Propina Mesero ($)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={closeTip || ''}
                                    onChange={(e) => setCloseTip(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-50 border border-slate-200 px-3 py-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700"
                                    placeholder="0.00"
                                />
                            </div>
                        )}

                        <div className="space-y-3 mb-6">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Método de Pago</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['Punto de Venta', 'Pago Móvil', 'Efectivo', 'Zelle'].map((method) => (
                                    <button
                                        key={method}
                                        onClick={() => setPaymentMethod(method)}
                                        className={`w-full px-3 py-3 rounded-xl text-sm font-bold transition-all border-2 flex items-center justify-center ${
                                            paymentMethod === method ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                                        }`}
                                    >
                                        {method}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <button
                            onClick={handleCloseSale}
                            disabled={isAccepting || !paymentMethod}
                            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isAccepting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> Marcar como Pagado</>}
                        </button>
                    </div>
                </div>
            )}
            {/* Modal de Cierre de Caja */}
            {closeRegisterModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Reporte del Día</h3>
                                <p className="text-xs font-bold text-slate-500">{new Date().toLocaleDateString()}</p>
                            </div>
                            <button onClick={() => setCloseRegisterModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 hide-scrollbar -mx-2 px-2">
                        {isLoadingReport ? (
                            <div className="py-20 flex justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : registerReport ? (
                            <div className="space-y-6 pb-4">
                                <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 flex flex-col items-center justify-center text-center">
                                    <span className="text-sm font-bold text-emerald-600 mb-1 uppercase tracking-widest">Total Ingresado</span>
                                    <span className="text-4xl font-black text-emerald-700">${registerReport.totalGeneral.toFixed(2)}</span>
                                </div>

                                <div>
                                    <h4 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-2 mb-3">Por Método de Pago</h4>
                                    <div className="space-y-3">
                                        {Object.entries(registerReport.paymentMethods).map(([method, amount]) => (
                                            <div key={method} className="flex justify-between items-center">
                                                <span className="text-sm font-bold text-slate-600">{method}</span>
                                                <span className="text-base font-black text-slate-900">${(amount as number).toFixed(2)}</span>
                                            </div>
                                        ))}
                                        {Object.keys(registerReport.paymentMethods).length === 0 && (
                                            <p className="text-xs text-slate-400 italic">No hay pagos registrados hoy.</p>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-black text-slate-800 border-b border-slate-100 pb-2 mb-3">Otros Conceptos</h4>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-600">Propinas Recaudadas (Meseros)</span>
                                        <span className="text-base font-black text-orange-600">${registerReport.propinasMeseros.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        </div>

                        {!isLoadingReport && (
                            <div className="pt-4 border-t border-slate-100 mt-2 shrink-0">
                                <button
                                    onClick={() => {
                                        // Later this can do more actions like sending email or locking session
                                        alert("Cierre de caja guardado localmente (Simulado).");
                                        setCloseRegisterModalOpen(false);
                                    }}
                                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-black transition-colors"
                                >
                                    Confirmar y Terminar Turno
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
