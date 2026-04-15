import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Geolocation } from '@capacitor/geolocation';

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
    currentLocation: { lat: number, lng: number } | null;
}

const AuthContext = createContext<AuthContextType>({ 
    user: null, 
    userData: null, 
    loading: true, 
    isProfileComplete: false,
    isUnlocked: true,
    setIsUnlocked: () => {},
    currentLocation: null
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isUnlocked, setIsUnlocked] = useState(true);
    const locationWatchId = useRef<string | null>(null);

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
                        } else {
                            setIsUnlocked(true);
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

    const [currentLocation, setCurrentLocation] = useState<{ lat: number, lng: number } | null>(null);

    // Watch Geolocation based on user preference
    useEffect(() => {
        const startWatching = async () => {
            // Clear existing watch if any
            if (locationWatchId.current) {
                await Geolocation.clearWatch({ id: locationWatchId.current });
                locationWatchId.current = null;
            }

            if (!user || !userData?.locationPermissionsAllowed) {
                return;
            }

            try {
                const id = await Geolocation.watchPosition({
                    enableHighAccuracy: true,
                    timeout: 10000
                }, (position, err) => {
                    if (err) {
                        console.error("Location watch error:", err);
                        return;
                    }
                    if (position) {
                        const newLoc = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        setCurrentLocation(newLoc);

                        // Also update Firestore lastSeen / location for drivers or active users
                        updateDoc(doc(db, 'users', user.uid), {
                            currentLocation: newLoc,
                            lastSeen: serverTimestamp()
                        }).catch(console.error);
                    }
                });
                locationWatchId.current = id;
            } catch (error) {
                console.error("Could not start location watch:", error);
            }
        };

        startWatching();

        return () => {
            if (locationWatchId.current) {
                Geolocation.clearWatch({ id: locationWatchId.current }).catch(console.error);
                locationWatchId.current = null;
            }
        };
    }, [user, userData?.locationPermissionsAllowed]);


    const isProfileComplete = !!(userData?.displayName && userData?.phone);

    return (
        <AuthContext.Provider value={{ user, userData, loading, isProfileComplete, isUnlocked, setIsUnlocked, currentLocation }}>
            {children}
        </AuthContext.Provider>
    );
};

