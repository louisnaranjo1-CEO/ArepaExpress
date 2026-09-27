import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UN2X3_LOGO } from '../lib/env';

export interface BrandingConfig {
    app_client_logo?: string;
    app_name?: string;
    primary_color?: string;
    secondary_color?: string;
}

interface BrandingContextType {
    branding: BrandingConfig;
    loading: boolean;
    refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType>({
    branding: { app_client_logo: UN2X3_LOGO },
    loading: false,
    refreshBranding: async () => {}
});

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [branding, setBranding] = useState<BrandingConfig>({
        app_client_logo: UN2X3_LOGO,
        app_name: 'Un 2x3'
    });
    const [loading, setLoading] = useState(true);

    const fetchBranding = async () => {
        try {
            const { data } = await supabase
                .from('system_configs')
                .select('*')
                .eq('id', 'branding')
                .maybeSingle();

            if (data) {
                setBranding(prev => ({
                    ...prev,
                    app_client_logo: data.app_client_logo || data.logo || UN2X3_LOGO,
                    app_name: data.app_name || data.name || 'Un 2x3',
                    primary_color: data.primary_color || data.primaryColor,
                    secondary_color: data.secondary_color || data.secondaryColor
                }));
            }
        } catch (e) {
            console.warn("Branding fetch fallback:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBranding();
    }, []);

    return (
        <BrandingContext.Provider value={{ branding, loading, refreshBranding: fetchBranding }}>
            {children}
        </BrandingContext.Provider>
    );
};

export const useBranding = () => useContext(BrandingContext);
