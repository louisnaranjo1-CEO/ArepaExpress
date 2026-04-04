import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, Gift, Store, Tag, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

interface GlobalPrize {
    id: string;
    title: string;
    description: string;
    pointsRequired: number;
    imageUrl: string;
    isActive: boolean;
}

interface RestaurantData {
    id: string;
    name: string;
    logoUrl?: string;
}

interface RedeemableProduct {
    id: string;
    name: string;
    description: string;
    pointsPrice: number;
    image?: string;
}

interface PointsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function PointsModal({ isOpen, onClose }: PointsModalProps) {
    const { userData } = useAuth();
    const [globalPrizes, setGlobalPrizes] = useState<GlobalPrize[]>([]);
    const [loadingPrizes, setLoadingPrizes] = useState(false);
    
    // Using a record to map restaurant ID to its data and redeemable products
    const [restaurantInfo, setRestaurantInfo] = useState<Record<string, { data: RestaurantData, products: RedeemableProduct[] }>>({});
    const [loadingRestaurants, setLoadingRestaurants] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        const fetchPrizes = async () => {
            setLoadingPrizes(true);
            try {
                const snapshot = await getDocs(query(collection(db, 'global_prizes'), where('isActive', '==', true)));
                const prizes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GlobalPrize));
                // Sort by points required ascending
                prizes.sort((a, b) => a.pointsRequired - b.pointsRequired);
                setGlobalPrizes(prizes);
            } catch (error) {
                console.error("Error fetching global prizes:", error);
            } finally {
                setLoadingPrizes(false);
            }
        };

        const fetchRestaurantData = async () => {
            if (!userData?.restaurantPoints) return;
            
            setLoadingRestaurants(true);
            try {
                const info: Record<string, { data: RestaurantData, products: RedeemableProduct[] }> = {};
                
                for (const [restId, points] of Object.entries(userData.restaurantPoints)) {
                    if ((points as number) <= 0) continue;
                    
                    // Fetch restaurant details
                    const restDoc = await getDoc(doc(db, 'restaurants', restId));
                    if (!restDoc.exists()) continue;
                    
                    const restData = { id: restDoc.id, ...restDoc.data() } as RestaurantData;
                    
                    // Fetch redeemable products
                    const prodSnap = await getDocs(query(collection(db, `restaurants/${restId}/products`), where('pointsPrice', '>', 0)));
                    const products = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RedeemableProduct));
                    
                    // Only add if they have points > 0
                    info[restId] = { data: restData, products };
                }
                
                setRestaurantInfo(info);
            } catch (error) {
                console.error("Error fetching restaurant points data:", error);
            } finally {
                setLoadingRestaurants(false);
            }
        };

        fetchPrizes();
        fetchRestaurantData();
    }, [isOpen, userData]);

    if (!isOpen) return null;

    const globalPoints = userData?.points || 0;
    const hasRestaurantPoints = userData?.restaurantPoints && Object.values(userData.restaurantPoints).some(p => (p as number) > 0);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
                <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] flex flex-col h-[85vh] sm:h-auto max-h-[90vh] shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                                <Star className="w-6 h-6 text-primary fill-primary" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 leading-tight">Centro de Recompensas</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Un 2x3 Rewards</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-all">
                            <X className="w-6 h-6 text-slate-400" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto flex-1 p-6 space-y-6 bg-slate-50/30">
                        
                        {/* Global Points Section */}
                        <div className="bg-gradient-to-br from-primary to-orange-500 rounded-[24px] p-6 text-white shadow-lg shadow-primary/20 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-12 translate-x-12 blur-2xl"></div>
                            
                            <div className="relative z-10 flex flex-col items-center text-center">
                                <span className="text-xs font-black uppercase tracking-widest text-white/80 mb-1">Tus DeliPuntos Globales</span>
                                <div className="flex items-center gap-2">
                                    <Star className="w-8 h-8 fill-white text-white drop-shadow-sm" />
                                    <span className="text-5xl font-black">{globalPoints}</span>
                                </div>
                                <p className="text-sm font-medium text-white/90 mt-2">
                                    Acumula puntos con tus compras en cualquier lugar y canjéalos por premios increíbles.
                                </p>
                            </div>
                        </div>

                        {/* Global Prizes */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 px-2">
                                <Gift className="w-4 h-4 text-primary" />
                                Premios Disponibles
                            </h4>
                            
                            {loadingPrizes ? (
                                <div className="flex justify-center py-6">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : globalPrizes.length > 0 ? (
                                <div className="flex overflow-x-auto gap-4 pb-4 px-2 snap-x -mx-2 hide-scrollbar">
                                    {globalPrizes.map((prize) => {
                                        const canRedeem = globalPoints >= prize.pointsRequired;
                                        return (
                                            <div key={prize.id} className="min-w-[160px] max-w-[160px] bg-white border border-slate-100 rounded-2xl p-3 shrink-0 snap-center shadow-sm relative overflow-hidden">
                                                <div className="h-24 bg-slate-100 rounded-xl mb-3 overflow-hidden">
                                                    {prize.imageUrl ? (
                                                        <img src={prize.imageUrl} alt={prize.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                            <Gift className="w-8 h-8" />
                                                        </div>
                                                    )}
                                                </div>
                                                <h5 className="font-bold text-slate-800 text-sm leading-tight mb-1 line-clamp-2">{prize.title}</h5>
                                                
                                                <div className="flex items-center gap-1 mt-2">
                                                    <Star className={`w-3.5 h-3.5 ${canRedeem ? 'text-primary' : 'text-slate-400'}`} />
                                                    <span className={`text-sm font-black ${canRedeem ? 'text-primary' : 'text-slate-500'}`}>
                                                        {prize.pointsRequired} pts
                                                    </span>
                                                </div>
                                                
                                                <button 
                                                    disabled={!canRedeem}
                                                    className={`w-full mt-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                                                        canRedeem ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                    }`}
                                                >
                                                    {canRedeem ? 'Canjear' : 'Te faltan puntos'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                                    <p className="text-sm text-slate-500 font-medium">No hay premios globales disponibles en este momento.</p>
                                </div>
                            )}
                        </div>

                        {/* Restaurant Points */}
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2 px-2">
                                <Store className="w-4 h-4 text-orange-500" />
                                Puntos por Restaurante
                            </h4>
                            <p className="text-xs text-slate-500 px-2 leading-relaxed">
                                Estos puntos los acumulas al comprar en establecimientos específicos y solo pueden usarse allí. Al pagar tu pedido en el carrito, podrás elegir usarlos si el local tiene productos habilitados.
                            </p>

                            {loadingRestaurants ? (
                                <div className="flex justify-center py-6">
                                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : hasRestaurantPoints ? (
                                <div className="space-y-4">
                                    {Object.entries(restaurantInfo).map(([restId, info]) => {
                                        const rInfo = info as { data: RestaurantData, products: RedeemableProduct[] };
                                        const pts = (userData?.restaurantPoints?.[restId] as number) || 0;
                                        if (pts <= 0) return null;

                                        return (
                                            <div key={restId} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                                                <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                            {rInfo.data.logoUrl ? (
                                                                <img src={rInfo.data.logoUrl} alt={rInfo.data.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-slate-400 font-black text-xs">
                                                                    {rInfo.data.name.substring(0,2).toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h5 className="font-bold text-slate-800 text-sm leading-none">{rInfo.data.name}</h5>
                                                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Saldo local</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <div className="flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-lg border border-orange-100">
                                                            <Star className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                                                            <span className="font-black text-orange-600 font-mono text-sm">{pts}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Redeemable Products Preview */}
                                                {rInfo.products.length > 0 ? (
                                                    <div>
                                                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 flex items-center gap-1">
                                                            <Tag className="w-3 h-3" /> Productos Canjeables
                                                        </p>
                                                        <div className="flex overflow-x-auto gap-3 pb-2 snap-x hide-scrollbar">
                                                            {rInfo.products.map(prod => (
                                                                <div key={prod.id} className="min-w-[120px] max-w-[120px] bg-slate-50 rounded-xl p-2 shrink-0 border border-slate-100">
                                                                    {prod.image && (
                                                                        <div className="h-16 w-full rounded-lg mb-2 overflow-hidden bg-slate-200">
                                                                            <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                                                                        </div>
                                                                    )}
                                                                    <p className="text-xs font-bold text-slate-700 leading-tight line-clamp-1 truncate">{prod.name}</p>
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                        <Star className="w-3 h-3 text-orange-500" />
                                                                        <span className="text-[10px] font-black text-slate-500">{prod.pointsPrice} pts</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl text-slate-400">
                                                        <AlertCircle className="w-4 h-4" />
                                                        <p className="text-xs font-medium">Este local no tiene productos configurados con puntos aún.</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl text-center flex flex-col items-center">
                                    <Store className="w-8 h-8 text-slate-300 mb-2" />
                                    <p className="text-sm font-bold text-slate-500">No tienes puntos en restaurantes.</p>
                                    <p className="text-xs text-slate-400 mt-1">Sigue disfrutando de tus locales favoritos para acumular.</p>
                                </div>
                            )}
                        </div>

                    </div>
                </motion.div>
            </div>
            
            <style>{`
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .hide-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </AnimatePresence>
    );
}
