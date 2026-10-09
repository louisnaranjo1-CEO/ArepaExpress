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

/**
 * Mostrar una notificación nativa en la barra de tareas / barra de notificaciones del sistema
 */
export const showNativeNotification = async (title: string, options?: NativeNotificationOptions) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
        const notifOptions: NotificationOptions = {
            icon: options?.icon || '/favicon.ico',
            badge: options?.badge || '/favicon.ico',
            vibrate: [200, 100, 200],
            tag: options?.tag || `un2x3-${Date.now()}`,
            data: {
                url: options?.url || window.location.href,
                ...(options?.data || {})
            },
            ...options
        };

        // Si hay Service Worker activo (PWA instalada o en segundo plano), delegar a showNotification
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready.catch(() => null);
            if (registration && registration.showNotification) {
                await registration.showNotification(title, notifOptions);
                return;
            }
        }

        // Fallback a constructor de Notification estándar del navegador
        new Notification(title, notifOptions);
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
