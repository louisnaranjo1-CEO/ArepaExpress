import { supabase } from './supabase';

// Mapbox Public Access Token provided for Un 2x3
export const DEFAULT_MAPBOX_TOKEN = 'pk.eyJ1IjoibG91aXMwMDc3IiwiYSI6ImNtdjRrcjcxZzB2Y2syeG9uZXp1ancxeXcifQ.34qW5Iod02FDp3MEQ64Hcw';

let activeMapboxToken = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MAPBOX_ACCESS_TOKEN)
    ? (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string)
    : DEFAULT_MAPBOX_TOKEN;

/**
 * Returns active Mapbox token
 */
export function getMapboxToken(): string {
    return activeMapboxToken || DEFAULT_MAPBOX_TOKEN;
}

/**
 * Asynchronously checks Supabase system_settings for updated mapbox token
 */
export async function syncMapboxTokenFromSupabase(): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'mapbox_config')
            .single();

        if (!error && data?.value?.token) {
            activeMapboxToken = data.value.token;
            return activeMapboxToken;
        }
    } catch (e) {
        // Fallback to active/default token on network interruption
        console.warn('[Mapbox] Could not sync token from Supabase, using local token:', e);
    }
    return getMapboxToken();
}

// Mapbox Day Mode Style URL (Garantiza modo diurno limpio, nítido y oficial)
export const MAPBOX_STYLE_DAY = 'mapbox://styles/mapbox/streets-v12';

// Centro por defecto de la aplicación (Calabozo, Guárico, Venezuela: [lng, lat])
export const DEFAULT_MAP_CENTER_LNG_LAT: [number, number] = [-67.4264, 8.9326];
export const DEFAULT_MAP_CENTER = { lat: 8.9326, lng: -67.4264 };

export interface RouteResult {
    distanceMeters: number;
    distanceKm: number;
    durationSeconds: number;
    durationMinutes: number;
    coordinates: [number, number][]; // Array de [lng, lat]
    bounds: [[number, number], [number, number]]; // [[minLng, minLat], [maxLng, maxLat]]
    summary?: string;
}

export interface MapboxPlace {
    id: string;
    name: string;
    place_name: string;
    lat: number;
    lng: number;
    relevance?: number;
}

/**
 * Calcula la ruta entre dos puntos usando la API oficial Mapbox Directions
 */
export async function getMapboxRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    profile: 'driving' | 'walking' | 'cycling' = 'driving'
): Promise<RouteResult | null> {
    const token = getMapboxToken();
    if (!origin || !destination || !origin.lat || !destination.lat) return null;

    try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?geometries=geojson&overview=full&steps=true&access_token=${token}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.error('[Mapbox Directions] API error:', res.status, res.statusText);
            return null;
        }
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            return null;
        }

        const route = data.routes[0];
        const coordinates: [number, number][] = route.geometry.coordinates;

        // Calcular Bounding Box para encajar la vista
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        for (const [lng, lat] of coordinates) {
            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
        }

        return {
            distanceMeters: route.distance,
            distanceKm: Number((route.distance / 1000).toFixed(2)),
            durationSeconds: route.duration,
            durationMinutes: Math.max(1, Math.round(route.duration / 60)),
            coordinates,
            bounds: [[minLng, minLat], [maxLng, maxLat]],
            summary: route.legs?.[0]?.summary || ''
        };
    } catch (e) {
        console.error('[Mapbox Directions] Error calculating route:', e);
        return null;
    }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Busca lugares o autocompleta direcciones restringido estrictamente a la ubicación local del usuario
 */
export async function searchMapboxPlaces(
    query: string,
    proximity?: { lat: number; lng: number },
    country: string = 've',
    options?: {
        bbox?: [number, number, number, number];
        maxDistanceKm?: number;
        cityName?: string;
    }
): Promise<MapboxPlace[]> {
    const token = getMapboxToken();
    if (!query || query.trim().length < 2) return [];

    try {
        const prox = (proximity && proximity.lat && proximity.lng)
            ? proximity
            : DEFAULT_MAP_CENTER;

        const proximityParam = `&proximity=${prox.lng},${prox.lat}`;
        const countryParam = country ? `&country=${country}` : '&country=ve';
        const cleanQuery = query.trim();

        // Calcular Bounding Box local de la ciudad / proximidad (~20 km a la redonda)
        const radiusLng = 0.20;
        const radiusLat = 0.18;
        const localBbox = options?.bbox || [
            Number((prox.lng - radiusLng).toFixed(4)),
            Number((prox.lat - radiusLat).toFixed(4)),
            Number((prox.lng + radiusLng).toFixed(4)),
            Number((prox.lat + radiusLat).toFixed(4))
        ];
        const bboxParam = `&bbox=${localBbox.join(',')}`;

        // 1. Primer intento: búsqueda acotada dentro de la ciudad/área local (bbox + country=ve)
        let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json?access_token=${token}&autocomplete=true&types=poi,address,place,neighborhood,locality${proximityParam}${countryParam}${bboxParam}&limit=8`;

        let res = await fetch(url);
        let data = await res.json();

        // 2. Si dentro del bbox no hubo resultados pero se especificó ciudad, intentar con nombre de ciudad en query dentro de Venezuela
        if ((!data.features || data.features.length === 0) && options?.cityName) {
            const queryWithCity = `${cleanQuery}, ${options.cityName}`;
            const cityUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(queryWithCity)}.json?access_token=${token}&autocomplete=true&types=poi,address,place,neighborhood,locality${proximityParam}${countryParam}&limit=8`;
            res = await fetch(cityUrl);
            data = await res.json();
        }

        // 3. Fallback: búsqueda general con proximidad estricta dentro de Venezuela (NUNCA global a otros países)
        if (!data.features || data.features.length === 0) {
            const fallbackVeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json?access_token=${token}&autocomplete=true&types=poi,address,place,neighborhood,locality${proximityParam}&country=ve&limit=8`;
            res = await fetch(fallbackVeUrl);
            data = await res.json();
        }

        if (!data.features) return [];

        const maxDist = options?.maxDistanceKm || 35; // Máximo 35 km de radio respecto a la ciudad / usuario

        return data.features
            .map((f: any) => {
                const lng = f.center?.[0];
                const lat = f.center?.[1];
                const distanceKm = (lat && lng) ? haversineKm(prox.lat, prox.lng, lat, lng) : 999;
                return {
                    id: f.id,
                    name: f.text || f.place_name,
                    place_name: f.place_name,
                    lng,
                    lat,
                    relevance: f.relevance,
                    distanceKm
                };
            })
            // Descartar estrictamente resultados fuera del país o a más de maxDist de la ciudad
            .filter((p: any) => {
                const isVenezuela = p.place_name.toLowerCase().includes('venezuela');
                const isWithinRange = p.distanceKm <= maxDist;
                return isVenezuela && isWithinRange;
            });
    } catch (e) {
        console.error('[Mapbox Geocoding] Error searching places:', e);
        return [];
    }
}

/**
 * Geocodificación inversa: obtiene nombre de lugar/dirección a partir de coordenadas
 */
export async function reverseGeocodeMapbox(
    lat: number,
    lng: number
): Promise<{ address: string; locality?: string; place_name: string } | null> {
    const token = getMapboxToken();
    if (!lat || !lng) return null;

    try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=address,poi,neighborhood,locality&limit=1`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();

        if (data.features && data.features.length > 0) {
            const feat = data.features[0];
            return {
                address: feat.text || feat.place_name,
                place_name: feat.place_name,
                locality: feat.context?.find((c: any) => c.id.startsWith('place') || c.id.startsWith('locality'))?.text
            };
        }
        return null;
    } catch (e) {
        console.error('[Mapbox Geocoding] Error in reverse geocoding:', e);
        return null;
    }
}

/**
 * Crea elemento HTML para marcador de Origen (Punto A verde)
 */
export function createOriginPinElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mapbox-custom-pin-origin';
    el.innerHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="width: 34px; height: 34px; border-radius: 50%; background: #10B981; border: 3px solid #FFFFFF; box-shadow: 0 4px 12px rgba(16,185,129,0.5); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 14px;">
                A
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #10B981; margin-top: -2px;"></div>
        </div>
    `;
    return el;
}

/**
 * Crea elemento HTML para marcador de Destino (Punto B naranja/rojo)
 */
export function createDestinationPinElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mapbox-custom-pin-destination';
    el.innerHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="width: 34px; height: 34px; border-radius: 50%; background: #FF5D00; border: 3px solid #FFFFFF; box-shadow: 0 4px 12px rgba(255,93,0,0.5); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 14px;">
                B
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #FF5D00; margin-top: -2px;"></div>
        </div>
    `;
    return el;
}

/**
 * Crea elemento HTML para marcador del Conductor (Auto / Moto con rodamiento)
 */
export function createDriverPinElement(type: 'car' | 'moto' = 'car'): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mapbox-custom-pin-driver';
    const isMoto = type === 'moto';
    el.innerHTML = `
        <div style="width: 44px; height: 44px; border-radius: 50%; background: #1E293B; border: 3px solid #FACC15; box-shadow: 0 4px 14px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; transition: transform 0.3s ease;">
            ${isMoto ? `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FACC15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="5" cy="17" r="3"></circle>
                    <circle cx="19" cy="17" r="3"></circle>
                    <path d="M12 17h4l2-6H9l-2 4h5"></path>
                    <path d="M14 6l-3 5"></path>
                </svg>
            ` : `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FACC15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9C2.1 11.1 2 11.5 2 12v4c0 .6.4 1 1 1h2"></path>
                    <circle cx="7" cy="17" r="2"></circle>
                    <path d="M9 17h6"></path>
                    <circle cx="17" cy="17" r="2"></circle>
                </svg>
            `}
        </div>
    `;
    return el;
}

/**
 * Crea elemento HTML para marcador de ubicación del usuario (Punto GPS azul pulsante)
 */
export function createUserLocationPinElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mapbox-custom-pin-user';
    el.innerHTML = `
        <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: rgba(59, 130, 246, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="width: 14px; height: 14px; border-radius: 50%; background: #2563EB; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(37,99,235,0.6);"></div>
        </div>
    `;
    return el;
}
