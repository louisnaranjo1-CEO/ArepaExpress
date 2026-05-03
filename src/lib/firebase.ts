import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";
import { getDatabase } from "firebase/database";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
    apiKey: "AIzaSyCb1c-p1R6AZGetk8YzKiLuxjaxjmPqJX8",
    authDomain: "arepa-express-ve-2026.firebaseapp.com",
    databaseURL: "https://arepa-express-ve-2026-default-rtdb.firebaseio.com",
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
export const rtdb = getDatabase(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

// Inicializa App Check solo si estamos en el entorno del navegador web real
export let appCheck: any = null;
if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
    // !IMPORTANTE: Pega aquí la clave de tu sitio (Site Key) de Google Cloud Console (Parte pública)
    const RECAPTCHA_V3_SITE_KEY = "6Ld2ILAsAAAAAIAeMLQoPDP4SAllceAVso3Nfz9p"; 
    
    // Solo inicia App Check si la clave fue reemplazada o para modo debug local
    if ((RECAPTCHA_V3_SITE_KEY as string) !== "PEGA_AQUI_TU_CLAVE_DE_SITIO_RECAPTCHA_V3") {
        try {
            appCheck = initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
                // Activar rotación automática de tokens
                isTokenAutoRefreshEnabled: true
            });
        } catch (e) {
            console.error("Error initializing App Check", e);
        }
    } else {
        console.warn("APP CHECK DESACTIVADO: Necesitas registrar la web app en Firebase > App Check y colocar el ReCaptcha V3 Site Key.");
    }
}


export default app;
