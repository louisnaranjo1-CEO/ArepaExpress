import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
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

        // Cargar set de campañas ya vistas desde localStorage para no atosigar al reiniciar la pag
        try {
            const stored = localStorage.getItem('seen_campaigns');
            if (stored) {
                seenCampaigns.current = new Set(JSON.parse(stored));
            }
        } catch(e) {}
    }, []);

    useEffect(() => {
        if (!userData || !userId) return;

        // Escuchar campañas activas (Solo las más recientes)
        const q = query(collection(db, 'push_campaigns'), where('status', '==', 'active'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach(change => {
                const data = change.doc.data();
                const cid = change.doc.id;

                // Si fue añadida o modificada y no la hemos visto
                if ((change.type === 'added' || change.type === 'modified') && !seenCampaigns.current.has(cid)) {
                    
                    // Solo notificar si fue activada en los últimos 2 días para evitar spam viejo
                    const now = Date.now();
                    const actTime = data.activatedAt?.toMillis() || 0;
                    if (now - actTime > 172800000) return; // Más de 48 horas de activada

                    // 0. Programación (Programado para el futuro)
                    if (data.scheduledAt) {
                        const schedTime = data.scheduledAt.toMillis();
                        if (now < schedTime) return; // Aún no es hora
                    }

                    // Forzar mostrar si es MUY reciente (menos de 5 minutos de activada), saltando el seen check
                    // Esto ayuda a que si el admin la activa justo ahora, el usuario la vea si o si.
                    const isVeryRecent = (now - actTime) < 300000; // 5 minutos

                    if (seenCampaigns.current.has(cid) && !isVeryRecent) return;

                    // == Filtrado de Segmentación ==
                    
                    // 1. Género
                    if (data.sex !== 'all') {
                        const userSex = (userData.sex || '').toLowerCase().trim();
                        if (data.sex === 'male' && userSex !== 'male') return;
                        if (data.sex === 'female' && userSex !== 'female') return;
                    }

                    // 2. Edad
                    if (data.minAge || data.maxAge) {
                        try {
                            const birthDateStr = userData.fechaNacimiento || userData.birthDate;
                            if (birthDateStr) {
                                const birthDate = new Date(birthDateStr);
                                const ageDf = new Date(Date.now() - birthDate.getTime());
                                const age = Math.abs(ageDf.getUTCFullYear() - 1970);
                                
                                if (data.minAge && age < data.minAge) return;
                                if (data.maxAge && age > data.maxAge) return;
                            }
                        } catch(e) { }
                    }

                    // 3. Alcance (Geolocalización)
                    if (data.location !== 'national') {
                        // Gather all possible user locations (lastCity, addresses, legacy fields)
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
                        
                        // Fallback to localStorage (what the user sees in the header)
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

                            const stateMatches = targetedStates.some(ts => userStatesArr.includes(ts));
                            if (!stateMatches && !userStatesArr.includes(legacyState)) return;
                        }
                    }

                    // == Sí cumple con los filtros: Disparar Publicidad ==

                    // Marcar como vista
                    seenCampaigns.current.add(cid);
                    try {
                        localStorage.setItem('seen_campaigns', JSON.stringify(Array.from(seenCampaigns.current)));
                    } catch(e) {}

                    // Audio
                    if (audioRef.current) {
                        audioRef.current.currentTime = 0;
                        audioRef.current.play().catch(()=>{});
                    }

                    const handleClick = async (tId: string) => {
                        toast.dismiss(tId);
                        navigate(`/restaurant/${data.restaurantId}`);
                        try {
                            // Sumar Click!
                            await updateDoc(doc(db, 'push_campaigns', cid), {
                                clicks: increment(1)
                            });
                        } catch(e){}
                    };

                    // Toast Visual Rico en Diseño (Black & Yellow High Contrast)
                    toast.custom((t) => (
                        <div
                          className={`${
                            t.visible ? 'animate-in fade-in zoom-in duration-300' : 'animate-out fade-out zoom-out duration-300'
                          } max-w-sm w-full bg-black/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-2xl pointer-events-auto flex flex-col border border-primary/30 overflow-hidden relative cursor-pointer group`}
                          onClick={() => handleClick(t.id)}
                        >
                          {/* Glow effect on hover */}
                          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                          
                          {/* Close button with high contrast */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }} 
                            className="absolute top-3 right-3 bg-white/10 hover:bg-primary text-white hover:text-black rounded-full p-1.5 z-20 transition-all duration-300 backdrop-blur-md"
                          >
                            <X className="w-3.5 h-3.5"/>
                          </button>
                          
                          {data.imageUrl ? (
                              <div className="relative h-44 overflow-hidden">
                                  <img src={data.imageUrl} alt="Promoción" className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                              </div>
                          ) : (
                              <div className="w-full h-2 bg-primary shadow-[0_0_15px_rgba(251,191,36,0.5)]"></div>
                          )}
                          
                          <div className="p-5 flex gap-4 items-start bg-black">
                             <div className="w-14 h-14 bg-slate-900 rounded-2xl flex-shrink-0 border border-primary/20 overflow-hidden shadow-2xl flex items-center justify-center p-0.5 group-hover:border-primary transition-colors">
                                 {data.restaurantLogo ? (
                                    <img src={data.restaurantLogo} className="w-full h-full object-cover rounded-xl"/>
                                 ) : (
                                    <span className="font-bold text-primary">DP</span>
                                 )}
                             </div>
                             <div className="flex-1 min-w-0">
                                 <h3 className="font-black text-primary text-lg leading-tight tracking-tight uppercase italic">{data.title}</h3>
                                 <p className="text-sm font-medium text-slate-300 mt-1 line-clamp-2 leading-relaxed">{data.subtitle}</p>
                                 <div className="flex justify-between items-center mt-4">
                                     <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                                        <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Oferta Activa</span>
                                     </div>
                                     <span className="text-[11px] bg-primary text-black font-black px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg transform group-hover:translate-x-1 transition-transform">
                                         IR AHORA <ExternalLink className="w-3 h-3 stroke-[3px]"/>
                                     </span>
                                 </div>
                             </div>
                          </div>
                        </div>
                    ), {
                        duration: 15000, // 15 seconds
                        position: 'top-center'
                    });

                }
            });
        });

        return () => unsubscribe();
    }, [userData, userId, navigate]);
}
