import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyAF-5vjY-F5vzSnTYDdQulEWDo98npvoyA",
    authDomain: "r911grill.firebaseapp.com",
    projectId: "r911grill",
    storageBucket: "r911grill.firebasestorage.app",
    messagingSenderId: "800295673260",
    appId: "1:800295673260:web:9a19b28be981316a37ee09",
    measurementId: "G-481V9T5DRZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
