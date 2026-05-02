import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, getDoc, updateDoc, serverTimestamp, addDoc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DeliveryDriver } from '../lib/delivery-service';
import { Navigation, Clock, CheckCircle2, Bike, Motorbike, MapPin, Phone, ArrowLeft, Store, Star, Wallet, X, Loader2, ImageIcon, Upload, CreditCard as CreditCardIcon, AlertCircle, Copy, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCurrency } from '../context/CurrencyContext';
import DeliveryPaymentModal from '../components/DeliveryPaymentModal';
import ReviewModal from '../components/ReviewModal';
import DualPrice from '../components/DualPrice';
import OrderChatWindow from '../components/chat/OrderChatWindow';
import AddressPicker from '../components/AddressPicker';
import { useAuth } from '../context/AuthContext';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    clickableIcons: false,
};

export default function TrackOrder() {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: "AIzaSyCb1c-p1R6AZGetk8YzKiLuxjaxjmPqJX8"
    });

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
    
    // New payment states
    const [paymentReference, setPaymentReference] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [pendingCountdown, setPendingCountdown] = useState(120);
    const [showStockWhatsapp, setShowStockWhatsapp] = useState(false);
    const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
    const [transportRequest, setTransportRequest] = useState<any>(null);
    const [driverLocation, setDriverLocation] = useState<{lat: number, lng: number} | null>(null);
    const [activeTab, setActiveTab] = useState<'order' | 'delivery'>('order');
    
    const [infoStep, setInfoStep] = useState<number | null>(null);
    const [editDelivery, setEditDelivery] = useState({
        deliveryMethod: 'app_delivery',
        vehicleType: 'moto',
        addressName: '',
        addressReference: '',
        lat: 0,
        lng: 0
    });
    const [isEditingAddress, setIsEditingAddress] = useState(false);
    const [showAddressPicker, setShowAddressPicker] = useState(false);
    const [isUpdatingAddress, setIsUpdatingAddress] = useState(false);

    // Platform Finance Config
    const [platformConfig, setPlatformConfig] = useState<any>(null);
    const [deliveryPaymentReference, setDeliveryPaymentReference] = useState('');
    const [deliveryPaymentProofFile, setDeliveryPaymentProofFile] = useState<File | null>(null);
    const [isUploadingDeliveryReport, setIsUploadingDeliveryReport] = useState(false);
    const [deliverySettings, setDeliverySettings] = useState<any>(null);
    const [selectedVehicle, setSelectedVehicle] = useState<'moto' | 'carro'>('moto');

    useEffect(() => {
        if (order) {
            setEditDelivery({
                deliveryMethod: order.deliveryMethod || 'app_delivery',
                vehicleType: order.vehicleType || 'moto',
                addressName: order.address?.name || '',
                addressReference: order.address?.reference || '',
                lat: order.address?.lat || 0,
                lng: order.address?.lng || 0
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

        // Fetch Platform Config for Delivery Payment
        getDoc(doc(db, 'system_configs', 'finances')).then(snap => {
            if (snap.exists()) {
                setPlatformConfig(snap.data());
            }
        });

        // Fetch Delivery Settings for Fees
        getDoc(doc(db, 'delivery_settings', 'settings')).then(snap => {
            if (snap.exists()) {
                setDeliverySettings(snap.data());
            }
        });

        // 1. Listen to Order
        const unsubscribe = onSnapshot(doc(db, 'orders', orderId), async (snapshot) => {
            if (snapshot.exists()) {
                const orderData = snapshot.data();
                setOrder(orderData);

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

        // 2. Listen to Transport Request
        const transportQ = query(
            collection(db, 'transport_requests'),
            where('orderId', '==', orderId),
            orderBy('createdAt', 'desc'),
            limit(1)
        );

        const unsubscribeTransport = onSnapshot(transportQ, async (snapshot) => {
            if (!snapshot.empty) {
                const trData = snapshot.docs[0].data();
                const trId = snapshot.docs[0].id;
                setTransportRequest({ id: trId, ...trData });

                // If assigned, fetch driver
                if (trData.driverId && (!driver || driver.id !== trData.driverId)) {
                    const dDoc = await getDoc(doc(db, 'delivery_drivers', trData.driverId));
                    if (dDoc.exists()) {
                        setDriver({ id: dDoc.id, ...dDoc.data() } as DeliveryDriver);
                    }
                }

                // Auto switch tab to delivery if assigned or searching
                if (trData.status === 'searching' || trData.driverId) {
                    // setActiveTab('delivery'); // Maybe too intrusive? Let's leave it for now.
                }
            }
        });

        return () => {
            unsubscribe();
            unsubscribeTransport();
        };
    }, [orderId]);

    // Listen to Driver Live Location if available
    useEffect(() => {
        if (!transportRequest?.driverId) return;

        const unsubLoc = onSnapshot(doc(db, 'driver_locations', transportRequest.driverId), (snap) => {
            if (snap.exists()) {
                setDriverLocation(snap.data() as any);
            }
        });

        return () => unsubLoc();
    }, [transportRequest?.driverId]);

    // Live geolocation for the "blue dot"
    useEffect(() => {
        if (!navigator.geolocation) return;
        
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setUserLocation({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                });
            },
            (err) => console.error("Geolocation error:", err),
            { enableHighAccuracy: true }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    // Pending stock countdown
    useEffect(() => {
        let timer: any;
        if (order?.status === 'pending' && !order.stockConfirmed && pendingCountdown > 0) {
            timer = setInterval(() => {
                setPendingCountdown(prev => {
                    if (prev <= 1) {
                        setShowStockWhatsapp(true);
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else if (order?.stockConfirmed) {
            setPendingCountdown(0);
        }
        }, [order?.status, order?.stockConfirmed, pendingCountdown]);

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
                <Motorbike className="w-16 h-16 text-slate-300 mb-4" />
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
        if(!orderId || !order) return;
        
        if (!paymentReference) {
            toast.error('Por favor ingresa el número de referencia del pago.');
            return;
        }

        setIsUploading(true);
        try {
            const updates: any = {
                restaurantPaymentClientConfirmed: true,
                status: 'pending_verification',
                paymentReference: paymentReference
            };

            await updateDoc(doc(db, 'orders', orderId), updates);

            // Enviar mensaje automático al chat
            await addDoc(collection(db, `orders/${orderId}/messages`), {
                text: `📢 He realizado el pago. Referencia: ${paymentReference}. Favor validar.`,
                senderId: user?.uid || 'guest',
                senderName: order.userName || 'Cliente',
                senderRole: 'client',
                createdAt: serverTimestamp()
            });

            toast.success('Información de pago enviada al negocio');
        } catch (error) {
            console.error(error);
            toast.error('Ocurrió un error al enviar la información de pago');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveMissingItem = async (itemId: string) => {
        if (!order || !orderId) return;
        
        const newItems = order.items.filter((item: any) => item.id !== itemId);
        const newSubtotal = newItems.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
        const newTotal = newSubtotal + (order.deliveryFee || 0);

        try {
            await updateDoc(doc(db, 'orders', orderId), {
                items: newItems,
                subtotal: newSubtotal,
                total: newTotal,
                missingItems: (order.missingItems || []).filter((id: string) => id !== itemId)
            });
        } catch (error) {
            console.error("Error removing item:", error);
            toast.error("Error al eliminar producto");
        }
    };

    const handleConfirmStockChanges = async () => {
        if (!orderId) return;
        try {
            await updateDoc(doc(db, 'orders', orderId), {
                status: 'pending',
                stockConfirmed: false,
                missingItems: []
            });
            
            // Enviar mensaje automático al chat
            await addDoc(collection(db, `orders/${orderId}/messages`), {
                text: "🔄 *El cliente ha realizado cambios en su pedido.* Favor verificar stock nuevamente.",
                senderId: user?.uid || 'guest',
                senderName: order.userName || 'Cliente',
                senderRole: 'client',
                createdAt: serverTimestamp()
            });

            toast.success("Cambios confirmados. Esperando verificación del restaurante.");
        } catch (error) {
            console.error("Error confirming changes:", error);
            toast.error("Error al confirmar cambios");
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

    const handleUpdateAddress = async () => {
        if (!orderId || !order) return;
        setIsUpdatingAddress(true);
        try {
            await updateDoc(doc(db, 'orders', orderId), {
                address: {
                    ...(order.address || {}),
                    name: editDelivery.addressName,
                    reference: editDelivery.addressReference
                },
                // Also update deliveryAddress string for compatibility
                deliveryAddress: `${editDelivery.addressName} (${editDelivery.addressReference})`.trim()
            });

            // Enviar mensaje automático al chat
            await addDoc(collection(db, `orders/${orderId}/messages`), {
                text: `📍 *El cliente ha actualizado su dirección de entrega:* \n\n*Dirección:* ${editDelivery.addressName}\n*Referencia:* ${editDelivery.addressReference}`,
                senderId: user?.uid || 'guest',
                senderName: order.userName || 'Cliente',
                senderRole: 'client',
                createdAt: serverTimestamp()
            });

            toast.success("Dirección actualizada correctamente");
            setIsEditingAddress(false);
        } catch (error) {
            console.error("Error updating address:", error);
            toast.error("Error al actualizar la dirección");
        } finally {
            setIsUpdatingAddress(false);
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

    const getDeliveryStatusLabel = (status: string) => {
        switch (status) {
            case 'searching': return 'Buscando Delivery...';
            case 'accepted': return 'En camino para recoger';
            case 'arriving': return 'Llegó al punto (Negocio)';
            case 'in_progress': return 'Inicié el viaje a tu dirección';
            case 'completed': return 'Llegué (finalicé mi viaje)';
            default: return 'Buscando Repartidor';
        }
    };

    const handleReportDeliveryPayment = async () => {
        if(!orderId || !order) return;
        
        if (!deliveryPaymentReference) {
            toast.error('Por favor ingresa el número de referencia del pago.');
            return;
        }

        setIsUploadingDeliveryReport(true);
        try {
            const updates: any = {
                deliveryPaymentClientConfirmed: true,
                status: 'verificando_pago_delivery',
                deliveryPaymentReference: deliveryPaymentReference,
                deliveryPaymentStatus: 'pending_verification'
            };

            await updateDoc(doc(db, 'orders', orderId), updates);

            // Create transport request so it appears in CPanel "Viajes (Taxis)"
            const transportData: any = {
                type: 'food_delivery',
                serviceType: 'Delivery de Comida',
                orderId: orderId,
                restaurantId: order.restaurantId,
                userId: order.userId || user?.uid,
                userName: order.userName || user?.displayName || 'Cliente',
                userPhone: order.userPhone || user?.phoneNumber || '',
                userCedula: order.userCedula || '',
                origin: {
                    address: restaurant?.location?.address 
                        ? `${order.restaurantName || restaurant?.name} - ${restaurant.location.address}, ${restaurant.location.city || ''}`
                        : order.restaurantName || restaurant?.name || 'Restaurante',
                    details: 'Recoger pedido de comida',
                    coords: restaurant?.location?.coords || null
                },
                destination: {
                    address: order.deliveryAddress || `${order.address?.name || ''} ${order.address?.reference || ''}`.trim() || 'Dirección del cliente',
                    details: order.address?.reference || order.orderNote || '',
                    coords: order.deliveryCoords || order.address?.coords || userLocation || null
                },
                vehicleType: order.vehicleType || 'moto',
                clientTotal: order.deliveryFee || 0,
                driverPayout: (order.deliveryFee || 0) * 0.8,
                serviceFee: (order.deliveryFee || 0) * 0.2,
                status: 'verifying_payment',
                paymentMethod: 'Transferencia/Pago Móvil',
                paymentRef: deliveryPaymentReference,
                createdAt: serverTimestamp()
            };

            // Clean undefined values to prevent Firestore errors
            Object.keys(transportData).forEach(key => {
                if (transportData[key] === undefined) {
                    delete transportData[key];
                }
            });

            await addDoc(collection(db, 'transport_requests'), transportData);

            // Enviar mensaje automático al chat
            await addDoc(collection(db, `orders/${orderId}/messages`), {
                text: `🚀 He reportado el pago del delivery (Ref: ${deliveryPaymentReference}). Por favor verificar.`,
                senderId: user?.uid || 'guest',
                senderName: order.userName || 'Cliente',
                senderRole: 'client',
                createdAt: serverTimestamp()
            });

            toast.success('Información de pago enviada exitosamente');
        } catch (error) {
            console.error(error);
            toast.error('Ocurrió un error al enviar la información de pago');
        } finally {
            setIsUploadingDeliveryReport(false);
        }
    };

    const handleSelectVehicle = async (type: 'moto' | 'carro') => {
        if (!order || !orderId || !deliverySettings) return;

        setSelectedVehicle(type);
        
        // Calculate new fee based on distance and vehicle type
        const distance = order.distance || 0;
        const rates = deliverySettings.transportRates?.[type] || [];
        const rate = rates.find((r: any) => distance >= r.from && (distance <= r.to || !r.to));
        
        const newFee = rate ? (rate.clientPrice || rate.price) : (type === 'moto' ? 2.5 : 5.0);
        const newTotal = order.subtotal + newFee;

        try {
            await updateDoc(doc(db, 'orders', orderId), {
                vehicleType: type,
                deliveryFee: newFee,
                total: newTotal
            });
            toast.success(`Vehículo actualizado: ${type === 'moto' ? 'Moto' : 'Carro'}`);
        } catch (error) {
            console.error("Error updating vehicle:", error);
            toast.error("Error al actualizar vehículo");
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
        // Priority 1: Delivery Driver Status
        if (transportRequest) {
            if (transportRequest.status === 'completed') return 4;
            if (transportRequest.status === 'in_progress') return 3;
            if (transportRequest.status === 'arriving') return 2; // Llegó al negocio, es parte de la preparación todavía
            if (transportRequest.status === 'accepted') return 2; // Va en camino a buscar el pedido
        }

        // Priority 2: General Order Status
        switch (order.status) {
            case 'pending': return 1;
            case 'action_required': return 1;
            case 'pendiente_pago': return 1;
            case 'pending_verification': return 1;
            case 'awaiting_payment': return 1;
            case 'awaiting_delivery_payment': return 1;
            case 'verificando_pago_delivery': return 1;
            case 'preparing': return 2;
            case 'buscando_piloto': return 2;
            case 'finding_driver': return 2;
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
                <h1 className="text-lg font-black text-slate-900">Seguimiento de Pedido</h1>
            </div>

            {/* Interactive Map Area */}
            <div className="h-80 relative overflow-hidden bg-slate-100">
                {isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={driverLocation || (order?.address?.lat ? { lat: order.address.lat, lng: order.address.lng } : { lat: 10.4806, lng: -66.9036 })}
                        zoom={driverLocation ? 16 : 14}
                        options={mapOptions}
                    >
                        {/* Destination (Client) Marker */}
                        {order?.address?.lat && order?.address?.lng && (
                            <Marker 
                                position={{ lat: order.address.lat, lng: order.address.lng }} 
                                icon={{
                                    url: 'https://cdn-icons-png.flaticon.com/512/1004/1004285.png',
                                    scaledSize: window.google ? new window.google.maps.Size(32, 32) : undefined
                                }}
                            />
                        )}
                        {/* Driver Marker */}
                        {driverLocation && (
                            <Marker 
                                position={driverLocation} 
                                icon={{
                                    url: 'https://cdn-icons-png.flaticon.com/512/3209/3209935.png',
                                    scaledSize: window.google ? new window.google.maps.Size(48, 48) : undefined
                                }}
                            />
                        )}
                    </GoogleMap>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                    </div>
                )}
                
                <div className="absolute top-4 left-4 z-10">
                    <div className="w-16 h-16 bg-white rounded-[1.5rem] shadow-xl flex items-center justify-center relative border-4 border-slate-900 overflow-hidden group">
                        {restaurant?.logoUrl ? (
                            <img src={restaurant.logoUrl} alt="Logo" className="w-full h-full object-cover p-1" />
                        ) : (
                            <Store className="w-8 h-8 text-slate-900" />
                        )}
                    </div>
                </div>

                <div className="absolute top-4 right-4 z-10 flex flex-col items-end">
                    <div className="inline-block bg-primary px-4 py-1.5 rounded-full mb-3 shadow-lg shadow-primary/20 border border-primary/50 backdrop-blur-md bg-opacity-90">
                        <p className="font-black text-[9px] uppercase tracking-[0.4em] text-slate-900">Rastreo Activo</p>
                    </div>
                    <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                        <h2 className="text-sm font-black text-white uppercase tracking-tight">#{orderId?.slice(-5).toUpperCase()}</h2>
                    </div>
                </div>

                <div className="absolute bottom-6 left-6 right-6 bg-slate-900/90 backdrop-blur-xl px-5 py-3 rounded-full border border-white/10 flex items-center justify-between shadow-xl z-10">
                    <div className="flex items-center gap-3">
                        <div className="relative w-2.5 h-2.5">
                            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
                            <div className="relative w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/50"></div>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Track en Vivo</span>
                    </div>
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{restaurant?.name || "Deliexpress"}</span>
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
                                {currentStep === 2 && (!transportRequest || transportRequest.status === 'searching') && order.deliveryMethod === 'app_delivery' ? "Buscando al mejor piloto" : null}
                                {currentStep === 2 && (!transportRequest || transportRequest.status === 'searching') && order.deliveryMethod !== 'app_delivery' ? "Pago aceptado. Preparando tu orden" : null}
                                {currentStep === 2 && transportRequest?.status === 'accepted' && "El piloto va por tu pedido"}
                                {currentStep === 2 && transportRequest?.status === 'arriving' && "El piloto espera por tu pedido"}
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
                                    {step === 2 && <Store className="w-4 h-4" />}
                                    {step === 3 && <Motorbike className="w-4 h-4" />}
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
                                        <Motorbike className="w-5 h-5 text-slate-900"/>
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

                 {/* Restaurant Payment Section (Stock Confirmation) */}
                {((order.status === 'pending' || order.status === 'action_required' || order.status === 'awaiting_payment' || order.status === 'pending_verification') && !order.restaurantPaymentClientConfirmed) || order.status === 'pending_verification' ? (
                    <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border-2 border-primary/20 animate-in slide-in-from-bottom-4 duration-500 overflow-hidden">
                        {order.status === 'pending' ? (
                            <div className="flex flex-col items-center text-center py-4">
                                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4 relative">
                                    <Clock className="w-8 h-8 animate-pulse" />
                                    {pendingCountdown > 0 && (
                                        <div className="absolute -top-1 -right-1 bg-primary text-slate-900 text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">
                                            {pendingCountdown}
                                        </div>
                                    )}
                                </div>
                                 <h3 className="text-lg font-black text-slate-900 mb-2">Verificando Pedido</h3>
                                <p className="text-slate-500 text-sm font-medium">Estamos verificando tu orden, espera un momento...</p>
                                
                                {showStockWhatsapp && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 w-full">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 italic">¿El negocio no responde? Envía un recordatorio:</p>
                                        <a 
                                            href={`https://wa.me/${restaurant?.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${restaurant?.name}, acabo de realizar un pedido (#${orderId?.slice(-5).toUpperCase()}) y estoy esperando la confirmación de stock. \n\nResumen:\n${order.items.map((i:any) => `- ${i.quantity}x ${i.name}`).join('\n')}\n\nTotal: $${order.total}`)}`}
                                            target="_blank"
                                            className="w-full bg-[#25D366] text-white py-4 rounded-2xl font-black shadow-xl shadow-[#25D366]/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Phone className="w-5 h-5 fill-white/20" />
                                            Enviar Resumen WhatsApp
                                        </a>
                                    </motion.div>
                                )}
                            </div>
                        ) : order.status === 'action_required' ? (
                            <div className="space-y-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-4">
                                        <AlertCircle className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-lg font-black text-slate-900 mb-1">Acción Requerida</h3>
                                    <p className="text-slate-500 text-sm font-medium">Lamentablemente algunos productos no están disponibles. Por favor, elimínalos para continuar.</p>
                                </div>
                                
                                <div className="max-h-60 overflow-y-auto space-y-3 p-1">
                                    {order.items.map((item: any) => {
                                        const isMissing = (order.missingItems || []).includes(item.id);
                                        if (!isMissing) return null;
                                        return (
                                            <div key={item.id} className="flex items-center gap-3 bg-red-50 p-3 rounded-2xl border border-red-100">
                                                <div className="flex-1">
                                                    <p className="font-black text-red-700 text-sm">{item.name}</p>
                                                    <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Agotado</p>
                                                </div>
                                                <button 
                                                    onClick={() => handleRemoveMissingItem(item.id)}
                                                    className="w-10 h-10 bg-white text-red-500 rounded-xl flex items-center justify-center shadow-sm border border-red-100 active:scale-90 transition-transform"
                                                >
                                                    <X className="w-5 h-5" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>

                                <button 
                                    onClick={handleConfirmStockChanges}
                                    disabled={(order.missingItems || []).length > 0}
                                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-slate-300"
                                >
                                    {(order.missingItems || []).length > 0 ? "Primero elimina los productos agotados" : "Confirmar Cambios"}
                                </button>
                            </div>
                        ) : order.status === 'pending_verification' && order.restaurantPaymentClientConfirmed ? (
                            // Verification in progress banner
                            <div className="flex flex-col items-center text-center py-6 space-y-4">
                                <div className="relative w-20 h-20 flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping opacity-30"></div>
                                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center shadow-lg">
                                        <Loader2 className="w-8 h-8 animate-spin" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 mb-1">Verificando tu Pago...</h3>
                                    <p className="text-slate-500 text-sm font-medium">El negocio está revisando tu comprobante. Mientras tanto, puedes ir pagando el delivery.</p>
                                </div>
                                <div className="w-full bg-blue-50 border border-blue-100 rounded-2xl p-4">
                                    <p className="text-[11px] font-black text-blue-600 uppercase tracking-wider">✅ Comprobante enviado correctamente</p>
                                    {order.paymentReference && <p className="text-xs text-blue-500 mt-1">Referencia: {order.paymentReference}</p>}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-green-50 text-green-500 rounded-2xl flex items-center justify-center animate-bounce">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <div className="animate-in fade-in slide-in-from-left duration-700">
                                        <h3 className="text-lg font-black text-slate-900">¡Pedido Verificado!</h3>
                                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-wider text-green-600 leading-none italic">Hemos verificado tu pedido puedes proceder a realizar el pago</p>
                                    </div>
                                </div>

                                 {/* Information about Payment Methods */}
                                {restaurant?.paymentMethods && (
                                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Datos de Pago</p>
                                        <div className="space-y-4">
                                            {Array.isArray(restaurant.paymentMethods) ? (
                                                restaurant.paymentMethods.map((method: any, idx: number) => (
                                                    <div key={idx} className={`flex flex-col gap-1 ${idx > 0 ? 'border-t border-slate-200 pt-3' : ''}`}>
                                                        <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                                                            <span className={`w-2 h-2 rounded-full ${
                                                                method.type === 'Pago Móvil' ? 'bg-primary' : 
                                                                method.type === 'Zelle' ? 'bg-indigo-500' : 
                                                                method.type === 'Transferencia' ? 'bg-blue-500' : 'bg-slate-400'
                                                            }`}></span> 
                                                            {method.type}
                                                        </span>
                                                        <div className="mt-1 space-y-3">
                                                            {method.type === 'Pago Móvil' && (
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <div 
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(method.bank);
                                                                            toast.success('Banco copiado');
                                                                        }}
                                                                        className="group cursor-pointer active:scale-95 transition-all"
                                                                    >
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                                                            Banco <Copy className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                        </p>
                                                                        <p className="text-xs font-black text-slate-700">{method.bank}</p>
                                                                    </div>
                                                                    <div 
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(method.phone);
                                                                            toast.success('Teléfono copiado');
                                                                        }}
                                                                        className="group cursor-pointer active:scale-95 transition-all"
                                                                    >
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                                                            Teléfono <Copy className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                        </p>
                                                                        <p className="text-xs font-black text-slate-700">{method.phone}</p>
                                                                    </div>
                                                                    <div 
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(method.rif);
                                                                            toast.success('Cédula/RIF copiado');
                                                                        }}
                                                                        className="col-span-2 group cursor-pointer active:scale-95 transition-all"
                                                                    >
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                                                            Cédula/RIF <Copy className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                        </p>
                                                                        <p className="text-xs font-black text-slate-700">{method.rif}</p>
                                                                    </div>
                                                                    <div 
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(method.owner);
                                                                            toast.success('Titular copiado');
                                                                        }}
                                                                        className="col-span-2 group cursor-pointer active:scale-95 transition-all"
                                                                    >
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                                                            Titular <Copy className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                        </p>
                                                                        <p className="text-xs font-black text-slate-700">{method.owner}</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {method.type === 'Zelle' && (
                                                                <div className="grid grid-cols-1 gap-3">
                                                                    <div 
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(method.email);
                                                                            toast.success('Correo copiado');
                                                                        }}
                                                                        className="group cursor-pointer active:scale-95 transition-all"
                                                                    >
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                                                            Correo <Copy className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                        </p>
                                                                        <p className="text-xs font-black text-slate-700">{method.email}</p>
                                                                    </div>
                                                                    <div 
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(method.owner);
                                                                            toast.success('Titular copiado');
                                                                        }}
                                                                        className="group cursor-pointer active:scale-95 transition-all"
                                                                    >
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                                                            Titular <Copy className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                        </p>
                                                                        <p className="text-xs font-black text-slate-700">{method.owner}</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {method.type !== 'Pago Móvil' && method.type !== 'Zelle' && method.type !== 'Efectivo' && (
                                                                <div 
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(method.note);
                                                                        toast.success('Instrucciones copiadas');
                                                                    }}
                                                                    className="group cursor-pointer active:scale-95 transition-all"
                                                                >
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                                                        Instrucciones <Copy className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                    </p>
                                                                    <p className="text-xs font-black text-slate-700 whitespace-pre-line">{method.note}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-[10px] text-slate-400 italic">No hay métodos de pago configurados.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Payment Proof Upload */}
                                {order.status !== 'pending_verification' && (
                                    <div className="space-y-3">
                                        <label className="text-[10px] uppercase font-black text-slate-400 ml-1">Reportar Pago</label>
                                        <div className="space-y-3">
                                            <input 
                                                type="text" 
                                                placeholder="Referencia (últimos 6 dígitos)"
                                                value={paymentReference}
                                                onChange={(e) => setPaymentReference(e.target.value)}
                                                className="w-full bg-slate-50 border-2 border-slate-100 px-4 py-3 rounded-2xl text-sm font-bold outline-none focus:border-primary transition-all text-slate-700"
                                            />
                                        </div>
                                        
                                        <button 
                                            onClick={handleRestaurantPaid}
                                            disabled={isUploading || !paymentReference}
                                            className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isUploading ? <Loader2 className="w-6 h-6 animate-spin text-slate-900" /> : <><Upload className="w-6 h-6" /> Informar Pago</>}
                                        </button>
                                    </div>
                                )}
                                
                                {order.status === 'pending_verification' && (
                                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl text-center border border-blue-100">
                                        <p className="text-sm font-black">Pago en Verificación</p>
                                        <p className="text-[10px] font-bold uppercase tracking-wider mt-1">El negocio está validando tu reporte...</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : null}

                {/* Delivery Payment Section (Platform Data) */}
                {(order.status === 'awaiting_delivery_payment' || order.status === 'verificando_pago_delivery') && (
                    <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border-2 border-primary/20 animate-in slide-in-from-bottom-4 duration-500 overflow-hidden">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center">
                                <Bike className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Pago del Delivery</h3>
                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-wider text-emerald-600 leading-none italic">
                                    {order.status === 'verificando_pago_delivery' ? "Verificando tu reporte..." : "Paga el envío para activar el radar de pilotos"}
                                </p>
                            </div>
                        </div>

                        {order.status === 'verificando_pago_delivery' ? (
                            <div className="flex flex-col items-center text-center py-6 space-y-4">
                                <div className="relative w-20 h-20 flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-30"></div>
                                    <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                                        <Loader2 className="w-8 h-8 animate-spin" />
                                    </div>
                                </div>
                                <h3 className="text-lg font-black text-slate-900 mb-1">Casi terminamos...</h3>
                                <p className="text-slate-500 text-sm font-medium px-4">Estamos validando el pago del servicio de delivery. En segundos activaremos la búsqueda de piloto.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Vehicle Selection */}
                                <div className="space-y-4">
                                    <p className="text-[10px] uppercase font-black text-slate-400 ml-1">Selecciona tipo de transporte</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button 
                                            onClick={() => handleSelectVehicle('moto')}
                                            className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                                                (order.vehicleType || 'moto') === 'moto' 
                                                ? 'border-primary bg-primary/5 text-slate-900 shadow-lg shadow-primary/10' 
                                                : 'border-slate-100 bg-slate-50 text-slate-400 grayscale'
                                            }`}
                                        >
                                            <Bike className="w-8 h-8" />
                                            <span className="text-xs font-black">MOTO</span>
                                            <span className="text-[10px] font-bold opacity-70">Más rápido</span>
                                        </button>
                                        <button 
                                            onClick={() => handleSelectVehicle('carro')}
                                            className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                                                order.vehicleType === 'carro' 
                                                ? 'border-primary bg-primary/5 text-slate-900 shadow-lg shadow-primary/10' 
                                                : 'border-slate-100 bg-slate-50 text-slate-400 grayscale'
                                            }`}
                                        >
                                            <Navigation className="w-8 h-8" />
                                            <span className="text-xs font-black">CARRO</span>
                                            <span className="text-[10px] font-bold opacity-70">Más seguro</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Amount to Pay */}
                                <div className="bg-emerald-500 rounded-2xl p-5 text-center shadow-xl shadow-emerald-500/20 animate-pulse border-2 border-emerald-400">
                                    <p className="text-[10px] font-black text-white/80 uppercase tracking-widest mb-1">Monto del Delivery</p>
                                    <div className="text-3xl font-black text-white">
                                        <DualPrice usdAmount={order.deliveryFee || 0} showDivider={false} usdClassName="text-white" />
                                    </div>
                                    <p className="text-[10px] font-bold text-emerald-100 italic mt-2">Tarifa basada en {order.distance?.toFixed(1) || 0}km</p>
                                </div>

                                {/* Platform Payment Info */}
                                {platformConfig?.paymentMethods && (
                                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Pagar al Sistema Arepa Express</p>
                                        <div className="space-y-4">
                                            {/* Pago Móvil Platform */}
                                            {platformConfig.paymentMethods.pagoMovil?.active && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-primary"></span> 
                                                        Pago Móvil
                                                    </span>
                                                    <div className="mt-1 grid grid-cols-2 gap-3">
                                                        <div onClick={() => { navigator.clipboard.writeText(platformConfig.paymentMethods.pagoMovil.bank); toast.success('Banco copiado'); }} className="group cursor-pointer active:scale-95 transition-all">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Banco</p>
                                                            <p className="text-xs font-black text-slate-700">{platformConfig.paymentMethods.pagoMovil.bank}</p>
                                                        </div>
                                                        <div onClick={() => { navigator.clipboard.writeText(platformConfig.paymentMethods.pagoMovil.phone); toast.success('Teléfono copiado'); }} className="group cursor-pointer active:scale-95 transition-all">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Teléfono</p>
                                                            <p className="text-xs font-black text-slate-700">{platformConfig.paymentMethods.pagoMovil.phone}</p>
                                                        </div>
                                                        <div onClick={() => { navigator.clipboard.writeText(platformConfig.paymentMethods.pagoMovil.idf); toast.success('RIF copiado'); }} className="col-span-2 group cursor-pointer active:scale-95 transition-all">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">RIF</p>
                                                            <p className="text-xs font-black text-slate-700">{platformConfig.paymentMethods.pagoMovil.idf}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Zelle Platform */}
                                            {platformConfig.paymentMethods.zelle?.active && (
                                                <div className="flex flex-col gap-1 border-t border-slate-200 pt-3">
                                                    <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span> 
                                                        Zelle
                                                    </span>
                                                    <div className="mt-1 grid grid-cols-1 gap-3">
                                                        <div onClick={() => { navigator.clipboard.writeText(platformConfig.paymentMethods.zelle.email); toast.success('Correo copiado'); }} className="group cursor-pointer active:scale-95 transition-all">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Correo</p>
                                                            <p className="text-xs font-black text-slate-700">{platformConfig.paymentMethods.zelle.email}</p>
                                                        </div>
                                                        <div onClick={() => { navigator.clipboard.writeText(platformConfig.paymentMethods.zelle.name); toast.success('Titular copiado'); }} className="group cursor-pointer active:scale-95 transition-all">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Titular</p>
                                                            <p className="text-xs font-black text-slate-700">{platformConfig.paymentMethods.zelle.name}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Transfer Platform */}
                                            {platformConfig.paymentMethods.transfer?.active && (
                                                <div className="flex flex-col gap-1 border-t border-slate-200 pt-3">
                                                    <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-blue-500"></span> 
                                                        Transferencia
                                                    </span>
                                                    <div className="mt-1 grid grid-cols-2 gap-3">
                                                        <div onClick={() => { navigator.clipboard.writeText(platformConfig.paymentMethods.transfer.bank); toast.success('Banco copiado'); }} className="group cursor-pointer active:scale-95 transition-all">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Banco</p>
                                                            <p className="text-xs font-black text-slate-700">{platformConfig.paymentMethods.transfer.bank}</p>
                                                        </div>
                                                        <div onClick={() => { navigator.clipboard.writeText(platformConfig.paymentMethods.transfer.accountNumber); toast.success('Número de cuenta copiado'); }} className="group cursor-pointer active:scale-95 transition-all">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Cuenta</p>
                                                            <p className="text-[10px] font-black text-slate-700">{platformConfig.paymentMethods.transfer.accountNumber}</p>
                                                        </div>
                                                        <div onClick={() => { navigator.clipboard.writeText(platformConfig.paymentMethods.transfer.name); toast.success('Titular copiado'); }} className="col-span-2 group cursor-pointer active:scale-95 transition-all">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Titular</p>
                                                            <p className="text-xs font-black text-slate-700">{platformConfig.paymentMethods.transfer.name}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}


                                        </div>
                                    </div>
                                )}

                                {/* Report Form */}
                                <div className="space-y-3">
                                    <label className="text-[10px] uppercase font-black text-slate-400 ml-1">Reportar Pago Delivery</label>
                                    <input 
                                        type="text" 
                                        placeholder="Número de Referencia"
                                        value={deliveryPaymentReference}
                                        onChange={(e) => setDeliveryPaymentReference(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-slate-100 px-4 py-3 rounded-2xl text-sm font-bold outline-none focus:border-primary transition-all text-slate-700"
                                    />
                                    
                                    <button 
                                        onClick={handleReportDeliveryPayment}
                                        disabled={isUploadingDeliveryReport || !deliveryPaymentReference}
                                        className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-slate-800 active:scale-95 transition-all text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isUploadingDeliveryReport ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Informar Pago Delivery'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Delivery Radar (Searching) */}
                {transportRequest?.status === 'searching' && (
                    <div className="bg-slate-900 rounded-[3rem] p-8 text-center shadow-2xl shadow-slate-900/40 relative overflow-hidden border border-slate-800">
                        {/* Radar Background Animation */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-20">
                            <motion.div 
                                animate={{ scale: [1, 2, 1], opacity: [0.5, 0.1, 0.5] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                className="w-64 h-64 border border-primary rounded-full absolute"
                            />
                            <motion.div 
                                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.05, 0.3] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                                className="w-96 h-96 border border-primary rounded-full absolute"
                            />
                        </div>

                        <div className="relative z-10">
                            <div className="w-24 h-24 bg-primary/20 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 border-2 border-primary/30 shadow-lg shadow-primary/10">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                >
                                    <Navigation className="w-12 h-12 text-slate-900" />
                                </motion.div>
                            </div>
                            <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Rastreo Activo</h3>
                            <p className="text-slate-900/70 font-black text-sm uppercase tracking-[0.2em] mb-4">Buscando Delivery...</p>
                            
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <span className="w-2 h-2 bg-primary rounded-full animate-ping"></span>
                                <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">Escaneando zona...</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Driver Info (If Assigned) */}
                {driver && transportRequest && transportRequest.status !== 'searching' && (
                    <div className="bg-white rounded-3xl p-1 overflow-hidden shadow-xl shadow-slate-200/40 border border-slate-100">
                        {/* Status Header */}
                        <div className="bg-slate-900 p-6 rounded-[2rem]">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Estado del Delivery</span>
                                {transportRequest.status === 'in_progress' && (
                                    <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border border-emerald-500/20">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                        En Vivo
                                    </span>
                                )}
                            </div>
                            <h4 className="text-xl font-black text-white leading-tight uppercase tracking-tight">
                                {getDeliveryStatusLabel(transportRequest.status)}
                            </h4>
                        </div>

                        {/* Driver Profile */}
                        <div className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <img src={driver.documents?.selfieUrl || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=200'} alt="Driver" className="w-16 h-16 rounded-2xl object-cover bg-slate-100 shadow-lg" />
                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center shadow-lg">
                                            <CheckCircle2 className="w-3 h-3 text-white" />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-900 text-lg leading-none mb-1">{driver.fullName}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-slate-900 bg-slate-900 px-2 py-0.5 rounded-md uppercase tracking-wider">{driver.vehicleType || 'Repartidor'}</span>
                                            <span className="text-[10px] font-black text-slate-400 uppercase">{driver.vehiclePlate || 'ABC-123'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <a href={`tel:${driver.phone}`} className="w-12 h-12 bg-slate-100 text-slate-900 rounded-2xl flex items-center justify-center active:scale-95 transition-all">
                                        <Phone className="w-5 h-5" />
                                    </a>
                                    <button 
                                        onClick={() => setActiveTab('delivery')}
                                        className={`w-12 h-12 rounded-2xl flex items-center justify-center active:scale-95 transition-all ${activeTab === 'delivery' ? 'bg-primary text-slate-900' : 'bg-slate-100 text-slate-500'}`}
                                    >
                                        <MessageCircle className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Chat with Pilot (If activeTab is delivery) */}
                        {activeTab === 'delivery' && (
                            <div className="px-4 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="h-[400px]">
                                    <OrderChatWindow 
                                        orderId={orderId!}
                                        currentUserRole="client"
                                        currentUserId={user?.uid || ''}
                                        currentUserName={user?.displayName || 'Cliente'}
                                        restaurantId={order.restaurantId}
                                        orderInfo={order}
                                        customCollectionPath={`transport_requests/${transportRequest.id}/messages`}
                                    />
                                </div>
                                <button 
                                    onClick={() => setActiveTab('order')}
                                    className="w-full mt-4 py-3 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                                >
                                    Cerrar Chat y ver orden
                                </button>
                            </div>
                        )}
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
                            <span>Compra a {restaurant?.name || 'negocio'}</span>
                            <DualPrice usdAmount={order.subtotal || 0} showDivider={false} className="flex items-center gap-1.5" />
                        </div>
                        {order.deliveryFee > 0 && (
                            <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-tight">
                                <span>Delivery</span>
                                <DualPrice usdAmount={order.deliveryFee} showDivider={false} className="flex items-center gap-1.5" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalles de Entrega</h3>
                        {!order.deliveryPaymentClientConfirmed && (
                            <button 
                                onClick={() => setShowAddressPicker(true)} 
                                className="text-[10px] font-black text-slate-900 uppercase tracking-widest bg-slate-900 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                            >
                                Cambiar Dirección
                            </button>
                        )}
                    </div>
                    
                    {showAddressPicker && (
                        <AddressPicker 
                            onClose={() => setShowAddressPicker(false)}
                            onSave={async (data) => {
                                setShowAddressPicker(false);
                                setIsUpdatingAddress(true);
                                try {
                                    await updateDoc(doc(db, 'orders', order.id), {
                                        'address.name': data.name,
                                        'address.reference': data.reference,
                                        'address.lat': data.lat,
                                        'address.lng': data.lng
                                    });
                                    toast.success('Dirección actualizada');
                                } catch (error) {
                                    console.error(error);
                                    toast.error('Error al actualizar dirección');
                                } finally {
                                    setIsUpdatingAddress(false);
                                }
                            }}
                            initialData={{
                                name: editDelivery.addressName || 'Casa',
                                lat: editDelivery.lat || 10.4806,
                                lng: editDelivery.lng || -66.9036,
                                reference: editDelivery.addressReference || ''
                            }}
                        />
                    )}

                    <div className="flex gap-4">
                            <div className="w-12 h-12 bg-primary/10 text-slate-900 rounded-2xl flex items-center justify-center shrink-0">
                                <MapPin className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                                <p className="font-black text-slate-900 leading-tight">{order.address?.name || 'Dirección de Entrega'}</p>
                                <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">{order.address?.reference || 'Sin referencias'}</p>
                            </div>
                        </div>

                    {order.deliveryPaymentClientConfirmed && (
                        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-slate-400" />
                            <p className="text-[9px] font-bold text-slate-500 uppercase leading-tight">
                                La dirección está bloqueada porque el pago del delivery está en proceso o validado.
                            </p>
                        </div>
                    )}
                </div>

                {/* Cancel Order Button at the end */}
                {(order.status === 'pending' || order.status === 'pendiente_pago') && !order.restaurantPaymentClientConfirmed && (
                    <div className="px-2 pt-4 border-t border-slate-100 mt-4">
                        <button 
                            onClick={handleCancelOrder}
                            className="w-full flex items-center justify-center gap-2 text-red-500 font-bold py-4 hover:bg-red-50 rounded-2xl transition-all"
                        >
                            <X className="w-4 h-4" /> Cancelar mi pedido
                        </button>
                    </div>
                )}
            </div>

            {/* Final Success Screen if Reviewed and Delivered */}
            {order.hasReviewed && (order.status === 'delivered' || order.status === 'completed') && (
                <div className="px-4 translate-y-[-2rem] pb-20">
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }} 
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-emerald-50 border-2 border-emerald-200 p-8 rounded-[3rem] text-center shadow-2xl shadow-emerald-200/40 relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                            <CheckCircle2 className="w-32 h-32 text-emerald-600" />
                        </div>
                        <div className="w-20 h-20 bg-emerald-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-inner">
                            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h3 className="text-2xl font-black text-emerald-900 mb-2 uppercase tracking-tight">¡Proceso Terminado!</h3>
                        <p className="text-emerald-700 font-bold leading-relaxed text-sm">Gracias por confiar en el ecosistema <b>Un 2x3</b>. Tu pedido ha sido completado y cada parte del proceso ha sido calificada.</p>
                        
                        <div className="mt-8 flex flex-col gap-3">
                            <button 
                                onClick={() => navigate('/profile')}
                                className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 className="w-5 h-5" /> VOLVER AL PERFIL
                            </button>
                            <p className="text-[10px] text-emerald-800/40 font-black uppercase tracking-[0.2em] mt-2">Pronto recibirás noticias de nuestras promociones</p>
                        </div>
                    </motion.div>
                </div>
            )}

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

