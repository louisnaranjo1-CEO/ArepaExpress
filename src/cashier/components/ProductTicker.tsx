import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion } from 'framer-motion';
import { Tag, TrendingUp } from 'lucide-react';

interface Product {
    id: string;
    name: string;
    price: number;
    promoPrice?: number;
    image?: string;
    images?: string[];
    variants?: { name: string; price: number }[];
    consultPrice?: boolean;
    category: string;
}

interface ProductTickerProps {
    restaurantId: string;
}

export default function ProductTicker({ restaurantId }: ProductTickerProps) {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!restaurantId) return;

        const productsRef = collection(db, 'restaurants', restaurantId, 'products');
        const q = query(productsRef, where('isAvailable', '!=', false));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
            // Filter inactive ones manually if the query doesn't handle all cases or if composite index is missing
            setProducts(data.filter(p => (p as any).isAvailable !== false));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [restaurantId]);

    if (loading || products.length === 0) return null;

    // Duplicate products for infinite loop (3 times to ensure it fills most screens twice)
    const tickerProducts = [...products, ...products, ...products];

    return (
        <div className="w-full bg-[#0F172A] overflow-hidden py-2 border-b border-white/5 relative z-50 shadow-2xl">
            <style>
                {`
                @keyframes scroll-ticker {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-33.33%); }
                }
                .animate-scroll-ticker {
                    animation: scroll-ticker ${products.length * 4}s linear infinite;
                }
                .animate-scroll-ticker:hover {
                    animation-play-state: paused;
                }
                `}
            </style>
            
            {/* Soft gradient masks for premium feel */}
            <div className="absolute top-0 left-0 h-full w-24 bg-gradient-to-r from-[#0F172A] to-transparent z-10 pointer-events-none"></div>
            <div className="absolute top-0 right-0 h-full w-24 bg-gradient-to-l from-[#0F172A] to-transparent z-10 pointer-events-none"></div>
            
            <div className="flex items-center gap-12 w-max px-6 animate-scroll-ticker cursor-default">
                {tickerProducts.map((product, idx) => {
                    const displayPrice = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price;
                    const minVariantPrice = product.variants && product.variants.length > 0 
                        ? Math.min(...product.variants.map(v => v.price)) 
                        : null;
                    const firstImg = (product.images && product.images.length > 0) ? product.images[0] : product.image;

                    return (
                        <div key={`${product.id}-${idx}`} className="flex items-center gap-3 shrink-0 group hover:opacity-100 transition-opacity">
                            {firstImg && (
                                <div className="w-8 h-8 bg-white/5 rounded-xl overflow-hidden border border-white/10 p-1 group-hover:bg-white/10 group-hover:border-primary/50 transition-all duration-300">
                                    <img src={firstImg} alt="" className="w-full h-full object-contain filter drop-shadow-sm group-hover:scale-110 transition-transform" />
                                </div>
                            )}
                            <div className="flex flex-col">
                                <span className="text-[11px] font-black text-white/90 uppercase tracking-tight leading-none mb-1 group-hover:text-slate-900 transition-colors">
                                    {product.name}
                                </span>
                                <div className="flex items-center gap-2">
                                    {product.consultPrice ? (
                                        <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md text-[9px] font-black uppercase tracking-tighter border border-amber-500/20">
                                            <Tag className="w-2.5 h-2.5" />
                                            Consultar
                                        </div>
                                    ) : minVariantPrice !== null ? (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter leading-none">Desde</span>
                                            <span className="text-[12px] font-black text-emerald-400 leading-none">${minVariantPrice.toFixed(2)}</span>
                                            <div className="h-3 w-[1px] bg-white/10 mx-0.5"></div>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                                                {product.variants!.length} variantes
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[12px] font-black text-emerald-400 leading-none">
                                                ${displayPrice.toFixed(2)}
                                            </span>
                                            {product.promoPrice && product.promoPrice > 0 && (
                                                <span className="text-[9px] text-slate-500 line-through font-bold opacity-50">
                                                    ${product.price.toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Stylish Separator icon */}
                            <div className="ml-4 opacity-10 group-hover:opacity-30 transition-opacity">
                                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
