import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, addDoc, getDocs, where, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { DollarSign, Search, CheckCircle, RefreshCw, AlertCircle, TrendingUp, History, User } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LiquidationsManager() {
    const [activeTab, setActiveTab] = useState<'restaurants' | 'drivers' | 'history'>('restaurants');
    
    // Data states
    const [restaurants, setRestaurants] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [payoutsHistory, setPayoutsHistory] = useState<any[]>([]);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch Restaurants
        const qResta = query(collection(db, 'restaurants'), orderBy('name'));
        const unsubResta = onSnapshot(qResta, (snap) => {
            setRestaurants(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Fetch Drivers and Unpaid Earnings
        const fetchDriversAndEarnings = async () => {
            try {
                const driversSnap = await getDocs(collection(db, 'delivery_drivers'));
                const driversData = driversSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                // Realtime unpaid orders
                const qOrders = query(collection(db, 'orders'), where('status', '==', 'completed'));
                const unsubOrders = onSnapshot(qOrders, (ordersSnap) => {
                    const ordersData = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                    
                    const qTransport = query(collection(db, 'transport_requests'), where('status', '==', 'completed'));
                    getDocs(qTransport).then((transportSnap) => {
                        const transportData = transportSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                        
                        const processedDrivers = driversData.map(driver => {
                            const driverOrders = ordersData.filter(o => o.deliveryDriverId === driver.id && !o.deliveryPaid);
                            const driverTransports = transportData.filter(t => t.driverId === driver.id && !t.driverPaid);
                            
                            const deliverySum = driverOrders.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
                            const transportSum = driverTransports.reduce((sum, t) => sum + parseFloat(t.driverPayout || t.price || 0), 0);
                            
                            return {
                                ...driver,
                                unpaidOrders: driverOrders,
                                unpaidTransports: driverTransports,
                                totalUnpaid: deliverySum + transportSum
                            };
                        });
                        
                        setDrivers(processedDrivers.sort((a, b) => b.totalUnpaid - a.totalUnpaid));
                        setLoading(false);
                    });
                });
                return unsubOrders;
            } catch (err) {
                console.error("Error fetching drivers:", err);
                setLoading(false);
            }
        };

        const unsubOrdersPromise = fetchDriversAndEarnings();

        // Fetch Payouts History
        const qHistory = query(collection(db, 'payouts_history'), orderBy('paidAt', 'desc'));
        const unsubHistory = onSnapshot(qHistory, (snap) => {
            setPayoutsHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => {
            unsubResta();
            unsubOrdersPromise.then((unsub: any) => unsub && unsub());
            unsubHistory();
        };
    }, []);

    const handleClearDeliveryDebt = async (restaurantId: string, currentDebt: number, restaurantName: string) => {
        if (!window.confirm(`¿Confirmas que el restaurante ${restaurantName} ha pagado su deuda de $${currentDebt.toFixed(2)} por concepto de delivery/repartos?`)) return;
        
        try {
            const restRef = doc(db, 'restaurants', restaurantId);
            await updateDoc(restRef, {
                deuda_delivery_acumulada: 0
            });
            
            await addDoc(collection(db, 'payouts_history'), {
                targetId: restaurantId,
                targetName: restaurantName,
                targetType: 'restaurant',
                amountPaid: currentDebt,
                paidAt: new Date().toISOString(),
                type: 'debt_cleared',
                description: 'Deuda por repartos cobrados en local saldada.'
            });

            toast.success("Deuda saldada correctamente");
        } catch (error) {
            console.error("Error clearing delivery debt:", error);
            toast.error("Error al saldar la deuda");
        }
    };

    const handlePayDriver = async (driver: any) => {
        if (!window.confirm(`¿Confirmas el pago de $${driver.totalUnpaid.toFixed(2)} al piloto ${driver.fullName}?`)) return;

        try {
            const batch = writeBatch(db);

            driver.unpaidOrders.forEach((o: any) => {
                const ref = doc(db, 'orders', o.id);
                batch.update(ref, { deliveryPaid: true });
            });

            driver.unpaidTransports.forEach((t: any) => {
                const ref = doc(db, 'transport_requests', t.id);
                batch.update(ref, { driverPaid: true });
            });

            await batch.commit();

            await addDoc(collection(db, 'payouts_history'), {
                targetId: driver.id,
                targetName: driver.fullName,
                targetType: 'driver',
                amountPaid: driver.totalUnpaid,
                paidAt: new Date().toISOString(),
                type: 'driver_payout',
                description: `Liquidación de ${driver.unpaidOrders.length} envíos y ${driver.unpaidTransports.length} viajes.`
            });

            toast.success(`Pago procesado a ${driver.fullName}`);
        } catch (error) {
            console.error("Error processing driver payout:", error);
            toast.error("Error al procesar el pago");
        }
    };

    const filteredRestaurants = restaurants.filter(r => 
        (r.deuda_delivery_acumulada || 0) > 0 &&
        r.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredDrivers = drivers.filter(d => 
        d.totalUnpaid > 0 && 
        d.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                        <DollarSign className="w-8 h-8 text-primary" />
                        Módulo de Liquidaciones
                    </h1>
                    <p className="text-slate-500 font-medium">Gestiona deudas de restaurantes y pagos a pilotos.</p>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-2">
                <button
                    onClick={() => setActiveTab('restaurants')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${
                        activeTab === 'restaurants' ? 'bg-primary text-slate-900 shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <TrendingUp className="w-5 h-5" />
                    Deuda Restaurantes
                </button>
                <button
                    onClick={() => setActiveTab('drivers')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${
                        activeTab === 'drivers' ? 'bg-primary text-slate-900 shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <CheckCircle className="w-5 h-5" />
                    Liquidación Pilotos
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${
                        activeTab === 'history' ? 'bg-primary text-slate-900 shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    <History className="w-5 h-5" />
                    Historial Registros
                </button>
            </div>

            {/* Search Bar */}
            {activeTab !== 'history' && (
                <div className="relative">
                    <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder={`Buscar ${activeTab === 'restaurants' ? 'restaurante' : 'piloto'}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-primary/50"
                    />
                </div>
            )}

            {/* Content Tabs */}
            {activeTab === 'restaurants' && (
                <div className="space-y-4">
                    {filteredRestaurants.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                            <h3 className="font-bold text-slate-900">Sin deudas pendientes</h3>
                            <p className="text-slate-500 text-sm">Todos los restaurantes están al día.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredRestaurants.map(rest => (
                                <div key={rest.id} className="bg-white rounded-3xl border border-red-100 p-6 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>
                                    <h3 className="font-bold text-slate-900 text-lg">{rest.name}</h3>
                                    <p className="text-sm font-medium text-slate-500 mb-4">{rest.address || 'Sin dirección'}</p>
                                    
                                    <div className="p-4 bg-red-50 text-red-900 rounded-2xl mb-4">
                                        <p className="text-xs uppercase font-bold tracking-wider opacity-75">Deuda Acumulada</p>
                                        <p className="text-3xl font-black">${(rest.deuda_delivery_acumulada || 0).toFixed(2)}</p>
                                        <p className="text-xs mt-1 leading-tight opacity-80">Por pedidos pagados en el local usando motorizados de la plataforma.</p>
                                    </div>
                                    
                                    <button 
                                        onClick={() => handleClearDeliveryDebt(rest.id, rest.deuda_delivery_acumulada, rest.name)}
                                        className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
                                    >
                                        Saldar Deuda
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'drivers' && (
                <div className="space-y-4">
                    {filteredDrivers.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-3xl border border-slate-200">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                            <h3 className="font-bold text-slate-900">Sin pagos pendientes</h3>
                            <p className="text-slate-500 text-sm">Todos los pilotos han sido liquidados.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {filteredDrivers.map(driver => (
                                <div key={driver.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                                    <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                                                <User className="w-6 h-6 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-900">{driver.fullName}</h3>
                                                <p className="text-sm font-medium text-slate-500">{driver.phone || 'Sin teléfono'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase font-bold text-slate-400">Total a Liquidar</p>
                                            <p className="text-2xl font-black text-slate-900">${driver.totalUnpaid.toFixed(2)}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <p className="text-[10px] uppercase font-bold text-slate-400">Envíos (Delivery)</p>
                                            <p className="text-lg font-bold text-slate-800">{driver.unpaidOrders.length}</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <p className="text-[10px] uppercase font-bold text-slate-400">Viajes (Transporte)</p>
                                            <p className="text-lg font-bold text-slate-800">{driver.unpaidTransports.length}</p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-blue-50 text-blue-900 rounded-2xl border border-blue-100 mb-6">
                                        <p className="text-xs uppercase font-bold tracking-wider mb-2">Datos Bancarios (Pago Móvil)</p>
                                        {driver.paymentMobile?.phone ? (
                                            <div className="text-sm font-medium space-y-1">
                                                <p><span className="font-bold">Banco:</span> {driver.paymentMobile.bank}</p>
                                                <p><span className="font-bold">Cédula:</span> {driver.paymentMobile.cedula}</p>
                                                <p><span className="font-bold">Teléfono:</span> {driver.paymentMobile.phone}</p>
                                            </div>
                                        ) : (
                                            <p className="text-sm italic opacity-75">No ha registrado datos de Pago Móvil.</p>
                                        )}
                                    </div>

                                    <button 
                                        onClick={() => handlePayDriver(driver)}
                                        className="w-full py-3 bg-primary text-slate-900 rounded-xl font-bold hover:brightness-105 transition-all shadow-md"
                                    >
                                        Marcar como Pagado
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    {payoutsHistory.length === 0 ? (
                        <div className="text-center py-12">
                            <History className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium">No hay registros de liquidaciones aún.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[600px]">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold border-b border-slate-200">Fecha</th>
                                        <th className="p-4 font-bold border-b border-slate-200">Receptor / Local</th>
                                        <th className="p-4 font-bold border-b border-slate-200">Concepto</th>
                                        <th className="p-4 font-bold border-b border-slate-200 text-right">Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payoutsHistory.map((record) => (
                                        <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                            <td className="p-4 text-sm font-medium text-slate-600">
                                                {new Date(record.paidAt).toLocaleString()}
                                            </td>
                                            <td className="p-4">
                                                <div>
                                                    <p className="font-bold text-slate-800">{record.targetName}</p>
                                                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${record.targetType === 'driver' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                        {record.targetType === 'driver' ? 'Piloto' : 'Restaurante'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-xs font-medium text-slate-500 leading-tight">
                                                {record.description}
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-black text-slate-900">${record.amountPaid.toFixed(2)}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
