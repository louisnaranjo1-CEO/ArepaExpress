import { messaging, db } from './firebase';
import { getToken, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

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
                await updateDoc(userRef, {
                    fcmTokens: arrayUnion(token),
                    notificationsEnabled: true
                });

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
