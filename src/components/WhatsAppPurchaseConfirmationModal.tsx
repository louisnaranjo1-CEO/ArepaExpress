import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  XCircle, 
  Star, 
  Smartphone, 
  Banknote, 
  DollarSign, 
  CreditCard, 
  UploadCloud, 
  AlertCircle, 
  ShoppingBag, 
  ArrowRight, 
  Loader2, 
  Sparkles,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import toast from 'react-hot-toast';

interface PendingWhatsAppOrder {
  orderId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantLogo?: string;
  timestamp: number;
  productName?: string;
  estimatedPrice?: number;
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const STORAGE_KEY = 'deliexpress_pending_whatsapp_order';

export default function WhatsAppPurchaseConfirmationModal() {
  const { user } = useAuth();
  const { bcvRate } = useCurrency();

  const [pendingOrder, setPendingOrder] = useState<PendingWhatsAppOrder | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  // Form states
  const [step, setStep] = useState<'ask' | 'payment' | 'review' | 'done'>('ask');
  const [amountUSD, setAmountUSD] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'pago_movil' | 'efectivo_bs' | 'divisa_usd' | 'punto_venta'>('pago_movil');
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [resultInfo, setResultInfo] = useState<{
    commission: number;
    pointsAwarded: number;
    pointsPending: number;
  } | null>(null);

  // Check pending order from storage and evaluate timer
  const checkPendingOrder = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setPendingOrder(null);
        setIsOpen(false);
        return;
      }

      const order: PendingWhatsAppOrder = JSON.parse(raw);
      setPendingOrder(order);

      const elapsed = Date.now() - order.timestamp;
      const remaining = Math.max(0, FIFTEEN_MINUTES_MS - elapsed);
      setTimeRemaining(remaining);

      // Check if test mode or instant trigger is enabled
      const isTestMode = localStorage.getItem('deliexpress_test_instant_modal') === 'true' ||
                         window.location.search.includes('test_whatsapp_modal=true');

      if (remaining <= 0 || isTestMode) {
        setIsOpen(true);
      }
    } catch (e) {
      console.error('Error reading pending whatsapp order from storage:', e);
    }
  }, []);

  useEffect(() => {
    checkPendingOrder();

    // Check every 5 seconds for elapsed time
    const interval = setInterval(checkPendingOrder, 5000);

    // Also check on tab focus or visibility change
    const handleFocus = () => checkPendingOrder();
    const handleCustomEvent = () => checkPendingOrder();

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('deliexpress_whatsapp_order_created', handleCustomEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('deliexpress_whatsapp_order_created', handleCustomEvent);
    };
  }, [checkPendingOrder]);

  // Handle No Purchase
  const handleNoPurchase = async () => {
    if (!pendingOrder) return;
    setIsSubmitting(true);
    try {
      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', pendingOrder.orderId);

      localStorage.removeItem(STORAGE_KEY);
      setPendingOrder(null);
      setIsOpen(false);
      toast('Entendido. Registro de pedido cerrado.', { icon: 'ℹ️' });
    } catch (e) {
      console.error('Error cancelling order:', e);
      localStorage.removeItem(STORAGE_KEY);
      setIsOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Photo input for Pago Móvil
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 5MB.');
      return;
    }

    setPaymentProof(file);
    setPaymentProofPreview(URL.createObjectURL(file));
  };

  // Advance to Step 3
  const handleContinueToReview = () => {
    const numAmount = parseFloat(amountUSD);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Por favor ingresa un monto válido mayor a 0.');
      return;
    }

    if (paymentMethod === 'pago_movil' && !paymentProof) {
      toast.error('Para Pago Móvil es obligatorio adjuntar el comprobante para recibir tus puntos.');
      return;
    }

    setStep('review');
  };

  // Final Submit
  const handleFinalSubmit = async () => {
    if (!pendingOrder) return;
    setIsSubmitting(true);

    try {
      let receiptUrl: string | null = null;

      // Upload receipt if Pago Móvil
      if (paymentMethod === 'pago_movil' && paymentProof) {
        const ext = paymentProof.name.split('.').pop() || 'jpg';
        const filePath = `comprobantes/whatsapp_${pendingOrder.orderId}_${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('store_assets')
          .upload(filePath, paymentProof, { upsert: true });

        if (uploadErr) {
          console.warn('Receipt upload failed, proceeding with fallback:', uploadErr);
        } else {
          const { data: publicUrlData } = supabase.storage
            .from('store_assets')
            .getPublicUrl(filePath);
          receiptUrl = publicUrlData?.publicUrl || null;
        }
      }

      const finalAmount = parseFloat(amountUSD) || 0;
      const userId = user?.id || (user as any)?.uid || null;
      const userName = user?.displayName || (user as any)?.name || 'Cliente';
      const userAvatar = (user as any)?.photoURL || null;

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('confirm_whatsapp_order_and_review', {
        p_order_id: pendingOrder.orderId,
        p_restaurant_id: pendingOrder.restaurantId,
        p_user_id: userId,
        p_user_name: userName,
        p_user_avatar: userAvatar,
        p_total_amount: finalAmount,
        p_payment_method: paymentMethod,
        p_payment_proof_url: receiptUrl,
        p_payment_reference: paymentReference.trim() || null,
        p_rating: rating,
        p_comment: comment.trim()
      });

      if (rpcErr) {
        throw rpcErr;
      }

      setResultInfo({
        commission: rpcRes?.commission_applied || (finalAmount < 10 ? 0.5 : 1.0),
        pointsAwarded: rpcRes?.points_awarded || 0,
        pointsPending: rpcRes?.points_pending || 0
      });

      setStep('done');
      localStorage.removeItem(STORAGE_KEY);
      toast.success('¡Compra confirmada y reseña publicada!');
    } catch (err: any) {
      console.error('Error confirming whatsapp order:', err);
      toast.error(err.message || 'Error al registrar la confirmación. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close completed flow
  const handleFinish = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPendingOrder(null);
    setIsOpen(false);
    setStep('ask');
    setAmountUSD('');
    setPaymentProof(null);
    setPaymentProofPreview(null);
    setPaymentReference('');
    setComment('');
  };

  // Format countdown
  const minutes = Math.floor(timeRemaining / 60000);
  const seconds = Math.floor((timeRemaining % 60000) / 1000);

  return (
    <>
      {/* Floating tester badge when order is pending but timer hasn't hit 0 yet */}
      {pendingOrder && !isOpen && timeRemaining > 0 && (
        <div 
          onClick={() => setIsOpen(true)}
          title="Haz clic para probar el modal de confirmación ahora mismo"
          className="fixed bottom-20 left-4 z-40 bg-slate-900/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-lg border border-slate-700 flex items-center gap-1.5 backdrop-blur cursor-pointer hover:bg-slate-800 transition-transform active:scale-95"
        >
          <Clock className="w-3.5 h-3.5 text-primary animate-pulse" />
          <span>Confirmación: {minutes}:{seconds < 10 ? `0${seconds}` : seconds}</span>
          <span className="text-primary text-[10px] underline ml-1 font-black">Probar ya</span>
        </div>
      )}

      <AnimatePresence>
        {isOpen && pendingOrder && (
          <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none"
            onKeyDown={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[92vh]"
            >
              {/* Top Banner with Store Information */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-center gap-3 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 p-1 flex items-center justify-center overflow-hidden shrink-0">
                    {pendingOrder.restaurantLogo ? (
                      <img 
                        src={pendingOrder.restaurantLogo} 
                        alt={pendingOrder.restaurantName} 
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <ShoppingBag className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1">
                      <Sparkles className="w-3 h-3 inline" /> Verificación de Compra
                    </span>
                    <h3 className="text-lg font-black truncate">{pendingOrder.restaurantName}</h3>
                    <p className="text-[11px] text-slate-400 truncate">
                      {pendingOrder.productName ? `Producto: ${pendingOrder.productName}` : 'Pedido vía WhatsApp'}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex gap-1.5 mt-4">
                  <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'ask' || step === 'payment' || step === 'review' || step === 'done' ? 'bg-primary' : 'bg-white/20'}`} />
                  <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'payment' || step === 'review' || step === 'done' ? 'bg-primary' : 'bg-white/20'}`} />
                  <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'review' || step === 'done' ? 'bg-primary' : 'bg-white/20'}`} />
                  <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step === 'done' ? 'bg-primary' : 'bg-white/20'}`} />
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-5">
                
                {/* STEP 1: ASK IF COMPLETED */}
                {step === 'ask' && (
                  <div className="space-y-6 text-center py-2 animate-in fade-in">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                      <ShoppingBag className="w-8 h-8" />
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xl font-black text-slate-900 leading-tight">
                        ¿Concretaste tu compra en {pendingOrder.restaurantName}?
                      </h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Han pasado 15 minutos desde que contactaste a la tienda. Confirma tu compra para calificar tu experiencia y acumular puntos.
                      </p>
                    </div>

                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/60 text-left flex gap-3 text-xs text-amber-900">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block mb-0.5">Importante para tus recompensas:</span>
                        Al confirmar tu compra ganas puntos para canjear en futuras órdenes y delivery gratis.
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleNoPurchase}
                        className="py-3.5 px-4 rounded-2xl font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 text-slate-500" />}
                        No, no compré
                      </button>

                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          if (pendingOrder.estimatedPrice) {
                            setAmountUSD(pendingOrder.estimatedPrice.toString());
                          }
                          setStep('payment');
                        }}
                        className="py-3.5 px-4 rounded-2xl font-black text-sm bg-primary hover:brightness-105 text-slate-900 shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4 text-slate-900" />
                        ¡Sí, concreté!
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: AMOUNT & PAYMENT METHOD */}
                {step === 'payment' && (
                  <div className="space-y-5 animate-in fade-in">
                    <div>
                      <h4 className="text-lg font-black text-slate-900">¿Cuánto pagaste y cuál fue tu método?</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Ingresa los datos exactos de tu transacción.</p>
                    </div>

                    {/* Amount Input */}
                    <div>
                      <label className="text-xs font-black uppercase text-slate-500 block mb-1.5">
                        Monto Total de la Compra (USD $)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-slate-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.1"
                          placeholder="0.00"
                          value={amountUSD}
                          onChange={(e) => setAmountUSD(e.target.value)}
                          className="w-full pl-9 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-black text-slate-900 outline-none focus:border-primary focus:bg-white transition-all"
                        />
                      </div>
                      {amountUSD && !isNaN(parseFloat(amountUSD)) && bcvRate > 0 && (
                        <p className="text-[11px] font-bold text-slate-500 mt-1 pl-1">
                          Aprox: {(parseFloat(amountUSD) * bcvRate).toFixed(2)} Bs (Tasa BCV {bcvRate.toFixed(2)})
                        </p>
                      )}
                    </div>

                    {/* Payment Method Selector */}
                    <div>
                      <label className="text-xs font-black uppercase text-slate-500 block mb-2">
                        Método de Pago Utilizado
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        {/* Pago Móvil */}
                        <div
                          onClick={() => setPaymentMethod('pago_movil')}
                          className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center text-center gap-1.5 ${
                            paymentMethod === 'pago_movil'
                              ? 'border-primary bg-primary/5 text-slate-900 shadow-sm'
                              : 'border-slate-100 bg-slate-50/70 text-slate-600 hover:border-slate-200'
                          }`}
                        >
                          <Smartphone className={`w-5 h-5 ${paymentMethod === 'pago_movil' ? 'text-primary' : 'text-slate-400'}`} />
                          <span className="text-xs font-black">Pago Móvil</span>
                        </div>

                        {/* Efectivo Bs */}
                        <div
                          onClick={() => setPaymentMethod('efectivo_bs')}
                          className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center text-center gap-1.5 ${
                            paymentMethod === 'efectivo_bs'
                              ? 'border-primary bg-primary/5 text-slate-900 shadow-sm'
                              : 'border-slate-100 bg-slate-50/70 text-slate-600 hover:border-slate-200'
                          }`}
                        >
                          <Banknote className={`w-5 h-5 ${paymentMethod === 'efectivo_bs' ? 'text-green-600' : 'text-slate-400'}`} />
                          <span className="text-xs font-black">Efectivo Bs</span>
                        </div>

                        {/* Divisa USD */}
                        <div
                          onClick={() => setPaymentMethod('divisa_usd')}
                          className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center text-center gap-1.5 ${
                            paymentMethod === 'divisa_usd'
                              ? 'border-primary bg-primary/5 text-slate-900 shadow-sm'
                              : 'border-slate-100 bg-slate-50/70 text-slate-600 hover:border-slate-200'
                          }`}
                        >
                          <DollarSign className={`w-5 h-5 ${paymentMethod === 'divisa_usd' ? 'text-emerald-600' : 'text-slate-400'}`} />
                          <span className="text-xs font-black">Divisa Física ($)</span>
                        </div>

                        {/* Punto de Venta */}
                        <div
                          onClick={() => setPaymentMethod('punto_venta')}
                          className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center text-center gap-1.5 ${
                            paymentMethod === 'punto_venta'
                              ? 'border-primary bg-primary/5 text-slate-900 shadow-sm'
                              : 'border-slate-100 bg-slate-50/70 text-slate-600 hover:border-slate-200'
                          }`}
                        >
                          <CreditCard className={`w-5 h-5 ${paymentMethod === 'punto_venta' ? 'text-blue-600' : 'text-slate-400'}`} />
                          <span className="text-xs font-black">Punto de Venta</span>
                        </div>
                      </div>
                    </div>

                    {/* Conditional Notice based on Payment Method */}
                    {paymentMethod === 'pago_movil' ? (
                      <div className="space-y-3 pt-1">
                        <div className="p-3.5 bg-blue-50/80 rounded-2xl border border-blue-200 text-xs text-blue-900 space-y-1">
                          <p className="font-bold flex items-center gap-1.5">
                            <UploadCloud className="w-4 h-4 text-blue-600" />
                            Comprobante obligatorio para puntos
                          </p>
                          <p className="text-[11px] text-blue-700 leading-normal">
                            Para poder acreditar tus puntos por Pago Móvil, debes adjuntar la captura del comprobante. Será validado por administración.
                          </p>
                        </div>

                        {/* Upload Comprobante */}
                        <div>
                          <label className="text-xs font-black uppercase text-slate-500 block mb-1.5">
                            Captura del Comprobante
                          </label>
                          {paymentProofPreview ? (
                            <div className="relative rounded-2xl overflow-hidden border-2 border-primary/40 bg-slate-50 p-2 flex items-center gap-3">
                              <img src={paymentProofPreview} alt="Comprobante" className="w-16 h-16 object-cover rounded-xl shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-black truncate">{paymentProof?.name}</p>
                                <p className="text-[10px] text-green-600 font-bold">Comprobante listo</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentProof(null);
                                  setPaymentProofPreview(null);
                                }}
                                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>
                          ) : (
                            <label className="border-2 border-dashed border-slate-200 hover:border-primary rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50/50 hover:bg-primary/5 transition-all">
                              <UploadCloud className="w-6 h-6 text-slate-400" />
                              <span className="text-xs font-bold text-slate-600">Subir foto del comprobante</span>
                              <span className="text-[10px] text-slate-400">JPG, PNG hasta 5MB</span>
                              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                            </label>
                          )}
                        </div>

                        {/* Reference input */}
                        <div>
                          <label className="text-xs font-black uppercase text-slate-500 block mb-1.5">
                            Número de Referencia (Opcional)
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: 983421"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-primary focus:bg-white"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block">¡Puntos al instante!</span>
                          <span className="text-[11px] text-emerald-700 leading-normal">
                            Al pagar en efectivo o por punto de venta, tus puntos se acreditarán a tu perfil de inmediato al terminar.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setStep('ask')}
                        className="py-3.5 px-4 rounded-2xl font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
                      >
                        Atrás
                      </button>
                      <button
                        type="button"
                        onClick={handleContinueToReview}
                        className="flex-1 py-3.5 px-4 rounded-2xl font-black text-sm bg-primary hover:brightness-105 text-slate-900 shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-1.5"
                      >
                        Continuar
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: REVIEW & STAR RATING */}
                {step === 'review' && (
                  <div className="space-y-5 animate-in fade-in">
                    <div className="text-center space-y-1">
                      <h4 className="text-lg font-black text-slate-900">¿Cómo calificarías tu experiencia?</h4>
                      <p className="text-xs text-slate-500">
                        Tu reseña será pública en el perfil de {pendingOrder.restaurantName}.
                      </p>
                    </div>

                    {/* Star Rating */}
                    <div className="flex justify-center items-center gap-2 py-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(star)}
                          className="p-1 transition-transform hover:scale-125 active:scale-95 focus:outline-none"
                        >
                          <Star
                            className={`w-9 h-9 ${
                              (hoverRating || rating) >= star
                                ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                                : 'text-slate-200'
                            }`}
                          />
                        </button>
                      ))}
                    </div>

                    <p className="text-center font-black text-sm text-slate-700">
                      {rating === 5 && '⭐⭐⭐⭐⭐ ¡Excelente servicio!'}
                      {rating === 4 && '⭐⭐⭐⭐ Muy buena experiencia'}
                      {rating === 3 && '⭐⭐⭐ Regular'}
                      {rating === 2 && '⭐⭐ Pudo ser mejor'}
                      {rating === 1 && '⭐ Mala experiencia'}
                    </p>

                    {/* Review Textarea */}
                    <div>
                      <label className="text-xs font-black uppercase text-slate-500 block mb-1.5">
                        Tu Comentario u Opinión
                      </label>
                      <textarea
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Cuéntanos qué tal estuvo la atención, la calidad y entrega..."
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-primary focus:bg-white resize-none"
                      />
                    </div>

                    {/* Submit Button */}
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => setStep('payment')}
                        className="py-3.5 px-4 rounded-2xl font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all disabled:opacity-50"
                      >
                        Atrás
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleFinalSubmit}
                        className="flex-1 py-3.5 px-4 rounded-2xl font-black text-sm bg-primary hover:brightness-105 text-slate-900 shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Procesando...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Confirmar y Publicar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4: SUCCESS / DONE */}
                {step === 'done' && (
                  <div className="space-y-6 text-center py-4 animate-in fade-in">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                      <CheckCircle2 className="w-10 h-10" />
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-2xl font-black text-slate-900">¡Compra Registrada con Éxito!</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Tu reseña y calificación han sido publicadas en el perfil de {pendingOrder.restaurantName}.
                      </p>
                    </div>

                    {/* Result Points Badge */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-left">
                      {paymentMethod === 'pago_movil' ? (
                        <div className="flex items-start gap-2.5 text-xs text-blue-900">
                          <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-black block">Comprobante en Revisión</span>
                            <span className="text-slate-500">
                              En breve nuestro equipo validará tu comprobante y se acreditarán{' '}
                              <b className="text-slate-800 font-bold">{resultInfo?.pointsPending || Math.max(1, Math.round(parseFloat(amountUSD) || 1))} pts</b>{' '}
                              en tu perfil.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2.5 text-xs text-emerald-900">
                          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-black block">¡Puntos Acreditados!</span>
                            <span className="text-slate-500">
                              Has acumulado{' '}
                              <b className="text-emerald-600 font-bold">+{resultInfo?.pointsAwarded || Math.max(1, Math.round(parseFloat(amountUSD) || 1))} puntos</b>{' '}
                              directamente en tu billetera.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleFinish}
                      className="w-full py-4 rounded-2xl font-black text-sm bg-primary hover:brightness-105 text-slate-900 shadow-xl shadow-primary/25 transition-all"
                    >
                      Continuar en la App
                    </button>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
