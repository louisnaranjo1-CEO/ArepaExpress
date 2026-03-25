import { ArrowLeft, ShoppingCart, MapPin, CreditCard, Trash2, Minus, Plus, ArrowRight, CheckCircle2, Gift } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, getDocs, query, where, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { calculateDistance, formatDistance } from '../lib/geo';
import AddressPicker from '../components/AddressPicker';
import WaiterLayout from '../waiter/components/WaiterLayout';

export default function Cart() {
  const { items, totalPrice, updateQuantity, removeItem, clearCart } = useCart();
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [purchaseConfirmed, setPurchaseConfirmed] = useState<boolean | null>(null);
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
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
  const [pointsPaymentConfig, setPointsPaymentConfig] = useState<Record<string, boolean>>({});
  const [systemSettings, setSystemSettings] = useState<any>(null);

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
        const sDoc = await getDoc(doc(db, 'delivery_settings', 'settings'));
        if (sDoc.exists()) setSystemSettings(sDoc.data());
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
          const rDoc = await getDoc(doc(db, 'restaurants', items[0].restaurantId));
          if (rDoc.exists()) {
            const data = rDoc.data();
            setRestaurantData(data);
            if (selectedAddress && data.location?.coords) {
              const d = calculateDistance(selectedAddress.lat, selectedAddress.lng, data.location.coords.lat, data.location.coords.lng);
              setDistance(d);
            }
          }
          const rewSnap = await getDocs(query(collection(db, 'restaurants', items[0].restaurantId, 'rewards'), where('isActive', '==', true)));
          setRestaurantRewards(rewSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
  const deliveryFee = isWaiter ? 0 : feeInfo.clientFee;
  const driverPayout = isWaiter ? 0 : feeInfo.driverPayout;
  const currentShift = feeInfo.shift;
  const finalTotal = cartSubtotalUSD + deliveryFee;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (!isWaiter && !user && (!guestName || !guestPhone || !guestCedula)) { setShowGuestModal(true); return; }
    if (!isWaiter && user && (!userData?.phone || !userData?.cedula)) { alert("Completa tu perfil primero."); navigate('/profile'); return; }

    setIsCheckingOut(true);
    try {
      const restaurantId = items[0].restaurantId;
      const restaurantDoc = await getDoc(doc(db, 'restaurants', restaurantId));
      const rData = restaurantDoc.exists() ? restaurantDoc.data() : null;
      if (!isWaiter && !rData?.whatsapp) throw new Error("No WhatsApp config");

      let addressStr = isWaiter ? `Mesa: ${tableNumber}` : (selectedAddress ? `${selectedAddress.name} - ${selectedAddress.reference}` : "Recoger en local");

      const orderData = {
        userId: isWaiter ? waiterData.id : (user?.uid || 'guest_' + Date.now()),
        userName: isWaiter ? (customerName || `Cliente Mesa ${tableNumber}`) : (user?.displayName || guestName || 'Cliente Invitado'),
        userPhone: isWaiter ? '' : (userData?.phone || guestPhone),
        userEmail: isWaiter ? waiterData.email : (user?.email || 'N/A'),
        restaurantId,
        restaurantName: rData?.name || 'DeliExpress Restaurant',
        restaurantCity: rData?.location?.city || '',
        source: isWaiter ? 'waiter' : 'client',
        waiterId: isWaiter ? waiterData.id : null,
        table: isWaiter ? tableNumber : null,
        items: items.map(item => ({ ...item, paidWithPoints: !!pointsPaymentConfig[item.id] })),
        subtotal: cartSubtotalUSD, deliveryFee, driverPayout, deliveryShift: currentShift, distance: distance || 0,
        total: finalTotal, status: isWaiter ? 'preparing' : 'pending', paymentStatus: isWaiter ? 'pending' : 'pending',
        deliveryAddress: addressStr, createdAt: serverTimestamp(), orderNote: orderNote.trim()
      };

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      setOrderId(docRef.id);

      if (isWaiter) { clearCart(); setCheckoutSuccess(true); setPurchaseConfirmed(true); return; }

      let itemsList = items.map(item => `• ${item.quantity}x ${item.name} ($${(item.price * item.quantity).toFixed(2)})`).join('\n');
      const formattedMessage = `👋 ¡Hola ${rData?.name}!\nSoy ${orderData.userName}. Mi identificación es ${userData?.cedula || guestCedula}\n\n🛒 Pedido:\n${itemsList}\n\n💰 Total: $${finalTotal.toFixed(2)}\n📍 Ubicación: ${addressStr}`;
      const whatsappNumber = rData.whatsapp.replace(/\D/g, '');
      const link = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(formattedMessage)}`;
      setWhatsappLink(link);
      window.location.href = link;
      clearCart();
      setCheckoutSuccess(true);
    } catch (err: any) { setError(err.message); } finally { setIsCheckingOut(false); }
  };

  if (checkoutSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${purchaseConfirmed ? 'bg-green-100' : 'bg-slate-100'}`}>
          {purchaseConfirmed ? <CheckCircle2 className="w-12 h-12 text-green-500" /> : <Trash2 className="w-12 h-12 text-slate-400" />}
        </div>
        <h1 className="text-2xl font-black mb-2">{purchaseConfirmed ? '¡Pedido Confirmado! 🎉' : 'Pedido Cancelado'}</h1>
        <p className="text-slate-500 mb-8">{purchaseConfirmed ? 'Tu orden está en proceso.' : 'Tu orden fue cancelada.'}</p>
        <Link to={isWaiter ? `/menu` : "/"} className="w-full max-w-xs bg-primary text-white py-4 rounded-2xl font-bold shadow-lg">
          {isWaiter ? 'Volver al Menú' : 'Ir al inicio'}
        </Link>
      </div>
    );
  }

  const content = (
    <div className="relative flex h-full min-h-screen w-full flex-col bg-background-light overflow-x-hidden">
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md px-4 py-4 flex items-center border-b border-slate-100">
        <button onClick={() => navigate(-1)} className="p-2"><ArrowLeft /></button>
        <h2 className="flex-1 text-center font-bold">{isWaiter ? 'Comanda' : 'Mi Carrito'}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-6 pt-4">
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
                  <div key={item.id} className="flex gap-4 bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                    <img src={item.image} className="size-16 rounded-xl object-cover" />
                    <div className="flex-1">
                       <p className="font-bold text-slate-900 text-sm">{item.name}</p>
                       <p className="text-primary font-bold text-sm">${item.price.toFixed(2)}</p>
                       <div className="flex items-center gap-3 mt-2">
                         <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="size-6 bg-slate-100 rounded-full flex items-center justify-center">-</button>
                         <span className="font-bold text-sm">{item.quantity}</span>
                         <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="size-6 bg-primary text-white rounded-full flex items-center justify-center">+</button>
                         <button onClick={() => removeItem(item.id)} className="ml-auto text-slate-300"><Trash2 className="w-4 h-4" /></button>
                       </div>
                    </div>
                  </div>
                ))}
                <textarea 
                  placeholder="Notas..." 
                  value={orderNote} 
                  onChange={e => setOrderNote(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm min-h-[100px]"
                />
                <button onClick={() => setCurrentStep(2)} className="w-full bg-primary text-white py-4 rounded-2xl font-bold">Siguiente</button>
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
                  <p>Dirección: {selectedAddress?.name || 'No seleccionada'}</p>
                )}
                <button onClick={() => setCurrentStep(3)} className="w-full bg-primary text-white py-4 rounded-2xl font-bold">Confirmar Datos</button>
              </div>
            )}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm space-y-2">
                  <div className="flex justify-between"><span>Subtotal</span><span>${totalPrice.toFixed(2)}</span></div>
                  {!isWaiter && <div className="flex justify-between"><span>Delivery</span><span>${deliveryFee.toFixed(2)}</span></div>}
                  <div className="border-t pt-2 flex justify-between font-bold text-xl"><span>Total</span><span className="text-primary">${finalTotal.toFixed(2)}</span></div>
                </div>
                {isWaiter && (
                  <div className="flex gap-2">
                    <button onClick={() => setPaymentStatus('pending')} className={`flex-1 py-3 rounded-xl font-bold border-2 ${paymentStatus === 'pending' ? 'border-amber-500 bg-amber-50' : 'border-slate-100'}`}>Por Pagar</button>
                    <button onClick={() => setPaymentStatus('paid')} className={`flex-1 py-3 rounded-xl font-bold border-2 ${paymentStatus === 'paid' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100'}`}>Pagado</button>
                  </div>
                )}
                <button onClick={handleCheckout} disabled={isCheckingOut} className="w-full bg-primary text-white py-4 rounded-2xl font-bold">
                  {isCheckingOut ? 'Procesando...' : (isWaiter ? 'Enviar Comanda' : 'Pedir por WhatsApp')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showGuestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowGuestModal(false)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-6">
            <h3 className="text-lg font-bold mb-4">Datos del Cliente</h3>
            <input placeholder="Nombre" value={guestName} onChange={e=>setGuestName(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl mb-3" />
            <input placeholder="Cédula" value={guestCedula} onChange={e=>setGuestCedula(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl mb-3" />
            <input placeholder="Teléfono" value={guestPhone} onChange={e=>setGuestPhone(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl mb-4" />
            <button onClick={() => { setShowGuestModal(false); handleCheckout(); }} className="w-full bg-primary text-white py-3 rounded-xl font-bold">Continuar</button>
          </div>
        </div>
      )}
    </div>
  );

  return isWaiter ? <WaiterLayout>{content}</WaiterLayout> : content;
}
