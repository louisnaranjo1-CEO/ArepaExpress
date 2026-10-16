import React, { useState, useEffect } from 'react';
import { 
    X, Store, ShoppingBag, Box, Users as UsersIcon, 
    CreditCard, Settings, ExternalLink, Plus, Trash2, 
    Edit2, CheckCircle2, Clock, DollarSign, Phone, Mail, 
    Shield, Key, RefreshCw, AlertCircle, Save, Check, 
    UserCheck, Loader2, Search, ArrowRight, User, Megaphone, Calendar
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import RestaurantProductsManager from './RestaurantProductsManager';
import DualPrice from '../../components/DualPrice';
import toast from 'react-hot-toast';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    business: {
        id: string;
        name: string;
        category?: string;
        sector?: string;
        image?: string;
        logoUrl?: string;
        whatsapp?: string;
        isActive?: boolean;
        status?: string;
        deliveryFee?: number;
        deliveryTime?: string;
        address?: string;
        hasCashea?: boolean;
    };
    onBusinessUpdated?: () => void;
}

export default function DirectBusinessManagerModal({ isOpen, onClose, business, onBusinessUpdated }: Props) {
    const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'tables' | 'waiters' | 'cashiers' | 'marketing' | 'settings'>('products');
    
    // Marketing state
    const [marketingCampaigns, setMarketingCampaigns] = useState<any[]>([]);
    const [loadingMarketing, setLoadingMarketing] = useState(false);
    const [marketingView, setMarketingView] = useState<'active' | 'history'>('active');
    const [rescheduleCamp, setRescheduleCamp] = useState<any | null>(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleTime, setRescheduleTime] = useState('');
    const [savingReschedule, setSavingReschedule] = useState(false);
    
    // Orders state
    const [orders, setOrders] = useState<any[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [ordersFilter, setOrdersFilter] = useState<'all' | 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled'>('all');

    // Tables state
    const [tables, setTables] = useState<any[]>([]);
    const [loadingTables, setLoadingTables] = useState(false);
    const [isAddTableOpen, setIsAddTableOpen] = useState(false);
    const [tableNumber, setTableNumber] = useState('');
    const [tableCapacity, setTableCapacity] = useState(4);
    const [savingTable, setSavingTable] = useState(false);

    // Waiters state
    const [waiters, setWaiters] = useState<any[]>([]);
    const [loadingWaiters, setLoadingWaiters] = useState(false);
    const [isAddWaiterOpen, setIsAddWaiterOpen] = useState(false);
    const [waiterForm, setWaiterForm] = useState({ name: '', email: '', phone: '', password: '', role: 'waiter' });
    const [savingWaiter, setSavingWaiter] = useState(false);

    // Cashiers state
    const [cashiers, setCashiers] = useState<any[]>([]);
    const [loadingCashiers, setLoadingCashiers] = useState(false);
    const [isAddCashierOpen, setIsAddCashierOpen] = useState(false);
    const [cashierForm, setCashierForm] = useState({ name: '', email: '', phone: '', passcode: '' });
    const [savingCashier, setSavingCashier] = useState(false);

    // Business Settings state
    const [settingsForm, setSettingsForm] = useState({
        name: business.name || '',
        whatsapp: business.whatsapp || '',
        category: business.category || '',
        address: business.address || '',
        delivery_time: business.deliveryTime || '30-45 min',
        delivery_fee: business.deliveryFee || 1.5,
        status: business.status || 'active',
        is_active: business.isActive !== false,
        has_cashea: business.hasCashea || false
    });
    const [savingSettings, setSavingSettings] = useState(false);

    useEffect(() => {
        if (!isOpen || !business?.id) return;

        setSettingsForm({
            name: business.name || '',
            whatsapp: business.whatsapp || '',
            category: business.category || '',
            address: business.address || '',
            delivery_time: business.deliveryTime || '30-45 min',
            delivery_fee: business.deliveryFee || 1.5,
            status: business.status || 'active',
            is_active: business.isActive !== false,
            has_cashea: business.hasCashea || false
        });

        fetchOrders();
        fetchTables();
        fetchWaiters();
        fetchCashiers();
        fetchMarketingCampaigns();

        // Realtime orders listener
        const ordersChan = supabase
            .channel(`admin_direct_orders_${business.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${business.id}` }, () => {
                fetchOrders();
            })
            .subscribe();

        const pushChan = supabase
            .channel(`admin_direct_push_${business.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'push_campaigns', filter: `restaurant_id=eq.${business.id}` }, () => {
                fetchMarketingCampaigns();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(ordersChan);
            supabase.removeChannel(pushChan);
        };
    }, [isOpen, business?.id]);

    const fetchMarketingCampaigns = async () => {
        if (!business?.id) return;
        setLoadingMarketing(true);
        try {
            const { data } = await supabase
                .from('push_campaigns')
                .select('*')
                .eq('restaurant_id', business.id)
                .order('created_at', { ascending: false });
            if (data) setMarketingCampaigns(data);
        } catch (err) {
            console.error("Error loading marketing campaigns:", err);
        } finally {
            setLoadingMarketing(false);
        }
    };

    const handleOpenReschedule = (camp: any) => {
        setRescheduleCamp(camp);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        let dateStr = tomorrow.toISOString().split('T')[0];
        let timeStr = '12:00';
        if (camp.scheduled_at) {
            try {
                const d = new Date(camp.scheduled_at);
                if (!isNaN(d.getTime())) {
                    dateStr = d.toISOString().split('T')[0];
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    timeStr = `${hh}:${mm}`;
                }
            } catch(e) {}
        }
        setRescheduleDate(dateStr);
        setRescheduleTime(timeStr);
    };

    const handleConfirmReschedule = async () => {
        if (!rescheduleCamp) return;
        const newDateTime = new Date(`${rescheduleDate}T${rescheduleTime}`);
        if (isNaN(newDateTime.getTime()) || newDateTime.getTime() <= Date.now()) {
            toast.error("La nueva hora programada debe ser estrictamente en el futuro.");
            return;
        }

        setSavingReschedule(true);
        try {
            const { error } = await supabase.from('push_campaigns').update({
                scheduled_at: newDateTime.toISOString(),
                was_rescheduled: true
            }).eq('id', rescheduleCamp.id);

            if (error) throw error;

            const formatted = newDateTime.toLocaleString('es-VE');

            await supabase.from('notifications').insert({
                restaurant_id: business.id,
                title: '🕒 Hora de Campaña Push Modificada por Super Admin',
                body: `El Super Administrador actualizó la hora de lanzamiento de tu campaña "${rescheduleCamp.title}" para el ${formatted}.`,
                read: false,
                created_at: new Date().toISOString()
            });

            toast.success(`Campaña reprogramada para el ${formatted}`);
            setRescheduleCamp(null);
            fetchMarketingCampaigns();
        } catch (e: any) {
            toast.error("Error al reprogramar: " + (e.message || ""));
        } finally {
            setSavingReschedule(false);
        }
    };

    const fetchOrders = async () => {
        setLoadingOrders(true);
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('restaurant_id', business.id)
                .order('created_at', { ascending: false })
                .limit(50);
            if (!error && data) setOrders(data);
        } catch (err) {
            console.error("Error fetching business orders:", err);
        } finally {
            setLoadingOrders(false);
        }
    };

    const fetchTables = async () => {
        setLoadingTables(true);
        try {
            const { data } = await supabase
                .from('restaurant_tables')
                .select('*')
                .eq('restaurant_id', business.id)
                .order('table_number', { ascending: true });
            if (data) setTables(data);
        } catch (err) {
            console.error("Error fetching tables:", err);
        } finally {
            setLoadingTables(false);
        }
    };

    const fetchWaiters = async () => {
        setLoadingWaiters(true);
        try {
            const { data } = await supabase
                .from('waiters')
                .select('*')
                .eq('restaurant_id', business.id)
                .order('created_at', { ascending: false });
            if (data) setWaiters(data);
        } catch (err) {
            console.error("Error fetching waiters:", err);
        } finally {
            setLoadingWaiters(false);
        }
    };

    const fetchCashiers = async () => {
        setLoadingCashiers(true);
        try {
            const { data } = await supabase
                .from('cashiers')
                .select('*')
                .eq('restaurant_id', business.id)
                .order('created_at', { ascending: false });
            if (data) setCashiers(data);
        } catch (err) {
            console.error("Error fetching cashiers:", err);
        } finally {
            setLoadingCashiers(false);
        }
    };

    // Orders actions
    const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('orders')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', orderId);
            if (error) throw error;
            toast.success(`Pedido actualizado a: ${newStatus}`);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        } catch (err: any) {
            toast.error("Error al actualizar pedido: " + err.message);
        }
    };

    // Table actions
    const handleAddTable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tableNumber.trim()) return;
        setSavingTable(true);
        try {
            const { data, error } = await supabase
                .from('restaurant_tables')
                .insert({
                    restaurant_id: business.id,
                    table_number: tableNumber.trim(),
                    capacity: Number(tableCapacity) || 4,
                    status: 'available'
                })
                .select()
                .single();
            if (error) throw error;
            toast.success("Mesa creada");
            setTables(prev => [...prev, data]);
            setTableNumber('');
            setTableCapacity(4);
            setIsAddTableOpen(false);
        } catch (err: any) {
            toast.error("Error al crear mesa: " + err.message);
        } finally {
            setSavingTable(false);
        }
    };

    const handleDeleteTable = async (tableId: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar esta mesa?")) return;
        try {
            const { error } = await supabase.from('restaurant_tables').delete().eq('id', tableId);
            if (error) throw error;
            toast.success("Mesa eliminada");
            setTables(prev => prev.filter(t => t.id !== tableId));
        } catch (err: any) {
            toast.error("Error al eliminar mesa: " + err.message);
        }
    };

    // Waiter actions
    const handleAddWaiter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!waiterForm.name.trim()) return;
        setSavingWaiter(true);
        try {
            const { data, error } = await supabase
                .from('waiters')
                .insert({
                    restaurant_id: business.id,
                    name: waiterForm.name.trim(),
                    email: waiterForm.email.trim() || null,
                    phone: waiterForm.phone.trim() || null,
                    password: waiterForm.password.trim() || '1234',
                    role: waiterForm.role || 'waiter',
                    is_active: true
                })
                .select()
                .single();
            if (error) throw error;
            toast.success("Mesero agregado con éxito");
            setWaiters(prev => [data, ...prev]);
            setWaiterForm({ name: '', email: '', phone: '', password: '', role: 'waiter' });
            setIsAddWaiterOpen(false);
        } catch (err: any) {
            toast.error("Error al agregar mesero: " + err.message);
        } finally {
            setSavingWaiter(false);
        }
    };

    const handleToggleWaiter = async (waiterId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('waiters')
                .update({ is_active: !currentStatus })
                .eq('id', waiterId);
            if (error) throw error;
            setWaiters(prev => prev.map(w => w.id === waiterId ? { ...w, is_active: !currentStatus } : w));
            toast.success("Estado de mesero actualizado");
        } catch (err: any) {
            toast.error("Error: " + err.message);
        }
    };

    const handleDeleteWaiter = async (waiterId: string) => {
        if (!window.confirm("¿Eliminar este mesero?")) return;
        try {
            const { error } = await supabase.from('waiters').delete().eq('id', waiterId);
            if (error) throw error;
            toast.success("Mesero eliminado");
            setWaiters(prev => prev.filter(w => w.id !== waiterId));
        } catch (err: any) {
            toast.error("Error: " + err.message);
        }
    };

    // Cashier actions
    const handleAddCashier = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cashierForm.name.trim()) return;
        setSavingCashier(true);
        try {
            const { data, error } = await supabase
                .from('cashiers')
                .insert({
                    restaurant_id: business.id,
                    name: cashierForm.name.trim(),
                    email: cashierForm.email.trim() || null,
                    username: cashierForm.email.trim() || cashierForm.name.toLowerCase().replace(/\s+/g, '_'),
                    phone: cashierForm.phone.trim() || null,
                    passcode: cashierForm.passcode.trim() || '1234',
                    pin_hash: cashierForm.passcode.trim() || '1234',
                    is_active: true,
                    permissions: ['pos', 'orders', 'tables']
                })
                .select()
                .single();
            if (error) throw error;
            toast.success("Cajero agregado con éxito");
            setCashiers(prev => [data, ...prev]);
            setCashierForm({ name: '', email: '', phone: '', passcode: '' });
            setIsAddCashierOpen(false);
        } catch (err: any) {
            toast.error("Error al agregar cajero: " + err.message);
        } finally {
            setSavingCashier(false);
        }
    };

    const handleToggleCashier = async (cashierId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('cashiers')
                .update({ is_active: !currentStatus })
                .eq('id', cashierId);
            if (error) throw error;
            setCashiers(prev => prev.map(c => c.id === cashierId ? { ...c, is_active: !currentStatus } : c));
            toast.success("Estado de cajero actualizado");
        } catch (err: any) {
            toast.error("Error: " + err.message);
        }
    };

    const handleDeleteCashier = async (cashierId: string) => {
        if (!window.confirm("¿Eliminar este cajero?")) return;
        try {
            const { error } = await supabase.from('cashiers').delete().eq('id', cashierId);
            if (error) throw error;
            toast.success("Cajero eliminado");
            setCashiers(prev => prev.filter(c => c.id !== cashierId));
        } catch (err: any) {
            toast.error("Error: " + err.message);
        }
    };

    // Save business settings
    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingSettings(true);
        try {
            const { error } = await supabase
                .from('comercios')
                .update({
                    name: settingsForm.name,
                    whatsapp: settingsForm.whatsapp,
                    category: settingsForm.category,
                    address: settingsForm.address,
                    delivery_time: settingsForm.delivery_time,
                    delivery_fee: Number(settingsForm.delivery_fee) || 0,
                    status: settingsForm.status,
                    is_active: settingsForm.is_active,
                    has_cashea: settingsForm.has_cashea,
                    updated_at: new Date().toISOString()
                })
                .eq('id', business.id);

            if (error) throw error;
            toast.success("Configuración del negocio guardada exitosamente");
            if (onBusinessUpdated) onBusinessUpdated();
        } catch (err: any) {
            toast.error("Error al guardar: " + err.message);
        } finally {
            setSavingSettings(false);
        }
    };

    // Open External Restaurant App
    const openExternalApp = () => {
        const baseUrl = (import.meta.env.VITE_RESTAURANT_APP_URL as string) || 
            (window.location.hostname.includes('localhost') ? 'http://localhost:5174' : 'https://negocios.deliexpress.app');
        const url = `${baseUrl}?impersonate_restaurant_id=${business.id}`;
        window.open(url, '_blank');
    };

    if (!isOpen) return null;

    const filteredOrders = orders.filter(o => {
        if (ordersFilter === 'all') return true;
        return o.status === ordersFilter;
    });

    return (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-hidden animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-6xl h-[95vh] rounded-[36px] shadow-2xl flex flex-col overflow-hidden border border-slate-100">
                {/* Modal Header */}
                <div className="p-4 sm:p-6 bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 p-1 flex items-center justify-center shrink-0 overflow-hidden border border-white/10">
                            {business.logoUrl || business.image ? (
                                <img src={business.logoUrl || business.image} alt={business.name} className="w-full h-full object-cover rounded-xl" />
                            ) : (
                                <Store className="w-6 h-6 text-primary" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-black text-white leading-tight">{business.name}</h2>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                    business.isActive !== false ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                }`}>
                                    {business.isActive !== false ? 'Activo' : 'Inactivo'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                                Panel de Gestión Directa SuperAdmin • ID: <span className="font-mono text-slate-300">{business.id.slice(0, 8)}...</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                        <button
                            onClick={openExternalApp}
                            className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 shrink-0"
                            title="Abrir aplicación en nueva pestaña impersonando este local"
                        >
                            <ExternalLink className="w-4 h-4 stroke-[2.5]" />
                            <span>Abrir App Negocios</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs Bar */}
                <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2.5 bg-slate-100 border-b border-slate-200 overflow-x-auto no-scrollbar shrink-0">
                    {[
                        { id: 'products', label: 'Productos', icon: Box },
                        { id: 'orders', label: `Pedidos (${orders.length})`, icon: ShoppingBag },
                        { id: 'tables', label: `Mesas (${tables.length})`, icon: CreditCard },
                        { id: 'waiters', label: `Meseros (${waiters.length})`, icon: UsersIcon },
                        { id: 'cashiers', label: `Cajeras (${cashiers.length})`, icon: UserCheck },
                        { id: 'marketing', label: `Marketing Push (${marketingCampaigns.length})`, icon: Megaphone },
                        { id: 'settings', label: 'Configuración', icon: Settings },
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isCurrent = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${
                                    isCurrent 
                                        ? 'bg-slate-900 text-white shadow-md' 
                                        : 'bg-white/70 hover:bg-white text-slate-600 border border-slate-200/60'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
                    {/* TAB: PRODUCTS */}
                    {activeTab === 'products' && (
                        <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-100 shadow-xs">
                            <RestaurantProductsManager restaurantId={business.id} restaurantName={business.name} />
                        </div>
                    )}

                    {/* TAB: ORDERS */}
                    {activeTab === 'orders' && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                    {(['all', 'pending', 'preparing', 'ready', 'delivered', 'cancelled'] as const).map(status => (
                                        <button
                                            key={status}
                                            onClick={() => setOrdersFilter(status)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                                ordersFilter === status 
                                                    ? 'bg-primary text-slate-950 font-black' 
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                        >
                                            {status === 'all' ? 'Todos' :
                                             status === 'pending' ? 'Pendientes' :
                                             status === 'preparing' ? 'Preparando' :
                                             status === 'ready' ? 'Listos' :
                                             status === 'delivered' ? 'Entregados' : 'Cancelados'}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={fetchOrders}
                                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-colors"
                                    title="Refrescar pedidos"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loadingOrders ? 'animate-spin' : ''}`} />
                                </button>
                            </div>

                            {loadingOrders && orders.length === 0 ? (
                                <div className="py-20 text-center">
                                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
                                    <p className="text-xs font-bold text-slate-400">Cargando pedidos del local...</p>
                                </div>
                            ) : filteredOrders.length === 0 ? (
                                <div className="bg-white rounded-3xl p-16 text-center border border-slate-100">
                                    <ShoppingBag className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                    <h4 className="text-base font-black text-slate-700">Sin pedidos para mostrar</h4>
                                    <p className="text-xs text-slate-400 mt-1">No se encontraron órdenes con el filtro seleccionado.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {filteredOrders.map(order => (
                                        <div key={order.id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs flex flex-col justify-between gap-4">
                                            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                                                <div>
                                                    <span className="font-mono text-xs font-black text-slate-500 uppercase tracking-wider">
                                                        #{order.id.slice(0, 8)}
                                                    </span>
                                                    <h4 className="font-bold text-sm text-slate-900 mt-0.5">
                                                        {order.customer_name || order.userName || 'Cliente'}
                                                    </h4>
                                                    <p className="text-[11px] text-slate-400 font-medium">
                                                        {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <DualPrice usdAmount={order.total || 0} usdClassName="font-black text-lg text-slate-900" showDivider={false} className="flex flex-col items-end" />
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                        {order.order_type === 'pickup' ? 'PickUp' : 'Delivery'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Order items */}
                                            <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                                                {(order.items || []).map((item: any, idx: number) => (
                                                    <div key={idx} className="flex items-center justify-between text-xs">
                                                        <span className="font-bold text-slate-700 truncate">
                                                            {item.quantity}x {item.name}
                                                        </span>
                                                        <span className="text-slate-500 font-mono ml-2 shrink-0">
                                                            ${((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Status controller */}
                                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                                <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                                                    order.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                                                    order.status === 'preparing' ? 'bg-amber-100 text-amber-800' :
                                                    order.status === 'ready' ? 'bg-blue-100 text-blue-800' :
                                                    order.status === 'cancelled' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                                                }`}>
                                                    {order.status}
                                                </span>
                                                
                                                <select
                                                    value={order.status}
                                                    onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                                                    className="bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl outline-none cursor-pointer focus:ring-2 focus:ring-primary"
                                                >
                                                    <option value="pending">Pendiente</option>
                                                    <option value="confirmed">Confirmado</option>
                                                    <option value="preparing">Preparando</option>
                                                    <option value="ready">Listo</option>
                                                    <option value="delivered">Entregado</option>
                                                    <option value="cancelled">Cancelado</option>
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: TABLES */}
                    {activeTab === 'tables' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100">
                                <div>
                                    <h3 className="font-black text-slate-900 text-base">Mesas Registradas</h3>
                                    <p className="text-xs text-slate-400 font-medium">Control de mesas activas y capacidades en sala.</p>
                                </div>
                                <button
                                    onClick={() => setIsAddTableOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-sm"
                                >
                                    <Plus className="w-4 h-4 stroke-[3]" />
                                    <span>Nueva Mesa</span>
                                </button>
                            </div>

                            {isAddTableOpen && (
                                <form onSubmit={handleAddTable} className="bg-white p-5 rounded-3xl border border-primary/40 shadow-md space-y-4 animate-in slide-in-from-top-2">
                                    <h4 className="font-black text-slate-900 text-sm">Crear Mesa para este local</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 block mb-1">Número o Nombre de Mesa *</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="Ej: Mesa 1, Terraza A, VIP"
                                                value={tableNumber}
                                                onChange={e => setTableNumber(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 block mb-1">Capacidad de Comensales</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={50}
                                                value={tableCapacity}
                                                onChange={e => setTableCapacity(parseInt(e.target.value) || 4)}
                                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddTableOpen(false)}
                                            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={savingTable}
                                            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                                        >
                                            {savingTable && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            Guardar Mesa
                                        </button>
                                    </div>
                                </form>
                            )}

                            {loadingTables ? (
                                <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" /></div>
                            ) : tables.length === 0 ? (
                                <div className="bg-white rounded-3xl p-16 text-center border border-slate-100">
                                    <CreditCard className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                    <h4 className="text-base font-black text-slate-700">No hay mesas configuradas</h4>
                                    <p className="text-xs text-slate-400 mt-1">Crea la primera mesa para activar el módulo de comensales y meseros.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                    {tables.map(table => (
                                        <div key={table.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between gap-3 group">
                                            <div className="flex items-center justify-between">
                                                <span className="font-black text-base text-slate-900">
                                                    #{table.table_number || table.number}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteTable(table.id)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Eliminar mesa"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[11px] font-bold text-slate-400">Capacidad: {table.capacity || 4} pers.</p>
                                                <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                                    table.status === 'occupied' ? 'bg-amber-100 text-amber-800' :
                                                    table.status === 'calling' ? 'bg-rose-100 text-rose-800 animate-pulse' :
                                                    table.status === 'billing' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                                                }`}>
                                                    {table.status || 'Disponible'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: WAITERS */}
                    {activeTab === 'waiters' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100">
                                <div>
                                    <h3 className="font-black text-slate-900 text-base">Equipo de Meseros</h3>
                                    <p className="text-xs text-slate-400 font-medium">Personal de atención con acceso a la app de meseros.</p>
                                </div>
                                <button
                                    onClick={() => setIsAddWaiterOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-sm"
                                >
                                    <Plus className="w-4 h-4 stroke-[3]" />
                                    <span>Nuevo Mesero</span>
                                </button>
                            </div>

                            {isAddWaiterOpen && (
                                <form onSubmit={handleAddWaiter} className="bg-white p-5 rounded-3xl border border-primary/40 shadow-md space-y-4 animate-in slide-in-from-top-2">
                                    <h4 className="font-black text-slate-900 text-sm">Registrar Nuevo Mesero</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 block mb-1">Nombre Completo *</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="Ej: Carlos Silva"
                                                value={waiterForm.name}
                                                onChange={e => setWaiterForm({ ...waiterForm, name: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 block mb-1">Teléfono</label>
                                            <input
                                                type="text"
                                                placeholder="Ej: 04141234567"
                                                value={waiterForm.phone}
                                                onChange={e => setWaiterForm({ ...waiterForm, phone: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 block mb-1">PIN / Contraseña</label>
                                            <input
                                                type="text"
                                                placeholder="PIN de acceso (ej: 1234)"
                                                value={waiterForm.password}
                                                onChange={e => setWaiterForm({ ...waiterForm, password: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddWaiterOpen(false)}
                                            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={savingWaiter}
                                            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                                        >
                                            {savingWaiter && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            Guardar Mesero
                                        </button>
                                    </div>
                                </form>
                            )}

                            {loadingWaiters ? (
                                <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" /></div>
                            ) : waiters.length === 0 ? (
                                <div className="bg-white rounded-3xl p-16 text-center border border-slate-100">
                                    <UsersIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                    <h4 className="text-base font-black text-slate-700">Sin meseros registrados</h4>
                                    <p className="text-xs text-slate-400 mt-1">Añade personal para que puedan tomar comandas desde mesas.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {waiters.map(waiter => (
                                        <div key={waiter.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-black text-slate-800 text-sm">
                                                    {waiter.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h5 className="font-bold text-sm text-slate-900 leading-tight">{waiter.name}</h5>
                                                    <p className="text-[10px] text-slate-400 font-bold">{waiter.phone || waiter.email || 'Sin contacto'}</p>
                                                    <p className="text-[9px] text-primary-dark font-mono font-bold mt-0.5">PIN: {waiter.password || '1234'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleToggleWaiter(waiter.id, waiter.is_active !== false)}
                                                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                                                        waiter.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                    }`}
                                                >
                                                    {waiter.is_active !== false ? 'Activo' : 'Pausado'}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteWaiter(waiter.id)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: CASHIERS */}
                    {activeTab === 'cashiers' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100">
                                <div>
                                    <h3 className="font-black text-slate-900 text-base">Cajeras y Puntos de Cobro</h3>
                                    <p className="text-xs text-slate-400 font-medium">Personal con acceso a la app de caja, POS y cierre de turnos.</p>
                                </div>
                                <button
                                    onClick={() => setIsAddCashierOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-sm"
                                >
                                    <Plus className="w-4 h-4 stroke-[3]" />
                                    <span>Nueva Cajera</span>
                                </button>
                            </div>

                            {isAddCashierOpen && (
                                <form onSubmit={handleAddCashier} className="bg-white p-5 rounded-3xl border border-primary/40 shadow-md space-y-4 animate-in slide-in-from-top-2">
                                    <h4 className="font-black text-slate-900 text-sm">Registrar Cajero / Cajera</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 block mb-1">Nombre Completo *</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="Ej: Maria Gonzalez"
                                                value={cashierForm.name}
                                                onChange={e => setCashierForm({ ...cashierForm, name: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 block mb-1">Correo / Usuario</label>
                                            <input
                                                type="text"
                                                placeholder="caja1@negocio.com"
                                                value={cashierForm.email}
                                                onChange={e => setCashierForm({ ...cashierForm, email: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 block mb-1">Código PIN / Clave</label>
                                            <input
                                                type="text"
                                                placeholder="PIN de caja (ej: 1234)"
                                                value={cashierForm.passcode}
                                                onChange={e => setCashierForm({ ...cashierForm, passcode: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddCashierOpen(false)}
                                            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={savingCashier}
                                            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                                        >
                                            {savingCashier && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            Guardar Cajero
                                        </button>
                                    </div>
                                </form>
                            )}

                            {loadingCashiers ? (
                                <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" /></div>
                            ) : cashiers.length === 0 ? (
                                <div className="bg-white rounded-3xl p-16 text-center border border-slate-100">
                                    <UserCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                    <h4 className="text-base font-black text-slate-700">Sin cajeros registrados</h4>
                                    <p className="text-xs text-slate-400 mt-1">Crea accesos de caja para cobrar comandas y gestionar pagos.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {cashiers.map(cashier => (
                                        <div key={cashier.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-sm">
                                                    {cashier.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <h5 className="font-bold text-sm text-slate-900 leading-tight">{cashier.name}</h5>
                                                    <p className="text-[10px] text-slate-400 font-bold">{cashier.email || cashier.username || 'Sin usuario'}</p>
                                                    <p className="text-[9px] text-indigo-600 font-mono font-bold mt-0.5">PIN: {cashier.passcode || cashier.pin_hash || '1234'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleToggleCashier(cashier.id, cashier.is_active !== false)}
                                                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                                                        cashier.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                    }`}
                                                >
                                                    {cashier.is_active !== false ? 'Activo' : 'Pausado'}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCashier(cashier.id)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: SETTINGS */}
                    {activeTab === 'settings' && (
                        <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs space-y-6">
                            <div>
                                <h3 className="font-black text-slate-900 text-lg">Configuración Operativa del Local</h3>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">Edita parámetros clave de este negocio directamente en la base de datos.</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">Nombre Comercial *</label>
                                    <input
                                        type="text"
                                        required
                                        value={settingsForm.name}
                                        onChange={e => setSettingsForm({ ...settingsForm, name: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">WhatsApp de Contacto</label>
                                    <input
                                        type="text"
                                        value={settingsForm.whatsapp}
                                        onChange={e => setSettingsForm({ ...settingsForm, whatsapp: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">Categoría Sector</label>
                                    <input
                                        type="text"
                                        value={settingsForm.category}
                                        onChange={e => setSettingsForm({ ...settingsForm, category: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">Tarifa Delivery Base ($)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={settingsForm.delivery_fee}
                                        onChange={e => setSettingsForm({ ...settingsForm, delivery_fee: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">Tiempo Estimado Delivery</label>
                                    <input
                                        type="text"
                                        value={settingsForm.delivery_time}
                                        onChange={e => setSettingsForm({ ...settingsForm, delivery_time: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">Estado Operativo</label>
                                    <select
                                        value={settingsForm.status}
                                        onChange={e => setSettingsForm({ ...settingsForm, status: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                    >
                                        <option value="active">Activo (Abierto)</option>
                                        <option value="busy">Ocupado / Demora</option>
                                        <option value="unavailable">Cerrado Temporal</option>
                                    </select>
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">Dirección Física</label>
                                    <input
                                        type="text"
                                        value={settingsForm.address}
                                        onChange={e => setSettingsForm({ ...settingsForm, address: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <div className="flex items-center gap-3 pt-4">
                                    <input
                                        type="checkbox"
                                        id="is_active_chk"
                                        checked={settingsForm.is_active}
                                        onChange={e => setSettingsForm({ ...settingsForm, is_active: e.target.checked })}
                                        className="w-4 h-4 rounded text-primary focus:ring-primary"
                                    />
                                    <label htmlFor="is_active_chk" className="text-xs font-black text-slate-800 cursor-pointer">
                                        Comercio Habilitado en Plataforma
                                    </label>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={savingSettings}
                                    className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
                                >
                                    {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    <span>Guardar Cambios</span>
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Marketing Push Tab */}
                    {activeTab === 'marketing' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-100 pb-4">
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-fit">
                                    <button
                                        type="button"
                                        onClick={() => setMarketingView('active')}
                                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                            marketingView === 'active' 
                                                ? 'bg-white text-slate-900 shadow-sm' 
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        <Megaphone className="w-3.5 h-3.5 text-primary" />
                                        Activas & Programadas
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMarketingView('history')}
                                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                            marketingView === 'history' 
                                                ? 'bg-white text-slate-900 shadow-sm' 
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        <Clock className="w-3.5 h-3.5 text-slate-600" />
                                        Historial (Caducadas / Ejecutadas)
                                    </button>
                                </div>
                                <span className="text-xs font-bold text-slate-500">
                                    Total: {marketingCampaigns.length} avisos registrados
                                </span>
                            </div>

                            {(() => {
                                const activeCamps = marketingCampaigns.filter(c => 
                                    !c.executed_at && 
                                    !c.expired_at && 
                                    c.status !== 'completed' && 
                                    c.status !== 'expired' && 
                                    c.status !== 'rejected_payment' && 
                                    c.status !== 'rejected'
                                );
                                const historyCamps = marketingCampaigns.filter(c => 
                                    !!c.executed_at || 
                                    !!c.expired_at || 
                                    c.status === 'completed' || 
                                    c.status === 'expired' || 
                                    c.status === 'rejected_payment' || 
                                    c.status === 'rejected'
                                );
                                const list = marketingView === 'active' ? activeCamps : historyCamps;

                                if (list.length === 0) {
                                    return (
                                        <div className="p-12 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-2">
                                            <Megaphone className="w-10 h-10 text-slate-300 mx-auto" />
                                            <p className="font-bold text-slate-700 text-sm">
                                                {marketingView === 'active' ? 'No hay campañas activas ni programadas para este local.' : 'No hay historial de avisos caducados.'}
                                            </p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {list.map(camp => {
                                            const sched = camp.scheduled_at ? new Date(camp.scheduled_at) : null;
                                            const formattedDate = sched && !isNaN(sched.getTime()) ? sched.toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha';
                                            const isExecuted = !!camp.executed_at || camp.status === 'completed';
                                            const canReschedule = !isExecuted && camp.status !== 'expired' && camp.status !== 'rejected_payment';

                                            return (
                                                <div key={camp.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
                                                    <div>
                                                        {camp.banner_url && (
                                                            <img src={camp.banner_url} alt="Banner" className="w-full h-32 object-cover rounded-xl mb-3" />
                                                        )}
                                                        <div className="flex items-start justify-between gap-2 mb-1">
                                                            <h4 className="font-black text-slate-900 text-sm line-clamp-1">{camp.title}</h4>
                                                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                                                                ${camp.price || 0} USD
                                                            </span>
                                                        </div>
                                                        <p className="text-slate-500 text-xs mb-3 line-clamp-2">{camp.subtitle}</p>

                                                        <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-xs space-y-1.5 mb-3">
                                                            <div className="flex items-center justify-between text-slate-600">
                                                                <span className="font-bold flex items-center gap-1">
                                                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                                    {isExecuted ? 'Enviada:' : 'Programada:'}
                                                                </span>
                                                                <span className="font-mono font-bold text-slate-800 text-[11px]">{formattedDate}</span>
                                                            </div>
                                                            {camp.was_auto_rescheduled && (
                                                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded block">
                                                                    📅 Reprogramada (+24h) auto
                                                                </span>
                                                            )}
                                                            {camp.was_rescheduled && !camp.was_auto_rescheduled && (
                                                                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded block">
                                                                    🕒 Hora modificada
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="pt-2 border-t border-slate-200 space-y-2">
                                                        <span className={`py-1 px-2.5 rounded-xl text-[10px] font-black text-center w-full block ${
                                                            isExecuted ? 'bg-slate-900 text-emerald-400' :
                                                            camp.status === 'verifying_payment' ? 'bg-amber-100 text-amber-900' :
                                                            camp.status === 'active' || camp.status === 'approved' ? 'bg-emerald-100 text-emerald-900' :
                                                            'bg-slate-200 text-slate-700'
                                                        }`}>
                                                            {isExecuted ? '✓ Enviada & Caducada' :
                                                             camp.status === 'verifying_payment' ? '⏳ Verificando Pago' :
                                                             camp.status === 'active' || camp.status === 'approved' ? '🚀 Aprobada / Programada' :
                                                             camp.status}
                                                        </span>

                                                        {canReschedule && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenReschedule(camp)}
                                                                className="w-full py-2 px-3 rounded-xl font-bold text-xs bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center gap-1.5 transition-all active:scale-98"
                                                            >
                                                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                                                🕒 Cambiar Hora / Reprogramar
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {/* Modal de Reprogramación Directa */}
                            {rescheduleCamp && (
                                <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                                    <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-5 h-5 text-amber-600" />
                                                <h4 className="font-black text-slate-900 text-sm">Reprogramar Lanzamiento</h4>
                                            </div>
                                            <button onClick={() => setRescheduleCamp(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <p className="text-xs text-slate-500">
                                            Modifica la hora de emisión de "<strong>{rescheduleCamp.title}</strong>". Se notificará al negocio.
                                        </p>

                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-xs font-bold text-slate-700 block mb-1">Nueva Fecha</label>
                                                <input 
                                                    type="date"
                                                    min={new Date().toISOString().split('T')[0]}
                                                    value={rescheduleDate}
                                                    onChange={e => setRescheduleDate(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-700 block mb-1">Nueva Hora</label>
                                                <input 
                                                    type="time"
                                                    value={rescheduleTime}
                                                    onChange={e => setRescheduleTime(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setRescheduleCamp(null)}
                                                className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                disabled={savingReschedule}
                                                onClick={handleConfirmReschedule}
                                                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-primary font-black text-xs hover:bg-slate-800 flex items-center justify-center gap-1.5"
                                            >
                                                {savingReschedule ? 'Guardando...' : 'Confirmar'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
