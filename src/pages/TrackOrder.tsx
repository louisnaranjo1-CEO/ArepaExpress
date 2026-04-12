import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, getDoc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DeliveryDriver } from '../lib/delivery-service';
import { Navigation, Clock, CheckCircle2, Package, MapPin, Phone, ArrowLeft, Store, Star, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCurrency } from '../context/CurrencyContext';
import DeliveryPaymentModal from '../components/DeliveryPaymentModal';
import ReviewModal from '../components/ReviewModal';
import DualPrice from '../components/DualPrice';
import OrderChatWindow from '../components/chat/OrderChatWindow';
import { useAuth } from '../context/AuthContext';

export default function TrackOrder() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState<any>(null);
    const [driver, setDriver] = useState<DeliveryDriver | null>(null);
    const [restaurant, setRestaurant] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const { bcvRate } = useCurrency();
    const { user } = useAuth();
    const [hasPaidRestaurant, setHasPaidRestaurant] = useState(false);
    const [showDeliveryPaymentModal, setShowDeliveryPaymentModal] = useState(false);
    
    const [infoStep, setInfoStep] = useState<number | null>(null);
    const [editDelivery, setEditDelivery] = useState({
        deliveryMethod: 'app_delivery',
        vehicleType: 'moto',
        addressName: '',
        addressReference: ''
    });

    useEffect(() => {
        if (order) {
            setEditDelivery({
                deliveryMethod: order.deliveryMethod || 'app_delivery',
                vehicleType: order.vehicleType || 'moto',
                addressName: order.address?.name || '',
                addressReference: order.address?.reference || ''
            });
        }
    }, [order?.deliveryMethod, order?.vehicleType, order?.address?.name, order?.address?.reference]);

    useEffect(() => {
        if (order && order.status === 'delivered' && !order.hasReviewed) {
            setShowReviewModal(true);
        }
    }, [order]);

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

                // Fetch restaurant logo
                if (orderData.restaurantId && (!restaurant || restaurant.id !== orderData.restaurantId)) {
                    const rDoc = await getDoc(doc(db, 'restaurants', orderData.restaurantId));
                    if (rDoc.exists()) {
                        setRestaurant({ id: rDoc.id, ...rDoc.data() });
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
                <button onClick={() => navigate('/')} className="text-slate-900 font-bold">Volver al inicio</button>
            </div>
        );
    }

    if (order.status === 'cancelled') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-slate-50">
                <div className="w-24 h-24 bg-red-100 text-red-500 flex items-center justify-center rounded-[2.5rem] mb-6 shadow-xl shadow-red-500/20">
                    <X className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-2">Pedido Cancelado</h2>
                <p className="text-slate-500 font-medium mb-8">El pedido ha sido cancelado satisfactoriamente.</p>
                <button onClick={() => navigate('/')} className="bg-slate-900 text-white rounded-2xl px-8 py-4 font-black shadow-xl hover:bg-slate-800 transition-colors">Volver al inicio</button>
            </div>
        );
    }

    const handleRestaurantPaid = async () => {
        if(!orderId) return;
        if(window.confirm(`¿Confirmas que ya pagaste a ${restaurant?.name || 'Negocio'}? El negocio verificará tu pago para proceder.`)){
            try {
                await updateDoc(doc(db, 'orders', orderId), {
                    restaurantPaymentClientConfirmed: true,
                    status: 'pending_verification'
                });

                // Enviar mensaje automático al chat
                await addDoc(collection(db, `orders/${orderId}/messages`), {
                    text: "📢 He realizado el pago, favor validar.",
                    senderId: user?.uid || 'guest',
                    senderName: order.userName || 'Cliente',
                    senderRole: 'client',
                    createdAt: serverTimestamp()
                });

                toast.success('Información de pago enviada al negocio');
            } catch (error) {
                console.error(error);
                toast.error('Ocurrió un error al confirmar el pago');
            }
        }
    };

    const handleCancelOrder = async () => {
        if(!orderId) return;
        if(window.confirm('¿Estás seguro que deseas cancelar tu pedido? Esta acción no se puede deshacer.')) {
            try {
                await updateDoc(doc(db, 'orders', orderId), {
                    status: 'cancelled',
                    cancelledAt: serverTimestamp()
                });
                toast.success('Pedido cancelado');
            } catch (error) {
                console.error(error);
                toast.error('Ocurrió un error al cancelar');
            }
        }
    };

    const handleSwitchToPickup = async () => {
        if(!orderId || !order) return;
        if(window.confirm('¿Deseas cambiar tu entrega a Retiro en Local? El costo de delivery será $0.')) {
            try {
                await updateDoc(doc(db, 'orders', orderId), {
                    deliveryMethod: 'pickup',
                    deliveryFee: 0,
                    total: order.subtotal,
                    pickupNotified: false // Para disparar alerta en el cajero
                });

                // Enviar mensaje automático al chat
                await addDoc(collection(db, `orders/${orderId}/messages`), {
                    text: "🏪 He cambiado mi pedido a RETIRO EN LOCAL (PickUp). Favor no enviar motorizado.",
                    senderId: user?.uid || 'guest',
                    senderName: order.userName || 'Cliente',
                    senderRole: 'client',
                    createdAt: serverTimestamp()
                });

                // Enviar mensaje automático al chat
                await addDoc(collection(db, `orders/${orderId}/messages`), {
                    text: "🔔 *El cliente ha decidido retirar el pedido en el local (PickUp).* ",
                    senderId: user?.uid || 'guest',
                    senderName: order.userName || 'Cliente',
                    senderRole: 'client',
                    createdAt: serverTimestamp()
                });

                toast.success("Cambiado a Pick Up");
            } catch (error) {
                console.error(error);
                toast.error("Error al actualizar método de entrega");
            }
        }
    };

    const handleProceedToDeliveryPayment = async () => {
        if (!orderId) return;
        try {
            await updateDoc(doc(db, 'orders', orderId), {
                vehicleType: editDelivery.vehicleType,
                address: {
                    ...(order.address || {}),
                    name: editDelivery.addressName,
                    reference: editDelivery.addressReference
                }
            });
            setShowDeliveryPaymentModal(true);
        } catch (error) {
            console.error(error);
            toast.error("Error guardando opciones");
        }
    };

    // Determine current step index for the progress bar
    const getStepIndex = () => {
        switch (order.status) {
            case 'pending': return 1;
            case 'pendiente_pago': return 1;
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
                <button onClick={() => window.history.length > 1 ? window.history.back() : navigate('/profile')} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center active:scale-95 transition-transform text-slate-600">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-black text-slate-900">Rastrear Pedido</h1>
            </div>

            {/* Map Placeholder Area - Using Premium Logo Brand Overlay */}
            <div className="h-80 bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center text-white p-6">
                {/* Background Effects */}
                <div className="absolute inset-0">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent animate-pulse"></div>
                    <div className="h-full w-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                </div>
                
                {/* Animated Scanner / Radar Background */}
                <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                    <div className="w-[500px] h-[500px] rounded-full border border-primary/20 flex items-center justify-center relative">
                        <div className="absolute inset-0 rounded-full border border-primary/10 animate-[ping_3s_linear_infinite]"></div>
                        <div className="absolute inset-20 rounded-full border border-primary/10 animate-[ping_4s_linear_infinite]"></div>
                        {/* Rotating Radar Line */}
                        <div className="absolute w-[250px] h-[250px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                            <div className="w-full h-1 bg-gradient-to-r from-transparent to-primary/40 origin-left animate-[spin_4s_linear_infinite]" style={{ transformOrigin: '0% 50%' }}></div>
                        </div>
                    </div>
                </div>
                
                <div className="relative flex flex-col items-center z-10">
                    <div className="w-24 h-24 bg-white rounded-[2.5rem] shadow-2xl flex items-center justify-center mb-6 relative group border-4 border-slate-900 overflow-hidden">
                        {restaurant?.logoUrl ? (
                            <img src={restaurant.logoUrl} alt="Logo" className="w-full h-full object-cover p-2" />
                        ) : (
                            <Store className="w-10 h-10 text-slate-900" />
                        )}
                        <div className="absolute inset-0 bg-primary/10 animate-pulse group-hover:opacity-0 transition-opacity"></div>
                    </div>
                    
                    <div className="text-center">
                        <p className="font-black text-xs uppercase tracking-[0.4em] text-slate-900 mb-3">Rastreo Activo</p>
                        <h2 className="text-xl font-black text-white mb-1 uppercase tracking-tight">#{orderId?.slice(-5).toUpperCase()}</h2>
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] max-w-[250px] mx-auto leading-relaxed">
                            {currentStep === 1 && (order.status === 'verificando_pago_delivery' ? "Verificando el pago de tu delivery..." : "Confirmando tu pedido con el restaurante...")}
                            {currentStep === 2 && "Preparación en curso. ¡Casi listo!"}
                            {currentStep === 3 && (driver ? `${driver.fullName.split(' ')[0]} está transportando tu orden` : "Asignando repartidor...")}
                            {currentStep === 4 && "¡Pedido entregado! Disfruta tu comida"}
                        </p>
                    </div>
                </div>

                <div className="absolute bottom-6 left-6 right-6 bg-slate-900/40 backdrop-blur-xl px-5 py-3 rounded-full border border-white/5 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3">
                        <div className="relative w-2.5 h-2.5">
                            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
                            <div className="relative w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/50"></div>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Track en Vivo</span>
                    </div>
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{restaurant?.name || "Deliexpress"}</span>
                </div>
            </div>

            <div className="px-4 -mt-6 relative z-10 space-y-4">
                {/* Status Card */}
                <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 leading-tight">
                                {currentStep === 1 && (
                                    order.status === 'verificando_pago_delivery' 
                                        ? "Verificando pago del delivery"
                                        : (order.status === 'pendiente_pago' ? "Esperando confirmación de pago" : "Recibido, esperando negocio")
                                )}
                                {currentStep === 2 && order.deliveryMethod === 'app_delivery' ? "Buscando al mejor piloto" : currentStep === 2 && "Pago aceptado. Preparando tu orden"}
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
                                <div 
                                    key={step} 
                                    onClick={() => setInfoStep(infoStep === step ? null : step)}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center ring-4 ring-white cursor-pointer transition-colors duration-500 hover:scale-110 ${step <= currentStep ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-200 text-slate-400'}`}
                                >
                                    {step === 1 && <Wallet className="w-4 h-4" />}
                                    {step === 2 && <Package className="w-4 h-4" />}
                                    {step === 3 && <Navigation className="w-4 h-4" />}
                                    {step === 4 && <CheckCircle2 className="w-4 h-4" />}
                                </div>
                            ))}
                        </div>
                    </div>
                    {infoStep && (
                        <div className="mt-4 p-4 bg-slate-900 text-white text-xs font-bold rounded-xl text-center shadow-lg animate-in fade-in slide-in-from-top-2">
                            {infoStep === 1 && "Verificación de Pagos: Paga a la tienda y al repartidor para iniciar tu orden."}
                            {infoStep === 2 && "Preparación: El local ha recibido el dinero y está cocinando tus productos."}
                            {infoStep === 3 && "En Tránsito: Tu pedido fue asignado y va en camino a tu destino."}
                            {infoStep === 4 && "¡Disfruta! Tu pedido ha sido entregado satisfactoriamente."}
                        </div>
                    )}

                    {/* Chat Window always visible until delivered/cancelled */}
                    {order.status !== 'cancelled' && order.status !== 'delivered' && (
                        <div className="w-full mt-6 animate-in fade-in zoom-in-95 duration-200">
                            <OrderChatWindow 
                                orderId={orderId!} 
                                currentUserRole="client" 
                                currentUserId={user?.uid || 'guest'}
                                currentUserName={order.userName || 'Cliente'} 
                                restaurantId={order.restaurantId}
                                orderInfo={order}
                            />
                            {(!order.restaurantPaymentClientConfirmed && (order.status === 'pending' || order.status === 'pendiente_pago')) && (
                                <button 
                                    onClick={handleCancelOrder}
                                    className="w-full bg-red-100 text-red-600 py-4 rounded-2xl font-bold hover:bg-red-200 transition-colors mt-4 shadow-sm"
                                >
                                    Cancelar Pedido
                                </button>
                            )}
                        </div>
                    )}

                    {/* Delivery Payment Flow */ }
                    {(currentStep === 1 || currentStep === 2) && order.deliveryMethod === 'app_delivery' && (!order.deliveryPaymentStatus || order.deliveryPaymentStatus === 'rejected') && (
                        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                            {order.deliveryPaymentStatus === 'rejected' && (
                                <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl mb-2 text-center w-full border border-red-200">
                                    Tu captura de pago del delivery fue rechazada. Por favor, verifica tu referencia e intenta de nuevo.
                                </div>
                            )}
                            
                            {order.restaurantPaymentClientConfirmed && (
                                <div className="w-full animate-in fade-in zoom-in-95 duration-200 bg-slate-50 p-4 rounded-3xl border-2 border-slate-100 relative shadow-inner">
                                    <h4 className="font-black text-slate-800 mb-4 flex items-center gap-2">
                                        <Package className="w-5 h-5 text-primary"/>
                                        Opciones de Envío
                                    </h4>
                                    
                                    <div className="mb-4">
                                        <label className="text-[10px] uppercase font-black text-slate-400 ml-1">Método de entrega</label>
                                        <div className="flex bg-slate-200 p-1 rounded-xl mt-1">
                                            <button 
                                                onClick={() => setEditDelivery({...editDelivery, deliveryMethod: 'app_delivery'})}
                                                className={`flex-1 py-2 rounded-lg font-bold text-xs transition-colors ${editDelivery.deliveryMethod === 'app_delivery' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                                            >
                                                Delivery
                                            </button>
                                            <button 
                                                onClick={() => setEditDelivery({...editDelivery, deliveryMethod: 'pickup'})}
                                                className={`flex-1 py-2 rounded-lg font-bold text-xs transition-colors ${editDelivery.deliveryMethod === 'pickup' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
                                            >
                                                Pick Up (Retiro)
                                            </button>
                                        </div>
                                    </div>

                                    {editDelivery.deliveryMethod === 'app_delivery' ? (
                                        <>
                                            <div className="mb-4 space-y-3">
                                                <div>
                                                    <label className="text-[10px] uppercase font-black text-slate-400 ml-1">Tipo de Vehículo</label>
                                                    <select 
                                                        value={editDelivery.vehicleType}
                                                        onChange={(e) => setEditDelivery({...editDelivery, vehicleType: e.target.value})}
                                                        className="w-full bg-white border-2 border-slate-100 px-4 py-2.5 rounded-xl text-sm font-black text-slate-700 mt-1"
                                                    >
                                                        <option value="moto">Mototaxi (Estándar)</option>
                                                        <option value="taxi">Taxi (Paquetes grandes o delicados)</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-black text-slate-400 ml-1">Dirección de Entrega (Opcional)</label>
                                                    <input 
                                                        value={editDelivery.addressName}
                                                        onChange={(e) => setEditDelivery({...editDelivery, addressName: e.target.value})}
                                                        placeholder="Escribe tu dirección"
                                                        className="w-full bg-white border-2 border-slate-100 px-4 py-2.5 rounded-xl text-sm font-bold mt-1 text-slate-700"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-black text-slate-400 ml-1">Puntos de Referencia</label>
                                                    <input 
                                                        value={editDelivery.addressReference}
                                                        onChange={(e) => setEditDelivery({...editDelivery, addressReference: e.target.value})}
                                                        placeholder="Ej. Casa verde al lado del kiosco..."
                                                        className="w-full bg-white border-2 border-slate-100 px-4 py-2.5 rounded-xl text-sm font-bold mt-1 text-slate-700"
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl mb-4 text-center">
                                                <p className="text-[10px] font-black uppercase text-amber-600/80 leading-snug">
                                                    ⚠️ IMPORTANTE: Una vez realizado y validado el pago por el delivery NO podrás volver a modificar tu dirección ni el tipo de vehículo. La información se enviará al proveedor del negocio para su gestión.
                                                </p>
                                            </div>

                                            <div className="flex flex-col gap-3 mt-4">
                                                <button 
                                                    onClick={handleProceedToDeliveryPayment}
                                                    className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-lg flex items-center justify-center gap-2"
                                                >
                                                    <Wallet className="w-6 h-6" />
                                                    Pagar Delivery
                                                </button>
                                                <button 
                                                    onClick={handleSwitchToPickup}
                                                    className="w-full bg-slate-100 text-slate-600 py-3 rounded-2xl font-bold hover:bg-slate-200 transition-colors text-sm flex items-center justify-center gap-2"
                                                >
                                                    Lo buscaré yo (Retiro en local)
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <button 
                                            onClick={handleSwitchToPickup}
                                            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all text-lg flex items-center justify-center gap-2 mt-4"
                                        >
                                            <Store className="w-6 h-6" />
                                            Confirmar Retiro
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Driver Info (If Assigned) */}
                {driver && (currentStep >= 2) && (
                    <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tu Repartidor</h3>
                            <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full text-[10px] font-bold">Asignado</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <img src={driver.documents.selfieUrl} alt="Driver" className="w-16 h-16 rounded-2xl object-cover bg-slate-100 shadow-lg" />
                                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                                        <CheckCircle2 className="w-3 h-3 text-white" />
                                    </div>
                                </div>
                                <div>
                                    <p className="font-black text-slate-900 text-lg">{driver.fullName}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs font-bold text-slate-500 uppercase">{driver.vehicleType}</span>
                                        <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                        <span className="text-xs font-black text-slate-900 uppercase">{driver.vehiclePlate}</span>
                                    </div>
                                </div>
                            </div>
                            <a href={`tel:${driver.phone}`} className="w-14 h-14 bg-primary text-slate-900 rounded-2xl flex flex-col items-center justify-center active:scale-95 transition-all shadow-lg shadow-primary/30">
                                <Phone className="w-5 h-5 mb-0.5" />
                                <span className="text-[8px] font-black uppercase">Llamar</span>
                            </a>
                        </div>
                    </div>
                )}

                {/* Order Summary */}
                <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-slate-100">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Resumen de Orden</h3>
                    <div className="space-y-4">
                        {order.items?.map((item: any, index: number) => (
                            <div key={index} className="flex justify-between items-center bg-slate-50/50 p-3 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-xs font-black text-slate-900 shadow-sm">
                                        {item.quantity}x
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 leading-none">{item.name || item.productName}</p>
                                        {item.selectedVariants && Object.keys(item.selectedVariants).length > 0 && (
                                            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
                                                {Object.values(item.selectedVariants).join(', ')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <DualPrice usdAmount={(item.price || 0) * (item.quantity || 1)} usdClassName="text-sm font-black text-slate-900" showDivider={false} />
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
                        <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-tight">
                            <span>Subtotal</span>
                            <DualPrice usdAmount={order.subtotal || 0} showDivider={false} className="flex items-center gap-1.5" />
                        </div>
                        {order.deliveryFee > 0 && (
                            <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-tight">
                                <span>Delivery</span>
                                <DualPrice usdAmount={order.deliveryFee} showDivider={false} className="flex items-center gap-1.5" />
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Total</span>
                            <DualPrice 
                                usdAmount={order.total || 0} 
                                usdClassName="text-xl font-black text-slate-900" 
                                bsClassName="text-[11px] font-bold text-slate-400 block mt-0.5 text-right"
                                showDivider={false} 
                                className="flex flex-col items-end" 
                            />
                        </div>
                    </div>
                </div>

                {/* Delivery details */}
                <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-slate-100">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Detalles de Entrega</h3>
                    <div className="flex gap-4">
                        <div className="w-12 h-12 bg-primary/10 text-slate-900 rounded-2xl flex items-center justify-center shrink-0">
                            <MapPin className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="font-black text-slate-900 leading-tight">{order.address?.name || 'Dirección de Entrega'}</p>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">{order.address?.reference || 'Sin referencias'}</p>
                        </div>
                    </div>
                </div>
            </div>

            <ReviewModal
                isOpen={showReviewModal}
                onClose={() => setShowReviewModal(false)}
                restaurantId={order.restaurantId}
                orderId={orderId!}
                onReviewSubmitted={() => setShowReviewModal(false)}
            />

            {/* Delivery Payment Modal */}
            <DeliveryPaymentModal
                isOpen={showDeliveryPaymentModal}
                onClose={() => setShowDeliveryPaymentModal(false)}
                orderId={orderId!}
                deliveryFee={order.deliveryFee || 0}
                bcvRate={bcvRate}
                businessName={restaurant?.name || "Negocio"}
                onSuccess={() => {
                    setShowDeliveryPaymentModal(false);
                }}
            />
        </div>
    );
}

