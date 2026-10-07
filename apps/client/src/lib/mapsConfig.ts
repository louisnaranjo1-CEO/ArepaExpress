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

function getDiagnosticForCode(code: string): { message: string; action: string } {
    switch (code) {
        case 'ApiNotActivatedMapError':
            return {
                message: 'La API "Maps JavaScript API" no está habilitada en tu proyecto de Google Cloud Console.',
                action: 'Ve a Google Cloud Console > APIs y Servicios > Biblioteca > Busca "Maps JavaScript API" y haz clic en "Habilitar".'
            };
        case 'RefererNotAllowedMapError':
            return {
                message: 'La URL o puerto actual no está autorizada en las restricciones de referentes HTTP de la clave API.',
                action: 'En Google Cloud Console > APIs y Servicios > Credenciales > Tu Clave API > Restricciones de aplicaciones: añade "http://localhost:*", "capacitor://localhost/*", o selecciona "Ninguna" para pruebas.'
            };
        case 'BillingNotEnabledMapError':
            return {
                message: 'La cuenta de facturación no está vinculada a este proyecto de Google Cloud.',
                action: 'En Google Cloud Console > Facturación, asegúrate de vincular tu cuenta de facturación activa a este proyecto específico.'
            };
        case 'InvalidKeyMapError':
            return {
                message: 'La clave de Google Maps no es válida o tiene caracteres incorrectos.',
                action: 'Verifica que la clave en VITE_GOOGLE_MAPS_API_KEY en tu archivo .env coincida exactamente con la de Google Cloud.'
            };
        case 'DeletedKeyMapError':
            return {
                message: 'La clave de API ha sido eliminada en Google Cloud Console.',
                action: 'Genera una nueva clave API en Google Cloud Console y actualízala en el archivo .env.'
            };
        case 'ExpiredKeyMapError':
            return {
                message: 'La clave de API de Google Maps ha expirado.',
                action: 'Renueva o genera una nueva clave en Google Cloud Console.'
            };
        case 'OverQuotaMapError':
            return {
                message: 'Se ha superado la cuota de solicitudes de Google Maps para este proyecto.',
                action: 'Revisa las cuotas de uso en Google Cloud Console o solicita una ampliación de cuota.'
            };
        case 'gm_authFailure':
            return {
                message: 'Google Maps rechazó la autenticación de la clave API.',
                action: 'Verifica en Google Cloud Console que "Maps JavaScript API", "Places API" y "Geocoding API" estén activas y que la clave no tenga restricciones bloqueando este origen.'
            };
        case 'TimeoutError':
            return {
                message: 'Tiempo de espera agotado al conectar con los servidores de Google Maps.',
                action: 'Comprueba tu velocidad de conexión a Internet o presiona "Reintentar".'
            };
        default:
            return {
                message: `Error de Google Maps (${code}).`,
                action: 'Verifica la consola de Google Cloud para más detalles sobre este error.'
            };
    }
}

// Global interceptors initialized once
if (typeof window !== 'undefined') {
    // 1. Intercept console.error to capture exact Google Maps error codes
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
        console.warn('[GoogleMaps] Authentication failure intercepted via gm_authFailure.');
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
 * Hook to provide zero-crash resilience for Google Maps with explicit diagnostics.
 * Default timeout increased from 4s to 15s to support Venezuelan and mobile network latencies.
 */
export function useGoogleMapsResilience(
    containerRef?: React.RefObject<HTMLElement | null>,
    loadError?: Error | null,
    timeoutMs: number = 15000
) {
    const [hasError, setHasError] = useState<boolean>(() => {
        // Only return true initially if an actual auth failure was recorded, not just on mount
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
        if (loadError) {
            const err: GoogleMapsErrorInfo = {
                code: 'NetworkScriptLoadError',
                message: 'No se pudo descargar el script de Google Maps.',
                action: 'Verifica tu conexión a Internet o si algún bloqueador de anuncios (AdBlock) está bloqueando maps.googleapis.com.',
                raw: loadError.message,
                timestamp: Date.now()
            };
            window.__gm_last_error = err;
            setErrorInfo(err);
            setHasError(true);
            return;
        }

        // If Google Maps is already globally available, clear error state
        if (typeof window !== 'undefined' && window.google?.maps) {
            setHasError(false);
            return;
        }

        const onErrorEvent = (e: any) => {
            const detail = e?.detail as GoogleMapsErrorInfo | undefined;
            if (detail) {
                setErrorInfo(detail);
            }
            setHasError(true);
        };

        window.addEventListener('google_maps_error', onErrorEvent);

        // Scan and observe DOM for Google's error box (.gm-err-container)
        const target = containerRef?.current || (typeof document !== 'undefined' ? document.body : null);

        const checkForErrorElements = () => {
            if (!target) return;
            const errEl = target.querySelector('.gm-err-container, .gm-err-autocomplete, .gm-err-message');
            if (errEl) {
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

        return () => {
            window.removeEventListener('google_maps_error', onErrorEvent);
            if (observer) observer.disconnect();
        };
    }, [containerRef, loadError]);

    return hasError;
}
