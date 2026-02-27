import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { Clock, CheckCircle, AlertCircle, Printer, Loader2, Filter, ChevronRight, Package } from 'lucide-react';

interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    price: number;
    category?: string;
    printerId?: string;
}

interface Order {
    id: string;
    items: OrderItem[];
    status: string;
    createdAt: any;
    tableNumber?: string;
    userName?: string;
    userPhone?: string;
    notes?: string;
}

interface Station {
    id: string;
    name: string;
    categories?: string[];
}

export default function KitchenDisplay() {
    const { user } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [stations, setStations] = useState<Station[]>([]);
    const [selectedStation, setSelectedStation] = useState<string>(() => localStorage.getItem('selectedStation') || 'all');
    const [autoPrint, setAutoPrint] = useState(true);
    const [loading, setLoading] = useState(true);
    const [lastProcessedOrderId, setLastProcessedOrderId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        // Fetch stations
        const fetchStations = async () => {
            const stationsRef = collection(db, 'restaurants', user.uid, 'printers');
            const snapshot = await getDocs(stationsRef);
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Station));
            setStations(items);
        };

        fetchStations();

        // Listen for preparing orders
        const ordersRef = collection(db, 'orders');
        const q = query(
            ordersRef,
            where('restaurantId', '==', user.uid),
            where('status', 'in', ['pending', 'preparing']),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items: Order[] = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() } as Order);
            });
            setOrders(items);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    // Save selected station
    useEffect(() => {
        if (selectedStation) {
            localStorage.setItem('selectedStation', selectedStation);
        }
    }, [selectedStation]);

    const activeStation = stations.find(s => s.id === selectedStation);

    // Filter items logic
    const getStationItems = (items: OrderItem[]) => {
        return items.filter(item => {
            if (selectedStation === 'all') return true;

            // Match by printerId
            if (item.printerId === selectedStation) return true;

            // Fallsback to category match
            if (activeStation?.categories?.includes(item.category || '')) return true;

            return false;
        });
    };

    // Auto-print logic
    useEffect(() => {
        if (!autoPrint || selectedStation === 'all' || orders.length === 0) return;

        const latestPendingOrder = [...orders]
            .filter(o => o.status === 'pending')
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];

        if (latestPendingOrder && latestPendingOrder.id !== lastProcessedOrderId) {
            const stationItems = getStationItems(latestPendingOrder.items);
            if (stationItems.length > 0) {
                console.log("Auto-printing latest order:", latestPendingOrder.id);
                handlePrint(latestPendingOrder, stationItems);
                setLastProcessedOrderId(latestPendingOrder.id);
            }
        }
    }, [orders, autoPrint, selectedStation]);

    const handlePrint = (order: Order, stationItems: OrderItem[]) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const stationName = stations.find(s => s.id === selectedStation)?.name || 'ESTACIÓN';

        const content = `
            <html>
                <head>
                    <style>
                        body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 10px; margin: 0; }
                        h1 { text-align: center; font-size: 20px; margin-bottom: 5px; text-transform: uppercase; }
                        .header { text-align: center; margin-bottom: 15px; border-bottom: 2px dashed #000; padding-bottom: 10px; }
                        .client-info { background: #f0f0f0; padding: 5px; margin-bottom: 15px; border: 1px solid #000; text-align: center; }
                        .item { display: flex; justify-content: space-between; margin-bottom: 15px; font-weight: bold; font-size: 18px; border-bottom: 1px dotted #ccc; padding-bottom: 5px; }
                        .quantity { margin-right: 15px; background: #000; color: #fff; padding: 0 5px; }
                        .notes { font-style: italic; font-size: 16px; margin-top: 10px; color: #000; background: #eee; padding: 5px; border-left: 5px solid #000; }
                        .footer { margin-top: 20px; border-top: 2px dashed #000; padding-top: 10px; font-size: 12px; text-align: center; }
                        .time { font-size: 14px; margin-top: 5px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${stationName}</h1>
                        <p style="font-size: 22px; font-weight: 900;">#${order.id.slice(-4).toUpperCase()}</p>
                        ${order.tableNumber ? `<div style="font-size: 26px; font-weight: 900; background: #000; color: #fff; padding: 5px; margin: 5px 0;">MESA: ${order.tableNumber}</div>` : '<div style="font-size: 20px; font-weight: 900; border: 2px solid #000; padding: 5px; margin: 5px 0;">PARA LLEVAR</div>'}
                        <div class="time">${new Date().toLocaleTimeString('es-VE')} - ${new Date().toLocaleDateString('es-VE')}</div>
                    </div>

                    <div class="client-info">
                        <strong>CLIENTE:</strong> ${order.userName || 'CLIENTE GENERAL'}<br/>
                        ${order.userPhone ? `<strong>TEL:</strong> ${order.userPhone}` : ''}
                    </div>

                    ${stationItems.map(item => `
                        <div class="item">
                            <div><span class="quantity">${item.quantity}</span> ${item.name}</div>
                        </div>
                    `).join('')}

                    ${order.notes ? `<div class="notes"><strong>NOTAS:</strong> ${order.notes}</div>` : ''}

                    <div class="footer">
                        <p>*** DeliExpress - Comanda de Servicio ***</p>
                    </div>
                    <script>
                        window.print();
                        window.onafterprint = function() { window.close(); };
                    </script>
                </body>
            </html>
        `;

        printWindow.document.write(content);
        printWindow.document.close();
    };

    const markAsReady = async (orderId: string) => {
        if (!window.confirm('¿Marcar toda la orden como lista?')) return;
        try {
            await updateDoc(doc(db, 'orders', orderId), {
                status: 'preparing', // Keep as preparing if you want partial management, or move to 'delivering'
            });
        } catch (error) {
            console.error("Error updating order:", error);
        }
    };

    // Filter orders and their items based on selected station
    const filteredOrders = orders.map(order => {
        const filteredItems = getStationItems(order.items);
        return { ...order, items: filteredItems };
    }).filter(order => order.items.length > 0);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Iniciando Monitor de Cocina...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Monitor de Cocina (KDS)</h1>
                    <p className="text-slate-500 font-medium">Visualización y control de preparación por estación</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={() => setAutoPrint(!autoPrint)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-lg ${autoPrint
                            ? 'bg-emerald-500 text-white shadow-emerald-200'
                            : 'bg-white text-slate-400 border border-slate-100'
                            }`}
                    >
                        <Printer className="w-5 h-5" />
                        Impresión Automática: {autoPrint ? 'ON' : 'OFF'}
                    </button>

                    <div className="flex items-center gap-3 bg-white p-2 rounded-[2rem] shadow-lg shadow-slate-200/50 border border-slate-100">
                        <Filter className="w-5 h-5 ml-4 text-slate-400" />
                        <select
                            value={selectedStation}
                            onChange={(e) => setSelectedStation(e.target.value)}
                            className="bg-transparent border-none font-black text-slate-800 focus:ring-0 pr-8"
                        >
                            <option value="all">Todas las Estaciones</option>
                            {stations.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredOrders.map((order) => {
                    const timeElapsed = Math.floor((new Date().getTime() - (order.createdAt?.seconds * 1000 || new Date().getTime())) / 60000);
                    const isUrgent = timeElapsed > 15;

                    return (
                        <div
                            key={order.id}
                            className={`bg-white rounded-[2.5rem] shadow-xl border overflow-hidden transition-all flex flex-col h-full ${isUrgent ? 'border-rose-200' : 'border-slate-100'
                                }`}
                        >
                            {/* Card Header */}
                            <div className={`p-5 flex items-start justify-between ${isUrgent ? 'bg-rose-50' : 'bg-slate-50'}`}>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={`w-3 h-3 rounded-full animate-pulse ${isUrgent ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Orden ${order.id.slice(-6).toUpperCase()}</span>
                                    </div>
                                    <h3 className="text-2xl font-black text-slate-800">
                                        {order.tableNumber ? `MESA ${order.tableNumber}` : 'PARA LLEVAR'}
                                    </h3>
                                </div>
                                <div className="text-right">
                                    <div className={`flex items-center gap-1.5 font-black text-lg ${isUrgent ? 'text-rose-500' : 'text-slate-700'}`}>
                                        <Clock className="w-5 h-5" />
                                        {timeElapsed} min
                                    </div>
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="p-5 flex-1 space-y-4">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-700">
                                            {item.quantity}
                                        </span>
                                        <div className="flex-1">
                                            <p className="font-bold text-slate-800 leading-tight">{item.name}</p>
                                        </div>
                                    </div>
                                ))}

                                {order.notes && (
                                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                                        <p className="text-xs font-black uppercase tracking-widest text-amber-600 mb-1">Notas</p>
                                        <p className="text-sm font-bold text-amber-800 leading-tight">{order.notes}</p>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="p-4 bg-white border-t border-slate-50 flex gap-2">
                                <button
                                    onClick={() => handlePrint(order, order.items)}
                                    className="flex-1 bg-slate-100 text-slate-600 p-4 rounded-3xl font-black flex items-center justify-center gap-2 hover:bg-slate-200 active:scale-95 transition-all"
                                >
                                    <Printer className="w-5 h-5" />
                                    TICKET
                                </button>
                                <button
                                    onClick={() => markAsReady(order.id)}
                                    className="flex-1 bg-emerald-500 text-white p-4 rounded-3xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 hover:scale-105 active:scale-95 transition-all"
                                >
                                    <CheckCircle className="w-5 h-5" />
                                    LISTA
                                </button>
                            </div>
                        </div>
                    );
                })}

                {filteredOrders.length === 0 && (
                    <div className="col-span-full py-24 flex flex-col items-center justify-center bg-slate-50 rounded-[4rem] border-2 border-dashed border-slate-200">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg mb-6">
                            <Package className="w-10 h-10 text-slate-200" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-400">Sin pedidos pendientes</h2>
                        <p className="text-slate-400 font-bold">Todo está bajo control en esta estación.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
