// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
firebase.initializeApp({
    apiKey: "AIzaSyCb1c-p1R6AZGetk8YzKiLuxjaxjmPqJX8",
    authDomain: "arepa-express-ve-2026.firebaseapp.com",
    projectId: "arepa-express-ve-2026",
    storageBucket: "arepa-express-ve-2026.firebasestorage.app",
    messagingSenderId: "549258124406",
    appId: "1:549258124406:web:ec869512afd46a11ea9357"
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // Customize notification here
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/logo.png'
    };

    self.registration.showNotification(notificationTitle,
        notificationOptions);
});
