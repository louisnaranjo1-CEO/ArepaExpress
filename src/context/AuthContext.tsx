import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';

export interface UserAddress {
    id: string; // Unique ID (could be timestamp)
    name: string; // "Casa", "Trabajo", etc.
    lat: number;
    lng: number;
    reference: string;
    isDefault: boolean;
}

interface UserData {
    address?: {
        lat: number;
        lng: number;
        reference: string;
    }; // Legacy field
    addresses?: UserAddress[];
    role?: string;
    displayName?: string;
    email?: string;
    photoURL?: string;
    notificationsEnabled?: boolean;
    fcmTokens?: string[];
    phone?: string;
    walletBalance?: number;
    points?: number;
    restaurantPoints?: Record<string, number>;
    cedula?: string;
    lastLogin?: any;
    lastSeen?: any;
    totalUsageMinutes?: number;
    gender?: 'masculine' | 'feminine';
    managedRestaurantId?: string;
    biometricLockEnabled?: boolean;
    biometricCredentialId?: string;
    locationPermissionsAllowed?: boolean;
}

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    loading: boolean;
    isProfileComplete: boolean;
    isUnlocked: boolean;
    setIsUnlocked: (unlocked: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({ 
    user: null, 
    userData: null, 
    loading: true, 
    isProfileComplete: false,
    isUnlocked: true,
    setIsUnlocked: () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isUnlocked, setIsUnlocked] = useState(true); // Default to true, LockScreen will handle setting it to false if needed

    useEffect(() => {
        let unsubscribeDoc: (() => void) | null = null;

        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                // Listen to Firestore user document
                unsubscribeDoc = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data() as UserData;
                        // Migration logic: if old address exists but no addresses array, migrate it
                        if (data.address && (!data.addresses || data.addresses.length === 0)) {
                            const newAddress: UserAddress = {
                                id: Date.now().toString(),
                                name: "Casa",
                                lat: data.address.lat,
                                lng: data.address.lng,
                                reference: data.address.reference,
                                isDefault: true
                            };
                            // Optional: updateDoc(doc(db, 'users', firebaseUser.uid), { addresses: [newAddress] });
                        }
                        setUserData(data);

                        // Lógica de Bloqueo Inicial
                        if (data.biometricLockEnabled && !sessionStorage.getItem('lock_unlocked')) {
                            setIsUnlocked(false);
                        }

                        // Update lastLogin if it's a new session (roughly > 1 hour since last login)
                        const now = new Date();
                        const lastLogin = data.lastLogin?.toDate();
                        if (!lastLogin || (now.getTime() - lastLogin.getTime() > 1000 * 60 * 60)) {
                            updateDoc(doc(db, 'users', firebaseUser.uid), {
                                lastLogin: serverTimestamp(),
                                lastSeen: serverTimestamp()
                            }).catch(console.error);
                        }
                    } else {
                        setUserData(null);
                    }
                    setLoading(false);
                });
            } else {
                setUserData(null);
                if (unsubscribeDoc) unsubscribeDoc();
                setLoading(false);
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeDoc) unsubscribeDoc();
        };
    }, []);

    // Activity Heartbeat
    useEffect(() => {
        if (!user) return;

        const heartbeatInterval = setInterval(() => {
            updateDoc(doc(db, 'users', user.uid), {
                lastSeen: serverTimestamp(),
                totalUsageMinutes: (userData?.totalUsageMinutes || 0) + 1
            }).catch(console.error);
        }, 60000); // Every 1 minute

        return () => clearInterval(heartbeatInterval);
    }, [user, userData?.totalUsageMinutes]);

    const isProfileComplete = !!(userData?.displayName && userData?.phone);

    return (
        <AuthContext.Provider value={{ user, userData, loading, isProfileComplete, isUnlocked, setIsUnlocked }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

