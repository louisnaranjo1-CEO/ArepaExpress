import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Search, Star, Clock, Plus, Store, CheckCircle, Smartphone, X, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../../context/CartContext';
import { Product } from '../../lib/seed';
import WaiterLayout from '../components/WaiterLayout';

export default function WaiterMenu() {
    const [searchParams] = useSearchParams();
    const tableNumber = searchParams.get('table');
    const navigate = useNavigate();
    const [restaurant, setRestaurant] = useState<any | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<string>('Todos');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
    const { addItem, totalItems, totalPrice, clearCart } = useCart();

    const restaurantId = localStorage.getItem('waiterRestaurantId');
    const waiterData = JSON.parse(localStorage.getItem('waiterData') || '{}');

    useEffect(() => {
        const fetchRestaurantAndMenu = async () => {
            if (!restaurantId) {
                setLoading(false);
                return;
            }
            try {
                const docRef = doc(db, 'restaurants', restaurantId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setRestaurant({ id: docSnap.id, ...docSnap.data() });

                    const productsRef = collection(db, 'restaurants', restaurantId, 'products');
                    const productsSnap = await getDocs(productsRef);
                    const fetchedProducts = productsSnap.docs.map(p => ({ id: p.id, ...p.data() })) as Product[];
                    setProducts(fetchedProducts);
                }
            } catch (err) {
                console.error("Error fetching menu:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRestaurantAndMenu();
    }, [restaurantId]);

    const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];

    const filteredProducts = products.filter(p => {
        const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
        const isAvailable = p.isAvailable !== false;
        return matchesCategory && isAvailable;
    });

    const handleAddToCart = (product: Product, variant?: any) => {
        let finalPrice = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : (product.price || 0);
        let finalName = product.name;

        if (variant) {
            finalPrice = variant.price;
            finalName = `${product.name} - ${variant.name}`;
        }

        addItem({
            id: `${product.id}${variant ? `-${variant.name}` : ''}`,
            productId: product.id!,
            restaurantId: restaurant.id!,
            name: finalName,
            price: finalPrice,
            pointsPrice: (product as any).pointsPrice,
            quantity: 1,
            image: product.image,
            category: product.category,
            table: tableNumber || undefined
        });
    };

    if (loading) {
        return (
            <div className="w-full h-screen flex flex-col items-center justify-center space-y-4 bg-slate-50">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-500 font-medium">Cargando menú...</p>
            </div>
        );
    }

    if (!restaurant) return null;

    return (
        <WaiterLayout>
            <div className="relative w-full min-h-screen bg-white overflow-x-hidden flex flex-col">
                {/* Header Badge */}
                <div className="bg-primary text-white text-center py-2 text-[10px] font-black uppercase tracking-widest z-50 sticky top-0 flex justify-center items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5" />
                    COMANDERO: {waiterData.name} {tableNumber && `• MESA ${tableNumber}`}
                </div>

                {/* Back Button */}
                <button
                    onClick={() => window.history.length > 1 ? window.history.back() : navigate('/')}
                    className="absolute top-14 left-4 z-50 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white cursor-pointer border-none outline-none"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>

                {/* Hero Section */}
                <div className="relative w-full h-48 shrink-0 bg-slate-100">
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.7) 100%)${restaurant.coverUrl || restaurant.image ? `, url("${restaurant.coverUrl || restaurant.image}")` : ''}`
                        }}
                    />
                    <div className="absolute -bottom-6 left-5 flex items-end gap-3 z-30">
                        <div className="w-20 h-20 bg-white rounded-full p-1 shadow-xl border-4 border-white flex items-center justify-center overflow-hidden">
                            {restaurant.logoUrl ? (
                                <img src={restaurant.logoUrl} alt={restaurant.name} className="w-full h-full object-contain rounded-full" />
                            ) : (
                                <Store className="w-8 h-8 text-slate-300" />
                            )}
                        </div>
                        <div className="pb-8">
                            <h1 className="text-xl font-black text-white leading-tight drop-shadow-md">{restaurant.name}</h1>
                            <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">{restaurant.category}</p>
                        </div>
                    </div>
                </div>

                <div className="h-6 shrink-0" />

                {/* Categories */}
                <div className="sticky top-8 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-50 py-3 mt-4">
                    <div className="flex overflow-x-auto gap-2 px-5 hide-scrollbar">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${activeCategory === cat
                                    ? "bg-primary text-white shadow-md shadow-primary/20"
                                    : "bg-slate-50 text-slate-500 border border-slate-100"
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Menu List */}
                <div className="px-5 pb-32 flex-1 mt-4 space-y-4">
                    {filteredProducts.map((product) => (
                        <div
                            key={product.id}
                            className="flex gap-4 py-4 border-b border-slate-50 items-center cursor-pointer group"
                            onClick={() => {
                                if (product.variants && product.variants.length > 0) {
                                    setSelectedProduct(product);
                                    setSelectedVariant(null);
                                }
                            }}
                        >
                            <div className="flex-1">
                                <h3 className="font-bold text-slate-800 text-sm mb-1">{product.name}</h3>
                                <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed mb-2">{product.description}</p>
                                {product.variants && product.variants.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Desde</span>
                                        <span className="font-black text-slate-900 text-base">
                                            ${Math.min(...product.variants.map(v => v.price)).toFixed(2)}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="font-black text-slate-900 text-base">
                                        ${(product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price || 0).toFixed(2)}
                                    </span>
                                )}
                            </div>
                            <div className="relative shrink-0 w-24 h-24">
                                <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-full h-full object-cover rounded-2xl shadow-sm bg-slate-50"
                                />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (product.variants && product.variants.length > 0) {
                                            setSelectedProduct(product);
                                            setSelectedVariant(null);
                                        } else {
                                            handleAddToCart(product);
                                        }
                                    }}
                                    className="absolute -bottom-2 -right-2 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform z-10"
                                >
                                    <Plus className="w-5 h-5 font-bold" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Product Detail Modal */}
                <AnimatePresence>
                    {selectedProduct && (
                        <div className="fixed inset-0 z-[110] flex items-end justify-center">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                                onClick={() => setSelectedProduct(null)}
                            />
                            <motion.div
                                initial={{ opacity: 0, y: 100 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 100 }}
                                className="bg-white rounded-t-[3rem] w-full max-w-lg shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[85vh]"
                            >
                                <div className="relative h-64 shrink-0 bg-slate-100">
                                    <button
                                        onClick={() => setSelectedProduct(null)}
                                        className="absolute top-5 right-5 w-8 h-8 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 shadow-xl z-20"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                    <img
                                        src={selectedProduct.image}
                                        alt={selectedProduct.name}
                                        className="w-full h-full object-cover"
                                    />
                                </div>

                                <div className="p-6 pb-24 flex-1 overflow-y-auto">
                                    <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-full">
                                        {selectedProduct.category}
                                    </span>
                                    <h2 className="text-2xl font-black text-slate-900 mt-2">{selectedProduct.name}</h2>
                                    <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                                        {selectedProduct.description}
                                    </p>

                                    {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                                        <div className="mt-6">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Presentaciones <span className="text-red-500">*</span></h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                {selectedProduct.variants.map((v: any, idx: number) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedVariant(v)}
                                                        className={`border p-4 rounded-3xl flex flex-col gap-1 text-left transition-all ${selectedVariant?.name === v.name ? 'bg-primary border-primary shadow-lg shadow-primary/20' : 'bg-slate-50 border-slate-100'}`}
                                                    >
                                                        <span className={`text-[10px] font-black uppercase ${selectedVariant?.name === v.name ? 'text-white/80' : 'text-slate-400'}`}>{v.name}</span>
                                                        <span className={`text-lg font-black ${selectedVariant?.name === v.name ? 'text-white' : 'text-slate-800'}`}>${v.price.toFixed(2)}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="absolute bottom-0 left-0 w-full p-6 bg-white/80 backdrop-blur-md border-t border-slate-100">
                                    <button
                                        disabled={selectedProduct.variants && selectedProduct.variants.length > 0 && !selectedVariant}
                                        onClick={() => {
                                            handleAddToCart(selectedProduct, selectedVariant);
                                            setSelectedProduct(null);
                                            setSelectedVariant(null);
                                        }}
                                        className={`w-full py-4 rounded-3xl font-black text-sm shadow-2xl flex items-center justify-center gap-3 transition-colors ${selectedProduct.variants && selectedProduct.variants.length > 0 && !selectedVariant
                                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            : 'bg-primary text-white'
                                            }`}
                                    >
                                        <Plus className="w-5 h-5" />
                                        Añadir al Pedido
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Floating Order Button */}
                {totalItems > 0 && (
                    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full px-5 max-w-lg z-50">
                        <button
                            onClick={() => navigate('/cart')}
                            className="w-full bg-primary text-white rounded-2xl p-4 shadow-xl shadow-primary/40 flex items-center justify-between active:scale-95 transition-transform"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-white/20 px-3 py-1 rounded-lg text-sm font-black">{totalItems}</div>
                                <span className="font-black text-sm uppercase tracking-wider">CREAR COMANDA</span>
                            </div>
                            <span className="font-black text-lg">${totalPrice.toFixed(2)}</span>
                        </button>
                    </div>
                )}
            </div>
        </WaiterLayout>
    );
}
