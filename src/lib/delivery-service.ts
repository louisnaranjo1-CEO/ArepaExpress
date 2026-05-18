import { supabase } from './supabase';
import { driversApi } from './api';

export type DeliveryStatus = 'pending' | 'active' | 'rejected' | 'inactive';
export type AvailabilityStatus = 'active' | 'busy' | 'offline';
export type VehicleType = 'moto' | 'carro' | 'bicicleta' | 'ejecutivo';

export interface DeliveryDriver {
    id: string; // auth uid
    email: string;
    fullName: string;
    cedula: string;
    rif: string;
    age: number;
    phone: string;
    vehicleType: VehicleType;
    vehiclePlate: string;
    status: DeliveryStatus;
    isOnline: boolean;
    availability?: AvailabilityStatus;
    currentLocation?: { latitude: number; longitude: number } | null;
    currentHeading?: number;
    currentSpeed?: number;
    homeLocation?: {
        state: string;
        city: string;
        coords?: { lat: number; lng: number };
    };
    documents: {
        selfieUrl: string;
        vehicleUrl: string;
        licenseUrl: string;
    };
    createdAt: any;
    updatedAt: any;
}

export interface DeliveryFinanceConfig {
    baseFee: number;
    perKmFee: number;
    appCommissionPercentage: number;
}

export const registerDriver = async (
    uid: string,
    email: string,
    data: Omit<DeliveryDriver, 'id' | 'email' | 'status' | 'isOnline' | 'createdAt' | 'updatedAt' | 'documents' | 'currentLocation'>,
    files: { selfie: File; vehicle: File; license: File }
) => {
    // Upload documents to Supabase Storage
    const uploadDoc = async (file: File, type: string) => {
        const extension = file.name.split('.').pop() || 'jpg';
        const path = `delivery_docs/${uid}/${type}_${Date.now()}.${extension}`;
        
        // Asumiendo que existe un bucket 'documents' en Supabase
        const { error } = await supabase.storage
            .from('documents')
            .upload(path, file, { contentType: file.type });
            
        if (error) {
            console.error(`Error uploading ${type}:`, error);
            throw error;
        }
        
        const { data: publicUrlData } = supabase.storage
            .from('documents')
            .getPublicUrl(path);
            
        return publicUrlData.publicUrl;
    };

    const selfieUrl = await uploadDoc(files.selfie, 'selfie');
    const vehicleUrl = await uploadDoc(files.vehicle, 'vehicle');
    const licenseUrl = await uploadDoc(files.license, 'license');

    // Register in Supabase Database (PostgreSQL)
    try {
        await driversApi.register({
            firebase_uid: uid,
            email,
            full_name: data.fullName,
            phone: data.phone,
            cedula: data.cedula,
            rif: data.rif,
            age: data.age,
            vehicle_type: data.vehicleType,
            vehicle_plate: data.vehiclePlate,
            selfie_url: selfieUrl,
            vehicle_url: vehicleUrl,
            license_url: licenseUrl,
            home_state: data.homeLocation?.state,
            home_city: data.homeLocation?.city,
            home_coords_lat: data.homeLocation?.coords?.lat,
            home_coords_lng: data.homeLocation?.coords?.lng,
        });
    } catch (apiErr) {
        console.error("Error registering driver in Supabase:", apiErr);
        throw apiErr;
    }

    const driverData: DeliveryDriver = {
        id: uid,
        email,
        ...data,
        status: 'pending',
        isOnline: false,
        availability: 'offline',
        documents: {
            selfieUrl,
            vehicleUrl,
            licenseUrl
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    return driverData;
};

export const getDriverProfile = async (idOrEmail: string): Promise<DeliveryDriver | null> => {
    try {
        if (!idOrEmail.includes('@')) {
            const driver = await driversApi.getDriver(idOrEmail);
            return driver as unknown as DeliveryDriver;
        } else {
            // Find by email in profiles table
            const { data, error } = await supabase
                .from('profiles')
                .select('id, email')
                .eq('email', idOrEmail)
                .single();
                
            if (error || !data) return null;
            
            const driver = await driversApi.getDriver(data.id);
            return driver as unknown as DeliveryDriver;
        }
    } catch (e) {
        console.error("Error getting driver profile:", e);
        return null;
    }
};

/**
 * Actualizar ubicación del driver
 */
export const updateDriverLocation = async (uid: string, lat: number, lng: number, heading?: number, speed?: number) => {
    try {
        await driversApi.updateLocation(uid, lat, lng, heading, speed);
    } catch (apiErr) {
        console.error("Error updating driver location in Supabase:", apiErr);
    }
};

/**
 * Cambiar estado online/offline del driver
 */
export const setDriverOnlineStatus = async (uid: string, isOnline: boolean) => {
    try {
        await driversApi.updateStatus(uid, isOnline);
    } catch (apiErr) {
        console.error("Error updating driver status in Supabase:", apiErr);
    }
};

export const setDriverAvailability = async (uid: string, availability: AvailabilityStatus) => {
    try {
        await driversApi.updateStatus(uid, availability !== 'offline', availability);
    } catch (apiErr) {
        console.error("Error updating driver availability in Supabase:", apiErr);
    }
};
