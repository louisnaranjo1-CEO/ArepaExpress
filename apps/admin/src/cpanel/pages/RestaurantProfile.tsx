import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
    ArrowLeft, Store, Star, Tag, MapPin, Phone,
    ShoppingBag, Box, Users, TrendingUp, Calendar,
    ChevronRight, ExternalLink, Instagram, MessageSquare,
    DollarSign, Clock, CheckCircle, Truck, X, Save, Upload,
    Image as ImageIcon, Camera, Share2, Zap, Gift, ShieldCheck, FileText,
    Check, AlertCircle, Sparkles, Percent, CalendarDays, Grid, Printer, Bell, Megaphone, UserCheck, Lock, Unlock, HelpCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { GLOBAL_CATEGORIES, CATEGORY_SECTORS } from '../../lib/constants';
import RestaurantRewardsManager from '../components/RestaurantRewardsManager';
import RestaurantProductsManager from '../components/RestaurantProductsManager';
import DirectBusinessManagerModal from '../components/DirectBusinessManagerModal';
import DualPrice from '../../components/DualPrice';
import { motion, AnimatePresence } from 'motion/react';

interface Category {
    id: string;
    name: string;
    parentId?: string;
}

interface RestaurantData {
    id: string;
    name: string;
    category: string;
    sector?: string;
    rating: number;
    reviews: number;
    deliveryTime: string;
    image: string;
    logoUrl?: string;
    coverUrl?: string;
    whatsapp?: string;
    isActive?: boolean;
    status?: 'active' | 'busy' | 'unavailable';
    billingDay?: number;
    billingAmount?: number;
    featured: boolean;
    hasCashea?: boolean;
    location?: {
        city: string;
        state: string;
        address: string;
        reference?: string;
    };
    subscriptionEnd?: string;
    paymentMethods?: any[];
    rif?: string;
    isVerified?: boolean;
    verificationStatus?: string;
    billingMode?: 'subscription' | 'commission' | 'free_custom';
    planId?: 'emprendedor' | 'corporativo';
    commissionType?: 'percentage' | 'fixed';
    commissionRate?: number;
    freeUntil?: string | null;
    customFeatures?: Record<string, boolean>;
    deudaComisionesAcumulada?: number;
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
            {typeof value === 'number' && (title.includes('Ventas') || title.includes('Promedio') || title.includes('Ticket')) ? (
                <DualPrice usdAmount={value} usdClassName="text-2xl font-black text-slate-900 mt-1" showDivider={false} className="flex flex-col" />
            ) : (
                <h4 className="text-2xl font-black text-slate-900 mt-1">{value}</h4>
            )}
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
    const [pendingBannerCount, setPendingBannerCount] = useState(0);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [casheaIcon, setCasheaIcon] = useState<string | null>(null);
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [editData, setEditData] = useState<any>({});
    const [isDirectManagerOpen, setIsDirectManagerOpen] = useState(false);
    const [isLoginChooserOpen, setIsLoginChooserOpen] = useState(false);

    // Commercial Modality & Modules State
    const [globalPlansConfig, setGlobalPlansConfig] = useState<any>(null);
    const [modalityMode, setModalityMode] = useState<'subscription' | 'commission' | 'free_custom'>('subscription');
    const [modalityPlanId, setModalityPlanId] = useState<'emprendedor' | 'corporativo'>('emprendedor');
    const [modalityCommissionType, setModalityCommissionType] = useState<'percentage' | 'fixed'>('percentage');
    const [modalityCommissionRate, setModalityCommissionRate] = useState<number>(10);
    const [modalityFreeUntil, setModalityFreeUntil] = useState<string>('');
    const [modalityCustomFeatures, setModalityCustomFeatures] = useState<Record<string, boolean>>({
        orders: true,
        cash_internal: true,
        products: true,
        notifications: true,
        clients: true,
        loyalty: true,
        ads_and_push: true,
        reviews: true,
        waiters: false,
        cashiers: false,
        tables: false,
        printer_stations: false
    });
    const [isSavingModality, setIsSavingModality] = useState(false);

    const AVAILABLE_MODULES = [
        { key: 'orders', label: 'Recibir Pedidos', description: 'Recepción y gestión de pedidos delivery y pickup', icon: ShoppingBag },
        { key: 'cash_internal', label: 'Caja Interna', description: 'Control de caja, turnos y arqueos', icon: DollarSign },
        { key: 'products', label: 'Productos', description: 'Catálogo de productos, modificadores y precios', icon: Box },
        { key: 'notifications', label: 'Notificaciones', description: 'Alertas sonoras y avisos en tiempo real', icon: Bell },
        { key: 'clients', label: 'Clientes', description: 'Directorio y analíticas de compradores', icon: Users },
        { key: 'loyalty', label: 'Fidelización', description: 'Puntos por compra y recompensas canjeables', icon: Gift },
        { key: 'ads_and_push', label: 'Publicidad y Campañas Push', description: 'Banners destacados y notificaciones masivas', icon: Megaphone },
        { key: 'reviews', label: 'Reseñas', description: 'Calificaciones y opiniones de clientes', icon: Star },
        { key: 'waiters', label: 'Meseros (App)', description: 'Acceso a App móvil para Meseros y comandas', icon: UserCheck },
        { key: 'cashiers', label: 'Cajeras (App)', description: 'Acceso a App móvil para Cajeras POS', icon: ShieldCheck },
        { key: 'tables', label: 'Mesas QR', description: 'Gestión de mesas del salón y QR para clientes', icon: Grid },
        { key: 'printer_stations', label: 'Estaciones de Impresión Térmica', description: 'Comandas térmicas en cocina y barra', icon: Printer },
    ];

    const sectors = allCategories.filter(c => !c.parentId).length > 0
        ? allCategories.filter(c => !c.parentId)
        : GLOBAL_CATEGORIES.map(c => ({ id: c, name: c }));

    const subCats = (editData.sector && (CATEGORY_SECTORS as any)[editData.sector])
        ? (CATEGORY_SECTORS as any)[editData.sector].map((s: string) => ({ id: s, name: s }))
        : allCategories.filter(c => c.parentId === editData.sector);

    useEffect(() => {
        if (!id) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Global Subscription Plans Config
                try {
                    const { data: plansSetting } = await supabase
                        .from('system_settings')
                        .select('*')
                        .eq('key', 'subscription_plans_config')
                        .maybeSingle();

                    if (plansSetting?.value) {
                        setGlobalPlansConfig(plansSetting.value);
                    }
                } catch (e) {
                    console.warn("Could not fetch global plans config:", e);
                }

                // Restaurant info
                const { data: restData } = await supabase
                    .from('comercios')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();

                if (restData) {
                    const initialFeatures = restData.custom_features || {
                        orders: true,
                        cash_internal: true,
                        products: true,
                        notifications: true,
                        clients: true,
                        loyalty: true,
                        ads_and_push: true,
                        reviews: true,
                        waiters: false,
                        cashiers: false,
                        tables: false,
                        printer_stations: false
                    };

                    const rData: RestaurantData = {
                        id: restData.id,
                        name: restData.name,
                        category: restData.category,
                        sector: restData.sector,
                        rating: restData.rating || 5,
                        reviews: restData.reviews || 0,
                        deliveryTime: restData.delivery_time || restData.deliveryTime || '30-45 min',
                        image: restData.image || restData.logo_url || restData.logoUrl || '',
                        logoUrl: restData.logo_url || restData.logoUrl || '',
                        coverUrl: restData.cover_url || restData.coverUrl || '',
                        whatsapp: restData.whatsapp || '',
                        isActive: restData.is_active !== undefined ? restData.is_active : restData.isActive,
                        status: restData.status || 'active',
                        billingDay: restData.billing_day || restData.billingDay,
                        billingAmount: restData.billing_amount || restData.billingAmount,
                        featured: restData.featured || false,
                        hasCashea: restData.has_cashea !== undefined ? restData.has_cashea : restData.hasCashea,
                        location: restData.location || {
                            city: restData.city || '',
                            state: restData.state || '',
                            address: restData.address || '',
                            reference: restData.reference || ''
                        },
                        subscriptionEnd: restData.subscription_end || restData.subscriptionEnd,
                        paymentMethods: restData.payment_methods || restData.paymentMethods || [],
                        rif: restData.rif || '',
                        isVerified: restData.is_verified ?? restData.isVerified ?? false,
                        verificationStatus: restData.verification_status || 'unverified',
                        billingMode: restData.billing_mode || 'subscription',
                        planId: restData.plan_id || 'emprendedor',
                        commissionType: restData.commission_type || 'percentage',
                        commissionRate: restData.commission_rate !== undefined && restData.commission_rate !== null ? Number(restData.commission_rate) : 10,
                        freeUntil: restData.free_until || null,
                        customFeatures: initialFeatures,
                        deudaComisionesAcumulada: Number(restData.deuda_comisiones_acumulada || 0)
                    };
                    setRestaurant(rData);
                    setPaymentMethods(rData.paymentMethods || []);

                    // Populate form states
                    setModalityMode(rData.billingMode || 'subscription');
                    setModalityPlanId(rData.planId || 'emprendedor');
                    setModalityCommissionType(rData.commissionType || 'percentage');
                    setModalityCommissionRate(rData.commissionRate !== undefined ? rData.commissionRate : 10);
                    setModalityFreeUntil(rData.freeUntil ? rData.freeUntil.split('T')[0] : '');
                    setModalityCustomFeatures(initialFeatures);
                }

                // Stats: Products
                const { data: productsData } = await supabase
                    .from('products')
                    .select('*')
                    .eq('restaurant_id', id);

                const products = productsData || [];
                const pCount = products.length;

                // Stats: Orders
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('restaurant_id', id);

                const orders = ordersData || [];
                const oCount = orders.length;

                const totalSales = orders.reduce((acc: number, curr: any) => acc + (parseFloat(curr.total) || 0), 0);
                const avgOrder = oCount > 0 ? totalSales / oCount : 0;

                setStats({
                    totalOrders: oCount,
                    totalSales,
                    productsCount: pCount,
                    followersCount: 0,
                    averageOrderValue: avgOrder
                });

                setRecentOrders(
                    orders.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 5)
                );
                setPopularProducts(products.slice(0, 4));

                // Banners pending for approval
                const { data: bannersData } = await supabase
                    .from('banners')
                    .select('*')
                    .eq('restaurant_id', id)
                    .eq('status', 'pending_approval');
                setPendingBannerCount((bannersData || []).length);

                // Categories & Icons
                const { data: catData } = await supabase.from('global_categories').select('*');
                setAllCategories((catData || []) as Category[]);

                const { data: iconData } = await supabase.from('global_icons').select('*');
                const cashea = (iconData || []).find((icon: any) => icon.name?.toLowerCase() === 'cashea');
                if (cashea) {
                    setCasheaIcon(cashea.image_url || cashea.url || cashea.imageUrl);
                } else {
                    setCasheaIcon("https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/OIP%20(4).webp");
                }

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
            let finalData = { ...editData, payment_methods: paymentMethods };

            if (logoFile) {
                const filePath = `restaurants/${id}/logo_${Date.now()}_${logoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, logoFile, { upsert: true });
                if (upErr) throw upErr;
                const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                finalData.logo_url = pubData.publicUrl;
                finalData.logoUrl = pubData.publicUrl;
            }

            const { error } = await supabase.from('comercios').update(finalData).eq('id', id);
            if (error) throw error;

            setRestaurant({ ...restaurant, ...finalData } as RestaurantData);
            setIsEditModalOpen(false);
            setLogoFile(null);
            setLogoPreview(null);
        } catch (error) {
            console.error("Error updating restaurant:", error);
            alert("Error al actualizar el perfil");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleImageUpload = async (file: File, type: 'logo' | 'cover') => {
        if (!id) return;
        setIsUploadingLogo(true);
        try {
            const filePath = `restaurants/${id}/${type}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
            const downloadURL = pubData.publicUrl;

            setEditData((prev: any) => ({
                ...prev,
                [`${type}_url`]: downloadURL,
                [`${type}Url`]: downloadURL
            }));
            if (type === 'logo') {
                setLogoPreview(downloadURL);
            }
        } catch (error) {
            console.error(`Error uploading ${type} image:`, error);
            alert(`Error al subir la imagen de ${type}`);
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const addPaymentMethod = () => {
        setPaymentMethods([...paymentMethods, { type: 'Pago Móvil', bank: '', rif: '', phone: '', owner: '' }]);
    };

    const removePaymentMethod = (index: number) => {
        setPaymentMethods(paymentMethods.filter((_, i) => i !== index));
    };

    const updatePaymentMethod = (index: number, field: string, value: string) => {
        const newMethods = [...paymentMethods];
        newMethods[index] = { ...newMethods[index], [field]: value };
        setPaymentMethods(newMethods);
    };

    const handleSave = async () => {
        if (!id || !restaurant) return;
        setIsSaving(true);
        try {
            const payload = {
                ...editData,
                payment_methods: paymentMethods
            };
            const { error } = await supabase.from('comercios').update(payload).eq('id', id);
            if (error) throw error;

            setRestaurant({ ...restaurant, ...editData, paymentMethods } as RestaurantData);
            setIsEditModalOpen(false);
        } catch (error) {
            console.error("Error saving changes:", error);
            alert("Error al guardar los cambios");
        } finally {
            setIsSaving(false);
        }
    };

    const openEditModal = () => {
        if (!restaurant) return;
        setLogoFile(null);
        setLogoPreview(null);
        setEditData({
            name: restaurant.name,
            category: restaurant.category,
            whatsapp: restaurant.whatsapp,
            logoUrl: restaurant.logoUrl,
            coverUrl: restaurant.coverUrl,
            isActive: restaurant.status === 'unavailable' ? false : (restaurant.isActive !== false),
            status: restaurant.status || (restaurant.isActive !== false ? 'active' : 'unavailable'),
            billingDay: restaurant.billingDay || 1,
            billingAmount: restaurant.billingAmount || 0,
            rif: restaurant.rif || '',
            sector: restaurant.sector || '',
            featured: restaurant.featured || false,
            hasCashea: restaurant.hasCashea || false,
            location: {
                city: restaurant.location?.city || '',
                state: restaurant.location?.state || '',
                address: restaurant.location?.address || '',
                reference: restaurant.location?.reference || ''
            },
            paymentMethods: restaurant.paymentMethods || []
        });
        setPaymentMethods(restaurant.paymentMethods || []);
        setIsEditModalOpen(true);
    };

    const handleSaveModality = async () => {
        if (!id) return;
        setIsSavingModality(true);
        try {
            let effectiveFeatures = { ...modalityCustomFeatures };
            if (modalityMode === 'subscription') {
                const plan = globalPlansConfig?.plans?.find((p: any) => p.id === modalityPlanId);
                if (plan?.features) {
                    effectiveFeatures = { ...plan.features };
                } else if (modalityPlanId === 'corporativo') {
                    effectiveFeatures = {
                        orders: true, cash_internal: true, products: true, notifications: true,
                        clients: true, loyalty: true, ads_and_push: true, reviews: true,
                        waiters: true, cashiers: true, tables: true, printer_stations: true
                    };
                } else {
                    effectiveFeatures = {
                        orders: true, cash_internal: true, products: true, notifications: true,
                        clients: true, loyalty: true, ads_and_push: true, reviews: true,
                        waiters: false, cashiers: false, tables: false, printer_stations: false
                    };
                }
            }

            const updatePayload = {
                billing_mode: modalityMode,
                plan_id: modalityPlanId,
                commission_type: modalityCommissionType,
                commission_rate: Number(modalityCommissionRate),
                free_until: modalityFreeUntil ? new Date(modalityFreeUntil).toISOString() : null,
                custom_features: effectiveFeatures,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('comercios')
                .update(updatePayload)
                .eq('id', id);

            if (error) throw error;

            setRestaurant(prev => prev ? {
                ...prev,
                billingMode: modalityMode,
                planId: modalityPlanId,
                commissionType: modalityCommissionType,
                commissionRate: Number(modalityCommissionRate),
                freeUntil: modalityFreeUntil || null,
                customFeatures: effectiveFeatures
            } : null);

            toast.success("Modalidad comercial y módulos actualizados correctamente");
        } catch (err: any) {
            console.error("Error saving modality:", err);
            toast.error("Error al guardar modalidad: " + (err.message || 'Error de red'));
        } finally {
            setIsSavingModality(false);
        }
    };

    const getSubscriptionStatusInfo = () => {
        if (!restaurant) return { text: 'Cargando...', color: 'text-slate-400', active: false };
        const bMode = restaurant.billingMode || 'subscription';

        if (bMode === 'commission') {
            const rateStr = restaurant.commissionType === 'fixed'
                ? `$${Number(restaurant.commissionRate || 0).toFixed(2)}/ped`
                : `${Number(restaurant.commissionRate || 10)}%`;
            return {
                text: `Activa - Comisión por Venta (${rateStr})`,
                color: 'text-emerald-600',
                active: true
            };
        }

        if (bMode === 'free_custom') {
            if (restaurant.freeUntil) {
                const d = new Date(restaurant.freeUntil);
                return {
                    text: `Activa - Gratis / Cortesía (hasta ${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })})`,
                    color: 'text-emerald-600',
                    active: true
                };
            }
            return {
                text: 'Activa - Gratis / Cortesía',
                color: 'text-emerald-600',
                active: true
            };
        }

        // Subscription mode
        const planName = restaurant.planId === 'corporativo' ? 'Plan Corporativo' : 'Plan Emprendedor';
        if (globalPlansConfig?.freeTrialEnabled) {
            return {
                text: `Activa - Gratis Lanzamiento (${planName})`,
                color: 'text-emerald-600',
                active: true
            };
        }

        const end = restaurant.subscriptionEnd ? new Date(restaurant.subscriptionEnd) : null;
        const isCurrent = end ? end > new Date() : true;
        return {
            text: isCurrent ? `Activa - ${planName}` : `Inactiva / Vencida (${planName})`,
            color: isCurrent ? 'text-emerald-600' : 'text-red-500',
            active: isCurrent
        };
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
                <h2 className="text-2xl font-black text-slate-900">Negocio no encontrado</h2>
                <button onClick={() => navigate('/restaurants')} className="mt-4 text-slate-900 font-bold hover:underline">VOLVER A NEGOCIOS</button>
            </div>
        );
    }

    const handleOpenExternalRestaurantApp = () => {
        const baseUrl = (import.meta.env.VITE_RESTAURANT_APP_URL as string) || 
            (window.location.hostname.includes('localhost') ? 'http://localhost:5174' : 'https://negocios.deliexpress.app');
        const url = `${baseUrl}?impersonate_restaurant_id=${restaurant.id}`;
        window.open(url, '_blank');
        setIsLoginChooserOpen(false);
    };

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
                    <span className="font-black text-xs uppercase tracking-widest">VOLVER A NEGOCIOS</span>
                </button>

                <div className="flex items-center gap-3">
                    <button
                        onClick={openEditModal}
                        className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                    >
                        Editar Perfil
                    </button>
                    <button 
                        onClick={() => setIsLoginChooserOpen(true)}
                        className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 active:scale-95 flex items-center gap-2"
                    >
                        <Store className="w-4 h-4 text-primary" />
                        Login como Local
                    </button>
                </div>
            </div>

            {/* Login como Local Action Modal */}
            <AnimatePresence>
                {isLoginChooserOpen && (
                    <div className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-[36px] max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative"
                        >
                            <button
                                onClick={() => setIsLoginChooserOpen(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 text-slate-400"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="w-14 h-14 rounded-2xl bg-amber-400/20 flex items-center justify-center text-amber-900 mb-4">
                                <Store className="w-7 h-7 text-slate-900" />
                            </div>

                            <h3 className="text-xl font-black text-slate-900 leading-tight">
                                Acceso al Local: {restaurant.name}
                            </h3>
                            <p className="text-xs text-slate-500 font-medium mt-1">
                                Selecciona cómo deseas gestionar este comercio como Superadministrador:
                            </p>

                            <div className="grid grid-cols-1 gap-3 mt-6">
                                <button
                                    onClick={handleOpenExternalRestaurantApp}
                                    className="p-5 rounded-2xl border-2 border-slate-100 hover:border-amber-400 bg-slate-50/50 hover:bg-amber-50/30 text-left transition-all group flex items-start gap-4"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                                        <ExternalLink className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-black text-sm text-slate-900 group-hover:text-amber-950">
                                            Abrir App Negocios (Pestaña Externa)
                                        </h4>
                                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                                            Abre el portal completo en nueva pestaña impersonando la sesión de este negocio.
                                        </p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        setIsLoginChooserOpen(false);
                                        setIsDirectManagerOpen(true);
                                    }}
                                    className="p-5 rounded-2xl border-2 border-slate-100 hover:border-slate-900 bg-slate-50/50 hover:bg-slate-100 text-left transition-all group flex items-start gap-4"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm">
                                        <Store className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-black text-sm text-slate-900">
                                            Gestión Directa del Local (Sin Salir de Aquí)
                                        </h4>
                                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                                            Panel completo en modal para ver/editar Productos, Pedidos, Mesas, Meseros y Cajeras.
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Direct Business Manager Modal */}
            <DirectBusinessManagerModal
                isOpen={isDirectManagerOpen}
                onClose={() => setIsDirectManagerOpen(false)}
                business={{
                    id: restaurant.id,
                    name: restaurant.name,
                    category: restaurant.category,
                    sector: restaurant.sector,
                    image: restaurant.image,
                    logoUrl: restaurant.logoUrl,
                    whatsapp: restaurant.whatsapp,
                    isActive: restaurant.isActive,
                    status: restaurant.status,
                    deliveryFee: (restaurant as any).deliveryFee,
                    deliveryTime: restaurant.deliveryTime,
                    address: restaurant.location?.address,
                    hasCashea: restaurant.hasCashea
                }}
                onBusinessUpdated={fetchData}
            />

            {pendingBannerCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                            <ImageIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-black text-amber-900 text-lg tracking-tight">Solicitud de Banner Pendiente</h3>
                            <p className="font-medium text-amber-700/80 text-sm">Hay {pendingBannerCount} banner(s) esperando tu aprobación para este local.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => navigate('/banners')}
                        className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-amber-600/20 active:scale-95 flex items-center gap-2"
                    >
                        Gestionar
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Profile Overview */}
            <div className="relative overflow-hidden rounded-[48px] bg-white border border-slate-100 shadow-xl shadow-slate-200/40">
                <div className="h-64 relative">
                    <img
                        src={restaurant.coverUrl || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80'}
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

                    <div className="flex flex-col gap-3 min-w-[220px]">
                        <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-3">
                            <FileText className="w-5 h-5 text-primary" />
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RIF Legal</p>
                                    {restaurant.isVerified && (
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" title="Verificado" />
                                    )}
                                </div>
                                <p className="font-black text-slate-800 tracking-wider text-sm">{restaurant.rif || 'Sin RIF Registrado'}</p>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-3">
                            <Phone className="w-5 h-5 text-slate-900" />
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</p>
                                <p className="font-bold text-slate-700">{restaurant.whatsapp || 'No registrado'}</p>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-3">
                            <CheckCircle className={`w-5 h-5 ${getSubscriptionStatusInfo().active ? 'text-emerald-500' : 'text-slate-400'}`} />
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Suscripción</p>
                                <p className={`font-bold text-sm ${getSubscriptionStatusInfo().color}`}>
                                    {getSubscriptionStatusInfo().text}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Ventas Totales"
                    value={stats.totalSales}
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
                    value={stats.averageOrderValue}
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

            {/* ⚙️ Modalidad Comercial, Suscripción y Módulos Habilitados */}
            <div className="bg-white rounded-[40px] border-2 border-slate-100 p-8 md:p-10 shadow-xl shadow-slate-200/50 space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shadow-sm shrink-0">
                            <Store className="w-7 h-7 text-amber-600" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                                    ⚙️ Modalidad Comercial, Suscripción y Módulos Habilitados
                                </h2>
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white">
                                    SuperAdmin Control
                                </span>
                            </div>
                            <p className="text-sm text-slate-500 font-medium mt-1">
                                Selecciona cómo opera comercialmente este negocio en Un 2x3 y qué herramientas tiene desbloqueadas.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleSaveModality}
                        disabled={isSavingModality}
                        className="flex items-center justify-center gap-2.5 px-8 py-4 bg-primary text-slate-900 hover:bg-primary font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                    >
                        <Save className="w-5 h-5" />
                        {isSavingModality ? 'Guardando...' : 'Guardar Modalidad y Módulos'}
                    </button>
                </div>

                {/* Selector de las 3 Modalidades */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* MODALIDAD 1 */}
                    <button
                        type="button"
                        onClick={() => {
                            setModalityMode('subscription');
                            const plan = globalPlansConfig?.plans?.find((p: any) => p.id === modalityPlanId);
                            if (plan?.features) {
                                setModalityCustomFeatures(plan.features);
                            } else if (modalityPlanId === 'corporativo') {
                                setModalityCustomFeatures({
                                    orders: true, cash_internal: true, products: true, notifications: true,
                                    clients: true, loyalty: true, ads_and_push: true, reviews: true,
                                    waiters: true, cashiers: true, tables: true, printer_stations: true
                                });
                            } else {
                                setModalityCustomFeatures({
                                    orders: true, cash_internal: true, products: true, notifications: true,
                                    clients: true, loyalty: true, ads_and_push: true, reviews: true,
                                    waiters: false, cashiers: false, tables: false, printer_stations: false
                                });
                            }
                        }}
                        className={`p-6 rounded-3xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                            modalityMode === 'subscription'
                                ? 'border-primary bg-amber-50/40 shadow-lg shadow-primary/10 ring-2 ring-primary/20'
                                : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="p-3 bg-white rounded-2xl border border-slate-200/60 shadow-xs text-slate-900">
                                <CreditCard className="w-6 h-6 text-primary" />
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                modalityMode === 'subscription' ? 'bg-primary text-slate-900' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {modalityMode === 'subscription' ? '✓ Seleccionada' : 'Opción 1'}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 text-base">Modalidad 1: Suscripción Mensual</h3>
                            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                                Paga mensualidad fija según el plan asignado. Hereda automáticamente los módulos y respeta el período gratis global.
                            </p>
                        </div>
                    </button>

                    {/* MODALIDAD 2 */}
                    <button
                        type="button"
                        onClick={() => setModalityMode('commission')}
                        className={`p-6 rounded-3xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                            modalityMode === 'commission'
                                ? 'border-emerald-500 bg-emerald-50/40 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-500/20'
                                : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="p-3 bg-white rounded-2xl border border-slate-200/60 shadow-xs text-emerald-600">
                                <Percent className="w-6 h-6 text-emerald-600" />
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                modalityMode === 'commission' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {modalityMode === 'commission' ? '✓ Seleccionada' : 'Opción 2'}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 text-base">Modalidad 2: Tarifa por Venta</h3>
                            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                                Sin mensualidad fija. Cobra una comisión (% o $ fijo) por cada pedido vendido acumulado en su cuenta.
                            </p>
                        </div>
                    </button>

                    {/* MODALIDAD 3 */}
                    <button
                        type="button"
                        onClick={() => setModalityMode('free_custom')}
                        className={`p-6 rounded-3xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                            modalityMode === 'free_custom'
                                ? 'border-indigo-500 bg-indigo-50/40 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/20'
                                : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="p-3 bg-white rounded-2xl border border-slate-200/60 shadow-xs text-indigo-600">
                                <Gift className="w-6 h-6 text-indigo-600" />
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                modalityMode === 'free_custom' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {modalityMode === 'free_custom' ? '✓ Seleccionada' : 'Opción 3'}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 text-base">Modalidad 3: Gratis / Desbloqueo Manual</h3>
                            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                                Acuerdos especiales o prueba personalizada con fecha límite opcional y módulos elegidos a medida.
                            </p>
                        </div>
                    </button>
                </div>

                {/* CONFIGURACIÓN DETALLADA SEGÚN LA MODALIDAD SELECCIONADA */}
                {modalityMode === 'subscription' && (
                    <div className="p-6 md:p-8 bg-slate-50 rounded-3xl border border-slate-200/80 space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h4 className="font-black text-slate-900 text-lg flex items-center gap-2">
                                    <CreditCard className="w-5 h-5 text-amber-600" />
                                    Plan Asignado al Negocio
                                </h4>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    El negocio heredará el precio mensual y los módulos activos configurados en dicho plan.
                                </p>
                            </div>
                            {globalPlansConfig?.freeTrialEnabled && (
                                <div className="px-4 py-2 bg-emerald-100 text-emerald-800 rounded-2xl border border-emerald-200 text-xs font-black flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-emerald-600" />
                                    Lanzamiento Activo: Gratis hasta {globalPlansConfig.transitionDate || 'Fecha Global'}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Plan Emprendedor */}
                            <div
                                onClick={() => {
                                    setModalityPlanId('emprendedor');
                                    const plan = globalPlansConfig?.plans?.find((p: any) => p.id === 'emprendedor');
                                    if (plan?.features) {
                                        setModalityCustomFeatures(plan.features);
                                    } else {
                                        setModalityCustomFeatures({
                                            orders: true, cash_internal: true, products: true, notifications: true,
                                            clients: true, loyalty: true, ads_and_push: true, reviews: true,
                                            waiters: false, cashiers: false, tables: false, printer_stations: false
                                        });
                                    }
                                }}
                                className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${
                                    modalityPlanId === 'emprendedor'
                                        ? 'bg-white border-primary shadow-md ring-2 ring-primary/20'
                                        : 'bg-white/70 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className="font-black text-slate-900 text-base">Plan Aliado Emprendedor</span>
                                    <span className="text-xl font-black text-slate-900">
                                        ${globalPlansConfig?.plans?.find((p: any) => p.id === 'emprendedor')?.price || 15} USD
                                        <span className="text-xs font-bold text-slate-400">/mes</span>
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 font-medium mb-3">
                                    {globalPlansConfig?.plans?.find((p: any) => p.id === 'emprendedor')?.description || 'Recepción de pedidos, caja interna, fidelización, clientes y catálogo de productos.'}
                                </p>
                                <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200/60 w-fit">
                                    <Lock className="w-3.5 h-3.5" />
                                    Bloquea Meseros, Cajeras, Mesas QR y Estaciones
                                </div>
                            </div>

                            {/* Plan Corporativo */}
                            <div
                                onClick={() => {
                                    setModalityPlanId('corporativo');
                                    const plan = globalPlansConfig?.plans?.find((p: any) => p.id === 'corporativo');
                                    if (plan?.features) {
                                        setModalityCustomFeatures(plan.features);
                                    } else {
                                        setModalityCustomFeatures({
                                            orders: true, cash_internal: true, products: true, notifications: true,
                                            clients: true, loyalty: true, ads_and_push: true, reviews: true,
                                            waiters: true, cashiers: true, tables: true, printer_stations: true
                                        });
                                    }
                                }}
                                className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${
                                    modalityPlanId === 'corporativo'
                                        ? 'bg-white border-indigo-600 shadow-md ring-2 ring-indigo-600/20'
                                        : 'bg-white/70 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className="font-black text-slate-900 text-base">Plan Aliado Corporativo</span>
                                    <span className="text-xl font-black text-indigo-700">
                                        ${globalPlansConfig?.plans?.find((p: any) => p.id === 'corporativo')?.price || 30} USD
                                        <span className="text-xs font-bold text-slate-400">/mes</span>
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 font-medium mb-3">
                                    {globalPlansConfig?.plans?.find((p: any) => p.id === 'corporativo')?.description || 'Ecosistema completo con apps de Meseros, Cajeras, Mesas QR y Estaciones Térmicas.'}
                                </p>
                                <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200/60 w-fit">
                                    <Unlock className="w-3.5 h-3.5" />
                                    Desbloquea TODOS los 12 módulos de la plataforma
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {modalityMode === 'commission' && (
                    <div className="p-6 md:p-8 bg-emerald-50/50 rounded-3xl border border-emerald-200 space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h4 className="font-black text-slate-900 text-lg flex items-center gap-2">
                                    <Percent className="w-5 h-5 text-emerald-600" />
                                    Configuración de Comisión por Venta
                                </h4>
                                <p className="text-xs text-slate-600 font-medium mt-0.5">
                                    El negocio no paga mensualidad fija; la app acumula la comisión pactada con cada pedido completado.
                                </p>
                            </div>

                            {/* Deuda acumulada stat */}
                            <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Deuda Comisiones Acumulada</span>
                                    <span className="text-xl font-black text-emerald-700">
                                        ${Number(restaurant?.deudaComisionesAcumulada || 0).toFixed(2)} USD
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-2xl border border-emerald-100">
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-wider text-slate-500">Tipo de Comisión</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setModalityCommissionType('percentage')}
                                        className={`p-3 rounded-xl border-2 text-xs font-black transition-all cursor-pointer ${
                                            modalityCommissionType === 'percentage'
                                                ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        Porcentaje (%)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModalityCommissionType('fixed')}
                                        className={`p-3 rounded-xl border-2 text-xs font-black transition-all cursor-pointer ${
                                            modalityCommissionType === 'fixed'
                                                ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs'
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        Monto Fijo ($ USD)
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                                    {modalityCommissionType === 'percentage' ? 'Porcentaje de Comisión (%)' : 'Monto Fijo por Pedido ($ USD)'}
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={modalityCommissionRate}
                                        onChange={(e) => setModalityCommissionRate(parseFloat(e.target.value) || 0)}
                                        placeholder={modalityCommissionType === 'percentage' ? 'Ej: 10' : 'Ej: 0.50'}
                                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 focus:bg-white rounded-xl p-3.5 pl-10 text-base font-black text-slate-900 outline-none transition-all"
                                    />
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-black">
                                        {modalityCommissionType === 'percentage' ? '%' : '$'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    {modalityCommissionType === 'percentage'
                                        ? `Se cobrará el ${modalityCommissionRate}% del total de cada pedido.`
                                        : `Se cobrarán $${Number(modalityCommissionRate).toFixed(2)} USD fijos por cada pedido.`}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {modalityMode === 'free_custom' && (
                    <div className="p-6 md:p-8 bg-indigo-50/50 rounded-3xl border border-indigo-200 space-y-6">
                        <div>
                            <h4 className="font-black text-slate-900 text-lg flex items-center gap-2">
                                <Gift className="w-5 h-5 text-indigo-600" />
                                Cortesía Especial / Período de Prueba Personalizado
                            </h4>
                            <p className="text-xs text-slate-600 font-medium mt-0.5">
                                Define si este negocio goza de cortesía gratuita por tiempo limitado o indefinido, y a qué plan pasará luego.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-2xl border border-indigo-100">
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <CalendarDays className="w-4 h-4 text-indigo-600" />
                                    Fecha Límite Gratuita (Opcional)
                                </label>
                                <input
                                    type="date"
                                    value={modalityFreeUntil}
                                    onChange={(e) => setModalityFreeUntil(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl p-3.5 text-sm font-bold text-slate-800 outline-none transition-all"
                                />
                                <p className="text-[11px] text-slate-400 font-medium">
                                    {modalityFreeUntil
                                        ? `Gratis hasta el ${modalityFreeUntil}. Después pasará al plan seleccionado.`
                                        : 'Dejar vacío para cortesía gratuita indefinida.'}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                                    Plan al que pasará al culminar la cortesía
                                </label>
                                <select
                                    value={modalityPlanId}
                                    onChange={(e) => setModalityPlanId(e.target.value as any)}
                                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl p-3.5 text-sm font-bold text-slate-800 outline-none transition-all cursor-pointer"
                                >
                                    <option value="emprendedor">Plan Aliado Emprendedor ($15/mes)</option>
                                    <option value="corporativo">Plan Aliado Corporativo ($30/mes)</option>
                                </select>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    Plan que se le asignará automáticamente para renovación de pago mensual.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* CHECKBOXES DE MÓDULOS HABILITADOS */}
                <div className="space-y-4 pt-2">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <Grid className="w-5 h-5 text-slate-700" />
                                Módulos y Herramientas Habilitadas para este Negocio
                            </h3>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                {modalityMode === 'subscription'
                                    ? `Módulos heredados del ${modalityPlanId === 'corporativo' ? 'Plan Corporativo' : 'Plan Emprendedor'}. Si deseas personalizarlos libremente, cambia a Modalidad Comisión o Cortesía.`
                                    : 'Marca o desmarca individualmente las herramientas que este negocio tendrá activas en su portal.'}
                            </p>
                        </div>

                        {modalityMode !== 'subscription' && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const allOn: Record<string, boolean> = {};
                                        AVAILABLE_MODULES.forEach(m => allOn[m.key] = true);
                                        setModalityCustomFeatures(allOn);
                                    }}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                                >
                                    Habilitar Todos
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setModalityCustomFeatures({
                                            orders: true, cash_internal: true, products: true, notifications: true,
                                            clients: true, loyalty: true, ads_and_push: true, reviews: true,
                                            waiters: false, cashiers: false, tables: false, printer_stations: false
                                        });
                                    }}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                                >
                                    Config. Emprendedor
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {AVAILABLE_MODULES.map((mod) => {
                            const IconComponent = mod.icon;
                            const isChecked = Boolean(modalityCustomFeatures[mod.key]);
                            const isReadOnly = modalityMode === 'subscription';

                            return (
                                <div
                                    key={mod.key}
                                    onClick={() => {
                                        if (isReadOnly) return;
                                        setModalityCustomFeatures(prev => ({
                                            ...prev,
                                            [mod.key]: !prev[mod.key]
                                        }));
                                    }}
                                    className={`p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 ${
                                        isReadOnly ? 'cursor-default' : 'cursor-pointer hover:shadow-sm'
                                    } ${
                                        isChecked
                                            ? 'bg-white border-primary shadow-xs'
                                            : 'bg-slate-50/60 border-slate-200/70 opacity-70'
                                    }`}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                        isChecked ? 'bg-primary text-slate-900' : 'bg-slate-200 text-slate-400'
                                    }`}>
                                        <IconComponent className="w-5 h-5" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4 className={`text-sm font-black truncate ${isChecked ? 'text-slate-900' : 'text-slate-500'}`}>
                                                {mod.label}
                                            </h4>
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                disabled={isReadOnly}
                                                onChange={(e) => {
                                                    if (isReadOnly) return;
                                                    setModalityCustomFeatures(prev => ({
                                                        ...prev,
                                                        [mod.key]: e.target.checked
                                                    }));
                                                }}
                                                className="w-4 h-4 rounded text-primary focus:ring-primary/20 accent-primary cursor-pointer shrink-0"
                                            />
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-medium line-clamp-1 mt-0.5">
                                            {mod.description}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Tabs & Content */}
            <div className="space-y-6">
                <div className="flex gap-4 border-b border-slate-100 pb-px">
                    {[
                        { id: 'overview', label: 'Resumen General', icon: Box },
                        { id: 'products', label: 'Menú / Productos', icon: Box },
                        { id: 'orders', label: 'Historial Pedidos', icon: ShoppingBag },
                        { id: 'followers', label: 'Clientes / Seguidores', icon: Users },
                        { id: 'rewards', label: 'Canje de Puntos', icon: Gift },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-6 py-4 font-black text-xs uppercase tracking-widest transition-all relative ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
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
                                        <ShoppingBag className="w-5 h-5 text-slate-900" /> Pedidos Recientes
                                    </h3>
                                    <button className="text-[10px] font-black text-slate-900 uppercase tracking-widest hover:underline">Ver todos</button>
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
                                                <DualPrice usdAmount={order.total || 0} usdClassName="font-black text-slate-900" showDivider={false} className="flex flex-col items-end" />
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
                                        <Box className="w-5 h-5 text-primary" /> Productos Populares
                                    </h3>
                                    <button className="text-[10px] font-black text-slate-900 uppercase tracking-widest hover:underline">Ver menú</button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                                    {popularProducts.map((p) => (
                                        <div key={p.id} className="group p-4 rounded-[32px] bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-lg transition-all">
                                            <div className="h-32 rounded-[24px] overflow-hidden mb-3">
                                                <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                            </div>
                                            <p className="font-black text-slate-900 line-clamp-1">{p.name}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <DualPrice usdAmount={p.price || 0} usdClassName="text-slate-900 font-black text-sm" showDivider={false} className="flex flex-col" />
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

                    {activeTab === 'products' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <RestaurantProductsManager restaurantId={id!} restaurantName={restaurant?.name || 'Tienda'} />
                        </div>
                    )}

                    {activeTab === 'rewards' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <RestaurantRewardsManager restaurantId={id!} />
                        </div>
                    )}

                    {activeTab !== 'overview' && activeTab !== 'rewards' && activeTab !== 'products' && (
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
                            className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden my-auto relative"
                        >
                            <button
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className="absolute top-6 right-6 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                                title="Cerrar"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            {/* Modal Header */}
                            <div className="bg-secondary p-8 md:p-12 text-white">
                                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end gap-6 md:gap-12 relative">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-24 h-24 md:w-32 md:h-32 bg-white/20 backdrop-blur-md rounded-full border-4 border-white/30 flex items-center justify-center overflow-hidden shadow-inner group relative">
                                            {editData.logoUrl ? (
                                                <img src={editData.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                                            ) : (
                                                <Store className="w-12 h-12 text-white/50" />
                                            )}
                                            <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                                <Camera className="w-8 h-8 text-white" />
                                                <input type="file" className="hidden" onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handleImageUpload(file, 'logo');
                                                }} />
                                            </label>
                                        </div>
                                        {isUploadingLogo && (
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/70">
                                                <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                                                Subiendo...
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 text-center md:text-left">
                                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-3">
                                            <span className="bg-white px-3 py-1 rounded-full text-secondary text-[10px] font-black uppercase tracking-widest">Panel de Control</span>
                                            {editData.featured && (
                                                <span className="bg-primary text-slate-900 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/30">Destacado</span>
                                            )}
                                            {editData.hasCashea && (
                                                <span className="bg-green-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-500/30">Cashea</span>
                                            )}
                                        </div>
                                        <h1 className="text-4xl md:text-5xl font-black mb-2">{editData.name || 'Tu Negocio'}</h1>
                                        <p className="text-white/70 font-bold flex items-center justify-center md:justify-start gap-2">
                                            <Store className="w-4 h-4" /> {editData.category}
                                        </p>
                                    </div>

                                    {/* Payment Methods Toggle */}
                                    <div className="flex flex-col gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setEditData(prev => ({ ...prev, paymentMethods: prev.paymentMethods || [] }))}
                                            className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                                        >
                                            <DollarSign className="w-4 h-4" /> Gestionar Pagos
                                        </button>
                                    </div>

                                    <div className="flex flex-col md:flex-row gap-3">
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="bg-white text-secondary hover:bg-slate-100 px-8 py-3 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-black/10 disabled:opacity-50"
                                        >
                                            {isSaving ? <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin"></div> : <Save className="w-5 h-5" />}
                                            Guardar Cambios
                                        </button>
                                        <button className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-white/20">
                                            <Share2 className="w-5 h-5" /> Ver Público
                                        </button>
                                    </div>
                                </div>
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
                                            <div className="flex items-center justify-between ml-4 mr-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                    <FileText className="w-3.5 h-3.5 text-primary" /> RIF del Negocio
                                                </label>
                                                <span className="text-[9px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                                                    <ShieldCheck className="w-3 h-3" /> Solo Super Admin
                                                </span>
                                            </div>
                                            <input
                                                type="text"
                                                value={editData.rif || ''}
                                                onChange={(e) => setEditData({ ...editData, rif: e.target.value.toUpperCase() })}
                                                className="w-full bg-slate-50 border-2 border-primary/20 focus:border-primary rounded-2xl p-4 font-black text-slate-800 tracking-wider focus:bg-white transition-all outline-none"
                                                placeholder="Ej: J-12345678-9"
                                            />
                                            <p className="text-[10px] text-slate-400 font-medium ml-4">
                                                Como Super Administrador tienes potestad única para actualizar o corregir el RIF directamente en base de datos.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Sector</label>
                                                <select
                                                    value={editData.sector || ''}
                                                    onChange={(e) => setEditData({ ...editData, sector: e.target.value, category: '' })}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none appearance-none"
                                                    required
                                                >
                                                    <option value="">Seleccionar Sector</option>
                                                    {sectors.map(cat => (
                                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Subcategoría (Opcional)</label>
                                                <select
                                                    value={editData.category || ''}
                                                    onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none appearance-none"
                                                    disabled={!editData.sector}
                                                >
                                                    <option value="">{editData.sector ? 'Ninguna / Seleccionar Subcategoría' : 'Primero elige un sector'}</option>
                                                    {subCats.map(cat => (
                                                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                                                    ))}
                                                    {!editData.sector && allCategories.filter(c => !c.parentId).length === 0 && (
                                                        <option value={editData.category}>{editData.category}</option>
                                                    )}
                                                </select>
                                            </div>
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

                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Estado del Local</label>
                                            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-3xl border border-slate-100 relative">
                                                <div
                                                    className={`absolute top-2 bottom-2 w-[calc(33.333%-10.6px)] bg-white rounded-2xl shadow-md transition-all duration-300 ease-spring`}
                                                    style={{
                                                        left: editData.status === 'active' || !editData.status ? '8px' :
                                                            editData.status === 'busy' ? 'calc(33.333% + 4px)' :
                                                                'calc(66.666%)'
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setEditData({ ...editData, status: 'active', isActive: true })}
                                                    className={`relative z-10 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${editData.status === 'active' || !editData.status ? 'text-emerald-500' : 'text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    Activo
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditData({ ...editData, status: 'busy', isActive: true })}
                                                    className={`relative z-10 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${editData.status === 'busy' ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    Ocupado
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditData({ ...editData, status: 'unavailable', isActive: false })}
                                                    className={`relative z-10 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${editData.status === 'unavailable' ? 'text-slate-500' : 'text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    No Disp.
                                                </button>
                                            </div>
                                        </div>
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 pt-6 border-t border-slate-100">
                                            <DollarSign className="w-4 h-4" /> Suscripción (Cobro)
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Fecha de Corte</label>
                                                <select
                                                    value={editData.billingDay || 1}
                                                    onChange={(e) => setEditData({ ...editData, billingDay: Number(e.target.value) })}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none appearance-none"
                                                >
                                                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                                                        <option key={day} value={day}>Día {day}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Monto Mensual ($)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={editData.billingAmount || ''}
                                                    onChange={(e) => setEditData({ ...editData, billingAmount: parseFloat(e.target.value) || 0 })}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                                    placeholder="Ej: 30.00"
                                                />
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
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logo del Restaurante</p>
                                                <Upload className="w-4 h-4 text-slate-900" />
                                            </div>

                                            <div className="relative group/logo">
                                                <div className="w-full h-32 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover/logo:border-primary/50">
                                                    {(logoPreview || editData.logoUrl) ? (
                                                        <img
                                                            src={logoPreview || editData.logoUrl}
                                                            alt="Logo Preview"
                                                            className="w-full h-full object-contain p-2"
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-2 text-slate-400">
                                                            <ImageIcon className="w-8 h-8" />
                                                            <span className="text-[10px] font-bold uppercase tracking-widest">Subir Imagen</span>
                                                        </div>
                                                    )}

                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setLogoFile(file);
                                                                setLogoPreview(URL.createObjectURL(file));
                                                            }
                                                        }}
                                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                    />

                                                    {(logoPreview || editData.logoUrl) && (
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/logo:opacity-100 transition-opacity flex items-center justify-center">
                                                            <Upload className="w-6 h-6 text-white" />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-[9px] text-slate-400 font-bold mt-2 text-center uppercase tracking-tighter italic">Recomendado: 512x512px (PNG Transparente)</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl ${editData.featured ? 'bg-primary/10 text-slate-900' : 'bg-slate-200 text-slate-400'}`}>
                                                    <Zap className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-800">Negocio Destacado</p>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Aparece en los primeros resultados</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setEditData(prev => ({ ...prev, featured: !prev.featured }))}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editData.featured ? 'bg-primary' : 'bg-slate-200'}`}
                                            >
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editData.featured ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-yellow-50/50 rounded-2xl border border-yellow-100">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center p-1.5 transition-all ${editData.hasCashea ? 'bg-yellow-400 shadow-inner' : 'bg-slate-100'}`}>
                                                    <img
                                                        src={casheaIcon || "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/OIP%20(4).webp"}
                                                        alt="Cashea"
                                                        className={`w-full h-full object-contain transition-all ${editData.hasCashea ? 'opacity-100 scale-110' : 'opacity-40 grayscale'}`}
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-800">Servicio Cashea</p>
                                                    <p className="text-[10px] font-bold text-amber-700 uppercase">Habilitar icono de pago con Cashea</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setEditData(prev => ({ ...prev, hasCashea: !prev.hasCashea }))}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editData.hasCashea ? 'bg-yellow-400' : 'bg-slate-200'}`}
                                            >
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editData.hasCashea ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                        </div>

                                        {/* Payment Methods Section in Modal */}
                                        <div className="space-y-4 pt-4 border-t border-slate-100">
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                                    <DollarSign className="w-4 h-4" /> Métodos de Pago
                                                </h3>
                                                <button
                                                    type="button"
                                                    onClick={addPaymentMethod}
                                                    className="text-primary text-[10px] font-black uppercase tracking-widest hover:underline flex items-center gap-1"
                                                >
                                                    <Zap className="w-3 h-3" /> Añadir
                                                </button>
                                            </div>

                                            <div className="space-y-3">
                                                {paymentMethods.length === 0 ? (
                                                    <p className="text-center py-6 bg-slate-50 rounded-2xl text-[10px] font-bold text-slate-400 uppercase italic">
                                                        No hay métodos configurados
                                                    </p>
                                                ) : (
                                                    paymentMethods.map((method, idx) => (
                                                        <div key={idx} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 group relative">
                                                            <button
                                                                type="button"
                                                                onClick={() => removePaymentMethod(idx)}
                                                                className="absolute top-2 right-2 p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>

                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div className="col-span-2 space-y-1">
                                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Tipo</label>
                                                                    <select
                                                                        value={method.type}
                                                                        onChange={(e) => updatePaymentMethod(idx, 'type', e.target.value)}
                                                                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 outline-none focus:border-primary appearance-none"
                                                                    >
                                                                        <option value="Pago Móvil">Pago Móvil</option>
                                                                        <option value="Transferencia">Transferencia</option>
                                                                        <option value="Zelle">Zelle</option>
                                                                        <option value="Efectivo">Efectivo</option>
                                                                    </select>
                                                                </div>

                                                                {method.type === 'Pago Móvil' && (
                                                                    <>
                                                                        <div className="space-y-1">
                                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Banco</label>
                                                                            <input
                                                                                type="text"
                                                                                value={method.bank}
                                                                                onChange={(e) => updatePaymentMethod(idx, 'bank', e.target.value)}
                                                                                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:border-primary outline-none"
                                                                                placeholder="Banco"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Teléfono</label>
                                                                            <input
                                                                                type="text"
                                                                                value={method.phone}
                                                                                onChange={(e) => updatePaymentMethod(idx, 'phone', e.target.value)}
                                                                                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:border-primary outline-none"
                                                                                placeholder="04xx..."
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">RIF/CI</label>
                                                                            <input
                                                                                type="text"
                                                                                value={method.rif}
                                                                                onChange={(e) => updatePaymentMethod(idx, 'rif', e.target.value)}
                                                                                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:border-primary outline-none"
                                                                                placeholder="V-xxx"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Titular</label>
                                                                            <input
                                                                                type="text"
                                                                                value={method.owner}
                                                                                onChange={(e) => updatePaymentMethod(idx, 'owner', e.target.value)}
                                                                                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:border-primary outline-none"
                                                                                placeholder="Nombre"
                                                                            />
                                                                        </div>
                                                                    </>
                                                                )}
                                                                {method.type === 'Zelle' && (
                                                                    <>
                                                                        <div className="col-span-2 space-y-1">
                                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Correo</label>
                                                                            <input
                                                                                type="email"
                                                                                value={method.email || ''}
                                                                                onChange={(e) => updatePaymentMethod(idx, 'email', e.target.value)}
                                                                                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:border-primary outline-none"
                                                                                placeholder="zelle@example.com"
                                                                            />
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
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
                                        className="flex-[2] py-4 bg-primary text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
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

