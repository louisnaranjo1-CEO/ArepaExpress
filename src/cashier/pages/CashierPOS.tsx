import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Plus, Minus, Trash2, ShoppingBag, CheckCircle, Loader2, Star, Clock, Store, Truck, X, Tag, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CashierPOS() {
    const navigate = useNavigate();
    const { orderId } = useParams();
    
    const [restaurant, setRestaurant] = useState<any>(null);
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

    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
    const [itemNotes, setItemNotes] = useState('');

    const restaurantId = localStorage.getItem('cashierRestaurantId');
    const cashierData = JSON.parse(localStorage.getItem('cashierData') || '{}');

    useEffect(() => {
        const fetchData = async () => {
            if (!restaurantId) return;

            try {
                // Fetch Restaurant info
                const resDoc = await getDoc(doc(db, 'restaurants', restaurantId));
                if (resDoc.exists()) {
                    setRestaurant({ id: resDoc.id, ...resDoc.data() });
                }

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
    const total = subtotal; 

    const handleProductClick = (product: any) => {
        setSelectedProduct(product);
        setSelectedVariant(null);
        setItemNotes('');
    };

    const confirmAddToCart = () => {
        if (!selectedProduct) return;
        
        let finalPrice = selectedProduct.promoPrice && selectedProduct.promoPrice > 0 
            ? selectedProduct.promoPrice : selectedProduct.price;
        let finalName = selectedProduct.name;
        
        if (selectedProduct.variants && selectedProduct.variants.length > 0) {
            if (!selectedVariant) {
                alert("Por favor selecciona una variante");
                return;
            }
            finalPrice = selectedVariant.price;
            finalName = `${selectedProduct.name} (${selectedVariant.name})`;
        }

        const cartItemId = `${selectedProduct.id}-${selectedVariant ? selectedVariant.name : 'default'}-${Date.now()}`;

        setCartItems(prev => [...prev, {
            id: cartItemId,
            productId: selectedProduct.id,
            name: finalName,
            price: finalPrice,
            quantity: 1,
            image: selectedProduct.image,
            category: selectedProduct.category,
            variantName: selectedVariant?.name,
            notes: itemNotes
        }]);

        setSelectedProduct(null);
    };

    const updateQuantity = (cartId: string, delta: number) => {
        setCartItems(prev => prev.map(item => {
            if (item.id === cartId) {
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
                await updateDoc(doc(db, 'orders', orderId), {
                    items: cartItems,
                    subtotal: subtotal,
                    total: total + (waiterOrderInfo?.deliveryFee || 0)
                });
                alert("Orden actualizada correctamente.");
                navigate('/');
            } else {
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
                status: 'preparing',
                paymentStatus: 'sold',
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
            alert("Pedido cobrado exitosamente.");
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
        return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    }

    const statusObj = restaurant ? { isOpen: true, text: 'Abierto' } : { isOpen: false, text: 'Cerrado' };

    return (
        <div className="h-screen flex flex-col md:flex-row bg-slate-50 overflow-hidden">
            {/* Main Product Catalog */}
            <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-200 bg-white">
                
                {/* Restaurant Banner (Synced with App) */}
                {restaurant && (
                    <div className="relative w-full h-32 md:h-40 shrink-0 bg-slate-100 overflow-hidden">
                        <div 
                            className="absolute inset-0 bg-cover bg-center"
                            style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%), url("${restaurant.coverUrl || restaurant.image}")` }}
                        />
                        <div className="absolute inset-0 flex items-end p-4 gap-4">
                            <div className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-2xl p-1 shadow-xl border-2 border-white overflow-hidden shrink-0 flex items-center justify-center">
                                <img src={restaurant.logoUrl} className="w-full h-full object-contain rounded-xl" alt="" />
                            </div>
                            <div className="flex-1 pb-1">
                                <h1 className="text-xl md:text-2xl font-black text-white leading-tight drop-shadow-md">{restaurant.name}</h1>
                                <div className="flex items-center gap-3 mt-1">
                                    <div className="flex items-center gap-1 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/20">
                                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                        <span className="text-[10px] font-black text-white">{restaurant.rating || "5.0"}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                                        {statusObj.text}
                                    </div>
                                    <div className="flex items-center gap-1 text-white/80 text-[10px] font-bold">
                                        <Clock className="w-3 h-3" />
                                        <span>{restaurant.deliveryTime || "30-45 min"}</span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => navigate('/')} className="mb-2 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/30 text-white transition-all">
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Categories */}
                <div className="p-4 border-b border-slate-50 bg-slate-50/50 shrink-0">
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-5 py-2.5 rounded-2xl text-[11px] font-black whitespace-nowrap transition-all uppercase tracking-wider ${
                                    activeCategory === cat ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'bg-white text-slate-500 border border-slate-200 hover:border-primary/30'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Product Grid */}
                <div className="flex-1 overflow-y-auto p-4 content-start space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
                        {filteredProducts.map(product => {
                            const hasVariants = product.variants && product.variants.length > 0;
                            const displayPrice = hasVariants ? Math.min(...product.variants.map((v:any) => v.price)) : (product.promoPrice || product.price);
                            
                            return (
                                <div key={product.id} className="bg-white border-2 border-slate-50 rounded-3xl p-3 shadow-sm hover:shadow-xl hover:border-primary/10 transition-all group cursor-pointer flex flex-col" onClick={() => handleProductClick(product)}>
                                    <div className="w-full aspect-[4/3] bg-slate-50 rounded-2xl mb-3 overflow-hidden relative">
                                        {product.image && <img src={product.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />}
                                        <div className="absolute top-2 right-2 w-8 h-8 bg-white text-primary rounded-xl flex items-center justify-center shadow-lg transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
                                            <Plus className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <h3 className="text-sm font-black text-slate-900 mb-1 leading-tight">{product.name}</h3>
                                    {product.description && <p className="text-[10px] text-slate-400 line-clamp-2 mb-3 leading-tight font-medium">{product.description}</p>}
                                    <div className="mt-auto pt-2 flex items-center justify-between">
                                        <div className="flex flex-col">
                                            {hasVariants && <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest leading-none mb-0.5">Desde</span>}
                                            <span className="text-lg font-black text-slate-900 leading-none">${displayPrice.toFixed(2)}</span>
                                        </div>
                                        {hasVariants && (
                                            <div className="flex gap-1">
                                                {product.variants.slice(0, 3).map((v:any, i:number) => (
                                                    <div key={i} className="px-1.5 py-0.5 bg-slate-50 rounded-md text-[7px] font-black text-slate-400 uppercase tracking-tighter">
                                                        {v.name.slice(0, 3)}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Cart Panel */}
            <div className="w-full md:w-[400px] h-full bg-slate-50 flex flex-col shadow-[-10px_0_30px_-5px_rgba(0,0,0,0.05)] shrink-0 z-10">
                <div className="p-6 bg-white border-b border-slate-200 flex items-center gap-4 shrink-0">
                    <div className="w-12 h-12 bg-primary text-white rounded-[1.25rem] flex items-center justify-center shadow-lg shadow-primary/20">
                        <ShoppingBag className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="font-black text-slate-900 text-lg uppercase tracking-tight">Resumen del Pedido</h2>
                        <p className="text-xs font-bold text-slate-400">{cartItems.length} artículos agregados</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <AnimatePresence>
                        {cartItems.map(item => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 relative overflow-hidden"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-50">
                                    {item.image && <img src={item.image} alt="" className="w-full h-full object-cover" />}
                                </div>
                                <div className="flex-1 min-w-0 pr-2">
                                    <h4 className="text-[13px] font-black text-slate-900 leading-tight mb-0.5">{item.name}</h4>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-primary">${item.price.toFixed(2)}</span>
                                        {item.notes && <div className="flex items-center gap-1 text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-md"><MessageSquare className="w-2.5 h-2.5" /> Nota</div>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0 bg-slate-50 rounded-2xl p-1.5 border border-slate-100">
                                    <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                        {item.quantity === 1 ? <Trash2 className="w-4.5 h-4.5" /> : <Minus className="w-4.5 h-4.5" />}
                                    </button>
                                    <span className="w-6 text-center font-black text-slate-900 text-sm">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all">
                                        <Plus className="w-4.5 h-4.5" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {cartItems.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center py-20">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 opacity-50">
                                <ShoppingBag className="w-10 h-10 text-slate-400" />
                            </div>
                            <p className="font-black text-slate-400 uppercase tracking-widest text-[11px]">Carrito Vacío</p>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-white border-t border-slate-200 shrink-0 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.02)]">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total a Pagar</span>
                            <span className="text-4xl font-black text-slate-900 leading-none">${total.toFixed(2)}</span>
                        </div>
                    </div>
                    <button
                        onClick={handleSaveOrder}
                        disabled={cartItems.length === 0 || isSubmitting}
                        className="w-full bg-primary text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 group"
                    >
                        {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 
                        orderId ? "Guardar Cambios" : <><Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" /> Procesar y Cobrar</>}
                    </button>
                </div>
            </div>

            {/* Product Variant Modal (Internal Modal) */}
            <AnimatePresence>
                {selectedProduct && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="relative h-48 md:h-56">
                                {selectedProduct.image ? (
                                    <img src={selectedProduct.image} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <div className="w-full h-full bg-slate-100 flex items-center justify-center"><Store className="w-20 h-20 text-slate-200" /></div>
                                )}
                                <button onClick={() => setSelectedProduct(null)} className="absolute top-4 right-4 w-10 h-10 bg-black/30 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-black/50 transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                                <div className="absolute top-4 left-4">
                                    <div className="bg-primary px-4 py-1.5 rounded-2xl text-[10px] font-black text-white uppercase tracking-widest shadow-lg">Detalles de Orden</div>
                                </div>
                            </div>

                            <div className="p-8 flex-1 overflow-y-auto">
                                <h3 className="text-2xl font-black text-slate-900 leading-tight mb-2">{selectedProduct.name}</h3>
                                {selectedProduct.description && <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8">{selectedProduct.description}</p>}

                                {/* Variants Section */}
                                {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                                    <div className="mb-8 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Tag className="w-4 h-4 text-primary" />
                                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Selecciona Presentación</h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedProduct.variants.map((v: any, i: number) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setSelectedVariant(v)}
                                                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col text-left group ${
                                                        selectedVariant === v ? 'border-primary bg-white shadow-xl shadow-primary/10' : 'border-white bg-white/50 hover:bg-white text-slate-500'
                                                    }`}
                                                >
                                                    <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${selectedVariant === v ? 'text-primary' : 'text-slate-400'}`}>{v.name}</span>
                                                    <span className={`text-lg font-black ${selectedVariant === v ? 'text-slate-900' : 'text-slate-700'}`}>${v.price.toFixed(2)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Notes Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-slate-400" />
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Instrucciones Especiales</label>
                                    </div>
                                    <textarea
                                        value={itemNotes}
                                        onChange={(e) => setItemNotes(e.target.value)}
                                        placeholder="Ej: Sin cebolla, extra salsa, bien cocido..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-3xl px-6 py-4 text-sm font-bold text-slate-700 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all resize-none"
                                        rows={3}
                                    />
                                </div>
                            </div>

                            <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex gap-4">
                                <button onClick={() => setSelectedProduct(null)} className="flex-1 py-5 rounded-[2rem] font-black text-slate-500 hover:bg-slate-100 transition-colors">Cerrar</button>
                                <button
                                    onClick={confirmAddToCart}
                                    className="flex-[2] bg-primary text-white py-5 rounded-[2rem] font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-6 h-6" /> Agregar al Pedido
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Checkout Modal for New Local Orders */}
            {showCheckoutModal && !orderId && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-[3rem] p-8 w-full max-w-sm shadow-2xl"
                    >
                        <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Cobrar Pedido</h3>
                        <p className="text-sm text-slate-400 font-bold mb-8">Finaliza y registra la transacción</p>
                        
                        <div className="bg-slate-50 p-6 rounded-[2rem] mb-8 flex flex-col border border-slate-100">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Neto</span>
                            <span className="text-4xl font-black text-primary leading-none">${total.toFixed(2)}</span>
                        </div>

                        <div className="space-y-4 mb-8">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Método de Pago</label>
                            <div className="grid grid-cols-2 gap-3">
                                {['Punto', 'Pago Móvil', 'Efectivo', 'Zelle'].map((method) => (
                                    <button
                                        key={method}
                                        onClick={() => setPaymentMethod(method)}
                                        className={`w-full px-4 py-4 rounded-2xl text-xs font-black transition-all border-2 flex items-center justify-center uppercase tracking-wider ${
                                            paymentMethod === method ? 'border-primary bg-primary/5 text-primary shadow-lg shadow-primary/5' : 'border-slate-50 bg-slate-50 text-slate-500 hover:border-slate-200'
                                        }`}
                                    >
                                        {method}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-8">
                            <label className="flex items-center gap-3 cursor-pointer mb-4 group p-1 pl-2">
                                <input
                                    type="checkbox"
                                    checked={isDelivery}
                                    onChange={(e) => setIsDelivery(e.target.checked)}
                                    className="w-5 h-5 text-primary bg-slate-100 border-slate-200 rounded-lg focus:ring-primary focus:ring-2"
                                />
                                <span className="text-sm font-black text-slate-700 uppercase tracking-tight group-hover:text-primary transition-colors">Enviar por Delivery</span>
                            </label>

                            {isDelivery && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-3 overflow-hidden">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Dirección de Entrega</label>
                                    <textarea
                                        value={deliveryAddress}
                                        onChange={(e) => setDeliveryAddress(e.target.value)}
                                        placeholder="Ingrese ubicación..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold text-slate-700 outline-none focus:border-primary/50 resize-none"
                                        rows={2}
                                    />
                                </motion.div>
                            )}
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowCheckoutModal(false)}
                                className="flex-1 bg-slate-50 text-slate-500 py-5 rounded-[1.75rem] font-black uppercase text-xs tracking-widest hover:bg-slate-100 transition-colors"
                            >
                                Volver
                            </button>
                            <button
                                onClick={handleConfirmPayment}
                                disabled={!paymentMethod || isSubmitting}
                                className="flex-[2] bg-emerald-500 text-white py-5 rounded-[1.75rem] font-black shadow-xl shadow-emerald-500/30 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center uppercase text-xs tracking-widest"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5 mr-2" /> Confirmar</>}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
