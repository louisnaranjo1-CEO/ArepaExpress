import { supabase } from './supabase';

/**
 * Native Web Push Notifications & Supabase Realtime Integration
 * Uses the browser's native Notification and ServiceWorker APIs.
 * Supports PWA, desktop (Chrome, Safari, Edge, Firefox), and mobile (Android, iOS 16.4+).
 * 100% Native, zero Firebase dependency.
 */

export interface NativeNotificationOptions extends NotificationOptions {
    url?: string;
}

/**
 * Solicitar permiso nativo de notificaciones al sistema operativo
 */
export const requestNotificationPermission = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    try {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            return { success: false, error: 'Tu navegador o dispositivo no soporta notificaciones nativas.' };
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            // Mostrar notificación de bienvenida nativa
            await showNativeNotification('¡Notificaciones activadas! 🔔', {
                body: 'Recibirás actualizaciones de pedidos, envíos y alertas en tiempo real.',
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                vibrate: [200, 100, 200]
            });

            // Registrar activación en Supabase
            if (userId) {
                await supabase.from('profiles').update({
                    notifications_enabled: true,
                    notificationsEnabled: true,
                    updated_at: new Date().toISOString()
                }).eq('id', userId);
            }

            return { success: true };
        } else if (permission === 'denied') {
            return { success: false, error: 'Has bloqueado las notificaciones. Puedes activarlas desde los ajustes de tu navegador o sistema.' };
        } else {
            return { success: false, error: 'Permiso de notificaciones no concedido.' };
        }
    } catch (error: any) {
        console.error('Error al solicitar permiso de notificaciones:', error);
        return { success: false, error: 'Ocurrió un error al solicitar los permisos de notificación.' };
    }
};

export const TRIP_STATUS_TRANSLATIONS: Record<string, string> = {
    searching: 'Buscando conductor',
    pending: 'Buscando conductor',
    accepted: 'Conductor en camino',
    arrived: 'Tu conductor ha llegado',
    arriving: 'Tu conductor ha llegado',
    started: 'Viaje en curso',
    in_progress: 'Viaje en curso',
    completed: 'Viaje finalizado',
    finished: 'Viaje finalizado',
    canceled: 'Viaje cancelado',
    cancelled: 'Viaje cancelado',
    driver_busy: 'Conductor ocupado',
    verifying_payment: 'Verificando pago'
};

export const ORDER_STATUS_TRANSLATIONS: Record<string, string> = {
    pending: 'Pendiente',
    pendiente_pago: 'Pendiente de pago',
    verifying_payment: 'Verificando pago',
    preparing: 'En preparación',
    ready: 'Pedido listo',
    buscando_piloto: 'Buscando repartidor',
    delivering: 'En camino',
    delivered: 'Entregado',
    completed: 'Finalizado',
    cancelled: 'Cancelado',
    canceled: 'Cancelado'
};

export function translateTripStatus(status?: string | null): string {
    if (!status) return 'Estado desconocido';
    const clean = status.toLowerCase().trim();
    return TRIP_STATUS_TRANSLATIONS[clean] || status;
}

export function translateOrderStatus(status?: string | null): string {
    if (!status) return 'Estado desconocido';
    const clean = status.toLowerCase().trim();
    return ORDER_STATUS_TRANSLATIONS[clean] || status;
}

export function getAppBrandingName(fallback: string = 'Un 2x3'): string {
    if (typeof window === 'undefined') return fallback;
    try {
        const cached = localStorage.getItem('un2x3_app_branding_cache');
        if (cached) {
            const parsed = JSON.parse(cached);
            return parsed.app_client_name || parsed.app_name || fallback;
        }
    } catch {
        // fallback
    }
    return fallback;
}

export function sanitizeNotificationText(text?: string | null): string {
    if (!text) return '';
    let result = String(text);
    return result
        .replace(/\bsearching\b/gi, 'Buscando conductor')
        .replace(/\bin_progress\b/gi, 'Viaje en curso')
        .replace(/\baccepted\b/gi, 'Conductor en camino')
        .replace(/\barrived\b/gi, 'Tu conductor ha llegado')
        .replace(/\barriving\b/gi, 'Tu conductor ha llegado')
        .replace(/\bcompleted\b/gi, 'Viaje finalizado')
        .replace(/\b(canceled|cancelled)\b/gi, 'Viaje cancelado')
        .replace(/\bpending\b/gi, 'Buscando conductor')
        .replace(/\bfrom\s+Deliexpress\b/gi, 'de Un 2x3')
        .replace(/\bfrom\s+Arepaexpress\b/gi, 'de Un 2x3')
        .replace(/\bfrom\s+Un\s*2x3\b/gi, 'de Un 2x3')
        .replace(/\bfrom\b/gi, 'de')
        .replace(/\bDeliexpress\b/gi, 'Un 2x3')
        .replace(/\bArepaExpress\b/gi, 'Un 2x3');
}

/**
 * Mostrar una notificación nativa en la barra de tareas / barra de notificaciones del sistema
 */
export const showNativeNotification = async (title: string, options?: NativeNotificationOptions) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
        const cleanTitle = sanitizeNotificationText(title);
        const cleanBody = options?.body ? sanitizeNotificationText(options.body) : undefined;

        const notifOptions: NotificationOptions = {
            icon: options?.icon || '/favicon.ico',
            badge: options?.badge || '/favicon.ico',
            vibrate: [200, 100, 200],
            tag: options?.tag || `un2x3-${Date.now()}`,
            data: {
                url: options?.url || window.location.href,
                ...(options?.data || {})
            },
            ...options,
            body: cleanBody
        };

        // Si hay Service Worker activo (PWA instalada o en segundo plano), delegar a showNotification
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready.catch(() => null);
            if (registration && registration.showNotification) {
                await registration.showNotification(cleanTitle, notifOptions);
                return;
            }
        }

        // Fallback a constructor de Notification estándar del navegador
        new Notification(cleanTitle, notifOptions);
    } catch (e) {
        console.warn('No se pudo mostrar la notificación nativa:', e);
    }
};

/**
 * Desactivar notificaciones para el usuario
 */
export const disableNotifications = async (userId: string): Promise<boolean> => {
    try {
        if (userId) {
            await supabase.from('profiles').update({
                notifications_enabled: false,
                notificationsEnabled: false,
                updated_at: new Date().toISOString()
            }).eq('id', userId);
        }
        return true;
    } catch (error) {
        console.error('Error al desactivar notificaciones:', error);
        return false;
    }
};
