import { auth, db } from './firebase';
import {
    GoogleAuthProvider,
    signInWithPopup,
    User
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
