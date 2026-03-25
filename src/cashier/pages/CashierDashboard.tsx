import React, { useState, useEffect } from 'react';
import { LogOut, DollarSign, CheckCircle, Clock, X, Loader2, Store, CreditCard, User, Plus, Edit, ClipboardList } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import ProductTicker from '../components/ProductTicker';

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

    // Cierre de caja
    const [closeRegisterModalOpen, setCloseRegisterModalOpen] = useState(false);
    const [registerReport, setRegisterReport] = useState<any>(null);
    const [isLoadingReport, setIsLoadingReport] = useState(false);

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
