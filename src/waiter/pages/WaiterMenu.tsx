import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Search, Star, Clock, Plus, Store, CheckCircle, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../../context/CartContext';
import { Product } from '../../lib/seed';

export default function WaiterMenu() {
    const [searchParams] = useSearchParams();
    const tableNumber = searchParams.get('table');
    const navigate = useNavigate();
    const [restaurant, setRestaurant] = useState<any | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<string>('Todos');
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

    const handleAddToCart = (product: Product) => {
        const finalPrice = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price;
        addItem({
            id: `${product.id}`,
            productId: product.id!,
            restaurantId: restaurant.id!,
            name: product.name,
            price: finalPrice,
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
        <div className="relative w-full min-h-screen bg-white overflow-x-hidden flex flex-col">
            {/* Header Badge */}
            <div className="bg-primary text-white text-center py-2 text-[10px] font-black uppercase tracking-widest z-50 sticky top-0 flex justify-center items-center gap-2">
                <Smartphone className="w-3.5 h-3.5" />
                COMANDERO: {waiterData.name} {tableNumber && `• MESA ${tableNumber}`}
            </div>

            {/* Back Button */}
            <button
                onClick={() => navigate('/')}
                className="absolute top-14 left-4 z-50 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white"
            >
                <ArrowLeft className="w-6 h-6" />
            </button>

            {/* Hero Section (Mirroring Restaurant.tsx) */}
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
                    <div key={product.id} className="flex gap-4 py-4 border-b border-slate-50 items-center">
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-800 text-sm mb-1">{product.name}</h3>
                            <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed mb-2">{product.description}</p>
                            <span className="font-black text-slate-900 text-base">
                                ${(product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price).toFixed(2)}
                            </span>
                        </div>
                        <div className="relative shrink-0 w-24 h-24">
                            <img
                                src={product.image}
                                alt={product.name}
                                className="w-full h-full object-cover rounded-2xl shadow-sm bg-slate-50"
                            />
                            <button
                                onClick={() => handleAddToCart(product)}
                                className="absolute -bottom-2 -right-2 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating Order Button */}
            {totalItems > 0 && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full px-5 max-w-lg z-50">
                    <button
                        onClick={() => navigate('/cart')}
                        className="w-full bg-primary text-white rounded-2xl p-4 shadow-xl shadow-primary/30 flex items-center justify-between"
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
    );
}
