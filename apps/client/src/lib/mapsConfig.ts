import type { Libraries } from '@react-google-maps/api';

export const GOOGLE_MAPS_API_KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || 'AIzaSyAT2_wZfYTBGDR7gEpLXRzG-BUQ9Cbu0aQ';
export const GOOGLE_MAPS_LIBRARIES: Libraries = ['places', 'geometry'];
