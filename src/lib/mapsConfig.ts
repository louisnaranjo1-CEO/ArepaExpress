import { useState, useEffect, useCallback } from 'react';
import type { Libraries } from '@react-google-maps/api';

export const GOOGLE_MAPS_API_KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || 'AIzaSyAT2_wZfYTBGDR7gEpLXRzG-BUQ9Cbu0aQ';
export const GOOGLE_MAPS_LIBRARIES: Libraries = ['places', 'geometry'];

export interface GoogleMapsErrorInfo {
    code: string;
    message: string;
    action: string;
    raw?: string;
    timestamp: number;
}

// Global state tracking whether Google Maps has failed anywhere in this session
declare global {
    interface Window {
        gm_authFailure?: () => void;
        __gm_auth_failed?: boolean;
        __gm_last_error?: GoogleMapsErrorInfo | null;
    }
}

export function getDiagnosticForCode(code: string): { message: string; action: string } {
    switch (code) {
        case 'ApiNotActivatedMapError':
            return {
                message: 'La API "Maps JavaScript API" no está habilitada en Google Cloud.',
                action: 'Activa "Maps JavaScript API" en Google Cloud Console para tu clave.'
            };
        case 'RefererNotAllowedMapError':
            return {
                message: 'La URL o puerto actual no está autorizada en las restricciones de la clave API.',
                action: 'Añade tu dominio o referentes en Google Cloud Console.'
            };
        case 'BillingNotEnabledMapError':
            return {
                message: 'La cuenta de facturación no está vinculada al proyecto de Google Maps.',
                action: 'Vincula una cuenta de facturación en Google Cloud Console.'
            };
        case 'InvalidKeyMapError':
            return {
                message: 'La clave de Google Maps no es válida.',
                action: 'Verifica la clave API en VITE_GOOGLE_MAPS_API_KEY.'
            };
        case 'DeletedKeyMapError':
        case 'ExpiredKeyMapError':
            return {
                message: 'La clave de Google Maps ha sido eliminada o ha expirado.',
                action: 'Genera una nueva clave API en Google Cloud Console.'
            };
        case 'OverQuotaMapError':
            return {
                message: 'Se ha superado la cuota de Google Maps para este proyecto.',
                action: 'Revisa las cuotas en Google Cloud Console.'
            };
        case 'gm_authFailure':
            return {
                message: 'Google Maps rechazó la autenticación de la clave API.',
                action: 'Verifica las restricciones y servicios habilitados de la clave API.'
            };
        case 'TimeoutError':
            return {
                message: 'Tiempo de espera agotado al conectar con Google Maps.',
                action: 'Se activó el motor de mapas alternativo ultrarrápido.'
            };
        default:
            return {
                message: `Error de Google Maps (${code}).`,
                action: 'Se activó el motor de mapas de respaldo.'
            };
    }
}

// Global interceptors initialized once
if (typeof window !== 'undefined') {
    // 1. Intercept console.error to capture Google Maps error codes
    const originalConsoleError = console.error;
    console.error = function (...args: any[]) {
        try {
            const str = args.map(a => (typeof a === 'string' ? a : (a?.message || ''))).join(' ');
            if (str.includes('Google Maps JavaScript API error:')) {
                const match = str.match(/Google Maps JavaScript API error:\s*([A-Za-z0-9_]+)/);
                const code = match ? match[1] : 'UnknownMapError';
                const diag = getDiagnosticForCode(code);
                window.__gm_last_error = {
                    code,
                    message: diag.message,
                    action: diag.action,
                    raw: str,
                    timestamp: Date.now()
                };
                window.__gm_auth_failed = true;
                window.dispatchEvent(new CustomEvent('google_maps_error', { detail: window.__gm_last_error }));
            }
        } catch {
            // ignore
        }
        originalConsoleError.apply(console, args);
    };

    // 2. Intercept window.gm_authFailure globally
    const existingGmAuthFailure = window.gm_authFailure;
    window.gm_authFailure = function () {
        console.warn('[GoogleMaps] Authentication or quota failure intercepted via gm_authFailure. Activating fallback.');
        window.__gm_auth_failed = true;
        if (!window.__gm_last_error) {
            const diag = getDiagnosticForCode('gm_authFailure');
            window.__gm_last_error = {
                code: 'gm_authFailure',
                message: diag.message,
                action: diag.action,
                raw: 'window.gm_authFailure',
                timestamp: Date.now()
            };
        }
        window.dispatchEvent(new CustomEvent('google_maps_error', { detail: window.__gm_last_error }));
        if (typeof existingGmAuthFailure === 'function') {
            try {
                existingGmAuthFailure();
            } catch {
                // ignore
            }
        }
    };
}

export function getGoogleMapsLastError(): GoogleMapsErrorInfo | null {
    if (typeof window === 'undefined') return null;
    return window.__gm_last_error || null;
}

/**
 * Hook to provide zero-crash resilience for Google Maps with seamless Leaflet fallback.
 * Checks for:
 * 1. Network script load errors (loadError)
 * 2. Auth / quota / API disabled errors (gm_authFailure, console errors)
 * 3. Injected error containers in DOM (.gm-err-container)
 * 4. Stalled load timeout (if tiles haven't rendered within timeoutMs)
 */
export function useGoogleMapsResilience(
    containerRef?: React.RefObject<HTMLElement | null>,
    loadError?: Error | null,
    timeoutMs: number = 3000
) {
    const [hasError, setHasError] = useState<boolean>(() => {
        return Boolean(typeof window !== 'undefined' && window.__gm_auth_failed);
    });

    const [errorInfo, setErrorInfo] = useState<GoogleMapsErrorInfo | null>(() => getGoogleMapsLastError());

    const retry = useCallback(() => {
        if (typeof window !== 'undefined') {
            window.__gm_auth_failed = false;
            window.__gm_last_error = null;
        }
        setHasError(false);
        setErrorInfo(null);
    }, []);

    useEffect(() => {
        // If an auth failure was already detected in this session, trigger fallback immediately
        if (typeof window !== 'undefined' && window.__gm_auth_failed) {
            setHasError(true);
            return;
        }

        if (loadError) {
            const err: GoogleMapsErrorInfo = {
                code: 'NetworkScriptLoadError',
                message: 'No se pudo descargar el script de Google Maps.',
                action: 'Se activó el motor de mapas de respaldo.',
                raw: loadError.message,
                timestamp: Date.now()
            };
            window.__gm_last_error = err;
            window.__gm_auth_failed = true;
            setErrorInfo(err);
            setHasError(true);
            return;
        }

        const onErrorEvent = (e: any) => {
            const detail = e?.detail as GoogleMapsErrorInfo | undefined;
            if (detail) {
                setErrorInfo(detail);
            }
            window.__gm_auth_failed = true;
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
                if (!window.__gm_last_error) {
                    const diag = getDiagnosticForCode('gm_authFailure');
                    const err = {
                        code: 'gm_authFailure',
                        message: diag.message,
                        action: diag.action,
                        raw: '.gm-err-container detected',
                        timestamp: Date.now()
                    };
                    window.__gm_last_error = err;
                    setErrorInfo(err);
                }
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

        // Safety fallback timer: if Google Maps API doesn't initialize or render tiles within timeoutMs, fallback
        const timer = setTimeout(() => {
            if (typeof window !== 'undefined') {
                if (window.__gm_auth_failed) {
                    setHasError(true);
                    return;
                }
                // Check if map container has actual tile images loaded
                const hasGoogleTiles = target ? target.querySelectorAll('img[src*="googleapis.com/maps/vt"], img[src*="maps.gstatic.com"]').length > 0 : false;
                if (!hasGoogleTiles || !window.google?.maps) {
                    console.warn('[GoogleMaps] Load timeout reached or tiles not rendered; activating resilient fallback.');
                    window.__gm_auth_failed = true;
                    setHasError(true);
                }
            }
        }, timeoutMs);

        return () => {
            window.removeEventListener('google_maps_error', onErrorEvent);
            if (observer) observer.disconnect();
            clearTimeout(timer);
        };
    }, [containerRef, loadError, timeoutMs]);

    return hasError;
}
