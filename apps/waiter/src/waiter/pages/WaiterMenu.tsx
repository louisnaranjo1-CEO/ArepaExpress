import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Search, Star, Clock, Plus, Store, CheckCircle, Smartphone, X, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCart } from '../../context/CartContext';
import { Product } from '../../lib/seed';
import WaiterLayout from '../components/WaiterLayout';
import DualPrice from '../../components/DualPrice';

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
                const { data: resDoc, error: resErr } = await supabase
                    .from('comercios')
                    .select('*')
                    .eq('id', restaurantId)
                    .maybeSingle();

                if (resErr) {
                    console.error("Error fetching restaurant:", resErr);
                }

                if (resDoc) {
                    setRestaurant({
                        id: resDoc.id,
                        name: resDoc.name,
                        category: resDoc.category,
                        logoUrl: resDoc.logo_url || resDoc.logoUrl,
                        coverUrl: resDoc.cover_url || resDoc.coverUrl,
                        image: resDoc.image_url || resDoc.image,
                        ...resDoc
                    });

                    const { data: prods, error: prodsErr } = await supabase
                        .from('products')
                        .select('*')
                        .eq('restaurant_id', restaurantId);

                    if (prodsErr) {
                        console.error("Error fetching products:", prodsErr);
                    }

                    if (prods) {
                        const fetchedProducts = prods.map((p: any) => ({
                            id: p.id,
                            name: p.name,
                            price: Number(p.price) || 0,
                            promoPrice: Number(p.promo_price ?? p.promoPrice) || 0,
                            image: p.image_url || p.image,
                            category: p.category || 'General',
                            description: p.description || '',
                            isAvailable: p.is_available ?? p.isAvailable ?? true,
                            variants: p.variants || [],
                            pointsPrice: p.points_price || p.pointsPrice,
                            ...p
                        })) as Product[];
                        setProducts(fetchedProducts);
                    }
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
                <div className="bg-primary text-slate-900 text-center py-2 text-[10px] font-black uppercase tracking-widest z-50 sticky top-0 flex justify-center items-center gap-2">
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
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
                        <input 
                            type="text"
                            placeholder="Buscar en el menú..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3.5 pl-12 pr-4 font-bold text-sm outline-none focus:border-primary transition-all"
                        />
                    </div>
                </div>

                {/* Categories */}
                <div className="flex gap-2 overflow-x-auto px-5 py-4 scrollbar-none">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                                activeCategory === cat
                                    ? 'bg-slate-900 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Products Grid */}
                <div className="px-5 pb-28 grid grid-cols-1 gap-4 flex-1">
                    {filteredProducts.map((product) => (
                        <div 
                            key={product.id}
                            onClick={() => {
                                setSelectedProduct(product);
                                setSelectedVariant(product.variants && product.variants.length > 0 ? product.variants[0] : null);
                                setSelectionQty(1);
                                setSelectionNote('');
                            }}
                            className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between gap-4 cursor-pointer hover:border-slate-200 active:scale-[0.99] transition-all"
                        >
                            <div className="flex-1 min-w-0">
                                <h3 className="font-black text-slate-800 text-base">{product.name}</h3>
                                {product.description && (
                                    <p className="text-xs text-slate-400 font-medium line-clamp-2 mt-1">{product.description}</p>
                                )}
                                <div className="mt-2 flex items-center gap-2">
                                    <DualPrice 
                                        usdAmount={product.promoPrice && product.promoPrice > 0 ? product.promoPrice : (product.price || 0)} 
                                        className="font-black text-slate-900 text-sm"
                                        showDivider={true}
                                    />
                                    {product.promoPrice && product.promoPrice > 0 && (
                                        <span className="line-through text-xs text-slate-400 font-bold">
                                            ${product.price?.toFixed(2)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {product.image && (
                                <div className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden shrink-0">
                                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                                </div>
                            )}
                        </div>
                    ))}

                    {filteredProducts.length === 0 && (
                        <div className="text-center py-12 text-slate-400 font-bold text-sm">
                            No se encontraron productos en esta categoría.
                        </div>
                    )}
                </div>

                {/* Product Detail Modal */}
                <AnimatePresence>
                    {selectedProduct && (
                        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setSelectedProduct(null)}
                                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                            />

                            <motion.div 
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] max-h-[85vh] overflow-hidden flex flex-col z-10"
                            >
                                {/* Modal Header */}
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                                    <h2 className="text-xl font-black text-slate-800">{selectedProduct.name}</h2>
                                    <button 
                                        onClick={() => setSelectedProduct(null)}
                                        className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-6 overflow-y-auto space-y-6">
                                    {selectedProduct.image && (
                                        <div className="w-full h-48 rounded-3xl overflow-hidden bg-slate-100">
                                            <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" />
                                        </div>
                                    )}

                                    {selectedProduct.description && (
                                        <p className="text-sm text-slate-500 font-medium leading-relaxed">{selectedProduct.description}</p>
                                    )}

                                    {/* Variants */}
                                    {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Elige una opción</label>
                                            <div className="grid grid-cols-1 gap-2">
                                                {selectedProduct.variants.map((v: any, idx: number) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedVariant(v)}
                                                        className={`p-4 rounded-2xl border flex items-center justify-between text-left transition-all ${
                                                            selectedVariant?.name === v.name
                                                                ? 'border-primary bg-primary/5 font-black text-slate-900'
                                                                : 'border-slate-100 hover:border-slate-200 font-bold text-slate-600'
                                                        }`}
                                                    >
                                                        <span>{v.name}</span>
                                                        <DualPrice usdAmount={v.price} className="font-bold text-sm" showDivider={false} />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Quantity and Notes */}
                                    <div className="space-y-4">
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
                                                    className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-900 hover:text-slate-900-dark active:scale-95 transition-transform"
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
                                            : 'bg-primary text-slate-900 shadow-primary/30 hover:scale-[1.02]'
                                        }`}
                                    >
                                        <Plus className="w-6 h-6" />
                                        <span>Agregar • </span>
                                        <DualPrice 
                                            usdAmount={( (selectedVariant ? selectedVariant.price : (selectedProduct.promoPrice && selectedProduct.promoPrice > 0 ? selectedProduct.promoPrice : selectedProduct.price || 0)) * selectionQty )}
                                            className="font-black text-lg"
                                            showDivider={true}
                                        />
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
                            className="w-full bg-primary text-slate-900 rounded-2xl p-4 shadow-xl shadow-primary/40 flex items-center justify-between active:scale-95 transition-transform"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-white/20 px-3 py-1 rounded-lg text-sm font-black">{totalItems}</div>
                                <span className="font-black text-sm uppercase tracking-wider">CREAR COMANDA</span>
                            </div>
                            <DualPrice 
                                usdAmount={totalPrice}
                                className="font-black text-lg"
                                usdClassName="text-lg font-black"
                            />
                        </button>
                    </div>
                )}
            </div>
        </WaiterLayout>
    );
}
