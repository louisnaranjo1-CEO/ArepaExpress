import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Plus, Minus, Trash2, ShoppingBag, CheckCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CashierPOS() {
    const navigate = useNavigate();
    const { orderId } = useParams();
    
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<string>('Todos');
    
    const [cartItems, setCartItems] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [waiterOrderInfo, setWaiterOrderInfo] = useState<any>(null);
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [isDelivery, setIsDelivery] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState('');

    const restaurantId = localStorage.getItem('cashierRestaurantId');
    const cashierData = JSON.parse(localStorage.getItem('cashierData') || '{}');

    useEffect(() => {
        const fetchData = async () => {
            if (!restaurantId) return;

            try {
                // Fetch Products
                const productsRef = collection(db, 'restaurants', restaurantId, 'products');
                const productsSnap = await getDocs(productsRef);
                const fetchedProducts = productsSnap.docs.map(p => ({ id: p.id, ...p.data() }));
                setProducts(fetchedProducts);

                // Fetch Order if editing
                if (orderId) {
                    const orderDoc = await getDoc(doc(db, 'orders', orderId));
                    if (orderDoc.exists()) {
                        const data = orderDoc.data();
                        setWaiterOrderInfo(data);
                        setCartItems(data.items || []);
                    }
                }
            } catch (error) {
                console.error("Error fetching POS data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [restaurantId, orderId]);

    const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];

    const filteredProducts = products.filter(p => {
        const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
        return matchesCategory && p.isAvailable !== false;
    });

    const subtotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const total = subtotal; // No delivery fee for physical POS

    const handleAddToCart = (product: any) => {
        const price = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price;
        setCartItems(prev => {
            const existing = prev.find(item => item.productId === product.id);
            if (existing) {
                return prev.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, {
                id: Date.now().toString(),
                productId: product.id,
                name: product.name,
                price: price,
                quantity: 1,
                image: product.image,
                category: product.category
            }];
        });
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCartItems(prev => prev.map(item => {
            if (item.productId === productId) {
                const newQuantity = Math.max(0, item.quantity + delta);
                return { ...item, quantity: newQuantity };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const handleSaveOrder = async () => {
        if (!restaurantId || cartItems.length === 0) return;
        setIsSubmitting(true);

        try {
            if (orderId) {
                // Modifying existing Waiter order
                await updateDoc(doc(db, 'orders', orderId), {
                    items: cartItems,
                    subtotal: subtotal,
                    total: total + (waiterOrderInfo?.deliveryFee || 0)
                });
                alert("Orden de mesero actualizada correctamente.");
                navigate('/');
            } else {
                // New Physical POS Order
                setShowCheckoutModal(true);
            }
        } catch (error) {
            console.error("Error saving order:", error);
            alert("Hubo un error al guardar.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmPayment = async () => {
        if (!paymentMethod) {
            alert("Seleccione un método de pago");
            return;
        }

        setIsSubmitting(true);
        try {
            const newOrderRef = doc(collection(db, 'orders'));
            const orderData: any = {
                userId: 'local_walk_in',
                restaurantId,
                items: cartItems,
                subtotal: subtotal,
                total: total,
                status: 'preparing', // Send straight to kitchen
                paymentStatus: 'sold', // Already paid at cashier
                paymentMethod: paymentMethod,
                source: 'local',
                cashierName: cashierData.name,
                cashierId: cashierData.id,
                userName: 'Cliente Local',
                createdAt: serverTimestamp()
            };

            if (isDelivery && deliveryAddress.trim()) {
                orderData.isDelivery = true;
                orderData.deliveryAddress = deliveryAddress;
                orderData.userName = 'Cliente (Delivery Local)';
            }

            await setDoc(newOrderRef, orderData);

            alert("Pedido creado y cobrado exitosamente.");
            navigate('/');
        } catch (error) {
            console.error("Error confirming local payment:", error);
            alert("Hubo un error al procesar el pago.");
        } finally {
            setIsSubmitting(false);
            setShowCheckoutModal(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col md:flex-row bg-slate-50 overflow-hidden">
            {/* Main Product Catalog */}
            <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-200 bg-white">
                <div className="p-4 border-b border-slate-100 flex items-center gap-4 sticky top-0 bg-white z-10">
                    <button onClick={() => navigate('/')} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200">
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <div>
                        <h1 className="font-black text-slate-900 text-lg">Punto de Venta</h1>
                        <p className="text-xs font-bold text-primary">
                            {orderId ? `Editando Orden de ${waiterOrderInfo?.waiterName || 'Mesero'}` : 'Nuevo Pedido Físico'}
                        </p>
                    </div>
                </div>

                {/* Categories */}
                <div className="p-4 border-b border-slate-50 bg-slate-50 shrink-0">
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-colors ${
                                    activeCategory === cat ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white text-slate-500 border border-slate-200'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Product Grid */}
                <div className="flex-1 overflow-y-auto p-4 content-start">
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredProducts.map(product => {
                            const price = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price;
                            return (
                                <div key={product.id} className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm hover:shadow-md transition-shadow relative group cursor-pointer" onClick={() => handleAddToCart(product)}>
                                    <div className="w-full h-32 bg-slate-50 rounded-xl mb-3 overflow-hidden relative">
                                        {product.image && <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
                                        <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all">
                                                <Plus className="w-5 h-5" />
                                            </div>
                                        </div>
                                    </div>
                                    <h3 className="text-sm font-black text-slate-900 line-clamp-1">{product.name}</h3>
                                    <p className="text-lg font-black text-primary mt-1">${price.toFixed(2)}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Cart Panel */}
            <div className="w-full md:w-96 lg:w-[400px] h-full bg-slate-50 flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] shrink-0">
                <div className="p-6 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="font-black text-slate-900">Resumen del Pedido</h2>
                        <p className="text-xs font-bold text-slate-500">{cartItems.length} artículos</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <AnimatePresence>
                        {cartItems.map(item => (
                            <motion.div
                                key={item.productId}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3"
                            >
                                <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                                    {item.image && <img src={item.image} alt={item.name} className="w-full h-full object-cover" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-black text-slate-900 truncate">{item.name}</h4>
                                    <p className="text-xs font-bold text-slate-400">${item.price.toFixed(2)}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 bg-slate-50 rounded-xl p-1 border border-slate-100">
                                    <button onClick={() => updateQuantity(item.productId, -1)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                        {item.quantity === 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                                    </button>
                                    <span className="w-6 text-center font-black text-slate-900 text-sm">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.productId, 1)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {cartItems.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-10">
                            <ShoppingBag className="w-12 h-12 text-slate-400 mb-3" />
                            <p className="font-bold text-slate-500">El pedido está vacío</p>
                            <p className="text-xs text-slate-400">Selecciona productos del catálogo</p>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-white border-t border-slate-200 shrink-0">
                    <div className="flex justify-between items-center mb-6">
                        <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Total a Pagar</span>
                        <span className="text-3xl font-black text-slate-900">${total.toFixed(2)}</span>
                    </div>
                    <button
                        onClick={handleSaveOrder}
                        disabled={cartItems.length === 0 || isSubmitting}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (orderId ? "Guardar Modificaciones" : "Procesar y Cobrar")}
                    </button>
                </div>
            </div>

            {/* Checkout Modal for New Local Orders */}
            {showCheckoutModal && !orderId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <h3 className="text-xl font-black text-slate-900 mb-6">Cobrar Pedido Local</h3>
                        
                        <div className="bg-slate-50 p-4 rounded-2xl mb-6 flex justify-between items-center border border-slate-100">
                            <span className="font-bold text-slate-500">Monto Total:</span>
                            <span className="text-2xl font-black text-primary">${total.toFixed(2)}</span>
                        </div>

                        <div className="space-y-3 mb-6">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Método de Pago</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['Punto de Venta', 'Pago Móvil', 'Efectivo', 'Zelle'].map((method) => (
                                    <button
                                        key={method}
                                        onClick={() => setPaymentMethod(method)}
                                        className={`w-full px-3 py-3 rounded-xl text-sm font-bold transition-all border-2 flex items-center justify-center ${
                                            paymentMethod === method ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                                        }`}
                                    >
                                        {method}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="flex items-center gap-2 cursor-pointer mb-3">
                                <input
                                    type="checkbox"
                                    checked={isDelivery}
                                    onChange={(e) => setIsDelivery(e.target.checked)}
                                    className="w-4 h-4 text-primary bg-slate-100 border-slate-300 rounded focus:ring-primary focus:ring-2"
                                />
                                <span className="text-sm font-bold text-slate-700">Enviar por Delivery</span>
                            </label>

                            {isDelivery && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Dirección de Entrega</label>
                                    <textarea
                                        value={deliveryAddress}
                                        onChange={(e) => setDeliveryAddress(e.target.value)}
                                        placeholder="Ingrese la dirección del cliente..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-primary resize-none"
                                        rows={2}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCheckoutModal(false)}
                                className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black hover:bg-slate-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmPayment}
                                disabled={!paymentMethod || isSubmitting}
                                className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5 mr-2" /> Pagar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
