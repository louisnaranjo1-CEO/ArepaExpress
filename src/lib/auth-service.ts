import { auth, db } from './firebase';
import {
    GoogleAuthProvider,
    signInWithPopup,
    User,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

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
                favorites: [] // Initialize empty favorites array
            });
        }

        return user;
    } catch (error) {
        console.error("Error signing in with Google:", error);
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
            image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80', // Default placeholder
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
