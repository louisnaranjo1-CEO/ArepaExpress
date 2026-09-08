/**
 * Utility to manage offline/cache-first persistence for store and product images
 */

const CACHE_NAME = 'deliexpress-images-cache-v1';

export async function cacheImage(url: string): Promise<void> {
  if (!url || typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    if (!match) {
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        await cache.put(url, response);
      }
    }
  } catch {
    // Fail silently, network fallback works automatically
  }
}

export async function getCachedImageUrl(url: string): Promise<string> {
  if (!url || typeof window === 'undefined' || !('caches' in window)) return url;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    if (match) {
      const blob = await match.blob();
      return URL.createObjectURL(blob);
    }
    // Asynchronously cache for subsequent views
    cacheImage(url);
    return url;
  } catch {
    return url;
  }
}
