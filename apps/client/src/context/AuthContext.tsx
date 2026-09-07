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

    const [sessionTerminated, setSessionTerminated] = useState(false);

    // Unique device session token for this client instance
    const getDeviceId = () => {
        let id = localStorage.getItem('deliexpress_device_id');
        if (!id) {
            id = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
            localStorage.setItem('deliexpress_device_id', id);
        }
        return id;
    };

    useEffect(() => {
        let channel: any = null;
        const currentDeviceId = getDeviceId();

        const fetchSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            handleUser(session?.user ?? null);
        };

        const handleUser = async (sbUser: User | null) => {
            setUser(sbUser);
            if (sbUser) {
                // Register/Update this device session
                try {
                    await supabase
                        .from('profiles')
                        .update({ 
                            active_device_session: currentDeviceId,
                            last_active_at: new Date().toISOString()
                        })
                        .eq('id', sbUser.id);
                } catch (err) {
                    console.error("Error registering device session:", err);
                }

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

                // Subscribe to profile changes for single device enforcement
                channel = supabase.channel(`public:profiles:${sbUser.id}`)
                    .on(
                        'postgres_changes',
                        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sbUser.id}` },
                        async (payload) => {
                            const updated = payload.new as any;
                            // Check if a new device session took over
                            if (updated.active_device_session && updated.active_device_session !== currentDeviceId) {
                                console.warn("Session evicted by another device login");
                                setSessionTerminated(true);
                                await supabase.auth.signOut();
                                setUser(null);
                                setUserData(null);
                                return;
                            }

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
                if (event === 'SIGNED_OUT') {
                    setUser(null);
                    setUserData(null);
                    setLoading(false);
                    return;
                }
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
            {sessionTerminated && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                    <div className="bg-white rounded-[32px] w-full max-w-sm p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 mb-2">Sesión iniciada en otro equipo</h3>
                        <p className="text-sm text-slate-500 mb-6 font-medium leading-relaxed">
                            Tu cuenta se acaba de abrir en otro teléfono o dispositivo. Por tu seguridad, esta sesión ha sido cerrada.
                        </p>
                        <button
                            onClick={() => {
                                setSessionTerminated(false);
                                window.location.reload();
                            }}
                            className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/30"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </AuthContext.Provider>
    );
};
