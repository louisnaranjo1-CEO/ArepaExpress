import { auth, db } from './firebase';
import {
    GoogleAuthProvider,
    signInWithPopup,
    User,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const googleProvider = new GoogleAuthProvider();
// Ensure we get the display name and email
googleProvider.addScope('profile');
googleProvider.addScope('email');

export const signInWithGoogle = async (): Promise<User | null> => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Check if user document already exists in Firestore
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // Create a new user document
            await setDoc(userRef, {
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                createdAt: serverTimestamp(),
                favorites: [], // Initialize empty favorites array
                birthday: null, // Google doesn't provide birthday by default
                role: 'user'
            });
        }

        localStorage.setItem('deliexpress_uid', user.uid);

        return user;
    } catch (error: any) {
        console.error("Error signing in with Google:", error.code, error.message);
        // Special case for unauthorized domains
        if (error.code === 'auth/unauthorized-domain') {
            throw new Error("Este dominio no está autorizado en Firebase Console (Authentication > Settings > Authorized Domains)");
        }
        throw error;
    }
};

export const signInWithEmail = async (email: string, pass: string): Promise<User> => {
    try {
        const result = await signInWithEmailAndPassword(auth, email, pass);
        const user = result.user;

        // Ensure UID is set in localStorage
        localStorage.setItem('deliexpress_uid', user.uid);

        return user;
    } catch (error: any) {
        console.error("Error signing in with email:", error.code, error.message);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            throw new Error("Correo o contraseña incorrectos.");
        }
        if (error.code === 'auth/invalid-email') {
            throw new Error("El correo electrónico no es válido.");
        }
        throw error;
    }
};

export const signUpWithEmail = async (email: string, pass: string, name: string): Promise<User> => {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, pass);
        const user = result.user;

        // Update profile with display name
        await updateProfile(user, { displayName: name });

        // Create user document in Firestore
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
            displayName: name,
            email: email,
            photoURL: null,
            createdAt: serverTimestamp(),
            favorites: [],
            birthday: null,
            role: 'user'
        });

        localStorage.setItem('deliexpress_uid', user.uid);

        return user;
    } catch (error: any) {
        console.error("Error signing up with email:", error.code, error.message);
        if (error.code === 'auth/email-already-in-use') {
            throw new Error("El correo electrónico ya está en uso.");
        }
        if (error.code === 'auth/weak-password') {
            throw new Error("La contraseña es muy débil (mínimo 6 caracteres).");
        }
        throw error;
    }
};

export const registerRestaurant = async (email: string, pass: string, restaurantName: string, rif: string): Promise<User> => {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, pass);
        const user = result.user;

        // Update profile with restaurant name for display
        await updateProfile(user, { displayName: restaurantName });

        // Create the restaurant document
        const restaurantRef = doc(db, 'restaurants', user.uid); // Using UID as ID for the main branch/owner
        await setDoc(restaurantRef, {
            name: restaurantName,
            rif: rif,
            ownerUid: user.uid,
            email: email,
            createdAt: serverTimestamp(),
            locations: [], // Will be filled in RestaurantProfile
            whatsapp: '',
            ownDelivery: false,
            isApproved: false, // Default to false until admin approval if needed
            rating: 5.0,
            image: '', // No default image, only what the restaurant uploads
            deliveryTime: '30-45 min',
            deliveryFee: 1.5,
            category: 'Varios'
        });

        return user;
    } catch (error) {
        console.error("Error registering restaurant:", error);
        throw error;
    }
};

export const signInAdmin = async (email: string, pass: string): Promise<User> => {
    try {
        const result = await signInWithEmailAndPassword(auth, email, pass);
        return result.user;
    } catch (error) {
        console.error("Error signing in as admin:", error);
        throw error;
    }
};
export const signInAdminWithGoogle = async (): Promise<User | null> => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Check if restaurant document already exists
        const restaurantRef = doc(db, 'restaurants', user.uid);
        const restaurantSnap = await getDoc(restaurantRef);

        if (!restaurantSnap.exists()) {
            // Create a placeholder restaurant document
            await setDoc(restaurantRef, {
                name: user.displayName || 'Mi Restaurante',
                rif: 'PROVISIONAL',
                ownerUid: user.uid,
                email: user.email,
                createdAt: serverTimestamp(),
                locations: [],
                whatsapp: '',
                ownDelivery: false,
                isApproved: false,
                rating: 5.0,
                image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80',
                deliveryTime: '30-45 min',
                deliveryFee: 1.5,
                category: 'Varios',
                birthday: null // Added birthday placeholder
            });
        }

        // Esta línea permite que el programa de PC "lea" quién eres
        localStorage.setItem('deliexpress_uid', user.uid);

        return user;
    } catch (error: any) {
        console.error("Error signing in admin with Google:", error.code, error.message);
        if (error.code === 'auth/unauthorized-domain') {
            throw new Error("Este dominio no está autorizado en Firebase Console (Authentication > Settings > Authorized Domains)");
        }
        throw error;
    }
};

export const updateUserEmail = async (newEmail: string): Promise<void> => {
    const user = auth.currentUser;
    if (!user) throw new Error("No user logged in");

    try {
        await updateEmail(user, newEmail);

        // Also update Firestore if the user is a restaurant
        const restaurantRef = doc(db, 'restaurants', user.uid);
        const restaurantSnap = await getDoc(restaurantRef);
        if (restaurantSnap.exists()) {
            await updateDoc(restaurantRef, { email: newEmail });
        }

        // Also update the 'users' collection if they exist there
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            await updateDoc(userRef, { email: newEmail });
        }
    } catch (error) {
        console.error("Error updating email:", error);
        throw error;
    }
};

export const updateUserPassword = async (newPassword: string): Promise<void> => {
    const user = auth.currentUser;
    if (!user) throw new Error("No user logged in");

    try {
        await updatePassword(user, newPassword);
    } catch (error) {
        console.error("Error updating password:", error);
        throw error;
    }
};
