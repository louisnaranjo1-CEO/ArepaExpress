import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
    ArrowLeft, Store, Star, Tag, MapPin, Phone,
    ShoppingBag, Box, Users, TrendingUp, Calendar,
    ChevronRight, ExternalLink, Instagram, MessageSquare,
    DollarSign, Clock, CheckCircle, Package, Truck, X, Save, Upload,
    Image as ImageIcon
} from 'lucide-react';
import { GLOBAL_CATEGORIES } from '../../lib/constants';
import { updateDoc } from 'firebase/firestore';
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
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editData, setEditData] = useState<Partial<RestaurantData>>({});
    const [isUpdating, setIsUpdating] = useState(false);

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

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !restaurant) return;

        setIsUpdating(true);
        try {
            await updateDoc(doc(db, 'restaurants', id), editData);
            setRestaurant({ ...restaurant, ...editData } as RestaurantData);
            setIsEditModalOpen(false);
        } catch (error) {
            console.error("Error updating restaurant:", error);
            alert("Error al actualizar el perfil");
        } finally {
            setIsUpdating(false);
        }
    };

    const openEditModal = () => {
        if (!restaurant) return;
        setEditData({
            name: restaurant.name,
            category: restaurant.category,
            whatsapp: restaurant.whatsapp,
            logoUrl: restaurant.logoUrl,
            coverUrl: restaurant.coverUrl,
            isActive: restaurant.isActive,
            location: {
                city: restaurant.location?.city || '',
                state: restaurant.location?.state || '',
                address: restaurant.location?.address || '',
                reference: restaurant.location?.reference || ''
            }
        });
        setIsEditModalOpen(true);
    };

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
                    <button
                        onClick={openEditModal}
                        className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                    >
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
            {/* Edit Modal */}
            <AnimatePresence>
                {isEditModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden my-auto"
                        >
                            {/* Modal Header */}
                            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                        <Store className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 leading-none">Editar Perfil del Local</h2>
                                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2">Personaliza la información pública</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="p-3 hover:bg-slate-200 rounded-2xl transition-all"
                                >
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <form onSubmit={handleUpdateProfile} className="p-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Basic Info */}
                                    <div className="space-y-6">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Box className="w-4 h-4" /> Información Básica
                                        </h3>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre del Local</label>
                                            <input
                                                type="text"
                                                value={editData.name}
                                                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Categoría Principal</label>
                                            <select
                                                value={editData.category}
                                                onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none appearance-none"
                                                required
                                            >
                                                {GLOBAL_CATEGORIES.map(cat => (
                                                    <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">WhatsApp de Contacto</label>
                                            <input
                                                type="text"
                                                value={editData.whatsapp}
                                                onChange={(e) => setEditData({ ...editData, whatsapp: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                                placeholder="Ej: 584241234567"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-emerald-200 transition-all cursor-pointer" onClick={() => setEditData({ ...editData, isActive: !editData.isActive })}>
                                            <div>
                                                <p className="font-black text-slate-900 text-sm">Estado del Local</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Visible en la App</p>
                                            </div>
                                            <div className={`w-14 h-7 rounded-full relative transition-all duration-300 ${editData.isActive !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${editData.isActive !== false ? 'left-8' : 'left-1'}`}></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Visuals & Location */}
                                    <div className="space-y-6">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <MapPin className="w-4 h-4" /> Ubicación y Visuales
                                        </h3>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Ciudad</label>
                                                <input
                                                    type="text"
                                                    value={editData.location?.city}
                                                    onChange={(e) => setEditData({
                                                        ...editData,
                                                        location: { ...editData.location!, city: e.target.value }
                                                    })}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Estado</label>
                                                <input
                                                    type="text"
                                                    value={editData.location?.state}
                                                    onChange={(e) => setEditData({
                                                        ...editData,
                                                        location: { ...editData.location!, state: e.target.value }
                                                    })}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Dirección Exacta</label>
                                            <textarea
                                                value={editData.location?.address}
                                                onChange={(e) => setEditData({
                                                    ...editData,
                                                    location: { ...editData.location!, address: e.target.value }
                                                })}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none min-h-[100px] resize-none"
                                            />
                                        </div>

                                        <div className="space-y-4 pt-4 border-t border-slate-100">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logo (URL)</p>
                                                <ImageIcon className="w-4 h-4 text-slate-300" />
                                            </div>
                                            <input
                                                type="text"
                                                value={editData.logoUrl}
                                                onChange={(e) => setEditData({ ...editData, logoUrl: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div className="mt-12 flex gap-4 pt-8 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditModalOpen(false)}
                                        className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all shadow-sm active:scale-95"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isUpdating}
                                        className="flex-[2] py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                                    >
                                        {isUpdating ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" /> Guardar Cambios
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

