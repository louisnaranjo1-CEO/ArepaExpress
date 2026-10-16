import React, { useState, useEffect } from 'react';
import { Gift, Share2, ChevronRight, Award, Copy, CheckCircle, Globe, X, Sparkles, Star, Tag, Store, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface GlobalPrize {
    id: string;
    title: string;
    description: string;
    pointsRequired: number;
    imageUrl?: string;
    isActive: boolean;
}

interface RestaurantReward {
    id: string;
    title: string;
    description: string;
    pointsCost: number;
    imageUrl?: string;
    restaurantName?: string;
    restaurantLogo?: string;
}

export default function Rewards() {
    const { user, userData } = useAuth();
    const { branding } = useBranding();
    const navigate = useNavigate();
    const location = useLocation();
    const [copied, setCopied] = useState(false);
    const [contests, setContests] = useState<any[]>([]);
    const [globalPrizes, setGlobalPrizes] = useState<GlobalPrize[]>([]);
    const [restaurantRewards, setRestaurantRewards] = useState<RestaurantReward[]>([]);
    const [activeTab, setActiveTab] = useState<'catalog' | 'referrals'>('catalog');
    const [catalogFilter, setCatalogFilter] = useState<'all' | 'global' | 'restaurants'>('all');
    const [loading, setLoading] = useState(true);
    const [globalBanners, setGlobalBanners] = useState<any[]>([]);
    const [activeBanner, setActiveBanner] = useState<any>(null);
    const [showBannerModal, setShowBannerModal] = useState(false);
    const [selectedPrizeToRedeem, setSelectedPrizeToRedeem] = useState<any | null>(null);

    const userPoints = userData?.points || 0;
    const totalReferrals = (userData as any)?.total_referrals || 0;
    const referralCode = (userData as any)?.referralCode || (userData as any)?.referral_code || user?.id?.substring(0, 6).toUpperCase() || 'INVITADELI';
    const userState = localStorage.getItem('userState') || (userData as any)?.state || '';
    const userCity = localStorage.getItem('userCity') || (userData as any)?.city || '';

    const isItemInUserZone = (item: any) => {
        const scope = item.scope || 'national';
        if (scope === 'national') return true;
        if (!userState && !userCity) return true;

        if (scope === 'regional') {
            const targetState = (item.target_state || item.targetState || item.location_name || item.locationName || '').toLowerCase().trim();
            if (!targetState) return true;
            return userState.toLowerCase().includes(targetState) || targetState.includes(userState.toLowerCase());
        }

        if (scope === 'local') {
            const targetCity = (item.target_city || item.targetCity || '').toLowerCase().trim();
            const targetState = (item.target_state || item.targetState || '').toLowerCase().trim();
            const locName = (item.location_name || item.locationName || '').toLowerCase().trim();

            if (targetCity && userCity) {
                if (userCity.toLowerCase().includes(targetCity) || targetCity.includes(userCity.toLowerCase())) {
                    return true;
                }
            }
            if (locName && userCity && locName.includes(userCity.toLowerCase())) {
                return true;
            }
            if (targetState && userState && !targetCity) {
                return userState.toLowerCase().includes(targetState) || targetState.includes(userState.toLowerCase());
            }
            return false;
        }

        return true;
    };

    const [shareConfig, setShareConfig] = useState({
        message: `¡Usa ${branding.app_client_name || 'Un 2x3'} y gana recompensas directas!`,
        url: window.location.origin
    });

    useEffect(() => {
        setShareConfig(prev => ({
            ...prev,
            message: `¡Usa ${branding.app_client_name || 'Un 2x3'} y gana recompensas directas!`
        }));
    }, [branding.app_client_name]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Fetch active referral contests (retos y metas de invitación)
                const { data: contestsData } = await supabase
                    .from('referral_contests')
                    .select('*')
                    .eq('is_active', true);
                setContests(contestsData || []);

                // 2. Fetch global prizes (catálogo de premios directos)
                const { data: prizesData } = await supabase
                    .from('global_prizes')
                    .select('*')
                    .eq('is_active', true);
                
                const mappedGlobalPrizes: GlobalPrize[] = (prizesData || []).map((p: any) => ({
                    id: p.id,
                    title: p.title,
                    description: p.description,
                    pointsRequired: Number(p.points_required ?? p.pointsRequired ?? 0),
                    imageUrl: p.image_url || p.imageUrl,
                    isActive: p.is_active ?? p.isActive ?? true
                }));
                mappedGlobalPrizes.sort((a, b) => a.pointsRequired - b.pointsRequired);
                setGlobalPrizes(mappedGlobalPrizes);

                // 3. Fetch restaurant rewards (cupones y premios de comercios aliados)
                try {
                    const { data: restRewardsData } = await supabase
                        .from('restaurant_rewards')
                        .select('*, comercios(name, logo_url)')
                        .eq('is_active', true);

                    const mappedRestRewards: RestaurantReward[] = (restRewardsData || []).map((r: any) => ({
                        id: r.id,
                        title: r.title,
                        description: r.description,
                        pointsCost: Number(r.points_cost ?? r.pointsCost ?? 0),
                        imageUrl: r.image_url || r.imageUrl,
                        restaurantName: r.comercios?.name,
                        restaurantLogo: r.comercios?.logo_url
                    }));
                    setRestaurantRewards(mappedRestRewards);
                } catch (e) {
                    console.warn("Could not fetch restaurant rewards:", e);
                }

                // 4. Fetch share config ('share_config' prioritario, con fallback a 'fidelization')
                let configData: any = null;
                const { data: shareData } = await supabase
                    .from('system_configs')
                    .select('*')
                    .eq('id', 'share_config')
                    .maybeSingle();

                if (shareData) {
                    configData = shareData;
                } else {
                    const { data: fidData } = await supabase
                        .from('system_configs')
                        .select('*')
                        .eq('id', 'fidelization')
                        .maybeSingle();
                    configData = fidData;
                }

                if (configData) {
                    const fetchedMessage = configData.share_message || configData.sharemessage || configData.shareMessage || configData.data?.share_message || configData.data?.shareMessage;
                    const fetchedUrl = configData.share_url || configData.shareurl || configData.shareUrl || configData.data?.share_url || configData.data?.shareUrl;
                    setShareConfig(prev => ({
                        message: fetchedMessage || prev.message,
                        url: fetchedUrl || prev.url
                    }));
                }

                // 5. Fetch global banners
                const { data: bannersData } = await supabase
                    .from('banners')
                    .select('*')
                    .eq('type', 'fidelization')
                    .eq('is_active', true);

                setGlobalBanners(bannersData || []);
            } catch (error) {
                console.error("Error fetching rewards data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    useEffect(() => {
        if (globalBanners.length > 0) {
            const params = new URLSearchParams(location.search);
            const openBannerId = params.get('openBannerId');
            if (openBannerId) {
                const b = globalBanners.find(x => x.id === openBannerId);
                if (b) {
                    setActiveBanner(b);
                    setShowBannerModal(true);
                }
            } else if (params.get('openBanner') === 'true') {
                setActiveBanner(globalBanners[0]);
                setShowBannerModal(true);
            }
        }
    }, [globalBanners, location.search]);

    const handleCopyCode = () => {
        navigator.clipboard.writeText(referralCode);
        setCopied(true);
        toast.success("¡Código de invitación copiado!");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShare = async () => {
        const appName = branding.app_client_name || 'Un 2x3';
        const baseUrl = (shareConfig.url || window.location.origin).replace(/\/$/, '');
        const targetUrl = `${baseUrl}/auth?ref=${referralCode}`;
        const baseMsg = shareConfig.message || `¡Únete a ${appName} y disfruta del mejor delivery!`;
        const fullMessage = `${baseMsg}\n\nCódigo de invitación: ${referralCode}\n${targetUrl}`;

        // 1. Intentar disparo real de compartir mediante navigator.share (Web Share API nativa)
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({
                    title: appName,
                    text: fullMessage,
                    url: targetUrl
                });
                return;
            } catch (err: any) {
                // Si el usuario canceló el diálogo nativo (AbortError), no forzamos redirección
                if (err?.name === 'AbortError') return;
                console.warn('navigator.share no pudo completarse o fue cancelado, usando fallback:', err);
            }
        }

        // 2. Fallback para Android WebView / Navegadores de escritorio sin Web Share:
        // Copiar al portapapeles y abrir WhatsApp
        try {
            await navigator.clipboard.writeText(fullMessage);
            toast.success("¡Enlace y código de invitación copiados al portapapeles!", { icon: '📋' });
        } catch (e) {
            handleCopyCode();
        }

        const waUrl = `https://wa.me/?text=${encodeURIComponent(fullMessage)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
    };

    const handleRedeemClick = (prize: any) => {
        setSelectedPrizeToRedeem(prize);
    };

    const confirmRedeem = () => {
        toast.success(`¡Solicitud enviada! Nuestro equipo te contactará para hacerte entrega de tu premio.`);
        setSelectedPrizeToRedeem(null);
    };

    // Filter prizes for display
    const visibleGlobalPrizes = globalPrizes.filter(isItemInUserZone);
    const visibleContests = contests.filter(isItemInUserZone);

    return (
        <div className="h-full overflow-y-auto overflow-x-hidden bg-slate-50 pb-36">
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 px-6 pt-12 pb-10 rounded-b-[2.5rem] relative overflow-hidden shadow-2xl flex-shrink-0">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/20 rounded-full blur-2xl -ml-10 -mb-10"></div>

                <div className="relative z-10 flex items-center justify-between mb-6">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white cursor-pointer active:scale-95 transition-all">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <h1 className="text-xl font-black text-white tracking-tight">Retos y Recompensas</h1>
                    <div className="w-10"></div>
                </div>

                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-gradient-to-tr from-amber-400 to-yellow-500 rounded-full p-1 mb-4 shadow-lg shadow-amber-500/30">
                        <div className="w-full h-full bg-slate-950 rounded-full flex items-center justify-center border-4 border-indigo-900">
                            <Award className="w-9 h-9 text-amber-400" />
                        </div>
                    </div>
                    <p className="text-amber-300 font-bold uppercase tracking-widest text-[10px] mb-1">Mis Puntos Acumulados</p>
                    <h2 className="text-5xl font-black text-white drop-shadow-sm flex items-center gap-2">
                        {Math.floor(userPoints).toLocaleString()}
                        <span className="text-2xl text-amber-400 font-bold">pts</span>
                    </h2>
                    <p className="text-xs text-indigo-200 mt-2.5 max-w-xs leading-relaxed font-medium">
                        Ganas puntos automáticamente por cada compra completada en comercios y cada viaje en Movilidad. ¡Canje directo garantizado!
                    </p>
                </div>
            </div>

            <div className="px-6 -mt-6 relative z-20 space-y-6">

                {/* Subnav Tabs */}
                <div className="bg-white rounded-2xl p-1.5 shadow-lg border border-slate-100 flex gap-1">
                    <button
                        onClick={() => setActiveTab('catalog')}
                        className={`flex-1 py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 ${
                            activeTab === 'catalog'
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <Gift className="w-4 h-4 text-amber-400" />
                        <span>Catálogo de Canje</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('referrals')}
                        className={`flex-1 py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 ${
                            activeTab === 'referrals'
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <Share2 className="w-4 h-4 text-emerald-400" />
                        <span>Retos & Referidos</span>
                    </button>
                </div>

                {/* Global Loyalty Banners */}
                {globalBanners.map(banner => (
                    <div key={banner.id} onClick={() => { setActiveBanner(banner); setShowBannerModal(true); }} className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-[2rem] p-6 shadow-xl relative overflow-hidden cursor-pointer group animate-in slide-in-from-bottom-6 duration-500">
                        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                        <div className="relative z-10 flex items-center justify-between gap-4">
                            <div className="flex-1">
                                <span className="bg-white/20 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-sm inline-flex items-center gap-1.5 mb-2">
                                    <Sparkles className="w-3 h-3" /> Metas y Premios
                                </span>
                                <h3 className="text-xl font-black text-white leading-tight drop-shadow-sm">{banner.title}</h3>
                                <p className="text-white/90 text-xs font-bold mt-2 flex items-center gap-1">
                                    Ver cómo reclamar <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </p>
                            </div>
                            <div className="w-16 h-16 shrink-0 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-lg group-hover:scale-105 transition-transform">
                                <Award className="w-8 h-8 text-white drop-shadow-md" />
                            </div>
                        </div>
                    </div>
                ))}

                {/* TAB 1: CATÁLOGO DE CANJE DIRECTO */}
                {activeTab === 'catalog' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-800">Catálogo de Canje Directo</h3>
                                <p className="text-xs text-slate-500 font-medium">Reclama premios tangibles y cupones al alcanzar los puntos</p>
                            </div>
                        </div>

                        {/* Filter pills */}
                        <div className="flex gap-2 pb-1 overflow-x-auto no-scrollbar">
                            <button
                                onClick={() => setCatalogFilter('all')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                    catalogFilter === 'all'
                                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                                        : 'bg-white text-slate-600 border border-slate-200'
                                }`}
                            >
                                Todos
                            </button>
                            <button
                                onClick={() => setCatalogFilter('global')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    catalogFilter === 'global'
                                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                                        : 'bg-white text-slate-600 border border-slate-200'
                                }`}
                            >
                                <Gift className="w-3.5 h-3.5" /> Premios Globales
                            </button>
                            <button
                                onClick={() => setCatalogFilter('restaurants')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    catalogFilter === 'restaurants'
                                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                                        : 'bg-white text-slate-600 border border-slate-200'
                                }`}
                            >
                                <Store className="w-3.5 h-3.5" /> Comercios Aliados
                            </button>
                        </div>

                        {/* Items Grid */}
                        <div className="space-y-4">
                            {/* Global prizes */}
                            {(catalogFilter === 'all' || catalogFilter === 'global') && visibleGlobalPrizes.map((prize) => {
                                const pointsNeeded = prize.pointsRequired || 1;
                                const progressPercent = Math.min(100, Math.round((userPoints / pointsNeeded) * 100));
                                const canRedeem = userPoints >= pointsNeeded;
                                const missingPoints = Math.max(0, pointsNeeded - userPoints);

                                return (
                                    <div key={`global-${prize.id}`} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-all">
                                        <div className="flex gap-4 items-start">
                                            <div className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                                {prize.imageUrl ? (
                                                    <img src={prize.imageUrl} alt={prize.title} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-amber-500 bg-amber-50">
                                                        <Gift className="w-8 h-8" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[9px] font-black uppercase">
                                                        Premio Oficial
                                                    </span>
                                                </div>
                                                <h4 className="font-black text-slate-900 text-base leading-tight truncate">{prize.title}</h4>
                                                <p className="text-xs text-slate-500 font-medium line-clamp-2 mt-1">{prize.description}</p>
                                                
                                                <div className="flex items-center gap-1.5 mt-2">
                                                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                                    <span className="font-black text-slate-900 text-sm">{pointsNeeded.toLocaleString()} pts requeridos</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Progress Bar & Status */}
                                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                                            <div className="flex justify-between items-center text-xs font-bold">
                                                <span className={canRedeem ? 'text-emerald-600 font-black' : 'text-slate-500'}>
                                                    {canRedeem ? '¡Meta alcanzada! Tienes suficientes puntos' : `Te faltan ${missingPoints.toLocaleString()} puntos para canjear este premio`}
                                                </span>
                                                <span className="text-slate-700 font-mono text-[11px]">{progressPercent}%</span>
                                            </div>
                                            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-700 ${canRedeem ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-400 to-yellow-500'}`}
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>

                                            <button
                                                onClick={() => handleRedeemClick(prize)}
                                                disabled={!canRedeem}
                                                className={`w-full mt-2 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                                    canRedeem
                                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 cursor-pointer'
                                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                }`}
                                            >
                                                {canRedeem ? (
                                                    <>
                                                        <CheckCircle className="w-4 h-4" /> Reclamar Premio Directo
                                                    </>
                                                ) : (
                                                    `Faltan ${missingPoints.toLocaleString()} pts`
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Restaurant rewards */}
                            {(catalogFilter === 'all' || catalogFilter === 'restaurants') && restaurantRewards.map((reward) => {
                                const pointsNeeded = reward.pointsCost || 1;
                                const progressPercent = Math.min(100, Math.round((userPoints / pointsNeeded) * 100));
                                const canRedeem = userPoints >= pointsNeeded;
                                const missingPoints = Math.max(0, pointsNeeded - userPoints);

                                return (
                                    <div key={`rest-${reward.id}`} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-all">
                                        <div className="flex gap-4 items-start">
                                            <div className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                                {reward.imageUrl ? (
                                                    <img src={reward.imageUrl} alt={reward.title} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-orange-500 bg-orange-50">
                                                        <Store className="w-8 h-8" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-md text-[9px] font-black uppercase">
                                                        {reward.restaurantName || 'Comercio Aliado'}
                                                    </span>
                                                </div>
                                                <h4 className="font-black text-slate-900 text-base leading-tight truncate">{reward.title}</h4>
                                                <p className="text-xs text-slate-500 font-medium line-clamp-2 mt-1">{reward.description}</p>
                                                
                                                <div className="flex items-center gap-1.5 mt-2">
                                                    <Tag className="w-4 h-4 text-orange-500" />
                                                    <span className="font-black text-slate-900 text-sm">{pointsNeeded.toLocaleString()} pts</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Progress Bar & Status */}
                                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                                            <div className="flex justify-between items-center text-xs font-bold">
                                                <span className={canRedeem ? 'text-emerald-600 font-black' : 'text-slate-500'}>
                                                    {canRedeem ? '¡Listo para canjear!' : `Te faltan ${missingPoints.toLocaleString()} puntos`}
                                                </span>
                                                <span className="text-slate-700 font-mono text-[11px]">{progressPercent}%</span>
                                            </div>
                                            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-700 ${canRedeem ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-400 to-amber-500'}`}
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>

                                            <button
                                                onClick={() => handleRedeemClick(reward)}
                                                disabled={!canRedeem}
                                                className={`w-full mt-2 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                                    canRedeem
                                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 cursor-pointer'
                                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                }`}
                                            >
                                                {canRedeem ? (
                                                    <>
                                                        <CheckCircle className="w-4 h-4" /> Canjear en Comercio
                                                    </>
                                                ) : (
                                                    `Faltan ${missingPoints.toLocaleString()} pts`
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            {visibleGlobalPrizes.length === 0 && restaurantRewards.length === 0 && (
                                <div className="text-center py-12 px-4 bg-white rounded-3xl border border-slate-100 space-y-3">
                                    <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
                                        <Award className="w-8 h-8" />
                                    </div>
                                    <h4 className="font-black text-slate-800 text-base">Próximas metas y premios directos</h4>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                                        Sigue acumulando puntos con cada pedido y carrera en {branding.app_client_name || 'Un 2x3'}. Muy pronto habilitaremos nuevos premios directos en tu zona.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 2: RETOS & REFERIDOS */}
                {activeTab === 'referrals' && (
                    <div className="space-y-6">
                        {/* Referral Code Box */}
                        <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                                    <Share2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg">Retos y Ranking de Invitación</h3>
                                    <p className="text-xs text-slate-500 font-bold">Gana recompensas alcanzando metas de amigos invitados</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 mb-4 text-center">
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5">Tu Código de Invitación Único</p>
                                <div className="text-3xl font-black text-slate-900 tracking-widest mb-4 font-mono">
                                    {referralCode}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={handleCopyCode} className="flex-1 bg-white text-slate-700 font-bold py-3 rounded-xl shadow-sm border border-slate-200 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs">
                                        {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                        {copied ? 'Copiado' : 'Copiar Código'}
                                    </button>
                                    <button onClick={handleShare} className="flex-1 bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all text-xs">
                                        <Share2 className="w-4 h-4" />
                                        Compartir Enlace
                                    </button>
                                </div>
                            </div>

                            {/* Referrals Count Summary */}
                            <div className="flex items-center justify-between p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
                                <span className="text-xs font-bold text-emerald-900">Total de Amigos Invitados:</span>
                                <span className="text-sm font-black text-emerald-700 bg-white px-3 py-1 rounded-lg border border-emerald-200 font-mono">
                                    {totalReferrals}
                                </span>
                            </div>
                        </div>

                        {/* Active Referral Challenges */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider px-1">Metas de Amigos Desbloqueables</h4>

                            {visibleContests.length > 0 ? (
                                visibleContests.map((contest) => {
                                    const targetCount = contest.target_count || contest.targetCount || 5;
                                    const progress = Math.min(100, Math.round((totalReferrals / targetCount) * 100));
                                    const isCompleted = totalReferrals >= targetCount;

                                    return (
                                        <div key={contest.id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                                                        Meta: {targetCount} Amigos
                                                    </span>
                                                    <h5 className="font-black text-slate-900 text-base mt-1">{contest.title}</h5>
                                                    <p className="text-xs text-slate-500 font-medium">{contest.description}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="text-xs font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 block">
                                                        {contest.prize}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                                                    <span>Progreso: {totalReferrals} / {targetCount}</span>
                                                    <span>{progress}%</span>
                                                </div>
                                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {isCompleted ? (
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                                                    <CheckCircle className="w-4 h-4" />
                                                    <span>¡Meta alcanzada! Recompensa activada en tu perfil.</span>
                                                </div>
                                            ) : (
                                                <p className="text-[11px] text-slate-400 font-medium">
                                                    Invita a {Math.max(0, targetCount - totalReferrals)} amigos más para desbloquear automáticamente este premio.
                                                </p>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="bg-white rounded-3xl p-6 border border-slate-100 text-center space-y-2">
                                    <p className="text-xs text-slate-500 font-medium">
                                        Comparte tu código con tus familiares y amigos. Por cada amigo que se registre acumularás puntos de recompensa en tu saldo global.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* Modal de Confirmación de Canje */}
            {selectedPrizeToRedeem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border border-slate-100 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                            <Gift className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 leading-tight">¿Canjear {selectedPrizeToRedeem.title}?</h3>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                            Se utilizarán tus puntos acumulados para reclamar esta recompensa directa.
                        </p>
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setSelectedPrizeToRedeem(null)}
                                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmRedeem}
                                className="flex-1 py-3 bg-emerald-500 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                            >
                                Confirmar Canje
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Banner Modal */}
            {showBannerModal && activeBanner && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center p-4 sm:p-6 animate-in fade-in duration-300">
                    <div className="bg-slate-50 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10 sm:zoom-in duration-500 border border-white/10">
                        <div className="relative pt-12 pb-8 px-8 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 flex flex-col justify-end overflow-hidden shrink-0">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                            <button onClick={() => { setShowBannerModal(false); setActiveBanner(null); }} className="absolute top-4 right-4 w-10 h-10 bg-black/10 hover:bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all z-20">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="relative z-10">
                                <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30 shadow-lg mb-4">
                                    <Gift className="w-8 h-8 text-white drop-shadow-lg" />
                                </div>
                                <h2 className="text-3xl font-black text-white italic leading-tight drop-shadow-sm">{activeBanner.title}</h2>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 no-scrollbar space-y-6">
                            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-16 -mt-16"></div>
                                <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10"><Globe className="w-4 h-4" /> ¿Cómo funciona?</h3>
                                <p className="text-slate-600 font-medium text-sm leading-relaxed whitespace-pre-wrap relative z-10">{activeBanner.explanation}</p>
                            </div>

                            {activeBanner.prizes && activeBanner.prizes.length > 0 && (
                                <div>
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 px-2"><Gift className="w-4 h-4" /> Recompensas Disponibles</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {activeBanner.prizes.map((prize: any) => (
                                            <div key={prize.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all group flex flex-col">
                                                <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-inner bg-slate-50 mb-4 group-hover:scale-[1.02] transition-transform">
                                                    <img src={prize.image_url || prize.imageUrl} alt={prize.title} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1 flex flex-col justify-between">
                                                    <h4 className="font-black text-slate-800 text-base leading-tight mb-2">{prize.title}</h4>
                                                    <div className="flex items-center gap-1.5 mt-auto">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Recompensa Directa</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-white border-t border-slate-50 shrink-0">
                            <button onClick={() => { setShowBannerModal(false); setActiveBanner(null); }} className="w-full bg-slate-900 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl shadow-xl shadow-slate-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                ¡Entendido! <CheckCircle className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
