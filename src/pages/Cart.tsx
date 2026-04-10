import { ArrowLeft, ShoppingCart, MapPin, CreditCard, Trash2, Minus, Plus, ArrowRight, CheckCircle2, Gift, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, getDocs, query, where, increment, collectionGroup } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { calculateDistance, formatDistance } from '../lib/geo';
import AddressPicker from '../components/AddressPicker';
import WaiterLayout from '../waiter/components/WaiterLayout';
import { isDemoMode } from '../lib/env';
import DemoAlertModal from '../components/DemoAlertModal';
import DualPrice from '../components/DualPrice';

interface CartProps {
  hideHeader?: boolean;
}

export default function Cart({ hideHeader = false }: CartProps) {
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
  const [isSyncingTable, setIsSyncingTable] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [loadingDistance, setLoadingDistance] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [orderNote, setOrderNote] = useState('');
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
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

  const [restaurantRewards, setRestaurantRewards] = useState<any[]>([]);
  const [selectedReward, setSelectedReward] = useState<any>(null);
  const [pointsPaymentConfig, setPointsPaymentConfig] = useState<Record<string, boolean>>({});
  const [systemSettings, setSystemSettings] = useState<any>(null);

  const [hasDefaultedCredit, setHasDefaultedCredit] = useState(false);
  const [showDemoAlert, setShowDemoAlert] = useState(false);

  useEffect(() => {
    const checkCredits = async () => {
      if (!user?.email) return;
      try {
        const creditsQuery = query(collectionGroup(db, 'credits'), where('userEmail', '==', user.email));
        const snap = await getDocs(creditsQuery);
        const isDefaulted = snap.docs.some(d => d.data().status === 'defaulted');
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
  const deliveryFee = (isWaiter || deliveryMethod === 'pickup') ? 0 : feeInfo.clientFee;
  const driverPayout = (isWaiter || deliveryMethod === 'pickup') ? 0 : feeInfo.driverPayout;
  const currentShift = feeInfo.shift;
  const finalTotal = (deliveryMethod === 'app_delivery') ? deliveryFee : (cartSubtotalUSD + deliveryFee);

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (!isWaiter && isDemoMode()) {
      setShowDemoAlert(true);
      return;
    }
    if (!isWaiter && !user && (!guestName || !guestPhone || !guestCedula)) { setShowGuestModal(true); return; }
    if (!isWaiter && user && (!userData?.phone || !userData?.cedula)) { alert("Completa tu perfil primero."); navigate('/profile'); return; }

    setIsCheckingOut(true);
    setError(null);
    try {
      const restaurantId = items[0].restaurantId;
      const restaurantDoc = await getDoc(doc(db, 'restaurants', restaurantId));
      const rData = restaurantDoc.exists() ? restaurantDoc.data() : null;
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
          const tablesRef = collection(db, 'restaurants', restaurantId, 'tables');
          const q = query(tablesRef, where('number', '==', tableNumber));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            tableId = qSnap.docs[0].id;
          }
        } catch (err) {
          console.error("Error fetching tableId:", err);
        }
      }

      const orderData = {
        userId: isWaiter ? (waiterData.id || 'waiter') : (user?.uid || 'guest_' + Date.now()),
        userName: isWaiter ? (customerName || `Cliente Mesa ${tableNumber || 'N/A'}`) : (user?.displayName || guestName || 'Cliente Invitado'),
        userPhone: isWaiter ? '' : (userData?.phone || guestPhone || ''),
        userCedula: isWaiter ? '' : (userData?.cedula || guestCedula || ''),
        userEmail: isWaiter ? (waiterData.email || 'N/A') : (user?.email || 'N/A'),
        restaurantId,
        restaurantName: rData?.name || 'Deliexpress Restaurant',
        restaurantCity: rData?.location?.city || '',
        source: isWaiter ? 'waiter' : 'client',
        waiterId: isWaiter ? (waiterData.id || null) : null,
        waiterName: isWaiter ? (waiterData.name || null) : null,
        table: isWaiter ? (tableNumber || null) : null,
        tableId: isWaiter ? (tableId || null) : null,
        tableNumber: isWaiter ? (tableNumber || null) : null,
        items: sanitizedItems,
        subtotal: cartSubtotalUSD || 0, 
        deliveryFee: deliveryFee || 0, 
        driverPayout: driverPayout || 0, 
        deliveryShift: currentShift || 'day', 
        distance: distance || 0,
        total: finalTotal || 0, 
        status: isWaiter ? 'preparing' : 'pendiente_pago', 
        paymentStatus: isWaiter ? paymentStatus : 'pending', // Use the selected payment status
        notified: false,
        deliveryAddress: addressStr, 
        deliveryCoords: (!isWaiter && deliveryMethod === 'app_delivery' && selectedAddress && selectedAddress.lat) ? { lat: selectedAddress.lat, lng: selectedAddress.lng } : null,
        createdAt: serverTimestamp(), 
        orderNote: orderNote.trim() || ''
      };

      // Remove any undefined keys at the root level
      Object.keys(orderData).forEach(key => (orderData as any)[key] === undefined && delete (orderData as any)[key]);

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      setOrderId(docRef.id);

      // SYNC TABLE STATUS: Mark as occupied
      if (isWaiter && tableId) {
        setIsSyncingTable(true);
        try {
          const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableId);
          await updateDoc(tableRef, {
            status: 'occupied',
            lastOrderId: docRef.id,
            updatedAt: serverTimestamp()
          });
        } catch (tableErr) {
          console.error("Error updating table status:", tableErr);
        } finally {
          setIsSyncingTable(false);
        }
      }

      if (isWaiter) { clearCart(); setCheckoutSuccess(true); setPurchaseConfirmed(true); return; }

      let itemsList = items.map(item => {
        const itemNote = (item as any).notes ? ` - 📝 *Nota:* ${(item as any).notes}` : '';
        const variantText = (item as any).variant ? ` [${(item as any).variant}]` : '';
        
        let modifiersText = '';
        if (item.modifiersConfig) {
           const mods = Object.entries(item.modifiersConfig).map(([k, v]: [string, any]) => `*${k}:* ${v.map((o:any) => o.name).join(', ')}`).join(' | ');
           if (mods) modifiersText = `\n    👉 ${mods}`;
        }

        return `• ${item.quantity}x ${item.name}${variantText}${itemNote}${modifiersText} ($${((item.price || 0) * item.quantity).toFixed(2)} | ${(((item.price || 0) * item.quantity) * bcvRate).toFixed(2)} Bs)`;
      }).join('\n');
      
      const mapsLink = (deliveryMethod === 'delivery' && selectedAddress && selectedAddress.lat) ? `\n🗺️ Ubicación GPS: https://www.google.com/maps?q=${selectedAddress.lat},${selectedAddress.lng}` : '';
      const notesString = orderNote.trim() ? `\n📝 Notas: ${orderNote.trim()}` : '';
      
      const message = encodeURIComponent(
        `Hola, me gustaría realizar una ${restaurantData?.businessType === 'hotel' ? 'RESERVACIÓN' : 'ORDEN'} a través de *Deli Express* 🚀\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `👤 *Cliente:* ${user?.displayName || guestName}\n` +
        `📞 *Teléfono:* ${userData?.phone || guestPhone}\n` +
        `🆔 *Cédula:* ${userData?.cedula || guestCedula}\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `${restaurantData?.businessType === 'hotel' ? '🏨 *DETALLES DEL HOSPEDAJE:*' : '🛒 *DETALLES DEL PEDIDO:*'}\n${itemsList}\n` +
        `${notesString}\n\n` +
        `📦 *Método:* ${isWaiter ? 'Servicio a Mesa' : (deliveryMethod === 'pickup' ? 'Recoger en local' : (deliveryMethod === 'own_delivery' ? 'Delivery Propio del Local' : 'Delivery Un 2x3'))}\n` +
        `${(deliveryMethod === 'app_delivery' || deliveryMethod === 'own_delivery') && !isWaiter ? `📍 *Dirección:* ${addressStr}${deliveryMethod === 'app_delivery' ? mapsLink : ''}` : ''}\n\n` +
        `💰 *SUBTOTAL ARTÍCULOS:* $${cartSubtotalUSD.toFixed(2)} | ${(cartSubtotalUSD * bcvRate).toFixed(2)} Bs\n` +
        `${deliveryFee > 0 ? `🚚 *DELIVERY:* $${deliveryFee.toFixed(2)} | ${(deliveryFee * bcvRate).toFixed(2)} Bs\n` : ''}` +
        `⭐ *TOTAL ${deliveryMethod === 'app_delivery' ? '(SOLO DELIVERY UN 2X3 A PAGAR)' : 'ESTIMADO'}:* $${finalTotal.toFixed(2)} | ${(finalTotal * bcvRate).toFixed(2)} Bs\n\n` +
        `🔢 *Orden ID:* #${docRef.id.slice(-6).toUpperCase()}\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `Esperando confirmación...`
      );
      
      const whatsappNumber = rData.whatsapp.replace(/\D/g, '');
      const link = `https://wa.me/${whatsappNumber}?text=${message}`;
      setWhatsappLink(link);
      
      window.open(link, '_blank', 'noopener,noreferrer');
      
      clearCart();
      setPurchaseConfirmed(true);
      setCheckoutSuccess(true);
      
      if (!isWaiter) {
          navigate(`/track/${docRef.id}`);
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
                         <div className="flex justify-between items-start mb-1">
                           <p className="font-black text-slate-800 text-sm leading-tight">{item.name}</p>
                           <DualPrice usdAmount={item.price || 0} usdClassName="text-slate-900 font-black text-sm" showDivider={false} />
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
                  <div className="space-y-4">
                     {restaurantData?.businessType !== 'hotel' && (
                       <div className="flex gap-2 p-1 bg-slate-50 rounded-2xl border border-slate-200">
                          {restaurantData?.appDelivery && (
                            <button
                              onClick={() => setDeliveryMethod('app_delivery')}
                              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                deliveryMethod === 'app_delivery' ? 'bg-primary text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              Delivery Un 2x3
                            </button>
                          )}
                          {restaurantData?.ownDelivery && (
                            <button
                              onClick={() => setDeliveryMethod('own_delivery')}
                              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                deliveryMethod === 'own_delivery' ? 'bg-primary text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              Delivery Local
                            </button>
                          )}
                          {restaurantData?.pickupOnly && (
                            <button
                              onClick={() => setDeliveryMethod('pickup')}
                              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                deliveryMethod === 'pickup' ? 'bg-primary text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              PickUp
                            </button>
                          )}
                       </div>
                     )}

                     {deliveryMethod === 'app_delivery' && (
                         <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                             <p className="font-bold text-slate-800 text-sm uppercase tracking-wider pl-2">Dirección de Entrega</p>
                             
                             {selectedAddress && selectedAddress.lat ? (
                                 <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl flex justify-between items-center group">
                                     <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <MapPin className="w-4 h-4 text-slate-900" />
                                            <p className="font-bold text-slate-900 leading-none">{selectedAddress.name}</p>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium pl-6 leading-tight">
                                            <span className="font-bold text-slate-400">Ref:</span> {selectedAddress.reference || "Sin referencia adicional"}
                                        </p>
                                     </div>
                                     <button onClick={() => setShowMapPicker(true)} className="text-slate-900 text-xs font-bold uppercase tracking-widest pl-4 hover:underline">Cambiar</button>
                                 </div>
                             ) : (
                                 <button onClick={() => setShowMapPicker(true)} className="w-full flex items-center justify-center gap-2 py-5 bg-primary/10 text-slate-900 rounded-2xl font-black border border-primary/20 hover:bg-primary/20 transition-all">
                                     <MapPin className="w-5 h-5" />
                                     Ubicar en Mapa
                                 </button>
                             )}
                             
                             <p className="text-[10px] text-slate-400 font-bold uppercase text-center px-4 leading-normal">
                                Para asegurar una entrega exitosa, verifica que tu punto de referencia sea descriptivo (Ej. Casa amarilla con rejas blancas).
                             </p>
                         </div>
                     )}

                     {deliveryMethod === 'own_delivery' && (
                         <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="p-4 bg-yellow-50 text-yellow-800 rounded-2xl border border-yellow-200 text-xs font-medium relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-2 opacity-10">
                                    <AlertCircle className="w-16 h-16" />
                                </div>
                                <span className="font-black text-sm block mb-1">¡Aviso importante!</span>
                                Este proveedor cuenta con su propio delivery ajeno a Un 2x3, por lo que deberás cancelarle la totalidad del pago por WhatsApp. Lamentablemente los proveedores con delivery independiente no cuentan con el sistema de rastreo de Un 2x3, por lo que el mapa está deshabilitado.
                            </div>
                            <p className="font-bold text-slate-800 text-sm uppercase tracking-wider pl-2">Ingresa tu dirección manualmente</p>
                            <textarea
                                className="w-full bg-white border border-slate-200 p-4 rounded-2xl text-sm min-h-[100px] outline-none focus:border-primary/50"
                                placeholder="Escribe tu dirección completa y puntos de referencia aquí..."
                                value={selectedAddress?.name && !selectedAddress.lat ? selectedAddress.name : ''}
                                onChange={(e) => setSelectedAddress({ name: e.target.value, reference: '', lat: null, lng: null })}
                            />
                         </div>
                     )}

                     {deliveryMethod === 'pickup' && (
                         <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100 text-center animate-in fade-in slide-in-from-bottom-2">
                             <div className="w-12 h-12 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <ShoppingCart className="w-6 h-6" />
                             </div>
                             <p className="font-black text-slate-800 uppercase tracking-tight">PickUp</p>
                             <p className="text-sm font-medium text-slate-500 mt-2 mx-auto max-w-[200px]">
                                 {restaurantData?.location?.address || 'Dirección del restaurante'}
                             </p>
                         </div>
                     )}
                  </div>
                )}
                
                <button 
                  onClick={() => {
                      if (!isWaiter && deliveryMethod === 'app_delivery' && (!selectedAddress || !selectedAddress.lat) && restaurantData?.businessType !== 'hotel') {
                          alert("Por favor selecciona una dirección de entrega en el mapa.");
                          return;
                      }
                      if (!isWaiter && deliveryMethod === 'own_delivery' && (!selectedAddress || !selectedAddress.name) && restaurantData?.businessType !== 'hotel') {
                          alert("Por favor escribe una dirección de entrega válida.");
                          return;
                      }
                      setCurrentStep(3);
                  }} 
                  className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-bold mt-2"
                >
                  Confirmar Datos
                </button>
              </div>
            )}
            {currentStep === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                    {restaurantData?.businessType === 'hotel' ? 'Tu Reservación' : 'Tu Pedido'}
                    <span className="text-primary text-sm bg-primary/10 px-3 py-1 rounded-full uppercase tracking-widest">{items.length} {restaurantData?.businessType === 'hotel' ? 'servicios' : 'items'}</span>
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
                          <DualPrice usdAmount={(item.price || 0) * item.quantity} usdClassName="font-black text-slate-900 text-sm" showDivider={false} />
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
                    const pointsToEarn = Math.floor(cartSubtotalUSD * 2.5);
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

                          {deliveryMethod === 'app_delivery' && (
                            <div className="p-4 mx-6 mb-2 bg-primary/10 text-slate-800 rounded-2xl border border-primary/30 flex gap-3 text-sm animate-in fade-in">
                               <AlertCircle className="w-8 h-8 text-primary shrink-0" />
                               <div>
                                 <span className="font-black text-sm block mb-1">¡Oye, espera un momento! 🛑</span>
                                 <span className="font-medium">¿Tu comida fue pagada directamente al restaurante? Al confirmar, <b>SÓLO cobrarás el Delivery de Un 2x3</b> para ir a recoger y llevar tu pedido de forma segura. Contáctalos por sus métodos de pago si no lo has hecho.</span>
                               </div>
                            </div>
                          )}
                        </>
                      );
                    }
                    return null;
                  })()}

                  <div className="p-6 bg-slate-900 text-white">
                    <div className="space-y-2 mb-4 opacity-80 text-sm font-bold text-white/70">
                      <div className="flex justify-between">
                        <span className={deliveryMethod === 'app_delivery' ? 'line-through opacity-50' : ''}>{restaurantData?.businessType === 'hotel' ? 'Subtotal Servicios' : 'Subtotal Productos'}</span>
                        <DualPrice usdAmount={cartSubtotalUSD} className={deliveryMethod === 'app_delivery' ? 'line-through opacity-50 flex items-center gap-1.5' : 'flex items-center gap-1.5'} showDivider={false} />
                      </div>
                      {!isWaiter && deliveryMethod === 'app_delivery' && restaurantData?.businessType !== 'hotel' && (
                        <div className="flex justify-between text-primary opacity-100"><span>Costo Delivery Un 2x3</span><DualPrice usdAmount={deliveryFee} showDivider={false} /></div>
                      )}
                      {!isWaiter && deliveryMethod === 'own_delivery' && restaurantData?.businessType !== 'hotel' && (
                        <div className="flex justify-between"><span>Costo Delivery del Local</span><DualPrice usdAmount={deliveryFee} showDivider={false} /></div>
                      )}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/10">
                      <span className="text-lg font-black uppercase tracking-widest text-slate-200">
                        Total {deliveryMethod === 'app_delivery' ? 'Transporte' : (deliveryMethod === 'own_delivery' ? 'Estimado' : 'Final')}
                      </span>
                      <div className="text-right">
                        <DualPrice 
                          usdAmount={finalTotal} 
                          usdClassName="text-3xl font-black text-primary block" 
                          bsClassName="text-[11px] font-bold text-slate-400 block mt-0.5 text-right" 
                          showDivider={false} 
                          className="flex flex-col items-end" 
                        />
                      </div>
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
                        {restaurantData?.businessType === 'hotel' ? <CheckCircle2 className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
                        {isWaiter ? 'Enviar Comanda' : (restaurantData?.businessType === 'hotel' ? 'Confirmar Reservación' : 'Pedir por WhatsApp')}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowGuestModal(false)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-6">
            <h3 className="text-lg font-bold mb-4">Datos del Cliente</h3>
            <input placeholder="Nombre" value={guestName} onChange={e=>setGuestName(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl mb-3" />
            <input placeholder="Cédula" value={guestCedula} onChange={e=>setGuestCedula(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl mb-3" />
            <input placeholder="Teléfono" value={guestPhone} onChange={e=>setGuestPhone(e.target.value)} className="w-full p-3 bg-slate-100 rounded-xl mb-4" />
            <button onClick={() => { setShowGuestModal(false); handleCheckout(); }} className="w-full bg-primary text-slate-900 py-3 rounded-xl font-bold">Continuar</button>
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
    </div>
  );

  return isWaiter ? <WaiterLayout>{content}</WaiterLayout> : content;
}
