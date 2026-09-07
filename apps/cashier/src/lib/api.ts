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
    homeLocation: { state: string; city: string; coords?: { lat: number; lng: number } | null } | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    audioAlertsEnabled: boolean;
    paymentMobile: { bank: string; cedula: string; phone: string } | null;
}

export interface LocationPoint {
    lat: number;
    lng: number;
    heading: number;
    speed: number;
    recorded_at: string;
}

import { supabase } from './supabase';

export const driversApi = {
    /**
     * Obtener conteo de drivers disponibles por tipo de vehículo
     * Reemplaza los 3 onSnapshot listeners en Taxi.tsx (líneas 132-193)
     */
    getAvailable: async (): Promise<DriverAvailability> => {
        const { data, error } = await supabase
            .from('drivers')
            .select('vehicle_type')
            .eq('is_online', true)
            .eq('availability', 'active');
            
        if (error) throw error;
        
        const counts = { moto: 0, carro: 0, ejecutivo: 0 };
        data.forEach(d => {
            if (d.vehicle_type === 'moto') counts.moto++;
            if (d.vehicle_type === 'carro') counts.carro++;
            if (d.vehicle_type === 'ejecutivo') counts.ejecutivo++;
        });
        return counts;
    },

    /**
     * Actualizar ubicación GPS del driver — Llamado con frecuencia adaptativa:
     */
    updateLocation: async (uid: string, lat: number, lng: number, heading?: number, speed?: number) => {
        const { error } = await supabase
            .from('drivers')
            .update({ 
                current_location: { lat, lng }, 
                current_heading: heading, 
                current_speed: speed,
                updated_at: new Date().toISOString()
            })
            .eq('id', uid);
        if (error) throw error;
    },

    /**
     * Cambiar estado online/availability del driver
     */
    updateStatus: async (uid: string, isOnline: boolean, availability?: string) => {
        const { error } = await supabase
            .from('drivers')
            .update({ 
                is_online: isOnline, 
                availability: availability || (isOnline ? 'active' : 'offline'),
                updated_at: new Date().toISOString()
            })
            .eq('id', uid);
        if (error) throw error;
    },

    /**
     * Obtener perfil completo del driver (incluyendo ubicación actual)
     */
    getDriver: async (uid: string): Promise<DriverProfile> => {
        const { data, error } = await supabase
            .from('drivers')
            .select(`
                *,
                profiles:id ( full_name, email, phone )
            `)
            .eq('id', uid)
            .single();
            
        if (error) throw error;
        if (!data) throw new Error('Driver not found');
        
        // El join retorna objeto `profiles`, pero por TS inferimos que puede ser arreglo o single object.
        // @ts-ignore
        const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
        
        return {
            id: data.id,
            email: profile?.email || '',
            fullName: profile?.full_name || '',
            phone: profile?.phone || '',
            cedula: data.cedula,
            rif: data.rif,
            age: data.age,
            vehicleType: data.vehicle_type,
            vehiclePlate: data.vehicle_plate,
            isOnline: data.is_online,
            availability: data.availability,
            currentLocation: data.current_location,
            currentHeading: data.current_heading,
            currentSpeed: data.current_speed,
            locationUpdatedAt: data.updated_at,
            documents: data.documents || {},
            homeLocation: data.home_location,
            status: data.status,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            audioAlertsEnabled: data.audio_alerts_enabled ?? true,
            paymentMobile: data.payment_mobile || null
        };
    },

    /**
     * Obtener todos los conductores
     */
    getAllDrivers: async (): Promise<DriverProfile[]> => {
        const { data, error } = await supabase
            .from('drivers')
            .select(`
                *,
                profiles:id ( full_name, email, phone )
            `);
            
        if (error) throw error;
        
        return (data || []).map(d => {
            // @ts-ignore
            const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
            return {
                id: d.id,
                email: profile?.email || '',
                fullName: profile?.full_name || '',
                phone: profile?.phone || '',
                cedula: d.cedula,
                rif: d.rif,
                age: d.age,
                vehicleType: d.vehicle_type,
                vehiclePlate: d.vehicle_plate,
                isOnline: d.is_online,
                availability: d.availability,
                currentLocation: d.current_location,
                currentHeading: d.current_heading,
                currentSpeed: d.current_speed,
                locationUpdatedAt: d.updated_at,
                documents: d.documents || {},
                homeLocation: d.home_location,
                status: d.status,
                createdAt: d.created_at,
                updatedAt: d.updated_at,
                audioAlertsEnabled: d.audio_alerts_enabled ?? true,
                paymentMobile: d.payment_mobile || null
            };
        });
    },

    /**
     * Obtener historial de ubicaciones para animación de tracking
     */
    getLocationHistory: async (uid: string, limit: number = 10): Promise<LocationPoint[]> => {
        console.warn("getLocationHistory no implementado en Supabase aún");
        return [];
    },

    /**
     * Registrar un nuevo driver en PostgreSQL
     */
    register: async (data: {
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
    }) => {
        const { error } = await supabase
            .from('drivers')
            .insert({
                id: data.firebase_uid,
                cedula: data.cedula,
                rif: data.rif,
                age: data.age,
                vehicle_type: data.vehicle_type,
                vehicle_plate: data.vehicle_plate,
                status: 'pending',
                is_online: false,
                availability: 'offline',
                documents: {
                    selfieUrl: data.selfie_url,
                    vehicleUrl: data.vehicle_url,
                    licenseUrl: data.license_url
                },
                home_location: {
                    state: data.home_state,
                    city: data.home_city,
                    coords: { lat: data.home_coords_lat, lng: data.home_coords_lng }
                }
            });
        
        if (error) throw error;
        
        const role = (data.vehicle_type === 'carro' || data.vehicle_type === 'ejecutivo') ? 'conductor' : 'aliado';
        
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                full_name: data.full_name,
                phone: data.phone,
                role: role
            })
            .eq('id', data.firebase_uid);
            
        if (profileError) throw profileError;
        
        return { success: true };
    }
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
