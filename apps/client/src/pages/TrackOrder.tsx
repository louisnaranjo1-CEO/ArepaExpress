import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DeliveryDriver } from '../lib/delivery-service';
import {
    Navigation, Clock, CheckCircle2, Bike, Motorbike, MapPin, Phone, ArrowLeft,
    Store, Star, Wallet, X, Loader2, Upload, AlertCircle, Copy,
    ChevronRight, Package, CreditCard, CheckCircle, Check, Radio,
    Car, MessageSquare, Image as ImageIcon, Sparkles, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useCurrency } from '../context/CurrencyContext';
import ReviewModal from '../components/ReviewModal';
import DualPrice from '../components/DualPrice';
import OrderChatWindow from '../components/chat/OrderChatWindow';
import RideChat from '../components/RideChat';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, useGoogleMapsResilience } from '../lib/mapsConfig';
import LiveTripMap from '../components/LiveTripMap';


const mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: 'greedy'
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
        if (['in_progress', 'arriving', 'completed', 'accepted'].includes(transportRequest.status)) {
            return 4;
        }
    }
    if (['in_transit', 'delivering', 'en_camino', 'on_way', 'delivered', 'completed'].includes(order?.status)) {
        return 4;
    }
    if (order?.driver_id || order?.delivery_driver_id) {
        return 4;
    }

    // Paso 3: Selección de repartidor o preparación (pago verificado/confirmado)
    if (transportRequest?.status === 'searching') return 3;
    if (
        [
            'awaiting_delivery_driver',
            'buscando_piloto',
            'finding_driver',
            'driver_assigned',
            'preparing',
            'ready',
            'paid',
            'payment_confirmed',
            'awaiting_delivery_payment',
            'verificando_pago_delivery'
        ].includes(order?.status) ||
        order?.payment_status === 'paid' ||
        order?.payment_status === 'approved' ||
        order?.restaurant_payment_client_confirmed ||
        order?.restaurantPaymentClientConfirmed
    ) {
        return 3;
    }

    // Paso 2: Pago al negocio (stock verificado o comprobante reportado)
    if (
        ['awaiting_payment', 'pending_verification', 'pendiente_pago'].includes(order?.status) ||
        order?.stock_confirmed ||
        order?.stockConfirmed
    ) {
        return 2;
    }

    // Paso 1: Confirmación de stock pendiente o acción requerida
    return 1;
}

const STEP_LABELS = ['Confirmación', 'Pago', 'Envío', 'En camino'];

const StepProgressHeader: React.FC<{ currentStep: number }> = ({ currentStep }) => (
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

export default function TrackOrder() {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: GOOGLE_MAPS_LIBRARIES
    });
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const hasMapError = useGoogleMapsResilience(mapContainerRef, loadError);


    const { orderId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Auto-open chat if ?chat=true is passed (e.g. from Mis Pedidos / Pedidos Recientes)
    useEffect(() => {
        if (searchParams.get('chat') === 'true') {
            setShowChat(true);
            setHasUnreadChat(false);
        }
    }, [searchParams]);

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
    const [hasUnreadChat, setHasUnreadChat] = useState(true);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [showPagoMovilModal, setShowPagoMovilModal] = useState(false);

    const openChat = () => {
        setShowChat(true);
        setHasUnreadChat(false);
    };

    // ── Step 2 Payment State ─────────────────────────────────────────────────
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
    const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // ── Step 3 Delivery Selection State ──────────────────────────────────────
    const [deliverySettings, setDeliverySettings] = useState<any>(null);
    const [selectedVehicle, setSelectedVehicle] = useState<'moto' | 'carro' | 'ejecutivo'>('moto');
    const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);
    const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

    // ── Kitchen Preparation Clock State (Pilar 2) ───────────────────────────
    const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
    const [totalPrepSeconds, setTotalPrepSeconds] = useState<number>(1200);

    // ── Directions & Game-style Smooth Interpolation State (Pilar 4) ────────
    const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
    const [interpolatedPos, setInterpolatedPos] = useState<{ lat: number; lng: number } | null>(null);
    const [vehicleBearing, setVehicleBearing] = useState<number>(0);
    const animFrameRef = useRef<number | null>(null);
    const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);
    const targetPosRef = useRef<{ lat: number; lng: number } | null>(null);
    const routeCalculatedRef = useRef<boolean>(false);

    // ── Kitchen Countdown Ticker (Pilar 2) ──────────────────────────────────
    useEffect(() => {
        if (!order?.estimated_ready_at) return;
        const target = new Date(order.estimated_ready_at).getTime();
        const prepMins = Number(order.preparation_time_minutes || 20);
        setTotalPrepSeconds(prepMins * 60);

        const updateTimer = () => {
            const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
            setCountdownSeconds(diff);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [order?.estimated_ready_at, order?.preparation_time_minutes]);

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

    // ── Fetch available drivers for client-paid delivery ────────────────────
    useEffect(() => {
        const fetchDriversList = async () => {
            try {
                const { data } = await supabase
                    .from('drivers')
                    .select('id, full_name, phone, vehicle_type, vehicle_brand, vehicle_model, vehicle_plate, vehicle_image_url, rating, is_online, city')
                    .eq('is_online', true);
                if (data && data.length > 0) {
                    const ids = data.map((d: any) => d.id);
                    const { data: profs } = await supabase
                        .from('profiles')
                        .select('id, photo_url')
                        .in('id', ids);
                    const profMap = new Map((profs || []).map((p: any) => [p.id, p.photo_url]));
                    setAvailableDrivers(data.map((d: any) => ({
                        ...d,
                        photo_url: profMap.get(d.id) || d.vehicle_image_url || null
                    })));
                }
            } catch (e) {
                console.warn("Could not fetch available drivers for client:", e);
            }
        };
        fetchDriversList();
    }, []);

    // ── Data Fetching + Realtime Subscriptions ───────────────────────────────
    useEffect(() => {
        if (!orderId) return;

        supabase.from('app_settings').select('*').eq('id', 'delivery_settings').maybeSingle().then(({ data }) => {
            if (data) setDeliverySettings(data);
        });

        const fetchDriverData = async (dId: string) => {
            if (!dId) return;
            const { data: dData } = await supabase.from('delivery_drivers').select('*').eq('id', dId).maybeSingle();
            if (dData) {
                setDriver({ id: dData.id, ...dData } as DeliveryDriver);
            } else {
                const { data: driverRow } = await supabase.from('drivers').select('*').eq('id', dId).maybeSingle();
                if (driverRow) {
                    setDriver({
                        id: driverRow.id,
                        name: driverRow.full_name || 'Conductor',
                        displayName: driverRow.full_name,
                        phone: driverRow.phone,
                        vehicle_type: driverRow.vehicle_type,
                        vehicle_brand: driverRow.vehicle_brand,
                        vehicle_model: driverRow.vehicle_model,
                        vehicle_plate: driverRow.vehicle_plate,
                        rating: driverRow.rating || 5.0,
                        photo_url: driverRow.vehicle_image_url
                    } as any);
                }
            }
        };

        // 1. Fetch Order and Store
        supabase.from('orders').select('*').eq('id', orderId).maybeSingle().then(async ({ data: orderData }) => {
            if (orderData) {
                setOrder(orderData);
                const rId = orderData.restaurantId || orderData.restaurant_id;
                if (rId) {
                    const { data: rData } = await supabase.from('comercios').select('*').eq('id', rId).maybeSingle();
                    if (rData) setRestaurant({ id: rData.id, ...rData });
                }
                const assignedDriver = orderData.driver_id || orderData.delivery_driver_id;
                if (assignedDriver) fetchDriverData(assignedDriver);
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
                        const assignedDriver = orderData.driver_id || orderData.delivery_driver_id;
                        if (assignedDriver) fetchDriverData(assignedDriver);
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
                if (dId) fetchDriverData(dId);
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
                        if (dId) fetchDriverData(dId);
                    }
                }).subscribe();

        // 5. Realtime Messages for Unread Badge
        const messagesChannel = supabase.channel(`tr_messages_badge_${orderId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` },
                (payload) => {
                    const newMsg = payload.new as any;
                    if (newMsg && newMsg.sender_role !== 'client') {
                        setHasUnreadChat(true);
                    }
                }).subscribe();

        return () => {
            supabase.removeChannel(orderChannel);
            supabase.removeChannel(transportChannel);
            supabase.removeChannel(messagesChannel);
        };
    }, [orderId, order?.transport_request_id]);

    // ── Driver GPS Tracking & Realtime Updates (Pilar 4) ────────────────────
    useEffect(() => {
        const driverId = transportRequest?.driver_id || transportRequest?.driverId || order?.driver_id || order?.delivery_driver_id || (order as any)?.assigned_driver_id;
        if (!driverId) return;

        const updateFromCoords = (latRaw: any, lngRaw: any) => {
            const lat = Number(latRaw);
            const lng = Number(lngRaw);
            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                setDriverLocation({ lat, lng });
            }
        };

        // 1. Check drivers table current_location first (where driver apps stream GPS coordinates)
        supabase.from('drivers').select('current_location, current_heading, vehicle_type').eq('id', driverId).maybeSingle().then(({ data }) => {
            if (data?.current_location) {
                const loc = data.current_location as any;
                updateFromCoords(loc.latitude ?? loc.lat, loc.longitude ?? loc.lng);
            }
            if (data?.current_heading !== undefined && data?.current_heading !== null) {
                setVehicleBearing(Number(data.current_heading));
            }
        });

        // 2. Also check driver_locations table
        supabase.from('driver_locations').select('*').eq('driver_id', driverId).maybeSingle().then(({ data }) => {
            if (data) {
                updateFromCoords(data.latitude ?? data.lat, data.longitude ?? data.lng);
            }
        });

        // Realtime subscription on drivers table
        const driverChangesChannel = supabase.channel(`driver_table_loc_${driverId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driverId}` },
                (payload) => {
                    const d = payload.new as any;
                    if (d?.current_location) {
                        const loc = d.current_location;
                        updateFromCoords(loc.latitude ?? loc.lat, loc.longitude ?? loc.lng);
                    }
                    if (d?.current_heading !== undefined && d?.current_heading !== null) {
                        setVehicleBearing(Number(d.current_heading));
                    }
                })
            .subscribe();

        // Realtime subscription on driver_locations table
        const locChannel = supabase.channel(`driver_loc_${driverId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
                (payload) => {
                    if (payload.new) {
                        const data = payload.new as any;
                        updateFromCoords(data.latitude ?? data.lat, data.longitude ?? data.lng);
                    }
                })
            .subscribe();

        return () => { 
            supabase.removeChannel(driverChangesChannel);
            supabase.removeChannel(locChannel); 
        };
    }, [transportRequest?.driver_id, transportRequest?.driverId, order?.driver_id, order?.delivery_driver_id, (order as any)?.assigned_driver_id]);

    // ── Smooth 60fps Game-Style Vehicle Movement Interpolation (Pilar 4) ────
    useEffect(() => {
        if (!driverLocation) return;
        targetPosRef.current = { lat: driverLocation.lat, lng: driverLocation.lng };

        if (!currentPosRef.current) {
            currentPosRef.current = { lat: driverLocation.lat, lng: driverLocation.lng };
            setInterpolatedPos({ lat: driverLocation.lat, lng: driverLocation.lng });
            return;
        }

        const animateVehicle = () => {
            if (!currentPosRef.current || !targetPosRef.current) return;
            const cur = currentPosRef.current;
            const tgt = targetPosRef.current;

            const dLat = tgt.lat - cur.lat;
            const dLng = tgt.lng - cur.lng;
            const dist = Math.hypot(dLat, dLng);

            if (dist > 0.000002) {
                // Calculate rotation heading (degrees)
                const y = Math.sin((dLng * Math.PI) / 180) * Math.cos((tgt.lat * Math.PI) / 180);
                const x =
                    Math.cos((cur.lat * Math.PI) / 180) * Math.sin((tgt.lat * Math.PI) / 180) -
                    Math.sin((cur.lat * Math.PI) / 180) * Math.cos((tgt.lat * Math.PI) / 180) * Math.cos((dLng * Math.PI) / 180);
                const brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
                setVehicleBearing(brng);

                // Interpolate smoothly (lerp 0.08)
                cur.lat += dLat * 0.08;
                cur.lng += dLng * 0.08;
                setInterpolatedPos({ lat: cur.lat, lng: cur.lng });
                animFrameRef.current = requestAnimationFrame(animateVehicle);
            } else {
                cur.lat = tgt.lat;
                cur.lng = tgt.lng;
                setInterpolatedPos({ lat: tgt.lat, lng: tgt.lng });
            }
        };

        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(animateVehicle);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [driverLocation?.lat, driverLocation?.lng]);

    // ── User Geolocation (Stabilized) ──────────────────────────────────────
    useEffect(() => {
        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => console.warn('Initial geolocation warning:', err),
            { enableHighAccuracy: true, timeout: 10000 }
        );

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const newLat = pos.coords.latitude;
                const newLng = pos.coords.longitude;
                setUserLocation(prev => {
                    if (!prev) return { lat: newLat, lng: newLng };
                    const dLat = Math.abs(prev.lat - newLat);
                    const dLng = Math.abs(prev.lng - newLng);
                    if (dLat > 0.00015 || dLng > 0.00015) {
                        return { lat: newLat, lng: newLng };
                    }
                    return prev;
                });
            },
            (err) => console.warn('Geolocation watch warning:', err),
            { enableHighAccuracy: true, maximumAge: 5000 }
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

    // Cambiar a Retiro en Local (PickUp)
    const handleSwitchToPickup = async () => {
        if (!orderId || !order) return;
        try {
            // Cancel active transport request if any
            if (transportRequest?.id || order.transport_request_id) {
                const trId = transportRequest?.id || order.transport_request_id;
                await supabase.from('transport_requests').update({
                    status: 'cancelled',
                    canceled_at: new Date().toISOString(),
                    canceled_by: 'client',
                    cancel_reason: 'Cliente cambió a retiro en local (PickUp)'
                }).eq('id', trId);
                setTransportRequest(null);
            }

            const pickupTotal = Number(order.subtotal || order.total || 0);
            const nextStatus = (order.status === 'buscando_piloto' || order.status === 'awaiting_delivery_driver' || order.status === 'awaiting_delivery_payment')
                ? 'ready'
                : (order.status || 'ready');

            const { error: ordErr } = await supabase.from('orders').update({
                delivery_method: 'pickup',
                delivery_fee: 0,
                total: pickupTotal,
                status: nextStatus,
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            if (ordErr) throw ordErr;

            // Actualizar estado local inmediatamente
            setOrder((prev: any) => prev ? ({
                ...prev,
                delivery_method: 'pickup',
                deliveryMethod: 'pickup',
                delivery_fee: 0,
                deliveryFee: 0,
                total: pickupTotal,
                status: nextStatus,
                transport_request_id: null,
                driver_id: null,
                delivery_driver_id: null
            }) : prev);

            await supabase.from('messages').insert({
                order_id: orderId,
                text: '🏪 He seleccionado RETIRO EN LOCAL (PickUp). Preparar pedido para entregar en tienda.',
                sender_id: user?.uid || user?.id || 'guest',
                sender_name: order.userName || 'Cliente',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });

            toast.success('Cambiado a Retiro en Local (PickUp)', { icon: '🏪' });
        } catch (error: any) {
            console.error('Error switching to pickup:', error);
            toast.error('Error al cambiar a PickUp: ' + (error?.message || 'Intente nuevamente'));
        }
    };

    // Cambiar de PickUp a Pedir Repartidor
    const handleSwitchToDelivery = async () => {
        if (!orderId || !order) return;
        try {
            const nextStatus = 'awaiting_delivery_driver';
            const { error: ordErr } = await supabase.from('orders').update({
                delivery_method: 'app_delivery',
                status: nextStatus,
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            if (ordErr) throw ordErr;

            setOrder((prev: any) => prev ? ({
                ...prev,
                delivery_method: 'app_delivery',
                deliveryMethod: 'app_delivery',
                status: nextStatus
            }) : prev);

            toast.success('Cambiado a Envío con Repartidor', { icon: '🛵' });
        } catch (error: any) {
            console.error('Error switching to delivery:', error);
            toast.error('Error al cambiar a delivery');
        }
    };

    // Paso 3: Confirmar y Solicitar Repartidor (Delivery nativo con matching a driver o radar general)
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

            // Garantizar coordenadas válidas con fallback para evitar error Invalid LatLng en app conductor
            const rLat = Number(restaurant?.location?.coords?.lat ?? restaurant?.lat ?? restaurant?.latitude);
            const rLng = Number(restaurant?.location?.coords?.lng ?? restaurant?.lng ?? restaurant?.longitude);
            const hasRestCoords = !isNaN(rLat) && !isNaN(rLng) && rLat !== 0;

            const dLat = Number(order?.deliveryCoords?.lat ?? order?.address?.coords?.lat ?? order?.address?.latitude ?? userLocation?.lat);
            const dLng = Number(order?.deliveryCoords?.lng ?? order?.address?.coords?.lng ?? order?.address?.longitude ?? userLocation?.lng);
            const hasDestCoords = !isNaN(dLat) && !isNaN(dLng) && dLat !== 0;

            const originLat = hasRestCoords ? rLat : (userLocation?.lat || 8.9242);
            const originLng = hasRestCoords ? rLng : (userLocation?.lng || -67.4293);
            const destLat = hasDestCoords ? dLat : (originLat + 0.005);
            const destLng = hasDestCoords ? dLng : (originLng + 0.005);

            const originData = {
                address: restaurant?.address || restaurant?.location?.address || order.restaurantName || 'Comercio',
                lat: originLat,
                lng: originLng,
                coords: { lat: originLat, lng: originLng },
                name: restaurant?.name || order.restaurantName || 'Negocio',
                details: 'Retiro de pedido de comida'
            };

            const destinationData = {
                address: order.deliveryAddress || order.address?.name || 'Dirección del cliente',
                lat: destLat,
                lng: destLng,
                coords: { lat: destLat, lng: destLng },
                name: order.userName || 'Cliente',
                details: order.address?.reference || order.orderNote || ''
            };

            const transportId = crypto.randomUUID();
            const clientAuthId = order.user_id || order.userId || user?.id || user?.uid || null;

            const transportData: any = {
                id: transportId,
                order_id: orderId,
                restaurant_id: order.restaurantId || order.restaurant_id || null,
                restaurant_name: restaurant?.name || order.restaurantName || null,
                items_summary: itemsSummary,
                type: 'food_delivery',
                service_category: 'food_delivery',
                status: 'searching',
                user_id: clientAuthId,
                user_name: order.userName || 'Cliente',
                user_phone: order.userPhone || user?.phoneNumber || '',
                user_cedula: order.userCedula || '',
                origin: originData,
                destination: destinationData,
                vehicle_type: selectedVehicle,
                price: deliveryFee,
                total: deliveryFee,
                driver_payout: deliveryFee * 0.8,
                commission_amount: deliveryFee * 0.2,
                payment_method: 'Transferencia/Pago Móvil',
                package_description: `Entrega de pedido: ${itemsSummary}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                assigned_driver_id: selectedDriverId || null,
                preferred_driver_id: selectedDriverId || null,
                driver_id: selectedDriverId || null
            };

            // 1. Insertar solicitud de transporte en Supabase
            const { error: trError } = await supabase.from('transport_requests').insert(transportData);
            if (trError) {
                console.error("Error creating transport request:", trError);
                throw trError;
            }

            // 2. Actualizar la orden en Supabase
            const orderUpdates: any = {
                transport_request_id: transportId,
                delivery_fee: deliveryFee,
                status: 'buscando_piloto',
                updated_at: new Date().toISOString()
            };
            if (selectedDriverId) {
                orderUpdates.preferred_driver_id = selectedDriverId;
                orderUpdates.eligible_drivers = [selectedDriverId];
                orderUpdates.delivery_driver_id = selectedDriverId;
            } else {
                orderUpdates.preferred_driver_id = null;
                orderUpdates.eligible_drivers = null;
            }

            const { error: ordError } = await supabase.from('orders').update(orderUpdates).eq('id', orderId);
            if (ordError) {
                console.error("Error updating order:", ordError);
                throw ordError;
            }

            localStorage.setItem('active_transport_req_id', transportId);
            localStorage.setItem('active_order_id', orderId);

            // Actualizar estado local inmediatamente
            setOrder((prev: any) => prev ? ({
                ...prev,
                transport_request_id: transportId,
                delivery_fee: deliveryFee,
                deliveryFee: deliveryFee,
                vehicleType: selectedVehicle,
                status: 'buscando_piloto',
                ...(selectedDriverId ? {
                    preferred_driver_id: selectedDriverId,
                    eligible_drivers: [selectedDriverId],
                    delivery_driver_id: selectedDriverId
                } : {})
            }) : prev);

            setTransportRequest({
                id: transportId,
                ...transportData
            });

            // 3. Notificar en chat
            const selectedDriverObj = availableDrivers.find(d => d.id === selectedDriverId);
            const driverMsg = selectedDriverObj 
                ? ` con solicitud directa asignada a ${selectedDriverObj.full_name}`
                : ' en radar general';

            await supabase.from('messages').insert({
                order_id: orderId,
                text: `🛵 *Delivery Solicitado:* Vehículo: ${selectedVehicle.toUpperCase()} · Tarifa: $${deliveryFee.toFixed(2)}${driverMsg}.`,
                sender_id: user?.uid || user?.id || 'guest',
                sender_name: order.userName || 'Cliente',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });

            toast.success(
                selectedDriverObj
                    ? `¡Solicitud enviada directamente a ${selectedDriverObj.full_name}!`
                    : '¡Buscando repartidor para tu entrega!',
                { icon: '🛵' }
            );
        } catch (error: any) {
            console.error('Error requesting delivery:', error);
            toast.error('Error al solicitar repartidor: ' + (error?.message || 'Intenta de nuevo'));
        } finally {
            setIsSubmittingDelivery(false);
        }
    };

    // Fase 3.2: Confirmación de Retiro en Tienda por el Cliente ("Retiré mi pedido")
    const handleClientCompletedPickup = async () => {
        try {
            await supabase.from('orders').update({
                status: 'completed',
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            localStorage.removeItem('active_order_id');
            setOrder((prev: any) => prev ? ({ ...prev, status: 'completed' }) : prev);

            // Asignar puntos de fidelización
            if (user?.id && !order.points_credited && !order.pointsCredited) {
                const orderTotal = Number(order.total || itemsTotal || 10);
                const pointsEarned = Math.round(orderTotal * 2.5);
                try {
                    const { data: prof } = await supabase.from('profiles').select('points').eq('id', user.id).maybeSingle();
                    const currentPts = prof?.points || 0;
                    await supabase.from('profiles').update({ points: currentPts + pointsEarned }).eq('id', user.id);
                    await supabase.from('orders').update({ points_credited: true }).eq('id', orderId);
                    toast.success(`✨ ¡Ganaste +${pointsEarned} puntos por tu compra!`);
                } catch (ptsErr) {
                    console.warn("Points error:", ptsErr);
                }
            }

            await supabase.from('messages').insert({
                order_id: orderId,
                text: '🎉 *¡Pedido Retirado!* El cliente ha confirmado el retiro de su mercancía en la tienda. Venta completada exitosamente.',
                sender_id: user?.uid || user?.id || 'guest',
                sender_name: order.userName || 'Cliente',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });

            toast.success('¡Venta completada! Has retirado tu pedido y recibido tus puntos.');
            setShowReviewModal(true);
        } catch (e) {
            console.error(e);
            toast.error('Error al registrar retiro de pedido');
        }
    };

    // Fase 6.2: Solicitar Asistencia al Negocio cuando no hay conductor
    const handleRequestBusinessLogisticsHelp = async () => {
        try {
            await supabase.from('messages').insert({
                order_id: orderId,
                text: '🚨 *ASISTENCIA LOGÍSTICA SOLICITADA:* La comida está lista pero no se han encontrado conductores disponibles en la zona tras varios intentos. ¿Podrías apoyarme con un delivery propio o coordinamos retiro en tienda?',
                sender_id: user?.uid || user?.id || 'guest',
                sender_name: order.userName || 'Cliente',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });
            toast.success('Mensaje de asistencia enviado a la tienda', { icon: '🚨' });
            openChat();
        } catch (e) {
            toast.error('Error al solicitar asistencia');
        }
    };

    // Fase 6.2: Cancelar conductor y seleccionar uno nuevo
    const handleCancelDriverSearchAndRetry = async () => {
        try {
            if (order.transport_request_id) {
                await supabase.from('transport_requests').update({
                    status: 'cancelled',
                    canceled_at: new Date().toISOString(),
                    canceled_by: 'client',
                    cancel_reason: 'Cliente reinició búsqueda',
                    updated_at: new Date().toISOString()
                }).eq('id', order.transport_request_id);
            }
            await supabase.from('orders').update({
                status: 'ready',
                transport_request_id: null,
                driver_id: null,
                delivery_driver_id: null,
                preferred_driver_id: null,
                eligible_drivers: null,
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            setOrder((prev: any) => prev ? ({
                ...prev,
                status: 'ready',
                transport_request_id: null,
                driver_id: null,
                delivery_driver_id: null,
                preferred_driver_id: null,
                eligible_drivers: null
            }) : prev);
            setTransportRequest(null);
            setSelectedDriverId(null);
            localStorage.removeItem('active_transport_req_id');

            await supabase.from('messages').insert({
                order_id: orderId,
                text: '🔄 El cliente canceló la búsqueda del conductor actual para seleccionar uno nuevo o cambiar método.',
                sender_id: user?.uid || user?.id || 'guest',
                sender_name: order.userName || 'Cliente',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });

            toast.success('Búsqueda reiniciada. Puedes escoger otro vehículo o método.');
        } catch (e) {
            toast.error('Error al reiniciar búsqueda de conductor');
        }
    };

    // ── Derived Data & Computations ──────────────────────────────────────────
    const [forcedStep, setForcedStep] = useState<number | null>(null);
    const currentStep = forcedStep ?? getFlowStep(order, transportRequest);
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

    const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

    // Calcular distancia y coordenadas tienda -> cliente con fallbacks robustos
    const rLat = Number(restaurant?.location?.coords?.lat ?? restaurant?.coords?.lat ?? restaurant?.lat ?? restaurant?.locations?.[0]?.coords?.lat);
    const rLng = Number(restaurant?.location?.coords?.lng ?? restaurant?.coords?.lng ?? restaurant?.lng ?? restaurant?.locations?.[0]?.coords?.lng);
    const hasRestCoords = !isNaN(rLat) && !isNaN(rLng) && rLat !== 0;

    const dLat = Number(order?.delivery_coords?.lat ?? order?.deliveryCoords?.lat ?? order?.shipping_address?.lat ?? order?.address?.coords?.lat ?? userLocation?.lat);
    const dLng = Number(order?.delivery_coords?.lng ?? order?.deliveryCoords?.lng ?? order?.shipping_address?.lng ?? order?.address?.coords?.lng ?? userLocation?.lng);
    const hasDestCoords = !isNaN(dLat) && !isNaN(dLng) && dLat !== 0;

    const originCoords: { lat: number; lng: number } = hasRestCoords 
        ? { lat: rLat, lng: rLng } 
        : (hasDestCoords ? { lat: dLat - 0.006, lng: dLng - 0.006 } : { lat: 8.9288, lng: -67.4253 });

    const destCoords: { lat: number; lng: number } = hasDestCoords 
        ? { lat: dLat, lng: dLng } 
        : { lat: 8.9327, lng: -67.4268 };

    const calculatedDistance = calculateDistanceKm(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng) || Number(order?.distance || 2.5);

    const mapCenter = (driverLocation && !isNaN(driverLocation.lat))
        ? driverLocation
        : destCoords;

    const onMapLoad = useCallback((map: google.maps.Map) => {
        setMapInstance(map);
        if (window.google) {
            const bounds = new window.google.maps.LatLngBounds();
            bounds.extend(originCoords);
            bounds.extend(destCoords);
            if (driverLocation) bounds.extend(driverLocation);
            map.fitBounds(bounds, { top: 90, bottom: 260, left: 40, right: 40 });
        }
    }, [originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng, driverLocation?.lat, driverLocation?.lng]);

    // Re-centrar y ajustar bounds dinámicamente cuando el driver se mueve
    useEffect(() => {
        if (!mapInstance || !window.google) return;
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(originCoords);
        bounds.extend(destCoords);
        if (driverLocation) bounds.extend(driverLocation);
        mapInstance.fitBounds(bounds, { top: 90, bottom: 260, left: 40, right: 40 });
    }, [mapInstance, driverLocation?.lat, driverLocation?.lng, directionsResult]);

    // ── Single Route Calculation (google-maps-optimizer) ─────────────────────
    useEffect(() => {
        if (!isLoaded || !window.google || !originCoords || !destCoords || routeCalculatedRef.current) return;
        routeCalculatedRef.current = true;

        const directionsService = new window.google.maps.DirectionsService();
        directionsService.route(
            {
                origin: originCoords,
                destination: destCoords,
                travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK && result) {
                    setDirectionsResult(result);
                } else {
                    console.warn("Directions request error:", status);
                }
            }
        );
    }, [isLoaded, originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng]);

    // ── Helper: 3D Vehicle Marker SVG Generator with Headlight and Pulse ───
    const getVehicleSvgDataUri = (vType: string = 'moto', bearing: number = 0) => {
        const isConfort = vType === 'confort' || vType === 'ejecutivo';
        const isCarro = vType === 'carro' || vType === 'taxi';
        const primaryColor = isConfort ? '#9333EA' : isCarro ? '#2563EB' : '#F59E0B';

        let vehicleGraphic = '';

        if (!isConfort && !isCarro) {
            // 🛵 3D Top-Down Mototaxi with Driver, Helmet & Delivery Box
            vehicleGraphic = `
                <!-- Headlight beam -->
                <polygon points="34,20 10,-4 58,-4" fill="url(#headlightBeam)"/>
                <!-- Front tire -->
                <rect x="31" y="8" width="6" height="14" rx="3" fill="#1E293B"/>
                <!-- Front fork & fender -->
                <rect x="29" y="16" width="10" height="4" rx="2" fill="#F59E0B"/>
                <!-- Handlebars -->
                <line x1="20" y1="20" x2="48" y2="20" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="19" cy="20" r="2" fill="#F59E0B"/>
                <circle cx="49" cy="20" r="2" fill="#F59E0B"/>
                <line x1="17" y1="18" x2="20" y2="20" stroke="#64748B" stroke-width="1.5"/>
                <line x1="51" y1="18" x2="48" y2="20" stroke="#64748B" stroke-width="1.5"/>
                <!-- Moto Main Frame -->
                <ellipse cx="34" cy="35" rx="6.5" ry="16" fill="#0F172A" stroke="#F59E0B" stroke-width="1.5"/>
                <!-- Driver Shoulders & Jacket -->
                <ellipse cx="34" cy="30" rx="9" ry="5.5" fill="#1E293B"/>
                <!-- Driver Helmet with Visor -->
                <circle cx="34" cy="28" r="6" fill="#F59E0B"/>
                <path d="M 30 25 Q 34 22 38 25" stroke="#0F172A" stroke-width="3" fill="none" stroke-linecap="round"/>
                <ellipse cx="34" cy="25" rx="3.5" ry="1.5" fill="#38BDF8"/>
                <!-- Delivery Thermal Box -->
                <rect x="26" y="38" width="16" height="15" rx="3" fill="#F59E0B" stroke="#B45309" stroke-width="1.5"/>
                <rect x="29" y="42" width="10" height="7" rx="1.5" fill="#D97706"/>
                <!-- Rear taillights -->
                <circle cx="28" cy="54" r="1.5" fill="#EF4444"/>
                <circle cx="40" cy="54" r="1.5" fill="#EF4444"/>
            `;
        } else if (isCarro) {
            // 🚗 3D Top-Down Taxi Económico
            vehicleGraphic = `
                <!-- Headlight beam -->
                <polygon points="34,16 6,-8 62,-8" fill="url(#headlightBeam)"/>
                <!-- 4 Wheels -->
                <rect x="18" y="14" width="4" height="9" rx="2" fill="#0F172A"/>
                <rect x="46" y="14" width="4" height="9" rx="2" fill="#0F172A"/>
                <rect x="18" y="42" width="4" height="9" rx="2" fill="#0F172A"/>
                <rect x="46" y="42" width="4" height="9" rx="2" fill="#0F172A"/>
                <!-- Side Mirrors -->
                <rect x="17" y="24" width="3" height="4" rx="1" fill="#2563EB"/>
                <rect x="48" y="24" width="3" height="4" rx="1" fill="#2563EB"/>
                <!-- Car Chassis -->
                <rect x="20" y="10" width="28" height="46" rx="8" fill="#1D4ED8" stroke="#60A5FA" stroke-width="1.5"/>
                <!-- Hood -->
                <path d="M 23 12 Q 34 10 45 12 L 44 21 Q 34 22 24 21 Z" fill="#2563EB"/>
                <!-- Windshield Front -->
                <path d="M 24 22 L 44 22 L 42 29 L 26 29 Z" fill="#0F172A"/>
                <line x1="27" y1="24" x2="33" y2="28" stroke="#93C5FD" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
                <!-- Roof with Taxi Light -->
                <rect x="25" y="29" width="18" height="15" rx="3" fill="#1E40AF"/>
                <rect x="29" y="34" width="10" height="4" rx="1.5" fill="#FEF08A" stroke="#CA8A04" stroke-width="1"/>
                <!-- Rear Window -->
                <path d="M 25 45 L 43 45 L 44 50 L 24 50 Z" fill="#0F172A"/>
                <!-- Headlights -->
                <ellipse cx="23" cy="11" rx="2" ry="1.5" fill="#FEF08A"/>
                <ellipse cx="45" cy="11" rx="2" ry="1.5" fill="#FEF08A"/>
                <!-- Taillights -->
                <rect x="22" y="55" width="5" height="1.5" rx="0.5" fill="#EF4444"/>
                <rect x="41" y="55" width="5" height="1.5" rx="0.5" fill="#EF4444"/>
            `;
        } else {
            // ✨ 3D Top-Down Carro Confort / Ejecutivo
            vehicleGraphic = `
                <!-- Headlight beam Xenon -->
                <polygon points="34,14 4,-12 64,-12" fill="url(#xenonBeam)"/>
                <!-- 4 Wheels -->
                <rect x="17" y="14" width="4.5" height="10" rx="2" fill="#090D16"/>
                <rect x="46.5" y="14" width="4.5" height="10" rx="2" fill="#090D16"/>
                <rect x="17" y="44" width="4.5" height="10" rx="2" fill="#090D16"/>
                <rect x="46.5" y="44" width="4.5" height="10" rx="2" fill="#090D16"/>
                <!-- Aerodynamic Mirrors -->
                <path d="M 18 24 L 16 26 L 18 27 Z" fill="#A855F7"/>
                <path d="M 50 24 L 52 26 L 50 27 Z" fill="#A855F7"/>
                <!-- Luxury Chassis -->
                <rect x="19" y="8" width="30" height="52" rx="9" fill="#581C87" stroke="#C084FC" stroke-width="1.5"/>
                <!-- Hood with Contours -->
                <path d="M 22 10 Q 34 8 46 10 L 45 22 Q 34 23 23 22 Z" fill="#6B21A8"/>
                <line x1="28" y1="12" x2="28" y2="20" stroke="#9333EA" stroke-width="1"/>
                <line x1="40" y1="12" x2="40" y2="20" stroke="#9333EA" stroke-width="1"/>
                <!-- Panoramic Tinted Glass Sunroof -->
                <rect x="23" y="23" width="22" height="26" rx="4" fill="#090D16" stroke="#A855F7" stroke-width="0.8"/>
                <line x1="25" y1="26" x2="35" y2="42" stroke="#E9D5FF" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
                <!-- Xenon LED Front Lightbar -->
                <line x1="22" y1="9" x2="46" y2="9" stroke="#E0E7FF" stroke-width="2" stroke-linecap="round"/>
                <circle cx="23" cy="9" r="1.5" fill="#60A5FA"/>
                <circle cx="45" cy="9" r="1.5" fill="#60A5FA"/>
                <!-- LED Rear Lightbar -->
                <line x1="22" y1="59" x2="46" y2="59" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/>
                <circle cx="34" cy="59" r="1" fill="#F87171"/>
            `;
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="68" viewBox="0 0 68 68">
          <defs>
            <radialGradient id="beaconGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.85"/>
              <stop offset="60%" stop-color="${primaryColor}" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="headlightBeam" x1="50%" y1="100%" x2="50%" y2="0%">
              <stop offset="0%" stop-color="#FEF08A" stop-opacity="0.85"/>
              <stop offset="100%" stop-color="#FEF08A" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="xenonBeam" x1="50%" y1="100%" x2="50%" y2="0%">
              <stop offset="0%" stop-color="#BAE6FD" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="#BAE6FD" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <circle cx="34" cy="34" r="32" fill="url(#beaconGlow)"/>
          <g transform="rotate(${bearing} 34 34)">
            ${vehicleGraphic}
          </g>
        </svg>`;
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    };

    const formatCountdown = (totalSec: number) => {
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

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

            <StepProgressHeader currentStep={currentStep} />

            <div className="px-4 pt-5 space-y-4 max-w-lg mx-auto">
                {/* Banner predeterminado Fase 2.1 */}
                <div className="bg-amber-50/95 border-2 border-amber-300 rounded-3xl p-4 flex items-start gap-3.5 text-amber-950 shadow-sm">
                    <div className="w-9 h-9 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertCircle className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold leading-relaxed">
                        Espera a que el negocio te asegure el stock de los productos antes de realizar tu pago. ¡Puedes escribirle primero!
                    </p>
                </div>

                {/* Botón Prominente: [Ir al Chat con la Tienda] */}
                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={openChat}
                    className="w-full bg-slate-900 text-white p-4 rounded-3xl shadow-xl shadow-slate-900/20 flex items-center justify-between group transition-all relative"
                >
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform relative">
                            <MessageSquare className="w-6 h-6" />
                            {hasUnreadChat && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-md animate-bounce">
                                    1
                                </span>
                            )}
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
    // PASO 2 — Pago al Negocio (Todo el flujo de pago se realiza en el Chat)
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

                <StepProgressHeader currentStep={currentStep} />

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
                                onClick={openChat}
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-sm shadow-md relative"
                            >
                                <MessageSquare className="w-4 h-4 text-primary" /> Abrir Chat con el Negocio
                                {hasUnreadChat && (
                                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-bounce">
                                        1
                                    </span>
                                )}
                            </button>
                        </div>
                    ) : (
                        /* Fase 2.1: Todo el proceso de pago se traslada al interior del Chat */
                        <>
                            {/* Llamado a la acción Principal: Pagar en el Chat */}
                            <motion.button
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={openChat}
                                className="w-full bg-primary text-slate-900 p-5 rounded-3xl shadow-xl shadow-primary/25 flex items-center justify-between border-2 border-primary group"
                            >
                                <div className="flex items-center gap-3.5">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-primary flex items-center justify-center shrink-0">
                                        <Wallet className="w-6 h-6" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-black text-base leading-tight">Completar Pago en el Chat</p>
                                        <p className="text-xs font-bold text-slate-700">Ver datos bancarios, copiar en 1 clic y adjuntar comprobante</p>
                                    </div>
                                </div>
                                <div className="w-9 h-9 rounded-full bg-slate-900/10 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                                    <ChevronRight className="w-5 h-5 text-slate-900" />
                                </div>
                            </motion.button>

                            {/* Instrucción explicativa */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-3">
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                                        <MessageSquare className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="font-black text-sm text-slate-900 leading-tight">Atención directa y segura</p>
                                        <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">
                                            Los datos de Pago Móvil oficiales y el formulario de comprobante se gestionan dentro de la conversación directa para garantizar la confirmación inmediata.
                                        </p>
                                    </div>
                                </div>
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
    // PASO 3 — Selección de Repartidor & Reloj de Preparación (Pilares 2 y 3)
    // ═══════════════════════════════════════════════════════════════════════════
    const renderStep3 = () => {
        const isBuscando = order.status === 'buscando_piloto' || transportRequest?.status === 'searching';
        const isFreeDelivery = order.free_delivery === true || restaurant?.free_delivery === true;
        const isKitchenPreparing = order.status === 'preparing' || (Boolean(order.estimated_ready_at) && countdownSeconds > 0);
        const isOrderReady = order.status === 'ready' || order.status === 'ready_for_pickup' || (!isKitchenPreparing && !isBuscando && order.status !== 'buscando_piloto');

        if (isPickup || order.delivery_method === 'pickup') {
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
                            <h1 className="text-base font-black text-slate-900 leading-tight">Retiro en Tienda</h1>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PickUp · Paso 3</p>
                        </div>
                    </div>
                    <StepProgressHeader currentStep={currentStep} />
                    <div className="px-4 pt-6 max-w-lg mx-auto text-center space-y-5">
                        {/* Selector de Opción de Retiro / Envío */}
                        <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-3 text-left">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">¿Cómo deseas recibir tu comida?</p>
                            <div className="grid grid-cols-2 gap-2.5">
                                <div className="p-3.5 rounded-2xl border-2 border-emerald-500 bg-emerald-50 text-slate-900 flex flex-col items-center gap-2 shadow-xs">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                                        <Store className="w-5 h-5" />
                                    </div>
                                    <div className="text-center">
                                        <span className="font-black text-xs block text-emerald-900">Buscar Pick Up</span>
                                        <span className="text-[10px] font-bold text-emerald-700">Activo ($0)</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleSwitchToDelivery}
                                    className="p-3.5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-white text-slate-700 flex flex-col items-center gap-2 transition-all active:scale-95"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                                        <Motorbike className="w-5 h-5" />
                                    </div>
                                    <div className="text-center">
                                        <span className="font-black text-xs block">Pedir Repartidor</span>
                                        <span className="text-[10px] font-bold text-slate-400">A tu dirección</span>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Kitchen Countdown Timer if preparing */}
                        {isKitchenPreparing && (
                            <div className="bg-gradient-to-br from-amber-500 via-amber-400 to-yellow-500 rounded-3xl p-5 text-slate-950 shadow-xl shadow-amber-500/20 text-left">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 bg-slate-950/15 rounded-2xl flex items-center justify-center">
                                            <Clock className="w-6 h-6 animate-spin text-slate-950" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-950/70">Reloj de Cocina</p>
                                            <h3 className="text-lg font-black leading-tight">Preparando tu Orden</h3>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-black font-mono bg-slate-950 text-amber-300 px-3 py-1 rounded-xl shadow-inner inline-block">
                                            {formatCountdown(countdownSeconds)}
                                        </div>
                                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-950/70 mt-0.5">Faltan aprox.</p>
                                    </div>
                                </div>
                                <div className="mt-3 w-full bg-slate-950/15 h-2 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-slate-950 rounded-full transition-all duration-1000"
                                        style={{ width: `${Math.min(100, Math.max(5, ((totalPrepSeconds - countdownSeconds) / Math.max(1, totalPrepSeconds)) * 100))}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                            <Store className="w-10 h-10" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900">Retiro en Tienda</h2>
                            <p className="text-sm font-medium text-slate-500 mt-1 max-w-xs mx-auto">
                                Acércate a la sucursal del comercio para retirar tus productos. Al tener tu compra en mano, presiona el botón inferior.
                            </p>
                        </div>

                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs text-left space-y-2">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Dirección de Retiro</p>
                            <p className="font-black text-base text-slate-900">{restaurant?.name}</p>
                            <p className="text-xs text-slate-500 font-bold">{restaurant?.address || restaurant?.location?.address || 'Dirección del comercio'}</p>
                        </div>

                        {/* Botón Fase 3.2: "Retiré mi pedido" */}
                        <button
                            onClick={handleClientCompletedPickup}
                            className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-700 active:scale-95 transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2 text-base"
                        >
                            <CheckCircle2 className="w-6 h-6" /> Retiré mi pedido
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
                        <h1 className="text-base font-black text-slate-900 leading-tight">
                            {isKitchenPreparing ? 'Cocina en Proceso' : 'Despacho de Pedido'}
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {isFreeDelivery ? 'Envío Gratis Patrocinado' : 'Entrega'} · Paso 3
                        </p>
                    </div>
                    {isFreeDelivery && (
                        <span className="bg-emerald-100 text-emerald-700 font-black text-[10px] px-2.5 py-1 rounded-full uppercase flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Envío Gratis
                        </span>
                    )}
                </div>

                <StepProgressHeader currentStep={currentStep} />

                <div className="px-4 pt-5 space-y-4 max-w-lg mx-auto">
                    {/* Pilar 2: Reloj de Preparación en Cocina */}
                    {isKitchenPreparing && (
                        <div className="bg-gradient-to-br from-amber-500 via-amber-400 to-yellow-500 rounded-3xl p-5 text-slate-950 shadow-xl shadow-amber-500/25 relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-slate-950/15 rounded-2xl flex items-center justify-center shrink-0">
                                        <Clock className="w-6 h-6 animate-spin text-slate-950" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-950/70">Reloj de Cocina en Vivo</p>
                                        <h3 className="text-xl font-black leading-tight">Preparando tu Pedido</h3>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-black font-mono tracking-tight bg-slate-950 text-amber-300 px-3.5 py-1.5 rounded-2xl shadow-inner inline-block">
                                        {formatCountdown(countdownSeconds)}
                                    </div>
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-950/70 mt-1">Tiempo Restante</p>
                                </div>
                            </div>
                            
                            <p className="text-xs text-slate-950/80 font-bold mt-3">
                                {countdownSeconds > 0 
                                    ? '👨‍🍳 La cocina está elaborando tus platillos. El repartidor será despachado al terminar.' 
                                    : '✨ ¡Tu comida está lista para ser despachada por el restaurante!'}
                            </p>

                            <div className="mt-3 w-full bg-slate-950/15 h-2 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-slate-950 rounded-full transition-all duration-1000"
                                    style={{ width: `${Math.min(100, Math.max(5, ((totalPrepSeconds - countdownSeconds) / Math.max(1, totalPrepSeconds)) * 100))}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Bloqueo Fase 3.2: El usuario tiene bloqueada la opción de pedir repartidor mientras está en cocina */}
                    {isKitchenPreparing ? (
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-200/80 text-center space-y-4">
                            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                                <Clock className="w-7 h-7 animate-spin" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Tu pedido se está preparando</h3>
                                <p className="text-xs font-bold text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                                    Te avisaremos cuando esté listo para que solicites tu repartidor.
                                </p>
                            </div>
                            <button
                                onClick={openChat}
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-sm shadow-md"
                            >
                                <MessageSquare className="w-4 h-4 text-primary" /> Abrir Chat con el Negocio
                            </button>
                        </div>
                    ) : isFreeDelivery ? (
                        /* Pilar 3: Caso Envío Gratis (El comercio asume el costo) */
                        <div className="bg-white rounded-3xl p-6 shadow-xs border-2 border-emerald-500/20 text-center space-y-4">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-md">
                                <Sparkles className="w-9 h-9" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">¡Tu Envío es 100% GRATIS!</h3>
                                <p className="text-xs font-bold text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                                    La tienda se hace cargo del transporte asignando a su conductor de confianza (Moto, Taxi Económico o Confort). No tendrás que pagar nada por el delivery.
                                </p>
                            </div>

                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center gap-2">
                                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                En cuanto el negocio despache al driver, se activará el mapa en vivo automáticamente.
                            </div>

                            <button
                                onClick={openChat}
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 active:scale-98 transition-all flex items-center justify-center gap-2 text-sm shadow-xl shadow-slate-900/20 relative"
                            >
                                <MessageSquare className="w-4 h-4 text-primary" /> Abrir Chat con la Tienda
                                {hasUnreadChat && (
                                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-bounce">
                                        1
                                    </span>
                                )}
                            </button>
                        </div>
                    ) : isBuscando ? (
                        /* Radar de Búsqueda Activo con Botones de Asistencia (Edge Case 6.2) */
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
                                    Hemos enviado la solicitud a los repartidores disponibles en la zona. Te notificaremos al instante al asignar uno.
                                </p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs font-bold text-slate-600">
                                Vehículo: <span className="font-black uppercase">{order.vehicleType || selectedVehicle}</span> · Distancia: {calculatedDistance} km
                            </div>

                            {/* Casos Extremos 6.2: Asistencia Logística o Cancelar y Buscar Nuevo */}
                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider text-center">¿Demora en encontrar conductor?</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <button
                                        onClick={handleRequestBusinessLogisticsHelp}
                                        className="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-black py-3 px-3 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
                                    >
                                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                        <span>Solicitar asistencia al negocio</span>
                                    </button>
                                    <button
                                        onClick={handleCancelDriverSearchAndRetry}
                                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-black py-3 px-3 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
                                    >
                                        <X className="w-4 h-4 text-slate-500 shrink-0" />
                                        <span>Cancelar y buscar nuevo</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Fase 3.2: Pedido Listo — Elección entre Pedir Repartidor o Buscar Pick Up */
                        <>
                            {/* Selector de Opción de Retiro / Envío */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">¿Cómo deseas recibir tu comida?</p>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <button
                                        type="button"
                                        onClick={handleSwitchToPickup}
                                        className="p-3.5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-white text-slate-800 flex flex-col items-center gap-2 transition-all active:scale-95"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                                            <Store className="w-5 h-5" />
                                        </div>
                                        <div className="text-center">
                                            <span className="font-black text-xs block">Buscar Pick Up</span>
                                            <span className="text-[10px] font-bold text-slate-400">Sin costo ($0)</span>
                                        </div>
                                    </button>

                                    <div className="p-3.5 rounded-2xl border-2 border-primary bg-primary/10 text-slate-900 flex flex-col items-center gap-2 shadow-xs">
                                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-primary flex items-center justify-center">
                                            <Motorbike className="w-5 h-5" />
                                        </div>
                                        <div className="text-center">
                                            <span className="font-black text-xs block">Pedir Repartidor</span>
                                            <span className="text-[10px] font-bold text-slate-600">A tu dirección</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Ruta precargada */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-4">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ruta de Entrega</p>
                                    <span className="text-xs font-black text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                                        {calculatedDistance} km de distancia
                                    </span>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                                        <Store className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Retiro (Tienda)</span>
                                        <p className="text-sm font-black text-slate-900 truncate">{restaurant?.name || 'Comercio'}</p>
                                    </div>
                                </div>

                                <div className="w-0.5 h-4 bg-slate-200 ml-4 -my-2" />

                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                                        <MapPin className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Destino (Tú)</span>
                                        <p className="text-sm font-black text-slate-900 truncate">{order.deliveryAddress || 'Tu dirección guardada'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Selector de Vehículo */}
                            <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selecciona el Tipo de Vehículo</p>
                                <div className="grid grid-cols-3 gap-2.5">
                                    {[
                                        { key: 'moto', label: 'Moto Taxi', icon: Bike, desc: 'Rápido' },
                                        { key: 'carro', label: 'Taxi Eco', icon: Car, desc: 'Económico' },
                                        { key: 'ejecutivo', label: 'Carro Confort', icon: Sparkles, desc: 'Con A/A' }
                                    ].map((v) => {
                                        const isSel = selectedVehicle === v.key;
                                        const IconComp = v.icon;

                                        return (
                                            <button
                                                key={v.key}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedVehicle(v.key as any);
                                                    if (selectedDriverId) {
                                                        const d = availableDrivers.find(drv => drv.id === selectedDriverId);
                                                        if (d) {
                                                            const vT = (d.vehicle_type || '').toLowerCase();
                                                            const matches = (v.key === 'moto' && (vT === 'moto' || vT === 'mototaxi' || !vT)) ||
                                                                            (v.key === 'carro' && (vT === 'carro' || vT === 'taxi')) ||
                                                                            (v.key === 'ejecutivo' && (vT === 'confort' || vT === 'ejecutivo' || vT === 'carro_confort'));
                                                            if (!matches) setSelectedDriverId(null);
                                                        }
                                                    }
                                                }}
                                                className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all text-center ${
                                                    isSel
                                                        ? 'border-primary bg-primary/10 text-slate-900 shadow-md shadow-primary/10 scale-102 font-black'
                                                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                                                }`}
                                            >
                                                <IconComp className={`w-5 h-5 ${isSel ? 'text-slate-900' : 'text-slate-400'}`} />
                                                <span className="text-xs font-black leading-tight">{v.label}</span>
                                                <span className="text-[10px] font-bold text-slate-400 leading-none">{v.desc}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Conductores Disponibles en la Zona filtrados por Tipo de Vehículo */}
                            {(() => {
                                const filteredDrivers = availableDrivers.filter((drv) => {
                                    const vType = (drv.vehicle_type || '').toLowerCase();
                                    if (selectedVehicle === 'moto') {
                                        return vType === 'moto' || vType === 'mototaxi' || !vType;
                                    }
                                    if (selectedVehicle === 'carro') {
                                        return vType === 'carro' || vType === 'taxi';
                                    }
                                    if (selectedVehicle === 'ejecutivo') {
                                        return vType === 'confort' || vType === 'ejecutivo' || vType === 'carro_confort';
                                    }
                                    return true;
                                });

                                const vehicleLabel = selectedVehicle === 'moto' ? 'Moto Taxi' : selectedVehicle === 'carro' ? 'Taxi Eco' : 'Carro Confort';

                                return (
                                    <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                    Conductores en tu Zona ({vehicleLabel})
                                                </p>
                                                <p className="text-[11px] font-bold text-slate-600">
                                                    {filteredDrivers.length > 0 ? 'Elige un conductor o solicita por radar general' : 'Solicita por radar general en tu zona'}
                                                </p>
                                            </div>
                                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                                                {filteredDrivers.length} {filteredDrivers.length === 1 ? 'Activo' : 'Activos'}
                                            </span>
                                        </div>

                                        {/* Opción 1: Radar General (Sin selección directa) */}
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDriverId(null)}
                                            className={`w-full p-3.5 rounded-2xl border-2 flex items-center justify-between text-left transition-all active:scale-[0.99] ${
                                                selectedDriverId === null
                                                    ? 'border-primary bg-primary/10 ring-2 ring-primary/20 shadow-xs'
                                                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-700'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
                                                    selectedDriverId === null ? 'bg-slate-900 text-primary' : 'bg-white border border-slate-200 text-slate-500'
                                                }`}>
                                                    <Radio className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-black text-xs text-slate-900">Radar General (Automático)</span>
                                                        <span className="text-[9px] bg-slate-200 text-slate-800 font-black px-1.5 py-0.5 rounded-md">Recomendado</span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 font-bold">
                                                        Notifica a todos los repartidores cercanos de {vehicleLabel}. El primero en aceptar toma tu pedido.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                selectedDriverId === null ? 'border-primary bg-primary text-slate-900' : 'border-slate-300 bg-white'
                                            }`}>
                                                {selectedDriverId === null && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                            </div>
                                        </button>

                                        {/* Lista de Conductores Específicos Filtrados */}
                                        {filteredDrivers.length > 0 ? (
                                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                {filteredDrivers.map((drv) => {
                                                    const isSelected = selectedDriverId === drv.id;
                                                    const vType = drv.vehicle_type === 'confort' ? 'Confort' : (drv.vehicle_type === 'carro' ? 'Auto Económico' : 'Moto Taxi');
                                                    return (
                                                        <button
                                                            key={drv.id}
                                                            type="button"
                                                            onClick={() => setSelectedDriverId(drv.id)}
                                                            className={`w-full p-3 rounded-2xl border-2 flex items-center justify-between text-left transition-all active:scale-[0.99] ${
                                                                isSelected
                                                                    ? 'border-primary bg-primary/10 ring-2 ring-primary/20 shadow-xs'
                                                                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center font-black text-slate-700 shrink-0">
                                                                    {drv.photo_url ? (
                                                                        <img src={drv.photo_url} alt={drv.full_name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        drv.full_name?.charAt(0) || 'D'
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-black text-xs text-slate-900 truncate">{drv.full_name}</span>
                                                                        <span className="text-[10px] text-amber-500 font-black shrink-0">⭐ {drv.rating ? Number(drv.rating).toFixed(1) : '5.0'}</span>
                                                                    </div>
                                                                    <p className="text-[10px] text-slate-500 font-bold truncate">
                                                                        {vType} • {drv.vehicle_brand || ''} {drv.vehicle_model || ''}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                                    isSelected ? 'bg-primary text-slate-950 font-black' : 'bg-emerald-50 text-emerald-600'
                                                                }`}>
                                                                    {isSelected ? 'Elegido' : 'Disponible'}
                                                                </span>
                                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                                    isSelected ? 'border-primary bg-primary text-slate-900' : 'border-slate-300 bg-white'
                                                                }`}>
                                                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-3.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                                                <p className="text-xs font-black text-slate-700">Sin conductores activos en {vehicleLabel}</p>
                                                <p className="text-[10px] text-slate-500 font-bold mt-0.5">Usa Radar General para notificar a cualquier unidad disponible o cambia de tipo de vehículo.</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Botón Principal: Confirmar y Solicitar Repartidor */}
                            <button
                                onClick={handleRequestDelivery}
                                disabled={isSubmittingDelivery}
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 active:scale-98 transition-all flex items-center justify-center gap-2 text-base shadow-xl shadow-slate-900/20 disabled:opacity-50"
                            >
                                {isSubmittingDelivery ? (
                                    <><Loader2 className="w-5 h-5 animate-spin text-primary" /> Solicitando repartidor...</>
                                ) : selectedDriverId ? (
                                    <><Motorbike className="w-5 h-5 text-primary" /> Solicitar a {availableDrivers.find(d => d.id === selectedDriverId)?.full_name || 'Conductor'}</>
                                ) : (
                                    <><Motorbike className="w-5 h-5 text-primary" /> Confirmar y Solicitar Repartidor</>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 4 — Tracking en Vivo Tipo Videojuego (Pantalla Completa - Pilar 4)
    // ═══════════════════════════════════════════════════════════════════════════
    const renderStep4 = () => {
        const isDelivered = ['delivered', 'completed'].includes(order.status) || transportRequest?.status === 'completed';
        const driverName = driver?.name || driver?.displayName || transportRequest?.driver_name || order.driver_name || 'Repartidor';
        const driverPhone = driver?.phone || driver?.phoneNumber || transportRequest?.driver_phone || order.driver_phone;
        const driverPhoto = driver?.photo_url || transportRequest?.driver_photo || null;
        const driverRating = driver?.rating || 5.0;
        const vehicleModel = driver?.vehicle_model || transportRequest?.vehicle_model || '';
        const vehiclePlate = driver?.vehicle_plate || transportRequest?.vehicle_plate || '';
        const vehicleType = transportRequest?.vehicle_type || order.vehicle_type || driver?.vehicle_type || 'moto';
        const vehicleLabel = vehicleType === 'confort' || vehicleType === 'ejecutivo' ? 'Carro Confort' : (vehicleType === 'carro' ? 'Taxi Económico' : 'Moto Taxi');

        return (
            <div className="fixed inset-0 z-40 w-full h-[100dvh] max-h-[100dvh] bg-slate-100 overflow-hidden flex flex-col select-none">
                {/* 1. Full Screen Map (Google Maps with Zero-Downtime LiveTripMap Fallback) */}
                <div className="absolute inset-0 z-0" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} ref={mapContainerRef}>
                    {!hasMapError && isLoaded ? (
                        <GoogleMap
                            mapContainerStyle={{ width: '100%', height: '100%' }}
                            center={interpolatedPos || mapCenter}
                            zoom={16}
                            onLoad={onMapLoad}
                            options={{
                                ...mapOptions,
                                disableDefaultUI: true,
                                zoomControl: false,
                                streetViewControl: false,
                                mapTypeControl: false,
                                fullscreenControl: false
                            }}
                        >
                            {/* Polyline Route Calculated ONCE (google-maps-optimizer) */}
                            {directionsResult && (
                                <DirectionsRenderer
                                    directions={directionsResult}
                                    options={{
                                        suppressMarkers: true,
                                        preserveViewport: true,
                                        polylineOptions: {
                                            strokeColor: '#F59E0B',
                                            strokeWeight: 6,
                                            strokeOpacity: 0.9,
                                        }
                                    }}
                                />
                            )}

                            {/* Client Destination Marker */}
                            {destCoords && (
                                <Marker
                                    position={destCoords}
                                    icon={{
                                        url: 'https://cdn-icons-png.flaticon.com/512/1004/1004285.png',
                                        scaledSize: window.google ? new window.google.maps.Size(36, 36) : undefined
                                    }}
                                />
                            )}

                            {/* Store Origin Marker */}
                            {originCoords && (
                                <Marker
                                    position={originCoords}
                                    icon={{
                                        url: 'https://cdn-icons-png.flaticon.com/512/3081/3081559.png',
                                        scaledSize: window.google ? new window.google.maps.Size(34, 34) : undefined
                                    }}
                                />
                            )}

                            {/* Video-Game Interpolated 3D Vehicle Marker */}
                            {(interpolatedPos || driverLocation) && (
                                <Marker
                                    position={interpolatedPos || driverLocation!}
                                    icon={{
                                        url: getVehicleSvgDataUri(vehicleType, vehicleBearing),
                                        anchor: window.google ? new window.google.maps.Point(34, 34) : undefined,
                                        scaledSize: window.google ? new window.google.maps.Size(68, 68) : undefined
                                    }}
                                />
                            )}
                        </GoogleMap>
                    ) : hasMapError ? (
                        <LiveTripMap
                            origin={originCoords}
                            destination={destCoords}
                            driverLocation={interpolatedPos || driverLocation}
                            vehicleType={vehicleType}
                            driverName={driverName}
                            showControls={false}
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white gap-2">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-xs font-bold text-slate-400">Iniciando satélite GPS...</p>
                        </div>
                    )}
                </div>

                {/* 2. Top Floating Glass Header */}
                <div className="absolute top-4 inset-x-4 z-20 flex items-center justify-between pointer-events-none">
                    <button
                        onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')}
                        className="w-11 h-11 bg-slate-900/85 backdrop-blur-md rounded-2xl border border-white/10 text-white flex items-center justify-center shadow-xl active:scale-95 transition-transform pointer-events-auto"
                        title="Volver"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    <div className="px-4 py-2 rounded-full bg-slate-900/85 backdrop-blur-md border border-white/10 text-white flex items-center gap-2 shadow-xl">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                        <span className="text-xs font-black tracking-wide">
                            {isDelivered ? '¡Pedido Entregado!' : 'En Camino a tu Ubicación'}
                        </span>
                    </div>

                    <div className="w-11 h-11 bg-slate-900/85 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl flex items-center justify-center overflow-hidden pointer-events-auto">
                        {restaurant?.logoUrl
                            ? <img src={restaurant.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                            : <Store className="w-5 h-5 text-primary" />}
                    </div>
                </div>

                {/* 3. Floating Action Buttons (Right Side) */}
                <div className="absolute right-4 bottom-64 z-20 flex flex-col gap-3">
                    {/* Open Order Chat */}
                    <button
                        onClick={openChat}
                        className="w-12 h-12 bg-slate-900/90 backdrop-blur-md text-white rounded-2xl border border-white/15 flex items-center justify-center shadow-2xl active:scale-95 transition-all group relative"
                        title="Abrir Chat con Negocio y Driver"
                    >
                        <MessageSquare className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                        {hasUnreadChat && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-md animate-bounce">
                                1
                            </span>
                        )}
                    </button>

                    {/* Direct Call to Driver */}
                    {driverPhone && (
                        <a
                            href={`tel:${driverPhone}`}
                            className="w-12 h-12 bg-emerald-500 text-white rounded-2xl shadow-2xl flex items-center justify-center active:scale-95 transition-all shadow-emerald-500/30"
                            title="Llamar al repartidor"
                        >
                            <Phone className="w-5 h-5" />
                        </a>
                    )}

                    {/* Direct Call to Restaurant */}
                    {(restaurant?.phone || restaurant?.phone_number) && (
                        <a
                            href={`tel:${restaurant.phone || restaurant.phone_number}`}
                            className="w-12 h-12 bg-slate-900/90 backdrop-blur-md text-amber-400 rounded-2xl border border-white/15 flex items-center justify-center shadow-2xl active:scale-95 transition-all"
                            title="Llamar a la tienda"
                        >
                            <Store className="w-5 h-5" />
                        </a>
                    )}
                </div>

                {/* 4. Bottom Docked Card with Driver Info & "¿Recibiste tu pedido?" Button */}
                <div className="absolute bottom-4 inset-x-4 z-20 max-w-lg mx-auto">
                    <div className="bg-slate-900/90 backdrop-blur-xl border border-white/15 rounded-[32px] p-5 shadow-2xl text-white space-y-3.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    {driverPhoto ? (
                                        <img src={driverPhoto} alt={driverName} className="w-12 h-12 rounded-2xl object-cover border-2 border-primary/50 shadow-md" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-2xl bg-slate-800 border-2 border-primary/40 flex items-center justify-center text-primary font-black text-base">
                                            {driverName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900" />
                                </div>

                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <h4 className="font-black text-sm text-white leading-tight">{driverName}</h4>
                                        <span className="text-[10px] font-black text-amber-400 flex items-center">
                                            ⭐ {driverRating ? Number(driverRating).toFixed(1) : '5.0'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-300 font-bold mt-0.5">
                                        {vehicleLabel} • {vehicleModel} {vehiclePlate ? `[${vehiclePlate}]` : ''}
                                    </p>
                                </div>
                            </div>

                            <div className="text-right">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Distancia</span>
                                <span className="text-sm font-black text-primary">{calculatedDistance} km</span>
                            </div>
                        </div>

                        {/* Destination Pill */}
                        <div className="flex items-center gap-2 text-xs text-slate-300 bg-white/5 p-2.5 rounded-2xl border border-white/5">
                            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-bold truncate">{order.deliveryAddress || 'Tu dirección registrada'}</span>
                        </div>

                        {/* Confirmation and Review CTA Button (Pilar 5) */}
                        {order.status === 'completed' || order.has_reviewed || order.hasReviewed ? (
                            <div className="space-y-2 pt-1">
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2.5 text-emerald-400">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-white">¡Pedido entregado y calificado!</p>
                                        <p className="text-[10px] text-slate-300 font-bold">Ciclo completado. Gracias por tu preferencia.</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => navigate('/', { replace: true })}
                                        className="flex-1 bg-primary text-slate-950 font-black py-3 rounded-2xl hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs shadow-lg shadow-primary/20"
                                    >
                                        <Store className="w-4 h-4" /> Ir al Menú de Inicio
                                    </button>
                                    <button
                                        onClick={() => navigate('/orders?tab=active')}
                                        className="px-4 bg-white/10 text-white font-black py-3 rounded-2xl hover:bg-white/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 text-xs border border-white/10"
                                    >
                                        <Clock className="w-4 h-4" /> Mis Pedidos
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowReviewModal(true)}
                                className="w-full bg-primary text-slate-950 font-black py-3.5 rounded-2xl hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm shadow-xl shadow-primary/30"
                            >
                                <CheckCircle2 className="w-4 h-4 text-slate-950" />
                                {isDelivered ? 'Calificar Tienda y Repartidor' : '¿Recibiste tu pedido? Confirmar y Calificar'}
                            </button>
                        )}
                    </div>
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
            {order.status !== 'cancelled' && order.status !== 'delivered' && order.status !== 'completed' && (
                <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={openChat}
                    className="fixed bottom-28 right-5 z-40 bg-slate-900 text-white p-4 rounded-full shadow-2xl shadow-slate-900/40 flex items-center gap-2 border-2 border-white relative active:scale-95 transition-transform"
                    title="Abrir Chat"
                >
                    <MessageSquare className="w-6 h-6 text-primary" />
                    <span className="text-xs font-black pr-1 hidden sm:inline">Chat</span>
                    {hasUnreadChat && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg border-2 border-white animate-bounce">
                            1
                        </span>
                    )}
                </motion.button>
            )}

            {/* Chat en Pantalla Completa: Driver Chat en Paso 4, OrderChatWindow en Pasos 1-3 */}
            <AnimatePresence>
                {showChat && (
                    <motion.div
                        key="chat-overlay"
                        initial={{ opacity: 0, y: '100%' }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="fixed inset-0 z-50 bg-slate-50 flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden"
                    >
                        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                            {currentStep === 4 && (transportRequest?.id || order?.transport_request_id) ? (
                                <RideChat
                                    requestId={transportRequest?.id || order?.transport_request_id}
                                    onClose={() => setShowChat(false)}
                                    serviceCategory="food_delivery"
                                    requestStatus={transportRequest?.status || order?.status || 'in_progress'}
                                    driverPhone={driver?.phone || transportRequest?.driver_phone || order?.driver_phone}
                                    clientPhone={order?.user_phone || user?.phone}
                                    isDriver={false}
                                />
                            ) : (
                                <OrderChatWindow
                                    orderId={orderId!}
                                    currentUserRole="client"
                                    currentUserId={user?.uid || 'guest'}
                                    currentUserName={order.userName || 'Cliente'}
                                    restaurantId={order.restaurantId || order.restaurant_id}
                                    orderInfo={order}
                                    onClose={() => setShowChat(false)}
                                    onProceedToDelivery={() => {
                                        setForcedStep(3);
                                        setOrder((prev: any) => ({
                                            ...prev,
                                            status: 'awaiting_delivery_driver',
                                            payment_status: 'paid'
                                        }));
                                        setShowChat(false);
                                    }}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal de Datos de Pago Móvil con Copiado Rápido */}
            <AnimatePresence>
                {showPagoMovilModal && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <motion.div
                            key="pago-movil-modal"
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
                                <p className="text-3xl font-black text-slate-900">{(itemsTotal * bcvRate).toFixed(2)} Bs</p>
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
                                        onClick={() => {
                                            const bsAmount = (itemsTotal * bcvRate).toFixed(2);
                                            const fullText = `Banco: ${pagoMovilMethod.bank}\nTeléfono: ${pagoMovilMethod.phone}\nCédula/RIF: ${pagoMovilMethod.rif}\nTitular: ${pagoMovilMethod.owner}\nMonto: ${bsAmount} Bs`;
                                            navigator.clipboard.writeText(fullText);
                                            toast.success('¡Todos los datos copiados! Pégalos en tu banco.', { duration: 4000 });
                                        }}
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

            {/* Modal de Calificación */}
            <ReviewModal
                isOpen={showReviewModal}
                onClose={() => setShowReviewModal(false)}
                restaurantId={order.restaurantId || order.restaurant_id}
                orderId={orderId!}
                orderInfo={order}
                onReviewSubmitted={() => {
                    setShowReviewModal(false);
                    localStorage.removeItem('active_order_id');
                    localStorage.removeItem('active_transport_req_id');
                    navigate('/', { replace: true });
                }}
            />
        </div>
    );
}
