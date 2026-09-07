import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface WelcomePopupProps {
    manualState?: string;
    manualCity?: string;
}

interface PopupData {
    id: string;
    imageUrl: string;
    title: string;
    linkUrl?: string;
    duration?: number;
    visibilityScope?: 'national' | 'state' | 'city';
    targetState?: string;
    targetCity?: string;
}

export default function WelcomePopup({ manualState, manualCity }: WelcomePopupProps) {
    const [popup, setPopup] = useState<PopupData | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const fetchPopup = async () => {
            try {
                // Check if already shown in this session
                const lastShown = localStorage.getItem('last_welcome_popup_shown');
                const now = new Date().getTime();

                // Show once every 12 hours (standard for promo popups)
                if (lastShown && now - parseInt(lastShown) < 12 * 60 * 60 * 1000) {
                    return;
                }

                const { data, error } = await supabase
                    .from('banners')
                    .select('*')
                    .or('is_active.eq.true,isActive.eq.true')
                    .eq('type', 'welcome_popup');

                if (error) throw error;

                const popups: PopupData[] = (data || []).map((b: any) => ({
                    id: b.id,
                    imageUrl: b.image_url || b.imageUrl,
                    title: b.title,
                    linkUrl: b.link_url || b.linkUrl,
                    duration: b.duration,
                    visibilityScope: b.visibility_scope || b.visibilityScope,
                    targetState: b.target_state || b.targetState,
                    targetCity: b.target_city || b.targetCity
                }));

                // Filter by location
                const filtered = popups.filter((p) => {
                    const scope = p.visibilityScope || 'national';
                    if (scope === 'national') return true;
                    if (scope === 'state') return p.targetState === manualState;
                    if (scope === 'city') return p.targetCity === manualCity;
                    return false;
                });

                if (filtered.length > 0) {
                    // Pick the most recent one
                    const selected = filtered[filtered.length - 1];
                    setPopup(selected);

                    // Delay showing a bit for better UX flow
                    setTimeout(() => {
                        setIsOpen(true);
                        localStorage.setItem('last_welcome_popup_shown', now.toString());

                        // Handle auto-close duration if set (user requirement)
                        if (selected.duration && selected.duration > 0) {
                            setTimeout(() => {
                                setIsOpen(false);
                            }, selected.duration * 1000);
                        }
                    }, 1500);
                }
            } catch (error) {
                console.error("Error fetching welcome popup:", error);
            }
        };

        fetchPopup();
    }, [manualState, manualCity]);

    if (!popup) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    {/* Backdrop with high-quality blur */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="absolute inset-0 bg-black/70 backdrop-blur-md"
                    />

                    {/* Modal Content - Premium Rounded Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-sm sm:max-w-md bg-white rounded-[32px] overflow-hidden shadow-2xl z-10 flex flex-col"
                    >
                        {/* Close button top-right on the card */}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 z-20 w-9 h-9 bg-black/50 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-95"
                            aria-label="Cerrar"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* Image Container */}
                        <div className="relative w-full aspect-[4/5] bg-slate-100 overflow-hidden cursor-pointer" onClick={() => {
                            if (popup.linkUrl) {
                                window.open(popup.linkUrl, '_blank');
                            }
                        }}>
                            <img
                                src={popup.imageUrl}
                                alt={popup.title || "Anuncio Importante"}
                                className="w-full h-full object-cover"
                            />
                        </div>

                        {/* Bottom Bar: Action / Dismiss */}
                        <div className="p-4 bg-white flex items-center justify-between gap-3 border-t border-slate-100">
                            {popup.linkUrl ? (
                                <a
                                    href={popup.linkUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setIsOpen(false)}
                                    className="flex-1 bg-primary text-slate-900 py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider text-center shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <span>Ver Más Detalles</span>
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            ) : (
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="flex-1 bg-slate-900 text-white py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider text-center shadow-lg hover:bg-slate-800 active:scale-95 transition-all"
                                >
                                    Entendido
                                </button>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
