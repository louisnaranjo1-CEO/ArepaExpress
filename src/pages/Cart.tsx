import { ArrowLeft, ShoppingCart, MapPin, CreditCard, Trash2, Minus, Plus, ArrowRight, CheckCircle2, Gift } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, getDocs, query, where, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { calculateDistance, formatDistance } from '../lib/geo';
import AddressPicker from '../components/AddressPicker';

export default function Cart() {
  const { items, totalPrice, updateQuantity, removeItem, clearCart } = useCart();
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [purchaseConfirmed, setPurchaseConfirmed] = useState<boolean | null>(null);
  const [restaurantData, setRestaurantData] = useState<any>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [loadingDistance, setLoadingDistance] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [orderNote, setOrderNote] = useState('');
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCedula, setGuestCedula] = useState('');

  // Helper: check if current time is within a shift range
  const isTimeInRange = (time: string, start: string, end: string) => {
    const [h, m] = time.split(':').map(Number);
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);

    const nowTotal = h * 60 + m;
    const sTotal = sh * 60 + sm;
    const eTotal = eh * 60 + em;

    if (sTotal <= eTotal) {
      return nowTotal >= sTotal && nowTotal <= eTotal;
    } else {
      // Shift spans over midnight
      return nowTotal >= sTotal || nowTotal <= eTotal;
    }
  };

  // Helper: calculate rate based on tiered ranges
  const calculateTieredRate = (dist: number, tiers: any[]) => {
    if (!tiers || tiers.length === 0) return 2.0;
    const match = tiers.find(t => dist >= t.from && dist <= t.to);
    if (match) return match.price;

    // Fallback: If distance exceeds all ranges, use the highest one
    const sorted = [...tiers].sort((a, b) => b.to - a.to);
    return sorted[0]?.price || 2.0;
  };

  const isWaiter = localStorage.getItem('isWaiter') === 'true';
  const waiterData = JSON.parse(localStorage.getItem('waiterData') || '{}');
  const waiterRestaurantId = localStorage.getItem('waiterRestaurantId');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');

  const defaultAddress = userData?.addresses?.find((a: any) => a.isDefault) || userData?.address;
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [showAddressSelector, setShowAddressSelector] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [restaurantRewards, setRestaurantRewards] = useState<any[]>([]);
  const [selectedReward, setSelectedReward] = useState<any>(null);

  const handleUseCurrentLocation = () => {
    setShowAddressSelector(false);
    setShowMapPicker(true);
  };

  const handleSaveAddressFromMap = (data: { name: string; lat: number; lng: number; reference: string }) => {
    const locationAddress = {
      id: `map-${Date.now()}`,
      name: data.name,
      lat: data.lat,
      lng: data.lng,
      reference: data.reference,
      isDefault: false
    };
    setSelectedAddress(locationAddress);
    setShowMapPicker(false);
  };

  useEffect(() => {
    if (defaultAddress && !selectedAddress) {
      setSelectedAddress(defaultAddress);
    }
  }, [defaultAddress]);

  const [systemSettings, setSystemSettings] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const sDoc = await getDoc(doc(db, 'delivery_settings', 'settings'));
        if (sDoc.exists()) {
          setSystemSettings(sDoc.data());
        }
      } catch (err) {
        console.error("Error fetching system delivery settings:", err);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (isWaiter && items.length > 0 && !tableNumber) {
      const firstItemTable = items[0].table;
      if (firstItemTable) {
        setTableNumber(firstItemTable);
      }
    }
  }, [isWaiter, items, tableNumber]);

  useEffect(() => {
    const fetchRest = async () => {
      if (items.length > 0) {
        setLoadingDistance(true);
        try {
          const rDoc = await getDoc(doc(db, 'restaurants', items[0].restaurantId));
          if (rDoc.exists()) {
            const data = rDoc.data();
            setRestaurantData(data);

            if (selectedAddress && data.location?.coords) {
              const d = calculateDistance(
                selectedAddress.lat,
                selectedAddress.lng,
                data.location.coords.lat,
                data.location.coords.lng
              );
              setDistance(d);
            }
          }
          
          const rewSnap = await getDocs(query(collection(db, 'restaurants', items[0].restaurantId, 'rewards'), where('isActive', '==', true)));
          setRestaurantRewards(rewSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          
        } catch (err) {
          console.error("Error fetching restaurant for distance:", err);
        } finally {
          setLoadingDistance(false);
        }
      }
    };
    fetchRest();
  }, [items, selectedAddress]);

  const calculateDeliveryFeeInfo = () => {
    if (!distance) return { clientFee: 2.00, driverPayout: 1.50, shift: 'day' };

    // 1. Restaurant's own delivery logic (Overrides system if enabled)
    if (restaurantData?.ownDelivery && restaurantData?.deliveryRates && restaurantData.deliveryRates.length > 0) {
      const matchingRate = restaurantData.deliveryRates.find(
        (rate: any) => distance >= rate.minKm && distance <= rate.maxKm
      );
      if (matchingRate) return { clientFee: matchingRate.price, driverPayout: matchingRate.price * 0.8, shift: 'own' };

      const maxRange = Math.max(...restaurantData.deliveryRates.map((r: any) => r.maxKm));
      if (distance > maxRange) {
        const lastRate = restaurantData.deliveryRates.sort((a: any, b: any) => b.maxKm - a.maxKm)[0];
        const fee = lastRate.price + (distance - maxRange) * 0.5;
        return { clientFee: fee, driverPayout: fee * 0.8, shift: 'own' };
      }
    }

    // 2. Multi-Shift System Delivery (Standard)
    if (systemSettings) {
      const now = new Date();
      const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Default to day shift if something fails
      let activeShift: 'day' | 'night' = 'day';
      if (systemSettings.dayShift && systemSettings.nightShift) {
        const isDay = isTimeInRange(currentTimeStr, systemSettings.dayShift.start, systemSettings.dayShift.end);
        activeShift = isDay ? 'day' : 'night';
      }

      const shiftConfig = activeShift === 'day' ? systemSettings.dayShift : systemSettings.nightShift;

      if (shiftConfig) {
        const clientFee = calculateTieredRate(distance, shiftConfig.clientRates);
        const driverPayout = calculateTieredRate(distance, shiftConfig.driverRates);
        return { clientFee, driverPayout, shift: activeShift };
      }
    }

    // Fallback default
    return {
      clientFee: Math.max(1, 1 + distance * 0.5),
      driverPayout: Math.max(0.8, 0.8 + distance * 0.3),
      shift: 'unknown'
    };
  };

  const feeInfo = calculateDeliveryFeeInfo();
  const deliveryFee = isWaiter ? 0 : feeInfo.clientFee;
  const driverPayout = isWaiter ? 0 : feeInfo.driverPayout;
  const currentShift = feeInfo.shift;

  const finalTotal = totalPrice + deliveryFee;

  const handleCheckout = async () => {
    if (items.length === 0) return;

    if (!isWaiter && !user) {
      if (!guestName || !guestPhone || !guestCedula) {
        setShowGuestModal(true);
        return;
      }
    }

    if (!isWaiter && user && (!userData?.phone || !userData?.cedula)) {
      alert("Debes completar tu perfil (Celular y Cédula) en la sección de tu cuenta antes de hacer un pedido.");
      navigate('/profile');
      return;
    }

    setIsCheckingOut(true);
    setError(null);

    try {
      // 1. Fetch restaurant data (specifically WhatsApp)
      const restaurantId = items[0].restaurantId;
      const restaurantDoc = await getDoc(doc(db, 'restaurants', restaurantId));
      const restaurantData = restaurantDoc.exists() ? restaurantDoc.data() : null;

      if (!isWaiter && !restaurantData?.whatsapp) {
        throw new Error("El restaurante no tiene un número de WhatsApp configurado.");
      }

      // Use user's address from context if available
      const address = isWaiter ? `Mesa: ${tableNumber}` : (selectedAddress?.reference || "Recoger en local");

      const orderData = {
        userId: isWaiter ? waiterData.id : (user?.uid || 'guest_' + Date.now()),
        userName: isWaiter ? (customerName || `Cliente Mesa ${tableNumber}`) : (user?.displayName || guestName || 'Cliente Invitado'),
        userPhone: isWaiter ? '' : (userData?.phone || guestPhone || 'Sin número'),
        userEmail: isWaiter ? waiterData.email : (user?.email || 'N/A'),
        restaurantId: restaurantId,
        restaurantName: items[0].restaurantName,
        restaurantCity: restaurantData?.location?.city || '',
        restaurantCoords: restaurantData?.location?.coords || null,
        source: isWaiter ? 'waiter' : 'client',
        waiterId: isWaiter ? waiterData.id : null,
        waiterName: isWaiter ? waiterData.name : null,
        paymentStatus: isWaiter ? paymentStatus : 'pending',
        table: isWaiter ? tableNumber : null,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          category: item.category,
          printerId: item.printerId,
          consultPrice: item.consultPrice
        })),
        subtotal: totalPrice,
        deliveryFee: deliveryFee,
        driverPayout: driverPayout,
        deliveryShift: currentShift,
        distance: distance || 0,
        total: finalTotal,
        status: isWaiter ? (paymentStatus === 'paid' ? 'kitchen' : 'pending') : 'pending',
        deliveryAddress: address,
        userCoordinates: (!isWaiter && selectedAddress?.lat) ? { lat: selectedAddress.lat, lng: selectedAddress.lng } : null,
        addressReference: isWaiter ? `Atendido por: ${waiterData.name}` : (selectedAddress?.reference || ''),
        orderNote: orderNote.trim(),
        createdAt: serverTimestamp()
      };

      // 2. Save to Firestore
      const docRef = await addDoc(collection(db, 'orders'), orderData);
      setOrderId(docRef.id);

      if (isWaiter) {
        clearCart();
        setCheckoutSuccess(true);
        setPurchaseConfirmed(true);
        return;
      }

      if (selectedReward && !isWaiter && user) {
        await updateDoc(doc(db, 'users', user.uid), {
          [`restaurantPoints.${restaurantId}`]: increment(-selectedReward.pointsCost)
        });
      }

      // 3. Generate WhatsApp Message
      let itemsList = items.map(item => {
        if (item.consultPrice || item.price === 0 || !item.price) return `• ${item.quantity}x ${item.name} (Precio a consultar)`;
        return `• ${item.quantity}x ${item.name} ($${(item.price * item.quantity).toFixed(2)})`;
      }).join('\n');

      if (selectedReward) {
        itemsList += `\n\n🎁 *RECOMPENSA CANJEADA:*\n• 1x ${selectedReward.title} (-${selectedReward.pointsCost} puntos canjeados del local)`;
      }

      let locationText = `*Dirección:* ${orderData.deliveryAddress}`;
      if (orderData.addressReference) {
        locationText += `\n*Referencia:* ${orderData.addressReference}`;
      }
      if (orderData.userCoordinates) {
        locationText += `\n*Ubicación GPS:* https://www.google.com/maps?q=${orderData.userCoordinates.lat},${orderData.userCoordinates.lng}`;
      }

      const noteText = orderData.orderNote ? `*Notas del Pedido:*\n_${orderData.orderNote}_` : '';

      let rawMessage = systemSettings?.whatsappMessageTemplate;
      if (!rawMessage) {
        rawMessage = `👋 ¡Hola *{RestaurantName}*!\nSoy *{UserName}* y vengo desde la app con DeliExpress 🚀. Mi identificación es *{Cedula}* y requiero el siguiente pedido:\n\n🛒 *Detalles del Pedido:*\n{OrderItems}\n\n🛵 *Delivery:* \${DeliveryFee}\n💰 *Total:* \${Total}\n\n📍 Adjunto mi ubicación para la entrega y mi número de contacto por si requieren llamar.\n\n🗺️ *Ubicación:* {LocationText}\n📱 *Mi número:* {UserPhone}\n\n{OrderNotes}\n\n_Enviado desde DeliExpress App_`;
      }

      const formattedMessage = rawMessage
        .replace(/{OrderId}/g, docRef.id.slice(-6).toUpperCase())
        .replace(/{RestaurantName}/g, orderData.restaurantName)
        .replace(/{UserName}/g, orderData.userName)
        .replace(/{Cedula}/g, userData?.cedula || guestCedula || 'N/A')
        .replace(/{UserPhone}/g, orderData.userPhone)
        .replace(/{OrderItems}/g, itemsList)
        .replace(/{DeliveryFee}/g, orderData.deliveryFee.toFixed(2))
        .replace(/{Total}/g, `${orderData.total.toFixed(2)}${items.some(i => i.consultPrice) ? ' + consulta' : ''}`)
        .replace(/{LocationText}/g, locationText)
        .replace(/{OrderNotes}/g, noteText);

      const message = encodeURIComponent(formattedMessage);

      // 4. Redirect
      const whatsappNumber = restaurantData.whatsapp.replace(/\D/g, '');
      window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');

      clearCart();
      setCheckoutSuccess(true);
    } catch (err: any) {
      console.error("Error confirming order:", err);
      setError(err.message || "Hubo un error al procesar tu orden. Inténtalo de nuevo.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleConfirmPurchase = async () => {
    if (!orderId) return;
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: 'confirmed' });
      setPurchaseConfirmed(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelPurchase = async () => {
    if (!orderId) return;
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: 'cancelled' });
      setPurchaseConfirmed(false);
    } catch (e) {
      console.error(e);
    }
  };

  if (checkoutSuccess) {
    if (purchaseConfirmed === null) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mb-6">
            <svg className="w-12 h-12 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
              <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">¿Completaste tu compra? 🤔</h1>
          <p className="text-slate-500 mb-8 max-w-[280px]">
            Confirma si enviaste el mensaje de WhatsApp al restaurante para preparar tu pedido.
          </p>
          <div className="w-full max-w-xs space-y-3">
            <button
              onClick={handleConfirmPurchase}
              className="w-full bg-green-500 hover:bg-green-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-green-500/30 transition-all flex items-center justify-center gap-2"
            >
              Sí, pedido enviado
            </button>
            <button
              onClick={handleCancelPurchase}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-4 rounded-2xl font-bold transition-all"
            >
              No, tuve un problema
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white animate-in fade-in zoom-in duration-500">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${purchaseConfirmed ? 'bg-green-100' : 'bg-slate-100'}`}>
          {purchaseConfirmed ? (
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          ) : (
            <svg className="w-12 h-12 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
          )}
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-2">
          {purchaseConfirmed ? '¡Pedido Confirmado! 🎉' : 'Pedido Cancelado'}
        </h1>
        <p className="text-slate-500 mb-8 max-w-[280px]">
          {purchaseConfirmed
            ? (isWaiter ? 'La comanda ha sido enviada con éxito a cocina/sistema.' : 'Tu orden está siendo preparada y llegará pronto a tu puerta.')
            : 'Tu orden no fue procesada. Puedes volver a intentarlo cuando quieras.'}
        </p>

        {!isWaiter && !user && purchaseConfirmed && (
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-5 rounded-2xl shadow-lg mb-8 max-w-sm w-full mx-auto relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/20 rounded-full blur-xl animate-pulse"></div>
            <h3 className="text-white font-black text-xl mb-2 relative z-10">🎁 ¡No te pierdas de nada!</h3>
            <p className="text-white/90 text-sm font-medium mb-4 relative z-10">
              Regístrate ahora, gana increíbles premios, acumula puntos y accede a beneficios exclusivos en cada compra.
            </p>
            <Link to="/profile" className="inline-block bg-white text-orange-600 font-bold px-6 py-2 rounded-xl shadow-md hover:scale-105 active:scale-95 transition-transform relative z-10">
              Registrarme y Ganar
            </Link>
          </div>
        )}

        <Link to={isWaiter ? `/restaurant/${waiterRestaurantId || ''}` : "/"} className="w-full max-w-xs bg-primary hover:bg-orange-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center gap-2">
          {isWaiter ? 'Volver al Menú' : 'Ir al inicio'}
        </Link>
        {!isWaiter && user && (
          <Link to="/profile" className="mt-4 text-slate-500 font-bold hover:text-primary transition-colors">
            Ver mis pedidos
          </Link>
        )}
      </div>
    );
  }

  // Helper component for Clock icon since it was missing in the import
  function Clock(props: any) {
    return (
      <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden bg-background-light group/design-root">
      {/* Background Pattern */}
      <div className="absolute inset-0 food-pattern pointer-events-none z-0"></div>

      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-surface-light/80 backdrop-blur-md px-4 pb-2 pt-4 flex items-center justify-between border-b border-neutral-light">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-900 flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-neutral-light transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="text-slate-900 text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-12">
          Mi Carrito
        </h2>
      </div>

      {/* Progress Steps */}
      <div className="relative z-10 px-6 py-6 w-full">
        <div className="flex items-center justify-between relative">
          {/* Line */}
          <div className="absolute left-0 top-1/2 w-full h-1 bg-neutral-light -z-10 rounded-full"></div>

          {/* Step 1: Cart */}
          <div className="flex flex-col items-center gap-2">
            <div className={`size-8 rounded-full flex items-center justify-center ring-4 ring-background-light ${currentStep >= 1 ? 'bg-primary text-white' : 'bg-neutral-light text-slate-400'}`}>
              <ShoppingCart className="w-4 h-4" />
            </div>
            <span className={`text-xs font-semibold ${currentStep >= 1 ? 'text-primary' : 'text-slate-400'}`}>Carrito</span>
          </div>

          {/* Step 2: Address */}
          <div className="flex flex-col items-center gap-2">
            <div className={`size-8 rounded-full flex items-center justify-center ring-4 ring-background-light ${currentStep >= 2 ? 'bg-primary text-white' : 'bg-neutral-light text-slate-400'}`}>
              <MapPin className="w-4 h-4" />
            </div>
            <span className={`text-xs ${currentStep >= 2 ? 'font-semibold text-primary' : 'font-medium text-slate-400'}`}>{isWaiter ? 'Mesa' : 'Dirección'}</span>
          </div>

          {/* Step 3: Payment */}
          <div className="flex flex-col items-center gap-2">
            <div className={`size-8 rounded-full flex items-center justify-center ring-4 ring-background-light ${currentStep >= 3 ? 'bg-primary text-white' : 'bg-neutral-light text-slate-400'}`}>
              <CreditCard className="w-4 h-4" />
            </div>
            <span className={`text-xs ${currentStep >= 3 ? 'font-semibold text-primary' : 'font-medium text-slate-400'}`}>Pago</span>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 z-10 space-y-6">

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <ShoppingCart className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Tu carrito está vacío</h3>
            <p className="text-slate-500 mb-6">Aún no has agregado ningún delicioso producto.</p>
            <Link to="/" className="px-6 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/30">
              Ir a explorar
            </Link>
          </div>
        ) : (
          <>
            {currentStep === 1 && (
              <>
                <div className="space-y-4">
                  <div className="flex justify-between items-end px-1">
                    <h3 className="text-lg font-bold text-slate-900">Tu Pedido</h3>
                    <button onClick={clearCart} className="text-xs text-slate-400 font-bold hover:text-red-500">Vaciar carrito</button>
                  </div>

                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 bg-surface-light p-3 rounded-xl shadow-sm border border-neutral-light/50 hover:border-primary/30 transition-colors">
                      <div className="shrink-0 relative">
                        <div
                          className="bg-center bg-no-repeat bg-cover rounded-lg size-20 shadow-inner"
                          style={{ backgroundImage: `url("${item.image}?q=80&w=200&auto=format&fit=crop")` }}
                        ></div>
                      </div>
                      <div className="flex flex-col flex-1 gap-1">
                        <div className="flex justify-between items-start">
                          <p className="text-slate-900 text-base font-bold leading-tight line-clamp-1">{item.name}</p>
                          <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          {item.consultPrice || item.price === 0 || !item.price ? (
                            <p className="font-bold text-orange-600 text-xs">Precio a consultar</p>
                          ) : (
                            <p className="text-primary font-bold text-base">${item.price.toFixed(2)}</p>
                          )}
                          <div className="flex items-center gap-3 bg-neutral-light rounded-full px-2 py-1">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="size-6 flex items-center justify-center rounded-full bg-surface-light text-slate-900 shadow-sm hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="size-6 flex items-center justify-center rounded-full bg-primary text-white shadow-sm hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Order Note */}
                <div className="mt-4 bg-surface-light p-4 rounded-xl shadow-sm border border-neutral-light/50">
                  <label className="text-sm font-bold text-slate-900 mb-2 block">Cuentanos como deseas tu pedido (Opcional)</label>
                  <textarea
                    placeholder="Ej. Hamburguesa sin cebolla, torta que diga feliz cumple..."
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[80px]"
                  />
                </div>

                {/* Summary for Step 1 */}
                <div className="bg-surface-light p-5 rounded-2xl shadow-sm space-y-3 mt-4 border border-neutral-light/50">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-semibold text-slate-900">
                      ${totalPrice.toFixed(2)}
                      {items.some(i => i.consultPrice) && <span className="text-[10px] text-orange-500 ml-1">+ consulta</span>}
                    </span>
                  </div>
                </div>
                <div className="sticky bottom-6 mt-6">
                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={items.length === 0}
                    className="w-full bg-primary hover:bg-orange-600 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-orange-500/30 transition-all transform active:scale-95 flex items-center justify-center gap-2 group"
                  >
                    Confirmar Pedido
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                  {!user && (
                    <p className="text-xs text-center text-slate-500 font-medium mt-3">Te pediremos iniciar sesión antes de confirmar ubicación</p>
                  )}
                </div>
              </>
            )}

            {currentStep === 2 && (
              <>
                <button
                  onClick={() => setCurrentStep(1)}
                  className="text-primary text-sm font-bold mb-4 flex items-center gap-1 hover:underline"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver a mi pedido
                </button>
                {isWaiter ? (
                  <div className="bg-surface-light p-5 rounded-2xl shadow-sm border border-neutral-light/50 space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider opacity-70 mb-2">Datos de la Orden</h3>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Número de Mesa / Para llevar</label>
                      <input
                        type="text"
                        placeholder="Ej. Mesa 5"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Nombre del Cliente (Opcional)</label>
                      <input
                        type="text"
                        placeholder="Ej. Juan Pérez"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-surface-light p-4 rounded-xl shadow-sm border border-neutral-light/50">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider opacity-70">Entrega en</h3>
                      {userData?.addresses && userData.addresses.length > 0 ? (
                        <button onClick={() => setShowAddressSelector(true)} className="text-primary text-xs font-bold hover:underline">Cambiar</button>
                      ) : (
                        <Link to="/profile" className="text-primary text-xs font-bold hover:underline">Cambiar</Link>
                      )}
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-neutral-light">
                        {selectedAddress ? (
                          <img
                            src={`https://maps.googleapis.com/maps/api/staticmap?center=${selectedAddress.lat},${selectedAddress.lng}&zoom=15&size=200x200&markers=color:red%7C${selectedAddress.lat},${selectedAddress.lng}&key=AIzaSyCb1c-p1R6AZGetk8YzKiLuxjaxjmPqJX8`}
                            alt="Mapa"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-100">
                            <MapPin className="w-6 h-6 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col justify-center min-h-[5rem]">
                        <p className="text-slate-900 text-sm font-bold flex items-center gap-1">
                          {selectedAddress?.name || "Mi Ubicación"}
                          {loadingDistance && <span className="w-2 h-2 rounded-full bg-primary animate-pulse ml-1"></span>}
                        </p>
                        <p className="text-slate-500 text-xs font-medium leading-relaxed mt-0.5 line-clamp-2">
                          {selectedAddress?.reference || "Agrega tu dirección en el perfil"}
                        </p>
                        <div className="flex items-center gap-1 mt-2 text-primary">
                          <Clock className="w-3.5 h-3.5 fill-primary/20" />
                          <span className="text-xs font-bold">
                            {distance ? `${Math.round(15 + distance * 5)} - ${Math.round(25 + distance * 5)} min` : "15 - 25 min"}
                          </span>
                          {distance && (
                            <span className="text-[10px] text-slate-400 font-bold ml-2">({formatDistance(distance)})</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="sticky bottom-6 mt-6">
                  <button
                    onClick={() => {
                      setCurrentStep(3);
                    }}
                    disabled={isWaiter ? !tableNumber : !selectedAddress}
                    className="w-full bg-primary hover:bg-orange-600 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-orange-500/30 transition-all transform active:scale-95 flex items-center justify-center gap-2 group"
                  >
                    {isWaiter ? 'Continuar al Pago' : 'Confirmar Ubicación'}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </>
            )}

            {currentStep === 3 && (
              <>
                <button
                  onClick={() => setCurrentStep(2)}
                  className="text-primary text-sm font-bold mb-4 flex items-center gap-1 hover:underline"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver a ubicación
                </button>

                {/* Rewards Selection */}
                {!isWaiter && user && restaurantRewards.length > 0 && (
                  <div className="bg-orange-50 p-5 rounded-2xl shadow-sm border border-orange-100 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Gift className="w-5 h-5 text-orange-500" />
                      <h3 className="font-black text-orange-900">Canjear Puntos DeliExpress</h3>
                    </div>
                    
                    <p className="text-sm font-medium text-orange-800 mb-4">
                      Tienes <span className="font-black">{userData?.restaurantPoints?.[items[0].restaurantId] || 0}</span> puntos acumulados en este local.
                    </p>

                    <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                      {restaurantRewards.map(reward => {
                        const userPoints = userData?.restaurantPoints?.[items[0].restaurantId] || 0;
                        const canRedeem = userPoints >= reward.pointsCost;
                        const isSelected = selectedReward?.id === reward.id;

                        return (
                          <button
                            key={reward.id}
                            disabled={!canRedeem && !isSelected}
                            onClick={() => setSelectedReward(isSelected ? null : reward)}
                            className={`min-w-[140px] max-w-[180px] p-3 rounded-xl border-2 text-left transition-all relative overflow-hidden flex-shrink-0 ${isSelected ? 'border-orange-500 bg-orange-500 shadow-lg shadow-orange-500/20 text-white' : canRedeem ? 'border-orange-200 bg-white hover:border-orange-400' : 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'}`}
                          >
                            <p className={`text-xs font-black line-clamp-2 ${isSelected ? 'text-white' : 'text-slate-800'}`}>{reward.title}</p>
                            <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${isSelected ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-600'}`}>
                              {reward.pointsCost} pts
                            </div>
                            {isSelected && (
                              <div className="absolute top-2 right-2">
                                <CheckCircle2 className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="bg-surface-light p-5 rounded-2xl shadow-sm space-y-3 mt-4 border border-neutral-light/50">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-semibold text-slate-900">${totalPrice.toFixed(2)}</span>
                  </div>
                  {!isWaiter && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Delivery</span>
                      <span className="font-semibold text-slate-900">${deliveryFee.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="h-px bg-neutral-light w-full my-2"></div>
                  <div className="flex justify-between items-end">
                    <span className="text-slate-900 font-bold text-lg">Total</span>
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-extrabold text-primary">
                        ${finalTotal.toFixed(2)}
                        {items.some(i => i.consultPrice) && <span className="text-[10px] text-orange-500 font-bold">+ CONSULTA</span>}
                      </span>
                    </div>
                  </div>
                </div>

                {isWaiter && (
                  <div className="bg-surface-light p-4 rounded-xl shadow-sm border border-neutral-light/50 space-y-3 mt-4">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider opacity-70 mb-2">Estado de Pago</h3>
                    <div className="flex gap-2">
                      <button onClick={() => setPaymentStatus('pending')} className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${paymentStatus === 'pending' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>Por Pagar</button>
                      <button onClick={() => setPaymentStatus('paid')} className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${paymentStatus === 'paid' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>Pagado</button>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="text-red-500 text-sm font-bold text-center mt-4 bg-red-50 p-3 rounded-lg">{error}</p>
                )}

                <div className="sticky bottom-6 mt-6">
                  <button
                    onClick={handleCheckout}
                    disabled={isCheckingOut || items.length === 0}
                    className="w-full bg-primary hover:bg-orange-600 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-lg py-4 rounded-2xl shadow-lg shadow-orange-500/30 transition-all transform active:scale-95 flex items-center justify-center gap-2 group"
                  >
                    {isCheckingOut ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        {isWaiter ? 'Enviar Comanda a Cocina' : 'Confirmar Pago en WhatsApp'}
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {showAddressSelector && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAddressSelector(false)}></div>
          <div className="relative w-full sm:w-80 bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <h3 className="text-xl font-bold text-slate-900 mb-4 text-center">Seleccionar Dirección</h3>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Opción de Ubicación Actual */}
              <button
                onClick={handleUseCurrentLocation}
                className="w-full text-left p-4 rounded-xl border-2 cursor-pointer transition-all border-slate-200 bg-white hover:border-primary hover:bg-primary/5 flex items-center gap-3"
              >
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 block">Usar mi ubicación actual</span>
                  <p className="text-xs font-medium text-slate-500">Activa tu GPS para encontrarte</p>
                </div>
              </button>

              {userData?.addresses?.map((addr: any) => (
                <div
                  key={addr.id}
                  onClick={() => {
                    setSelectedAddress(addr);
                    setShowAddressSelector(false);
                  }}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedAddress?.id === addr.id ? 'border-primary bg-primary/5' : 'border-transparent bg-slate-50 hover:bg-slate-100'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900">{addr.name}</span>
                    {selectedAddress?.id === addr.id && <CheckCircle2 className="w-5 h-5 text-primary" />}
                  </div>
                  <p className="text-xs font-medium text-slate-500 line-clamp-2">{addr.reference}</p>
                </div>
              ))}
            </div>
            <Link to="/profile" className="block w-full text-center mt-4 text-primary font-bold text-sm bg-primary/10 py-3 rounded-xl hover:bg-primary/20 transition-colors">
              Gestionar Direcciones
            </Link>
          </div>
        </div>
      )}

      {showGuestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowGuestModal(false)}></div>
          <div className="relative w-full max-w-sm mx-4 bg-white rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-black text-slate-900 mb-2 text-center">Datos del Pedido</h3>
            <p className="text-sm text-slate-500 mb-6 text-center">Requerimos estos datos básicos para enviarle la información al restaurante</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Nombre y Apellido</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Cédula</label>
                <input
                  type="text"
                  value={guestCedula}
                  onChange={(e) => setGuestCedula(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 12345678"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Teléfono (WhatsApp)</label>
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 04141234567"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <button
                onClick={() => {
                  if (!guestName || !guestCedula || !guestPhone) {
                    alert("Por favor completa todos los campos");
                    return;
                  }
                  setShowGuestModal(false);
                  handleCheckout();
                }}
                className="w-full bg-primary hover:bg-orange-600 text-white font-bold py-3 mt-2 rounded-xl"
              >
                Continuar con el Pedido
              </button>
            </div>
          </div>
        </div>
      )}
      {showMapPicker && (
        <AddressPicker 
          onClose={() => setShowMapPicker(false)}
          onSave={handleSaveAddressFromMap}
        />
      )}
    </div>
  );
}
