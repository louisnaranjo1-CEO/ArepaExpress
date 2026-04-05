import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

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

                const q = query(
                    collection(db, 'banners'),
                    where('isActive', '==', true),
                    where('type', '==', 'welcome_popup')
                );

                const snapshot = await getDocs(q);
                const popups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PopupData[];

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
                        className="relative w-full max-w-sm bg-white rounded-[3rem] overflow-hidden shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)]"
                    >
                        {/* Interactive Close Button */}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-5 right-5 z-20 bg-black/40 hover:bg-black/60 text-white p-2.5 rounded-full backdrop-blur-xl transition-all hover:scale-110 active:scale-90"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* Image Container with high-end sizing */}
                        <div className="relative aspect-[4/5] w-full overflow-hidden bg-slate-100">
                            <motion.img
                                initial={{ scale: 1.1 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.8 }}
                                src={popup.imageUrl}
                                alt={popup.title}
                                className="w-full h-full object-cover"
                            />

                            {/* Rich Overlay Content with Glassmorphism Effect */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent flex flex-col justify-end p-9 text-center">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <h3 className="text-white text-3xl font-black mb-3 tracking-tight leading-tight">
                                        {popup.title}
                                    </h3>

                                    {popup.linkUrl && (
                                        <div className="mt-5 space-y-4">
                                            <a
                                                href={popup.linkUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="relative inline-flex items-center gap-2 bg-primary text-slate-900 px-10 py-5 rounded-[1.5rem] font-black shadow-2xl shadow-primary/40 hover:bg-orange-600 transition-all hover:scale-105 active:scale-95 group overflow-hidden"
                                            >
                                                {/* Pulsing glow effect */}
                                                <span className="absolute inset-0 bg-white/20 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />

                                                <span className="relative z-10">Toca para obtener</span>
                                                <ExternalLink className="w-4 h-4 relative z-10 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                            </a>

                                            <div className="flex flex-col items-center gap-1 opacity-60">
                                                <p className="text-white text-[10px] font-black uppercase tracking-[0.2em]">
                                                    — Oferta de Bienvenida —
                                                </p>
                                                {popup.duration && (
                                                    <div className="h-1 w-12 bg-white/20 rounded-full mt-2 relative overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: "100%" }}
                                                            animate={{ width: "0%" }}
                                                            transition={{ duration: popup.duration, ease: "linear" }}
                                                            className="absolute inset-y-0 left-0 bg-primary"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
