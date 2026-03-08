import React, { useState, useEffect } from 'react';
import { Search, Filter, Clock, MapPin, ChevronRight, Package, Truck, CheckCircle, Loader2, Bell, ExternalLink, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { printToUsbDevice, formatTicket, PrintOrder } from '../../lib/usb-printer';

interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    price: number;
    image?: string;
}

interface Order {
    id: string;
    userId: string;
    items: OrderItem[];
    total: number;
    status: 'pending' | 'preparing' | 'delivering' | 'delivered' | 'rejected';
    paymentStatus?: 'sold' | 'not_sold';
    createdAt: any;
    deliveryAddress: string;
    userName?: string;
}

export default function Orders() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'pending' | 'preparing' | 'delivering' | 'delivered' | 'rejected'>('pending');
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

    // ...

    useEffect(() => {
        if (!user) return;

        const ordersRef = collection(db, 'orders');
        const q = query(
            ordersRef,
            where('restaurantId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items: Order[] = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() } as Order);
            });

            // Check for new pending orders for sound
            const hasNewPending = items.some(o => o.status === 'pending' && (!orders.find(prev => prev.id === o.id)));
            if (hasNewPending && orders.length > 0) {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.play().catch(e => console.log("Audio play blocked"));
            }

            setOrders(items);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to orders:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, orders.length]);

    const handlePrintOrder = async (orderId: string, orderData: Order) => {
        if (!user) return;
        setPrintingOrderId(orderId);
        try {
            // Obtener todas las impresoras configuradas
            const printersRef = collection(db, 'restaurants', user.uid, 'printers');
            const snapshot = await getDocs(printersRef);
            const printers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

            // Promesas de impresión
            const printPromises: Promise<boolean>[] = [];

            // Agrupar ítems por impresora según categoría
            for (const printer of printers) {
                if (!printer.vendorId || !printer.productId || !printer.isActive) continue;

                // Si la estación no tiene categorías asignadas, salta. Si tiene, busca los ítems que coinciden.
                // Asumimos que `orderData.items` puede o no tener `category`.
                // Si la pizzería no tiene category en item, hay que tener cuidado. En este boilerplate, confiaremos en que el 'name' o algo matchea la categoría.
                // Lo más robusto si no hay 'category' en OrderItem es buscar qué items caen en qué estación.
                // Como no sabemos si 'category' viene en la orden, de momento vamos a validar si printer.categories incluye 'category' del item o si le mandamos toda la orden a todas las impresoras si queremos simplicidad.
                // Por requerimiento: Filtrado por Categoría de los ítems. Asumiremos que item.category existe.

                const itemsForThisPrinter = orderData.items.filter(item => {
                    // Si el item tiene categoría explícita y está en la impresora
                    const itemCat = (item as any).category || '';
                    return printer.categories?.includes(itemCat);
                });

                // Si por alguna razón la impresora tiene categoría "Todas" y no hay match con nombres, mandamos.
                // Para mantenerlo acorde al requerimiento, solo enviamos si hay items filtrados:
                if (itemsForThisPrinter.length > 0) {
                    const printData: PrintOrder = {
                        id: orderData.id,
                        userName: orderData.userName,
                        items: itemsForThisPrinter.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
                        stationName: printer.name,
                        createdAt: orderData.createdAt?.toDate ? orderData.createdAt.toDate() : new Date(),
                        orderNote: (orderData as any).orderNote,
                        tableNumber: (orderData as any).tableNumber
                    };

                    const buffer = formatTicket(printData);
                    printPromises.push(printToUsbDevice(printer.vendorId, printer.productId, buffer));
                }
            }

            // Esperamos que todas las impresiones enviadas terminen
            if (printPromises.length > 0) {
                await Promise.all(printPromises);
            } else {
                console.log("No se encontraron impresoras USB configuradas o items asignables a ellas para este pedido.");
            }

        } catch (error) {
            console.error("Error general de impresión:", error);
            alert("Ocurrió un error al intentar imprimir. Verifica que las impresoras USB estén conectadas y configuradas.");
        } finally {
            setPrintingOrderId(null);
        }
    };

    const updateStatus = async (orderId: string, newStatus: string, paymentStatus?: string) => {
        try {
            const orderRef = doc(db, 'orders', orderId);
            const orderTemp = orders.find(o => o.id === orderId);

            // Si pasa a preprando, imprimimos los tickets correspondientes
            if (newStatus === 'preparing' && orderTemp) {
                await handlePrintOrder(orderId, orderTemp);
            }

            const updates: any = { status: newStatus };
            if (paymentStatus) {
                updates.paymentStatus = paymentStatus;
            }
            await updateDoc(orderRef, updates);
        } catch (error) {
            console.error("Error updating order status:", error);
        }
    };

    const stats = {
        pending: orders.filter(o => o.status === 'pending').length,
        preparing: orders.filter(o => o.status === 'preparing').length,
        delivering: orders.filter(o => o.status === 'delivering').length,
        delivered: orders.filter(o => o.status === 'delivered').length,
        rejected: orders.filter(o => o.status === 'rejected').length,
    };

    const filteredOrders = orders
        .filter(o => o.status === (activeTab as any))
        .filter(o =>
            o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.deliveryAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (o.userName && o.userName.toLowerCase().includes(searchTerm.toLowerCase()))
        );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando pedidos en tiempo real...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        Gestión de Pedidos
                        {stats.pending > 0 && (
                            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-bounce">
                                {stats.pending} NUEVOS
                            </span>
                        )}
                    </h1>
                    <p className="text-slate-500 font-medium">Monitorea y despacha tus órdenes al momento.</p>
                </div>
                <div className="flex items-center gap-2 bg-green-50 text-green-600 px-4 py-2 rounded-xl text-sm font-bold border border-green-100 italic">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    Buscando nuevos pedidos...
                </div>
            </div>

            {/* Status Tabs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 p-2 bg-slate-100 rounded-[30px]">
                {[
                    { id: 'pending', label: 'Pendientes', icon: Bell, color: 'bg-orange-500' },
                    { id: 'preparing', label: 'Cocina', icon: Package, color: 'bg-blue-500' },
                    { id: 'delivering', label: 'Camino', icon: Truck, color: 'bg-purple-500' },
                    { id: 'delivered', label: 'Entregados', icon: CheckCircle, color: 'bg-green-500' },
                    { id: 'rejected', label: 'Rechazados', icon: X, color: 'bg-red-500' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center justify-center gap-2 p-4 rounded-[25px] font-black transition-all ${activeTab === tab.id
                            ? 'bg-white shadow-lg text-slate-900'
                            : 'text-slate-500 hover:bg-white/50'
                            }`}
                    >
                        <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-primary' : ''}`} />
                        <span className="hidden xl:inline">{tab.label}</span>
                        <span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full text-white ${tab.color}`}>
                            {(stats as any)[tab.id]}
                        </span>
                    </button>
                ))}
            </div>

            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por ID de pedido o dirección..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-4 pl-12 rounded-2xl outline-none focus:border-primary transition-all font-bold text-slate-700 shadow-sm"
                />
            </div>

            {filteredOrders.length === 0 ? (
                <div className="p-20 text-center border-2 border-dashed border-slate-100 rounded-[40px] grayscale opacity-50 bg-white/50">
                    <Clock className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold text-xl">Sin pedidos en esta sección</p>
                    <p className="text-slate-300 font-medium max-w-xs mx-auto mt-2 italic">Aquí aparecerán los pedidos que coincidan con el estado seleccionado.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {filteredOrders.map((order) => (
                        <div key={order.id} className="bg-white rounded-[35px] p-8 border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                            {order.paymentStatus === 'sold' && (
                                <div className="absolute top-0 right-0 p-4">
                                    <span className="bg-green-100 text-green-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Venta Exitosa</span>
                                </div>
                            )}
                            {order.paymentStatus === 'not_sold' && (
                                <div className="absolute top-0 right-0 p-4">
                                    <span className="bg-red-100 text-red-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">No Vendido</span>
                                </div>
                            )}

                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PEDIDO #{order.id.slice(-6).toUpperCase()}</span>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900">{order.userName || 'Usuario de DeliExpress'}</h3>
                                    <p className="text-sm text-slate-400 font-bold flex items-center gap-1 mt-1">
                                        <Clock className="w-4 h-4" />
                                        {order.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-black text-primary">${order.total.toFixed(2)}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Cobrado</p>
                                </div>
                            </div>

                            <div className="space-y-3 mb-6">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl">
                                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-primary border border-slate-100 shadow-sm">
                                            {item.quantity}x
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-black text-slate-700">{item.name}</p>
                                            <p className="text-xs text-slate-400 font-bold">${item.price.toFixed(2)} c/u</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl mb-8">
                                <MapPin className="w-5 h-5 text-primary shrink-0" />
                                <p className="text-sm font-bold text-slate-600 leading-relaxed italic">{order.deliveryAddress}</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                {order.status === 'pending' && (
                                    <>
                                        <button
                                            onClick={() => updateStatus(order.id, 'preparing')}
                                            disabled={printingOrderId === order.id}
                                            className="flex-1 min-w-[140px] bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {printingOrderId === order.id ? (
                                                <><Loader2 className="w-5 h-5 animate-spin" /> Imprimiendo...</>
                                            ) : (
                                                <>Aceptar</>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => updateStatus(order.id, 'rejected')}
                                            className="px-6 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black hover:bg-red-50 hover:text-red-500 transition-all"
                                        >
                                            Rechazar
                                        </button>
                                    </>
                                )}
                                {order.status === 'preparing' && (
                                    <button
                                        onClick={() => updateStatus(order.id, 'delivering')}
                                        disabled={printingOrderId === order.id}
                                        className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {printingOrderId === order.id ? (
                                            <><Loader2 className="w-5 h-5 animate-spin" /> Imprimiendo...</>
                                        ) : (
                                            <>Enviar Pedido</>
                                        )}
                                    </button>
                                )}
                                {order.status === 'delivering' && (
                                    <button
                                        onClick={() => updateStatus(order.id, 'delivered')}
                                        className="flex-1 bg-green-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                    >
                                        Confirmar Entrega
                                    </button>
                                )}
                                {order.status === 'delivered' && !order.paymentStatus && (
                                    <div className="flex w-full gap-2">
                                        <button
                                            onClick={() => updateStatus(order.id, 'delivered', 'sold')}
                                            className="flex-1 bg-green-100 text-green-700 py-3 rounded-xl font-black hover:bg-green-200 transition-all flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle className="w-4 h-4" /> Venta Exitosa
                                        </button>
                                        <button
                                            onClick={() => updateStatus(order.id, 'delivered', 'not_sold')}
                                            className="flex-1 bg-red-50 text-red-600 py-3 rounded-xl font-black hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                                        >
                                            <X className="w-4 h-4" /> No Vendido
                                        </button>
                                    </div>
                                )}
                                <button className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200 transition-colors">
                                    <ExternalLink className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
