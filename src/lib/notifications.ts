import { messaging, db } from './firebase';
import { getToken, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';

export const requestNotificationPermission = async (userId: string) => {
    try {
        const supported = await isSupported();
        if (!supported || !messaging) {
            console.warn('Notifications not supported in this browser.');
            return { success: false, error: 'Tu navegador no soporta notificaciones push.' };
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');

            // Get FCM Token
            const VAPID_KEY = "BPrn5pkkct8Vf4Q8mxZf6q9z7E477VHzoqlmjF-74G__fslZmWQs50fDeZ7DvvB4e4BKS2abbJ_iDBsHBigluH4";

            const token = await getToken(messaging, {
                vapidKey: VAPID_KEY,
            });

            if (token) {
                console.log('FCM Token:', token);

                // Save token to user document
                const userRef = doc(db, 'users', userId);
                await setDoc(userRef, {
                    fcmTokens: arrayUnion(token),
                    notificationsEnabled: true
                }, { merge: true });

                return { success: true };
            } else {
                console.warn('No registration token available.');
                return { success: false, error: 'No se pudo generar el token de notificación.' };
            }
        } else if (permission === 'denied') {
            return { success: false, error: 'Has bloqueado las notificaciones. Debes habilitarlas en la configuración de tu navegador.' };
        } else {
            return { success: false, error: 'Permiso de notificaciones no concedido.' };
        }
    } catch (error: any) {
        console.error('An error occurred while retrieving token:', error);
        return { success: false, error: error.message || 'Error desconocido al solicitar permisos.' };
    }
};

export const disableNotifications = async (userId: string) => {
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            fcmTokens: [],
            notificationsEnabled: false
        });
        return true;
    } catch (error) {
        console.error('An error occurred while disabling notifications:', error);
        return false;
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
        const cached = localStorage.getItem('app_branding_data');
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

