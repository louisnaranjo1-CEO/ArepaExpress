import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DeliveryDriver } from '../lib/delivery-service';
import { Navigation, Clock, CheckCircle2, Package, MapPin, Phone, ArrowLeft } from 'lucide-react';

export default function TrackOrder() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState<any>(null);
    const [driver, setDriver] = useState<DeliveryDriver | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!orderId) return;

        const unsubscribe = onSnapshot(doc(db, 'orders', orderId), async (snapshot) => {
            if (snapshot.exists()) {
                const orderData = snapshot.data();
                setOrder(orderData);

                // If a driver was assigned, fetch their profile
                if (orderData.deliveryDriverId && (!driver || driver.id !== orderData.deliveryDriverId)) {
                    const dDoc = await getDoc(doc(db, 'delivery_drivers', orderData.deliveryDriverId));
                    if (dDoc.exists()) {
                        setDriver({ id: dDoc.id, ...dDoc.data() } as DeliveryDriver);
                    }
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [orderId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
                <Package className="w-16 h-16 text-slate-300 mb-4" />
                <h2 className="text-xl font-black text-slate-900 mb-2">Pedido no encontrado</h2>
                <button onClick={() => navigate('/')} className="text-primary font-bold">Volver al inicio</button>
            </div>
        );
    }

    // Determine current step index for the progress bar
    const getStepIndex = () => {
        switch (order.status) {
            case 'pending': return 1;
            case 'preparing': return 2;
            case 'finding_driver': return 2; // finding driver is while preparing
            case 'driver_assigned': return 2;
            case 'in_transit': return 3;
            case 'completed': return 4;
            default: return 0;
        }
    };

    const currentStep = getStepIndex();

    // Simulate Distance Percentage using fixed thresholds (ideal interaction without real MapBox/Gmaps for now)
    // In a real app, we would use Haversine formula between order.driverLocation (from driver) and order.address.
    const getDistanceProgress = () => {
        if (currentStep < 3) return 0;
        if (currentStep === 4) return 100;

        // Simulating progress based on time elapsed since 'in_transit' could be done, 
        // For UI purposes, we'll keep it static interactive or random.
        // If we had coordinates attached to driver real-time, we could calculate accurate %.
        return 65;
    };

    return (
        <div className="pb-24 bg-slate-50 min-h-screen">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center gap-4 sticky top-0 z-30 shadow-sm">
                <button onClick={() => navigate('/profile')} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center active:scale-95 transition-transform text-slate-600">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-black text-slate-900">Rastrear Pedido</h1>
            </div>

            {/* Map Placeholder Area */}
            <div className="h-64 bg-slate-200 relative overflow-hidden flex flex-col items-center justify-center text-slate-400">
                <Navigation className="w-12 h-12 mb-2 opacity-50" />
                <p className="font-bold text-xs uppercase tracking-widest">Radar de Delivery</p>
                <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl text-xs font-bold text-slate-700 shadow-md">
                    Actualizando en tiempo real...
                </div>
            </div>

            <div className="px-4 -mt-6 relative z-10 space-y-4">
                {/* Status Card */}
                <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 leading-tight">
                                {currentStep === 1 && "Recibido, esperando negocio"}
                                {currentStep === 2 && order.deliveryMethod === 'app_delivery' ? "Buscando al mejor piloto" : currentStep === 2 && "Preparando tu orden"}
                                {currentStep === 3 && "¡Tu pedido va en camino!"}
                                {currentStep === 4 && "Pedido Entregado"}
                            </h2>
                            <p className="text-slate-500 font-medium text-sm mt-1">Llegada estimada: 25 - 40 min</p>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="relative pt-2">
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-slate-100 rounded-full"></div>
                        <div
                            className="absolute top-1/2 -translate-y-1/2 left-0 h-1 bg-emerald-500 rounded-full transition-all duration-1000"
                            style={{ width: `${(currentStep - 1) * 33.33}%` }}
                        ></div>
                        <div className="relative flex justify-between">
                            {[1, 2, 3, 4].map((step) => (
                                <div key={step} className={`w-8 h-8 rounded-full flex items-center justify-center ring-4 ring-white transition-colors duration-500 ${step <= currentStep ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-200 text-slate-400'}`}>
                                    {step === 1 && <Clock className="w-4 h-4" />}
                                    {step === 2 && <Package className="w-4 h-4" />}
                                    {step === 3 && <Navigation className="w-4 h-4" />}
                                    {step === 4 && <CheckCircle2 className="w-4 h-4" />}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Driver Info (If Assigned) */}
                {driver && (currentStep >= 2) && (
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <img src={driver.documents.selfieUrl} alt="Driver" className="w-14 h-14 rounded-full object-cover bg-slate-100 ring-4 ring-indigo-50" />
                            <div>
                                <p className="font-black text-slate-900">{driver.fullName.split(' ')[0]}</p>
                                <p className="text-xs font-bold text-slate-500 capitalize">{driver.vehicleType} • {driver.vehiclePlate}</p>
                            </div>
                        </div>
                        <a href={`tel:${driver.phone}`} className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center active:scale-95 transition-transform">
                            <Phone className="w-5 h-5 fill-current" />
                        </a>
                    </div>
                )}

                {/* Order Details */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <h3 className="font-black text-slate-900 mb-4">Detalles de Entrega</h3>
                    <div className="flex gap-4">
                        <div className="w-10 h-10 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center shrink-0">
                            <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-bold text-slate-900">{order.address?.name || 'Dirección de Entrega'}</p>
                            <p className="text-xs text-slate-500 leading-relaxed mt-1">{order.address?.reference || 'Sin referencias'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
