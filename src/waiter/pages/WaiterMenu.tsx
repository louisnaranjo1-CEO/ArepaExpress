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
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
    const [selectionQty, setSelectionQty] = useState(1);
    const [selectionNote, setSelectionNote] = useState('');
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
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
        const isAvailable = p.isAvailable !== false;
        return matchesCategory && matchesSearch && isAvailable;
    });

    const handleAddToCart = (product: Product, variant?: any, qty: number = 1, note: string = '') => {
        let finalPrice = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : (product.price || 0);
        let finalName = product.name;

        if (variant) {
            finalPrice = variant.price;
            finalName = `${product.name} - ${variant.name}`;
        }

        addItem({
            id: `${product.id}${variant ? `-${variant.name}` : ''}-${Date.now()}`,
            productId: product.id!,
            restaurantId: restaurant.id!,
            name: finalName,
            price: finalPrice,
            pointsPrice: (product as any).pointsPrice,
            quantity: qty,
            note: note,
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

                {/* Search Bar */}
                <div className="px-5 mt-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                        <input 
                            type="text"
                            placeholder="Buscar en el menú..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-primary focus:bg-white transition-all font-bold text-slate-600 shadow-sm"
                        />
                    </div>
                </div>

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
                                setSelectedProduct(product);
                                setSelectedVariant(null);
                                setSelectionQty(1);
                                setSelectionNote('');
                            }}
                        >
                            <div className="flex-1">
                                <h3 className="font-bold text-slate-800 text-sm mb-1">{product.name}</h3>
                                <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed mb-2">{product.description}</p>
                                {product.variants && product.variants.length > 0 ? (
                                    <div className="w-full flex flex-col gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Desde</span>
                                            <span className="font-black text-slate-900 text-base">${Math.min(...product.variants.map(v => v.price)).toFixed(2)}</span>
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            {product.variants.map((v, idx) => (
                                                <div key={idx} className="bg-white border border-slate-100 px-2.5 py-1 rounded-xl flex flex-col gap-0 shadow-sm">
                                                    <span className="text-[8px] font-black uppercase text-slate-400 leading-none">{v.name}</span>
                                                    <span className="text-[11px] font-black text-slate-800 leading-none">${v.price.toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        {product.promoPrice && product.promoPrice > 0 ? (
                                            <>
                                                <span className="font-black text-primary text-base">${product.promoPrice.toFixed(2)}</span>
                                                <span className="text-[10px] text-slate-400 line-through font-bold">${product.price.toFixed(2)}</span>
                                            </>
                                        ) : (
                                            <span className="font-black text-slate-900 text-base">${product.price.toFixed(2)}</span>
                                        )}
                                    </div>
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
                                        setSelectedProduct(product);
                                        setSelectedVariant(null);
                                        setSelectionQty(1);
                                        setSelectionNote('');
                                    }}
                                    className="absolute -bottom-2 -right-2 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform z-10"
                                >
                                    <Plus className="w-5 h-5 font-bold" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* SELECTION MODAL (Enhanced) */}
                <AnimatePresence>
                    {selectedProduct && (
                        <div className="fixed inset-0 z-[200] flex items-end justify-center">
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
                                className="bg-white rounded-t-[3rem] w-full max-w-lg shadow-2xl overflow-hidden relative z-[210] flex flex-col max-h-[90vh]"
                            >
                                {/* Header / Image */}
                                <div className="relative h-56 shrink-0">
                                    {selectedProduct.image ? (
                                        <img src={selectedProduct.image} className="w-full h-full object-cover" alt={selectedProduct.name} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-100">
                                            <Tag className="w-16 h-16" />
                                        </div>
                                    )}
                                    <button 
                                        onClick={() => setSelectedProduct(null)}
                                        className="absolute top-4 right-4 bg-black/20 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/40 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                                        <h3 className="text-xl font-black text-white">{selectedProduct.name}</h3>
                                        <p className="text-white/80 font-bold text-xs">
                                            {selectedProduct.category} • ${(selectedProduct.promoPrice && selectedProduct.promoPrice > 0 ? selectedProduct.promoPrice : selectedProduct.price || 0).toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                                    {/* Description */}
                                    {selectedProduct.description && (
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</label>
                                            <p className="text-slate-600 font-medium text-sm leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                                {selectedProduct.description}
                                            </p>
                                        </div>
                                    )}

                                    {/* Variants selection */}
                                    {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selecciona una Variante <span className="text-red-500 font-bold">*</span></label>
                                            <div className="grid grid-cols-1 gap-2">
                                                {selectedProduct.variants.map((variant: any, idx: number) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedVariant(variant)}
                                                        className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all font-bold ${
                                                            selectedVariant?.name === variant.name 
                                                            ? 'border-primary bg-primary/5 text-primary' 
                                                            : 'border-slate-100 text-slate-600 hover:border-slate-200 bg-slate-50/50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedVariant?.name === variant.name ? 'border-primary bg-primary' : 'border-slate-300'}`}>
                                                                {selectedVariant?.name === variant.name && <div className="w-2 h-2 bg-white rounded-full" />}
                                                            </div>
                                                            <span className="text-sm">{variant.name}</span>
                                                        </div>
                                                        <span className="font-black text-sm">${variant.price.toFixed(2)}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Quantity and Notes */}
                                    <div className="space-y-6">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cantidad</label>
                                            <div className="flex items-center bg-slate-100 p-1 rounded-2xl w-fit">
                                                <button 
                                                    onClick={() => setSelectionQty(Math.max(1, selectionQty - 1))}
                                                    className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-500 hover:text-slate-700 active:scale-95 transition-transform"
                                                >
                                                    <Plus className="w-4 h-4 rotate-45" />
                                                </button>
                                                <span className="w-12 text-center font-black text-lg">{selectionQty}</span>
                                                <button 
                                                    onClick={() => setSelectionQty(selectionQty + 1)}
                                                    className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-primary hover:text-primary-dark active:scale-95 transition-transform"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notas Especiales</label>
                                            <input 
                                                type="text"
                                                placeholder="Ej: Sin cebolla, extra salsa..."
                                                value={selectionNote}
                                                onChange={(e) => setSelectionNote(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl outline-none focus:border-primary font-bold text-slate-700 h-14 transition-all text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
                                    <button
                                        disabled={selectedProduct.variants && selectedProduct.variants.length > 0 && !selectedVariant}
                                        onClick={() => {
                                            handleAddToCart(selectedProduct, selectedVariant, selectionQty, selectionNote);
                                            setSelectedProduct(null);
                                            setSelectedVariant(null);
                                        }}
                                        className={`w-full py-5 rounded-3xl font-black text-lg shadow-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${
                                            selectedProduct.variants && selectedProduct.variants.length > 0 && !selectedVariant
                                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                            : 'bg-primary text-white shadow-primary/30 hover:scale-[1.02]'
                                        }`}
                                    >
                                        <Plus className="w-6 h-6" />
                                        Agregar • ${( (selectedVariant ? selectedVariant.price : (selectedProduct.promoPrice && selectedProduct.promoPrice > 0 ? selectedProduct.promoPrice : selectedProduct.price || 0)) * selectionQty ).toFixed(2)}
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
