import { registerPlugin, Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface LocationHelperPluginInterface {
    isLocationEnabled(): Promise<{ enabled: boolean }>;
    enableLocation(): Promise<{ enabled: boolean }>;
    openSettings(): Promise<{ opened: boolean }>;
}

const LocationHelper = registerPlugin<LocationHelperPluginInterface>('LocationHelper');

/**
 * Checks if location hardware is enabled on Android/iOS
 */
export async function isLocationHardwareEnabled(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
        try {
            const check = await Promise.race([
                LocationHelper.isLocationEnabled(),
                new Promise<{ enabled: boolean }>((res) => setTimeout(() => res({ enabled: false }), 2000))
            ]);
            return Boolean(check?.enabled);
        } catch (e) {
            return false;
        }
    }
    return true;
}

/**
 * Directly opens the native device Location Settings page
 */
export async function openNativeLocationSettings(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
        try {
            await LocationHelper.openSettings();
            return true;
        } catch (e) {
            console.warn('Could not open location settings directly:', e);
            return false;
        }
    }
    return false;
}

/**
 * Prompts the native Android / iOS system to turn on GPS hardware services,
 * and ensures location permissions are granted.
 */
export async function promptEnableLocation(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
        try {
            // 1. Check and request app permissions if needed
            const permStatus = await Geolocation.checkPermissions().catch(() => ({ location: 'prompt' as any }));
            if (permStatus.location !== 'granted') {
                const req = await Geolocation.requestPermissions().catch(() => ({ location: 'denied' as any }));
                if (req.location !== 'granted') {
                    return false;
                }
            }

            // 2. Check if hardware GPS is enabled
            const isEnabled = await isLocationHardwareEnabled();
            if (!isEnabled) {
                // Trigger native settings page
                await openNativeLocationSettings();
                return false;
            }
            return true;
        } catch (e) {
            console.warn("LocationHelper error:", e);
            try {
                await openNativeLocationSettings();
                return false;
            } catch (openErr) {
                return false;
            }
        }
    }
    return true;
}

export { LocationHelper };

