import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Bell, Search, Menu, Plus, ChevronDown, CheckCircle, Clock, AlertCircle, LogOut, User, Settings, Check, X, Smartphone, CreditCard, History } from 'lucide-react';
import WaiterLayout from '../components/WaiterLayout';
import { motion, AnimatePresence } from 'motion/react';
import TableOptionsModal from '../components/TableOptionsModal';
import MergeTransferModal from '../components/MergeTransferModal';
import SplitBillModal from '../components/SplitBillModal';
import { supabase } from '../../lib/supabase';
import { UN2X3_LOGO } from '../../lib/env';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Table {
    id: string;
    number: string;
    status: 'available' | 'occupied' | 'calling' | 'billing';
    timeLabel?: string;
    derivedStatus?: 'available' | 'occupied' | 'calling' | 'billing';
    waiterId?: string;
    waiterName?: string;
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

        const fetchTables = async () => {
            try {
                const { data, error } = await supabase
                    .from('restaurant_tables')
                    .select('*')
                    .eq('restaurant_id', restaurantId);

                if (error) {
                    console.error("Error fetching tables:", error);
                    return;
                }

                const fetchedTables = (data || []).map((t: any) => ({
                    id: t.id,
                    number: t.number?.toString() || '',
                    status: t.status || 'available',
                    waiterId: t.waiter_id,
                    waiterName: t.waiter_name,
                    ...t
                })) as Table[];

                // Sort logically by number
                fetchedTables.sort((a, b) => {
                    const numA = parseInt(a.number, 10);
                    const numB = parseInt(b.number, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.number.localeCompare(b.number);
                });

                setTables(fetchedTables);
            } catch (err) {
                console.error("Error loading tables:", err);
            } finally {
                setLoading(false);
            }
        };

        const fetchOrders = async () => {
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('restaurant_id', restaurantId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error("Error fetching orders:", error);
                    return;
                }

                const fetchedOrders = (data || []).map((o: any) => {
                    const cDate = o.created_at ? new Date(o.created_at) : new Date();
                    const uDate = o.updated_at ? new Date(o.updated_at) : new Date();
                    return {
                        id: o.id,
                        table: o.table_number || o.table || '',
                        tableNumber: o.table_number || o.table || '',
                        tableId: o.table_id || o.tableId || '',
                        status: o.status,
                        paymentStatus: o.payment_status || o.paymentStatus || 'pending',
                        source: o.source || 'waiter',
                        waiterName: o.waiter_name || o.waiterName || '',
                        waiterId: o.waiter_id || o.waiterId || '',
                        restaurantId: o.restaurant_id || o.restaurantId,
                        items: o.items || [],
                        subtotal: o.subtotal || o.total || 0,
                        total: o.total || 0,
                        createdAt: {
                            seconds: Math.floor(cDate.getTime() / 1000),
                            toDate: () => cDate,
                            toMillis: () => cDate.getTime(),
                            toISOString: () => cDate.toISOString(),
                        },
                        updatedAt: {
                            seconds: Math.floor(uDate.getTime() / 1000),
                            toDate: () => uDate,
                            toMillis: () => uDate.getTime(),
                            toISOString: () => uDate.toISOString(),
                        },
                        ...o
                    };
                });

                setOrders(fetchedOrders);

                // Extract notifications from calling tables or prepared orders
                const tableCalls = fetchedOrders.filter((o: any) => o.status === 'calling');
                const preparedOrders = fetchedOrders.filter((o: any) => o.status === 'delivering' && o.source === 'waiter');

                const newNotifications = [
                    ...tableCalls.map((o: any) => ({ id: `call-${o.id}`, type: 'call', title: `Mesa ${o.table} llama`, time: o.createdAt, original: o })),
                    ...preparedOrders.map((o: any) => ({ id: `prep-${o.id}`, type: 'prep', title: `Mesa ${o.table} lista`, time: o.updatedAt, original: o }))
                ].sort((a, b) => (b.time?.seconds || 0) - (a.time?.seconds || 0));

                setNotifications(newNotifications);
            } catch (err) {
                console.error("Error loading orders:", err);
            }
        };

        fetchTables();
        fetchOrders();

        const channel = supabase
            .channel(`waiter_dashboard_${restaurantId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'restaurant_tables',
                filter: `restaurant_id=eq.${restaurantId}`
            }, () => {
                fetchTables();
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'orders',
                filter: `restaurant_id=eq.${restaurantId}`
            }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
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
            await supabase
                .from('waiters')
                .update({
                    availability: status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', waiterInfo.id);

            const updated = { ...waiterInfo, availability: status };
            setWaiterInfo(updated);
            localStorage.setItem('waiterData', JSON.stringify(updated));
            setShowProfileMenu(false);
        } catch (e) {
            console.error("Error updating status:", e);
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

        const orderIds = activeOrders.map(o => o.id);
        const { error } = await supabase
            .from('orders')
            .update({
                table_number: targetTableNumber,
                updated_at: new Date().toISOString()
            })
            .in('id', orderIds);

        if (error) {
            console.error("Error transferring table orders:", error);
            toast.error("Error al transferir comanda");
            return;
        }

        setShowMergeTransferModal(false);
        setSelectedTable(null);
        toast.success(`Comandas transferidas a mesa ${targetTableNumber}`);
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
                const callingIds = callingOrders.map(o => o.id);
                if (callingIds.length > 0) {
                    await supabase
                        .from('orders')
                        .update({ status: 'occupied', updated_at: new Date().toISOString() })
                        .in('id', callingIds);
                }
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
        { name: 'Ocupado', color: 'bg-primary' },
        { name: 'Llamando', color: 'bg-rose-500' },
        { name: 'Cobrando', color: 'bg-emerald-600' },
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
            
            const newOrderId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `order_${Date.now()}`;

            // 2. Create the merged order in Supabase
            const { error: insertErr } = await supabase
                .from('orders')
                .insert({
                    id: newOrderId,
                    items: consolidatedItems,
                    table_number: selectedTable.number,
                    table_id: selectedTable.id,
                    status: 'delivered', // Delivered to effectively remove it from kitchen displays
                    payment_status: 'not_sold', // Needs payment 
                    source: 'waiter',
                    waiter_name: waiterInfo?.name || selectedTable.waiterName || 'Mesero',
                    waiter_id: waiterInfo?.id || selectedTable.waiterId || '',
                    restaurant_id: restaurantId,
                    created_at: new Date().toISOString(),
                    subtotal: subtotal,
                    total: subtotal
                });

            if (insertErr) throw insertErr;
            
            // 3. Mark old orders as merged/sold
            const oldIds = selectedTableActiveOrders.map(o => o.id);
            if (oldIds.length > 0) {
                await supabase
                    .from('orders')
                    .update({
                        status: 'delivered', 
                        payment_status: 'merged',
                        updated_at: new Date().toISOString()
                    })
                    .in('id', oldIds);
            }

            // 4. Update table status to billing
            await supabase
                .from('restaurant_tables')
                .update({
                    status: 'billing',
                    current_order_id: newOrderId,
                    updated_at: new Date().toISOString()
                })
                .eq('id', selectedTable.id);
            
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
                                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm p-2 overflow-hidden">
                                        <img src={UN2X3_LOGO} alt="Logo" className="w-full h-full object-contain" onError={(e: any) => { e.target.src = '/icon-192.png'; }} />
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
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-rose-500 font-bold hover:bg-rose-50 transition-colors"
                                >
                                    <LogOut className="w-5 h-5" />
                                    Cerrar Sesión
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Header */}
            <header className="px-5 py-6 bg-white sticky top-0 z-30 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowSidebar(true)}
                        className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors active:scale-95"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black text-slate-800">Mesas</h1>
                            <span className="bg-primary/20 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                En Vivo
                            </span>
                        </div>
                        <p className="text-xs font-bold text-slate-400">Panel de Control</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="relative w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors active:scale-95"
                    >
                        <Bell className="w-6 h-6" />
                        {notifications.length > 0 && (
                            <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white animate-pulse" />
                        )}
                    </button>

                    {/* Notifications Dropdown */}
                    <AnimatePresence>
                        {showNotifications && (
                            <motion.div
                                ref={notificationRef}
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute top-20 right-5 w-80 bg-white rounded-3xl shadow-2xl border border-slate-100 p-4 z-50 overflow-hidden"
                            >
                                <div className="flex items-center justify-between pb-3 border-b border-slate-50">
                                    <h3 className="font-black text-sm text-slate-800">Notificaciones</h3>
                                    <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                        {notifications.length} nuevas
                                    </span>
                                </div>
                                <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 mt-2">
                                    {notifications.length > 0 ? (
                                        notifications.map((n) => (
                                            <div key={n.id} className="py-3 flex items-start gap-3">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${n.type === 'call' ? 'bg-rose-50 text-rose-500' : 'bg-primary/20 text-slate-900'}`}>
                                                    {n.type === 'call' ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-black text-slate-800 truncate">{n.title}</p>
                                                    <p className="text-[10px] font-bold text-slate-400">Hace unos momentos</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-8 text-center">
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
                                    src={waiterInfo.photo || UN2X3_LOGO}
                                    alt={waiterInfo.name}
                                    className="w-16 h-16 rounded-full object-cover border-4 border-slate-50 bg-white"
                                    onError={(e: any) => { e.target.src = '/icon-192.png'; }}
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
                                <div className="p-3 space-y-1">
                                    <button
                                        onClick={() => handleStatusUpdate('active')}
                                        className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                            <span className="font-bold text-sm text-slate-700">Disponible</span>
                                        </div>
                                        {waiterInfo.availability !== 'offline' && <Check className="w-4 h-4 text-emerald-500" />}
                                    </button>

                                    <button
                                        onClick={() => handleStatusUpdate('offline')}
                                        className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full bg-slate-400"></div>
                                            <span className="font-bold text-sm text-slate-700">Desconectado</span>
                                        </div>
                                        {waiterInfo.availability === 'offline' && <Check className="w-4 h-4 text-slate-400" />}
                                    </button>

                                    <div className="h-px bg-slate-50 my-1"></div>

                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-3 p-4 rounded-2xl text-rose-500 hover:bg-rose-50 transition-colors font-bold text-sm"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Cerrar Sesión
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>

                {/* Filters */}
                <section className="space-y-4">
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-none">
                        {filters.map((filter) => (
                            <button
                                key={filter.name}
                                onClick={() => setActiveFilter(filter.name)}
                                className={`px-5 py-3 rounded-2xl font-black text-xs transition-all shrink-0 flex items-center gap-2 ${activeFilter === filter.name
                                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 scale-105'
                                    : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50'
                                    }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${filter.color}`} />
                                {filter.name}
                            </button>
                        ))}
                    </div>

                    <div className="relative">
                        <Search className="w-5 h-5 text-slate-300 absolute left-5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar número de mesa..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white border border-slate-100 rounded-2xl py-4 pl-14 pr-5 text-sm font-bold text-slate-700 placeholder:text-slate-300 outline-none focus:border-primary transition-all shadow-sm"
                        />
                    </div>
                </section>

                {/* Tables Grid */}
                <section>
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : filteredTables.length > 0 ? (
                        <div className="grid grid-cols-2 gap-4">
                            {filteredTables.map((table) => (
                                <TableCard
                                    key={table.id}
                                    table={table as any}
                                    onAction={() => handleTableAction(table as any)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20">
                            <p className="text-slate-400 font-bold text-sm">No se encontraron mesas</p>
                        </div>
                    )}
                </section>
            </main>

            {/* Modal de Opciones de Mesa */}
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
                    navigate(`/menu?table=${selectedTable.number}&tableId=${selectedTable.id}`);
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

            {/* Modal de Unir / Transferir Mesa */}
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

            {/* Modal de Dividir Cuenta */}
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
    const isOccupied = table.derivedStatus === 'occupied';
    const isCalling = table.derivedStatus === 'calling';
    const isBilling = table.derivedStatus === 'billing';

    return (
        <motion.div
            layout
            whileTap={{ scale: 0.96 }}
            onClick={onAction}
            className={`p-6 rounded-[2.5rem] border flex flex-col justify-between h-52 relative overflow-hidden cursor-pointer transition-all shadow-sm ${isCalling
                ? 'bg-rose-50/50 border-rose-200 shadow-rose-500/10'
                : isOccupied
                    ? 'bg-amber-50/30 border-amber-200 shadow-amber-500/5'
                    : isBilling
                        ? 'bg-emerald-50/30 border-emerald-200 shadow-emerald-500/5'
                        : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
        >
            {/* Top Status */}
            <div className="flex items-start justify-between">
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${isCalling
                    ? 'bg-rose-500 text-white animate-bounce'
                    : isOccupied
                        ? 'bg-amber-500 text-white'
                        : isBilling
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-400'
                    }`}>
                    {table.derivedStatus === 'available' ? 'Libre' :
                        table.derivedStatus === 'occupied' ? 'Ocupado' :
                            table.derivedStatus === 'calling' ? 'Llamando' : 'Cobrando'}
                </span>

                {isOccupied && (
                    <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                )}
            </div>

            {/* Table Number */}
            <div>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Mesa</p>
                <h3 className="text-4xl font-black text-slate-800 tracking-tight">{table.number}</h3>
            </div>

            {/* Bottom Info */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-50/50">
                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {table.timeLabel}
                </span>

                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${table.derivedStatus === 'available' ? 'bg-slate-50 text-slate-400' : 'bg-white shadow-sm text-slate-800'
                    }`}>
                    <Plus className="w-4 h-4" />
                </div>
            </div>
        </motion.div>
    );
}
