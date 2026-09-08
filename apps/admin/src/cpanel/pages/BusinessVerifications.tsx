import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
    ShieldCheck,
    ShieldAlert,
    ShieldX,
    Clock,
    Search,
    CheckCircle2,
    XCircle,
    Eye,
    ExternalLink,
    Instagram,
    Phone,
    MapPin,
    AlertCircle,
    Store,
    Calendar,
    Truck,
    RefreshCw,
    Download,
    ZoomIn,
    X,
    MessageCircle,
    HelpCircle,
    ChevronRight,
    ToggleLeft,
    ToggleRight
} from 'lucide-react';

interface ComercioVerification {
    id: string;
    name: string;
    rif: string;
    email?: string;
    logo_url?: string;
    image?: string;
    instagram?: string;
    tiktok?: string;
    whatsapp?: string;
    is_visible?: boolean;
    isVisible?: boolean;
    is_verified?: boolean;
    isVerified?: boolean;
    verification_status?: 'unverified' | 'pending' | 'verified' | 'rejected';
    verification_data?: any;
    rejection_reason?: string;
    address_reference?: string;
    location?: any;
    working_hours?: any[];
    created_at?: string;
    updated_at?: string;
}

export default function BusinessVerifications() {
    const [verifications, setVerifications] = useState<ComercioVerification[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'verified' | 'rejected' | 'all'>('pending');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal states
    const [selectedRifImage, setSelectedRifImage] = useState<{ url: string; businessName: string } | null>(null);
    const [rejectingItem, setRejectingItem] = useState<ComercioVerification | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isSubmittingReject, setIsSubmittingReject] = useState(false);
    const [approvingItem, setApprovingItem] = useState<ComercioVerification | null>(null);
    const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    const fetchVerifications = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('comercios')
                .select('*')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            setVerifications(data || []);
        } catch (err) {
            console.error("Error al cargar verificaciones:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVerifications();

        const channel = supabase
            .channel('comercios_verifications_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comercios' }, () => {
                fetchVerifications();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const showToast = (msg: string) => {
        setActionMessage(msg);
        setTimeout(() => setActionMessage(null), 4000);
    };

    // Quick rejection templates
    const REJECTION_TEMPLATES = [
        "El comprobante de RIF está vencido o la fotografía no es legible.",
        "El número de RIF indicado no coincide con el documento adjunto.",
        "La dirección no cuenta con una referencia visual suficiente para ubicar el local.",
        "El perfil de Instagram suministrado es inexistente o privado.",
        "El número de WhatsApp no se encuentra activo para recepción de pedidos."
    ];

    const handleApprove = async () => {
        if (!approvingItem) return;
        setIsSubmittingApprove(true);
        try {
            const { error } = await supabase
                .from('comercios')
                .update({
                    is_verified: true,
                    isVerified: true,
                    verification_status: 'verified',
                    is_visible: true,
                    isVisible: true,
                    rejection_reason: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', approvingItem.id);

            if (error) throw error;

            showToast(`¡Comercio "${approvingItem.name}" verificado y activado con éxito!`);
            setApprovingItem(null);
            await fetchVerifications();
        } catch (err: any) {
            console.error("Error al aprobar negocio:", err);
            alert("Error al aprobar: " + (err.message || 'Error desconocido'));
        } finally {
            setIsSubmittingApprove(false);
        }
    };

    const handleReject = async () => {
        if (!rejectingItem) return;
        if (!rejectionReason.trim()) {
            alert("Por favor escribe o selecciona el motivo del rechazo.");
            return;
        }

        setIsSubmittingReject(true);
        try {
            const { error } = await supabase
                .from('comercios')
                .update({
                    is_verified: false,
                    isVerified: false,
                    verification_status: 'rejected',
                    rejection_reason: rejectionReason.trim(),
                    is_visible: false,
                    isVisible: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', rejectingItem.id);

            if (error) throw error;

            showToast(`La solicitud de "${rejectingItem.name}" fue rechazada.`);
            setRejectingItem(null);
            setRejectionReason('');
            await fetchVerifications();
        } catch (err: any) {
            console.error("Error al rechazar negocio:", err);
            alert("Error al rechazar: " + (err.message || 'Error desconocido'));
        } finally {
            setIsSubmittingReject(false);
        }
    };

    const handleToggleVisibility = async (item: ComercioVerification, e: React.MouseEvent) => {
        e.stopPropagation();
        const currentVis = item.is_visible ?? item.isVisible ?? false;
        const newVis = !currentVis;
        try {
            const { error } = await supabase
                .from('comercios')
                .update({
                    is_visible: newVis,
                    isVisible: newVis,
                    updated_at: new Date().toISOString()
                })
                .eq('id', item.id);

            if (error) throw error;
            showToast(`Visibilidad de "${item.name}" cambiada a: ${newVis ? 'VISIBLE' : 'OCULTO'}`);
            setVerifications(prev => prev.map(c => c.id === item.id ? { ...c, is_visible: newVis, isVisible: newVis } : c));
        } catch (err: any) {
            console.error("Error al alternar visibilidad:", err);
            alert("Error al cambiar visibilidad: " + (err.message || 'Error'));
        }
    };

    // Filter items
    const pendingList = verifications.filter(v => v.verification_status === 'pending');
    const verifiedList = verifications.filter(v => v.verification_status === 'verified' || v.is_verified === true || v.isVerified === true);
    const rejectedList = verifications.filter(v => v.verification_status === 'rejected');
    
    let currentTabList = verifications;
    if (activeTab === 'pending') currentTabList = pendingList;
    else if (activeTab === 'verified') currentTabList = verifiedList;
    else if (activeTab === 'rejected') currentTabList = rejectedList;

    const filteredList = currentTabList.filter(v => {
        const query = searchTerm.toLowerCase();
        const nameMatch = (v.name || '').toLowerCase().includes(query);
        const rifMatch = (v.rif || '').toLowerCase().includes(query);
        const waMatch = (v.whatsapp || '').includes(query);
        const refMatch = (v.address_reference || v.verification_data?.addressReference || '').toLowerCase().includes(query);
        const igMatch = (v.instagram || v.verification_data?.instagram || '').toLowerCase().includes(query);
        return nameMatch || rifMatch || waMatch || refMatch || igMatch;
    });

    return (
        <div className="space-y-6 pb-24 animate-in fade-in duration-500 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/10 text-amber-600 rounded-2xl">
                            <ShieldCheck className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">
                                Verificación de Negocios
                            </h1>
                            <p className="text-slate-500 text-sm font-medium">
                                Audita recaudos del RIF, redes sociales, ubicación y aprueba la visibilidad de tiendas.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchVerifications}
                        disabled={loading}
                        className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center gap-2 transition-all cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        <span>Actualizar</span>
                    </button>
                </div>
            </div>

            {/* Notification Toast */}
            {actionMessage && (
                <div className="bg-emerald-500 text-slate-950 px-6 py-4 rounded-2xl font-black text-sm shadow-xl shadow-emerald-500/20 flex items-center justify-between animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-slate-950" />
                        <span>{actionMessage}</span>
                    </div>
                    <button onClick={() => setActionMessage(null)}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Metrics Counters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div
                    onClick={() => setActiveTab('pending')}
                    className={`p-5 rounded-[28px] border transition-all cursor-pointer ${activeTab === 'pending'
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-lg shadow-amber-500/20'
                        : 'bg-white text-slate-800 border-slate-100 hover:border-amber-200'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-black tracking-wider opacity-80">Pendientes</span>
                        <Clock className="w-5 h-5" />
                    </div>
                    <div className="mt-3 text-3xl font-black">{pendingList.length}</div>
                    <p className="text-xs font-semibold mt-1 opacity-80">Por auditar y aprobar</p>
                </div>

                <div
                    onClick={() => setActiveTab('verified')}
                    className={`p-5 rounded-[28px] border transition-all cursor-pointer ${activeTab === 'verified'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-600 shadow-lg shadow-emerald-500/20'
                        : 'bg-white text-slate-800 border-slate-100 hover:border-emerald-200'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-black tracking-wider opacity-80">Verificados</span>
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="mt-3 text-3xl font-black">{verifiedList.length}</div>
                    <p className="text-xs font-semibold mt-1 opacity-80">Comercios aprobados</p>
                </div>

                <div
                    onClick={() => setActiveTab('rejected')}
                    className={`p-5 rounded-[28px] border transition-all cursor-pointer ${activeTab === 'rejected'
                        ? 'bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-500/20'
                        : 'bg-white text-slate-800 border-slate-100 hover:border-rose-200'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-black tracking-wider opacity-80">Rechazados</span>
                        <ShieldX className="w-5 h-5" />
                    </div>
                    <div className="mt-3 text-3xl font-black">{rejectedList.length}</div>
                    <p className="text-xs font-semibold mt-1 opacity-80">Solicitudes denegadas</p>
                </div>

                <div
                    onClick={() => setActiveTab('all')}
                    className={`p-5 rounded-[28px] border transition-all cursor-pointer ${activeTab === 'all'
                        ? 'bg-slate-900 text-white border-slate-800 shadow-lg shadow-slate-900/20'
                        : 'bg-white text-slate-800 border-slate-100 hover:border-slate-300'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-black tracking-wider opacity-80">Total Comercios</span>
                        <Store className="w-5 h-5" />
                    </div>
                    <div className="mt-3 text-3xl font-black">{verifications.length}</div>
                    <p className="text-xs font-semibold mt-1 opacity-80">Registrados en la plataforma</p>
                </div>
            </div>

            {/* Filter Bar & Search */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`px-4 py-2 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${activeTab === 'pending'
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Pendientes ({pendingList.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('verified')}
                        className={`px-4 py-2 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${activeTab === 'verified'
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Verificados ({verifiedList.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('rejected')}
                        className={`px-4 py-2 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${activeTab === 'rejected'
                            ? 'bg-rose-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Rechazados ({rejectedList.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`px-4 py-2 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${activeTab === 'all'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Todos ({verifications.length})
                    </button>
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nombre, RIF o referencia..."
                        className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-amber-500 focus:bg-white transition-all"
                    />
                </div>
            </div>

            {/* List of Verifications */}
            {loading ? (
                <div className="p-12 text-center bg-white rounded-[32px] border border-slate-100">
                    <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
                    <p className="font-bold text-slate-600 text-sm">Cargando solicitudes de verificación...</p>
                </div>
            ) : filteredList.length === 0 ? (
                <div className="p-16 text-center bg-white rounded-[32px] border border-slate-100 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                        <Store className="w-8 h-8" />
                    </div>
                    <h3 className="font-black text-slate-800 text-lg">No hay registros en esta sección</h3>
                    <p className="text-slate-400 text-xs font-medium max-w-sm mx-auto">
                        No se encontraron negocios con el estado seleccionado o los términos de búsqueda actuales.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredList.map((item) => {
                        const status = item.verification_status || (item.is_verified || item.isVerified ? 'verified' : 'unverified');
                        const isVisible = item.is_visible ?? item.isVisible ?? false;
                        const vData = item.verification_data || {};
                        const rifPhoto = vData.rifPhotoUrl || vData.rif_photo_url || item.rif_photo_url || (item as any).rif_image_url;
                        const instagramHandle = item.instagram || vData.instagram;
                        const tiktokHandle = item.tiktok || vData.tiktok;
                        const addressRef = item.address_reference || vData.addressReference || vData.address_reference;
                        const fullAddress = item.location?.address || vData.address || 'Dirección no especificada';
                        const requiresDelivery = vData.requiresDelivery ?? (item as any).own_delivery ?? false;

                        return (
                            <div
                                key={item.id}
                                className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all space-y-5"
                            >
                                {/* Top row: Logo, Name, RIF, Status Badge & Visibility Switch */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                                    <div className="flex items-start gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                            {item.logo_url || item.image ? (
                                                <img
                                                    src={item.logo_url || item.image}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Store className="w-7 h-7 text-slate-300" />
                                            )}
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-black text-slate-900 text-lg leading-snug">
                                                    {item.name || 'Negocio Sin Nombre'}
                                                </h3>
                                                {status === 'verified' && (
                                                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                                                        <CheckCircle2 className="w-3 h-3" /> VERIFICADO
                                                    </span>
                                                )}
                                                {status === 'pending' && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full animate-pulse">
                                                        <Clock className="w-3 h-3" /> SOLICITUD PENDIENTE
                                                    </span>
                                                )}
                                                {status === 'rejected' && (
                                                    <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                                                        <XCircle className="w-3 h-3" /> RECHAZADO
                                                    </span>
                                                )}
                                                {status === 'unverified' && (
                                                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                                                        SIN SOLICITAR
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                                                <span className="bg-slate-100 px-2 py-0.5 rounded-lg text-slate-700">
                                                    RIF: {item.rif || 'No registrado'}
                                                </span>
                                                {item.email && <span>{item.email}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Visibility Control & Actions */}
                                    <div className="flex items-center gap-3 self-end md:self-center">
                                        <button
                                            onClick={(e) => handleToggleVisibility(item, e)}
                                            title="Alternar visibilidad de la tienda en la aplicación"
                                            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-black border transition-all cursor-pointer ${isVisible
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                            }`}
                                        >
                                            {isVisible ? (
                                                <>
                                                    <ToggleRight className="w-5 h-5 text-emerald-600" />
                                                    <span>Tienda Visible</span>
                                                </>
                                            ) : (
                                                <>
                                                    <ToggleLeft className="w-5 h-5 text-slate-400" />
                                                    <span>Tienda Oculta</span>
                                                </>
                                            )}
                                        </button>

                                        {status !== 'verified' && (
                                            <button
                                                onClick={() => setApprovingItem(item)}
                                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-2xl shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span>Aprobar</span>
                                            </button>
                                        )}

                                        {status !== 'rejected' && (
                                            <button
                                                onClick={() => {
                                                    setRejectingItem(item);
                                                    setRejectionReason('');
                                                }}
                                                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs rounded-2xl border border-rose-200 flex items-center gap-1.5 transition-all cursor-pointer"
                                            >
                                                <XCircle className="w-4 h-4" />
                                                <span>Rechazar</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Rejection Notice if applicable */}
                                {status === 'rejected' && item.rejection_reason && (
                                    <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-start gap-3 text-rose-800 text-xs font-bold">
                                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-black">Motivo del Rechazo:</p>
                                            <p className="mt-0.5">{item.rejection_reason}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Main Audit Grid: RIF, Address & Reference, Socials, Delivery */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    {/* 1. Comprobante de RIF */}
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                        <div className="flex items-center justify-between text-xs font-black text-slate-700">
                                            <span className="flex items-center gap-1.5">
                                                <ShieldAlert className="w-4 h-4 text-amber-500" />
                                                Comprobante de RIF
                                            </span>
                                            {rifPhoto && (
                                                <button
                                                    onClick={() => setSelectedRifImage({ url: rifPhoto, businessName: item.name })}
                                                    className="text-amber-600 hover:text-amber-700 flex items-center gap-1 text-[11px] cursor-pointer"
                                                >
                                                    <ZoomIn className="w-3 h-3" /> Ampliar
                                                </button>
                                            )}
                                        </div>

                                        {rifPhoto ? (
                                            <div
                                                onClick={() => setSelectedRifImage({ url: rifPhoto, businessName: item.name })}
                                                className="relative h-32 rounded-xl overflow-hidden border border-slate-200 group cursor-pointer bg-white"
                                            >
                                                <img
                                                    src={rifPhoto}
                                                    alt={`RIF ${item.name}`}
                                                    className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                                                />
                                                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs gap-1">
                                                    <Eye className="w-4 h-4" /> Inspeccionar RIF
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-32 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 text-xs font-bold gap-1 bg-white">
                                                <AlertCircle className="w-5 h-5 text-slate-300" />
                                                <span>Sin foto de RIF adjunta</span>
                                            </div>
                                        )}

                                        <p className="text-[11px] font-bold text-slate-500 text-center">
                                            RIF Registrado: <span className="text-slate-800 font-black">{item.rif || 'N/A'}</span>
                                        </p>
                                    </div>

                                    {/* 2. Dirección física y Referencia Visual */}
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                        <div className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                            <MapPin className="w-4 h-4 text-primary" />
                                            Dirección y Punto de Referencia
                                        </div>

                                        <div className="space-y-2 text-xs">
                                            <div>
                                                <span className="font-bold text-slate-400 uppercase text-[10px]">Dirección:</span>
                                                <p className="font-bold text-slate-800 leading-snug">{fullAddress}</p>
                                            </div>

                                            {/* Referencia Destacada */}
                                            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl space-y-1">
                                                <span className="font-black text-amber-800 uppercase text-[10px] flex items-center gap-1">
                                                    <Store className="w-3 h-3" /> Punto de Referencia Visual:
                                                </span>
                                                <p className="font-black text-slate-900 leading-snug">
                                                    {addressRef || 'No indicó punto de referencia'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Redes Sociales, WhatsApp & Logística */}
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                        <div className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                            <MessageCircle className="w-4 h-4 text-emerald-500" />
                                            Contacto y Canales
                                        </div>

                                        <div className="space-y-2 text-xs font-bold">
                                            {/* Instagram */}
                                            <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200">
                                                <span className="flex items-center gap-1.5 text-slate-600">
                                                    <Instagram className="w-3.5 h-3.5 text-pink-500" /> Instagram:
                                                </span>
                                                {instagramHandle ? (
                                                    <a
                                                        href={instagramHandle.startsWith('http') ? instagramHandle : `https://instagram.com/${instagramHandle.replace('@', '')}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-primary hover:underline flex items-center gap-1 font-black text-slate-800"
                                                    >
                                                        <span>{instagramHandle}</span>
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-400 font-medium">No configurado</span>
                                                )}
                                            </div>

                                            {/* TikTok */}
                                            <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200">
                                                <span className="flex items-center gap-1.5 text-slate-600">
                                                    <span className="text-xs font-black">🎵</span> TikTok:
                                                </span>
                                                {tiktokHandle ? (
                                                    <a
                                                        href={tiktokHandle.startsWith('http') ? tiktokHandle : `https://tiktok.com/@${tiktokHandle.replace('@', '')}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-primary hover:underline flex items-center gap-1 font-black text-slate-800"
                                                    >
                                                        <span>{tiktokHandle}</span>
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-400 font-medium">Opcional / Vacío</span>
                                                )}
                                            </div>

                                            {/* WhatsApp */}
                                            <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200">
                                                <span className="flex items-center gap-1.5 text-slate-600">
                                                    <Phone className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp:
                                                </span>
                                                {item.whatsapp ? (
                                                    <a
                                                        href={`https://wa.me/${item.whatsapp.replace(/\D/g, '')}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-emerald-600 font-black hover:underline flex items-center gap-1"
                                                    >
                                                        <span>{item.whatsapp}</span>
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                ) : (
                                                    <span className="text-slate-400 font-medium">Sin número</span>
                                                )}
                                            </div>

                                            {/* Delivery requirement */}
                                            <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200">
                                                <span className="flex items-center gap-1.5 text-slate-600">
                                                    <Truck className="w-3.5 h-3.5 text-amber-500" /> ¿Requiere Delivery?:
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black ${requiresDelivery ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                                                    {requiresDelivery ? 'SÍ, ACTIVO' : 'NO (SOLO LOCAL)'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal: Full-Screen RIF Inspection */}
            {selectedRifImage && (
                <div
                    className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedRifImage(null)}
                >
                    <div
                        className="bg-white rounded-[32px] p-6 max-w-3xl w-full max-h-[90vh] flex flex-col gap-4 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b pb-4">
                            <div>
                                <h3 className="font-black text-slate-900 text-lg">
                                    Comprobante de RIF SENIAT
                                </h3>
                                <p className="text-xs text-slate-500 font-bold">
                                    {selectedRifImage.businessName}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={selectedRifImage.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    download
                                    className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>Abrir Original</span>
                                </a>
                                <button
                                    onClick={() => setSelectedRifImage(null)}
                                    className="p-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto rounded-2xl bg-slate-100 p-2 flex items-center justify-center">
                            <img
                                src={selectedRifImage.url}
                                alt="Comprobante RIF"
                                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-sm"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Approve Verification */}
            {approvingItem && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[32px] p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                            <ShieldCheck className="w-7 h-7" />
                        </div>

                        <div className="text-center space-y-1">
                            <h3 className="font-black text-slate-900 text-xl">¿Aprobar Verificación?</h3>
                            <p className="text-xs text-slate-500 font-medium">
                                Estás a punto de verificar oficialmente a <span className="font-bold text-slate-800">"{approvingItem.name}"</span> con RIF <span className="font-bold text-slate-800">{approvingItem.rif}</span>.
                            </p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-xs text-amber-900 space-y-1">
                            <p className="font-black flex items-center gap-1">
                                <AlertCircle className="w-4 h-4 text-amber-600" />
                                Consecuencias de la Aprobación:
                            </p>
                            <ul className="list-disc list-inside space-y-0.5 text-[11px] font-bold text-amber-800">
                                <li>El comercio obtendrá el estado de <strong>Verificado</strong>.</li>
                                <li>Se activará el switch de visibilidad para que aparezca en la app de clientes.</li>
                                <li>El <strong>RIF</strong> y el <strong>Nombre de la Tienda</strong> quedarán bloqueados contra edición en su panel.</li>
                            </ul>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <button
                                onClick={() => setApprovingItem(null)}
                                disabled={isSubmittingApprove}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleApprove}
                                disabled={isSubmittingApprove}
                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-2xl text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                            >
                                {isSubmittingApprove ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                <span>Aprobar y Activar</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Reject Verification */}
            {rejectingItem && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[32px] p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in zoom-in-95">
                        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                            <XCircle className="w-7 h-7" />
                        </div>

                        <div className="text-center space-y-1">
                            <h3 className="font-black text-slate-900 text-xl">Rechazar Solicitud de Verificación</h3>
                            <p className="text-xs text-slate-500 font-medium">
                                Indica el motivo del rechazo para que el comercio <span className="font-bold text-slate-800">"{rejectingItem.name}"</span> pueda corregir sus datos.
                            </p>
                        </div>

                        {/* Quick Selection templates */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-400 uppercase">Motivos frecuentes:</label>
                            <div className="space-y-1">
                                {REJECTION_TEMPLATES.map((tmpl, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setRejectionReason(tmpl)}
                                        className="w-full text-left p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200/60 transition-colors cursor-pointer"
                                    >
                                        • {tmpl}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-400 uppercase">Motivo detallado a enviar:</label>
                            <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                rows={3}
                                placeholder="Escribe aquí la razón del rechazo..."
                                className="w-full bg-slate-50 border border-slate-200 p-3 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-rose-500 focus:bg-white transition-all resize-none"
                            />
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <button
                                onClick={() => {
                                    setRejectingItem(null);
                                    setRejectionReason('');
                                }}
                                disabled={isSubmittingReject}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={isSubmittingReject || !rejectionReason.trim()}
                                className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-black rounded-2xl text-xs shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                            >
                                {isSubmittingReject ? <RefreshCw className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                <span>Confirmar Rechazo</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
