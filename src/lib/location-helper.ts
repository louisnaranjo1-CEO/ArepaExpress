import { registerPlugin, Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface LocationHelperPluginInterface {
    isLocationEnabled(): Promise<{ enabled: boolean }>;
    enableLocation(): Promise<{ enabled: boolean }>;
    openSettings(): Promise<{ opened: boolean }>;
}

const LocationHelper = registerPlugin<LocationHelperPluginInterface>('LocationHelper');

/**
 * Prompts the native Android / iOS system to turn on GPS hardware services,
 * and ensures location permissions are granted.
 */
export async function promptEnableLocation(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
        try {
            // 1. Check and request app permissions if needed
            const permStatus = await Geolocation.checkPermissions();
            if (permStatus.location !== 'granted') {
                const req = await Geolocation.requestPermissions();
                if (req.location !== 'granted') {
                    return false;
                }
            }

            // 2. Check if hardware GPS is enabled and prompt user with native Google Play Services dialog
            const check = await LocationHelper.isLocationEnabled().catch(() => ({ enabled: false }));
            if (!check.enabled) {
                const res = await LocationHelper.enableLocation().catch(async () => {
                    await LocationHelper.openSettings().catch(() => ({ opened: false }));
                    return { enabled: false };
                });
                return Boolean(res?.enabled);
            }
            return true;
        } catch (e) {
            console.warn("LocationHelper error:", e);
            try {
                await LocationHelper.openSettings();
                return true;
            } catch (openErr) {
                return false;
            }
        }
    }
    return true;
}

export { LocationHelper };
