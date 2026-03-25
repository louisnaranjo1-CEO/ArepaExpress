import React, { useState, useEffect } from 'react';
import { LogOut, DollarSign, CheckCircle, Clock, X, Loader2, Store, CreditCard, User } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

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
}

export default function CashierDashboard() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [cashierData, setCashierData] = useState<any>(null);
    const [restaurantId, setRestaurantId] = useState<string | null>(null);

    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [closeSaleModalOpen, setCloseSaleModalOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [closeTip, setCloseTip] = useState(0);
    const [isAccepting, setIsAccepting] = useState(false);

    useEffect(() => {
        const storedCashier = localStorage.getItem('cashierData');
        const storedRestaurantId = localStorage.getItem('cashierRestaurantId');
        
        if (!storedCashier || !storedRestaurantId) {
            navigate('/login');
            return;
        }

        setCashierData(JSON.parse(storedCashier));
        setRestaurantId(storedRestaurantId);

        const ordersRef = collection(db, 'orders');
        const q = query(
            ordersRef,
            where('restaurantId', '==', storedRestaurantId),
            where('paymentStatus', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(data);
        });

        // Also fetch orders with missing paymentStatus but not rejected/delivered
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
            unsubscribe();
            unsubscribe2();
        };
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('cashierData');
        localStorage.removeItem('cashierRestaurantId');
        localStorage.removeItem('isCashier');
        navigate('/login');
    };

    const handleCloseSale = async () => {
        if (!selectedOrder || !paymentMethod) {
            alert("Por favor seleccione un método de pago.");
            return;
        }
        setIsAccepting(true);
        try {
            const updates: any = {
                paymentMethod: paymentMethod,
                paymentStatus: 'sold',
                tip: closeTip,
                total: selectedOrder.subtotal + (selectedOrder.deliveryFee || 0) + closeTip
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

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Header */}
            <header className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-200 sticky top-0 z-40">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                        <Store className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="font-black text-slate-900 text-lg leading-tight">Caja y Cobros</h1>
                        <p className="text-xs font-bold text-slate-500 flex items-center gap-1">
                            <User className="w-3 h-3" /> {cashierData?.name}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Salir</span>
                </button>
            </header>

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
                                    <button
                                        onClick={() => { setSelectedOrder(order); setCloseSaleModalOpen(true); }}
                                        className="w-full bg-emerald-500 text-white py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                                    >
                                        <DollarSign className="w-5 h-5" />
                                        Cobrar Cuenta
                                    </button>
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
                                <span className="text-sm font-black text-slate-900">TOTAL:</span>
                                <span className="font-black text-xl text-primary">${((selectedOrder.subtotal || 0) + (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
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
        </div>
    );
}
