import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface AppBranding {
    app_client_logo: string;
    app_client_name: string;
    app_driver_logo: string;
    app_restaurant_logo: string;
    app_admin_logo: string;
    app_favicon?: string | null;
    splash_screen_logo?: string | null;
}

export const DEFAULT_BRANDING: AppBranding = {
    app_client_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_client_logo_1788875672174.png',
    app_client_name: 'Un 2x3 Encuentra lo que quieras',
    app_driver_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_driver_logo_1788875821044.jpg',
    app_restaurant_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_restaurant_logo_1788875678044.jpg',
    app_admin_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_admin_logo_1788875678335.jpg',
};

const STORAGE_KEY = 'un2x3_app_branding_cache';

const BrandingContext = createContext<{
    branding: AppBranding;
    loading: boolean;
    refreshBranding: () => Promise<void>;
}>({
    branding: DEFAULT_BRANDING,
    loading: false,
    refreshBranding: async () => {},
});

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [branding, setBranding] = useState<AppBranding>(() => {
        try {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                return { ...DEFAULT_BRANDING, ...parsed };
            }
        } catch (e) {}
        return DEFAULT_BRANDING;
    });
    const [loading, setLoading] = useState(true);

    const fetchBranding = async () => {
        try {
            const { data, error } = await supabase
                .from('app_branding')
                .select('*')
                .eq('id', 'current')
                .maybeSingle();

            if (!error && data) {
                const merged: AppBranding = {
                    app_client_logo: data.app_client_logo || DEFAULT_BRANDING.app_client_logo,
                    app_client_name: data.app_client_name || DEFAULT_BRANDING.app_client_name,
                    app_driver_logo: data.app_driver_logo || DEFAULT_BRANDING.app_driver_logo,
                    app_restaurant_logo: data.app_restaurant_logo || DEFAULT_BRANDING.app_restaurant_logo,
                    app_admin_logo: data.app_admin_logo || DEFAULT_BRANDING.app_admin_logo,
                    app_favicon: data.app_favicon,
                    splash_screen_logo: data.splash_screen_logo,
                };
                setBranding(merged);
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                } catch (e) {}
            }
        } catch (err) {
            console.error('Error fetching branding:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBranding();

        const channel = supabase
            .channel('app_branding_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'app_branding',
                    filter: 'id=eq.current',
                },
                (payload) => {
                    if (payload.new) {
                        const newData = payload.new as any;
                        const merged: AppBranding = {
                            app_client_logo: newData.app_client_logo || DEFAULT_BRANDING.app_client_logo,
                            app_client_name: newData.app_client_name || DEFAULT_BRANDING.app_client_name,
                            app_driver_logo: newData.app_driver_logo || DEFAULT_BRANDING.app_driver_logo,
                            app_restaurant_logo: newData.app_restaurant_logo || DEFAULT_BRANDING.app_restaurant_logo,
                            app_admin_logo: newData.app_admin_logo || DEFAULT_BRANDING.app_admin_logo,
                            app_favicon: newData.app_favicon,
                            splash_screen_logo: newData.splash_screen_logo,
                        };
                        setBranding(merged);
                        try {
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                        } catch (e) {}
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <BrandingContext.Provider value={{ branding, loading, refreshBranding: fetchBranding }}>
            {children}
        </BrandingContext.Provider>
    );
};

export const useBranding = () => useContext(BrandingContext);
