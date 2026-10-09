export const GOOGLE_MAPS_API_KEY: string = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY)
    ? (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string)
    : '';

export const GOOGLE_MAPS_LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

