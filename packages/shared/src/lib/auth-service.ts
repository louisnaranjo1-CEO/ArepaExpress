import { supabase } from './supabase';
import { Capacitor } from '@capacitor/core';

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

import { Browser } from '@capacitor/browser';

export const handleDeepLinkAuthUrl = async (urlStr: string): Promise<boolean> => {
    try {
        if (!urlStr) return false;
        try {
            await Browser.close();
        } catch (e) {}

        const hashIdx = urlStr.indexOf('#');
        const queryIdx = urlStr.indexOf('?');
        let paramsStr = '';
        if (hashIdx !== -1) {
            paramsStr = urlStr.substring(hashIdx + 1);
        } else if (queryIdx !== -1) {
            paramsStr = urlStr.substring(queryIdx + 1);
        }

        const params = new URLSearchParams(paramsStr);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const code = params.get('code');

        if (accessToken && refreshToken) {
            const { data: authData, error: authErr } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });
            if (!authErr && authData?.session) {
                if (authData.user) {
                    localStorage.setItem('deliexpress_uid', authData.user.id);
                }
                return true;
            }
        } else if (code) {
            const { data: authData, error: authErr } = await supabase.auth.exchangeCodeForSession(code);
            if (!authErr && authData?.session) {
                if (authData.user) {
                    localStorage.setItem('deliexpress_uid', authData.user.id);
                }
                return true;
            }
        }
    } catch (err) {
        console.error('Error handling deep link auth URL:', err);
    }
    return false;
};

export const signInWithGoogle = async (): Promise<{ user: any, isNewUser: boolean }> => {
    try {
        if (Capacitor.isNativePlatform()) {
            const redirectUri = 'deliexpress.app://auth/callback';
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUri,
                    skipBrowserRedirect: true
                }
            });
            if (error) throw error;
            if (data?.url) {
                await Browser.open({
                    url: data.url,
                    windowName: '_self',
                    presentationStyle: 'popover'
                });
            }
            return { user: null, isNewUser: false };
        } else {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
            return { user: null, isNewUser: false };
        }
    } catch (error: any) {
        console.error("Error al iniciar sesión con Google (Supabase):", error);
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
            is_visible: false,
            isVisible: false,
            is_verified: false,
            isVerified: false,
            verification_status: 'unverified',
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
        if (Capacitor.isNativePlatform()) {
            const redirectUri = 'deliexpress.app://auth/callback';
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUri,
                    skipBrowserRedirect: true
                }
            });
            if (error) throw error;
            if (data?.url) {
                await Browser.open({
                    url: data.url,
                    windowName: '_self',
                    presentationStyle: 'popover'
                });
            }
            return null;
        } else {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
            return null;
        }
    } catch (error) {
        console.error("Error signing in as admin with Google (Supabase):", error);
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

export const sendPasswordResetEmail = async (email: string): Promise<void> => {
    try {
        const redirectTo = `${window.location.origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo,
        });
        if (error) throw error;
    } catch (error: any) {
        console.error("Error sending password reset email:", error);
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

