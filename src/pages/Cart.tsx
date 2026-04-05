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
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');

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
            if (!data.ownDelivery && !data.appDelivery && data.pickupOnly) {
              setDeliveryMethod('pickup');
            } else if (data.ownDelivery || data.appDelivery) {
              setDeliveryMethod('delivery');
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
  const finalTotal = cartSubtotalUSD + deliveryFee;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    if (!isWaiter && !user && (!guestName || !guestPhone || !guestCedula)) { setShowGuestModal(true); return; }
    if (!isWaiter && user && (!userData?.phone || !userData?.cedula)) { alert("Completa tu perfil primero."); navigate('/profile'); return; }

    setIsCheckingOut(true);
    setError(null);
    try {
      const restaurantId = items[0].restaurantId;
      const restaurantDoc = await getDoc(doc(db, 'restaurants', restaurantId));
      const rData = restaurantDoc.exists() ? restaurantDoc.data() : null;
      if (!isWaiter && !rData?.whatsapp) throw new Error("No WhatsApp config");

      let addressStr = isWaiter ? `Mesa: ${tableNumber}` : (deliveryMethod === 'pickup' ? "Recoger en local" : (selectedAddress ? `${selectedAddress.name} - ${selectedAddress.reference}` : "Recoger en local"));

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
        deliveryCoords: (!isWaiter && deliveryMethod === 'delivery' && selectedAddress && selectedAddress.lat) ? { lat: selectedAddress.lat, lng: selectedAddress.lng } : null,
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
        return `• ${item.quantity}x ${item.name}${itemNote} ($${((item.price || 0) * item.quantity).toFixed(2)})`;
      }).join('\n');
      
      const mapsLink = (deliveryMethod === 'delivery' && selectedAddress && selectedAddress.lat) ? `\n🗺️ Ubicación GPS: https://www.google.com/maps?q=${selectedAddress.lat},${selectedAddress.lng}` : '';
      const notesString = orderNote.trim() ? `\n📝 Notas: ${orderNote.trim()}` : '';
      
      const formattedMessage = `👋 ¡Hola ${rData?.name}!\nSoy ${orderData.userName}. Mi identificación es ${userData?.cedula || guestCedula}\n\n🛒 Pedido:\n${itemsList}${notesString}\n\n💰 Total: $${finalTotal.toFixed(2)}\n📍 Dirección: ${addressStr}${mapsLink}`;
      const whatsappNumber = rData.whatsapp.replace(/\D/g, '');
      const link = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(formattedMessage)}`;
      setWhatsappLink(link);
      
      // Abre en nueva pestaña para que no mate la recarga si era mobil y vuelve
      window.open(link, '_blank', 'noopener,noreferrer');
      
      clearCart();
      setPurchaseConfirmed(true);
      setCheckoutSuccess(true);
      
      // Navegamos al track de pedido de una vez 
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
                           <p className="text-slate-900 font-black text-sm">${(item.price || 0).toFixed(2)}</p>
                         </div>
                         {(item as any).variant && (
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Variante: {(item as any).variant}</p>
                         )}
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
                     <div className="flex gap-2 p-1 bg-slate-50 rounded-2xl border border-slate-200">
                        {(restaurantData?.ownDelivery || restaurantData?.appDelivery) && (
                          <button
                            onClick={() => setDeliveryMethod('delivery')}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                              deliveryMethod === 'delivery' ? 'bg-primary text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            Delivery
                          </button>
                        )}
                        {restaurantData?.pickupOnly && (
                          <button
                            onClick={() => setDeliveryMethod('pickup')}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                              deliveryMethod === 'pickup' ? 'bg-primary text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            Retiro en Tienda
                          </button>
                        )}
                     </div>

                     {deliveryMethod === 'delivery' && (
                         <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                             <p className="font-bold text-slate-800 text-sm uppercase tracking-wider pl-2">Dirección de Entrega</p>
                             
                             {selectedAddress ? (
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

                     {deliveryMethod === 'pickup' && (
                         <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100 text-center animate-in fade-in slide-in-from-bottom-2">
                             <div className="w-12 h-12 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <ShoppingCart className="w-6 h-6" />
                             </div>
                             <p className="font-black text-slate-800 uppercase tracking-tight">Retiro en Local</p>
                             <p className="text-sm font-medium text-slate-500 mt-2 mx-auto max-w-[200px]">
                                 {restaurantData?.location?.address || 'Dirección del restaurante'}
                             </p>
                         </div>
                     )}
                  </div>
                )}
                
                <button 
                  onClick={() => {
                      if (!isWaiter && deliveryMethod === 'delivery' && !selectedAddress) {
                          alert("Por favor selecciona una dirección de entrega válida.");
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
                            {(item as any).notes && (
                              <p className="text-[10px] text-slate-400 font-medium italic mt-0.5">Nota: "{ (item as any).notes }"</p>
                            )}
                          </div>
                          <span className="font-black text-slate-900 text-sm">${((item.price || 0) * item.quantity).toFixed(2)}</span>
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
                          {isWaiter ? `Mesa ${tableNumber}` : (deliveryMethod === 'pickup' ? 'Retiro en Tienda' : selectedAddress?.name)}
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

                  <div className="p-6 bg-slate-900 text-white">
                    <div className="space-y-2 mb-4 opacity-80 text-sm font-bold">
                      <div className="flex justify-between"><span>Subtotal Productos</span><span>${cartSubtotalUSD.toFixed(2)}</span></div>
                      {!isWaiter && deliveryMethod === 'delivery' && (
                        <div className="flex justify-between"><span>Costo Delivery</span><span>${deliveryFee.toFixed(2)}</span></div>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-black uppercase tracking-widest text-slate-900">Total Final</span>
                      <span className="text-3xl font-black text-white">${finalTotal.toFixed(2)}</span>
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
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {isSyncingTable ? 'Actualizando Mesa...' : 'Procesando...'}
                      </span>
                    ) : (
                      <>
                        <ArrowRight className="w-5 h-5" />
                        {isWaiter ? 'Enviar Comanda' : 'Pedir por WhatsApp'}
                      </>
                    )}
                  </button>
                </div>
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
    </div>
  );

  return isWaiter ? <WaiterLayout>{content}</WaiterLayout> : content;
}
