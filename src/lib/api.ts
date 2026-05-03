/**
 * API Service Layer — Centralized backend communication for PostgreSQL
 * 
 * Handles all driver/transport API calls that replace Firestore listeners.
 * Uses adaptive polling with configurable intervals for cost efficiency.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// =====================================================
// Helper con retry y timeout
// =====================================================

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('Request timeout — backend no respondió en 10s');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

// =====================================================
// Drivers API — Reemplazo de Firestore listeners
// =====================================================

export interface DriverAvailability {
    moto: number;
    carro: number;
    ejecutivo: number;
}

export interface DriverProfile {
    id: string;
    email: string;
    fullName: string;
    phone: string;
    cedula: string;
    rif: string;
    age: number;
    vehicleType: string;
    vehiclePlate: string;
    isOnline: boolean;
    availability: string;
    currentLocation: { latitude: number; longitude: number } | null;
    currentHeading: number;
    currentSpeed: number;
    locationUpdatedAt: string;
    documents: {
        selfieUrl: string;
        vehicleUrl: string;
        licenseUrl: string;
    };
    homeLocation: { state: string; city: string } | null;
    status: string;
    createdAt: string;
    updatedAt: string;
}

export interface LocationPoint {
    lat: number;
    lng: number;
    heading: number;
    speed: number;
    recorded_at: string;
}

export const driversApi = {
    /**
     * Obtener conteo de drivers disponibles por tipo de vehículo
     * Reemplaza los 3 onSnapshot listeners en Taxi.tsx (líneas 132-193)
     */
    getAvailable: (): Promise<DriverAvailability> =>
        apiFetch('/api/drivers/available'),

    /**
     * Actualizar ubicación GPS del driver — Llamado con frecuencia adaptativa:
     * - 30s cuando online sin viaje
     * - 15s durante viaje activo
     * - 0 cuando estacionario (detección de movimiento)
     */
    updateLocation: (uid: string, lat: number, lng: number, heading?: number, speed?: number) =>
        apiFetch('/api/drivers/' + uid + '/location', {
            method: 'PUT',
            body: JSON.stringify({ lat, lng, heading, speed }),
        }),

    /**
     * Cambiar estado online/availability del driver
     */
    updateStatus: (uid: string, isOnline: boolean, availability?: string) =>
        apiFetch('/api/drivers/' + uid + '/status', {
            method: 'PUT',
            body: JSON.stringify({ isOnline, availability: availability || (isOnline ? 'active' : 'offline') }),
        }),

    /**
     * Obtener perfil completo del driver (incluyendo ubicación actual)
     */
    getDriver: (uid: string): Promise<DriverProfile> =>
        apiFetch('/api/drivers/' + uid),

    /**
     * Obtener historial de ubicaciones para animación de tracking
     * Retorna puntos ordered oldest → newest para interpolación
     */
    getLocationHistory: (uid: string, limit: number = 10): Promise<LocationPoint[]> =>
        apiFetch(`/api/drivers/${uid}/location-history?limit=${limit}`),

    /**
     * Registrar un nuevo driver en PostgreSQL
     */
    register: (data: {
        firebase_uid: string;
        email: string;
        full_name: string;
        phone?: string;
        cedula?: string;
        rif?: string;
        age?: number;
        vehicle_type: string;
        vehicle_plate?: string;
        selfie_url?: string;
        vehicle_url?: string;
        license_url?: string;
        home_state?: string;
        home_city?: string;
        home_coords_lat?: number;
        home_coords_lng?: number;
    }) => apiFetch('/api/drivers/register', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
};

// =====================================================
// Delivery/Pricing API
// =====================================================

export const deliveryApi = {
    /** Calcular ETA entre dos puntos usando PostGIS */
    getETA: (courierLocation: { lat: number; lng: number }, customerLocation: { lat: number; lng: number }) =>
        apiFetch<{ distance_meters: number; estimated_time_minutes: number }>('/api/delivery/eta', {
            method: 'POST',
            body: JSON.stringify({
                courier_location: courierLocation,
                customer_location: customerLocation,
            }),
        }),

    /** Calcular cotización de precio basado en distancia */
    getQuote: (origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) =>
        apiFetch<{
            distance_km: string;
            base_fare: number;
            price_per_km: number;
            surge_multiplier: number;
            estimated_price: string;
        }>('/api/pricing/quote', {
            method: 'POST',
            body: JSON.stringify({ origin, destination }),
        }),
};

// =====================================================
// Polling hook helper — GPS adaptativo estilo Yango
// =====================================================

/**
 * Configuración de frecuencias de polling adaptativo
 * Inspirado en la estrategia de Yango/Uber para minimizar costos
 */
export const POLLING_INTERVALS = {
    /** Driver online sin viaje activo */
    DRIVER_IDLE: 30_000,        // 30 segundos
    /** Driver en viaje activo (accepted/arriving/in_progress) */
    DRIVER_ACTIVE_TRIP: 15_000, // 15 segundos
    /** Cliente viendo el tracker — polling de ubicación del driver */
    CLIENT_TRACKING: 5_000,     // 5 segundos + interpolación CSS
    /** Verificación de disponibilidad en Taxi.tsx */
    AVAILABILITY_CHECK: 10_000, // 10 segundos
} as const;
