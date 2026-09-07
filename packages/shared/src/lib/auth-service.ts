import { supabase } from './supabase';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export const processReferralCode = async (newUserId: string, referralCode: string) => {
    if (!referralCode || typeof referralCode !== 'string') return false;
    try {
        const { data, error } = await supabase.rpc('process_referral', {
            referral_code: referralCode
        });

        if (error) {
            console.error("Error processing referral code:", error);
            return false;
        }
        
        return data === true;
    } catch (error) {
        console.error("Error processing referral code:", error);
        return false;
    }
}

export const signInWithGoogle = async (): Promise<{ user: any, isNewUser: boolean }> => {
    try {
        let user: any;
        let isNewUser = false;
        
        if (Capacitor.isNativePlatform()) {
            const result = await FirebaseAuthentication.signInWithGoogle({
                useCredentialManager: true
            });
            const idToken = result.credential?.idToken;
            if (!idToken) {
                throw new Error("Login fallido. No se obtuvo el ID Token.");
            }

            const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: idToken
            });
            
            if (error) throw error;
            user = data.user;
            
            // Verificamos isNewUser basado en created_at
            if (user && user.created_at && user.last_sign_in_at) {
                const createdTime = new Date(user.created_at).getTime();
                const signinTime = new Date(user.last_sign_in_at).getTime();
                isNewUser = (signinTime - createdTime) < 5000;
            }
        } else {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
            // Al hacer redirect, esto no resolverá sincrónicamente, pero
            // devuelvo un objeto para mantener compatibilidad si no hay error.
            user = null; // En entorno web, la sesión se establece al redirigir
        }

        if (user) {
            localStorage.setItem('deliexpress_uid', user.id);
        }

        return { user, isNewUser };
    } catch (error: any) {
        console.error("Error signing in with Google:", error.message);
        throw error;
    }
};

export const signInWithEmail = async (email: string, pass: string): Promise<any> => {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pass,
        });

        if (error) {
            if (error.message.includes("Invalid login credentials")) {
                throw new Error("Correo o contraseña incorrectos.");
            }
            throw error;
        }

        if (data.user) {
            localStorage.setItem('deliexpress_uid', data.user.id);
        }
        return data.user;
    } catch (error: any) {
        console.error("Error signing in with email:", error.message);
        throw error;
    }
};

export const signUpWithEmail = async (email: string, pass: string, name: string, referralCode?: string): Promise<any> => {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password: pass,
            options: {
                data: {
                    full_name: name
                }
            }
        });

        if (error) {
            if (error.message.includes("already registered")) {
                throw new Error("El correo electrónico ya está en uso.");
            }
            if (error.message.includes("weak")) {
                throw new Error("La contraseña es muy débil (mínimo 6 caracteres).");
            }
            throw error;
        }

        if (data.user) {
            if (referralCode) {
                // Not ideal synchronous handling without session wait, but best effort:
                await processReferralCode(data.user.id, referralCode);
            }
            localStorage.setItem('deliexpress_uid', data.user.id);
        }

        return data.user;
    } catch (error: any) {
        console.error("Error signing up with email:", error.message);
        throw error;
    }
};

export const registerRestaurant = async (email: string, pass: string, restaurantName: string, rif: string, businessType: 'restaurant' | 'hotel' = 'restaurant'): Promise<any> => {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password: pass,
            options: {
                data: {
                    full_name: restaurantName,
                    role: 'aliado'
                }
            }
        });

        if (error) throw error;

        const user = data.user;
        if (!user) throw new Error("No se pudo crear el usuario");

        // Create the restaurant document
        const { error: dbError } = await supabase.from('comercios').insert({
            id: user.id,
            name: restaurantName,
            rif: rif,
            owner_uid: user.id,
            email: email,
            business_type: businessType,
            locations: [],
            whatsapp: '',
            own_delivery: false,
            is_approved: false,
            rating: 5.0,
            image: '',
            delivery_time: '30-45 min',
            delivery_fee: 1.5,
            category: 'Varios'
        });

        if (dbError) throw dbError;

        return user;
    } catch (error) {
        console.error("Error registering restaurant:", error);
        throw error;
    }
};

export const signInAdmin = async (email: string, pass: string): Promise<any> => {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pass
        });
        if (error) throw error;
        return data.user;
    } catch (error) {
        console.error("Error signing in as admin:", error);
        throw error;
    }
};

export const signInAdminWithGoogle = async (): Promise<any> => {
    try {
        let user: any;

        if (Capacitor.isNativePlatform()) {
            const result = await FirebaseAuthentication.signInWithGoogle({
                useCredentialManager: true
            });
            const idToken = result.credential?.idToken;
            if (!idToken) throw new Error("No se pudo obtener el token de Google.");
            
            const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: idToken
            });
            if (error) throw error;
            user = data.user;
        } else {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
            user = null; // The redirect will handle session
        }

        if (user) {
            // Verifica si existe el comercio
            const { data: comercio, error: fetchError } = await supabase
                .from('comercios')
                .select('id')
                .eq('id', user.id)
                .maybeSingle();

            if (!comercio) {
                await supabase.from('comercios').insert({
                    id: user.id,
                    name: user.user_metadata?.full_name || 'Mi Negocio',
                    rif: 'PROVISIONAL',
                    owner_uid: user.id,
                    email: user.email,
                    business_type: 'restaurant',
                    locations: [],
                    whatsapp: '',
                    own_delivery: false,
                    is_approved: false,
                    rating: 5.0,
                    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80',
                    delivery_time: '30-45 min',
                    delivery_fee: 1.5,
                    category: 'Varios'
                });
            }

            localStorage.setItem('deliexpress_uid', user.id);
        }

        return user;
    } catch (error: any) {
        console.error("Error signing in admin with Google:", error.message);
        throw error;
    }
};

export const updateUserEmail = async (newEmail: string): Promise<void> => {
    try {
        const { error } = await supabase.auth.updateUser({ email: newEmail });
        if (error) throw error;
        // Since emails are updated, we don't necessarily have to update the `profiles` or `comercios` tables 
        // if they depend on auth.users directly. However, we can update them to keep it in sync.
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('profiles').update({ email: newEmail }).eq('id', user.id);
            await supabase.from('comercios').update({ email: newEmail }).eq('id', user.id);
        }
    } catch (error) {
        console.error("Error updating email:", error);
        throw error;
    }
};

export const updateUserPassword = async (newPassword: string): Promise<void> => {
    try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
    } catch (error) {
        console.error("Error updating password:", error);
        throw error;
    }
};

export const logout = async (): Promise<void> => {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        localStorage.removeItem('deliexpress_uid');
    } catch (error) {
        console.error("Error logging out:", error);
        throw error;
    }
};
