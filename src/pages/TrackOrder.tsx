import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DeliveryDriver } from '../lib/delivery-service';
import {
    Navigation, Clock, CheckCircle2, Bike, Motorbike, MapPin, Phone, ArrowLeft,
    Store, Star, Wallet, X, Loader2, Upload, AlertCircle, Copy,
    ChevronRight, Package, CreditCard, CheckCircle,
    Car, MessageSquare, Image as ImageIcon, Sparkles, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useCurrency } from '../context/CurrencyContext';
import ReviewModal from '../components/ReviewModal';
import DualPrice from '../components/DualPrice';
import OrderChatWindow from '../components/chat/OrderChatWindow';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES } from '../lib/mapsConfig';
import { googleMapsDarkStyles } from '../lib/weather';

const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: 'cooperative',
    styles: googleMapsDarkStyles
};

// ─── Geo Distance Calculator ────────────────────────────────────────────────
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(1));
}

// ─── Flow Step Resolver ─────────────────────────────────────────────────────
function getFlowStep(order: any, transportRequest: any): 1 | 2 | 3 | 4 {
    // Paso 4: En tránsito / Repartidor asignado en viaje / Entregado
    if (transportRequest) {
        if (['in_progress', 'arriving', 'completed'].includes(transportRequest.status)) {
            return 4;
        }
    }
    if (['in_transit', 'delivering', 'delivered', 'completed'].includes(order?.status)) {
        return 4;
    }

    // Paso 3: Selección de repartidor o preparación
    if (transportRequest?.status === 'accepted') return 4;
    if (transportRequest?.status === 'searching') return 3;
    if ([
        'awaiting_delivery_payment',
        'verificando_pago_delivery',
        'buscando_piloto',
        'finding_driver',
        'driver_assigned',
        'preparing'
    ].includes(order?.status)) {
        return 3;
    }

    // Paso 2: Pago al negocio (stock verificado o comprobante reportado)
    if (['awaiting_payment', 'pending_verification', 'pendiente_pago'].includes(order?.status)) {
        return 2;
    }

    // Paso 1: Confirmación de stock pendiente o acción requerida
    return 1;
}

const STEP_LABELS = ['Confirmación', 'Pago', 'Envío', 'En camino'];

export default function TrackOrder() {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES
    });

    const { orderId } = useParams();
    const navigate = useNavigate();
    const { bcvRate } = useCurrency();
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Core data state ──────────────────────────────────────────────────────
    const [order, setOrder] = useState<any>(null);
    const [driver, setDriver] = useState<DeliveryDriver | null>(null);
    const [restaurant, setRestaurant] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [transportRequest, setTransportRequest] = useState<any>(null);
    const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

    // ── UI Modals & Sheets ───────────────────────────────────────────────────
    const [showChat, setShowChat] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [showPagoMovilModal, setShowPagoMovilModal] = useState(false);

    // ── Step 2 Payment State ─────────────────────────────────────────────────
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
    const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // ── Step 3 Delivery Selection State ──────────────────────────────────────
    const [deliverySettings, setDeliverySettings] = useState<any>(null);
    const [selectedVehicle, setSelectedVehicle] = useState<'moto' | 'carro' | 'ejecutivo'>('moto');
    const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);

    // ── Auto-open review modal on delivery completion ────────────────────────
    useEffect(() => {
        if (order && !order.hasReviewed && !order.has_reviewed) {
            const isDelivered = order.status === 'delivered' || order.status === 'completed';
            const isPickupDone = (order.deliveryMethod === 'pickup' || order.delivery_method === 'pickup')
                && (order.status === 'ready' || order.status === 'completed');
            if (isDelivered || isPickupDone) {
                setShowReviewModal(true);
            }
        }
    }, [order?.status]);

    // ── Data Fetching + Realtime Subscriptions ───────────────────────────────
    useEffect(() => {
        if (!orderId) return;

        supabase.from('app_settings').select('*').eq('id', 'delivery_settings').maybeSingle().then(({ data }) => {
            if (data) setDeliverySettings(data);
        });

        // 1. Fetch Order and Store
        supabase.from('orders').select('*').eq('id', orderId).maybeSingle().then(async ({ data: orderData }) => {
            if (orderData) {
                setOrder(orderData);
                const rId = orderData.restaurantId || orderData.restaurant_id;
                if (rId) {
                    const { data: rData } = await supabase.from('comercios').select('*').eq('id', rId).maybeSingle();
                    if (rData) setRestaurant({ id: rData.id, ...rData });
                }
            }
            setLoading(false);
        });

        // 2. Realtime Order Changes
        const orderChannel = supabase.channel(`order_track_${orderId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
                async (payload) => {
                    if (payload.new) {
                        const orderData: any = payload.new;
                        setOrder(orderData);
                        const rId = orderData.restaurantId || orderData.restaurant_id;
                        if (rId && (!restaurant || restaurant.id !== rId)) {
                            const { data: rData } = await supabase.from('comercios').select('*').eq('id', rId).maybeSingle();
                            if (rData) setRestaurant({ id: rData.id, ...rData });
                        }
                    }
                }).subscribe();

        // 3. Fetch Transport Request
        const fetchTransport = async () => {
            const { data: trList } = await supabase
                .from('transport_requests')
                .select('*')
                .or(`order_id.eq.${orderId},id.eq.${order?.transport_request_id || '00000000-0000-0000-0000-000000000000'}`)
                .order('created_at', { ascending: false })
                .limit(1);

            if (trList && trList.length > 0) {
                const trData = trList[0];
                setTransportRequest({ id: trData.id, ...trData });
                const dId = trData.driver_id || trData.driverId;
                if (dId) {
                    const { data: dData } = await supabase.from('delivery_drivers').select('*').eq('id', dId).maybeSingle();
                    if (dData) setDriver({ id: dData.id, ...dData } as DeliveryDriver);
                }
            }
        };
        fetchTransport();

        // 4. Realtime Transport Request Changes
        const transportChannel = supabase.channel(`tr_track_${orderId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: `order_id=eq.${orderId}` },
                async (payload) => {
                    if (payload.new) {
                        const trData: any = payload.new;
                        setTransportRequest({ id: trData.id, ...trData });
                        const dId = trData.driver_id || trData.driverId;
                        if (dId) {
                            const { data: dData } = await supabase.from('delivery_drivers').select('*').eq('id', dId).maybeSingle();
                            if (dData) setDriver({ id: dData.id, ...dData } as DeliveryDriver);
                        }
                    }
                }).subscribe();

        return () => {
            supabase.removeChannel(orderChannel);
            supabase.removeChannel(transportChannel);
        };
    }, [orderId, order?.transport_request_id]);

    // ── Driver GPS Tracking ──────────────────────────────────────────────────
    useEffect(() => {
        const driverId = transportRequest?.driver_id || transportRequest?.driverId;
        if (!driverId) return;

        supabase.from('driver_locations').select('*').eq('driver_id', driverId).maybeSingle().then(({ data }) => {
            if (data) setDriverLocation(data as any);
        });

        const locChannel = supabase.channel(`driver_loc_${driverId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
                (payload) => { if (payload.new) setDriverLocation(payload.new as any); })
            .subscribe();

        return () => { supabase.removeChannel(locChannel); };
    }, [transportRequest?.driver_id, transportRequest?.driverId]);

    // ── User Geolocation ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => console.error('Geolocation error:', err),
            { enableHighAccuracy: true }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    // ── Handle Payment Proof Image Selection ─────────────────────────────────
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPaymentProofFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setPaymentProofPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    // ── Handlers ─────────────────────────────────────────────────────────────

    // Paso 2: Reportar Pago al Negocio
    const handleRestaurantPaid = async () => {
        if (!orderId || !order) return;
        setIsUploading(true);

        try {
            let uploadedProofUrl: string | null = order.payment_proof_url || null;

            // Subir comprobante a storage si se adjuntó archivo
            if (paymentProofFile) {
                const ext = paymentProofFile.name.split('.').pop() || 'jpg';
                const filePath = `payment_proofs/order_${orderId}_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, paymentProofFile, { upsert: true });
                if (!upErr) {
                    const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                    uploadedProofUrl = publicUrl;
                }
            }

            // Actualizar la orden
            await supabase.from('orders').update({
                restaurantPaymentClientConfirmed: true,
                restaurant_payment_client_confirmed: true,
                status: 'pending_verification',
                paymentReference: paymentReference || null,
                payment_reference: paymentReference || null,
                paymentProofUrl: uploadedProofUrl,
                payment_proof_url: uploadedProofUrl,
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            // Enviar mensaje con el comprobante al chat
            const msgText = paymentReference
                ? `📢 He realizado el pago. Referencia: ${paymentReference}. Favor verificar.`
                : '📢 He realizado el pago. Favor verificar.';

            await supabase.from('messages').insert({
                order_id: orderId,
                orderId: orderId,
                text: msgText,
                image_url: uploadedProofUrl,
                sender_id: user?.uid || 'guest',
                senderId: user?.uid || 'guest',
                sender_name: order.userName || 'Cliente',
                senderName: order.userName || 'Cliente',
                sender_role: 'client',
                senderRole: 'client',
                created_at: new Date().toISOString(),
                createdAt: new Date().toISOString()
            });

            toast.success('¡Comprobante enviado al negocio exitosamente!');
        } catch (error) {
            console.error(error);
            toast.error('Ocurrió un error al enviar la información de pago');
        } finally {
            setIsUploading(false);
        }
    };

    // Paso 2: Pago en sitio (PickUp)
    const handlePayOnSite = async () => {
        if (!orderId) return;
        try {
            await supabase.from('orders').update({
                deliveryMethod: 'pickup',
                delivery_method: 'pickup',
                deliveryFee: 0,
                delivery_fee: 0,
                paymentMethod: 'Pagar en el Local',
                payment_method: 'Pagar en el Local',
                status: 'preparing',
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            await supabase.from('messages').insert({
                order_id: orderId,
                text: '🏪 Seleccioné pagar directamente en el local al retirar mi compra.',
                sender_id: user?.uid || 'guest',
                sender_name: order?.userName || 'Cliente',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });

            toast.success('Modo pago en sitio confirmado');
        } catch (error) {
            toast.error('Error al actualizar método');
        }
    };

    // Paso 1: Eliminar ítem agotado
    const handleRemoveMissingItem = async (itemId: string) => {
        if (!order || !orderId) return;
        const newItems = order.items.filter((item: any) => item.id !== itemId);
        const newSubtotal = newItems.reduce((acc: number, item: any) => acc + (Number(item.price) * Number(item.quantity)), 0);
        const newTotal = newSubtotal + (order.deliveryFee || order.delivery_fee || 0);
        try {
            await supabase.from('orders').update({
                items: newItems,
                subtotal: newSubtotal,
                total: newTotal,
                missingItems: (order.missingItems || []).filter((id: string) => id !== itemId),
                missing_items: (order.missing_items || order.missingItems || []).filter((id: string) => id !== itemId),
                updated_at: new Date().toISOString()
            }).eq('id', orderId);
            toast.success('Producto eliminado');
        } catch (error) {
            toast.error('Error al eliminar producto');
        }
    };

    // Paso 1: Confirmar cambios tras resolver ítems agotados
    const handleConfirmStockChanges = async () => {
        if (!orderId) return;
        try {
            await supabase.from('orders').update({
                status: 'pending',
                stockConfirmed: false,
                stock_confirmed: false,
                missingItems: [],
                missing_items: [],
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            await supabase.from('messages').insert({
                order_id: orderId,
                text: '🔄 *El cliente actualizó su pedido.* Favor verificar stock nuevamente.',
                sender_id: user?.uid || 'guest',
                sender_name: order.userName || 'Cliente',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });

            toast.success('Cambios confirmados. Notificando a la tienda.');
        } catch (error) {
            toast.error('Error al confirmar cambios');
        }
    };

    // Cancelar orden
    const handleCancelOrder = async () => {
        if (!orderId) return;
        if (window.confirm('¿Estás seguro que deseas cancelar tu pedido?')) {
            try {
                await supabase.from('orders').update({
                    status: 'cancelled',
                    cancelledAt: new Date().toISOString(),
                    cancelled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', orderId);
                toast.success('Pedido cancelado');
            } catch (error) {
                toast.error('Error al cancelar');
            }
        }
    };

    // Cambiar a Retiro en Local
    const handleSwitchToPickup = async () => {
        if (!orderId || !order) return;
        if (window.confirm('¿Deseas cambiar tu entrega a Retiro en Local? El costo de delivery será $0.')) {
            try {
                await supabase.from('orders').update({
                    deliveryMethod: 'pickup',
                    delivery_method: 'pickup',
                    deliveryFee: 0,
                    delivery_fee: 0,
                    total: order.subtotal,
                    status: 'preparing',
                    updated_at: new Date().toISOString()
                }).eq('id', orderId);

                await supabase.from('messages').insert({
                    order_id: orderId,
                    text: '🏪 He cambiado mi pedido a RETIRO EN LOCAL (PickUp). Preparar para retirar.',
                    sender_id: user?.uid || 'guest',
                    sender_name: order.userName || 'Cliente',
                    sender_role: 'client',
                    created_at: new Date().toISOString()
                });

                toast.success('Cambiado a Retiro en Local');
            } catch (error) {
                toast.error('Error al actualizar método');
            }
        }
    };

    // Paso 3: Confirmar y Solicitar Repartidor (Delivery nativo estilo Encomiendas)
    const handleRequestDelivery = async () => {
        if (!order || !orderId || isSubmittingDelivery) return;
        setIsSubmittingDelivery(true);

        try {
            const distance = calculatedDistance;
            const rates = deliverySettings?.transportRates?.[selectedVehicle] || [];
            const rate = rates.find((r: any) => distance >= r.from && (distance <= r.to || !r.to));
            const calculatedFee = rate ? (rate.clientPrice || rate.price) : (selectedVehicle === 'moto' ? 2.5 : selectedVehicle === 'carro' ? 5.0 : 7.0);
            const deliveryFee = order.free_delivery ? 0 : calculatedFee;

            const itemsSummary = (order.items || []).map((i: any) => `${i.quantity}x ${i.name}`).join(', ');

            const originData = {
                address: restaurant?.address || restaurant?.location?.address || order.restaurantName || 'Comercio',
                coords: restaurant?.location?.coords || (restaurant?.lat ? { lat: Number(restaurant.lat), lng: Number(restaurant.lng) } : null),
                name: restaurant?.name || order.restaurantName || 'Negocio',
                details: 'Retiro de pedido de comida'
            };

            const destinationData = {
                address: order.deliveryAddress || order.address?.name || 'Dirección del cliente',
                coords: order.deliveryCoords || order.address?.coords || userLocation || null,
                name: order.userName || 'Cliente',
                details: order.address?.reference || order.orderNote || ''
            };

            const transportId = crypto.randomUUID();

            const transportData: any = {
                id: transportId,
                order_id: orderId,
                restaurant_id: order.restaurantId || order.restaurant_id || null,
                restaurant_name: restaurant?.name || order.restaurantName || null,
                items_summary: itemsSummary,
                type: 'food_delivery',
                service_category: 'food_delivery',
                status: 'searching',
                user_id: order.userId || user?.uid || null,
                user_name: order.userName || 'Cliente',
                user_phone: order.userPhone || user?.phoneNumber || '',
                user_cedula: order.userCedula || '',
                origin: originData,
                destination: destinationData,
                vehicle_type: selectedVehicle,
                price: deliveryFee,
                total: deliveryFee,
                client_total: deliveryFee,
                driver_payout: deliveryFee * 0.8,
                commission_amount: deliveryFee * 0.2,
                payment_method: 'Transferencia/Pago Móvil',
                package_description: `Entrega de pedido: ${itemsSummary}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // 1. Insertar solicitud de transporte
            const { error: trError } = await supabase.from('transport_requests').insert(transportData);
            if (trError) {
                console.error("Error creating transport request:", trError);
            }

            // 2. Actualizar la orden
            await supabase.from('orders').update({
                transport_request_id: transportId,
                vehicleType: selectedVehicle,
                vehicle_type: selectedVehicle,
                deliveryFee: deliveryFee,
                delivery_fee: deliveryFee,
                status: 'buscando_piloto',
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            // 3. Notificar en chat
            await supabase.from('messages').insert({
                order_id: orderId,
                text: `🛵 *Delivery Solicitado:* Vehículo: ${selectedVehicle.toUpperCase()} · Tarifa: $${deliveryFee.toFixed(2)}. Buscando repartidor disponible.`,
                sender_id: user?.uid || 'guest',
                sender_name: order.userName || 'Cliente',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });

            toast.success('¡Buscando repartidor para tu entrega!', { icon: '🛵' });
        } catch (error) {
            console.error(error);
            toast.error('Error al solicitar repartidor');
        } finally {
            setIsSubmittingDelivery(false);
        }
    };

    // ── Derived Data & Computations ──────────────────────────────────────────
    const currentStep = getFlowStep(order, transportRequest);
    const isPickup = order?.deliveryMethod === 'pickup' || order?.delivery_method === 'pickup';

    const itemsTotal = Array.isArray(order?.items)
        ? order.items.reduce((s: number, i: any) => s + (Number(i.price) * Number(i.quantity)), 0)
        : Number(order?.subtotal || order?.total || 0);

    const paymentMethods: any[] = Array.isArray(restaurant?.paymentMethods)
        ? restaurant.paymentMethods
        : Array.isArray(restaurant?.payment_methods)
            ? restaurant.payment_methods
            : [];

    const pagoMovilMethod = paymentMethods.find((m: any) => m.type === 'Pago Móvil') || null;

    // Calcular distancia tienda -> cliente
    const originCoords = restaurant?.location?.coords || (restaurant?.lat ? { lat: Number(restaurant.lat), lng: Number(restaurant.lng) } : null);
    const destCoords = order?.deliveryCoords || order?.address?.coords || userLocation;
    const calculatedDistance = (originCoords && destCoords)
        ? calculateDistanceKm(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng)
        : Number(order?.distance || 2.5);

    const mapCenter = driverLocation
        || destCoords
        || originCoords
        || { lat: 8.9326, lng: -67.4264 };

    // ── Loading & Not Found Screens ──────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Cargando pedido...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-slate-50">
                <Motorbike className="w-16 h-16 text-slate-300 mb-4" />
                <h2 className="text-xl font-black text-slate-900 mb-2">Pedido no encontrado</h2>
                <button onClick={() => navigate('/')} className="text-slate-900 font-bold hover:underline">Volver al inicio</button>
            </div>
        );
    }

    if (order.status === 'cancelled') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-slate-50">
                <div className="w-20 h-20 bg-red-100 text-red-500 flex items-center justify-center rounded-3xl mb-4 shadow-xl shadow-red-500/20">
                    <X className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-2">Pedido Cancelado</h2>
                <p className="text-slate-500 font-medium mb-6 text-sm">Este pedido fue cancelado satisfactoriamente.</p>
                <button onClick={() => navigate('/')} className="bg-slate-900 text-white rounded-2xl px-8 py-4 font-black shadow-xl hover:bg-slate-800 transition-colors">
                    Volver al inicio
                </button>
            </div>
        );
    }

    // ── Step Progress Indicator ──────────────────────────────────────────────
    const StepProgressHeader = () => (
        <div className="bg-white px-4 pt-3 pb-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center justify-between">
                {STEP_LABELS.map((label, i) => {
                    const stepNum = i + 1;
                    const isDone = stepNum < currentStep;
                    const isActive = stepNum === currentStep;
                    return (
                        <React.Fragment key={stepNum}>
                            <div className="flex flex-col items-center gap-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 ${
                                    isDone ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                                    : isActive ? 'bg-primary text-slate-900 shadow-md shadow-primary/30 ring-4 ring-primary/20'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                    {isDone ? <CheckCircle className="w-4 h-4" /> : stepNum}
                                </div>
                                <span className={`text-[9px] font-black uppercase tracking-wider ${
                                    isActive ? 'text-slate-900' : isDone ? 'text-emerald-600' : 'text-slate-400'
                                }`}>{label}</span>
                            </div>
                            {i < STEP_LABELS.length - 1 && (
                                <div className={`flex-1 h-0.5 mx-2 -mt-4 rounded-full transition-all duration-500 ${
                                    stepNum < currentStep ? 'bg-emerald-500' : 'bg-slate-200'
                                }`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );

    // ── Floating Chat Button ─────────────────────────────────────────────────
    const ChatFAB = () => (
        order.status !== 'cancelled' && order.status !== 'delivered' && order.status !== 'completed' ? (
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowChat(true)}
                className="fixed bottom-6 right-5 z-40 bg-slate-900 text-white p-4 rounded-full shadow-2xl shadow-slate-900/40 flex items-center gap-2 border-2 border-white"
                title="Abrir Chat"
            >
                <MessageSquare className="w-6 h-6 text-primary" />
                <span className="text-xs font-black pr-1 hidden sm:inline">Chat</span>
            </motion.button>
        ) : null
    );

    // ── Fullscreen Chat Overlay ──────────────────────────────────────────────
    const ChatOverlay = () => (
        <AnimatePresence>
            {showChat && (
                <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className="fixed inset-0 z-50 bg-slate-50 flex flex-col"
                >
                    <div className="bg-white px-4 py-4 flex items-center gap-3 shadow-sm border-b border-slate-100 shrink-0">
                        <button
                            onClick={() => setShowChat(false)}
                            className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-700" />
                        </button>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                                {restaurant?.logoUrl
                                    ? <img src={restaurant.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                                    : <Store className="w-6 h-6 text-slate-600" />}
                            </div>
                            <div className="min-w-0">
                                <p className="font-black text-slate-900 truncate leading-tight">{restaurant?.name || 'Tienda'}</p>
                                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" /> Chat en vivo
                                </p>
                            </div>
                        </div>
                        <div className="bg-primary/10 px-3 py-1.5 rounded-full">
                            <span className="text-[10px] font-black text-slate-900 uppercase">#{orderId?.slice(-5).toUpperCase()}</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <OrderChatWindow
                            orderId={orderId!}
                            currentUserRole="client"
                            currentUserId={user?.uid || 'guest'}
                            currentUserName={order.userName || 'Cliente'}
                            restaurantId={order.restaurantId || order.restaurant_id}
                            orderInfo={order}
                        />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    // ── Modal de Datos de Pago Móvil con Copiado Rápido ──────────────────────
    const PagoMovilDataModal = () => {
        const bsAmount = (itemsTotal * bcvRate).toFixed(2);
        const copyAll = () => {
            if (!pagoMovilMethod) return;
            const fullText = `Banco: ${pagoMovilMethod.bank}\nTeléfono: ${pagoMovilMethod.phone}\nCédula/RIF: ${pagoMovilMethod.rif}\nTitular: ${pagoMovilMethod.owner}\nMonto: ${bsAmount} Bs`;
            navigator.clipboard.writeText(fullText);
            toast.success('¡Todos los datos copiados! Pégalos en tu banco.', { duration: 4000 });
        };

        return (
            <AnimatePresence>
                {showPagoMovilModal && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <motion.div
                            initial={{ y: '100%', opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: '100%', opacity: 0 }}
                            className="bg-white rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl"
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div>
                                    <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                                        <Wallet className="w-5 h-5 text-primary" /> Datos de Pago Móvil
                                    </h3>
                                    <p className="text-xs text-slate-400 font-bold">{restaurant?.name || 'Comercio'}</p>
                                </div>
                                <button
                                    onClick={() => setShowPagoMovilModal(false)}
                                    className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Monto Destacado */}
                            <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-amber-50 rounded-2xl p-4 border-2 border-primary/30 text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Monto Exacto en Bolívares</p>
                                <p className="text-3xl font-black text-slate-900">{bsAmount} Bs</p>
                                <p className="text-xs font-bold text-slate-500 mt-1">Equivalente a ${itemsTotal.toFixed(2)} USD (Tasa BCV)</p>
                            </div>

                            {/* Campos Copiables */}
                            {pagoMovilMethod ? (
                                <div className="space-y-2.5">
                                    {[
                                        { label: 'Banco', val: pagoMovilMethod.bank },
                                        { label: 'Teléfono', val: pagoMovilMethod.phone },
                                        { label: 'Cédula / RIF', val: pagoMovilMethod.rif },
                                        { label: 'Titular', val: pagoMovilMethod.owner },
                                    ].map((f, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => {
                                                navigator.clipboard.writeText(f.val);
                                                toast.success(`${f.label} copiado`);
                                            }}
                                            className="group bg-slate-50 hover:bg-primary/5 active:scale-98 transition-all p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between cursor-pointer"
                                        >
                                            <div>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">{f.label}</span>
                                                <span className="text-sm font-black text-slate-800">{f.val}</span>
                                            </div>
                                            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-xs border border-slate-200 group-hover:border-primary text-slate-500 group-hover:text-slate-900 transition-colors">
                                                <Copy className="w-4 h-4" />
                                            </div>
                                        </div>
                                    ))}

                                    {/* Botón Maestro Copiar Todos los Datos */}
                                    <button
                                        onClick={copyAll}
                                        className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-slate-900/20 flex items-center justify-center gap-2 mt-4 text-sm"
                                    >
                                        <Copy className="w-4 h-4 text-primary" /> Copiar Todos los Datos para el Banco
                                    </button>
                                </div>
                            ) : (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                                    <p className="text-sm font-bold text-amber-700">El negocio no tiene configurado Pago Móvil automático. Usa el chat para solicitar los datos directamente.</p>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        );
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1 — Confirmación de Stock y Orden
    // ═══════════════════════════════════════════════════════════════════════════
    const renderStep1 = () => (
        <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-slate-50 pb-28">
            {/* AppBar */}
            <div className="bg-white px-4 py-4 flex items-center gap-3 sticky top-0 z-30 shadow-xs border-b border-slate-100">
                <button
                    onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')}
                    className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                >
                    <ArrowLeft className="w-5 h-5 text-slate-700" />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-base font-black text-slate-900 leading-tight">Seguimiento de Pedido</h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orden #{orderId?.slice(-6).toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200/80 px-3 py-1.5 rounded-full">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black uppercase text-blue-700">Paso 1: Stock</span>
                </div>
            </div>

            <StepProgressHeader />

            <div className="px-4 pt-5 space-y-4 max-w-lg mx-auto">
                {/* Botón Prominente: [Ir al Chat con la Tienda] */}
                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowChat(true)}
                    className="w-full bg-slate-900 text-white p-4 rounded-3xl shadow-xl shadow-slate-900/20 flex items-center justify-between group transition-all"
                >
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                            <MessageSquare className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                            <p className="font-black text-base text-white leading-tight">Ir al Chat con la Tienda</p>
                            <p className="text-[11px] font-bold text-white/60">Consulta cualquier duda en tiempo real</p>
                        </div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/80 group-hover:translate-x-1 transition-transform">
                        <ChevronRight className="w-5 h-5" />
                    </div>
                </motion.button>

                {/* Estatus Visual de Confirmación de Stock */}
                {order.status === 'pending' && (
                    <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-200/80 text-center space-y-3">
                        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto">
                            <Clock className="w-8 h-8 animate-spin" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900">Verificando Stock de tu Pedido</h3>
                        <p className="text-sm font-medium text-slate-500 max-w-xs mx-auto">
                            La tienda está verificando que todos los productos seleccionados estén disponibles. Te notificaremos al instante.
                        </p>
                    </div>
                )}

                {order.status === 'action_required' && (
                    <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="font-black text-slate-900 text-base">Acción Requerida</h4>
                                <p className="text-xs font-bold text-amber-700">Algunos productos están agotados</p>
                            </div>
                        </div>

                        <div className="space-y-2 pt-2">
                            {order.items.map((item: any) => {
                                const isMissing = (order.missingItems || []).includes(item.id);
                                if (!isMissing) return null;
                                return (
                                    <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-2xl border border-red-100">
                                        <div>
                                            <p className="font-black text-sm text-slate-800">{item.name}</p>
                                            <span className="text-[10px] font-bold text-red-500 uppercase">Agotado en tienda</span>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveMissingItem(item.id)}
                                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors"
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            onClick={handleConfirmStockChanges}
                            disabled={(order.missingItems || []).length > 0}
                            className="w-full bg-slate-900 text-white py-3.5 rounded-2xl font-black text-sm disabled:opacity-40"
                        >
                            {(order.missingItems || []).length > 0 ? 'Elimina los productos agotados primero' : 'Confirmar Cambios'}
                        </button>
                    </div>
                )}

                {/* Tienda */}
                <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 flex items-center gap-3.5">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 border border-slate-200">
                        {restaurant?.logoUrl
                            ? <img src={restaurant.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                            : <Store className="w-6 h-6 text-slate-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-black text-base text-slate-900 truncate">{restaurant?.name || order.restaurantName || 'Comercio'}</p>
                        <p className="text-xs font-bold text-slate-400 truncate">{restaurant?.address || restaurant?.location?.address || 'Comercio afiliado'}</p>
                    </div>
                </div>

                {/* Detalle del Pedido */}
                <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detalle de la Orden</p>
                    <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                        {(order.items || []).map((item: any, idx: number) => (
                            <div key={idx} className="py-2.5 flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                                    <span className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-black text-slate-700 shrink-0">
                                        {item.quantity}x
                                    </span>
                                    <span className="font-bold text-slate-800 truncate">{item.name}</span>
                                </div>
                                <span className="font-black text-slate-900 shrink-0">
                                    ${(Number(item.price) * Number(item.quantity)).toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                        <span className="font-black text-base text-slate-900">Total Productos</span>
                        <DualPrice usdAmount={itemsTotal} usdClassName="font-black text-lg text-slate-900" />
                    </div>
                </div>

                {/* Cancelar Orden (si sigue pendiente) */}
                <div className="pt-2">
                    <button
                        onClick={handleCancelOrder}
                        className="w-full text-red-500 hover:text-red-700 py-3 rounded-2xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                        <X className="w-4 h-4" /> Cancelar orden
                    </button>
                </div>
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2 — Pago al Negocio
    // ═══════════════════════════════════════════════════════════════════════════
    const renderStep2 = () => {
        const isVerifying = order.status === 'pending_verification';

        return (
            <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-slate-50 pb-28">
                {/* AppBar */}
                <div className="bg-white px-4 py-4 flex items-center gap-3 sticky top-0 z-30 shadow-xs border-b border-slate-100">
                    <button
                        onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')}
                        className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-700" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-base font-black text-slate-900 leading-tight">Pagar al Negocio</h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stock Confirmado · Paso 2</p>
                    </div>
                    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-full">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[10px] font-black uppercase text-emerald-700">Stock OK</span>
                    </div>
                </div>

                <StepProgressHeader />

                <div className="px-4 pt-5 space-y-4 max-w-lg mx-auto">
                    {/* Tarjeta de Monto */}
                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Monto Total a Pagar</p>
                            <div className="text-4xl font-black">
                                <DualPrice usdAmount={itemsTotal} usdClassName="text-white" bsClassName="text-primary text-2xl" />
                            </div>
                            <p className="text-xs text-white/50 font-bold mt-2">Destinatario: {restaurant?.name || 'Comercio'}</p>
                        </div>
                    </div>

                    {isVerifying ? (
                        /* Estado: Comprobante Enviado / En Verificación */
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-200/80 text-center space-y-4">
                            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto">
                                <Clock className="w-8 h-8 animate-spin" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Verificando tu Pago</h3>
                                <p className="text-sm font-medium text-slate-500 mt-1 max-w-xs mx-auto">
                                    El negocio está revisando tu reporte de pago. Una vez aprobado, pasaremos a la preparación y envío.
                                </p>
                            </div>

                            {order.payment_proof_url && (
                                <div className="mt-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 inline-block">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Comprobante enviado</p>
                                    <img src={order.payment_proof_url} alt="Comprobante" className="max-h-40 rounded-xl mx-auto shadow-xs" />
                                </div>
                            )}

                            {order.paymentReference && (
                                <p className="text-xs font-bold text-slate-600">Referencia: <span className="font-black">{order.paymentReference}</span></p>
                            )}

                            <button
                                onClick={() => setShowChat(true)}
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-sm shadow-md"
                            >
                                <MessageSquare className="w-4 h-4 text-primary" /> Abrir Chat con el Negocio
                            </button>
                        </div>
                    ) : (
                        /* Formulario de Pago y Comprobante */
                        <>
                            {/* Botón Destacado: Ver Datos de Pago Móvil */}
                            <motion.button
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setShowPagoMovilModal(true)}
                                className="w-full bg-primary text-slate-900 p-5 rounded-3xl shadow-xl shadow-primary/25 flex items-center justify-between border-2 border-primary group"
                            >
                                <div className="flex items-center gap-3.5">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-primary flex items-center justify-center shrink-0">
                                        <Wallet className="w-6 h-6" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-black text-base leading-tight">Ver Datos de Pago Móvil</p>
                                        <p className="text-xs font-bold text-slate-700">Copiar monto en Bs y datos en 1 clic</p>
                                    </div>
                                </div>
                                <div className="w-9 h-9 rounded-full bg-slate-900/10 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                                    <ChevronRight className="w-5 h-5 text-slate-900" />
                                </div>
                            </motion.button>

                            {/* Opciones de Reporte */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adjuntar Comprobante de Pago</p>

                                {/* Selector de Capture / Imagen */}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                {paymentProofPreview ? (
                                    <div className="relative rounded-2xl overflow-hidden border-2 border-primary/30 p-2 bg-slate-50 flex items-center gap-3">
                                        <img src={paymentProofPreview} alt="Preview" className="w-16 h-16 object-cover rounded-xl shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black text-slate-900 truncate">{paymentProofFile?.name}</p>
                                            <p className="text-[10px] font-bold text-emerald-600">Capture listo para enviar</p>
                                        </div>
                                        <button
                                            onClick={() => { setPaymentProofFile(null); setPaymentProofPreview(null); }}
                                            className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-red-50 hover:text-red-500"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full py-6 border-2 border-dashed border-slate-200 hover:border-primary rounded-2xl flex flex-col items-center justify-center gap-2 bg-slate-50/50 hover:bg-slate-50 transition-all text-slate-500"
                                    >
                                        <ImageIcon className="w-8 h-8 text-slate-400" />
                                        <span className="text-xs font-black text-slate-700">Subir Capture de Pantalla / Foto</span>
                                        <span className="text-[10px] font-bold text-slate-400">JPG, PNG desde tu galería o cámara</span>
                                    </button>
                                )}

                                {/* Campo de Referencia (100% Opcional) */}
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1 block mb-1">
                                        Número de Referencia (Opcional)
                                    </label>
                                    <input
                                        type="text"
                                        value={paymentReference}
                                        onChange={(e) => setPaymentReference(e.target.value)}
                                        placeholder="Ej: 123456 (Opcional)"
                                        className="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-primary"
                                    />
                                </div>

                                {/* Botón Enviar Reporte */}
                                <button
                                    onClick={handleRestaurantPaid}
                                    disabled={isUploading}
                                    className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 active:scale-98 transition-all flex items-center justify-center gap-2 text-base shadow-xl shadow-slate-900/20 disabled:opacity-50"
                                >
                                    {isUploading ? (
                                        <><Loader2 className="w-5 h-5 animate-spin text-primary" /> Enviando comprobante...</>
                                    ) : (
                                        <><Upload className="w-5 h-5 text-primary" /> Ya Pagué · Notificar al Negocio</>
                                    )}
                                </button>
                            </div>

                            {/* Opción de Pago en Sitio para Pickup */}
                            <div className="pt-1">
                                <button
                                    onClick={handlePayOnSite}
                                    className="w-full bg-white hover:bg-slate-100 text-slate-700 font-bold py-3.5 rounded-2xl border border-slate-200 transition-all text-xs flex items-center justify-center gap-2"
                                >
                                    <Store className="w-4 h-4 text-slate-500" /> Prefiero pagar en el local al retirar (PickUp)
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 3 — Selección de Repartidor (Delivery / Encomiendas)
    // ═══════════════════════════════════════════════════════════════════════════
    const renderStep3 = () => {
        const isBuscando = order.status === 'buscando_piloto' || transportRequest?.status === 'searching';
        const isFreeDelivery = order.free_delivery === true;

        if (isPickup) {
            return (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-slate-50 pb-28">
                    <div className="bg-white px-4 py-4 flex items-center gap-3 sticky top-0 z-30 shadow-xs border-b border-slate-100">
                        <button
                            onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')}
                            className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-700" />
                        </button>
                        <div className="flex-1">
                            <h1 className="text-base font-black text-slate-900 leading-tight">Retiro en Local</h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PickUp · Paso 3</p>
                        </div>
                    </div>
                    <StepProgressHeader />
                    <div className="px-4 pt-8 max-w-lg mx-auto text-center space-y-6">
                        <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                            <Store className="w-10 h-10" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900">Preparando tu Orden</h2>
                            <p className="text-sm font-medium text-slate-500 mt-1 max-w-xs mx-auto">
                                El negocio está preparando tus productos. Cuando esté listo, podrás pasar a retirarlo directamente.
                            </p>
                        </div>

                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs text-left space-y-2">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Dirección de Retiro</p>
                            <p className="font-black text-base text-slate-900">{restaurant?.name}</p>
                            <p className="text-xs text-slate-500 font-bold">{restaurant?.address || restaurant?.location?.address || 'Dirección del comercio'}</p>
                        </div>

                        <button
                            onClick={() => setShowReviewModal(true)}
                            className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2"
                        >
                            <CheckCircle2 className="w-5 h-5" /> Ya retiré mi compra · Calificar
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-slate-50 pb-28">
                {/* AppBar */}
                <div className="bg-white px-4 py-4 flex items-center gap-3 sticky top-0 z-30 shadow-xs border-b border-slate-100">
                    <button
                        onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')}
                        className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-700" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-base font-black text-slate-900 leading-tight">Escoger Repartidor</h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Envío de Paquete · Paso 3</p>
                    </div>
                    {isFreeDelivery && (
                        <span className="bg-emerald-100 text-emerald-700 font-black text-[10px] px-2.5 py-1 rounded-full uppercase">
                            Envío Gratis
                        </span>
                    )}
                </div>

                <StepProgressHeader />

                <div className="px-4 pt-5 space-y-4 max-w-lg mx-auto">
                    {isBuscando ? (
                        /* Radar de Búsqueda Activo */
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-200/80 text-center space-y-5">
                            <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-60" />
                                <div className="w-20 h-20 bg-primary/10 text-slate-900 rounded-full flex items-center justify-center border-4 border-primary">
                                    <Motorbike className="w-10 h-10 animate-bounce" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Buscando Repartidor Cercano...</h3>
                                <p className="text-sm text-slate-500 font-medium mt-1 max-w-xs mx-auto">
                                    Hemos enviado la solicitud a los repartidores disponibles en la zona. Te notificaremos al asignar uno.
                                </p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs font-bold text-slate-600">
                                Vehículo: <span className="font-black uppercase">{order.vehicleType || selectedVehicle}</span> · Distancia: {calculatedDistance} km
                            </div>
                        </div>
                    ) : (
                        /* Módulo de Configuración de Envío de Paquetes */
                        <>
                            {/* Tarjeta de Origen y Destino Precargados Automáticamente */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-4">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ruta Precargada Automáticamente</p>
                                    <span className="text-xs font-black text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                                        {calculatedDistance} km de distancia
                                    </span>
                                </div>

                                {/* Origen: Tienda */}
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                                        <Store className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Punto de Retiro (Tienda)</span>
                                        <p className="text-sm font-black text-slate-900 truncate">{restaurant?.name || order.restaurantName || 'Comercio'}</p>
                                        <p className="text-xs text-slate-500 font-medium truncate">{restaurant?.address || restaurant?.location?.address || 'Dirección del comercio'}</p>
                                    </div>
                                </div>

                                {/* Línea conectora */}
                                <div className="w-0.5 h-4 bg-slate-200 ml-4 -my-2" />

                                {/* Destino: Cliente */}
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                                        <MapPin className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Punto de Entrega (Tú)</span>
                                        <p className="text-sm font-black text-slate-900 truncate">{order.deliveryAddress || order.address?.name || 'Tu dirección guardada'}</p>
                                        {order.address?.reference && (
                                            <p className="text-xs text-slate-500 font-medium truncate">{order.address.reference}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Selector de Vehículo: Moto / Carro Económico / Carro Confort */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selecciona el Tipo de Transporte</p>
                                <div className="grid grid-cols-3 gap-2.5">
                                    {[
                                        { key: 'moto', label: 'Moto', icon: Bike, desc: 'Rápido', price: 2.5 },
                                        { key: 'carro', label: 'Carro Eco', icon: Car, desc: 'Económico', price: 5.0 },
                                        { key: 'ejecutivo', label: 'Carro Confort', icon: Sparkles, desc: 'Con A/A', price: 7.0 }
                                    ].map((v) => {
                                        const isSel = selectedVehicle === v.key;
                                        const IconComp = v.icon;
                                        const distance = calculatedDistance;
                                        const rates = deliverySettings?.transportRates?.[v.key] || [];
                                        const rate = rates.find((r: any) => distance >= r.from && (distance <= r.to || !r.to));
                                        const priceUsd = isFreeDelivery ? 0 : (rate ? (rate.clientPrice || rate.price) : v.price);

                                        return (
                                            <button
                                                key={v.key}
                                                type="button"
                                                onClick={() => setSelectedVehicle(v.key as any)}
                                                className={`p-3.5 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all text-center ${
                                                    isSel
                                                        ? 'border-primary bg-primary/10 text-slate-900 shadow-md shadow-primary/10 scale-102'
                                                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                                                }`}
                                            >
                                                <IconComp className={`w-6 h-6 ${isSel ? 'text-slate-900' : 'text-slate-400'}`} />
                                                <span className="text-xs font-black leading-tight">{v.label}</span>
                                                <span className="text-[10px] font-bold text-slate-400 leading-none">{v.desc}</span>
                                                <span className="text-xs font-black text-slate-900 mt-1">
                                                    {isFreeDelivery ? 'GRATIS' : `$${priceUsd.toFixed(2)}`}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Resumen de Productos */}
                            <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-500">Paquete a transportar:</span>
                                <span className="font-black text-slate-800 truncate max-w-[200px]">
                                    {(order.items || []).map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                                </span>
                            </div>

                            {/* Botón Principal: Confirmar y Solicitar Repartidor */}
                            <button
                                onClick={handleRequestDelivery}
                                disabled={isSubmittingDelivery}
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 active:scale-98 transition-all flex items-center justify-center gap-2 text-base shadow-xl shadow-slate-900/20 disabled:opacity-50"
                            >
                                {isSubmittingDelivery ? (
                                    <><Loader2 className="w-5 h-5 animate-spin text-primary" /> Solicitando repartidor...</>
                                ) : (
                                    <><Motorbike className="w-5 h-5 text-primary" /> Solicitar Repartidor Ahora</>
                                )}
                            </button>

                            {/* Cambiar a Pickup */}
                            <button
                                onClick={handleSwitchToPickup}
                                className="w-full text-slate-500 hover:text-slate-800 text-xs font-bold py-2 transition-colors"
                            >
                                Cambiar a Retiro en Local ($0 costo)
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 4 — En Camino / Entrega (Tracking en Vivo y Calificación)
    // ═══════════════════════════════════════════════════════════════════════════
    const renderStep4 = () => {
        const isDelivered = ['delivered', 'completed'].includes(order.status) || transportRequest?.status === 'completed';
        const driverName = driver?.name || driver?.displayName || transportRequest?.driver_name || 'Repartidor';
        const driverPhone = driver?.phone || driver?.phoneNumber || transportRequest?.driver_phone;

        return (
            <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-slate-50 pb-28">
                {/* AppBar */}
                <div className="bg-white px-4 py-4 flex items-center gap-3 sticky top-0 z-30 shadow-xs border-b border-slate-100">
                    <button
                        onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')}
                        className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-700" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-base font-black text-slate-900 leading-tight">
                            {isDelivered ? '¡Pedido Entregado!' : 'En Camino a tu Ubicación'}
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rastreo en Vivo · Paso 4</p>
                    </div>
                    {!isDelivered && (
                        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-full">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                            <span className="text-[10px] font-black uppercase text-emerald-700">En Vivo</span>
                        </div>
                    )}
                </div>

                <StepProgressHeader />

                {/* Mapa Interactivo con Tracking en Tiempo Real */}
                <div className="h-72 w-full relative overflow-hidden bg-slate-200">
                    {isLoaded ? (
                        <GoogleMap
                            mapContainerStyle={{ width: '100%', height: '100%' }}
                            center={mapCenter}
                            zoom={driverLocation ? 16 : 14}
                            options={mapOptions}
                        >
                            {/* Marcador del Destino (Cliente) */}
                            {destCoords && (
                                <Marker
                                    position={destCoords}
                                    icon={{
                                        url: 'https://cdn-icons-png.flaticon.com/512/1004/1004285.png',
                                        scaledSize: window.google ? new window.google.maps.Size(34, 34) : undefined
                                    }}
                                />
                            )}

                            {/* Marcador de la Tienda (Origen) */}
                            {originCoords && (
                                <Marker
                                    position={originCoords}
                                    icon={{
                                        url: 'https://cdn-icons-png.flaticon.com/512/3081/3081559.png',
                                        scaledSize: window.google ? new window.google.maps.Size(32, 32) : undefined
                                    }}
                                />
                            )}

                            {/* Marcador del Conductor en Tiempo Real */}
                            {driverLocation && (
                                <Marker
                                    position={driverLocation}
                                    icon={{
                                        url: 'https://cdn-icons-png.flaticon.com/512/3209/3209935.png',
                                        scaledSize: window.google ? new window.google.maps.Size(46, 46) : undefined
                                    }}
                                />
                            )}
                        </GoogleMap>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                        </div>
                    )}

                    {/* Logo de la tienda en esquina superior izquierda */}
                    <div className="absolute top-3 left-3 z-10">
                        <div className="w-12 h-12 bg-white rounded-2xl shadow-lg flex items-center justify-center border border-slate-200 overflow-hidden">
                            {restaurant?.logoUrl
                                ? <img src={restaurant.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                                : <Store className="w-6 h-6 text-slate-700" />}
                        </div>
                    </div>
                </div>

                <div className="px-4 -mt-4 relative z-10 space-y-4 max-w-lg mx-auto">
                    {/* Tarjeta de Éxito y Calificación al Finalizar */}
                    {isDelivered ? (
                        <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-emerald-500/30 text-center space-y-4">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-md">
                                <CheckCircle2 className="w-9 h-9" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">¡Pedido Entregado con Éxito!</h3>
                                <p className="text-sm font-medium text-slate-500 mt-1">Esperamos que disfrutes tu compra. ¿Cómo fue tu experiencia?</p>
                            </div>

                            <button
                                onClick={() => setShowReviewModal(true)}
                                className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl hover:scale-[1.01] active:scale-98 transition-all flex items-center justify-center gap-2 text-base shadow-xl shadow-primary/20"
                            >
                                <Star className="w-5 h-5" /> Calificar Tienda y Repartidor
                            </button>

                            <button
                                onClick={() => navigate('/')}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl text-xs transition-colors"
                            >
                                Volver al Inicio
                            </button>
                        </div>
                    ) : (
                        /* Datos del Repartidor Asignado */
                        <>
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Datos del Repartidor</p>
                                <div className="flex items-center gap-3.5">
                                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-700 border border-slate-200 shrink-0">
                                        <Motorbike className="w-7 h-7" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-base text-slate-900 truncate">{driverName}</p>
                                        <p className="text-xs font-bold text-emerald-600 uppercase">
                                            {transportRequest?.status === 'in_progress' ? '🚴 En camino a tu dirección'
                                                : transportRequest?.status === 'arriving' ? '🏪 Llegando a la tienda'
                                                : '🚀 Asignado al viaje'}
                                        </p>
                                    </div>
                                    {driverPhone && (
                                        <a
                                            href={`tel:${driverPhone}`}
                                            className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100 active:scale-95 transition-transform shrink-0"
                                            title="Llamar al repartidor"
                                        >
                                            <Phone className="w-5 h-5" />
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Resumen del Destino */}
                            <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 flex items-start gap-3 text-xs">
                                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold text-slate-400 uppercase tracking-wider block">Entregando en</span>
                                    <p className="font-black text-slate-800 text-sm">{order.deliveryAddress || order.address?.name}</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // ── Render Principal ─────────────────────────────────────────────────────
    return (
        <div className="w-full h-full overflow-hidden relative bg-slate-50">
            <AnimatePresence mode="wait">
                <motion.div
                    key={`step-${currentStep}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                    className="w-full h-full"
                >
                    {currentStep === 1 && renderStep1()}
                    {currentStep === 2 && renderStep2()}
                    {currentStep === 3 && renderStep3()}
                    {currentStep === 4 && renderStep4()}
                </motion.div>
            </AnimatePresence>

            {/* Botón Flotante para abrir Chat */}
            <ChatFAB />

            {/* Chat en Pantalla Completa */}
            <ChatOverlay />

            {/* Modal de Pago Móvil con Copiado Rápido */}
            <PagoMovilDataModal />

            {/* Modal de Calificación */}
            <ReviewModal
                isOpen={showReviewModal}
                onClose={() => setShowReviewModal(false)}
                restaurantId={order.restaurantId || order.restaurant_id}
                orderId={orderId!}
                orderInfo={order}
                onReviewSubmitted={() => setShowReviewModal(false)}
            />
        </div>
    );
}
