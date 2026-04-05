import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bell, Search, Menu, Plus, ChevronDown, CheckCircle, Clock, AlertCircle, LogOut, User, Settings, Check, X, Smartphone, CreditCard, History } from 'lucide-react';
import WaiterLayout from '../components/WaiterLayout';
import { motion, AnimatePresence } from 'framer-motion';
import TableOptionsModal from '../components/TableOptionsModal';
import MergeTransferModal from '../components/MergeTransferModal';
import SplitBillModal from '../components/SplitBillModal';
import { collection, query, onSnapshot, orderBy, where, doc, updateDoc, writeBatch, serverTimestamp, getDoc, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Table {
    id: string;
    number: string;
    status: 'available' | 'occupied' | 'calling' | 'billing';
    timeLabel?: string;
    derivedStatus?: 'available' | 'occupied' | 'calling' | 'billing';
}

interface TableCardProps {
    table: Table & { derivedStatus: string; timeLabel: string };
    onAction: () => void;
    key?: React.Key;
}

export default function WaiterDashboard() {
    const [activeFilter, setActiveFilter] = useState('Todos');
    const [searchQuery, setSearchQuery] = useState('');
    const [tables, setTables] = useState<Table[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [waiterInfo, setWaiterInfo] = useState<{ id: string, name: string, role?: string, availability?: string, photo?: string }>({ id: '', name: 'Mesero' });
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showSidebar, setShowSidebar] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [selectedTable, setSelectedTable] = useState<any | null>(null);
    const [showOptionsModal, setShowOptionsModal] = useState(false);
    const [showMergeTransferModal, setShowMergeTransferModal] = useState(false);
    const [showSplitBillModal, setShowSplitBillModal] = useState(false);
    const [mergeTransferMode, setMergeTransferMode] = useState<'merge' | 'transfer'>('merge');
    const navigate = useNavigate();
    const dropdownRef = useRef<HTMLDivElement>(null);
    const notificationRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const waiterDataRaw = localStorage.getItem('waiterData');
        const restaurantId = localStorage.getItem('waiterRestaurantId');

        if (waiterDataRaw) {
            try {
                const data = JSON.parse(waiterDataRaw);
                setWaiterInfo({ 
                    id: data.id, 
                    name: data.name, 
                    role: data.role, 
                    availability: data.availability || 'active',
                    photo: data.photo || data.photoURL
                });
            } catch (e) {
                console.error("Error parsing waiter data", e);
            }
        }

        if (!restaurantId) {
            setLoading(false);
            return;
        }

        // Handle clicks outside
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowProfileMenu(false);
            }
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);

        const tablesQ = query(
            collection(db, 'restaurants', restaurantId, 'tables')
        );

        const unsubscribeTables = onSnapshot(tablesQ, (snapshot) => {
            const fetchedTables = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Table[];

            // Sort logically by number
            fetchedTables.sort((a, b) => {
                const numA = parseInt(a.number, 10);
                const numB = parseInt(b.number, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.number.localeCompare(b.number);
            });

            setTables(fetchedTables);
            setLoading(false);
        });

        const ordersQ = query(
            collection(db, 'orders'),
            where('restaurantId', '==', restaurantId)
        );

        const unsubscribeOrders = onSnapshot(ordersQ, (snapshot) => {
            const fetchedOrders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setOrders(fetchedOrders);

            // Extract notifications from calling tables or prepared orders
            const tableCalls = (fetchedOrders as any[]).filter(o => o.status === 'calling');
            const preparedOrders = (fetchedOrders as any[]).filter(o => o.status === 'delivering' && o.source === 'waiter');

            const newNotifications = [
                ...tableCalls.map(o => ({ id: `call-${o.id}`, type: 'call', title: `Mesa ${o.table} llama`, time: o.createdAt, original: o })),
                ...preparedOrders.map(o => ({ id: `prep-${o.id}`, type: 'prep', title: `Mesa ${o.table} lista`, time: o.updatedAt, original: o }))
            ].sort((a, b) => (b.time?.seconds || 0) - (a.time?.seconds || 0));

            setNotifications(newNotifications);
        });

        return () => {
            unsubscribeTables();
            unsubscribeOrders();
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('waiterData');
        localStorage.removeItem('waiterRestaurantId');
        localStorage.removeItem('isWaiter');
        navigate('/login');
    };

    const handleStatusUpdate = async (status: string) => {
        const restaurantId = localStorage.getItem('waiterRestaurantId');
        if (!restaurantId || !waiterInfo.id) return;

        try {
            await updateDoc(doc(db, 'restaurants', restaurantId, 'waiters', waiterInfo.id), {
                availability: status,
                updatedAt: serverTimestamp()
            });
            const updated = { ...waiterInfo, availability: status };
            setWaiterInfo(updated);
            localStorage.setItem('waiterData', JSON.stringify(updated));
            setShowProfileMenu(false);
        } catch (e) {
            console.error(e);
        }
    };

    const handleConfirmMergeTransfer = async (targetTableNumber: string) => {
        if (!selectedTable) return;
        const restaurantId = localStorage.getItem('waiterRestaurantId');
        if (!restaurantId) return;

        // Find active orders for the selected table
        const activeOrders = orders.filter(o => 
            o.table === selectedTable.number && 
            o.paymentStatus !== 'sold' && 
            o.paymentStatus !== 'merged' &&
            o.status !== 'cancelled'
        );

        if (activeOrders.length === 0) return;

        const batch = writeBatch(db);
        activeOrders.forEach(order => {
            batch.update(doc(db, 'orders', order.id), {
                table: targetTableNumber,
                updatedAt: serverTimestamp(),
            });
        });

        await batch.commit();
        setShowMergeTransferModal(false);
        setSelectedTable(null);
    };

    const handleTableAction = async (table: Table & { derivedStatus: string }) => {
        const restaurantId = localStorage.getItem('waiterRestaurantId');
        if (!restaurantId) return;

        switch (table.derivedStatus) {
            case 'available':
                // navigate to menu to start order
                navigate(`/menu?table=${table.number}&tableId=${table.id}`);
                break;
            case 'calling':
                // Clear all calling orders for this table
                const callingOrders = orders.filter((o) => o.table === table.number && o.status === 'calling');
                const batch = writeBatch(db);
                callingOrders.forEach((o) => {
                    batch.update(doc(db, 'orders', o.id), { status: 'occupied', updatedAt: serverTimestamp() });
                });
                await batch.commit();
                setSelectedTable(table);
                setShowOptionsModal(true);
                break;
            case 'occupied':
            case 'billing':
                setSelectedTable(table);
                setShowOptionsModal(true);
                break;
        }
    };

    // Combine Tables with Orders to determine dynamic status
    const tablesWithStatus = tables.map(table => {
        // Find active orders for this table
        const tableOrders = orders.filter(o =>
            ((o as any).tableId === table.id || (o as any).tableNumber === table.number || o.table === table.number) &&
            ['occupied', 'calling', 'preparing', 'delivering', 'delivered', 'pending', 'pendiente_pago'].includes(o.status) &&
            o.paymentStatus !== 'sold' &&
            o.paymentStatus !== 'merged'
        );

        let derivedStatus = table.status || 'available';
        let timeLabel = table.timeLabel || '';

        const hasCalling = tableOrders.some(o => o.status === 'calling');

        if (hasCalling) {
            derivedStatus = 'calling';
            timeLabel = 'Llamando...';
        } else if (tableOrders.length > 0) {
            const hasBilling = tableOrders.some(o => o.status === 'delivered' && o.paymentStatus === 'not_sold');
            const hasPending = tableOrders.some(o => o.status === 'pending');
            const hasOccupied = tableOrders.some(o => ['preparing', 'delivering'].includes(o.status));

            if (hasBilling) {
                derivedStatus = 'billing';
                timeLabel = 'Esperando pago';
            } else if (hasPending || hasOccupied) {
                derivedStatus = 'occupied';
                const oldestOrder = tableOrders.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))[0];
                if (oldestOrder?.createdAt) {
                    const minutes = Math.max(0, Math.floor((Date.now() - oldestOrder.createdAt.toMillis()) / 60000));
                    timeLabel = `Orden hace ${minutes}m`;
                } else {
                    timeLabel = 'Ocupado';
                }
            }
        } else {
            derivedStatus = 'available';
            timeLabel = 'Libre';
        }

        return { ...table, derivedStatus, timeLabel };
    });
    const selectedTableActiveOrders = useMemo(() => {
        if (!selectedTable) return [];
        return orders.filter(o => 
            o.table === selectedTable.number && 
            !(o.status === 'delivered' && o.paymentStatus === 'sold') &&
            o.paymentStatus !== 'merged' &&
            o.status !== 'rejected'
        );
    }, [selectedTable, orders]);

    const filteredTables = tablesWithStatus.filter(table => {
        const status = table.derivedStatus as string;
        const matchesFilter = activeFilter === 'Todos' ||
            (activeFilter === 'Disponible' && status === 'available') ||
            (activeFilter === 'Ocupado' && status === 'occupied') ||
            (activeFilter === 'Llamando' && status === 'calling') ||
            (activeFilter === 'Cobrando' && status === 'billing');

        const matchesSearch = table.number.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesFilter && matchesSearch;
    });

    const filters = [
        { name: 'Todos', color: 'bg-primary' },
        { name: 'Disponible', color: 'bg-emerald-500' },
        { name: 'Ocupado', color: 'bg-amber-500' },
        { name: 'Llamando', color: 'bg-rose-500' },
        { name: 'Cobrando', color: 'bg-secondary' },
    ];

    const handleCheckout = async () => {
        if (!selectedTable || selectedTableActiveOrders.length === 0) return;
        
        setShowOptionsModal(false);
        const restaurantId = localStorage.getItem('waiterRestaurantId');
        if (!restaurantId) return;

        const toastId = toast.loading('Calculando cuenta...');
        
        try {
            // 1. Consolidate items
            const consolidatedItems = selectedTableActiveOrders.reduce((acc: any[], order: any) => {
                (order.items || []).forEach((item: any) => {
                    const itemKey = `${item.productId}-${item.name}`;
                    const existing = acc.find(i => `${item.productId}-${i.name}` === itemKey);
                    if (existing) {
                        existing.quantity += item.quantity;
                    } else {
                        acc.push({ ...item });
                    }
                });
                return acc;
            }, []);
            
            const subtotal = consolidatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            // 2. Create the merged order
            const mergedOrderRef = doc(collection(db, 'orders'));
            const mergedOrderData = {
                items: consolidatedItems,
                table: selectedTable.number,
                tableId: selectedTable.id,
                status: 'delivered', // Delivered to effectively remove it from kitchen displays
                paymentStatus: 'not_sold', // Needs payment 
                source: 'waiter',
                waiterName: waiterInfo?.name || selectedTable.waiterName || 'Mesero',
                waiterId: waiterInfo?.id || selectedTable.waiterId || '',
                restaurantId,
                createdAt: serverTimestamp(),
                subtotal: subtotal,
                total: subtotal
            };
            
            // 3. Mark old orders as merged/sold
            const batch = writeBatch(db);
            selectedTableActiveOrders.forEach(o => {
                batch.update(doc(db, 'orders', o.id), {
                    status: 'delivered', 
                    paymentStatus: 'merged', 
                });
            });
            batch.set(mergedOrderRef, mergedOrderData);

            // 4. Update table status to billing
            batch.update(doc(db, 'restaurants', restaurantId, 'tables', selectedTable.id), {
                status: 'billing',
                lastOrderId: mergedOrderRef.id
            });
            
            await batch.commit();            
            toast.success('Cuenta solicitada a caja', { id: toastId });
        } catch (error) {
            console.error('Error in checkout:', error);
            toast.error('Error al pedir cuenta', { id: toastId });
        }
    };

    return (
        <WaiterLayout>
            {/* Sidebar Overlay */}
            <AnimatePresence>
                {showSidebar && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSidebar(false)}
                            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70]"
                        />
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed top-0 left-0 bottom-0 w-[85%] max-w-[320px] bg-white z-[80] shadow-2xl flex flex-col p-6 rounded-r-[40px]"
                        >
                            <div className="flex items-center justify-between mb-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm p-2">
                                        <img src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&token=8acf92ec-b853-4f37-bd82-a4f651bbdcd9" alt="Logo" className="w-full h-full object-contain" />
                                    </div>
                                    <span className="font-black text-slate-800 text-xl">Deliexpress</span>
                                </div>
                                <button onClick={() => setShowSidebar(false)} className="p-2 rounded-xl bg-slate-50 text-slate-400">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <nav className="space-y-2 flex-1">
                                {[
                                    { icon: Smartphone, label: 'Toma de Pedidos', path: '/' },
                                    { icon: CreditCard, label: 'Pagos Pendientes', path: '/orders?filter=billing' },
                                    { icon: History, label: 'Historial Hoy', path: '/orders?filter=completed' },
                                    { icon: Settings, label: 'Configuración', path: '/settings' },
                                ].map((item) => (
                                    <button
                                        key={item.label}
                                        onClick={() => {
                                            navigate(item.path);
                                            setShowSidebar(false);
                                        }}
                                        className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 text-slate-600 font-bold transition-all hover:translate-x-1"
                                    >
                                        <item.icon className="w-5 h-5 text-slate-400" />
                                        {item.label}
                                    </button>
                                ))}
                            </nav>

                            <div className="mt-auto pt-6 border-t border-slate-50">
                                <button onClick={handleLogout} className="w-full flex items-center gap-4 p-4 rounded-2xl text-rose-500 font-bold hover:bg-rose-50 transition-all">
                                    <LogOut className="w-5 h-5" />
                                    Cerrar Sesión
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Header */}
            <header className="px-5 py-6 flex items-center justify-between sticky top-0 bg-slate-50/80 backdrop-blur-md z-[60]">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowSidebar(true)}
                        className="p-2 rounded-xl bg-white shadow-sm border border-slate-100 active:scale-95 transition-transform"
                    >
                        <Menu className="w-6 h-6 text-slate-700" />
                    </button>
                    <h1 className="text-xl font-black text-slate-800 tracking-tight">Tablero</h1>
                </div>
                <div className="relative" ref={notificationRef}>
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={`p-2.5 rounded-full shadow-sm border relative transition-all active:scale-90 ${notifications.length > 0 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-white text-slate-400 border-slate-100'}`}
                    >
                        <Bell className={`w-6 h-6 ${notifications.length > 0 ? 'animate-[bell_1s_infinite]' : ''}`} />
                        {notifications.length > 0 && (
                            <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>
                        )}
                    </button>

                    <AnimatePresence>
                        {showNotifications && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute right-0 mt-3 w-72 bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden z-20"
                            >
                                <div className="p-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Notificaciones</h4>
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-[10px] font-black">{notifications.length}</span>
                                </div>
                                <div className="max-h-80 overflow-y-auto overflow-x-hidden">
                                    {notifications.length > 0 ? (
                                        notifications.map((n) => (
                                            <div key={n.id} className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-center gap-3 group cursor-pointer">
                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${n.type === 'call' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                    {n.type === 'call' ? <Bell className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-slate-800">{n.title}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">Hace unos momentos</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-8 text-center">
                                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <Bell className="w-6 h-6 text-slate-200" />
                                            </div>
                                            <p className="text-xs font-bold text-slate-400">Todo en orden por ahora</p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </header>

            <main className="px-5 space-y-8 pb-10">
                {/* Waiter Profile Panel */}
                <section className="relative" ref={dropdownRef}>
                    <div
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className="bg-white p-5 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center justify-between group cursor-pointer active:scale-[0.98] transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <img
                                    src={waiterInfo.photo || "https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&token=8acf92ec-b853-4f37-bd82-a4f651bbdcd9"}
                                    alt={waiterInfo.name}
                                    className="w-16 h-16 rounded-full object-cover border-4 border-slate-50 bg-white"
                                />
                                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${waiterInfo.availability === 'offline' ? 'bg-slate-400' : 'bg-emerald-500'}`}></div>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-black text-slate-800">Mesero {waiterInfo.name}</h2>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${waiterInfo.availability === 'offline' ? 'text-slate-500 bg-slate-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${waiterInfo.availability === 'offline' ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'}`}></div>
                                        {waiterInfo.availability === 'offline' ? 'Desconectado' : 'Activo'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <AnimatePresence>
                        {showProfileMenu && (
                            <motion.div
                                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                                className="absolute top-full left-0 w-full mt-3 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden z-20"
                            >
                                <div className="p-3 grid grid-cols-1 gap-1">
                                    {[
                                        { id: 'active', label: 'Estar Activo', icon: Check, color: 'text-emerald-500' },
                                        { id: 'offline', label: 'Desconectarse', icon: Clock, color: 'text-slate-400' },
                                    ].map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => handleStatusUpdate(s.id)}
                                            className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <s.icon className={`w-5 h-5 ${s.color}`} />
                                                <span className="font-bold text-slate-700">{s.label}</span>
                                            </div>
                                            {waiterInfo.availability === s.id && <Check className="w-4 h-4 text-slate-900" />}
                                        </button>
                                    ))}
                                    <div className="h-px bg-slate-50 my-1 mx-4"></div>
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-3 p-4 hover:bg-rose-50 text-rose-500 rounded-2xl transition-colors w-full"
                                    >
                                        <LogOut className="w-5 h-5" />
                                        <span className="font-bold">Cerrar Sesión</span>
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>

                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                    <input
                        type="text"
                        placeholder="Buscar mesa (ej: 5)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-slate-100 py-4 pl-14 pr-6 rounded-3xl outline-none focus:ring-4 focus:ring-primary/5 transition-all font-bold text-slate-700 shadow-sm"
                    />
                </div>

                {/* Assigned Tables Section */}
                <section className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black text-slate-900 ml-1">Mesas</h3>
                        <span className="text-xs font-bold text-slate-400 px-3 py-1 bg-slate-100 rounded-full">{filteredTables.length} mesas</span>
                    </div>

                    {/* Filters Horizontal Scroll */}
                    <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 -mx-5 px-5">
                        {filters.map((filter) => (
                            <button
                                key={filter.name}
                                onClick={() => setActiveFilter(filter.name)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl whitespace-nowrap transition-all duration-300 font-black text-sm ${activeFilter === filter.name
                                    ? `${filter.name === 'Todos' ? 'bg-primary shadow-primary/30' : filter.color + ' shadow-slate-200'} text-white shadow-lg scale-105`
                                    : 'bg-white text-slate-500 border border-slate-100'
                                    }`}
                            >
                                {filter.name !== 'Todos' && (
                                    <div className={`w-2 h-2 rounded-full ${filter.color.replace('bg-', 'bg-')}`}></div>
                                )}
                                {filter.name}
                            </button>
                        ))}
                    </div>

                    {/* Tables Grid */}
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : filteredTables.length > 0 ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredTables.map((table) => (
                                <TableCard
                                    key={table.id}
                                    table={table as any}
                                    onAction={() => handleTableAction(table as any)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-slate-50 border border-slate-100 p-10 rounded-[2.5rem] text-center text-slate-400">
                            <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="font-bold">No se encontraron mesas</p>
                        </div>
                    )}
                </section>
            </main>

            {/* Floating Action Button */}
            <button
                onClick={() => {
                    const restaurantId = localStorage.getItem('waiterRestaurantId');
                    if (restaurantId) navigate(`/restaurant/${restaurantId}`);
                }}
                className="fixed bottom-24 right-5 w-16 h-16 bg-primary rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center text-slate-900 active:scale-95 transition-transform z-40 border-4 border-white hover:rotate-90 group"
            >
                <Plus className="w-8 h-8 group-hover:scale-110" />
            </button>

            {/* Modals */}
            <TableOptionsModal 
                isOpen={showOptionsModal}
                onClose={() => {
                    setShowOptionsModal(false);
                    setSelectedTable(null);
                }}
                table={selectedTable}
                activeOrders={selectedTableActiveOrders}
                onAddOrder={() => {
                    setShowOptionsModal(false);
                    if (selectedTable) navigate(`/menu?table=${selectedTable.number}&tableId=${selectedTable.id}`);
                }}
                onJoinTable={() => {
                    setShowOptionsModal(false);
                    setMergeTransferMode('merge');
                    setShowMergeTransferModal(true);
                }}
                onTransferTable={() => {
                    setShowOptionsModal(false);
                    setMergeTransferMode('transfer');
                    setShowMergeTransferModal(true);
                }}
                onSplitBill={() => {
                    setShowOptionsModal(false);
                    setShowSplitBillModal(true);
                }}
                onCheckout={handleCheckout}
            />

            <MergeTransferModal
                isOpen={showMergeTransferModal}
                onClose={() => {
                    setShowMergeTransferModal(false);
                    setSelectedTable(null);
                }}
                mode={mergeTransferMode}
                currentTable={selectedTable}
                tables={tablesWithStatus}
                onConfirm={handleConfirmMergeTransfer}
            />

            <SplitBillModal
                isOpen={showSplitBillModal}
                onClose={() => {
                    setShowSplitBillModal(false);
                    setSelectedTable(null);
                }}
                table={selectedTable}
                activeOrders={selectedTableActiveOrders}
            />
        </WaiterLayout>
    );
}

function TableCard({ table, onAction }: TableCardProps) {
    const navigate = useNavigate(); // Assuming navigate is available here or passed as prop

    const getStatusStyles = () => {
        switch (table.derivedStatus) {
            case 'calling':
                return {
                    bg: 'bg-rose-50/50',
                    border: 'border-rose-100',
                    text: 'text-rose-600',
                    badge: 'bg-rose-100',
                    btn: 'bg-rose-500 text-white shadow-rose-500/20',
                    title: 'Llamando',
                    accent: 'ring-rose-500'
                };
            case 'occupied':
                return {
                    bg: 'bg-white',
                    border: 'border-slate-100',
                    text: 'text-amber-600',
                    badge: 'bg-amber-100',
                    btn: 'bg-slate-50 text-slate-600 border border-slate-100',
                    title: 'Ocupado',
                    accent: 'ring-amber-500'
                };
            case 'billing':
                return {
                    bg: 'bg-white',
                    border: 'border-slate-100',
                    text: 'text-secondary',
                    badge: 'bg-secondary/10',
                    btn: 'bg-secondary text-white shadow-secondary/20',
                    title: 'Cobrando',
                    accent: 'ring-secondary'
                };
            default:
                return {
                    bg: 'bg-white',
                    border: 'border-slate-100',
                    text: 'text-emerald-600',
                    badge: 'bg-emerald-100',
                    btn: 'bg-slate-50 text-slate-600 border border-slate-100',
                    title: 'Disponible',
                    accent: 'ring-emerald-500'
                };
        }
    };

    const styles = getStatusStyles();
    const btnLabel = table.derivedStatus === 'calling' ? 'Atender' : table.derivedStatus === 'occupied' ? 'Ver Orden' : table.derivedStatus === 'billing' ? 'Cobrar' : 'Asignar';

    return (
        <motion.div
            whileTap={{ scale: 0.97 }}
            className={`${styles.bg} ${styles.border} border-2 p-5 rounded-[2.5rem] flex flex-col items-center gap-3 relative overflow-hidden shadow-sm group cursor-pointer`}
            onClick={() => onAction()}
        >
            <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50/10 rounded-full -mr-8 -mt-8"></div>

            {table.derivedStatus === 'calling' && (
                <div className="absolute top-3 right-3 text-rose-500 drop-shadow-sm">
                    <Bell className="w-6 h-6 animate-[bell_1s_infinite]" />
                </div>
            )}

            <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 border-slate-50 shadow-inner bg-slate-100/50 group-hover:scale-110 transition-transform`}>
                <span className={`text-2xl font-black ${table.derivedStatus === 'calling' ? 'text-rose-500' : 'text-slate-700'}`}>{table.number}</span>
            </div>

            <div className="text-center space-y-0.5">
                <p className={`text-sm font-black uppercase tracking-tight ${styles.text}`}>{styles.title}</p>
                <p className="text-[10px] font-bold text-slate-400 italic">{table.timeLabel}</p>
            </div>

            <div
                className={`w-full py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all ${styles.btn} shadow-lg mt-1 group-hover:scale-105 text-center`}
            >
                {btnLabel}
            </div>
        </motion.div>
    );
}
