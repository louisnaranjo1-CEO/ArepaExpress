import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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
}

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, userData: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);

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
                            data.addresses = [newAddress];
                        }
                        setUserData(data);
                    } else {
                        // Document might not exist locally yet if not created after Google Sign In
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

    return (
        <AuthContext.Provider value={{ user, userData, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
