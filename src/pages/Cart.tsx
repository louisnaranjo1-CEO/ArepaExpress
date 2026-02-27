import { ArrowLeft, ShoppingCart, MapPin, CreditCard, Trash2, Minus, Plus, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function Cart() {
  const { items, totalPrice, updateQuantity, removeItem, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deliveryFee = 2.00;
  const finalTotal = totalPrice + deliveryFee;

  const handleCheckout = async () => {
    if (!user) {
      navigate('/profile');
      return;
    }
    if (items.length === 0) return;

    setIsCheckingOut(true);
    setError(null);

    try {
      // 1. Fetch restaurant data (specifically WhatsApp)
      const restaurantId = items[0].restaurantId;
      const restaurantDoc = await getDoc(doc(db, 'restaurants', restaurantId));
      const restaurantData = restaurantDoc.exists() ? restaurantDoc.data() : null;

      if (!restaurantData?.whatsapp) {
        throw new Error("El restaurante no tiene un número de WhatsApp configurado.");
      }

      const orderData = {
        userId: user.uid,
        userName: user.displayName || 'Cliente',
        restaurantId: restaurantId,
        items: items,
        total: finalTotal,
        subtotal: totalPrice,
        deliveryFee: deliveryFee,
        status: 'pending',
        createdAt: serverTimestamp(),
        deliveryAddress: "Casa Principal - Av. Francisco de Miranda, Edificio Torre Europa, Piso 4, Chacao, Caracas."
      };

      // 2. Save to Firestore
      const docRef = await addDoc(collection(db, 'orders'), orderData);

      // 3. Generate WhatsApp Message
      const itemsList = items.map(item => `• ${item.quantity}x ${item.name} ($${(item.price * item.quantity).toFixed(2)})`).join('\n');
      const message = encodeURIComponent(
        `*NUEVO PEDIDO # ${docRef.id.slice(-6).toUpperCase()}*\n\n` +
        `*Cliente:* ${orderData.userName}\n` +
        `*Resumen:*\n${itemsList}\n\n` +
        `*Total:* $${finalTotal.toFixed(2)}\n` +
        `*Dirección:* ${orderData.deliveryAddress}\n\n` +
        `_Enviado desde VenCome App_`
      );

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

  if (checkoutSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-white animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-2">¡Pedido Confirmado! 🎉</h1>
        <p className="text-slate-500 mb-8 max-w-[280px]">
          Tu orden está siendo preparada y llegará pronto a tu puerta.
        </p>
        <Link to="/profile" className="w-full max-w-xs bg-primary hover:bg-orange-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center gap-2">
          Ver mis pedidos
        </Link>
        <Link to="/" className="mt-4 text-slate-500 font-bold hover:text-primary transition-colors">
          Volver al inicio
        </Link>
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
        <Link to="/restaurant" className="text-slate-900 flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-neutral-light transition-colors cursor-pointer">
          <ArrowLeft className="w-6 h-6" />
        </Link>
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
            <div className="size-8 rounded-full bg-primary flex items-center justify-center text-white ring-4 ring-background-light">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-primary">Carrito</span>
          </div>

          {/* Step 2: Address */}
          <div className="flex flex-col items-center gap-2">
            <div className="size-8 rounded-full bg-neutral-light flex items-center justify-center text-slate-400 ring-4 ring-background-light">
              <MapPin className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-slate-400">Dirección</span>
          </div>

          {/* Step 3: Payment */}
          <div className="flex flex-col items-center gap-2">
            <div className="size-8 rounded-full bg-neutral-light flex items-center justify-center text-slate-400 ring-4 ring-background-light">
              <CreditCard className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-slate-400">Pago</span>
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
            {/* Delivery Location */}
            <div className="bg-surface-light p-4 rounded-xl shadow-sm border border-neutral-light/50">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider opacity-70">Entrega en</h3>
                <button className="text-primary text-xs font-bold hover:underline">Cambiar</button>
              </div>
              <div className="flex gap-4 items-start">
                <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-neutral-light">
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-80"
                    style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuD8yatRRQcmxjAOtEnOyP8_gRaWx6tJ_xdH-k2LqjtvrkbKToEdDFMwhmWPpQjPzPN2KYK2IeT44f5AZSsYtDbRcJ-VqmjOBGJzbEFB98DcpFbNJPg7d9ukrg1NIYAnMrAymyjB0yD3zISMMgG0iP-qrfzzo25U1_Pn3VzqczRRf_-0CmShfJhRiivqWEGRiP2j6OKY7GGy3oqnn-wXCg2X9ryTYKKhMd0gLO-gCWSQToNS6VDClfsbXBdiXQwTTie49ky_rga9aV0')" }}
                  ></div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <MapPin className="w-6 h-6 text-white drop-shadow-md" />
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-1">
                  <p className="font-bold text-slate-800 text-sm">Casa Principal</p>
                  <p className="text-xs text-slate-500 leading-relaxed">Av. Francisco de Miranda, Edificio Torre Europa, Piso 4, Chacao, Caracas.</p>
                  <div className="flex items-center gap-1 mt-1 text-primary">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-semibold">15 - 25 min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cart Items */}
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
                      <p className="text-primary font-bold text-base">${item.price.toFixed(2)}</p>
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

            {/* Summary */}
            <div className="bg-surface-light p-5 rounded-2xl shadow-sm space-y-3 mt-4 border border-neutral-light/50">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-semibold text-slate-900">${totalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Delivery</span>
                <span className="font-semibold text-slate-900">${deliveryFee.toFixed(2)}</span>
              </div>
              <div className="h-px bg-neutral-light w-full my-2"></div>
              <div className="flex justify-between items-end">
                <span className="text-slate-900 font-bold text-lg">Total</span>
                <div className="flex flex-col items-end">
                  <span className="text-2xl font-extrabold text-primary">${finalTotal.toFixed(2)}</span>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Incl. Impuestos</span>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm font-bold text-center mt-4 bg-red-50 p-3 rounded-lg">{error}</p>
            )}

            {/* Action Button */}
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
                    Confirmar Pedido
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
              {!user && (
                <p className="text-xs text-center text-slate-500 font-medium mt-3">Te pediremos iniciar sesión antes de confirmar</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
