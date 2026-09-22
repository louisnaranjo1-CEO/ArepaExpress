import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import toast from 'react-hot-toast';

export type NotificationSoundType = 'client' | 'driver' | 'chat';

export interface NotificationOptions {
    title: string;
    body: string;
    soundType?: NotificationSoundType;
    icon?: string;
    tag?: string;
    data?: any;
    vibratePattern?: number[];
    bannerDurationMs?: number;
    onClick?: () => void;
}

// Audio Context Singleton for synthesis
function getAudioContext(): AudioContext | null {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return null;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        return ctx;
    } catch {
        return null;
    }
}

/**
 * 1. Client App Sound: Harmonious, pleasant notification bell / chime (major 3rd sequence)
 */
export function playClientNotificationSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Sequence of pleasant notes: G5 (784Hz) -> B5 (988Hz) -> D6 (1175Hz)
        const notes = [783.99, 987.77, 1174.66];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);

            osc.connect(gain);
            gain.connect(ctx.destination);

            const start = now + idx * 0.08;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.28, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

            osc.start(start);
            osc.stop(start + 0.38);
        });

        setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch (e) {
        console.warn('Could not play client notification sound:', e);
    }
}

/**
 * 2. Driver App Sound: Urgent, attention-grabbing radar / emergency alert ping
 * (Dual-frequency pulsing alert: 880Hz <-> 1175Hz with sawtooth richness)
 */
export function playDriverAlertSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Two urgent bursts
        const bursts = [0, 0.22, 0.44];
        bursts.forEach((startOffset) => {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sawtooth';
            osc2.type = 'sine';

            const start = now + startOffset;
            osc1.frequency.setValueAtTime(880, start);
            osc1.frequency.exponentialRampToValueAtTime(1320, start + 0.12);

            osc2.frequency.setValueAtTime(440, start);
            osc2.frequency.exponentialRampToValueAtTime(660, start + 0.12);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

            osc1.start(start);
            osc2.start(start);
            osc1.stop(start + 0.2);
            osc2.stop(start + 0.2);
        });

        setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch (e) {
        console.warn('Could not play driver alert sound:', e);
    }
}

/**
 * 3. Haptic Vibration Trigger (works on Android / iOS Capacitor & Mobile Browser)
 */
export async function triggerDeviceVibration(soundType: NotificationSoundType = 'client', customPattern?: number[]) {
    try {
        if (Capacitor.isNativePlatform()) {
            if (soundType === 'driver') {
                await Haptics.vibrate({ duration: 600 }).catch(() => {});
                setTimeout(async () => {
                    await Haptics.vibrate({ duration: 600 }).catch(() => {});
                }, 300);
            } else {
                await Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
            }
        } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            const pattern = customPattern || (soundType === 'driver' ? [250, 100, 250, 100, 500] : [120, 80, 160]);
            navigator.vibrate(pattern);
        }
    } catch (e) {
        console.warn('Vibration failed:', e);
    }
}

/**
 * 4. Request Native Browser / OS Notification Permission
 */
export async function ensureNativeNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return false;
    }
    if (Notification.permission === 'granted') {
        return true;
    }
    if (Notification.permission !== 'denied') {
        try {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch {
            return false;
        }
    }
    return false;
}

/**
 * 5. Display Native Notification in Device Status Bar (Android & iOS)
 */
export async function postNativeNotification(options: NotificationOptions) {
    const { title, body, icon = '/icons/icon-192x192.png', tag, data, vibratePattern } = options;
    
    try {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') {
                // If service worker registration is available, showNotification ensures status bar display even in background
                if ('serviceWorker' in navigator) {
                    const reg = await navigator.serviceWorker.getRegistration();
                    if (reg && reg.showNotification) {
                        await reg.showNotification(title, {
                            body,
                            icon,
                            badge: icon,
                            tag: tag || `app-notif-${Date.now()}`,
                            data,
                            vibrate: vibratePattern || [200, 100, 200]
                        } as any);
                        return;
                    }
                }
                
                // Fallback to standard Window Notification
                const notif = new Notification(title, {
                    body,
                    icon,
                    tag: tag || `app-notif-${Date.now()}`,
                    data
                });
                if (options.onClick) {
                    notif.onclick = () => {
                        window.focus();
                        options.onClick?.();
                    };
                }
            }
        }
    } catch (e) {
        console.warn('Native notification post failed:', e);
    }
}

/**
 * 6. Display In-App Floating Modal / Banner (Pantalla Emergente)
 */
export function displayNotificationBanner(options: NotificationOptions) {
    const isDriver = options.soundType === 'driver';
    
    toast.custom((t) => (
        <div
            onClick={() => {
                toast.dismiss(t.id);
                if (options.onClick) options.onClick();
            }}
            className={`cursor-pointer max-w-sm w-full mx-auto transform transition-all duration-300 ${
                t.visible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95'
            } ${
                isDriver 
                    ? 'bg-slate-900 border-2 border-amber-400 text-white shadow-2xl shadow-amber-500/20' 
                    : 'bg-white border border-slate-200 text-slate-800 shadow-2xl shadow-slate-900/15'
            } rounded-2xl p-3.5 flex items-start gap-3 backdrop-blur-md`}
            style={{ zIndex: 999999 }}
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg ${
                isDriver ? 'bg-amber-400 text-slate-950 shadow-md animate-pulse' : 'bg-primary/20 text-slate-900'
            }`}>
                {isDriver ? '🚨' : '🔔'}
            </div>
            <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center justify-between gap-1">
                    <p className={`text-xs font-black uppercase tracking-wider truncate ${isDriver ? 'text-amber-400' : 'text-slate-900'}`}>
                        {options.title}
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">Ahora</span>
                </div>
                <p className={`text-xs font-semibold mt-0.5 leading-snug line-clamp-2 ${isDriver ? 'text-slate-200' : 'text-slate-600'}`}>
                    {options.body}
                </p>
            </div>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    toast.dismiss(t.id);
                }}
                className={`p-1 rounded-lg text-xs font-bold transition-colors ${
                    isDriver ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
            >
                ✕
            </button>
        </div>
    ), {
        position: 'top-center',
        duration: options.bannerDurationMs || (isDriver ? 6000 : 4500),
    });
}

/**
 * 7. Unified Dispatcher: Sound + Vibration + Status Bar Notification + Pop-up Banner
 */
export async function sendAppNotification(options: NotificationOptions) {
    const soundType = options.soundType || 'client';

    // 1. Sound
    if (soundType === 'driver') {
        playDriverAlertSound();
    } else {
        playClientNotificationSound();
    }

    // 2. Vibration
    triggerDeviceVibration(soundType, options.vibratePattern);

    // 3. Status Bar Notification (Android & iOS)
    postNativeNotification(options);

    // 4. In-App Banner Pop-up
    displayNotificationBanner(options);
}
