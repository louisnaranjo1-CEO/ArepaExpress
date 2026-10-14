import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

interface UseRealtimeResilienceOptions {
    onSync?: () => Promise<void> | void;
    enableLogging?: boolean;
}

export function useRealtimeResilience(options?: UseRealtimeResilienceOptions) {
    const onSyncRef = useRef(options?.onSync);
    onSyncRef.current = options?.onSync;

    useEffect(() => {
        let lastSyncTime = 0;

        const triggerResync = async (triggerSource: string) => {
            const now = Date.now();
            // Debounce trigger within 1.5s
            if (now - lastSyncTime < 1500) return;
            lastSyncTime = now;

            if (options?.enableLogging) {
                console.log(`[RealtimeResilience] Reconnecting channels and syncing triggered by: ${triggerSource}`);
            }

            try {
                // 1. Force reconnect Realtime WebSocket if disconnected
                if ((supabase as any)?.realtime && typeof (supabase as any).realtime.connect === 'function') {
                    (supabase as any).realtime.connect();
                }

                // 2. Inspect all active channels and re-subscribe if closed/errored
                const channels = supabase.getChannels();
                channels.forEach((channel: any) => {
                    const state = channel?.state;
                    if (state === 'closed' || state === 'errored' || state === 'timed_out') {
                        channel.subscribe();
                    }
                });

                // 3. Fire custom global event so any active page/component re-fetches immediately
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('app:resumed-sync', { detail: { triggerSource } }));
                }

                // 4. Execute dedicated component sync callback if provided
                if (onSyncRef.current) {
                    await onSyncRef.current();
                }
            } catch (err) {
                console.warn('[RealtimeResilience] Error during reconnect/resync:', err);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                triggerResync('visibilitychange:visible');
            }
        };

        const handleOnline = () => {
            triggerResync('window:online');
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', handleOnline);

        let capAppSub: any = null;
        if (Capacitor.isNativePlatform()) {
            capAppSub = CapApp.addListener('appStateChange', (state) => {
                if (state.isActive) {
                    triggerResync('CapApp:appStateChange:active');
                }
            });
        }

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
            if (capAppSub) {
                capAppSub.then((s: any) => s.remove?.());
            }
        };
    }, [options?.enableLogging]);
}
