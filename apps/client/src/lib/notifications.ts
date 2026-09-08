import { messaging } from './firebase';
import { getToken, isSupported } from 'firebase/messaging';
import { supabase } from './supabase';

export const requestNotificationPermission = async (userId: string) => {
    try {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            return { success: false, error: 'Tu navegador no soporta notificaciones push.' };
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');

            let token: string | null = null;
            try {
                const supported = await isSupported();
                if (supported && messaging) {
                    const VAPID_KEY = "BPrn5pkkct8Vf4Q8mxZf6q9z7E477VHzoqlmjF-74G__fslZmWQs50fDeZ7DvvB4e4BKS2abbJ_iDBsHBigluH4";
                    token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(err => {
                        console.warn('FCM Installations/Token skipped:', err?.message || err);
                        return null;
                    });
                }
            } catch (fcmErr) {
                console.warn('Firebase Messaging not initialized or failed:', fcmErr);
            }

            // Always activate notifications in Supabase profile
            const { data: userProf } = await supabase
                .from('profiles')
                .select('fcm_tokens')
                .eq('id', userId)
                .maybeSingle();

            const tokens: string[] = Array.isArray(userProf?.fcm_tokens) ? userProf.fcm_tokens : [];
            if (token && !tokens.includes(token)) {
                tokens.push(token);
            }

            await supabase.from('profiles').update({
                ...(tokens.length > 0 ? { fcm_tokens: tokens } : {}),
                notifications_enabled: true,
                notificationsEnabled: true,
                updated_at: new Date().toISOString()
            }).eq('id', userId);

            return { success: true };
        } else if (permission === 'denied') {
            return { success: false, error: 'Has bloqueado las notificaciones. Debes habilitarlas en los ajustes de tu navegador.' };
        } else {
            return { success: false, error: 'Permiso de notificaciones no concedido.' };
        }
    } catch (error: any) {
        console.error('An error occurred while requesting notifications:', error);
        return { success: false, error: 'Ocurrió un inconveniente al solicitar los permisos de notificación.' };
    }
};

export const disableNotifications = async (userId: string) => {
    try {
        await supabase.from('profiles').update({
            fcm_tokens: [],
            notifications_enabled: false,
            notificationsEnabled: false,
            updated_at: new Date().toISOString()
        }).eq('id', userId);
        return true;
    } catch (error) {
        console.error('An error occurred while disabling notifications:', error);
        return false;
    }
};
