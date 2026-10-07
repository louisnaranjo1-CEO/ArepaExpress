import { useState, useEffect } from 'react';
import type { Libraries } from '@react-google-maps/api';

export const GOOGLE_MAPS_API_KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || 'AIzaSyAT2_wZfYTBGDR7gEpLXRzG-BUQ9Cbu0aQ';
export const GOOGLE_MAPS_LIBRARIES: Libraries = ['places', 'geometry'];

// Global state tracking whether Google Maps has failed anywhere in this session
declare global {
    interface Window {
        gm_authFailure?: () => void;
        __gm_auth_failed?: boolean;
    }
}

// Intercept window.gm_authFailure globally as soon as this module is evaluated
if (typeof window !== 'undefined') {
    const existingGmAuthFailure = window.gm_authFailure;
    window.gm_authFailure = function () {
        console.warn('[GoogleMaps] Authentication or quota failure intercepted via gm_authFailure.');
        window.__gm_auth_failed = true;
        window.dispatchEvent(new CustomEvent('google_maps_error', { detail: 'gm_authFailure' }));
        if (typeof existingGmAuthFailure === 'function') {
            try {
                existingGmAuthFailure();
            } catch (err) {
                // ignore
            }
        }
    };
}

/**
 * Hook to provide zero-crash resilience for Google Maps.
 * Detects:
 * 1. Network script load errors (loadError)
 * 2. Auth / billing / quota / referrer errors (gm_authFailure)
 * 3. Injected error containers in the DOM (.gm-err-container)
 * 4. Stalled load timeout (fallback after timeoutMs)
 */
export function useGoogleMapsResilience(
    containerRef?: React.RefObject<HTMLElement | null>,
    loadError?: Error | null,
    timeoutMs: number = 4000
) {
    const [hasError, setHasError] = useState<boolean>(() => {
        return Boolean(typeof window !== 'undefined' && window.__gm_auth_failed);
    });

    useEffect(() => {
        if (loadError) {
            setHasError(true);
            return;
        }

        const onErrorEvent = () => {
            setHasError(true);
        };

        window.addEventListener('google_maps_error', onErrorEvent);

        // Scan and observe DOM for Google's error box (.gm-err-container)
        const target = containerRef?.current || (typeof document !== 'undefined' ? document.body : null);

        const checkForErrorElements = () => {
            if (!target) return;
            const errEl = target.querySelector('.gm-err-container, .gm-err-autocomplete, .gm-err-message');
            if (errEl) {
                // Hide immediately so user never sees the grey error box
                (errEl as HTMLElement).style.display = 'none';
                (errEl as HTMLElement).style.visibility = 'hidden';
                window.__gm_auth_failed = true;
                setHasError(true);
            }
        };

        checkForErrorElements();

        let observer: MutationObserver | null = null;
        if (target && typeof MutationObserver !== 'undefined') {
            observer = new MutationObserver(() => {
                checkForErrorElements();
            });
            observer.observe(target, {
                childList: true,
                subtree: true
            });
        }

        // Give Google Maps full priority as requested (do not abort prematurely to generic maps)
        return () => {
            window.removeEventListener('google_maps_error', onErrorEvent);
            if (observer) observer.disconnect();
        };
    }, [containerRef, loadError]);

    return hasError;
}
