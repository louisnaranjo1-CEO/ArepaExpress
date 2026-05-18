import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Geolocation } from '@capacitor/geolocation';

export interface UserAddress {
    id: string;
    name: string;
    lat: number;
    lng: number;
    reference: string;
    isDefault: boolean;
}

export interface UserData {
    addresses?: UserAddress[];
    role?: string;
    displayName?: string;
    email?: string;
    photoURL?: string;
    phone?: string;
    points?: number;
    total_referrals?: number;
    locationPermissionsAllowed?: boolean;
    biometricLockEnabled?: boolean;
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
        let channel: any = null;

        const fetchSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            handleUser(session?.user ?? null);
        };

        const handleUser = async (sbUser: User | null) => {
            setUser(sbUser);
            if (sbUser) {
                // Fetch profile
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', sbUser.id)
                    .single();

                if (!error && data) {
                    setUserData({
                        ...data,
                        displayName: data.full_name,
                        email: data.email,
                        points: data.points,
                    } as UserData);
                }

                // Subscribe to profile changes
                channel = supabase.channel('public:profiles')
                    .on(
                        'postgres_changes',
                        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sbUser.id}` },
                        (payload) => {
                            const updated = payload.new as any;
                            setUserData((prev) => ({
                                ...prev,
                                ...updated,
                                displayName: updated.full_name,
                                email: updated.email,
                            }));
                        }
                    )
                    .subscribe();
            } else {
                setUserData(null);
                if (channel) supabase.removeChannel(channel);
            }
            setLoading(false);
        };

        fetchSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                handleUser(session?.user ?? null);
            }
        );

        return () => {
            authListener.subscription.unsubscribe();
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    const [currentLocation, setCurrentLocation] = useState<{ lat: number, lng: number } | null>(null);

    // Watch Geolocation
    useEffect(() => {
        const startWatching = async () => {
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
                    if (err) return;
                    if (position) {
                        const newLoc = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        setCurrentLocation(newLoc);
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
