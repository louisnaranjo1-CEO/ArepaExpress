import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
    ArrowLeft, Store, Star, Tag, MapPin, Phone,
    ShoppingBag, Box, Users, TrendingUp, Calendar,
    ChevronRight, ExternalLink, Instagram, MessageSquare,
    DollarSign, Clock, CheckCircle, Package, Truck, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RestaurantData {
    id: string;
    name: string;
    category: string;
    rating: number;
    reviews: number;
    deliveryTime: string;
    image: string;
    logoUrl?: string;
    coverUrl?: string;
    whatsapp?: string;
    isActive?: boolean;
    location?: {
        city: string;
        state: string;
        address: string;
        reference?: string;
    };
}

interface StatCardProps {
    title: string;
    value: string | number;
    icon: any;
    color: string;
    trend?: string;
}

const StatCard = ({ title, value, icon: Icon, color, trend }: StatCardProps) => (
    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all">
        <div className="flex items-start justify-between">
            <div className={`p-3 rounded-2xl ${color}`}>
                <Icon className="w-6 h-6" />
            </div>
            {trend && (
                <span className="text-[10px] font-black text-green-500 bg-green-50 px-2 py-1 rounded-lg">
                    {trend}
                </span>
            )}
        </div>
        <div className="mt-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
            <h4 className="text-2xl font-black text-slate-900 mt-1">{value}</h4>
        </div>
    </div>
);

export default function RestaurantProfile() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [restaurant, setRestaurant] = useState<RestaurantData | null>(null);
    const [stats, setStats] = useState({
        totalOrders: 0,
        totalSales: 0,
        productsCount: 0,
        followersCount: 0,
        averageOrderValue: 0
    });
    const [recentOrders, setRecentOrders] = useState<any[]>([]);
    const [popularProducts, setPopularProducts] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'followers'>('overview');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!id) return;
            setLoading(true);
            try {
                // Restaurant info
                const restDoc = await getDoc(doc(db, 'restaurants', id));
                if (restDoc.exists()) {
                    setRestaurant({ id: restDoc.id, ...restDoc.data() } as RestaurantData);
                }

                // Stats: Products
                const productsSnap = await getDocs(collection(db, 'restaurants', id, 'products'));
                const pCount = productsSnap.size;
                const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Stats: Orders
                const ordersSnap = await getDocs(query(collection(db, 'orders'), where('restaurantId', '==', id)));
                const oCount = ordersSnap.size;
                const orders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const totalSales = orders.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0);
                const avgOrder = oCount > 0 ? totalSales / oCount : 0;

                // Stats: Followers
                const followersSnap = await getDocs(collection(db, 'restaurants', id, 'followers'));
                const fCount = followersSnap.size;

                setStats({
                    totalOrders: oCount,
                    totalSales,
                    productsCount: pCount,
                    followersCount: fCount,
                    averageOrderValue: avgOrder
                });

                setRecentOrders(orders.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5));
                setPopularProducts(products.slice(0, 4));

            } catch (error) {
                console.error("Error fetching restaurant profile data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!restaurant) {
        return (
            <div className="text-center py-20">
                <h2 className="text-2xl font-black text-slate-900">Restaurante no encontrado</h2>
                <button onClick={() => navigate('/restaurants')} className="mt-4 text-primary font-bold hover:underline">Volver a la lista</button>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20">
            {/* Header / Nav */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/restaurants')}
                    className="group flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
                >
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:border-slate-200 shadow-sm transition-all">
                        <ArrowLeft className="w-5 h-5" />
                    </div>
                    <span className="font-black text-xs uppercase tracking-widest">Volver a Restaurantes</span>
                </button>

                <div className="flex items-center gap-3">
                    <button className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-colors shadow-sm">
                        Editar Perfil
                    </button>
                    <button className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20">
                        Login como Local
                    </button>
                </div>
            </div>

            {/* Profile Overview */}
            <div className="relative overflow-hidden rounded-[48px] bg-white border border-slate-100 shadow-xl shadow-slate-200/40">
                <div className="h-64 relative">
                    <img
                        src={restaurant.coverUrl || restaurant.image}
                        alt="Cover"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

                    <div className="absolute -bottom-16 left-12">
                        <div className="w-32 h-32 rounded-[40px] bg-white p-1 shadow-2xl border-4 border-white">
                            <img
                                src={restaurant.logoUrl || restaurant.image}
                                alt="Logo"
                                className="w-full h-full object-cover rounded-[32px]"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-12 pt-20 flex flex-col md:flex-row gap-8 justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-4xl font-black text-slate-900">{restaurant.name}</h1>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${restaurant.isActive !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {restaurant.isActive !== false ? 'Activo' : 'Suspendido'}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-6 mt-4">
                            <div className="flex items-center gap-1.5 text-orange-500 font-bold">
                                <Star className="w-4 h-4 fill-orange-500" />
                                <span>{restaurant.rating}</span>
                                <span className="text-slate-400 text-xs font-medium">({restaurant.reviews} reviews)</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                                <Tag className="w-4 h-4" />
                                <span>{restaurant.category}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                                <MapPin className="w-4 h-4" />
                                <span>{restaurant.location?.city}, {restaurant.location?.state}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 min-w-[200px]">
                        <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-3">
                            <Phone className="w-5 h-5 text-primary" />
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</p>
                                <p className="font-bold text-slate-700">{restaurant.whatsapp || 'No registrado'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Ventas Totales"
                    value={`$${stats.totalSales.toFixed(2)}`}
                    icon={TrendingUp}
                    color="bg-emerald-50 text-emerald-600"
                    trend="+12%"
                />
                <StatCard
                    title="Total Pedidos"
                    value={stats.totalOrders}
                    icon={ShoppingBag}
                    color="bg-blue-50 text-blue-600"
                />
                <StatCard
                    title="Promedio Ticket"
                    value={`$${stats.averageOrderValue.toFixed(2)}`}
                    icon={DollarSign}
                    color="bg-amber-50 text-amber-600"
                />
                <StatCard
                    title="Seguidores"
                    value={stats.followersCount}
                    icon={Users}
                    color="bg-indigo-50 text-indigo-600"
                />
            </div>

            {/* Tabs & Content */}
            <div className="space-y-6">
                <div className="flex gap-4 border-b border-slate-100 pb-px">
                    {[
                        { id: 'overview', label: 'Resumen General', icon: Box },
                        { id: 'products', label: 'Menú / Productos', icon: Box },
                        { id: 'orders', label: 'Historial Pedidos', icon: ShoppingBag },
                        { id: 'followers', label: 'Clientes / Seguidores', icon: Users },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-6 py-4 font-black text-xs uppercase tracking-widest transition-all relative ${activeTab === tab.id ? 'text-primary' : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                                />
                            )}
                        </button>
                    ))}
                </div>

                <div className="min-h-[400px]">
                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            {/* Recent Orders Section */}
                            <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm">
                                <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                                    <h3 className="font-black text-slate-900 uppercase tracking-widest text-sm flex items-center gap-2">
                                        <ShoppingBag className="w-5 h-5 text-primary" /> Pedidos Recientes
                                    </h3>
                                    <button className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">Ver todos</button>
                                </div>
                                <div className="divide-y divide-slate-50">
                                    {recentOrders.length > 0 ? recentOrders.map((order) => (
                                        <div key={order.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-400 text-xs">
                                                    #{order.id.slice(-4).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900">{order.userName || 'Usuario'}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium italic">{order.deliveryAddress?.slice(0, 30)}...</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-black text-slate-900">${(order.total || 0).toFixed(2)}</p>
                                                <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-lg ${order.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                                    }`}>
                                                    {order.status}
                                                </span>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="p-10 text-center text-slate-400 font-medium italic">No hay pedidos registrados</div>
                                    )}
                                </div>
                            </div>

                            {/* Popular Products */}
                            <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm">
                                <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                                    <h3 className="font-black text-slate-900 uppercase tracking-widest text-sm flex items-center gap-2">
                                        <Box className="w-5 h-5 text-indigo-500" /> Productos Populares
                                    </h3>
                                    <button className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">Ver menú</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                                    {popularProducts.map((p) => (
                                        <div key={p.id} className="group p-4 rounded-[32px] bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-lg transition-all">
                                            <div className="h-32 rounded-[24px] overflow-hidden mb-3">
                                                <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                            </div>
                                            <p className="font-black text-slate-900 line-clamp-1">{p.name}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <p className="text-primary font-black text-sm">${p.price?.toFixed(2)}</p>
                                                <div className="flex items-center gap-1 text-[10px] text-orange-500 font-bold bg-orange-50 px-2 py-0.5 rounded-lg">
                                                    <Star className="w-3 h-3 fill-orange-500" />
                                                    4.8
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab !== 'overview' && (
                        <div className="bg-white rounded-[40px] border border-slate-100 p-20 text-center animate-in fade-in zoom-in-95 duration-300 shadow-sm">
                            <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto mb-6">
                                <Box className="w-10 h-10 text-slate-200" />
                            </div>
                            <h3 className="text-xl font-black text-slate-400">Próximamente</h3>
                            <p className="text-slate-300 font-medium mt-2">Esta sección está siendo procesada para mostrar métricas avanzadas.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
