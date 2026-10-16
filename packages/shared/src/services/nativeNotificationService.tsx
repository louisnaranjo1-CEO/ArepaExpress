import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import toast from 'react-hot-toast';
import { sanitizeNotificationText, getAppBrandingName } from '../lib/notifications';

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

// 0. Haptic Feedback for Native Mobile & Fallback Vibration
export async function triggerHaptic(type: 'light' | 'medium' | 'success' | 'warning' = 'light') {
    try {
        if (Capacitor.isNativePlatform()) {
            if (type === 'light') {
                await Haptics.impact({ style: ImpactStyle.Light });
            } else if (type === 'medium') {
                await Haptics.impact({ style: ImpactStyle.Medium });
            } else if (type === 'success') {
                await Haptics.notification({ type: NotificationType.Success });
            } else if (type === 'warning') {
                await Haptics.notification({ type: NotificationType.Warning });
            }
        } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            const patterns = {
                light: [40],
                medium: [80],
                success: [80, 50, 100],
                warning: [120, 80, 120]
            };
            navigator.vibrate(patterns[type] || [50]);
        }
    } catch (e) {
        // Safe silent fallback
    }
}

// 0.1 Native Android Background Service Helpers (WakeLock & Battery Exemption)
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
    try {
        if (Capacitor.isNativePlatform()) {
            const res = await (Capacitor.Plugins as any).LocationHelper?.requestIgnoreBatteryOptimizations();
            return !!res?.ignoring;
        }
    } catch (e) {
        console.warn('Could not request battery optimizations exemption:', e);
    }
    return false;
}

export async function acquireWakeLock(): Promise<boolean> {
    try {
        if (Capacitor.isNativePlatform()) {
            const res = await (Capacitor.Plugins as any).LocationHelper?.acquireWakeLock();
            return !!res?.acquired;
        }
    } catch (e) {
        console.warn('Could not acquire WakeLock:', e);
    }
    return false;
}

export async function releaseWakeLock(): Promise<boolean> {
    try {
        if (Capacitor.isNativePlatform()) {
            const res = await (Capacitor.Plugins as any).LocationHelper?.releaseWakeLock();
            return !!res?.released;
        }
    } catch (e) {
        console.warn('Could not release WakeLock:', e);
    }
    return false;
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

        // Sequence: G5 (784Hz) -> B5 (988Hz) -> D6 (1175Hz)
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
 */
export function playDriverAlertSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

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
            gain.gain.linearRampToValueAtTime(0.42, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

            osc1.start(start);
            osc2.start(start);
            osc1.stop(start + 0.20);
            osc2.stop(start + 0.20);
        });

        setTimeout(() => ctx.close().catch(() => {}), 1000);
    } catch (e) {
        console.warn('Could not play driver alert sound:', e);
    }
}

/**
 * 3. Chat Notification Sound: Subtle soft bubble pop
 */
export function playChatNotificationSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

        osc.connect(gain);
        gain.connect(ctx.destination);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.start(now);
        osc.stop(now + 0.18);

        setTimeout(() => ctx.close().catch(() => {}), 400);
    } catch (e) {
        console.warn('Could not play chat notification sound:', e);
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
 * 5. Display High-Priority Native Android Notification
 */
export async function postNativeNotification(options: NotificationOptions) {
    const appName = getAppBrandingName('Un 2x3');
    const title = sanitizeNotificationText(options.title || `${appName} • Notificación`);
    const body = sanitizeNotificationText(options.body || '');
    const { icon = '/icons/icon-192x192.png', tag, data, vibratePattern } = options;
    const channelId = options.soundType === 'driver' ? 'driver_dispatch_channel' : 'un_2x3_high_priority';

    try {
        // Native Android Bridge via LocationHelperPlugin (bypasses screen-lock restrictions)
        if (Capacitor.isNativePlatform()) {
            const helper = (Capacitor.Plugins as any).LocationHelper;
            if (helper && typeof helper.postNotification === 'function') {
                await helper.postNotification({
                    title,
                    body,
                    channelId,
                    id: Math.floor(Math.random() * 1000000)
                });
                return;
            }
        }

        // Service Worker Push / Background Notification
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg && reg.showNotification) {
                    await reg.showNotification(title, {
                        body,
                        icon,
                        badge: icon,
                        tag: tag || `notif-${Date.now()}`,
                        data,
                        channelId,
                        requireInteraction: options.soundType === 'driver',
                        vibrate: vibratePattern || (options.soundType === 'driver' ? [500, 200, 500] : [200, 100, 200])
                    } as any);
                    return;
                }
            }

            // Fallback Window Notification
            const notif = new Notification(title, {
                body,
                icon,
                tag: tag || `notif-${Date.now()}`,
                data
            });
            if (options.onClick) {
                notif.onclick = () => {
                    window.focus();
                    options.onClick?.();
                };
            }
        }
    } catch (e) {
        console.warn('Native notification post failed:', e);
    }
}

/**
 * 6. Display In-App Floating Modal / Banner
 */
export function displayNotificationBanner(options: NotificationOptions) {
    const isDriver = options.soundType === 'driver';
    const appName = getAppBrandingName('Un 2x3');
    const cleanTitle = sanitizeNotificationText(options.title || appName);
    const cleanBody = sanitizeNotificationText(options.body || '');

    toast.custom((t) => (
        <div
            onClick={() => {
                toast.dismiss(t.id);
                if (options.onClick) options.onClick();
            }}
            className={`cursor-pointer max-w-sm w-full mx-auto transform transition-all duration-300 ${
                t.visible ? 'animate-in fade-in slide-in-from-top-4' : 'animate-out fade-out slide-out-to-top-4'
            }`}
        >
            <div className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-start gap-3.5 ${
                isDriver 
                    ? 'bg-slate-900/95 text-white border-amber-500/40 shadow-amber-500/20 ring-2 ring-amber-500/30' 
                    : 'bg-white/95 text-slate-800 border-slate-200/80 shadow-slate-900/10'
            }`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl font-bold ${
                    isDriver ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/30' : 'bg-primary/20 text-primary'
                }`}>
                    {isDriver ? '🚨' : options.soundType === 'chat' ? '💬' : '🛍️'}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                    <p className={`text-sm font-black tracking-tight truncate ${isDriver ? 'text-amber-400' : 'text-slate-900'}`}>
                        {cleanTitle}
                    </p>
                    <p className={`text-xs mt-0.5 font-medium line-clamp-2 leading-relaxed ${isDriver ? 'text-slate-300' : 'text-slate-600'}`}>
                        {cleanBody}
                    </p>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toast.dismiss(t.id);
                    }}
                    className={`text-xs font-bold px-2 py-1 rounded-lg shrink-0 transition-colors ${
                        isDriver ? 'bg-white/10 hover:bg-white/20 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
                    }`}
                >
                    ✕
                </button>
            </div>
        </div>
    ), {
        duration: options.bannerDurationMs || (isDriver ? 9000 : 5000),
        position: 'top-center'
    });
}

/**
 * 7. Unified Notification Orchestrator
 */
export async function sendAppNotification(options: NotificationOptions) {
    const { soundType = 'client' } = options;
    const appName = getAppBrandingName('Un 2x3');
    const cleanOptions: NotificationOptions = {
        ...options,
        title: sanitizeNotificationText(options.title || `${appName} • Notificación`),
        body: sanitizeNotificationText(options.body || '')
    };

    // 1. Play synthesized tone
    if (soundType === 'driver') {
        playDriverAlertSound();
    } else if (soundType === 'chat') {
        playChatNotificationSound();
    } else {
        playClientNotificationSound();
    }

    // 2. Trigger native vibration / haptic
    await triggerHaptic(soundType === 'driver' ? 'warning' : 'medium');

    // 3. Post native system notification (for status bar & lock-screen)
    postNativeNotification(cleanOptions).catch(console.warn);

    // 4. Show in-app banner toast
    displayNotificationBanner(cleanOptions);
}
