import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
    apiKey: "AIzaSyCb1c-p1R6AZGetk8YzKiLuxjaxjmPqJX8",
    authDomain: "arepa-express-ve-2026.firebaseapp.com",
    projectId: "arepa-express-ve-2026",
    storageBucket: "arepa-express-ve-2026.firebasestorage.app",
    messagingSenderId: "549258124406",
    appId: "1:549258124406:web:ec869512afd46a11ea9357"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;
export default app;
