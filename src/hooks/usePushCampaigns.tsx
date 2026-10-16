import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getCachedAudioUrl, NOTIFICATION_SOUND_URL } from './useGlobalAudioAlerts';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import React from 'react';
import { X, ExternalLink } from 'lucide-react';

export function usePushCampaigns(userData: any, userId: string | undefined) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const seenCampaigns = useRef<Set<string>>(new Set());
    const navigate = useNavigate();

    useEffect(() => {
        const initAudio = async () => {
            const url = await getCachedAudioUrl(NOTIFICATION_SOUND_URL, 'delivery-sound');
            audioRef.current = new Audio(url);
            audioRef.current.preload = 'auto';
        };
        initAudio();

        try {
            const stored = localStorage.getItem('seen_campaigns');
            if (stored) {
                seenCampaigns.current = new Set(JSON.parse(stored));
            }
        } catch(e) {}
    }, []);

    useEffect(() => {
        if (!userData || !userId) return;

        const processCampaigns = (campaigns: any[]) => {
            campaigns.forEach(data => {
                const cid = data.id;
                if (!seenCampaigns.current.has(cid)) {
                    const now = Date.now();
                    const actTime = data.activated_at || data.activatedAt ? new Date(data.activated_at || data.activatedAt).getTime() : 0;
                    if (actTime && (now - actTime > 172800000)) return;

                    if (data.scheduled_at || data.scheduledAt) {
                        const schedTime = new Date(data.scheduled_at || data.scheduledAt).getTime();
                        if (now < schedTime) return;
                    }

                    const isVeryRecent = actTime && (now - actTime < 300000);
                    if (seenCampaigns.current.has(cid) && !isVeryRecent) return;

                    // Filtering
                    if (data.sex && data.sex !== 'all') {
                        const userSex = (userData.sex || '').toLowerCase().trim();
                        if (data.sex === 'male' && userSex !== 'male') return;
                        if (data.sex === 'female' && userSex !== 'female') return;
                    }

                    if (data.min_age || data.max_age || data.minAge || data.maxAge) {
                        try {
                            const birthDateStr = userData.fechaNacimiento || userData.birthDate;
                            if (birthDateStr) {
                                const birthDate = new Date(birthDateStr);
                                const ageDf = new Date(Date.now() - birthDate.getTime());
                                const age = Math.abs(ageDf.getUTCFullYear() - 1970);
                                const minAge = data.min_age ?? data.minAge;
                                const maxAge = data.max_age ?? data.maxAge;
                                if (minAge && age < minAge) return;
                                if (maxAge && age > maxAge) return;
                            }
                        } catch(e) { }
                    }

                    if (data.location && data.location !== 'national') {
                        const userCitiesArr: string[] = [];
                        const userStatesArr: string[] = [];
                        
                        const addLoc = (c?: string, s?: string) => {
                            if (c) userCitiesArr.push(c.toLowerCase().trim());
                            if (s) userStatesArr.push(s.toLowerCase().trim());
                        };

                        addLoc(userData.lastCity, userData.lastState);
                        addLoc(userData.city, userData.state);
                        addLoc(userData.address?.city, userData.address?.state);
                        addLoc(userData.location?.city, userData.location?.state);
                        addLoc(localStorage.getItem('userCity') || undefined, localStorage.getItem('userState') || undefined);
                        
                        if (userData.addresses && Array.isArray(userData.addresses)) {
                            userData.addresses.forEach((a: any) => addLoc(a.city, a.state));
                        }

                        if (data.location === 'city') {
                            const targetedCities = (data.cities || []).map((c: string) => c.toLowerCase().trim());
                            const legacyCity = (data.city || '').toLowerCase().trim();
                            
                            const cityMatches = targetedCities.some((tc: string) => {
                                let cityToMatch = tc;
                                if (tc.includes(': ')) {
                                    cityToMatch = tc.split(': ')[1].toLowerCase().trim();
                                } else {
                                    cityToMatch = tc.toLowerCase().trim();
                                }
                                return userCitiesArr.includes(cityToMatch);
                            });

                            if (!cityMatches && !userCitiesArr.includes(legacyCity)) return;
                        }

                        if (data.location === 'state') {
                            const targetedStates = (data.states || []).map((s: string) => s.toLowerCase().trim());
                            const legacyState = (data.state || '').toLowerCase().trim();

                            const stateMatches = targetedStates.some((ts: string) => userStatesArr.includes(ts));
                            if (!stateMatches && !userStatesArr.includes(legacyState)) return;
                        }
                    }

                    // Trigger toast / popup
                    seenCampaigns.current.add(cid);
                    try {
                        localStorage.setItem('seen_campaigns', JSON.stringify(Array.from(seenCampaigns.current)));
                    } catch(e) {}

                    // Caducar inmediatamente el token/aviso en Supabase para que no vuelva a ejecutarse
                    supabase
                        .from('push_campaigns')
                        .update({
                            status: 'completed',
                            executed_at: new Date().toISOString(),
                            expired_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', cid)
                        .is('executed_at', null)
                        .then(({ error }: any) => {
                            if (error) console.error("Error expiring campaign token:", error);
                        });

                    if (audioRef.current) {
                        audioRef.current.currentTime = 0;
                        audioRef.current.play().catch(()=>{});
                    }

                    const promoProdId = data.promo_product_id || data.promoProductId;
                    const promoPrice = data.promo_price ?? data.promoPrice;
                    const promoSnapshot = data.promo_product_snapshot || data.promoProductSnapshot;

                    const handleClick = async (tId: string) => {
                        toast.dismiss(tId);
                        const restId = data.restaurant_id || data.restaurantId;
                        if (restId) {
                            if (promoProdId) {
                                navigate(`/restaurant/${restId}?promoProductId=${promoProdId}`);
                            } else {
                                navigate(`/restaurant/${restId}`);
                            }
                        }
                        try {
                            const { data: cur } = await supabase.from('push_campaigns').select('clicks').eq('id', cid).maybeSingle();
                            await supabase.from('push_campaigns').update({
                                clicks: (cur?.clicks || 0) + 1
                            }).eq('id', cid);
                        } catch(e){}
                    };

                    const imgUrl = data.image_url || data.imageUrl || data.banner_url || data.bannerUrl;
                    const logoUrl = data.restaurant_logo || data.restaurantLogo;

                    toast.custom((t) => (
                        <div
                          className={`${
                            t.visible ? 'animate-in fade-in zoom-in duration-300' : 'animate-out fade-out zoom-out duration-300'
                          } max-w-sm w-full bg-slate-950/98 backdrop-blur-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] rounded-3xl pointer-events-auto flex flex-col border-2 border-amber-400/40 overflow-hidden relative cursor-pointer group text-white`}
                          onClick={() => handleClick(t.id)}
                        >
                          <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-black pointer-events-none" />
                          
                          <button 
                            onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }} 
                            className="absolute top-3 right-3 bg-black/60 hover:bg-amber-400 text-white hover:text-black rounded-full p-2 z-30 transition-all duration-200 backdrop-blur-md shadow-lg"
                            title="Cerrar"
                          >
                            <X className="w-4 h-4"/>
                          </button>
                          
                          {imgUrl ? (
                              <div className="relative h-44 w-full overflow-hidden">
                                  <img src={imgUrl} alt="Promoción" className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                                  <div className="absolute bottom-3 left-4 flex items-center gap-2">
                                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 shadow-md flex items-center gap-1">
                                          🔥 Alerta Exclusiva
                                      </span>
                                  </div>
                              </div>
                          ) : (
                              <div className="w-full h-3 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)]"></div>
                          )}
                          
                          <div className="p-5 flex flex-col gap-3.5 bg-slate-950 relative z-10">
                             <div className="flex gap-3 items-center">
                                 <div className="w-12 h-12 bg-slate-900 rounded-2xl flex-shrink-0 border border-amber-400/30 overflow-hidden shadow-md flex items-center justify-center p-0.5">
                                     {logoUrl ? (
                                        <img src={logoUrl} className="w-full h-full object-cover rounded-xl"/>
                                     ) : (
                                        <span className="font-black text-amber-400 text-sm">2x3</span>
                                     )}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                     <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 truncate">
                                         {data.restaurant_name || data.restaurantName || 'Comercio Aliado'}
                                     </p>
                                     <h3 className="font-black text-white text-base leading-tight tracking-tight line-clamp-2">
                                         {data.title}
                                     </h3>
                                 </div>
                             </div>

                             <p className="text-xs font-medium text-slate-300 leading-relaxed line-clamp-3">
                                 {data.subtitle}
                             </p>

                             {/* Producto en oferta snapshot */}
                             {(promoSnapshot || promoPrice) && (
                                 <div className="p-3 bg-white/5 border border-amber-400/30 rounded-2xl flex items-center gap-3">
                                     {promoSnapshot?.image_url && (
                                         <img 
                                             src={promoSnapshot.image_url} 
                                             alt="Producto" 
                                             className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" 
                                         />
                                     )}
                                     <div className="flex-1 min-w-0">
                                         <p className="text-xs font-black text-white truncate">
                                             {promoSnapshot?.name || 'Producto en Oferta'}
                                         </p>
                                         <div className="flex items-center gap-2 mt-0.5">
                                             {promoPrice && (
                                                 <span className="text-sm font-black text-amber-400">
                                                     🔥 ${Number(promoPrice).toFixed(2)}
                                                 </span>
                                             )}
                                             {promoSnapshot?.price && Number(promoSnapshot.price) > Number(promoPrice || 0) && (
                                                 <span className="text-[11px] text-slate-400 line-through">
                                                     ${Number(promoSnapshot.price).toFixed(2)}
                                                 </span>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                             )}

                             {/* CTA Botón Grande */}
                             <button
                                 type="button"
                                 onClick={() => handleClick(t.id)}
                                 className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transform active:scale-95 transition-all mt-1"
                             >
                                 <span>🔥 Ir a la Promoción</span>
                                 <ExternalLink className="w-4 h-4 stroke-[2.5px]" />
                             </button>
                          </div>
                        </div>
                    ), {
                        duration: 18000,
                        position: 'top-center'
                    });
                }
            });
        };

        const fetchCampaigns = async () => {
            try {
                const { data, error } = await supabase
                    .from('push_campaigns')
                    .select('*')
                    .in('status', ['active', 'approved', 'scheduled'])
                    .is('executed_at', null);

                if (error) throw error;
                if (data) processCampaigns(data);
            } catch(e) {
                console.error("Error fetching campaigns:", e);
            }
        };

        fetchCampaigns();

        const channel = supabase
            .channel('client_push_campaigns')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'push_campaigns' }, () => {
                fetchCampaigns();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userData, userId, navigate]);
}
