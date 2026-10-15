import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface AppBranding {
    app_client_logo: string;
    app_client_name: string;
    app_name?: string;
    app_driver_logo: string;
    app_restaurant_logo: string;
    app_admin_logo: string;
    app_favicon?: string | null;
    splash_screen_logo?: string | null;
    driver_footer_text?: string | null;
    client_footer_text?: string | null;
    primary_color?: string;
    secondary_color?: string;
}

export const DEFAULT_BRANDING: AppBranding = {
    app_client_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_client_logo_1788875672174.png',
    app_client_name: 'Un 2x3',
    app_name: 'Un 2x3',
    app_driver_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_driver_logo_1788875821044.jpg',
    app_restaurant_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_restaurant_logo_1788875678044.jpg',
    app_admin_logo: 'https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_admin_logo_1788875678335.jpg',
    splash_screen_logo: null,
    app_favicon: null,
    driver_footer_text: 'Conductores v2.0',
    client_footer_text: 'Hecho con ❤️ en Venezuela'
};

const STORAGE_KEY = 'un2x3_app_branding_cache';

interface BrandingContextType {
    branding: AppBranding;
    loading: boolean;
    refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType>({
    branding: DEFAULT_BRANDING,
    loading: false,
    refreshBranding: async () => {},
});

export const BrandingProvider: React.FC<{ 
    children: React.ReactNode; 
    appType?: 'client' | 'restaurant' | 'delivery' | 'admin' | 'cashier' | 'waiter';
    titleSuffix?: string;
}> = ({ children, appType = 'delivery', titleSuffix }) => {
    const [branding, setBranding] = useState<AppBranding>(() => {
        try {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                const name = parsed.app_client_name || parsed.app_name || DEFAULT_BRANDING.app_client_name;
                return { 
                    ...DEFAULT_BRANDING, 
                    ...parsed, 
                    app_client_name: name,
                    app_name: name 
                };
            }
        } catch (e) {}
        return DEFAULT_BRANDING;
    });
    const [loading, setLoading] = useState(true);

    const mapBrandingData = (data: any): AppBranding => {
        const clientName = data.app_client_name || data.app_name || DEFAULT_BRANDING.app_client_name;
        return {
            app_client_logo: data.app_client_logo || DEFAULT_BRANDING.app_client_logo,
            app_client_name: clientName,
            app_name: clientName,
            app_driver_logo: data.app_driver_logo || DEFAULT_BRANDING.app_driver_logo,
            app_restaurant_logo: data.app_restaurant_logo || DEFAULT_BRANDING.app_restaurant_logo,
            app_admin_logo: data.app_admin_logo || DEFAULT_BRANDING.app_admin_logo,
            app_favicon: data.app_favicon,
            splash_screen_logo: data.splash_screen_logo,
            driver_footer_text: data.driver_footer_text || DEFAULT_BRANDING.driver_footer_text,
            client_footer_text: data.client_footer_text || DEFAULT_BRANDING.client_footer_text,
            primary_color: data.primary_color,
            secondary_color: data.secondary_color,
        };
    };

    const fetchBranding = async () => {
        try {
            const { data, error } = await supabase
                .from('app_branding')
                .select('*')
                .eq('id', 'current')
                .maybeSingle();

            if (!error && data) {
                const merged = mapBrandingData(data);
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
            .channel('app_branding_changes_' + Math.random().toString(36).substring(2, 9))
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
                        const merged = mapBrandingData(payload.new);
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

    // Sincronización reactiva de document.title y favicon
    useEffect(() => {
        const baseName = branding.app_client_name || 'Un 2x3';
        let suffix = titleSuffix || '';
        if (!suffix) {
            if (appType === 'restaurant') suffix = 'Negocios';
            else if (appType === 'delivery') suffix = 'Repartidor';
            else if (appType === 'admin') suffix = 'SuperAdmin';
            else if (appType === 'cashier') suffix = 'Caja';
            else if (appType === 'waiter') suffix = 'Mesero';
        }

        if (suffix) {
            document.title = `${baseName} ${suffix}`;
        } else {
            document.title = baseName;
        }

        const iconUrl = branding.app_favicon || branding.app_driver_logo || branding.app_client_logo;
        if (iconUrl) {
            let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = iconUrl;
        }
    }, [branding.app_client_name, branding.app_favicon, branding.app_driver_logo, branding.app_client_logo, appType, titleSuffix]);

    return (
        <BrandingContext.Provider value={{ branding, loading, refreshBranding: fetchBranding }}>
            {children}
        </BrandingContext.Provider>
    );
};

export const useBranding = () => useContext(BrandingContext);
