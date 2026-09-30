import { ArrowLeft, ShoppingCart, MapPin, CreditCard, Trash2, Minus, Plus, ArrowRight, CheckCircle2, Gift, AlertCircle, Award, X, Store, Bike, Navigation, Loader2, MessageCircle, RefreshCw, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { calculateDistance, formatDistance } from '../lib/geo';
import AddressPicker from '../components/AddressPicker';
import { isDemoMode } from '../lib/env';
import DemoAlertModal from '../components/DemoAlertModal';
import DualPrice from '../components/DualPrice';
import LocationRequiredModal from '../components/LocationRequiredModal';
import { calculateDynamicFare } from '../lib/pricing';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, getGoogleMapsLastError } from '../lib/mapsConfig';
import { googleMapsDarkStyles } from '../lib/weather';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

interface CartProps {
  hideHeader?: boolean;
}

export default function Cart({ hideHeader = false }: CartProps) {
  const { items, totalPrice, updateQuantity, removeItem, clearCart, clearStoreCart, storeIds, storeCarts, activeRestaurantId, setActiveRestaurantId } = useCart();
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Fidelization Config from Superadmin (app_settings -> fidelization)
  const [fidelizationConfig, setFidelizationConfig] = useState<{ pointsPerDollar: number; pointsEnabled: boolean }>({
    pointsPerDollar: 1,
    pointsEnabled: true
  });

  useEffect(() => {
    supabase.from('app_settings').select('*').eq('id', 'fidelization').maybeSingle()
      .then(({ data }) => {
        if (data?.data) {
          setFidelizationConfig({
            pointsPerDollar: data.data.pointsPerDollar !== undefined ? Number(data.data.pointsPerDollar) : 1,
            pointsEnabled: data.data.pointsEnabled !== undefined ? Boolean(data.data.pointsEnabled) : true
          });
        }
      })
      .catch((e) => console.warn('Error fetching fidelization config in Cart:', e));
  }, []);
  const [purchaseConfirmed, setPurchaseConfirmed] = useState<boolean | null>(null);
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
  const [restaurantData, setRestaurantData] = useState<any>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingTable, setIsSyncingTable] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [loadingDistance, setLoadingDistance] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [orderNote, setOrderNote] = useState('');
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCedulaType, setGuestCedulaType] = useState<'V' | 'E' | 'J'>('V');
  const [guestCedula, setGuestCedula] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'app_delivery' | 'own_delivery' | 'pickup'>('app_delivery');

  const isWaiter = localStorage.getItem('isWaiter') === 'true';
  const waiterData = JSON.parse(localStorage.getItem('waiterData') || '{}');
  const waiterRestaurantId = localStorage.getItem('waiterRestaurantId');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');
  
  const { bcvRate } = useCurrency();

  const defaultAddress = userData?.addresses?.find((a: any) => a.isDefault) || userData?.address;
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [showAddressSelector, setShowAddressSelector] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showFullscreenDeliveryMap, setShowFullscreenDeliveryMap] = useState(false);

  const { isLoaded: isMapLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [manualReference, setManualReference] = useState('');

  const fetchCurrentLocation = async () => {
    setIsLocatingGps(true);
    let coords: { lat: number; lng: number } | null = null;
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.requestPermissions();
        if (perm.location === 'granted') {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch (e) {
        console.warn("Native GPS error in Cart:", e);
      }
    }
    if (!coords && typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      } catch (e) {
        console.warn("Web GPS error in Cart:", e);
      }
    }

    const finalCoords = coords || { lat: 8.9326, lng: -67.4264 };
    setGpsCoords(finalCoords);
    setSelectedAddress((prev: any) => ({
      name: prev?.name || 'Ubicación GPS detectada',
      lat: finalCoords.lat,
      lng: finalCoords.lng,
      reference: prev?.reference || manualReference || ''
    }));
    setIsLocatingGps(false);
  };

  useEffect(() => {
    if (currentStep === 2 && !gpsCoords && !isLocatingGps && deliveryMethod !== 'pickup') {
      fetchCurrentLocation();
    }
  }, [currentStep, deliveryMethod]);

  const [restaurantRewards, setRestaurantRewards] = useState<any[]>([]);
  const [selectedReward, setSelectedReward] = useState<any>(null);
  const [pointsPaymentConfig, setPointsPaymentConfig] = useState<Record<string, boolean>>({});
  const [systemSettings, setSystemSettings] = useState<any>(null);

  const [hasDefaultedCredit, setHasDefaultedCredit] = useState(false);
  const [showDemoAlert, setShowDemoAlert] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  useEffect(() => {
    const checkCredits = async () => {
      if (!user?.email) return;
      try {
        const { data: credits } = await supabase
          .from('restaurant_credits')
          .select('status')
          .eq('user_email', user.email);
        const isDefaulted = (credits || []).some((d: any) => d.status === 'defaulted');
        setHasDefaultedCredit(isDefaulted);
      } catch (err) {
        console.error(err);
      }
    };
    checkCredits();
  }, [user]);

  const userRestaurantPoints = userData?.restaurantPoints?.[items[0]?.restaurantId] || 0;

  const totalCartPointsUsed = items.reduce((acc, item) => {
    if (pointsPaymentConfig[item.id] && item.pointsPrice) {
      return acc + (item.pointsPrice * item.quantity);
    }
    return acc;
  }, 0);

  const rewardPointsUsed = selectedReward ? selectedReward.pointsCost : 0;
  const totalPointsUsed = totalCartPointsUsed + rewardPointsUsed;

  const cartSubtotalUSD = items.reduce((acc, item) => {
    if (pointsPaymentConfig[item.id]) return acc;
    return acc + ((item.price || 0) * item.quantity);
  }, 0);

  const isTimeInRange = (time: string, start: string, end: string) => {
    const [h, m] = time.split(':').map(Number);
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const nowTotal = h * 60 + m;
    const sTotal = sh * 60 + sm;
    const eTotal = eh * 60 + em;
    if (sTotal <= eTotal) return nowTotal >= sTotal && nowTotal <= eTotal;
    return nowTotal >= sTotal || nowTotal <= eTotal;
  };

  const calculateTieredRate = (dist: number, tiers: any[]) => {
    if (!tiers || tiers.length === 0) return 2.0;
    const match = tiers.find(t => dist >= t.from && dist <= t.to);
    if (match) return match.price;
    const sorted = [...tiers].sort((a, b) => b.to - a.to);
    return sorted[0]?.price || 2.0;
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data: sDoc } = await supabase
          .from('app_settings')
          .select('*')
          .eq('id', 'delivery_settings')
          .maybeSingle();
        if (sDoc) setSystemSettings(sDoc.data || sDoc.value || sDoc);
      } catch (err) { console.error(err); }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (defaultAddress && !selectedAddress) setSelectedAddress(defaultAddress);
  }, [defaultAddress]);

  useEffect(() => {
    if (isWaiter && items.length > 0 && !tableNumber) {
      const firstItemTable = items[0].table;
      if (firstItemTable) setTableNumber(firstItemTable);
    }
  }, [isWaiter, items, tableNumber]);

  useEffect(() => {
    const fetchRest = async () => {
      if (items.length > 0) {
        setLoadingDistance(true);
        try {
          const { data: rDoc } = await supabase
            .from('comercios')
            .select('*')
            .eq('id', items[0].restaurantId)
            .maybeSingle();

          if (rDoc) {
            const data = {
              id: rDoc.id,
              name: rDoc.name,
              category: rDoc.category,
              whatsapp: rDoc.whatsapp,
              ownDelivery: rDoc.own_delivery ?? rDoc.ownDelivery,
              appDelivery: rDoc.app_delivery ?? rDoc.appDelivery,
              pickupOnly: rDoc.pickup_only ?? rDoc.pickupOnly,
              deliveryRates: rDoc.delivery_rates || rDoc.deliveryRates || [],
              location: rDoc.location,
              ...rDoc
            };
            setRestaurantData(data);
            if (!data.ownDelivery && !data.appDelivery && data.pickupOnly) {
              setDeliveryMethod('pickup');
            } else if (data.ownDelivery && !data.appDelivery) {
              setDeliveryMethod('own_delivery');
            } else if (data.appDelivery) {
              setDeliveryMethod('app_delivery');
            }
            if (selectedAddress && data.location?.coords) {
              const d = calculateDistance(selectedAddress.lat, selectedAddress.lng, data.location.coords.lat, data.location.coords.lng);
              setDistance(d);
            }
          }
          const { data: rewSnap } = await supabase
            .from('rewards')
            .select('*')
            .eq('restaurant_id', items[0].restaurantId)
            .eq('is_active', true);
          if (rewSnap) setRestaurantRewards(rewSnap.map((d: any) => ({ id: d.id, ...d })));
        } catch (err) { console.error(err); } finally { setLoadingDistance(false); }
      }
    };
    fetchRest();
  }, [items, selectedAddress]);

  const calculateDeliveryFeeInfo = () => {
    if (!distance) return { clientFee: 2.00, driverPayout: 1.50, shift: 'day' };
    if (restaurantData?.ownDelivery && restaurantData?.deliveryRates?.length > 0) {
      const matchingRate = restaurantData.deliveryRates.find((rate: any) => distance >= rate.minKm && distance <= rate.maxKm);
      if (matchingRate) return { clientFee: matchingRate.price, driverPayout: matchingRate.price * 0.8, shift: 'own' };
      const maxRange = Math.max(...restaurantData.deliveryRates.map((r: any) => r.maxKm));
      if (distance > maxRange) {
        const lastRate = restaurantData.deliveryRates.sort((a: any, b: any) => b.maxKm - a.maxKm)[0];
        const fee = lastRate.price + (distance - maxRange) * 0.5;
        return { clientFee: fee, driverPayout: fee * 0.8, shift: 'own' };
      }
    }
    if (systemSettings) {
      if (systemSettings.pricingModel === 'smart' || systemSettings.delivery) {
        const fare = calculateDynamicFare({
          serviceType: 'delivery',
          distanceKm: distance,
          settings: systemSettings
        });
        return {
          clientFee: fare.clientTotal,
          driverPayout: fare.driverPayout,
          shift: fare.activeFactors.isNight ? 'night' : 'day'
        };
      }
      const now = new Date();
      const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      let activeShift: 'day' | 'night' = isTimeInRange(currentTimeStr, systemSettings.dayShift?.start || '08:00', systemSettings.dayShift?.end || '20:00') ? 'day' : 'night';
      const shiftConfig = activeShift === 'day' ? systemSettings.dayShift : systemSettings.nightShift;
      if (shiftConfig) {
        return { clientFee: calculateTieredRate(distance, shiftConfig.clientRates), driverPayout: calculateTieredRate(distance, shiftConfig.driverRates), shift: activeShift };
      }
    }
    return { clientFee: Math.max(1, 1 + distance * 0.5), driverPayout: Math.max(0.8, 0.8 + distance * 0.3), shift: 'unknown' };
  };

  const feeInfo = calculateDeliveryFeeInfo();
  const freeDeliveryMin = Number(restaurantData?.free_delivery_min_amount ?? restaurantData?.freeDeliveryMinAmount ?? 0);
  const isFreeDeliveryEnabled = Boolean(restaurantData?.free_delivery_enabled ?? restaurantData?.freeDeliveryEnabled);
  const isFreeDeliveryQualified = isFreeDeliveryEnabled && freeDeliveryMin > 0 && cartSubtotalUSD >= freeDeliveryMin;
  
  const deliveryFee = (isWaiter || deliveryMethod === 'pickup' || isFreeDeliveryQualified) ? 0 : feeInfo.clientFee;
  const driverPayout = (isWaiter || deliveryMethod === 'pickup') ? 0 : feeInfo.driverPayout;
  const currentShift = feeInfo.shift;
  const finalTotal = cartSubtotalUSD;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (!isWaiter && isDemoMode()) {
      setShowDemoAlert(true);
      return;
    }
    if (!isWaiter && !user && (!guestName || !guestPhone || !guestCedula)) { setShowGuestModal(true); return; }
    if (!isWaiter && user && (!userData?.phone || !userData?.cedula)) { alert("Completa tu perfil primero."); navigate('/profile'); return; }
    
    if (!isWaiter && deliveryMethod === 'app_delivery' && !userData?.locationPermissionsAllowed) {
        setShowLocationModal(true);
        return;
    }

    setIsCheckingOut(true);
    setError(null);
    try {
      const restaurantId = items[0].restaurantId;
      const { data: rDoc } = await supabase
        .from('comercios')
        .select('*')
        .eq('id', restaurantId)
        .maybeSingle();
      const rData = rDoc;
      if (!isWaiter && !rData?.whatsapp) throw new Error("No WhatsApp config");

      let addressStr = isWaiter ? `Mesa: ${tableNumber}` : (deliveryMethod === 'pickup' ? "Recoger en local" : (selectedAddress ? `${selectedAddress.name} - ${selectedAddress.reference || ''}` : "Recoger en local"));

      // Sanitize items just in case they have undefined properties
      const sanitizedItems = items.map(item => {
        const i = { ...item, paidWithPoints: !!pointsPaymentConfig[item.id] };
        Object.keys(i).forEach(key => i[key] === undefined && delete i[key]);
        return i;
      });

      let tableId = null;
      if (isWaiter && tableNumber) {
        try {
          const { data: tData } = await supabase
            .from('restaurant_tables')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .eq('number', tableNumber)
            .maybeSingle();
          if (tData) {
            tableId = tData.id;
          }
        } catch (err) {
          console.error("Error fetching tableId:", err);
        }
      }

      const newOrderId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `order_${Date.now()}`;

      let storeCommission = 0.30;
      if (cartSubtotalUSD > 20) {
        storeCommission = 0.75;
      } else if (cartSubtotalUSD >= 10) {
        storeCommission = 0.55;
      } else {
        storeCommission = 0.30;
      }

      const isUUID = (str: any) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
      const validUserId = isUUID(user?.id) ? user.id : (isUUID(user?.uid) ? user.uid : null);

      const clientName = isWaiter ? (customerName || `Cliente Mesa ${tableNumber || 'N/A'}`) : (user?.displayName || guestName || 'Cliente Invitado');
      const clientPhone = isWaiter ? '' : (userData?.phone || (guestPhone ? `+58${guestPhone}` : ''));
      const clientCedula = isWaiter ? '' : (userData?.cedula || (guestCedula ? `${guestCedulaType}-${guestCedula}` : ''));

      const coords = (!isWaiter && deliveryMethod === 'app_delivery' && selectedAddress && selectedAddress.lat)
        ? { lat: Number(selectedAddress.lat), lng: Number(selectedAddress.lng) }
        : null;

      const orderData: any = {
        id: newOrderId,
        user_id: validUserId,
        user_name: clientName,
        user_phone: clientPhone,
        user_cedula: clientCedula,
        client_dni: clientCedula,
        user_email: isWaiter ? (waiterData.email || 'N/A') : (user?.email || 'N/A'),
        restaurant_id: restaurantId,
        restaurant_name: rData?.name || 'Deliexpress Restaurant',
        restaurant_city: rData?.location?.city || '',
        source: isWaiter ? 'waiter' : 'client',
        waiter_id: isWaiter ? (waiterData.id || null) : null,
        waiter_name: isWaiter ? (waiterData.name || null) : null,
        table_number: isWaiter ? (tableNumber || null) : null,
        table_id: isWaiter ? (tableId || null) : null,
        items: sanitizedItems,
        subtotal: cartSubtotalUSD || 0, 
        delivery_fee: deliveryFee || 0, 
        driver_payout: driverPayout || 0, 
        delivery_shift: currentShift || 'day', 
        distance: distance || 0,
        total: finalTotal || 0, 
        commission_amount: storeCommission,
        delivery_method: deliveryMethod,
        order_type: deliveryMethod,
        status: isWaiter ? 'preparing' : 'pendiente_pago', 
        payment_status: isWaiter ? paymentStatus : 'pending',
        notified: false,
        delivery_address: addressStr, 
        shipping_address: coords ? { address: addressStr, lat: coords.lat, lng: coords.lng, reference: selectedAddress?.reference || '' } : { address: addressStr },
        delivery_coords: coords,
        created_at: new Date().toISOString(), 
        notes: orderNote.trim() || '',
        order_note: orderNote.trim() || ''
      };

      // Remove any undefined keys that are not needed
      Object.keys(orderData).forEach(key => (orderData as any)[key] === undefined && delete (orderData as any)[key]);

      const { error: insErr } = await supabase.from('orders').insert(orderData);
      if (insErr) throw insErr;
      setOrderId(newOrderId);
      try {
        localStorage.setItem('active_order_id', newOrderId);
      } catch (e) {}

      // Notificación instantánea para la app del negocio con todos los datos
      if (!isWaiter && restaurantId) {
        try {
          const itemsSummary = Array.isArray(sanitizedItems)
            ? sanitizedItems.map((i: any) => `${i.quantity || 1}x ${i.name}`).join(', ')
            : '';

          await supabase.from('notifications').insert({
            restaurant_id: restaurantId,
            restaurant_name: rData?.name || 'Comercio',
            title: `¡Nuevo Pedido (#${newOrderId.slice(0, 8).toUpperCase()})!`,
            body: `${clientName} ha realizado un nuevo pedido por $${finalTotal.toFixed(2)}. ${itemsSummary ? `Productos: ${itemsSummary}. ` : ''}Método: ${deliveryMethod === 'pickup' ? 'Retiro en Tienda' : 'Delivery'}.`,
            message: `Nuevo pedido de ${clientName} por $${finalTotal.toFixed(2)} (${deliveryMethod === 'pickup' ? 'PickUp' : 'Delivery'})`,
            type: 'order',
            read: false,
            data: {
              order_id: newOrderId,
              order_number: newOrderId.slice(0, 8).toUpperCase(),
              user_name: clientName,
              user_phone: clientPhone,
              user_cedula: clientCedula,
              total: finalTotal,
              subtotal: cartSubtotalUSD,
              delivery_fee: deliveryFee,
              items: sanitizedItems,
              delivery_method: deliveryMethod,
              delivery_address: addressStr,
              delivery_coords: coords,
              order_note: orderNote.trim() || ''
            },
            created_at: new Date().toISOString()
          });
        } catch (notifErr) {
          console.warn("Could not insert notification into notifications table:", notifErr);
        }
      }

      // Contexto automático: Inyectar todo el carrito de compras en el primer mensaje del chat transaccional
      if (!isWaiter) {
          try {
              const itemsListText = items.map(item => {
                const itemNote = (item as any).notes ? ` - 📝 ${(item as any).notes}` : '';
                const variantText = (item as any).variant ? ` [${(item as any).variant}]` : '';
                let modifiersText = '';
                if (item.modifiersConfig) {
                  const mods = Object.entries(item.modifiersConfig).map(([k, v]: [string, any]) => `${k}: ${v.map((o: any) => o.name).join(', ')}`).join(' | ');
                  if (mods) modifiersText = `\n   👉 ${mods}`;
                }
                const priceDisplay = item.consultPrice || !item.price
                  ? 'Consultar precio'
                  : `$${((item.price || 0) * item.quantity).toFixed(2)} (${(((item.price || 0) * item.quantity) * bcvRate).toFixed(2)} Bs)`;
                return `• ${item.quantity}x ${item.name}${variantText} (${priceDisplay})${itemNote}${modifiersText}`;
              }).join('\n');

              const methodLabel = deliveryMethod === 'pickup' ? '🏪 Retiro en tienda (PickUp)' : '🛵 Delivery a domicilio';
              const locationInfo = deliveryMethod === 'pickup'
                ? `📍 Retiro en: ${rData?.address || rData?.location?.address || 'Sede del comercio'}`
                : `📍 Entrega: ${selectedAddress?.name || 'Ubicación GPS'}${selectedAddress?.reference ? `\n🏠 Ref: ${selectedAddress.reference}` : ''}${selectedAddress?.lat ? `\n🗺️ Mapa: https://www.google.com/maps?q=${selectedAddress.lat},${selectedAddress.lng}` : ''}`;

              const cartSummaryMessage = `🛒 *NUEVO PEDIDO GENERADO (#${newOrderId.slice(0, 8).toUpperCase()})*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `${itemsListText}\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📦 *Método de entrega:* ${methodLabel}\n` +
                `${locationInfo}\n` +
                (orderNote.trim() ? `📝 *Nota general:* ${orderNote.trim()}\n` : '') +
                `💵 *Subtotal estimado:* $${cartSubtotalUSD.toFixed(2)} (${(cartSubtotalUSD * bcvRate).toFixed(2)} Bs)\n` +
                (deliveryMethod !== 'pickup' ? `🛵 *Tarifa Delivery estim.:* $${deliveryFee.toFixed(2)} (${(deliveryFee * bcvRate).toFixed(2)} Bs)\n` : '') +
                `💰 *Total estimado:* $${finalTotal.toFixed(2)} (${(finalTotal * bcvRate).toFixed(2)} Bs)\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `⚠️ *Esperando confirmación del comercio para verificar disponibilidad y monto total.*`;

              await supabase.from('messages').insert([
                {
                  order_id: newOrderId,
                  orderId: newOrderId,
                  text: cartSummaryMessage,
                  sender_id: user?.id || 'system',
                  senderId: user?.id || 'system',
                  sender_name: 'Sistema Deliexpress',
                  senderName: 'Sistema Deliexpress',
                  sender_role: 'system',
                  senderRole: 'system',
                  created_at: new Date().toISOString()
                },
                {
                  order_id: newOrderId,
                  orderId: newOrderId,
                  text: `¡Hola! Gracias por tu pedido a ${rData?.name || 'nuestro negocio'}. Estamos revisando la disponibilidad y monto total. Te confirmaremos por este chat.`,
                  sender_id: restaurantId,
                  senderId: restaurantId,
                  sender_name: rData?.name || 'Comercio',
                  senderName: rData?.name || 'Comercio',
                  sender_role: 'restaurant',
                  senderRole: 'restaurant',
                  created_at: new Date(Date.now() + 1000).toISOString()
                }
              ]);
          } catch(e) {
             console.error('Error adding welcome chat message', e);
          }
      }

      // SYNC TABLE STATUS: Mark as occupied
      if (isWaiter && tableId) {
        setIsSyncingTable(true);
        try {
          await supabase.from('restaurant_tables').update({
            status: 'occupied',
            last_order_id: newOrderId,
            updated_at: new Date().toISOString()
          }).eq('id', tableId);
        } catch (tableErr) {
          console.error("Error updating table status:", tableErr);
        } finally {
          setIsSyncingTable(false);
        }
      }

      if (isWaiter) { clearCart(); setCheckoutSuccess(true); setPurchaseConfirmed(true); return; }

      const hasConsultItems = items.some(item => item.consultPrice || !item.price);

      let itemsList = items.map(item => {
        const itemNote = (item as any).notes ? ` - 📝 *Nota:* ${(item as any).notes}` : '';
        const variantText = (item as any).variant ? ` [${(item as any).variant}]` : '';
        
        let modifiersText = '';
        if (item.modifiersConfig) {
           const mods = Object.entries(item.modifiersConfig).map(([k, v]: [string, any]) => `*${k}:* ${v.map((o:any) => o.name).join(', ')}`).join(' | ');
           if (mods) modifiersText = `\n    👉 ${mods}`;
        }

        const isConsult = item.consultPrice || !item.price;
        const priceDisplay = isConsult
          ? 'Consultar precio'
          : `$${((item.price || 0) * item.quantity).toFixed(2)} | ${(((item.price || 0) * item.quantity) * bcvRate).toFixed(2)} Bs`;

        return `• ${item.quantity}x ${item.name}${variantText}${itemNote}${modifiersText} (${priceDisplay})`;
      }).join('\n');
      
      const mapsLink = (deliveryMethod === 'app_delivery' && selectedAddress && selectedAddress.lat) ? `\n🗺️ Ubicación GPS: https://www.google.com/maps?q=${selectedAddress.lat},${selectedAddress.lng}` : '';
      const notesString = orderNote.trim() ? `\n📝 Notas: ${orderNote.trim()}` : '';

      if (!isWaiter && rData?.whatsapp) {
        const number = rData.whatsapp.replace(/\D/g, '');
        const clientName = (user as any)?.displayName || (user as any)?.name || 'Cliente';
        const clientCedula = (user as any)?.cedula || (user as any)?.rif || 'V-No registrada';
        const clientPhone = (user as any)?.phone || selectedAddress?.phone || 'No registrado';
        const deliveryFeeDisplay = deliveryMethod === 'app_delivery' 
          ? 'PAGADO A LA APP / CONDUCTOR (⚠️ NO COBRAR DELIVERY EN LOCAL)' 
          : `$${deliveryFee.toFixed(2)} (${(deliveryFee * bcvRate).toFixed(2)} Bs)`;
        const totalDisplay = `$${finalTotal.toFixed(2)} (${(finalTotal * bcvRate).toFixed(2)} Bs)`;
        const locationDisplay = deliveryMethod === 'pickup' ? 'Retiro en local (PickUp)' : `${addressStr}${mapsLink}`;

        // Determinar plantilla según contexto
        const chosenTemplate = deliveryMethod === 'app_delivery'
          ? (systemSettings?.whatsappMessageTemplateAppDelivery || null)
          : (systemSettings?.whatsappMessageTemplate || null);

        let wpMessage = '';
        if (chosenTemplate) {
          wpMessage = chosenTemplate
            .replace(/\{OrderId\}/g, newOrderId.slice(0, 8))
            .replace(/\{RestaurantName\}/g, rData.name || 'su negocio')
            .replace(/\{UserName\}/g, clientName)
            .replace(/\{Cedula\}/g, clientCedula)
            .replace(/\{UserPhone\}/g, clientPhone)
            .replace(/\{OrderItems\}/g, itemsList)
            .replace(/\{DeliveryFee\}/g, deliveryFeeDisplay)
            .replace(/\{Total\}/g, totalDisplay)
            .replace(/\{LocationText\}/g, locationDisplay)
            .replace(/\{OrderNotes\}/g, notesString);
        } else {
          // Mensaje por defecto contextual
          wpMessage = `Hola, vengo de Deli Express y deseo realizar el siguiente pedido a *${rData.name || 'su negocio'}*:\n\n` +
            `📦 *Productos:*\n${itemsList}\n\n` +
            (deliveryMethod === 'pickup' 
              ? `🛍️ *Método:* Retiro en local (PickUp)` 
              : deliveryMethod === 'app_delivery'
                ? `🛵 *DELIVERY:* PAGADO A LA APP / CONDUCTOR\n⚠️ *NOTA:* La tienda NO debe cobrar delivery al cliente. Ya fue pagado en la app.\n📍 *Entrega:* ${addressStr}${mapsLink}`
                : `🛵 *Delivery:* $${deliveryFee.toFixed(2)} (${(deliveryFee * bcvRate).toFixed(2)} Bs)\n📍 *Entrega:* ${addressStr}${mapsLink}`
            ) +
            (notesString ? `\n${notesString}` : '');

          if (hasConsultItems) {
            wpMessage += `\n\n💬 *Consulta de Precios:* Por favor, ¿podrían indicarme el precio y disponibilidad de los productos marcados como "Consultar precio"?`;
          }

          if (cartSubtotalUSD > 0) {
            wpMessage += `\n\n💵 *Total estimado:* $${finalTotal.toFixed(2)} (${(finalTotal * bcvRate).toFixed(2)} Bs)${hasConsultItems ? ' (+ productos por cotizar)' : ''}`;
          }
        }

        // Guardar plantilla de WhatsApp para botón de respaldo con temporizador en TrackOrder
        try {
          localStorage.setItem(`wa_fallback_${newOrderId}`, JSON.stringify({
            number,
            message: wpMessage,
            restaurantName: rData.name,
            timestamp: Date.now()
          }));
        } catch(e) {}
      }
      
      // Limpiar únicamente el carrito de este comercio para preservar carritos de otras tiendas
      clearStoreCart(restaurantId);
      setPurchaseConfirmed(true);
      setCheckoutSuccess(true);
      
      if (!isWaiter) {
          navigate(`/track/${newOrderId}`);
          return;
      }
      
    } catch (err: any) { 
      console.error('Checkout error:', err);
      setError(err.message || 'Error al procesar la orden. Intente nuevamente.'); 
    } finally { 
      setIsCheckingOut(false); 
    }
  };

  if (checkoutSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${purchaseConfirmed ? 'bg-green-100' : 'bg-red-100'}`}>
          {purchaseConfirmed ? <CheckCircle2 className="w-12 h-12 text-green-500" /> : <Trash2 className="w-12 h-12 text-red-500" />}
        </div>
        <h1 className="text-2xl font-black mb-2">{purchaseConfirmed ? '¡Pedido Confirmado! 🎉' : 'Pedido Cancelado'}</h1>
        <p className="text-slate-500 mb-8">{purchaseConfirmed ? 'Tu orden está siendo enviada a cocina.' : 'Hubo un problema con la confirmación.'}</p>
        <button onClick={() => isWaiter ? navigate('/menu') : navigate('/')} className="w-full max-w-xs bg-primary text-slate-900 py-4 rounded-2xl font-bold shadow-lg">
          {isWaiter ? 'Volver al Menú' : 'Ir al inicio'}
        </button>
      </div>
    );
  }

  const content = (
    <div className="relative flex h-full min-h-screen w-full flex-col bg-background-light overflow-x-hidden">
      {!hideHeader && (
        <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md px-4 py-4 flex items-center border-b border-slate-100">
          <button onClick={() => navigate(-1)} className="p-2"><ArrowLeft /></button>
          <h2 className="flex-1 text-center font-bold">{isWaiter ? 'Comanda' : 'Mi Carrito'}</h2>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-6 pt-4">
        {hasDefaultedCredit && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3 animate-pulse">
            <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
            <div>
              <p className="font-bold text-red-800 text-sm">Tienes cuotas vencidas</p>
              <p className="text-xs text-red-600 mt-1 leading-snug">
                Puedes continuar con tu compra, pero recuerda ponerte al día con tus compromisos en "Mis Cuotas 2x3" para evitar que el establecimiento suspenda tus beneficios de crédito.
              </p>
            </div>
          </div>
        )}

        {storeIds.length > 1 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                🛍️ Tienes carritos en {storeIds.length} comercios
              </span>
              <span className="text-[10px] font-bold text-amber-700 bg-white px-2 py-0.5 rounded-full border border-amber-200">
                Cobro por comercio
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
              {storeIds.map(sId => {
                const sItems = storeCarts[sId] || [];
                const isCurrent = sId === activeRestaurantId;
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => setActiveRestaurantId(sId)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isCurrent 
                        ? 'bg-slate-900 text-white shadow-md' 
                        : 'bg-white text-slate-700 border border-amber-200 hover:bg-amber-100/50'
                    }`}
                  >
                    <span>🏪 {sItems[0]?.name ? `${sItems.length} items` : 'Comercio'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingCart className="w-16 h-16 mx-auto text-slate-200 mb-4" />
            <p className="text-slate-500">Carrito vacío</p>
          </div>
        ) : (
          <>
            {currentStep === 1 && (
              <div className="space-y-4">
                {items.map(item => (
                  <div key={item.id} className="flex flex-col bg-white p-4 rounded-[28px] shadow-sm border border-slate-100/80 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="flex gap-4">
                      <img src={item.image} className="size-20 rounded-2xl object-cover shadow-sm" />
                      <div className="flex-1">
                         <div className="flex justify-between items-start mb-1 gap-2">
                           <p className="font-black text-slate-800 text-sm leading-tight">{item.name}</p>
                           {item.consultPrice || !item.price ? (
                             <span className="text-[11px] font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 shrink-0">
                               Consultar
                             </span>
                           ) : (
                             <DualPrice usdAmount={item.price || 0} usdClassName="text-slate-900 font-black text-sm" showDivider={false} />
                           )}
                         </div>
                         {(item as any).variant && (
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Variante: {(item as any).variant}</p>
                         )}
                         {item.modifiersConfig && Object.entries(item.modifiersConfig).map(([modName, selectedMods]: [string, any]) => (
                            <div key={modName} className="text-[10px] font-medium text-slate-400 mb-1 leading-tight">
                                <span className="font-bold text-slate-500">{modName}:</span> {selectedMods.map((o: any) => o.name).join(', ')}
                            </div>
                         ))}
                         <div className="flex items-center gap-3 mt-1">
                           <div className="flex items-center bg-slate-50 rounded-full border border-slate-100 p-0.5">
                             <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="size-8 bg-white shadow-sm rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 active:scale-90 transition-all">-</button>
                             <span className="w-8 text-center font-black text-sm text-slate-700">{item.quantity}</span>
                             <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="size-8 bg-primary text-slate-900 shadow-md rounded-full flex items-center justify-center active:scale-90 transition-all">+</button>
                           </div>
                           <button onClick={() => removeItem(item.id)} className="ml-auto w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 active:scale-90 transition-all">
                             <Trash2 className="w-4 h-4" />
                           </button>
                         </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-50">
                        <input 
                          type="text" 
                          placeholder="Instrucciones especiales para este plato..."
                          value={(item as any).notes || ''}
                          onChange={(e) => {
                            (item as any).notes = e.target.value;
                            updateQuantity(item.id, item.quantity);
                          }}
                          className="w-full bg-slate-50/50 border border-slate-200/50 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-600 outline-none focus:border-primary/30 transition-all"
                        />
                    </div>
                  </div>
                ))}
                <textarea 
                  placeholder="Notas adicionales para el pedido..." 
                  value={orderNote} 
                  onChange={e => setOrderNote(e.target.value)}
                  className="w-full bg-white border border-slate-100 rounded-[28px] p-5 text-sm min-h-[120px] outline-none focus:border-primary/30 shadow-sm transition-all"
                />
                <button onClick={() => setCurrentStep(2)} className="w-full bg-primary text-slate-900 py-5 rounded-[22px] font-black uppercase tracking-widest shadow-xl shadow-primary/10 hover:scale-[1.01] active:scale-95 transition-all">Siguiente</button>
              </div>
            )}
            {currentStep === 2 && (
              <div className="space-y-6">
                {isWaiter ? (
                  <div className="space-y-4">
                    <input placeholder="Mesa" value={tableNumber} onChange={e => setTableNumber(e.target.value)} className="w-full p-4 bg-white rounded-2xl border border-slate-100" />
                    <input placeholder="Cliente" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-4 bg-white rounded-2xl border border-slate-100" />
                  </div>
                ) : (
                  <div className="space-y-5">
                     {/* 2 Opciones de Entrega: Minimalistas de Bloque Grande */}
                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                         Selecciona tu Método de Entrega
                       </label>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                         {/* 1. Retiro en Tienda (Pickup sin costo) */}
                         <button
                           type="button"
                           onClick={() => setDeliveryMethod('pickup')}
                           className={`p-5 rounded-3xl border-2 transition-all flex items-center gap-4 text-left cursor-pointer ${
                             deliveryMethod === 'pickup'
                               ? 'border-primary bg-primary/10 text-slate-900 shadow-md ring-2 ring-primary/30 font-black'
                               : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 font-bold'
                           }`}
                         >
                           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${deliveryMethod === 'pickup' ? 'bg-primary text-slate-900 shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                             <Store className="w-7 h-7" />
                           </div>
                           <div className="min-w-0 flex-1">
                             <span className="block text-sm font-black uppercase tracking-wider text-slate-900">Retiro en Tienda</span>
                             <span className="block text-xs font-bold text-emerald-600 mt-0.5">Pickup sin costo</span>
                           </div>
                         </button>

                         {/* 2. Delivery a tu Dirección */}
                         <button
                           type="button"
                           onClick={() => {
                             setDeliveryMethod('app_delivery');
                             fetchCurrentLocation();
                             setShowFullscreenDeliveryMap(true);
                           }}
                           className={`p-5 rounded-3xl border-2 transition-all flex items-center gap-4 text-left cursor-pointer ${
                             deliveryMethod !== 'pickup'
                               ? 'border-primary bg-primary/10 text-slate-900 shadow-md ring-2 ring-primary/30 font-black'
                               : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 font-bold'
                           }`}
                         >
                           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${deliveryMethod !== 'pickup' ? 'bg-primary text-slate-900 shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                             <Bike className="w-7 h-7" />
                           </div>
                           <div className="min-w-0 flex-1">
                             <span className="block text-sm font-black uppercase tracking-wider text-slate-900">Delivery a tu Dirección</span>
                             <span className="block text-xs font-bold text-slate-400 mt-0.5">Ubicación GPS en vivo</span>
                           </div>
                         </button>
                       </div>
                     </div>

                     {/* Vista Retiro en Tienda */}
                     {deliveryMethod === 'pickup' && (
                       <div className="p-6 bg-blue-50/70 rounded-3xl border border-blue-100 text-center animate-in fade-in slide-in-from-bottom-2 space-y-2.5">
                         <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-1">
                           <Store className="w-6 h-6" />
                         </div>
                         <p className="font-black text-slate-900 text-sm uppercase tracking-tight">Retiro en Mostrador</p>
                         <p className="text-xs font-bold text-slate-600 max-w-xs mx-auto leading-relaxed">
                           {restaurantData?.address || restaurantData?.location?.address || 'Dirección de la sede del negocio'}
                         </p>
                         <span className="inline-block bg-blue-100 text-blue-800 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                           Sin costo de envío
                         </span>
                       </div>
                     )}

                     {/* Vista Delivery: Resumen y botón para ajustar en mapa */}
                     {deliveryMethod !== 'pickup' && (
                       <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                         <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
                           <div className="flex items-center justify-between">
                             <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                               <MapPin className="w-3.5 h-3.5 text-primary" /> Ubicación GPS de Entrega
                             </span>
                             <button
                               type="button"
                               onClick={() => {
                                 fetchCurrentLocation();
                                 setShowFullscreenDeliveryMap(true);
                               }}
                               className="text-xs font-black text-primary hover:underline flex items-center gap-1 cursor-pointer"
                             >
                               <Navigation className="w-3.5 h-3.5" /> Abrir Mapa Completo
                             </button>
                           </div>

                           <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                             <div>
                               <p className="font-black text-xs text-slate-800">
                                 {selectedAddress?.name || 'Ubicación GPS Detectada'}
                               </p>
                               {manualReference && (
                                 <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                                   Ref: {manualReference}
                                 </p>
                               )}
                             </div>
                             <button
                               type="button"
                               onClick={() => setShowFullscreenDeliveryMap(true)}
                               className="px-3 py-1.5 bg-white text-slate-900 text-[11px] font-black rounded-xl border border-slate-200 shadow-xs hover:bg-slate-100 cursor-pointer"
                             >
                               Ajustar
                             </button>
                           </div>
                         </div>
                       </div>
                     )}

                     <button 
                       type="button"
                       onClick={() => {
                           if (!isWaiter && deliveryMethod !== 'pickup' && (!selectedAddress || !selectedAddress.lat) && restaurantData?.businessType !== 'hotel') {
                               if (gpsCoords) {
                                 setSelectedAddress({
                                   name: 'Ubicación GPS detectada',
                                   lat: gpsCoords.lat,
                                   lng: gpsCoords.lng,
                                   reference: manualReference
                                 });
                               } else {
                                 setShowFullscreenDeliveryMap(true);
                                 return;
                               }
                           }
                           setCurrentStep(3);
                       }} 
                       className="w-full bg-primary text-slate-900 py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all mt-2 cursor-pointer"
                     >
                       Confirmar Datos y Continuar
                     </button>
                  </div>
                )}
              </div>
            )}
            {currentStep === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                    {restaurantData?.businessType === 'hotel' ? 'Tu Reservación' : 'Tu Pedido'}
                    <span className="text-slate-900 text-sm bg-primary/10 px-3 py-1 rounded-full uppercase tracking-widest">{items.length} {restaurantData?.businessType === 'hotel' ? 'servicios' : 'items'}</span>
                  </h1>
                  <Link to={`/restaurant/${items[0].restaurantId}`} className="text-sm font-bold text-slate-400 hover:text-slate-600 underline underline-offset-4">
                    {restaurantData?.businessType === 'hotel' ? '+ Añadir servicios' : '+ Seguir pidiendo'}
                  </Link>
                </div>

                <div className="bg-white rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-4">Resumen del Pedido</h3>
                    <div className="space-y-4">
                      {items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <p className="font-bold text-slate-700 text-sm leading-tight">
                              <span className="text-slate-900 font-black mr-2">{item.quantity}x</span>
                              {item.name}
                            </p>
                            {(item as any).variant && (
                              <p className="text-[10px] text-slate-900 font-bold uppercase tracking-wider mt-0.5">{(item as any).variant}</p>
                            )}
                            {item.modifiersConfig && Object.entries(item.modifiersConfig).map(([modName, selectedMods]: [string, any]) => (
                                <p key={modName} className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                                    <span className="font-bold text-slate-600">{modName}:</span> {selectedMods.map((o: any) => o.name).join(', ')}
                                </p>
                            ))}
                            {(item as any).notes && (
                              <p className="text-[10px] text-slate-400 font-medium italic mt-0.5">Nota: "{ (item as any).notes }"</p>
                            )}
                          </div>
                          {item.consultPrice || !item.price ? (
                            <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 shrink-0">
                              Consultar precio
                            </span>
                          ) : (
                            <DualPrice usdAmount={(item.price || 0) * item.quantity} usdClassName="font-black text-slate-900 text-sm" showDivider={false} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-slate-900" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Entrega en</p>
                        <p className="text-sm font-bold text-slate-700 leading-tight">
                          {isWaiter ? `Mesa ${tableNumber}` : (deliveryMethod === 'pickup' ? 'PickUp' : selectedAddress?.name)}
                        </p>
                        {!isWaiter && deliveryMethod === 'delivery' && selectedAddress?.reference && (
                          <p className="text-[11px] text-slate-400 font-medium mt-1 italic leading-tight">Ref: {selectedAddress.reference}</p>
                        )}
                      </div>
                      {!isWaiter && (
                        <button onClick={() => setCurrentStep(2)} className="text-[10px] font-black text-slate-900 uppercase tracking-widest bg-primary/5 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-all">Editar</button>
                      )}
                    </div>

                    {orderNote.trim() && (
                      <div className="flex items-start gap-3 pt-4 border-t border-slate-50">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notas Generales</p>
                          <p className="text-sm font-medium text-slate-600 italic leading-snug">"{orderNote}"</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dynamic Incentives Banners */}
                  {(() => {
                    if (!fidelizationConfig.pointsEnabled) return null;
                    const pointsToEarn = Math.floor(cartSubtotalUSD * (fidelizationConfig.pointsPerDollar || 1));
                    const businessName = restaurantData?.name || 'este establecimiento';
                    const userGender = userData?.gender || 'masculine';
                    const selfDone = userGender === 'feminine' ? 'misma' : 'mismo';

                    if (deliveryMethod === 'pickup') {
                      return (
                        <div className="p-4 mx-6 mb-4 bg-blue-50 text-blue-800 rounded-2xl border border-blue-200 flex gap-3 text-sm animate-in fade-in slide-in-from-top-2">
                          <Gift className="w-8 h-8 text-blue-500 shrink-0" />
                          <div>
                            <span className="font-black text-sm block mb-1">¡Muy bien lo harás tú {selfDone}! 🛍️</span>
                            <span className="font-medium">
                              En la siguiente sección te comunicarás con <b>{businessName}</b> para realizar tu compra en Un 2x3. 
                              Al retirar tu pedido en {businessName} ganarás <b className="text-blue-600">{pointsToEarn} puntos</b> para increíbles premios en el futuro o canjearlos por productos de {businessName}.
                            </span>
                          </div>
                        </div>
                      );
                    }

                    if (deliveryMethod === 'app_delivery' || deliveryMethod === 'own_delivery') {
                      return (
                        <>
                          {deliveryMethod === 'app_delivery' && (
                            <div className="p-4 mx-6 mb-2 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 flex gap-3 text-sm animate-in fade-in slide-in-from-top-2">
                              <Award className="w-8 h-8 text-emerald-600 shrink-0" />
                              <div>
                                <span className="font-black text-sm block mb-1">¡Ganarás puntos por esta compra! 🏆</span>
                                <span className="font-medium">
                                  Al completar esta orden por Un 2x3, acumularás <b className="text-emerald-600">{pointsToEarn} puntos</b> que podrás canjear próximamente por premios y productos.
                                </span>
                              </div>
                            </div>
                          )}
                          
                          {deliveryMethod === 'own_delivery' && (
                            <div className="p-4 mx-6 mb-2 bg-orange-50 text-orange-800 rounded-2xl border border-orange-200 flex gap-3 text-sm animate-in fade-in slide-in-from-top-2">
                              <AlertCircle className="w-8 h-8 text-orange-500 shrink-0" />
                              <div>
                                <span className="font-black text-sm block mb-1">Aviso de Delivery Independiente</span>
                                <span className="font-medium">
                                  Lamentablemente <b>{businessName}</b> no está afiliado al sistema de delivery de Un 2x3 y por eso no puedes recibir los puntos correspondientes al servicio de delivery de Un 2x3, el envío es mutuo acuerdo con {businessName}.
                                </span>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    }
                    return null;
                  })()}

                  {/* Tarjeta Limpia de Resumen de Productos y Total */}
                  <div className="p-6 bg-slate-50/80 border-t border-slate-100 text-slate-900 rounded-b-3xl">
                    <div className="space-y-4">
                      {/* Subtotal Productos */}
                      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <div>
                          <span className="text-xs uppercase tracking-wider text-slate-500 font-black block">
                            {restaurantData?.businessType === 'hotel' ? 'Subtotal Servicios' : 'Subtotal Productos'}
                          </span>
                          <span className="text-[11px] font-bold text-slate-400 block mt-0.5">
                            Pago a {restaurantData?.name || 'la tienda'}
                          </span>
                        </div>
                        <div className="text-right">
                          {items.some(i => i.consultPrice || !i.price) ? (
                            cartSubtotalUSD > 0 ? (
                              <>
                                <div className="flex items-baseline justify-end gap-1.5">
                                  <DualPrice usdAmount={cartSubtotalUSD} usdClassName="text-xl font-black text-slate-900" bsClassName="text-[10px] text-slate-500 font-bold" showDivider={false} />
                                  <span className="text-xs font-black text-amber-600">+ Consultar</span>
                                </div>
                                <span className="text-[10px] block mt-1 text-amber-600 font-bold">Incluye productos por consultar</span>
                              </>
                            ) : (
                              <>
                                <span className="text-lg font-black text-amber-600">Consultar precio</span>
                                <span className="text-[10px] block mt-0.5 text-slate-400 font-medium">Acordado con el comercio</span>
                              </>
                            )
                          ) : (
                            <DualPrice usdAmount={cartSubtotalUSD} usdClassName="text-2xl font-black text-slate-900" bsClassName="text-xs text-slate-500 font-bold" showDivider={false} />
                          )}
                        </div>
                      </div>

                      {/* Tarjeta Luminosa y Estética de Atención y Chat Directo */}
                      {!isWaiter && restaurantData?.businessType !== 'hotel' && (
                        <div className="bg-white border-2 border-primary/40 p-4.5 rounded-2xl shadow-sm relative overflow-hidden">
                          <div className="flex items-start gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-primary text-slate-950 flex items-center justify-center shrink-0 shadow-md">
                              <MessageCircle className="w-6 h-6 stroke-[2.2]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                                  Canal Directo con la Tienda
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  En Vivo
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                                Tu compra se gestiona en tiempo real mediante el <strong className="text-slate-900 font-bold">Chat en Vivo</strong> con {restaurantData?.name || 'el comercio'}. Allí coordinas entrega, opciones de transporte, confirmación y estatus.
                              </p>
                              <div className="mt-3 flex items-center gap-2 text-[11px] font-black text-slate-800 bg-amber-50/90 px-3 py-2 rounded-xl border border-amber-200/60">
                                💬 Al confirmar entrarás directo al chat para dar seguimiento y administrar tu compra.
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => navigate(`/restaurant/${items[0].restaurantId}`)} 
                    className="w-full bg-white border-2 border-slate-100 text-slate-600 py-4 rounded-[22px] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar algo más
                  </button>
                  
                  {isWaiter && (
                    <div className="flex gap-2 mb-2">
                      <button onClick={() => setPaymentStatus('pending')} className={`flex-1 py-4 rounded-[22px] font-black uppercase tracking-widest text-[10px] border-2 transition-all ${paymentStatus === 'pending' ? 'border-amber-500 bg-amber-50 text-amber-600 shadow-md' : 'border-slate-100 text-slate-400'}`}>Por Pagar</button>
                      <button onClick={() => setPaymentStatus('paid')} className={`flex-1 py-4 rounded-[22px] font-black uppercase tracking-widest text-[10px] border-2 transition-all ${paymentStatus === 'paid' ? 'border-emerald-500 bg-emerald-50 text-emerald-600 shadow-md' : 'border-slate-100 text-slate-400'}`}>Pagado</button>
                    </div>
                  )}

                  {error && (
                    <div className="p-4 bg-red-50 text-red-500 rounded-2xl border border-red-100 font-bold text-xs text-center">
                      {error}
                    </div>
                  )}

                  <button 
                    onClick={handleCheckout} 
                    disabled={isCheckingOut || isSyncingTable} 
                    className="w-full bg-primary text-slate-900 py-5 rounded-[22px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isCheckingOut || isSyncingTable ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                        {isSyncingTable ? 'Actualizando Mesa...' : 'Procesando...'}
                      </span>
                    ) : (
                      <>
                        {restaurantData?.businessType === 'hotel' ? <CheckCircle2 className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
                        {isWaiter ? 'Enviar Comanda' : (restaurantData?.businessType === 'hotel' ? 'Confirmar Reservación' : 'Entrar al Chat y Administrar Compra')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <DemoAlertModal 
        isOpen={showDemoAlert} 
        onClose={() => setShowDemoAlert(false)} 
      />

      {showGuestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Datos del Cliente</h3>
                <p className="text-[11px] text-slate-500 font-medium">Requeridos para entregar tu pedido</p>
              </div>
              <button
                onClick={() => setShowGuestModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Nombre completo</label>
                <input
                  placeholder="Ej: María González"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Cédula de Identidad</label>
                <div className="space-y-1.5">
                  <div className="flex gap-1.5">
                    {(['V', 'E', 'J'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setGuestCedulaType(type)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
                          guestCedulaType === type
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {type}-
                      </button>
                    ))}
                  </div>
                  <input
                    placeholder="12345678"
                    value={guestCedula}
                    onChange={e => setGuestCedula(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Teléfono (WhatsApp)</label>
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:border-primary">
                  <span className="px-3 py-2.5 bg-slate-100 border-r border-slate-200 text-xs font-black text-slate-700 select-none">
                    🇻🇪 +58
                  </span>
                  <input
                    type="tel"
                    placeholder="4121234567"
                    value={guestPhone}
                    onChange={e => setGuestPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-transparent px-3 py-2.5 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  if (!guestName || !guestCedula || !guestPhone) {
                    alert("Por favor completa todos los campos.");
                    return;
                  }
                  setShowGuestModal(false);
                  handleCheckout();
                }}
                className="w-full bg-primary text-slate-900 py-3 rounded-2xl font-black text-xs uppercase tracking-wider active:scale-95 shadow-lg shadow-primary/20"
              >
                Continuar con el pedido
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowGuestModal(false);
                  navigate('/profile');
                }}
                className="w-full py-2.5 border border-primary/30 bg-primary/10 hover:bg-primary/20 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <span>¿Deseas registrarte o guardar tus datos?</span>
                <span className="text-primary font-black underline">Ir al Perfil</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Google Maps Pantalla Completa para Selección de Delivery */}
      {showFullscreenDeliveryMap && (
        <div className="fixed inset-0 z-[120] bg-slate-900 flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden">
          {/* Top Floating Bar */}
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-3 pointer-events-none">
            <button
              type="button"
              onClick={() => setShowFullscreenDeliveryMap(false)}
              className="pointer-events-auto w-11 h-11 rounded-2xl bg-white/95 backdrop-blur-md text-slate-900 shadow-xl flex items-center justify-center hover:bg-white active:scale-95 transition-all border border-black/10 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="pointer-events-auto bg-white/95 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border border-black/10 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase text-slate-900 tracking-wider">Ubicación de Entrega</span>
            </div>
            <button
              type="button"
              onClick={fetchCurrentLocation}
              disabled={isLocatingGps}
              className="pointer-events-auto w-11 h-11 rounded-2xl bg-white/95 backdrop-blur-md text-primary shadow-xl flex items-center justify-center hover:bg-white active:scale-95 transition-all border border-black/10 cursor-pointer"
              title="Centrar en mi GPS"
            >
              {isLocatingGps ? <Loader2 className="w-5 h-5 animate-spin" /> : <Navigation className="w-5 h-5" />}
            </button>
          </div>

          {/* Map Area */}
          <div className="flex-1 w-full h-full relative">
            {isMapLoaded && (gpsCoords || selectedAddress?.lat) ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={gpsCoords || { lat: selectedAddress?.lat || 8.9326, lng: selectedAddress?.lng || -67.4264 }}
                zoom={17}
                onClick={(e) => {
                  if (e.latLng) {
                    const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                    setGpsCoords(newPos);
                  }
                }}
                options={{
                  disableDefaultUI: true,
                  zoomControl: false,
                  streetViewControl: false,
                  mapTypeControl: false,
                  fullscreenControl: false,
                  styles: googleMapsDarkStyles
                }}
              >
                <Marker 
                  position={gpsCoords || { lat: selectedAddress?.lat || 8.9326, lng: selectedAddress?.lng || -67.4264 }}
                  draggable={true}
                  onDragEnd={(e) => {
                    if (e.latLng) {
                      setGpsCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                    }
                  }}
                />
              </GoogleMap>
            ) : loadError ? (
              <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-white">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                  <MapPin className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black mb-1">
                  {getGoogleMapsLastError()?.message || "Error al cargar Google Maps"}
                </h3>
                {getGoogleMapsLastError()?.action && (
                  <p className="text-xs text-slate-400 max-w-xs mb-4 leading-relaxed">
                    {getGoogleMapsLastError()?.action}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-primary text-slate-950 rounded-xl text-xs font-black cursor-pointer hover:bg-yellow-400"
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-white">
                <div className="w-16 h-16 rounded-3xl bg-primary/20 text-primary flex items-center justify-center mb-4">
                  <MapPin className="w-8 h-8 animate-bounce" />
                </div>
                <h3 className="text-lg font-black mb-1">Localizando tu Posición GPS</h3>
                <p className="text-xs text-slate-400 max-w-xs mb-4">
                  {isLocatingGps ? 'Obteniendo coordenadas satelitales...' : 'Ubicación GPS fijada en pantalla.'}
                </p>
                <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3 text-[11px] font-mono text-primary mb-3">
                  Lat: {gpsCoords?.lat?.toFixed(5) || 'Detectando...'} | Lng: {gpsCoords?.lng?.toFixed(5) || 'Detectando...'}
                </div>
                <button
                  type="button"
                  onClick={fetchCurrentLocation}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Actualizar Coordenadas
                </button>
              </div>
            )}
          </div>

          {/* Bottom Floating Control: Reference Input & Confirm Button */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent z-20 space-y-3">
            <div className="max-w-md mx-auto space-y-3">
              <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3.5 shadow-2xl border border-white/20">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" /> Punto de Referencia (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Casa blanca con rejas, frente a la farmacia, timbre negro..."
                  value={manualReference}
                  onChange={(e) => setManualReference(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-primary p-3 rounded-xl outline-none font-bold text-xs text-slate-800 transition-all placeholder:text-slate-400"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const targetCoords = gpsCoords || { lat: 8.9326, lng: -67.4264 };
                  setSelectedAddress({
                    name: 'Ubicación GPS confirmada',
                    lat: targetCoords.lat,
                    lng: targetCoords.lng,
                    reference: manualReference
                  });
                  setShowFullscreenDeliveryMap(false);
                  setCurrentStep(3);
                }}
                className="w-full bg-primary text-slate-900 py-4.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-primary/30 active:scale-95 hover:bg-yellow-400 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-5 h-5 stroke-[3]" /> Confirmar Datos
              </button>
            </div>
          </div>
        </div>
      )}

      {showMapPicker && (
          <AddressPicker 
              onClose={() => setShowMapPicker(false)}
              onSave={(data) => {
                  setSelectedAddress(data);
                  setShowMapPicker(false);
              }}
              initialData={selectedAddress}
          />
      )}
      <DemoAlertModal 
          isOpen={showDemoAlert} 
          onClose={() => setShowDemoAlert(false)} 
      />
      <LocationRequiredModal 
          isOpen={showLocationModal} 
          onClose={() => setShowLocationModal(false)} 
      />
    </div>
  );

  return content;
}
