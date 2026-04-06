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

                    // == Filtrado de Segmentación ==
                    
                    // 1. Género
                    if (data.sex !== 'all') {
                        if (data.sex === 'male' && userData.sex !== 'male') return;
                        if (data.sex === 'female' && userData.sex !== 'female') return;
                    }

                    // 2. Edad
                    if (data.minAge || data.maxAge) {
                        try {
                            const birthDate = new Date(userData.fechaNacimiento || userData.birthDate);
                            const ageDf = new Date(Date.now() - birthDate.getTime());
                            const age = Math.abs(ageDf.getUTCFullYear() - 1970);
                            
                            if (data.minAge && age < data.minAge) return;
                            if (data.maxAge && age > data.maxAge) return;
                        } catch(e) { /* Fallback, maybe ignore age if not set correctly */ }
                    }

                    // 3. Alcance (Geolocalización)
                    if (data.location !== 'national') {
                         const userCity = (userData.address?.city || userData.city || '').toLowerCase();
                         const userState = (userData.address?.state || userData.state || '').toLowerCase();
                         
                         const campCity = (data.city || '').toLowerCase();
                         const campState = (data.state || '').toLowerCase();

                         if (data.location === 'city' && userCity !== campCity) return;
                         if (data.location === 'state' && userState !== campState) return;
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

                    // Toast Visual Rico en Diseño
                    toast.custom((t) => (
                        <div
                          className={`${
                            t.visible ? 'animate-enter' : 'animate-leave'
                          } max-w-sm w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex flex-col border border-primary/20 overflow-hidden relative cursor-pointer`}
                          onClick={() => handleClick(t.id)}
                        >
                          {/* Botón cerrar manual (evita click general) */}
                          <button onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 z-10 hover:bg-black">
                              <X className="w-4 h-4"/>
                          </button>
                          
                          {data.imageUrl ? (
                              <img src={data.imageUrl} alt="Promoción" className="w-full h-40 object-cover" />
                          ) : (
                              <div className="w-full h-3 bg-primary"></div>
                          )}
                          
                          <div className="p-4 flex gap-4">
                             <div className="w-12 h-12 bg-slate-100 rounded-xl flex-shrink-0 border border-slate-200 overflow-hidden shadow-sm flex items-center justify-center">
                                 {data.restaurantLogo ? <img src={data.restaurantLogo} className="w-full h-full object-cover"/> : <span className="font-bold text-slate-400">R</span>}
                             </div>
                             <div className="flex-1">
                                 <h3 className="font-black text-slate-800 leading-tight">{data.title}</h3>
                                 <p className="text-sm font-medium text-slate-500 mt-1 line-clamp-2">{data.subtitle}</p>
                                 <div className="flex justify-start mt-3">
                                     <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-1 rounded-md flex items-center gap-1">
                                         Ver Promoción <ExternalLink className="w-3 h-3"/>
                                     </span>
                                 </div>
                             </div>
                          </div>
                        </div>
                    ), {
                        duration: 12000, // 12 seconds before auto dismiss
                        position: 'top-center'
                    });

                }
            });
        });

        return () => unsubscribe();
    }, [userData, userId, navigate]);
}
