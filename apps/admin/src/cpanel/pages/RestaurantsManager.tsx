import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
    Store, CheckCircle, XCircle, ChevronRight, X, Phone, MapPin, 
    Tag, Box, Star, Users, ShoppingBag, Database, ShieldCheck, 
    ShieldAlert, Trash2, Plus, Loader2, Lock, Mail, Copy, 
    ExternalLink, Image as ImageIcon, Check 
} from 'lucide-react';
import { Restaurant, seedDatabase, clearMockDatabase } from '../../lib/seed';
import { GLOBAL_CATEGORIES } from '../../lib/constants';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface RestaurantDetail extends Restaurant {
    followersCount?: number;
    productsCount?: number;
    totalOrders?: number;
    status?: 'active' | 'busy' | 'unavailable';
    email?: string;
    isVisible?: boolean;
    isVerified?: boolean;
    verificationStatus?: string;
    deuda_comisiones_acumulada?: number;
}

export default function RestaurantsManager() {
    const navigate = useNavigate();
    const [restaurants, setRestaurants] = useState<RestaurantDetail[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMocking, setIsMocking] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Create Store Modal states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '',
        category: GLOBAL_CATEGORIES[0] || 'Restaurantes',
        whatsapp: '',
        email: '',
        password: '',
        address: '',
        city: 'Caracas',
        state: 'Distrito Capital',
        description: '',
        logoUrl: ''
    });
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // Created Store Credentials state (shown after success)
    const [createdCreds, setCreatedCreds] = useState<{
        name: string;
        email: string;
        password: string;
        comercioId: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    const hasMockData = restaurants.some(r => r.isMock);

    const fetchRestaurants = async () => {
        try {
            const { data, error } = await supabase
                .from('comercios')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            const mapped = (data || []).map(r => ({
                ...r,
                isActive: r.is_active !== undefined ? r.is_active : (r.isActive !== false),
                isVisible: r.is_visible !== undefined ? r.is_visible : (r.isVisible ?? false),
                isVerified: r.is_verified || r.isVerified || r.verification_status === 'verified',
                verificationStatus: r.verification_status || 'unverified',
                logoUrl: r.logo_url || r.logoUrl || r.image,
                subscriptionEnd: r.subscription_end || r.subscriptionEnd,
                deuda_comisiones_acumulada: r.deuda_comisiones_acumulada || 0
            })) as RestaurantDetail[];
            setRestaurants(mapped);
        } catch (error) {
            console.error("Error fetching restaurants: ", error);
        } finally {
            setLoading(false);
            setIsMocking(false);
        }
    };

    useEffect(() => {
        fetchRestaurants();
    }, []);

    const toggleStatus = async (id: string, currentStatus: boolean | undefined, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const newStatus = currentStatus === undefined ? false : !currentStatus;
            const { error } = await supabase
                .from('comercios')
                .update({ is_active: newStatus })
                .eq('id', id);

            if (error) throw error;
            setRestaurants(prev => prev.map(r => r.id === id ? { ...r, isActive: newStatus } : r));
            toast.success(`Tienda ${newStatus ? 'activada' : 'suspendida'}`);
        } catch (error) {
            console.error("Error updating restaurant status:", error);
            toast.error("Error al actualizar el estado");
        }
    };

    const handleDeleteRestaurant = async (id: string, name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(`¿Estás SEGURO de eliminar definitivamente "${name}"? Esta acción borrará permanentemente la tienda, sus productos y toda su información de la plataforma.`)) return;

        setDeletingId(id);
        try {
            const { error: rpcErr } = await supabase.rpc('delete_comercio_cascade', { target_id: id });
            if (rpcErr) {
                console.warn("RPC cascade delete failed, using manual cleanup fallback:", rpcErr);
                await supabase.from('products').delete().eq('restaurant_id', id);
                await supabase.from('banners').delete().eq('restaurant_id', id);
                await supabase.from('cashiers').delete().eq('restaurant_id', id);
                await supabase.from('waiters').delete().eq('restaurant_id', id);
                await supabase.from('restaurant_tables').delete().eq('restaurant_id', id);
                await supabase.from('restaurant_followers').delete().eq('restaurant_id', id);
                await supabase.from('printers').delete().eq('restaurant_id', id);
                await supabase.from('reviews').delete().eq('restaurant_id', id);
                await supabase.from('orders').delete().eq('restaurant_id', id);
                const { error: delErr } = await supabase.from('comercios').delete().eq('id', id);
                if (delErr) throw delErr;
            }

            setRestaurants(prev => prev.filter(r => r.id !== id));
            toast.success(`Comercio "${name}" eliminado exitosamente.`);
        } catch (error: any) {
            console.error("Error deleting restaurant:", error);
            toast.error("Error al eliminar el comercio: " + (error.message || ""));
        } finally {
            setDeletingId(null);
        }
    };

    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const handleCreateStore = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!createForm.name.trim()) {
            toast.error("El nombre de la tienda es requerido");
            return;
        }
        if (!createForm.email.trim() || !createForm.email.includes('@')) {
            toast.error("Ingresa un correo electrónico válido");
            return;
        }
        if (!createForm.password || createForm.password.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres");
            return;
        }
        if (!createForm.whatsapp.trim()) {
            toast.error("El número de WhatsApp es requerido para concretar ventas");
            return;
        }

        setCreating(true);

        try {
            let finalLogoUrl = createForm.logoUrl;

            if (logoFile) {
                setUploadingLogo(true);
                const fileExt = logoFile.name.split('.').pop() || 'png';
                const fileName = `logo_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('store_assets')
                    .upload(fileName, logoFile, { upsert: true });

                if (uploadError) {
                    console.warn("Could not upload to store_assets, trying avatars:", uploadError);
                } else {
                    const { data: pubData } = supabase.storage
                        .from('store_assets')
                        .getPublicUrl(fileName);
                    finalLogoUrl = pubData.publicUrl;
                }
            }

            const { data, error } = await supabase.rpc('admin_create_comercio_with_auth', {
                p_email: createForm.email.trim().toLowerCase(),
                p_password: createForm.password,
                p_name: createForm.name.trim(),
                p_category: createForm.category,
                p_whatsapp: createForm.whatsapp.trim(),
                p_address: createForm.address.trim(),
                p_city: createForm.city.trim(),
                p_state: createForm.state.trim(),
                p_logo_url: finalLogoUrl || '',
                p_description: createForm.description.trim()
            });

            if (error) throw error;

            if (data && data.success === false) {
                toast.error(data.message || "Error al crear la tienda");
                return;
            }

            toast.success("¡Tienda y credenciales creadas exitosamente!");

            // Save credentials for display modal
            setCreatedCreds({
                name: createForm.name.trim(),
                email: createForm.email.trim().toLowerCase(),
                password: createForm.password,
                comercioId: data.comercio_id
            });

            // Close creation form
            setIsCreateModalOpen(false);

            // Reset form
            setCreateForm({
                name: '',
                category: GLOBAL_CATEGORIES[0] || 'Restaurantes',
                whatsapp: '',
                email: '',
                password: '',
                address: '',
                city: 'Caracas',
                state: 'Distrito Capital',
                description: '',
                logoUrl: ''
            });
            setLogoFile(null);
            setLogoPreview(null);

            // Refresh list
            fetchRestaurants();

        } catch (err: any) {
            console.error("Error creating store with auth:", err);
            toast.error("Error al crear la tienda: " + (err.message || ""));
        } finally {
            setCreating(false);
            setUploadingLogo(false);
        }
    };

    const copyCredentials = () => {
        if (!createdCreds) return;
        const text = `Credenciales de acceso a tu tienda:\n\nTienda: ${createdCreds.name}\nCorreo: ${createdCreds.email}\nContraseña: ${createdCreds.password}\n\nPuedes ingresar desde el portal de negocios de la aplicación.`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Credenciales copiadas al portapapeles");
        setTimeout(() => setCopied(false), 3000);
    };

    const handleRowClick = (restaurant: RestaurantDetail) => {
        navigate(`/restaurants/${restaurant.id}`);
    };

    if (loading && restaurants.length === 0) {
        return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-1/4"></div><div className="h-64 bg-slate-200 rounded"></div></div>;
    }

    return (
        <div className="space-y-6">
            {/* Header with Title and Create Button */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 md:p-8 rounded-[36px] border border-slate-100 shadow-sm">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">
                        Gestión de Tiendas y Comercios
                    </h1>
                    <p className="text-slate-500 font-medium text-sm">
                        Crea nuevas tiendas, asigna credenciales a los dueños y administra sus catálogos de productos.
                    </p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center justify-center gap-2.5 px-6 py-4 bg-primary text-slate-950 font-black rounded-2xl shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm uppercase tracking-wider shrink-0"
                >
                    <Plus className="w-5 h-5 stroke-[2.5]" />
                    Crear Nueva Tienda
                </button>
            </div>

            {/* Restaurants Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-24">
                {restaurants.map((restaurant) => {
                    const isActive = restaurant.isActive !== false;
                    const logo = (restaurant as any).logoUrl || restaurant.image;
                    
                    const subEnd = (restaurant as any).subscriptionEnd ? new Date((restaurant as any).subscriptionEnd) : null;
                    const hasActiveSub = subEnd && subEnd > new Date();

                    return (
                        <div
                            key={restaurant.id}
                            onClick={() => handleRowClick(restaurant)}
                            className="bg-white rounded-[32px] p-5 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/40 hover:-translate-y-1 transition-all cursor-pointer flex flex-col gap-4 relative overflow-hidden group"
                        >
                            {/* Card Header: Logo, Name, ID, Category */}
                            <div className="flex items-start gap-4">
                                <div className="w-16 h-16 rounded-[20px] bg-slate-100 overflow-hidden border border-slate-100 shrink-0">
                                    {logo ? (
                                        <img src={logo} alt={restaurant.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-100">
                                            <Store className="w-8 h-8 text-slate-300" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 pr-6">
                                    <div className="font-bold text-lg text-slate-900 truncate">
                                        {restaurant.name}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                                            ID: {restaurant.id.slice(0, 8)}...
                                        </div>
                                        <span className="text-slate-200">•</span>
                                        <div className="text-[10px] font-bold text-indigo-500 lowercase truncate">
                                            {restaurant.email || 'Sin correo'}
                                        </div>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap gap-2 items-center">
                                        <span className="text-[10px] font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 uppercase tracking-wider">
                                            {restaurant.category}
                                        </span>
                                        {restaurant.isVerified ? (
                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-lg flex items-center gap-1">
                                                <ShieldCheck className="w-3 h-3" /> Verificado
                                            </span>
                                        ) : restaurant.verificationStatus === 'pending' ? (
                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-lg flex items-center gap-1 animate-pulse">
                                                <ShieldAlert className="w-3 h-3" /> Por Verificar
                                            </span>
                                        ) : null}
                                        <span className={`px-2 py-0.5 text-[10px] font-black rounded-lg ${
                                            restaurant.isVisible ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {restaurant.isVisible ? 'Visible' : 'Oculto'}
                                        </span>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 absolute top-5 right-5 transition-colors" />
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-slate-50 w-full"></div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-slate-400 mb-1.5">Estado</p>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                                        !isActive ? 'bg-slate-100 text-slate-700' :
                                        restaurant.status === 'busy' ? 'bg-amber-100 text-amber-700' :
                                        restaurant.status === 'unavailable' ? 'bg-red-100 text-red-700' :
                                        'bg-emerald-100 text-emerald-700'
                                    }`}>
                                        {!isActive ? <XCircle className="w-3 h-3" /> :
                                        restaurant.status === 'busy' ? <Store className="w-3 h-3" /> :
                                        restaurant.status === 'unavailable' ? <XCircle className="w-3 h-3" /> :
                                        <CheckCircle className="w-3 h-3" />}
                                        {!isActive ? 'Suspendido' :
                                        restaurant.status === 'busy' ? 'Ocupado' :
                                        restaurant.status === 'unavailable' ? 'No Disponible' : 'Activo'}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-slate-400 mb-1.5">WhatsApp Ventas</p>
                                    <span className="text-[11px] font-bold text-slate-700 truncate block">
                                        {restaurant.whatsapp || 'Sin registrar'}
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="mt-1 pt-3 border-t border-slate-50 flex items-center justify-between gap-2">
                                <button
                                    onClick={(e) => handleDeleteRestaurant(restaurant.id, restaurant.name, e)}
                                    disabled={deletingId === restaurant.id}
                                    title="Eliminar comercio definitivamente"
                                    className="p-2.5 rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50 shrink-0"
                                >
                                    {deletingId === restaurant.id ? (
                                        <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                                    ) : (
                                        <Trash2 className="w-4 h-4" />
                                    )}
                                </button>
                                <button
                                    onClick={(e) => toggleStatus(restaurant.id, restaurant.isActive, e)}
                                    className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all text-center ${
                                        isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                    }`}
                                >
                                    {isActive ? 'Suspender' : 'Activar'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal: Crear Nueva Tienda */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl p-6 sm:p-10 relative my-auto animate-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setIsCreateModalOpen(false)}
                            className="absolute top-6 right-6 p-2.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary-dark font-black">
                                <Store className="w-6 h-6 text-slate-900" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">Apertura de Nueva Tienda</h3>
                                <p className="text-xs font-bold text-slate-400">Registra el comercio y asígnale credenciales para su portal.</p>
                            </div>
                        </div>

                        <form onSubmit={handleCreateStore} className="space-y-4 mt-6">
                            {/* Logo and Store Name */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                <div className="flex flex-col items-center justify-center">
                                    <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-slate-200 overflow-hidden flex items-center justify-center relative mb-2">
                                        {logoPreview ? (
                                            <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon className="w-8 h-8 text-slate-300" />
                                        )}
                                    </div>
                                    <label className="text-[10px] font-black uppercase text-primary-dark cursor-pointer hover:underline">
                                        Subir Logo
                                        <input type="file" accept="image/*" onChange={handleLogoFileChange} className="hidden" />
                                    </label>
                                </div>

                                <div className="sm:col-span-2 space-y-3">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                            Nombre de la Tienda / Negocio *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Ej: Empanadas Don Pepe, Calzados Moda..."
                                            value={createForm.name}
                                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                            Categoría Comercial *
                                        </label>
                                        <select
                                            value={createForm.category}
                                            onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                                            className="w-full px-3 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-primary"
                                        >
                                            {GLOBAL_CATEGORIES.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* WhatsApp & Location */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                        WhatsApp de Ventas (Con código de país) *
                                    </label>
                                    <div className="relative">
                                        <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            required
                                            placeholder="Ej: 584121234567"
                                            value={createForm.whatsapp}
                                            onChange={(e) => setCreateForm({ ...createForm, whatsapp: e.target.value })}
                                            className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-primary"
                                        />
                                    </div>
                                    <p className="text-[9px] text-slate-400 mt-1">Aquí es donde los clientes escribirán para cerrar sus compras.</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                        Dirección Física
                                    </label>
                                    <div className="relative">
                                        <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            placeholder="Ej: Av. Principal, Local 4..."
                                            value={createForm.address}
                                            onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                                            className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-primary"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Owner Credentials Section */}
                            <div className="p-5 bg-amber-50/60 rounded-3xl border border-amber-100/80 space-y-3">
                                <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-wider">
                                    <Lock className="w-4 h-4 text-amber-600" />
                                    Credenciales de Acceso para el Dueño de la Tienda
                                </div>
                                <p className="text-[11px] text-amber-800/80 leading-relaxed font-medium">
                                    Establece el correo y la contraseña que le entregarás al dueño del comercio para que inicie sesión en su portal administrativo.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">
                                            Correo Electrónico (Login) *
                                        </label>
                                        <div className="relative">
                                            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="email"
                                                required
                                                placeholder="tienda@correo.com"
                                                value={createForm.email}
                                                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                                                className="w-full pl-9 pr-4 py-3 bg-white border border-amber-200/80 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-primary"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">
                                            Contraseña de Acceso *
                                        </label>
                                        <div className="relative">
                                            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                required
                                                placeholder="Mínimo 6 caracteres"
                                                value={createForm.password}
                                                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                                                className="w-full pl-9 pr-4 py-3 bg-white border border-amber-200/80 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-primary font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                    Descripción o Presentación de la Tienda
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Breve reseña sobre los productos y servicios que ofrece la tienda..."
                                    value={createForm.description}
                                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:border-primary resize-none"
                                />
                            </div>

                            {/* Submit & Cancel */}
                            <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-6 py-3.5 rounded-2xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || uploadingLogo}
                                    className="flex items-center gap-2.5 px-8 py-3.5 bg-primary text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    {(creating || uploadingLogo) && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Abrir Tienda y Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Credenciales Creadas Exitosamente */}
            {createdCreds && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
                    <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl p-8 text-center relative animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">¡Tienda Creada con Éxito!</h3>
                        <p className="text-xs text-slate-500 mb-6 font-medium">
                            La tienda <span className="font-bold text-slate-900">{createdCreds.name}</span> ya está registrada en Supabase.
                            Guarda y entrégale estas credenciales al dueño para su acceso:
                        </p>

                        {/* Credentials Card */}
                        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200/80 text-left space-y-3 mb-6 font-mono text-xs">
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-sans font-black">Correo Electrónico:</p>
                                <p className="font-bold text-slate-900 select-all">{createdCreds.email}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-sans font-black">Contraseña:</p>
                                <p className="font-bold text-primary-dark select-all">{createdCreds.password}</p>
                            </div>
                            <button
                                onClick={copyCredentials}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-slate-200 hover:border-primary text-slate-800 font-sans font-bold text-xs rounded-xl transition-all shadow-sm"
                            >
                                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                                {copied ? '¡Copiado!' : 'Copiar Credenciales'}
                            </button>
                        </div>

                        <div className="flex flex-col gap-2.5">
                            <button
                                onClick={() => {
                                    const cId = createdCreds.comercioId;
                                    setCreatedCreds(null);
                                    navigate(`/restaurants/${cId}`);
                                }}
                                className="w-full py-4 bg-primary text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                <Box className="w-4 h-4" />
                                Subir Productos a esta Tienda
                            </button>
                            <button
                                onClick={() => setCreatedCreds(null)}
                                className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl text-xs hover:bg-slate-200 transition-colors"
                            >
                                Cerrar y Volver a la Lista
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
