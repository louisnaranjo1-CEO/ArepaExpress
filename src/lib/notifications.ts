import { messaging, db } from './firebase';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

export const requestNotificationPermission = async (userId: string) => {
    try {
        if (!messaging) return false;

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');

            // Get FCM Token
            // NOTE: You need to replace this VAPID_KEY with the one from your Firebase Console
            // Project Settings -> Cloud Messaging -> Web Push certificates -> Key Pair
            const VAPID_KEY = "BPrn5pkkct8Vf4Q8mxZf6q9z7E477VHzoqlmjF-74G__fslZmWQs50fDeZ7DvvB4e4BKS2abbJ_iDBsHBigluH4";

            const token = await getToken(messaging, { vapidKey: VAPID_KEY });

            if (token) {
                console.log('FCM Token:', token);

                // Save token to user document
                const userRef = doc(db, 'users', userId);
                await updateDoc(userRef, {
                    fcmTokens: arrayUnion(token),
                    notificationsEnabled: true
                });

                return true;
            } else {
                console.warn('No registration token available. Request permission to generate one.');
                return false;
            }
        } else {
            console.warn('Unable to get permission to notify.');
            return false;
        }
    } catch (error) {
        console.error('An error occurred while retrieving token:', error);
        return false;
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
