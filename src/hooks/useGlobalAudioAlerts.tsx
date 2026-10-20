export * from '../packages/shared/src/hooks/useGlobalAudioAlerts';

// Legacy compatibility exports
export const NOTIFICATION_SOUND_URL = "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/Digital_Cascade_01.mp3";
export const CPANEL_SOUND_URL = "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/telefono_off.mp3";

export async function getCachedAudioUrl(url: string, _cacheKey?: string): Promise<string> {
    return url;
}
