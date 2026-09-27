import React, { useState, useEffect } from 'react';
import { 
    X, 
    Trash2, 
    Plus, 
    Minus, 
    MapPin, 
    Bike, 
    Store, 
    Truck, 
    Clock, 
    ShoppingBag, 
    ArrowRight, 
    AlertCircle, 
    CheckCircle2, 
    ChevronDown, 
    ChevronUp,
    FileText,
    Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useCart, CartItem } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { supabase } from '../lib/supabase';
import { calculateDistance } from '../lib/geo';
import { calculateDynamicFare } from '../lib/pricing';
import AddressPicker from './AddressPicker';
import LocationRequiredModal from './LocationRequiredModal';
import DualPrice from './DualPrice';
import { vibrate } from '../utils/haptics';
import toast from 'react-hot-toast';

interface StoreCartDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    restaurant: any;
}

export default function StoreCartDrawer({ isOpen, onClose, restaurant }: StoreCartDrawerProps) {
    const { storeCarts, updateQuantity, removeItem, clearStoreCart } = useCart();
    const { user, userData } = useAuth();
    const { bcvRate } = useCurrency();
    const navigate = useNavigate();

    const restaurantId = restaurant?.id;
    const items: CartItem[] = (restaurantId && storeCarts[restaurantId]) ? storeCarts[restaurantId] : [];

    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [orderNote, setOrderNote] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'app_delivery' | 'own_delivery' | 'pickup'>('app_delivery');
    
    // Address state
    const defaultAddress = userData?.addresses?.find((a: any) => a.isDefault) || userData?.address;
    const [selectedAddress, setSelectedAddress] = useState<any>(defaultAddress || null);
    const [showAddressPicker, setShowAddressPicker] = useState(false);
    const [showLocationModal, setShowLocationModal] = useState(false);
    
    // Guest modal state
    const [showGuestModal, setShowGuestModal] = useState(false);
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestCedulaType, setGuestCedulaType] = useState<'V' | 'E' | 'J'>('V');
    const [guestCedula, setGuestCedula] = useState('');

    // System delivery settings
    const [systemSettings, setSystemSettings] = useState<any>(null);
    const [distance, setDistance] = useState<number | null>(null);

    // Sync selected address if userData changes
    useEffect(() => {
        if (!selectedAddress && defaultAddress) {
            setSelectedAddress(defaultAddress);
        }
    }, [defaultAddress]);

    // Fetch delivery settings
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('*')
                    .eq('id', 'delivery_settings')
                    .maybeSingle();
                if (data) setSystemSettings(data.data || data.value || data);
            } catch (err) {
                console.error("Error fetching delivery settings:", err);
            }
        };
        fetchSettings();
    }, []);

    // Calculate distance between restaurant and customer address
    useEffect(() => {
        if (selectedAddress?.lat && selectedAddress?.lng && restaurant?.location?.coords) {
            const d = calculateDistance(
                selectedAddress.lat,
                selectedAddress.lng,
                restaurant.location.coords.lat,
                restaurant.location.coords.lng
            );
            setDistance(Number(d.toFixed(1)));
        } else {
            setDistance(null);
        }
    }, [selectedAddress, restaurant?.location?.coords]);

    // Auto-select allowed delivery methods
    useEffect(() => {
        const own = restaurant?.own_delivery ?? restaurant?.ownDelivery;
        const app = restaurant?.app_delivery ?? restaurant?.appDelivery ?? true;
        const pickup = restaurant?.pickup_only ?? restaurant?.pickupOnly;

        if (pickup && !own && !app) {
            setDeliveryMethod('pickup');
        } else if (own && !app) {
            setDeliveryMethod('own_delivery');
        } else {
            setDeliveryMethod('app_delivery');
        }
    }, [restaurant]);

    // Subtotal
    const cartSubtotalUSD = items.reduce((acc, item) => acc + ((item.price || 0) * item.quantity), 0);

    // Calculate delivery fee
    const calculateDeliveryFee = (): { clientFee: number; driverPayout: number } => {
        if (deliveryMethod === 'pickup') {
            return { clientFee: 0, driverPayout: 0 };
        }

        const own = restaurant?.own_delivery ?? restaurant?.ownDelivery;
        const rates = restaurant?.delivery_rates || restaurant?.deliveryRates || [];

        // Own restaurant delivery rates
        if (deliveryMethod === 'own_delivery' && own && rates.length > 0 && distance) {
            const matchingRate = rates.find((r: any) => distance >= r.minKm && distance <= r.maxKm);
            if (matchingRate) {
                return { clientFee: matchingRate.price, driverPayout: matchingRate.price * 0.8 };
            }
        }

        // Platform smart delivery rates
        if (systemSettings) {
            const fare = calculateDynamicFare({
                serviceType: 'delivery',
                distanceKm: distance || 1.5,
                settings: systemSettings
            });
            return { clientFee: fare.clientTotal, driverPayout: fare.driverPayout };
        }

        return { clientFee: 1.50, driverPayout: 1.20 };
    };

    const feeInfo = calculateDeliveryFee();
    const deliveryFee = feeInfo.clientFee;
    const driverPayout = feeInfo.driverPayout;
    const finalTotal = cartSubtotalUSD + deliveryFee;

    const handleCheckout = async () => {
        if (items.length === 0) {
            toast.error("Tu pedido está vacío");
            return;
        }

        // Validate user authentication or guest details
        if (!user && (!guestName || !guestPhone || !guestCedula)) {
            setShowGuestModal(true);
            return;
        }

        if (user && (!userData?.phone || !userData?.cedula)) {
            toast.error("Por favor completa tu cédula y teléfono en tu perfil");
            navigate('/profile');
            return;
        }

        // Validate location permissions for app delivery
        if (deliveryMethod === 'app_delivery' && !userData?.locationPermissionsAllowed && !selectedAddress) {
            setShowLocationModal(true);
            return;
        }

        if (deliveryMethod !== 'pickup' && !selectedAddress) {
            toast.error("Por favor selecciona una dirección de entrega");
            setShowAddressPicker(true);
            return;
        }

        setIsCheckingOut(true);
        vibrate(40);

        try {
            const newOrderId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
                ? crypto.randomUUID() 
                : `order_${Date.now()}`;

            const clientUserId = user?.id || user?.uid || `guest_${Date.now()}`;
            const clientName = userData?.displayName || user?.displayName || guestName || 'Cliente';
            const clientPhone = userData?.phone || (guestPhone ? `+58${guestPhone}` : '');
            const clientCedula = userData?.cedula || (guestCedula ? `${guestCedulaType}-${guestCedula}` : '');
            const clientEmail = user?.email || 'N/A';

            let addressStr = deliveryMethod === 'pickup' 
                ? "Retiro en el local" 
                : (selectedAddress ? `${selectedAddress.name} - ${selectedAddress.reference || ''}` : "Dirección a coordinar");

            const sanitizedItems = items.map(item => {
                const i = { ...item };
                Object.keys(i).forEach(k => (i as any)[k] === undefined && delete (i as any)[k]);
                return i;
            });

            // Commission calculation
            let storeCommission = 0.30;
            if (cartSubtotalUSD > 20) storeCommission = 0.75;
            else if (cartSubtotalUSD >= 10) storeCommission = 0.55;

            const orderData: any = {
                id: newOrderId,
                user_id: clientUserId,
                userId: clientUserId,
                user_name: clientName,
                userName: clientName,
                user_phone: clientPhone,
                userPhone: clientPhone,
                user_cedula: clientCedula,
                userCedula: clientCedula,
                user_email: clientEmail,
                userEmail: clientEmail,
                restaurant_id: restaurantId,
                restaurantId: restaurantId,
                restaurant_name: restaurant?.name || 'Comercio',
                restaurantName: restaurant?.name || 'Comercio',
                restaurant_city: restaurant?.location?.city || '',
                restaurantCity: restaurant?.location?.city || '',
                source: 'client',
                items: sanitizedItems,
                subtotal: cartSubtotalUSD,
                delivery_fee: deliveryFee,
                deliveryFee: deliveryFee,
                driver_payout: driverPayout,
                driverPayout: driverPayout,
                distance: distance || 1,
                total: finalTotal,
                commission_amount: storeCommission,
                commissionAmount: storeCommission,
                delivery_method: deliveryMethod,
                deliveryMethod: deliveryMethod,
                status: 'pendiente_pago',
                payment_status: 'pending',
                paymentStatus: 'pending',
                notified: false,
                delivery_address: addressStr,
                deliveryAddress: addressStr,
                delivery_coords: (deliveryMethod === 'app_delivery' && selectedAddress?.lat) 
                    ? { lat: selectedAddress.lat, lng: selectedAddress.lng } 
                    : null,
                deliveryCoords: (deliveryMethod === 'app_delivery' && selectedAddress?.lat) 
                    ? { lat: selectedAddress.lat, lng: selectedAddress.lng } 
                    : null,
                order_note: orderNote.trim(),
                orderNote: orderNote.trim(),
                created_at: new Date().toISOString(),
                createdAt: new Date().toISOString()
            };

            // Insert into Supabase
            const { error: insErr } = await supabase.from('orders').insert(orderData);
            if (insErr) throw insErr;

            // Welcome chat message
            try {
                await supabase.from('messages').insert({
                    order_id: newOrderId,
                    orderId: newOrderId,
                    text: `¡Hola ${clientName}! Hemos recibido tu pedido para ${restaurant?.name}. Estamos verificando la disponibilidad de tus platos. Te confirmaremos enseguida.`,
                    sender_id: restaurantId,
                    senderId: restaurantId,
                    sender_name: restaurant?.name || 'Comercio',
                    senderName: restaurant?.name || 'Comercio',
                    sender_role: 'restaurant',
                    senderRole: 'restaurant',
                    created_at: new Date().toISOString()
                });
            } catch (msgErr) {
                console.warn("Could not insert welcome message:", msgErr);
            }

            // Save active order locally
            localStorage.setItem('active_order_id', newOrderId);

            // Clear ONLY this store's cart
            clearStoreCart(restaurantId);

            toast.success("¡Pedido enviado con éxito!", { icon: '🎉' });
            onClose();
            navigate(`/track/${newOrderId}`);

        } catch (error: any) {
            console.error("Error creating order:", error);
            toast.error(error?.message || "No se pudo procesar tu pedido. Intenta nuevamente.");
        } finally {
            setIsCheckingOut(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-end justify-center">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                />

                {/* Drawer Content */}
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 280 }}
                    className="bg-white w-full max-w-md rounded-t-[2.5rem] shadow-2xl relative z-10 max-h-[90vh] flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-primary/20 text-slate-950 flex items-center justify-center font-black">
                                <ShoppingBag className="w-5 h-5 text-slate-900" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-slate-900 leading-tight">
                                    Tu Pedido en {restaurant?.name || 'la tienda'}
                                </h2>
                                <p className="text-xs text-slate-500 font-medium">
                                    {items.length} {items.length === 1 ? 'producto' : 'productos'} en este comercio
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="w-9 h-9 rounded-full bg-slate-200/70 hover:bg-slate-300 active:scale-95 flex items-center justify-center text-slate-600 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Scrollable Items & Options */}
                    <div className="p-5 overflow-y-auto hide-scrollbar space-y-5 flex-1">
                        {/* Items List */}
                        {items.length === 0 ? (
                            <div className="text-center py-10 space-y-3">
                                <div className="w-16 h-16 bg-slate-100 rounded-3xl mx-auto flex items-center justify-center text-slate-400">
                                    <ShoppingBag className="w-8 h-8" />
                                </div>
                                <h3 className="text-sm font-black text-slate-700">Tu carrito de esta tienda está vacío</h3>
                                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                                    Selecciona tus platos y productos favoritos del menú para ordenarlos aquí mismo.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                                        Productos seleccionados
                                    </span>
                                    <button
                                        onClick={() => {
                                            vibrate(25);
                                            clearStoreCart(restaurantId);
                                        }}
                                        className="text-[11px] font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 active:scale-95"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Vaciar</span>
                                    </button>
                                </div>

                                {items.map((item) => (
                                    <div
                                        key={item.id}
                                        className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3 shadow-sm"
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            {item.image && (
                                                <img
                                                    src={item.image}
                                                    alt={item.name}
                                                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200"
                                                />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <h4 className="text-xs font-black text-slate-900 truncate">
                                                    {item.name}
                                                </h4>
                                                <div className="text-xs font-bold text-slate-500 mt-0.5">
                                                    ${(item.price || 0).toFixed(2)} c/u
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quantity Controls */}
                                        <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-sm shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(20);
                                                    updateQuantity(item.id, item.quantity - 1, restaurantId);
                                                }}
                                                className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-90"
                                            >
                                                <Minus className="w-3 h-3" />
                                            </button>
                                            <span className="text-xs font-black text-slate-900 w-4 text-center">
                                                {item.quantity}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(20);
                                                    updateQuantity(item.id, item.quantity + 1, restaurantId);
                                                }}
                                                className="w-6 h-6 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center active:scale-90"
                                            >
                                                <Plus className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {items.length > 0 && (
                            <>
                                {/* Delivery Method Selector */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                                        Método de Entrega
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                vibrate(20);
                                                setDeliveryMethod('app_delivery');
                                            }}
                                            className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 shadow-sm active:scale-95 ${
                                                deliveryMethod === 'app_delivery'
                                                    ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-primary/40'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <Bike className="w-5 h-5 text-primary" />
                                            <span className="text-[10px] font-black uppercase tracking-tight">Delivery Un 2x3</span>
                                        </button>

                                        {(restaurant?.own_delivery || restaurant?.ownDelivery) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    vibrate(20);
                                                    setDeliveryMethod('own_delivery');
                                                }}
                                                className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 shadow-sm active:scale-95 ${
                                                    deliveryMethod === 'own_delivery'
                                                        ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-primary/40'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                <Truck className="w-5 h-5 text-amber-500" />
                                                <span className="text-[10px] font-black uppercase tracking-tight">Delivery Local</span>
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                vibrate(20);
                                                setDeliveryMethod('pickup');
                                            }}
                                            className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 shadow-sm active:scale-95 ${
                                                deliveryMethod === 'pickup'
                                                    ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-primary/40'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <Store className="w-5 h-5 text-emerald-500" />
                                            <span className="text-[10px] font-black uppercase tracking-tight">Retiro en Local</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Address Picker (if delivery) */}
                                {deliveryMethod !== 'pickup' && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                                                Dirección de Entrega
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setShowAddressPicker(true)}
                                                className="text-[11px] font-black text-indigo-600 hover:text-indigo-800"
                                            >
                                                {selectedAddress ? 'Cambiar' : 'Seleccionar'}
                                            </button>
                                        </div>

                                        <div
                                            onClick={() => setShowAddressPicker(true)}
                                            className="p-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 cursor-pointer shadow-sm transition-all"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <MapPin className="w-4 h-4 text-primary shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="text-xs font-black text-slate-900 truncate">
                                                        {selectedAddress?.name || 'Toca para fijar tu dirección'}
                                                    </div>
                                                    {selectedAddress?.reference && (
                                                        <div className="text-[10px] text-slate-500 truncate">
                                                            {selectedAddress.reference}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {distance && (
                                                <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded-lg text-slate-700 shrink-0 border border-slate-200">
                                                    {distance} km
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Order Notes */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                                        Nota para el negocio (opcional)
                                    </label>
                                    <input
                                        type="text"
                                        value={orderNote}
                                        onChange={(e) => setOrderNote(e.target.value)}
                                        placeholder="Ej: salsa tártara aparte, cubiertos, timbre roto..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-medium"
                                    />
                                </div>

                                {/* Order Summary Breakdown */}
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                                    <div className="flex items-center justify-between text-slate-600 font-medium">
                                        <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items):</span>
                                        <span className="font-bold">${cartSubtotalUSD.toFixed(2)}</span>
                                    </div>

                                    {deliveryMethod !== 'pickup' && (
                                        <div className="flex items-center justify-between text-slate-600 font-medium">
                                            <span>Flete de entrega:</span>
                                            <span className="font-bold">${deliveryFee.toFixed(2)}</span>
                                        </div>
                                    )}

                                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-slate-900">
                                        <span className="font-black text-sm">Total a pagar:</span>
                                        <div className="text-right">
                                            <DualPrice usdAmount={finalTotal} usdClassName="font-black text-lg leading-tight" />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer Submit Button */}
                    {items.length > 0 && (
                        <div className="p-5 border-t border-slate-100 bg-white shrink-0">
                            <button
                                type="button"
                                disabled={isCheckingOut}
                                onClick={handleCheckout}
                                className="w-full py-4 bg-primary hover:bg-emerald-600 active:scale-95 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                            >
                                {isCheckingOut ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Procesando Pedido...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Confirmar Pedido • ${(finalTotal).toFixed(2)}</span>
                                        <ArrowRight className="w-5 h-5" />
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Address Picker Modal */}
                    {showAddressPicker && (
                        <AddressPicker
                            isOpen={showAddressPicker}
                            onClose={() => setShowAddressPicker(false)}
                            onSelectAddress={(addr) => {
                                setSelectedAddress(addr);
                                setShowAddressPicker(false);
                            }}
                        />
                    )}

                    {/* Location Required Modal */}
                    <LocationRequiredModal
                        isOpen={showLocationModal}
                        onClose={() => setShowLocationModal(false)}
                    />

                    {/* Guest Checkout Modal */}
                    {showGuestModal && (
                        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
                            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
                                <div className="text-center space-y-1">
                                    <h3 className="text-base font-black text-slate-900">Datos para tu Pedido</h3>
                                    <p className="text-xs text-slate-500">
                                        Para enviar tu pedido al comercio, ingresa tu nombre y número de contacto.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600">Nombre completo</label>
                                        <input
                                            type="text"
                                            value={guestName}
                                            onChange={(e) => setGuestName(e.target.value)}
                                            placeholder="Tu nombre y apellido"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600">Teléfono (+58)</label>
                                        <input
                                            type="tel"
                                            value={guestPhone}
                                            onChange={(e) => setGuestPhone(e.target.value)}
                                            placeholder="4121234567"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <div className="w-16">
                                            <label className="text-[11px] font-bold text-slate-600">Tipo</label>
                                            <select
                                                value={guestCedulaType}
                                                onChange={(e: any) => setGuestCedulaType(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900"
                                            >
                                                <option value="V">V</option>
                                                <option value="E">E</option>
                                                <option value="J">J</option>
                                            </select>
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[11px] font-bold text-slate-600">Cédula</label>
                                            <input
                                                type="number"
                                                value={guestCedula}
                                                onChange={(e) => setGuestCedula(e.target.value)}
                                                placeholder="25123456"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowGuestModal(false)}
                                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!guestName.trim() || !guestPhone.trim() || !guestCedula.trim()}
                                        onClick={() => {
                                            setShowGuestModal(false);
                                            handleCheckout();
                                        }}
                                        className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl disabled:opacity-50"
                                    >
                                        Continuar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
