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
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    vehicleColor?: string;
    hasAc?: boolean;
    has_thermal_bag?: boolean;
    is_comfort_eligible?: boolean;
    vehicle_image_url?: string;
    vehicle_history?: Array<{
        vehicle_id?: string;
        previous_data?: any;
        new_data?: any;
        changed_at?: string;
    }>;
    commission_debt?: number;
    commission_status?: string;
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
        commission_debt: 0,
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

/**
 * Acepta atómicamente una puja de transporte usando el RPC con FOR UPDATE SKIP LOCKED
 */
export const acceptTransportBid = async (
    bidId: string,
    requestId: string,
    userId: string
): Promise<{ success: boolean; driver_id?: string; error?: string }> => {
    try {
        const { data, error } = await supabase.rpc('accept_transport_bid', {
            p_bid_id: bidId,
            p_request_id: requestId,
            p_user_id: userId
        });

        if (error) {
            console.error("Error al ejecutar RPC accept_transport_bid:", error);
            return { success: false, error: error.message };
        }

        if (data && typeof data === 'object' && data.success === false) {
            return {
                success: false,
                error: data.error || 'El viaje ya fue asignado o cancelado.'
            };
        }

        return data || { success: true };
    } catch (err: any) {
        console.error("Excepción al aceptar oferta de transporte:", err);
        return { success: false, error: err?.message || 'Error de comunicación al procesar la oferta.' };
    }
};

/**
 * Solicita delivery externo para una orden de comercio, enlazando mutuamente:
 * - order_id en transport_requests
 * - transport_request_id en orders
 */
export const requestExternalDeliveryForOrder = async (
    order: {
        id: string;
        userId?: string;
        userName?: string;
        userPhone?: string;
        clientDNI?: string;
        items?: any[];
        deliveryCoords?: any;
        deliveryAddress?: string;
        restaurantId?: string;
        restaurantName?: string;
        transport_request_id?: string;
    },
    options?: {
        driver?: {
            id: string;
            full_name?: string;
            phone?: string;
            photo_url?: string;
            vehicle_type?: string;
        } | null;
        restaurantConfig?: {
            name?: string;
            address?: string;
            location?: { lat: number; lng: number };
        };
        payout?: number;
        vehicleCategory?: string;
    }
): Promise<{ success: boolean; transportRequestId?: string; error?: string }> => {
    try {
        const itemsSummary = order.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ') || 'Productos del comercio';
        const payout = options?.payout || 1.50;
        const driverObj = options?.driver;

        // 1. Verificar si ya existe solicitud previa de transporte para esta orden
        const { data: existingTr } = await supabase
            .from('transport_requests')
            .select('id, status')
            .eq('order_id', order.id)
            .maybeSingle();

        const trData: any = {
            order_id: order.id,
            restaurant_id: order.restaurantId,
            restaurant_name: order.restaurantName || options?.restaurantConfig?.name || 'Comercio',
            user_id: order.userId,
            user_name: order.userName || 'Cliente',
            user_phone: order.userPhone || '',
            user_cedula: order.clientDNI || '',
            type: 'transport',
            service_category: 'food_delivery',
            price: payout,
            total: payout,
            fare: payout,
            driver_payout: payout,
            items_summary: itemsSummary,
            flete_pagado_por: 'negocio',
            notes: `🎁 Flete de la orden #${order.id.slice(0, 8)}. Entregar a: ${order.userName || 'Cliente'} (Tlf: ${order.userPhone || 'N/A'}). Ítems: ${itemsSummary}`,
            origin: {
                address: options?.restaurantConfig?.address || options?.restaurantConfig?.name || 'Local',
                lat: options?.restaurantConfig?.location?.lat,
                lng: options?.restaurantConfig?.location?.lng
            },
            destination: order.deliveryCoords || { address: order.deliveryAddress },
            updated_at: new Date().toISOString()
        };

        if (driverObj) {
            trData.status = 'accepted';
            trData.driver_id = driverObj.id;
            trData.assigned_driver_id = driverObj.id;
            trData.driver_name = driverObj.full_name || 'Conductor';
            trData.driver_phone = driverObj.phone || '';
            trData.driver_photo = driverObj.photo_url || null;
            trData.vehicle_type = driverObj.vehicle_type || options?.vehicleCategory || 'moto';
            trData.driver_assigned_at = new Date().toISOString();
        } else {
            trData.status = 'searching';
            trData.vehicle_type = options?.vehicleCategory || 'moto';
        }

        let transportRequestId = existingTr?.id;

        if (existingTr?.id) {
            const { error: updTrErr } = await supabase
                .from('transport_requests')
                .update(trData)
                .eq('id', existingTr.id);
            if (updTrErr) throw updTrErr;
        } else {
            trData.created_at = new Date().toISOString();
            const { data: newTr, error: insTrErr } = await supabase
                .from('transport_requests')
                .insert(trData)
                .select('id')
                .single();
            if (insTrErr) throw insTrErr;
            transportRequestId = newTr.id;
        }

        // 2. Enlazar transport_request_id en orders
        const orderUpdates: any = {
            transport_request_id: transportRequestId,
            status: driverObj ? 'delivering' : 'buscando_piloto',
            dispatched_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        if (driverObj) {
            orderUpdates.driver_id = driverObj.id;
            orderUpdates.delivery_driver_id = driverObj.id;
            orderUpdates.driver_name = driverObj.full_name;
            orderUpdates.driver_photo = driverObj.photo_url || null;
            orderUpdates.preferred_driver_id = driverObj.id;
            orderUpdates.eligible_drivers = [driverObj.id];
            orderUpdates.driver_payout = payout;
        } else {
            orderUpdates.preferred_driver_id = null;
            orderUpdates.eligible_drivers = null;
        }

        const { error: ordErr } = await supabase
            .from('orders')
            .update(orderUpdates)
            .eq('id', order.id);

        if (ordErr) throw ordErr;

        return { success: true, transportRequestId };
    } catch (err: any) {
        console.error("Error al solicitar delivery externo para la orden:", err);
        return { success: false, error: err?.message || 'Error enlazando delivery y orden.' };
    }
};
